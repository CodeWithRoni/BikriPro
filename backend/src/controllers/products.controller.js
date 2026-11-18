import { query, one, transaction } from '../config/db.js';
import { asyncHandler, requireFields, badRequest, notFound, paging } from '../utils/http.js';
import { logActivity } from '../utils/activity.js';
import { saveProductImage, deleteUpload, normaliseProductImage } from '../services/image.service.js';

// ---------- Categories & brands ----------
const simpleCrud = (table, module) => ({
  list: asyncHandler(async (req, res) => {
    res.json(await query(`SELECT t.*, (SELECT COUNT(*) FROM products p WHERE p.${table === 'categories' ? 'category_id' : 'brand_id'} = t.id) AS product_count FROM ${table} t ORDER BY t.name`));
  }),
  create: asyncHandler(async (req, res) => {
    requireFields(req.body, ['name']);
    const r = await query(`INSERT INTO ${table} (name) VALUES (?)`, [req.body.name.trim()]);
    await logActivity(req, module, 'create', r.insertId, req.body.name);
    res.status(201).json({ id: r.insertId, name: req.body.name.trim() });
  }),
  update: asyncHandler(async (req, res) => {
    requireFields(req.body, ['name']);
    await query(`UPDATE ${table} SET name=? WHERE id=?`, [req.body.name.trim(), req.params.id]);
    await logActivity(req, module, 'update', req.params.id, req.body.name);
    res.json({ message: 'Updated' });
  }),
  remove: asyncHandler(async (req, res) => {
    await query(`DELETE FROM ${table} WHERE id=?`, [req.params.id]);
    await logActivity(req, module, 'delete', req.params.id);
    res.json({ message: 'Deleted' });
  }),
});
export const categories = simpleCrud('categories', 'categories');
export const brands = simpleCrud('brands', 'brands');

// ---------- Products ----------
const VARIANT_COLS = 'v.id AS variant_id, v.sku, v.barcode, v.size, v.color, v.purchase_price, v.retail_price, v.wholesale_price, v.stock_qty, v.low_stock_alert';
const PRODUCT_COLS = 'p.id AS product_id, p.name, p.image_path, p.is_favorite, p.unit, c.name AS category, b.name AS brand, p.category_id, p.brand_id';

/**
 * GET /products — variant-level list (one row per sellable SKU).
 * Filters: q (name/sku/barcode), category_id, brand_id, low_stock=1, active
 */
export const list = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query, 50);
  const where = ['p.is_active = true', 'v.is_active = true'];
  const params = [];
  if (req.query.q) {
    where.push('(p.name ILIKE ? OR v.sku ILIKE ? OR v.barcode = ? OR b.name ILIKE ?)');
    const like = `%${req.query.q}%`;
    params.push(like, like, req.query.q, like);
  }
  if (req.query.category_id) { where.push('p.category_id = ?'); params.push(req.query.category_id); }
  if (req.query.brand_id) { where.push('p.brand_id = ?'); params.push(req.query.brand_id); }
  if (req.query.low_stock === '1') where.push('v.stock_qty <= v.low_stock_alert');
  const base = `FROM product_variants v JOIN products p ON p.id = v.product_id
    LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
    WHERE ${where.join(' AND ')}`;
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${base}`, params);
  const rows = await query(`SELECT ${PRODUCT_COLS}, ${VARIANT_COLS} ${base} ORDER BY p.name, v.size, v.color LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows, total, page, limit });
});

/** GET /products/lookup/:code — exact barcode or SKU scan */
export const lookup = asyncHandler(async (req, res) => {
  const row = await one(
    `SELECT ${PRODUCT_COLS}, ${VARIANT_COLS} FROM product_variants v JOIN products p ON p.id = v.product_id
     LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
     WHERE (v.barcode = ? OR v.sku = ?) AND v.is_active = true AND p.is_active = true LIMIT 1`,
    [req.params.code, req.params.code]
  );
  if (!row) throw notFound('No product with this barcode/SKU');
  res.json(row);
});

/** GET /products/pos-grid — Recent, Best Selling and Favourite products for the POS */
export const posGrid = asyncHandler(async (req, res) => {
  const join = `FROM product_variants v JOIN products p ON p.id = v.product_id
    LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id`;
  const active = 'p.is_active = true AND v.is_active = true';
  const [recent, best, favorite] = await Promise.all([
    query(`SELECT ${PRODUCT_COLS}, ${VARIANT_COLS} ${join}
      JOIN (SELECT si.variant_id, MAX(s.sale_date) AS last_sold FROM sale_items si JOIN sales s ON s.id = si.sale_id
            GROUP BY si.variant_id ORDER BY last_sold DESC LIMIT 24) r ON r.variant_id = v.id
      WHERE ${active} ORDER BY r.last_sold DESC`),
    query(`SELECT ${PRODUCT_COLS}, ${VARIANT_COLS}, bs.sold ${join}
      JOIN (SELECT si.variant_id, SUM(si.qty - si.returned_qty) AS sold FROM sale_items si JOIN sales s ON s.id = si.sale_id
            WHERE s.sale_date >= (bp_today() - 90) GROUP BY si.variant_id ORDER BY sold DESC LIMIT 24) bs ON bs.variant_id = v.id
      WHERE ${active} ORDER BY bs.sold DESC`),
    query(`SELECT ${PRODUCT_COLS}, ${VARIANT_COLS} ${join} WHERE ${active} AND p.is_favorite = true ORDER BY p.name LIMIT 48`),
  ]);
  // New shop with no sales yet: show newest products as "recent"
  const recentOut = recent.length ? recent
    : await query(`SELECT ${PRODUCT_COLS}, ${VARIANT_COLS} ${join} WHERE ${active} ORDER BY v.id DESC LIMIT 24`);
  res.json({ recent: recentOut, best_selling: best, favorite });
});

export const get = asyncHandler(async (req, res) => {
  const p = await one(`SELECT p.*, c.name AS category, b.name AS brand FROM products p
    LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id WHERE p.id = ?`, [req.params.id]);
  if (!p) throw notFound('Product not found');
  p.variants = await query('SELECT * FROM product_variants WHERE product_id = ? AND is_active = true ORDER BY id', [p.id]);
  res.json(p);
});

/** Accepts JSON or multipart (field "data" = JSON string, file field "image"). */
function parseBody(req) {
  if (req.body && typeof req.body.data === 'string') {
    try { return JSON.parse(req.body.data); } catch { throw badRequest('Invalid product data'); }
  }
  return req.body || {};
}

async function genSku(conn, name) {
  const base = String(name).replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'ITEM';
  const [{ n }] = await conn.q('SELECT COUNT(*) + 1 AS n FROM product_variants');
  let sku = `${base}-${String(n).padStart(5, '0')}`;
  while (await conn.one('SELECT id FROM product_variants WHERE sku = ?', [sku])) sku = `${base}-${Math.floor(Math.random() * 1e6)}`;
  return sku;
}

async function upsertVariants(conn, productId, productName, variants, userId) {
  const keepIds = [];
  for (const v of variants) {
    const vals = {
      size: v.size || null, color: v.color || null,
      purchase_price: Number(v.purchase_price) || 0,
      retail_price: v.retail_price === '' || v.retail_price === null || v.retail_price === undefined ? null : Number(v.retail_price),
      wholesale_price: v.wholesale_price === '' || v.wholesale_price === null || v.wholesale_price === undefined ? null : Number(v.wholesale_price),
      low_stock_alert: v.low_stock_alert === undefined ? 3 : Number(v.low_stock_alert),
      barcode: v.barcode ? String(v.barcode).trim() : null,
    };
    if (v.id) {
      const old = await conn.one('SELECT * FROM product_variants WHERE id = ? AND product_id = ?', [v.id, productId]);
      if (!old) throw badRequest(`Variant ${v.id} does not belong to this product`);
      await conn.query(
        `UPDATE product_variants SET sku=?, barcode=?, size=?, color=?, purchase_price=?, retail_price=?, wholesale_price=?, low_stock_alert=? WHERE id=?`,
        [v.sku || old.sku, vals.barcode, vals.size, vals.color, vals.purchase_price, vals.retail_price, vals.wholesale_price, vals.low_stock_alert, v.id]
      );
      if (old.purchase_price !== vals.purchase_price || old.retail_price !== vals.retail_price || old.wholesale_price !== vals.wholesale_price) {
        await conn.query(
          `INSERT INTO price_history (variant_id, old_purchase_price, new_purchase_price, old_retail_price, new_retail_price, old_wholesale_price, new_wholesale_price, user_id)
           VALUES (?,?,?,?,?,?,?,?)`,
          [v.id, old.purchase_price, vals.purchase_price, old.retail_price, vals.retail_price, old.wholesale_price, vals.wholesale_price, userId]
        );
      }
      keepIds.push(Number(v.id));
    } else {
      const sku = v.sku ? String(v.sku).trim() : await genSku(conn, productName);
      const r = await conn.q(
        `INSERT INTO product_variants (product_id, sku, barcode, size, color, purchase_price, retail_price, wholesale_price, stock_qty, low_stock_alert)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [productId, sku, vals.barcode || sku, vals.size, vals.color, vals.purchase_price, vals.retail_price, vals.wholesale_price,
          Number(v.opening_stock) || 0, vals.low_stock_alert]
      );
      keepIds.push(r.insertId);
    }
  }
  return keepIds;
}

export const create = asyncHandler(async (req, res) => {
  const body = parseBody(req);
  requireFields(body, ['name']);
  const variants = Array.isArray(body.variants) && body.variants.length ? body.variants : [{}];
  const imagePath = req.file ? await saveProductImage(req.file.buffer) : null;
  const id = await transaction(async (conn) => {
    const r = await conn.q(
      'INSERT INTO products (name, category_id, brand_id, description, unit, image_path, is_favorite) VALUES (?,?,?,?,?,?,?)',
      [body.name.trim(), body.category_id || null, body.brand_id || null, body.description || null, body.unit || 'pcs', imagePath, body.is_favorite ? 1 : 0]
    );
    await upsertVariants(conn, r.insertId, body.name, variants, req.user.id);
    return r.insertId;
  }).catch(async (e) => { await deleteUpload(imagePath); throw e; });
  await logActivity(req, 'products', 'create', id, { name: body.name, variants: variants.length });
  res.status(201).json({ id, image_path: imagePath });
});

export const update = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const body = parseBody(req);
  const existing = await one('SELECT * FROM products WHERE id = ?', [id]);
  if (!existing) throw notFound('Product not found');
  let imagePath = existing.image_path;
  if (req.file) imagePath = await saveProductImage(req.file.buffer);
  else if (body.remove_image) imagePath = null;

  await transaction(async (conn) => {
    await conn.query(
      'UPDATE products SET name=?, category_id=?, brand_id=?, description=?, unit=?, image_path=?, is_favorite=? WHERE id=?',
      [body.name ?? existing.name, body.category_id ?? existing.category_id, body.brand_id ?? existing.brand_id,
        body.description ?? existing.description, body.unit ?? existing.unit, imagePath,
        body.is_favorite === undefined ? existing.is_favorite : (body.is_favorite ? 1 : 0), id]
    );
    if (Array.isArray(body.variants)) {
      const keep = await upsertVariants(conn, id, body.name ?? existing.name, body.variants, req.user.id);
      // Variants removed in the form are deactivated (history keeps referencing them)
      await conn.query(`UPDATE product_variants SET is_active = false WHERE product_id = ? ${keep.length ? 'AND id NOT IN (?)' : ''}`, keep.length ? [id, keep] : [id]);
    }
  });
  if (imagePath !== existing.image_path) await deleteUpload(existing.image_path);
  await logActivity(req, 'products', 'update', id, { name: body.name ?? existing.name });
  res.json({ message: 'Product updated', image_path: imagePath });
});

export const toggleFavorite = asyncHandler(async (req, res) => {
  await query('UPDATE products SET is_favorite = NOT is_favorite WHERE id = ?', [req.params.id]);
  const p = await one('SELECT is_favorite FROM products WHERE id = ?', [req.params.id]);
  res.json({ is_favorite: p?.is_favorite });
});

export const remove = asyncHandler(async (req, res) => {
  await query('UPDATE products SET is_active = false WHERE id = ?', [req.params.id]);
  await logActivity(req, 'products', 'delete', req.params.id);
  res.json({ message: 'Product archived' });
});

/** POST /products/image-preview — returns the processed 500x500 image (for testing the engine). */
export const imagePreview = asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('No image uploaded');
  const out = await normaliseProductImage(req.file.buffer);
  if (!out) throw badRequest('Image preview runs in the app on this server');
  res.set('Content-Type', 'image/webp').send(out);
});
