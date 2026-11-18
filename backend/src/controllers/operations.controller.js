/**
 * Daily shop operations:
 *  - Cash drawer shifts / day closing (per cashier, expected vs counted cash)
 *  - Stock adjustments (damage, lost, theft, expired, found …)
 *  - Stock count / audit (scan, compare with system stock, apply)
 */
import { query, one, transaction } from '../config/db.js';
import { asyncHandler, requireFields, badRequest, notFound, forbidden, paging, money, today } from '../utils/http.js';
import { addRange, orderBy } from '../utils/filters.js';
import { logActivity } from '../utils/activity.js';
import { nextNumber } from '../utils/numbering.js';
import { adjustStock } from '../services/stock.service.js';
import { RANK } from '../middleware/auth.js';

const isManager = (req) => (RANK[req.user.role] || 0) >= RANK.manager;

// =====================================================================
// Cash drawer shifts
// =====================================================================

/** Money that moved through the drawer account by this cashier during the shift, by type. */
async function shiftMovements(conn, s, until = null) {
  const q = conn ? conn.q.bind(conn) : query;
  const rows = await q(
    `SELECT ref_type, direction, COALESCE(SUM(amount),0) AS amount, COUNT(*) AS n
     FROM account_transactions
     WHERE account_id = ? AND user_id = ? AND created_at >= ? AND (?::timestamp IS NULL OR created_at <= ?::timestamp)
     GROUP BY ref_type, direction ORDER BY ref_type`,
    [s.account_id, s.user_id, s.opened_at, until, until]);
  const cashIn = money(rows.filter((r) => r.direction === 'in').reduce((t, r) => t + Number(r.amount), 0));
  const cashOut = money(rows.filter((r) => r.direction === 'out').reduce((t, r) => t + Number(r.amount), 0));
  const [sales] = await q(
    `SELECT COUNT(*) AS invoices, COALESCE(SUM(grand_total),0) AS total, COALESCE(SUM(due_amount),0) AS due
     FROM sales WHERE user_id = ? AND sale_date >= ? AND (?::timestamp IS NULL OR sale_date <= ?::timestamp) AND status <> 'cancelled'`,
    [s.user_id, s.opened_at, until, until]);
  const byMethod = await q(
    `SELECT sp.method, COALESCE(SUM(sp.amount),0) AS amount FROM sale_payments sp JOIN sales x ON x.id = sp.sale_id
     WHERE x.user_id = ? AND x.sale_date >= ? AND (?::timestamp IS NULL OR x.sale_date <= ?::timestamp)
     GROUP BY sp.method ORDER BY amount DESC`,
    [s.user_id, s.opened_at, until, until]);
  return {
    lines: rows, cash_in: cashIn, cash_out: cashOut,
    expected_cash: money(Number(s.opening_cash) + cashIn - cashOut),
    sales, sales_by_method: byMethod,
  };
}

const SESSION_SQL = `SELECT cs.*, u.name AS user_name, cb.name AS closed_by_name, a.name AS account_name
  FROM cash_sessions cs JOIN users u ON u.id = cs.user_id JOIN accounts a ON a.id = cs.account_id
  LEFT JOIN users cb ON cb.id = cs.closed_by`;

/** GET /cash-sessions/current — my open shift with live totals (null when none) */
export const currentSession = asyncHandler(async (req, res) => {
  const s = await one(`${SESSION_SQL} WHERE cs.user_id = ? AND cs.status = 'open'`, [req.user.id]);
  if (!s) return res.json({ session: null });
  res.json({ session: { ...s, ...(await shiftMovements(null, s)) } });
});

/** POST /cash-sessions/open { opening_cash, account_id?, note? } */
export const openSession = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const opening = money(b.opening_cash);
  if (opening < 0) throw badRequest('Opening cash cannot be negative');
  const id = await transaction(async (conn) => {
    if (await conn.one("SELECT id FROM cash_sessions WHERE user_id = ? AND status = 'open'", [req.user.id])) {
      throw badRequest('You already have an open shift. Close it first.');
    }
    let accountId = b.account_id;
    if (!accountId) accountId = (await conn.one("SELECT id FROM accounts WHERE type = 'cash' AND is_active ORDER BY is_default DESC, id LIMIT 1"))?.id;
    const acc = await conn.one('SELECT id, type FROM accounts WHERE id = ? AND is_active', [accountId]);
    if (!acc) throw badRequest('Choose the cash drawer account');
    const no = await nextNumber(conn, 'cash_session');
    const r = await conn.q('INSERT INTO cash_sessions (session_no, user_id, account_id, opening_cash, opening_note) VALUES (?,?,?,?,?)',
      [no, req.user.id, acc.id, opening, b.note || null]);
    return r.insertId;
  });
  await logActivity(req, 'cash_sessions', 'open', id, { opening_cash: opening });
  res.status(201).json(await one(`${SESSION_SQL} WHERE cs.id = ?`, [id]));
});

/** POST /cash-sessions/:id/close { counted_cash, denominations?, note? } — own shift, or any shift for managers */
export const closeSession = asyncHandler(async (req, res) => {
  requireFields(req.body, ['counted_cash']);
  const counted = money(req.body.counted_cash);
  if (counted < 0) throw badRequest('Counted cash cannot be negative');
  const result = await transaction(async (conn) => {
    const s = await conn.one('SELECT * FROM cash_sessions WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!s) throw notFound('Shift not found');
    if (s.status !== 'open') throw badRequest('This shift is already closed');
    if (s.user_id !== req.user.id && !isManager(req)) throw forbidden('You can only close your own shift');
    const now = (await conn.one('SELECT bp_now() AS t')).t;
    const m = await shiftMovements(conn, s, now);
    const variance = money(counted - m.expected_cash);
    const denoms = req.body.denominations && typeof req.body.denominations === 'object' ? JSON.stringify(req.body.denominations) : null;
    await conn.query(
      `UPDATE cash_sessions SET status = 'closed', closed_at = ?, closed_by = ?, cash_in = ?, cash_out = ?, expected_cash = ?,
         counted_cash = ?, variance = ?, denominations = ?::jsonb, closing_note = ? WHERE id = ?`,
      [now, req.user.id, m.cash_in, m.cash_out, m.expected_cash, counted, variance, denoms, req.body.note || null, s.id]);
    return { variance, expected: m.expected_cash };
  });
  await logActivity(req, 'cash_sessions', 'close', req.params.id, { counted, ...result });
  const s = await one(`${SESSION_SQL} WHERE cs.id = ?`, [req.params.id]);
  res.json({ ...s, ...(await shiftMovements(null, s, s.closed_at)) });
});

/** GET /cash-sessions?from=&to=&user_id=&status=&result=short|over|exact — cashiers see only their own */
export const listSessions = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const qs = req.query;
  const where = ['1=1'];
  const params = [];
  if (!isManager(req)) { where.push('cs.user_id = ?'); params.push(req.user.id); } else if (qs.user_id) { where.push('cs.user_id = ?'); params.push(qs.user_id); }
  if (qs.from) { where.push('DATE(cs.opened_at) >= ?'); params.push(qs.from); }
  if (qs.to) { where.push('DATE(cs.opened_at) <= ?'); params.push(qs.to); }
  if (qs.status) { where.push('cs.status = ?'); params.push(qs.status); }
  if (qs.result === 'short') where.push('cs.variance < 0');
  else if (qs.result === 'over') where.push('cs.variance > 0');
  else if (qs.result === 'exact') where.push('cs.variance = 0');
  if (qs.q) { where.push('(cs.session_no ILIKE ? OR u.name ILIKE ?)'); params.push(`%${qs.q}%`, `%${qs.q}%`); }
  const base = `FROM cash_sessions cs JOIN users u ON u.id = cs.user_id JOIN accounts a ON a.id = cs.account_id LEFT JOIN users cb ON cb.id = cs.closed_by WHERE ${where.join(' AND ')}`;
  const [sum] = await query(`SELECT COUNT(*) AS total,
      COALESCE(SUM(cs.variance) FILTER (WHERE cs.variance < 0), 0) AS short,
      COALESCE(SUM(cs.variance) FILTER (WHERE cs.variance > 0), 0) AS over,
      COUNT(*) FILTER (WHERE cs.status = 'open') AS open ${base}`, params);
  const rows = await query(`SELECT cs.*, u.name AS user_name, cb.name AS closed_by_name, a.name AS account_name ${base}
    ORDER BY ${orderBy(qs.sort, { oldest: 'cs.id ASC', variance_asc: 'cs.variance ASC NULLS LAST', variance_desc: 'cs.variance DESC NULLS LAST' }, 'cs.id DESC')} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const users = isManager(req) ? await query("SELECT id, name, role FROM users WHERE is_active ORDER BY name") : [];
  res.json({ data: rows, summary: sum, total: sum.total, page, limit, users });
});

/** GET /cash-sessions/:id — one shift with its breakdown */
export const getSession = asyncHandler(async (req, res) => {
  const s = await one(`${SESSION_SQL} WHERE cs.id = ?`, [req.params.id]);
  if (!s) throw notFound('Shift not found');
  if (s.user_id !== req.user.id && !isManager(req)) throw forbidden();
  res.json({ ...s, ...(await shiftMovements(null, s, s.closed_at)) });
});

// =====================================================================
// Stock adjustments (damage / lost / …)
// =====================================================================
const REASONS = ['damage', 'lost', 'theft', 'expired', 'found', 'gift', 'other'];

/** Apply one stock adjustment inside a transaction. */
async function addAdjustment(conn, { variantId, qtyChange, reason, note, refType = 'manual', refId = null, userId, adjNo, date }) {
  const v = await conn.one('SELECT id, purchase_price FROM product_variants WHERE id = ?', [variantId]);
  if (!v) throw badRequest(`Product variant #${variantId} not found`);
  await adjustStock(conn, variantId, qtyChange, { allowNegative: true });
  const cost = Number(v.purchase_price) || 0;
  await conn.query(
    `INSERT INTO stock_adjustments (adj_no, variant_id, qty_change, reason, unit_cost, value, note, ref_type, ref_id, adj_date, user_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [adjNo, variantId, qtyChange, reason, cost, money(qtyChange * cost), note || null, refType, refId, date || today(), userId]);
}

/**
 * POST /stock-adjustments { items: [{ variant_id, qty }], reason, direction?: 'out'|'in', note?, date? }
 * qty is always positive; damage/lost/theft/expired/gift take stock out, "found" adds it back.
 */
export const createAdjustment = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!REASONS.includes(b.reason)) throw badRequest('Choose a reason');
  if (!Array.isArray(b.items) || !b.items.length) throw badRequest('Add at least one product');
  const sign = b.reason === 'found' || b.direction === 'in' ? 1 : -1;
  const no = await transaction(async (conn) => {
    const adjNo = await nextNumber(conn, 'stock_adjustment');
    for (const it of b.items) {
      const qty = Number(it.qty);
      if (!(qty > 0)) throw badRequest('Quantity must be greater than 0');
      await addAdjustment(conn, { variantId: it.variant_id, qtyChange: sign * qty, reason: b.reason, note: b.note, userId: req.user.id, adjNo, date: b.date });
    }
    return adjNo;
  });
  await logActivity(req, 'stock', 'adjust', null, { adj_no: no, reason: b.reason, items: b.items.length });
  res.status(201).json({ adj_no: no });
});

/** GET /stock-adjustments?from=&to=&reason=&q=&type=loss|gain */
export const listAdjustments = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const qs = req.query;
  const where = ['1=1'];
  const params = [];
  if (qs.from) { where.push('x.adj_date >= ?'); params.push(qs.from); }
  if (qs.to) { where.push('x.adj_date <= ?'); params.push(qs.to); }
  if (qs.reason) { where.push('x.reason = ?'); params.push(qs.reason); }
  if (qs.type === 'loss') where.push('x.qty_change < 0');
  else if (qs.type === 'gain') where.push('x.qty_change > 0');
  addRange(where, params, qs, 'value', 'ABS(x.value)');
  if (qs.q) { where.push('(p.name ILIKE ? OR v.sku ILIKE ? OR x.adj_no ILIKE ? OR x.note ILIKE ?)'); const l = `%${qs.q}%`; params.push(l, l, l, l); }
  const base = `FROM stock_adjustments x JOIN product_variants v ON v.id = x.variant_id JOIN products p ON p.id = v.product_id
    LEFT JOIN users u ON u.id = x.user_id WHERE ${where.join(' AND ')}`;
  const [sum] = await query(`SELECT COUNT(*) AS total, COALESCE(SUM(x.value) FILTER (WHERE x.value < 0), 0) AS loss,
      COALESCE(SUM(x.value) FILTER (WHERE x.value > 0), 0) AS gain, COALESCE(SUM(x.qty_change), 0) AS qty ${base}`, params);
  sum.by_reason = await query(`SELECT x.reason, COUNT(*) AS n, SUM(x.value) AS value, SUM(x.qty_change) AS qty ${base} GROUP BY x.reason ORDER BY value`, params);
  const rows = await query(`SELECT x.*, p.name, v.sku, v.size, v.color, u.name AS user_name ${base}
    ORDER BY ${orderBy(qs.sort, { oldest: 'x.id ASC', value_asc: 'x.value ASC', value_desc: 'x.value DESC' }, 'x.id DESC')} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows, summary: sum, total: sum.total, page, limit });
});

// =====================================================================
// Stock count / audit
// =====================================================================
const COUNT_ITEM_SQL = `SELECT ci.*, p.name, v.sku, v.barcode, v.size, v.color, v.stock_qty, v.purchase_price, c.name AS category
  FROM stock_count_items ci JOIN product_variants v ON v.id = ci.variant_id JOIN products p ON p.id = v.product_id
  LEFT JOIN categories c ON c.id = p.category_id`;

/** POST /stock-counts { title?, note?, category_id?, brand_id?, all? } — optionally preload products to count */
export const createCount = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const id = await transaction(async (conn) => {
    const no = await nextNumber(conn, 'stock_count');
    const r = await conn.q('INSERT INTO stock_counts (count_no, title, note, created_by) VALUES (?,?,?,?)', [no, b.title || null, b.note || null, req.user.id]);
    if (b.category_id || b.brand_id || b.all) {
      const where = ['p.is_active', 'v.is_active'];
      const params = [];
      if (b.category_id) { where.push('p.category_id IN (SELECT id FROM categories WHERE id = ? OR parent_id = ?)'); params.push(b.category_id, b.category_id); }
      if (b.brand_id) { where.push('p.brand_id = ?'); params.push(b.brand_id); }
      await conn.query(`INSERT INTO stock_count_items (count_id, variant_id) SELECT ?, v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE ${where.join(' AND ')}`,
        [r.insertId, ...params]);
    }
    return r.insertId;
  });
  await logActivity(req, 'stock', 'count_create', id);
  res.status(201).json({ id });
});

export const listCounts = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const where = ['1=1'];
  const params = [];
  if (req.query.status) { where.push('sc.status = ?'); params.push(req.query.status); }
  const rows = await query(
    `SELECT sc.*, u.name AS created_by_name, au.name AS applied_by_name,
       (SELECT COUNT(*) FROM stock_count_items ci WHERE ci.count_id = sc.id) AS items,
       (SELECT COUNT(*) FROM stock_count_items ci WHERE ci.count_id = sc.id AND ci.counted_qty IS NOT NULL) AS counted
     FROM stock_counts sc LEFT JOIN users u ON u.id = sc.created_by LEFT JOIN users au ON au.id = sc.applied_by
     WHERE ${where.join(' AND ')} ORDER BY sc.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM stock_counts sc WHERE ${where.join(' AND ')}`, params);
  res.json({ data: rows, total, page, limit });
});

async function loadCount(id) {
  const sc = await one('SELECT sc.*, u.name AS created_by_name FROM stock_counts sc LEFT JOIN users u ON u.id = sc.created_by WHERE sc.id = ?', [id]);
  if (!sc) return null;
  sc.items = await query(`${COUNT_ITEM_SQL} WHERE ci.count_id = ? ORDER BY ci.updated_at DESC, ci.id DESC`, [id]);
  for (const it of sc.items) {
    const sys = sc.status === 'applied' ? Number(it.system_qty) : Number(it.stock_qty);
    it.expected_qty = sys;
    it.difference = it.counted_qty === null ? null : money(Number(it.counted_qty) - sys);
  }
  return sc;
}

export const getCount = asyncHandler(async (req, res) => {
  const sc = await loadCount(req.params.id);
  if (!sc) throw notFound('Stock count not found');
  res.json(sc);
});

/**
 * POST /stock-counts/:id/scan { code } — barcode/SKU scan adds 1
 * PUT  /stock-counts/:id/items { variant_id, counted_qty } — set an exact count (null clears)
 */
export const scanCount = asyncHandler(async (req, res) => {
  requireFields(req.body, ['code']);
  const sc = await one('SELECT * FROM stock_counts WHERE id = ?', [req.params.id]);
  if (!sc) throw notFound('Stock count not found');
  if (sc.status !== 'draft') throw badRequest('This count is already finished');
  const code = String(req.body.code).trim();
  const v = await one('SELECT id FROM product_variants WHERE (barcode = ? OR sku = ?) AND is_active LIMIT 1', [code, code]);
  if (!v) throw notFound(`No product with barcode/SKU "${code}"`);
  const step = Number(req.body.qty) || 1;
  await query(
    `INSERT INTO stock_count_items (count_id, variant_id, counted_qty) VALUES (?, ?, ?)
     ON CONFLICT (count_id, variant_id) DO UPDATE SET counted_qty = COALESCE(stock_count_items.counted_qty, 0) + EXCLUDED.counted_qty, updated_at = bp_now()`,
    [sc.id, v.id, step]);
  res.json(await one(`${COUNT_ITEM_SQL} WHERE ci.count_id = ? AND ci.variant_id = ?`, [sc.id, v.id]));
});

export const setCountItem = asyncHandler(async (req, res) => {
  requireFields(req.body, ['variant_id']);
  const sc = await one('SELECT * FROM stock_counts WHERE id = ?', [req.params.id]);
  if (!sc) throw notFound('Stock count not found');
  if (sc.status !== 'draft') throw badRequest('This count is already finished');
  const qty = req.body.counted_qty === null || req.body.counted_qty === '' ? null : Number(req.body.counted_qty);
  if (qty !== null && (Number.isNaN(qty) || qty < 0)) throw badRequest('Counted quantity must be 0 or more');
  if (req.body.remove) {
    await query('DELETE FROM stock_count_items WHERE count_id = ? AND variant_id = ?', [sc.id, req.body.variant_id]);
    return res.json({ message: 'Removed' });
  }
  await query(
    `INSERT INTO stock_count_items (count_id, variant_id, counted_qty) VALUES (?, ?, ?)
     ON CONFLICT (count_id, variant_id) DO UPDATE SET counted_qty = EXCLUDED.counted_qty, updated_at = bp_now()`,
    [sc.id, req.body.variant_id, qty]);
  res.json({ message: 'Saved' });
});

/**
 * POST /stock-counts/:id/apply { missing_as_zero?: boolean }
 * Sets stock to the counted quantity for every counted item, writing a "count"
 * stock adjustment for each difference (so the loss/gain shows in Profit).
 */
export const applyCount = asyncHandler(async (req, res) => {
  const missingZero = !!req.body?.missing_as_zero;
  const out = await transaction(async (conn) => {
    const sc = await conn.one('SELECT * FROM stock_counts WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!sc) throw notFound('Stock count not found');
    if (sc.status !== 'draft') throw badRequest('This count is already finished');
    const items = await conn.q(
      `SELECT ci.*, v.stock_qty FROM stock_count_items ci JOIN product_variants v ON v.id = ci.variant_id WHERE ci.count_id = ? FOR UPDATE OF v`, [sc.id]);
    const adjNo = await nextNumber(conn, 'stock_adjustment');
    let changed = 0;
    for (const it of items) {
      const counted = it.counted_qty === null ? (missingZero ? 0 : null) : Number(it.counted_qty);
      await conn.query('UPDATE stock_count_items SET system_qty = ?, counted_qty = COALESCE(counted_qty, ?) WHERE id = ?', [it.stock_qty, counted, it.id]);
      if (counted === null) continue;
      const diff = money(counted - Number(it.stock_qty));
      if (diff === 0) continue;
      await addAdjustment(conn, { variantId: it.variant_id, qtyChange: diff, reason: 'count', note: `Stock count ${sc.count_no}`, refType: 'stock_count', refId: sc.id, userId: req.user.id, adjNo });
      changed += 1;
    }
    await conn.query("UPDATE stock_counts SET status = 'applied', applied_by = ?, applied_at = bp_now() WHERE id = ?", [req.user.id, sc.id]);
    return { changed, adj_no: changed ? adjNo : null };
  });
  await logActivity(req, 'stock', 'count_apply', req.params.id, out);
  res.json(out);
});

export const cancelCount = asyncHandler(async (req, res) => {
  const r = await query("UPDATE stock_counts SET status = 'cancelled' WHERE id = ? AND status = 'draft'", [req.params.id]);
  if (!r.rowCount) throw badRequest('Only an unfinished count can be cancelled');
  await logActivity(req, 'stock', 'count_cancel', req.params.id);
  res.json({ message: 'Cancelled' });
});
