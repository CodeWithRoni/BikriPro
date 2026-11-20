import crypto from 'node:crypto';
import { query, one, transaction } from '../config/db.js';
import { addRange, orderBy, scopeFilter } from '../utils/filters.js';
import { asyncHandler, requireFields, badRequest, notFound, paging, money, today } from '../utils/http.js';
import { logActivity } from '../utils/activity.js';
import { nextNumber } from '../utils/numbering.js';
import { adjustStock } from '../services/stock.service.js';
import { recordTxn, methodFor } from '../services/accounts.service.js';
import * as loyalty from '../services/loyalty.service.js';
import * as settings from '../services/settings.service.js';
import { sendSaleSms, sendSms, render } from '../services/sms.service.js';

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
const newToken = () => crypto.randomBytes(12).toString('base64url');

/**
 * Write one sale inside an open transaction. `exchange` = { credit, returnId } when the sale
 * is the "new items" half of an exchange: the returned goods' value pays for it first.
 */
async function createSaleTx(conn, req, b, { exchange = null } = {}) {
  if (!Array.isArray(b.items) || !b.items.length) throw badRequest('Cart is empty');
  const cfg = await loyalty.getConfig();
  const s = await settings.getAll();
  const vatPercent = Number(s.vat_percent) || 0;
  {
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
      const offerDiscount = it.offer_id ? Math.min(money(it.offer_discount || 0), discount) : 0;
      lines.push({ v, qty, unitPrice, discount, lineTotal, offerId: offerDiscount > 0 ? it.offer_id : null, offerDiscount, label: [v.size, v.color].filter(Boolean).join(' / ') || null });
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

    const delivery = money(b.delivery_charge || 0); // online orders: delivery charged to the customer
    if (delivery < 0) throw badRequest('Delivery charge cannot be negative');
    const grandTotal = money(taxable + vat - roundOff - pointsValue + delivery);
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
    const credit = exchange ? Math.min(money(exchange.credit), grandTotal) : 0; // returned goods pay first
    const payable = money(grandTotal - credit);
    const cashPaid = Math.min(tendered, payable);
    const paid = money(credit + cashPaid);
    const change = money(tendered - cashPaid);
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
    const billOfferDiscount = b.bill_offer_id ? Math.min(money(b.bill_offer_discount || 0), invoiceDiscount) : 0;
    const offerDiscount = money(lines.reduce((t, l) => t + l.offerDiscount, 0) + billOfferDiscount);
    const r = await conn.q(
      `INSERT INTO sales (invoice_no, customer_id, user_id, subtotal, item_discount, invoice_discount, vat_amount, round_off,
        points_redeemed, points_value, grand_total, paid_amount, change_amount, due_amount, next_payment_date, cost_total, note,
        bill_offer_id, offer_discount, exchange_credit, exchange_return_id, public_token, salesperson_id, delivery_charge)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [invoiceNo, customer?.id || null, req.user.id, subtotal, itemDiscount, invoiceDiscount, vat, roundOff,
        pointsRedeemed, pointsValue, grandTotal, paid, change, due, due > 0 ? b.next_payment_date : null, costTotal, b.note || null,
        billOfferDiscount > 0 ? b.bill_offer_id : null, offerDiscount, credit, exchange?.returnId || null, newToken(), b.salesperson_id || null, delivery]
    );
    const saleId = r.insertId;

    for (const l of lines) {
      await conn.query(
        `INSERT INTO sale_items (sale_id, variant_id, product_name, variant_label, qty, unit_price, cost_price, discount, line_total, offer_id, offer_discount)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [saleId, l.v.id, l.v.product_name, l.label, l.qty, l.unitPrice, l.v.purchase_price, l.discount, l.lineTotal, l.offerId, l.offerDiscount]);
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
    return { saleId, invoiceNo, grandTotal, credit };
  }
}

export { createSaleTx, returnTx, loadSale };

export const create = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await transaction((conn) => createSaleTx(conn, req, b));
  await logActivity(req, 'sales', 'create', result.saleId, { invoice: result.invoiceNo });
  const sale = await loadSale(result.saleId);

  // SMS after commit — a slow gateway must never block or roll back the sale
  if (b.send_sms !== false && sale.customer) {
    sendSaleSms(sale, sale.customer).catch((e) => console.error('[sms]', e.message));
  }
  bigSaleAlert(sale).catch((e) => console.error('[sms]', e.message));
  res.status(201).json(sale);
});

/** Owner SMS when a bill crosses the big-sale amount. */
async function bigSaleAlert(sale) {
  const st = await settings.getAll();
  const limit = Number(st.big_sale_amount) || 0;
  if (!limit || st.big_sale_sms !== '1' || !st.owner_phone || Number(sale.grand_total) < limit) return;
  const who = sale.customer?.name ? ` to ${sale.customer.name}` : '';
  await sendSms({ phone: st.owner_phone, purpose: 'owner',
    message: `${st.shop_name}: big sale ${sale.invoice_no}${who} — ${Math.round(Number(sale.grand_total))} Tk (paid ${Math.round(Number(sale.paid_amount))}).` });
}

async function loadSale(id) {
  const sale = await one(
    `SELECT s.*, u.name AS cashier, e.name AS salesperson FROM sales s LEFT JOIN users u ON u.id = s.user_id LEFT JOIN employees e ON e.id = s.salesperson_id WHERE s.id = ?`, [id]);
  if (!sale) return null;
  sale.items = await query('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id', [id]);
  sale.payments = await query(
    'SELECT sp.*, a.name AS account_name FROM sale_payments sp JOIN accounts a ON a.id = sp.account_id WHERE sp.sale_id = ?', [id]);
  sale.customer = sale.customer_id
    ? await one('SELECT c.id, c.name, c.phone, c.address, c.loyalty_points, c.is_walk_in, ROUND(b.balance,2) AS balance FROM customers c JOIN v_customer_balance b ON b.customer_id = c.id WHERE c.id = ?', [sale.customer_id])
    : null;
  sale.returns = await query('SELECT id, return_no, return_date, total_amount, refund_amount, exchange_credit FROM sale_returns WHERE sale_id = ?', [id]);
  if (sale.exchange_return_id) {
    const r = await one('SELECT r.id, r.return_no, r.total_amount, r.refund_amount, r.exchange_credit, s.invoice_no FROM sale_returns r JOIN sales s ON s.id = r.sale_id WHERE r.id = ?', [sale.exchange_return_id]);
    if (r) {
      r.items = await query(`SELECT ri.qty, ri.unit_price, ri.line_total, si.product_name, si.variant_label FROM sale_return_items ri
        JOIN sale_items si ON si.id = ri.sale_item_id WHERE ri.sale_return_id = ?`, [r.id]);
      r.cash_refund = money(Number(r.total_amount) - Number(sale.exchange_credit));
      sale.exchange = r;
    }
  }
  return sale;
}

export const get = asyncHandler(async (req, res) => {
  const sale = await loadSale(req.params.id);
  if (!sale) throw notFound('Invoice not found');
  res.json(sale);
});

/** GET /sales?from=&to=&q=&customer_id=&due_only=1 */
export const list = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const where = ['1=1'];
  const params = [];
  if (req.query.from) { where.push('DATE(s.sale_date) >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('DATE(s.sale_date) <= ?'); params.push(req.query.to); }
  if (req.query.customer_id) { where.push('s.customer_id = ?'); params.push(req.query.customer_id); }
  const qs = req.query;
  scopeFilter(where, params, 's.branch_id');
  if (qs.due_only === '1') where.push('s.due_amount > 0');
  if (qs.status) { where.push('s.status = ?'); params.push(qs.status); }
  if (qs.pay === 'paid') where.push('s.due_amount <= 0');
  else if (qs.pay === 'due') where.push('s.due_amount > 0');
  else if (qs.pay === 'overdue') where.push('s.due_amount > 0 AND s.next_payment_date IS NOT NULL AND s.next_payment_date <= bp_today()');
  if (qs.walk_in === '1') where.push('(s.customer_id IS NULL OR c.is_walk_in)');
  if (qs.method) { where.push('EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id AND sp.method = ?)'); params.push(qs.method); }
  if (qs.account_id) { where.push('EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id AND sp.account_id = ?)'); params.push(qs.account_id); }
  if (qs.user_id) { where.push('s.user_id = ?'); params.push(qs.user_id); }
  addRange(where, params, qs, 'amount', 's.grand_total');
  if (qs.q) { where.push('(s.invoice_no ILIKE ? OR c.name ILIKE ? OR c.phone ILIKE ?)'); const l = `%${qs.q}%`; params.push(l, l, l); }
  const base = `FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id WHERE ${where.join(' AND ')}`;
  const order = orderBy(qs.sort, { oldest: 's.id ASC', amount_desc: 's.grand_total DESC, s.id DESC', amount_asc: 's.grand_total ASC, s.id DESC', due_desc: 's.due_amount DESC, s.id DESC' }, 's.id DESC');
  const [sum] = await query(`SELECT COUNT(*) AS total, COALESCE(SUM(s.grand_total),0) AS amount, COALESCE(SUM(s.paid_amount),0) AS paid, COALESCE(SUM(s.due_amount),0) AS due ${base}`, params);
  const rows = await query(
    `SELECT s.id, s.invoice_no, s.sale_date, s.grand_total, s.paid_amount, s.due_amount, s.next_payment_date, s.status, s.exchange_return_id, s.offer_discount,
            c.name AS customer_name, c.phone AS customer_phone, u.name AS cashier,
            (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count,
            (SELECT string_agg(DISTINCT a.name, ' + ') FROM sale_payments sp JOIN accounts a ON a.id = sp.account_id WHERE sp.sale_id = s.id) AS pay_methods
     ${base} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows, summary: sum, total: sum.total, page, limit });
});

// ---------- Hold / Held ----------
/**
 * POST /sales/hold { cart, customer_id?, note?, kind?: 'hold'|'quotation', valid_until?, total? }
 * A quotation gets its own number (QTN-…) and can be printed and turned into a sale later.
 */
export const hold = asyncHandler(async (req, res) => {
  const { cart, customer_id = null, note = null } = req.body;
  const kind = req.body.kind === 'quotation' ? 'quotation' : 'hold';
  if (!cart || !Array.isArray(cart.items) || !cart.items.length) throw badRequest(kind === 'quotation' ? 'Add products to the quotation' : 'Nothing to hold');
  const lines = money(cart.items.reduce((t, i) => t + Number(i.qty) * Number(i.unit_price) - Number(i.discount || 0), 0));
  const total = req.body.total !== undefined && req.body.total !== null && req.body.total !== '' ? money(req.body.total) : lines;
  const out = await transaction(async (conn) => {
    const ref = await nextNumber(conn, kind === 'quotation' ? 'quotation' : 'hold');
    const r = await conn.q('INSERT INTO held_invoices (hold_ref, user_id, customer_id, cart_json, item_count, total, note, kind, valid_until) VALUES (?,?,?,?,?,?,?,?,?)',
      [ref, req.user.id, customer_id, JSON.stringify(cart), cart.items.length, total, note, kind, kind === 'quotation' ? (req.body.valid_until || null) : null]);
    return { id: r.insertId, ref };
  });
  await logActivity(req, 'sales', kind, out.id);
  res.status(201).json({ id: out.id, hold_ref: out.ref, kind });
});

/** GET /sales/held?kind=hold|quotation — parked carts / quotations of this branch */
export const listHeld = asyncHandler(async (req, res) => {
  const where = ['h.kind = ?'];
  const params = [req.query.kind === 'quotation' ? 'quotation' : 'hold'];
  scopeFilter(where, params, 'h.branch_id');
  if (req.query.q) { where.push('(h.hold_ref ILIKE ? OR c.name ILIKE ? OR c.phone ILIKE ?)'); const l = `%${req.query.q}%`; params.push(l, l, l); }
  res.json(await query(
    `SELECT h.id, h.hold_ref, h.kind, h.valid_until, h.item_count, h.total, h.note, h.created_at, h.customer_id, c.name AS customer_name, c.phone AS customer_phone, u.name AS cashier
     FROM held_invoices h LEFT JOIN customers c ON c.id = h.customer_id LEFT JOIN users u ON u.id = h.user_id
     WHERE ${where.join(' AND ')} ORDER BY h.id DESC LIMIT 100`, params));
});

export const getHeld = asyncHandler(async (req, res) => {
  const h = await one(`SELECT h.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address, u.name AS cashier
    FROM held_invoices h LEFT JOIN customers c ON c.id = h.customer_id LEFT JOIN users u ON u.id = h.user_id WHERE h.id = ?`, [req.params.id]);
  if (!h) throw notFound('Held invoice not found');
  h.cart = JSON.parse(h.cart_json);
  delete h.cart_json;
  res.json(h);
});

export const deleteHeld = asyncHandler(async (req, res) => {
  await query('DELETE FROM held_invoices WHERE id = ?', [req.params.id]);
  res.json({ message: 'Held invoice removed' });
});

// ---------- Sales Return ----------
/**
 * POST /sales/returns { sale_id, items: [{ sale_item_id, qty, restock? }], refund_amount?, account_id?, reason? }
 * The part not refunded in cash reduces the customer's due/balance.
 */
/**
 * Write one sales return inside an open transaction.
 * `exchange` = true: nothing is paid out here; the whole value becomes exchange credit
 * (recorded in refund_amount + exchange_credit so the customer's balance is unchanged)
 * and the caller uses it on the new sale.
 */
async function returnTx(conn, req, b, { exchange = false } = {}) {
  {
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
      // Round once on the whole line (rounding the unit first can drift by a paisa: 666.67 × 3 = 2000.01)
      const lineTotal = money((Number(it.line_total) * ratio * qty) / Number(it.qty));
      const unit = money(lineTotal / qty);
      total += lineTotal;
      cost += qty * Number(it.cost_price);
      lines.push({ it, qty, unit, lineTotal, restock: r.restock !== false });
    }
    if (!lines.length) throw badRequest('Select at least one item to return');
    total = money(total);
    const refund = exchange ? 0 : money(b.refund_amount ?? (sale.customer_id ? Math.max(total - Number(sale.due_amount), 0) : total));
    if (refund > total) throw badRequest('Refund cannot exceed return value');
    if (!exchange && !sale.customer_id && refund !== total) throw badRequest('Walk-in returns must be fully refunded');
    let accountId = b.account_id;
    if (refund > 0 && !accountId) {
      accountId = (await conn.one("SELECT id FROM accounts WHERE type='cash' AND is_active=true ORDER BY (branch_id IS NOT DISTINCT FROM bp_branch()) DESC, is_default DESC, id LIMIT 1"))?.id;
      if (!accountId) throw badRequest('Choose the account the refund is paid from');
    }

    const no = await nextNumber(conn, 'sale_return');
    const ins = await conn.q(
      'INSERT INTO sale_returns (return_no, sale_id, customer_id, total_amount, cost_total, refund_amount, exchange_credit, account_id, reason, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [no, sale.id, sale.customer_id, total, money(cost), exchange ? total : refund, exchange ? total : 0, refund > 0 ? accountId : null, b.reason || (exchange ? 'Exchange' : null), req.user.id]);
    for (const l of lines) {
      await conn.query('INSERT INTO sale_return_items (sale_return_id, sale_item_id, variant_id, qty, unit_price, line_total, restock) VALUES (?,?,?,?,?,?,?)',
        [ins.insertId, l.it.id, l.it.variant_id, l.qty, l.unit, l.lineTotal, l.restock ? 1 : 0]);
      await conn.query('UPDATE sale_items SET returned_qty = returned_qty + ? WHERE id = ?', [l.qty, l.it.id]);
      if (l.restock && l.it.variant_id) await adjustStock(conn, l.it.variant_id, l.qty, { allowNegative: true });
    }
    // Non-refunded value settles this invoice's due first
    const settle = exchange ? 0 : Math.min(money(total - refund), Number(sale.due_amount));
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
    return { id: ins.insertId, return_no: no, total, refund, sale };
  }
}

export const createReturn = asyncHandler(async (req, res) => {
  requireFields(req.body, ['sale_id', 'items']);
  const b = req.body;
  const { sale: _s, ...result } = await transaction((conn) => returnTx(conn, req, b));
  await logActivity(req, 'sales_return', 'create', result.id, result);
  res.status(201).json(result);
});

export const listReturns = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const qs = req.query;
  const where = ['1=1'];
  const params = [];
  scopeFilter(where, params, 'r.branch_id');
  if (qs.from) { where.push('DATE(r.return_date) >= ?'); params.push(qs.from); }
  if (qs.to) { where.push('DATE(r.return_date) <= ?'); params.push(qs.to); }
  if (qs.customer_id) { where.push('r.customer_id = ?'); params.push(qs.customer_id); }
  if (qs.refund === 'cash') where.push('r.refund_amount > 0');
  else if (qs.refund === 'credit') where.push('r.refund_amount < r.total_amount');
  if (qs.walk_in === '1') where.push('(r.customer_id IS NULL OR c.is_walk_in)');
  addRange(where, params, qs, 'amount', 'r.total_amount');
  if (qs.q) { where.push('(r.return_no ILIKE ? OR s.invoice_no ILIKE ? OR c.name ILIKE ? OR r.reason ILIKE ?)'); const l = `%${qs.q}%`; params.push(l, l, l, l); }
  const base = `FROM sale_returns r JOIN sales s ON s.id = r.sale_id LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN users u ON u.id = r.user_id
     WHERE ${where.join(' AND ')}`;
  const [sum] = await query(`SELECT COUNT(*) AS total, COALESCE(SUM(r.total_amount),0) AS amount, COALESCE(SUM(r.refund_amount),0) AS refunded ${base}`, params);
  const order = orderBy(qs.sort, { oldest: 'r.id ASC', amount_desc: 'r.total_amount DESC, r.id DESC', amount_asc: 'r.total_amount ASC, r.id DESC' }, 'r.id DESC');
  const rows = await query(`SELECT r.*, s.invoice_no, c.name AS customer_name, u.name AS user_name ${base} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows, summary: sum, total: sum.total, page, limit });
});

export const getReturn = asyncHandler(async (req, res) => {
  const r = await one('SELECT r.*, s.invoice_no FROM sale_returns r JOIN sales s ON s.id = r.sale_id WHERE r.id = ?', [req.params.id]);
  if (!r) throw notFound();
  r.items = await query('SELECT ri.*, si.product_name, si.variant_label FROM sale_return_items ri JOIN sale_items si ON si.id = ri.sale_item_id WHERE ri.sale_return_id = ?', [r.id]);
  res.json(r);
});



// ---------- Exchange ----------
/**
 * POST /sales/exchange
 * { sale_id, return_items: [{ sale_item_id, qty, restock? }], items: [...new items like POST /sales],
 *   payments?, invoice_discount?, round_off?, customer_id?, next_payment_date?, reason?,
 *   leftover?: 'cash' | 'credit', refund_account_id? }
 * One receipt: the returned goods' value pays for the new items. The customer pays the
 * difference, or gets the leftover back in cash (or kept as credit on their account).
 */
export const exchange = asyncHandler(async (req, res) => {
  requireFields(req.body, ['sale_id', 'return_items', 'items']);
  const b = req.body;
  const result = await transaction(async (conn) => {
    const ret = await returnTx(conn, req, { sale_id: b.sale_id, items: b.return_items, reason: b.reason || 'Exchange' }, { exchange: true });
    const customerId = b.customer_id || ret.sale.customer_id || null;
    const sale = await createSaleTx(conn, req, { ...b, customer_id: customerId }, { exchange: { credit: ret.total, returnId: ret.id } });
    const leftover = money(ret.total - sale.credit);
    let refundAmount = ret.total; // fully settled: credit used + cash back
    let accountId = null;
    if (leftover > 0) {
      const keepCredit = b.leftover === 'credit';
      if (keepCredit) {
        const c = customerId ? await conn.one('SELECT is_walk_in FROM customers WHERE id = ?', [customerId]) : null;
        if (!c || c.is_walk_in) throw badRequest('Keeping the balance as credit needs a registered customer');
        refundAmount = sale.credit; // the rest stays on the customer's account as advance
      } else {
        accountId = b.refund_account_id || (await conn.one("SELECT id FROM accounts WHERE type='cash' AND is_active ORDER BY (branch_id IS NOT DISTINCT FROM bp_branch()) DESC, is_default DESC, id LIMIT 1"))?.id;
        if (!accountId) throw badRequest('Choose the account the difference is paid back from');
        await recordTxn(conn, { accountId, direction: 'out', amount: leftover, refType: 'sale_return', refId: ret.id, note: `${ret.return_no} exchange balance`, date: today(), userId: req.user.id });
      }
    }
    await conn.query('UPDATE sale_returns SET exchange_sale_id = ?, exchange_credit = ?, refund_amount = ?, account_id = ? WHERE id = ?',
      [sale.saleId, sale.credit, refundAmount, accountId, ret.id]);
    return { saleId: sale.saleId, invoiceNo: sale.invoiceNo, returnNo: ret.return_no, leftover };
  });
  await logActivity(req, 'sales', 'exchange', result.saleId, { invoice: result.invoiceNo, return: result.returnNo });
  const sale = await loadSale(result.saleId);
  if (b.send_sms !== false && sale.customer) sendSaleSms(sale, sale.customer).catch((e) => console.error('[sms]', e.message));
  res.status(201).json({ ...sale, exchange_leftover: result.leftover });
});

// ---------- Shareable receipt ----------
/** POST /sales/:id/share — make sure the invoice has a public link token */
export const share = asyncHandler(async (req, res) => {
  let row = await one('SELECT id, public_token FROM sales WHERE id = ?', [req.params.id]);
  if (!row) throw notFound('Invoice not found');
  if (!row.public_token) row = await one('UPDATE sales SET public_token = ? WHERE id = ? RETURNING id, public_token', [newToken(), row.id]);
  res.json({ token: row.public_token });
});

/** GET /public/receipt/:token — no login. Only what is printed on the paper receipt. */
export const publicReceipt = asyncHandler(async (req, res) => {
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{12,40}$/.test(token)) throw notFound('Receipt not found');
  const row = await one('SELECT id FROM sales WHERE public_token = ?', [token]);
  if (!row) throw notFound('Receipt not found');
  const sale = await loadSale(row.id);
  const st = await settings.getAll();
  delete sale.public_token;
  if (sale.customer) sale.customer = { name: sale.customer.name, is_walk_in: sale.customer.is_walk_in, loyalty_points: sale.customer.loyalty_points };
  sale.payments = sale.payments.map((p) => ({ method: p.method, amount: p.amount, account_name: p.account_name }));
  res.json({
    sale,
    shop: {
      shop_name: st.shop_name, shop_address: st.shop_address, shop_phone: st.shop_phone, shop_logo: st.shop_logo,
      shop_bin: st.shop_bin, invoice_footer: st.invoice_footer, currency_symbol: st.currency_symbol, receipt_width_mm: st.receipt_width_mm,
    },
  });
});

/** POST /sales/:id/sms-receipt { link } — SMS the receipt link to the customer */
export const smsReceipt = asyncHandler(async (req, res) => {
  const sale = await loadSale(req.params.id);
  if (!sale) throw notFound('Invoice not found');
  const phone = req.body?.phone || sale.customer?.phone;
  if (!phone) throw badRequest('This customer has no phone number');
  const st = await settings.getAll();
  const message = render(st.sms_receipt_template, { name: sale.customer?.name || 'Customer', shop: st.shop_name, invoice: sale.invoice_no, total: sale.grand_total, link: req.body?.link || '' });
  const r = await sendSms({ phone, message, purpose: 'receipt', customerId: sale.customer?.id || null });
  if (r.status === 'failed' || r.status === 'skipped') throw badRequest(r.error || 'SMS could not be sent');
  res.json(r);
});
