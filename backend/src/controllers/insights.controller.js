/**
 * Smart reports ("Insights"): which sizes / colours sell, dead stock, busy hours
 * and days, and a side-by-side comparison of two periods (e.g. Eid this year vs last year).
 * Sales figures are net of returns and use the Dhaka-local sale time.
 */
import { query } from '../config/db.js';
import { asyncHandler, badRequest, money, today } from '../utils/http.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function range(q, fromKey = 'from', toKey = 'to') {
  const to = q[toKey] || today();
  const from = q[fromKey] || `${to.slice(0, 8)}01`;
  if (!DATE.test(from) || !DATE.test(to)) throw badRequest('Dates must look like 2026-11-18');
  if (from > to) throw badRequest('From date is after To date');
  return { from, to };
}
const catFilter = (q, params) => {
  if (!q.category_id) return '';
  params.push(q.category_id, q.category_id);
  return ' AND p.category_id IN (SELECT id FROM categories WHERE id = ? OR parent_id = ?)';
};

/** GET /insights/size-colour?from=&to=&category_id= */
export const sizeColour = asyncHandler(async (req, res) => {
  const { from, to } = range(req.query);
  const base = (col) => {
    const params = [from, to];
    const cat = catFilter(req.query, params);
    return query(
      `SELECT COALESCE(NULLIF(v.${col}, ''), '(none)') AS name, SUM(si.qty - si.returned_qty) AS qty,
              ROUND(SUM((si.line_total / NULLIF(si.qty, 0)) * (si.qty - si.returned_qty)), 2) AS revenue
       FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN product_variants v ON v.id = si.variant_id JOIN products p ON p.id = v.product_id
       WHERE s.status <> 'cancelled' AND DATE(s.sale_date) BETWEEN ? AND ? ${cat}
       GROUP BY 1 HAVING SUM(si.qty - si.returned_qty) > 0 ORDER BY qty DESC`, params);
  };
  const stockOf = (col) => {
    const params = [];
    const cat = catFilter(req.query, params);
    return query(
      `SELECT COALESCE(NULLIF(v.${col}, ''), '(none)') AS name, SUM(GREATEST(v.stock_qty, 0)) AS stock
       FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.is_active AND v.is_active ${cat} GROUP BY 1`, params);
  };
  const [sizes, colours, sizeStock, colourStock] = await Promise.all([base('size'), base('color'), stockOf('size'), stockOf('color')]);
  const attach = (rows, stock) => {
    const st = Object.fromEntries(stock.map((x) => [x.name, Number(x.stock)]));
    return rows.map((r) => ({ ...r, stock: st[r.name] ?? 0 }));
  };
  res.json({ from, to, sizes: attach(sizes, sizeStock), colours: attach(colours, colourStock) });
});

/** GET /insights/dead-stock?days=60&category_id= — in stock but not sold for `days` (or never) */
export const deadStock = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 60, 7), 730);
  const params = [days];
  const cat = catFilter(req.query, params);
  const rows = await query(
    `WITH last_sale AS (
       SELECT si.variant_id, MAX(s.sale_date) AS last_sold, SUM(si.qty - si.returned_qty) AS sold_total
       FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status <> 'cancelled' GROUP BY si.variant_id),
     first_in AS (
       SELECT variant_id, MIN(p.created_at) AS since FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id GROUP BY variant_id)
     SELECT v.id AS variant_id, p.name, v.sku, v.size, v.color, c.name AS category, v.stock_qty, v.purchase_price, v.retail_price,
            ROUND(v.stock_qty * v.purchase_price, 2) AS stock_value, ls.last_sold, COALESCE(ls.sold_total, 0) AS sold_total,
            COALESCE(fi.since, v.created_at) AS in_shop_since,
            (bp_today() - DATE(COALESCE(ls.last_sold, fi.since, v.created_at))) AS idle_days
     FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN last_sale ls ON ls.variant_id = v.id LEFT JOIN first_in fi ON fi.variant_id = v.id
     WHERE p.is_active AND v.is_active AND v.stock_qty > 0
       AND (bp_today() - DATE(COALESCE(ls.last_sold, fi.since, v.created_at))) >= ? ${cat}
     ORDER BY stock_value DESC, idle_days DESC LIMIT 500`, params);
  const total = rows.reduce((t, r) => ({ items: t.items + 1, qty: t.qty + Number(r.stock_qty), value: money(t.value + Number(r.stock_value)) }), { items: 0, qty: 0, value: 0 });
  res.json({ days, total, data: rows });
});

/** GET /insights/heatmap?from=&to= — invoices and sales by weekday (0=Sun) × hour */
export const heatmap = asyncHandler(async (req, res) => {
  const { from, to } = range(req.query);
  const cells = await query(
    `SELECT EXTRACT(DOW FROM s.sale_date)::int AS dow, EXTRACT(HOUR FROM s.sale_date)::int AS hour,
            COUNT(*) AS invoices, COALESCE(SUM(s.grand_total), 0) AS sales
     FROM sales s WHERE s.status <> 'cancelled' AND DATE(s.sale_date) BETWEEN ? AND ? GROUP BY 1, 2`, [from, to]);
  const byDow = await query(
    `SELECT EXTRACT(DOW FROM s.sale_date)::int AS dow, COUNT(*) AS invoices, COALESCE(SUM(s.grand_total), 0) AS sales,
            COUNT(DISTINCT DATE(s.sale_date)) AS days
     FROM sales s WHERE s.status <> 'cancelled' AND DATE(s.sale_date) BETWEEN ? AND ? GROUP BY 1 ORDER BY 1`, [from, to]);
  res.json({ from, to, cells, by_day: byDow });
});

async function periodStats(from, to) {
  const [t] = await query(
    `SELECT COUNT(*) AS invoices, COALESCE(SUM(grand_total), 0) AS sales, COALESCE(SUM(grand_total - cost_total), 0) AS gross,
            COALESCE(SUM((SELECT SUM(qty) FROM sale_items si WHERE si.sale_id = s.id)), 0) AS items,
            COUNT(DISTINCT customer_id) AS customers
     FROM sales s WHERE status <> 'cancelled' AND DATE(sale_date) BETWEEN ? AND ?`, [from, to]);
  const [r] = await query('SELECT COALESCE(SUM(total_amount),0) AS value, COALESCE(SUM(cost_total),0) AS cost FROM sale_returns WHERE DATE(return_date) BETWEEN ? AND ?', [from, to]);
  const daily = await query(
    `SELECT (DATE(sale_date) - ?::date) AS day_no, DATE(sale_date) AS day, COUNT(*) AS invoices, SUM(grand_total) AS sales
     FROM sales WHERE status <> 'cancelled' AND DATE(sale_date) BETWEEN ? AND ? GROUP BY 1, 2 ORDER BY 1`, [from, from, to]);
  const cats = await query(
    `SELECT COALESCE(pc.name, c.name, 'Uncategorised') AS category, ROUND(SUM((si.line_total / NULLIF(si.qty,0)) * (si.qty - si.returned_qty)), 2) AS sales
     FROM sale_items si JOIN sales s ON s.id = si.sale_id LEFT JOIN product_variants v ON v.id = si.variant_id LEFT JOIN products p ON p.id = v.product_id
     LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN categories pc ON pc.id = c.parent_id
     WHERE s.status <> 'cancelled' AND DATE(s.sale_date) BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [from, to]);
  const net = money(Number(t.sales) - Number(r.value));
  return {
    from, to, invoices: Number(t.invoices), items: Number(t.items), customers: Number(t.customers),
    net_sales: net, returns: money(r.value), gross_profit: money(Number(t.gross) - (Number(r.value) - Number(r.cost))),
    avg_bill: Number(t.invoices) ? money(Number(t.sales) / Number(t.invoices)) : 0, daily, categories: cats,
  };
}

/** GET /insights/compare?a_from=&a_to=&b_from=&b_to= — period A (e.g. this Eid) vs period B (last Eid) */
export const compare = asyncHandler(async (req, res) => {
  const a = range(req.query, 'a_from', 'a_to');
  const b = range(req.query, 'b_from', 'b_to');
  const [A, B] = await Promise.all([periodStats(a.from, a.to), periodStats(b.from, b.to)]);
  const pct = (x, y) => (y ? Math.round(((x - y) / Math.abs(y)) * 1000) / 10 : null);
  res.json({ a: A, b: B, change: { net_sales: pct(A.net_sales, B.net_sales), invoices: pct(A.invoices, B.invoices), avg_bill: pct(A.avg_bill, B.avg_bill), gross_profit: pct(A.gross_profit, B.gross_profit), items: pct(A.items, B.items) } });
});
