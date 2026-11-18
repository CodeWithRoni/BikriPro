import { useState } from 'react';
import { PackageMinus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PageHeader, Empty, Field, Spinner } from '../components/ui';
import { AccountSelect } from '../components/Pickers';
import { tk, fmtDate, num, todayStr } from '../utils/format';

export default function PurchaseReturn() {
  const recent = useApi('/purchases', { limit: 50 });
  const list = useApi('/purchases/returns');
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
      setPur(null); list.reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader icon={PackageMinus} title="Purchase Return" subtitle="Send goods back to a supplier — stock goes down, payable reduces or cash comes back" />
      <div className="card mb-4 p-3">
        <Field label="Select purchase invoice">
          <select className="input" value={pur?.id || ''} onChange={(e) => load(e.target.value)}>
            <option value="">— choose —</option>
            {recent.data?.data.map((p) => <option key={p.id} value={p.id}>{p.invoice_no} · {p.supplier_name} · {fmtDate(p.purchase_date)} · {tk(p.grand_total)}</option>)}
          </select>
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
      <h3 className="mb-2 font-bold">Recent purchase returns</h3>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Return</th><th>Purchase</th><th>Date</th><th>Supplier</th><th className="text-right">Value</th><th className="text-right">Cash back</th><th>Reason</th></tr></thead>
        <tbody>{list.data?.data.map((r) => <tr key={r.id}><td className="font-semibold">{r.return_no}</td><td>{r.invoice_no}</td><td>{fmtDate(r.return_date)}</td><td>{r.supplier_name}</td><td className="text-right">{tk(r.total_amount)}</td><td className="text-right">{tk(r.refund_amount)}</td><td className="text-slate-500">{r.reason}</td></tr>)}</tbody>
      </table>{!list.data?.data.length && <Empty title="No purchase returns" />}</div>
    </div>
  );
}
