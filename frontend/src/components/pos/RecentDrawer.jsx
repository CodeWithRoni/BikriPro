import { useEffect, useState } from 'react';
import { X, History, Search, Printer, Receipt as ReceiptIcon, PauseCircle, FileText, Undo2, Trash2, ArrowDownToLine, Repeat2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import useApi from '../../hooks/useApi';
import { useDebounced, Spinner } from '../ui';
import { tk, num, todayStr, fmtDateTime, fmtDate, cls } from '../../utils/format';

const TABS = [['sales', 'Sales'], ['held', 'Held'], ['quotation', 'Quotations'], ['returns', 'Returns']];

const ago = (d) => {
  const m = Math.round((Date.now() - new Date(String(d).replace(' ', 'T')).getTime()) / 60000);
  if (!Number.isFinite(m) || m < 0 || m > 24 * 60) return fmtDateTime(d);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} hr ago`;
};

/** Slide-in panel: today's sales, held carts, quotations and returns, with quick actions. */
export default function RecentDrawer({ open, onClose, initialTab = 'sales', onPrintSale, onRetrieve, onPrintQuotation, shift, heldCount, quoteReload }) {
  const [tab, setTab] = useState(initialTab);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);

  const today = todayStr();
  const sales = useApi(open && tab === 'sales' ? '/sales' : null, { limit: 30, q: dq || undefined, ...(dq ? {} : { from: today, to: today }) });
  const held = useApi(open && (tab === 'held' || tab === 'quotation') ? '/sales/held' : null, { kind: tab === 'quotation' ? 'quotation' : 'hold', q: dq || undefined, k: quoteReload });
  const returns = useApi(open && tab === 'returns' ? '/sales/returns' : null, { limit: 30, q: dq || undefined });
  const todaySum = useApi(open ? '/sales' : null, { from: today, to: today, limit: 1 });

  const del = async (h) => {
    if (!window.confirm(`Delete ${h.hold_ref}?`)) return;
    try { await api.delete(`/sales/held/${h.id}`); held.reload(); toast.success(`${h.hold_ref} deleted`); } catch (e) { toast.error(e.message); }
  };

  const Item = ({ icon: Icon, tone, title, sub, amount, badge, badgeTone, children }) => (
    <div className="group relative flex items-center gap-3 border-b border-slate-100 px-5 py-[13px] dark:border-slate-800/70">
      <span className={cls('flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px]', tone)}><Icon className="h-[15px] w-[15px]" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold">{title}</p>
        <p className="truncate text-[11.5px] text-slate-500">{sub}</p>
      </div>
      <div className="text-right">
        <b className="block text-[13.5px] tabular-nums">{amount}</b>
        {badge && <span className={cls('mt-0.5 inline-block rounded-full px-2 py-px text-[10.5px] font-bold', badgeTone)}>{badge}</span>}
      </div>
      {children && (
        <div className="absolute right-4 top-1/2 flex -translate-y-1/2 gap-1 rounded-xl border border-slate-200 bg-white p-1 opacity-0 shadow-lg transition group-hover:opacity-100 focus-within:opacity-100 dark:border-slate-700 dark:bg-slate-800">
          {children}
        </div>
      )}
    </div>
  );
  const iconBtn = 'rounded-lg p-2 text-slate-400 transition hover:bg-ocean-50 hover:text-ocean-600 dark:hover:bg-slate-800';
  const loading = (tab === 'sales' && sales.loading && !sales.data) || ((tab === 'held' || tab === 'quotation') && held.loading && !held.data) || (tab === 'returns' && returns.loading && !returns.data);

  return (
    <>
      <div className={cls('fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-300', open ? 'opacity-100' : 'pointer-events-none opacity-0')} onClick={onClose} />
      <aside className={cls('fixed inset-y-0 right-0 z-50 flex w-full max-w-[28rem] flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out dark:bg-slate-900', open ? 'translate-x-0' : 'translate-x-full')} aria-hidden={!open}>
        <div className="border-b border-slate-200 px-5 pb-3 pt-4 dark:border-slate-800">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-5 w-5 text-ocean-600" />
            <h2 className="flex-1 text-[17px] font-bold text-slate-900 dark:text-white">Recent transactions</h2>
            <button type="button" aria-label="Close" className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={onClose}><X className="h-4 w-4" /></button>
          </div>
          <div className="flex gap-0.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {TABS.map(([k, l]) => (
              <button type="button" key={k} onClick={() => setTab(k)}
                className={cls('flex-1 rounded-lg py-1.5 text-xs font-bold transition', tab === k ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200')}>
                {l}{k === 'held' && heldCount > 0 ? ` (${heldCount})` : ''}
              </button>
            ))}
          </div>
          <label className="mt-2.5 flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700">
            <Search className="h-4 w-4 text-slate-400" />
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={tab === 'sales' ? 'Invoice, customer or phone (any date)…' : 'Number, customer or phone…'} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-10"><Spinner /></div>}

          {tab === 'sales' && sales.data && (sales.data.data.length ? sales.data.data.map((s) => {
            const due = Number(s.due_amount) > 0;
            const ex = Boolean(s.exchange_return_id);
            return (
              <Item key={s.id} icon={ex ? Repeat2 : ReceiptIcon}
                tone={ex ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30' : due ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/30' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30'}
                title={s.invoice_no} sub={[s.customer_name || 'Walk-in', ex ? 'Exchange' : Number(s.paid_amount) <= 0 && due ? 'Credit sale' : s.pay_methods, `${num(s.item_count)} item${Number(s.item_count) === 1 ? '' : 's'}`, ago(s.sale_date)].filter(Boolean).join(' · ')} amount={tk(s.grand_total)}
                badge={s.status === 'returned' ? 'Returned' : ex ? 'Exchange' : due ? `Due ${tk(s.due_amount)}` : 'Paid'}
                badgeTone={s.status === 'returned' ? 'bg-slate-100 text-slate-500 dark:bg-slate-800' : ex ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : due ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}>
                <button type="button" title="Print receipt" aria-label="Print receipt" className={iconBtn} onClick={() => onPrintSale(s.id)}><Printer className="h-4 w-4" /></button>
              </Item>
            );
          }) : <Empty text={dq ? 'No sale found.' : 'No sales yet today.'} />)}

          {(tab === 'held' || tab === 'quotation') && held.data && (held.data.length ? held.data.map((h) => (
            <Item key={h.id} icon={tab === 'quotation' ? FileText : PauseCircle}
              tone={tab === 'quotation' ? 'bg-violet-50 text-violet-600 dark:bg-violet-900/30' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30'}
              title={h.hold_ref} sub={`${h.customer_name || 'Walk-in'} · ${num(h.item_count)} items · ${ago(h.created_at)}`} amount={tk(h.total)}
              badge={tab === 'quotation' && h.valid_until ? (h.valid_until < todayStr() ? 'Expired' : `Valid to ${fmtDate(h.valid_until)}`) : null}
              badgeTone={h.valid_until && h.valid_until < todayStr() ? 'bg-slate-100 text-slate-500 dark:bg-slate-800' : 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'}>
              {tab === 'quotation' && <button type="button" title="Print quotation" aria-label="Print quotation" className={iconBtn} onClick={() => onPrintQuotation(h.id)}><Printer className="h-4 w-4" /></button>}
              <button type="button" title={tab === 'quotation' ? 'Load into the cart' : 'Retrieve'} aria-label="Load into cart" className={iconBtn} onClick={() => onRetrieve(h)}><ArrowDownToLine className="h-4 w-4" /></button>
              <button type="button" title="Delete" aria-label="Delete" className={cls(iconBtn, 'hover:bg-rose-50 hover:text-rose-600')} onClick={() => del(h)}><Trash2 className="h-4 w-4" /></button>
            </Item>
          )) : <Empty text={tab === 'quotation' ? 'No quotations yet. Use Quotation in the bottom bar to give a customer a priced offer.' : 'No held bills. Use Hold (F4) to park a cart.'} />)}

          {tab === 'returns' && returns.data && (returns.data.data.length ? returns.data.data.map((r) => (
            <Item key={r.id} icon={Undo2} tone="bg-rose-50 text-rose-600 dark:bg-rose-900/30" title={r.return_no}
              sub={`${r.invoice_no} · ${r.customer_name || 'Walk-in'} · ${ago(r.return_date)}`} amount={`− ${tk(r.total_amount)}`}
              badge={Number(r.refund_amount) > 0 ? `Refund ${tk(r.refund_amount)}` : 'To due'} badgeTone="bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300" />
          )) : <Empty text="No returns found." />)}
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
          <Stat label="Today" value={tk(todaySum.data?.summary?.amount || 0)} />
          <Stat label="Bills" value={num(todaySum.data?.summary?.total || 0)} />
          <Stat label="Cash in drawer" value={shift ? tk(shift.expected_cash) : 'No shift'} />
        </div>
      </aside>
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/70">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-[15px] font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Empty({ text }) {
  return <p className="px-8 py-12 text-center text-sm text-slate-500">{text}</p>;
}
