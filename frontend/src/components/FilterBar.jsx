import { useState } from 'react';
import { Search, X, SlidersHorizontal, RotateCcw, ArrowUpDown, CalendarDays } from 'lucide-react';
import useApi from '../hooks/useApi';
import { PartyPicker, ACCOUNT_ICONS } from './Pickers';
import { cls, todayStr, addDays, monthStart, fmtDate, tk } from '../utils/format';
import Select from './ui/Select';

/** Payment methods (account types) */
export const METHODS = [['cash', 'Cash'], ['mfs', 'bKash / Nagad (MFS)'], ['card', 'Card'], ['bank', 'Bank']];

/** Date presets shared by every filter bar */
const lastMonth = () => {
  const [y, m] = todayStr().split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const days = new Date(Date.UTC(py, pm, 0)).getUTCDate(); // days in previous month
  const mm = String(pm).padStart(2, '0');
  return [`${py}-${mm}-01`, `${py}-${mm}-${String(days).padStart(2, '0')}`];
};
export const DATE_PRESETS = [
  ['Today', () => [todayStr(), todayStr()]],
  ['Yesterday', () => [addDays(-1), addDays(-1)]],
  ['7 days', () => [addDays(-6), todayStr()]],
  ['This month', () => [monthStart(), todayStr()]],
  ['Last month', lastMonth],
  ['30 days', () => [addDays(-29), todayStr()]],
  ['This year', () => [`${todayStr().slice(0, 4)}-01-01`, todayStr()]],
  ['All time', () => ['', '']],
];

/**
 * Filter state helper: const [f, set, reset] = useFilters(INITIAL, () => setPage(1))
 * set(patch) merges and calls onChange (e.g. back to page 1).
 */
export function useFilters(initial, onChange) {
  const [f, setF] = useState(initial);
  const set = (patch) => { setF((x) => ({ ...x, ...patch })); onChange?.(); };
  const reset = () => { setF(initial); onChange?.(); };
  return [f, set, reset];
}

const isEmpty = (v) => v === '' || v === null || v === undefined || v === false || (Array.isArray(v) && !v.length)
  || (typeof v === 'object' && !Array.isArray(v) && 'min' in v && v.min === '' && v.max === '');

/**
 * One professional, consistent filter bar for list pages.
 *
 * <FilterBar
 *   search={{ value, onChange, placeholder }}
 *   date={{ from, to, onChange(from, to) }}        // optional
 *   sort={{ value, onChange, options: [[v, label]] }} // optional
 *   fields={[{ key, label, type: 'select'|'segment'|'party'|'account'|'range'|'toggle'|'text', options, placeholder, party, allLabel }]}
 *   values={f} onChange={set} onClear={reset}
 *   summary={<>…</>}                                // shown left of the active chips
 * />
 */
export default function FilterBar({ search, date, sort, fields = [], values = {}, onChange, onClear, summary, defaultDate }) {
  const [open, setOpen] = useState(false);
  const accounts = useApi(fields.some((x) => x.type === 'account') ? '/accounts' : null);
  const accList = accounts.data?.data || [];

  const grid = fields.filter((x) => ['select', 'party', 'account', 'range', 'text'].includes(x.type));
  const inline = fields.filter((x) => ['segment', 'toggle'].includes(x.type));

  // Active filter chips
  const chips = [];
  if (date && (date.from || date.to) && defaultDate && (date.from !== defaultDate[0] || date.to !== defaultDate[1])) {
    chips.push({ k: '_date', label: `${date.from ? fmtDate(date.from) : 'Start'} → ${date.to ? fmtDate(date.to) : 'Today'}`, clear: () => date.onChange(...defaultDate) });
  }
  if (date && !date.from && !date.to) chips.push({ k: '_date', label: 'All time', clear: defaultDate ? () => date.onChange(...defaultDate) : null });
  for (const x of fields) {
    const v = values[x.key];
    if (isEmpty(v)) continue;
    let label;
    if (x.type === 'select' || x.type === 'segment') label = (x.options.find(([o]) => String(o) === String(v)) || [])[1] || v;
    else if (x.type === 'party') label = v.name;
    else if (x.type === 'account') label = accList.find((a) => String(a.id) === String(v))?.name || 'Account';
    else if (x.type === 'range') label = `${v.min === '' ? '0' : tk(v.min)} – ${v.max === '' ? 'any' : tk(v.max)}`;
    else if (x.type === 'toggle') label = x.label;
    else label = v;
    chips.push({ k: x.key, label: x.type === 'toggle' || x.type === 'segment' ? label : `${x.label}: ${label}`, clear: () => onChange({ [x.key]: x.type === 'range' ? { min: '', max: '' } : x.type === 'party' ? null : x.type === 'toggle' ? false : '' }) });
  }
  const anyActive = chips.some((c) => c.clear) || !!search?.value;
  const activeCount = chips.filter((c) => c.k !== '_date').length;
  const clearAll = () => { search?.onChange(''); onClear?.(); if (date && defaultDate) date.onChange(...defaultDate); };

  return (
    <div className="card mb-4 overflow-hidden">
      {/* Search + sort */}
      <div className={cls('flex flex-wrap items-center gap-2 p-3', !search && !sort && 'lg:hidden')}>
        {search && (
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9 pr-9" placeholder={search.placeholder || 'Search…'} value={search.value} onChange={(e) => search.onChange(e.target.value)} />
            {search.value && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-rose-500" onClick={() => search.onChange('')} aria-label="Clear search"><X className="h-4 w-4" /></button>}
          </div>
        )}
        {sort && (
          <div className="relative">
            <ArrowUpDown className="pointer-events-none absolute z-10 left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Select className="input w-auto pl-9 pr-8" value={sort.value} onChange={(e) => sort.onChange(e.target.value)} aria-label="Sort">
              {sort.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
        )}
        {(fields.length > 0 || date) && (
          <button type="button" className={cls('btn-secondary lg:hidden', open && 'border-ocean-400 text-ocean-700 dark:text-ocean-300')} onClick={() => setOpen(!open)}>
            <SlidersHorizontal className="h-4 w-4" /> Filters {activeCount > 0 && <span className="rounded-full bg-ocean-600 px-1.5 text-[11px] text-white">{activeCount}</span>}
          </button>
        )}
      </div>

      {/* Filter panel */}
      {(fields.length > 0 || date) && (
        <div className={cls('space-y-3 border-t border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40', !open && 'hidden lg:block', !search && !sort && 'lg:border-t-0')}>
          {date && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><CalendarDays className="h-3.5 w-3.5" /> Date</span>
              {DATE_PRESETS.map(([l, fn]) => {
                const [a, b] = fn();
                return <button type="button" key={l} className={cls('chip py-0.5', date.from === a && date.to === b && 'chip-active')} onClick={() => date.onChange(a, b)}>{l}</button>;
              })}
              <div className="flex items-center gap-1.5">
                <input type="date" className="input-sm w-auto" value={date.from || ''} onChange={(e) => date.onChange(e.target.value, date.to)} aria-label="From date" />
                <span className="text-slate-400">→</span>
                <input type="date" className="input-sm w-auto" value={date.to || ''} onChange={(e) => date.onChange(date.from, e.target.value)} aria-label="To date" />
              </div>
            </div>
          )}

          {grid.length > 0 && (
            <div className={cls('grid gap-2 sm:grid-cols-2', grid.length >= 4 ? 'lg:grid-cols-4' : grid.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
              {grid.map((x) => (
                <div key={x.key} className="min-w-0">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{x.label}</p>
                  {x.type === 'select' && (
                    <Select className={cls('input-sm', !isEmpty(values[x.key]) && 'border-ocean-400 text-ocean-700 dark:text-ocean-300')} value={values[x.key] ?? ''} onChange={(e) => onChange({ [x.key]: e.target.value })}>
                      <option value="">{x.placeholder || 'All'}</option>
                      {x.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                  )}
                  {x.type === 'account' && (
                    <Select className={cls('input-sm', !isEmpty(values[x.key]) && 'border-ocean-400 text-ocean-700 dark:text-ocean-300')} value={values[x.key] ?? ''} onChange={(e) => onChange({ [x.key]: e.target.value })}>
                      <option value="">{x.placeholder || 'All accounts'}</option>
                      {accList.map((a) => <option key={a.id} value={a.id} data-icon={ACCOUNT_ICONS[a.type]}>{a.name} ({a.type.toUpperCase()})</option>)}
                    </Select>
                  )}
                  {x.type === 'party' && <div className="[&_.input]:rounded-lg [&_.input]:py-1.5"><PartyPicker type={x.party} value={values[x.key]} onChange={(v) => onChange({ [x.key]: v })} placeholder={x.placeholder || `Any ${x.party}`} /></div>}
                  {x.type === 'text' && <input className="input-sm" placeholder={x.placeholder} value={values[x.key] ?? ''} onChange={(e) => onChange({ [x.key]: e.target.value })} />}
                  {x.type === 'range' && (
                    <div className="flex items-center gap-1.5">
                      <input type="number" min="0" className="input-sm no-spin" placeholder="Min" value={values[x.key]?.min ?? ''} onChange={(e) => onChange({ [x.key]: { ...values[x.key], min: e.target.value } })} />
                      <span className="text-slate-400">–</span>
                      <input type="number" min="0" className="input-sm no-spin" placeholder="Max" value={values[x.key]?.max ?? ''} onChange={(e) => onChange({ [x.key]: { ...values[x.key], max: e.target.value } })} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {inline.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {inline.map((x) => (x.type === 'segment' ? (
                <div key={x.key} className="flex flex-wrap items-center gap-2">
                  {x.label && <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{x.label}</span>}
                  <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
                    {[['', x.allLabel || 'All'], ...x.options].map(([v, l]) => (
                      <button type="button" key={v || 'all'} onClick={() => onChange({ [x.key]: v })}
                        className={cls('rounded-lg px-3 py-1.5 text-xs font-semibold transition', String(values[x.key] ?? '') === String(v) ? 'bg-ocean-600 text-white shadow-sm' : 'text-slate-600 hover:text-ocean-700 dark:text-slate-300')}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <label key={x.key} className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <input type="checkbox" className="accent-ocean-600" checked={!!values[x.key]} onChange={(e) => onChange({ [x.key]: e.target.checked })} />{x.icon}{x.label}
                </label>
              )))}
            </div>
          )}
        </div>
      )}

      {/* Result summary + active chips */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
        {summary && <div className="mr-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">{summary}</div>}
        {chips.map((c) => (
          <span key={c.k} className="inline-flex items-center gap-1.5 rounded-full bg-ocean-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-ocean-700 dark:bg-ocean-900/40 dark:text-ocean-300">
            {c.label}
            {c.clear && <button type="button" className="rounded-full p-0.5 hover:bg-ocean-100 dark:hover:bg-ocean-800" onClick={c.clear} aria-label={`Remove ${c.label}`}><X className="h-3 w-3" /></button>}
          </span>
        ))}
        {anyActive && <button type="button" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline" onClick={clearAll}><RotateCcw className="h-3.5 w-3.5" /> Clear all</button>}
      </div>
    </div>
  );
}

/** Small "label value" item for the summary line */
export function Sum({ label, value, tone }) {
  return <span>{label} <b className={cls('text-slate-800 dark:text-white', tone === 'rose' && '!text-rose-600', tone === 'green' && '!text-emerald-600', tone === 'amber' && '!text-amber-600')}>{value}</b></span>;
}

/** Turn filter values into query params (party → id, range → min/max). */
export function toParams(f, map = {}) {
  const out = {};
  for (const [k, v] of Object.entries(f)) {
    if (isEmpty(v)) continue;
    const key = map[k] || k;
    if (v && typeof v === 'object' && 'min' in v) {
      if (v.min !== '') out[`min_${key}`] = v.min;
      if (v.max !== '') out[`max_${key}`] = v.max;
    } else if (v && typeof v === 'object' && 'id' in v) out[key] = v.id;
    else out[key] = v === true ? 1 : v;
  }
  return out;
}
