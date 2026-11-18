const { query, one, transaction } = require('../config/db');
const { asyncHandler, requireFields, badRequest, notFound, paging, money, today } = require('../utils/http');
const { logActivity } = require('../utils/activity');
const { nextNumber } = require('../utils/numbering');
const { adjustStock } = require('../services/stock.service');
const { recordTxn, methodFor } = require('../services/accounts.service');
const loyalty = require('../services/loyalty.service');
const settings = require('../services/settings.service');
const { sendSaleSms } = require('../services/sms.service');

/**
 * POST /sales — complete a POS invoice.
 * body: {
 *   customer_id?, items: [{ variant_id, qty, unit_price?, discount? }],
 *   invoice_discount?, round_off?, points_redeem?,
 *   payments: [{ account_id, amount, trx_ref? }],
 *   next_payment_date?  (required when paid < grand total),
 *   note?, send_sms? (default true), hold_id? (removes the held cart)
 * }
 */
exports.create = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!Array.isArray(b.items) || !b.items.length) throw badRequest('Cart is empty');
  const cfg = await loyalty.getConfig();
  const s = await settings.getAll();
  const vatPercent = Number(s.vat_percent) || 0;

  const result = await transaction(async (conn) => {
    // ---- customer ----
    let customer = null;
    if (b.customer_id) {
      customer = await conn.one('SELECT * FROM customers WHERE id = ? AND is_active = true FOR UPDATE', [b.customer_id]);
      if (!customer) throw badRequest('Customer not found');
    }

    // ---- items ----
    const lines = [];
    for (const it of b.items) {
      const qty = Number(it.qty);
      if (!(qty > 0)) throw badRequest('Quantity must be greater than 0');
      const v = await conn.one(
        `SELECT v.*, p.name AS product_name FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`,
        [it.variant_id]);
      if (!v) throw badRequest(`Product variant #${it.variant_id} not found`);
      const hasCustomPrice = it.unit_price !== undefined && it.unit_price !== null && it.unit_price !== '';
      if (!hasCustomPrice && v.retail_price === null) {
        throw badRequest(`${v.product_name} has no selling price. Set it in Price Manager.`);
      }
      const unitPrice = money(hasCustomPrice ? it.unit_price : v.retail_price);
      if (unitPrice < 0) throw badRequest('Price cannot be negative');
      const discount = money(it.discount || 0);
      const lineTotal = money(qty * unitPrice - discount);
      if (lineTotal < 0) throw badRequest(`Discount on ${v.product_name} is larger than its price`);
      lines.push({ v, qty, unitPrice, discount, lineTotal, label: [v.size, v.color].filter(Boolean).join(' / ') || null });
    }
    const subtotal = money(lines.reduce((t, l) => t + l.qty * l.unitPrice, 0));
    const itemDiscount = money(lines.reduce((t, l) => t + l.discount, 0));
    const invoiceDiscount = money(b.invoice_discount || 0);
    const taxable = money(subtotal - itemDiscount - invoiceDiscount);
    if (taxable < 0) throw badRequest('Discount is larger than the bill');
    const vat = money(taxable * vatPercent / 100);
    const roundOff = money(b.round_off || 0);

    // ---- loyalty redemption ----
    let pointsRedeemed = 0;
    let pointsValue = 0;
    if (Number(b.points_redeem) > 0) {
      if (!customer) throw badRequest('Select a customer to redeem points');
      if (!cfg.enabled) throw badRequest('Loyalty program is disabled');
      pointsRedeemed = Math.floor(Number(b.points_redeem));
      if (pointsRedeemed > Number(customer.loyalty_points)) throw badRequest(`Customer only has ${customer.loyalty_points} points`);
      if (pointsRedeemed < cfg.minRedeem) throw badRequest(`Minimum ${cfg.minRedeem} points needed to redeem`);
      pointsValue = loyalty.valueOf(pointsRedeemed, cfg);
    }

    const grandTotal = money(taxable + vat - roundOff - pointsValue);
    if (grandTotal < 0) throw badRequest('Grand total cannot be negative');

    // ---- payments ----
    const payments = (b.payments || []).filter((p) => Number(p.amount) > 0);
    const accounts = {};
    for (const p of payments) {
      const acc = await conn.one('SELECT id, type, name FROM accounts WHERE id = ? AND is_active = true', [p.account_id]);
      if (!acc) throw badRequest('Invalid payment account');
      accounts[p.account_id] = acc;
    }
    const tendered = money(payments.reduce((t, p) => t + Number(p.amount), 0));
    const paid = Math.min(tendered, grandTotal);
    const change = money(tendered - paid);
    const due = money(grandTotal - paid);
    if (change > 0) {
      const cashPay = [...payments].reverse().find((p) => accounts[p.account_id].type === 'cash');
      if (!cashPay || Number(cashPay.amount) < change) throw badRequest('Change can only be returned from a cash payment');
    }
    if (due > 0) {
      if (!customer || customer.is_walk_in) throw badRequest('Credit (due) sale needs a registered customer');
      if (!b.next_payment_date) throw badRequest('Select the next payment date for the due amount');
    }

    // ---- write invoice ----
    const invoiceNo = await nextNumber(conn, 'sale');
    const costTotal = money(lines.reduce((t, l) => t + l.qty * Number(l.v.purchase_price), 0));
    const r = await conn.q(
      `INSERT INTO sales (invoice_no, customer_id, user_id, subtotal, item_discount, invoice_discount, vat_amount, round_off,
        points_redeemed, points_value, grand_total, paid_amount, change_amount, due_amount, next_payment_date, cost_total, note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [invoiceNo, customer?.id || null, req.user.id, subtotal, itemDiscount, invoiceDiscount, vat, roundOff,
        pointsRedeemed, pointsValue, grandTotal, paid, change, due, due > 0 ? b.next_payment_date : null, costTotal, b.note || null]
    );
    const saleId = r.insertId;

    for (const l of lines) {
      await conn.query(
        `INSERT INTO sale_items (sale_id, variant_id, product_name, variant_label, qty, unit_price, cost_price, discount, line_total)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [saleId, l.v.id, l.v.product_name, l.label, l.qty, l.unitPrice, l.v.purchase_price, l.discount, l.lineTotal]);
      await adjustStock(conn, l.v.id, -l.qty);
    }

    // Money in: subtract change from the last cash payment
    let changeLeft = change;
    for (const p of [...payments].reverse()) {
      let amt = money(p.amount);
      if (changeLeft > 0 && accounts[p.account_id].type === 'cash') {
        const take = Math.min(changeLeft, amt);
        amt = money(amt - take);
        changeLeft = money(changeLeft - take);
      }
      if (amt <= 0) continue;
      await conn.query('INSERT INTO sale_payments (sale_id, account_id, method, amount, trx_ref) VALUES (?,?,?,?,?)',
        [saleId, p.account_id, methodFor(accounts[p.account_id].type), amt, p.trx_ref || null]);
      await recordTxn(conn, { accountId: p.account_id, direction: 'in', amount: amt, refType: 'sale', refId: saleId, note: invoiceNo, date: today(), userId: req.user.id });
    }

    // ---- loyalty & customer totals ----
    let pointsEarned = 0;
    if (customer && !customer.is_walk_in) {
      if (pointsRedeemed) await loyalty.applyPoints(conn, { customerId: customer.id, saleId, type: 'redeem', points: -pointsRedeemed, note: `Redeemed on ${invoiceNo}` });
      pointsEarned = loyalty.pointsFor(grandTotal, cfg);
      if (pointsEarned) await loyalty.applyPoints(conn, { customerId: customer.id, saleId, type: 'earn', points: pointsEarned, note: `Earned on ${invoiceNo}` });
      await conn.query('UPDATE sales SET points_earned = ? WHERE id = ?', [pointsEarned, saleId]);
      await conn.query('UPDATE customers SET total_purchase = total_purchase + ? WHERE id = ?', [grandTotal, customer.id]);
    }

    if (b.hold_id) await conn.query('DELETE FROM held_invoices WHERE id = ?', [b.hold_id]);
    return { saleId, invoiceNo };
  });

  await logActivity(req, 'sales', 'create', result.saleId, { invoice: result.invoiceNo });
  const sale = await loadSale(result.saleId);

  // SMS after commit — a slow gateway must never block or roll back the sale
  if (b.send_sms !== false && sale.customer) {
    sendSaleSms(sale, sale.customer).catch((e) => console.error('[sms]', e.message));
  }
  res.status(201).json(sale);
});

async function loadSale(id) {
  const sale = await one(
    `SELECT s.*, u.name AS cashier FROM sales s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?`, [id]);
  if (!sale) return null;
  sale.items = await query('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id', [id]);
  sale.payments = await query(
    'SELECT sp.*, a.name AS account_name FROM sale_payments sp JOIN accounts a ON a.id = sp.account_id WHERE sp.sale_id = ?', [id]);
  sale.customer = sale.customer_id
    ? await one('SELECT c.id, c.name, c.phone, c.address, c.loyalty_points, c.is_walk_in, ROUND(b.balance,2) AS balance FROM customers c JOIN v_customer_balance b ON b.customer_id = c.id WHERE c.id = ?', [sale.customer_id])
    : null;
  sale.returns = await query('SELECT id, return_no, return_date, total_amount, refund_amount FROM sale_returns WHERE sale_id = ?', [id]);
  return sale;
}

exports.get = asyncHandler(async (req, res) => {
  const sale = await loadSale(req.params.id);
  if (!sale) throw notFound('Invoice not found');
  res.json(sale);
});

/** GET /sales?from=&to=&q=&customer_id=&due_only=1 */
exports.list = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const where = ['1=1'];
  const params = [];
  if (req.query.from) { where.push('DATE(s.sale_date) >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('DATE(s.sale_date) <= ?'); params.push(req.query.to); }
  if (req.query.customer_id) { where.push('s.customer_id = ?'); params.push(req.query.customer_id); }
  if (req.query.due_only === '1') where.push('s.due_amount > 0');
  if (req.query.q) { where.push('(s.invoice_no ILIKE ? OR c.name ILIKE ? OR c.phone ILIKE ?)'); const l = `%${req.query.q}%`; params.push(l, l, l); }
  const base = `FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id WHERE ${where.join(' AND ')}`;
  const [sum] = await query(`SELECT COUNT(*) AS total, COALESCE(SUM(s.grand_total),0) AS amount, COALESCE(SUM(s.paid_amount),0) AS paid, COALESCE(SUM(s.due_amount),0) AS due ${base}`, params);
  const rows = await query(
    `SELECT s.id, s.invoice_no, s.sale_date, s.grand_total, s.paid_amount, s.due_amount, s.next_payment_date, s.status,
            c.name AS customer_name, c.phone AS customer_phone, u.name AS cashier,
            (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
     ${base} ORDER BY s.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows, summary: sum, total: sum.total, page, limit });
});

// ---------- Hold / Held ----------
exports.hold = asyncHandler(async (req, res) => {
  const { cart, customer_id = null, note = null } = req.body;
  if (!cart || !Array.isArray(cart.items) || !cart.items.length) throw badRequest('Nothing to hold');
  const total = money(cart.items.reduce((t, i) => t + Number(i.qty) * Number(i.unit_price) - Number(i.discount || 0), 0));
  const id = await transaction(async (conn) => {
    const ref = await nextNumber(conn, 'hold');
    const r = await conn.q('INSERT INTO held_invoices (hold_ref, user_id, customer_id, cart_json, item_count, total, note) VALUES (?,?,?,?,?,?,?)',
      [ref, req.user.id, customer_id, JSON.stringify(cart), cart.items.length, total, note]);
    return r.insertId;
  });
  await logActivity(req, 'sales', 'hold', id);
  res.status(201).json({ id });
});

exports.listHeld = asyncHandler(async (req, res) => {
  res.json(await query(
    `SELECT h.id, h.hold_ref, h.item_count, h.total, h.note, h.created_at, h.customer_id, c.name AS customer_name, u.name AS cashier
     FROM held_invoices h LEFT JOIN customers c ON c.id = h.customer_id LEFT JOIN users u ON u.id = h.user_id ORDER BY h.id DESC`));
});

exports.getHeld = asyncHandler(async (req, res) => {
  const h = await one('SELECT * FROM held_invoices WHERE id = ?', [req.params.id]);
  if (!h) throw notFound('Held invoice not found');
  h.cart = JSON.parse(h.cart_json);
  delete h.cart_json;
  res.json(h);
});

exports.deleteHeld = asyncHandler(async (req, res) => {
  await query('DELETE FROM held_invoices WHERE id = ?', [req.params.id]);
  res.json({ message: 'Held invoice removed' });
});

// ---------- Sales Return ----------
/**
 * POST /sales/returns { sale_id, items: [{ sale_item_id, qty, restock? }], refund_amount?, account_id?, reason? }
 * The part not refunded in cash reduces the customer's due/balance.
 */
exports.createReturn = asyncHandler(async (req, res) => {
  requireFields(req.body, ['sale_id', 'items']);
  const b = req.body;
  const result = await transaction(async (conn) => {
    const sale = await conn.one('SELECT * FROM sales WHERE id = ? FOR UPDATE', [b.sale_id]);
    if (!sale) throw notFound('Invoice not found');
    const items = await conn.q('SELECT * FROM sale_items WHERE sale_id = ?', [sale.id]);
    const linesSum = items.reduce((t, i) => t + Number(i.line_total), 0) || 1;
    const ratio = Number(sale.grand_total) / linesSum; // spreads invoice discount / VAT / round-off

    let total = 0;
    let cost = 0;
    const lines = [];
    for (const r of b.items) {
      const qty = Number(r.qty);
      if (!(qty > 0)) continue;
      const it = items.find((i) => i.id === Number(r.sale_item_id));
      if (!it) throw badRequest('Item does not belong to this invoice');
      if (qty > Number(it.qty) - Number(it.returned_qty)) throw badRequest(`Cannot return more than sold for ${it.product_name}`);
      const unit = money((Number(it.line_total) / Number(it.qty)) * ratio);
      const lineTotal = money(unit * qty);
      total += lineTotal;
      cost += qty * Number(it.cost_price);
      lines.push({ it, qty, unit, lineTotal, restock: r.restock !== false });
    }
    if (!lines.length) throw badRequest('Select at least one item to return');
    total = money(total);
    const refund = money(b.refund_amount ?? (sale.customer_id ? Math.max(total - Number(sale.due_amount), 0) : total));
    if (refund > total) throw badRequest('Refund cannot exceed return value');
    if (!sale.customer_id && refund !== total) throw badRequest('Walk-in returns must be fully refunded');
    let accountId = b.account_id;
    if (refund > 0 && !accountId) {
      accountId = (await conn.one("SELECT id FROM accounts WHERE type='cash' AND is_active=true ORDER BY is_default DESC, id LIMIT 1"))?.id;
      if (!accountId) throw badRequest('Choose the account the refund is paid from');
    }

    const no = await nextNumber(conn, 'sale_return');
    const ins = await conn.q(
      'INSERT INTO sale_returns (return_no, sale_id, customer_id, total_amount, cost_total, refund_amount, account_id, reason, user_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [no, sale.id, sale.customer_id, total, money(cost), refund, refund > 0 ? accountId : null, b.reason || null, req.user.id]);
    for (const l of lines) {
      await conn.query('INSERT INTO sale_return_items (sale_return_id, sale_item_id, variant_id, qty, unit_price, line_total, restock) VALUES (?,?,?,?,?,?,?)',
        [ins.insertId, l.it.id, l.it.variant_id, l.qty, l.unit, l.lineTotal, l.restock ? 1 : 0]);
      await conn.query('UPDATE sale_items SET returned_qty = returned_qty + ? WHERE id = ?', [l.qty, l.it.id]);
      if (l.restock && l.it.variant_id) await adjustStock(conn, l.it.variant_id, l.qty, { allowNegative: true });
    }
    // Non-refunded value settles this invoice's due first
    const settle = Math.min(money(total - refund), Number(sale.due_amount));
    const allReturned = (await conn.one('SELECT SUM(qty - returned_qty) AS left_qty FROM sale_items WHERE sale_id = ?', [sale.id])).left_qty <= 0;
    await conn.query('UPDATE sales SET due_amount = due_amount - ?, status = ? WHERE id = ?', [settle, allReturned ? 'returned' : 'partial_return', sale.id]);
    if (refund > 0) await recordTxn(conn, { accountId, direction: 'out', amount: refund, refType: 'sale_return', refId: ins.insertId, note: `${no} for ${sale.invoice_no}`, date: today(), userId: req.user.id });

    // Reverse loyalty points proportionally
    if (sale.customer_id && Number(sale.points_earned) > 0) {
      const cfg = await loyalty.getConfig();
      const rev = Math.min(loyalty.pointsFor(total, cfg), Number(sale.points_earned));
      if (rev > 0) await loyalty.applyPoints(conn, { customerId: sale.customer_id, saleId: sale.id, type: 'reverse', points: -rev, note: `Reversed by ${no}` });
      await conn.query('UPDATE customers SET total_purchase = GREATEST(total_purchase - ?, 0) WHERE id = ?', [total, sale.customer_id]);
    }
    return { id: ins.insertId, return_no: no, total, refund };
  });
  await logActivity(req, 'sales_return', 'create', result.id, result);
  res.status(201).json(result);
});

exports.listReturns = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const where = ['1=1'];
  const params = [];
  if (req.query.from) { where.push('DATE(r.return_date) >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('DATE(r.return_date) <= ?'); params.push(req.query.to); }
  if (req.query.q) { where.push('(r.return_no ILIKE ? OR s.invoice_no ILIKE ? OR c.name ILIKE ?)'); const l = `%${req.query.q}%`; params.push(l, l, l); }
  const rows = await query(
    `SELECT r.*, s.invoice_no, c.name AS customer_name, u.name AS user_name FROM sale_returns r
     JOIN sales s ON s.id = r.sale_id LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN users u ON u.id = r.user_id
     WHERE ${where.join(' AND ')} ORDER BY r.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows, page, limit });
});

exports.getReturn = asyncHandler(async (req, res) => {
  const r = await one('SELECT r.*, s.invoice_no FROM sale_returns r JOIN sales s ON s.id = r.sale_id WHERE r.id = ?', [req.params.id]);
  if (!r) throw notFound();
  r.items = await query('SELECT ri.*, si.product_name, si.variant_label FROM sale_return_items ri JOIN sale_items si ON si.id = ri.sale_item_id WHERE ri.sale_return_id = ?', [r.id]);
  res.json(r);
});

exports.loadSale = loadSale;
