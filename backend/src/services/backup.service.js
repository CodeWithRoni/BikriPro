/**
 * Database Export / Import / Reset utilities.
 *
 * Export format is portable JSON (no pg_dump binary needed, so it works the
 * same on Windows desktops, shared hosting and Docker):
 *   { app: 'BikriPro', format: 1, exported_at, tables: { users: [...], ... } }
 */
import { query, transaction } from '../config/db.js';

// Parent tables first so a restore with FK checks on would also work.
const TABLE_ORDER = [
  'branches', 'users', 'settings', 'number_sequences', 'accounts',
  'categories', 'brands', 'product_attributes', 'products', 'product_variants', 'price_history', 'offers',
  'customers', 'customer_contacts', 'suppliers', 'supplier_contacts',
  'expense_categories',
  'sales', 'sale_items', 'sale_payments', 'held_invoices', 'sale_returns', 'sale_return_items',
  'purchases', 'purchase_items', 'purchase_payments', 'purchase_returns', 'purchase_return_items',
  'supplier_payments', 'customer_collections', 'ledger_adjustments',
  'expenses', 'account_transactions', 'loyalty_transactions', 'sms_logs', 'activity_logs',
  'cash_sessions', 'stock_counts', 'stock_count_items', 'stock_adjustments',
  'employees', 'purchase_orders', 'purchase_order_items', 'attendance', 'salary_payments', 'employee_advances',
  'branch_stock', 'stock_transfers', 'stock_transfer_items', 'online_orders', 'online_order_items',
];

async function exportAll() {
  const tables = {};
  for (const t of TABLE_ORDER) {
    tables[t] = [...(await query(`SELECT * FROM "${t}" ORDER BY 1`))]
      // never put server signing secrets into a downloadable file
      .filter((r) => t !== 'settings' || !['jwt_secret', 'cron_secret'].includes(r.setting_key));
  }
  return { app: 'BikriPro', format: 1, exported_at: new Date().toISOString(), tables };
}

// MySQL-era backups stored booleans as 1/0 — Postgres accepts those as text
// Postgres array columns (e.g. offers.scope_ids) take an array literal, json columns take JSON text
const normalise = (v, isArray) => {
  if (v === null || v === undefined) return v ?? null;
  if (isArray && Array.isArray(v)) return `{${v.map((x) => (x === null ? 'NULL' : `"${String(x).replace(/["\\]/g, '\\$&')}"`)).join(',')}}`;
  return typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v;
};

async function importAll(dump) {
  if (!dump || dump.app !== 'BikriPro' || !dump.tables) throw Object.assign(new Error('Not a valid BikriPro backup file'), { status: 400 });
  const known = TABLE_ORDER.filter((t) => Array.isArray(dump.tables[t]));
  if (!known.includes('users') || dump.tables.users.length === 0) {
    throw Object.assign(new Error('Backup has no users — refusing to restore (you would be locked out)'), { status: 400 });
  }
  const counts = {};
  const arrayCols = new Set((await query("SELECT table_name || '.' || column_name AS k FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'ARRAY'")).map((r) => r.k));
  await transaction(async (conn) => {
    // All foreign keys are DEFERRABLE: check them once at COMMIT, so tables can
    // be emptied and refilled in any order.
    await conn.query('SET CONSTRAINTS ALL DEFERRED');
    // keep this server's signing secrets (they are never part of a backup)
    const keep = await conn.query("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('jwt_secret','cron_secret')");
    // Backups made before Product Setup existed have no product_attributes: keep the current ones.
    const clear = TABLE_ORDER.filter((t) => t !== 'product_attributes' || known.includes(t));
    await conn.query(`TRUNCATE ${clear.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY`);
    for (const t of known) {
      const rows = dump.tables[t];
      counts[t] = rows.length;
      if (!rows.length) continue;
      // New products get a branch_stock row from a trigger; the backup's own rows replace them
      if (t === 'branch_stock') await conn.query('DELETE FROM branch_stock');
      const cols = Object.keys(rows[0]).filter((c) => /^[a-z_][a-z0-9_]*$/.test(c));
      const colSql = cols.map((c) => `"${c}"`).join(',');
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r) => cols.map((c) => normalise(r[c], arrayCols.has(`${t}.${c}`))));
        await conn.query(`INSERT INTO "${t}" (${colSql}) VALUES ?`, [chunk]);
      }
      if (t === 'settings') {
        await conn.query("DELETE FROM settings WHERE setting_key IN ('jwt_secret','cron_secret')");
      }
      // Move identity counters past the restored ids
      if (cols.includes('id')) {
        await conn.query(`SELECT setval(pg_get_serial_sequence('public.${t}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${t}"), 1), (SELECT COUNT(*) > 0 FROM "${t}"))`);
      }
    }
    // Older backups have no branches: put everything in a main branch
    await conn.query('SELECT bp_branch_backfill()');
    for (const k of keep) {
      await conn.query('INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value', [k.setting_key, k.setting_value]);
    }
  });
  return counts;
}

/** Module -> ordered list of SQL statements that wipe it. */
const RESET_PLANS = {
  sales: [
    'DELETE FROM sale_return_items', 'DELETE FROM sale_returns', 'DELETE FROM sale_payments',
    'DELETE FROM sale_items', 'DELETE FROM held_invoices', 'DELETE FROM loyalty_transactions',
    'DELETE FROM customer_collections',
    "DELETE FROM account_transactions WHERE ref_type IN ('sale','sale_return','collection')",
    "DELETE FROM ledger_adjustments WHERE party_type='customer' AND ref_type IN ('sale','collection')",
    'DELETE FROM online_order_items', 'DELETE FROM online_orders',
    'UPDATE sale_returns SET exchange_sale_id = NULL', 'UPDATE sales SET exchange_return_id = NULL',
    'DELETE FROM sales', 'DELETE FROM cash_sessions',
    'UPDATE customers SET loyalty_points = 0, total_purchase = 0',
    "DELETE FROM number_sequences WHERE name IN ('sale','sale_return','collection','hold','quotation','cash_session','online_order')",
  ],
  purchases: [
    'DELETE FROM purchase_return_items', 'DELETE FROM purchase_returns', 'DELETE FROM purchase_payments',
    'DELETE FROM purchase_items', 'DELETE FROM supplier_payments',
    'UPDATE purchases SET po_id = NULL', 'DELETE FROM purchase_order_items', 'DELETE FROM purchase_orders',
    "DELETE FROM account_transactions WHERE ref_type IN ('purchase','purchase_return','supplier_payment')",
    'DELETE FROM purchases',
    "DELETE FROM number_sequences WHERE name IN ('purchase','purchase_return','supplier_payment')",
  ],
  customers: [
    "DELETE FROM account_transactions WHERE ref_type = 'collection'",
    'DELETE FROM customer_collections', 'DELETE FROM loyalty_transactions',
    "DELETE FROM ledger_adjustments WHERE party_type = 'customer'",
    'UPDATE sales SET customer_id = NULL', 'UPDATE sale_returns SET customer_id = NULL',
    'UPDATE held_invoices SET customer_id = NULL', 'UPDATE sms_logs SET customer_id = NULL',
    'DELETE FROM customer_contacts', 'DELETE FROM customers WHERE NOT is_walk_in',
    'UPDATE customers SET loyalty_points = 0, total_purchase = 0, opening_balance = 0',
  ],
  suppliers: [
    "DELETE FROM account_transactions WHERE ref_type = 'supplier_payment'",
    'DELETE FROM supplier_payments', "DELETE FROM ledger_adjustments WHERE party_type = 'supplier'",
    'UPDATE purchases SET supplier_id = NULL, po_id = NULL', 'UPDATE purchase_returns SET supplier_id = NULL',
    'DELETE FROM purchase_order_items', 'DELETE FROM purchase_orders',
    'DELETE FROM supplier_contacts', 'DELETE FROM suppliers',
  ],
  products: [
    'UPDATE sale_items SET variant_id = NULL', 'UPDATE purchase_items SET variant_id = NULL',
    'UPDATE sale_return_items SET variant_id = NULL', 'UPDATE purchase_return_items SET variant_id = NULL',
    'DELETE FROM stock_adjustments', 'DELETE FROM stock_count_items', 'DELETE FROM stock_counts', 'DELETE FROM purchase_order_items',
    'DELETE FROM stock_transfer_items', 'DELETE FROM stock_transfers', 'DELETE FROM branch_stock',
    'DELETE FROM online_order_items', "UPDATE online_orders SET status = 'cancelled' WHERE status IN ('new','confirmed','packed')",
    'DELETE FROM price_history', 'DELETE FROM product_variants', 'DELETE FROM products',
    "DELETE FROM number_sequences WHERE name IN ('stock_adjustment','stock_count','stock_transfer')",
  ],
  expenses: ["DELETE FROM account_transactions WHERE ref_type = 'expense'", 'DELETE FROM expenses'],
  activity_logs: ['DELETE FROM activity_logs'],
  staff: [
    "DELETE FROM account_transactions WHERE ref_type = 'staff_advance'",
    'DELETE FROM employee_advances', 'DELETE FROM salary_payments', 'DELETE FROM attendance',
    'UPDATE sales SET salesperson_id = NULL', 'DELETE FROM employees',
  ],
  sms_logs: ['DELETE FROM sms_logs'],
};

const RESET_MODULES = Object.keys(RESET_PLANS);

async function resetModules(modules) {
  const bad = modules.filter((m) => !RESET_PLANS[m]);
  if (bad.length) throw Object.assign(new Error(`Unknown module(s): ${bad.join(', ')}`), { status: 400 });
  // Order matters: transactional data before master data.
  const order = ['sales', 'purchases', 'staff', 'expenses', 'customers', 'suppliers', 'products', 'sms_logs', 'activity_logs'];
  const run = order.filter((m) => modules.includes(m));
  await transaction(async (conn) => {
    for (const m of run) for (const sql of RESET_PLANS[m]) await conn.query(sql);
  });
  return run;
}

export { exportAll, importAll, resetModules, RESET_MODULES, TABLE_ORDER };
