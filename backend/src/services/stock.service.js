const { badRequest } = require('../utils/http');
const settings = require('./settings.service');

/**
 * Change a variant's stock by delta (negative = out). Locks the row so two
 * tills can't oversell the last item.
 */
async function adjustStock(conn, variantId, delta, { allowNegative } = {}) {
  const v = await conn.one(
    `SELECT v.id, v.stock_qty, v.sku, p.name FROM product_variants v JOIN products p ON p.id = v.product_id
     WHERE v.id = ? FOR UPDATE`,
    [variantId]
  );
  if (!v) throw badRequest(`Product variant #${variantId} not found`);
  if (allowNegative === undefined) allowNegative = (await settings.get('allow_negative_stock')) === '1';
  const next = Number(v.stock_qty) + Number(delta);
  if (next < 0 && !allowNegative) {
    throw badRequest(`Not enough stock for ${v.name} (${v.sku}). Available: ${v.stock_qty}`);
  }
  await conn.query('UPDATE product_variants SET stock_qty = ? WHERE id = ?', [next, variantId]);
  return next;
}

module.exports = { adjustStock };
