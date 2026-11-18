/**
 * Cash, Bank & MFS accounts · Supplier Payments · Customer Collections · Expenses
 */
const { query, one, transaction } = require('../config/db');
const { asyncHandler, requireFields, badRequest, notFound, paging, money, today } = require('../utils/http');
const { logActivity } = require('../utils/activity');
const { nextNumber } = require('../utils/numbering');
const { recordTxn } = require('../services/accounts.service');
const { allocateFifo } = require('./parties.controller');

const BALANCE_SQL = `a.opening_balance
  + COALESCE((SELECT SUM(IF(t.direction='in', t.amount, -t.amount)) FROM account_transactions t WHERE t.account_id = a.id), 0)`;

// ---------- Accounts ----------
exports.listAccounts = asyncHandler(async (req, res) => {
  const rows = await query(`SELECT a.*, ROUND(${BALANCE_SQL}, 2) AS balance FROM accounts a ORDER BY a.is_active DESC, FIELD(a.type,'cash','mfs','bank','card'), a.name`);
  const totals = rows.filter((r) => r.is_active).reduce((t, r) => { t[r.type] = money((t[r.type] || 0) + r.balance); t.all = money((t.all || 0) + r.balance); return t; }, {});
  res.json({ data: rows, totals });
});

exports.createAccount = asyncHandler(async (req, res) => {
  requireFields(req.body, ['name', 'type']);
  const b = req.body;
  if (!['cash', 'bank', 'mfs', 'card'].includes(b.type)) throw badRequest('Invalid account type');
  const id = await transaction(async (conn) => {
    if (b.is_default) await conn.query('UPDATE accounts SET is_default = 0 WHERE type = ?', [b.type]);
    const r = await conn.q('INSERT INTO accounts (name, type, provider, account_no, branch, opening_balance, is_default) VALUES (?,?,?,?,?,?,?)',
      [b.name, b.type, b.provider || null, b.account_no || null, b.branch || null, money(b.opening_balance), b.is_default ? 1 : 0]);
    return r.insertId;
  });
  await logActivity(req, 'accounts', 'create', id, { name: b.name, type: b.type });
  res.status(201).json({ id });
});

exports.updateAccount = asyncHandler(async (req, res) => {
  const a = await one('SELECT * FROM accounts WHERE id = ?', [req.params.id]);
  if (!a) throw notFound();
  const b = { ...a, ...req.body };
  await transaction(async (conn) => {
    if (req.body.is_default) await conn.query('UPDATE accounts SET is_default = 0 WHERE type = ?', [b.type]);
    await conn.query('UPDATE accounts SET name=?, provider=?, account_no=?, branch=?, opening_balance=?, is_default=?, is_active=? WHERE id=?',
      [b.name, b.provider, b.account_no, b.branch, money(b.opening_balance), b.is_default ? 1 : 0, b.is_active ? 1 : 0, a.id]);
  });
  await logActivity(req, 'accounts', 'update', a.id, req.body);
  res.json({ message: 'Saved' });
});

/** GET /accounts/:id/transactions?from=&to= — account statement with running balance */
exports.accountStatement = asyncHandler(async (req, res) => {
  const a = await one('SELECT * FROM accounts WHERE id = ?', [req.params.id]);
  if (!a) throw notFound();
  const { from, to } = req.query;
  let opening = Number(a.opening_balance);
  if (from) {
    const [{ s }] = await query("SELECT COALESCE(SUM(IF(direction='in', amount, -amount)),0) AS s FROM account_transactions WHERE account_id = ? AND txn_date < ?", [a.id, from]);
    opening += Number(s);
  }
  const params = [a.id];
  let where = 'account_id = ?';
  if (from) { where += ' AND txn_date >= ?'; params.push(from); }
  if (to) { where += ' AND txn_date <= ?'; params.push(to); }
  const rows = await query(`SELECT t.*, u.name AS user_name FROM account_transactions t LEFT JOIN users u ON u.id = t.user_id WHERE ${where} ORDER BY txn_date, id`, params);
  let run = money(opening);
  const entries = rows.map((r) => { run = money(run + (r.direction === 'in' ? r.amount : -r.amount)); return { ...r, balance: run }; });
  res.json({ account: a, opening_balance: money(opening), entries, closing_balance: run });
});

/** POST /accounts/transfer { from_account_id, to_account_id, amount, note, date } e.g. cash → bKash */
exports.transfer = asyncHandler(async (req, res) => {
  requireFields(req.body, ['from_account_id', 'to_account_id', 'amount']);
  const { from_account_id: fromId, to_account_id: toId, note = null } = req.body;
  const amount = money(req.body.amount);
  if (fromId === toId) throw badRequest('Choose two different accounts');
  if (amount <= 0) throw badRequest('Amount must be positive');
  const date = req.body.date || today();
  await transaction(async (conn) => {
    await recordTxn(conn, { accountId: fromId, direction: 'out', amount, refType: 'transfer', note: note || 'Transfer out', date, userId: req.user.id });
    await recordTxn(conn, { accountId: toId, direction: 'in', amount, refType: 'transfer', note: note || 'Transfer in', date, userId: req.user.id });
  });
  await logActivity(req, 'accounts', 'transfer', null, { fromId, toId, amount });
  res.status(201).json({ message: 'Transferred' });
});

/** POST /accounts/:id/entry { direction: in|out, amount, note } — owner deposit / withdrawal */
exports.manualEntry = asyncHandler(async (req, res) => {
  requireFields(req.body, ['direction', 'amount']);
  const amount = money(req.body.amount);
  if (amount <= 0) throw badRequest('Amount must be positive');
  await transaction((conn) => recordTxn(conn, {
    accountId: req.params.id, direction: req.body.direction === 'out' ? 'out' : 'in', amount,
    refType: req.body.direction === 'out' ? 'withdraw' : 'deposit', note: req.body.note || null, date: req.body.date || today(), userId: req.user.id,
  }));
  await logActivity(req, 'accounts', req.body.direction === 'out' ? 'withdraw' : 'deposit', req.params.id, { amount });
  res.status(201).json({ message: 'Saved' });
});

// ---------- Supplier Payments (Payment menu) ----------
/** POST /payments { supplier_id, account_id, amount, payment_date?, purchase_id?, trx_ref?, note? } */
exports.createPayment = asyncHandler(async (req, res) => {
  requireFields(req.body, ['supplier_id', 'account_id', 'amount']);
  const b = req.body;
  const amount = money(b.amount);
  if (amount <= 0) throw badRequest('Amount must be positive');
  const date = b.payment_date || today();
  const result = await transaction(async (conn) => {
    const sup = await conn.one('SELECT id, name FROM suppliers WHERE id = ?', [b.supplier_id]);
    if (!sup) throw notFound('Supplier not found');
    const no = await nextNumber(conn, 'supplier_payment');
    const r = await conn.q('INSERT INTO supplier_payments (voucher_no, supplier_id, purchase_id, account_id, amount, payment_date, trx_ref, note, user_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [no, sup.id, b.purchase_id || null, b.account_id, amount, date, b.trx_ref || null, b.note || null, req.user.id]);
    await recordTxn(conn, { accountId: b.account_id, direction: 'out', amount, refType: 'supplier_payment', refId: r.insertId, note: `${no} — ${sup.name}`, date, userId: req.user.id });
    const advance = await allocateFifo(conn, 'supplier', sup.id, amount, { invoiceId: b.purchase_id });
    return { id: r.insertId, voucher_no: no, advance };
  });
  await logActivity(req, 'payments', 'create', result.id, { ...result, amount });
  res.status(201).json(result);
});

exports.listPayments = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const where = ['1=1'];
  const params = [];
  if (req.query.from) { where.push('x.payment_date >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('x.payment_date <= ?'); params.push(req.query.to); }
  if (req.query.supplier_id) { where.push('x.supplier_id = ?'); params.push(req.query.supplier_id); }
  const base = `FROM supplier_payments x JOIN suppliers s ON s.id = x.supplier_id JOIN accounts a ON a.id = x.account_id
    LEFT JOIN purchases p ON p.id = x.purchase_id LEFT JOIN users u ON u.id = x.user_id WHERE ${where.join(' AND ')}`;
  const [sum] = await query(`SELECT COUNT(*) AS total, COALESCE(SUM(x.amount),0) AS amount ${base}`, params);
  const rows = await query(`SELECT x.*, s.name AS supplier_name, a.name AS account_name, p.invoice_no, u.name AS user_name ${base} ORDER BY x.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows, summary: sum, page, limit });
});

/** GET /payments/payables — suppliers we owe, biggest first */
exports.payables = asyncHandler(async (req, res) => {
  res.json(await query(
    `SELECT s.id, s.name, s.company, s.phone, ROUND(b.balance,2) AS balance,
       (SELECT MAX(payment_date) FROM supplier_payments x WHERE x.supplier_id = s.id) AS last_payment
     FROM suppliers s JOIN v_supplier_balance b ON b.supplier_id = s.id WHERE s.is_active = 1 AND b.balance > 0 ORDER BY b.balance DESC`));
});

// ---------- Customer Collections (Collection menu) ----------
/**
 * POST /collections { customer_id, account_id, amount, collection_date?, sale_id?,
 *                     waive_amount?, next_payment_date?, trx_ref?, note? }
 * waive_amount books a "round_off" deduction on the customer ledger (e.g. forgive the last 20 Tk).
 */
exports.createCollection = asyncHandler(async (req, res) => {
  requireFields(req.body, ['customer_id', 'account_id', 'amount']);
  const b = req.body;
  const amount = money(b.amount);
  const waive = money(b.waive_amount || 0);
  if (amount <= 0) throw badRequest('Amount must be positive');
  const date = b.collection_date || today();
  const result = await transaction(async (conn) => {
    const cust = await conn.one('SELECT id, name FROM customers WHERE id = ?', [b.customer_id]);
    if (!cust) throw notFound('Customer not found');
    const no = await nextNumber(conn, 'collection');
    const r = await conn.q(
      'INSERT INTO customer_collections (receipt_no, customer_id, sale_id, account_id, amount, collection_date, next_payment_date, trx_ref, note, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [no, cust.id, b.sale_id || null, b.account_id, amount, date, b.next_payment_date || null, b.trx_ref || null, b.note || null, req.user.id]);
    await recordTxn(conn, { accountId: b.account_id, direction: 'in', amount, refType: 'collection', refId: r.insertId, note: `${no} — ${cust.name}`, date, userId: req.user.id });
    if (waive > 0) {
      await conn.query(
        "INSERT INTO ledger_adjustments (party_type, party_id, effect, reason, amount, ref_type, ref_id, note, adj_date, user_id) VALUES ('customer', ?, 'deduction', 'round_off', ?, 'collection', ?, ?, ?, ?)",
        [cust.id, waive, r.insertId, `Waived on ${no}`, date, req.user.id]);
    }
    const advance = await allocateFifo(conn, 'customer', cust.id, money(amount + waive), {
      invoiceId: b.sale_id, nextPaymentDate: b.next_payment_date === undefined ? undefined : b.next_payment_date,
    });
    return { id: r.insertId, receipt_no: no, advance };
  });
  await logActivity(req, 'collections', 'create', result.id, { ...result, amount, waive });
  res.status(201).json(result);
});

exports.listCollections = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const where = ['1=1'];
  const params = [];
  if (req.query.from) { where.push('x.collection_date >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('x.collection_date <= ?'); params.push(req.query.to); }
  if (req.query.customer_id) { where.push('x.customer_id = ?'); params.push(req.query.customer_id); }
  const base = `FROM customer_collections x JOIN customers c ON c.id = x.customer_id JOIN accounts a ON a.id = x.account_id
    LEFT JOIN sales s ON s.id = x.sale_id LEFT JOIN users u ON u.id = x.user_id WHERE ${where.join(' AND ')}`;
  const [sum] = await query(`SELECT COUNT(*) AS total, COALESCE(SUM(x.amount),0) AS amount ${base}`, params);
  const rows = await query(`SELECT x.*, c.name AS customer_name, c.phone AS customer_phone, a.name AS account_name, s.invoice_no, u.name AS user_name ${base} ORDER BY x.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows, summary: sum, page, limit });
});

/** GET /collections/receivables?area=&overdue=1 — customers who owe us */
exports.receivables = asyncHandler(async (req, res) => {
  const params = [];
  let extra = '';
  if (req.query.area) { extra += ' AND (c.area LIKE ? OR c.address LIKE ?)'; params.push(`%${req.query.area}%`, `%${req.query.area}%`); }
  const rows = await query(
    `SELECT c.id, c.name, c.phone, c.address, c.area, ROUND(b.balance,2) AS balance,
       (SELECT MIN(s.next_payment_date) FROM sales s WHERE s.customer_id = c.id AND s.due_amount > 0) AS next_payment_date,
       (SELECT MAX(x.collection_date) FROM customer_collections x WHERE x.customer_id = c.id) AS last_collection
     FROM customers c JOIN v_customer_balance b ON b.customer_id = c.id
     WHERE c.is_active = 1 AND b.balance > 0 ${extra} ORDER BY next_payment_date IS NULL, next_payment_date, b.balance DESC`, params);
  const t = today();
  const out = rows.map((r) => ({ ...r, overdue: !!r.next_payment_date && r.next_payment_date <= t }));
  res.json(req.query.overdue === '1' ? out.filter((r) => r.overdue) : out);
});

// ---------- Expenses ----------
exports.listExpenseCategories = asyncHandler(async (req, res) => res.json(await query('SELECT * FROM expense_categories ORDER BY name')));
exports.createExpenseCategory = asyncHandler(async (req, res) => {
  requireFields(req.body, ['name']);
  const r = await query('INSERT INTO expense_categories (name) VALUES (?)', [req.body.name.trim()]);
  res.status(201).json({ id: r.insertId });
});

exports.createExpense = asyncHandler(async (req, res) => {
  requireFields(req.body, ['account_id', 'amount']);
  const amount = money(req.body.amount);
  if (amount <= 0) throw badRequest('Amount must be positive');
  const date = req.body.expense_date || today();
  const id = await transaction(async (conn) => {
    const r = await conn.q('INSERT INTO expenses (category_id, account_id, amount, expense_date, note, user_id) VALUES (?,?,?,?,?,?)',
      [req.body.category_id || null, req.body.account_id, amount, date, req.body.note || null, req.user.id]);
    await recordTxn(conn, { accountId: req.body.account_id, direction: 'out', amount, refType: 'expense', refId: r.insertId, note: req.body.note || 'Expense', date, userId: req.user.id });
    return r.insertId;
  });
  await logActivity(req, 'expenses', 'create', id, { amount });
  res.status(201).json({ id });
});

exports.listExpenses = asyncHandler(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const where = ['1=1'];
  const params = [];
  if (req.query.from) { where.push('e.expense_date >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('e.expense_date <= ?'); params.push(req.query.to); }
  const base = `FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id JOIN accounts a ON a.id = e.account_id WHERE ${where.join(' AND ')}`;
  const [sum] = await query(`SELECT COALESCE(SUM(e.amount),0) AS amount ${base}`, params);
  const rows = await query(`SELECT e.*, ec.name AS category, a.name AS account_name ${base} ORDER BY e.expense_date DESC, e.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ data: rows, summary: sum, page, limit });
});
