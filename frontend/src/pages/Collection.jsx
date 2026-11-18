import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HandCoins, Phone, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PartyPicker, AccountSelect } from '../components/Pickers';
import { PageHeader, Field, Empty, Tabs, Spinner, useDebounced, Badge, Pagination } from '../components/ui';
import FilterBar, { useFilters, toParams, Sum, METHODS } from '../components/FilterBar';
import { tk, num, fmtDate, todayStr, addDays, monthStart, cls } from '../utils/format';

/** Collection — receivables from credit customers. */
export default function Collection() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('due');
  const recv = useApi('/collections/receivables');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('next_date');
  const [rf, setRf, resetRf] = useFilters({ area: '', when: '', amount: { min: '', max: '' } });
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const t = todayStr();
    const week = addDays(7);
    const list = (recv.data || []).filter((r) => (!s || `${r.name} ${r.phone || ''}`.toLowerCase().includes(s))
      && (!rf.area || r.area === rf.area)
      && (rf.amount.min === '' || r.balance >= Number(rf.amount.min)) && (rf.amount.max === '' || r.balance <= Number(rf.amount.max))
      && (!rf.when || (rf.when === 'overdue' ? r.overdue && r.next_payment_date < t
        : rf.when === 'today' ? r.next_payment_date === t
          : rf.when === 'week' ? r.next_payment_date && r.next_payment_date > t && r.next_payment_date <= week
            : !r.next_payment_date)));
    const by = {
      next_date: (a, b) => String(a.next_payment_date || '9999').localeCompare(String(b.next_payment_date || '9999')) || b.balance - a.balance,
      due_desc: (a, b) => b.balance - a.balance, due_asc: (a, b) => a.balance - b.balance, name: (a, b) => a.name.localeCompare(b.name),
    }[sort];
    return [...list].sort(by);
  }, [recv.data, q, rf, sort]);
  const areas = [...new Set((recv.data || []).map((r) => r.area).filter(Boolean))].sort();
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
              <FilterBar
                search={{ value: q, onChange: setQ, placeholder: 'Customer name or phone…' }}
                sort={{ value: sort, onChange: setSort, options: [['next_date', 'Next payment date'], ['due_desc', 'Highest due first'], ['due_asc', 'Lowest due first'], ['name', 'Name A–Z']] }}
                values={rf} onChange={setRf} onClear={resetRf}
                fields={[
                  { key: 'area', label: 'Area', type: 'select', options: areas.map((a) => [a, a]), placeholder: 'All areas' },
                  { key: 'amount', label: 'Due amount (৳)', type: 'range' },
                  { key: 'when', label: 'Payment date', type: 'segment', options: [['overdue', 'Overdue'], ['today', 'Due today'], ['week', 'Next 7 days'], ['none', 'No date set']] },
                ]}
                summary={<><Sum label="Customers" value={num(rows.length)} /><Sum label="Total due" value={tk(rows.reduce((t, r) => t + r.balance, 0))} tone="rose" /><Sum label="Due now" value={num(rows.filter((r) => r.overdue).length)} tone="amber" /></>} />
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Customer</th><th>Area</th><th>Next payment</th><th>Last paid</th><th className="text-right">Due</th><th /></tr></thead>
                  <tbody>{rows.map((r) => (
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
                {!rows.length && (recv.data?.length ? <Empty title="No customer matches these filters" /> : <Empty title="No dues 🎉" hint="Every customer is settled." />)}
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
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [f, set, reset] = useFilters({ customer_id: null, method: '', account_id: '', amount: { min: '', max: '' } }, () => setPage(1));
  const dq = useDebounced(q);
  const df = useDebounced(f, 350);
  const { data } = useApi('/collections', { from: from || undefined, to: to || undefined, q: dq || undefined, sort, page, ...toParams(df) });
  return (
    <>
      <FilterBar
        search={{ value: q, onChange: (v) => { setQ(v); setPage(1); }, placeholder: 'Receipt no, customer, phone, TrxID or note…' }}
        date={{ from, to, onChange: (a, b) => { setFrom(a); setTo(b); setPage(1); } }} defaultDate={[monthStart(), todayStr()]}
        sort={{ value: sort, onChange: setSort, options: [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['amount_desc', 'Amount: high → low'], ['amount_asc', 'Amount: low → high']] }}
        values={f} onChange={set} onClear={reset}
        fields={[
          { key: 'customer_id', label: 'Customer', type: 'party', party: 'customer' },
          { key: 'account_id', label: 'Received in', type: 'account' },
          { key: 'amount', label: 'Amount (৳)', type: 'range' },
          { key: 'method', label: 'Method', type: 'segment', options: METHODS.map(([v, l]) => [v, l.replace(' (MFS)', '')]) },
        ]}
        summary={data?.summary && <><Sum label="Collections" value={num(data.summary.total)} /><Sum label="Collected" value={tk(data.summary.amount)} tone="green" />{data.summary.by_type?.map((t) => <span key={t.type} className="text-xs uppercase">{t.type} <b className="text-slate-700 dark:text-slate-200">{tk(t.amount)}</b></span>)}</>} />
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Account</th><th>Ref</th><th className="text-right">Amount</th></tr></thead>
        <tbody>{data?.data.map((c) => <tr key={c.id}><td className="font-semibold">{c.receipt_no}</td><td>{fmtDate(c.collection_date)}</td><td>{c.customer_name}<div className="text-xs text-slate-500">{c.customer_phone}</div></td><td>{c.account_name}<div className="text-[11px] uppercase text-slate-400">{c.account_type}</div></td><td className="text-xs text-slate-500">{c.trx_ref}</td><td className="text-right font-semibold text-emerald-600">{tk(c.amount)}</td></tr>)}</tbody>
      </table>{!data?.data.length && <Empty title="No collections match these filters" />}
      <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} /></div>
    </>
  );
}
