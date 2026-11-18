import { useState } from 'react';
import { Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PartyPicker, AccountSelect } from '../components/Pickers';
import { PageHeader, Field, Empty, Tabs, DateRange, Spinner } from '../components/ui';
import { tk, fmtDate, todayStr, monthStart, cls } from '../utils/format';

/** Payment — payables & payments made to suppliers. */
export default function Payment() {
  const [tab, setTab] = useState('due');
  const payables = useApi('/payments/payables');
  const [supplier, setSupplier] = useState(null);
  const [f, setF] = useState({ amount: '', account_id: null, payment_date: todayStr(), trx_ref: '', note: '' });
  const [busy, setBusy] = useState(false);

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
          {tab === 'due' ? (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Supplier</th><th>Phone</th><th>Last payment</th><th className="text-right">You owe</th><th /></tr></thead>
              <tbody>{payables.data?.map((s) => (
                <tr key={s.id} className={cls(supplier?.id === s.id && 'bg-ocean-50 dark:bg-ocean-900/20')}><td className="font-semibold">{s.name}<div className="text-xs font-normal text-slate-500">{s.company}</div></td><td>{s.phone}</td><td>{fmtDate(s.last_payment)}</td><td className="text-right font-bold text-rose-600">{tk(s.balance)}</td><td><button type="button" className="btn-primary btn-sm" onClick={() => pick(s)}>Pay</button></td></tr>
              ))}</tbody>
            </table>{!payables.data?.length && <Empty title="No payables" hint="You don't owe any supplier." />}</div>
          ) : <History />}
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

function History() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const { data } = useApi('/payments', { from, to });
  return (
    <>
      <div className="card mb-3 p-3"><DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} /></div>
      <p className="mb-2 text-sm">Total paid: <b>{tk(data?.summary.amount)}</b></p>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Voucher</th><th>Date</th><th>Supplier</th><th>Account</th><th>Ref</th><th className="text-right">Amount</th></tr></thead>
        <tbody>{data?.data.map((p) => <tr key={p.id}><td className="font-semibold">{p.voucher_no}</td><td>{fmtDate(p.payment_date)}</td><td>{p.supplier_name}</td><td>{p.account_name}</td><td className="text-xs text-slate-500">{p.trx_ref}</td><td className="text-right font-semibold">{tk(p.amount)}</td></tr>)}</tbody>
      </table>{!data?.data.length && <Empty title="No payments in this period" />}</div>
    </>
  );
}
