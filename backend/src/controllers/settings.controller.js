/**
 * Shop Setup / Admin Settings — shop info, loyalty & SMS config, security PIN,
 * database Export / Import / Reset.
 */
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import bcrypt from 'bcryptjs';
import * as settings from '../services/settings.service.js';
import { one } from '../config/db.js';
import * as backup from '../services/backup.service.js';
import { saveShopLogo } from '../services/image.service.js';
import { sendSms } from '../services/sms.service.js';
import { runBirthdayWishes, runDueReminders, runDailyJobs } from '../services/cron.service.js';
import { asyncHandler, badRequest, forbidden, requireFields } from '../utils/http.js';
import { logActivity } from '../utils/activity.js';

export const getSettings = asyncHandler(async (req, res) => {
  const all = await settings.getAll();
  all.security_pin_set = Boolean(await settings.get('security_pin_hash'));
  res.json(all);
});

/** Public subset for the login screen / receipts (no auth). */
export const publicSettings = asyncHandler(async (req, res) => {
  const s = await settings.getAll();
  res.json({ shop_name: s.shop_name, shop_logo: s.shop_logo, shop_address: s.shop_address, shop_phone: s.shop_phone, currency_symbol: s.currency_symbol });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const allowed = Object.keys(settings.DEFAULTS);
  const body = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  if (body.loyalty_spend_per_point !== undefined && !(Number(body.loyalty_spend_per_point) > 0)) throw badRequest('Spend per point must be greater than 0');
  if (body.loyalty_point_value !== undefined && !(Number(body.loyalty_point_value) >= 0)) throw badRequest('Point value cannot be negative');
  await settings.setMany(body);
  await logActivity(req, 'settings', 'update', null, Object.keys(body));
  res.json(await settings.getAll());
});

export const uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('No image uploaded');
  const path = await saveShopLogo(req.file.buffer);
  await settings.setMany({ shop_logo: path });
  await logActivity(req, 'settings', 'logo');
  res.json({ shop_logo: path });
});

// ---------- Security PIN (protects reset/restore) ----------
async function verifyPin(pin) {
  const hash = await settings.get('security_pin_hash');
  if (!hash) throw badRequest('Set a security PIN first in Shop Setup → Security');
  if (!pin || !(await bcrypt.compare(String(pin), hash))) throw forbidden('Wrong security PIN');
}

export const setPin = asyncHandler(async (req, res) => {
  requireFields(req.body, ['new_pin', 'password']);
  if (!/^\d{4,8}$/.test(String(req.body.new_pin))) throw badRequest('PIN must be 4–8 digits');
  // Re-confirm the admin's password before changing the PIN
  const u = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(req.body.password, u.password_hash))) throw forbidden('Wrong password');
  await settings.setSecret('security_pin_hash', await bcrypt.hash(String(req.body.new_pin), 10));
  await logActivity(req, 'settings', 'set_pin');
  res.json({ message: 'Security PIN updated' });
});

// ---------- Export / Import / Reset ----------
export const exportDb = asyncHandler(async (req, res) => {
  const dump = await backup.exportAll();
  await logActivity(req, 'backup', 'export', null, { tables: Object.keys(dump.tables).length });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="bikripro-backup-${stamp}.json"`);
  res.send(JSON.stringify(dump));
});

export const importDb = asyncHandler(async (req, res) => {
  await verifyPin(req.body.pin);
  if (!req.file) throw badRequest('Choose a backup file');
  let dump;
  try { dump = JSON.parse(req.file.buffer.toString('utf8')); } catch { throw badRequest('Backup file is not valid JSON'); }
  const counts = await backup.importAll(dump);
  await logActivity(req, 'backup', 'import', null, { from: dump.exported_at, counts });
  res.json({ message: 'Database restored', exported_at: dump.exported_at, counts });
});

export const resetModules = (req, res) => res.json(backup.RESET_MODULES);

/** POST /settings/reset { pin, modules: ['customers', ...], confirm_text: 'RESET' } */
export const resetDb = asyncHandler(async (req, res) => {
  const { pin, modules, confirm_text: confirmText } = req.body;
  if (confirmText !== 'RESET') throw badRequest('Type RESET to confirm');
  if (!Array.isArray(modules) || !modules.length) throw badRequest('Select at least one module');
  await verifyPin(pin);
  const done = await backup.resetModules(modules);
  await logActivity(req, 'backup', 'reset', null, { modules: done });
  res.json({ message: 'Reset complete', modules: done });
});

// ---------- SMS tools ----------
export const testSms = asyncHandler(async (req, res) => {
  requireFields(req.body, ['phone']);
  const s = await settings.getAll();
  const r = await sendSms({ phone: req.body.phone, message: req.body.message || `Test SMS from ${s.shop_name} (BikriPro)`, purpose: 'custom' });
  res.json(r);
});

export const runBirthdays = asyncHandler(async (req, res) => {
  const r = await runBirthdayWishes();
  await logActivity(req, 'sms', 'birthday_run', null, r);
  res.json(r);
});

/** POST /cron/birthdays — called daily by Supabase pg_cron with header x-cron-secret. */
export const cronBirthdays = asyncHandler(async (req, res) => {
  const given = Buffer.from(String(req.get('x-cron-secret') || ''));
  const expected = Buffer.from(await settings.appSecret('cron_secret'));
  if (!expected.length || given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw forbidden('Invalid cron secret');
  }
  res.json(await runDailyJobs()); // birthday wishes + due reminders (the daily pg_cron job calls this)
});

/** POST /settings/sms/due-reminders { customer_id? } — send due reminders now */
export const runDueRemindersNow = asyncHandler(async (req, res) => {
  res.json(await runDueReminders({ force: true, customerId: req.body?.customer_id || null }));
});
