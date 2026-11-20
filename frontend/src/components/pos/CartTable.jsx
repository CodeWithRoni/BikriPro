import { Fragment } from 'react';
import { Minus, Plus, Trash2, Tag, ShoppingCart, ScanBarcode } from 'lucide-react';
import { Thumb } from './parts';
import { tk, num, cls } from '../../utils/format';

const n = (v) => Number(v) || 0;
/** 2450 → "2,450" while keeping what the cashier is typing (decimals, empty). */
const fmt = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const [i, d] = String(v).split('.');
  return (i === '' ? '' : Number(i).toLocaleString('en-IN')) + (d !== undefined ? `.${d}` : '');
};

/** A colour name the browser understands ("Navy", "Maroon"…) becomes a swatch. */
const COLOURS = {
  'bottle green': '#0f5c4a', 'off-white': '#ece6d6', 'off white': '#ece6d6', mustard: '#e3a008', sky: '#7cc3ee', 'sky blue': '#7cc3ee',
  cream: '#f3e9cf', golden: '#d4a017', 'navy blue': '#1e3a5f', navy: '#1e3a5f', indigo: '#334e7a', maroon: '#7f1d1d', rose: '#be185d',
  'light blue': '#93c5fd', 'dark blue': '#1e3a8a', 'light green': '#86efac', 'dark green': '#14532d', ash: '#9ca3af', 'ash grey': '#9ca3af',
  'coffee': '#6f4e37', 'chocolate': '#5c3a21', 'magenta': '#c026d3', 'peach': '#fbb08c', 'mint': '#98e2c6', 'lemon': '#f4e04d',
};
const swatchOf = (c) => {
  if (!c) return null;
  const key = String(c).trim().toLowerCase();
  if (COLOURS[key]) return COLOURS[key];
  if (typeof window === 'undefined' || !window.CSS?.supports) return null;
  const v = key.replace(/\s+/g, '');
  return window.CSS.supports('color', v) ? v : null;
};

/**
 * Cart lines: table on wide screens (thumb, colour swatch, size, SKU, stock, qty stepper,
 * editable price & discount, offer note row), compact cards on phones.
 */
export default function CartTable({ items, offers, offerList, dispatch, selected, onSelect }) {
  if (!items.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ocean-50 text-ocean-600 dark:bg-ocean-900/30 dark:text-ocean-300"><ShoppingCart className="h-7 w-7" /></div>
        <div>
          <p className="font-bold text-slate-700 dark:text-slate-200">Cart is empty</p>
          <p className="mt-1 text-sm text-slate-500">Scan a barcode, type a product name, or tap a product on the right.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800"><ScanBarcode className="h-3.5 w-3.5" /> Press F2 to search</span>
      </div>
    );
  }

  const offerType = (id) => (offerList || []).find((o) => Number(o.id) === Number(id))?.type;
  const line = (i) => n(i.qty) * n(i.unit_price) - n(i.discount) - (offers.lines[i.variant_id]?.amount || 0);
  const set = (i, key, value) => dispatch({ type: 'set', id: i.variant_id, key, value });

  const meta = (i) => {
    const sw = swatchOf(i.color);
    const parts = i.color || i.size
      ? [i.color, i.size && `Size ${i.size}`, i.sku].filter(Boolean)
      : [i.label, i.sku].filter(Boolean);
    const low = n(i.stock) <= Math.max(n(i.low_alert), 6);
    return (
      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
        {sw && <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-black/10" style={{ background: sw }} />}
        <span>{parts.join(' · ')}</span>
        {n(i.qty) > n(i.stock)
          ? <span className="inline-flex h-[18px] items-center rounded-full bg-rose-50 px-2 text-[11px] font-bold text-rose-600 dark:bg-rose-900/30 dark:text-rose-300">Only {num(i.stock)} in stock</span>
          : low
            ? <span className="inline-flex h-[18px] items-center rounded-full bg-amber-50 px-2 text-[11px] font-bold text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">Only {num(i.stock)} left</span>
            : <span className="text-slate-400 dark:text-slate-500">· {num(i.stock)} in stock</span>}
      </p>
    );
  };
  const offerNote = (i) => {
    const o = offers.lines[i.variant_id];
    if (!o) return null;
    const bogo = offerType(o.offer_id) === 'bogo';
    const free = bogo && n(i.unit_price) ? Math.round(o.amount / n(i.unit_price)) : 0;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-[3px] text-[11.5px] font-semibold text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300">
        <Tag className="h-[13px] w-[13px]" /> {o.name} applied — {bogo && free ? `${free} piece${free > 1 ? 's' : ''} free` : `you save ${tk(o.amount)}`}
      </span>
    );
  };
  const unitOffer = (i) => {
    const o = offers.lines[i.variant_id];
    if (!o || offerType(o.offer_id) === 'bogo' || !n(i.qty)) return null;
    return Math.round((n(i.unit_price) - (n(i.discount) + o.amount) / n(i.qty)) * 100) / 100;
  };
  const stepper = (i) => (
    <div className="inline-flex h-[34px] shrink-0 items-center overflow-hidden rounded-[10px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <button type="button" aria-label="Less" className="flex h-full w-[30px] items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-ocean-600 dark:hover:bg-slate-800" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'qty', id: i.variant_id, delta: -1 }); }}><Minus className="h-3.5 w-3.5" /></button>
      <input aria-label="Quantity" className="h-full w-[42px] border-x border-slate-200 bg-transparent text-center text-[14px] font-bold tabular-nums text-slate-900 outline-none focus:bg-ocean-50 dark:border-slate-700 dark:text-white dark:focus:bg-slate-800" value={i.qty} inputMode="decimal"
        onFocus={(e) => e.target.select()} onChange={(e) => set(i, 'qty', e.target.value.replace(/[^\d.]/g, ''))} />
      <button type="button" aria-label="More" className="flex h-full w-[30px] items-center justify-center text-ocean-600 hover:bg-slate-50 dark:text-ocean-400 dark:hover:bg-slate-800" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'qty', id: i.variant_id, delta: 1 }); }}><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
  const box = 'h-[34px] w-full min-w-0 rounded-[10px] border border-slate-200 bg-white px-2.5 text-right text-[13.5px] font-semibold tabular-nums text-slate-900 outline-none transition focus:border-ocean-500 focus:ring-4 focus:ring-ocean-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-ocean-900/40';

  return (
    <>
      {/* wide screens */}
      <table className="hidden w-full table-fixed border-collapse md:table">
        <colgroup>
          <col className="w-10" /><col />
          <col className="w-[6.75rem] xl:w-[7.6rem]" /><col className="w-[5.75rem] xl:w-[7.4rem]" /><col className="w-[4.75rem] xl:w-[6.25rem]" />
          <col className="w-24 xl:w-[6.9rem]" /><col className="w-11" />
        </colgroup>
        <thead className="sticky top-0 z-[1] bg-slate-50 text-[10.5px] font-bold uppercase tracking-[.06em] text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
          <tr className="border-b border-slate-200 dark:border-slate-800">
            <th className="px-2.5 py-[9px] text-center">#</th>
            <th className="px-2.5 py-[9px] text-left">Product</th>
            <th className="px-2.5 py-[9px] text-center">Qty</th>
            <th className="px-2.5 py-[9px] text-right">Unit price</th>
            <th className="px-2.5 py-[9px] text-right">Discount</th>
            <th className="px-2.5 py-[9px] text-right">Subtotal</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((i, k) => {
            const sel = selected === i.variant_id;
            const off = unitOffer(i);
            const note = offerNote(i);
            const rowBg = sel ? 'bg-ocean-50/60 dark:bg-ocean-900/15' : '';
            return (
              <Fragment key={i.variant_id}>
                <tr onClick={() => onSelect(i.variant_id)} className={cls('cursor-default align-middle', rowBg, !note && 'border-b border-slate-100 dark:border-slate-800/70')}>
                  <td className={cls('px-2.5 py-2.5 text-center text-[13px] tabular-nums text-slate-400', sel && 'shadow-[inset_3px_0_0_theme(colors.ocean.600)]')}>{k + 1}</td>
                  <td className="px-2.5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="hidden xl:block"><Thumb item={i} size="h-[42px] w-[42px]" /></span>
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">{i.name}</p>
                        {meta(i)}
                      </div>
                    </div>
                  </td>
                  <td className="px-2.5 py-2.5 text-center">{stepper(i)}</td>
                  <td className="px-2.5 py-2.5 text-right">
                    <input aria-label="Unit price" className={cls(box, (i.unit_price === '' || i.unit_price === null) && 'border-amber-400 bg-amber-50 dark:bg-amber-900/20')} inputMode="decimal" placeholder="Price"
                      value={fmt(i.unit_price)} onFocus={(e) => e.target.select()} onChange={(e) => set(i, 'unit_price', e.target.value.replace(/[^\d.]/g, ''))} />
                    {off !== null && <span className="mt-[3px] block text-[11px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">offer {tk(off)}</span>}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <input aria-label="Discount" className={cls(box, !n(i.discount) && 'font-medium text-slate-400 dark:text-slate-500')} inputMode="decimal" placeholder="0"
                      value={fmt(i.discount)} onFocus={(e) => e.target.select()} onChange={(e) => set(i, 'discount', e.target.value.replace(/[^\d.]/g, ''))} />
                  </td>
                  <td className="px-2.5 py-2.5 text-right text-[14px] font-bold tabular-nums text-slate-900 dark:text-white">{tk(line(i))}</td>
                  <td className="px-1 py-2.5 text-center">
                    <button type="button" aria-label="Remove" className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'remove', id: i.variant_id }); }}>
                      <Trash2 className="h-[15px] w-[15px]" />
                    </button>
                  </td>
                </tr>
                {note && (
                  <tr className={cls('border-b border-slate-100 dark:border-slate-800/70', rowBg)}>
                    <td className={cls(sel && 'shadow-[inset_3px_0_0_theme(colors.ocean.600)]')} />
                    <td colSpan={6} className="px-2.5 pb-2.5">{note}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* phones */}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
        {items.map((i) => (
          <li key={i.variant_id} className="px-3 py-3">
            <div className="flex items-start gap-2.5">
              <Thumb item={i} size="h-10 w-10" text="text-xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{i.name}</p>
                {meta(i)}
              </div>
              <div className="text-right"><b className="text-sm tabular-nums">{tk(line(i))}</b></div>
              <button type="button" aria-label="Remove" className="p-1 text-slate-400 hover:text-rose-500" onClick={() => dispatch({ type: 'remove', id: i.variant_id })}><Trash2 className="h-4 w-4" /></button>
            </div>
            {offerNote(i) && <div className="mt-1.5 pl-[3.1rem]">{offerNote(i)}</div>}
            <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_minmax(0,0.8fr)] items-center gap-2 pl-[3.1rem]">
              {stepper(i)}
              <input aria-label="Unit price" className={box} inputMode="decimal" placeholder="Price" value={fmt(i.unit_price)} onChange={(e) => set(i, 'unit_price', e.target.value.replace(/[^\d.]/g, ''))} />
              <input aria-label="Discount" className={box} inputMode="decimal" placeholder="Disc" value={fmt(i.discount)} onChange={(e) => set(i, 'discount', e.target.value.replace(/[^\d.]/g, ''))} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
