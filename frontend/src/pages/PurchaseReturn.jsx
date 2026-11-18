import { useState } from 'react';
import { PackageMinus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PageHeader, Empty, Field, Spinner, Pagination, useDebounced } from '../components/ui';
import FilterBar, { useFilters, toParams, Sum } from '../components/FilterBar';
import { AccountSelect } from '../components/Pickers';
import { tk, fmtDate, num, todayStr, monthStart } from '../utils/format';
import Select from '../components/ui/Select';

export default function PurchaseReturn() {
  const recent = useApi('/purchases', { limit: 50 });
  const [reloadKey, setReload] = useState(0);
  const [pur, setPur] = useState(null);
  const [qty, setQty] = useState({});
  const [refund, setRefund] = useState('');
  const [account, setAccount] = useState(null);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(todayStr());
  const [busy, setBusy] = useState(false);

  const load = async (id) => { if (!id) return setPur(null); setPur((await api.get(`/purchases/${id}`)).data); setQty({}); setRefund(''); };
  const ratio = pur ? pur.grand_total / (pur.items.reduce((s, i) => s + i.line_total, 0) || 1) : 1;
  const value = pur ? pur.items.reduce((s, i) => s + (Number(qty[i.id]) || 0) * i.unit_cost * ratio, 0) : 0;

  const submit = async () => {
    const items = pur.items.filter((i) => Number(qty[i.id]) > 0).map((i) => ({ purchase_item_id: i.id, qty: Number(qty[i.id]) }));
    if (!items.length) return toast.error('Enter return quantity');
    setBusy(true);
    try {
      const { data } = await api.post('/purchases/returns', { purchase_id: pur.id, items, refund_amount: Number(refund) || 0, account_id: account, reason, return_date: date });
      toast.success(`${data.return_no} saved`);
      setPur(null); setReload((n) => n + 1);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader icon={PackageMinus} title="Purchase Return" subtitle="Send goods back to a supplier — stock goes down, payable reduces or cash comes back" />
      <div className="card mb-4 p-3">
        <Field label="Select purchase invoice">
          <Select className="input" value={pur?.id || ''} onChange={(e) => load(e.target.value)}>
            <option value="">— choose —</option>
            {recent.data?.data.map((p) => <option key={p.id} value={p.id}>{p.invoice_no} · {p.supplier_name} · {fmtDate(p.purchase_date)} · {tk(p.grand_total)}</option>)}
          </Select>
        </Field>
      </div>
      {pur && (
        <div className="card mb-6 p-4">
          <p className="mb-3 text-sm"><b>{pur.invoice_no}</b> · {pur.supplier_name} · Due {tk(pur.due_amount)}</p>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Item</th><th className="text-right">Bought</th><th className="text-right">Returned</th><th className="text-right">Unit cost</th><th>Return qty</th></tr></thead>
            <tbody>{pur.items.map((i) => {
              const left = i.qty - i.returned_qty;
              return <tr key={i.id}><td>{i.product_name} <span className="text-xs text-slate-500">{i.variant_label}</span></td><td className="text-right">{num(i.qty)}</td><td className="text-right">{num(i.returned_qty)}</td><td className="text-right">{tk(i.unit_cost * ratio)}</td>
                <td><input type="number" min="0" max={left} disabled={left <= 0} className="input w-24 py-1.5" value={qty[i.id] || ''} onChange={(e) => setQty({ ...qty, [i.id]: Math.min(Number(e.target.value), left) || '' })} /></td></tr>;
            })}</tbody>
          </table></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            <div className="rounded-xl bg-ocean-50 p-3 dark:bg-ocean-900/30"><p className="text-xs text-slate-500">Return value</p><p className="text-xl font-bold">{tk(value)}</p></div>
            <Field label="Cash received back" hint="Rest reduces what you owe"><input type="number" className="input" value={refund} onChange={(e) => setRefund(e.target.value)} placeholder="0" /></Field>
            <Field label="Into account"><AccountSelect value={account} onChange={setAccount} /></Field>
            <Field label="Date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </div>
          <div className="mt-4 flex justify-end"><button type="button" className="btn-primary" disabled={busy || value <= 0} onClick={submit}>{busy && <Spinner className="h-4 w-4 text-white" />} Confirm return</button></div>
        </div>
      )}
      <ReturnHistory key={reloadKey} />
    </div>
  );
}

function ReturnHistory() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [f, set, reset] = useFilters({ supplier_id: null, refund: '', amount: { min: '', max: '' } }, () => setPage(1));
  const dq = useDebounced(q);
  const df = useDebounced(f, 350);
  const { data } = useApi('/purchases/returns', { from: from || undefined, to: to || undefined, q: dq || undefined, sort, page, ...toParams(df) });
  return (
    <>
      <h3 className="mb-2 font-bold">Purchase return history</h3>
      <FilterBar
        search={{ value: q, onChange: (v) => { setQ(v); setPage(1); }, placeholder: 'Return no, purchase no, supplier or reason…' }}
        date={{ from, to, onChange: (a, b) => { setFrom(a); setTo(b); setPage(1); } }} defaultDate={[monthStart(), todayStr()]}
        sort={{ value: sort, onChange: setSort, options: [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['amount_desc', 'Value: high → low'], ['amount_asc', 'Value: low → high']] }}
        values={f} onChange={set} onClear={reset}
        fields={[
          { key: 'supplier_id', label: 'Supplier', type: 'party', party: 'supplier' },
          { key: 'amount', label: 'Return value (৳)', type: 'range' },
          { key: 'refund', label: 'Settled by', type: 'segment', options: [['cash', 'Cash back'], ['credit', 'Reduced our due']] },
        ]}
        summary={data?.summary && <><Sum label="Returns" value={num(data.summary.total)} /><Sum label="Value" value={tk(data.summary.amount)} /><Sum label="Cash back" value={tk(data.summary.refunded)} tone="green" /></>} />
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Return</th><th>Purchase</th><th>Date</th><th>Supplier</th><th className="text-right">Value</th><th className="text-right">Cash back</th><th>Reason</th></tr></thead>
        <tbody>{data?.data.map((r) => <tr key={r.id}><td className="font-semibold">{r.return_no}</td><td>{r.invoice_no}</td><td>{fmtDate(r.return_date)}</td><td>{r.supplier_name}</td><td className="text-right">{tk(r.total_amount)}</td><td className="text-right">{tk(r.refund_amount)}</td><td className="text-slate-500">{r.reason}</td></tr>)}</tbody>
      </table>{!data?.data.length && <Empty title="No purchase returns match these filters" />}
      <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} /></div>
    </>
  );
}
