import { useEffect, useMemo, useRef, useState } from 'react';
import { Layers, Flame, Heart, Tag, LayoutGrid, X, Star, Package, Check } from 'lucide-react';
import api, { fileUrl } from '../../api/client';
import useApi from '../../hooks/useApi';
import { Spinner } from '../ui';
import { inScope } from '../../utils/offers';
import { tk, num, cls } from '../../utils/format';

const TABS = [['all', 'All products', Layers], ['best', 'Best selling', Flame], ['fav', 'Favourites', Heart], ['offer', 'On offer', Tag]];
const PAGE = 48;

/** "Eid Offer 15% off" → "Eid −15%", buy 2 get 1 → "2+1 free" */
export function offerBadge(o) {
  if (!o) return '';
  const word = String(o.name || '').trim().split(/\s+/)[0] || 'Offer';
  if (o.type === 'percent') return `${word} −${Number(o.value)}%`;
  if (o.type === 'amount') return `${word} −৳${Number(o.value)}`;
  if (o.type === 'bogo') return `${o.buy_qty}+${o.get_qty} free`;
  return word;
}

/** Filter box: icon · label · value chip · clear — opens a small list. */
function FilterBox({ icon: Icon, label, value, placeholder, options, onChange, className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const current = options.find((o) => String(o.value) === String(value));
  return (
    <div ref={ref} className={cls('relative min-w-0', className)}>
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}
        className={cls('flex h-9 w-full items-center gap-2 rounded-[10px] border bg-white px-2.5 text-[12.5px] font-semibold text-slate-700 transition dark:bg-slate-900 dark:text-slate-200',
          open ? 'border-ocean-400 ring-4 ring-ocean-100 dark:ring-ocean-900/40' : 'border-slate-200 hover:border-ocean-300 dark:border-slate-700')}>
        {Icon && <Icon className="h-[15px] w-[15px] shrink-0 text-slate-500" />}
        <span className="shrink-0">{label}</span>
        <span className={cls(!value ? 'hidden sm:inline-flex ml-1' : 'ml-1 inline-flex', 'sm:inline-flex h-5 min-w-0 items-center truncate rounded-full px-2 text-[11px] font-bold',
          current ? 'bg-ocean-50 text-ocean-700 dark:bg-ocean-900/40 dark:text-ocean-200' : 'border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800')}>
          <span className="truncate">{current ? current.label : placeholder}</span>
        </span>
        {current && (
          <span role="button" tabIndex={-1} aria-label={`Clear ${label}`} onClick={(e) => { e.stopPropagation(); onChange(''); }} className="ml-auto shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-500">
            <X className="h-[15px] w-[15px]" />
          </span>
        )}
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 z-30 mt-1 max-h-72 w-full min-w-[12rem] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl animate-[bpPop_150ms_ease-out] dark:border-slate-700 dark:bg-slate-900">
          <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-ocean-50 dark:hover:bg-slate-800">
            {placeholder}{!current && <Check className="h-4 w-4 text-ocean-600" />}
          </button>
          {options.map((o) => (
            <button type="button" key={o.value} onClick={() => { onChange(String(o.value)); setOpen(false); }}
              className={cls('flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-ocean-50 dark:hover:bg-slate-800', o.sub && 'pl-6 text-slate-600 dark:text-slate-300')}>
              <span className="truncate">{o.label}</span>{String(o.value) === String(value) && <Check className="h-4 w-4 shrink-0 text-ocean-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Right-hand product browser: tabs, category / brand / size filters, category pills, product cards. */
export default function Catalog({ onAdd, cartQty, offers, priceMode, reloadKey }) {
  const [tab, setTab] = useState(() => { const t = localStorage.getItem('bp_pos_tab'); return TABS.some(([k]) => k === t) ? t : 'all'; });
  const [cat, setCat] = useState('');   // Category box (main or sub category)
  const [pill, setPill] = useState(''); // pill under it (a sub-category of the box's category)
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { try { localStorage.setItem('bp_pos_tab', tab); } catch { /* ignore */ } }, [tab]);
  useEffect(() => setLimit(PAGE), [tab, cat, pill, brand, size]);
  useEffect(() => setPill(''), [cat]);

  const cats = useApi('/categories');
  const brands = useApi('/brands');
  const facets = useApi('/products/facets');
  const totals = useApi('/products', { limit: 1, k: reloadKey });
  const grid = useApi(['best', 'fav'].includes(tab) ? '/products/pos-grid' : null, { k: reloadKey });
  const list = useApi(['all', 'offer'].includes(tab) ? '/products' : null, {
    category_id: pill || cat || undefined, brand_id: brand || undefined, size: size || undefined, sort: 'name', limit: tab === 'offer' ? 300 : limit, k: reloadKey,
  });

  const catList = Array.isArray(cats.data) ? cats.data : cats.data?.data || [];
  const brandList = Array.isArray(brands.data) ? brands.data : brands.data?.data || [];
  const mains = catList.filter((c) => !c.parent_id);
  const subsOf = (id) => catList.filter((s) => Number(s.parent_id) === Number(id));
  const countOf = (c) => Number(c.product_count || 0) + subsOf(c.id).reduce((t, s) => t + Number(s.product_count || 0), 0);
  const active = pill || cat;
  const inCat = (p) => !active || Number(p.category_id) === Number(active) || subsOf(active).some((s) => Number(s.id) === Number(p.category_id));
  const catOptions = mains.flatMap((c) => [{ value: c.id, label: c.name }, ...subsOf(c.id).map((s) => ({ value: s.id, label: s.name, sub: true }))]);
  // pills: the sub-categories of the chosen category, or the main categories when none is chosen
  const pillParent = cat && subsOf(cat).length ? catList.find((c) => Number(c.id) === Number(cat)) : null;
  const pillCats = pillParent ? subsOf(cat) : mains;
  const pickPill = (id) => (pillParent ? setPill(id) : setCat(id));

  const items = useMemo(() => {
    let rows;
    if (tab === 'all' || tab === 'offer') rows = list.data?.data || [];
    else rows = (grid.data?.[tab === 'best' ? 'best_selling' : 'favorite'] || [])
      .filter((p) => inCat(p) && (!brand || Number(p.brand_id) === Number(brand)) && (!size || p.size === size));
    if (tab === 'offer') rows = rows.filter((p) => (offers || []).some((o) => !String(o.type).startsWith('bill') && inScope(o, p)));
    return rows;
  }, [tab, list.data, grid.data, cat, pill, brand, size, offers]); // eslint-disable-line react-hooks/exhaustive-deps

  const offerFor = (p) => (offers || []).find((o) => !String(o.type).startsWith('bill') && inScope(o, p));
  const loading = (tab === 'all' || tab === 'offer') ? list.loading && !list.data : grid.loading && !grid.data;
  const more = tab === 'all' && list.data && list.data.total > items.length;
  const filtered = cat || pill || brand || size;
  const [favs, setFavs] = useState({});
  const toggleFav = async (e, p) => {
    e.stopPropagation();
    setFavs((f) => ({ ...f, [p.product_id]: !(f[p.product_id] ?? p.is_favorite) }));
    try { await api.patch(`/products/${p.product_id}/favorite`); } catch { /* ignore */ }
  };

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgb(15_23_42/.05),0_1px_3px_rgb(15_23_42/.04)] dark:border-slate-800 dark:bg-slate-900">
      {/* tabs */}
      <div className="flex gap-1 overflow-x-auto px-3 pt-3 [scrollbar-width:none]">
        {TABS.map(([k, l, Icon]) => (
          <button type="button" key={k} onClick={() => setTab(k)}
            className={cls('inline-flex h-[34px] shrink-0 items-center gap-[7px] rounded-[10px] px-3 text-[12.5px] font-semibold transition',
              tab === k ? 'bg-ocean-50 text-ocean-700 dark:bg-ocean-900/40 dark:text-ocean-200' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200')}>
            <Icon className="h-[15px] w-[15px]" />{l}
          </button>
        ))}
      </div>

      {/* filters */}
      <div className="flex gap-2 px-3 pt-2.5">
        <FilterBox className="flex-1" icon={LayoutGrid} label="Category" placeholder="All" value={cat} onChange={setCat} options={catOptions} />
        <FilterBox className="flex-1" icon={Tag} label="Brand" placeholder="All brands" value={brand} onChange={setBrand} options={brandList.map((b) => ({ value: b.id, label: b.name }))} />
        <FilterBox className="flex-[.7]" label="Size" placeholder="Any" value={size} onChange={setSize} options={(facets.data?.sizes || []).map((s) => ({ value: s.name, label: s.name }))} />
      </div>

      {/* category pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 px-3 py-2.5 [scrollbar-width:none] dark:border-slate-800">
        <Pill on={!pill && (!cat || Boolean(pillParent))} onClick={() => setPill('')} label="All" count={pillParent ? countOf(pillParent) : totals.data?.summary?.products} />
        {pillCats.map((c) => <Pill key={c.id} on={String(pill || (pillParent ? '' : cat)) === String(c.id)} onClick={() => pickPill(String(c.id))} label={c.name} count={countOf(c)} />)}
        {filtered && (
          <button type="button" className="ml-auto inline-flex h-[30px] shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20" onClick={() => { setCat(''); setPill(''); setBrand(''); setSize(''); }}>
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* products */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? <div className="flex h-40 items-center justify-center"><Spinner /></div>
          : !items.length ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-sm text-slate-500">
              <Package className="h-8 w-8 text-slate-300" />
              {tab === 'fav' ? 'No favourites yet — tap ☆ on a product to pin it here.' : tab === 'offer' ? 'No product is on an offer right now.' : filtered ? 'No product matches these filters.' : 'No products yet.'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(7.4rem,1fr))] gap-2.5">
                {items.map((p) => {
                  const q = cartQty[p.variant_id] || 0;
                  const stock = Number(p.stock_qty);
                  const price = priceMode === 'wholesale' && p.wholesale_price !== null && p.wholesale_price !== undefined ? p.wholesale_price : p.retail_price;
                  const o = offerFor(p);
                  const fav = favs[p.product_id] ?? p.is_favorite;
                  const low = stock > 0 && stock <= Math.max(Number(p.low_stock_alert) || 0, 6);
                  return (
                    <button type="button" key={p.variant_id} onClick={() => onAdd(p)}
                      className={cls('group relative flex flex-col overflow-hidden rounded-[14px] border bg-white text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop active:scale-[.98] dark:bg-slate-900',
                        q ? 'border-ocean-500 ring-[3px] ring-ocean-100 dark:ring-ocean-900/50' : 'border-slate-200 hover:border-ocean-300 dark:border-slate-800',
                        stock <= 0 && 'opacity-[.55]')}>
                      <div className="relative flex h-[82px] w-full items-center justify-center bg-slate-50 dark:bg-slate-800/60">
                        {p.image_path ? <img src={fileUrl(p.image_path)} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
                          : <span className="text-2xl font-black text-ocean-200 dark:text-slate-700">{p.name.slice(0, 2).toUpperCase()}</span>}
                        {o && <span className="absolute left-[7px] top-[7px] inline-flex h-[19px] items-center rounded-full bg-emerald-50 px-2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">{offerBadge(o)}</span>}
                        {q > 0
                          ? <span className="absolute right-[7px] top-[7px] flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-ocean-600 px-1.5 text-[11px] font-extrabold text-white">{num(q)}</span>
                          : (
                            <span role="button" tabIndex={-1} aria-label="Favourite" onClick={(e) => toggleFav(e, p)}
                              className={cls('absolute right-[7px] top-[7px] rounded-full bg-white/90 p-1 shadow-sm transition dark:bg-slate-900/90', !fav && 'opacity-0 group-hover:opacity-100')}>
                              <Star className={cls('h-3.5 w-3.5', fav ? 'fill-amber-400 text-amber-400' : 'text-slate-400')} />
                            </span>
                          )}
                      </div>
                      <div className="flex flex-1 flex-col px-[9px] pb-[9px] pt-2">
                        <p className="line-clamp-2 min-h-[31px] text-[12px] font-semibold leading-[1.3] text-slate-900 dark:text-slate-100">{p.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{[p.size, p.color].filter(Boolean).join(' · ') || p.sku}</p>
                        <div className="mt-1.5 flex items-center justify-between gap-1">
                          <span className="text-[13px] font-extrabold tabular-nums text-ocean-700 dark:text-ocean-300">{price === null || price === undefined ? <span className="text-[11px] text-amber-600">Set price</span> : tk(price)}</span>
                          <span className={cls('text-[10.5px] font-bold tabular-nums', stock <= 0 ? 'text-rose-600' : low ? 'text-amber-600' : 'text-emerald-600')}>{stock <= 0 ? 'Out of stock' : `${num(stock)} left`}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {more && (
                <div className="flex justify-center pt-3">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setLimit((l) => l + PAGE)}>Show more ({num(list.data.total - items.length)} more)</button>
                </div>
              )}
            </>
          )}
      </div>
    </section>
  );
}

function Pill({ on, onClick, label, count }) {
  return (
    <button type="button" onClick={onClick}
      className={cls('inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12px] font-semibold transition',
        on ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900' : 'border-slate-200 text-slate-700 hover:border-ocean-300 hover:text-ocean-700 dark:border-slate-700 dark:text-slate-300')}>
      {label}{count > 0 && <span className="text-[11px] font-semibold tabular-nums text-slate-400">{num(count)}</span>}
    </button>
  );
}
