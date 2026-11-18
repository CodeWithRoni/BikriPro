import { query } from '../config/db.js';

/** Defaults are returned for any key not yet saved in the settings table. */
const DEFAULTS = {
  shop_name: 'BikriPro Fashion',
  shop_address: '',
  shop_phone: '',
  shop_email: '',
  shop_logo: '',
  shop_bin: '',                     // VAT BIN
  currency_symbol: '৳',
  invoice_footer: 'Thank you for shopping with us!',
  vat_percent: '0',
  allow_negative_stock: '0',
  receipt_width_mm: '80',
  // Loyalty
  loyalty_enabled: '1',
  loyalty_spend_per_point: '100',   // spend X BDT => 1 point
  loyalty_point_value: '1',         // 1 point = Y BDT when redeemed
  loyalty_min_redeem_points: '50',
  // SMS
  sms_on_sale: '1',
  sms_birthday: '1',
  sms_sale_template: 'Dear {name}, thanks for shopping at {shop}. Invoice {invoice}, Total {total} Tk, Paid {paid} Tk, Due {due} Tk. Points: {points}',
  sms_birthday_template: 'Happy Birthday {name}! 🎉 Wishing you a wonderful year from all of us at {shop}.',
  sms_due_template: 'Dear {name}, a friendly reminder from {shop}: your due of {due} Tk was scheduled for {date}.',
  sms_due_reminder: '1',             // auto SMS on the next payment date
  sms_due_repeat_days: '3',          // repeat for overdue dues every N days (0 = only on the date)
  sms_receipt_template: 'Dear {name}, thanks for shopping at {shop}. Invoice {invoice}, Total {total} Tk. View receipt: {link}',
  public_app_url: 'https://codewithroni.github.io/BikriPro/app/', // where shared receipt links open
  shift_required: '0',               // 1 = cashier must open a shift before selling
};

// Keys never sent to the client
const SECRET_KEYS = ['security_pin_hash', 'jwt_secret', 'cron_secret'];

async function getAll({ includeSecret = false } = {}) {
  const rows = await query('SELECT setting_key, setting_value FROM settings');
  const out = { ...DEFAULTS };
  for (const r of rows) out[r.setting_key] = r.setting_value;
  if (!includeSecret) for (const k of SECRET_KEYS) delete out[k];
  return out;
}

async function get(key) {
  const all = await getAll({ includeSecret: true });
  return all[key];
}

async function setMany(obj) {
  const entries = Object.entries(obj).filter(([k]) => !SECRET_KEYS.includes(k));
  for (const [k, v] of entries) {
    await query(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = bp_now()',
      [k, v === null || v === undefined ? null : String(v)]
    );
  }
}

async function setSecret(key, value) {
  await query(
    'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = bp_now()',
    [key, value]
  );
}

/**
 * Server-only random secret stored in the settings table (created on first
 * use if missing, e.g. after a restore). Cached in memory.
 */
const secretCache = {};
async function appSecret(key) {
  if (secretCache[key]) return secretCache[key];
  await query(
    `INSERT INTO settings (setting_key, setting_value)
     VALUES (?, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
     ON CONFLICT (setting_key) DO NOTHING`,
    [key]
  );
  const row = (await query('SELECT setting_value FROM settings WHERE setting_key = ?', [key]))[0];
  secretCache[key] = row.setting_value;
  return secretCache[key];
}

export { DEFAULTS, SECRET_KEYS, getAll, get, setMany, setSecret, appSecret };
