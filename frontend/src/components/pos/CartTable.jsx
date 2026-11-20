import { Minus, Plus, Trash2, BadgePercent, ShoppingCart, ScanBarcode } from 'lucide-react';
import { Thumb } from './parts';
import { tk, num, cls } from '../../utils/format';

const n = (v) => Number(v) || 0;

/** Cart lines: a table on wide screens, compact cards on phones. */
export default function CartTable({ items, offers, dispatch, selected, onSelect }) {
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

  const line = (i) => n(i.qty) * n(i.unit_price) - n(i.discount) - (offers.lines[i.variant_id]?.amount || 0);
  const set = (i, key, value) => dispatch({ type: 'set', id: i.variant_id, key, value });
  const stockNote = (i) => (n(i.qty) > n(i.stock)
    ? <span className="rounded-full bg-rose-50 px-1.5 py-px text-[10.5px] font-bold text-rose-600 dark:bg-rose-900/30 dark:text-rose-300">Only {num(i.stock)} in stock</span>
    : n(i.stock) <= Math.max(n(i.low_alert), 3)
      ? <span className="rounded-full bg-amber-50 px-1.5 py-px text-[10.5px] font-bold text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">{num(i.stock)} left</span>
      : <span className="text-slate-400">{num(i.stock)} in stock</span>);
  const offerNote = (i) => {
    const o = offers.lines[i.variant_id];
    return o && (
      <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300">
        <BadgePercent className="h-3 w-3" /> {o.name} · saved {tk(o.amount)}
      </span>
    );
  };
  const stepper = (i) => (
    <div className="inline-flex h-9 shrink-0 items-center overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <button type="button" aria-label="Less" className="flex h-full w-7 items-center justify-center text-slate-500 xl:w-8 hover:bg-slate-50 hover:text-ocean-600 dark:hover:bg-slate-800" onClick={() => dispatch({ type: 'qty', id: i.variant_id, delta: -1 })}><Minus className="h-3.5 w-3.5" /></button>
      <input aria-label="Quantity" className="h-full w-9 border-x xl:w-11 border-slate-200 bg-transparent text-center text-sm font-bold tabular-nums outline-none focus:bg-ocean-50 dark:border-slate-700 dark:focus:bg-slate-800" value={i.qty} inputMode="decimal"
        onFocus={(e) => e.target.select()} onChange={(e) => set(i, 'qty', e.target.value.replace(/[^\d.]/g, ''))} />
      <button type="button" aria-label="More" className="flex h-full w-7 items-center justify-center text-ocean-600 xl:w-8 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => dispatch({ type: 'qty', id: i.variant_id, delta: 1 })}><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
  const money = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-right text-sm font-semibold tabular-nums outline-none transition focus:border-ocean-500 focus:ring-4 focus:ring-ocean-100 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-ocean-900/40';

  return (
    <>
      {/* wide screens */}
      <table className="hidden w-full table-fixed border-collapse md:table">
        <colgroup><col className="hidden w-9 xl:table-column" /><col /><col className="w-[6.75rem] xl:w-[7.75rem]" /><col className="w-[5.5rem] xl:w-28" /><col className="w-[4.5rem] xl:w-24" /><col className="w-24 xl:w-28" /><col className="w-10" /></colgroup>
        <thead className="sticky top-0 z-[1] bg-slate-50 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800/80">
          <tr>
            <th className="hidden px-2 py-2.5 text-center xl:table-cell">#</th>
            <th className="px-2 py-2.5 text-left">Product</th>
            <th className="px-2 py-2.5 text-center">Qty</th>
            <th className="px-2 py-2.5 text-right">Unit price</th>
            <th className="px-2 py-2.5 text-right">Discount</th>
            <th className="px-3 py-2.5 text-right">Subtotal</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((i, k) => {
            const sel = selected === i.variant_id;
            return (
              <tr key={i.variant_id} onClick={() => onSelect(i.variant_id)}
                className={cls('border-b border-slate-100 align-middle transition-colors dark:border-slate-800', sel ? 'bg-ocean-50/60 dark:bg-ocean-900/15' : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40')}>
                <td className={cls('hidden px-2 py-2.5 text-center text-xs font-semibold tabular-nums text-slate-400 xl:table-cell', sel && 'shadow-[inset_3px_0_0_theme(colors.ocean.600)]')}>{k + 1}</td>
                <td className={cls('px-2 py-2.5', sel && 'shadow-[inset_3px_0_0_theme(colors.ocean.600)] xl:shadow-none')}>
                  <div className="flex items-center gap-2.5">
                    <span className="hidden 2xl:block"><Thumb item={i} /></span>
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">{i.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-slate-500">
                        {[i.label, i.sku].filter(Boolean).join(' · ')} {stockNote(i)}
                      </p>
                      {offerNote(i)}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-center">{stepper(i)}</td>
                <td className="px-2 py-2.5">
                  <input aria-label="Unit price" className={cls(money, (i.unit_price === '' || i.unit_price === null) && 'border-amber-400 bg-amber-50 dark:bg-amber-900/20')} inputMode="decimal" placeholder="Price"
                    value={i.unit_price ?? ''} onFocus={(e) => e.target.select()} onChange={(e) => set(i, 'unit_price', e.target.value)} />
                </td>
                <td className="px-2 py-2.5">
                  <input aria-label="Discount" className={cls(money, !n(i.discount) && 'font-medium text-slate-400')} inputMode="decimal" placeholder="0"
                    value={i.discount} onFocus={(e) => e.target.select()} onChange={(e) => set(i, 'discount', e.target.value)} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  {offers.lines[i.variant_id] && <span className="block text-[11px] tabular-nums text-slate-400 line-through">{tk(n(i.qty) * n(i.unit_price) - n(i.discount))}</span>}
                  <span className="text-[14px] font-bold tabular-nums">{tk(line(i))}</span>
                </td>
                <td className="pr-2 text-center">
                  <button type="button" aria-label="Remove" className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'remove', id: i.variant_id }); }}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
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
                <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-500">{[i.label, i.sku].filter(Boolean).join(' · ')} {stockNote(i)}</p>
                {offerNote(i)}
              </div>
              <div className="text-right"><b className="text-sm tabular-nums">{tk(line(i))}</b></div>
              <button type="button" aria-label="Remove" className="p-1 text-slate-400 hover:text-rose-500" onClick={() => dispatch({ type: 'remove', id: i.variant_id })}><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_minmax(0,0.8fr)] items-center gap-2 pl-[3.1rem]">
              <div className="shrink-0">{stepper(i)}</div>
              <input aria-label="Unit price" className={money} inputMode="decimal" placeholder="Price" value={i.unit_price ?? ''} onChange={(e) => set(i, 'unit_price', e.target.value)} />
              <input aria-label="Discount" className={money} inputMode="decimal" placeholder="Disc" value={i.discount} onChange={(e) => set(i, 'discount', e.target.value)} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
