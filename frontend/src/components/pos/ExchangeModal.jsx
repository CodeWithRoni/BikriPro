import { useState } from 'react';
import { Repeat2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import useApi from '../../hooks/useApi';
import { Modal, Spinner } from '../ui';
import { tk, num, fmtDateTime, cls } from '../../utils/format';

/** Pick an old invoice and the items the customer is bringing back. */
export default function ExchangeModal({ open, onClose, onPick }) {
  const [code, setCode] = useState('');
  const [sale, setSale] = useState(null);
  const [qty, setQty] = useState({});
  const [restock, setRestock] = useState({});
  const [busy, setBusy] = useState(false);
  const recent = useApi(open && !sale ? '/sales' : null, { limit: 8, q: code || undefined });

  const load = async (id) => {
    setBusy(true);
    try { const { data } = await api.get(`/sales/${id}`); setSale(data); setQty({}); setRestock({}); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const close = () => { setSale(null); setCode(''); onClose(); };
  const ratio = sale ? sale.grand_total / (sale.items.reduce((t, i) => t + i.line_total, 0) || 1) : 1;
  const unit = (i) => Math.round((i.line_total / i.qty) * ratio * 100) / 100;
  const lineValue = (i, q) => Math.round(((i.line_total * ratio * q) / i.qty) * 100) / 100; // same rounding as the server
  const chosen = sale ? sale.items.filter((i) => Number(qty[i.id]) > 0) : [];
  const credit = Math.round(chosen.reduce((t, i) => t + lineValue(i, Number(qty[i.id])), 0) * 100) / 100;

  const confirm = () => {
    if (!chosen.length) return toast.error('Enter the quantity the customer is returning');
    onPick({
      sale_id: sale.id, invoice_no: sale.invoice_no, credit,
      items: chosen.map((i) => ({ sale_item_id: i.id, qty: Number(qty[i.id]), name: i.product_name, label: i.variant_label, value: lineValue(i, Number(qty[i.id])), restock: restock[i.id] !== false })),
    }, sale.customer && !sale.customer.is_walk_in ? sale.customer : null);
    setSale(null); setCode('');
  };

  return (
    <Modal open={open} onClose={close} title={sale ? `Exchange — ${sale.invoice_no}` : 'Exchange: find the invoice'} size="lg"
      footer={sale && <><button type="button" className="btn-secondary" onClick={() => setSale(null)}>Back</button><button type="button" className="btn-primary" disabled={!chosen.length} onClick={confirm}><Repeat2 className="h-4 w-4" /> Return {tk(credit)} &amp; choose new items</button></>}>
      {!sale ? (
        <div className="space-y-3">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" autoFocus placeholder="Invoice no, customer name or phone…" value={code} onChange={(e) => setCode(e.target.value)} /></div>
          {busy && <div className="flex justify-center py-6"><Spinner /></div>}
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {recent.data?.data.filter((x) => x.status !== 'returned').map((x) => (
              <li key={x.id}><button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-ocean-50 dark:hover:bg-slate-800" onClick={() => load(x.id)}>
                <span className="font-semibold text-ocean-700 dark:text-ocean-300">{x.invoice_no}</span>
                <span className="min-w-0 flex-1 truncate text-slate-500">{x.customer_name || 'Walk-in'} · {fmtDateTime(x.sale_date)}</span>
                <b>{tk(x.grand_total)}</b>
              </button></li>
            ))}
            {recent.data && !recent.data.data.length && <li className="px-3 py-6 text-center text-sm text-slate-400">No invoice found</li>}
          </ul>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{sale.customer?.name || 'Walk-in'} · {fmtDateTime(sale.sale_date)} · Total {tk(sale.grand_total)}</p>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Item</th><th className="text-right">Sold</th><th className="text-right">Unit (net)</th><th>Return qty</th><th>Back to stock</th></tr></thead>
            <tbody>{sale.items.map((i) => {
              const left = i.qty - i.returned_qty;
              return (
                <tr key={i.id} className={cls(left <= 0 && 'opacity-50')}>
                  <td>{i.product_name}<div className="text-xs text-slate-500">{i.variant_label}</div></td>
                  <td className="text-right">{num(i.qty)}{i.returned_qty > 0 && <div className="text-[11px] text-rose-500">{num(i.returned_qty)} returned</div>}</td>
                  <td className="text-right">{tk(unit(i))}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <input type="number" min="0" max={left} disabled={left <= 0} className="input-sm no-spin w-20 text-center" value={qty[i.id] || ''} placeholder="0"
                        onChange={(e) => setQty({ ...qty, [i.id]: Math.min(Number(e.target.value), left) || '' })} />
                      {left > 0 && <button type="button" className="chip px-2 py-0.5" onClick={() => setQty({ ...qty, [i.id]: left })}>all</button>}
                    </div>
                  </td>
                  <td><input type="checkbox" className="accent-ocean-600" checked={restock[i.id] !== false} onChange={(e) => setRestock({ ...restock, [i.id]: e.target.checked })} title="Untick if the item is damaged" /></td>
                </tr>
              );
            })}</tbody>
          </table></div>
          <div className="flex justify-between rounded-xl bg-amber-50 px-3 py-2.5 font-semibold text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"><span>Exchange credit</span><span>{tk(credit)}</span></div>
        </div>
      )}
    </Modal>
  );
}
