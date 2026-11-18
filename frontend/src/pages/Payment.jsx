import { useEffect, useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PartyPicker, AccountSelect } from '../components/Pickers';
import { PageHeader, Field, Empty, Tabs, Spinner, Pagination, useDebounced } from '../components/ui';
import FilterBar, { useFilters, toParams, Sum, METHODS } from '../components/FilterBar';
import { tk, num, fmtDate, todayStr, monthStart, addDays, cls } from '../utils/format';

/** Payment — payables & payments made to suppliers. */
export default function Payment() {
  const [tab, setTab] = useState('due');
  const payables = useApi('/payments/payables');
  const [supplier, setSupplier] = useState(null);
  const [f, setF] = useState({ amount: '', account_id: null, payment_date: todayStr(), trx_ref: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(null);

  const pick = (s) => { setSupplier(s); setF((x) => ({ ...x, amount: s ? String(Math.max(Number(s.balance) || 0, 0)) : '' })); };

  const save = async () => {
    if (!supplier) return toast.error('Select a supplier');
    setBusy(true);
    try {
      const { data } = await api.post('/payments', { ...f, supplier_id: supplier.id, amount: Number(f.amount) });
      toast.success(`${data.voucher_no} — ${tk(f.amount)} paid`);
      setSupplier(null); setF({ ...f, amount: '', trx_ref: '', note: '' }); payables.reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader icon={Wallet} title="Payment" subtitle="Pay suppliers and track what you owe" />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div>
          <Tabs tabs={[['due', 'Payables'], ['history', 'Payment history']]} value={tab} onChange={setTab} />
          {tab === 'due' ? (<>
            <PayablesFilter rows={payables.data || []} onRows={setShown} />
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Supplier</th><th>Phone</th><th>Last payment</th><th className="text-right">You owe</th><th /></tr></thead>
              <tbody>{shown?.map((s) => (
                <tr key={s.id} className={cls(supplier?.id === s.id && 'bg-ocean-50 dark:bg-ocean-900/20')}><td className="font-semibold">{s.name}<div className="text-xs font-normal text-slate-500">{s.company}</div></td><td>{s.phone}</td><td>{fmtDate(s.last_payment)}</td><td className="text-right font-bold text-rose-600">{tk(s.balance)}</td><td><button type="button" className="btn-primary btn-sm" onClick={() => pick(s)}>Pay</button></td></tr>
              ))}</tbody>
            </table>{!shown?.length && <Empty title={payables.data?.length ? 'No supplier matches these filters' : 'No payables'} hint={payables.data?.length ? 'Remove a filter to see more.' : "You don't owe any supplier."} />}</div>
          </>) : <History />}
        </div>
        <div className="card h-fit space-y-3 p-4 xl:sticky xl:top-20">
          <p className="font-bold">Make payment</p>
          <Field label="Supplier"><PartyPicker type="supplier" value={supplier} onChange={pick} /></Field>
          {supplier && <div className="rounded-xl bg-rose-50 p-3 text-sm dark:bg-rose-900/20">Payable <b className="float-right text-rose-600">{tk(supplier.balance)}</b></div>}
          <Field label="Amount"><input type="number" className="input text-lg font-bold" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Pay from"><AccountSelect value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} /></Field>
          <Field label="TrxID / cheque no."><input className="input" value={f.trx_ref} onChange={(e) => setF({ ...f, trx_ref: e.target.value })} /></Field>
          <Field label="Date"><input type="date" className="input" value={f.payment_date} onChange={(e) => setF({ ...f, payment_date: e.target.value })} /></Field>
          <Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <p className="text-xs text-slate-500">Rebates or commissions from the supplier? Add them as a ledger adjustment in Suppliers → Ledger.</p>
          <button type="button" className="btn-primary w-full py-3" disabled={busy || !supplier || !(Number(f.amount) > 0)} onClick={save}>{busy && <Spinner className="h-4 w-4 text-white" />} Save payment</button>
        </div>
      </div>
    </div>
  );
}

/** Search / amount / last-payment filter for the payables list (filtered on this device). */
function PayablesFilter({ rows, onRows }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('owe_desc');
  const [f, set, reset] = useFilters({ amount: { min: '', max: '' }, last: '' });
  const out = useMemo(() => {
    const s = q.trim().toLowerCase();
    const cutoff = { '30': addDays(-30), '90': addDays(-90) }[f.last];
    let r = rows.filter((x) => (!s || `${x.name} ${x.company || ''} ${x.phone || ''}`.toLowerCase().includes(s))
      && (f.amount.min === '' || x.balance >= Number(f.amount.min)) && (f.amount.max === '' || x.balance <= Number(f.amount.max))
      && (!f.last || (f.last === 'never' ? !x.last_payment : cutoff && (!x.last_payment || x.last_payment < cutoff))));
    const by = { owe_desc: (a, b) => b.balance - a.balance, owe_asc: (a, b) => a.balance - b.balance, name: (a, b) => a.name.localeCompare(b.name), oldest_paid: (a, b) => String(a.last_payment || '').localeCompare(String(b.last_payment || '')) }[sort];
    r = [...r].sort(by);
    return r;
  }, [rows, q, f, sort]);
  useEffect(() => { onRows(out); }, [out]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <FilterBar
      search={{ value: q, onChange: setQ, placeholder: 'Supplier, company or phone…' }}
      sort={{ value: sort, onChange: setSort, options: [['owe_desc', 'We owe most first'], ['owe_asc', 'We owe least first'], ['name', 'Name A–Z'], ['oldest_paid', 'Longest since paid']] }}
      values={f} onChange={set} onClear={reset}
      fields={[
        { key: 'amount', label: 'Amount we owe (৳)', type: 'range' },
        { key: 'last', label: 'Last paid', type: 'segment', options: [['30', 'Not in 30 days'], ['90', 'Not in 90 days'], ['never', 'Never paid']] },
      ]}
      summary={<><Sum label="Suppliers" value={num(out.length)} /><Sum label="We owe" value={tk(out.reduce((t, r) => t + r.balance, 0))} tone="rose" /></>} />
  );
}

function History() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [f, set, reset] = useFilters({ supplier_id: null, method: '', account_id: '', amount: { min: '', max: '' } }, () => setPage(1));
  const dq = useDebounced(q);
  const df = useDebounced(f, 350);
  const { data } = useApi('/payments', { from: from || undefined, to: to || undefined, q: dq || undefined, sort, page, ...toParams(df) });
  return (
    <>
      <FilterBar
        search={{ value: q, onChange: (v) => { setQ(v); setPage(1); }, placeholder: 'Voucher no, supplier, TrxID / cheque or note…' }}
        date={{ from, to, onChange: (a, b) => { setFrom(a); setTo(b); setPage(1); } }} defaultDate={[monthStart(), todayStr()]}
        sort={{ value: sort, onChange: setSort, options: [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['amount_desc', 'Amount: high → low'], ['amount_asc', 'Amount: low → high']] }}
        values={f} onChange={set} onClear={reset}
        fields={[
          { key: 'supplier_id', label: 'Supplier', type: 'party', party: 'supplier' },
          { key: 'account_id', label: 'Paid from', type: 'account' },
          { key: 'amount', label: 'Amount (৳)', type: 'range' },
          { key: 'method', label: 'Method', type: 'segment', options: METHODS.map(([v, l]) => [v, l.replace(' (MFS)', '')]) },
        ]}
        summary={data?.summary && <><Sum label="Payments" value={num(data.summary.total)} /><Sum label="Total paid" value={tk(data.summary.amount)} />{data.summary.by_type?.map((t) => <span key={t.type} className="text-xs uppercase">{t.type} <b className="text-slate-700 dark:text-slate-200">{tk(t.amount)}</b></span>)}</>} />
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Voucher</th><th>Date</th><th>Supplier</th><th>Account</th><th>Ref</th><th className="text-right">Amount</th></tr></thead>
        <tbody>{data?.data.map((p) => <tr key={p.id}><td className="font-semibold">{p.voucher_no}</td><td>{fmtDate(p.payment_date)}</td><td>{p.supplier_name}</td><td>{p.account_name}<div className="text-[11px] uppercase text-slate-400">{p.account_type}</div></td><td className="text-xs text-slate-500">{p.trx_ref}</td><td className="text-right font-semibold">{tk(p.amount)}</td></tr>)}</tbody>
      </table>{!data?.data.length && <Empty title="No payments match these filters" />}
      <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} /></div>
    </>
  );
}
