import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Coins as Vault, PlayCircle, StopCircle, Clock, ArrowDownLeft, ArrowUpRight, Wallet, Calculator, Eye, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PageHeader, Modal, Field, Empty, Pagination, Spinner, Badge, StatCard, useDebounced } from '../components/ui';
import { AccountSelect } from '../components/Pickers';
import FilterBar, { useFilters, Sum } from '../components/FilterBar';
import { tk, num, fmtDateTime, monthStart, todayStr, cls } from '../utils/format';

export const NOTES = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
const REF_LABEL = {
  sale: 'Cash sales', sale_return: 'Refunds / exchange', collection: 'Due collected', expense: 'Expenses',
  supplier_payment: 'Supplier payments', purchase: 'Purchases', purchase_return: 'Purchase returns',
  transfer: 'Transfers', deposit: 'Owner deposit', withdraw: 'Owner withdrawal', opening: 'Opening',
};
const METHOD_LABEL = { cash: 'Cash', mfs: 'bKash / Nagad', card: 'Card', bank: 'Bank' };

/** Bangladeshi note & coin counter. value = { "1000": 2, ... } */
export function NoteCounter({ value, onChange }) {
  const total = NOTES.reduce((t, n) => t + n * (Number(value[n]) || 0), 0);
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {NOTES.map((n) => (
          <label key={n} className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
            <span className="mb-1 block text-[11px] font-bold text-slate-500">৳ {n}</span>
            <input type="number" min="0" inputMode="numeric" className="input-sm no-spin text-center font-semibold" placeholder="0"
              value={value[n] ?? ''} onChange={(e) => onChange({ ...value, [n]: e.target.value.replace(/\D/g, '') })} />
            <span className="mt-1 block text-right text-[10px] text-slate-400">{(Number(value[n]) || 0) > 0 ? tk(n * Number(value[n])) : ''}</span>
          </label>
        ))}
      </div>
      <div className="mt-2 flex justify-between rounded-xl bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800"><span>Counted from notes</span><b>{tk(total)}</b></div>
    </div>
  );
}
const notesTotal = (v) => NOTES.reduce((t, n) => t + n * (Number(v[n]) || 0), 0);

export function VarianceBadge({ v }) {
  if (v === null || v === undefined) return <Badge tone="ocean">Open</Badge>;
  if (Number(v) === 0) return <Badge tone="green"><CheckCircle2 className="h-3 w-3" /> Matched</Badge>;
  return Number(v) < 0 ? <Badge tone="rose">Short {tk(Math.abs(v))}</Badge> : <Badge tone="amber">Over {tk(v)}</Badge>;
}

export default function DayClosing() {
  const user = useSelector((s) => s.auth.user);
  const isManager = ['manager', 'admin'].includes(user?.role);
  const cur = useApi('/cash-sessions/current');
  const [openForm, setOpenForm] = useState(null);
  const [closeOf, setCloseOf] = useState(null);
  const [view, setView] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const s = cur.data?.session;

  const refresh = () => { cur.reload(); setReloadKey((k) => k + 1); };

  const doOpen = async () => {
    try {
      await api.post('/cash-sessions/open', { opening_cash: Number(openForm.amount) || 0, account_id: openForm.account_id, note: openForm.note });
      toast.success('Shift opened');
      setOpenForm(null); refresh();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div>
      <PageHeader icon={Vault} title="Day Closing" subtitle="Open a shift with the cash in the drawer, close it by counting — the system shows if cash is short or over" />

      {/* ---------- My shift ---------- */}
      {cur.loading && !cur.data ? <div className="card mb-4 flex justify-center p-10"><Spinner /></div> : !s ? (
        <div className="card mb-4 flex flex-wrap items-center gap-4 p-5">
          <div className="rounded-2xl bg-ocean-50 p-3 text-ocean-600 dark:bg-ocean-900/30 dark:text-ocean-300"><PlayCircle className="h-7 w-7" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">No open shift</p>
            <p className="text-sm text-slate-500">Count the cash in the drawer and open your shift before you start selling.</p>
          </div>
          <button type="button" className="btn-primary" onClick={() => setOpenForm({ amount: '', account_id: null, note: '', notes: {} })}><PlayCircle className="h-4 w-4" /> Open shift</button>
        </div>
      ) : (
        <div className="card mb-4 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-emerald-50/60 px-5 py-3 dark:border-slate-800 dark:bg-emerald-950/20">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
            <p className="font-bold">Shift {s.session_no} is open</p>
            <span className="text-sm text-slate-500"><Clock className="mr-1 inline h-3.5 w-3.5" />since {fmtDateTime(s.opened_at)} · {s.account_name}</span>
            <button type="button" className="btn-danger ml-auto" onClick={() => setCloseOf(s)}><StopCircle className="h-4 w-4" /> Close shift</button>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={Wallet} label="Opening cash" value={tk(s.opening_cash)} />
            <StatCard icon={ArrowDownLeft} tone="green" label="Cash in" value={tk(s.cash_in)} />
            <StatCard icon={ArrowUpRight} tone="rose" label="Cash out" value={tk(s.cash_out)} />
            <StatCard icon={Calculator} tone="violet" label="Should be in drawer" value={tk(s.expected_cash)} />
            <StatCard icon={Vault} tone="amber" label="Sales this shift" value={tk(s.sales.total)} sub={`${num(s.sales.invoices)} invoices${s.sales.due > 0 ? ` · due ${tk(s.sales.due)}` : ''}`} />
          </div>
          <Breakdown data={s} />
        </div>
      )}

      {/* ---------- History ---------- */}
      <History key={reloadKey} isManager={isManager} onView={async (id) => setView((await api.get(`/cash-sessions/${id}`)).data)} />

      {/* Open shift */}
      <Modal open={!!openForm} onClose={() => setOpenForm(null)} title="Open shift" size="lg"
        footer={<><button type="button" className="btn-secondary" onClick={() => setOpenForm(null)}>Cancel</button><button type="button" className="btn-primary" onClick={doOpen}><PlayCircle className="h-4 w-4" /> Open shift with {tk(openForm?.amount || 0)}</button></>}>
        {openForm && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cash drawer"><AccountSelect value={openForm.account_id} filter={(a) => a.type === 'cash'} onChange={(v) => setOpenForm((f) => ({ ...f, account_id: v }))} /></Field>
              <Field label="Opening cash in drawer"><input type="number" min="0" className="input no-spin text-lg font-bold" value={openForm.amount} onChange={(e) => setOpenForm({ ...openForm, amount: e.target.value })} placeholder="0" /></Field>
            </div>
            <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <summary className="cursor-pointer text-sm font-semibold text-ocean-700 dark:text-ocean-300">Count by notes (optional)</summary>
              <div className="mt-3"><NoteCounter value={openForm.notes} onChange={(notes) => setOpenForm({ ...openForm, notes, amount: String(notesTotal(notes)) })} /></div>
            </details>
            <Field label="Note"><input className="input" value={openForm.note} onChange={(e) => setOpenForm({ ...openForm, note: e.target.value })} placeholder="Optional" /></Field>
          </div>
        )}
      </Modal>

      <CloseShift session={closeOf} onClose={() => setCloseOf(null)} onDone={() => { setCloseOf(null); refresh(); }} />

      {/* Shift detail */}
      <Modal open={!!view} onClose={() => setView(null)} title={`Shift ${view?.session_no || ''}`} size="lg"
        footer={view?.status === 'open' && isManager && <button type="button" className="btn-danger" onClick={() => { setCloseOf(view); setView(null); }}><StopCircle className="h-4 w-4" /> Close this shift</button>}>
        {view && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <Info label="Cashier" value={view.user_name} />
              <Info label="Drawer" value={view.account_name} />
              <Info label="Opened" value={fmtDateTime(view.opened_at)} />
              <Info label="Closed" value={view.closed_at ? `${fmtDateTime(view.closed_at)} · ${view.closed_by_name}` : '—'} />
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <Info label="Opening" value={tk(view.opening_cash)} />
              <Info label="Expected" value={tk(view.expected_cash)} />
              <Info label="Counted" value={view.counted_cash === null ? '—' : tk(view.counted_cash)} />
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60"><p className="text-[11px] uppercase text-slate-500">Result</p><VarianceBadge v={view.variance} /></div>
            </div>
            <Breakdown data={view} plain />
            {view.denominations && (
              <div>
                <p className="mb-1.5 font-semibold">Notes counted</p>
                <div className="flex flex-wrap gap-1.5">{NOTES.filter((n) => Number(view.denominations[n]) > 0).map((n) => <span key={n} className="badge bg-slate-100 dark:bg-slate-800">৳{n} × {view.denominations[n]}</span>)}</div>
              </div>
            )}
            {(view.opening_note || view.closing_note) && <p className="text-slate-500">{[view.opening_note, view.closing_note].filter(Boolean).join(' · ')}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Info({ label, value }) {
  return <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60"><p className="text-[11px] uppercase text-slate-500">{label}</p><p className="font-semibold">{value}</p></div>;
}

/** Cash in / out by type + sales by payment method */
function Breakdown({ data, plain = false }) {
  return (
    <div className={cls('grid gap-4 md:grid-cols-2', !plain && 'border-t border-slate-100 p-4 dark:border-slate-800')}>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Drawer movements</p>
        {!data.lines?.length ? <p className="text-sm text-slate-400">No cash movement yet.</p> : (
          <ul className="space-y-1.5 text-sm">{data.lines.map((l) => (
            <li key={`${l.ref_type}-${l.direction}`} className="flex justify-between">
              <span>{REF_LABEL[l.ref_type] || l.ref_type} <span className="text-xs text-slate-400">×{num(l.n)}</span></span>
              <b className={l.direction === 'in' ? 'text-emerald-600' : 'text-rose-600'}>{l.direction === 'in' ? '+' : '−'}{tk(l.amount)}</b>
            </li>
          ))}</ul>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Sales by payment method</p>
        {!data.sales_by_method?.length ? <p className="text-sm text-slate-400">No sales yet.</p> : (
          <ul className="space-y-1.5 text-sm">{data.sales_by_method.map((m) => (
            <li key={m.method} className="flex justify-between"><span>{METHOD_LABEL[m.method] || m.method}</span><b>{tk(m.amount)}</b></li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}

/** Count the drawer and close a shift */
function CloseShift({ session, onClose, onDone }) {
  const [notes, setNotes] = useState({});
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const live = useApi(session ? `/cash-sessions/${session.id}` : null);
  const expected = Number(live.data?.expected_cash ?? session?.expected_cash ?? 0);
  const counted = amount === '' ? null : Number(amount);
  const variance = counted === null ? null : Math.round((counted - expected) * 100) / 100;

  const reset = () => { setNotes({}); setAmount(''); setNote(''); };
  const submit = async () => {
    if (counted === null) return toast.error('Enter the cash you counted');
    if (variance !== 0 && !window.confirm(`Cash is ${variance < 0 ? 'SHORT' : 'OVER'} by ${tk(Math.abs(variance))}. Close the shift anyway?`)) return;
    setBusy(true);
    try {
      await api.post(`/cash-sessions/${session.id}/close`, { counted_cash: counted, denominations: Object.keys(notes).length ? notes : null, note });
      toast.success('Shift closed');
      reset(); onDone();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!session} onClose={() => { reset(); onClose(); }} title={`Close shift ${session?.session_no || ''}`} size="lg"
      footer={<><button type="button" className="btn-secondary" onClick={() => { reset(); onClose(); }}>Cancel</button><button type="button" className="btn-danger" disabled={busy || counted === null} onClick={submit}>{busy && <Spinner className="h-4 w-4 text-white" />}<StopCircle className="h-4 w-4" /> Close shift</button></>}>
      {session && (
        <div className="space-y-4">
          <NoteCounter value={notes} onChange={(v) => { setNotes(v); setAmount(String(notesTotal(v))); }} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-violet-50 p-3 dark:bg-violet-900/20"><p className="text-xs text-slate-500">Should be in drawer</p><p className="text-xl font-bold">{live.loading && !live.data ? '…' : tk(expected)}</p></div>
            <Field label="Cash counted"><input type="number" min="0" className="input no-spin text-lg font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
            <div className={cls('rounded-xl p-3', variance === null ? 'bg-slate-50 dark:bg-slate-800/60' : variance === 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : variance < 0 ? 'bg-rose-50 dark:bg-rose-900/20' : 'bg-amber-50 dark:bg-amber-900/20')}>
              <p className="text-xs text-slate-500">Difference</p>
              <p className={cls('text-xl font-bold', variance === null ? 'text-slate-400' : variance === 0 ? 'text-emerald-600' : variance < 0 ? 'text-rose-600' : 'text-amber-600')}>
                {variance === null ? '—' : variance === 0 ? 'Matched ✓' : `${variance < 0 ? 'Short' : 'Over'} ${tk(Math.abs(variance))}`}
              </p>
            </div>
          </div>
          {variance !== null && variance !== 0 && <p className="flex items-center gap-1.5 text-xs text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> Please recount once. If it is still different, write the reason below.</p>}
          <Field label="Note / reason"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. gave 50 Tk change from own pocket" /></Field>
        </div>
      )}
    </Modal>
  );
}

function History({ isManager, onView }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [f, set, reset] = useFilters({ user_id: '', status: '', result: '' }, () => setPage(1));
  const dq = useDebounced(q);
  const params = useMemo(() => ({ from: from || undefined, to: to || undefined, q: dq || undefined, sort, page, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [from, to, dq, sort, page, f]);
  const { data } = useApi('/cash-sessions', params);
  return (
    <>
      <h3 className="mb-2 font-bold">Shift history</h3>
      <FilterBar
        search={{ value: q, onChange: (v) => { setQ(v); setPage(1); }, placeholder: 'Shift no or cashier…' }}
        date={{ from, to, onChange: (a, b) => { setFrom(a); setTo(b); setPage(1); } }} defaultDate={[monthStart(), todayStr()]}
        sort={{ value: sort, onChange: setSort, options: [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['variance_asc', 'Most short first'], ['variance_desc', 'Most over first']] }}
        values={f} onChange={set} onClear={reset}
        fields={[
          ...(isManager ? [{ key: 'user_id', label: 'Cashier', type: 'select', options: (data?.users || []).map((u) => [u.id, u.name]), placeholder: 'All cashiers' }] : []),
          { key: 'status', label: 'Status', type: 'segment', options: [['open', 'Open'], ['closed', 'Closed']] },
          { key: 'result', label: 'Result', type: 'segment', options: [['short', 'Short'], ['over', 'Over'], ['exact', 'Matched']] },
        ]}
        summary={data?.summary && <><Sum label="Shifts" value={num(data.summary.total)} /><Sum label="Short" value={tk(Math.abs(data.summary.short))} tone="rose" /><Sum label="Over" value={tk(data.summary.over)} tone="amber" />{data.summary.open > 0 && <Sum label="Open" value={num(data.summary.open)} tone="green" />}</>} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Shift</th><th>Cashier</th><th>Opened</th><th>Closed</th><th className="text-right">Opening</th><th className="text-right">Expected</th><th className="text-right">Counted</th><th>Result</th><th /></tr></thead>
          <tbody>{data?.data.map((r) => (
            <tr key={r.id} className="cursor-pointer" onClick={() => onView(r.id)}>
              <td className="font-semibold">{r.session_no}</td>
              <td>{r.user_name}</td>
              <td className="whitespace-nowrap text-slate-500">{fmtDateTime(r.opened_at)}</td>
              <td className="whitespace-nowrap text-slate-500">{r.closed_at ? fmtDateTime(r.closed_at) : '—'}</td>
              <td className="text-right">{tk(r.opening_cash)}</td>
              <td className="text-right">{r.expected_cash === null ? '—' : tk(r.expected_cash)}</td>
              <td className="text-right font-semibold">{r.counted_cash === null ? '—' : tk(r.counted_cash)}</td>
              <td><VarianceBadge v={r.status === 'open' ? null : r.variance} /></td>
              <td><Eye className="h-4 w-4 text-slate-400" /></td>
            </tr>
          ))}</tbody>
        </table>
        {!data?.data.length && <Empty icon={Vault} title="No shifts match these filters" />}
        <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} />
      </div>
    </>
  );
}
