import { badRequest } from '../utils/http.js';

/** Record money movement in an account (cash book). */
async function recordTxn(conn, { accountId, direction, amount, refType, refId = null, note = null, date, userId = null }) {
  if (!amount || amount <= 0) return;
  const acc = await conn.one('SELECT id, is_active FROM accounts WHERE id = ?', [accountId]);
  if (!acc) throw badRequest('Selected cash/bank/MFS account does not exist');
  await conn.query(
    `INSERT INTO account_transactions (account_id, direction, amount, ref_type, ref_id, note, txn_date, user_id)
     VALUES (?,?,?,?,?,?,?,?)`,
    [accountId, direction, amount, refType, refId, note, date, userId]
  );
}

async function defaultCashAccount(conn) {
  const acc = (await conn.one("SELECT id FROM accounts WHERE type='cash' AND is_active=true ORDER BY is_default DESC, id LIMIT 1"));
  if (!acc) throw badRequest('No cash account configured. Add one in Cash, Bank & MFS.');
  return acc.id;
}

/** Map account type -> payment method enum used on sale_payments. */
const methodFor = (type) => ({ cash: 'cash', mfs: 'mfs', card: 'card', bank: 'bank' }[type] || 'cash');

export { recordTxn, defaultCashAccount, methodFor };
