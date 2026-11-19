import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Globe, Plus, Trash2, Truck, PackageCheck, CheckCircle2, XCircle, Undo2, HandCoins, Phone, MapPin, Pencil, ShieldAlert, Package, Printer,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PageHeader, Modal, Field, Empty, Spinner, Badge, Pagination, useDebounced, StatCard } from '../components/ui';
import Select from '../components/ui/Select';
import { ProductPicker, AccountSelect } from '../components/Pickers';
import FilterBar, { useFilters, toParams, Sum } from '../components/FilterBar';
import { tk, num, fmtDateTime, variantLabel, cls } from '../utils/format';

export const SOURCES = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['whatsapp', 'WhatsApp'], ['website', 'Website'], ['phone', 'Phone call'], ['daraz', 'Daraz'], ['other', 'Other']];
export const COURIERS = [['pathao', 'Pathao'], ['steadfast', 'Steadfast'], ['redx', 'RedX'], ['paperfly', 'Paperfly'], ['sundarban', 'Sundarban'], ['ecourier', 'eCourier'], ['own', 'Own delivery man'], ['other', 'Other']];
const SRC = Object.fromEntries(SOURCES);
const CUR = Object.fromEntries(COURIERS);
const STATUS = {
  new: ['New', 'amber'], confirmed: ['Confirmed', 'ocean'], packed: ['Packed', 'ocean'], shipped: ['Shipped', 'violet'],
  delivered: ['Delivered', 'green'], returned: ['Returned', 'rose'], cancelled: ['Cancelled', 'slate'],
};
const FLOW = [['new', 'New'], ['confirmed', 'Confirmed'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered']];

function StatusBadge({ s }) {
  const [l, tone] = STATUS[s];
  return tone === 'violet'
    ? <span className="badge bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">{l}</span>
    : <Badge tone={tone}>{l}</Badge>;
}

export default function OnlineOrders() {
  const [params, setParams] = useSearchParams();
  const role = useSelector((s) => s.auth.user?.role);
  const [tab, setTab] = useState(params.get('cod') === 'pending' ? 'cod' : 'open');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('newest');
  const [f, set, reset] = useFilters({ source: '', courier: '', amount: { min: '', max: '' } }, () => setPage(1));
  const dq = useDebounced(q);
  const df = useDebounced(f, 350);
  const statusParam = { open: 'open', cod: undefined, all: undefined }[tab] ?? tab;
  const { data, reload } = useApi('/online-orders', {
    status: statusParam, cod: tab === 'cod' ? 'pending' : undefined, from: from || undefined, to: to || undefined, q: dq || undefined, sort, page, ...toParams(df),
  });
  const [form, setForm] = useState(null);
  const [viewId, setViewId] = useState(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const counts = data?.counts || {};
  const sm = data?.summary || {};
  const openCount = ['new', 'confirmed', 'packed', 'shipped'].reduce((t, k) => t + (counts[k] || 0), 0);
  const tabs = [['open', `Open (${openCount})`], ['new', `New (${counts.new || 0})`], ['shipped', `On the way (${counts.shipped || 0})`], ['cod', 'COD to settle'], ['delivered', 'Delivered'], ['returned', 'Returned'], ['cancelled', 'Cancelled'], ['all', 'All']];
  const go = (t) => { setTab(t); setPage(1); if (params.get('cod')) setParams({}); };

  return (
    <div>
      <PageHeader icon={Globe} title="Online Orders" subtitle="Facebook, website & phone orders — ship by courier and track cash on delivery"
        actions={<>
          {role !== 'cashier' && <button type="button" className="btn-secondary" onClick={() => setSettleOpen(true)}><HandCoins className="h-4 w-4" /> Courier paid COD</button>}
          <button type="button" className="btn-primary" onClick={() => setForm({})}><Plus className="h-4 w-4" /> New order</button>
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="To confirm" value={num(counts.new || 0)} icon={ShieldAlert} tone="amber" sub="Call the customer first" onClick={() => go('new')} />
        <StatCard label="Ready to ship" value={num((counts.confirmed || 0) + (counts.packed || 0))} icon={Package} sub="Confirmed or packed" onClick={() => go('open')} />
        <StatCard label="With courier" value={num(counts.shipped || 0)} icon={Truck} tone="violet" sub="On the way" onClick={() => go('shipped')} />
        <StatCard label="COD to receive" value={tk(sm.cod_pending)} icon={HandCoins} tone="green" sub="Shipped or delivered, not yet paid" onClick={() => go('cod')} />
      </div>
      <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70">
        {tabs.map(([k, l]) => (
          <button type="button" key={k} onClick={() => go(k)} className={cls('whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition', tab === k ? 'bg-white text-ocean-700 shadow-sm dark:bg-slate-900 dark:text-ocean-300' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200')}>{l}</button>
        ))}
      </div>
      <FilterBar
        search={{ value: q, onChange: (v) => { setQ(v); setPage(1); }, placeholder: 'Order no, name, phone, tracking or address…' }}
        date={{ from, to, onChange: (a, b) => { setFrom(a); setTo(b); setPage(1); } }} defaultDate={['', '']}
        sort={{ value: sort, onChange: setSort, options: [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['amount_desc', 'Biggest first']] }}
        values={f} onChange={set} onClear={reset}
        fields={[
          { key: 'source', label: 'Came from', type: 'select', options: SOURCES },
          { key: 'courier', label: 'Courier', type: 'select', options: COURIERS },
          { key: 'amount', label: 'Order total', type: 'range' },
        ]}
        summary={<><Sum label="Orders" value={num(sm.total)} /> <Sum label="Value" value={tk(sm.amount)} /></>} />
      {!data ? <div className="flex justify-center py-12"><Spinner /></div> : !data.data.length ? (
        <div className="card"><Empty icon={Globe} title="No orders here" hint="Take an order from Facebook, WhatsApp or a phone call. Stock leaves the shop when you ship it." action={<button type="button" className="btn-primary" onClick={() => setForm({})}><Plus className="h-4 w-4" /> New order</button>} /></div>
      ) : (
        <>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Order</th><th>Customer</th><th>Courier</th><th className="text-right">Total</th><th className="text-right">COD</th><th>Status</th></tr></thead>
            <tbody>{data.data.map((o) => (
              <tr key={o.id} className="cursor-pointer" onClick={() => setViewId(o.id)}>
                <td><span className="font-semibold">{o.order_no}</span><span className="block text-xs text-slate-500">{SRC[o.source]} · {fmtDateTime(o.created_at)}</span></td>
                <td><span className="font-medium">{o.customer_name}</span><span className="block text-xs text-slate-500">{o.phone}{o.area ? ` · ${o.area}` : ''}</span></td>
                <td>{o.courier ? CUR[o.courier] : <span className="text-slate-400">—</span>}{o.tracking_no && <span className="block text-xs text-slate-500">{o.tracking_no}</span>}</td>
                <td className="text-right font-semibold">{tk(o.total)}<span className="block text-xs font-normal text-slate-500">{num(o.qty)} pcs</span></td>
                <td className="text-right">{Number(o.cod_amount) > 0 ? <>{tk(o.cod_amount)}<span className={cls('block text-xs', o.cod_status === 'settled' ? 'text-emerald-600' : 'text-amber-600')}>{o.cod_status === 'settled' ? 'Received' : 'Waiting'}</span></> : <span className="text-slate-400">—</span>}</td>
                <td><StatusBadge s={o.status} /></td>
              </tr>
            ))}</tbody>
          </table></div>
          <Pagination page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
        </>
      )}
      <OrderForm value={form} onClose={() => setForm(null)} onSaved={(o) => { setForm(null); reload(); setViewId(o.id); }} />
      <OrderView id={viewId} onClose={() => setViewId(null)} onEdit={(o) => { setViewId(null); setForm(o); }} onChanged={reload} />
      <SettleCod open={settleOpen} onClose={() => setSettleOpen(false)} onDone={() => { setSettleOpen(false); reload(); }} />
    </div>
  );
}

// ---------------------------------------------------------------- order form
const blank = (shop) => ({ source: 'facebook', customer_name: '', phone: '', address: '', area: '', note: '', items: [], discount: '', delivery_charge: shop.online_default_delivery ?? '60', advance_paid: '', advance_account_id: null, advance_ref: '', courier: '', status: 'new' });

function OrderForm({ value, onClose, onSaved }) {
  const shop = useSelector((s) => s.settings.data) || {};
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState(null);
  useEffect(() => {
    if (!value) { setF(null); return; }
    setF(value.id ? {
      ...value, discount: value.discount, delivery_charge: value.delivery_charge, advance_paid: value.advance_paid || '', courier: value.courier || '',
      items: value.items.map((i) => ({ variant_id: i.variant_id, name: i.name, sku: i.sku, size: i.size, color: i.color, stock_qty: i.stock_qty, qty: Number(i.qty), unit_price: Number(i.unit_price), discount: Number(i.discount) })),
    } : blank(shop));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const phone = useDebounced(f?.phone || '', 400);
  useEffect(() => {
    if (!f || phone.replace(/\D/g, '').length < 11) { setHist(null); return; }
    api.get('/online-orders/customer', { params: { phone } }).then((r) => setHist(r.data)).catch(() => {});
  }, [phone]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return <Modal open={false} onClose={onClose} title="" />;
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const add = (p) => set({ items: f.items.some((i) => i.variant_id === p.variant_id) ? f.items.map((i) => (i.variant_id === p.variant_id ? { ...i, qty: i.qty + 1 } : i)) : [...f.items, { ...p, qty: 1, unit_price: Number(p.retail_price) || 0, discount: 0 }] });
  const setItem = (vid, p) => set({ items: f.items.map((i) => (i.variant_id === vid ? { ...i, ...p } : i)) });
  const sub = f.items.reduce((t, i) => t + Number(i.qty || 0) * Number(i.unit_price || 0) - Number(i.discount || 0), 0);
  const total = sub - Number(f.discount || 0) + Number(f.delivery_charge || 0);
  const cod = total - Number(f.advance_paid || 0);
  const fillCustomer = () => hist?.customer && set({ customer_name: f.customer_name || hist.customer.name, address: f.address || hist.customer.address || '', area: f.area || hist.customer.area || '' });
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, items: f.items.map((i) => ({ variant_id: i.variant_id, qty: Number(i.qty), unit_price: Number(i.unit_price), discount: Number(i.discount || 0) })) };
      const { data } = f.id ? await api.put(`/online-orders/${f.id}`, body) : await api.post('/online-orders', body);
      toast.success(f.id ? 'Order updated' : `${data.order_no} saved`);
      onSaved(data);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const risky = hist && Number(hist.returned) + Number(hist.cancelled) > 0;
  return (
    <Modal open onClose={onClose} title={f.id ? `Edit ${f.order_no}` : 'New online order'} size="xl"
      footer={<>
        <span className="mr-auto self-center text-sm">Total <b>{tk(total)}</b> · Collect on delivery <b className="text-ocean-700 dark:text-ocean-300">{tk(Math.max(cod, 0))}</b></span>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={busy || !f.items.length || !f.customer_name.trim() || !f.phone.trim()} onClick={save}>Save order</button>
      </>}>
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Came from"><Select className="input" value={f.source} onChange={(e) => set({ source: e.target.value })}>{SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Phone"><input className="input" inputMode="tel" autoFocus={!f.id} value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="01XXXXXXXXX" /></Field>
          </div>
          {hist && Number(hist.orders) > 0 && (
            <div className={cls('rounded-xl p-3 text-sm', risky ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300')}>
              <b>{risky ? 'Careful — ' : ''}This number ordered {hist.orders} time(s) before:</b> {hist.delivered} delivered, {hist.returned} returned, {hist.cancelled} cancelled.
            </div>
          )}
          {hist?.customer && (
            <button type="button" className="w-full rounded-xl border border-dashed border-slate-300 p-2.5 text-left text-sm hover:border-ocean-400 dark:border-slate-700" onClick={fillCustomer}>
              Existing customer <b>{hist.customer.name}</b>{Number(hist.customer.balance) > 0 && <span className="text-rose-600"> · owes {tk(hist.customer.balance)}</span>} — <span className="text-ocean-600">use their details</span>
            </button>
          )}
          <Field label="Customer name"><input className="input" value={f.customer_name} onChange={(e) => set({ customer_name: e.target.value })} /></Field>
          <Field label="Delivery address"><textarea className="input min-h-[4.5rem]" value={f.address || ''} onChange={(e) => set({ address: e.target.value })} placeholder="House, road, area" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Area / thana"><input className="input" value={f.area || ''} onChange={(e) => set({ area: e.target.value })} placeholder="e.g. Mirpur" /></Field>
            <Field label="Courier"><Select className="input" value={f.courier || ''} onChange={(e) => set({ courier: e.target.value })}><option value="">Decide later</option>{COURIERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          </div>
          <Field label="Note"><input className="input" value={f.note || ''} onChange={(e) => set({ note: e.target.value })} placeholder="Size check, gift wrap, call before delivery…" /></Field>
        </div>
        <div className="space-y-3 lg:col-span-3">
          <ProductPicker onPick={add} placeholder="Search or scan the ordered products…" />
          {f.items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500 dark:border-slate-700">Add the products the customer ordered</div> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Product</th><th className="w-20 text-right">Qty</th><th className="w-28 text-right">Price</th><th className="w-24 text-right">Less</th><th className="text-right">Total</th><th /></tr></thead>
              <tbody>{f.items.map((i) => (
                <tr key={i.variant_id}>
                  <td><span className="font-medium">{i.name}</span><span className={cls('block text-xs', Number(i.stock_qty) < Number(i.qty) ? 'text-rose-600' : 'text-slate-500')}>{[variantLabel(i), `stock ${num(i.stock_qty)}`].filter(Boolean).join(' · ')}</span></td>
                  <td><input type="number" min="1" className="input py-1.5 text-right" value={i.qty} onChange={(e) => setItem(i.variant_id, { qty: e.target.value })} /></td>
                  <td><input type="number" min="0" className="input py-1.5 text-right" value={i.unit_price} onChange={(e) => setItem(i.variant_id, { unit_price: e.target.value })} /></td>
                  <td><input type="number" min="0" className="input py-1.5 text-right" value={i.discount} onChange={(e) => setItem(i.variant_id, { discount: e.target.value })} /></td>
                  <td className="text-right font-semibold">{tk(Number(i.qty || 0) * Number(i.unit_price || 0) - Number(i.discount || 0))}</td>
                  <td><button type="button" className="btn-ghost btn-sm text-rose-500" aria-label="Remove" onClick={() => set({ items: f.items.filter((x) => x.variant_id !== i.variant_id) })}><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Discount"><input type="number" min="0" className="input" value={f.discount} onChange={(e) => set({ discount: e.target.value })} /></Field>
            <Field label="Delivery charge" hint="Charged to the customer"><input type="number" min="0" className="input" value={f.delivery_charge} onChange={(e) => set({ delivery_charge: e.target.value })} /></Field>
            <Field label="Advance paid" hint="e.g. bKash before shipping"><input type="number" min="0" className="input" value={f.advance_paid} onChange={(e) => set({ advance_paid: e.target.value })} /></Field>
          </div>
          {Number(f.advance_paid) > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Advance received in"><AccountSelect value={f.advance_account_id} onChange={(v) => set({ advance_account_id: v })} filter={(a) => a.type !== 'card'} /></Field>
              <Field label="Transaction ID"><input className="input" value={f.advance_ref || ''} onChange={(e) => set({ advance_ref: e.target.value })} /></Field>
            </div>
          )}
          <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <div className="flex justify-between"><span>Products</span><span>{tk(sub)}</span></div>
            {Number(f.discount) > 0 && <div className="flex justify-between"><span>Discount</span><span>− {tk(f.discount)}</span></div>}
            <div className="flex justify-between"><span>Delivery</span><span>+ {tk(f.delivery_charge || 0)}</span></div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-bold dark:border-slate-700"><span>Total</span><span>{tk(total)}</span></div>
            {Number(f.advance_paid) > 0 && <div className="flex justify-between text-emerald-600"><span>Advance</span><span>− {tk(f.advance_paid)}</span></div>}
            <div className="flex justify-between font-bold text-ocean-700 dark:text-ocean-300"><span>Collect on delivery (COD)</span><span>{tk(Math.max(cod, 0))}</span></div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- order view
function OrderView({ id, onClose, onEdit, onChanged }) {
  const { data: o, reload } = useApi(id ? `/online-orders/${id}` : null);
  const [ship, setShip] = useState(null);
  const [ret, setRet] = useState(null);
  const [busy, setBusy] = useState(false);
  const shop = useSelector((s) => s.settings.data) || {};
  const move = async (status, extra = {}) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/online-orders/${id}/status`, { status, ...extra });
      toast.success({ shipped: `Shipped — invoice ${data.invoice_no} created`, returned: `Returned — ${data.return_no}, goods back in stock`, cancelled: 'Order cancelled' }[status] || `Marked ${STATUS[status][0].toLowerCase()}`);
      setShip(null); setRet(null);
      reload(); onChanged();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const step = o ? FLOW.findIndex(([k]) => k === o.status) : -1;
  const printLabel = () => {
    const w = window.open('', '_blank', 'width=420,height=600');
    if (!w) return;
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    w.document.write(`<html><head><title>${esc(o.order_no)}</title><style>body{font-family:sans-serif;padding:16px;font-size:14px}h2{margin:0 0 4px}.box{border:2px dashed #333;padding:12px;margin-top:10px}.big{font-size:22px;font-weight:bold}</style></head><body>
      <h2>${esc(shop.shop_name)}</h2><div>${esc(shop.shop_phone)}</div>
      <div class="box"><div>To:</div><div class="big">${esc(o.customer_name)}</div><div>${esc(o.phone)}</div><div>${esc(o.address)}${o.area ? `, ${esc(o.area)}` : ''}</div></div>
      <div class="box">Order <b>${esc(o.order_no)}</b>${o.courier ? ` · ${esc(CUR[o.courier])}` : ''}${o.tracking_no ? ` · ${esc(o.tracking_no)}` : ''}<br>${o.items.map((i) => `${esc(i.name)} ${esc(variantLabel(i))} × ${Number(i.qty)}`).join('<br>')}
      <p class="big">COD: ৳ ${Math.max(Number(o.total) - Number(o.advance_paid), 0).toLocaleString('en-IN')}</p></div>
      <script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
  };
  return (
    <Modal open={Boolean(id)} onClose={onClose} title={o ? `Order ${o.order_no}` : 'Order'} size="lg"
      footer={o && <>
        {['new', 'confirmed', 'packed'].includes(o.status) && <>
          <button type="button" className="btn-secondary mr-auto text-rose-600" disabled={busy} onClick={() => move('cancelled')}><XCircle className="h-4 w-4" /> Cancel</button>
          <button type="button" className="btn-secondary" onClick={() => onEdit(o)}><Pencil className="h-4 w-4" /> Edit</button>
        </>}
        {['shipped', 'delivered'].includes(o.status) && o.cod_status !== 'settled' && <button type="button" className="btn-secondary mr-auto text-rose-600" disabled={busy} onClick={() => setRet({ return_charge: '', refund_advance: false, charge_account_id: null })}><Undo2 className="h-4 w-4" /> Customer refused / returned</button>}
        <button type="button" className="btn-secondary" onClick={printLabel}><Printer className="h-4 w-4" /> Label</button>
        {o.status === 'new' && <button type="button" className="btn-primary" disabled={busy} onClick={() => move('confirmed')}><CheckCircle2 className="h-4 w-4" /> Confirmed by phone</button>}
        {o.status === 'confirmed' && <button type="button" className="btn-primary" disabled={busy} onClick={() => move('packed')}><Package className="h-4 w-4" /> Packed</button>}
        {['confirmed', 'packed'].includes(o.status) && <button type="button" className="btn-primary" disabled={busy} onClick={() => setShip({ courier: o.courier || 'pathao', tracking_no: '', courier_charge: '' })}><Truck className="h-4 w-4" /> Ship</button>}
        {o.status === 'shipped' && <button type="button" className="btn-primary" disabled={busy} onClick={() => move('delivered')}><PackageCheck className="h-4 w-4" /> Delivered</button>}
      </>}>
      {!o ? <div className="flex justify-center py-8"><Spinner /></div> : (
        <div className="space-y-4">
          {!['returned', 'cancelled'].includes(o.status) ? (
            <ol className="flex items-center gap-1 text-xs font-semibold">
              {FLOW.map(([k, l], i) => (
                <li key={k} className="flex flex-1 items-center gap-1">
                  <span className={cls('flex h-6 w-6 shrink-0 items-center justify-center rounded-full', i <= step ? 'bg-ocean-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700')}>{i + 1}</span>
                  <span className={cls('hidden sm:inline', i <= step ? 'text-slate-800 dark:text-white' : 'text-slate-400')}>{l}</span>
                  {i < FLOW.length - 1 && <span className={cls('h-0.5 flex-1', i < step ? 'bg-ocean-600' : 'bg-slate-200 dark:bg-slate-700')} />}
                </li>
              ))}
            </ol>
          ) : <StatusBadge s={o.status} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <p className="font-semibold">{o.customer_name}</p>
              <p className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><Phone className="h-3.5 w-3.5" /> <a className="hover:underline" href={`tel:${o.phone}`}>{o.phone}</a></p>
              {(o.address || o.area) && <p className="flex items-start gap-1.5 text-slate-600 dark:text-slate-300"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {[o.address, o.area].filter(Boolean).join(', ')}</p>}
              {o.note && <p className="mt-1 text-slate-500">“{o.note}”</p>}
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <p>From <b>{SRC[o.source]}</b> · {fmtDateTime(o.created_at)} by {o.created_by_name}</p>
              {o.courier && <p>Courier <b>{CUR[o.courier]}</b>{o.tracking_no && <> · {o.tracking_no}</>}{Number(o.courier_charge) > 0 && <> · charge {tk(o.courier_charge)}</>}</p>}
              {o.invoice_no && <p>Invoice <b>{o.invoice_no}</b> {o.shipped_at && <>· shipped {fmtDateTime(o.shipped_at)}</>}</p>}
              {o.cod_status === 'settled' && <p className="text-emerald-600">COD received {tk(o.settled_amount)} in {o.settle_account_name} · {fmtDateTime(o.settled_at)}</p>}
              {o.cod_status === 'pending' && <p className="text-amber-600">Waiting for the courier to pay {tk(o.cod_amount)}</p>}
            </div>
          </div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Total</th></tr></thead>
            <tbody>{o.items.map((i) => (
              <tr key={i.id}><td><span className="font-medium">{i.name}</span><span className="block text-xs text-slate-500">{[variantLabel(i), i.sku].filter(Boolean).join(' · ')}</span></td>
                <td className="text-right">{num(i.qty)}</td><td className="text-right">{tk(i.unit_price)}</td><td className="text-right">{tk(Number(i.qty) * Number(i.unit_price) - Number(i.discount))}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="ml-auto max-w-xs space-y-0.5 text-sm">
            <div className="flex justify-between"><span>Products</span><span>{tk(o.subtotal)}</span></div>
            {Number(o.discount) > 0 && <div className="flex justify-between"><span>Discount</span><span>− {tk(o.discount)}</span></div>}
            <div className="flex justify-between"><span>Delivery</span><span>+ {tk(o.delivery_charge)}</span></div>
            <div className="flex justify-between font-bold"><span>Total</span><span>{tk(o.total)}</span></div>
            {Number(o.advance_paid) > 0 && <div className="flex justify-between text-emerald-600"><span>Advance ({o.advance_account_name})</span><span>− {tk(o.advance_paid)}</span></div>}
            <div className="flex justify-between font-bold text-ocean-700 dark:text-ocean-300"><span>COD</span><span>{tk(Math.max(Number(o.total) - Number(o.advance_paid), 0))}</span></div>
          </div>
        </div>
      )}
      <Modal open={Boolean(ship)} onClose={() => setShip(null)} title="Hand over to the courier" size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setShip(null)}>Back</button><button type="button" className="btn-primary" disabled={busy} onClick={() => move('shipped', ship)}><Truck className="h-4 w-4" /> Ship now</button></>}>
        {ship && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Shipping makes the sale: stock leaves this branch and the COD amount is kept as the customer's due until the courier pays.</p>
            <Field label="Courier"><Select className="input" value={ship.courier} onChange={(e) => setShip({ ...ship, courier: e.target.value })}>{COURIERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Tracking / consignment no"><input className="input" value={ship.tracking_no} onChange={(e) => setShip({ ...ship, tracking_no: e.target.value })} /></Field>
            <Field label="Courier's charge" hint="Your cost — booked as an expense when the courier pays"><input type="number" min="0" className="input" value={ship.courier_charge} onChange={(e) => setShip({ ...ship, courier_charge: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
      <Modal open={Boolean(ret)} onClose={() => setRet(null)} title="Order came back" size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setRet(null)}>Back</button><button type="button" className="btn-danger" disabled={busy} onClick={() => move('returned', ret)}><Undo2 className="h-4 w-4" /> Mark returned</button></>}>
        {ret && o && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">The goods go back into stock and the customer's COD due is cancelled.</p>
            <Field label="Return charge paid to courier" hint="Optional — booked as a courier expense"><input type="number" min="0" className="input" value={ret.return_charge} onChange={(e) => setRet({ ...ret, return_charge: e.target.value })} /></Field>
            {Number(ret.return_charge) > 0 && <Field label="Paid from"><AccountSelect value={ret.charge_account_id} onChange={(v) => setRet({ ...ret, charge_account_id: v })} /></Field>}
            {Number(o.advance_paid) > 0 && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ret.refund_advance} onChange={(e) => setRet({ ...ret, refund_advance: e.target.checked })} /> Give back the advance of {tk(o.advance_paid)} (otherwise it stays as the customer's credit)</label>
            )}
          </div>
        )}
      </Modal>
    </Modal>
  );
}

// ---------------------------------------------------------------- COD settlement
function SettleCod({ open, onClose, onDone }) {
  const [courier, setCourier] = useState('');
  const { data, loading } = useApi(open ? '/online-orders' : null, { cod: 'pending', courier: courier || undefined, limit: 200, sort: 'oldest' });
  const [pick, setPick] = useState({});
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) setPick({}); }, [open]);
  const rows = data?.data || [];
  const chosen = rows.filter((r) => pick[r.id] !== undefined);
  const cod = chosen.reduce((t, r) => t + Number(r.cod_amount), 0);
  const charges = chosen.reduce((t, r) => t + Number(pick[r.id] === '' ? 0 : pick[r.id]), 0);
  const toggleAll = () => setPick(chosen.length === rows.length ? {} : Object.fromEntries(rows.map((r) => [r.id, pick[r.id] ?? String(Number(r.courier_charge) || '')])));
  const save = async () => {
    setBusy(true);
    try {
      const { data: d } = await api.post('/online-orders/settle', { account_id: account, orders: chosen.map((r) => ({ id: r.id, courier_charge: pick[r.id] })) });
      toast.success(`${d.orders} order(s) settled — ${tk(d.received)} received`);
      onDone();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Courier paid the COD" size="xl"
      footer={<>
        <span className="mr-auto self-center text-sm">COD {tk(cod)} − courier charge {tk(charges)} = <b>{tk(cod - charges)}</b> received</span>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={busy || !chosen.length || !account} onClick={save}><HandCoins className="h-4 w-4" /> Settle {chosen.length || ''}</button>
      </>}>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Field label="Courier"><Select className="input" value={courier} onChange={(e) => { setCourier(e.target.value); setPick({}); }}><option value="">All couriers</option>{COURIERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Money received in"><AccountSelect value={account} onChange={setAccount} filter={(a) => a.type !== 'card'} /></Field>
      </div>
      {loading && !data ? <div className="flex justify-center py-8"><Spinner /></div> : !rows.length ? <Empty icon={HandCoins} title="No COD waiting" hint="Shipped orders with an amount to collect show up here." /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th className="w-8"><input type="checkbox" aria-label="Select all" checked={chosen.length === rows.length} onChange={toggleAll} /></th><th>Order</th><th>Courier</th><th className="text-right">COD</th><th className="w-32 text-right">Their charge</th><th className="text-right">You get</th></tr></thead>
          <tbody>{rows.map((r) => {
            const on = pick[r.id] !== undefined;
            return (
              <tr key={r.id} className={cls(on && 'bg-ocean-50/60 dark:bg-ocean-900/10')}>
                <td><input type="checkbox" aria-label={`Select ${r.order_no}`} checked={on} onChange={() => setPick((p) => { const n = { ...p }; if (on) delete n[r.id]; else n[r.id] = String(Number(r.courier_charge) || ''); return n; })} /></td>
                <td><span className="font-semibold">{r.order_no}</span><span className="block text-xs text-slate-500">{r.customer_name} · {r.tracking_no || 'no tracking'}</span></td>
                <td>{CUR[r.courier] || '—'}<span className="block text-xs"><StatusBadge s={r.status} /></span></td>
                <td className="text-right font-semibold">{tk(r.cod_amount)}</td>
                <td><input type="number" min="0" className="input py-1.5 text-right" disabled={!on} value={on ? pick[r.id] : ''} placeholder={String(Number(r.courier_charge) || 0)} onChange={(e) => setPick((p) => ({ ...p, [r.id]: e.target.value }))} /></td>
                <td className="text-right">{on ? tk(Number(r.cod_amount) - Number(pick[r.id] || 0)) : '—'}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </Modal>
  );
}
