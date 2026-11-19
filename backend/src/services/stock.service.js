import { badRequest } from '../utils/http.js';
import * as settings from './settings.service.js';

/**
 * Change a variant's stock by delta (negative = out) in the current branch
 * (bikripro.branch_id of the transaction, else the main branch). The variant's
 * total stock_qty changes by the same amount. Rows are locked so two tills
 * can't oversell the last item.
 */
async function adjustStock(conn, variantId, delta, { allowNegative, branchId = null } = {}) {
  const v = await conn.one(
    `SELECT v.id, v.stock_qty, v.sku, p.name FROM product_variants v JOIN products p ON p.id = v.product_id
     WHERE v.id = ? FOR UPDATE OF v`,
    [variantId]
  );
  if (!v) throw badRequest(`Product variant #${variantId} not found`);
  const b = branchId || (await conn.one('SELECT bp_branch() AS id')).id;
  await conn.query('INSERT INTO branch_stock (branch_id, variant_id, qty) VALUES (?, ?, 0) ON CONFLICT (branch_id, variant_id) DO NOTHING', [b, variantId]);
  const bs = await conn.one('SELECT qty FROM branch_stock WHERE branch_id = ? AND variant_id = ? FOR UPDATE', [b, variantId]);
  if (allowNegative === undefined) allowNegative = (await settings.get('allow_negative_stock')) === '1';
  const next = Number(bs.qty) + Number(delta);
  if (next < 0 && Number(delta) < 0 && !allowNegative) {
    throw badRequest(`Not enough stock for ${v.name} (${v.sku}). Available here: ${bs.qty}`);
  }
  await conn.query('UPDATE branch_stock SET qty = ? WHERE branch_id = ? AND variant_id = ?', [next, b, variantId]);
  await conn.query('UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?', [delta, variantId]);
  return next;
}

/** Move stock in or out of one branch only (transfers); the total does not change. */
async function moveBranchStock(conn, branchId, variantId, delta, { allowNegative = false, label = '' } = {}) {
  await conn.query('INSERT INTO branch_stock (branch_id, variant_id, qty) VALUES (?, ?, 0) ON CONFLICT (branch_id, variant_id) DO NOTHING', [branchId, variantId]);
  const bs = await conn.one('SELECT qty FROM branch_stock WHERE branch_id = ? AND variant_id = ? FOR UPDATE', [branchId, variantId]);
  const next = Number(bs.qty) + Number(delta);
  if (next < 0 && !allowNegative) throw badRequest(`Not enough stock to send${label ? ` for ${label}` : ''}. Available: ${bs.qty}`);
  await conn.query('UPDATE branch_stock SET qty = ? WHERE branch_id = ? AND variant_id = ?', [next, branchId, variantId]);
  return next;
}

export { adjustStock, moveBranchStock };
