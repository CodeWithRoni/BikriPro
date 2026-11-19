/**
 * Accounting: day book (every money movement), profit & loss statement,
 * balance sheet, and the owner's notifications / daily summary.
 */
import { query } from '../config/db.js';
import { asyncHandler, badRequest, money, today } from '../utils/http.js';
import * as settings from '../services/settings.service.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BAL = `a.opening_balance + COALESCE((SELECT SUM(CASE WHEN t.direction = 'in' THEN t.amount ELSE -t.amount END)
  FROM account_transactions t WHERE t.account_id = a.id AND t.txn_date <= ?), 0)`;
const REF = {
  sale: 'Sale', sale_return: 'Sales return / refund', purchase: 'Purchase', purchase_return: 'Purchase return', collection: 'Due collected',
  supplier_payment: 'Supplier payment', expense: 'Expense', transfer: 'Transfer', deposit: 'Owner deposit', withdraw: 'Owner withdrawal',
  opening: 'Opening', staff_advance: 'Staff advance',
};
const accScope = '(@SCOPE IS NULL OR a.branch_id IS NULL OR a.branch_id = @SCOPE)';

/** GET /accounting/daybook?from=&to=&account_id=&type=in|out */
export const daybook = asyncHandler(async (req, res) => {
  const to = req.query.to || today();
  const from = req.query.from || to;
  if (!DATE.test(from) || !DATE.test(to)) throw badRequest('Invalid dates');
  const where = ['t.txn_date BETWEEN ? AND ?', accScope];
  const params = [from, to];
  if (req.query.account_id) { where.push('t.account_id = ?'); params.push(req.query.account_id); }
  if (req.query.type === 'in' || req.query.type === 'out') { where.push('t.direction = ?'); params.push(req.query.type); }
  if (req.query.ref_type) { where.push('t.ref_type = ?'); params.push(req.query.ref_type); }
  const rows = await query(
    `SELECT t.*, a.name AS account_name, a.type AS account_type, u.name AS user_name FROM account_transactions t
     JOIN accounts a ON a.id = t.account_id LEFT JOIN users u ON u.id = t.user_id
     WHERE ${where.join(' AND ')} ORDER BY t.txn_date, t.id LIMIT 3000`, params);
  const accWhere = [accScope];
  const accParams = [];
  if (req.query.account_id) { accWhere.push('a.id = ?'); accParams.push(req.query.account_id); }
  const prev = new Date(`${from}T00:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  const [{ opening }] = await query(`SELECT COALESCE(SUM(${BAL}), 0) AS opening FROM accounts a WHERE ${accWhere.join(' AND ')}`, [prev.toISOString().slice(0, 10), ...accParams]);
  let run = Number(opening);
  const days = {};
  for (const r of rows) {
    const d = String(r.txn_date).slice(0, 10);
    days[d] ||= { day: d, in: 0, out: 0, rows: [] };
    const amt = Number(r.amount);
    run = money(run + (r.direction === 'in' ? amt : -amt));
    days[d][r.direction] = money(days[d][r.direction] + amt);
    days[d].rows.push({ ...r, label: REF[r.ref_type] || r.ref_type, balance: run });
  }
  const totIn = money(rows.filter((r) => r.direction === 'in').reduce((t, r) => t + Number(r.amount), 0));
  const totOut = money(rows.filter((r) => r.direction === 'out').reduce((t, r) => t + Number(r.amount), 0));
  res.json({ from, to, opening: money(opening), closing: money(run), in: totIn, out: totOut, days: Object.values(days), truncated: rows.length >= 3000 });
});

/** GET /accounting/pnl?from=&to= — profit & loss statement */
export const pnl = asyncHandler(async (req, res) => {
  const to = req.query.to || today();
  const from = req.query.from || `${to.slice(0, 8)}01`;
  const sc = '(@SCOPE IS NULL OR branch_id = @SCOPE)';
  const [s] = await query(`SELECT COALESCE(SUM(subtotal),0) AS gross_sales, COALESCE(SUM(item_discount + invoice_discount),0) AS discounts,
      COALESCE(SUM(vat_amount),0) AS vat, COALESCE(SUM(delivery_charge),0) AS delivery, COALESCE(SUM(round_off + points_value),0) AS waivers,
      COALESCE(SUM(grand_total),0) AS revenue, COALESCE(SUM(cost_total),0) AS cogs
    FROM sales WHERE ${sc} AND status <> 'cancelled' AND DATE(sale_date) BETWEEN ? AND ?`, [from, to]);
  const [r] = await query(`SELECT COALESCE(SUM(total_amount),0) AS value, COALESCE(SUM(cost_total),0) AS cost FROM sale_returns WHERE ${sc} AND DATE(return_date) BETWEEN ? AND ?`, [from, to]);
  const exp = await query(`SELECT COALESCE(ec.name, 'Other') AS category, SUM(e.amount) AS amount FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id
    WHERE (@SCOPE IS NULL OR e.branch_id = @SCOPE) AND e.expense_date BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC`, [from, to]);
  const [adj] = await query(`SELECT COALESCE(SUM(value) FILTER (WHERE value < 0),0) AS loss, COALESCE(SUM(value) FILTER (WHERE value > 0),0) AS gain FROM stock_adjustments WHERE ${sc} AND adj_date BETWEEN ? AND ?`, [from, to]);
  const [cash] = await query(`SELECT COALESCE(SUM(variance) FILTER (WHERE variance < 0),0) AS short, COALESCE(SUM(variance) FILTER (WHERE variance > 0),0) AS over FROM cash_sessions WHERE ${sc} AND status = 'closed' AND DATE(closed_at) BETWEEN ? AND ?`, [from, to]);
  const netSales = money(Number(s.revenue) - Number(r.value));
  const cogs = money(Number(s.cogs) - Number(r.cost));
  const gross = money(netSales - cogs);
  const expenses = money(exp.reduce((t, e) => t + Number(e.amount), 0));
  const stockNet = money(Number(adj.loss) + Number(adj.gain));
  const cashNet = money(Number(cash.short) + Number(cash.over));
  const net = money(gross - expenses + stockNet + cashNet);
  res.json({
    from, to,
    income: { gross_sales: money(s.gross_sales), discounts: money(s.discounts), vat: money(s.vat), delivery: money(s.delivery), waivers: money(s.waivers), returns: money(r.value), net_sales: netSales },
    cogs, gross_profit: gross, margin: netSales ? money((gross / netSales) * 100) : 0,
    expenses: exp.map((e) => ({ ...e, amount: money(e.amount) })), total_expenses: expenses,
    other: { stock_loss: money(adj.loss), stock_gain: money(adj.gain), cash_short: money(cash.short), cash_over: money(cash.over) },
    net_profit: net,
  });
});

/** GET /accounting/balance-sheet?date= — what the shop owns and owes on a date */
export const balanceSheet = asyncHandler(async (req, res) => {
  const date = req.query.date || today();
  if (!DATE.test(date)) throw badRequest('Invalid date');
  const accounts = await query(`SELECT a.id, a.name, a.type, ROUND(${BAL}, 2) AS balance FROM accounts a WHERE a.is_active AND ${accScope} ORDER BY a.type, a.name`, [date]);
  const [stock] = await query('SELECT COALESCE(SUM(GREATEST(bp_stock(v.id, @SCOPE), 0) * v.purchase_price),0) AS value, COALESCE(SUM(GREATEST(bp_stock(v.id, @SCOPE), 0)),0) AS qty FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.is_active AND p.is_active');
  const [cust] = await query('SELECT COALESCE(SUM(balance) FILTER (WHERE balance > 0),0) AS receivable, COALESCE(-SUM(balance) FILTER (WHERE balance < 0),0) AS advances, COUNT(*) FILTER (WHERE balance > 0) AS n FROM v_customer_balance');
  const [sup] = await query('SELECT COALESCE(SUM(balance) FILTER (WHERE balance > 0),0) AS payable, COALESCE(-SUM(balance) FILTER (WHERE balance < 0),0) AS advances, COUNT(*) FILTER (WHERE balance > 0) AS n FROM v_supplier_balance');
  const [staff] = await query('SELECT COALESCE(SUM(amount),0) AS amount FROM employee_advances WHERE salary_payment_id IS NULL AND adv_date <= ?', [date]);
  const [owner] = await query(`SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.ref_type = 'deposit'),0) AS deposits, COALESCE(SUM(t.amount) FILTER (WHERE t.ref_type = 'withdraw'),0) AS withdrawals
    FROM account_transactions t JOIN accounts a ON a.id = t.account_id WHERE t.txn_date <= ? AND ${accScope}`, [date]);
  const [opening] = await query(`SELECT COALESCE(SUM(a.opening_balance),0) AS amount FROM accounts a WHERE ${accScope}`);
  const cashTotal = money(accounts.reduce((t, a) => t + Number(a.balance), 0));
  const assets = [
    ...accounts.map((a) => ({ group: 'Cash, bank & MFS', name: a.name, amount: money(a.balance) })),
    { group: 'Stock', name: `Goods in stock (${Number(stock.qty)} pcs, at cost)`, amount: money(stock.value) },
    { group: 'Receivable', name: `Customers owe (${cust.n})`, amount: money(cust.receivable) },
    { group: 'Receivable', name: 'Advance paid to suppliers', amount: money(sup.advances) },
    { group: 'Receivable', name: 'Staff advances', amount: money(staff.amount) },
  ].filter((x) => x.amount !== 0 || x.group === 'Stock');
  const liabilities = [
    { group: 'Payable', name: `Owed to suppliers (${sup.n})`, amount: money(sup.payable) },
    { group: 'Payable', name: 'Customer advances / credit', amount: money(cust.advances) },
  ].filter((x) => x.amount !== 0);
  const totalAssets = money(assets.reduce((t, a) => t + a.amount, 0));
  const totalLiab = money(liabilities.reduce((t, a) => t + a.amount, 0));
  res.json({
    date, assets, liabilities, total_assets: totalAssets, total_liabilities: totalLiab, net_worth: money(totalAssets - totalLiab), cash_total: cashTotal,
    owner: { opening_capital: money(opening.amount), deposits: money(owner.deposits), withdrawals: money(owner.withdrawals) },
    note: 'Receivables and payables are shop-wide; cash and stock follow the selected branch.',
  });
});

// ---------------------------------------------------------------- notifications
/** GET /notifications — things that need the owner's / manager's attention now */
export const notifications = asyncHandler(async (req, res) => {
  const s = await settings.getAll();
  const big = Number(s.big_sale_amount) || 0;
  const list = [];
  const push = (type, level, title, text, link) => list.push({ type, level, title, text, link });
  const sc = '(@SCOPE IS NULL OR branch_id = @SCOPE)';

  const [low] = await query('SELECT COUNT(*) AS n FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.is_active AND p.is_active AND bp_stock(v.id, @SCOPE) <= v.low_stock_alert AND bp_stock(v.id, @SCOPE) > 0');
  const [out] = await query('SELECT COUNT(*) AS n FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.is_active AND p.is_active AND bp_stock(v.id, @SCOPE) <= 0');
  if (Number(out.n)) push('stock', 'critical', `${out.n} product(s) out of stock`, 'Re-order before customers ask for them.', '/purchase?tab=reorder');
  if (Number(low.n)) push('stock', 'warning', `${low.n} product(s) running low`, 'Stock is at or below the alert level.', '/products');
  const [due] = await query(`SELECT COUNT(DISTINCT customer_id) AS n, COALESCE(SUM(due_amount),0) AS amount FROM sales WHERE ${sc} AND due_amount > 0 AND next_payment_date <= bp_today()`);
  if (Number(due.n)) push('due', 'warning', `${due.n} customer due(s) to collect today or overdue`, `৳${money(due.amount)} waiting.`, '/collection');
  const [short] = await query(`SELECT COUNT(*) AS n, COALESCE(SUM(variance),0) AS amount FROM cash_sessions WHERE ${sc} AND status = 'closed' AND variance < 0 AND closed_at >= bp_now() - interval '2 days'`);
  if (Number(short.n)) push('cash', 'critical', `Cash short in ${short.n} shift(s)`, `৳${Math.abs(money(short.amount))} missing in the last 2 days.`, '/day-closing');
  const [openShift] = await query(`SELECT COUNT(*) AS n FROM cash_sessions WHERE ${sc} AND status = 'open' AND opened_at < bp_today()`);
  if (Number(openShift.n)) push('cash', 'warning', `${openShift.n} shift(s) still open from an earlier day`, 'Close them in Day Closing.', '/day-closing');
  if (big > 0) {
    const bigs = await query(`SELECT invoice_no, grand_total FROM sales WHERE ${sc} AND DATE(sale_date) = bp_today() AND grand_total >= ? ORDER BY grand_total DESC LIMIT 3`, [big]);
    for (const b of bigs) push('sale', 'good', `Big sale ${b.invoice_no}`, `৳${money(b.grand_total)} today.`, '/sales');
  }
  const [online] = await query(`SELECT COUNT(*) FILTER (WHERE status = 'new') AS fresh, COUNT(*) FILTER (WHERE status IN ('confirmed','packed')) AS to_ship,
      COALESCE(SUM(cod_amount) FILTER (WHERE status = 'delivered' AND cod_status = 'pending'),0) AS cod FROM online_orders WHERE ${sc}`);
  if (Number(online.fresh)) push('online', 'warning', `${online.fresh} new online order(s)`, 'Confirm them with the customer.', '/online-orders');
  if (Number(online.to_ship)) push('online', 'info', `${online.to_ship} online order(s) ready to ship`, '', '/online-orders');
  if (Number(online.cod) > 0) push('online', 'info', 'COD to settle with courier', `৳${money(online.cod)} delivered but not yet received.`, '/online-orders?cod=pending');
  const [incoming] = await query('SELECT COUNT(*) AS n FROM stock_transfers WHERE status = \'in_transit\' AND (@SCOPE IS NULL OR to_branch_id = @SCOPE)');
  if (Number(incoming.n)) push('transfer', 'info', `${incoming.n} stock transfer(s) on the way`, 'Receive them when the goods arrive.', '/branches?tab=transfers');
  const [late] = await query(`SELECT COUNT(*) AS n FROM purchase_orders WHERE ${sc} AND status IN ('sent','partial') AND expected_date < bp_today()`);
  if (Number(late.n)) push('po', 'warning', `${late.n} purchase order(s) late`, 'The supplier has not delivered on time.', '/purchase?tab=orders');
  const ending = await query("SELECT name, ends_on FROM offers WHERE is_active AND ends_on BETWEEN bp_today() AND bp_today() + 2 ORDER BY ends_on LIMIT 3");
  for (const o of ending) push('offer', 'info', `Offer "${o.name}" ends soon`, `Last day ${o.ends_on}.`, '/offers');
  const order = { critical: 0, warning: 1, good: 2, info: 3 };
  list.sort((a, b) => order[a.level] - order[b.level]);
  res.json({ count: list.filter((x) => x.level !== 'info').length, data: list });
});

/** Text of yesterday's summary, used by the daily owner SMS and the owner page. */
export async function dailySummary(date) {
  const [s] = await query(`SELECT COUNT(*) AS bills, COALESCE(SUM(grand_total),0) AS sales, COALESCE(SUM(grand_total - cost_total),0) AS gross,
      COALESCE(SUM(due_amount),0) AS due FROM sales WHERE status <> 'cancelled' AND DATE(sale_date) = ?`, [date]);
  const [r] = await query('SELECT COALESCE(SUM(total_amount),0) AS value FROM sale_returns WHERE DATE(return_date) = ?', [date]);
  const [e] = await query('SELECT COALESCE(SUM(amount),0) AS amount FROM expenses WHERE expense_date = ?', [date]);
  const [c] = await query('SELECT COALESCE(SUM(amount),0) AS amount FROM customer_collections WHERE collection_date = ?', [date]);
  const [v] = await query("SELECT COALESCE(SUM(variance),0) AS amount FROM cash_sessions WHERE status = 'closed' AND DATE(closed_at) = ?", [date]);
  return { date, bills: Number(s.bills), sales: money(s.sales), returns: money(r.value), gross: money(s.gross), due: money(s.due), expenses: money(e.amount), collected: money(c.amount), cash_variance: money(v.amount) };
}

/** GET /owner/summary — today, yesterday, this month and branches at a glance (admin) */
export const ownerSummary = asyncHandler(async (req, res) => {
  const t = today();
  const y = new Date(`${t}T00:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  const [todayS, yest] = await Promise.all([dailySummary(t), dailySummary(y.toISOString().slice(0, 10))]);
  const [month] = await query(`SELECT COALESCE(SUM(grand_total),0) AS sales, COUNT(*) AS bills, COALESCE(SUM(grand_total - cost_total),0) AS gross FROM sales
    WHERE status <> 'cancelled' AND sale_date >= date_trunc('month', bp_today())`);
  const [lastMonth] = await query(`SELECT COALESCE(SUM(grand_total),0) AS sales FROM sales WHERE status <> 'cancelled'
    AND sale_date >= date_trunc('month', bp_today()) - interval '1 month' AND sale_date < date_trunc('month', bp_today()) - interval '1 month' + (bp_today() - date_trunc('month', bp_today())::date + 1) * interval '1 day'`);
  const [mExp] = await query("SELECT COALESCE(SUM(amount),0) AS amount FROM expenses WHERE expense_date >= date_trunc('month', bp_today())");
  const cash = await query(`SELECT a.type, ROUND(SUM(${BAL}), 2) AS balance FROM accounts a WHERE a.is_active GROUP BY a.type`, [t]);
  const hourly = await query("SELECT EXTRACT(HOUR FROM sale_date)::int AS hour, SUM(grand_total) AS sales FROM sales WHERE status <> 'cancelled' AND DATE(sale_date) = bp_today() GROUP BY 1 ORDER BY 1");
  const top = await query(`SELECT si.product_name, SUM(si.qty - si.returned_qty) AS qty, SUM(si.line_total) AS sales FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE s.status <> 'cancelled' AND DATE(s.sale_date) = bp_today() GROUP BY 1 ORDER BY 3 DESC LIMIT 5`);
  res.json({
    today: todayS, yesterday: yest,
    month: { sales: money(month.sales), bills: Number(month.bills), gross: money(month.gross), expenses: money(mExp.amount), net: money(Number(month.gross) - Number(mExp.amount)), last_month_same_days: money(lastMonth.sales) },
    cash: Object.fromEntries(cash.map((c) => [c.type, money(c.balance)])), hourly, top,
  });
});

