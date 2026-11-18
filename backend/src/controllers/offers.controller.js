/**
 * Offers & discounts.
 *   percent / amount  — X% or X Tk off each item in scope
 *   bogo              — buy X get Y free (cheapest units in scope are free)
 *   bill_percent / bill_amount — whole bill off when the bill reaches min_amount
 * Scope: all products, or chosen categories (sub-categories included), brands or products.
 * The POS applies running offers automatically; sale lines record which offer was used.
 */
import { query, one } from '../config/db.js';
import { asyncHandler, requireFields, badRequest, notFound, money } from '../utils/http.js';
import { logActivity } from '../utils/activity.js';

const TYPES = ['percent', 'amount', 'bogo', 'bill_percent', 'bill_amount'];
const SCOPES = ['all', 'category', 'brand', 'product'];

const STATUS_SQL = `CASE WHEN NOT o.is_active THEN 'paused'
  WHEN o.starts_on IS NOT NULL AND o.starts_on > bp_today() THEN 'scheduled'
  WHEN o.ends_on IS NOT NULL AND o.ends_on < bp_today() THEN 'expired'
  ELSE 'running' END`;

function clean(b) {
  requireFields(b, ['name', 'type']);
  if (!TYPES.includes(b.type)) throw badRequest('Unknown offer type');
  const scope = b.type.startsWith('bill_') ? 'all' : (b.scope || 'all');
  if (!SCOPES.includes(scope)) throw badRequest('Unknown offer scope');
  const ids = Array.isArray(b.scope_ids) ? b.scope_ids.map(Number).filter((x) => x > 0) : [];
  if (scope !== 'all' && !ids.length) throw badRequest('Choose at least one item for this offer');
  const value = money(b.value);
  const o = {
    name: String(b.name).trim(), type: b.type, value, scope, scope_ids: scope === 'all' ? [] : ids,
    buy_qty: parseInt(b.buy_qty, 10) || 0, get_qty: parseInt(b.get_qty, 10) || 0,
    min_amount: money(b.min_amount), max_discount: b.max_discount === '' || b.max_discount === null || b.max_discount === undefined ? null : money(b.max_discount),
    starts_on: b.starts_on || null, ends_on: b.ends_on || null, is_active: b.is_active !== false, note: b.note || null,
  };
  if (['percent', 'bill_percent'].includes(o.type) && !(value > 0 && value <= 100)) throw badRequest('Percent must be between 1 and 100');
  if (['amount', 'bill_amount'].includes(o.type) && !(value > 0)) throw badRequest('Enter the discount amount');
  if (o.type === 'bogo' && !(o.buy_qty > 0 && o.get_qty > 0)) throw badRequest('Enter how many to buy and how many free');
  if (o.starts_on && o.ends_on && o.ends_on < o.starts_on) throw badRequest('End date is before start date');
  return o;
}

export const list = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT o.*, ${STATUS_SQL} AS status, u.name AS created_by_name,
       (SELECT COUNT(DISTINCT si.sale_id) FROM sale_items si WHERE si.offer_id = o.id) +
       (SELECT COUNT(*) FROM sales s WHERE s.bill_offer_id = o.id) AS used_invoices,
       (SELECT COALESCE(SUM(si.offer_discount),0) FROM sale_items si WHERE si.offer_id = o.id) +
       (SELECT COALESCE(SUM(s.offer_discount),0) FROM sales s WHERE s.bill_offer_id = o.id) AS total_discount
     FROM offers o LEFT JOIN users u ON u.id = o.created_by
     ORDER BY CASE ${STATUS_SQL} WHEN 'running' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, o.id DESC`);
  res.json(rows);
});

/** GET /offers/active — running offers for the POS, category scopes expanded to their sub-categories. */
export const active = asyncHandler(async (req, res) => {
  const rows = await query(`SELECT o.* FROM offers o WHERE ${STATUS_SQL.replace(/o\./g, 'o.')} = 'running' ORDER BY o.id`);
  for (const o of rows) {
    if (o.scope === 'category' && o.scope_ids.length) {
      const subs = await query('SELECT id FROM categories WHERE parent_id IN (?)', [o.scope_ids]);
      o.scope_ids = [...new Set([...o.scope_ids.map(Number), ...subs.map((s) => Number(s.id))])];
    } else o.scope_ids = (o.scope_ids || []).map(Number);
  }
  res.json(rows);
});

export const create = asyncHandler(async (req, res) => {
  const o = clean(req.body);
  const r = await query(
    `INSERT INTO offers (name, type, value, buy_qty, get_qty, scope, scope_ids, min_amount, max_discount, starts_on, ends_on, is_active, note, created_by)
     VALUES (?,?,?,?,?,?,?::bigint[],?,?,?,?,?,?,?)`,
    [o.name, o.type, o.value, o.buy_qty, o.get_qty, o.scope, `{${o.scope_ids.join(',')}}`, o.min_amount, o.max_discount, o.starts_on, o.ends_on, o.is_active, o.note, req.user.id]);
  await logActivity(req, 'offers', 'create', r.insertId, o.name);
  res.status(201).json({ id: r.insertId });
});

export const update = asyncHandler(async (req, res) => {
  const o = clean(req.body);
  const r = await query(
    `UPDATE offers SET name=?, type=?, value=?, buy_qty=?, get_qty=?, scope=?, scope_ids=?::bigint[], min_amount=?, max_discount=?,
       starts_on=?, ends_on=?, is_active=?, note=? WHERE id=?`,
    [o.name, o.type, o.value, o.buy_qty, o.get_qty, o.scope, `{${o.scope_ids.join(',')}}`, o.min_amount, o.max_discount, o.starts_on, o.ends_on, o.is_active, o.note, req.params.id]);
  if (!r.rowCount) throw notFound('Offer not found');
  await logActivity(req, 'offers', 'update', req.params.id, o.name);
  res.json({ message: 'Updated' });
});

export const toggle = asyncHandler(async (req, res) => {
  const o = await one('UPDATE offers SET is_active = NOT is_active WHERE id = ? RETURNING id, is_active', [req.params.id]);
  if (!o) throw notFound('Offer not found');
  await logActivity(req, 'offers', o.is_active ? 'resume' : 'pause', o.id);
  res.json(o);
});

/** Deleting keeps old invoices intact (their lines just lose the offer link). */
export const remove = asyncHandler(async (req, res) => {
  await query('DELETE FROM offers WHERE id = ?', [req.params.id]);
  await logActivity(req, 'offers', 'delete', req.params.id);
  res.json({ message: 'Deleted' });
});
