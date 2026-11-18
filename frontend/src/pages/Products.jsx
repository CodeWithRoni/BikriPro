import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package, Plus, Search, Pencil, Trash2, Star, Settings2, SlidersHorizontal, X, Boxes, Layers, Coins, ArrowUpDown, RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fileUrl } from '../api/client';
import useApi from '../hooks/useApi';
import useCatalog from '../hooks/useCatalog';
import ProductForm from '../components/ProductForm';
import { PageHeader, Pagination, Empty, useDebounced, PageLoader } from '../components/ui';
import { tk, num, cls } from '../utils/format';

const EMPTY = { category_id: '', subcategory_id: '', brand_id: '', unit: '', stock: '', sizes: [], colors: [], min_price: '', max_price: '', favorite: false, price: '' };
const STOCK = [['', 'All'], ['in', 'In stock'], ['low', 'Low stock'], ['out', 'Out of stock']];
const SORTS = [['name', 'Name A–Z'], ['newest', 'Newest first'], ['price_asc', 'Price: low → high'], ['price_desc', 'Price: high → low'], ['stock_asc', 'Stock: low → high'], ['stock_desc', 'Stock: high → low']];
const CHIP_LIMIT = 14;

/** Product catalogue with a full filter bar. */
export default function Products() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('name');
  const [f, setF] = useState(EMPTY);
  const [showMore, setShowMore] = useState({ sizes: false, colors: false });
  const [panelOpen, setPanelOpen] = useState(false); // filter panel on small screens
  const dq = useDebounced(q);
  const dMin = useDebounced(f.min_price, 450);
  const dMax = useDebounced(f.max_price, 450);
  const c = useCatalog();
  const facets = useApi('/products/facets');
  const [form, setForm] = useState({ open: false, id: null });

  const params = {
    q: dq || undefined, page, sort,
    category_id: f.category_id || undefined, subcategory_id: f.subcategory_id || undefined, brand_id: f.brand_id || undefined,
    unit: f.unit || undefined, stock: f.stock || undefined, price: f.price || undefined,
    size: f.sizes.length ? f.sizes.join(',') : undefined, color: f.colors.length ? f.colors.join(',') : undefined,
    min_price: dMin === '' ? undefined : dMin, max_price: dMax === '' ? undefined : dMax, favorite: f.favorite ? 1 : undefined,
  };
  const { data, loading, reload } = useApi('/products', params);
  const reloadAll = () => { reload(); facets.reload(); };

  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setPage(1); };
  const toggle = (key, v) => set({ [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] });

  // Size / colour chips: values in use, in the order set in Product Setup
  const order = (list, setup) => {
    const rank = Object.fromEntries(setup.map((s, i) => [s.name.toLowerCase(), i]));
    return [...list].sort((a, b) => (rank[a.name.toLowerCase()] ?? 999) - (rank[b.name.toLowerCase()] ?? 999) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  };
  const sizeChips = useMemo(() => order(facets.data?.sizes || [], c.sizes), [facets.data, c.sizes]);
  const colorChips = useMemo(() => order(facets.data?.colors || [], c.colors), [facets.data, c.colors]);
  const subs = c.subsOf(f.category_id);

  const name = (list, id) => list.find((x) => String(x.id) === String(id))?.name || id;
  const active = [
    f.category_id && { k: 'category', label: `Category: ${name(c.main, f.category_id)}`, clear: { category_id: '', subcategory_id: '' } },
    f.subcategory_id && { k: 'sub', label: `Sub: ${name(c.subs, f.subcategory_id)}`, clear: { subcategory_id: '' } },
    f.brand_id && { k: 'brand', label: `Brand: ${name(c.brands, f.brand_id)}`, clear: { brand_id: '' } },
    f.unit && { k: 'unit', label: `Unit: ${f.unit}`, clear: { unit: '' } },
    f.stock && { k: 'stock', label: STOCK.find(([v]) => v === f.stock)[1], clear: { stock: '' } },
    f.price && { k: 'price', label: 'Price not set', clear: { price: '' } },
    f.favorite && { k: 'fav', label: 'POS favourites', clear: { favorite: false } },
    (f.min_price !== '' || f.max_price !== '') && { k: 'range', label: `Price: ${f.min_price === '' ? '0' : tk(f.min_price)} – ${f.max_price === '' ? 'any' : tk(f.max_price)}`, clear: { min_price: '', max_price: '' } },
    ...f.sizes.map((s) => ({ k: `s-${s}`, label: `Size: ${s}`, clear: { sizes: f.sizes.filter((x) => x !== s) } })),
    ...f.colors.map((s) => ({ k: `c-${s}`, label: `Colour: ${s}`, swatch: c.colorHex(s), clear: { colors: f.colors.filter((x) => x !== s) } })),
  ].filter(Boolean);
  const clearAll = () => { setF(EMPTY); setQ(''); setPage(1); };

  const remove = async (id) => {
    if (!window.confirm('Archive this product? It will disappear from POS but stay in old invoices.')) return;
    try { await api.delete(`/products/${id}`); toast.success('Archived'); reloadAll(); } catch (e) { toast.error(e.message); }
  };

  const s = data?.summary;
  return (
    <div>
      <PageHeader icon={Package} title="Products" subtitle="Catalogue, variants, stock and photos"
        actions={<>
          <Link to="/product-setup" className="btn-secondary"><Settings2 className="h-4 w-4" /> Product Setup</Link>
          <button type="button" className="btn-primary" onClick={() => setForm({ open: true, id: null })}><Plus className="h-4 w-4" /> New product</button>
        </>} />

      {/* ---------- Filter bar ---------- */}
      <div className="card mb-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9 pr-9" placeholder="Search name, SKU, barcode or brand…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            {q && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-rose-500" onClick={() => setQ('')} aria-label="Clear search"><X className="h-4 w-4" /></button>}
          </div>
          <div className="relative">
            <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select className="input w-auto pl-9 pr-8" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort">
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button type="button" className={cls('btn-secondary lg:hidden', panelOpen && 'border-ocean-400 text-ocean-700 dark:text-ocean-300')} onClick={() => setPanelOpen(!panelOpen)}>
            <SlidersHorizontal className="h-4 w-4" /> Filters {active.length > 0 && <span className="rounded-full bg-ocean-600 px-1.5 text-[11px] text-white">{active.length}</span>}
          </button>
        </div>

        <div className={cls('space-y-3 border-t border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40', !panelOpen && 'hidden lg:block')}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <FilterSelect label="Category" value={f.category_id} onChange={(v) => set({ category_id: v, subcategory_id: '' })} options={c.main} placeholder="All categories" />
            <FilterSelect label="Sub category" value={f.subcategory_id} onChange={(v) => set({ subcategory_id: v })} options={subs} placeholder={f.category_id ? (subs.length ? 'All sub categories' : 'No sub categories') : 'Pick a category first'} disabled={!subs.length} />
            <FilterSelect label="Brand" value={f.brand_id} onChange={(v) => set({ brand_id: v })} options={c.brands} placeholder="All brands" />
            <FilterSelect label="Unit" value={f.unit} onChange={(v) => set({ unit: v })} options={c.units.map((u) => ({ id: u.value || u.name, name: `${u.name}${u.value ? ` (${u.value})` : ''}` }))} placeholder="All units" />
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Retail price (৳)</p>
              <div className="flex items-center gap-1.5">
                <input type="number" min="0" className="input-sm no-spin" placeholder={facets.data ? `Min ${num(facets.data.price.min)}` : 'Min'} value={f.min_price} onChange={(e) => set({ min_price: e.target.value })} />
                <span className="text-slate-400">–</span>
                <input type="number" min="0" className="input-sm no-spin" placeholder={facets.data ? `Max ${num(facets.data.price.max)}` : 'Max'} value={f.max_price} onChange={(e) => set({ max_price: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
              {STOCK.map(([v, l]) => (
                <button type="button" key={v || 'all'} onClick={() => set({ stock: v })}
                  className={cls('rounded-lg px-3 py-1.5 text-xs font-semibold transition', f.stock === v ? 'bg-ocean-600 text-white shadow-sm' : 'text-slate-600 hover:text-ocean-700 dark:text-slate-300')}>
                  {l}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"><input type="checkbox" className="accent-ocean-600" checked={f.price === 'unset'} onChange={(e) => set({ price: e.target.checked ? 'unset' : '' })} /> Price not set</label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"><input type="checkbox" className="accent-ocean-600" checked={f.favorite} onChange={(e) => set({ favorite: e.target.checked })} /><Star className="h-3.5 w-3.5 text-amber-400" /> POS favourites</label>
          </div>

          {sizeChips.length > 0 && (
            <ChipRow label="Size" items={sizeChips} selected={f.sizes} onToggle={(v) => toggle('sizes', v)} more={showMore.sizes} onMore={() => setShowMore({ ...showMore, sizes: !showMore.sizes })} />
          )}
          {colorChips.length > 0 && (
            <ChipRow label="Colour" items={colorChips} selected={f.colors} onToggle={(v) => toggle('colors', v)} swatch={c.colorHex} more={showMore.colors} onMore={() => setShowMore({ ...showMore, colors: !showMore.colors })} />
          )}
        </div>

        {/* Active filters + result count */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
          <p className="mr-1 text-sm text-slate-500">
            {loading && !data ? 'Loading…' : <><b className="text-slate-800 dark:text-white">{num(data?.total || 0)}</b> variant{data?.total === 1 ? '' : 's'} · <b className="text-slate-800 dark:text-white">{num(s?.products || 0)}</b> product{s?.products === 1 ? '' : 's'}</>}
          </p>
          {active.map((a) => (
            <span key={a.k} className="inline-flex items-center gap-1.5 rounded-full bg-ocean-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-ocean-700 dark:bg-ocean-900/40 dark:text-ocean-300">
              {a.swatch && <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: a.swatch }} />}
              {a.label}
              <button type="button" className="rounded-full p-0.5 hover:bg-ocean-100 dark:hover:bg-ocean-800" onClick={() => set(a.clear)} aria-label={`Remove ${a.label}`}><X className="h-3 w-3" /></button>
            </span>
          ))}
          {(active.length > 0 || q) && <button type="button" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline" onClick={clearAll}><RotateCcw className="h-3.5 w-3.5" /> Clear all</button>}
        </div>
      </div>

      {/* ---------- Summary ---------- */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat icon={Layers} label="Variants" value={num(data?.total || 0)} />
        <MiniStat icon={Package} label="Products" value={num(s?.products || 0)} />
        <MiniStat icon={Boxes} label="Stock (pcs)" value={num(s?.stock_qty || 0)} />
        <MiniStat icon={Coins} label="Stock value (cost)" value={tk(s?.stock_value || 0)} />
      </div>

      {loading && !data ? <PageLoader /> : (
        <div className={cls('table-wrap transition-opacity', loading && 'opacity-60')}>
          <table className="table">
            <thead><tr><th>Product</th><th>Variant</th><th>SKU / Barcode</th><th>Category</th><th className="text-right">Cost</th><th className="text-right">Retail</th><th className="text-right">Stock</th><th /></tr></thead>
            <tbody>{data?.data.map((p) => (
              <tr key={p.variant_id}>
                <td>
                  <div className="flex items-center gap-3">
                    {p.image_path ? <img src={fileUrl(p.image_path)} alt="" className="h-10 w-10 rounded-lg border border-slate-100 object-contain dark:border-slate-800" /> : <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-400 dark:bg-slate-800">{p.name.slice(0, 2)}</span>}
                    <span className="font-medium">{p.name}{p.is_favorite ? <Star className="ml-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" /> : null}<div className="text-xs text-slate-500">{p.brand}</div></span>
                  </div>
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.size && <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{p.size}</span>}
                    {p.color && <span className="inline-flex items-center gap-1 text-sm">{c.colorHex(p.color) && <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: c.colorHex(p.color) }} />}{p.color}</span>}
                    {!p.size && !p.color && '—'}
                  </div>
                </td>
                <td className="text-xs">{p.sku}<div className="text-slate-500">{p.barcode}</div></td>
                <td>{p.parent_category ? <>{p.parent_category}<div className="text-xs text-slate-500">{p.category}</div></> : p.category || '—'}</td>
                <td className="text-right">{tk(p.purchase_price)}</td>
                <td className="text-right font-semibold">{p.retail_price === null ? <span className="text-amber-600">Not set</span> : tk(p.retail_price)}</td>
                <td className="text-right">
                  <span className={cls('badge', p.stock_qty <= 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : p.stock_qty <= p.low_stock_alert ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300')}>
                    {num(p.stock_qty)} {p.unit && p.unit !== 'pcs' ? p.unit : ''}
                  </span>
                </td>
                <td className="whitespace-nowrap text-right">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setForm({ open: true, id: p.product_id })} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                  <button type="button" className="btn-ghost btn-sm text-rose-500" onClick={() => remove(p.product_id)} aria-label="Archive"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {!data?.data.length && (active.length || q
            ? <Empty icon={SlidersHorizontal} title="No products match these filters" hint="Try removing a filter." action={<button type="button" className="btn-secondary" onClick={clearAll}><RotateCcw className="h-4 w-4" /> Clear all filters</button>} />
            : <Empty icon={Package} title="No products" hint="Add your first product to start selling." action={<button type="button" className="btn-primary" onClick={() => setForm({ open: true, id: null })}><Plus className="h-4 w-4" /> New product</button>} />)}
          <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} />
        </div>
      )}
      <ProductForm open={form.open} editId={form.id} onClose={() => setForm({ open: false, id: null })} onSaved={reloadAll} />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, placeholder, disabled }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <select className={cls('input-sm', value && 'border-ocean-400 text-ocean-700 dark:text-ocean-300')} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}

function ChipRow({ label, items, selected, onToggle, swatch, more, onMore }) {
  const shown = more ? items : items.slice(0, CHIP_LIMIT);
  // Keep selected chips visible even when collapsed
  const extra = more ? [] : items.slice(CHIP_LIMIT).filter((i) => selected.includes(i.name));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {[...shown, ...extra].map((i) => {
        const on = selected.includes(i.name);
        const hex = swatch?.(i.name);
        return (
          <button type="button" key={i.name} onClick={() => onToggle(i.name)} className={cls('chip inline-flex items-center gap-1.5', on && 'chip-active')}>
            {hex && <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: hex }} />}
            {i.name}<span className="text-[10px] text-slate-400">{i.n}</span>
          </button>
        );
      })}
      {items.length > CHIP_LIMIT && <button type="button" className="text-xs font-semibold text-ocean-600 hover:underline" onClick={onMore}>{more ? 'Show less' : `+${items.length - CHIP_LIMIT} more`}</button>}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div className="card flex items-center gap-3 px-4 py-3">
      <div className="rounded-lg bg-ocean-50 p-2 text-ocean-600 dark:bg-ocean-900/30 dark:text-ocean-300"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="truncate text-lg font-bold">{value}</p></div>
    </div>
  );
}
