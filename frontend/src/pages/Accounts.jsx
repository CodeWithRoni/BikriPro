import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Landmark, Plus, ArrowLeftRight, Banknote, Smartphone, CreditCard, Building2, Pencil, BookOpen, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PageHeader, Modal, Field, Tabs, Empty, DateRange, StatCard } from '../components/ui';
import { AccountSelect } from '../components/Pickers';
import { tk, fmtDate, todayStr, monthStart, cls } from '../utils/format';

const ICON = { cash: Banknote, mfs: Smartphone, card: CreditCard, bank: Building2 };
const PROVIDERS = { mfs: ['bKash', 'Nagad', 'Rocket', 'Upay', 'Tap', 'OK Wallet'], bank: ['DBBL', 'City Bank', 'BRAC Bank', 'Islami Bank', 'Sonali Bank', 'EBL'] };

export default function Accounts() {
  const isAdmin = useSelector((s) => s.auth.user?.role) === 'admin';
  const [tab, setTab] = useState('accounts');
  const { data, reload } = useApi('/accounts');
  const [edit, setEdit] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [entry, setEntry] = useState(null);
  const [stmt, setStmt] = useState(null);

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
      <PageHeader icon={Landmark} title="Cash, Bank & MFS Setup" subtitle="Cash drawer, bank accounts, bKash/Nagad/Rocket and card terminals"
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => setTransfer({ from_account_id: null, to_account_id: null, amount: '', note: '', date: todayStr() })}><ArrowLeftRight className="h-4 w-4" /> Transfer</button>
          {isAdmin && <button type="button" className="btn-primary" onClick={() => setEdit({ name: '', type: 'mfs', provider: '', account_no: '', branch: '', opening_balance: 0, is_default: false, is_active: true })}><Plus className="h-4 w-4" /> Add account</button>}
        </>} />
      <Tabs tabs={[['accounts', 'Accounts'], ['expenses', 'Expenses']]} value={tab} onChange={setTab} />
      {tab === 'accounts' ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="All accounts" value={tk(data?.totals.all)} icon={Landmark} />
            {['cash', 'mfs', 'bank', 'card'].map((t) => <StatCard key={t} label={t.toUpperCase()} value={tk(data?.totals[t])} icon={ICON[t]} tone={{ cash: 'green', mfs: 'rose', bank: 'ocean', card: 'violet' }[t]} />)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data?.data.map((a) => {
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
        </>
      ) : <Expenses />}

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

function Expenses() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const { data, reload } = useApi('/expenses', { from, to });
  const cats = useApi('/expense-categories');
  const [f, setF] = useState({ category_id: '', account_id: null, amount: '', expense_date: todayStr(), note: '' });
  const save = async () => {
    try { await api.post('/expenses', { ...f, category_id: f.category_id || null }); toast.success('Expense saved'); setF({ ...f, amount: '', note: '' }); reload(); } catch (e) { toast.error(e.message); }
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <div>
        <div className="card mb-3 p-3"><DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} /></div>
        <p className="mb-2 text-sm">Total: <b className="text-rose-600">{tk(data?.summary.amount)}</b></p>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Date</th><th>Category</th><th>Account</th><th>Note</th><th className="text-right">Amount</th></tr></thead>
          <tbody>{data?.data.map((e) => <tr key={e.id}><td>{fmtDate(e.expense_date)}</td><td>{e.category || 'Other'}</td><td>{e.account_name}</td><td className="text-slate-500">{e.note}</td><td className="text-right font-semibold">{tk(e.amount)}</td></tr>)}</tbody>
        </table>{!data?.data.length && <Empty icon={Receipt} title="No expenses" />}</div>
      </div>
      <div className="card h-fit space-y-3 p-4">
        <p className="font-bold">Add expense</p>
        <Field label="Category"><select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">Other</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Amount"><input type="number" className="input" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Paid from"><AccountSelect value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} /></Field>
        <Field label="Date"><input type="date" className="input" value={f.expense_date} onChange={(e) => setF({ ...f, expense_date: e.target.value })} /></Field>
        <Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <button type="button" className="btn-primary w-full" disabled={!(Number(f.amount) > 0)} onClick={save}>Save expense</button>
      </div>
    </div>
  );
}
