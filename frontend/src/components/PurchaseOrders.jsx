import { useMemo, useState } from 'react';
import { ClipboardList, Plus, Trash2, Send, PackageCheck, XCircle, MessageCircle, Eye, Sparkles, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { Modal, Field, Empty, Pagination, Spinner, Badge, useDebounced } from './ui';
import Select from './ui/Select';
import { PartyPicker, ProductPicker, AccountSelect } from './Pickers';
import FilterBar, { useFilters, toParams, Sum } from './FilterBar';
import { tk, num, fmtDate, todayStr, monthStart, addDays, variantLabel, cls } from '../utils/format';

const STATUS = { draft: ['Draft', 'slate'], sent: ['Sent', 'ocean'], partial: ['Part received', 'amber'], received: ['Received', 'green'], cancelled: ['Cancelled', 'rose'] };
const waPhone = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('01') && d.length === 11) d = `88${d}`; return /^8801\d{9}$/.test(d) ? d : ''; };

/** Purchase order list with filters */
export function PurchaseOrders() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [f, set, reset] = useFilters({ supplier_id: null, status: '', amount: { min: '', max: '' }, late: false }, () => setPage(1));
  const dq = useDebounced(q);
  const df = useDebounced(f, 350);
  const { data, reload } = useApi('/purchase-orders', { from: from || undefined, to: to || undefined, q: dq || undefined, sort, page, ...toParams(df) });
  const [form, setForm] = useState(null);
  const [viewId, setViewId] = useState(null);

  return (
    <>
      <div className="mb-3 flex justify-end"><button type="button" className="btn-primary" onClick={() => setForm({ supplier: null, items: [], expected_date: addDays(7), note: '' })}><Plus className="h-4 w-4" /> New purchase order</button></div>
      <FilterBar
        search={{ value: q, onChange: (v) => { setQ(v); setPage(1); }, placeholder: 'PO no, supplier or note…' }}
        date={{ from, to, onChange: (a, b) => { setFrom(a); setTo(b); setPage(1); } }} defaultDate={['', '']}
        sort={{ value: sort, onChange: setSort, options: [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['expected', 'Arriving soonest'], ['amount_desc', 'Biggest first']] }}
        values={f} onChange={set} onClear={reset}
        fields={[
          { key: 'supplier_id', label: 'Supplier', type: 'party', party: 'supplier' },
          { key: 'amount', label: 'Order value (৳)', type: 'range' },
          { key: 'status', label: 'Status', type: 'segment', options: [['open', 'Open'], ['draft', 'Draft'], ['sent', 'Sent'], ['partial', 'Part received'], ['received', 'Received'], ['cancelled', 'Cancelled']] },
          { key: 'late', label: 'Late (past expected date)', type: 'toggle' },
        ]}
        summary={data?.summary && <><Sum label="Orders" value={num(data.summary.total)} /><Sum label="Value" value={tk(data.summary.amount)} /><Sum label="Open" value={num(data.summary.open)} tone="amber" /></>} />
      <div className="table-wrap"><table className="table">
        <thead><tr><th>PO</th><th>Date</th><th>Supplier</th><th className="text-right">Items</th><th className="text-right">Received</th><th className="text-right">Value</th><th>Expected</th><th>Status</th><th /></tr></thead>
        <tbody>{data?.data.map((po) => {
          const late = ['sent', 'partial'].includes(po.status) && po.expected_date && po.expected_date < todayStr();
          return (
            <tr key={po.id} className="cursor-pointer" onClick={() => setViewId(po.id)}>
              <td className="font-semibold text-ocean-700 dark:text-ocean-300">{po.po_no}</td><td>{fmtDate(po.order_date)}</td><td>{po.supplier_name}</td>
              <td className="text-right">{num(po.qty)} <span className="text-xs text-slate-400">({num(po.items)})</span></td>
              <td className="text-right">{num(po.received)}</td><td className="text-right font-semibold">{tk(po.total)}</td>
              <td className={cls(late && 'font-semibold text-rose-600')}>{po.expected_date ? fmtDate(po.expected_date) : '—'}{late && ' · late'}</td>
              <td><Badge tone={STATUS[po.status][1]}>{STATUS[po.status][0]}</Badge></td><td><Eye className="h-4 w-4 text-slate-400" /></td>
            </tr>
          );
        })}</tbody>
      </table>{!data?.data.length && <Empty icon={ClipboardList} title="No purchase orders" hint="Make an order list for a supplier, send it by WhatsApp, and receive it into stock when the goods arrive." />}
      <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} /></div>
      <OrderForm form={form} setForm={setForm} onSaved={(po) => { setForm(null); reload(); setViewId(po.id); }} />
      <OrderView id={viewId} onClose={() => setViewId(null)} onChanged={reload} onEdit={(po) => { setViewId(null); setForm({ id: po.id, supplier: { id: po.supplier_id, name: po.supplier_name, phone: po.supplier_phone }, expected_date: po.expected_date || '', note: po.note || '', items: po.items.map((i) => ({ variant_id: i.variant_id, name: i.name, label: variantLabel(i), sku: i.sku, stock: i.stock_qty, qty: i.qty, unit_cost: i.unit_cost })) }); }} />
    </>
  );
}

/** Create / edit a purchase order */
export function OrderForm({ form, setForm, onSaved }) {
  const [busy, setBusy] = useState(false);
  if (!form) return null;
  const f = form;
  const add = (p) => setForm({ ...f, items: f.items.some((i) => i.variant_id === p.variant_id) ? f.items.map((i) => (i.variant_id === p.variant_id ? { ...i, qty: Number(i.qty) + 1 } : i)) : [...f.items, { variant_id: p.variant_id, name: p.name, label: variantLabel(p), sku: p.sku, stock: p.stock_qty, qty: 1, unit_cost: p.purchase_price || '' }] });
  const total = f.items.reduce((t, i) => t + Number(i.qty || 0) * Number(i.unit_cost || 0), 0);
  const save = async (status) => {
    if (!f.supplier) return toast.error('Choose the supplier');
    setBusy(true);
    try {
      const body = { supplier_id: f.supplier.id, expected_date: f.expected_date || null, note: f.note, status, items: f.items.map((i) => ({ variant_id: i.variant_id, qty: Number(i.qty), unit_cost: Number(i.unit_cost) || 0 })) };
      const { data } = f.id ? await api.put(`/purchase-orders/${f.id}`, body) : await api.post('/purchase-orders', body);
      toast.success(f.id ? 'Order updated' : `${data.po_no} created`);
      onSaved(data);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={() => setForm(null)} title={f.id ? 'Edit purchase order' : 'New purchase order'} size="xl"
      footer={<>
        <span className="mr-auto self-center text-sm">Order value <b>{tk(total)}</b></span>
        <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancel</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => save('draft')}>Save as draft</button>
        {!f.id && <button type="button" className="btn-primary" disabled={busy} onClick={() => save('sent')}>{busy && <Spinner className="h-4 w-4 text-white" />}<Send className="h-4 w-4" /> Save as sent</button>}
      </>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <Field label="Supplier *"><PartyPicker type="supplier" value={f.supplier} onChange={(s) => setForm({ ...f, supplier: s })} /></Field>
          <Field label="Expected delivery"><input type="date" className="input" value={f.expected_date || ''} onChange={(e) => setForm({ ...f, expected_date: e.target.value })} /></Field>
        </div>
        <ProductPicker onPick={add} placeholder="Search or scan a product to order…" />
        {f.items.length > 0 ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Product</th><th className="text-right">In stock</th><th className="w-28">Order qty</th><th className="w-32">Cost (৳)</th><th className="text-right">Line</th><th /></tr></thead>
            <tbody>{f.items.map((i, k) => (
              <tr key={i.variant_id}>
                <td className="font-medium">{i.name}<div className="text-xs text-slate-500">{[i.label, i.sku].filter(Boolean).join(' · ')}</div></td>
                <td className="text-right">{num(i.stock)}</td>
                <td><input type="number" min="1" className="input-sm no-spin w-24 text-center" value={i.qty} onChange={(e) => setForm({ ...f, items: f.items.map((x, j) => (j === k ? { ...x, qty: e.target.value } : x)) })} /></td>
                <td><input type="number" min="0" className="input-sm no-spin w-28 text-right" value={i.unit_cost} onChange={(e) => setForm({ ...f, items: f.items.map((x, j) => (j === k ? { ...x, unit_cost: e.target.value } : x)) })} /></td>
                <td className="text-right">{tk(Number(i.qty || 0) * Number(i.unit_cost || 0))}</td>
                <td><button type="button" className="text-slate-400 hover:text-rose-500" onClick={() => setForm({ ...f, items: f.items.filter((_, j) => j !== k) })} aria-label="Remove"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-slate-700">Add products to order</p>}
        <Field label="Note to supplier"><input className="input" value={f.note || ''} onChange={(e) => setForm({ ...f, note: e.target.value })} placeholder="e.g. same colours as last time, deliver before Eid" /></Field>
      </div>
    </Modal>
  );
}

/** One order: send, receive (full or partial), cancel */
function OrderView({ id, onClose, onChanged, onEdit }) {
  const { data: po, reload } = useApi(id ? `/purchase-orders/${id}` : null);
  const [recv, setRecv] = useState(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn, msg) => { setBusy(true); try { await fn(); toast.success(msg); reload(); onChanged(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  const shareText = po && [
    `Purchase Order ${po.po_no}`, `To: ${po.supplier_name}`, po.expected_date ? `Needed by: ${fmtDate(po.expected_date)}` : '', '',
    ...po.items.map((i, k) => `${k + 1}. ${i.name}${variantLabel(i) ? ` (${variantLabel(i)})` : ''} — ${num(i.qty)} pcs${Number(i.unit_cost) ? ` @ ${num(i.unit_cost)}` : ''}`),
    '', `Total: ৳${num(po.total)}`, po.note ? `Note: ${po.note}` : '',
  ].filter((x, k, arr) => x !== '' || arr[k - 1] !== '').join('\n');
  const open = po && ['draft', 'sent', 'partial'].includes(po.status);

  return (
    <Modal open={!!id} onClose={() => { setRecv(null); onClose(); }} title={po ? `${po.po_no} · ${po.supplier_name}` : 'Purchase order'} size="xl"
      footer={po && !recv && <>
        {['draft', 'cancelled'].includes(po.status) && <button type="button" className="btn-ghost mr-auto text-rose-600" disabled={busy} onClick={() => window.confirm('Delete this order?') && act(async () => { await api.delete(`/purchase-orders/${po.id}`); onClose(); }, 'Order deleted')}><Trash2 className="h-4 w-4" /> Delete</button>}
        {open && <button type="button" className="btn-secondary text-rose-600" disabled={busy} onClick={() => window.confirm('Cancel the rest of this order?') && act(() => api.post(`/purchase-orders/${po.id}/status`, { status: 'cancelled' }), 'Order cancelled')}><XCircle className="h-4 w-4" /> Cancel order</button>}
        {['draft', 'sent'].includes(po.status) && <button type="button" className="btn-secondary" onClick={() => onEdit(po)}><Pencil className="h-4 w-4" /> Edit</button>}
        <button type="button" className="btn-secondary text-emerald-700 dark:text-emerald-400" onClick={() => { window.open(`https://wa.me/${waPhone(po.supplier_phone)}?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener'); if (po.status === 'draft') act(() => api.post(`/purchase-orders/${po.id}/status`, { status: 'sent' }), 'Marked as sent'); }}><MessageCircle className="h-4 w-4" /> Send by WhatsApp</button>
        {po.status === 'draft' && <button type="button" className="btn-secondary" disabled={busy} onClick={() => act(() => api.post(`/purchase-orders/${po.id}/status`, { status: 'sent' }), 'Marked as sent')}><Send className="h-4 w-4" /> Mark sent</button>}
        {open && <button type="button" className="btn-primary" onClick={() => setRecv({ qty: Object.fromEntries(po.items.map((i) => [i.variant_id, Math.max(Number(i.qty) - Number(i.received_qty), 0)])), cost: Object.fromEntries(po.items.map((i) => [i.variant_id, i.unit_cost])), paid: '', account_id: null, supplier_ref: '' })}><PackageCheck className="h-4 w-4" /> Receive goods</button>}
      </>}>
      {!po ? <div className="flex justify-center py-10"><Spinner /></div> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge tone={STATUS[po.status][1]}>{STATUS[po.status][0]}</Badge>
            <span className="text-slate-500">Ordered {fmtDate(po.order_date)}{po.expected_date ? ` · expected ${fmtDate(po.expected_date)}` : ''} · by {po.created_by_name}</span>
            {po.purchases.length > 0 && <span className="text-slate-500">Received in: {po.purchases.map((p) => p.invoice_no).join(', ')}</span>}
          </div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Product</th><th className="text-right">Ordered</th><th className="text-right">Received</th>{recv ? <><th className="w-28">Arrived now</th><th className="w-32">Cost</th></> : <><th className="text-right">Cost</th><th className="text-right">Line</th></>}</tr></thead>
            <tbody>{po.items.map((i) => {
              const left = Math.max(Number(i.qty) - Number(i.received_qty), 0);
              return (
                <tr key={i.id}>
                  <td className="font-medium">{i.name}<div className="text-xs text-slate-500">{[variantLabel(i), i.sku].filter(Boolean).join(' · ')}</div></td>
                  <td className="text-right">{num(i.qty)}</td>
                  <td className="text-right">{Number(i.received_qty) >= Number(i.qty) ? <Badge tone="green">{num(i.received_qty)}</Badge> : num(i.received_qty)}</td>
                  {recv ? (
                    <>
                      <td><input type="number" min="0" className="input-sm no-spin w-24 text-center" disabled={!left} value={recv.qty[i.variant_id]} onChange={(e) => setRecv({ ...recv, qty: { ...recv.qty, [i.variant_id]: e.target.value } })} /></td>
                      <td><input type="number" min="0" className="input-sm no-spin w-28 text-right" value={recv.cost[i.variant_id]} onChange={(e) => setRecv({ ...recv, cost: { ...recv.cost, [i.variant_id]: e.target.value } })} /></td>
                    </>
                  ) : <><td className="text-right">{tk(i.unit_cost)}</td><td className="text-right">{tk(Number(i.qty) * Number(i.unit_cost))}</td></>}
                </tr>
              );
            })}</tbody>
          </table></div>
          {po.note && !recv && <p className="text-sm text-slate-500">Note: {po.note}</p>}
          {recv && (
            <div className="rounded-xl border border-ocean-200 bg-ocean-50/50 p-3 dark:border-ocean-900 dark:bg-ocean-950/30">
              <div className="grid gap-3 sm:grid-cols-4">
                <div><p className="text-xs text-slate-500">Value received</p><p className="text-lg font-bold">{tk(po.items.reduce((t, i) => t + Number(recv.qty[i.variant_id] || 0) * Number(recv.cost[i.variant_id] || 0), 0))}</p></div>
                <Field label="Supplier bill no."><input className="input-sm" value={recv.supplier_ref} onChange={(e) => setRecv({ ...recv, supplier_ref: e.target.value })} /></Field>
                <Field label="Paid now"><input type="number" min="0" className="input-sm no-spin" value={recv.paid} placeholder="0" onChange={(e) => setRecv({ ...recv, paid: e.target.value })} /></Field>
                <Field label="Paid from"><AccountSelect value={recv.account_id} onChange={(v) => setRecv((r) => ({ ...r, account_id: v }))} className="input-sm" /></Field>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setRecv(null)}>Back</button>
                <button type="button" className="btn-primary" disabled={busy} onClick={() => act(async () => {
                  const { data } = await api.post(`/purchase-orders/${po.id}/receive`, {
                    supplier_ref: recv.supplier_ref,
                    items: po.items.map((i) => ({ variant_id: i.variant_id, qty: Number(recv.qty[i.variant_id] || 0), unit_cost: Number(recv.cost[i.variant_id] || 0) })),
                    payments: Number(recv.paid) > 0 ? [{ account_id: recv.account_id, amount: Number(recv.paid) }] : [],
                  });
                  setRecv(null);
                  toast(`${data.purchase.invoice_no} created`, { icon: '📦' });
                }, 'Goods received — stock updated')}>{busy && <Spinner className="h-4 w-4 text-white" />}<PackageCheck className="h-4 w-4" /> Receive into stock</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/** What to re-order, based on how fast items sell */
export function ReorderSuggestions() {
  const [f, set, reset] = useFilters({ days: '', cover: '', supplier_id: null });
  const [q, setQ] = useState('');
  const { data, loading } = useApi('/purchase-orders/suggestions', { days: f.days || 30, cover: f.cover || 30, supplier_id: f.supplier_id?.id || undefined });
  const [pick, setPick] = useState({});
  const [form, setForm] = useState(null);
  const rows = useMemo(() => (data?.data || []).filter((r) => !q || `${r.name} ${r.sku} ${r.supplier_name || ''}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const chosen = rows.filter((r) => pick[r.variant_id] !== undefined);

  const makeOrder = () => {
    const suppliers = [...new Set(chosen.map((r) => r.supplier_id || 0))];
    if (suppliers.length > 1) toast('Items from several suppliers — the order starts with the first; add the others separately.', { icon: 'ℹ️' });
    const sid = suppliers[0];
    const first = chosen.filter((r) => (r.supplier_id || 0) === sid);
    setForm({ supplier: sid ? { id: sid, name: first[0].supplier_name } : null, expected_date: addDays(7), note: '', items: first.map((r) => ({ variant_id: r.variant_id, name: r.name, label: variantLabel(r), sku: r.sku, stock: r.stock_qty, qty: pick[r.variant_id] || r.suggested_qty, unit_cost: r.last_cost })) });
  };

  return (
    <>
      <FilterBar search={{ value: q, onChange: setQ, placeholder: 'Find a product…' }}
        values={f} onChange={set} onClear={reset}
        fields={[
          { key: 'supplier_id', label: 'Last bought from', type: 'party', party: 'supplier' },
          { key: 'days', label: 'Look at sales of', type: 'segment', allLabel: '30 days', options: [['14', '14 days'], ['60', '60 days'], ['90', '90 days']] },
          { key: 'cover', label: 'Buy enough for', type: 'segment', allLabel: '30 days', options: [['15', '15 days'], ['45', '45 days'], ['60', '60 days']] },
        ]}
        summary={data && <><Sum label="Need re-order" value={num(rows.length)} tone="amber" /><Sum label="Selected" value={num(chosen.length)} /></>} />
      {chosen.length > 0 && (
        <div className="sticky top-16 z-10 mb-3 flex items-center gap-3 rounded-2xl bg-ocean-600 p-3 text-white shadow-pop">
          <Sparkles className="h-5 w-5" /><span className="flex-1 text-sm font-semibold">{chosen.length} product(s) selected</span>
          <button type="button" className="btn bg-white text-ocean-700 hover:bg-ocean-50" onClick={makeOrder}><ClipboardList className="h-4 w-4" /> Make purchase order</button>
        </div>
      )}
      {loading && !data ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th><input type="checkbox" className="accent-ocean-600" checked={rows.length > 0 && chosen.length === rows.length} onChange={(e) => setPick(e.target.checked ? Object.fromEntries(rows.map((r) => [r.variant_id, r.suggested_qty])) : {})} /></th><th>Product</th><th className="text-right">In stock</th><th className="text-right">Sells / day</th><th className="text-right">Runs out in</th><th className="text-right">On order</th><th>Last supplier</th><th className="w-28">Order qty</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.variant_id}>
              <td><input type="checkbox" className="accent-ocean-600" checked={pick[r.variant_id] !== undefined} onChange={(e) => setPick((p) => { const n = { ...p }; if (e.target.checked) n[r.variant_id] = r.suggested_qty; else delete n[r.variant_id]; return n; })} /></td>
              <td className="font-medium">{r.name}<div className="text-xs text-slate-500">{[r.size, r.color, r.sku].filter(Boolean).join(' · ')}</div></td>
              <td className={cls('text-right', r.stock_qty <= 0 && 'font-semibold text-rose-600')}>{num(r.stock_qty)}</td>
              <td className="text-right">{Number(r.per_day) ? Number(r.per_day).toFixed(1) : '—'}</td>
              <td className="text-right">{r.days_left === null ? <span className="text-xs text-slate-400">no recent sales</span> : <Badge tone={r.days_left <= 7 ? 'rose' : r.days_left <= 15 ? 'amber' : 'slate'}>{r.days_left} days</Badge>}</td>
              <td className="text-right">{Number(r.on_order) ? num(r.on_order) : '—'}</td>
              <td className="text-slate-500">{r.supplier_name || '—'}</td>
              <td><input type="number" min="1" className="input-sm no-spin w-24 text-center" value={pick[r.variant_id] ?? r.suggested_qty} onChange={(e) => setPick({ ...pick, [r.variant_id]: e.target.value })} /></td>
            </tr>
          ))}</tbody>
        </table>{!rows.length && <Empty icon={Sparkles} title="Nothing needs re-ordering" hint="Stock covers the next days at the current selling speed." />}</div>
      )}
      <OrderForm form={form} setForm={setForm} onSaved={(po) => { setForm(null); setPick({}); toast.success(`${po.po_no} ready — see Purchase orders`); }} />
    </>
  );
}
