import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ClipboardCheck, ScanLine, Plus, ArrowLeft, CheckCircle2, XCircle, PackageX, PackageCheck, Trash2, Search, AlertTriangle, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import useCatalog from '../hooks/useCatalog';
import { PageHeader, Tabs, Modal, Field, Empty, Pagination, Spinner, Badge, useDebounced } from '../components/ui';
import Select from '../components/ui/Select';
import { ProductPicker } from '../components/Pickers';
import FilterBar, { useFilters, toParams, Sum } from '../components/FilterBar';
import { tk, num, fmtDate, fmtDateTime, monthStart, todayStr, variantLabel, cls } from '../utils/format';

export const ADJ_REASONS = [
  ['damage', 'Damaged', 'Torn, stained, broken'],
  ['lost', 'Lost', 'Cannot be found'],
  ['theft', 'Theft', 'Stolen from the shop'],
  ['expired', 'Out of use', 'Old / unsellable'],
  ['gift', 'Gift / sample', 'Given away free'],
  ['found', 'Found (add back)', 'Extra stock found'],
  ['other', 'Other', 'Any other reason'],
];
const REASON_LABEL = { ...Object.fromEntries(ADJ_REASONS.map(([k, l]) => [k, l])), count: 'Stock count' };

export default function StockControl() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'count';
  return (
    <div>
      <PageHeader icon={ClipboardCheck} title="Stock Control" subtitle="Count what is really on the shelf, and record damaged or lost items" />
      <Tabs tabs={[['count', 'Stock count'], ['adjust', 'Damage / Lost']]} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'count' ? <StockCounts /> : <Adjustments />}
    </div>
  );
}

// =====================================================================
// Stock count
// =====================================================================
function StockCounts() {
  const [params, setParams] = useSearchParams();
  const openId = params.get('count');
  const list = useApi(openId ? null : '/stock-counts');
  const [newOpen, setNewOpen] = useState(false);
  const open = (id) => setParams({ tab: 'count', count: id });

  if (openId) return <CountSheet id={openId} onBack={() => setParams({ tab: 'count' })} />;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-500">Start a count, scan every item on the shelf, then apply — the system fixes the stock and records the difference.</p>
        <button type="button" className="btn-primary ml-auto" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> New stock count</button>
      </div>
      {list.loading && !list.data ? <div className="flex justify-center py-12"><Spinner /></div> : !list.data?.data.length ? (
        <div className="card"><Empty icon={ScanLine} title="No stock counts yet" hint="Count one category at a time — e.g. all shirts this week." action={<button type="button" className="btn-primary" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> New stock count</button>} /></div>
      ) : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Count</th><th>Title</th><th>Started</th><th>By</th><th className="text-right">Counted</th><th>Status</th><th /></tr></thead>
          <tbody>{list.data.data.map((c) => (
            <tr key={c.id} className="cursor-pointer" onClick={() => open(c.id)}>
              <td className="font-semibold">{c.count_no}</td><td>{c.title || '—'}</td><td className="text-slate-500">{fmtDateTime(c.created_at)}</td><td>{c.created_by_name}</td>
              <td className="text-right">{num(c.counted)} / {num(c.items)}</td>
              <td><Badge tone={{ draft: 'amber', applied: 'green', cancelled: 'slate' }[c.status]}>{{ draft: 'In progress', applied: 'Applied', cancelled: 'Cancelled' }[c.status]}</Badge></td>
              <td><Eye className="h-4 w-4 text-slate-400" /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <NewCount open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => { setNewOpen(false); open(id); }} />
    </>
  );
}

function NewCount({ open, onClose, onCreated }) {
  const c = useCatalog(open);
  const [f, setF] = useState({ title: '', mode: 'category', category_id: '', brand_id: '' });
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (f.mode === 'category' && !f.category_id) return toast.error('Choose a category');
    if (f.mode === 'brand' && !f.brand_id) return toast.error('Choose a brand');
    setBusy(true);
    try {
      const { data } = await api.post('/stock-counts', {
        title: f.title || (f.mode === 'category' ? c.main.find((x) => String(x.id) === String(f.category_id))?.name : f.mode === 'brand' ? c.brands.find((x) => String(x.id) === String(f.brand_id))?.name : f.mode === 'all' ? 'Full shop' : 'Scan only'),
        category_id: f.mode === 'category' ? f.category_id : undefined, brand_id: f.mode === 'brand' ? f.brand_id : undefined, all: f.mode === 'all',
      });
      onCreated(data.id);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New stock count" size="md"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={create}>{busy && <Spinner className="h-4 w-4 text-white" />}<ScanLine className="h-4 w-4" /> Start counting</button></>}>
      <div className="space-y-4">
        <div>
          <span className="label">What will you count?</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {[['category', 'One category', 'All products of a category are listed; items you don\'t find show as missing'], ['brand', 'One brand', 'All products of a brand'], ['all', 'Whole shop', 'Every product — best on a closed day'], ['scan', 'Only what I scan', 'Start empty; only scanned items are checked']].map(([k, l, h]) => (
              <button type="button" key={k} onClick={() => setF({ ...f, mode: k })} className={cls('rounded-xl border-2 p-3 text-left transition', f.mode === k ? 'border-ocean-500 bg-ocean-50 dark:bg-ocean-900/30' : 'border-slate-200 dark:border-slate-700')}>
                <span className="block text-sm font-semibold">{l}</span><span className="block text-[11px] leading-snug text-slate-500">{h}</span>
              </button>
            ))}
          </div>
        </div>
        {f.mode === 'category' && <Field label="Category"><Select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">Choose…</option>{c.main.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>}
        {f.mode === 'brand' && <Field label="Brand"><Select className="input" value={f.brand_id} onChange={(e) => setF({ ...f, brand_id: e.target.value })}><option value="">Choose…</option>{c.brands.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>}
        <Field label="Title" hint="Optional"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Shirts — Friday" /></Field>
      </div>
    </Modal>
  );
}

function CountSheet({ id, onBack }) {
  const { data: sc, reload, setData } = useApi(`/stock-counts/${id}`);
  const [code, setCode] = useState('');
  const [last, setLast] = useState(null);
  const [view, setView] = useState('all');
  const [q, setQ] = useState('');
  const [applyOpen, setApplyOpen] = useState(false);
  const [missingZero, setMissingZero] = useState(false);
  const [busy, setBusy] = useState(false);
  const scanRef = useRef(null);
  const draft = sc?.status === 'draft';

  useEffect(() => { if (draft) scanRef.current?.focus(); }, [draft]);

  const scan = async (e) => {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    setCode('');
    try {
      const { data } = await api.post(`/stock-counts/${id}/scan`, { code: c });
      setLast({ ...data, ok: true });
      reload();
    } catch (err) { setLast({ ok: false, msg: err.message }); toast.error(err.message); }
    scanRef.current?.focus();
  };
  const setCount = async (variantId, value) => {
    try {
      await api.put(`/stock-counts/${id}/items`, { variant_id: variantId, counted_qty: value === '' ? null : Number(value) });
      setData((d) => ({ ...d, items: d.items.map((i) => (i.variant_id === variantId ? { ...i, counted_qty: value === '' ? null : Number(value), difference: value === '' ? null : Number(value) - i.expected_qty } : i)) }));
    } catch (err) { toast.error(err.message); }
  };
  const removeItem = async (variantId) => { await api.put(`/stock-counts/${id}/items`, { variant_id: variantId, remove: true }); reload(); };
  const addManual = async (p) => { await api.put(`/stock-counts/${id}/items`, { variant_id: p.variant_id, counted_qty: null }).catch(() => {}); reload(); };

  const apply = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/stock-counts/${id}/apply`, { missing_as_zero: missingZero });
      toast.success(data.changed ? `Stock updated for ${data.changed} item(s)` : 'Everything matched — no change needed');
      setApplyOpen(false); reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!window.confirm('Cancel this count? Nothing will change in stock.')) return;
    try { await api.post(`/stock-counts/${id}/cancel`); toast.success('Count cancelled'); reload(); } catch (e) { toast.error(e.message); }
  };

  const items = sc?.items || [];
  const stats = useMemo(() => {
    const counted = items.filter((i) => i.counted_qty !== null);
    const diffOf = (i) => (i.counted_qty === null ? (missingZero && draft ? -i.expected_qty : null) : i.difference);
    const short = items.filter((i) => (diffOf(i) ?? 0) < 0);
    const over = items.filter((i) => (diffOf(i) ?? 0) > 0);
    const value = (list) => list.reduce((t, i) => t + diffOf(i) * Number(i.purchase_price || 0), 0);
    return { counted: counted.length, notCounted: items.length - counted.length, short: short.length, over: over.length, matched: counted.filter((i) => i.difference === 0).length, shortValue: value(short), overValue: value(over) };
  }, [items, missingZero, draft]);
  const shown = items.filter((i) => {
    const s = q.trim().toLowerCase();
    if (s && !`${i.name} ${i.sku} ${i.barcode || ''} ${i.size || ''} ${i.color || ''}`.toLowerCase().includes(s)) return false;
    if (view === 'counted') return i.counted_qty !== null;
    if (view === 'pending') return i.counted_qty === null;
    if (view === 'short') return i.difference !== null && i.difference < 0;
    if (view === 'over') return i.difference !== null && i.difference > 0;
    if (view === 'matched') return i.difference === 0;
    return true;
  });

  if (!sc) return <div className="flex justify-center py-16"><Spinner /></div>;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" onClick={onBack}><ArrowLeft className="h-4 w-4" /> All counts</button>
        <div className="min-w-0">
          <p className="font-bold">{sc.count_no} {sc.title && <span className="font-normal text-slate-500">· {sc.title}</span>}</p>
          <p className="text-xs text-slate-500">Started {fmtDateTime(sc.created_at)} by {sc.created_by_name}</p>
        </div>
        <Badge tone={{ draft: 'amber', applied: 'green', cancelled: 'slate' }[sc.status]}>{{ draft: 'In progress', applied: 'Applied', cancelled: 'Cancelled' }[sc.status]}</Badge>
        {draft && (
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn-secondary text-rose-600" onClick={cancel}><XCircle className="h-4 w-4" /> Cancel</button>
            <button type="button" className="btn-primary" onClick={() => setApplyOpen(true)} disabled={!stats.counted}><CheckCircle2 className="h-4 w-4" /> Finish &amp; apply</button>
          </div>
        )}
      </div>

      {draft && (
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_340px]">
          <form onSubmit={scan} className="card flex items-center gap-3 p-3">
            <ScanLine className="h-6 w-6 shrink-0 text-ocean-600" />
            <input ref={scanRef} className="input h-12 text-lg" placeholder="Scan barcode or type SKU, then Enter — each scan counts 1" value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="submit" className="btn-primary h-12">Add</button>
          </form>
          <div className={cls('card flex items-center gap-3 p-3', last && (last.ok ? 'border-emerald-300 dark:border-emerald-800' : 'border-rose-300 dark:border-rose-800'))}>
            {!last ? <p className="text-sm text-slate-400">Last scan shows here</p> : last.ok ? (
              <><PackageCheck className="h-7 w-7 shrink-0 text-emerald-500" /><div className="min-w-0"><p className="truncate font-semibold">{last.name}</p><p className="text-xs text-slate-500">{[last.size, last.color, last.sku].filter(Boolean).join(' · ')}</p><p className="text-sm">Counted <b>{num(last.counted_qty)}</b> · system {num(last.stock_qty)}</p></div></>
            ) : <><AlertTriangle className="h-7 w-7 shrink-0 text-rose-500" /><p className="text-sm text-rose-600">{last.msg}</p></>}
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[['Counted', `${num(stats.counted)} / ${num(items.length)}`, 'ocean'], ['Not counted', num(stats.notCounted), 'slate'], ['Matched', num(stats.matched), 'green'], ['Short', `${num(stats.short)} · ${tk(Math.abs(stats.shortValue))}`, 'rose'], ['Over', `${num(stats.over)} · ${tk(stats.overValue)}`, 'amber']].map(([l, v, tone]) => (
          <div key={l} className="card px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l}</p><p className={cls('text-lg font-bold', tone === 'rose' && 'text-rose-600', tone === 'amber' && 'text-amber-600', tone === 'green' && 'text-emerald-600')}>{v}</p></div>
        ))}
      </div>

      <div className="card mb-3 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="Find in this count…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
          {[['all', 'All'], ['pending', 'Not counted'], ['counted', 'Counted'], ['short', 'Short'], ['over', 'Over'], ['matched', 'Matched']].map(([k, l]) => (
            <button type="button" key={k} onClick={() => setView(k)} className={cls('rounded-lg px-3 py-1.5 text-xs font-semibold transition', view === k ? 'bg-ocean-600 text-white' : 'text-slate-600 dark:text-slate-300')}>{l}</button>
          ))}
        </div>
        {draft && <div className="w-full sm:w-72"><ProductPicker onPick={addManual} placeholder="Add a product by search…" /></div>}
      </div>

      <div className="table-wrap"><table className="table">
        <thead><tr><th>Product</th><th>SKU</th><th className="text-right">{draft ? 'In system' : 'Was in system'}</th><th className="w-36">Counted</th><th className="text-right">Difference</th><th className="text-right">Value</th>{draft && <th />}</tr></thead>
        <tbody>{shown.map((i) => (
          <tr key={i.id}>
            <td className="font-medium">{i.name}<div className="text-xs text-slate-500">{variantLabel(i)}</div></td>
            <td className="text-xs">{i.sku}</td>
            <td className="text-right">{num(i.expected_qty)}</td>
            <td>{draft ? <input type="number" min="0" className="input-sm no-spin w-24 text-center font-semibold" placeholder="—" defaultValue={i.counted_qty ?? ''} key={`${i.id}-${i.counted_qty}`} onBlur={(e) => e.target.value !== String(i.counted_qty ?? '') && setCount(i.variant_id, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} /> : <b>{i.counted_qty === null ? '—' : num(i.counted_qty)}</b>}</td>
            <td className="text-right">{i.difference === null ? <span className="text-xs text-slate-400">not counted</span> : i.difference === 0 ? <Badge tone="green">OK</Badge> : <Badge tone={i.difference < 0 ? 'rose' : 'amber'}>{i.difference > 0 ? '+' : ''}{num(i.difference)}</Badge>}</td>
            <td className={cls('text-right text-sm', i.difference < 0 && 'text-rose-600', i.difference > 0 && 'text-amber-600')}>{i.difference ? tk(i.difference * Number(i.purchase_price || 0)) : ''}</td>
            {draft && <td><button type="button" className="text-slate-400 hover:text-rose-500" onClick={() => removeItem(i.variant_id)} aria-label="Remove"><Trash2 className="h-4 w-4" /></button></td>}
          </tr>
        ))}</tbody>
      </table>{!shown.length && <Empty icon={ScanLine} title={items.length ? 'Nothing in this view' : 'Scan the first item to start'} />}</div>

      <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title="Finish the count" size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setApplyOpen(false)}>Back</button><button type="button" className="btn-primary" disabled={busy} onClick={apply}>{busy && <Spinner className="h-4 w-4 text-white" />} Apply to stock</button></>}>
        <div className="space-y-3 text-sm">
          <p>Stock will be set to what you counted. Differences are saved as a <b>stock count adjustment</b> and show in Profit as stock loss or gain.</p>
          <div className="space-y-1 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <div className="flex justify-between"><span>Counted items</span><b>{num(stats.counted)}</b></div>
            <div className="flex justify-between text-rose-600"><span>Short</span><b>{num(stats.short)} · {tk(Math.abs(stats.shortValue))}</b></div>
            <div className="flex justify-between text-amber-600"><span>Over</span><b>{num(stats.over)} · {tk(stats.overValue)}</b></div>
          </div>
          {stats.notCounted > 0 && (
            <label className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-900/20">
              <input type="checkbox" className="mt-0.5 accent-ocean-600" checked={missingZero} onChange={(e) => setMissingZero(e.target.checked)} />
              <span><b>{num(stats.notCounted)} item(s) were not counted.</b> Tick to treat them as 0 (missing). Leave unticked to keep their stock as it is.</span>
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}

// =====================================================================
// Damage / Lost
// =====================================================================
function Adjustments() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [f, set, reset] = useFilters({ reason: '', type: '', value: { min: '', max: '' } }, () => setPage(1));
  const dq = useDebounced(q);
  const df = useDebounced(f, 350);
  const { data, reload } = useApi('/stock-adjustments', { from: from || undefined, to: to || undefined, q: dq || undefined, sort, page, ...toParams(df) });
  const [form, setForm] = useState(null);
  const s = data?.summary;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-500">Damaged, lost or stolen items leave stock here, and their cost is counted as a loss in Profit.</p>
        <button type="button" className="btn-primary ml-auto" onClick={() => setForm({ reason: 'damage', items: [], note: '', date: todayStr() })}><PackageX className="h-4 w-4" /> Record damage / lost</button>
      </div>
      <FilterBar
        search={{ value: q, onChange: (v) => { setQ(v); setPage(1); }, placeholder: 'Product, SKU, note or ADJ no…' }}
        date={{ from, to, onChange: (a, b) => { setFrom(a); setTo(b); setPage(1); } }} defaultDate={[monthStart(), todayStr()]}
        sort={{ value: sort, onChange: setSort, options: [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['value_asc', 'Biggest loss first'], ['value_desc', 'Biggest gain first']] }}
        values={f} onChange={set} onClear={reset}
        fields={[
          { key: 'reason', label: 'Reason', type: 'select', options: [...ADJ_REASONS.map(([k, l]) => [k, l]), ['count', 'Stock count']], placeholder: 'All reasons' },
          { key: 'value', label: 'Value (৳)', type: 'range' },
          { key: 'type', label: 'Type', type: 'segment', options: [['loss', 'Stock out (loss)'], ['gain', 'Stock in (gain)']] },
        ]}
        summary={s && <><Sum label="Entries" value={num(s.total)} /><Sum label="Loss" value={tk(Math.abs(s.loss))} tone="rose" /><Sum label="Gain" value={tk(s.gain)} tone="green" />{s.by_reason?.map((r) => <span key={r.reason} className="text-xs">{REASON_LABEL[r.reason] || r.reason} <b className={Number(r.value) < 0 ? 'text-rose-600' : 'text-emerald-600'}>{tk(Math.abs(r.value))}</b></span>)}</>} />
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Date</th><th>No</th><th>Product</th><th>Reason</th><th className="text-right">Qty</th><th className="text-right">Cost value</th><th>Note</th><th>By</th></tr></thead>
        <tbody>{data?.data.map((a) => (
          <tr key={a.id}>
            <td className="whitespace-nowrap">{fmtDate(a.adj_date)}</td><td className="text-xs">{a.adj_no}</td>
            <td className="font-medium">{a.name}<div className="text-xs text-slate-500">{[a.size, a.color, a.sku].filter(Boolean).join(' · ')}</div></td>
            <td><Badge tone={a.qty_change < 0 ? 'rose' : 'green'}>{REASON_LABEL[a.reason] || a.reason}</Badge></td>
            <td className={cls('text-right font-semibold', a.qty_change < 0 ? 'text-rose-600' : 'text-emerald-600')}>{a.qty_change > 0 ? '+' : ''}{num(a.qty_change)}</td>
            <td className={cls('text-right', a.value < 0 ? 'text-rose-600' : 'text-emerald-600')}>{tk(a.value)}</td>
            <td className="max-w-xs truncate text-slate-500">{a.note}</td><td className="text-slate-500">{a.user_name}</td>
          </tr>
        ))}</tbody>
      </table>{!data?.data.length && <Empty icon={PackageX} title="No entries match these filters" />}
      <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} /></div>
      <AdjustForm form={form} setForm={setForm} onSaved={() => { setForm(null); reload(); }} />
    </>
  );
}

function AdjustForm({ form, setForm, onSaved }) {
  const [busy, setBusy] = useState(false);
  if (!form) return null;
  const f = form;
  const addItem = (p) => setForm({ ...f, items: f.items.some((i) => i.variant_id === p.variant_id) ? f.items.map((i) => (i.variant_id === p.variant_id ? { ...i, qty: Number(i.qty) + 1 } : i)) : [...f.items, { variant_id: p.variant_id, name: p.name, label: variantLabel(p), sku: p.sku, stock: p.stock_qty, cost: p.purchase_price, qty: 1 }] });
  const total = f.items.reduce((t, i) => t + Number(i.qty || 0) * Number(i.cost || 0), 0);
  const isIn = f.reason === 'found';
  const save = async () => {
    if (!f.items.length) return toast.error('Add the products');
    setBusy(true);
    try {
      const { data } = await api.post('/stock-adjustments', { reason: f.reason, note: f.note, date: f.date, items: f.items.map((i) => ({ variant_id: i.variant_id, qty: Number(i.qty) })) });
      toast.success(`${data.adj_no} saved — stock updated`);
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={() => setForm(null)} title="Record damage / lost stock" size="lg"
      footer={<><button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancel</button><button type="button" className={isIn ? 'btn-primary' : 'btn-danger'} disabled={busy || !f.items.length} onClick={save}>{busy && <Spinner className="h-4 w-4 text-white" />} {isIn ? 'Add back to stock' : `Remove from stock (${tk(total)})`}</button></>}>
      <div className="space-y-4">
        <div>
          <span className="label">Reason</span>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ADJ_REASONS.map(([k, l, h]) => (
              <button type="button" key={k} onClick={() => setForm({ ...f, reason: k })} className={cls('rounded-xl border-2 p-2.5 text-left transition', f.reason === k ? (k === 'found' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' : 'border-rose-400 bg-rose-50 dark:bg-rose-900/20') : 'border-slate-200 dark:border-slate-700')}>
                <span className="block text-sm font-semibold">{l}</span><span className="block text-[11px] text-slate-500">{h}</span>
              </button>
            ))}
          </div>
        </div>
        <ProductPicker onPick={addItem} placeholder="Search or scan the product…" />
        {f.items.length > 0 && (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Product</th><th className="text-right">In stock</th><th className="w-28">Qty</th><th className="text-right">Cost value</th><th /></tr></thead>
            <tbody>{f.items.map((i, k) => (
              <tr key={i.variant_id}>
                <td className="font-medium">{i.name}<div className="text-xs text-slate-500">{[i.label, i.sku].filter(Boolean).join(' · ')}</div></td>
                <td className="text-right">{num(i.stock)}</td>
                <td><input type="number" min="1" className="input-sm no-spin w-20 text-center" value={i.qty} onChange={(e) => setForm({ ...f, items: f.items.map((x, j) => (j === k ? { ...x, qty: e.target.value } : x)) })} /></td>
                <td className="text-right">{tk(Number(i.qty || 0) * Number(i.cost || 0))}</td>
                <td><button type="button" className="text-slate-400 hover:text-rose-500" onClick={() => setForm({ ...f, items: f.items.filter((_, j) => j !== k) })} aria-label="Remove"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <Field label="Note"><input className="input" value={f.note} onChange={(e) => setForm({ ...f, note: e.target.value })} placeholder="e.g. stained during Eid rush" /></Field>
          <Field label="Date"><input type="date" className="input" value={f.date} max={todayStr()} onChange={(e) => setForm({ ...f, date: e.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
}
