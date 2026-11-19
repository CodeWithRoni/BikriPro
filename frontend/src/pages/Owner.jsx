import { useNavigate } from 'react-router-dom';
import { Crown, MessageSquareText, AlertOctagon, AlertTriangle, Info, Sparkles, TrendingUp, TrendingDown, Banknote, Smartphone, Building2, CreditCard, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PageHeader, Spinner, Empty } from '../components/ui';
import { tk, num, cls } from '../utils/format';

const pct = (a, b) => (Number(b) ? Math.round(((Number(a) - Number(b)) / Number(b)) * 100) : null);

function Trend({ now, before, label }) {
  const p = pct(now, before);
  if (p === null) return <span className="text-xs text-slate-400">{label}: —</span>;
  const up = p >= 0;
  const I = up ? TrendingUp : TrendingDown;
  return <span className={cls('inline-flex items-center gap-1 text-xs font-semibold', up ? 'text-emerald-600' : 'text-rose-600')}><I className="h-3.5 w-3.5" />{up ? '+' : ''}{p}% {label}</span>;
}

function Tile({ label, value, children, tone }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cls('mt-0.5 text-2xl font-bold', tone === 'green' && 'text-emerald-600', tone === 'rose' && 'text-rose-600')}>{value}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default function Owner() {
  const navigate = useNavigate();
  const { data: d, loading } = useApi('/owner/summary');
  const notes = useApi('/notifications');
  const settings = useApi('/settings');
  const sendNow = async () => {
    try {
      const { data } = await api.post('/owner/summary-sms');
      if (data.skipped) toast.error('Add the owner mobile number in Shop Setup → Owner alerts first');
      else toast.success(data.status === 'sent' ? 'Summary SMS sent' : `SMS ${data.status}`);
    } catch (e) { toast.error(e.message); }
  };
  if (loading && !d) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!d) return null;
  const t = d.today;
  const y = d.yesterday;
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, v: Number(d.hourly.find((x) => Number(x.hour) === h)?.sales || 0) })).filter((x) => x.h >= 8 && x.h <= 23);
  const peak = Math.max(...hours.map((x) => x.v), 1);
  const best = hours.reduce((a, b) => (b.v > a.v ? b : a), hours[0]);
  const s = settings.data || {};
  const cashIcons = { cash: Banknote, mfs: Smartphone, bank: Building2, card: CreditCard };
  return (
    <div>
      <PageHeader icon={Crown} title="Owner Dashboard" subtitle="Your shop at a glance — all branches together"
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => navigate('/settings?tab=owner')}><Settings className="h-4 w-4" /> Alert settings</button>
          <button type="button" className="btn-primary" onClick={sendNow}><MessageSquareText className="h-4 w-4" /> SMS me yesterday's summary</button>
        </>} />
      {!s.owner_phone && (
        <button type="button" onClick={() => navigate('/settings?tab=owner')} className="mb-4 w-full rounded-xl border border-amber-300 bg-amber-50 p-3 text-left text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          Add your mobile number in <b>Shop Setup → Owner alerts</b> to get the daily summary and big-sale SMS on your phone.
        </button>
      )}

      <p className="mb-2 text-sm font-bold text-slate-600 dark:text-slate-300">Today</p>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Sales" value={tk(t.sales)}><Trend now={t.sales} before={y.sales} label="vs yesterday" /><span className="block text-xs text-slate-500">{num(t.bills)} bills</span></Tile>
        <Tile label="Gross profit" value={tk(t.gross)} tone="green"><Trend now={t.gross} before={y.gross} label="vs yesterday" /></Tile>
        <Tile label="Collected dues" value={tk(t.collected)}><span className="text-xs text-slate-500">New due today {tk(t.due)}</span></Tile>
        <Tile label="Expenses & returns" value={tk(t.expenses)}><span className="text-xs text-slate-500">Returns {tk(t.returns)}{t.cash_variance ? <> · cash {t.cash_variance < 0 ? 'short' : 'over'} <b className={t.cash_variance < 0 ? 'text-rose-600' : 'text-emerald-600'}>{tk(Math.abs(t.cash_variance))}</b></> : null}</span></Tile>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="font-bold">Sales by hour today</p>
            {best?.v > 0 && <p className="text-xs text-slate-500">Busiest {best.h % 12 || 12}{best.h < 12 ? 'am' : 'pm'} · {tk(best.v)}</p>}
          </div>
          {t.sales ? (
            <div className="flex h-40 items-end gap-[2px]" role="img" aria-label="Sales by hour today">
              {hours.map((x) => (
                <div key={x.h} className="group relative flex h-full flex-1 flex-col justify-end">
                  <div className="rounded-t-[4px] bg-[#1d74e6] dark:bg-[#4594f5]" style={{ height: `${(x.v / peak) * 100}%`, minHeight: x.v ? 3 : 0 }} />
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">{x.h % 12 || 12}{x.h < 12 ? 'am' : 'pm'} · {tk(x.v)}</span>
                  <span className="mt-1 text-center text-[10px] text-slate-400">{x.h % 3 === 0 ? `${x.h % 12 || 12}${x.h < 12 ? 'a' : 'p'}` : ''}</span>
                </div>
              ))}
            </div>
          ) : <Empty title="No sales yet today" />}
        </div>
        <div className="card p-4">
          <p className="mb-2 font-bold">Best sellers today</p>
          {d.top.length ? d.top.map((p, i) => (
            <div key={p.product_name} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800">
              <span className="min-w-0 truncate"><span className="mr-2 text-slate-400">{i + 1}</span>{p.product_name}</span>
              <span className="shrink-0 text-right"><b>{tk(p.sales)}</b><span className="block text-xs text-slate-500">{num(p.qty)} pcs</span></span>
            </div>
          )) : <p className="py-6 text-center text-sm text-slate-400">Nothing sold yet</p>}
        </div>
      </div>

      <p className="mb-2 text-sm font-bold text-slate-600 dark:text-slate-300">This month</p>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Sales" value={tk(d.month.sales)}><Trend now={d.month.sales} before={d.month.last_month_same_days} label="vs same days last month" /><span className="block text-xs text-slate-500">{num(d.month.bills)} bills</span></Tile>
        <Tile label="Gross profit" value={tk(d.month.gross)} tone="green" />
        <Tile label="Expenses" value={tk(d.month.expenses)} />
        <Tile label="Net profit" value={tk(d.month.net)} tone={d.month.net >= 0 ? 'green' : 'rose'}><button type="button" className="text-xs font-semibold text-ocean-600 hover:underline" onClick={() => navigate('/accounting?tab=pnl')}>Full statement →</button></Tile>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <p className="mb-2 font-bold">Money in hand now</p>
          {Object.entries(d.cash).map(([k, v]) => {
            const I = cashIcons[k] || Banknote;
            return <div key={k} className="flex items-center justify-between py-1.5 text-sm"><span className="inline-flex items-center gap-2 capitalize"><I className="h-4 w-4 text-slate-400" />{k === 'mfs' ? 'bKash / Nagad' : k}</span><b>{tk(v)}</b></div>;
          })}
          <div className="mt-1 flex justify-between border-t border-slate-100 pt-2 text-sm font-bold dark:border-slate-800"><span>Total</span><span>{tk(Object.values(d.cash).reduce((a, b) => a + Number(b), 0))}</span></div>
        </div>
        <div className="card p-4 lg:col-span-2">
          <p className="mb-2 font-bold">Needs your attention</p>
          {!notes.data?.data.length ? <p className="py-6 text-center text-sm text-slate-400">All caught up 🎉</p> : notes.data.data.map((n, i) => {
            const I = { critical: AlertOctagon, warning: AlertTriangle, good: Sparkles, info: Info }[n.level];
            const tone = { critical: 'text-rose-600', warning: 'text-amber-600', good: 'text-emerald-600', info: 'text-ocean-600' }[n.level];
            return (
              <button type="button" key={`${n.type}-${i}`} onClick={() => n.link && navigate(n.link)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                <I className={cls('mt-0.5 h-4 w-4 shrink-0', tone)} />
                <span><b>{n.title}</b>{n.text && <span className="text-slate-500"> — {n.text}</span>}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
