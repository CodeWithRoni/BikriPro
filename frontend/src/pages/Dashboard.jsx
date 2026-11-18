import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Banknote, ShoppingBag, HandCoins, Wallet, AlertTriangle, PackageX, Gift, Cake,
  BellRing, Phone, CalendarClock, TrendingUp, Boxes,
} from 'lucide-react';
import useApi from '../hooks/useApi';
import { PageHeader, StatCard, PageLoader, Empty } from '../components/ui';
import { tk, num, fmtDate, cls } from '../utils/format';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: d, loading } = useApi('/dashboard');
  if (loading && !d) return <PageLoader />;
  if (!d) return null;

  const max = Math.max(...d.sales_last_7_days.map((x) => x.amount), 1);
  return (
    <div>
      <PageHeader icon={LayoutDashboard} title="Dashboard" subtitle="Today at a glance" />

      {/* Due Collection Reminders — prominent */}
      {d.due_reminders.length > 0 && (
        <div className="mb-5 overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 to-amber-50 dark:border-rose-900/60 dark:from-rose-950/40 dark:to-amber-950/30">
          <div className="flex items-center justify-between gap-2 border-b border-rose-200/70 px-4 py-3 dark:border-rose-900/50">
            <p className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300"><BellRing className="h-5 w-5 animate-pulse" /> Due Collection Reminders <span className="badge bg-rose-600 text-white">{d.due_reminders.length}</span></p>
            <button type="button" className="btn-sm btn bg-rose-600 text-white hover:bg-rose-700" onClick={() => navigate('/collection')}>Open Collection</button>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {d.due_reminders.map((r) => (
              <button type="button" key={r.customer_id} onClick={() => navigate(`/collection?customer=${r.customer_id}`)}
                className="flex items-center justify-between gap-3 rounded-xl bg-white/80 p-3 text-left shadow-sm transition hover:shadow-md dark:bg-slate-900/70">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="flex items-center gap-1 text-xs text-slate-500"><Phone className="h-3 w-3" />{r.phone || '—'} · {r.invoices} invoice(s)</p>
                  <p className={cls('text-xs font-semibold', r.days_overdue > 0 ? 'text-rose-600' : 'text-amber-600')}>
                    <CalendarClock className="mr-1 inline h-3 w-3" />{r.days_overdue > 0 ? `${r.days_overdue} day(s) overdue` : 'Due today'} ({fmtDate(r.next_payment_date)})
                  </p>
                </div>
                <p className="shrink-0 text-lg font-extrabold text-rose-600">{tk(r.due_amount)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Banknote} label="Today's sales" value={tk(d.today.amount)} sub={`${d.today.invoices} invoices`} />
        <StatCard icon={TrendingUp} tone="green" label="Today's gross profit" value={tk(d.today.gross_profit)} />
        <StatCard icon={HandCoins} tone="violet" label="Today's collection" value={tk(d.today.collections)} sub={`Expenses ${tk(d.today.expenses)}`} />
        <StatCard icon={ShoppingBag} tone="ocean" label="This month" value={tk(d.month.amount)} sub={`${d.month.invoices} invoices`} />
        <StatCard icon={Wallet} tone="rose" label="Receivable (customers)" value={tk(d.receivable.amount)} sub={`${d.receivable.customers || 0} customers owe`} />
        <StatCard icon={Wallet} tone="amber" label="Payable (suppliers)" value={tk(d.payable)} />
        <StatCard icon={Boxes} label="Stock value" value={tk(d.stock.value)} sub={`${num(d.stock.qty)} pcs · ${d.stock.skus} SKUs`} />
        <StatCard icon={Gift} tone="violet" label="Loyalty points" value={num(d.loyalty.outstanding_points)} sub={`${d.loyalty.members || 0} members`} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {/* 7-day chart */}
        <div className="card p-4 xl:col-span-2">
          <p className="mb-4 font-bold">Sales — last 7 days</p>
          {d.sales_last_7_days.length === 0 ? <Empty title="No sales yet" /> : (
            <div className="flex h-48 items-end gap-3">
              {d.sales_last_7_days.map((x) => (
                <div key={x.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-500">{num(x.amount)}</span>
                  <div className="w-full max-w-16 rounded-t-lg bg-gradient-to-t from-ocean-600 to-ocean-400 transition-all duration-500" style={{ height: `${Math.max((x.amount / max) * 100, 3)}%` }} />
                  <span className="text-[11px] text-slate-500">{fmtDate(x.day).slice(0, 6)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming dues */}
        <div className="card p-4">
          <p className="mb-3 flex items-center gap-2 font-bold"><CalendarClock className="h-4 w-4 text-amber-500" /> Upcoming dues (7 days)</p>
          {d.upcoming_dues.length === 0 ? <p className="text-sm text-slate-500">Nothing scheduled.</p> : (
            <ul className="space-y-2 text-sm">
              {d.upcoming_dues.map((u) => (
                <li key={u.customer_id} className="flex justify-between gap-2"><span className="truncate">{u.name} <span className="text-xs text-slate-500">· {fmtDate(u.next_payment_date)}</span></span><b>{tk(u.due_amount)}</b></li>
              ))}
            </ul>
          )}
          {d.birthdays.length > 0 && (
            <div className="mt-4 rounded-xl bg-pink-50 p-3 text-sm dark:bg-pink-900/20">
              <p className="mb-1 flex items-center gap-1 font-semibold text-pink-700 dark:text-pink-300"><Cake className="h-4 w-4" /> Birthdays today</p>
              {d.birthdays.map((b) => <p key={b.id}>{b.name} · {b.phone}</p>)}
            </div>
          )}
        </div>

        <div className="card p-4">
          <p className="mb-3 font-bold">Best sellers (30 days)</p>
          {d.best_sellers.length === 0 ? <p className="text-sm text-slate-500">No sales yet.</p> : (
            <ul className="space-y-2 text-sm">{d.best_sellers.map((b, i) => (
              <li key={`${b.product_name}${b.variant_label}`} className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-ocean-50 text-xs font-bold text-ocean-700 dark:bg-ocean-900/40 dark:text-ocean-300">{i + 1}</span><span className="flex-1 truncate">{b.product_name} <span className="text-xs text-slate-500">{b.variant_label}</span></span><b>{num(b.qty)}</b></li>
            ))}</ul>
          )}
        </div>

        <div className="card p-4">
          <p className="mb-3 flex items-center gap-2 font-bold"><PackageX className="h-4 w-4 text-rose-500" /> Low stock <span className="badge bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{d.stock.low_stock || 0}</span></p>
          {d.low_stock.length === 0 ? <p className="text-sm text-slate-500">Stock levels are healthy.</p> : (
            <ul className="space-y-2 text-sm">{d.low_stock.map((l) => (
              <li key={l.sku} className="flex justify-between gap-2"><span className="truncate">{l.name} <span className="text-xs text-slate-500">{[l.size, l.color].filter(Boolean).join(' / ')}</span></span><b className={l.stock_qty <= 0 ? 'text-rose-600' : 'text-amber-600'}>{num(l.stock_qty)}</b></li>
            ))}</ul>
          )}
        </div>

        <div className="card p-4">
          <p className="mb-3 flex items-center gap-2 font-bold"><Gift className="h-4 w-4 text-violet-500" /> Top loyalty customers</p>
          {d.loyalty.top.length === 0 ? <p className="text-sm text-slate-500">No points earned yet.</p> : (
            <ul className="space-y-2 text-sm">{d.loyalty.top.map((c) => (
              <li key={c.id} className="flex justify-between gap-2"><span className="truncate">{c.name} <span className="text-xs text-slate-500">· spent {tk(c.total_purchase)}</span></span><b className="text-violet-600">{num(c.loyalty_points)} pts</b></li>
            ))}</ul>
          )}
        </div>
      </div>
      {d.stock.low_stock > 0 && <p className="mt-4 flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> Restock low items from the Purchase menu.</p>}
    </div>
  );
}
