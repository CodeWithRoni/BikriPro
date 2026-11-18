import { useState } from 'react';
import { ReceiptText, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PageHeader, Field, Empty, DateRange } from '../components/ui';
import { AccountSelect } from '../components/Pickers';
import { tk, fmtDate, todayStr, monthStart } from '../utils/format';

/** Shop expenses (moved out of Cash, Bank & MFS into its own menu). */
export default function Expenses() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const { data, reload } = useApi('/expenses', { from, to });
  const cats = useApi('/expense-categories');
  const [f, setF] = useState({ category_id: '', account_id: null, amount: '', expense_date: todayStr(), note: '' });
  const save = async () => {
    try { await api.post('/expenses', { ...f, category_id: f.category_id || null }); toast.success('Expense saved'); setF({ ...f, amount: '', note: '' }); reload(); } catch (e) { toast.error(e.message); }
  };
  return (
    <div>
    <PageHeader icon={ReceiptText} title="Expenses" subtitle="Rent, salary, utility bills and other shop costs" />
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div>
        <div className="card mb-3 p-3"><DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} /></div>
        <p className="mb-2 text-sm">Total: <b className="text-rose-600">{tk(data?.summary.amount)}</b></p>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Date</th><th>Category</th><th>Account</th><th>Note</th><th className="text-right">Amount</th></tr></thead>
          <tbody>{data?.data.map((e) => <tr key={e.id}><td>{fmtDate(e.expense_date)}</td><td>{e.category || 'Other'}</td><td>{e.account_name}</td><td className="text-slate-500">{e.note}</td><td className="text-right font-semibold">{tk(e.amount)}</td></tr>)}</tbody>
        </table>{!data?.data.length && <Empty icon={Receipt} title="No expenses" />}</div>
      </div>
      <div className="card h-fit space-y-3 p-4">
        <p className="font-bold">Add expense</p>
        <Field label="Category"><select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">Other</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Amount"><input type="number" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Paid from"><AccountSelect value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} /></Field>
        <Field label="Date"><input type="date" className="input" value={f.expense_date} onChange={(e) => setF({ ...f, expense_date: e.target.value })} /></Field>
        <Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <button type="button" className="btn-primary w-full" disabled={!(Number(f.amount) > 0)} onClick={save}>Save expense</button>
      </div>
    </div>
    </div>
  );
}
