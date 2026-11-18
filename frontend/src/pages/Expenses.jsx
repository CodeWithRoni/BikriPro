import { useState } from 'react';
import { ReceiptText, Receipt, FolderCog, Plus, Pencil, Trash2, Check, X, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PageHeader, Field, Empty, Modal, Pagination, Spinner, useDebounced } from '../components/ui';
import { AccountSelect } from '../components/Pickers';
import FilterBar, { useFilters, toParams, Sum, METHODS } from '../components/FilterBar';
import { tk, num, fmtDate, todayStr, monthStart, cls, downloadCsv } from '../utils/format';

const BAR = ['bg-ocean-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-sky-500', 'bg-slate-400'];

/** Shop expenses: filterable list, category breakdown, add form and category manager. */
export default function Expenses() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [flt, set, reset] = useFilters({ category_id: '', account_id: '', method: '', amount: { min: '', max: '' } }, () => setPage(1));
  const dq = useDebounced(q);
  const df = useDebounced(flt, 350);
  const { data, reload } = useApi('/expenses', { from: from || undefined, to: to || undefined, q: dq || undefined, sort, page, ...toParams(df) });
  const cats = useApi('/expense-categories');
  const [manage, setManage] = useState(false);
  const [f, setF] = useState({ category_id: '', account_id: null, amount: '', expense_date: todayStr(), note: '' });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/expenses', { ...f, category_id: f.category_id || null });
      toast.success('Expense saved');
      setF({ ...f, amount: '', note: '' });
      reload(); cats.reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const s = data?.summary;
  const catOptions = [...(cats.data || []).map((c) => [c.id, c.name]), ['none', 'Other (no category)']];

  return (
    <div>
      <PageHeader icon={ReceiptText} title="Expenses" subtitle="Rent, salary, utility bills and other shop costs"
        actions={<>
          <button type="button" className="btn-secondary" onClick={() => downloadCsv(`expenses-${from}-${to}.csv`, data?.data)}><Download className="h-4 w-4" /> Export</button>
          <button type="button" className="btn-secondary" onClick={() => setManage(true)}><FolderCog className="h-4 w-4" /> Expense categories</button>
        </>} />

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <FilterBar
            search={{ value: q, onChange: (v) => { setQ(v); setPage(1); }, placeholder: 'Search note or category…' }}
            date={{ from, to, onChange: (a, b) => { setFrom(a); setTo(b); setPage(1); } }} defaultDate={[monthStart(), todayStr()]}
            sort={{ value: sort, onChange: (v) => { setSort(v); setPage(1); }, options: [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['amount_desc', 'Amount: high → low'], ['amount_asc', 'Amount: low → high']] }}
            values={flt} onChange={set} onClear={reset}
            fields={[
              { key: 'category_id', label: 'Category', type: 'select', options: catOptions, placeholder: 'All categories' },
              { key: 'account_id', label: 'Paid from', type: 'account' },
              { key: 'amount', label: 'Amount (৳)', type: 'range' },
              { key: 'method', label: 'Method', type: 'segment', options: METHODS.map(([v, l]) => [v, l.replace(' (MFS)', '')]) },
            ]}
            summary={s && <><Sum label="Expenses" value={num(s.total)} /><Sum label="Total" value={tk(s.amount)} tone="rose" />{s.total > 0 && <Sum label="Largest" value={tk(s.largest)} />}</>} />

          {/* Category breakdown — click to filter */}
          {s?.by_category?.length > 0 && (
            <div className="card mb-4 p-4">
              <div className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                {s.by_category.map((c, i) => <div key={c.category} className={BAR[i % BAR.length]} style={{ width: `${(c.amount / (s.amount || 1)) * 100}%` }} title={`${c.category}: ${tk(c.amount)}`} />)}
              </div>
              <div className="flex flex-wrap gap-2">
                {s.by_category.map((c, i) => {
                  const id = c.category_id ? String(c.category_id) : 'none';
                  const on = String(flt.category_id) === id;
                  return (
                    <button type="button" key={id} onClick={() => set({ category_id: on ? '' : id })}
                      className={cls('inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition', on ? 'border-ocean-500 bg-ocean-50 dark:bg-ocean-900/40' : 'border-slate-200 hover:border-ocean-300 dark:border-slate-700')}>
                      <span className={cls('h-2.5 w-2.5 rounded-full', BAR[i % BAR.length])} />
                      <span className="font-semibold">{c.category}</span>
                      <span className="text-slate-500">{tk(c.amount)} · {((c.amount / (s.amount || 1)) * 100).toFixed(0)}%</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="table-wrap"><table className="table">
            <thead><tr><th>Date</th><th>Category</th><th>Paid from</th><th>Note</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{data?.data.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{fmtDate(e.expense_date)}</td>
                <td>{e.category || <span className="text-slate-400">Other</span>}</td>
                <td>{e.account_name}<div className="text-[11px] uppercase text-slate-400">{e.account_type}</div></td>
                <td className="text-slate-500">{e.note}</td>
                <td className="text-right font-semibold text-rose-600">{tk(e.amount)}</td>
              </tr>
            ))}</tbody>
          </table>
          {!data?.data.length && <Empty icon={Receipt} title="No expenses match these filters" />}
          <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} /></div>
        </div>

        <div className="card h-fit space-y-3 p-4 xl:sticky xl:top-20">
          <p className="font-bold">Add expense</p>
          <Field label="Category">
            <div className="flex gap-1.5">
              <select className="input min-w-0" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
                <option value="">Other</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" className="btn-secondary shrink-0 px-2.5" onClick={() => setManage(true)} aria-label="Manage expense categories"><FolderCog className="h-4 w-4" /></button>
            </div>
          </Field>
          <Field label="Amount"><input type="number" min="0" className="input no-spin text-lg font-bold" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Paid from"><AccountSelect value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} /></Field>
          <Field label="Date"><input type="date" className="input" value={f.expense_date} onChange={(e) => setF({ ...f, expense_date: e.target.value })} /></Field>
          <Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <button type="button" className="btn-primary w-full" disabled={busy || !(Number(f.amount) > 0)} onClick={save}>{busy && <Spinner className="h-4 w-4 text-white" />} Save expense</button>
        </div>
      </div>

      <CategoryManager open={manage} onClose={() => setManage(false)} cats={cats}
        onChanged={(deletedId) => { cats.reload(); reload(); if (deletedId && String(f.category_id) === String(deletedId)) setF((x) => ({ ...x, category_id: '' })); if (deletedId && String(flt.category_id) === String(deletedId)) set({ category_id: '' }); }} />
    </div>
  );
}

/** Add, rename and delete expense categories. Deleting keeps the expenses (they become "Other"). */
function CategoryManager({ open, onClose, cats, onChanged }) {
  const [name, setName] = useState('');
  const [edit, setEdit] = useState(null); // { id, name }
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { await api.post('/expense-categories', { name }); toast.success('Category added'); setName(''); onChanged(); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const rename = async () => {
    if (!edit?.name.trim()) return;
    try { await api.put(`/expense-categories/${edit.id}`, { name: edit.name }); toast.success('Renamed'); setEdit(null); onChanged(); } catch (err) { toast.error(err.message); }
  };
  const remove = async (c) => {
    const msg = c.expense_count > 0
      ? `Delete "${c.name}"? Its ${c.expense_count} expense(s) (${tk(c.total_amount)}) will be kept and shown as "Other".`
      : `Delete "${c.name}"?`;
    if (!window.confirm(msg)) return;
    try { await api.delete(`/expense-categories/${c.id}`); toast.success('Deleted'); onChanged(c.id); } catch (err) { toast.error(err.message); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Expense categories" size="sm">
      <form onSubmit={add} className="mb-4 flex gap-2">
        <input className="input" placeholder="New category, e.g. Generator fuel" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <button type="submit" className="btn-primary shrink-0" disabled={busy || !name.trim()}><Plus className="h-4 w-4" /> Add</button>
      </form>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {cats.data?.map((c) => (
          <div key={c.id} className="flex items-center gap-2 px-3 py-2">
            {edit?.id === c.id ? (
              <>
                <input className="input-sm flex-1" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && rename()} autoFocus />
                <button type="button" className="btn-primary btn-sm px-2" onClick={rename} aria-label="Save"><Check className="h-4 w-4" /></button>
                <button type="button" className="btn-secondary btn-sm px-2" onClick={() => setEdit(null)} aria-label="Cancel"><X className="h-4 w-4" /></button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-[11px] text-slate-400">{num(c.expense_count)} expense{c.expense_count === 1 ? '' : 's'} · {tk(c.total_amount)}</p>
                </div>
                <button type="button" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ocean-600 dark:hover:bg-slate-800" onClick={() => setEdit({ id: c.id, name: c.name })} aria-label={`Rename ${c.name}`}><Pencil className="h-4 w-4" /></button>
                <button type="button" className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/30" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </div>
        ))}
        {!cats.data?.length && <p className="px-3 py-6 text-center text-sm text-slate-400">No categories yet</p>}
      </div>
      <p className="mt-3 text-xs text-slate-400">Deleting a category never deletes expenses — they are kept and listed as “Other”.</p>
    </Modal>
  );
}
