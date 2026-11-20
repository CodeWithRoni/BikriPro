import { Banknote, Smartphone, Building2, CreditCard, Wallet } from 'lucide-react';
import { fileUrl } from '../../api/client';
import { cls } from '../../utils/format';

/** Keyboard shortcut hint, e.g. <Kbd>F9</Kbd> */
export function Kbd({ children, light = false, className = '' }) {
  return (
    <kbd className={cls('hidden rounded-[5px] border border-b-2 px-1 font-sans text-[10px] font-bold leading-[15px] xl:inline-block',
      light ? 'border-white/30 bg-white/15 text-white' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400', className)}>
      {children}
    </kbd>
  );
}

/** Product picture or initials. */
export function Thumb({ item, size = 'h-11 w-11', text = 'text-sm' }) {
  return (
    <div className={cls('flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800', size)}>
      {item.image_path
        ? <img src={fileUrl(item.image_path)} alt="" loading="lazy" className="h-full w-full object-contain" />
        : <span className={cls('font-black text-ocean-300 dark:text-slate-600', text)}>{(item.name || '?').slice(0, 2).toUpperCase()}</span>}
    </div>
  );
}

/** Colour / icon per payment account type (bKash pink, Nagad orange…). */
export function methodStyle(acc) {
  const name = (acc?.name || '').toLowerCase();
  if (acc?.type === 'cash') return { Icon: Banknote, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300' };
  if (name.includes('bkash')) return { Icon: Smartphone, tone: 'bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300' };
  if (name.includes('nagad')) return { Icon: Smartphone, tone: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300' };
  if (name.includes('rocket') || name.includes('upay')) return { Icon: Smartphone, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300' };
  if (acc?.type === 'mfs') return { Icon: Smartphone, tone: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/30 dark:text-fuchsia-300' };
  if (acc?.type === 'card') return { Icon: CreditCard, tone: 'bg-ocean-50 text-ocean-600 dark:bg-ocean-900/30 dark:text-ocean-300' };
  if (acc?.type === 'bank') return { Icon: Building2, tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300' };
  return { Icon: Wallet, tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
}

/** Small label + value cell of the totals strip. */
export function TotalCell({ label, value, tone, onClick, active, children, icon: Icon }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={cls('relative min-w-0 border-r border-slate-200 px-2.5 py-2.5 text-left dark:border-slate-800 2xl:px-4',
        onClick && 'transition hover:bg-slate-50 dark:hover:bg-slate-800/60', active && 'bg-ocean-50/70 dark:bg-ocean-900/20')}>
      <span className="flex items-center gap-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-slate-500 2xl:text-[10.5px]">
        {label}{Icon && <Icon className="h-3 w-3 text-ocean-600" />}
      </span>
      <span className={cls('mt-0.5 block truncate text-[15px] font-bold tabular-nums', tone)}>{value}</span>
      {children}
    </Tag>
  );
}
