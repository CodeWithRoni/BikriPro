import { useState } from 'react';
import { TrendingUp, Banknote, Boxes, Receipt, PiggyBank, Percent } from 'lucide-react';
import useApi from '../hooks/useApi';
import { PageHeader, DateRange, StatCard, Empty, PageLoader } from '../components/ui';
import { tk, fmtDate, monthStart, todayStr, cls, downloadCsv } from '../utils/format';

export default function Profit() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const { data, loading } = useApi('/reports/profit', { from, to });
  const s = data?.summary;
  const max = Math.max(...(data?.daily || []).map((d) => Math.abs(d.net_profit)), 1);

  return (
    <div>
      <PageHeader icon={TrendingUp} title="Profit" subtitle="Net sales − cost of goods − expenses"
        actions={<button type="button" className="btn-secondary" onClick={() => downloadCsv(`profit-${from}-${to}.csv`, data?.daily)}>Export</button>} />
      <div className="card mb-4 p-3"><DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} /></div>
      {loading && !data ? <PageLoader /> : s && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            <StatCard icon={Banknote} label="Net sales" value={tk(s.net_sales)} />
            <StatCard icon={Boxes} tone="amber" label="Cost of goods" value={tk(s.cogs)} />
            <StatCard icon={TrendingUp} tone="green" label="Gross profit" value={tk(s.gross_profit)} />
            <StatCard icon={Percent} tone="violet" label="Gross margin" value={`${s.margin_percent}%`} />
            <StatCard icon={Receipt} tone="rose" label="Expenses" value={tk(s.expenses)} />
            <StatCard icon={PiggyBank} tone={s.net_profit >= 0 ? 'green' : 'rose'} label="Net profit" value={tk(s.net_profit)} />
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <div className="table-wrap xl:col-span-2">
              <table className="table">
                <thead><tr><th>Day</th><th className="text-right">Net sales</th><th className="text-right">COGS</th><th className="text-right">Gross</th><th className="text-right">Expenses</th><th className="text-right">Net profit</th><th className="w-40" /></tr></thead>
                <tbody>{data.daily.map((d) => (
                  <tr key={d.day}>
                    <td>{fmtDate(d.day)}</td><td className="text-right">{tk(d.net_sales)}</td><td className="text-right text-slate-500">{tk(d.cogs)}</td>
                    <td className="text-right">{tk(d.gross_profit)}</td><td className="text-right text-rose-500">{tk(d.expenses)}</td>
                    <td className={cls('text-right font-bold', d.net_profit < 0 ? 'text-rose-600' : 'text-emerald-600')}>{tk(d.net_profit)}</td>
                    <td><div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className={cls('h-2 rounded-full', d.net_profit < 0 ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width: `${(Math.abs(d.net_profit) / max) * 100}%` }} /></div></td>
                  </tr>
                ))}</tbody>
              </table>
              {!data.daily.length && <Empty title="No activity in this period" />}
            </div>
            <div className="card p-4">
              <p className="mb-3 font-bold">Profit by category</p>
              {data.by_category.length === 0 ? <p className="text-sm text-slate-500">No sales.</p> : (
                <ul className="space-y-2.5 text-sm">{data.by_category.map((c) => (
                  <li key={c.category}><div className="flex justify-between"><span>{c.category}</span><b className="text-emerald-600">{tk(c.profit)}</b></div><div className="text-xs text-slate-500">Sales {tk(c.sales)} · Cost {tk(c.cost)}</div></li>
                ))}</ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
