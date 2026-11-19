/**
 * Branches (multi-branch shops) and stock transfers between them.
 * Each branch has its own stock (branch_stock), cash drawer account and records.
 */
import { query, one, transaction } from '../config/db.js';
import { asyncHandler, requireFields, badRequest, notFound, forbidden, money } from '../utils/http.js';
import { logActivity } from '../utils/activity.js';
import { nextNumber } from '../utils/numbering.js';
import { moveBranchStock } from '../services/stock.service.js';

const dupe = (e) => { if (e?.code === '23505') throw badRequest('A branch with this name already exists'); throw e; };

/** GET /branches — active branches (for the switcher and pickers) + which one this request works in */
export const list = asyncHandler(async (req, res) => {
  const rows = await query('SELECT id, name, code, address, phone, is_main, is_active FROM branches ORDER BY is_main DESC, name');
  res.json({ data: rows, current: req.branchId, scope: req.branchScope, own: req.user.branch_id || null });
});

/** GET /branches/overview — one row per branch: today / month sales, stock, cash, open shifts */
export const overview = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT b.id, b.name, b.code, b.is_main, b.is_active,
       (SELECT COALESCE(SUM(grand_total),0) FROM sales s WHERE s.branch_id = b.id AND DATE(s.sale_date) = bp_today() AND s.status <> 'cancelled') AS today_sales,
       (SELECT COUNT(*) FROM sales s WHERE s.branch_id = b.id AND DATE(s.sale_date) = bp_today() AND s.status <> 'cancelled') AS today_bills,
       (SELECT COALESCE(SUM(grand_total),0) FROM sales s WHERE s.branch_id = b.id AND s.sale_date >= date_trunc('month', bp_today()) AND s.status <> 'cancelled') AS month_sales,
       (SELECT COALESCE(SUM(grand_total - cost_total),0) FROM sales s WHERE s.branch_id = b.id AND s.sale_date >= date_trunc('month', bp_today()) AND s.status <> 'cancelled') AS month_gross,
       (SELECT COALESCE(SUM(amount),0) FROM expenses e WHERE e.branch_id = b.id AND e.expense_date >= date_trunc('month', bp_today())) AS month_expenses,
       (SELECT COALESCE(SUM(GREATEST(bs.qty,0)),0) FROM branch_stock bs WHERE bs.branch_id = b.id) AS stock_qty,
       (SELECT COALESCE(SUM(GREATEST(bs.qty,0) * v.purchase_price),0) FROM branch_stock bs JOIN product_variants v ON v.id = bs.variant_id WHERE bs.branch_id = b.id) AS stock_value,
       (SELECT COUNT(*) FROM cash_sessions cs WHERE cs.branch_id = b.id AND cs.status = 'open') AS open_shifts,
       (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id AND u.is_active) AS users,
       (SELECT COUNT(*) FROM stock_transfers t WHERE t.to_branch_id = b.id AND t.status = 'in_transit') AS incoming
     FROM branches b ORDER BY b.is_main DESC, b.name`);
  const totals = rows.reduce((t, r) => {
    for (const k of ['today_sales', 'today_bills', 'month_sales', 'month_gross', 'month_expenses', 'stock_qty', 'stock_value', 'open_shifts']) t[k] = money((t[k] || 0) + Number(r[k]));
    return t;
  }, {});
  res.json({ data: rows, totals });
});

/** POST /branches { name, code?, address?, phone?, cash_account?: true } — also creates the branch's cash drawer */
export const create = asyncHandler(async (req, res) => {
  const b = req.body || {};
  requireFields(b, ['name']);
  const id = await transaction(async (conn) => {
    const r = await conn.q('INSERT INTO branches (name, code, address, phone) VALUES (?,?,?,?)', [b.name.trim(), b.code || null, b.address || null, b.phone || null]).catch(dupe);
    if (b.cash_account !== false) {
      await conn.query("INSERT INTO accounts (name, type, is_default, branch_id) VALUES (?, 'cash', false, ?)", [`Cash — ${b.name.trim()}`, r.insertId]);
    }
    return r.insertId;
  });
  await logActivity(req, 'branches', 'create', id, b.name);
  res.status(201).json({ id });
});

export const update = asyncHandler(async (req, res) => {
  const b = req.body || {};
  requireFields(b, ['name']);
  const cur = await one('SELECT * FROM branches WHERE id = ?', [req.params.id]);
  if (!cur) throw notFound('Branch not found');
  if (cur.is_main && b.is_active === false) throw badRequest('The main branch cannot be closed');
  await query('UPDATE branches SET name = ?, code = ?, address = ?, phone = ?, is_active = ? WHERE id = ?',
    [b.name.trim(), b.code || null, b.address || null, b.phone || null, b.is_active !== false, cur.id]).catch(dupe);
  await logActivity(req, 'branches', 'update', cur.id, b.name);
  res.json({ message: 'Updated' });
});

/** GET /branches/stock?variant_ids=1,2 — stock of variants in every branch */
export const stockByBranch = asyncHandler(async (req, res) => {
  const ids = String(req.query.variant_ids || '').split(',').map(Number).filter(Boolean).slice(0, 200);
  if (!ids.length) return res.json([]);
  res.json(await query('SELECT bs.variant_id, bs.branch_id, b.name AS branch_name, bs.qty FROM branch_stock bs JOIN branches b ON b.id = bs.branch_id WHERE bs.variant_id IN (?) ORDER BY b.is_main DESC, b.name', [ids]));
});

// ---------------- Transfers ----------------
async function loadTransfer(id) {
  const t = await one(
    `SELECT t.*, fb.name AS from_branch, tb.name AS to_branch, su.name AS sent_by_name, ru.name AS received_by_name
     FROM stock_transfers t JOIN branches fb ON fb.id = t.from_branch_id JOIN branches tb ON tb.id = t.to_branch_id
     LEFT JOIN users su ON su.id = t.sent_by LEFT JOIN users ru ON ru.id = t.received_by WHERE t.id = ?`, [id]);
  if (!t) return null;
  t.items = await query(
    `SELECT i.*, p.name, v.sku, v.size, v.color, v.purchase_price FROM stock_transfer_items i JOIN product_variants v ON v.id = i.variant_id
     JOIN products p ON p.id = v.product_id WHERE i.transfer_id = ? ORDER BY i.id`, [id]);
  return t;
}

export const listTransfers = asyncHandler(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.branchScope) { where.push('(t.from_branch_id = ? OR t.to_branch_id = ?)'); params.push(req.branchScope, req.branchScope); }
  if (req.query.status) { where.push('t.status = ?'); params.push(req.query.status); }
  if (req.query.direction === 'in' && req.branchScope) { where.push('t.to_branch_id = ?'); params.push(req.branchScope); }
  if (req.query.direction === 'out' && req.branchScope) { where.push('t.from_branch_id = ?'); params.push(req.branchScope); }
  res.json(await query(
    `SELECT t.*, fb.name AS from_branch, tb.name AS to_branch, su.name AS sent_by_name,
       (SELECT COALESCE(SUM(qty),0) FROM stock_transfer_items i WHERE i.transfer_id = t.id) AS qty,
       (SELECT COALESCE(SUM(i.qty * v.purchase_price),0) FROM stock_transfer_items i JOIN product_variants v ON v.id = i.variant_id WHERE i.transfer_id = t.id) AS value
     FROM stock_transfers t JOIN branches fb ON fb.id = t.from_branch_id JOIN branches tb ON tb.id = t.to_branch_id
     LEFT JOIN users su ON su.id = t.sent_by WHERE ${where.join(' AND ')} ORDER BY t.id DESC LIMIT 200`, params));
});

export const getTransfer = asyncHandler(async (req, res) => {
  const t = await loadTransfer(req.params.id);
  if (!t) throw notFound('Transfer not found');
  res.json(t);
});

/** POST /transfers { to_branch_id, items: [{ variant_id, qty }], note? } — sends from the current branch */
export const send = asyncHandler(async (req, res) => {
  const b = req.body || {};
  requireFields(b, ['to_branch_id']);
  if (!Array.isArray(b.items) || !b.items.length) throw badRequest('Add products to send');
  const from = req.branchId;
  if (Number(b.to_branch_id) === Number(from)) throw badRequest('Choose a different branch to send to');
  const id = await transaction(async (conn) => {
    if (!(await conn.one('SELECT id FROM branches WHERE id = ? AND is_active', [b.to_branch_id]))) throw badRequest('Branch not found');
    const no = await nextNumber(conn, 'stock_transfer');
    const r = await conn.q('INSERT INTO stock_transfers (transfer_no, from_branch_id, to_branch_id, note, sent_by) VALUES (?,?,?,?,?)', [no, from, b.to_branch_id, b.note || null, req.user.id]);
    for (const it of b.items) {
      const qty = Number(it.qty);
      if (!(qty > 0)) throw badRequest('Quantity must be greater than 0');
      const v = await conn.one('SELECT v.sku, p.name FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?', [it.variant_id]);
      if (!v) throw badRequest('Product not found');
      await moveBranchStock(conn, from, it.variant_id, -qty, { label: `${v.name} (${v.sku})` });
      await conn.query('INSERT INTO stock_transfer_items (transfer_id, variant_id, qty) VALUES (?,?,?)', [r.insertId, it.variant_id, qty]);
    }
    return r.insertId;
  });
  await logActivity(req, 'transfers', 'send', id);
  res.status(201).json(await loadTransfer(id));
});

/** POST /transfers/:id/receive — only the receiving branch (or an admin) */
export const receive = asyncHandler(async (req, res) => {
  await transaction(async (conn) => {
    const t = await conn.one('SELECT * FROM stock_transfers WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!t) throw notFound('Transfer not found');
    if (t.status !== 'in_transit') throw badRequest(`This transfer is already ${t.status.replace('_', ' ')}`);
    if (req.user.role !== 'admin' && Number(req.branchId) !== Number(t.to_branch_id)) throw forbidden('Only the receiving branch can receive this');
    for (const it of await conn.q('SELECT * FROM stock_transfer_items WHERE transfer_id = ?', [t.id])) {
      await moveBranchStock(conn, t.to_branch_id, it.variant_id, Number(it.qty), { allowNegative: true });
    }
    await conn.query("UPDATE stock_transfers SET status = 'received', received_by = ?, received_at = bp_now() WHERE id = ?", [req.user.id, t.id]);
  });
  await logActivity(req, 'transfers', 'receive', req.params.id);
  res.json(await loadTransfer(req.params.id));
});

/** POST /transfers/:id/cancel — goods go back to the sending branch */
export const cancel = asyncHandler(async (req, res) => {
  await transaction(async (conn) => {
    const t = await conn.one('SELECT * FROM stock_transfers WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!t) throw notFound('Transfer not found');
    if (t.status !== 'in_transit') throw badRequest('Only a transfer on the way can be cancelled');
    for (const it of await conn.q('SELECT * FROM stock_transfer_items WHERE transfer_id = ?', [t.id])) {
      await moveBranchStock(conn, t.from_branch_id, it.variant_id, Number(it.qty), { allowNegative: true });
    }
    await conn.query("UPDATE stock_transfers SET status = 'cancelled' WHERE id = ?", [t.id]);
  });
  await logActivity(req, 'transfers', 'cancel', req.params.id);
  res.json(await loadTransfer(req.params.id));
});
