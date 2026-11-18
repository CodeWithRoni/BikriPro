/**
 * Scheduled jobs (Asia/Dhaka):
 *  - Birthday wishes: once a day, SMS every customer whose DOB is today
 *    (skips anyone already wished this year).
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

async function startCron() {
  const { default: cron } = await import('node-cron');
  if (!cron.validate(env.birthdayCron)) {
    console.warn('[cron] invalid BIRTHDAY_SMS_CRON, birthday job disabled');
    return;
  }
  cron.schedule(env.birthdayCron, () => {
    runBirthdayWishes()
      .then((r) => console.log('[cron] birthday wishes', r))
      .catch((e) => console.error('[cron] birthday job failed', e.message));
  }, { timezone: env.timezone });
  console.log(`[cron] birthday SMS scheduled "${env.birthdayCron}" (${env.timezone})`);
}

export { startCron, runBirthdayWishes };
