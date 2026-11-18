import { useEffect, useState } from 'react';
import { X, Loader2, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { cls, monthStart, todayStr, addDays } from '../../utils/format';

export function Spinner({ className = '' }) {
  return <Loader2 className={cls('h-5 w-5 animate-spin text-ocean-600', className)} />;
}

export function PageLoader() {
  return <div className="flex h-64 items-center justify-center"><Spinner className="h-8 w-8" /></div>;
}

export function Empty({ title = 'Nothing here yet', hint, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 rounded-2xl bg-ocean-50 p-4 text-ocean-600 dark:bg-ocean-900/30 dark:text-ocean-300"><Icon className="h-7 w-7" /></div>
      <p className="font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, icon: Icon, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && <div className="rounded-xl bg-ocean-600/10 p-2.5 text-ocean-600 dark:text-ocean-300"><Icon className="h-5 w-5" /></div>}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', '2xl': 'max-w-7xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cls('flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl', width)}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="text-base font-bold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3.5 dark:border-slate-800">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, className = '' }) {
  return (
    <label className={cls('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function StatCard({ label, value, icon: Icon, tone = 'ocean', sub, onClick }) {
  const tones = {
    ocean: 'bg-ocean-50 text-ocean-600 dark:bg-ocean-900/30 dark:text-ocean-300',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={cls('card flex items-start gap-3 p-4 text-left', onClick && 'group w-full cursor-pointer transition hover:-translate-y-0.5 hover:border-ocean-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-500 dark:hover:border-ocean-700')}>
      {Icon && <div className={cls('rounded-xl p-2.5', tones[tone])}><Icon className="h-5 w-5" /></div>}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-xl font-bold text-slate-800 dark:text-white">{value}</p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
      {onClick && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-ocean-500" />}
    </Tag>
  );
}

const PRESETS = [
  ['Today', () => [todayStr(), todayStr()]],
  ['7 days', () => [addDays(-6), todayStr()]],
  ['This month', () => [monthStart(), todayStr()]],
  ['30 days', () => [addDays(-29), todayStr()]],
];

export function DateRange({ from, to, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(([l, f]) => {
        const [a, b] = f();
        return <button type="button" key={l} className={cls('chip', from === a && to === b && 'chip-active')} onClick={() => onChange(a, b)}>{l}</button>;
      })}
      <input type="date" className="input w-auto py-1.5" value={from || ''} onChange={(e) => onChange(e.target.value, to)} />
      <span className="text-slate-400">→</span>
      <input type="date" className="input w-auto py-1.5" value={to || ''} onChange={(e) => onChange(from, e.target.value)} />
    </div>
  );
}

export function Pagination({ page, limit, total, onPage }) {
  if (!total || total <= limit) return null;
  const pages = Math.ceil(total / limit);
  return (
    <div className="flex items-center justify-between px-1 py-3 text-sm text-slate-500">
      <span>Page {page} of {pages} · {total} records</span>
      <div className="flex gap-1">
        <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function Badge({ tone = 'slate', children }) {
  const t = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    ocean: 'bg-ocean-100 text-ocean-700 dark:bg-ocean-900/40 dark:text-ocean-300',
  }[tone];
  return <span className={cls('badge', t)}>{children}</span>;
}

/** Tabs used across settings/report pages */
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70">
      {tabs.map(([k, l]) => (
        <button type="button" key={k} onClick={() => onChange(k)}
          className={cls('whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition', value === k ? 'bg-white text-ocean-700 shadow-sm dark:bg-slate-900 dark:text-ocean-300' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200')}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Debounced value hook for search boxes */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
