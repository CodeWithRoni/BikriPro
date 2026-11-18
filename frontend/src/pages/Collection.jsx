import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HandCoins, Phone, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PartyPicker, AccountSelect } from '../components/Pickers';
import { PageHeader, Field, Empty, Tabs, DateRange, Spinner, useDebounced, Badge } from '../components/ui';
import { tk, fmtDate, todayStr, addDays, monthStart, cls } from '../utils/format';

/** Collection — receivables from credit customers. */
export default function Collection() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('due');
  const [area, setArea] = useState('');
  const [overdue, setOverdue] = useState(false);
  const darea = useDebounced(area);
  const recv = useApi('/collections/receivables', { area: darea || undefined, overdue: overdue ? 1 : undefined });
  const [customer, setCustomer] = useState(null);

  useEffect(() => {
    const id = params.get('customer');
    if (id) api.get(`/customers/${id}`).then((r) => setCustomer(r.data)).catch(() => {});
  }, [params]);

  const pick = (c) => { setCustomer(c); setParams(c ? { customer: c.id } : {}); };

  return (
    <div>
      <PageHeader icon={HandCoins} title="Collection" subtitle="Collect dues from credit customers" />
      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <div>
          <Tabs tabs={[['due', 'Receivables'], ['history', 'Collection history']]} value={tab} onChange={setTab} />
          {tab === 'due' ? (
            <>
              <div className="card mb-3 flex flex-wrap items-center gap-3 p-3">
                <input className="input w-56" placeholder="Filter by area / address" value={area} onChange={(e) => setArea(e.target.value)} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ocean-600" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Overdue / due today only</label>
                <span className="ml-auto text-sm">Total: <b className="text-rose-600">{tk((recv.data || []).reduce((s, r) => s + r.balance, 0))}</b></span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Customer</th><th>Area</th><th>Next payment</th><th>Last paid</th><th className="text-right">Due</th><th /></tr></thead>
                  <tbody>{recv.data?.map((r) => (
                    <tr key={r.id} className={cls(customer?.id === r.id && 'bg-ocean-50 dark:bg-ocean-900/20')}>
                      <td className="font-semibold">{r.name}<div className="flex items-center gap-1 text-xs font-normal text-slate-500"><Phone className="h-3 w-3" />{r.phone || '—'}</div></td>
                      <td className="text-slate-500">{r.area || r.address || '—'}</td>
                      <td>{r.next_payment_date ? <Badge tone={r.overdue ? 'rose' : 'amber'}><CalendarClock className="h-3 w-3" />{fmtDate(r.next_payment_date)}</Badge> : '—'}</td>
                      <td className="text-slate-500">{fmtDate(r.last_collection)}</td>
                      <td className="text-right font-bold text-rose-600">{tk(r.balance)}</td>
                      <td><button type="button" className="btn-primary btn-sm" onClick={() => pick(r)}>Collect</button></td>
                    </tr>
                  ))}</tbody>
                </table>
                {!recv.data?.length && <Empty title="No dues 🎉" hint="Every customer is settled." />}
              </div>
            </>
          ) : <History />}
        </div>
        <CollectForm customer={customer} onCustomer={pick} onDone={() => { recv.reload(); setCustomer(null); setParams({}); }} />
      </div>
    </div>
  );
}

function CollectForm({ customer, onCustomer, onDone }) {
  const [f, setF] = useState({ amount: '', waive_amount: '', account_id: null, collection_date: todayStr(), next_payment_date: '', trx_ref: '', note: '' });
  const [busy, setBusy] = useState(false);
  const balance = Number(customer?.balance) || 0;
  const after = Math.max(balance - (Number(f.amount) || 0) - (Number(f.waive_amount) || 0), 0);

  useEffect(() => { setF((x) => ({ ...x, amount: customer ? String(Math.max(balance, 0)) : '', waive_amount: '', next_payment_date: '' })); }, [customer?.id]); // eslint-disable-line

  const save = async () => {
    if (!customer) return toast.error('Select a customer');
    setBusy(true);
    try {
      const { data } = await api.post('/collections', {
        ...f, customer_id: customer.id, amount: Number(f.amount), waive_amount: Number(f.waive_amount) || 0,
        next_payment_date: after > 0 ? (f.next_payment_date || null) : null,
      });
      toast.success(`${data.receipt_no} — ${tk(f.amount)} collected`);
      onDone();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="card h-fit space-y-3 p-4 xl:sticky xl:top-20">
      <p className="font-bold">Receive payment</p>
      <Field label="Customer"><PartyPicker type="customer" value={customer} onChange={onCustomer} /></Field>
      {customer && <div className="rounded-xl bg-rose-50 p-3 text-sm dark:bg-rose-900/20">Current due <b className="float-right text-rose-600">{tk(balance)}</b></div>}
      <Field label="Amount received"><input type="number" className="input text-lg font-bold" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
      <Field label="Received in"><AccountSelect value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} /></Field>
      <Field label="Waive loose change (ledger deduction)">
        <input type="number" className="input" value={f.waive_amount} placeholder="0" onChange={(e) => setF({ ...f, waive_amount: e.target.value })} />
        <div className="mt-1.5 flex gap-1.5">{[20, 50, 100].map((v) => <button type="button" key={v} className="chip" onClick={() => setF({ ...f, waive_amount: String(v), amount: String(Math.max(balance - v, 0)) })}>{v} Tk</button>)}</div>
      </Field>
      <Field label="TrxID / reference"><input className="input" value={f.trx_ref} onChange={(e) => setF({ ...f, trx_ref: e.target.value })} /></Field>
      <Field label="Date"><input type="date" className="input" value={f.collection_date} onChange={(e) => setF({ ...f, collection_date: e.target.value })} /></Field>
      {customer && after > 0 && (
        <Field label={`Remaining ${tk(after)} — next payment date`}>
          <div className="mb-1.5 flex flex-wrap gap-1.5">{[['3d', 3], ['7d', 7], ['1 month', 30]].map(([l, d]) => <button type="button" key={l} className={cls('chip', f.next_payment_date === addDays(d) && 'chip-active')} onClick={() => setF({ ...f, next_payment_date: addDays(d) })}>{l}</button>)}</div>
          <input type="date" className="input" value={f.next_payment_date} onChange={(e) => setF({ ...f, next_payment_date: e.target.value })} />
        </Field>
      )}
      <Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <button type="button" className="btn-primary w-full py-3" disabled={busy || !customer || !(Number(f.amount) > 0)} onClick={save}>{busy && <Spinner className="h-4 w-4 text-white" />} Save collection</button>
    </div>
  );
}

function History() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const { data } = useApi('/collections', { from, to });
  return (
    <>
      <div className="card mb-3 p-3"><DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} /></div>
      <p className="mb-2 text-sm">Total collected: <b className="text-emerald-600">{tk(data?.summary.amount)}</b></p>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Account</th><th>Ref</th><th className="text-right">Amount</th></tr></thead>
        <tbody>{data?.data.map((c) => <tr key={c.id}><td className="font-semibold">{c.receipt_no}</td><td>{fmtDate(c.collection_date)}</td><td>{c.customer_name}</td><td>{c.account_name}</td><td className="text-xs text-slate-500">{c.trx_ref}</td><td className="text-right font-semibold text-emerald-600">{tk(c.amount)}</td></tr>)}</tbody>
      </table>{!data?.data.length && <Empty title="No collections in this period" />}</div>
    </>
  );
}
