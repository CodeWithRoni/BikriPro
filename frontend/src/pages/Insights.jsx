import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lightbulb, Ruler, PackageSearch, Clock3, GitCompareArrows, ArrowUpRight, ArrowDownRight, BadgePercent } from 'lucide-react';
import useApi from '../hooks/useApi';
import useCatalog from '../hooks/useCatalog';
import { PageHeader, Tabs, Empty, Spinner, Badge, useDebounced } from '../components/ui';
import FilterBar, { useFilters, Sum, DATE_PRESETS } from '../components/FilterBar';
import { tk, num, fmtDate, monthStart, todayStr, addDays, cls } from '../utils/format';

// Chart colours (validated for colour-blind separation in light & dark):
// single measure = brand blue; two periods = blue (A) + amber (B).
const BAR = 'bg-[#1d74e6] dark:bg-[#4594f5]';
const BAR_B = 'bg-[#d97706] dark:bg-[#cf7f12]';
// Sequential ramp for the heatmap (one hue, light → dark)
const HEAT = ['bg-ocean-50 dark:bg-ocean-950/40', 'bg-ocean-100 dark:bg-ocean-900/60', 'bg-ocean-200 dark:bg-ocean-800', 'bg-ocean-400 dark:bg-ocean-600', 'bg-ocean-600 dark:bg-ocean-400', 'bg-ocean-800 dark:bg-ocean-200'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]; // Bangladesh shop week starts Saturday

/** Hover tooltip for a mark */
function Tip({ children, text, className = '' }) {
  return (
    <div className={cls('group/tip relative', className)}>
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 whitespace-pre rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white shadow-lg group-hover/tip:block dark:bg-slate-700">{text}</div>
    </div>
  );
}

export default function Insights() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'size';
  return (
    <div>
      <PageHeader icon={Lightbulb} title="Smart Reports" subtitle="What sells, what doesn't, when the shop is busy, and how this season compares with the last" />
      <Tabs tabs={[['size', 'Sizes & colours'], ['dead', 'Dead stock'], ['busy', 'Busy times'], ['compare', 'Compare periods']]} value={tab} onChange={(t) => setParams({ tab: t })} />
      {tab === 'size' && <SizeColour />}
      {tab === 'dead' && <DeadStock />}
      {tab === 'busy' && <BusyTimes />}
      {tab === 'compare' && <Compare />}
    </div>
  );
}

// ---------------------------------------------------------------- sizes & colours
function SizeColour() {
  const c = useCatalog();
  const [from, setFrom] = useState(addDays(-89));
  const [to, setTo] = useState(todayStr());
  const [f, set, reset] = useFilters({ category_id: '' });
  const [measure, setMeasure] = useState('qty');
  const { data, loading } = useApi('/insights/size-colour', { from: from || '2000-01-01', to: to || todayStr(), category_id: f.category_id || undefined });
  return (
    <>
      <FilterBar date={{ from, to, onChange: (a, b) => { setFrom(a); setTo(b); } }} defaultDate={[addDays(-89), todayStr()]}
        sort={{ value: measure, onChange: setMeasure, options: [['qty', 'Show pieces sold'], ['revenue', 'Show sales (৳)']] }}
        values={f} onChange={set} onClear={reset}
        fields={[{ key: 'category_id', label: 'Category', type: 'select', options: c.main.map((x) => [x.id, x.name]), placeholder: 'All categories' }]}
        summary={data && <><Sum label="Sizes" value={num(data.sizes.length)} /><Sum label="Colours" value={num(data.colours.length)} /></>} />
      {loading && !data ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <BarList title="Sizes" icon={Ruler} rows={data?.sizes || []} measure={measure} />
          <BarList title="Colours" icon={Ruler} rows={data?.colours || []} measure={measure} colorDot />
        </div>
      )}
    </>
  );
}

function BarList({ title, icon: Icon, rows, measure, colorDot }) {
  const c = useCatalog();
  const max = Math.max(...rows.map((r) => Number(r[measure])), 1);
  const total = rows.reduce((t, r) => t + Number(r[measure]), 0) || 1;
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center gap-2"><Icon className="h-4 w-4 text-slate-400" /><p className="font-bold">{title} that sell</p></div>
      <p className="mb-3 text-xs text-slate-500">Bar = {measure === 'qty' ? 'pieces sold' : 'sales after returns'} · right side = still in stock</p>
      {!rows.length ? <Empty title="No sales in this period" /> : (
        <ul className="space-y-2.5">
          {rows.map((r, i) => {
            const v = Number(r[measure]);
            const hex = colorDot ? c.colorHex(r.name) : null;
            return (
              <li key={r.name}>
                <Tip text={`${r.name}\n${num(r.qty)} pcs sold · ${tk(r.revenue)}\n${num(r.stock)} in stock`}>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="flex w-24 shrink-0 items-center gap-1.5 truncate font-medium">
                      {hex && <span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: hex }} />}{r.name}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded-r bg-slate-100 dark:bg-slate-800">
                      <div className={cls('h-full rounded-r transition-all duration-500', BAR)} style={{ width: `${Math.max((v / max) * 100, 1.5)}%` }} />
                    </div>
                    <span className="w-28 shrink-0 text-right tabular-nums">
                      <b>{measure === 'qty' ? num(v) : tk(v)}</b> <span className="text-[11px] text-slate-400">{Math.round((v / total) * 100)}%</span>
                    </span>
                    <span className={cls('w-16 shrink-0 text-right text-xs tabular-nums', r.stock <= 0 ? 'font-semibold text-rose-600' : 'text-slate-500')}>{r.stock <= 0 ? 'none left' : `${num(r.stock)} left`}</span>
                  </div>
                </Tip>
                {i === 0 && <span className="sr-only">Best seller</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- dead stock
function DeadStock() {
  const c = useCatalog();
  const [q, setQ] = useState('');
  const [f, set, reset] = useFilters({ days: '', category_id: '' });
  const dq = useDebounced(q);
  const { data, loading } = useApi('/insights/dead-stock', { days: f.days || 60, category_id: f.category_id || undefined });
  const rows = useMemo(() => {
    const s = dq.trim().toLowerCase();
    return (data?.data || []).filter((r) => !s || `${r.name} ${r.sku} ${r.size || ''} ${r.color || ''}`.toLowerCase().includes(s));
  }, [data, dq]);
  return (
    <>
      <FilterBar search={{ value: q, onChange: setQ, placeholder: 'Find a product…' }}
        values={f} onChange={set} onClear={reset}
        fields={[
          { key: 'category_id', label: 'Category', type: 'select', options: c.main.map((x) => [x.id, x.name]), placeholder: 'All categories' },
          { key: 'days', label: 'Not sold for', type: 'segment', allLabel: '60 days', options: [['30', '30 days'], ['90', '90 days'], ['180', '6 months'], ['365', '1 year']] },
        ]}
        summary={data && <><Sum label="Products" value={num(data.total.items)} /><Sum label="Pieces" value={num(data.total.qty)} /><Sum label="Money stuck (cost)" value={tk(data.total.value)} tone="rose" /></>} />
      {data?.total.items > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
          <PackageSearch className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1"><b>{tk(data.total.value)}</b> is sitting on the shelf in {num(data.total.items)} product(s) that have not sold for {f.days || 60}+ days. An offer can turn it back into cash.</p>
          <Link to="/offers" className="btn-secondary btn-sm"><BadgePercent className="h-4 w-4" /> Create an offer</Link>
        </div>
      )}
      {loading && !data ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Product</th><th>Category</th><th className="text-right">In stock</th><th className="text-right">Cost value</th><th>Last sold</th><th className="text-right">Idle</th><th className="text-right">Sold ever</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.variant_id}>
              <td className="font-medium">{r.name}<div className="text-xs text-slate-500">{[r.size, r.color, r.sku].filter(Boolean).join(' · ')}</div></td>
              <td>{r.category || '—'}</td>
              <td className="text-right">{num(r.stock_qty)}</td>
              <td className="text-right font-semibold">{tk(r.stock_value)}</td>
              <td className="text-slate-500">{r.last_sold ? fmtDate(r.last_sold) : 'Never'}</td>
              <td className="text-right"><Badge tone={r.idle_days >= 180 ? 'rose' : r.idle_days >= 90 ? 'amber' : 'slate'}>{num(r.idle_days)} days</Badge></td>
              <td className="text-right text-slate-500">{num(r.sold_total)}</td>
            </tr>
          ))}</tbody>
        </table>{!rows.length && <Empty icon={PackageSearch} title="No dead stock 🎉" hint="Everything in stock has sold recently." />}</div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- busy times
function BusyTimes() {
  const [from, setFrom] = useState(addDays(-89));
  const [to, setTo] = useState(todayStr());
  const [f, set, reset] = useFilters({ measure: '' });
  const { data, loading } = useApi('/insights/heatmap', { from: from || '2000-01-01', to: to || todayStr() });
  const key = f.measure === 'invoices' ? 'invoices' : 'sales';
  const cells = data?.cells || [];
  const hours = cells.length ? (() => { const hs = cells.map((x) => x.hour); return Array.from({ length: Math.max(...hs) - Math.min(...hs) + 1 }, (_, i) => Math.min(...hs) + i); })() : [];
  const max = Math.max(...cells.map((x) => Number(x[key])), 1);
  const at = (d, h) => cells.find((x) => x.dow === d && x.hour === h);
  const level = (v) => (v <= 0 ? 0 : Math.min(HEAT.length - 1, 1 + Math.floor((v / max) * (HEAT.length - 1))));
  const byDay = WEEK_ORDER.map((d) => data?.by_day.find((x) => x.dow === d) || { dow: d, sales: 0, invoices: 0, days: 0 });
  const dayAvg = (x) => (x.days ? Number(x[key]) / Number(x.days) : 0);
  const dayMax = Math.max(...byDay.map(dayAvg), 1);
  const busiest = cells.length ? cells.reduce((a, b) => (Number(b[key]) > Number(a[key]) ? b : a)) : null;
  const hourLabel = (h) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;

  return (
    <>
      <FilterBar date={{ from, to, onChange: (a, b) => { setFrom(a); setTo(b); } }} defaultDate={[addDays(-89), todayStr()]}
        values={f} onChange={set} onClear={reset}
        fields={[{ key: 'measure', label: 'Colour shows', type: 'segment', allLabel: 'Sales (৳)', options: [['invoices', 'Number of bills']] }]}
        summary={busiest && <Sum label="Busiest hour" value={`${DAYS[busiest.dow]} ${hourLabel(busiest.hour)}–${hourLabel((busiest.hour + 1) % 24)}`} />} />
      {loading && !data ? <div className="flex justify-center py-16"><Spinner /></div> : !cells.length ? <div className="card"><Empty icon={Clock3} title="No sales in this period" /></div> : (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="card overflow-x-auto p-4">
            <p className="mb-3 font-bold">Day × hour</p>
            <table className="border-separate" style={{ borderSpacing: 2 }}>
              <thead><tr><th />{hours.map((h) => <th key={h} className="px-0.5 text-center text-[10px] font-medium text-slate-500">{hourLabel(h)}</th>)}</tr></thead>
              <tbody>{WEEK_ORDER.map((d) => (
                <tr key={d}>
                  <td className="pr-2 text-xs font-semibold text-slate-500">{DAYS[d]}</td>
                  {hours.map((h) => {
                    const cell = at(d, h);
                    const v = Number(cell?.[key] || 0);
                    return (
                      <td key={h} className="p-0">
                        <Tip text={`${DAYS[d]} ${hourLabel(h)}\n${cell ? `${num(cell.invoices)} bills · ${tk(cell.sales)}` : 'No sales'}`}>
                          <div className={cls('h-8 w-9 rounded-[4px]', HEAT[level(v)])} />
                        </Tip>
                      </td>
                    );
                  })}
                </tr>
              ))}</tbody>
            </table>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
              <span>Less</span>{HEAT.map((h) => <span key={h} className={cls('h-3 w-5 rounded-sm', h)} />)}<span>More</span>
            </div>
          </div>
          <div className="card p-4">
            <p className="mb-1 font-bold">Average per day</p>
            <p className="mb-3 text-xs text-slate-500">{key === 'sales' ? 'Sales' : 'Bills'} on a typical day of the week</p>
            <ul className="space-y-2">{byDay.map((x) => (
              <li key={x.dow}>
                <Tip text={`${DAYS[x.dow]} · ${num(x.days)} day(s) in range\nAvg ${key === 'sales' ? tk(dayAvg(x)) : `${dayAvg(x).toFixed(1)} bills`}`}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-9 shrink-0 font-medium">{DAYS[x.dow]}</span>
                    <div className="h-4 flex-1 rounded-r bg-slate-100 dark:bg-slate-800"><div className={cls('h-full rounded-r', BAR)} style={{ width: `${Math.max((dayAvg(x) / dayMax) * 100, 1)}%` }} /></div>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums">{key === 'sales' ? tk(Math.round(dayAvg(x))) : dayAvg(x).toFixed(1)}</span>
                  </div>
                </Tip>
              </li>
            ))}</ul>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- compare periods
const shiftYear = (d, n) => (d ? `${Number(d.slice(0, 4)) + n}${d.slice(4)}` : d);
function Compare() {
  const [a, setA] = useState({ from: monthStart(), to: todayStr() });
  const [b, setB] = useState({ from: shiftYear(monthStart(), -1), to: shiftYear(todayStr(), -1) });
  const { data, loading } = useApi('/insights/compare', { a_from: a.from, a_to: a.to, b_from: b.from, b_to: b.to });
  const presets = [
    ['Same dates last year', () => setB({ from: shiftYear(a.from, -1), to: shiftYear(a.to, -1) })],
    ['Previous period', () => {
      const len = Math.round((new Date(a.to) - new Date(a.from)) / 86400000);
      setB({ from: addDays(-(len + 1), a.from), to: addDays(-1, a.from) });
    }],
  ];
  const kpis = data && [
    ['Net sales', 'net_sales', tk], ['Bills', 'invoices', num], ['Average bill', 'avg_bill', tk], ['Gross profit', 'gross_profit', tk], ['Pieces sold', 'items', num],
  ];
  const len = data ? Math.max(...[...data.a.daily, ...data.b.daily].map((d) => Number(d.day_no)), 0) + 1 : 0;
  const maxDay = data ? Math.max(...[...data.a.daily, ...data.b.daily].map((d) => Number(d.sales)), 1) : 1;
  const dayVal = (p, i) => Number(p.daily.find((d) => Number(d.day_no) === i)?.sales || 0);

  return (
    <>
      <div className="card mb-4 grid gap-4 p-4 lg:grid-cols-2">
        <PeriodPicker label="Period A" sw={BAR} value={a} onChange={setA} />
        <div>
          <PeriodPicker label="Period B (compare with)" sw={BAR_B} value={b} onChange={setB} />
          <div className="mt-2 flex flex-wrap gap-1.5">{presets.map(([l, fn]) => <button type="button" key={l} className="chip" onClick={fn}>{l}</button>)}</div>
        </div>
      </div>
      {loading && !data ? <div className="flex justify-center py-16"><Spinner /></div> : data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {kpis.map(([l, k, fmt]) => {
              const ch = data.change[k];
              return (
                <div key={k} className="card p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l}</p>
                  <p className="mt-0.5 text-xl font-bold">{fmt(data.a[k])}</p>
                  <p className="text-xs text-slate-500">vs {fmt(data.b[k])}</p>
                  {ch !== null && <p className={cls('mt-1 inline-flex items-center gap-0.5 text-xs font-semibold', ch >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{ch >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{ch >= 0 ? '+' : ''}{ch}%</p>}
                </div>
              );
            })}
          </div>
          <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
            <div className="card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">Day by day</p>
                <div className="flex gap-3 text-xs text-slate-600 dark:text-slate-300">
                  <span className="flex items-center gap-1.5"><span className={cls('h-2.5 w-2.5 rounded-sm', BAR)} />A · {fmtDate(a.from)} – {fmtDate(a.to)}</span>
                  <span className="flex items-center gap-1.5"><span className={cls('h-2.5 w-2.5 rounded-sm', BAR_B)} />B · {fmtDate(b.from)} – {fmtDate(b.to)}</span>
                </div>
              </div>
              {!len ? <Empty title="No sales in either period" /> : (
                <div className="overflow-x-auto">
                  <div className="flex h-48 items-end gap-1 border-b border-slate-200 dark:border-slate-700" style={{ minWidth: len * 18 }}>
                    {Array.from({ length: len }, (_, i) => (
                      <Tip key={i} className="flex h-full flex-1 items-end justify-center gap-[2px]" text={`Day ${i + 1}\nA ${tk(dayVal(data.a, i))}\nB ${tk(dayVal(data.b, i))}`}>
                        <div className={cls('w-1/2 max-w-[10px] rounded-t', BAR)} style={{ height: `${(dayVal(data.a, i) / maxDay) * 100}%` }} />
                        <div className={cls('w-1/2 max-w-[10px] rounded-t', BAR_B)} style={{ height: `${(dayVal(data.b, i) / maxDay) * 100}%` }} />
                      </Tip>
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>Day 1</span><span>Day {len}</span></div>
                </div>
              )}
            </div>
            <div className="card p-4">
              <p className="mb-3 font-bold">Top categories</p>
              {[['A', data.a, BAR], ['B', data.b, BAR_B]].map(([l, p, sw]) => (
                <div key={l} className="mb-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><span className={cls('h-2.5 w-2.5 rounded-sm', sw)} />Period {l}</p>
                  {!p.categories.length ? <p className="text-xs text-slate-400">No sales</p> : (
                    <ul className="space-y-1 text-sm">{p.categories.slice(0, 5).map((c2) => <li key={c2.category} className="flex justify-between"><span className="truncate">{c2.category}</span><b className="tabular-nums">{tk(c2.sales)}</b></li>)}</ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function PeriodPicker({ label, sw, value, onChange }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><span className={cls('h-2.5 w-2.5 rounded-sm', sw)} />{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <input type="date" className="input-sm w-auto" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
        <span className="text-slate-400">→</span>
        <input type="date" className="input-sm w-auto" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        {DATE_PRESETS.filter(([l]) => ['This month', 'Last month', '30 days', 'This year'].includes(l)).map(([l, fn]) => (
          <button type="button" key={l} className="chip py-0.5" onClick={() => { const [x, y] = fn(); onChange({ from: x, to: y }); }}>{l}</button>
        ))}
      </div>
    </div>
  );
}
