import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { Modal, Field, Spinner } from './ui';

const blank = (type) => ({
  name: '', phone: '', address: '', area: '', opening_balance: 0, notes: '',
  ...(type === 'customer' ? { dob: '' } : { company: '' }),
  contacts: [],
});

/**
 * Customer / Supplier create-edit form.
 * - "quick" mode (POS): Name, Phone, optional DOB, Address — nothing else.
 * - full mode: plus dynamic "Add another" contact rows (extra phones, email, other).
 */
export default function PartyForm({ type = 'customer', open, onClose, onSaved, editId = null, quick = false, initialName = '' }) {
  const [f, setF] = useState(blank(type));
  const [busy, setBusy] = useState(false);
  const path = type === 'customer' ? '/customers' : '/suppliers';

  useEffect(() => {
    if (!open) return;
    if (editId) {
      api.get(`${path}/${editId}`).then((r) => {
        const d = r.data;
        setF({ ...blank(type), ...d, dob: d.dob || '', contacts: (d.contacts || []).filter((c) => !(c.type === 'phone' && c.value === d.phone)) });
      });
    } else {
      const isPhone = /^\+?\d[\d\s-]{5,}$/.test(initialName);
      setF({ ...blank(type), name: isPhone ? '' : initialName, phone: isPhone ? initialName : '' });
    }
  }, [open, editId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setContact = (i, k, v) => setF({ ...f, contacts: f.contacts.map((c, j) => (j === i ? { ...c, [k]: v } : c)) });
  const addContact = () => setF({ ...f, contacts: [...f.contacts, { type: 'phone', label: '', value: '' }] });
  const removeContact = (i) => setF({ ...f, contacts: f.contacts.filter((_, j) => j !== i) });

  const save = async () => {
    if (!f.name.trim()) return toast.error('Name is required');
    setBusy(true);
    try {
      const contacts = [
        ...(f.phone ? [{ type: 'phone', label: 'Primary', value: f.phone }] : []),
        ...f.contacts.filter((c) => c.value?.trim()),
      ];
      const body = { ...f, contacts, dob: f.dob || null };
      const { data } = editId ? await api.put(`${path}/${editId}`, body) : await api.post(path, body);
      toast.success(editId ? 'Saved' : `${type === 'customer' ? 'Customer' : 'Supplier'} added`);
      onSaved?.(editId ? { id: editId, ...body } : data);
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const title = `${editId ? 'Edit' : quick ? 'Quick add' : 'New'} ${type}`;
  return (
    <Modal open={open} onClose={onClose} title={title} size={quick ? 'sm' : 'md'}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner className="h-4 w-4 text-white" />} Save</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *" className="sm:col-span-2"><input className="input" autoFocus value={f.name} onChange={set('name')} /></Field>
        <Field label="Phone number"><input className="input" inputMode="tel" placeholder="01XXXXXXXXX" value={f.phone || ''} onChange={set('phone')} /></Field>
        {type === 'customer'
          ? <Field label="Date of birth (optional)" hint="Used for automatic birthday SMS"><input type="date" className="input" value={f.dob || ''} onChange={set('dob')} /></Field>
          : <Field label="Company / Shop"><input className="input" value={f.company || ''} onChange={set('company')} /></Field>}
        <Field label="Address" className="sm:col-span-2"><input className="input" value={f.address || ''} onChange={set('address')} /></Field>

        {!quick && (
          <>
            <Field label="Area / Market" hint="Used to filter ledgers by address"><input className="input" value={f.area || ''} onChange={set('area')} /></Field>
            <Field label={type === 'customer' ? 'Opening due (customer owes)' : 'Opening payable (you owe)'}><input type="number" className="input" value={f.opening_balance} onChange={set('opening_balance')} /></Field>

            <div className="sm:col-span-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label mb-0">Other contact details</span>
                <button type="button" className="btn-ghost btn-sm text-ocean-600" onClick={addContact}><Plus className="h-3.5 w-3.5" /> Add another</button>
              </div>
              <div className="space-y-2">
                {f.contacts.map((c, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={i} className="flex gap-2">
                    <select className="input w-28 shrink-0" value={c.type} onChange={(e) => setContact(i, 'type', e.target.value)}>
                      <option value="phone">Phone</option><option value="email">Email</option><option value="address">Address</option><option value="other">Other</option>
                    </select>
                    <input className="input w-28 shrink-0" placeholder="Label" value={c.label || ''} onChange={(e) => setContact(i, 'label', e.target.value)} />
                    <input className="input" placeholder="Value" value={c.value} onChange={(e) => setContact(i, 'value', e.target.value)} />
                    <button type="button" className="btn-ghost px-2.5 text-rose-500" onClick={() => removeContact(i)} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                {!f.contacts.length && <p className="text-xs text-slate-400">Add extra phone numbers, email or other details with “Add another”.</p>}
              </div>
            </div>
            <Field label="Notes" className="sm:col-span-2"><input className="input" value={f.notes || ''} onChange={set('notes')} /></Field>
          </>
        )}
      </div>
    </Modal>
  );
}
