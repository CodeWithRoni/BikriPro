import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UsersRound, Plus, Pencil, CalendarCheck, Wallet, HandCoins, Trophy, Target, CheckCircle2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PageHeader, Tabs, Modal, Field, Empty, Spinner, Badge } from '../components/ui';
import Select from '../components/ui/Select';
import { AccountSelect } from '../components/Pickers';
import FilterBar, { Sum } from '../components/FilterBar';
import { tk, num, fmtDate, todayStr, monthStart, cls } from '../utils/format';

const thisMonth = () => todayStr().slice(0, 7);
const STATUS = [['present', 'Present', 'bg-emerald-500'], ['half', 'Half day', 'bg-amber-400'], ['absent', 'Absent', 'bg-rose-500'], ['leave', 'Leave', 'bg-sky-500'], ['off', 'Day off', 'bg-slate-400']];
const STATUS_COLOR = Object.fromEntries(STATUS.map(([k, , c]) => [k, c]));
const BAR = 'bg-[#1d74e6] dark:bg-[#4594f5]';

function MonthInput({ value, onChange }) {
  return <input type="month" className="input-sm w-auto" value={value} max={thisMonth()} onChange={(e) => e.target.value && onChange(e.target.value)} />;
}

export default function Staff() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'employees';
  return (
    <div>
      <PageHeader icon={UsersRound} title="Staff" subtitle="Employees, attendance, salary & advances, sales targets and commission" />
      <Tabs tabs={[['employees', 'Employees'], ['attendance', 'Attendance'], ['salary', 'Salary'], ['advances', 'Advances'], ['performance', 'Targets & commission']]} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'employees' && <Employees />}
      {tab === 'attendance' && <Attendance />}
      {tab === 'salary' && <Salary />}
      {tab === 'advances' && <Advances />}
      {tab === 'performance' && <Performance />}
    </div>
  );
}

// ---------------------------------------------------------------- employees
function Employees() {
  const [month, setMonth] = useState(thisMonth());
  const [all, setAll] = useState(false);
  const { data, loading, reload } = useApi('/staff', { month, all: all ? 1 : undefined });
  const [form, setForm] = useState(null);
  const save = async () => {
    try {
      if (form.id) await api.put(`/staff/${form.id}`, form); else await api.post('/staff', form);
      toast.success('Saved'); setForm(null); reload();
    } catch (e) { toast.error(e.message); }
  };
  const rows = data?.data || [];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <MonthInput value={month} onChange={setMonth} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ocean-600" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show former staff</label>
        <button type="button" className="btn-primary ml-auto" onClick={() => setForm({ name: '', phone: '', designation: '', user_id: '', join_date: '', monthly_salary: '', commission_percent: '', monthly_target: '', is_active: true, note: '' })}><Plus className="h-4 w-4" /> Add employee</button>
      </div>
      {loading && !data ? <div className="flex justify-center py-16"><Spinner /></div> : !rows.length ? (
        <div className="card"><Empty icon={UsersRound} title="No employees yet" hint="Add salesmen, cashiers and helpers to track attendance, salary and sales." /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((e) => (
            <div key={e.id} className={cls('card p-4', !e.is_active && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ocean-100 text-lg font-bold text-ocean-700 dark:bg-ocean-900/40 dark:text-ocean-300">{e.name.slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{e.name}</p>
                  <p className="text-xs text-slate-500">{[e.designation, e.phone].filter(Boolean).join(' · ') || '—'}</p>
                  {e.username && <p className="text-[11px] text-ocean-600">Login: {e.username} ({e.role})</p>}
                </div>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setForm({ ...e, user_id: e.user_id || '', join_date: e.join_date || '' })} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60"><p className="text-slate-500">Salary</p><b>{tk(e.monthly_salary)}</b></div>
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60"><p className="text-slate-500">Sales</p><b>{tk(e.month_sales)}</b></div>
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60"><p className="text-slate-500">Commission</p><b>{tk(e.commission)}</b></div>
              </div>
              {e.target_percent !== null && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs"><span className="text-slate-500"><Target className="mr-1 inline h-3 w-3" />Target {tk(e.monthly_target)}</span><b>{e.target_percent}%</b></div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className={cls('h-2 rounded-full', e.target_percent >= 100 ? 'bg-emerald-500' : BAR)} style={{ width: `${Math.min(e.target_percent, 100)}%` }} /></div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                <Badge tone="green">{num(e.present)} present</Badge>
                {e.half > 0 && <Badge tone="amber">{num(e.half)} half</Badge>}
                {e.absent > 0 && <Badge tone="rose">{num(e.absent)} absent</Badge>}
                {e.leave > 0 && <Badge tone="ocean">{num(e.leave)} leave</Badge>}
                {e.advance_due > 0 && <Badge tone="amber">Advance {tk(e.advance_due)}</Badge>}
                {e.salary_paid_id && <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Salary paid</Badge>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit employee' : 'Add employee'} size="md"
        footer={<><button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Save</button></>}>
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
            <Field label="Mobile"><input className="input" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Designation"><input className="input" value={form.designation || ''} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Salesman, Cashier…" /></Field>
            <Field label="Joining date"><input type="date" className="input" value={form.join_date || ''} onChange={(e) => setForm({ ...form, join_date: e.target.value })} /></Field>
            <Field label="Monthly salary (৳)"><input type="number" min="0" className="input no-spin" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} /></Field>
            <Field label="Commission on own sales (%)"><input type="number" min="0" step="0.1" className="input no-spin" value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: e.target.value })} /></Field>
            <Field label="Monthly sales target (৳)"><input type="number" min="0" className="input no-spin" value={form.monthly_target} onChange={(e) => setForm({ ...form, monthly_target: e.target.value })} /></Field>
            <Field label="Software login" hint="Sales they ring up count for them">
              <Select className="input" value={form.user_id || ''} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                <option value="">No login</option>{data?.users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.username})</option>)}
              </Select>
            </Field>
            <Field label="Note" className="sm:col-span-2"><input className="input" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            {form.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ocean-600" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Still working here</label>}
          </div>
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- attendance
function Attendance() {
  const [date, setDate] = useState(todayStr());
  const month = date.slice(0, 7);
  const { data, reload } = useApi('/staff/attendance', { month });
  const [entries, setEntries] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data) return;
    const e = {};
    for (const emp of data.employees) {
      const r = data.records.find((x) => x.employee_id === emp.id && String(x.att_date).slice(0, 10) === date);
      e[emp.id] = { status: r?.status || '', in_time: r?.in_time?.slice(0, 5) || '', out_time: r?.out_time?.slice(0, 5) || '', note: r?.note || '' };
    }
    setEntries(e);
  }, [data, date]);
  const set = (id, patch) => setEntries((x) => ({ ...x, [id]: { ...x[id], ...patch } }));
  const save = async () => {
    setBusy(true);
    try {
      await api.put('/staff/attendance', { date, entries: Object.entries(entries).map(([id, v]) => ({ employee_id: Number(id), ...v })) });
      toast.success('Attendance saved'); reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const dayNums = data ? Array.from({ length: data.days }, (_, i) => i + 1) : [];
  const rec = (empId, d) => data.records.find((x) => x.employee_id === empId && Number(String(x.att_date).slice(8, 10)) === d);

  return (
    <>
      <div className="card mb-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3 dark:border-slate-800">
          <CalendarCheck className="h-5 w-5 text-ocean-600" />
          <input type="date" className="input-sm w-auto" value={date} max={todayStr()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button type="button" className="chip" onClick={() => data?.employees.forEach((emp) => !entries[emp.id]?.status && set(emp.id, { status: 'present' }))}>Mark everyone else present</button>
          <button type="button" className="btn-primary ml-auto" disabled={busy || !data?.employees.length} onClick={save}>{busy && <Spinner className="h-4 w-4 text-white" />}<Save className="h-4 w-4" /> Save</button>
        </div>
        {!data ? <div className="flex justify-center py-10"><Spinner /></div> : !data.employees.length ? <Empty icon={UsersRound} title="Add employees first" /> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.employees.map((emp) => {
              const e = entries[emp.id] || {};
              return (
                <li key={emp.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="w-40 min-w-0"><p className="truncate font-semibold">{emp.name}</p><p className="truncate text-xs text-slate-500">{emp.designation}</p></div>
                  <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
                    {STATUS.map(([k, l]) => (
                      <button type="button" key={k} onClick={() => set(emp.id, { status: e.status === k ? '' : k })}
                        className={cls('rounded-lg px-2.5 py-1.5 text-xs font-semibold transition', e.status === k ? 'bg-ocean-600 text-white' : 'text-slate-600 dark:text-slate-300')}>{l}</button>
                    ))}
                  </div>
                  {['present', 'half'].includes(e.status) && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      In <input type="time" className="input-sm w-auto py-1" value={e.in_time} onChange={(x) => set(emp.id, { in_time: x.target.value })} />
                      Out <input type="time" className="input-sm w-auto py-1" value={e.out_time} onChange={(x) => set(emp.id, { out_time: x.target.value })} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {data?.employees.length > 0 && (
        <div className="card overflow-x-auto p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <p className="font-bold">{month} at a glance</p>
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">{STATUS.map(([k, l, c]) => <span key={k} className="flex items-center gap-1"><span className={cls('h-2.5 w-2.5 rounded-sm', c)} />{l}</span>)}</div>
          </div>
          <table className="border-separate text-xs" style={{ borderSpacing: 2 }}>
            <thead><tr><th className="pr-2 text-left font-medium text-slate-500">Employee</th>{dayNums.map((d) => <th key={d} className="w-6 text-center font-medium text-slate-400">{d}</th>)}</tr></thead>
            <tbody>{data.employees.map((emp) => (
              <tr key={emp.id}>
                <td className="whitespace-nowrap pr-2 font-medium">{emp.name}</td>
                {dayNums.map((d) => {
                  const r = rec(emp.id, d);
                  return <td key={d} title={r ? `${d}: ${r.status}` : `${d}: not marked`} className="p-0"><button type="button" onClick={() => setDate(`${month}-${String(d).padStart(2, '0')}`)} className={cls('h-6 w-6 rounded', r ? STATUS_COLOR[r.status] : 'bg-slate-100 dark:bg-slate-800', `${month}-${String(d).padStart(2, '0')}` === date && 'ring-2 ring-ocean-500 ring-offset-1 dark:ring-offset-slate-900')} /></td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- salary
function Salary() {
  const [month, setMonth] = useState(thisMonth());
  const { data, loading, reload } = useApi('/staff/salary', { month });
  const [account, setAccount] = useState(null);
  const [edit, setEdit] = useState({});
  useEffect(() => {
    if (!data) return;
    setEdit(Object.fromEntries(data.data.filter((r) => !r.paid).map((r) => [r.employee_id, { basic: r.suggested.basic, commission: r.suggested.commission, bonus: '', deduction: r.suggested.deduction, recover: true }])));
  }, [data]);
  const net = (r) => {
    const e = edit[r.employee_id] || {};
    const gross = Number(e.basic || 0) + Number(e.commission || 0) + Number(e.bonus || 0) - Number(e.deduction || 0);
    const rec = e.recover ? Math.min(r.suggested.advance_due, Math.max(gross, 0)) : 0;
    return { gross, rec, net: gross - rec };
  };
  const pay = async (r) => {
    const e = edit[r.employee_id];
    const n = net(r);
    if (!window.confirm(`Pay ${r.name} ${tk(n.net)} for ${month}?${n.rec ? `\n(${tk(n.rec)} advance recovered)` : ''}`)) return;
    try {
      await api.post('/staff/salary', { employee_id: r.employee_id, month, basic: e.basic, commission: e.commission, bonus: e.bonus, deduction: e.deduction, recover_advance: e.recover, account_id: account });
      toast.success(`Salary paid to ${r.name}`); reload();
    } catch (err) { toast.error(err.message); }
  };
  const setE = (id, patch) => setEdit((x) => ({ ...x, [id]: { ...x[id], ...patch } }));
  return (
    <>
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <MonthInput value={month} onChange={setMonth} />
        <div className="w-72"><AccountSelect value={account} onChange={setAccount} className="input-sm" /></div>
        {data && <span className="ml-auto text-sm text-slate-500">Paid this month: <b className="text-slate-800 dark:text-white">{tk(data.totals.net_paid ?? data.totals.paid)}</b></span>}
      </div>
      <p className="mb-3 text-xs text-slate-500">Deduction is suggested from attendance (absent = 1 day, half day = ½ day of salary). Salary is saved as an expense under “Staff Salary”.</p>
      {loading && !data ? <div className="flex justify-center py-16"><Spinner /></div> : !data?.data.length ? <div className="card"><Empty icon={Wallet} title="No employees" /></div> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Employee</th><th className="text-right">Days</th><th>Basic</th><th>Commission</th><th>Bonus</th><th>Deduction</th><th>Advance</th><th className="text-right">Pay now</th><th /></tr></thead>
          <tbody>{data.data.map((r) => {
            const p = r.paid;
            const e = edit[r.employee_id] || {};
            const n = net(r);
            const inp = (k) => <input type="number" min="0" className="input-sm no-spin w-24 text-right" value={e[k] ?? ''} onChange={(x) => setE(r.employee_id, { [k]: x.target.value })} />;
            return (
              <tr key={r.employee_id}>
                <td className="font-semibold">{r.name}<div className="text-xs font-normal text-slate-500">{[r.designation, `sales ${tk(r.month_sales)}`].filter(Boolean).join(' · ')}</div></td>
                <td className="text-right text-xs">{num(r.attendance.present)}P {r.attendance.half > 0 && `${num(r.attendance.half)}H `}{r.attendance.absent > 0 && <span className="text-rose-600">{num(r.attendance.absent)}A</span>}</td>
                {p ? (
                  <>
                    <td>{tk(p.basic)}</td><td>{tk(p.commission)}</td><td>{tk(p.bonus)}</td><td>{tk(p.deduction)}</td><td>{p.advance_recovered > 0 ? `−${tk(p.advance_recovered)}` : '—'}</td>
                    <td className="text-right font-bold">{tk(p.net_paid)}</td>
                    <td><Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Paid {fmtDate(p.paid_date)}</Badge></td>
                  </>
                ) : (
                  <>
                    <td>{inp('basic')}</td><td>{inp('commission')}</td><td>{inp('bonus')}</td><td>{inp('deduction')}</td>
                    <td>{r.suggested.advance_due > 0 ? <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="accent-ocean-600" checked={!!e.recover} onChange={(x) => setE(r.employee_id, { recover: x.target.checked })} />cut {tk(Math.min(r.suggested.advance_due, Math.max(n.gross, 0)))}</label> : '—'}</td>
                    <td className="text-right font-bold">{tk(n.net)}</td>
                    <td><button type="button" className="btn-primary btn-sm" disabled={n.gross < 0 || !account} onClick={() => pay(r)}>Pay</button></td>
                  </>
                )}
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- advances
function Advances() {
  const emps = useApi('/staff/options');
  const list = useApi('/staff/advances');
  const [f, setF] = useState({ employee_id: '', amount: '', account_id: null, date: todayStr(), note: '' });
  const give = async () => {
    try {
      await api.post('/staff/advances', f);
      toast.success('Advance given'); setF({ ...f, amount: '', note: '' }); list.reload();
    } catch (e) { toast.error(e.message); }
  };
  const open = (list.data || []).filter((a) => !a.salary_payment_id);
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Date</th><th>Employee</th><th>Paid from</th><th>Note</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
        <tbody>{list.data?.map((a) => (
          <tr key={a.id}><td>{fmtDate(a.adv_date)}</td><td className="font-medium">{a.employee_name}</td><td>{a.account_name}</td><td className="text-slate-500">{a.note}</td><td className="text-right font-semibold">{tk(a.amount)}</td>
            <td>{a.salary_payment_id ? <Badge tone="green">Cut from {a.recovered_month} salary</Badge> : <Badge tone="amber">To recover</Badge>}</td></tr>
        ))}</tbody>
      </table>{!list.data?.length && <Empty icon={HandCoins} title="No advances" />}</div>
      <div className="card h-fit space-y-3 p-4">
        <p className="font-bold">Give advance</p>
        <p className="text-xs text-slate-500">It is cut automatically from the next salary. Open advances: <b>{tk(open.reduce((t, a) => t + Number(a.amount), 0))}</b></p>
        <Field label="Employee"><Select className="input" value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}><option value="">Choose…</option>{emps.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label="Amount"><input type="number" min="0" className="input no-spin" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Paid from"><AccountSelect value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} /></Field>
        <Field label="Date"><input type="date" className="input" value={f.date} max={todayStr()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <button type="button" className="btn-primary w-full" disabled={!f.employee_id || !(Number(f.amount) > 0)} onClick={give}>Give advance</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- performance
function Performance() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const { data, loading } = useApi('/staff/performance', { from: from || '2000-01-01', to: to || todayStr() });
  const rows = data?.data || [];
  const max = Math.max(...rows.map((r) => r.net_sales), 1);
  const total = useMemo(() => rows.reduce((t, r) => ({ sales: t.sales + r.net_sales, commission: t.commission + r.commission }), { sales: 0, commission: 0 }), [rows]);
  return (
    <>
      <FilterBar date={{ from, to, onChange: (a, b) => { setFrom(a); setTo(b); } }} defaultDate={[monthStart(), todayStr()]}
        summary={<><Sum label="Staff sales" value={tk(total.sales)} /><Sum label="Commission" value={tk(total.commission)} tone="amber" /></>} />
      <p className="mb-3 text-xs text-slate-500">Sales count for the salesperson chosen in the POS, otherwise for whoever rang up the bill. Returns are taken off. Targets are scaled to the chosen dates.</p>
      {loading && !data ? <div className="flex justify-center py-16"><Spinner /></div> : !rows.length ? <div className="card"><Empty icon={Trophy} title="No employees" /></div> : (
        <div className="card divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r, i) => (
            <div key={r.employee_id} className="flex flex-wrap items-center gap-4 p-4">
              <div className={cls('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold', i === 0 && r.net_sales > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}>{i === 0 && r.net_sales > 0 ? <Trophy className="h-4 w-4" /> : i + 1}</div>
              <div className="w-40 min-w-0"><p className="truncate font-semibold">{r.name}</p><p className="text-xs text-slate-500">{r.designation || '—'}</p></div>
              <div className="min-w-[160px] flex-1">
                <div className="mb-1 flex justify-between text-xs"><b className="text-sm">{tk(r.net_sales)}</b><span className="text-slate-500">{num(r.invoices)} bills · avg {tk(r.avg_bill)}</span></div>
                <div className="h-2 rounded-r bg-slate-100 dark:bg-slate-800"><div className={cls('h-2 rounded-r', BAR)} style={{ width: `${(r.net_sales / max) * 100}%` }} /></div>
              </div>
              <div className="w-36 text-xs">
                {r.target_percent === null ? <span className="text-slate-400">No target</span> : (
                  <>
                    <div className="mb-1 flex justify-between"><span className="text-slate-500">Target {tk(r.target)}</span><b className={r.target_percent >= 100 ? 'text-emerald-600' : ''}>{r.target_percent}%</b></div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className={cls('h-2 rounded-full', r.target_percent >= 100 ? 'bg-emerald-500' : 'bg-amber-400')} style={{ width: `${Math.min(r.target_percent, 100)}%` }} /></div>
                  </>
                )}
              </div>
              <div className="w-28 text-right"><p className="text-[11px] uppercase text-slate-500">Commission</p><p className="font-bold">{tk(r.commission)}</p></div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
