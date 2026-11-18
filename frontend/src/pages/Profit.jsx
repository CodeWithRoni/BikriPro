import { useMemo, useState } from 'react';
import { TrendingUp, Banknote, Boxes, Receipt, PiggyBank, Percent } from 'lucide-react';
import useApi from '../hooks/useApi';
import { PageHeader, StatCard, Empty, PageLoader } from '../components/ui';
import FilterBar, { useFilters, Sum } from '../components/FilterBar';
import { tk, num, fmtDate, monthStart, todayStr, cls, downloadCsv } from '../utils/format';
import Select from '../components/ui/Select';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Monday of the week for a YYYY-MM-DD date */
const weekStart = (d) => {
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
};
const KEYS = ['net_sales', 'cogs', 'gross_profit', 'expenses', 'stock_loss', 'net_profit'];

export default function Profit() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const { data, loading } = useApi('/reports/profit', { from: from || '2000-01-01', to: to || todayStr() });
  const s = data?.summary;
  const [f, set, reset] = useFilters({ group: '', show: '', cat: '' });
  const [catSort, setCatSort] = useState('profit');

  // Group days into weeks / months and keep only profit or loss periods if asked
  const periods = useMemo(() => {
    const keyOf = (d) => (f.group === 'month' ? d.day.slice(0, 7) : f.group === 'week' ? weekStart(d.day) : d.day);
    const map = new Map();
    for (const d of data?.daily || []) {
      const k = keyOf(d);
      const cur = map.get(k) || { key: k, days: 0, ...Object.fromEntries(KEYS.map((x) => [x, 0])) };
      for (const x of KEYS) cur[x] += d[x];
      cur.days += 1;
      map.set(k, cur);
    }
    let out = [...map.values()];
    if (f.show === 'profit') out = out.filter((p) => p.net_profit > 0);
    if (f.show === 'loss') out = out.filter((p) => p.net_profit < 0);
    return out;
  }, [data, f.group, f.show]);
  const label = (k) => (f.group === 'month' ? `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}` : f.group === 'week' ? `Week of ${fmtDate(k)}` : fmtDate(k));
  const max = Math.max(...periods.map((d) => Math.abs(d.net_profit)), 1);
  const cats = useMemo(() => {
    const qq = f.cat.trim().toLowerCase();
    const r = (data?.by_category || []).filter((c) => !qq || c.category.toLowerCase().includes(qq));
    return [...r].sort(catSort === 'sales' ? (a, b) => b.sales - a.sales : catSort === 'margin' ? (a, b) => (b.profit / (b.sales || 1)) - (a.profit / (a.sales || 1)) : (a, b) => b.profit - a.profit);
  }, [data, f.cat, catSort]);
  const best = periods.length ? periods.reduce((a, b) => (b.net_profit > a.net_profit ? b : a)) : null;

  return (
    <div>
      <PageHeader icon={TrendingUp} title="Profit" subtitle="Net sales − cost of goods − expenses"
        actions={<button type="button" className="btn-secondary" onClick={() => downloadCsv(`profit-${from}-${to}.csv`, periods)}>Export</button>} />
      <FilterBar
        date={{ from, to, onChange: (a, b) => { setFrom(a); setTo(b); } }} defaultDate={[monthStart(), todayStr()]}
        values={f} onChange={set} onClear={reset}
        fields={[
          { key: 'group', label: 'Show by', type: 'segment', allLabel: 'Day', options: [['week', 'Week'], ['month', 'Month']] },
          { key: 'show', label: 'Periods', type: 'segment', allLabel: 'All', options: [['profit', 'Profit only'], ['loss', 'Loss only']] },
          { key: 'cat', label: 'Category search', type: 'text', placeholder: 'e.g. Shirt' },
        ]}
        summary={s && <><Sum label="Periods" value={num(periods.length)} /><Sum label="Net profit" value={tk(s.net_profit)} tone={s.net_profit >= 0 ? 'green' : 'rose'} />{best && <Sum label="Best" value={`${label(best.key)} · ${tk(best.net_profit)}`} />}</>} />
      {loading && !data ? <PageLoader /> : s && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            <StatCard icon={Banknote} label="Net sales" value={tk(s.net_sales)} />
            <StatCard icon={Boxes} tone="amber" label="Cost of goods" value={tk(s.cogs)} />
            <StatCard icon={TrendingUp} tone="green" label="Gross profit" value={tk(s.gross_profit)} />
            <StatCard icon={Percent} tone="violet" label="Gross margin" value={`${s.margin_percent}%`} />
            <StatCard icon={Receipt} tone="rose" label="Expenses" value={tk(s.expenses)} sub={s.stock_loss ? `+ stock loss ${tk(s.stock_loss)}` : undefined} />
            <StatCard icon={PiggyBank} tone={s.net_profit >= 0 ? 'green' : 'rose'} label="Net profit" value={tk(s.net_profit)} />
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <div className="table-wrap xl:col-span-2">
              <table className="table">
                <thead><tr><th>{{ day: 'Day', week: 'Week', month: 'Month' }[f.group || 'day']}</th><th className="text-right">Net sales</th><th className="text-right">COGS</th><th className="text-right">Gross</th><th className="text-right">Expenses</th><th className="text-right">Stock loss</th><th className="text-right">Net profit</th><th className="w-40" /></tr></thead>
                <tbody>{periods.map((d) => (
                  <tr key={d.key}>
                    <td>{label(d.key)}{f.group && f.group !== 'day' && <div className="text-[11px] text-slate-400">{d.days} active day{d.days === 1 ? '' : 's'}</div>}</td><td className="text-right">{tk(d.net_sales)}</td><td className="text-right text-slate-500">{tk(d.cogs)}</td>
                    <td className="text-right">{tk(d.gross_profit)}</td><td className="text-right text-rose-500">{tk(d.expenses)}</td><td className="text-right text-rose-500">{d.stock_loss ? tk(d.stock_loss) : '—'}</td>
                    <td className={cls('text-right font-bold', d.net_profit < 0 ? 'text-rose-600' : 'text-emerald-600')}>{tk(d.net_profit)}</td>
                    <td><div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className={cls('h-2 rounded-full', d.net_profit < 0 ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width: `${(Math.abs(d.net_profit) / max) * 100}%` }} /></div></td>
                  </tr>
                ))}</tbody>
              </table>
              {!periods.length && <Empty title={data.daily.length ? 'No period matches this filter' : 'No activity in this period'} />}
            </div>
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-bold">Profit by category</p>
                <Select className="input-sm w-auto py-1 text-xs" value={catSort} onChange={(e) => setCatSort(e.target.value)} aria-label="Sort categories">
                  <option value="profit">Most profit</option><option value="sales">Most sales</option><option value="margin">Best margin</option>
                </Select>
              </div>
              {cats.length === 0 ? <p className="text-sm text-slate-500">{data.by_category.length ? 'No category matches.' : 'No sales.'}</p> : (
                <ul className="space-y-2.5 text-sm">{cats.map((c) => (
                  <li key={c.category}><div className="flex justify-between"><span>{c.category}</span><b className={c.profit < 0 ? 'text-rose-600' : 'text-emerald-600'}>{tk(c.profit)}</b></div><div className="text-xs text-slate-500">Sales {tk(c.sales)} · Cost {tk(c.cost)} · Margin {c.sales ? ((c.profit / c.sales) * 100).toFixed(1) : 0}%</div></li>
                ))}</ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
