import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Landmark, Plus, ArrowLeftRight, Banknote, Smartphone, CreditCard, Building2, Pencil, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PageHeader, Modal, Field, DateRange, StatCard, Empty } from '../components/ui';
import FilterBar, { useFilters, Sum } from '../components/FilterBar';
import { AccountSelect } from '../components/Pickers';
import { tk, num, fmtDate, todayStr, monthStart, cls } from '../utils/format';

const ICON = { cash: Banknote, mfs: Smartphone, card: CreditCard, bank: Building2 };
const PROVIDERS = { mfs: ['bKash', 'Nagad', 'Rocket', 'Upay', 'Tap', 'OK Wallet'], bank: ['DBBL', 'City Bank', 'BRAC Bank', 'Islami Bank', 'Sonali Bank', 'EBL'] };

export default function Accounts() {
  const isAdmin = useSelector((s) => s.auth.user?.role) === 'admin';
  const { data, reload } = useApi('/accounts');
  const [edit, setEdit] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [entry, setEntry] = useState(null);
  const [stmt, setStmt] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('type');
  const [f, set, reset] = useFilters({ type: '', status: 'active', bal: '', provider: '' });
  const providers = [...new Set((data?.data || []).map((a) => a.provider).filter(Boolean))].sort();
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const r = (data?.data || []).filter((a) => (!s || `${a.name} ${a.provider || ''} ${a.account_no || ''} ${a.branch || ''}`.toLowerCase().includes(s))
      && (!f.type || a.type === f.type) && (!f.provider || a.provider === f.provider)
      && (!f.status || (f.status === 'active' ? a.is_active : !a.is_active))
      && (!f.bal || (f.bal === 'pos' ? a.balance > 0 : f.bal === 'zero' ? a.balance === 0 : a.balance < 0)));
    if (sort === 'type') return r;
    const by = { balance_desc: (a, b) => b.balance - a.balance, balance_asc: (a, b) => a.balance - b.balance, name: (a, b) => a.name.localeCompare(b.name) }[sort];
    return [...r].sort(by);
  }, [data, q, f, sort]);

  const save = async () => {
    try {
      if (edit.id) await api.put(`/accounts/${edit.id}`, edit); else await api.post('/accounts', edit);
      toast.success('Saved'); setEdit(null); reload();
    } catch (e) { toast.error(e.message); }
  };
  const doTransfer = async () => {
    try { await api.post('/accounts/transfer', transfer); toast.success('Transferred'); setTransfer(null); reload(); } catch (e) { toast.error(e.message); }
  };
  const doEntry = async () => {
    try { await api.post(`/accounts/${entry.id}/entry`, entry); toast.success('Saved'); setEntry(null); reload(); } catch (e) { toast.error(e.message); }
  };

  return (
    <div>
      <PageHeader icon={Landmark} title="Cash, Bank & MFS" subtitle="Cash drawer, bank accounts, bKash/Nagad/Rocket and card terminals"
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => setTransfer({ from_account_id: null, to_account_id: null, amount: '', note: '', date: todayStr() })}><ArrowLeftRight className="h-4 w-4" /> Transfer</button>
          {isAdmin && <button type="button" className="btn-primary" onClick={() => setEdit({ name: '', type: 'mfs', provider: '', account_no: '', branch: '', opening_balance: 0, is_default: false, is_active: true })}><Plus className="h-4 w-4" /> Add account</button>}
        </>} />
      {(
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="All accounts" value={tk(data?.totals.all)} icon={Landmark} />
            {['cash', 'mfs', 'bank', 'card'].map((t) => <StatCard key={t} label={t.toUpperCase()} value={tk(data?.totals[t])} icon={ICON[t]} tone={{ cash: 'green', mfs: 'rose', bank: 'ocean', card: 'violet' }[t]} />)}
          </div>
          <FilterBar
            search={{ value: q, onChange: setQ, placeholder: 'Account name, provider, number or branch…' }}
            sort={{ value: sort, onChange: setSort, options: [['type', 'By type'], ['balance_desc', 'Balance: high → low'], ['balance_asc', 'Balance: low → high'], ['name', 'Name A–Z']] }}
            values={f} onChange={set} onClear={() => set({ type: '', status: '', bal: '', provider: '' })}
            fields={[
              { key: 'provider', label: 'Provider', type: 'select', options: providers.map((p) => [p, p]), placeholder: 'All providers' },
              { key: 'type', label: 'Type', type: 'segment', options: [['cash', 'Cash'], ['mfs', 'MFS'], ['bank', 'Bank'], ['card', 'Card']] },
              { key: 'status', label: 'Status', type: 'segment', options: [['active', 'Active'], ['inactive', 'Inactive']] },
              { key: 'bal', label: 'Balance', type: 'segment', options: [['pos', 'Has money'], ['zero', 'Zero'], ['neg', 'Negative']] },
            ]}
            summary={<><Sum label="Accounts" value={num(list.length)} /><Sum label="Balance" value={tk(list.reduce((t, a) => t + a.balance, 0))} tone="green" /></>} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((a) => {
              const Icon = ICON[a.type];
              return (
                <div key={a.id} className={cls('card p-4', !a.is_active && 'opacity-50')}>
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-ocean-50 p-2.5 text-ocean-600 dark:bg-ocean-900/30 dark:text-ocean-300"><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{a.name} {a.is_default ? <span className="badge bg-ocean-100 text-ocean-700 dark:bg-ocean-900/40 dark:text-ocean-300">default</span> : null}</p>
                      <p className="text-xs uppercase text-slate-500">{a.type}{a.provider ? ` · ${a.provider}` : ''}{a.account_no ? ` · ${a.account_no}` : ''}</p>
                    </div>
                    {isAdmin && <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit({ ...a, is_default: !!a.is_default, is_active: !!a.is_active })}><Pencil className="h-4 w-4" /></button>}
                  </div>
                  <p className={cls('mt-3 text-2xl font-extrabold', a.balance < 0 && 'text-rose-600')}>{tk(a.balance)}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setStmt(a)}><BookOpen className="h-3.5 w-3.5" /> Statement</button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setEntry({ id: a.id, name: a.name, direction: 'in', amount: '', note: '', date: todayStr() })}>Deposit / Withdraw</button>
                  </div>
                </div>
              );
            })}
          </div>
          {data && !list.length && <div className="card"><Empty icon={Landmark} title="No account matches these filters" /></div>}
        </>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit account' : 'Add account'} size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Save</button></>}>
        {edit && (
          <div className="space-y-3">
            {!edit.id && <div className="grid grid-cols-4 gap-1.5">{['cash', 'mfs', 'bank', 'card'].map((t) => { const I = ICON[t]; return <button type="button" key={t} onClick={() => setEdit({ ...edit, type: t })} className={cls('flex flex-col items-center gap-1 rounded-xl border-2 p-2 text-xs font-semibold uppercase', edit.type === t ? 'border-ocean-500 text-ocean-700 dark:text-ocean-300' : 'border-slate-200 dark:border-slate-700')}><I className="h-5 w-5" />{t}</button>; })}</div>}
            {PROVIDERS[edit.type] && <div className="flex flex-wrap gap-1.5">{PROVIDERS[edit.type].map((p) => <button type="button" key={p} className={cls('chip', edit.provider === p && 'chip-active')} onClick={() => setEdit({ ...edit, provider: p, name: edit.name || p })}>{p}</button>)}</div>}
            <Field label="Account name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. bKash Merchant" /></Field>
            <Field label={edit.type === 'mfs' ? 'Wallet number' : 'Account number'}><input className="input" value={edit.account_no || ''} onChange={(e) => setEdit({ ...edit, account_no: e.target.value })} /></Field>
            {edit.type === 'bank' && <Field label="Branch"><input className="input" value={edit.branch || ''} onChange={(e) => setEdit({ ...edit, branch: e.target.value })} /></Field>}
            <Field label="Opening balance"><input type="number" className="input" value={edit.opening_balance} onChange={(e) => setEdit({ ...edit, opening_balance: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ocean-600" checked={edit.is_default} onChange={(e) => setEdit({ ...edit, is_default: e.target.checked })} /> Default for this type</label>
            {edit.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ocean-600" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Active</label>}
          </div>
        )}
      </Modal>

      <Modal open={!!transfer} onClose={() => setTransfer(null)} title="Transfer between accounts" size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setTransfer(null)}>Cancel</button><button type="button" className="btn-primary" onClick={doTransfer}>Transfer</button></>}>
        {transfer && (
          <div className="space-y-3">
            <Field label="From"><AccountSelect value={transfer.from_account_id} onChange={(v) => setTransfer((t) => ({ ...t, from_account_id: v }))} /></Field>
            <Field label="To"><AccountSelect value={transfer.to_account_id} onChange={(v) => setTransfer((t) => ({ ...t, to_account_id: v }))} /></Field>
            <Field label="Amount"><input type="number" className="input" value={transfer.amount} onChange={(e) => setTransfer({ ...transfer, amount: e.target.value })} /></Field>
            <Field label="Note"><input className="input" value={transfer.note} placeholder="e.g. Cash deposited to bank" onChange={(e) => setTransfer({ ...transfer, note: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      <Modal open={!!entry} onClose={() => setEntry(null)} title={`${entry?.name || ''} — deposit / withdraw`} size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setEntry(null)}>Cancel</button><button type="button" className="btn-primary" onClick={doEntry}>Save</button></>}>
        {entry && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">{[['in', 'Deposit (owner adds)'], ['out', 'Withdraw (owner takes)']].map(([k, l]) => <button type="button" key={k} className={cls('rounded-xl border-2 p-2.5 text-sm font-semibold', entry.direction === k ? 'border-ocean-500 text-ocean-700 dark:text-ocean-300' : 'border-slate-200 dark:border-slate-700')} onClick={() => setEntry({ ...entry, direction: k })}>{l}</button>)}</div>
            <Field label="Amount"><input type="number" className="input" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} /></Field>
            <Field label="Note"><input className="input" value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} /></Field>
          </div>
        )}
      </Modal>

      <Statement account={stmt} onClose={() => setStmt(null)} />
    </div>
  );
}

function Statement({ account, onClose }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const { data } = useApi(account ? `/accounts/${account.id}/transactions` : null, { from, to });
  return (
    <Modal open={!!account} onClose={onClose} title={`${account?.name || ''} — statement`} size="lg">
      <div className="mb-3"><DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} /></div>
      <table className="table">
        <thead><tr><th>Date</th><th>Type</th><th>Note</th><th className="text-right">In</th><th className="text-right">Out</th><th className="text-right">Balance</th></tr></thead>
        <tbody>
          <tr><td colSpan={5} className="font-semibold">Opening</td><td className="text-right font-bold">{tk(data?.opening_balance)}</td></tr>
          {data?.entries.map((e) => <tr key={e.id}><td>{fmtDate(e.txn_date)}</td><td className="text-xs uppercase">{e.ref_type.replace('_', ' ')}</td><td className="text-slate-500">{e.note}</td><td className="text-right text-emerald-600">{e.direction === 'in' ? tk(e.amount) : ''}</td><td className="text-right text-rose-600">{e.direction === 'out' ? tk(e.amount) : ''}</td><td className="text-right font-semibold">{tk(e.balance)}</td></tr>)}
        </tbody>
      </table>
    </Modal>
  );
}
