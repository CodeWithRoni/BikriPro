import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackagePlus, Plus, Trash2, Search, Package, Eye, Phone, History, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PartyPicker, ProductPicker, AccountSelect } from '../components/Pickers';
import ProductForm from '../components/ProductForm';
import PartyForm from '../components/PartyForm';
import { PageHeader, Tabs, Field, Empty, DateRange, Pagination, Modal, Spinner, Badge, useDebounced } from '../components/ui';
import { tk, num, todayStr, monthStart, fmtDate, variantLabel, cls } from '../utils/format';

export default function Purchase() {
  const [tab, setTab] = useState('new');
  return (
    <div>
      <PageHeader icon={PackagePlus} title="Purchase" subtitle="Receive stock from suppliers"
        actions={<Link to="/products" className="btn-secondary"><Package className="h-4 w-4" /> Products</Link>} />
      <Tabs tabs={[['new', 'New purchase'], ['list', 'Purchase list']]} value={tab} onChange={setTab} />
      {tab === 'new' ? <NewPurchase onDone={() => setTab('list')} /> : <PurchaseList />}
    </div>
  );
}

function NewPurchase({ onDone }) {
  const [supplier, setSupplier] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [ref, setRef] = useState('');
  const [rows, setRows] = useState([]);
  const [discount, setDiscount] = useState('');
  const [other, setOther] = useState('');
  const [paid, setPaid] = useState('');
  const [account, setAccount] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [newProd, setNewProd] = useState(false);
  const [newSup, setNewSup] = useState(false);
  const [supInfo, setSupInfo] = useState(null); // fresh balance + stats for the chosen supplier

  useEffect(() => {
    setSupInfo(null);
    if (!supplier?.id) return undefined;
    let live = true;
    api.get(`/suppliers/${supplier.id}`).then(({ data }) => live && setSupInfo(data)).catch(() => {});
    return () => { live = false; };
  }, [supplier?.id]);

  const addRow = (p) => setRows((rs) => (rs.some((r) => r.variant_id === p.variant_id)
    ? rs.map((r) => (r.variant_id === p.variant_id ? { ...r, qty: Number(r.qty) + 1 } : r))
    : [...rs, { variant_id: p.variant_id, name: p.name, label: variantLabel(p), sku: p.sku, qty: 1, unit_cost: p.purchase_price || '', retail_price: p.retail_price ?? '', wholesale_price: p.wholesale_price ?? '' }]));
  const set = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const subtotal = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unit_cost) || 0), 0);
  const grand = subtotal - (Number(discount) || 0) + (Number(other) || 0);
  const prevDue = Number(supInfo?.balance ?? supplier?.balance ?? 0); // > 0: we owe them · < 0: advance paid to them
  const thisDue = grand - (Number(paid) || 0);
  const totalDue = prevDue + thisDue;

  const onProductCreated = async ({ id }) => {
    const { data } = await api.get(`/products/${id}`);
    data.variants.forEach((v) => addRow({ ...v, variant_id: v.id, name: data.name }));
  };

  const save = async () => {
    if (!supplier) return toast.error('Select a supplier');
    if (!rows.length) return toast.error('Add products');
    setBusy(true);
    try {
      const { data } = await api.post('/purchases', {
        supplier_id: supplier.id, supplier_ref: ref, purchase_date: date, discount: Number(discount) || 0, other_cost: Number(other) || 0, note,
        items: rows.map((r) => ({ variant_id: r.variant_id, qty: Number(r.qty), unit_cost: Number(r.unit_cost), retail_price: r.retail_price, wholesale_price: r.wholesale_price })),
        payments: Number(paid) > 0 ? [{ account_id: account, amount: Number(paid) }] : [],
      });
      toast.success(`${data.invoice_no} saved — stock updated`);
      onDone();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Field label="Supplier *"><div className="flex gap-2"><div className="min-w-0 flex-1"><PartyPicker type="supplier" value={supplier} onChange={setSupplier} /></div><button type="button" className="btn-secondary px-3" onClick={() => setNewSup(true)} aria-label="New supplier"><Plus className="h-4 w-4" /></button></div></Field>
          {supplier && <SupplierDueCard supplier={supplier} info={supInfo} due={prevDue} />}
        </div>
        <Field label="Purchase date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Supplier bill no."><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex gap-2"><ProductPicker onPick={addRow} placeholder="Search or scan product to add…" /><button type="button" className="btn-secondary h-12" onClick={() => setNewProd(true)}><Plus className="h-4 w-4" /> New product</button></div>
        {rows.length === 0 ? <Empty icon={Package} title="No items yet" hint="Search existing products or create a new one." /> : (
          <div className="overflow-x-auto">
            <table className="table min-w-[760px]">
              <thead><tr><th>Product</th><th>Qty</th><th>Unit cost</th><th>New retail</th><th>New wholesale</th><th className="text-right">Line total</th><th /></tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={r.variant_id}>
                  <td>{r.name}<div className="text-xs text-slate-500">{[r.label, r.sku].filter(Boolean).join(' · ')}</div></td>
                  <td><input type="number" className="input w-20 py-1.5" value={r.qty} onChange={(e) => set(i, 'qty', e.target.value)} /></td>
                  <td><input type="number" className="input w-24 py-1.5" value={r.unit_cost} onChange={(e) => set(i, 'unit_cost', e.target.value)} /></td>
                  <td><input type="number" className="input w-24 py-1.5" value={r.retail_price} onChange={(e) => set(i, 'retail_price', e.target.value)} /></td>
                  <td><input type="number" className="input w-24 py-1.5" value={r.wholesale_price} onChange={(e) => set(i, 'wholesale_price', e.target.value)} /></td>
                  <td className="text-right font-semibold">{tk((Number(r.qty) || 0) * (Number(r.unit_cost) || 0))}</td>
                  <td><button type="button" className="text-rose-500" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Discount"><input type="number" className="input" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
        <Field label="Transport / other"><input type="number" className="input" value={other} onChange={(e) => setOther(e.target.value)} /></Field>
        <div className="rounded-xl bg-ocean-50 p-3 dark:bg-ocean-900/30"><p className="text-xs text-slate-500">Grand total</p><p className="text-xl font-bold">{tk(grand)}</p></div>
        <Field label="Paid now"><input type="number" className="input" value={paid} placeholder="0" onChange={(e) => setPaid(e.target.value)} /></Field>
        <Field label="Paid from"><AccountSelect value={account} onChange={setAccount} /></Field>
        <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-900/20">
          <p className="text-xs text-slate-500">Due to supplier</p>
          <p className={cls('text-xl font-bold', totalDue > 0 ? 'text-rose-600' : 'text-emerald-600')}>{tk(Math.abs(totalDue))}{totalDue < 0 && <span className="ml-1 text-xs font-semibold">advance</span>}</p>
          {supplier && (
            <div className="mt-1.5 space-y-0.5 border-t border-rose-200/70 pt-1.5 text-[11px] text-slate-500 dark:border-rose-900/50">
              <p className="flex justify-between gap-2"><span>Previous {prevDue < 0 ? 'advance' : 'due'}</span><b className={prevDue > 0 ? 'text-rose-600' : prevDue < 0 ? 'text-emerald-600' : ''}>{prevDue < 0 ? '−' : ''}{tk(Math.abs(prevDue))}</b></p>
              <p className="flex justify-between gap-2"><span>This purchase {thisDue < 0 ? '(overpaid)' : ''}</span><b>{thisDue < 0 ? '−' : '+'}{tk(Math.abs(thisDue))}</b></p>
            </div>
          )}
        </div>
        <Field label="Note" className="sm:col-span-2 lg:col-span-5"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex items-end"><button type="button" className="btn-primary w-full" disabled={busy} onClick={save}>{busy && <Spinner className="h-4 w-4 text-white" />} Save purchase</button></div>
      </div>
      <ProductForm open={newProd} onClose={() => setNewProd(false)} onSaved={onProductCreated} />
      <PartyForm type="supplier" open={newSup} onClose={() => setNewSup(false)} onSaved={setSupplier} />
    </div>
  );
}

/** Shown under the supplier search once a supplier is chosen: who they are and what we already owe them. */
function SupplierDueCard({ supplier, info, due }) {
  const owe = due > 0;
  const adv = due < 0;
  return (
    <div className={cls('mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-3.5 py-2.5',
      owe ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/30'
        : adv ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/30'
          : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50')}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{supplier.name}{supplier.company ? <span className="font-normal text-slate-500"> · {supplier.company}</span> : null}</p>
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
          {supplier.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{supplier.phone}</span>}
          {info?.stats && <span className="inline-flex items-center gap-1"><History className="h-3 w-3" />{num(info.stats.invoices)} purchases{info.stats.last_purchase ? ` · last ${fmtDate(info.stats.last_purchase)}` : ''}</span>}
        </p>
      </div>
      <div className="text-right">
        <p className="flex items-center justify-end gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><Wallet className="h-3 w-3" />{adv ? 'Advance with supplier' : 'Previous due'}</p>
        <p className={cls('text-lg font-extrabold leading-tight', owe ? 'text-rose-600' : adv ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-200')}>
          {info === null && supplier.balance === undefined ? '…' : due === 0 ? 'No due' : tk(Math.abs(due))}
        </p>
      </div>
    </div>
  );
}

function PurchaseList() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data } = useApi('/purchases', { from, to, q: dq, page });
  const [view, setView] = useState(null);
  return (
    <div>
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="Invoice, bill no, supplier…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Invoice</th><th>Date</th><th>Supplier</th><th className="text-right">Qty</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Due</th><th>Status</th><th /></tr></thead>
          <tbody>{data?.data.map((p) => (
            <tr key={p.id} className="cursor-pointer" onClick={async () => setView((await api.get(`/purchases/${p.id}`)).data)}>
              <td className="font-semibold text-ocean-700 dark:text-ocean-300">{p.invoice_no}<div className="text-xs font-normal text-slate-500">{p.supplier_ref}</div></td>
              <td>{fmtDate(p.purchase_date)}</td><td>{p.supplier_name}</td><td className="text-right">{num(p.total_qty)}</td>
              <td className="text-right font-semibold">{tk(p.grand_total)}</td><td className="text-right">{tk(p.paid_amount)}</td>
              <td className="text-right text-rose-600">{p.due_amount > 0 ? tk(p.due_amount) : '—'}</td>
              <td><Badge tone={p.status === 'received' ? 'green' : 'amber'}>{p.status.replace('_', ' ')}</Badge></td><td><Eye className="h-4 w-4 text-slate-400" /></td>
            </tr>
          ))}</tbody>
        </table>
        {!data?.data.length && <Empty title="No purchases in this period" />}
        <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} />
      </div>
      <Modal open={!!view} onClose={() => setView(null)} title={`Purchase ${view?.invoice_no || ''}`} size="lg">
        {view && (
          <div className="space-y-3 text-sm">
            <p>{view.supplier_name} · {fmtDate(view.purchase_date)} {view.supplier_ref && `· Bill ${view.supplier_ref}`}</p>
            <table className="table"><thead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Cost</th><th className="text-right">Total</th></tr></thead>
              <tbody>{view.items.map((i) => <tr key={i.id}><td>{i.product_name} <span className="text-slate-500">{i.variant_label}</span></td><td className="text-right">{num(i.qty)}</td><td className="text-right">{tk(i.unit_cost)}</td><td className="text-right">{tk(i.line_total)}</td></tr>)}</tbody></table>
            <div className="flex flex-wrap justify-end gap-4"><span>Total <b>{tk(view.grand_total)}</b></span><span>Paid <b>{tk(view.paid_amount)}</b></span><span>Due <b className="text-rose-600">{tk(view.due_amount)}</b></span></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
