import { useEffect, useMemo, useState } from 'react';
import { Layers, Flame, Heart, Clock, BadgePercent, LayoutGrid, Tag, Ruler, Star, Package, X } from 'lucide-react';
import api, { fileUrl } from '../../api/client';
import useApi from '../../hooks/useApi';
import Select from '../ui/Select';
import { Spinner } from '../ui';
import { inScope } from '../../utils/offers';
import { tk, num, cls } from '../../utils/format';

const TABS = [['all', 'All', Layers], ['best', 'Best selling', Flame], ['recent', 'Recent', Clock], ['fav', 'Favourites', Heart], ['offer', 'On offer', BadgePercent]];
const PAGE = 48;

/** Right-hand product browser: tabs, category / brand / size filters, category pills, product cards. */
export default function Catalog({ onAdd, cartQty, offers, priceMode, reloadKey }) {
  const [tab, setTab] = useState(() => localStorage.getItem('bp_pos_tab') || 'all');
  const [cat, setCat] = useState('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { try { localStorage.setItem('bp_pos_tab', tab); } catch { /* ignore */ } }, [tab]);
  useEffect(() => setLimit(PAGE), [tab, cat, brand, size]);

  const cats = useApi('/categories');
  const brands = useApi('/brands');
  const facets = useApi('/products/facets');
  const grid = useApi(['best', 'recent', 'fav'].includes(tab) ? '/products/pos-grid' : null, { k: reloadKey });
  const list = useApi(['all', 'offer'].includes(tab) ? '/products' : null, {
    category_id: cat || undefined, brand_id: brand || undefined, size: size || undefined, sort: 'name', limit: tab === 'offer' ? 300 : limit, k: reloadKey,
  });

  const catList = cats.data?.data || cats.data || [];
  const mains = catList.filter((c) => !c.parent_id);
  const countOf = (c) => Number(c.product_count || 0) + catList.filter((s) => Number(s.parent_id) === Number(c.id)).reduce((t, s) => t + Number(s.product_count || 0), 0);
  const inCat = (p) => !cat || Number(p.category_id) === Number(cat) || catList.some((s) => Number(s.id) === Number(p.category_id) && Number(s.parent_id) === Number(cat));

  const items = useMemo(() => {
    let rows;
    if (tab === 'all' || tab === 'offer') rows = list.data?.data || [];
    else rows = (grid.data?.[{ best: 'best_selling', recent: 'recent', fav: 'favorite' }[tab]] || [])
      .filter((p) => inCat(p) && (!brand || Number(p.brand_id) === Number(brand)) && (!size || p.size === size));
    if (tab === 'offer') rows = rows.filter((p) => (offers || []).some((o) => !String(o.type).startsWith('bill') && inScope(o, p)));
    return rows;
  }, [tab, list.data, grid.data, cat, brand, size, offers]); // eslint-disable-line react-hooks/exhaustive-deps

  const offerFor = (p) => (offers || []).find((o) => !String(o.type).startsWith('bill') && inScope(o, p));
  const offerBadge = (o) => (o.type === 'percent' ? `−${Number(o.value)}%` : o.type === 'amount' ? `−৳${Number(o.value)}` : o.type === 'bogo' ? `${o.buy_qty}+${o.get_qty} free` : '');
  const loading = (tab === 'all' || tab === 'offer') ? list.loading && !list.data : grid.loading && !grid.data;
  const more = (tab === 'all') && list.data && list.data.total > items.length;
  const filtered = cat || brand || size;
  const [favs, setFavs] = useState({});
  const toggleFav = async (e, p) => {
    e.stopPropagation();
    setFavs((f) => ({ ...f, [p.product_id]: !(f[p.product_id] ?? p.is_favorite) }));
    try { await api.patch(`/products/${p.product_id}/favorite`); } catch { /* ignore */ }
  };

  return (
    <section className="card flex min-h-0 flex-col overflow-hidden">
      {/* tabs */}
      <div className="flex gap-1 overflow-x-auto px-3 pt-3 [scrollbar-width:none]">
        {TABS.map(([k, l, Icon]) => (
          <button type="button" key={k} onClick={() => setTab(k)}
            className={cls('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold transition',
              tab === k ? 'bg-ocean-50 text-ocean-700 dark:bg-ocean-900/40 dark:text-ocean-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200')}>
            <Icon className="h-4 w-4" />{l}
          </button>
        ))}
      </div>

      {/* filters */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2 px-3 pt-2.5">
        <Select className="input h-9 py-1 text-[12.5px]" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="" data-icon={LayoutGrid}>All categories</option>
          {mains.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          {catList.filter((c) => c.parent_id).map((c) => <option key={c.id} value={String(c.id)}>{c.parent_name} › {c.name}</option>)}
        </Select>
        <Select className="input h-9 py-1 text-[12.5px]" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand">
          <option value="" data-icon={Tag}>All brands</option>
          {(brands.data?.data || brands.data || []).map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        </Select>
        <Select className="input h-9 py-1 text-[12.5px]" value={size} onChange={(e) => setSize(e.target.value)} aria-label="Size">
          <option value="" data-icon={Ruler}>Any size</option>
          {(facets.data?.sizes || []).map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
        </Select>
      </div>

      {/* category pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 px-3 py-2.5 [scrollbar-width:thin] dark:border-slate-800">
        <Pill on={!cat} onClick={() => setCat('')} label="All" count={0} />
        {mains.map((c) => <Pill key={c.id} on={String(cat) === String(c.id)} onClick={() => setCat(String(c.id))} label={c.name} count={countOf(c)} />)}
        {filtered && (
          <button type="button" className="ml-auto inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20" onClick={() => { setCat(''); setBrand(''); setSize(''); }}>
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
              <div className="grid grid-cols-[repeat(auto-fill,minmax(7.75rem,1fr))] gap-2.5">
                {items.map((p) => {
                  const q = cartQty[p.variant_id] || 0;
                  const stock = Number(p.stock_qty);
                  const price = priceMode === 'wholesale' && p.wholesale_price !== null && p.wholesale_price !== undefined ? p.wholesale_price : p.retail_price;
                  const o = offerFor(p);
                  const fav = favs[p.product_id] ?? p.is_favorite;
                  const low = stock > 0 && stock <= Math.max(Number(p.low_stock_alert) || 0, 3);
                  return (
                    <button type="button" key={p.variant_id} onClick={() => onAdd(p)}
                      className={cls('group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop active:scale-[.98] dark:bg-slate-900',
                        q ? 'border-ocean-500 ring-[3px] ring-ocean-100 dark:ring-ocean-900/50' : 'border-slate-200 hover:border-ocean-300 dark:border-slate-800',
                        stock <= 0 && 'opacity-60')}>
                      <div className="relative aspect-[4/3] w-full bg-slate-50 dark:bg-slate-800/70">
                        {p.image_path ? <img src={fileUrl(p.image_path)} alt="" loading="lazy" className="h-full w-full object-contain p-1.5" />
                          : <div className="flex h-full items-center justify-center text-2xl font-black text-ocean-200 dark:text-slate-700">{p.name.slice(0, 2).toUpperCase()}</div>}
                        {o && <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">{offerBadge(o) || 'Offer'}</span>}
                        {q > 0
                          ? <span className="absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-ocean-600 px-1.5 text-[11px] font-extrabold text-white shadow">{num(q)}</span>
                          : (
                            <span role="button" tabIndex={-1} aria-label="Favourite" onClick={(e) => toggleFav(e, p)}
                              className={cls('absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 shadow-sm transition dark:bg-slate-900/90', !fav && 'opacity-0 group-hover:opacity-100')}>
                              <Star className={cls('h-3.5 w-3.5', fav ? 'fill-amber-400 text-amber-400' : 'text-slate-400')} />
                            </span>
                          )}
                        {stock <= 0 && <span className="absolute inset-x-0 bottom-0 bg-rose-500/90 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-white">Out of stock</span>}
                      </div>
                      <div className="flex flex-1 flex-col p-2.5">
                        <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-slate-800 dark:text-slate-100">{p.name}</p>
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{[p.size, p.color].filter(Boolean).join(' · ') || p.sku}</p>
                        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-1 pt-1.5">
                          <span className="text-[13.5px] font-extrabold tabular-nums text-ocean-700 dark:text-ocean-300">{price === null || price === undefined ? <span className="text-xs text-amber-600">Set price</span> : tk(price)}</span>
                          {stock > 0 && <span className={cls('text-[10.5px] font-bold tabular-nums', low ? 'text-amber-600' : 'text-emerald-600')}>{num(stock)} left</span>}
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
      className={cls('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition',
        on ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 text-slate-600 hover:border-ocean-300 hover:text-ocean-700 dark:border-slate-700 dark:text-slate-300')}>
      {label}{count > 0 && <span className="text-[11px] font-semibold tabular-nums text-slate-400">{num(count)}</span>}
    </button>
  );
}
