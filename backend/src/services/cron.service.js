/**
 * Scheduled jobs (Asia/Dhaka):
 *  - Birthday wishes: once a day, SMS every customer whose DOB is today
 *    (skips anyone already wished this year).
 *  - Due reminders: SMS customers whose next payment date is today (and
 *    overdue ones every few days).
 * Due-collection reminders are query-driven (see dashboard controller), so
 * they appear on the dashboard the moment the due date arrives — no job needed.
 */
import env from '../config/env.js';
import { query } from '../config/db.js';
import * as settings from './settings.service.js';
import { sendSms, render } from './sms.service.js';

async function runBirthdayWishes() {
  const s = await settings.getAll();
  if (s.sms_birthday !== '1') return { sent: 0, skipped: 'disabled' };
  const customers = await query(
    `SELECT c.id, c.name, c.phone FROM customers c
     WHERE c.is_active = true AND c.dob IS NOT NULL AND c.phone IS NOT NULL
       AND to_char(c.dob, 'MM-DD') = to_char(bp_today(), 'MM-DD')
       AND NOT EXISTS (SELECT 1 FROM sms_logs l WHERE l.customer_id = c.id AND l.purpose = 'birthday'
                       AND extract(year from l.created_at) = extract(year from bp_today()) AND l.status = 'sent')`
  );
  let sent = 0;
  for (const c of customers) {
    const message = render(s.sms_birthday_template, { name: c.name, shop: s.shop_name });
    const r = await sendSms({ phone: c.phone, message, purpose: 'birthday', customerId: c.id });
    if (r.status === 'sent') sent += 1;
  }
  return { sent, total: customers.length };
}

/**
 * Due reminders: SMS each customer whose payment date is today; overdue dues are
 * reminded again every `sms_due_repeat_days` days. At most one reminder per customer per day.
 */
async function runDueReminders({ force = false, customerId = null } = {}) {
  const s = await settings.getAll();
  if (!force && s.sms_due_reminder !== '1') return { sent: 0, skipped: 'disabled' };
  const repeat = Math.max(parseInt(s.sms_due_repeat_days, 10) || 0, 0);
  const params = [];
  let extra = '';
  if (customerId) { extra = ' AND c.id = ?'; params.push(customerId); }
  const rows = await query(
    `SELECT c.id, c.name, c.phone, ROUND(b.balance, 2) AS due, MIN(s.next_payment_date) AS due_date
     FROM customers c JOIN v_customer_balance b ON b.customer_id = c.id JOIN sales s ON s.customer_id = c.id AND s.due_amount > 0
     WHERE c.is_active AND NOT c.is_walk_in AND c.phone IS NOT NULL AND b.balance > 0 ${extra}
     GROUP BY c.id, c.name, c.phone, b.balance
     HAVING MIN(s.next_payment_date) IS NOT NULL AND (${force ? (customerId ? 'TRUE' : 'MIN(s.next_payment_date) <= bp_today()') : `MIN(s.next_payment_date) = bp_today()
        OR (${repeat} > 0 AND MIN(s.next_payment_date) < bp_today() AND ((bp_today() - MIN(s.next_payment_date)) % ${repeat}) = 0)`})
        AND NOT EXISTS (SELECT 1 FROM sms_logs l WHERE l.customer_id = c.id AND l.purpose = 'due_reminder' AND l.status = 'sent' AND DATE(l.created_at) = bp_today())`,
    params);
  let sent = 0;
  for (const c of rows) {
    const message = render(s.sms_due_template, { name: c.name, shop: s.shop_name, due: c.due, date: c.due_date });
    const r = await sendSms({ phone: c.phone, message, purpose: 'due_reminder', customerId: c.id });
    if (r.status === 'sent') sent += 1;
  }
  return { sent, total: rows.length };
}

/** SMS yesterday's summary to the owner (owner_daily_sms + owner_phone). */
async function runOwnerSummary({ force = false, date = null } = {}) {
  const s = await settings.getAll();
  if (!s.owner_phone || (!force && s.owner_daily_sms !== '1')) return { skipped: true };
  const { dailySummary } = await import('../controllers/accounting.controller.js');
  let d = date;
  if (!d) {
    const [{ y }] = await query("SELECT (bp_today() - 1)::text AS y");
    d = y;
  }
  const x = await dailySummary(d);
  const fmt = (n) => Math.round(Number(n)).toLocaleString('en-IN');
  const cash = x.cash_variance ? ` Cash ${x.cash_variance < 0 ? 'short' : 'over'} ${fmt(Math.abs(x.cash_variance))}.` : '';
  const message = `${s.shop_name} ${d}: Sale ${fmt(x.sales)} Tk (${x.bills} bills), Profit ${fmt(x.gross)}, Expense ${fmt(x.expenses)}, Collected ${fmt(x.collected)}, Return ${fmt(x.returns)}, New due ${fmt(x.due)}.${cash}`;
  const r = await sendSms({ phone: s.owner_phone, message, purpose: 'owner' });
  return { status: r.status, message };
}

/** Everything that runs once a day. */
async function runDailyJobs() {
  const [birthdays, dueReminders, owner] = await Promise.all([
    runBirthdayWishes().catch((e) => ({ error: e.message })),
    runDueReminders().catch((e) => ({ error: e.message })),
    runOwnerSummary().catch((e) => ({ error: e.message })),
  ]);
  return { birthdays, due_reminders: dueReminders, owner_summary: owner };
}

async function startCron() {
  const { default: cron } = await import('node-cron');
  if (!cron.validate(env.birthdayCron)) {
    console.warn('[cron] invalid BIRTHDAY_SMS_CRON, birthday job disabled');
    return;
  }
  cron.schedule(env.birthdayCron, () => {
    runDailyJobs()
      .then((r) => console.log('[cron] daily jobs', r))
      .catch((e) => console.error('[cron] birthday job failed', e.message));
  }, { timezone: env.timezone });
  console.log(`[cron] birthday SMS scheduled "${env.birthdayCron}" (${env.timezone})`);
}

export { startCron, runBirthdayWishes, runDueReminders, runDailyJobs, runOwnerSummary };
