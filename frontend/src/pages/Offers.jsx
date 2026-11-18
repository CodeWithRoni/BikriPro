import { useEffect, useMemo, useState } from 'react';
import { BadgePercent, Plus, Pencil, Trash2, Pause, Play, Percent, Banknote, Gift, Receipt, CalendarDays, X, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import useCatalog from '../hooks/useCatalog';
import { PageHeader, Modal, Field, Empty, Spinner, Badge } from '../components/ui';
import Select from '../components/ui/Select';
import { ProductPicker } from '../components/Pickers';
import FilterBar, { useFilters, Sum } from '../components/FilterBar';
import { tk, num, fmtDate, todayStr, addDays, cls } from '../utils/format';

export const OFFER_TYPES = [
  ['percent', '% off items', Percent, 'e.g. Eid offer 20% off all shirts'],
  ['amount', 'Tk off items', Banknote, 'e.g. 100 Tk off each panjabi'],
  ['bogo', 'Buy X get Y free', Gift, 'e.g. buy 2 get 1 free — cheapest is free'],
  ['bill_percent', '% off whole bill', Receipt, 'e.g. 10% off when the bill is 5,000 Tk or more'],
  ['bill_amount', 'Tk off whole bill', Receipt, 'e.g. 300 Tk off bills over 3,000 Tk'],
];
const STATUS_TONE = { running: 'green', scheduled: 'ocean', paused: 'amber', expired: 'slate' };

/** One-line description of what an offer gives */
export function offerText(o) {
  const v = num(o.value);
  switch (o.type) {
    case 'percent': return `${v}% off`;
    case 'amount': return `৳${v} off each`;
    case 'bogo': return `Buy ${o.buy_qty} get ${o.get_qty} free`;
    case 'bill_percent': return `${v}% off bill${Number(o.min_amount) > 0 ? ` over ৳${num(o.min_amount)}` : ''}${o.max_discount ? ` (max ৳${num(o.max_discount)})` : ''}`;
    case 'bill_amount': return `৳${v} off bill${Number(o.min_amount) > 0 ? ` over ৳${num(o.min_amount)}` : ''}`;
    default: return '';
  }
}

const blank = () => ({ name: '', type: 'percent', value: '', buy_qty: 2, get_qty: 1, scope: 'all', scope_ids: [], min_amount: '', max_discount: '', starts_on: todayStr(), ends_on: '', is_active: true, note: '' });

export default function Offers() {
  const { data, loading, reload } = useApi('/offers');
  const c = useCatalog();
  const [q, setQ] = useState('');
  const [f, set, reset] = useFilters({ status: '', type: '' });
  const [form, setForm] = useState(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data || []).filter((o) => (!s || o.name.toLowerCase().includes(s)) && (!f.status || o.status === f.status) && (!f.type || o.type === f.type));
  }, [data, q, f]);

  const scopeText = (o) => {
    if (o.scope === 'all') return o.type.startsWith('bill') ? 'Whole bill' : 'All products';
    const ids = (o.scope_ids || []).map(Number);
    const src = o.scope === 'category' ? c.categories : o.scope === 'brand' ? c.brands : null;
    if (!src) return `${ids.length} product${ids.length === 1 ? '' : 's'}`;
    return src.filter((x) => ids.includes(Number(x.id))).map((x) => x.name).join(', ') || `${ids.length} selected`;
  };

  const toggle = async (o) => { try { await api.patch(`/offers/${o.id}/toggle`); reload(); } catch (e) { toast.error(e.message); } };
  const remove = async (o) => {
    if (!window.confirm(`Delete offer "${o.name}"? Old invoices keep their discounts.`)) return;
    try { await api.delete(`/offers/${o.id}`); toast.success('Deleted'); reload(); } catch (e) { toast.error(e.message); }
  };
  const running = (data || []).filter((o) => o.status === 'running').length;

  return (
    <div>
      <PageHeader icon={BadgePercent} title="Offers" subtitle="Running offers are applied in the POS automatically"
        actions={<button type="button" className="btn-primary" onClick={() => setForm(blank())}><Plus className="h-4 w-4" /> New offer</button>} />
      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: 'Search offers…' }}
        values={f} onChange={set} onClear={reset}
        fields={[
          { key: 'type', label: 'Type', type: 'select', options: OFFER_TYPES.map(([v, l]) => [v, l]), placeholder: 'All types' },
          { key: 'status', label: 'Status', type: 'segment', options: [['running', 'Running'], ['scheduled', 'Scheduled'], ['paused', 'Paused'], ['expired', 'Expired']] },
        ]}
        summary={data && <><Sum label="Offers" value={num(list.length)} /><Sum label="Running now" value={num(running)} tone="green" /><Sum label="Discount given" value={tk((data || []).reduce((t, o) => t + Number(o.total_discount), 0))} /></>} />

      {loading && !data ? <div className="flex justify-center py-16"><Spinner /></div> : !list.length ? (
        <div className="card"><Empty icon={BadgePercent} title={data?.length ? 'No offer matches these filters' : 'No offers yet'} hint="Create an Eid offer, a buy-2-get-1 deal or a bill discount." action={<button type="button" className="btn-primary" onClick={() => setForm(blank())}><Plus className="h-4 w-4" /> New offer</button>} /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((o) => {
            const T = OFFER_TYPES.find((t) => t[0] === o.type) || OFFER_TYPES[0];
            const Icon = T[2];
            return (
              <div key={o.id} className={cls('card flex flex-col p-4', o.status !== 'running' && 'opacity-80')}>
                <div className="flex items-start gap-3">
                  <div className={cls('rounded-xl p-2.5', o.status === 'running' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800')}><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{o.name}</p>
                    <p className="text-lg font-extrabold text-ocean-700 dark:text-ocean-300">{offerText(o)}</p>
                  </div>
                  <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                  <p className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{scopeText(o)}</span></p>
                  <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />{o.starts_on ? fmtDate(o.starts_on) : 'Any time'} → {o.ends_on ? fmtDate(o.ends_on) : 'no end'}</p>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
                  <span>Used on <b>{num(o.used_invoices)}</b> invoice{Number(o.used_invoices) === 1 ? '' : 's'}</span>
                  <span>Discount <b>{tk(o.total_discount)}</b></span>
                </div>
                <div className="mt-3 flex gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setForm({ ...o, scope_ids: (o.scope_ids || []).map(Number), max_discount: o.max_discount ?? '', min_amount: Number(o.min_amount) || '', ends_on: o.ends_on || '', starts_on: o.starts_on || '' })}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                  {o.status !== 'expired' && <button type="button" className="btn-secondary btn-sm" onClick={() => toggle(o)}>{o.is_active ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Resume</>}</button>}
                  <button type="button" className="btn-ghost btn-sm ml-auto text-rose-500" onClick={() => remove(o)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <OfferForm form={form} setForm={setForm} catalog={c} onSaved={() => { setForm(null); reload(); }} />
    </div>
  );
}

function OfferForm({ form, setForm, catalog: c, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState({}); // product id → name
  const f = form;
  useEffect(() => {
    if (!f || f.scope !== 'product') return;
    f.scope_ids.filter((id) => !names[id]).forEach((id) => api.get(`/products/${id}`).then((r) => setNames((n) => ({ ...n, [id]: r.data.name }))).catch(() => {}));
  }, [f?.id, f?.scope]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return null;
  const isBill = f.type.startsWith('bill_');
  const set = (patch) => setForm({ ...f, ...patch });
  const toggleId = (id) => set({ scope_ids: f.scope_ids.includes(id) ? f.scope_ids.filter((x) => x !== id) : [...f.scope_ids, id] });

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, scope: isBill ? 'all' : f.scope };
      if (f.id) await api.put(`/offers/${f.id}`, body); else await api.post('/offers', body);
      toast.success(f.id ? 'Offer updated' : 'Offer created');
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const scopeList = f.scope === 'category' ? c.main.map((m) => ({ id: m.id, name: m.name, subs: c.subsOf(m.id) })) : f.scope === 'brand' ? c.brands : [];

  return (
    <Modal open onClose={() => setForm(null)} title={f.id ? 'Edit offer' : 'New offer'} size="lg"
      footer={<><button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner className="h-4 w-4 text-white" />} Save offer</button></>}>
      <div className="space-y-4">
        <Field label="Offer name"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Eid Mega Offer" autoFocus /></Field>
        <div>
          <span className="label">Offer type</span>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {OFFER_TYPES.map(([v, l, Icon, hint]) => (
              <button type="button" key={v} onClick={() => set({ type: v })}
                className={cls('flex items-start gap-2.5 rounded-xl border-2 p-3 text-left transition', f.type === v ? 'border-ocean-500 bg-ocean-50 dark:bg-ocean-900/30' : 'border-slate-200 hover:border-ocean-300 dark:border-slate-700')}>
                <Icon className={cls('mt-0.5 h-4 w-4 shrink-0', f.type === v ? 'text-ocean-600' : 'text-slate-400')} />
                <span><span className="block text-sm font-semibold">{l}</span><span className="block text-[11px] leading-snug text-slate-500">{hint}</span></span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {f.type === 'bogo' ? (
            <>
              <Field label="Customer buys"><input type="number" min="1" className="input no-spin" value={f.buy_qty} onChange={(e) => set({ buy_qty: e.target.value })} /></Field>
              <Field label="Gets free"><input type="number" min="1" className="input no-spin" value={f.get_qty} onChange={(e) => set({ get_qty: e.target.value })} /></Field>
            </>
          ) : (
            <Field label={f.type.includes('percent') ? 'Discount %' : 'Discount (৳)'}><input type="number" min="0" className="input no-spin" value={f.value} onChange={(e) => set({ value: e.target.value })} /></Field>
          )}
          {isBill && <Field label="Minimum bill (৳)"><input type="number" min="0" className="input no-spin" value={f.min_amount} onChange={(e) => set({ min_amount: e.target.value })} placeholder="0" /></Field>}
          {f.type === 'bill_percent' && <Field label="Maximum discount (৳)" hint="Optional cap"><input type="number" min="0" className="input no-spin" value={f.max_discount} onChange={(e) => set({ max_discount: e.target.value })} /></Field>}
        </div>

        {!isBill && (
          <div>
            <span className="label">Applies to</span>
            <div className="mb-2 inline-flex rounded-xl border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
              {[['all', 'All products'], ['category', 'Categories'], ['brand', 'Brands'], ['product', 'Products']].map(([v, l]) => (
                <button type="button" key={v} onClick={() => set({ scope: v, scope_ids: [] })} className={cls('rounded-lg px-3 py-1.5 text-xs font-semibold transition', f.scope === v ? 'bg-ocean-600 text-white' : 'text-slate-600 dark:text-slate-300')}>{l}</button>
              ))}
            </div>
            {(f.scope === 'category' || f.scope === 'brand') && (
              <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                {scopeList.map((x) => (
                  <div key={x.id} className="flex flex-wrap items-center gap-1.5">
                    <button type="button" className={cls('chip', f.scope_ids.includes(Number(x.id)) && 'chip-active')} onClick={() => toggleId(Number(x.id))}>{x.name}</button>
                    {x.subs?.length > 0 && <span className="text-[11px] text-slate-400">incl. {x.subs.map((s) => s.name).join(', ')}</span>}
                  </div>
                ))}
                {!scopeList.length && <p className="p-2 text-xs text-slate-400">Nothing to choose — add some in Product Setup.</p>}
              </div>
            )}
            {f.scope === 'product' && (
              <div className="space-y-2">
                <ProductPicker onPick={(p) => { setNames((n) => ({ ...n, [p.product_id]: p.name })); if (!f.scope_ids.includes(Number(p.product_id))) set({ scope_ids: [...f.scope_ids, Number(p.product_id)] }); }} placeholder="Search a product to add…" />
                <div className="flex flex-wrap gap-1.5">
                  {f.scope_ids.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-ocean-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-ocean-700 dark:bg-ocean-900/40 dark:text-ocean-300">{names[id] || `#${id}`}<button type="button" onClick={() => toggleId(id)} aria-label="Remove"><X className="h-3 w-3" /></button></span>)}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Starts"><input type="date" className="input" value={f.starts_on} onChange={(e) => set({ starts_on: e.target.value })} /></Field>
          <Field label="Ends" hint="Leave empty for no end"><input type="date" className="input" value={f.ends_on} min={f.starts_on || undefined} onChange={(e) => set({ ends_on: e.target.value })} /></Field>
          <Field label="Quick length">
            <Select className="input" value="" onChange={(e) => e.target.value && set({ starts_on: f.starts_on || todayStr(), ends_on: addDays(Number(e.target.value), f.starts_on || todayStr()) })}>
              <option value="">Choose…</option><option value="2">3 days</option><option value="6">1 week</option><option value="14">15 days</option><option value="29">1 month</option>
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ocean-600" checked={f.is_active} onChange={(e) => set({ is_active: e.target.checked })} /> Active</label>
      </div>
    </Modal>
  );
}
