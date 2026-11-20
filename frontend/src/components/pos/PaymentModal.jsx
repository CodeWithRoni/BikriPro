import { useEffect, useRef, useState } from 'react';
import { X, Plus, Trash2, Printer, CheckCircle2, CalendarClock, MessageSquareText, Gift, AlertTriangle } from 'lucide-react';
import { Kbd, methodStyle } from './parts';
import { Spinner } from '../ui';
import { tk, num, addDays, todayStr, cls } from '../../utils/format';

const n = (v) => Number(v) || 0;
const DUE_PRESETS = [['3 days', 3], ['7 days', 7], ['15 days', 15], ['1 month', 30]];

/** Quick cash buttons: exact amount, then the next round notes above it. */
function quickNotes(amount) {
  const a = Math.max(n(amount), 0);
  const ups = [100, 500, 1000, 5000].map((s) => Math.ceil(a / s) * s).filter((x) => x > a);
  const fixed = [500, 1000, 2000, 5000].filter((x) => x > a);
  return [...new Set([...ups, ...fixed])].sort((x, y) => x - y).slice(0, 5);
}

/**
 * Take payment: one or more methods (cash, bKash, card…), quick cash notes, change,
 * credit (due) with next payment date, SMS receipt.
 */
export default function PaymentModal({
  open, mode, onClose, t, cart, accList, payments, setPayments, dueDate, setDueDate, busy, onComplete, sendSms, setSendSms, settings,
}) {
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const cashAcc = accList.find((a) => a.type === 'cash') || accList[0];

  // Opening: credit sale starts with nothing paid; normal pay starts with the whole amount in cash
  useEffect(() => {
    if (!open) return;
    if (mode === 'credit') { setPayments([]); setActive(-1); if (!dueDate) setDueDate(addDays(7)); }
    else {
      if (cashAcc) setPayments([{ account_id: cashAcc.id, amount: t.net ? String(t.net) : '', trx_ref: '' }]);
      setActive(0);
      setTimeout(() => inputRef.current?.select(), 60);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const tendered = payments.reduce((s, p) => s + n(p.amount), 0);
  const others = (i) => payments.reduce((s, p, j) => s + (j === i ? 0 : n(p.amount)), 0);
  const remainingFor = (i) => Math.max(Math.round((t.net - others(i)) * 100) / 100, 0);
  const cur = payments[active];
  const curAcc = cur && accList.find((a) => a.id === cur.account_id);
  const pick = (acc) => {
    const i = payments.findIndex((p) => p.account_id === acc.id);
    if (i >= 0) { setActive(i); setTimeout(() => inputRef.current?.select(), 30); return; }
    // a single untouched line switches method; otherwise this becomes an extra (split) payment
    if (payments.length === 1 && n(payments[0].amount) === t.net) {
      setPayments([{ account_id: acc.id, amount: String(t.net), trx_ref: '' }]); setActive(0);
    } else {
      const rest = Math.max(Math.round((t.net - tendered) * 100) / 100, 0);
      setPayments([...payments, { account_id: acc.id, amount: rest ? String(rest) : '', trx_ref: '' }]); setActive(payments.length);
    }
    setTimeout(() => inputRef.current?.select(), 30);
  };
  const setLine = (i, k, v) => setPayments(payments.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const remove = (i) => { const next = payments.filter((_, j) => j !== i); setPayments(next); setActive(next.length ? 0 : -1); };
  const needsCustomer = t.due > 0.009 && (!cart.customer || cart.customer.is_walk_in);
  const needsDate = t.due > 0.009 && !dueDate;
  const blocked = busy || needsCustomer || needsDate || !cart.items.length;

  const Row = ({ k, v, tone, strong }) => (
    <div className={cls('flex items-center justify-between gap-3 text-[13px]', strong && 'text-[15px]')}>
      <span className={strong ? 'font-bold text-slate-800 dark:text-slate-100' : 'text-slate-500'}>{k}</span>
      <b className={cls('tabular-nums', tone, strong && 'text-xl')}>{v}</b>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-[3px] animate-[bpPop_150ms_ease-out]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="grid max-h-[94vh] w-full max-w-[56rem] overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900 md:grid-cols-[1fr_20rem]">
        {/* left: methods & amounts */}
        <div className="overflow-y-auto p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{mode === 'credit' ? 'Credit sale' : 'Take payment'}</h2>
              <p className="text-sm text-slate-500">{cart.customer && !cart.customer.is_walk_in ? cart.customer.name : 'Walk-in customer'} · {num(t.qty)} items</p>
            </div>
            <button type="button" aria-label="Close" className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={onClose}><X className="h-4 w-4" /></button>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {accList.map((a) => {
              const { Icon, tone } = methodStyle(a);
              const used = payments.some((p) => p.account_id === a.id);
              const on = cur?.account_id === a.id;
              return (
                <button type="button" key={a.id} onClick={() => pick(a)}
                  className={cls('relative flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition',
                    on ? 'border-ocean-500 ring-[3px] ring-ocean-100 dark:ring-ocean-900/50' : used ? 'border-ocean-200 dark:border-ocean-800' : 'border-slate-200 hover:border-ocean-300 dark:border-slate-700')}>
                  <span className={cls('flex h-9 w-9 items-center justify-center rounded-xl', tone)}><Icon className="h-[18px] w-[18px]" /></span>
                  <span className="line-clamp-1 text-[12.5px] font-bold">{a.name}</span>
                  {used && !on && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-ocean-500" />}
                </button>
              );
            })}
          </div>

          {cur ? (
            <>
              <label className="mt-4 flex h-16 items-center gap-3 rounded-2xl border-2 border-ocean-500 px-4 ring-[5px] ring-ocean-100 dark:ring-ocean-900/40">
                <span className="text-2xl font-bold text-slate-400">৳</span>
                <input ref={inputRef} inputMode="decimal" aria-label="Amount received" className="min-w-0 flex-1 bg-transparent text-3xl font-extrabold tabular-nums tracking-tight outline-none"
                  value={cur.amount} onChange={(e) => setLine(active, 'amount', e.target.value.replace(/[^\d.]/g, ''))} />
                <span className="hidden rounded-full bg-ocean-50 px-2.5 py-1 text-xs font-bold text-ocean-700 dark:bg-ocean-900/40 dark:text-ocean-200 sm:inline">{curAcc?.name} received</span>
              </label>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                <button type="button" className="h-10 rounded-xl border border-ocean-200 bg-ocean-50 text-sm font-bold text-ocean-700 dark:border-ocean-800 dark:bg-ocean-900/30 dark:text-ocean-200" onClick={() => setLine(active, 'amount', String(remainingFor(active)))}>Exact</button>
                {curAcc?.type === 'cash' && quickNotes(remainingFor(active)).map((v) => (
                  <button type="button" key={v} className="h-10 rounded-xl border border-slate-200 text-sm font-bold tabular-nums hover:border-ocean-300 dark:border-slate-700" onClick={() => setLine(active, 'amount', String(v))}>{num(v)}</button>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              Nothing is paid now — the whole {tk(t.net)} goes on the customer's due. Tap a method above if they pay a part now.
            </div>
          )}

          {payments.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
              {payments.map((p, i) => {
                const acc = accList.find((a) => a.id === p.account_id);
                const { Icon, tone } = methodStyle(acc);
                return (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={i} onClick={() => setActive(i)} className={cls('flex cursor-pointer items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 last:border-0 dark:border-slate-800', i === active && 'bg-ocean-50/60 dark:bg-ocean-900/15')}>
                    <span className={cls('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone)}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{acc?.name}</span>
                    {acc && acc.type !== 'cash' && (
                      <input className="input-sm w-32 text-xs" placeholder="TrxID / last 4" value={p.trx_ref} onClick={(e) => e.stopPropagation()} onChange={(e) => setLine(i, 'trx_ref', e.target.value)} />
                    )}
                    <b className="w-24 text-right tabular-nums">{tk(n(p.amount))}</b>
                    <button type="button" aria-label="Remove payment" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30" onClick={(e) => { e.stopPropagation(); remove(i); }}><Trash2 className="h-4 w-4" /></button>
                  </div>
                );
              })}
              {tendered < t.net - 0.009 && (
                <p className="flex items-center justify-center gap-1.5 bg-slate-50 py-2 text-xs font-semibold text-slate-500 dark:bg-slate-800/50">
                  <Plus className="h-3.5 w-3.5" /> Tap another method above to split the remaining {tk(t.net - tendered)}
                </p>
              )}
            </div>
          )}

          {t.due > 0.009 && (
            <div className="mt-4 space-y-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 dark:border-amber-800/70 dark:bg-amber-900/20">
              <p className="flex items-center justify-between font-bold text-amber-800 dark:text-amber-200"><span className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> Due on this bill</span><span className="tabular-nums">{tk(t.due)}</span></p>
              {needsCustomer && <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-600"><AlertTriangle className="h-3.5 w-3.5" /> Choose or add a customer to sell on credit.</p>}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">Next payment</span>
                {DUE_PRESETS.map(([l, d]) => (
                  <button type="button" key={l} className={cls('chip bg-white dark:bg-slate-800', dueDate === addDays(d) && 'chip-active')} onClick={() => setDueDate(addDays(d))}>{l}</button>
                ))}
                <input type="date" min={todayStr()} className="input w-auto py-1 text-xs" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Next payment date" />
              </div>
            </div>
          )}
        </div>

        {/* right: summary & finish */}
        <div className="flex flex-col gap-2.5 border-t border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/40 md:border-l md:border-t-0">
          <Row k="Subtotal" v={tk(t.subtotal)} />
          {t.offerTotal > 0 && <Row k="Offers" v={`− ${tk(t.offerTotal)}`} tone="text-emerald-600" />}
          {t.manualDiscount > 0 && <Row k="Discount" v={`− ${tk(t.manualDiscount)}`} />}
          {t.vat > 0 && <Row k="VAT" v={tk(t.vat)} />}
          {n(cart.roundOff) > 0 && <Row k="Round off" v={`− ${tk(cart.roundOff)}`} />}
          {t.pointValue > 0 && <Row k="Points used" v={`− ${tk(t.pointValue)}`} />}
          {t.credit > 0 && <Row k="Exchange credit" v={`− ${tk(t.credit)}`} tone="text-amber-600" />}
          <div className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
          <Row k="Total payable" v={tk(t.net)} strong />
          <Row k={`Paid${payments.length > 1 ? ` (${payments.length} methods)` : ''}`} v={tk(Math.min(tendered, t.net))} />
          {n(cart.customer?.balance) > 0 && <Row k="Customer's old due" v={tk(cart.customer.balance)} tone="text-rose-600" />}

          {t.due > 0.009 ? (
            <div className="rounded-2xl bg-amber-100/80 p-3.5 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              <p className="text-[11px] font-extrabold uppercase tracking-wider">Due (credit)</p>
              <p className="text-2xl font-extrabold tabular-nums">{tk(t.due)}</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-emerald-50 p-3.5 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300">
              <p className="text-[11px] font-extrabold uppercase tracking-wider">Give back (change)</p>
              <p className="text-2xl font-extrabold tabular-nums">{tk(t.change)}</p>
            </div>
          )}

          {cart.customer && !cart.customer.is_walk_in && (
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-slate-600 dark:text-slate-300">
              <MessageSquareText className="h-4 w-4 text-slate-400" /><span className="flex-1">SMS the receipt</span>
              <input type="checkbox" className="peer sr-only" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
              <span className="relative h-5 w-9 rounded-full bg-slate-300 transition after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:bg-ocean-600 peer-checked:after:translate-x-4 dark:bg-slate-600" />
            </label>
          )}
          {cart.customer && !cart.customer.is_walk_in && settings.loyalty_enabled === '1' && (
            <p className="flex items-center gap-2 text-[13px] font-semibold text-violet-600 dark:text-violet-300"><Gift className="h-4 w-4" /> Loyalty points are added automatically</p>
          )}

          <div className="mt-auto grid gap-2 pt-2">
            <button type="button" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-ocean-600 to-ocean-700 text-[15px] font-extrabold text-white shadow-[0_10px_22px_-10px_rgb(26_124_238/.8)] transition hover:brightness-110 disabled:opacity-50"
              disabled={blocked} onClick={() => onComplete(true)}>
              {busy ? <Spinner className="h-5 w-5 text-white" /> : <Printer className="h-5 w-5" />} Complete &amp; Print <Kbd light>F10</Kbd>
            </button>
            <button type="button" className="btn-secondary h-11" disabled={blocked} onClick={() => onComplete(false)}>
              <CheckCircle2 className="h-4 w-4" /> Complete without printing <Kbd>F9</Kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
