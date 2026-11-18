import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Settings2, FolderTree, FolderOpen, BadgeCheck, Ruler, Layers, Palette, Shirt, ArrowLeft, Plus, Pencil, Trash2,
  Check, X, Search, Package, Lightbulb,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useCatalog from '../hooks/useCatalog';
import { PageHeader, Spinner } from '../components/ui';
import { cls } from '../utils/format';

const TONES = {
  ocean: 'bg-ocean-50 text-ocean-600 dark:bg-ocean-900/30 dark:text-ocean-300',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

/**
 * Product Setup — the lists the product form picks from.
 * One card per list, four cards per row on wide screens.
 */
export default function ProductSetup() {
  const c = useCatalog();

  const attrCrud = (kind) => ({
    save: async (v, id) => {
      if (id) await api.put(`/product-attributes/${kind}/${id}`, v); else await api.post(`/product-attributes/${kind}`, v);
      c.reloadAttrs();
    },
    remove: async (item) => { await api.delete(`/product-attributes/${kind}/${item.id}`); c.reloadAttrs(); },
  });
  const catCrud = {
    save: async (v, id) => {
      const body = { name: v.name, parent_id: v.parent_id || null };
      if (id) await api.put(`/categories/${id}`, body); else await api.post('/categories', body);
      c.reloadCategories();
    },
    remove: async (item) => { await api.delete(`/categories/${item.id}`); c.reloadCategories(); },
  };
  const brandCrud = {
    save: async (v, id) => { if (id) await api.put(`/brands/${id}`, v); else await api.post('/brands', v); c.reloadBrands(); },
    remove: async (item) => { await api.delete(`/brands/${item.id}`); c.reloadBrands(); },
  };
  const mainOptions = c.main.map((m) => ({ value: m.id, label: m.name }));

  return (
    <div>
      <PageHeader icon={Settings2} title="Product Setup" subtitle="Categories, brands, units, sizes, colours and variations used when adding products"
        actions={<Link to="/products" className="btn-secondary"><ArrowLeft className="h-4 w-4" /> Back to Products</Link>} />

      {c.loading && !c.categories.length ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SetupCard title="Category" icon={FolderTree} tone="ocean" placeholder="e.g. Shirt"
            items={c.main.map((m) => ({ ...m, meta: `${m.sub_count || 0} sub · ${m.product_count || 0} products` }))}
            confirmText={(i) => `Delete category "${i.name}"? Its sub-categories become main categories and its products become uncategorised.`}
            {...catCrud} />

          <SetupCard title="Sub Category" icon={FolderOpen} tone="violet" placeholder="e.g. Formal"
            hint={mainOptions.length ? null : 'Add a category first.'}
            extra={{ key: 'parent_id', type: 'select', placeholder: 'Parent category', options: mainOptions, required: true }}
            items={c.subs.map((s) => ({ ...s, meta: `${s.parent_name} · ${s.product_count || 0} products` }))}
            groupBy={(i) => i.parent_name}
            confirmText={(i) => `Delete sub-category "${i.name}"? Its products become uncategorised.`}
            {...catCrud} />

          <SetupCard title="Brand" icon={BadgeCheck} tone="amber" placeholder="e.g. Easy, Yellow"
            items={c.brands.map((b) => ({ ...b, meta: `${b.product_count || 0} products` }))}
            confirmText={(i) => `Delete brand "${i.name}"? Its products will have no brand.`}
            {...brandCrud} />

          <SetupCard title="Unit Type" icon={Ruler} tone="green" placeholder="e.g. Piece"
            extra={{ key: 'value', placeholder: 'Short (pcs)', width: 'w-24' }}
            items={c.units.map((u) => ({ ...u, meta: u.value }))}
            {...attrCrud('unit')} />

          <SetupCard title="Size" icon={Shirt} tone="sky" placeholder="e.g. XL, 32, Free Size"
            items={c.sizes} chips
            {...attrCrud('size')} />

          <SetupCard title="Color" icon={Palette} tone="rose" placeholder="e.g. Navy"
            extra={{ key: 'value', type: 'color', default: '#1e3a8a' }}
            items={c.colors.map((x) => ({ ...x, swatch: x.value }))} chips
            {...attrCrud('color')} />

          <SetupCard title="Variation" icon={Layers} tone="slate" placeholder="Set name, e.g. Pant waist"
            extra={{ key: 'value', placeholder: 'Values: 28, 30, 32, 34', required: true, block: true }}
            hint="A ready-made set of sizes. Pick it in the product form to create all variants in one click."
            items={c.variations.map((v) => ({ ...v, meta: v.value }))}
            {...attrCrud('variation')} />

          <HowItWorks counts={{ categories: c.main.length, subs: c.subs.length, brands: c.brands.length, sizes: c.sizes.length, colors: c.colors.length }} />
        </div>
      )}
    </div>
  );
}

/** One list card: add / inline edit / delete, with search when the list grows. */
function SetupCard({ title, icon: Icon, tone, placeholder, extra, items, save, remove, hint, chips = false, groupBy, confirmText }) {
  const blank = () => ({ name: '', [extra?.key || '_']: extra?.default || '' });
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => `${i.name} ${i.meta || ''}`.toLowerCase().includes(s)) : items;
  }, [items, q]);

  const reset = () => { setForm(blank()); setEditId(null); };
  const submit = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) return toast.error(`Enter a ${title.toLowerCase()} name`);
    if (extra?.required && !String(form[extra.key] || '').trim()) return toast.error(extra.type === 'select' ? `Choose the ${extra.placeholder.toLowerCase()}` : `Enter ${extra.placeholder.toLowerCase()}`);
    setBusy(true);
    try {
      await save(form, editId);
      toast.success(editId ? `${title} updated` : `${title} added`);
      reset();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const startEdit = (i) => {
    setEditId(i.id);
    setForm({ name: i.name, ...(extra ? { [extra.key]: i[extra.key] ?? extra.default ?? '' } : {}) });
  };
  const del = async (i) => {
    if (!window.confirm(confirmText ? confirmText(i) : `Delete "${i.name}"?`)) return;
    try { await remove(i); toast.success('Deleted'); if (editId === i.id) reset(); } catch (err) { toast.error(err.message); }
  };

  const extraInput = extra && (
    extra.type === 'select' ? (
      <select className={cls('input-sm', extra.block ? 'w-full' : 'w-full')} value={form[extra.key] || ''} onChange={(e) => setForm({ ...form, [extra.key]: e.target.value })}>
        <option value="">{extra.placeholder}…</option>
        {extra.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    ) : extra.type === 'color' ? (
      <label className="relative h-[34px] w-11 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700" title="Pick colour">
        <span className="absolute inset-0" style={{ background: form[extra.key] || extra.default }} />
        <input type="color" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={form[extra.key] || extra.default} onChange={(e) => setForm({ ...form, [extra.key]: e.target.value })} />
      </label>
    ) : (
      <input className={cls('input-sm', extra.block ? 'w-full' : extra.width || 'w-28 shrink-0')} placeholder={extra.placeholder} value={form[extra.key] || ''} onChange={(e) => setForm({ ...form, [extra.key]: e.target.value })} />
    )
  );

  let lastGroup = null;
  return (
    <div className="card flex h-[25rem] flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className={cls('rounded-xl p-2', TONES[tone])}><Icon className="h-4 w-4" /></div>
        <p className="flex-1 font-bold">{title}</p>
        <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{items.length}</span>
      </div>

      <form onSubmit={submit} className={cls('space-y-2 px-4 py-3', editId && 'bg-ocean-50/60 dark:bg-ocean-950/30')}>
        {editId && <p className="text-[11px] font-semibold uppercase tracking-wide text-ocean-600 dark:text-ocean-300">Editing</p>}
        {extra?.type === 'select' && extraInput}
        <div className="flex gap-2">
          <input className="input-sm min-w-0 flex-1" placeholder={placeholder} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {extra && extra.type !== 'select' && !extra.block && extraInput}
          {!extra?.block && <SubmitButtons busy={busy} editId={editId} onCancel={reset} />}
        </div>
        {extra?.block && <div className="flex gap-2">{extraInput}<SubmitButtons busy={busy} editId={editId} onCancel={reset} /></div>}
        {hint && <p className="text-[11px] leading-snug text-slate-400">{hint}</p>}
      </form>

      {items.length > 8 && (
        <div className="px-4 pb-2">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input className="input-sm pl-8 text-xs" placeholder={`Search ${title.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {shown.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">{items.length ? 'No match' : `No ${title.toLowerCase()} yet`}</p>}
        {chips ? (
          <div className="flex flex-wrap gap-1.5 px-2 pt-1">
            {shown.map((i) => (
              <span key={i.id} className={cls('group inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1 text-xs font-medium', editId === i.id ? 'border-ocean-400 bg-ocean-50 dark:bg-ocean-900/40' : 'border-slate-200 dark:border-slate-700')}>
                {i.swatch && <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: i.swatch }} />}
                <button type="button" onClick={() => startEdit(i)} className="hover:text-ocean-600">{i.name}</button>
                <button type="button" onClick={() => del(i)} className="rounded-full p-0.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/30" aria-label={`Delete ${i.name}`}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        ) : shown.map((i) => {
          const g = groupBy?.(i);
          const head = groupBy && g !== lastGroup ? <p key={`g-${g}`} className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{g}</p> : null;
          lastGroup = g;
          return (
            <div key={i.id}>
              {head}
              <div className={cls('group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60', editId === i.id && 'bg-ocean-50 dark:bg-ocean-900/30')}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.name}</p>
                  {i.meta && !groupBy && <p className="truncate text-[11px] text-slate-400">{i.meta}</p>}
                  {i.meta && groupBy && <p className="truncate text-[11px] text-slate-400">{i.product_count || 0} products</p>}
                </div>
                <button type="button" className="rounded-md p-1 text-slate-400 opacity-60 hover:bg-white hover:text-ocean-600 group-hover:opacity-100 dark:hover:bg-slate-700" onClick={() => startEdit(i)} aria-label={`Edit ${i.name}`}><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" className="rounded-md p-1 text-slate-400 opacity-60 hover:bg-white hover:text-rose-500 group-hover:opacity-100 dark:hover:bg-slate-700" onClick={() => del(i)} aria-label={`Delete ${i.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SubmitButtons({ busy, editId, onCancel }) {
  return (
    <>
      <button type="submit" className="btn-primary btn-sm shrink-0 px-2.5" disabled={busy} aria-label={editId ? 'Save' : 'Add'}>
        {busy ? <Spinner className="h-3.5 w-3.5 text-white" /> : editId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>
      {editId && <button type="button" className="btn-secondary btn-sm shrink-0 px-2.5" onClick={onCancel} aria-label="Cancel edit"><X className="h-4 w-4" /></button>}
    </>
  );
}

function HowItWorks({ counts }) {
  return (
    <div className="card flex h-[25rem] flex-col justify-between bg-gradient-to-br from-ocean-600 to-ocean-800 p-5 text-white dark:from-ocean-700 dark:to-slate-900">
      <div>
        <div className="mb-3 inline-flex rounded-xl bg-white/15 p-2"><Lightbulb className="h-5 w-5" /></div>
        <p className="text-lg font-bold">How it is used</p>
        <ul className="mt-3 space-y-2 text-sm text-white/85">
          <li>• Category, Sub Category, Brand and Unit appear as drop-downs in <b>New product</b>.</li>
          <li>• Sizes and Colours appear as one-tap chips to generate variants.</li>
          <li>• A Variation set fills all its sizes at once.</li>
          <li>• Everything here also powers the Products filter.</li>
        </ul>
      </div>
      <div>
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          {[['Categories', counts.categories + counts.subs], ['Brands', counts.brands], ['Sizes', counts.sizes]].map(([l, n]) => (
            <div key={l} className="rounded-xl bg-white/10 py-2"><p className="text-xl font-extrabold">{n}</p><p className="text-[11px] text-white/70">{l}</p></div>
          ))}
        </div>
        <Link to="/products" className="btn w-full bg-white text-ocean-700 hover:bg-ocean-50"><Package className="h-4 w-4" /> Go to Products</Link>
      </div>
    </div>
  );
}
