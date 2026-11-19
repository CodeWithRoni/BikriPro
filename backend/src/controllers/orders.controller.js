/**
 * Purchase orders to suppliers + re-order suggestions.
 * A PO is a list of what to buy; receiving it (fully or in parts) creates a normal
 * Purchase, so stock, cost price, supplier balance and payments all work as usual.
 */
import { query, one, transaction } from '../config/db.js';
import { asyncHandler, requireFields, badRequest, notFound, paging, money } from '../utils/http.js';
import { addRange, orderBy, scopeFilter } from '../utils/filters.js';
import { logActivity } from '../utils/activity.js';
import { nextNumber } from '../utils/numbering.js';
import { createPurchaseTx } from './purchases.controller.js';

async function loadPo(id) {
  const po = await one(
    `SELECT po.*, s.name AS supplier_name, s.company AS supplier_company, s.phone AS supplier_phone, u.name AS created_by_name
     FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id LEFT JOIN users u ON u.id = po.created_by WHERE po.id = ?`, [id]);
  if (!po) return null;
  po.items = await query(
    `SELECT i.*, p.name, v.sku, v.barcode, v.size, v.color, v.stock_qty, v.purchase_price, v.retail_price
     FROM purchase_order_items i JOIN product_variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id
     WHERE i.po_id = ? ORDER BY i.id`, [id]);
  po.purchases = await query('SELECT id, invoice_no, purchase_date, grand_total FROM purchases WHERE po_id = ? ORDER BY id', [id]);
  return po;
}

function cleanItems(items) {
  if (!Array.isArray(items) || !items.length) throw badRequest('Add at least one product');
  const map = new Map();
  for (const it of items) {
    const qty = Number(it.qty);
    if (!(qty > 0)) throw badRequest('Quantity must be greater than 0');
    const prev = map.get(Number(it.variant_id));
    map.set(Number(it.variant_id), { variant_id: Number(it.variant_id), qty: money((prev?.qty || 0) + qty), unit_cost: money(it.unit_cost) });
  }
  return [...map.values()];
}

export const list = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const qs = req.query;
  const where = ['1=1'];
  const params = [];
  scopeFilter(where, params, 'po.branch_id');
  if (qs.from) { where.push('po.order_date >= ?'); params.push(qs.from); }
  if (qs.to) { where.push('po.order_date <= ?'); params.push(qs.to); }
  if (qs.supplier_id) { where.push('po.supplier_id = ?'); params.push(qs.supplier_id); }
  if (qs.status === 'open') where.push("po.status IN ('draft','sent','partial')");
  else if (qs.status) { where.push('po.status = ?'); params.push(qs.status); }
  if (qs.late === '1') where.push("po.status IN ('sent','partial') AND po.expected_date < bp_today()");
  addRange(where, params, qs, 'amount', 'po.total');
  if (qs.q) { where.push('(po.po_no ILIKE ? OR s.name ILIKE ? OR po.note ILIKE ?)'); const l = `%${qs.q}%`; params.push(l, l, l); }
  const base = `FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE ${where.join(' AND ')}`;
  const [sum] = await query(`SELECT COUNT(*) AS total, COALESCE(SUM(po.total),0) AS amount,
    COUNT(*) FILTER (WHERE po.status IN ('draft','sent','partial')) AS open ${base}`, params);
  const rows = await query(
    `SELECT po.*, s.name AS supplier_name,
       (SELECT COUNT(*) FROM purchase_order_items i WHERE i.po_id = po.id) AS items,
       (SELECT COALESCE(SUM(i.qty),0) FROM purchase_order_items i WHERE i.po_id = po.id) AS qty,
       (SELECT COALESCE(SUM(i.received_qty),0) FROM purchase_order_items i WHERE i.po_id = po.id) AS received
     ${base} ORDER BY ${orderBy(qs.sort, { oldest: 'po.id ASC', amount_desc: 'po.total DESC', expected: 'po.expected_date ASC NULLS LAST' }, 'po.id DESC')} LIMIT ? OFFSET ?`,
    [...params, limit, offset]);
  res.json({ data: rows, summary: sum, total: sum.total, page, limit });
});

export const get = asyncHandler(async (req, res) => {
  const po = await loadPo(req.params.id);
  if (!po) throw notFound('Purchase order not found');
  res.json(po);
});

/** POST /purchase-orders { supplier_id, items: [{variant_id, qty, unit_cost}], expected_date?, note?, status?: 'draft'|'sent' } */
export const create = asyncHandler(async (req, res) => {
  const b = req.body || {};
  requireFields(b, ['supplier_id']);
  const items = cleanItems(b.items);
  const id = await transaction(async (conn) => {
    if (!(await conn.one('SELECT id FROM suppliers WHERE id = ? AND is_active', [b.supplier_id]))) throw badRequest('Supplier not found');
    const no = await nextNumber(conn, 'purchase_order');
    const total = money(items.reduce((t, i) => t + i.qty * i.unit_cost, 0));
    const r = await conn.q('INSERT INTO purchase_orders (po_no, supplier_id, status, order_date, expected_date, note, total, created_by) VALUES (?,?,?,COALESCE(?::date, bp_today()),?,?,?,?)',
      [no, b.supplier_id, b.status === 'sent' ? 'sent' : 'draft', b.order_date || null, b.expected_date || null, b.note || null, total, req.user.id]);
    await conn.query('INSERT INTO purchase_order_items (po_id, variant_id, qty, unit_cost) VALUES ?', [items.map((i) => [r.insertId, i.variant_id, i.qty, i.unit_cost])]);
    return r.insertId;
  });
  await logActivity(req, 'purchase_orders', 'create', id);
  res.status(201).json(await loadPo(id));
});

/** PUT /purchase-orders/:id — only while nothing has been received */
export const update = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const items = cleanItems(b.items);
  await transaction(async (conn) => {
    const po = await conn.one('SELECT * FROM purchase_orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!po) throw notFound('Purchase order not found');
    if (!['draft', 'sent'].includes(po.status)) throw badRequest('Only an order that has not been received can be edited');
    const total = money(items.reduce((t, i) => t + i.qty * i.unit_cost, 0));
    await conn.query('UPDATE purchase_orders SET supplier_id = ?, expected_date = ?, note = ?, total = ?, updated_at = bp_now() WHERE id = ?',
      [b.supplier_id || po.supplier_id, b.expected_date || null, b.note || null, total, po.id]);
    await conn.query('DELETE FROM purchase_order_items WHERE po_id = ?', [po.id]);
    await conn.query('INSERT INTO purchase_order_items (po_id, variant_id, qty, unit_cost) VALUES ?', [items.map((i) => [po.id, i.variant_id, i.qty, i.unit_cost])]);
  });
  await logActivity(req, 'purchase_orders', 'update', req.params.id);
  res.json(await loadPo(req.params.id));
});

/** POST /purchase-orders/:id/status { status: 'sent'|'cancelled'|'draft' } */
export const setStatus = asyncHandler(async (req, res) => {
  const to = req.body?.status;
  if (!['sent', 'cancelled', 'draft'].includes(to)) throw badRequest('Invalid status');
  const po = await one('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id]);
  if (!po) throw notFound('Purchase order not found');
  if (po.status === 'received' || (po.status === 'cancelled' && to !== 'draft')) throw badRequest(`This order is already ${po.status}`);
  if (po.status === 'partial' && to !== 'cancelled') throw badRequest('Part of this order has been received; you can only cancel the rest');
  await query('UPDATE purchase_orders SET status = ?, updated_at = bp_now() WHERE id = ?', [to, po.id]);
  await logActivity(req, 'purchase_orders', to, po.id);
  res.json(await loadPo(po.id));
});

/**
 * POST /purchase-orders/:id/receive
 * { items: [{ variant_id, qty, unit_cost?, retail_price? }], supplier_ref?, purchase_date?, payments?, discount?, other_cost?, note? }
 * Creates a Purchase for what arrived; the order becomes "partial" or "received".
 */
export const receive = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const result = await transaction(async (conn) => {
    const po = await conn.one('SELECT * FROM purchase_orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!po) throw notFound('Purchase order not found');
    if (['received', 'cancelled'].includes(po.status)) throw badRequest(`This order is already ${po.status}`);
    const lines = await conn.q('SELECT * FROM purchase_order_items WHERE po_id = ? FOR UPDATE', [po.id]);
    const items = [];
    for (const it of b.items || []) {
      const qty = Number(it.qty);
      if (!(qty > 0)) continue;
      const line = lines.find((l) => Number(l.variant_id) === Number(it.variant_id));
      if (!line) throw badRequest('A received item is not on this order');
      items.push({ variant_id: line.variant_id, qty, unit_cost: it.unit_cost ?? line.unit_cost, retail_price: it.retail_price, wholesale_price: it.wholesale_price });
      await conn.query('UPDATE purchase_order_items SET received_qty = received_qty + ? WHERE id = ?', [qty, line.id]);
    }
    if (!items.length) throw badRequest('Enter the quantity that arrived');
    const purchase = await createPurchaseTx(conn, req, { ...b, supplier_id: po.supplier_id, items, po_id: po.id, note: b.note || `Received against ${po.po_no}` });
    const left = await conn.one('SELECT COALESCE(SUM(GREATEST(qty - received_qty, 0)),0) AS left FROM purchase_order_items WHERE po_id = ?', [po.id]);
    await conn.query('UPDATE purchase_orders SET status = ?, updated_at = bp_now() WHERE id = ?', [Number(left.left) > 0 ? 'partial' : 'received', po.id]);
    return { purchase, po_no: po.po_no };
  });
  await logActivity(req, 'purchase_orders', 'receive', req.params.id, result);
  res.status(201).json({ ...result, order: await loadPo(req.params.id) });
});

export const remove = asyncHandler(async (req, res) => {
  const po = await one('SELECT status FROM purchase_orders WHERE id = ?', [req.params.id]);
  if (!po) throw notFound('Purchase order not found');
  if (!['draft', 'cancelled'].includes(po.status)) throw badRequest('Only a draft or cancelled order can be deleted');
  await query('DELETE FROM purchase_orders WHERE id = ?', [req.params.id]);
  await logActivity(req, 'purchase_orders', 'delete', req.params.id);
  res.json({ message: 'Deleted' });
});

/**
 * GET /purchase-orders/suggestions?days=30&cover=30&supplier_id=&category_id=
 * What to re-order: sales speed over the last `days`, enough stock for `cover` days
 * plus the low-stock alert level, minus stock on hand and stock already on order.
 */
export const suggestions = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 365);
  const cover = Math.min(Math.max(parseInt(req.query.cover, 10) || 30, 1), 180);
  const where = ['p.is_active', 'v.is_active'];
  const params = [days, days];
  if (req.query.category_id) { where.push('p.category_id IN (SELECT id FROM categories WHERE id = ? OR parent_id = ?)'); params.push(req.query.category_id, req.query.category_id); }
  const rows = await query(
    `WITH sold AS (
        SELECT si.variant_id, SUM(si.qty - si.returned_qty) AS qty
        FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE s.status <> 'cancelled' AND s.sale_date >= bp_now() - make_interval(days => ?) GROUP BY si.variant_id),
      ordered AS (
        SELECT i.variant_id, SUM(GREATEST(i.qty - i.received_qty, 0)) AS qty FROM purchase_order_items i
        JOIN purchase_orders po ON po.id = i.po_id WHERE po.status IN ('draft','sent','partial') GROUP BY i.variant_id),
      last_buy AS (
        SELECT DISTINCT ON (pi.variant_id) pi.variant_id, pu.supplier_id, pi.unit_cost
        FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id ORDER BY pi.variant_id, pu.id DESC)
     SELECT v.id AS variant_id, p.name, v.sku, v.size, v.color, v.stock_qty, v.low_stock_alert, v.purchase_price,
            c.name AS category, COALESCE(sold.qty, 0) AS sold, ROUND(COALESCE(sold.qty, 0)::numeric / ?, 2) AS per_day,
            COALESCE(ordered.qty, 0) AS on_order, lb.supplier_id, sp.name AS supplier_name, COALESCE(lb.unit_cost, v.purchase_price) AS last_cost
     FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN sold ON sold.variant_id = v.id LEFT JOIN ordered ON ordered.variant_id = v.id
     LEFT JOIN last_buy lb ON lb.variant_id = v.id LEFT JOIN suppliers sp ON sp.id = lb.supplier_id
     WHERE ${where.join(' AND ')}`, params);
  const out = [];
  for (const r of rows) {
    const perDay = Number(r.per_day);
    const need = Math.ceil(perDay * cover + Number(r.low_stock_alert) - Number(r.stock_qty) - Number(r.on_order));
    const low = Number(r.stock_qty) <= Number(r.low_stock_alert);
    if (need <= 0 && !(low && Number(r.on_order) === 0 && perDay === 0 && Number(r.stock_qty) <= 0)) continue;
    if (req.query.supplier_id && String(r.supplier_id) !== String(req.query.supplier_id)) continue;
    out.push({ ...r, days_left: perDay > 0 ? Math.floor(Number(r.stock_qty) / perDay) : null, suggested_qty: Math.max(need, 1) });
  }
  out.sort((a, b) => (a.days_left ?? 9999) - (b.days_left ?? 9999) || b.per_day - a.per_day);
  res.json({ days, cover, data: out });
});
