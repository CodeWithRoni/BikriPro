import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate, useNavigate } from 'react-router-dom';
import { Server, Sun, Moon, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getServerUrl, setServerUrl } from '../api/client';
import { loggedIn, toggleTheme } from '../store';
import { Modal, Field, Spinner } from '../components/ui';

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = useSelector((s) => s.auth.token);
  const theme = useSelector((s) => s.ui.theme);
  const [f, setF] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [shop, setShop] = useState(null);
  const [srvOpen, setSrvOpen] = useState(false);
  const [srv, setSrv] = useState(getServerUrl());

  useEffect(() => { api.get('/settings/public').then((r) => setShop(r.data)).catch(() => setShop(null)); }, [srvOpen]);

  if (token) return <Navigate to="/pos" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login', f);
      dispatch(loggedIn(data));
      navigate('/pos');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-ocean-50 via-white to-sky-100 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-ocean-950">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-ocean-300/30 blur-3xl dark:bg-ocean-700/20" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-sky-300/30 blur-3xl dark:bg-sky-800/20" />
      <div className="absolute right-4 top-4 flex gap-2">
        <button type="button" className="btn-ghost" onClick={() => setSrvOpen(true)}><Server className="h-4 w-4" /> Server</button>
        <button type="button" className="btn-ghost" onClick={() => dispatch(toggleTheme())} aria-label="Toggle theme">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
      </div>

      <form onSubmit={submit} className="card relative w-full max-w-sm p-7 shadow-pop">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="./logo.png" alt="BikriPro" className="mb-3 h-14 object-contain dark:rounded-xl dark:bg-white dark:px-3 dark:py-1" />
          <p className="text-sm text-slate-500">{shop?.shop_name ? `Welcome to ${shop.shop_name}` : 'Sign in to your shop'}</p>
        </div>
        <div className="space-y-3.5">
          <Field label="Username"><input className="input" autoFocus autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
          <Field label="Password"><input type="password" className="input" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <button type="submit" className="btn-primary w-full py-3" disabled={busy || !f.username || !f.password}>
            {busy ? <Spinner className="h-4 w-4 text-white" /> : <LogIn className="h-4 w-4" />} Sign in
          </button>
        </div>
        {!shop && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Server not reachable. Tap “Server” to set the address of the shop's BikriPro server (e.g. http://192.168.0.10:5000).</p>}
      </form>

      <Modal open={srvOpen} onClose={() => setSrvOpen(false)} title="Server settings" size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => { setServerUrl(''); setSrv(getServerUrl()); toast.success('Reset to default'); }}>Reset</button><button type="button" className="btn-primary" onClick={() => { setServerUrl(srv); setSrvOpen(false); toast.success('Server address saved'); }}>Save</button></>}>
        <Field label="BikriPro server address" hint="The computer running the BikriPro backend. Mobile/tablet apps must use its network IP, not localhost.">
          <input className="input" placeholder="http://192.168.0.10:5000" value={srv} onChange={(e) => setSrv(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
