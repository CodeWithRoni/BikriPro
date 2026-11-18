/**
 * Staff: employees, daily attendance, salary advances, monthly salary
 * (basic + commission + bonus − deduction − advance recovered), sales targets.
 * A salary payment is booked as an Expense ("Staff Salary") so Profit includes it.
 */
import { query, one, transaction } from '../config/db.js';
import { asyncHandler, requireFields, badRequest, notFound, money, today } from '../utils/http.js';
import { logActivity } from '../utils/activity.js';
import { recordTxn } from '../services/accounts.service.js';

const monthRange = (m) => {
  if (!/^\d{4}-\d{2}$/.test(m || '')) throw badRequest('Month must look like 2026-11');
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}`, days: last };
};
const thisMonth = () => today().slice(0, 7);

/** Net sales (after returns) of each employee in a date range: invoices they served as salesperson, or rang up with their login. */
async function salesBy(from, to) {
  const rows = await query(
    `SELECT e.id AS employee_id,
       COALESCE(SUM(s.grand_total), 0) AS sales,
       COUNT(s.id) AS invoices,
       COALESCE((SELECT SUM(r.total_amount) FROM sale_returns r JOIN sales s2 ON s2.id = r.sale_id
                 WHERE COALESCE(s2.salesperson_id, (SELECT id FROM employees e2 WHERE e2.user_id = s2.user_id)) = e.id
                   AND DATE(r.return_date) BETWEEN ? AND ?), 0) AS returns
     FROM employees e
     LEFT JOIN sales s ON s.status <> 'cancelled' AND DATE(s.sale_date) BETWEEN ? AND ?
       AND (s.salesperson_id = e.id OR (s.salesperson_id IS NULL AND e.user_id IS NOT NULL AND s.user_id = e.user_id))
     GROUP BY e.id`, [from, to, from, to]);
  return Object.fromEntries(rows.map((r) => [r.employee_id, { ...r, net: money(r.sales - r.returns) }]));
}

// ---------------- Employees ----------------
export const list = asyncHandler(async (req, res) => {
  const m = req.query.month || thisMonth();
  const { from, to } = monthRange(m);
  const rows = await query(
    `SELECT e.*, u.username, u.role,
       (SELECT COALESCE(SUM(a.amount),0) FROM employee_advances a WHERE a.employee_id = e.id AND a.salary_payment_id IS NULL) AS advance_due,
       (SELECT COUNT(*) FROM attendance t WHERE t.employee_id = e.id AND t.att_date BETWEEN ? AND ? AND t.status = 'present') AS present,
       (SELECT COUNT(*) FROM attendance t WHERE t.employee_id = e.id AND t.att_date BETWEEN ? AND ? AND t.status = 'half') AS half,
       (SELECT COUNT(*) FROM attendance t WHERE t.employee_id = e.id AND t.att_date BETWEEN ? AND ? AND t.status = 'absent') AS absent,
       (SELECT COUNT(*) FROM attendance t WHERE t.employee_id = e.id AND t.att_date BETWEEN ? AND ? AND t.status = 'leave') AS leave,
       (SELECT id FROM salary_payments sp WHERE sp.employee_id = e.id AND sp.month = ?) AS salary_paid_id
     FROM employees e LEFT JOIN users u ON u.id = e.user_id
     ${req.query.all === '1' ? '' : 'WHERE e.is_active'} ORDER BY e.is_active DESC, e.name`,
    [from, to, from, to, from, to, from, to, m]);
  const sales = await salesBy(from, to);
  for (const r of rows) {
    const s = sales[r.id] || { net: 0, invoices: 0 };
    r.month_sales = s.net;
    r.month_invoices = Number(s.invoices);
    r.commission = money((s.net * Number(r.commission_percent)) / 100);
    r.target_percent = Number(r.monthly_target) > 0 ? Math.round((s.net / Number(r.monthly_target)) * 100) : null;
  }
  const users = await query('SELECT id, name, username, role FROM users WHERE is_active ORDER BY name');
  res.json({ month: m, data: rows, users });
});

function clean(b) {
  requireFields(b, ['name']);
  return {
    name: String(b.name).trim(), phone: b.phone || null, designation: b.designation || null, user_id: b.user_id || null,
    join_date: b.join_date || null, monthly_salary: money(b.monthly_salary), commission_percent: money(b.commission_percent),
    monthly_target: money(b.monthly_target), is_active: b.is_active !== false, note: b.note || null,
  };
}
const dupeUser = (e) => { if (e?.code === '23505') throw badRequest('That login is already linked to another employee'); throw e; };

export const create = asyncHandler(async (req, res) => {
  const e = clean(req.body || {});
  const r = await query(
    `INSERT INTO employees (name, phone, designation, user_id, join_date, monthly_salary, commission_percent, monthly_target, is_active, note)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [e.name, e.phone, e.designation, e.user_id, e.join_date, e.monthly_salary, e.commission_percent, e.monthly_target, e.is_active, e.note]).catch(dupeUser);
  await logActivity(req, 'staff', 'create', r.insertId, e.name);
  res.status(201).json({ id: r.insertId });
});

export const update = asyncHandler(async (req, res) => {
  const e = clean(req.body || {});
  const r = await query(
    `UPDATE employees SET name=?, phone=?, designation=?, user_id=?, join_date=?, monthly_salary=?, commission_percent=?, monthly_target=?, is_active=?, note=? WHERE id=?`,
    [e.name, e.phone, e.designation, e.user_id, e.join_date, e.monthly_salary, e.commission_percent, e.monthly_target, e.is_active, e.note, req.params.id]).catch(dupeUser);
  if (!r.rowCount) throw notFound('Employee not found');
  await logActivity(req, 'staff', 'update', req.params.id, e.name);
  res.json({ message: 'Updated' });
});

/** Light list for pickers (POS salesperson) — any logged-in user. */
export const options = asyncHandler(async (req, res) => {
  res.json(await query('SELECT id, name, designation, user_id FROM employees WHERE is_active ORDER BY name'));
});

// ---------------- Attendance ----------------
/** GET /staff/attendance?month=2026-11 → grid of employees × days */
export const attendance = asyncHandler(async (req, res) => {
  const m = req.query.month || thisMonth();
  const { from, to, days } = monthRange(m);
  const emps = await query('SELECT id, name, designation FROM employees WHERE is_active ORDER BY name');
  const rows = await query('SELECT employee_id, att_date, status, in_time, out_time, note FROM attendance WHERE att_date BETWEEN ? AND ?', [from, to]);
  res.json({ month: m, days, employees: emps, records: rows });
});

/** PUT /staff/attendance { date, entries: [{ employee_id, status, in_time?, out_time?, note? }] } — status '' clears */
export const saveAttendance = asyncHandler(async (req, res) => {
  const b = req.body || {};
  requireFields(b, ['date']);
  if (b.date > today()) throw badRequest('Attendance cannot be marked for a future date');
  const entries = Array.isArray(b.entries) ? b.entries : [];
  await transaction(async (conn) => {
    for (const e of entries) {
      if (!e.status) { await conn.query('DELETE FROM attendance WHERE employee_id = ? AND att_date = ?', [e.employee_id, b.date]); continue; }
      if (!['present', 'absent', 'leave', 'half', 'off'].includes(e.status)) throw badRequest('Invalid attendance status');
      await conn.query(
        `INSERT INTO attendance (employee_id, att_date, status, in_time, out_time, note) VALUES (?,?,?,?,?,?)
         ON CONFLICT (employee_id, att_date) DO UPDATE SET status = EXCLUDED.status, in_time = EXCLUDED.in_time, out_time = EXCLUDED.out_time, note = EXCLUDED.note`,
        [e.employee_id, b.date, e.status, e.in_time || null, e.out_time || null, e.note || null]);
    }
  });
  await logActivity(req, 'staff', 'attendance', null, { date: b.date, entries: entries.length });
  res.json({ message: 'Saved' });
});

// ---------------- Advances ----------------
export const listAdvances = asyncHandler(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.query.employee_id) { where.push('a.employee_id = ?'); params.push(req.query.employee_id); }
  if (req.query.open === '1') where.push('a.salary_payment_id IS NULL');
  res.json(await query(
    `SELECT a.*, e.name AS employee_name, ac.name AS account_name, sp.month AS recovered_month
     FROM employee_advances a JOIN employees e ON e.id = a.employee_id JOIN accounts ac ON ac.id = a.account_id
     LEFT JOIN salary_payments sp ON sp.id = a.salary_payment_id
     WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT 300`, params));
});

/** POST /staff/advances { employee_id, amount, account_id, date?, note? } */
export const giveAdvance = asyncHandler(async (req, res) => {
  const b = req.body || {};
  requireFields(b, ['employee_id', 'amount', 'account_id']);
  const amount = money(b.amount);
  if (amount <= 0) throw badRequest('Amount must be positive');
  const id = await transaction(async (conn) => {
    const e = await conn.one('SELECT id, name FROM employees WHERE id = ?', [b.employee_id]);
    if (!e) throw notFound('Employee not found');
    const date = b.date || today();
    const r = await conn.q('INSERT INTO employee_advances (employee_id, amount, adv_date, account_id, note, user_id) VALUES (?,?,?,?,?,?)',
      [e.id, amount, date, b.account_id, b.note || null, req.user.id]);
    await recordTxn(conn, { accountId: b.account_id, direction: 'out', amount, refType: 'staff_advance', refId: r.insertId, note: `Advance — ${e.name}`, date, userId: req.user.id });
    return r.insertId;
  });
  await logActivity(req, 'staff', 'advance', id, { amount });
  res.status(201).json({ id });
});

// ---------------- Salary ----------------
/** GET /staff/salary?month= — salary sheet: suggested figures for unpaid, actual for paid */
export const salarySheet = asyncHandler(async (req, res) => {
  const m = req.query.month || thisMonth();
  const { from, to, days } = monthRange(m);
  const emps = await query('SELECT * FROM employees WHERE is_active OR id IN (SELECT employee_id FROM salary_payments WHERE month = ?) ORDER BY name', [m]);
  const sales = await salesBy(from, to);
  const att = await query(
    `SELECT employee_id, COUNT(*) FILTER (WHERE status = 'absent') AS absent, COUNT(*) FILTER (WHERE status = 'half') AS half,
            COUNT(*) FILTER (WHERE status = 'present') AS present, COUNT(*) FILTER (WHERE status = 'leave') AS leave
     FROM attendance WHERE att_date BETWEEN ? AND ? GROUP BY employee_id`, [from, to]);
  const attBy = Object.fromEntries(att.map((a) => [a.employee_id, a]));
  const paid = await query(`SELECT sp.*, ac.name AS account_name FROM salary_payments sp JOIN accounts ac ON ac.id = sp.account_id WHERE sp.month = ?`, [m]);
  const paidBy = Object.fromEntries(paid.map((p) => [p.employee_id, p]));
  const adv = await query('SELECT employee_id, SUM(amount) AS amount FROM employee_advances WHERE salary_payment_id IS NULL GROUP BY employee_id');
  const advBy = Object.fromEntries(adv.map((a) => [a.employee_id, Number(a.amount)]));
  const data = emps.map((e) => {
    const a = attBy[e.id] || { absent: 0, half: 0, present: 0, leave: 0 };
    const perDay = Number(e.monthly_salary) / days;
    const s = sales[e.id] || { net: 0 };
    return {
      employee_id: e.id, name: e.name, designation: e.designation, monthly_salary: e.monthly_salary, commission_percent: e.commission_percent,
      attendance: a, month_sales: s.net,
      suggested: {
        basic: money(e.monthly_salary),
        commission: money((s.net * Number(e.commission_percent)) / 100),
        deduction: money(perDay * (Number(a.absent) + Number(a.half) / 2)),
        advance_due: money(advBy[e.id] || 0),
      },
      paid: paidBy[e.id] || null,
    };
  });
  res.json({ month: m, days, data, totals: { paid: money(paid.reduce((t, p) => t + Number(p.net_paid), 0)), gross: money(paid.reduce((t, p) => t + Number(p.gross), 0)) } });
});

/**
 * POST /staff/salary { employee_id, month, basic, commission?, bonus?, deduction?, recover_advance?, account_id, paid_date?, note? }
 * Books gross salary as an Expense (category "Staff Salary"); cash out is gross minus advance recovered.
 */
export const paySalary = asyncHandler(async (req, res) => {
  const b = req.body || {};
  requireFields(b, ['employee_id', 'month', 'account_id']);
  monthRange(b.month);
  const result = await transaction(async (conn) => {
    const e = await conn.one('SELECT * FROM employees WHERE id = ?', [b.employee_id]);
    if (!e) throw notFound('Employee not found');
    if (await conn.one('SELECT id FROM salary_payments WHERE employee_id = ? AND month = ?', [e.id, b.month])) throw badRequest(`${e.name}'s salary for ${b.month} is already paid`);
    const basic = money(b.basic);
    const commission = money(b.commission);
    const bonus = money(b.bonus);
    const deduction = money(b.deduction);
    const gross = money(basic + commission + bonus - deduction);
    if (gross < 0) throw badRequest('Deduction is larger than the salary');
    const advances = await conn.q('SELECT id, amount FROM employee_advances WHERE employee_id = ? AND salary_payment_id IS NULL ORDER BY id FOR UPDATE', [e.id]);
    const advTotal = money(advances.reduce((t, a) => t + Number(a.amount), 0));
    const recover = b.recover_advance === false ? 0 : Math.min(advTotal, gross);
    const net = money(gross - recover);
    const date = b.paid_date || today();

    // Expense row (gross) — reuses Expenses so Profit and the expense report include salaries
    let cat = await conn.one("SELECT id FROM expense_categories WHERE lower(name) = 'staff salary'");
    if (!cat) cat = await conn.one("INSERT INTO expense_categories (name) VALUES ('Staff Salary') RETURNING id");
    const exp = gross > 0
      ? await conn.q('INSERT INTO expenses (category_id, account_id, amount, expense_date, note, user_id) VALUES (?,?,?,?,?,?)',
        [cat.id, b.account_id, gross, date, `Salary ${b.month} — ${e.name}`, req.user.id])
      : null;
    if (net > 0) await recordTxn(conn, { accountId: b.account_id, direction: 'out', amount: net, refType: 'expense', refId: exp?.insertId || null, note: `Salary ${b.month} — ${e.name}`, date, userId: req.user.id });

    const sp = await conn.q(
      `INSERT INTO salary_payments (employee_id, month, basic, commission, bonus, deduction, advance_recovered, gross, net_paid, account_id, expense_id, paid_date, note, user_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [e.id, b.month, basic, commission, bonus, deduction, recover, gross, net, b.account_id, exp?.insertId || null, date, b.note || null, req.user.id]);
    // Mark advances as recovered, oldest first. If the salary covers only part of an
    // advance, that advance is split: the recovered part is closed, the rest stays open.
    let left = recover;
    for (const a of advances) {
      if (left <= 0) break;
      const amt = Number(a.amount);
      if (amt <= left + 0.001) {
        await conn.query('UPDATE employee_advances SET salary_payment_id = ? WHERE id = ?', [sp.insertId, a.id]);
        left = money(left - amt);
      } else {
        await conn.query('UPDATE employee_advances SET amount = amount - ? WHERE id = ?', [left, a.id]);
        await conn.query(`INSERT INTO employee_advances (employee_id, amount, adv_date, account_id, note, salary_payment_id, user_id)
          SELECT employee_id, ?, adv_date, account_id, note, ?, user_id FROM employee_advances WHERE id = ?`, [left, sp.insertId, a.id]);
        left = 0;
      }
    }
    return { id: sp.insertId, gross, net, recover };
  });
  await logActivity(req, 'staff', 'salary', result.id, result);
  res.status(201).json(result);
});

/** GET /staff/performance?from=&to= — sales, invoices, average bill, target and commission per employee */
export const performance = asyncHandler(async (req, res) => {
  const from = req.query.from || `${thisMonth()}-01`;
  const to = req.query.to || today();
  const emps = await query('SELECT * FROM employees WHERE is_active ORDER BY name');
  const sales = await salesBy(from, to);
  const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);
  const data = emps.map((e) => {
    const s = sales[e.id] || { net: 0, invoices: 0, returns: 0 };
    const target = (Number(e.monthly_target) * days) / 30; // target scaled to the chosen period
    return {
      employee_id: e.id, name: e.name, designation: e.designation, net_sales: s.net, invoices: Number(s.invoices), returns: Number(s.returns || 0),
      avg_bill: Number(s.invoices) ? money(s.net / Number(s.invoices)) : 0, commission: money((s.net * Number(e.commission_percent)) / 100),
      target: money(target), target_percent: target > 0 ? Math.round((s.net / target) * 100) : null,
    };
  }).sort((a, b) => b.net_sales - a.net_sales);
  res.json({ from, to, data });
});
