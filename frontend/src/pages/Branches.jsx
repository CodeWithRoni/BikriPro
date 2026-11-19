import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Store, Plus, Pencil, Truck, PackageCheck, XCircle, ArrowRight, Trash2, Eye, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PageHeader, Tabs, Modal, Field, Empty, Spinner, Badge, StatCard } from '../components/ui';
import Select from '../components/ui/Select';
import { ProductPicker } from '../components/Pickers';
import { tk, num, fmtDateTime, variantLabel, cls } from '../utils/format';

const T_STATUS = { in_transit: ['On the way', 'amber'], received: ['Received', 'green'], cancelled: ['Cancelled', 'slate'] };

export default function Branches() {
  const [params, setParams] = useSearchParams();
  const role = useSelector((s) => s.auth.user?.role);
  const tab = params.get('tab') || (role === 'admin' ? 'branches' : 'transfers');
  const tabs = role === 'admin' ? [['branches', 'Branches'], ['transfers', 'Stock transfers']] : [['transfers', 'Stock transfers']];
  return (
    <div>
      <PageHeader icon={Store} title="Branches" subtitle="Each branch keeps its own stock, cash and sales — send goods between them" />
      <Tabs tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'branches' && role === 'admin' ? <BranchList /> : <Transfers />}
    </div>
  );
}

// ---------------------------------------------------------------- branches
function BranchList() {
  const { data, loading, reload } = useApi('/branches/overview');
  const [form, setForm] = useState(null);
  if (loading && !data) return <div className="flex justify-center py-12"><Spinner /></div>;
  const rows = data?.data || [];
  const t = data?.totals || {};
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Today's sales (all)" value={tk(t.today_sales)} icon={Store} sub={`${num(t.today_bills)} bills`} />
        <StatCard label="This month" value={tk(t.month_sales)} icon={Store} tone="green" sub={`Gross profit ${tk(t.month_gross)}`} />
        <StatCard label="Stock (all branches)" value={`${num(t.stock_qty)} pcs`} icon={PackageCheck} tone="violet" sub={`At cost ${tk(t.stock_value)}`} />
        <StatCard label="Branches" value={num(rows.filter((r) => r.is_active).length)} icon={Store} tone="amber" sub={`${num(t.open_shifts)} shift(s) open now`} />
      </div>
      <div className="mb-3 flex items-center gap-3">
        <p className="text-sm text-slate-500">Switch the branch you are working in from the top bar. Choose <b>All branches</b> there to see combined reports.</p>
        <button type="button" className="btn-primary ml-auto" onClick={() => setForm({ name: '', code: '', address: '', phone: '', is_active: true })}><Plus className="h-4 w-4" /> New branch</button>
      </div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Branch</th><th className="text-right">Today</th><th className="text-right">This month</th><th className="text-right">Gross profit</th><th className="text-right">Expenses</th><th className="text-right">Stock</th><th className="text-right">Staff</th><th /></tr></thead>
        <tbody>{rows.map((b) => (
          <tr key={b.id} className={cls(!b.is_active && 'opacity-50')}>
            <td>
              <span className="font-semibold">{b.name}</span> {b.is_main && <Badge tone="ocean">Main</Badge>} {!b.is_active && <Badge>Closed</Badge>}
              {Number(b.incoming) > 0 && <span className="block text-xs text-amber-600">{b.incoming} transfer(s) on the way</span>}
              {Number(b.open_shifts) > 0 && <span className="block text-xs text-slate-500">{b.open_shifts} shift(s) open</span>}
            </td>
            <td className="text-right">{tk(b.today_sales)}<span className="block text-xs text-slate-500">{num(b.today_bills)} bills</span></td>
            <td className="text-right font-semibold">{tk(b.month_sales)}</td>
            <td className="text-right text-emerald-600">{tk(b.month_gross)}</td>
            <td className="text-right">{tk(b.month_expenses)}</td>
            <td className="text-right">{num(b.stock_qty)} pcs<span className="block text-xs text-slate-500">{tk(b.stock_value)}</span></td>
            <td className="text-right">{num(b.users)}</td>
            <td className="text-right"><button type="button" className="btn-ghost btn-sm" onClick={() => setForm({ ...b })} aria-label="Edit"><Pencil className="h-4 w-4" /></button></td>
          </tr>
        ))}</tbody>
      </table></div>
      <BranchForm value={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />
    </>
  );
}

function BranchForm({ value, onClose, onSaved }) {
  const [cur, setCur] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCur(value ? { ...value } : null); }, [value]);
  const set = (p) => setCur((c) => ({ ...c, ...p }));
  const save = async () => {
    setBusy(true);
    try {
      if (cur.id) await api.put(`/branches/${cur.id}`, cur);
      else await api.post('/branches', cur);
      toast.success(cur.id ? 'Branch updated' : 'Branch created — a cash drawer was added for it');
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={Boolean(value)} onClose={onClose} title={cur?.id ? 'Edit branch' : 'New branch'} size="sm"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy || !cur?.name?.trim()} onClick={save}>Save</button></>}>
      {cur && (
        <div className="space-y-3">
          <Field label="Branch name"><input className="input" autoFocus value={cur.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Mirpur 10" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Short code" hint="Optional"><input className="input" value={cur.code || ''} onChange={(e) => set({ code: e.target.value })} placeholder="MRP" /></Field>
            <Field label="Phone"><input className="input" value={cur.phone || ''} onChange={(e) => set({ phone: e.target.value })} /></Field>
          </div>
          <Field label="Address"><input className="input" value={cur.address || ''} onChange={(e) => set({ address: e.target.value })} /></Field>
          {cur.id && !cur.is_main && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cur.is_active !== false} onChange={(e) => set({ is_active: e.target.checked })} /> Branch is open</label>
          )}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- transfers
function Transfers() {
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useApi('/transfers', { status: status || undefined });
  const branches = useApi('/branches');
  const [sendOpen, setSendOpen] = useState(false);
  const [viewId, setViewId] = useState(null);
  const current = branches.data?.current;
  const multi = (branches.data?.data || []).filter((b) => b.is_active).length > 1;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[['', 'All'], ['in_transit', 'On the way'], ['received', 'Received'], ['cancelled', 'Cancelled']].map(([k, l]) => (
          <button type="button" key={k} className={cls('chip', status === k && 'chip-active')} onClick={() => setStatus(k)}>{l}</button>
        ))}
        <button type="button" className="btn-primary ml-auto" disabled={!multi} title={multi ? '' : 'Add a second branch first'} onClick={() => setSendOpen(true)}><Send className="h-4 w-4" /> Send stock</button>
      </div>
      {loading && !data ? <div className="flex justify-center py-12"><Spinner /></div> : !data?.length ? (
        <div className="card"><Empty icon={Truck} title="No stock transfers yet" hint={multi ? 'Send goods from this branch to another one. Stock leaves here now and arrives when the other branch receives it.' : 'Create a second branch to move stock between them.'} /></div>
      ) : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Transfer</th><th>From → To</th><th>Sent</th><th className="text-right">Qty</th><th className="text-right">Value</th><th>Status</th><th /></tr></thead>
          <tbody>{data.map((t) => {
            const incoming = Number(t.to_branch_id) === Number(current) && t.status === 'in_transit';
            return (
              <tr key={t.id} className="cursor-pointer" onClick={() => setViewId(t.id)}>
                <td className="font-semibold">{t.transfer_no}{t.note && <span className="block text-xs font-normal text-slate-500">{t.note}</span>}</td>
                <td><span className="inline-flex items-center gap-1.5">{t.from_branch} <ArrowRight className="h-3.5 w-3.5 text-slate-400" /> {t.to_branch}</span></td>
                <td className="text-slate-500">{fmtDateTime(t.sent_at)}<span className="block text-xs">{t.sent_by_name}</span></td>
                <td className="text-right">{num(t.qty)}</td>
                <td className="text-right">{tk(t.value)}</td>
                <td><Badge tone={T_STATUS[t.status][1]}>{incoming ? 'Arriving here' : T_STATUS[t.status][0]}</Badge></td>
                <td><Eye className="h-4 w-4 text-slate-400" /></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      <SendTransfer open={sendOpen} branches={branches.data} onClose={() => setSendOpen(false)} onDone={() => { setSendOpen(false); reload(); }} />
      <TransferView id={viewId} current={current} onClose={() => setViewId(null)} onChanged={reload} />
    </>
  );
}

function SendTransfer({ open, branches, onClose, onDone }) {
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const others = (branches?.data || []).filter((b) => b.is_active && Number(b.id) !== Number(branches.current));
  const from = branches?.data.find((b) => Number(b.id) === Number(branches?.current));
  const add = (p) => setItems((l) => (l.some((i) => i.variant_id === p.variant_id) ? l.map((i) => (i.variant_id === p.variant_id ? { ...i, qty: Math.min(i.qty + 1, Math.max(p.stock_qty, 1)) } : i)) : [...l, { ...p, qty: 1 }]));
  const total = useMemo(() => items.reduce((t, i) => t + Number(i.qty || 0), 0), [items]);
  const close = () => { setItems([]); setNote(''); setTo(''); onClose(); };
  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/transfers', { to_branch_id: Number(to || others[0]?.id), note, items: items.map((i) => ({ variant_id: i.variant_id, qty: Number(i.qty) })) });
      toast.success(`${data.transfer_no} sent — the other branch receives it when the goods arrive`);
      setItems([]); setNote(''); setTo('');
      onDone();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={close} title="Send stock to another branch" size="lg"
      footer={<><span className="mr-auto self-center text-sm text-slate-500">{items.length} product(s) · {num(total)} pcs</span><button type="button" className="btn-secondary" onClick={close}>Cancel</button><button type="button" className="btn-primary" disabled={busy || !items.length || !others.length} onClick={send}><Send className="h-4 w-4" /> Send</button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From"><input className="input" value={from?.name || ''} disabled /></Field>
          <Field label="To">
            <Select className="input" value={to || String(others[0]?.id || '')} onChange={(e) => setTo(e.target.value)}>
              {others.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
            </Select>
          </Field>
        </div>
        <ProductPicker onPick={add} placeholder="Scan or search the products to send…" autoFocus />
        {items.length > 0 && (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Product</th><th className="text-right">In stock here</th><th className="w-32 text-right">Send</th><th /></tr></thead>
            <tbody>{items.map((i) => (
              <tr key={i.variant_id}>
                <td><span className="font-medium">{i.name}</span><span className="block text-xs text-slate-500">{[variantLabel(i), i.sku].filter(Boolean).join(' · ')}</span></td>
                <td className={cls('text-right', Number(i.qty) > Number(i.stock_qty) && 'font-semibold text-rose-600')}>{num(i.stock_qty)}</td>
                <td><input type="number" min="1" className="input py-1.5 text-right" value={i.qty} onChange={(e) => setItems((l) => l.map((x) => (x.variant_id === i.variant_id ? { ...x, qty: e.target.value } : x)))} /></td>
                <td><button type="button" className="btn-ghost btn-sm text-rose-500" aria-label="Remove" onClick={() => setItems((l) => l.filter((x) => x.variant_id !== i.variant_id))}><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Eid stock, sent with Rahim" /></Field>
      </div>
    </Modal>
  );
}

function TransferView({ id, current, onClose, onChanged }) {
  const role = useSelector((s) => s.auth.user?.role);
  const { data: t, reload } = useApi(id ? `/transfers/${id}` : null);
  const [busy, setBusy] = useState(false);
  const act = async (what) => {
    setBusy(true);
    try {
      await api.post(`/transfers/${id}/${what}`);
      toast.success(what === 'receive' ? 'Received — stock added to this branch' : 'Cancelled — stock returned to the sending branch');
      reload(); onChanged();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const canReceive = t && t.status === 'in_transit' && (role === 'admin' || Number(t.to_branch_id) === Number(current));
  const canCancel = t && t.status === 'in_transit' && (role === 'admin' || Number(t.from_branch_id) === Number(current));
  return (
    <Modal open={Boolean(id)} onClose={onClose} title={t ? `Transfer ${t.transfer_no}` : 'Transfer'} size="lg"
      footer={t && <>
        {canCancel && <button type="button" className="btn-secondary mr-auto text-rose-600" disabled={busy} onClick={() => act('cancel')}><XCircle className="h-4 w-4" /> Cancel transfer</button>}
        <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        {canReceive && <button type="button" className="btn-primary" disabled={busy} onClick={() => act('receive')}><PackageCheck className="h-4 w-4" /> Receive goods</button>}
      </>}>
      {!t ? <div className="flex justify-center py-8"><Spinner /></div> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 text-base font-semibold">{t.from_branch} <ArrowRight className="h-4 w-4 text-slate-400" /> {t.to_branch}</span>
            <Badge tone={T_STATUS[t.status][1]}>{T_STATUS[t.status][0]}</Badge>
          </div>
          <p className="text-sm text-slate-500">Sent {fmtDateTime(t.sent_at)} by {t.sent_by_name}{t.received_at && <> · received {fmtDateTime(t.received_at)} by {t.received_by_name}</>}{t.note && <> · {t.note}</>}</p>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Value (cost)</th></tr></thead>
            <tbody>{t.items.map((i) => (
              <tr key={i.id}><td><span className="font-medium">{i.name}</span><span className="block text-xs text-slate-500">{[variantLabel(i), i.sku].filter(Boolean).join(' · ')}</span></td>
                <td className="text-right">{num(i.qty)}</td><td className="text-right">{tk(Number(i.qty) * Number(i.purchase_price))}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
    </Modal>
  );
}
