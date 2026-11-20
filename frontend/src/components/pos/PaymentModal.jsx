import { useEffect, useRef, useState } from 'react';
import { X, Plus, Trash2, Printer, Check, CalendarDays, MessageCircle, Coins, AlertTriangle } from 'lucide-react';
import { Kbd, methodStyle } from './parts';
import { Spinner } from '../ui';
import { tk, num, addDays, todayStr, cls } from '../../utils/format';

const n = (v) => Number(v) || 0;
const DUE_PRESETS = [['3 days', 3], ['7 days', 7], ['15 days', 15], ['1 month', 30]];

/** Quick cash buttons: the next round notes above the amount. */
function quickNotes(amount) {
  const a = Math.max(n(amount), 0);
  const ups = [100, 500, 1000, 5000, 10000].map((s) => Math.ceil(a / s) * s).filter((x) => x > a);
  const fixed = [500, 1000, 5000, 10000, 15000, 20000].filter((x) => x > a);
  return [...new Set([...ups, ...fixed])].sort((x, y) => x - y).slice(0, 5);
}
const subLabel = (a) => ({ cash: 'Drawer', mfs: 'Merchant', card: 'POS machine', bank: a.provider || 'Bank' }[a.type] || '');
const shortName = (a) => (a?.type === 'cash' ? 'Cash' : a?.type === 'card' ? 'Card' : a?.name || '');
const fmtAmount = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const [i, d] = String(v).split('.');
  return Number(i || 0).toLocaleString('en-IN') + (d !== undefined ? `.${d}` : '');
};

function Toggle({ on, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange?.(!on)}
      className={cls('relative h-5 w-[34px] shrink-0 rounded-full transition', on ? 'bg-ocean-600' : 'bg-slate-300 dark:bg-slate-600', disabled && 'cursor-default')}>
      <span className={cls('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', on ? 'left-4' : 'left-0.5')} />
    </button>
  );
}

/**
 * Take payment: methods (cash, bKash, card…), big amount box, quick cash notes, split list,
 * note & next payment date, summary with change / due, SMS · points · print toggles.
 */
const TYPE_ORDER = { cash: 0, mfs: 1, card: 2, bank: 3 };

export default function PaymentModal({
  open, mode, onClose, t, cart, accList: accounts, payments, setPayments, dueDate, setDueDate, busy, onComplete,
  sendSms, setSendSms, print, setPrint, onNote, settings,
}) {
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const accList = [...accounts].sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || a.id - b.id);
  const cashAcc = accList.find((a) => a.type === 'cash') || accList[0];

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
  const focusAmount = () => setTimeout(() => inputRef.current?.select(), 30);
  const pick = (acc) => {
    const i = payments.findIndex((p) => p.account_id === acc.id);
    if (i >= 0) { setActive(i); focusAmount(); return; }
    if (payments.length === 1 && n(payments[0].amount) === t.net) {
      setPayments([{ account_id: acc.id, amount: String(t.net), trx_ref: '' }]); setActive(0);
    } else {
      const rest = Math.max(Math.round((t.net - tendered) * 100) / 100, 0);
      setPayments([...payments, { account_id: acc.id, amount: rest ? String(rest) : '', trx_ref: '' }]); setActive(payments.length);
    }
    focusAmount();
  };
  const addAnother = () => {
    const next = accList.find((a) => !payments.some((p) => p.account_id === a.id));
    if (next) pick(next);
  };
  const setLine = (i, k, v) => setPayments(payments.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const remove = (i) => { const next = payments.filter((_, j) => j !== i); setPayments(next); setActive(next.length ? 0 : -1); };
  const due = t.due > 0.009;
  const isWalkIn = !cart.customer || cart.customer.is_walk_in;
  const needsCustomer = due && isWalkIn;
  const blocked = busy || needsCustomer || (due && !dueDate) || !cart.items.length;
  const pointsEarn = !isWalkIn && settings.loyalty_enabled === '1' ? Math.floor(Math.min(tendered, t.net) / (n(settings.loyalty_spend_per_point) || 100)) : 0;
  const paidText = payments.filter((p) => n(p.amount) > 0).map((p) => `${shortName(accList.find((a) => a.id === p.account_id))} ${tk(n(p.amount))}`).join(' + ');
  const overBy = Math.max(Math.round((tendered - t.net) * 100) / 100, 0);

  const Row = ({ k, v, tone }) => (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-slate-500 dark:text-slate-400">{k}</span>
      <b className={cls('font-bold tabular-nums text-slate-900 dark:text-white', tone)}>{v}</b>
    </div>
  );
  const ToggleRow = ({ icon: Icon, label, on, onChange, disabled }) => (
    <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
      <Icon className="h-[15px] w-[15px] text-slate-500" /><span className="flex-1">{label}</span>
      <Toggle on={on} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 backdrop-blur-[3px] animate-[bpPop_150ms_ease-out]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="grid max-h-[94vh] w-full max-w-[55rem] overflow-hidden rounded-[20px] bg-white shadow-[0_30px_80px_-20px_rgb(0_0_0/.45)] dark:bg-slate-900 md:grid-cols-[minmax(0,1fr)_330px]">
        {/* left */}
        <div className="overflow-y-auto px-6 py-[22px]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{mode === 'credit' ? 'Credit sale' : 'Take payment'}</h2>
              <p className="mt-[3px] text-[13px] text-slate-500 dark:text-slate-400">{isWalkIn ? 'Walk-in customer' : cart.customer.name} · {num(t.qty)} items</p>
            </div>
            <button type="button" aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" onClick={onClose}><X className="h-[15px] w-[15px]" /></button>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {accList.map((a) => {
              const { Icon, tone } = methodStyle(a);
              const used = payments.some((p) => p.account_id === a.id);
              const on = cur?.account_id === a.id;
              return (
                <button type="button" key={a.id} onClick={() => pick(a)}
                  className={cls('relative flex min-w-0 flex-col items-center gap-1.5 rounded-[14px] border px-2.5 py-3 transition',
                    on ? 'border-ocean-500 text-ocean-700 ring-[3px] ring-ocean-100 dark:text-ocean-200 dark:ring-ocean-900/50' : 'border-slate-200 text-slate-700 hover:border-ocean-300 dark:border-slate-700 dark:text-slate-200')}>
                  <span className={cls('flex h-9 w-9 items-center justify-center rounded-[10px]', tone)}><Icon className="h-[18px] w-[18px]" /></span>
                  <span className="w-full truncate text-center text-[12.5px] font-bold">{shortName(a)}</span>
                  <span className="-mt-1 w-full truncate text-center text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">{subLabel(a)}</span>
                  {used && !on && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-ocean-500" />}
                </button>
              );
            })}
          </div>

          {cur ? (
            <>
              <label className="mt-4 flex h-16 items-center gap-2.5 rounded-[14px] border-2 border-ocean-500 px-4 ring-[5px] ring-ocean-100 dark:ring-ocean-900/40">
                <span className="text-[22px] font-bold text-slate-400">৳</span>
                <input ref={inputRef} inputMode="decimal" aria-label="Amount received" className="min-w-0 flex-1 bg-transparent text-[30px] font-extrabold tabular-nums tracking-[-.02em] text-slate-900 outline-none dark:text-white"
                  value={fmtAmount(cur.amount)} onChange={(e) => setLine(active, 'amount', e.target.value.replace(/[^\d.]/g, ''))} />
                <span className="hidden h-[22px] items-center rounded-full bg-ocean-50 px-2 text-[11px] font-bold text-ocean-700 dark:bg-ocean-900/40 dark:text-ocean-200 sm:inline-flex">{shortName(curAcc)} received</span>
              </label>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                <button type="button" className="h-10 rounded-[11px] border border-ocean-100 bg-ocean-50 text-[13px] font-bold text-ocean-700 dark:border-ocean-900 dark:bg-ocean-900/30 dark:text-ocean-200" onClick={() => setLine(active, 'amount', String(remainingFor(active)))}>Exact</button>
                {quickNotes(remainingFor(active)).map((v) => (
                  <button type="button" key={v} className="h-10 rounded-[11px] border border-slate-200 text-[13px] font-bold tabular-nums text-slate-700 hover:border-ocean-300 dark:border-slate-700 dark:text-slate-200" onClick={() => setLine(active, 'amount', String(v))}>{num(v)}</button>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-[14px] border border-dashed border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              Nothing is paid now — the whole {tk(t.net)} goes on the customer's due. Tap a method above if they pay a part now.
            </div>
          )}

          {payments.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-[14px] border border-slate-200 dark:border-slate-700">
              {payments.map((p, i) => {
                const acc = accList.find((a) => a.id === p.account_id);
                const { Icon, tone } = methodStyle(acc);
                return (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={i} onClick={() => setActive(i)} className={cls('flex cursor-pointer items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800', i === active && payments.length > 1 && 'bg-ocean-50/50 dark:bg-ocean-900/15')}>
                    <span className={cls('flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]', tone)}><Icon className="h-[15px] w-[15px]" /></span>
                    <span className="flex min-w-0 flex-1 items-baseline gap-1 text-[13px]">
                      <b className="shrink-0 font-semibold text-slate-900 dark:text-white">{shortName(acc)}</b>
                      {acc && acc.type !== 'cash' && (
                        <>
                          <span className="text-slate-400">·</span>
                          <input className="min-w-0 flex-1 bg-transparent text-[11.5px] text-slate-500 outline-none placeholder:text-slate-400 focus:text-slate-800 dark:text-slate-400 dark:focus:text-white"
                            placeholder={acc.type === 'card' ? 'Card last 4 digits' : 'TrxID'} value={p.trx_ref} onClick={(e) => e.stopPropagation()} onChange={(e) => setLine(i, 'trx_ref', e.target.value)} />
                        </>
                      )}
                    </span>
                    <b className="tabular-nums text-slate-900 dark:text-white">{tk(n(p.amount))}</b>
                    <button type="button" aria-label="Remove payment" className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30" onClick={(e) => { e.stopPropagation(); remove(i); }}><Trash2 className="h-[15px] w-[15px]" /></button>
                  </div>
                );
              })}
              <button type="button" onClick={addAnother} disabled={payments.length >= accList.length}
                className="flex w-full items-center justify-center gap-1.5 py-2.5 text-[13px] font-bold text-ocean-600 transition hover:bg-ocean-50/60 disabled:opacity-40 dark:text-ocean-400 dark:hover:bg-slate-800">
                <Plus className="h-[15px] w-[15px]" /> Add another payment
              </button>
            </div>
          )}

          <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
            <div>
              <p className="mb-[5px] text-[11.5px] font-semibold text-slate-500">Note on receipt</p>
              <input className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13.5px] outline-none transition focus:border-ocean-500 focus:ring-4 focus:ring-ocean-100 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-ocean-900/40"
                placeholder="e.g. Exchange within 7 days" value={cart.note || ''} onChange={(e) => onNote(e.target.value)} />
            </div>
            <div>
              <p className="mb-[5px] text-[11.5px] font-semibold text-slate-500">Next payment date (if due)</p>
              {due ? (
                <input type="date" min={todayStr()} aria-label="Next payment date" className="h-10 w-full rounded-xl border border-amber-300 bg-amber-50 px-3 text-[13.5px] font-semibold text-amber-900 outline-none focus:ring-4 focus:ring-amber-100 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100"
                  value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              ) : (
                <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[13.5px] text-slate-400 dark:border-slate-700"><CalendarDays className="h-[15px] w-[15px]" /> Not needed — fully paid</div>
              )}
            </div>
          </div>
          {due && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {DUE_PRESETS.map(([l, d]) => (
                <button type="button" key={l} className={cls('chip', dueDate === addDays(d) && 'chip-active')} onClick={() => setDueDate(addDays(d))}>{l}</button>
              ))}
              {needsCustomer && <span className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-rose-600"><AlertTriangle className="h-3.5 w-3.5" /> Choose a customer to sell on credit</span>}
            </div>
          )}
        </div>

        {/* right */}
        <div className="flex flex-col gap-3 overflow-y-auto border-t border-slate-200 bg-slate-50 p-[22px] dark:border-slate-800 dark:bg-slate-950/40 md:border-l md:border-t-0">
          <Row k="Subtotal" v={tk(t.lines)} />
          {t.itemOffer > 0 && <Row k="Offers (already in prices)" v={`saved ${tk(t.itemOffer)}`} tone="!text-emerald-600 dark:!text-emerald-400" />}
          {n(cart.invoiceDiscount) + t.billOffer > 0 && <Row k="Discount" v={`− ${tk(n(cart.invoiceDiscount) + t.billOffer)}`} />}
          {t.vat > 0 && <Row k="VAT" v={tk(t.vat)} />}
          {n(cart.roundOff) > 0 && <Row k="Round off" v={`− ${tk(cart.roundOff)}`} />}
          {t.pointValue > 0 && <Row k="Points used" v={`− ${tk(t.pointValue)}`} />}
          {t.credit > 0 && <Row k="Exchange credit" v={`− ${tk(t.credit)}`} tone="!text-amber-600" />}
          <div className="h-px bg-slate-200 dark:bg-slate-700" />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-bold text-slate-900 dark:text-white">Total payable</span>
            <b className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{tk(t.net)}</b>
          </div>
          <Row k={`Paid${payments.filter((p) => n(p.amount) > 0).length > 1 ? ` (${payments.filter((p) => n(p.amount) > 0).length} methods)` : ''}`} v={tk(Math.min(tendered, t.net))} />
          {n(cart.customer?.balance) > 0 && <Row k="Old due of customer" v={tk(cart.customer.balance)} tone="!text-rose-600" />}

          {due ? (
            <div className="rounded-[14px] bg-amber-100/80 p-3.5 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              <p className="text-[11px] font-extrabold uppercase tracking-[.06em]">Due (credit)</p>
              <p className="text-[28px] font-extrabold leading-tight tabular-nums">{tk(t.due)}</p>
              <p className="text-xs font-semibold opacity-80">{tendered > 0 ? `${paidText} paid now` : 'Nothing paid now'}</p>
            </div>
          ) : (
            <div className="rounded-[14px] bg-emerald-50 p-3.5 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-300">
              <p className="text-[11px] font-extrabold uppercase tracking-[.06em]">Give back (change)</p>
              <p className="text-[28px] font-extrabold leading-tight tabular-nums">{tk(t.change)}</p>
              {paidText && <p className="text-xs font-semibold opacity-80">{paidText} {overBy > 0 ? `= ${tk(overBy)} more than the bill` : '= exact'}</p>}
            </div>
          )}

          <div className="mt-0.5 space-y-2.5">
            {!isWalkIn && <ToggleRow icon={MessageCircle} label="SMS receipt link" on={sendSms} onChange={setSendSms} />}
            {pointsEarn > 0 && <ToggleRow icon={Coins} label={`Earn ${num(pointsEarn)} points`} on disabled />}
            <ToggleRow icon={Printer} label={`Print ${n(settings.receipt_width_mm) || 80}mm receipt`} on={print} onChange={setPrint} />
          </div>

          <div className="mt-auto grid gap-2 pt-1">
            <button type="button" className="flex h-[52px] items-center justify-center gap-2.5 rounded-[14px] bg-gradient-to-br from-[#1a7cee] to-[#0b5cc0] text-[15px] font-extrabold text-white shadow-[0_10px_22px_-10px_rgb(26_124_238/.8)] transition hover:brightness-110 disabled:opacity-50"
              disabled={blocked} onClick={() => onComplete(print)}>
              {busy ? <Spinner className="h-5 w-5 text-white" /> : print ? <Printer className="h-[18px] w-[18px]" /> : <Check className="h-[18px] w-[18px]" />} {print ? 'Complete & Print' : 'Complete sale'} <Kbd light>F10</Kbd>
            </button>
            {print && (
              <button type="button" className="flex h-11 items-center justify-center gap-2 rounded-[14px] border border-slate-200 bg-white text-[13.5px] font-bold text-slate-700 transition hover:border-ocean-300 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                disabled={blocked} onClick={() => onComplete(false)}>
                <Check className="h-[15px] w-[15px]" /> Complete without printing <Kbd>F9</Kbd>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
