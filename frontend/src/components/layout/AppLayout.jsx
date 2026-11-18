import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Menu, Sun, Moon, Bell, LogOut, KeyRound, ChevronDown, Cake } from 'lucide-react';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import { NAV } from './nav';
import api from '../../api/client';
import { toggleTheme, setMobileNav, loggedOut, settingsLoaded } from '../../store';
import { cls, tk } from '../../utils/format';
import { Modal, Field } from '../ui';

export default function AppLayout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const collapsed = useSelector((s) => s.ui.sidebarCollapsed);
  const theme = useSelector((s) => s.ui.theme);
  const user = useSelector((s) => s.auth.user);
  const [alerts, setAlerts] = useState({ due: [], birthdays: [] });
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const menuRef = useRef(null);

  const current = pathname.startsWith('/product-setup') ? { label: 'Product Setup' } : NAV.find((n) => pathname.startsWith(n.to));

  useEffect(() => {
    api.get('/settings').then((r) => dispatch(settingsLoaded(r.data))).catch(() => {});
  }, [dispatch]);

  // Due collection reminders in the top bar (refresh every 5 min)
  useEffect(() => {
    const load = () => api.get('/dashboard').then((r) => setAlerts({ due: r.data.due_reminders, birthdays: r.data.birthdays })).catch(() => {});
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [pathname === '/dashboard']); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) { setMenu(false); setBell(false); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const logout = () => { dispatch(loggedOut()); navigate('/login'); };
  const alertCount = alerts.due.length + alerts.birthdays.length;
  const isPos = pathname.startsWith('/pos');

  return (
    <div className="min-h-full">
      <Sidebar />
      <div className={cls('flex min-h-screen flex-col transition-all duration-300 ease-in-out', collapsed ? 'lg:pl-[4.75rem]' : 'lg:pl-64')}>
        {/* Top bar */}
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/85 sm:px-6">
          <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden" onClick={() => dispatch(setMobileNav(true))} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <h2 className="truncate text-base font-bold text-slate-800 dark:text-white">{current?.label || 'BikriPro'}</h2>
          <div className="ml-auto flex items-center gap-1.5" ref={menuRef}>
            <div className="relative">
              <button type="button" onClick={() => { setBell(!bell); setMenu(false); }} className="relative rounded-xl p-2.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                {alertCount > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{alertCount}</span>}
              </button>
              {bell && (
                <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <p className="border-b border-slate-100 px-4 py-3 text-sm font-bold dark:border-slate-800">Due Collection Reminders</p>
                  <div className="max-h-80 overflow-y-auto">
                    {alerts.due.length === 0 && alerts.birthdays.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">All caught up 🎉</p>}
                    {alerts.due.map((d) => (
                      <button type="button" key={d.customer_id} onClick={() => { setBell(false); navigate(`/collection?customer=${d.customer_id}`); }} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                        <span className="min-w-0"><span className="block truncate font-semibold">{d.name}</span><span className="text-xs text-slate-500">{d.days_overdue > 0 ? `${d.days_overdue} day(s) overdue` : 'Due today'} · {d.phone}</span></span>
                        <span className="shrink-0 font-bold text-rose-600">{tk(d.due_amount)}</span>
                      </button>
                    ))}
                    {alerts.birthdays.map((b) => (
                      <div key={b.id} className="flex items-center gap-2 px-4 py-2.5 text-sm"><Cake className="h-4 w-4 text-pink-500" /> <b>{b.name}</b> has a birthday today</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button type="button" onClick={() => dispatch(toggleTheme())} className="rounded-xl p-2.5 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Toggle theme" title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <div className="relative">
              <button type="button" onClick={() => { setMenu(!menu); setBell(false); }} className="flex items-center gap-2 rounded-xl py-1.5 pl-1.5 pr-2 hover:bg-slate-100 dark:hover:bg-slate-800">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ocean-600 text-sm font-bold text-white">{user?.name?.[0]?.toUpperCase()}</span>
                <span className="hidden text-left sm:block"><span className="block text-sm font-semibold leading-tight">{user?.name}</span><span className="block text-[11px] capitalize text-slate-500">{user?.role}</span></span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {menu && (
                <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <button type="button" onClick={() => { setMenu(false); setPwOpen(true); }} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"><KeyRound className="h-4 w-4" /> Change password</button>
                  <button type="button" onClick={logout} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"><LogOut className="h-4 w-4" /> Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className={cls('flex-1', isPos ? 'p-2 sm:p-3' : 'p-4 sm:p-6')}>
          <Outlet />
        </main>
      </div>
      <ChangePassword open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function ChangePassword({ open, onClose }) {
  const [f, setF] = useState({ current_password: '', new_password: '' });
  const save = async () => {
    try { await api.post('/auth/change-password', f); toast.success('Password changed'); onClose(); setF({ current_password: '', new_password: '' }); } catch (e) { toast.error(e.message); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Change password" size="sm" footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" onClick={save}>Save</button></>}>
      <div className="space-y-3">
        <Field label="Current password"><input type="password" className="input" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} /></Field>
        <Field label="New password" hint="At least 6 characters"><input type="password" className="input" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
