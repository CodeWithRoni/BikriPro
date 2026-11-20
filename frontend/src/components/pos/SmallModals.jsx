import { useEffect, useState } from 'react';
import { FileText, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import useApi from '../../hooks/useApi';
import { Modal, Field } from '../ui';
import Select from '../ui/Select';
import { AccountSelect } from '../Pickers';
import { tk, addDays, todayStr, cls } from '../../utils/format';

/** Quick expense from the till (tea, transport, packaging…). */
export function QuickExpense({ open, onClose, onSaved }) {
  const cats = useApi(open ? '/expense-categories' : null);
  const [f, setF] = useState({ category_id: '', amount: '', account_id: null, note: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ category_id: '', amount: '', account_id: null, note: '' }); }, [open]);
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/expenses', { ...f, category_id: f.category_id || null, expense_date: todayStr() });
      toast.success(`Expense of ${tk(f.amount)} saved`);
      onSaved?.(); onClose();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add expense" size="sm"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy || !(Number(f.amount) > 0) || !f.account_id} onClick={save}><Wallet className="h-4 w-4" /> Save expense</button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount"><input className="input text-lg font-bold" inputMode="decimal" autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0" /></Field>
          <Field label="Category">
            <Select className="input" value={String(f.category_id)} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
              <option value="">Other</option>
              {(cats.data || []).map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Paid from"><AccountSelect value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} /></Field>
        <Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Tea for customers, rickshaw fare" /></Field>
      </div>
    </Modal>
  );
}

const VALID = [['3 days', 3], ['7 days', 7], ['15 days', 15], ['1 month', 30]];

/** Save the cart as a quotation (priced offer for the customer). */
export function QuotationModal({ open, onClose, total, customer, onSave }) {
  const [days, setDays] = useState(7);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDays(7); setNote(''); } }, [open]);
  const go = async (print) => { setBusy(true); try { await onSave({ valid_until: addDays(days), note, print }); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} title="Save as quotation" size="sm"
      footer={<><button type="button" className="btn-secondary" onClick={() => go(false)} disabled={busy}>Save only</button><button type="button" className="btn-primary" disabled={busy} onClick={() => go(true)}><FileText className="h-4 w-4" /> Save &amp; print</button></>}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl bg-violet-50 px-4 py-3 text-violet-800 dark:bg-violet-900/25 dark:text-violet-200">
          <span className="text-sm font-semibold">{customer && !customer.is_walk_in ? customer.name : 'Walk-in customer'}</span>
          <b className="text-xl tabular-nums">{tk(total)}</b>
        </div>
        <Field label="Prices valid for">
          <div className="flex flex-wrap gap-1.5">
            {VALID.map(([l, d]) => <button type="button" key={l} className={cls('chip', days === d && 'chip-active')} onClick={() => setDays(d)}>{l}</button>)}
          </div>
        </Field>
        <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Wedding order — 20 Panjabi" /></Field>
        <p className="text-xs text-slate-500">A quotation doesn't take stock or money. Open it later from Recent → Quotations to turn it into a sale.</p>
      </div>
    </Modal>
  );
}
