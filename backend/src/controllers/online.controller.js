/**
 * Online orders (Facebook / Instagram / website / WhatsApp / phone).
 *
 * new → confirmed → packed → shipped → delivered   (or returned / cancelled)
 * - Shipping creates a normal Sale (stock leaves, customer is created/found by phone);
 *   the advance is its payment and the rest is the COD amount (customer due).
 * - Courier settlement: the courier pays COD minus their charge → a Collection for the
 *   COD (clears the due) and an Expense for the courier charge.
 * - Returned (customer refused): a Sales Return puts the goods back and cancels the due.
 */
import { query, one, transaction } from '../config/db.js';
import { asyncHandler, requireFields, badRequest, notFound, paging, money, today } from '../utils/http.js';
import { addRange, orderBy, scopeFilter } from '../utils/filters.js';
import { logActivity } from '../utils/activity.js';
import { nextNumber } from '../utils/numbering.js';
import { recordTxn } from '../services/accounts.service.js';
import { createSaleTx, returnTx } from './sales.controller.js';

const STEPS = ['new', 'confirmed', 'packed'];

async function loadOrder(id) {
  const o = await one(
    `SELECT o.*, u.name AS created_by_name, s.invoice_no, a.name AS advance_account_name, sa.name AS settle_account_name
     FROM online_orders o LEFT JOIN users u ON u.id = o.created_by LEFT JOIN sales s ON s.id = o.sale_id
     LEFT JOIN accounts a ON a.id = o.advance_account_id LEFT JOIN accounts sa ON sa.id = o.settle_account_id WHERE o.id = ?`, [id]);
  if (!o) return null;
  o.items = await query(
    `SELECT i.*, p.name, v.sku, v.size, v.color, bp_stock(v.id, @BRANCH) AS stock_qty FROM online_order_items i
     JOIN product_variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id WHERE i.order_id = ? ORDER BY i.id`, [id]);
  return o;
}

function totals(items, discount, delivery) {
  const subtotal = money(items.reduce((t, i) => t + Number(i.qty) * Number(i.unit_price) - Number(i.discount || 0), 0));
  return { subtotal, total: money(subtotal - money(discount) + money(delivery)) };
}

export const list = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const qs = req.query;
  const where = ['1=1'];
  const params = [];
  scopeFilter(where, params, 'o.branch_id');
  if (qs.from) { where.push('DATE(o.created_at) >= ?'); params.push(qs.from); }
  if (qs.to) { where.push('DATE(o.created_at) <= ?'); params.push(qs.to); }
  if (qs.status === 'open') where.push("o.status IN ('new','confirmed','packed','shipped')");
  else if (qs.status) { where.push('o.status = ?'); params.push(qs.status); }
  if (qs.source) { where.push('o.source = ?'); params.push(qs.source); }
  if (qs.courier) { where.push('o.courier = ?'); params.push(qs.courier); }
  if (qs.cod === 'pending') where.push("o.cod_status = 'pending' AND o.status IN ('shipped','delivered')");
  else if (qs.cod === 'settled') where.push("o.cod_status = 'settled'");
  addRange(where, params, qs, 'amount', 'o.total');
  if (qs.q) { where.push('(o.order_no ILIKE ? OR o.customer_name ILIKE ? OR o.phone ILIKE ? OR o.tracking_no ILIKE ? OR o.address ILIKE ?)'); const l = `%${qs.q}%`; params.push(l, l, l, l, l); }
  const base = `FROM online_orders o WHERE ${where.join(' AND ')}`;
  const [sum] = await query(`SELECT COUNT(*) AS total, COALESCE(SUM(o.total),0) AS amount,
      COUNT(*) FILTER (WHERE o.status IN ('new','confirmed','packed')) AS to_ship,
      COUNT(*) FILTER (WHERE o.status = 'shipped') AS on_the_way,
      COALESCE(SUM(o.cod_amount) FILTER (WHERE o.status IN ('shipped','delivered') AND o.cod_status = 'pending'),0) AS cod_pending ${base}`, params);
  const counts = await query(`SELECT o.status, COUNT(*) AS n FROM online_orders o WHERE ${['1=1', ...(req.branchScope ? ['o.branch_id = ?'] : [])].join(' AND ')} GROUP BY o.status`, req.branchScope ? [req.branchScope] : []);
  const rows = await query(`SELECT o.*, (SELECT COALESCE(SUM(qty),0) FROM online_order_items i WHERE i.order_id = o.id) AS qty ${base}
    ORDER BY ${orderBy(qs.sort, { oldest: 'o.id ASC', amount_desc: 'o.total DESC' }, 'o.id DESC')} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows, summary: sum, counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])), total: sum.total, page, limit });
});

export const get = asyncHandler(async (req, res) => {
  const o = await loadOrder(req.params.id);
  if (!o) throw notFound('Order not found');
  res.json(o);
});

function clean(b) {
  requireFields(b, ['customer_name', 'phone']);
  if (!Array.isArray(b.items) || !b.items.length) throw badRequest('Add the ordered products');
  const items = b.items.map((i) => {
    if (!(Number(i.qty) > 0)) throw badRequest('Quantity must be greater than 0');
    return { variant_id: Number(i.variant_id), qty: Number(i.qty), unit_price: money(i.unit_price), discount: money(i.discount) };
  });
  const t = totals(items, b.discount, b.delivery_charge);
  if (t.total < 0) throw badRequest('Discount is larger than the order');
  const advance = money(b.advance_paid);
  if (advance > t.total) throw badRequest('Advance is more than the order total');
  if (advance > 0 && !b.advance_account_id) throw badRequest('Choose where the advance was received');
  return { items, ...t, advance };
}

/** POST /online-orders — advance (bKash etc.) is noted now and booked when the order ships */
export const create = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const c = clean(b);
  const id = await transaction(async (conn) => {
    const no = await nextNumber(conn, 'online_order');
    const r = await conn.q(
      `INSERT INTO online_orders (order_no, source, customer_id, customer_name, phone, address, area, note, subtotal, discount, delivery_charge, total,
         advance_paid, advance_account_id, advance_ref, courier, created_by, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [no, b.source || 'facebook', b.customer_id || null, b.customer_name.trim(), b.phone.trim(), b.address || null, b.area || null, b.note || null,
        c.subtotal, money(b.discount), money(b.delivery_charge), c.total, c.advance, b.advance_account_id || null, b.advance_ref || null,
        b.courier || null, req.user.id, b.status === 'confirmed' ? 'confirmed' : 'new']);
    await conn.query('INSERT INTO online_order_items (order_id, variant_id, qty, unit_price, discount) VALUES ?', [c.items.map((i) => [r.insertId, i.variant_id, i.qty, i.unit_price, i.discount])]);
    return r.insertId;
  });
  await logActivity(req, 'online_orders', 'create', id);
  res.status(201).json(await loadOrder(id));
});

/** PUT /online-orders/:id — while not shipped */
export const update = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const c = clean(b);
  await transaction(async (conn) => {
    const o = await conn.one('SELECT * FROM online_orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!o) throw notFound('Order not found');
    if (!STEPS.includes(o.status)) throw badRequest('A shipped order cannot be edited');
    await conn.query(
      `UPDATE online_orders SET source=?, customer_name=?, phone=?, address=?, area=?, note=?, subtotal=?, discount=?, delivery_charge=?, total=?,
         advance_paid=?, advance_account_id=?, advance_ref=?, courier=?, updated_at=bp_now() WHERE id=?`,
      [b.source || o.source, b.customer_name.trim(), b.phone.trim(), b.address || null, b.area || null, b.note || null, c.subtotal, money(b.discount),
        money(b.delivery_charge), c.total, c.advance, b.advance_account_id || null, b.advance_ref || null, b.courier || null, o.id]);
    await conn.query('DELETE FROM online_order_items WHERE order_id = ?', [o.id]);
    await conn.query('INSERT INTO online_order_items (order_id, variant_id, qty, unit_price, discount) VALUES ?', [c.items.map((i) => [o.id, i.variant_id, i.qty, i.unit_price, i.discount])]);
  });
  await logActivity(req, 'online_orders', 'update', req.params.id);
  res.json(await loadOrder(req.params.id));
});

/**
 * POST /online-orders/:id/status { status, courier?, tracking_no?, courier_charge? }
 *   confirmed / packed / cancelled — no money or stock effect
 *   shipped   — creates the sale (stock out, advance booked, COD becomes the customer's due)
 *   delivered — marks delivered; COD waits for courier settlement
 *   returned  — customer refused: goods back into stock, due cancelled
 */
export const setStatus = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const to = b.status;
  const result = await transaction(async (conn) => {
    const o = await conn.one('SELECT * FROM online_orders WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!o) throw notFound('Order not found');
    const set = (sql, params) => conn.query(`UPDATE online_orders SET ${sql}, updated_at = bp_now() WHERE id = ?`, [...params, o.id]);

    if (['confirmed', 'packed'].includes(to)) {
      if (!STEPS.includes(o.status)) throw badRequest(`The order is already ${o.status}`);
      await set('status = ?', [to]);
    } else if (to === 'cancelled') {
      if (!STEPS.includes(o.status)) throw badRequest('Only an order that has not been shipped can be cancelled — use Returned instead');
      await set("status = 'cancelled'", []);
    } else if (to === 'shipped') {
      if (!STEPS.includes(o.status)) throw badRequest(`The order is already ${o.status}`);
      // find or create the customer by phone
      let cust = o.customer_id ? await conn.one('SELECT id FROM customers WHERE id = ?', [o.customer_id]) : null;
      if (!cust) cust = await conn.one('SELECT id FROM customers WHERE phone = ? AND NOT is_walk_in ORDER BY id LIMIT 1', [o.phone]);
      if (!cust) cust = await conn.one('INSERT INTO customers (name, phone, address, area) VALUES (?,?,?,?) RETURNING id', [o.customer_name, o.phone, o.address, o.area]);
      const items = await conn.q('SELECT * FROM online_order_items WHERE order_id = ?', [o.id]);
      const cod = money(Number(o.total) - Number(o.advance_paid));
      const sale = await createSaleTx(conn, req, {
        customer_id: cust.id,
        items: items.map((i) => ({ variant_id: i.variant_id, qty: Number(i.qty), unit_price: Number(i.unit_price), discount: Number(i.discount) })),
        invoice_discount: Number(o.discount), delivery_charge: Number(o.delivery_charge),
        payments: Number(o.advance_paid) > 0 ? [{ account_id: o.advance_account_id, amount: Number(o.advance_paid), trx_ref: o.advance_ref }] : [],
        next_payment_date: cod > 0 ? today() : null, note: `Online order ${o.order_no} (${o.source})`,
      });
      await set(`status = 'shipped', shipped_at = bp_now(), sale_id = ?, customer_id = ?, cod_amount = ?, cod_status = ?, courier = COALESCE(?, courier),
                 tracking_no = COALESCE(?, tracking_no), courier_charge = COALESCE(?, courier_charge)`,
        [sale.saleId, cust.id, cod, cod > 0 ? 'pending' : 'none', b.courier || null, b.tracking_no || null, b.courier_charge === undefined || b.courier_charge === '' ? null : money(b.courier_charge)]);
      return { invoice_no: sale.invoiceNo };
    } else if (to === 'delivered') {
      if (o.status !== 'shipped') throw badRequest('Only a shipped order can be delivered');
      await set("status = 'delivered', delivered_at = bp_now()", []);
    } else if (to === 'returned') {
      if (!['shipped', 'delivered'].includes(o.status)) throw badRequest('Only a shipped order can come back');
      if (o.cod_status === 'settled') throw badRequest('COD for this order was already settled — use Sales Return instead');
      const items = await conn.q('SELECT id, qty, returned_qty FROM sale_items WHERE sale_id = ?', [o.sale_id]);
      const ret = await returnTx(conn, req, {
        sale_id: o.sale_id, reason: `Online order ${o.order_no} returned`, refund_amount: Number(o.advance_paid) > 0 && b.refund_advance ? Number(o.advance_paid) : 0,
        account_id: o.advance_account_id, items: items.map((i) => ({ sale_item_id: i.id, qty: Number(i.qty) - Number(i.returned_qty), restock: true })),
      });
      await set("status = 'returned', return_id = ?, cod_status = 'none'", [ret.id]);
      if (money(b.return_charge) > 0) await bookCourierCharge(conn, req, o, money(b.return_charge), b.charge_account_id || o.advance_account_id, 'return charge');
      return { return_no: ret.return_no };
    } else throw badRequest('Unknown status');
    return {};
  });
  await logActivity(req, 'online_orders', to, req.params.id, result);
  res.json({ ...(await loadOrder(req.params.id)), ...result });
});

async function bookCourierCharge(conn, req, o, amount, accountId, what = 'delivery charge') {
  if (!(amount > 0)) return;
  let cat = await conn.one("SELECT id FROM expense_categories WHERE lower(name) = 'courier & delivery'");
  if (!cat) cat = await conn.one("INSERT INTO expense_categories (name) VALUES ('Courier & Delivery') RETURNING id");
  const note = `${o.courier || 'Courier'} ${what} — ${o.order_no}`;
  const e = await conn.q('INSERT INTO expenses (category_id, account_id, amount, expense_date, note, user_id) VALUES (?,?,?,?,?,?)', [cat.id, accountId, amount, today(), note, req.user.id]);
  await recordTxn(conn, { accountId, direction: 'out', amount, refType: 'expense', refId: e.insertId, note, date: today(), userId: req.user.id });
}

/**
 * POST /online-orders/settle { account_id, orders: [{ id, courier_charge? }], date? }
 * The courier paid us: each order's COD is collected (clears the due) and the courier's
 * charge is booked as an expense, so the account gets COD − charge.
 */
export const settle = asyncHandler(async (req, res) => {
  const b = req.body || {};
  requireFields(b, ['account_id']);
  if (!Array.isArray(b.orders) || !b.orders.length) throw badRequest('Choose the orders the courier paid for');
  const out = await transaction(async (conn) => {
    let cod = 0;
    let charges = 0;
    for (const x of b.orders) {
      const o = await conn.one('SELECT * FROM online_orders WHERE id = ? FOR UPDATE', [x.id]);
      if (!o) throw notFound('Order not found');
      if (o.cod_status !== 'pending' || !['shipped', 'delivered'].includes(o.status)) throw badRequest(`${o.order_no} has no COD waiting`);
      const amount = Number(o.cod_amount);
      const charge = x.courier_charge === undefined || x.courier_charge === '' ? Number(o.courier_charge) : money(x.courier_charge);
      const no = await nextNumber(conn, 'collection');
      const col = await conn.q('INSERT INTO customer_collections (receipt_no, customer_id, sale_id, account_id, amount, collection_date, trx_ref, note, user_id) VALUES (?,?,?,?,?,?,?,?,?)',
        [no, o.customer_id, o.sale_id, b.account_id, amount, b.date || today(), o.tracking_no, `COD ${o.order_no} via ${o.courier || 'courier'}`, req.user.id]);
      await recordTxn(conn, { accountId: b.account_id, direction: 'in', amount, refType: 'collection', refId: col.insertId, note: `COD ${o.order_no}`, date: b.date || today(), userId: req.user.id });
      await conn.query('UPDATE sales SET due_amount = GREATEST(due_amount - ?, 0) WHERE id = ?', [amount, o.sale_id]);
      await bookCourierCharge(conn, req, o, charge, b.account_id);
      await conn.query("UPDATE online_orders SET cod_status = 'settled', settled_amount = ?, settled_at = bp_now(), settle_account_id = ?, courier_charge = ?, status = CASE WHEN status = 'shipped' THEN 'delivered' ELSE status END, delivered_at = COALESCE(delivered_at, bp_now()), updated_at = bp_now() WHERE id = ?",
        [money(amount - charge), b.account_id, charge, o.id]);
      cod += amount;
      charges += charge;
    }
    return { orders: b.orders.length, cod: money(cod), courier_charges: money(charges), received: money(cod - charges) };
  });
  await logActivity(req, 'online_orders', 'settle', null, out);
  res.json(out);
});

/** GET /online-orders/customer?phone= — earlier orders & returns of this number (spot fake orders) */
export const customerHistory = asyncHandler(async (req, res) => {
  const phone = String(req.query.phone || '').trim();
  if (phone.length < 6) return res.json(null);
  const [h] = await query(`SELECT COUNT(*) AS orders, COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
      COUNT(*) FILTER (WHERE status = 'returned') AS returned, COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
    FROM online_orders WHERE phone = ?`, [phone]);
  const cust = await one('SELECT c.id, c.name, c.address, c.area, ROUND(b.balance,2) AS balance FROM customers c JOIN v_customer_balance b ON b.customer_id = c.id WHERE c.phone = ? AND NOT c.is_walk_in ORDER BY c.id LIMIT 1', [phone]);
  res.json({ ...h, customer: cust });
});
