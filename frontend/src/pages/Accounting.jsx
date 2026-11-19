import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { BookOpen, Printer, Download, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import useApi from '../hooks/useApi';
import { PageHeader, Tabs, DateRange, Spinner, Empty, Field } from '../components/ui';
import Select from '../components/ui/Select';
import { ACCOUNT_ICONS } from '../components/Pickers';
import { tk, fmtDate, todayStr, monthStart, cls, downloadCsv } from '../utils/format';

export default function Accounting() {
  const [params, setParams] = useSearchParams();
  const role = useSelector((s) => s.auth.user?.role);
  const tab = params.get('tab') || 'daybook';
  const tabs = [['daybook', 'Day Book'], ['pnl', 'Profit & Loss'], ...(role === 'admin' ? [['bs', 'Balance Sheet']] : [])];
  return (
    <div>
      <PageHeader icon={BookOpen} title="Accounting" subtitle="Every taka in and out, the profit & loss statement and what the business is worth"
        actions={<button type="button" className="btn-secondary no-print" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button>} />
      <div className="no-print"><Tabs tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t })} /></div>
      {tab === 'pnl' ? <ProfitLoss /> : tab === 'bs' && role === 'admin' ? <BalanceSheet /> : <DayBook />}
    </div>
  );
}

// ---------------------------------------------------------------- day book
function DayBook() {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [account, setAccount] = useState('');
  const [type, setType] = useState('');
  const accounts = useApi('/accounts');
  const { data, loading } = useApi('/accounting/daybook', { from, to, account_id: account || undefined, type: type || undefined });
  const csv = () => downloadCsv(`daybook-${from}-${to}.csv`, (data?.days || []).flatMap((d) => d.rows.map((r) => ({
    Date: d.day, Type: r.label, Details: r.note || '', Account: r.account_name, In: r.direction === 'in' ? r.amount : '', Out: r.direction === 'out' ? r.amount : '', Balance: r.balance,
  }))));
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-end gap-3">
        <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
        <Select className="input w-auto min-w-[11rem] py-1.5" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account">
          <option value="">All accounts</option>
          {(accounts.data?.data || []).map((a) => <option key={a.id} value={String(a.id)} data-icon={ACCOUNT_ICONS[a.type]}>{a.name}</option>)}
        </Select>
        <Select className="input w-auto py-1.5" value={type} onChange={(e) => setType(e.target.value)} aria-label="Direction">
          <option value="">Money in & out</option><option value="in">Money in</option><option value="out">Money out</option>
        </Select>
        <button type="button" className="btn-secondary btn-sm ml-auto" onClick={csv} disabled={!data?.days.length}><Download className="h-4 w-4" /> CSV</button>
      </div>
      {loading && !data ? <div className="flex justify-center py-12"><Spinner /></div> : data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Box label="Opening balance" value={data.opening} />
            <Box label="Money in" value={data.in} tone="green" />
            <Box label="Money out" value={data.out} tone="rose" />
            <Box label="Closing balance" value={data.closing} strong />
          </div>
          {!data.days.length ? <div className="card"><Empty icon={BookOpen} title="No money moved in these days" /></div> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Time</th><th>Type</th><th>Details</th><th>Account</th><th className="text-right">In</th><th className="text-right">Out</th><th className="text-right">Balance</th></tr></thead>
              <tbody>{data.days.map((d) => [
                <tr key={d.day} className="bg-slate-50 dark:bg-slate-800/60">
                  <td colSpan={4} className="font-bold">{fmtDate(d.day)}</td>
                  <td className="text-right font-semibold text-emerald-600">{tk(d.in)}</td><td className="text-right font-semibold text-rose-600">{tk(d.out)}</td><td />
                </tr>,
                ...d.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-slate-500">{String(r.created_at || '').slice(11, 16)}</td>
                    <td><span className="inline-flex items-center gap-1.5">{r.direction === 'in' ? <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" /> : <ArrowUpRight className="h-3.5 w-3.5 text-rose-600" />}{r.label}</span></td>
                    <td className="max-w-xs truncate text-slate-600 dark:text-slate-300">{r.note}{r.user_name && <span className="text-xs text-slate-400"> · {r.user_name}</span>}</td>
                    <td>{r.account_name}</td>
                    <td className="text-right text-emerald-600">{r.direction === 'in' ? tk(r.amount) : ''}</td>
                    <td className="text-right text-rose-600">{r.direction === 'out' ? tk(r.amount) : ''}</td>
                    <td className="text-right font-medium">{tk(r.balance)}</td>
                  </tr>
                )),
              ])}</tbody>
            </table></div>
          )}
          {data.truncated && <p className="mt-2 text-xs text-amber-600">Showing the first 3,000 entries — choose fewer days to see everything.</p>}
        </>
      )}
    </>
  );
}

function Box({ label, value, tone, strong }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cls('mt-0.5 text-xl font-bold', tone === 'green' && 'text-emerald-600', tone === 'rose' && 'text-rose-600', strong && 'text-ocean-700 dark:text-ocean-300')}>{tk(value)}</p>
    </div>
  );
}

// ---------------------------------------------------------------- P&L
function Line({ label, value, minus, bold, sub, tone }) {
  return (
    <div className={cls('flex items-center justify-between py-1.5', bold && 'font-bold', sub && 'pl-4 text-slate-600 dark:text-slate-300')}>
      <span>{label}</span>
      <span className={cls(tone === 'green' && 'text-emerald-600', tone === 'rose' && 'text-rose-600')}>{minus && Number(value) ? '− ' : ''}{tk(Math.abs(Number(value)))}</span>
    </div>
  );
}

function ProfitLoss() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const { data: d, loading } = useApi('/accounting/pnl', { from, to });
  const shop = useSelector((s) => s.settings.data) || {};
  return (
    <>
      <div className="no-print mb-4"><DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} /></div>
      {loading && !d ? <div className="flex justify-center py-12"><Spinner /></div> : d && (
        <div className="card mx-auto max-w-2xl p-6 text-sm">
          <div className="mb-4 text-center">
            <p className="text-lg font-bold">{shop.shop_name}</p>
            <p className="font-semibold">Profit & Loss Statement</p>
            <p className="text-slate-500">{fmtDate(d.from)} – {fmtDate(d.to)}</p>
          </div>
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">Income</p>
          <Line label="Sales (before discount)" value={d.income.gross_sales} sub />
          {d.income.discounts > 0 && <Line label="Discounts given" value={d.income.discounts} minus sub />}
          {d.income.waivers > 0 && <Line label="Round-off & points used" value={d.income.waivers} minus sub />}
          {d.income.vat > 0 && <Line label="VAT collected" value={d.income.vat} sub />}
          {d.income.delivery > 0 && <Line label="Delivery charge collected" value={d.income.delivery} sub />}
          {d.income.returns > 0 && <Line label="Sales returns" value={d.income.returns} minus sub />}
          <div className="border-t border-slate-200 dark:border-slate-700"><Line label="Net sales" value={d.income.net_sales} bold /></div>
          <Line label="Cost of goods sold" value={d.cogs} minus />
          <div className="border-t border-slate-200 dark:border-slate-700"><Line label={`Gross profit (${d.margin}%)`} value={d.gross_profit} bold tone={d.gross_profit >= 0 ? 'green' : 'rose'} /></div>
          <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">Expenses</p>
          {d.expenses.length ? d.expenses.map((e) => <Line key={e.category} label={e.category} value={e.amount} sub />) : <p className="py-1.5 pl-4 text-slate-400">No expenses</p>}
          <div className="border-t border-slate-200 dark:border-slate-700"><Line label="Total expenses" value={d.total_expenses} minus bold /></div>
          {(d.other.stock_loss || d.other.stock_gain || d.other.cash_short || d.other.cash_over) ? (
            <>
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">Other</p>
              {d.other.stock_loss !== 0 && <Line label="Damaged / lost / count shortage" value={d.other.stock_loss} minus sub />}
              {d.other.stock_gain !== 0 && <Line label="Stock found" value={d.other.stock_gain} sub />}
              {d.other.cash_short !== 0 && <Line label="Cash short at day closing" value={d.other.cash_short} minus sub />}
              {d.other.cash_over !== 0 && <Line label="Cash over at day closing" value={d.other.cash_over} sub />}
            </>
          ) : null}
          <div className={cls('mt-3 flex items-center justify-between rounded-xl px-4 py-3 text-base font-bold', d.net_profit >= 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300')}>
            <span>{d.net_profit >= 0 ? 'Net profit' : 'Net loss'}</span><span>{tk(Math.abs(d.net_profit))}</span>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- balance sheet
function BalanceSheet() {
  const [date, setDate] = useState(todayStr());
  const { data: d, loading } = useApi('/accounting/balance-sheet', { date });
  const shop = useSelector((s) => s.settings.data) || {};
  const group = (rows) => rows.reduce((g, r) => { (g[r.group] ||= []).push(r); return g; }, {});
  return (
    <>
      <div className="no-print mb-4 flex items-end gap-3"><Field label="As on"><input type="date" className="input w-auto" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} /></Field></div>
      {loading && !d ? <div className="flex justify-center py-12"><Spinner /></div> : d && (
        <div className="card mx-auto max-w-4xl p-6 text-sm">
          <div className="mb-5 text-center">
            <p className="text-lg font-bold">{shop.shop_name}</p>
            <p className="font-semibold">Balance Sheet</p>
            <p className="text-slate-500">As on {fmtDate(d.date)}</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">What the business owns</p>
              {Object.entries(group(d.assets)).map(([g, rows]) => (
                <div key={g} className="mb-2">
                  <p className="font-semibold">{g}</p>
                  {rows.map((r) => <Line key={r.name} label={r.name} value={r.amount} sub />)}
                </div>
              ))}
              <div className="border-t-2 border-slate-300 dark:border-slate-600"><Line label="Total assets" value={d.total_assets} bold /></div>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">What the business owes</p>
              {d.liabilities.length ? Object.entries(group(d.liabilities)).map(([g, rows]) => (
                <div key={g} className="mb-2">
                  <p className="font-semibold">{g}</p>
                  {rows.map((r) => <Line key={r.name} label={r.name} value={r.amount} sub />)}
                </div>
              )) : <p className="py-1.5 text-slate-400">Nothing owed</p>}
              <div className="border-t-2 border-slate-300 dark:border-slate-600"><Line label="Total liabilities" value={d.total_liabilities} bold /></div>
              <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">Owner's money</p>
              <Line label="Opening capital (account balances)" value={d.owner.opening_capital} sub />
              <Line label="Owner deposits" value={d.owner.deposits} sub />
              <Line label="Owner withdrawals" value={d.owner.withdrawals} minus sub />
            </div>
          </div>
          <div className={cls('mt-5 flex items-center justify-between rounded-xl px-4 py-3 text-base font-bold', d.net_worth >= 0 ? 'bg-ocean-50 text-ocean-800 dark:bg-ocean-900/20 dark:text-ocean-200' : 'bg-rose-50 text-rose-700')}>
            <span>Net worth of the business (assets − liabilities)</span><span>{tk(d.net_worth)}</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">{d.note} Stock is valued at purchase price.</p>
        </div>
      )}
    </>
  );
}
