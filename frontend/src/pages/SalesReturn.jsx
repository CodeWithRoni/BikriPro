import { useState } from 'react';
import { Undo2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PageHeader, Empty, Field, Spinner, Pagination, useDebounced } from '../components/ui';
import FilterBar, { useFilters, toParams, Sum } from '../components/FilterBar';
import { AccountSelect } from '../components/Pickers';
import { tk, fmtDateTime, num, monthStart, todayStr } from '../utils/format';

export default function SalesReturn() {
  const [invNo, setInvNo] = useState('');
  const [sale, setSale] = useState(null);
  const [qty, setQty] = useState({});
  const [restock, setRestock] = useState({});
  const [refund, setRefund] = useState('');
  const [account, setAccount] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReload] = useState(0);

  const find = async (e) => {
    e?.preventDefault();
    try {
      const r = await api.get('/sales', { params: { q: invNo.trim(), limit: 1 } });
      if (!r.data.data.length) return toast.error('Invoice not found');
      const { data } = await api.get(`/sales/${r.data.data[0].id}`);
      setSale(data); setQty({}); setRestock({}); setRefund('');
    } catch (err) { toast.error(err.message); }
  };

  const ratio = sale ? sale.grand_total / (sale.items.reduce((s, i) => s + i.line_total, 0) || 1) : 1;
  const value = sale ? sale.items.reduce((s, i) => s + (Number(qty[i.id]) || 0) * (i.line_total / i.qty) * ratio, 0) : 0;
  const suggestedRefund = sale?.customer_id ? Math.max(value - sale.due_amount, 0) : value;

  const submit = async () => {
    const items = sale.items.filter((i) => Number(qty[i.id]) > 0).map((i) => ({ sale_item_id: i.id, qty: Number(qty[i.id]), restock: restock[i.id] !== false }));
    if (!items.length) return toast.error('Enter return quantity');
    setBusy(true);
    try {
      const { data } = await api.post('/sales/returns', { sale_id: sale.id, items, refund_amount: refund === '' ? undefined : Number(refund), account_id: account, reason });
      toast.success(`${data.return_no}: ${tk(data.total)} returned, ${tk(data.refund)} refunded`);
      setSale(null); setInvNo(''); setReload((n) => n + 1);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader icon={Undo2} title="Sales Return" subtitle="Return items from an invoice — stock goes back, customer is refunded or credited" />
      <form onSubmit={find} className="card mb-4 flex gap-2 p-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="Invoice number (e.g. INV-000123)" value={invNo} onChange={(e) => setInvNo(e.target.value)} /></div>
        <button type="submit" className="btn-primary">Find invoice</button>
      </form>

      {sale && (
        <div className="card mb-6 p-4">
          <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm">
            <p><b>{sale.invoice_no}</b> · {fmtDateTime(sale.sale_date)} · {sale.customer?.name || 'Walk-in'}</p>
            <p>Total {tk(sale.grand_total)} · Due {tk(sale.due_amount)}</p>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Item</th><th className="text-right">Sold</th><th className="text-right">Returned</th><th className="text-right">Unit (net)</th><th>Return qty</th><th>Restock</th></tr></thead>
              <tbody>
                {sale.items.map((i) => {
                  const left = i.qty - i.returned_qty;
                  return (
                    <tr key={i.id}>
                      <td>{i.product_name}<div className="text-xs text-slate-500">{i.variant_label}</div></td>
                      <td className="text-right">{num(i.qty)}</td><td className="text-right">{num(i.returned_qty)}</td>
                      <td className="text-right">{tk((i.line_total / i.qty) * ratio)}</td>
                      <td><input type="number" min="0" max={left} disabled={left <= 0} className="input w-24 py-1.5" value={qty[i.id] || ''} onChange={(e) => setQty({ ...qty, [i.id]: Math.min(Number(e.target.value), left) || '' })} /></td>
                      <td><input type="checkbox" className="accent-ocean-600" checked={restock[i.id] !== false} onChange={(e) => setRestock({ ...restock, [i.id]: e.target.checked })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-ocean-50 p-3 dark:bg-ocean-900/30"><p className="text-xs text-slate-500">Return value</p><p className="text-xl font-bold">{tk(value)}</p></div>
            <Field label="Cash refund" hint={sale.customer_id ? `Suggested ${tk(suggestedRefund)} (rest reduces due)` : 'Walk-in: full refund'}><input type="number" className="input" placeholder={String(Math.round(suggestedRefund * 100) / 100)} value={refund} onChange={(e) => setRefund(e.target.value)} /></Field>
            <Field label="Refund from"><AccountSelect value={account} onChange={setAccount} /></Field>
            <Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Size issue, defect…" /></Field>
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
  const [f, set, reset] = useFilters({ customer_id: null, refund: '', amount: { min: '', max: '' }, walk_in: false }, () => setPage(1));
  const dq = useDebounced(q);
  const df = useDebounced(f, 350);
  const { data } = useApi('/sales/returns', { from: from || undefined, to: to || undefined, q: dq || undefined, sort, page, ...toParams(df) });
  return (
    <>
      <h3 className="mb-2 font-bold">Return history</h3>
      <FilterBar
        search={{ value: q, onChange: (v) => { setQ(v); setPage(1); }, placeholder: 'Return no, invoice no, customer or reason…' }}
        date={{ from, to, onChange: (a, b) => { setFrom(a); setTo(b); setPage(1); } }} defaultDate={[monthStart(), todayStr()]}
        sort={{ value: sort, onChange: setSort, options: [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['amount_desc', 'Value: high → low'], ['amount_asc', 'Value: low → high']] }}
        values={f} onChange={set} onClear={reset}
        fields={[
          { key: 'customer_id', label: 'Customer', type: 'party', party: 'customer' },
          { key: 'amount', label: 'Return value (৳)', type: 'range' },
          { key: 'refund', label: 'Settled by', type: 'segment', options: [['cash', 'Cash refund'], ['credit', 'Credited to due']] },
          { key: 'walk_in', label: 'Walk-in only', type: 'toggle' },
        ]}
        summary={data?.summary && <><Sum label="Returns" value={num(data.summary.total)} /><Sum label="Value" value={tk(data.summary.amount)} tone="rose" /><Sum label="Refunded" value={tk(data.summary.refunded)} /></>} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Return</th><th>Invoice</th><th>Date</th><th>Customer</th><th className="text-right">Value</th><th className="text-right">Refunded</th><th>Reason</th></tr></thead>
          <tbody>{data?.data.map((r) => (
            <tr key={r.id}><td className="font-semibold">{r.return_no}</td><td>{r.invoice_no}</td><td>{fmtDateTime(r.return_date)}</td><td>{r.customer_name || 'Walk-in'}</td><td className="text-right">{tk(r.total_amount)}</td><td className="text-right">{tk(r.refund_amount)}</td><td className="text-slate-500">{r.reason}</td></tr>
          ))}</tbody>
        </table>
        {!data?.data.length && <Empty title="No returns match these filters" />}
        <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} />
      </div>
    </>
  );
}
