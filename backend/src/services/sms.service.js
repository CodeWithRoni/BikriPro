/**
 * SMS module. Every message is written to sms_logs; delivery goes through the
 * configured provider. Default provider "log" only records the message, so
 * the app works out-of-the-box without a gateway account.
 *
 * To plug in a Bangladeshi gateway (BulkSMSBD, SSL Wireless, Alpha SMS…),
 * set SMS_PROVIDER + SMS_API_URL + SMS_API_KEY + SMS_SENDER_ID in .env.
 */
const env = require('../config/env');
const { query } = require('../config/db');
const settings = require('./settings.service');

function render(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? vars[k] : ''));
}

/** Normalise BD numbers to 8801XXXXXXXXX. Returns null if invalid. */
function normalisePhone(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/[^\d]/g, '');
  if (p.startsWith('01') && p.length === 11) p = `88${p}`;
  if (p.startsWith('1') && p.length === 10) p = `880${p}`;
  return /^8801[3-9]\d{8}$/.test(p) ? p : null;
}

async function dispatch(phone, message) {
  const { provider, apiUrl, apiKey, senderId } = env.sms;
  if (provider === 'log' || !apiUrl) return { status: 'sent', ref: 'log-only' };

  let url;
  let init = {};
  if (provider === 'bulksmsbd') {
    const qs = new URLSearchParams({ api_key: apiKey, type: 'text', number: phone, senderid: senderId, message });
    url = `${apiUrl}?${qs}`;
  } else {
    // generic JSON POST gateway
    url = apiUrl;
    init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ to: phone, sender_id: senderId, message }),
    };
  }
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Gateway HTTP ${res.status}: ${text.slice(0, 150)}`);
  return { status: 'sent', ref: text.slice(0, 120) };
}

/** Send and log. Never throws. */
async function sendSms({ phone, message, purpose = 'custom', customerId = null }) {
  const to = normalisePhone(phone);
  const ins = await query(
    'INSERT INTO sms_logs (customer_id, phone, purpose, message, status) VALUES (?,?,?,?,?)',
    [customerId, to || String(phone || ''), purpose, message, to ? 'queued' : 'skipped']
  );
  if (!to) return { status: 'skipped', error: 'Invalid phone number' };
  try {
    const r = await dispatch(to, message);
    await query('UPDATE sms_logs SET status=?, provider_ref=? WHERE id=?', [r.status, r.ref, ins.insertId]);
    return r;
  } catch (e) {
    await query("UPDATE sms_logs SET status='failed', error=? WHERE id=?", [e.message.slice(0, 250), ins.insertId]);
    return { status: 'failed', error: e.message };
  }
}

async function sendSaleSms(sale, customer) {
  const s = await settings.getAll();
  if (s.sms_on_sale !== '1' || !customer?.phone || customer.is_walk_in) return null;
  const message = render(s.sms_sale_template, {
    name: customer.name, shop: s.shop_name, invoice: sale.invoice_no,
    total: sale.grand_total, paid: sale.paid_amount, due: sale.due_amount,
    points: customer.loyalty_points ?? '',
  });
  const r = await sendSms({ phone: customer.phone, message, purpose: 'sale', customerId: customer.id });
  if (r.status === 'sent') await query('UPDATE sales SET sms_sent = true WHERE id = ?', [sale.id]);
  return r;
}

module.exports = { render, normalisePhone, sendSms, sendSaleSms };
