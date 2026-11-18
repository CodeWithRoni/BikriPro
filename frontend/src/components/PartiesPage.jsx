import { useState } from 'react';
import { Plus, Search, Pencil, BookOpen, Trash2, Gift, Download, Printer, SlidersHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import PartyForm from './PartyForm';
import { PageHeader, Pagination, Empty, Modal, Field, DateRange, useDebounced, PageLoader, Badge } from './ui';
import FilterBar, { useFilters, toParams, Sum } from './FilterBar';
import { tk, num, fmtDate, todayStr, downloadCsv, cls } from '../utils/format';
import { printNode } from './receipt/Receipt';

const TXN_TYPES = {
  customer: [['sale', 'Sales'], ['sale_return', 'Returns'], ['collection', 'Collections'], ['adjustment', 'Adjustments']],
  supplier: [['purchase', 'Purchases'], ['purchase_return', 'Returns'], ['payment', 'Payments'], ['adjustment', 'Adjustments']],
};
const REASONS = {
  customer: [['round_off', 'Round-off / loose change waived'], ['discount', 'Discount'], ['correction', 'Correction'], ['other', 'Other']],
  supplier: [['rebate', 'Rebate'], ['commission', 'Commission'], ['discount', 'Discount'], ['correction', 'Correction'], ['other', 'Other']],
};

/** Shared list + ledger screen for the separate Customers and Suppliers menus. */
export default function PartiesPage({ type, icon, title, subtitle }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [f, set, reset] = useFilters({ area: '', balance: '', balance_range: { min: '', max: '' }, overdue: false, points: false, birthday: '' }, () => setPage(1));
  const dq = useDebounced(q);
  const df = useDebounced(f, 350);
  const path = type === 'customer' ? '/customers' : '/suppliers';
  const { data, loading, reload } = useApi(path, { q: dq || undefined, page, sort, ...toParams(df, { balance_range: 'balance' }) });
  const [form, setForm] = useState({ open: false, id: null });
  const [ledgerOf, setLedgerOf] = useState(null);

  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.name}?`)) return;
    try { await api.delete(`${path}/${p.id}`); toast.success('Deleted'); reload(); } catch (e) { toast.error(e.message); }
  };

  return (
    <div>
      <PageHeader icon={icon} title={title} subtitle={subtitle}
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => downloadCsv(`${type}s.csv`, data?.data)}><Download className="h-4 w-4" /> Export</button>
          <button type="button" className="btn-primary" onClick={() => setForm({ open: true, id: null })}><Plus className="h-4 w-4" /> New {type}</button>
        </>} />
      <FilterBar
        search={{ value: q, onChange: (v) => { setQ(v); setPage(1); }, placeholder: type === 'customer' ? 'Name, phone or any contact…' : 'Name, company, phone or any contact…' }}
        sort={{ value: sort, onChange: (v) => { setSort(v); setPage(1); }, options: [['name', 'Name A–Z'], ['name_desc', 'Name Z–A'], ['newest', 'Newest first'], ['balance_desc', type === 'customer' ? 'Highest due first' : 'We owe most first'], ['balance_asc', 'Lowest balance first'], ...(type === 'customer' ? [['points', 'Most loyalty points']] : [])] }}
        values={f} onChange={set} onClear={reset}
        fields={[
          { key: 'area', label: 'Area', type: 'select', options: (data?.areas || []).map((a) => [a, a]), placeholder: 'All areas' },
          { key: 'balance_range', label: `${type === 'customer' ? 'Receivable' : 'Payable'} (৳)`, type: 'range' },
          ...(type === 'customer' ? [{ key: 'birthday', label: 'Birthday', type: 'select', options: [['month', 'Birthday this month']], placeholder: 'Any' }] : []),
          { key: 'balance', label: 'Balance', type: 'segment', options: type === 'customer' ? [['due', 'Has due'], ['advance', 'Advance paid'], ['clear', 'Settled']] : [['due', 'We owe'], ['advance', 'Advance given'], ['clear', 'Settled']] },
          ...(type === 'customer' ? [{ key: 'overdue', label: 'Overdue payment', type: 'toggle' }, { key: 'points', label: 'Has loyalty points', type: 'toggle' }] : []),
        ]}
        summary={data && <><Sum label={type === 'customer' ? 'Customers' : 'Suppliers'} value={num(data.total)} /><Sum label="Total balance" value={tk(data.total_balance)} tone="rose" /></>} />
      {loading && !data ? <PageLoader /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Phone</th><th>Address / Area</th>{type === 'customer' && <th className="text-right">Points</th>}<th className="text-right">{type === 'customer' ? 'Receivable' : 'Payable'}</th><th /></tr></thead>
            <tbody>{data?.data.map((p) => (
              <tr key={p.id}>
                <td className="font-semibold">{p.name}{p.company && <div className="text-xs font-normal text-slate-500">{p.company}</div>}{p.dob && <div className="text-xs font-normal text-slate-500">DOB {fmtDate(p.dob)}</div>}</td>
                <td>{p.phone || '—'}</td>
                <td className="max-w-xs truncate text-slate-500">{[p.address, p.area].filter(Boolean).join(', ') || '—'}</td>
                {type === 'customer' && <td className="text-right"><span className="inline-flex items-center gap-1 text-violet-600"><Gift className="h-3.5 w-3.5" />{num(p.loyalty_points)}</span></td>}
                <td className={cls('text-right font-bold', p.balance > 0 ? 'text-rose-600' : p.balance < 0 ? 'text-emerald-600' : 'text-slate-400')}>{tk(p.balance)}</td>
                <td className="whitespace-nowrap text-right">
                  <button type="button" className="btn-ghost btn-sm text-ocean-600" onClick={() => setLedgerOf(p)}><BookOpen className="h-4 w-4" /> Ledger</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setForm({ open: true, id: p.id })}><Pencil className="h-4 w-4" /></button>
                  <button type="button" className="btn-ghost btn-sm text-rose-500" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {!data?.data.length && <Empty title={`No ${type}s found`} />}
          <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} />
        </div>
      )}
      <PartyForm type={type} open={form.open} editId={form.id} onClose={() => setForm({ open: false, id: null })} onSaved={reload} />
      <Ledger type={type} party={ledgerOf} onClose={() => { setLedgerOf(null); reload(); }} />
    </div>
  );
}

function Ledger({ type, party, onClose }) {
  const path = type === 'customer' ? '/customers' : '/suppliers';
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [types, setTypes] = useState([]);
  const { data, reload } = useApi(party ? `${path}/${party.id}/ledger` : null, { from: from || undefined, to: to || undefined, txn_type: types.length ? types.join(',') : undefined });
  const [adj, setAdj] = useState(null);

  const toggleType = (t) => setTypes((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));

  const saveAdj = async () => {
    try {
      await api.post(`${path}/${party.id}/adjustments`, adj);
      toast.success('Adjustment saved'); setAdj(null); reload();
    } catch (e) { toast.error(e.message); }
  };

  const debitLabel = type === 'customer' ? 'Bill (+)' : 'Purchase (+)';
  const creditLabel = type === 'customer' ? 'Received (−)' : 'Paid (−)';

  return (
    <Modal open={!!party} onClose={onClose} title={`${party?.name || ''} — Ledger`} size="xl"
      footer={<>
        <button type="button" className="btn-secondary" onClick={() => downloadCsv(`ledger-${party?.name}.csv`, data?.entries)}><Download className="h-4 w-4" /> CSV</button>
        <button type="button" className="btn-secondary" onClick={() => printNode(null, '@page { size: A4; margin: 12mm; }')}><Printer className="h-4 w-4" /> Print</button>
        <button type="button" className="btn-primary" onClick={() => setAdj({ effect: 'deduction', reason: type === 'customer' ? 'round_off' : 'rebate', amount: '', note: '', adj_date: todayStr() })}><SlidersHorizontal className="h-4 w-4" /> Adjustment</button>
      </>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
        {(from || to) && <button type="button" className="chip" onClick={() => { setFrom(''); setTo(''); }}>All time</button>}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TXN_TYPES[type].map(([k, l]) => <button type="button" key={k} className={cls('chip', types.includes(k) && 'chip-active')} onClick={() => toggleType(k)}>{l}</button>)}
      </div>
      <div className="print-area">
        <div className="mb-2 hidden print:block"><h2 className="text-lg font-bold">{party?.name} — Ledger</h2><p className="text-sm">{data?.party?.phone} · {data?.party?.address}</p></div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Ref</th><th>Description</th><th className="text-right">{debitLabel}</th><th className="text-right">{creditLabel}</th><th className="text-right">Balance</th></tr></thead>
            <tbody>
              <tr className="bg-slate-50 dark:bg-slate-800/40"><td colSpan={5} className="font-semibold">Opening balance {from && `(as of ${fmtDate(from)})`}</td><td className="text-right font-bold">{tk(data?.opening_balance)}</td></tr>
              {data?.entries.map((e) => (
                <tr key={`${e.txn_type}${e.ref_id}`}>
                  <td className="whitespace-nowrap">{fmtDate(e.txn_date)}</td>
                  <td className="whitespace-nowrap text-xs">{e.ref_no}</td>
                  <td>{e.description} {e.txn_type === 'adjustment' && <Badge tone="amber">adj</Badge>}</td>
                  <td className="text-right">{e.debit ? tk(e.debit) : ''}</td>
                  <td className="text-right text-emerald-600">{e.credit ? tk(e.credit) : ''}</td>
                  <td className="text-right font-semibold">{tk(e.balance)}</td>
                </tr>
              ))}
              <tr className="font-bold"><td colSpan={3}>Total / Closing</td><td className="text-right">{tk(data?.totals.debit)}</td><td className="text-right">{tk(data?.totals.credit)}</td><td className="text-right text-rose-600">{tk(data?.closing_balance)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!adj} onClose={() => setAdj(null)} title="Ledger adjustment" size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setAdj(null)}>Cancel</button><button type="button" className="btn-primary" onClick={saveAdj}>Save</button></>}>
        {adj && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[['deduction', 'Deduction (−)'], ['addition', 'Addition (+)']].map(([k, l]) => (
                <button type="button" key={k} onClick={() => setAdj({ ...adj, effect: k })} className={cls('rounded-xl border-2 p-3 text-sm font-semibold transition', adj.effect === k ? 'border-ocean-500 bg-ocean-50 text-ocean-700 dark:bg-ocean-900/30 dark:text-ocean-300' : 'border-slate-200 dark:border-slate-700')}>{l}</button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {type === 'customer'
                ? (adj.effect === 'deduction' ? 'Reduces what the customer owes — e.g. waive 20/50/100 Tk loose change.' : 'Increases what the customer owes.')
                : (adj.effect === 'deduction' ? 'Reduces what you owe — e.g. rebate or commission from the supplier.' : 'Increases what you owe the supplier.')}
            </p>
            <Field label="Reason"><select className="input" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })}>{REASONS[type].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Amount"><input type="number" className="input" autoFocus value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></Field>
            {type === 'customer' && adj.reason === 'round_off' && (
              <div className="flex gap-1.5">{[20, 50, 100].map((v) => <button type="button" key={v} className="chip" onClick={() => setAdj({ ...adj, amount: String(v) })}>{v} Tk</button>)}</div>
            )}
            <Field label="Date"><input type="date" className="input" value={adj.adj_date} onChange={(e) => setAdj({ ...adj, adj_date: e.target.value })} /></Field>
            <Field label="Note"><input className="input" value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </Modal>
  );
}
