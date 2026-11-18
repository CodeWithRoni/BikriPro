/**
 * Customers & Suppliers — kept as separate menus/endpoints, but they share the
 * same shape (dynamic contact fields, opening balance, ledger, adjustments),
 * so one factory builds both controllers.
 *
 * Ledger convention:  debit  = increases the balance (customer owes more /
 *                              shop owes supplier more)
 *                     credit = decreases the balance
 */
import { query, one, transaction } from '../config/db.js';
import { addRange, orderBy } from '../utils/filters.js';
import { asyncHandler, requireFields, badRequest, notFound, paging, money, today } from '../utils/http.js';
import { logActivity } from '../utils/activity.js';

const CONF = {
  customer: { table: 'customers', contacts: 'customer_contacts', fk: 'customer_id', view: 'v_customer_balance', viewFk: 'customer_id' },
  supplier: { table: 'suppliers', contacts: 'supplier_contacts', fk: 'supplier_id', view: 'v_supplier_balance', viewFk: 'supplier_id' },
};

/** Ledger entries for one party, unsorted. */
async function ledgerEntries(type, id) {
  if (type === 'customer') {
    return query(
      `SELECT * FROM (
        SELECT 'sale' AS txn_type, s.id AS ref_id, s.invoice_no AS ref_no, DATE(s.sale_date) AS txn_date, s.created_at,
               CONCAT('Sale ', s.invoice_no) AS description, s.grand_total AS debit, s.paid_amount AS credit
          FROM sales s WHERE s.customer_id = ? AND s.status <> 'cancelled'
        UNION ALL
        SELECT 'sale_return', r.id, r.return_no, DATE(r.return_date), r.return_date,
               CONCAT('Return ', r.return_no), r.refund_amount, r.total_amount
          FROM sale_returns r WHERE r.customer_id = ?
        UNION ALL
        SELECT 'collection', c.id, c.receipt_no, c.collection_date, c.created_at,
               CONCAT('Collection ', c.receipt_no, COALESCE(CONCAT(' — ', c.note), '')), 0, c.amount
          FROM customer_collections c WHERE c.customer_id = ?
        UNION ALL
        SELECT 'adjustment', a.id, CONCAT('ADJ-', a.id), a.adj_date, a.created_at,
               CONCAT('Adjustment (', a.reason, ')', COALESCE(CONCAT(' — ', a.note), '')),
               CASE WHEN a.effect = 'addition' THEN a.amount ELSE 0 END, CASE WHEN a.effect = 'deduction' THEN a.amount ELSE 0 END
          FROM ledger_adjustments a WHERE a.party_type = 'customer' AND a.party_id = ?
      ) t`,
      [id, id, id, id]
    );
  }
  return query(
    `SELECT * FROM (
      SELECT 'purchase' AS txn_type, p.id AS ref_id, p.invoice_no AS ref_no, p.purchase_date AS txn_date, p.created_at,
             CONCAT('Purchase ', p.invoice_no, COALESCE(CONCAT(' (Bill ', p.supplier_ref, ')'), '')) AS description,
             p.grand_total AS debit, p.paid_amount AS credit
        FROM purchases p WHERE p.supplier_id = ?
      UNION ALL
      SELECT 'purchase_return', r.id, r.return_no, r.return_date, r.return_date,
             CONCAT('Purchase return ', r.return_no), r.refund_amount, r.total_amount
        FROM purchase_returns r WHERE r.supplier_id = ?
      UNION ALL
      SELECT 'payment', x.id, x.voucher_no, x.payment_date, x.created_at,
             CONCAT('Payment ', x.voucher_no, COALESCE(CONCAT(' — ', x.note), '')), 0, x.amount
        FROM supplier_payments x WHERE x.supplier_id = ?
      UNION ALL
      SELECT 'adjustment', a.id, CONCAT('ADJ-', a.id), a.adj_date, a.created_at,
             CONCAT('Adjustment (', a.reason, ')', COALESCE(CONCAT(' — ', a.note), '')),
             CASE WHEN a.effect = 'addition' THEN a.amount ELSE 0 END, CASE WHEN a.effect = 'deduction' THEN a.amount ELSE 0 END
        FROM ledger_adjustments a WHERE a.party_type = 'supplier' AND a.party_id = ?
    ) t`,
    [id, id, id, id]
  );
}

/**
 * Reduce open invoice dues oldest-first (FIFO) by `amount`.
 * Used by collections, supplier payments and deduction adjustments.
 */
async function allocateFifo(conn, type, partyId, amount, { invoiceId = null, nextPaymentDate } = {}) {
  const table = type === 'customer' ? 'sales' : 'purchases';
  const fk = type === 'customer' ? 'customer_id' : 'supplier_id';
  const dateCol = type === 'customer' ? 'sale_date' : 'purchase_date';
  let remaining = money(amount);
  const open = await conn.q(
    `SELECT id, due_amount FROM ${table} WHERE ${fk} = ? AND due_amount > 0
     ORDER BY ${invoiceId ? `(id = ${Number(invoiceId)}) DESC, ` : ''}${dateCol}, id FOR UPDATE`,
    [partyId]
  );
  for (const inv of open) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(inv.due_amount));
    await conn.query(`UPDATE ${table} SET due_amount = due_amount - ? WHERE id = ?`, [take, inv.id]);
    remaining = money(remaining - take);
  }
  if (type === 'customer' && nextPaymentDate !== undefined) {
    await conn.query('UPDATE sales SET next_payment_date = ? WHERE customer_id = ? AND due_amount > 0', [nextPaymentDate || null, partyId]);
  }
  return remaining; // > 0 means advance / over-payment
}

function build(type) {
  const c = CONF[type];
  const ctrl = {};

  ctrl.list = asyncHandler(async (req, res) => {
    const { limit, offset, page } = paging(req.query, 50);
    const where = ['t.is_active = true'];
    const params = [];
    if (type === 'customer') where.push('t.is_walk_in = false');
    if (req.query.q) {
      const like = `%${req.query.q}%`;
      where.push(`(t.name ILIKE ? OR t.phone ILIKE ? OR EXISTS (SELECT 1 FROM ${c.contacts} x WHERE x.${c.fk} = t.id AND x.value ILIKE ?)${type === 'supplier' ? ' OR t.company ILIKE ?' : ''})`);
      params.push(like, like, like);
      if (type === 'supplier') params.push(like);
    }
    if (req.query.area) { where.push('(t.area ILIKE ? OR t.address ILIKE ?)'); params.push(`%${req.query.area}%`, `%${req.query.area}%`); }
    const qs = req.query;
    if (qs.has_due === '1' || qs.balance === 'due') where.push('b.balance > 0');
    else if (qs.balance === 'advance') where.push('b.balance < 0');
    else if (qs.balance === 'clear') where.push('b.balance = 0');
    addRange(where, params, qs, 'balance', 'b.balance');
    if (type === 'customer' && qs.points === '1') where.push('t.loyalty_points > 0');
    if (type === 'customer' && qs.birthday === 'month') where.push('t.dob IS NOT NULL AND EXTRACT(MONTH FROM t.dob) = EXTRACT(MONTH FROM bp_today())');
    if (type === 'customer' && qs.overdue === '1') where.push('EXISTS (SELECT 1 FROM sales s WHERE s.customer_id = t.id AND s.due_amount > 0 AND s.next_payment_date <= bp_today())');
    const base = `FROM ${c.table} t JOIN ${c.view} b ON b.${c.viewFk} = t.id WHERE ${where.join(' AND ')}`;
    const [{ total, total_balance }] = await query(`SELECT COUNT(*) AS total, COALESCE(SUM(b.balance),0) AS total_balance ${base}`, params);
    const sort = orderBy(qs.sort, {
      balance: 'b.balance DESC, t.name', balance_desc: 'b.balance DESC, t.name', balance_asc: 'b.balance ASC, t.name',
      newest: 't.id DESC', name_desc: 't.name DESC',
      ...(type === 'customer' ? { points: 't.loyalty_points DESC, t.name' } : {}),
    }, 't.name');
    const rows = await query(`SELECT t.*, ROUND(b.balance, 2) AS balance ${base} ORDER BY ${sort} LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const areas = await query(`SELECT DISTINCT area FROM ${c.table} WHERE is_active AND COALESCE(area, '') <> '' ORDER BY area LIMIT 200`);
    res.json({ data: rows, total, total_balance: money(total_balance), page, limit, areas: areas.map((a) => a.area) });
  });

  ctrl.get = asyncHandler(async (req, res) => {
    const row = await one(`SELECT t.*, ROUND(b.balance,2) AS balance FROM ${c.table} t JOIN ${c.view} b ON b.${c.viewFk} = t.id WHERE t.id = ?`, [req.params.id]);
    if (!row) throw notFound(`${type} not found`);
    row.contacts = await query(`SELECT id, type, label, value FROM ${c.contacts} WHERE ${c.fk} = ? ORDER BY id`, [row.id]);
    if (type === 'customer') {
      row.stats = await one(
        `SELECT COUNT(*) AS invoices, COALESCE(SUM(grand_total),0) AS total_spent, MAX(sale_date) AS last_visit,
                COALESCE(SUM(due_amount),0) AS open_due, MIN(CASE WHEN due_amount > 0 THEN next_payment_date END) AS next_payment_date
         FROM sales WHERE customer_id = ? AND status <> 'cancelled'`, [row.id]);
      row.loyalty_history = await query('SELECT * FROM loyalty_transactions WHERE customer_id = ? ORDER BY id DESC LIMIT 50', [row.id]);
    } else {
      row.stats = await one(
        `SELECT COUNT(*) AS invoices, COALESCE(SUM(grand_total),0) AS total_purchased, MAX(purchase_date) AS last_purchase
         FROM purchases WHERE supplier_id = ?`, [row.id]);
    }
    res.json(row);
  });

  async function saveContacts(conn, id, contacts) {
    if (!Array.isArray(contacts)) return;
    await conn.query(`DELETE FROM ${c.contacts} WHERE ${c.fk} = ?`, [id]);
    for (const ct of contacts) {
      if (!ct || !String(ct.value || '').trim()) continue;
      await conn.query(`INSERT INTO ${c.contacts} (${c.fk}, type, label, value) VALUES (?,?,?,?)`,
        [id, ['phone', 'email', 'address', 'other'].includes(ct.type) ? ct.type : 'phone', ct.label || null, String(ct.value).trim()]);
    }
  }

  function fields(b) {
    const base = {
      name: String(b.name || '').trim(), phone: b.phone || null, address: b.address || null, area: b.area || null,
      opening_balance: Number(b.opening_balance) || 0, notes: b.notes || null,
    };
    if (type === 'customer') base.dob = b.dob || null;
    else base.company = b.company || null;
    return base;
  }

  ctrl.create = asyncHandler(async (req, res) => {
    requireFields(req.body, ['name']);
    const f = fields(req.body);
    // Primary phone can come from the first phone in the dynamic list
    if (!f.phone && Array.isArray(req.body.contacts)) f.phone = req.body.contacts.find((x) => x.type === 'phone' && x.value)?.value || null;
    if (type === 'customer' && f.phone) {
      const dup = await one('SELECT id, name FROM customers WHERE phone = ? AND is_active = true', [f.phone]);
      if (dup) throw badRequest(`Phone already belongs to customer "${dup.name}"`);
    }
    const id = await transaction(async (conn) => {
      const cols = Object.keys(f);
      const r = await conn.q(`INSERT INTO ${c.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, Object.values(f));
      await saveContacts(conn, r.insertId, req.body.contacts);
      return r.insertId;
    });
    await logActivity(req, `${type}s`, 'create', id, { name: f.name, phone: f.phone });
    const created = await one(`SELECT t.*, ROUND(b.balance,2) AS balance FROM ${c.table} t JOIN ${c.view} b ON b.${c.viewFk} = t.id WHERE t.id = ?`, [id]);
    res.status(201).json(created);
  });

  ctrl.update = asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await one(`SELECT id FROM ${c.table} WHERE id = ?`, [id]))) throw notFound();
    const f = fields(req.body);
    if (!f.name) throw badRequest('Name is required');
    await transaction(async (conn) => {
      const cols = Object.keys(f);
      await conn.query(`UPDATE ${c.table} SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...Object.values(f), id]);
      await saveContacts(conn, id, req.body.contacts);
    });
    await logActivity(req, `${type}s`, 'update', id, { name: f.name });
    res.json({ message: 'Saved' });
  });

  ctrl.remove = asyncHandler(async (req, res) => {
    const b = await one(`SELECT balance FROM ${c.view} WHERE ${c.viewFk} = ?`, [req.params.id]);
    if (b && Math.abs(b.balance) > 0.009) throw badRequest(`Cannot delete: ledger balance is ${b.balance}. Settle it first.`);
    await query(`UPDATE ${c.table} SET is_active = false WHERE id = ?`, [req.params.id]);
    await logActivity(req, `${type}s`, 'delete', req.params.id);
    res.json({ message: 'Deleted' });
  });

  /**
   * GET /:id/ledger?from=&to=&txn_type=sale,collection
   * Returns opening balance (brought forward), entries with running balance, closing.
   */
  ctrl.ledger = asyncHandler(async (req, res) => {
    const party = await one(`SELECT * FROM ${c.table} WHERE id = ?`, [req.params.id]);
    if (!party) throw notFound();
    const { from, to } = req.query;
    const types = req.query.txn_type ? String(req.query.txn_type).split(',') : null;
    const all = (await ledgerEntries(type, party.id))
      .map((e) => ({ ...e, debit: money(e.debit), credit: money(e.credit) }))
      .sort((a, b) => (a.txn_date === b.txn_date ? String(a.created_at).localeCompare(String(b.created_at)) : String(a.txn_date).localeCompare(String(b.txn_date))));

    let opening = money(party.opening_balance);
    const rows = [];
    for (const e of all) {
      if (from && e.txn_date < from) { opening = money(opening + e.debit - e.credit); continue; }
      if (to && e.txn_date > to) continue;
      rows.push(e);
    }
    let running = opening;
    const out = [];
    for (const e of rows) {
      running = money(running + e.debit - e.credit);
      if (!types || types.includes(e.txn_type)) out.push({ ...e, balance: running });
    }
    const totals = out.reduce((t, e) => ({ debit: money(t.debit + e.debit), credit: money(t.credit + e.credit) }), { debit: 0, credit: 0 });
    res.json({ party: { id: party.id, name: party.name, phone: party.phone, address: party.address }, opening_balance: opening, entries: out, totals, closing_balance: running });
  });

  /**
   * POST /:id/adjustments { effect: addition|deduction, reason, amount, note, adj_date }
   * Customer: deduction = waive loose change / discount; addition = extra charge.
   * Supplier: deduction = rebate / commission received; addition = extra charge from supplier.
   */
  ctrl.addAdjustment = asyncHandler(async (req, res) => {
    requireFields(req.body, ['effect', 'amount']);
    const { effect, reason = 'other', note = null } = req.body;
    const amount = money(req.body.amount);
    if (!['addition', 'deduction'].includes(effect)) throw badRequest('effect must be addition or deduction');
    if (amount <= 0) throw badRequest('Amount must be greater than 0');
    const party = await one(`SELECT id FROM ${c.table} WHERE id = ?`, [req.params.id]);
    if (!party) throw notFound();
    const id = await transaction(async (conn) => {
      const r = await conn.q(
        'INSERT INTO ledger_adjustments (party_type, party_id, effect, reason, amount, note, adj_date, user_id) VALUES (?,?,?,?,?,?,?,?)',
        [type, party.id, effect, reason, amount, note, req.body.adj_date || today(), req.user.id]
      );
      if (effect === 'deduction') await allocateFifo(conn, type, party.id, amount);
      return r.insertId;
    });
    await logActivity(req, `${type}s`, `adjustment_${effect}`, party.id, { amount, reason, note });
    res.status(201).json({ id });
  });

  ctrl.removeAdjustment = asyncHandler(async (req, res) => {
    const adj = await one('SELECT * FROM ledger_adjustments WHERE id = ? AND party_type = ? AND party_id = ?', [req.params.adjId, type, req.params.id]);
    if (!adj) throw notFound('Adjustment not found');
    await query('DELETE FROM ledger_adjustments WHERE id = ?', [adj.id]);
    await logActivity(req, `${type}s`, 'adjustment_delete', adj.party_id, adj);
    res.json({ message: 'Adjustment removed (invoice dues are not re-opened automatically)' });
  });

  return ctrl;
}

export const customers = build('customer');
export const suppliers = build('supplier');
export { allocateFifo };
