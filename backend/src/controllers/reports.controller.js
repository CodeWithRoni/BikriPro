/**
 * Dashboard · Profit · Report Hub · Price Manager · Activity Log
 */
const { query, transaction } = require('../config/db');
const { asyncHandler, badRequest, paging, money, today } = require('../utils/http');
const { logActivity } = require('../utils/activity');

const range = (q) => {
  const t = today();
  return { from: q.from || `${t.slice(0, 8)}01`, to: q.to || t };
};

// ---------- Dashboard ----------
exports.dashboard = asyncHandler(async (req, res) => {
  const t = today();
  const [todaySales] = await query(
    `SELECT COUNT(*) AS invoices, COALESCE(SUM(grand_total),0) AS amount, COALESCE(SUM(paid_amount),0) AS cash_in,
            COALESCE(SUM(grand_total - cost_total),0) AS gross_profit
     FROM sales WHERE DATE(sale_date) = ? AND status <> 'cancelled'`, [t]);
  const [monthSales] = await query(
    `SELECT COUNT(*) AS invoices, COALESCE(SUM(grand_total),0) AS amount FROM sales
     WHERE sale_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND status <> 'cancelled'`);
  const [todayCollections] = await query('SELECT COALESCE(SUM(amount),0) AS amount FROM customer_collections WHERE collection_date = ?', [t]);
  const [todayExpenses] = await query('SELECT COALESCE(SUM(amount),0) AS amount FROM expenses WHERE expense_date = ?', [t]);
  const [receivable] = await query('SELECT COALESCE(SUM(balance),0) AS amount, SUM(balance > 0) AS customers FROM v_customer_balance WHERE balance > 0');
  const [payable] = await query('SELECT COALESCE(SUM(balance),0) AS amount FROM v_supplier_balance WHERE balance > 0');
  const [stock] = await query(
    `SELECT COUNT(*) AS skus, COALESCE(SUM(v.stock_qty),0) AS qty, COALESCE(SUM(v.stock_qty * v.purchase_price),0) AS value,
            SUM(v.stock_qty <= v.low_stock_alert) AS low_stock
     FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.is_active = 1 AND p.is_active = 1`);

  // Due Collection Reminders: credit sales whose next payment date has arrived
  const dueReminders = await query(
    `SELECT c.id AS customer_id, c.name, c.phone, c.address,
            SUM(s.due_amount) AS due_amount, MIN(s.next_payment_date) AS next_payment_date,
            DATEDIFF(CURDATE(), MIN(s.next_payment_date)) AS days_overdue, COUNT(*) AS invoices,
            GROUP_CONCAT(s.invoice_no ORDER BY s.sale_date SEPARATOR ', ') AS invoice_nos
     FROM sales s JOIN customers c ON c.id = s.customer_id
     WHERE s.due_amount > 0 AND s.next_payment_date IS NOT NULL AND s.next_payment_date <= CURDATE()
     GROUP BY c.id ORDER BY next_payment_date, due_amount DESC LIMIT 50`);
  const upcomingDues = await query(
    `SELECT c.id AS customer_id, c.name, c.phone, SUM(s.due_amount) AS due_amount, MIN(s.next_payment_date) AS next_payment_date
     FROM sales s JOIN customers c ON c.id = s.customer_id
     WHERE s.due_amount > 0 AND s.next_payment_date > CURDATE() AND s.next_payment_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
     GROUP BY c.id ORDER BY next_payment_date LIMIT 20`);

  const last7 = await query(
    `SELECT DATE(sale_date) AS day, COALESCE(SUM(grand_total),0) AS amount, COUNT(*) AS invoices
     FROM sales WHERE sale_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND status <> 'cancelled'
     GROUP BY DATE(sale_date) ORDER BY day`);
  const bestSellers = await query(
    `SELECT si.product_name, si.variant_label, SUM(si.qty - si.returned_qty) AS qty, SUM(si.line_total) AS amount
     FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.sale_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     GROUP BY si.product_name, si.variant_label ORDER BY qty DESC LIMIT 5`);
  const lowStock = await query(
    `SELECT p.name, v.sku, v.size, v.color, v.stock_qty, v.low_stock_alert FROM product_variants v JOIN products p ON p.id = v.product_id
     WHERE v.is_active = 1 AND p.is_active = 1 AND v.stock_qty <= v.low_stock_alert ORDER BY v.stock_qty LIMIT 10`);
  const topLoyalty = await query(
    'SELECT id, name, phone, loyalty_points, total_purchase FROM customers WHERE is_active = 1 AND is_walk_in = 0 AND loyalty_points > 0 ORDER BY loyalty_points DESC LIMIT 5');
  const [loyaltyTotals] = await query('SELECT COALESCE(SUM(loyalty_points),0) AS outstanding_points, SUM(loyalty_points > 0) AS members FROM customers WHERE is_active = 1');
  const birthdays = await query(
    `SELECT id, name, phone FROM customers WHERE is_active = 1 AND dob IS NOT NULL AND DATE_FORMAT(dob,'%m-%d') = DATE_FORMAT(CURDATE(),'%m-%d')`);

  res.json({
    today: { ...todaySales, collections: todayCollections.amount, expenses: todayExpenses.amount },
    month: monthSales,
    receivable, payable: payable.amount, stock,
    due_reminders: dueReminders, upcoming_dues: upcomingDues,
    sales_last_7_days: last7, best_sellers: bestSellers, low_stock: lowStock,
    loyalty: { ...loyaltyTotals, top: topLoyalty }, birthdays,
  });
});

// ---------- Profit ----------
/** GET /reports/profit?from=&to= — revenue, COGS, gross profit, expenses, net profit + daily rows */
exports.profit = asyncHandler(async (req, res) => {
  const { from, to } = range(req.query);
  const daily = await query(
    `SELECT d.day,
        COALESCE(s.revenue,0) AS revenue, COALESCE(s.cogs,0) AS cogs,
        COALESCE(r.ret_value,0) AS returns_value, COALESCE(r.ret_cost,0) AS returns_cost,
        COALESCE(e.expenses,0) AS expenses
     FROM (
       SELECT DATE(sale_date) AS day FROM sales WHERE DATE(sale_date) BETWEEN ? AND ?
       UNION SELECT DATE(return_date) FROM sale_returns WHERE DATE(return_date) BETWEEN ? AND ?
       UNION SELECT expense_date FROM expenses WHERE expense_date BETWEEN ? AND ?
     ) d
     LEFT JOIN (SELECT DATE(sale_date) AS day, SUM(grand_total) AS revenue, SUM(cost_total) AS cogs FROM sales
                WHERE status <> 'cancelled' AND DATE(sale_date) BETWEEN ? AND ? GROUP BY DATE(sale_date)) s ON s.day = d.day
     LEFT JOIN (SELECT DATE(return_date) AS day, SUM(total_amount) AS ret_value, SUM(cost_total) AS ret_cost FROM sale_returns
                WHERE DATE(return_date) BETWEEN ? AND ? GROUP BY DATE(return_date)) r ON r.day = d.day
     LEFT JOIN (SELECT expense_date AS day, SUM(amount) AS expenses FROM expenses
                WHERE expense_date BETWEEN ? AND ? GROUP BY expense_date) e ON e.day = d.day
     ORDER BY d.day`,
    [from, to, from, to, from, to, from, to, from, to, from, to]);
  const rows = daily.map((d) => {
    const netSales = money(d.revenue - d.returns_value);
    const cogs = money(d.cogs - d.returns_cost);
    const gross = money(netSales - cogs);
    return { day: d.day, net_sales: netSales, cogs, gross_profit: gross, expenses: money(d.expenses), net_profit: money(gross - d.expenses) };
  });
  const sum = (k) => money(rows.reduce((t, r) => t + r[k], 0));
  const summary = {
    net_sales: sum('net_sales'), cogs: sum('cogs'), gross_profit: sum('gross_profit'), expenses: sum('expenses'), net_profit: sum('net_profit'),
  };
  summary.margin_percent = summary.net_sales ? money((summary.gross_profit / summary.net_sales) * 100) : 0;
  const byCategory = await query(
    `SELECT COALESCE(c.name,'Uncategorised') AS category, SUM(si.line_total) AS sales, SUM(si.qty * si.cost_price) AS cost,
            SUM(si.line_total - si.qty * si.cost_price) AS profit
     FROM sale_items si JOIN sales s ON s.id = si.sale_id LEFT JOIN product_variants v ON v.id = si.variant_id
     LEFT JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id
     WHERE s.status <> 'cancelled' AND DATE(s.sale_date) BETWEEN ? AND ? GROUP BY category ORDER BY profit DESC`, [from, to]);
  res.json({ from, to, summary, daily: rows, by_category: byCategory });
});

// ---------- Report Hub ----------
const REPORTS = {
  sales_summary: async ({ from, to }) => query(
    `SELECT DATE(s.sale_date) AS day, COUNT(*) AS invoices, SUM(s.subtotal) AS subtotal,
            SUM(s.item_discount + s.invoice_discount) AS discount, SUM(s.vat_amount) AS vat, SUM(s.round_off) AS round_off,
            SUM(s.grand_total) AS total, SUM(s.paid_amount) AS paid, SUM(s.grand_total - s.paid_amount) AS credit
     FROM sales s WHERE s.status <> 'cancelled' AND DATE(s.sale_date) BETWEEN ? AND ? GROUP BY day ORDER BY day`, [from, to]),
  product_sales: async ({ from, to }) => query(
    `SELECT si.product_name, si.variant_label, v.sku, SUM(si.qty) AS qty_sold, SUM(si.returned_qty) AS qty_returned,
            SUM(si.line_total) AS amount, SUM(si.line_total - si.qty * si.cost_price) AS profit
     FROM sale_items si JOIN sales s ON s.id = si.sale_id LEFT JOIN product_variants v ON v.id = si.variant_id
     WHERE DATE(s.sale_date) BETWEEN ? AND ? GROUP BY si.variant_id, si.product_name, si.variant_label, v.sku ORDER BY qty_sold DESC`, [from, to]),
  purchases: async ({ from, to }) => query(
    `SELECT p.invoice_no, p.purchase_date, s.name AS supplier, p.grand_total, p.paid_amount, p.due_amount
     FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.purchase_date BETWEEN ? AND ? ORDER BY p.purchase_date`, [from, to]),
  stock: async () => query(
    `SELECT p.name, c.name AS category, b.name AS brand, v.sku, v.size, v.color, v.stock_qty, v.purchase_price, v.retail_price,
            ROUND(v.stock_qty * v.purchase_price, 2) AS stock_value
     FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN brands b ON b.id = p.brand_id WHERE v.is_active = 1 AND p.is_active = 1 ORDER BY p.name`),
  receivables: async () => query(
    `SELECT c.name, c.phone, c.area, c.address, ROUND(b.balance,2) AS balance FROM customers c JOIN v_customer_balance b ON b.customer_id = c.id
     WHERE b.balance > 0 ORDER BY b.balance DESC`),
  payables: async () => query(
    `SELECT s.name, s.company, s.phone, ROUND(b.balance,2) AS balance FROM suppliers s JOIN v_supplier_balance b ON b.supplier_id = s.id
     WHERE b.balance > 0 ORDER BY b.balance DESC`),
  loyalty: async () => query(
    `SELECT c.name, c.phone, c.total_purchase, c.loyalty_points,
       (SELECT COALESCE(SUM(points),0) FROM loyalty_transactions l WHERE l.customer_id = c.id AND l.type = 'earn') AS earned,
       (SELECT COALESCE(-SUM(points),0) FROM loyalty_transactions l WHERE l.customer_id = c.id AND l.type = 'redeem') AS redeemed,
       (SELECT MIN(created_at) FROM loyalty_transactions l WHERE l.customer_id = c.id) AS member_since
     FROM customers c WHERE c.is_walk_in = 0 AND (c.total_purchase > 0 OR c.loyalty_points > 0) ORDER BY c.loyalty_points DESC`),
  expenses: async ({ from, to }) => query(
    `SELECT e.expense_date, COALESCE(ec.name,'Other') AS category, a.name AS account, e.amount, e.note
     FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id JOIN accounts a ON a.id = e.account_id
     WHERE e.expense_date BETWEEN ? AND ? ORDER BY e.expense_date`, [from, to]),
  cashier_sales: async ({ from, to }) => query(
    `SELECT u.name AS cashier, COUNT(*) AS invoices, SUM(s.grand_total) AS total, SUM(s.paid_amount) AS collected
     FROM sales s LEFT JOIN users u ON u.id = s.user_id WHERE DATE(s.sale_date) BETWEEN ? AND ? GROUP BY u.id, u.name ORDER BY total DESC`, [from, to]),
  payment_methods: async ({ from, to }) => query(
    `SELECT a.name AS account, a.type, sp.method, COUNT(*) AS payments, SUM(sp.amount) AS amount
     FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id JOIN accounts a ON a.id = sp.account_id
     WHERE DATE(s.sale_date) BETWEEN ? AND ? GROUP BY a.id, a.name, a.type, sp.method ORDER BY amount DESC`, [from, to]),
  sms_logs: async ({ from, to }) => query(
    `SELECT l.created_at, l.purpose, l.phone, c.name AS customer, l.status, l.message FROM sms_logs l LEFT JOIN customers c ON c.id = l.customer_id
     WHERE DATE(l.created_at) BETWEEN ? AND ? ORDER BY l.id DESC LIMIT 1000`, [from, to]),
};

exports.reportList = (req, res) => res.json(Object.keys(REPORTS));

exports.report = asyncHandler(async (req, res) => {
  const fn = REPORTS[req.params.name];
  if (!fn) throw badRequest('Unknown report');
  const r = range(req.query);
  res.json({ report: req.params.name, ...r, rows: await fn(r) });
});

// ---------- Price Manager ----------
/** GET /price-manager?filter=unpriced|no_retail|no_wholesale|below_cost&category_id=&brand_id=&q= */
exports.priceList = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query, 100);
  const where = ['v.is_active = 1', 'p.is_active = 1'];
  const params = [];
  switch (req.query.filter) {
    case 'unpriced': where.push('v.retail_price IS NULL AND v.wholesale_price IS NULL'); break;
    case 'no_retail': where.push('v.retail_price IS NULL'); break;
    case 'no_wholesale': where.push('v.wholesale_price IS NULL'); break;
    case 'below_cost': where.push('v.retail_price IS NOT NULL AND v.retail_price < v.purchase_price'); break;
    default: break;
  }
  if (req.query.category_id) { where.push('p.category_id = ?'); params.push(req.query.category_id); }
  if (req.query.brand_id) { where.push('p.brand_id = ?'); params.push(req.query.brand_id); }
  if (req.query.q) { where.push('(p.name LIKE ? OR v.sku LIKE ? OR v.barcode = ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`, req.query.q); }
  const base = `FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id WHERE ${where.join(' AND ')}`;
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${base}`, params);
  const [counts] = await query(
    `SELECT SUM(v.retail_price IS NULL AND v.wholesale_price IS NULL) AS unpriced, SUM(v.retail_price IS NULL) AS no_retail,
            SUM(v.wholesale_price IS NULL) AS no_wholesale, SUM(v.retail_price < v.purchase_price) AS below_cost
     FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.is_active = 1 AND p.is_active = 1`);
  const rows = await query(
    `SELECT v.id AS variant_id, p.id AS product_id, p.name, c.name AS category, b.name AS brand, v.sku, v.size, v.color,
            v.purchase_price, v.retail_price, v.wholesale_price, v.stock_qty
     ${base} ORDER BY p.name, v.size LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows, total, counts, page, limit });
});

/**
 * PUT /price-manager/bulk
 * { updates: [{ variant_id, purchase_price?, retail_price?, wholesale_price? }] }  — individual edits
 * or { variant_ids: [...], rule: { field: 'retail_price', mode: 'markup_percent'|'set'|'increase_percent'|'increase_amount', value } }
 */
exports.priceBulk = asyncHandler(async (req, res) => {
  const { updates, variant_ids: ids, rule } = req.body;
  let changes = [];
  if (Array.isArray(updates)) changes = updates;
  else if (Array.isArray(ids) && rule) {
    if (!['retail_price', 'wholesale_price'].includes(rule.field)) throw badRequest('Invalid field');
    const rows = await query('SELECT id, purchase_price, retail_price, wholesale_price FROM product_variants WHERE id IN (?)', [ids]);
    const val = Number(rule.value);
    changes = rows.map((r) => {
      const cur = Number(r[rule.field] ?? 0);
      let next;
      if (rule.mode === 'set') next = val;
      else if (rule.mode === 'markup_percent') next = Number(r.purchase_price) * (1 + val / 100);
      else if (rule.mode === 'increase_percent') next = cur * (1 + val / 100);
      else if (rule.mode === 'increase_amount') next = cur + val;
      else throw badRequest('Invalid mode');
      if (rule.round_to) next = Math.round(next / Number(rule.round_to)) * Number(rule.round_to);
      return { variant_id: r.id, [rule.field]: money(Math.max(next, 0)) };
    });
  } else throw badRequest('Nothing to update');

  let updated = 0;
  await transaction(async (conn) => {
    for (const u of changes) {
      const old = await conn.one('SELECT * FROM product_variants WHERE id = ?', [u.variant_id]);
      if (!old) continue;
      const pick = (k) => (u[k] === undefined ? old[k] : (u[k] === '' || u[k] === null ? null : money(u[k])));
      const np = pick('purchase_price') ?? 0;
      const nr = pick('retail_price');
      const nw = pick('wholesale_price');
      if (np === old.purchase_price && nr === old.retail_price && nw === old.wholesale_price) continue;
      await conn.query('UPDATE product_variants SET purchase_price=?, retail_price=?, wholesale_price=? WHERE id=?', [np, nr, nw, old.id]);
      await conn.query(
        `INSERT INTO price_history (variant_id, old_purchase_price, new_purchase_price, old_retail_price, new_retail_price, old_wholesale_price, new_wholesale_price, user_id)
         VALUES (?,?,?,?,?,?,?,?)`, [old.id, old.purchase_price, np, old.retail_price, nr, old.wholesale_price, nw, req.user.id]);
      updated += 1;
    }
  });
  await logActivity(req, 'price_manager', 'bulk_update', null, { updated, rule: rule || null });
  res.json({ updated });
});

exports.priceHistory = asyncHandler(async (req, res) => {
  res.json(await query(
    `SELECT h.*, u.name AS user_name FROM price_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.variant_id = ? ORDER BY h.id DESC LIMIT 50`,
    [req.params.variantId]));
});

// ---------- Barcode labels ----------
/** GET /barcode/purchase/:id — items + qty of a purchase, ready for the print queue */
exports.barcodeFromPurchase = asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT v.id AS variant_id, p.name, b.name AS brand, v.sku, v.barcode, v.size, v.color, v.retail_price, v.wholesale_price,
            (pi.qty - pi.returned_qty) AS qty
     FROM purchase_items pi JOIN product_variants v ON v.id = pi.variant_id JOIN products p ON p.id = v.product_id
     LEFT JOIN brands b ON b.id = p.brand_id WHERE pi.purchase_id = ? ORDER BY pi.id`, [req.params.id]);
  res.json(rows.map((r) => ({ ...r, qty: Math.max(Math.round(r.qty), 0) })));
});

// ---------- Activity Log ----------
exports.activity = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query, 50);
  const where = ['1=1'];
  const params = [];
  if (req.query.module) { where.push('l.module = ?'); params.push(req.query.module); }
  if (req.query.user_id) { where.push('l.user_id = ?'); params.push(req.query.user_id); }
  if (req.query.from) { where.push('DATE(l.created_at) >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('DATE(l.created_at) <= ?'); params.push(req.query.to); }
  if (req.query.q) { where.push('(l.details LIKE ? OR l.action LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  const base = `FROM activity_logs l LEFT JOIN users u ON u.id = l.user_id WHERE ${where.join(' AND ')}`;
  const [{ total }] = await query(`SELECT COUNT(*) AS total ${base}`, params);
  const rows = await query(`SELECT l.*, u.name AS user_name, u.role ${base} ORDER BY l.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const modules = (await query('SELECT DISTINCT module FROM activity_logs ORDER BY module')).map((r) => r.module);
  res.json({ data: rows, total, page, limit, modules });
});

