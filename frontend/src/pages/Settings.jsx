import { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { Settings as SettingsIcon, Save, Upload, Download, ShieldAlert, UserPlus, Pencil, Gift, MessageSquare, Store, Users, Database, KeyRound, Send, Cake, Crown } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fileUrl } from '../api/client';
import useApi from '../hooks/useApi';
import { settingsLoaded } from '../store';
import { PageHeader, Tabs, Field, Modal, Badge, Spinner } from '../components/ui';
import { fmtDateTime, tk, cls } from '../utils/format';
import { processLogo, blobName } from '../utils/image';
import Select from '../components/ui/Select';

const TABS = [['shop', 'Shop info'], ['loyalty', 'Loyalty'], ['sms', 'SMS'], ['owner', 'Owner alerts'], ['users', 'Users'], ['security', 'Security PIN'], ['data', 'Backup & Reset']];

export default function Settings() {
  const dispatch = useDispatch();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'shop');
  const { data, reload } = useApi('/settings');
  const [s, setS] = useState({});
  useEffect(() => { if (data) setS(data); }, [data]);

  const save = async (keys) => {
    try {
      const body = Object.fromEntries(keys.map((k) => [k, s[k]]));
      const { data: d } = await api.put('/settings', body);
      dispatch(settingsLoaded(d));
      toast.success('Settings saved');
    } catch (e) { toast.error(e.message); }
  };
  const bind = (k) => ({ value: s[k] ?? '', onChange: (e) => setS({ ...s, [k]: e.target.value }) });
  const toggle = (k) => ({ checked: s[k] === '1', onChange: (e) => setS({ ...s, [k]: e.target.checked ? '1' : '0' }) });

  return (
    <div>
      <PageHeader icon={SettingsIcon} title="Shop Setup" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'shop' && <ShopInfo s={s} bind={bind} toggle={toggle} save={save} onLogo={reload} />}
      {tab === 'loyalty' && (
        <Section icon={Gift} title="Customer loyalty points" onSave={() => save(['loyalty_enabled', 'loyalty_spend_per_point', 'loyalty_point_value', 'loyalty_min_redeem_points'])}>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-ocean-600" {...toggle('loyalty_enabled')} /> Loyalty program enabled</label>
          <Field label="Spend (Tk) to earn 1 point" hint="e.g. 100 → 1 point per 100 Tk; 10 → 1 point per 10 Tk"><input type="number" className="input" {...bind('loyalty_spend_per_point')} /></Field>
          <Field label="Value of 1 point when redeemed (Tk)"><input type="number" step="0.01" className="input" {...bind('loyalty_point_value')} /></Field>
          <Field label="Minimum points to redeem"><input type="number" className="input" {...bind('loyalty_min_redeem_points')} /></Field>
          <div className="rounded-xl bg-violet-50 p-3 text-sm text-violet-800 dark:bg-violet-900/20 dark:text-violet-200">
            Example: a {tk(2500)} bill earns <b>{Math.floor(2500 / (Number(s.loyalty_spend_per_point) || 100))}</b> points worth <b>{tk(Math.floor(2500 / (Number(s.loyalty_spend_per_point) || 100)) * (Number(s.loyalty_point_value) || 0))}</b>.
          </div>
        </Section>
      )}
      {tab === 'sms' && <Sms s={s} bind={bind} toggle={toggle} save={save} />}
      {tab === 'owner' && (
        <Section icon={Crown} title="Owner alerts on your mobile" onSave={() => save(['owner_phone', 'owner_daily_sms', 'big_sale_amount', 'big_sale_sms', 'online_default_delivery'])}>
          <Field label="Owner mobile number" hint="Summary and alert SMS go here"><input className="input" inputMode="tel" placeholder="01XXXXXXXXX" {...bind('owner_phone')} /></Field>
          <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" className="accent-ocean-600" {...toggle('owner_daily_sms')} /> SMS me yesterday's summary every morning</label>
          <Field label="Big sale amount (Tk)" hint="Bills at or above this are highlighted — 0 turns it off"><input type="number" min="0" className="input" {...bind('big_sale_amount')} /></Field>
          <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" className="accent-ocean-600" {...toggle('big_sale_sms')} /> SMS me right away on a big sale</label>
          <Field label="Default delivery charge for online orders (Tk)"><input type="number" min="0" className="input" {...bind('online_default_delivery')} /></Field>
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:col-span-2">
            The morning summary says: sales, bills, profit, expenses, dues collected, returns, new dues and any cash short at day closing. Low stock, overdue dues, short cash, late purchase orders and new online orders also show in the bell at the top and on the Owner Dashboard.
          </div>
        </Section>
      )}
      {tab === 'users' && <UsersTab />}
      {tab === 'security' && <PinTab pinSet={data?.security_pin_set} onDone={reload} />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}

function Section({ icon: Icon, title, children, onSave, extra }) {
  return (
    <div className="card max-w-3xl p-5">
      <p className="mb-4 flex items-center gap-2 font-bold"><Icon className="h-5 w-5 text-ocean-600" />{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
      {(onSave || extra) && <div className="mt-5 flex flex-wrap justify-end gap-2">{extra}{onSave && <button type="button" className="btn-primary" onClick={onSave}><Save className="h-4 w-4" /> Save</button>}</div>}
    </div>
  );
}

function ShopInfo({ s, bind, toggle, save, onLogo }) {
  const ref = useRef(null);
  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    try {
      const { blob } = await processLogo(f);
      const fd = new FormData(); fd.append('logo', blob, blobName(blob, 'logo'));
      await api.post('/settings/logo', fd); toast.success('Logo updated'); onLogo();
    } catch (err) { toast.error(err.message); }
  };
  return (
    <Section icon={Store} title="Shop information (receipts & labels)"
      onSave={() => save(['shop_name', 'shop_address', 'shop_phone', 'shop_email', 'shop_bin', 'invoice_footer', 'vat_percent', 'receipt_width_mm', 'allow_negative_stock', 'currency_symbol', 'shift_required', 'public_app_url'])}>
      <div className="flex items-center gap-4 sm:col-span-2">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700">{s.shop_logo ? <img src={fileUrl(s.shop_logo)} alt="" className="max-h-full max-w-full object-contain" /> : <Store className="h-8 w-8 text-slate-300" />}</div>
        <button type="button" className="btn-secondary" onClick={() => ref.current?.click()}><Upload className="h-4 w-4" /> Upload logo</button>
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={upload} />
      </div>
      <Field label="Shop name"><input className="input" {...bind('shop_name')} /></Field>
      <Field label="Phone"><input className="input" {...bind('shop_phone')} /></Field>
      <Field label="Address" className="sm:col-span-2"><input className="input" {...bind('shop_address')} /></Field>
      <Field label="Email"><input className="input" {...bind('shop_email')} /></Field>
      <Field label="VAT BIN"><input className="input" {...bind('shop_bin')} /></Field>
      <Field label="VAT %" hint="0 to disable"><input type="number" className="input" {...bind('vat_percent')} /></Field>
      <Field label="Receipt paper width"><Select className="input" {...bind('receipt_width_mm')}><option value="80">80 mm</option><option value="58">58 mm</option></Select></Field>
      <Field label="Receipt footer" className="sm:col-span-2"><input className="input" {...bind('invoice_footer')} /></Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-ocean-600" {...toggle('allow_negative_stock')} /> Allow selling when stock is 0 (negative stock)</label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-ocean-600" {...toggle('shift_required')} /> Cashiers must open a shift (Day Closing) before selling</label>
      <Field label="Public receipt link address" className="sm:col-span-2" hint="Where receipt links sent by SMS / WhatsApp open. Default: the BikriPro web app on GitHub Pages."><input className="input" placeholder="https://codewithroni.github.io/BikriPro/app/" {...bind('public_app_url')} /></Field>
    </Section>
  );
}

function Sms({ s, bind, toggle, save }) {
  const [phone, setPhone] = useState('');
  const test = async () => { try { const { data } = await api.post('/settings/sms/test', { phone }); toast[data.status === 'sent' ? 'success' : 'error'](`SMS ${data.status}${data.error ? `: ${data.error}` : ''}`); } catch (e) { toast.error(e.message); } };
  const birthdays = async () => { try { const { data } = await api.post('/settings/sms/birthdays'); toast.success(`Birthday wishes sent: ${data.sent ?? 0}`); } catch (e) { toast.error(e.message); } };
  return (
    <Section icon={MessageSquare} title="SMS notifications"
      onSave={() => save(['sms_on_sale', 'sms_birthday', 'sms_sale_template', 'sms_birthday_template', 'sms_due_reminder', 'sms_due_repeat_days', 'sms_due_template', 'sms_receipt_template'])}
      extra={<button type="button" className="btn-secondary" onClick={birthdays}><Cake className="h-4 w-4" /> Send today's birthday wishes now</button>}>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ocean-600" {...toggle('sms_on_sale')} /> SMS customer after every purchase</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ocean-600" {...toggle('sms_birthday')} /> Automatic birthday wishes (daily)</label>
      <Field label="Purchase SMS template" className="sm:col-span-2" hint="Placeholders: {name} {shop} {invoice} {total} {paid} {due} {points}"><textarea rows={3} className="input" {...bind('sms_sale_template')} /></Field>
      <Field label="Birthday SMS template" className="sm:col-span-2" hint="Placeholders: {name} {shop}"><textarea rows={2} className="input" {...bind('sms_birthday_template')} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ocean-600" {...toggle('sms_due_reminder')} /> Automatic due reminder on the next payment date</label>
      <Field label="Repeat for overdue dues every" hint="0 = remind only on the date">
        <Select className="input" {...bind('sms_due_repeat_days')}><option value="0">Don't repeat</option><option value="1">1 day</option><option value="2">2 days</option><option value="3">3 days</option><option value="7">7 days</option></Select>
      </Field>
      <Field label="Due reminder template" className="sm:col-span-2" hint="Placeholders: {name} {shop} {due} {date}"><textarea rows={2} className="input" {...bind('sms_due_template')} /></Field>
      <Field label="Receipt link SMS template" className="sm:col-span-2" hint="Placeholders: {name} {shop} {invoice} {total} {link}"><textarea rows={2} className="input" {...bind('sms_receipt_template')} /></Field>
      <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:col-span-2">
        SMS gateway (BulkSMSBD, SSL Wireless, Alpha SMS…) is configured on the server in <code>backend/.env</code> (SMS_PROVIDER, SMS_API_URL, SMS_API_KEY, SMS_SENDER_ID). Until then messages are only logged — see Report Hub → SMS log.
      </div>
      <Field label="Send a test SMS"><div className="flex gap-2"><input className="input" placeholder="01XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} /><button type="button" className="btn-secondary" onClick={test}><Send className="h-4 w-4" /></button></div></Field>
    </Section>
  );
}

function UsersTab() {
  const { data, reload } = useApi('/users');
  const branches = useApi('/branches');
  const brList = (branches.data?.data || []).filter((b) => b.is_active);
  const [u, setU] = useState(null);
  const save = async () => {
    try { if (u.id) await api.put(`/users/${u.id}`, u); else await api.post('/users', u); toast.success('Saved'); setU(null); reload(); } catch (e) { toast.error(e.message); }
  };
  return (
    <div className="max-w-4xl">
      <div className="mb-3 flex justify-end"><button type="button" className="btn-primary" onClick={() => setU({ name: '', username: '', phone: '', password: '', role: 'cashier', is_active: 1 })}><UserPlus className="h-4 w-4" /> Add user</button></div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Name</th><th>Username</th><th>Role</th>{brList.length > 1 && <th>Branch</th>}<th>Status</th><th>Last login</th><th /></tr></thead>
        <tbody>{data?.map((x) => (
          <tr key={x.id}><td className="font-semibold">{x.name}<div className="text-xs font-normal text-slate-500">{x.phone}</div></td><td>{x.username}</td>
            <td><Badge tone={{ admin: 'rose', manager: 'ocean', cashier: 'slate' }[x.role]}>{x.role}</Badge></td>
            {brList.length > 1 && <td>{x.branch_name || <span className="text-slate-400">{x.role === 'admin' ? 'All' : 'Main'}</span>}</td>}
            <td>{x.is_active ? <Badge tone="green">active</Badge> : <Badge>disabled</Badge>}</td><td className="text-slate-500">{fmtDateTime(x.last_login_at)}</td>
            <td><button type="button" className="btn-ghost btn-sm" onClick={() => setU({ ...x, password: '' })}><Pencil className="h-4 w-4" /></button></td></tr>
        ))}</tbody>
      </table></div>
      <p className="mt-3 text-xs text-slate-500"><b>Cashier</b>: POS, sales, customers, collections, labels · <b>Manager</b>: + purchases, returns, suppliers, payments, prices, reports · <b>Admin</b>: everything incl. settings, users, backup &amp; reset.</p>
      <Modal open={!!u} onClose={() => setU(null)} title={u?.id ? 'Edit user' : 'Add user'} size="sm" footer={<><button type="button" className="btn-secondary" onClick={() => setU(null)}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Save</button></>}>
        {u && <div className="space-y-3">
          <Field label="Full name"><input className="input" value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} /></Field>
          {!u.id && <Field label="Username"><input className="input" value={u.username} onChange={(e) => setU({ ...u, username: e.target.value })} /></Field>}
          <Field label="Phone"><input className="input" value={u.phone || ''} onChange={(e) => setU({ ...u, phone: e.target.value })} /></Field>
          <Field label="Role"><Select className="input" value={u.role} onChange={(e) => setU({ ...u, role: e.target.value })}><option value="cashier">Cashier</option><option value="manager">Manager</option><option value="admin">Admin</option></Select></Field>
          {brList.length > 1 && (
            <Field label="Works in branch" hint={u.role === 'admin' ? 'Admins can switch branch from the top bar' : 'This user sells and sees stock of this branch only'}>
              <Select className="input" value={String(u.branch_id || '')} onChange={(e) => setU({ ...u, branch_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Main branch</option>
                {brList.filter((b) => !b.is_main).map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label={u.id ? 'New password (leave blank to keep)' : 'Password'}><input type="password" className="input" value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} /></Field>
          {u.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ocean-600" checked={!!u.is_active} onChange={(e) => setU({ ...u, is_active: e.target.checked ? 1 : 0 })} /> Active</label>}
        </div>}
      </Modal>
    </div>
  );
}

function PinTab({ pinSet, onDone }) {
  const [f, setF] = useState({ new_pin: '', password: '' });
  const save = async () => { try { await api.post('/settings/pin', f); toast.success('Security PIN updated'); setF({ new_pin: '', password: '' }); onDone(); } catch (e) { toast.error(e.message); } };
  return (
    <Section icon={KeyRound} title="Security PIN" onSave={save}>
      <p className="text-sm text-slate-500 sm:col-span-2">The PIN protects database restore and reset. {pinSet ? 'A PIN is set (default after install is 1234 — change it!).' : 'No PIN set yet.'}</p>
      <Field label="New PIN (4–8 digits)"><input type="password" inputMode="numeric" className="input" value={f.new_pin} onChange={(e) => setF({ ...f, new_pin: e.target.value.replace(/\D/g, '') })} /></Field>
      <Field label="Your login password"><input type="password" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
    </Section>
  );
}

const MODULE_LABELS = {
  customers: 'Customers (profiles, collections, loyalty; sales are kept)', sales: 'Sales, returns, held invoices & collections',
  purchases: 'Purchases, purchase returns & supplier payments', suppliers: 'Suppliers & their ledgers', products: 'Products & variants',
  expenses: 'Expenses', staff: 'Staff, attendance & salary', sms_logs: 'SMS log', activity_logs: 'Activity log',
};

function DataTab() {
  const modules = useApi('/settings/reset/modules');
  const fileRef = useRef(null);
  const [restore, setRestore] = useState(null);
  const [reset, setReset] = useState(null);
  const [busy, setBusy] = useState(false);

  const exportDb = async () => {
    try {
      const res = await api.get('/settings/backup/export', { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(res.data);
      a.download = `bikripro-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      toast.success('Backup downloaded');
    } catch (e) { toast.error(e.message); }
  };
  const doRestore = async () => {
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', restore.file); fd.append('pin', restore.pin);
      const { data } = await api.post('/settings/backup/import', fd, { timeout: 300000 });
      toast.success(`Restored backup from ${fmtDateTime(data.exported_at)}`);
      setRestore(null);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const doReset = async () => {
    setBusy(true);
    try { const { data } = await api.post('/settings/reset', reset); toast.success(`Reset: ${data.modules.join(', ')}`); setReset(null); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <p className="mb-2 flex items-center gap-2 font-bold"><Database className="h-5 w-5 text-ocean-600" /> Backup & restore</p>
        <p className="mb-4 text-sm text-slate-500">Export the whole database to a file. Keep copies on a USB drive / Google Drive. Restore replaces <b>all</b> current data.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={exportDb}><Download className="h-4 w-4" /> Export database</button>
          <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Import / restore</button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setRestore({ file: e.target.files[0], pin: '' }); e.target.value = ''; }} />
        </div>
      </div>
      <div className="card border-rose-200 p-5 dark:border-rose-900/60">
        <p className="mb-2 flex items-center gap-2 font-bold text-rose-600"><ShieldAlert className="h-5 w-5" /> Reset / wipe data</p>
        <p className="mb-4 text-sm text-slate-500">Start fresh by wiping selected modules. Users, settings and accounts are kept. <b>Export a backup first.</b></p>
        <button type="button" className="btn-danger" onClick={() => setReset({ modules: [], pin: '', confirm_text: '' })}>Reset modules…</button>
      </div>

      <Modal open={!!restore} onClose={() => setRestore(null)} title="Restore database" size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setRestore(null)}>Cancel</button><button type="button" className="btn-danger" disabled={busy || !restore?.pin} onClick={doRestore}>{busy && <Spinner className="h-4 w-4 text-white" />} Replace all data</button></>}>
        {restore && <div className="space-y-3">
          <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">All current data will be replaced by <b>{restore.file.name}</b>. This cannot be undone.</p>
          <Field label="Security PIN"><input type="password" inputMode="numeric" className="input" autoFocus value={restore.pin} onChange={(e) => setRestore({ ...restore, pin: e.target.value })} /></Field>
        </div>}
      </Modal>

      <Modal open={!!reset} onClose={() => setReset(null)} title="Reset selected modules" size="md"
        footer={<><button type="button" className="btn-secondary" onClick={() => setReset(null)}>Cancel</button><button type="button" className="btn-danger" disabled={busy || !reset?.modules.length || !reset?.pin || reset?.confirm_text !== 'RESET'} onClick={doReset}>{busy && <Spinner className="h-4 w-4 text-white" />} Wipe permanently</button></>}>
        {reset && <div className="space-y-3">
          <div className="space-y-1.5">
            {(modules.data || []).map((m) => (
              <label key={m} className={cls('flex items-start gap-2 rounded-xl border p-2.5 text-sm', reset.modules.includes(m) ? 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/20' : 'border-slate-200 dark:border-slate-700')}>
                <input type="checkbox" className="mt-0.5 accent-rose-600" checked={reset.modules.includes(m)} onChange={(e) => setReset({ ...reset, modules: e.target.checked ? [...reset.modules, m] : reset.modules.filter((x) => x !== m) })} />
                <span><b className="capitalize">{m.replace('_', ' ')}</b><span className="block text-xs text-slate-500">{MODULE_LABELS[m]}</span></span>
              </label>
            ))}
          </div>
          <Field label="Security PIN"><input type="password" inputMode="numeric" className="input" value={reset.pin} onChange={(e) => setReset({ ...reset, pin: e.target.value })} /></Field>
          <Field label='Type "RESET" to confirm'><input className="input" value={reset.confirm_text} onChange={(e) => setReset({ ...reset, confirm_text: e.target.value })} /></Field>
        </div>}
      </Modal>
    </div>
  );
}
