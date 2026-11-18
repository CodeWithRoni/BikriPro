import { query, one, transaction } from '../config/db.js';
import { addRange, orderBy } from '../utils/filters.js';
import { asyncHandler, requireFields, badRequest, notFound, paging, money, today } from '../utils/http.js';
import { logActivity } from '../utils/activity.js';
import { nextNumber } from '../utils/numbering.js';
import { adjustStock } from '../services/stock.service.js';
import { recordTxn } from '../services/accounts.service.js';

/**
 * POST /purchases
 * { supplier_id, supplier_ref?, purchase_date?, discount?, other_cost?, note?,
 *   items: [{ variant_id, qty, unit_cost, retail_price?, wholesale_price? }],
 *   payments: [{ account_id, amount }] }
 * Stock goes up, latest cost becomes the variant's purchase price, and an
 * optional new retail/wholesale price can be set straight from the purchase.
 */
export const create = asyncHandler(async (req, res) => {
  const b = req.body;
  requireFields(b, ['supplier_id']);
  if (!Array.isArray(b.items) || !b.items.length) throw badRequest('Add at least one item');

  const result = await transaction(async (conn) => {
    const supplier = await conn.one('SELECT id FROM suppliers WHERE id = ? AND is_active = true', [b.supplier_id]);
    if (!supplier) throw badRequest('Supplier not found');
    const lines = [];
    for (const it of b.items) {
      const qty = Number(it.qty);
      const cost = money(it.unit_cost);
      if (!(qty > 0)) throw badRequest('Quantity must be greater than 0');
      if (cost < 0) throw badRequest('Cost cannot be negative');
      const v = await conn.one('SELECT v.*, p.name AS product_name FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?', [it.variant_id]);
      if (!v) throw badRequest(`Variant #${it.variant_id} not found`);
      lines.push({ v, qty, cost, it, lineTotal: money(qty * cost) });
    }
    const subtotal = money(lines.reduce((t, l) => t + l.lineTotal, 0));
    const discount = money(b.discount || 0);
    const otherCost = money(b.other_cost || 0);
    const grand = money(subtotal - discount + otherCost);
    if (grand < 0) throw badRequest('Discount is larger than the bill');
    const payments = (b.payments || []).filter((p) => Number(p.amount) > 0);
    const paid = money(payments.reduce((t, p) => t + Number(p.amount), 0));
    if (paid > grand) throw badRequest('Paid amount is more than the purchase total');
    const date = b.purchase_date || today();

    const no = await nextNumber(conn, 'purchase');
    const r = await conn.q(
      `INSERT INTO purchases (invoice_no, supplier_ref, supplier_id, purchase_date, subtotal, discount, other_cost, grand_total, paid_amount, due_amount, note, user_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [no, b.supplier_ref || null, supplier.id, date, subtotal, discount, otherCost, grand, paid, money(grand - paid), b.note || null, req.user.id]);
    const id = r.insertId;

    for (const l of lines) {
      await conn.query(
        'INSERT INTO purchase_items (purchase_id, variant_id, product_name, variant_label, qty, unit_cost, line_total) VALUES (?,?,?,?,?,?,?)',
        [id, l.v.id, l.v.product_name, [l.v.size, l.v.color].filter(Boolean).join(' / ') || null, l.qty, l.cost, l.lineTotal]);
      await adjustStock(conn, l.v.id, l.qty, { allowNegative: true });

      const newRetail = l.it.retail_price !== undefined && l.it.retail_price !== '' && l.it.retail_price !== null ? money(l.it.retail_price) : l.v.retail_price;
      const newWholesale = l.it.wholesale_price !== undefined && l.it.wholesale_price !== '' && l.it.wholesale_price !== null ? money(l.it.wholesale_price) : l.v.wholesale_price;
      if (l.cost !== Number(l.v.purchase_price) || newRetail !== l.v.retail_price || newWholesale !== l.v.wholesale_price) {
        await conn.query('UPDATE product_variants SET purchase_price = ?, retail_price = ?, wholesale_price = ? WHERE id = ?', [l.cost, newRetail, newWholesale, l.v.id]);
        await conn.query(
          `INSERT INTO price_history (variant_id, old_purchase_price, new_purchase_price, old_retail_price, new_retail_price, old_wholesale_price, new_wholesale_price, user_id)
           VALUES (?,?,?,?,?,?,?,?)`,
          [l.v.id, l.v.purchase_price, l.cost, l.v.retail_price, newRetail, l.v.wholesale_price, newWholesale, req.user.id]);
      }
    }
    for (const p of payments) {
      await conn.query('INSERT INTO purchase_payments (purchase_id, account_id, amount) VALUES (?,?,?)', [id, p.account_id, money(p.amount)]);
      await recordTxn(conn, { accountId: p.account_id, direction: 'out', amount: money(p.amount), refType: 'purchase', refId: id, note: no, date, userId: req.user.id });
    }
    return { id, invoice_no: no };
  });
  await logActivity(req, 'purchases', 'create', result.id, result);
  res.status(201).json(await loadPurchase(result.id));
});

async function loadPurchase(id) {
  const p = await one(
    `SELECT p.*, s.name AS supplier_name, s.company AS supplier_company, s.phone AS supplier_phone, u.name AS user_name
     FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?`, [id]);
  if (!p) return null;
  p.items = await query(
    `SELECT pi.*, v.sku, v.barcode, v.size, v.color, v.retail_price, v.wholesale_price, pr.name AS current_name, b.name AS brand
     FROM purchase_items pi LEFT JOIN product_variants v ON v.id = pi.variant_id
     LEFT JOIN products pr ON pr.id = v.product_id LEFT JOIN brands b ON b.id = pr.brand_id
     WHERE pi.purchase_id = ? ORDER BY pi.id`, [id]);
  p.payments = await query('SELECT pp.*, a.name AS account_name FROM purchase_payments pp JOIN accounts a ON a.id = pp.account_id WHERE pp.purchase_id = ?', [id]);
  return p;
}

export const get = asyncHandler(async (req, res) => {
  const p = await loadPurchase(req.params.id);
  if (!p) throw notFound('Purchase not found');
  res.json(p);
});

export const list = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const where = ['1=1'];
  const params = [];
  if (req.query.from) { where.push('p.purchase_date >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('p.purchase_date <= ?'); params.push(req.query.to); }
  if (req.query.supplier_id) { where.push('p.supplier_id = ?'); params.push(req.query.supplier_id); }
  const qs = req.query;
  if (qs.due_only === '1') where.push('p.due_amount > 0');
  if (qs.status) { where.push('p.status = ?'); params.push(qs.status); }
  if (qs.pay === 'paid') where.push('p.due_amount <= 0');
  else if (qs.pay === 'partial') where.push('p.due_amount > 0 AND p.paid_amount > 0');
  else if (qs.pay === 'unpaid') where.push('p.due_amount > 0 AND p.paid_amount <= 0');
  addRange(where, params, qs, 'amount', 'p.grand_total');
  if (qs.q) { where.push('(p.invoice_no ILIKE ? OR p.supplier_ref ILIKE ? OR s.name ILIKE ?)'); const l = `%${qs.q}%`; params.push(l, l, l); }
  const base = `FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE ${where.join(' AND ')}`;
  const order = orderBy(qs.sort, { oldest: 'p.purchase_date ASC, p.id ASC', amount_desc: 'p.grand_total DESC, p.id DESC', amount_asc: 'p.grand_total ASC, p.id DESC', due_desc: 'p.due_amount DESC, p.id DESC' }, 'p.purchase_date DESC, p.id DESC');
  const [sum] = await query(`SELECT COUNT(*) AS total, COALESCE(SUM(p.grand_total),0) AS amount, COALESCE(SUM(p.paid_amount),0) AS paid, COALESCE(SUM(p.due_amount),0) AS due ${base}`, params);
  const rows = await query(
    `SELECT p.id, p.invoice_no, p.supplier_ref, p.purchase_date, p.grand_total, p.paid_amount, p.due_amount, p.status, s.name AS supplier_name,
      (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS item_count,
      (SELECT COALESCE(SUM(pi.qty),0) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS total_qty
     ${base} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows, summary: sum, total: sum.total, page, limit });
});

/** GET /purchases/recent — last 10 purchase invoices (Barcode Labels picker) */
export const recent = asyncHandler(async (req, res) => {
  res.json(await query(
    `SELECT p.id, p.invoice_no, p.purchase_date, s.name AS supplier_name,
       (SELECT COALESCE(SUM(pi.qty),0) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS total_qty
     FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id ORDER BY p.id DESC LIMIT 10`));
});

// ---------- Purchase Return ----------
export const createReturn = asyncHandler(async (req, res) => {
  requireFields(req.body, ['purchase_id', 'items']);
  const b = req.body;
  const result = await transaction(async (conn) => {
    const pur = await conn.one('SELECT * FROM purchases WHERE id = ? FOR UPDATE', [b.purchase_id]);
    if (!pur) throw notFound('Purchase not found');
    const items = await conn.q('SELECT * FROM purchase_items WHERE purchase_id = ?', [pur.id]);
    const linesSum = items.reduce((t, i) => t + Number(i.line_total), 0) || 1;
    const ratio = Number(pur.grand_total) / linesSum;
    let total = 0;
    const lines = [];
    for (const r of b.items) {
      const qty = Number(r.qty);
      if (!(qty > 0)) continue;
      const it = items.find((i) => i.id === Number(r.purchase_item_id));
      if (!it) throw badRequest('Item does not belong to this purchase');
      if (qty > Number(it.qty) - Number(it.returned_qty)) throw badRequest(`Cannot return more than purchased for ${it.product_name}`);
      const unit = money(Number(it.unit_cost) * ratio);
      lines.push({ it, qty, unit, lineTotal: money(unit * qty) });
      total += unit * qty;
    }
    if (!lines.length) throw badRequest('Select at least one item to return');
    total = money(total);
    const refund = money(b.refund_amount || 0);
    if (refund > total) throw badRequest('Refund cannot exceed return value');
    if (refund > 0 && !b.account_id) throw badRequest('Choose the account the refund is received into');
    const date = b.return_date || today();
    const no = await nextNumber(conn, 'purchase_return');
    const ins = await conn.q(
      'INSERT INTO purchase_returns (return_no, purchase_id, supplier_id, return_date, total_amount, refund_amount, account_id, reason, user_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [no, pur.id, pur.supplier_id, date, total, refund, refund > 0 ? b.account_id : null, b.reason || null, req.user.id]);
    for (const l of lines) {
      await conn.query('INSERT INTO purchase_return_items (purchase_return_id, purchase_item_id, variant_id, qty, unit_cost, line_total) VALUES (?,?,?,?,?,?)',
        [ins.insertId, l.it.id, l.it.variant_id, l.qty, l.unit, l.lineTotal]);
      await conn.query('UPDATE purchase_items SET returned_qty = returned_qty + ? WHERE id = ?', [l.qty, l.it.id]);
      if (l.it.variant_id) await adjustStock(conn, l.it.variant_id, -l.qty);
    }
    const settle = Math.min(money(total - refund), Number(pur.due_amount));
    const left = (await conn.one('SELECT SUM(qty - returned_qty) AS left_qty FROM purchase_items WHERE purchase_id = ?', [pur.id])).left_qty;
    await conn.query('UPDATE purchases SET due_amount = due_amount - ?, status = ? WHERE id = ?', [settle, left <= 0 ? 'returned' : 'partial_return', pur.id]);
    if (refund > 0) await recordTxn(conn, { accountId: b.account_id, direction: 'in', amount: refund, refType: 'purchase_return', refId: ins.insertId, note: no, date, userId: req.user.id });
    return { id: ins.insertId, return_no: no, total, refund };
  });
  await logActivity(req, 'purchase_return', 'create', result.id, result);
  res.status(201).json(result);
});

export const listReturns = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const qs = req.query;
  const where = ['1=1'];
  const params = [];
  if (qs.from) { where.push('r.return_date >= ?'); params.push(qs.from); }
  if (qs.to) { where.push('r.return_date <= ?'); params.push(qs.to); }
  if (qs.supplier_id) { where.push('r.supplier_id = ?'); params.push(qs.supplier_id); }
  if (qs.refund === 'cash') where.push('r.refund_amount > 0');
  else if (qs.refund === 'credit') where.push('r.refund_amount < r.total_amount');
  addRange(where, params, qs, 'amount', 'r.total_amount');
  if (qs.q) { where.push('(r.return_no ILIKE ? OR p.invoice_no ILIKE ? OR s.name ILIKE ? OR r.reason ILIKE ?)'); const l = `%${qs.q}%`; params.push(l, l, l, l); }
  const base = `FROM purchase_returns r JOIN purchases p ON p.id = r.purchase_id LEFT JOIN suppliers s ON s.id = r.supplier_id WHERE ${where.join(' AND ')}`;
  const [sum] = await query(`SELECT COUNT(*) AS total, COALESCE(SUM(r.total_amount),0) AS amount, COALESCE(SUM(r.refund_amount),0) AS refunded ${base}`, params);
  const order = orderBy(qs.sort, { oldest: 'r.id ASC', amount_desc: 'r.total_amount DESC, r.id DESC', amount_asc: 'r.total_amount ASC, r.id DESC' }, 'r.id DESC');
  const rows = await query(`SELECT r.*, p.invoice_no, s.name AS supplier_name ${base} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows, summary: sum, total: sum.total, page, limit });
});

export { loadPurchase as loadPurchase };
