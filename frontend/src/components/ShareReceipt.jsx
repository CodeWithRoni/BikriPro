import { useState } from 'react';
import { useSelector } from 'react-redux';
import { MessageCircle, MessageSquareText, Link2, ExternalLink, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { Spinner } from './ui';
import { cls } from '../utils/format';

/** Public link to a receipt, opened from the shop's web app (works on any phone, no login). */
export function receiptUrl(token, settings) {
  let base = settings?.public_app_url || '';
  if (!base && /^https?:/.test(window.location.protocol) && !/localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    base = `${window.location.origin}${window.location.pathname}`;
  }
  if (!base) base = 'https://codewithroni.github.io/BikriPro/app/';
  return `${base.replace(/#.*$/, '').replace(/\/?$/, '/')}#/r/${token}`;
}

/** 01XXXXXXXXX → 8801XXXXXXXXX for wa.me */
const waPhone = (p) => {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('01') && d.length === 11) d = `88${d}`;
  return /^8801\d{9}$/.test(d) ? d : '';
};

/**
 * Buttons to send a receipt: WhatsApp, SMS (through the shop's SMS gateway), copy link, open.
 * `sale` needs id, invoice_no, grand_total and optionally customer { name, phone }.
 */
export default function ShareReceipt({ sale, compact = false }) {
  const settings = useSelector((s) => s.settings.data);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  if (!sale?.id) return null;
  const phone = sale.customer && !sale.customer.is_walk_in ? sale.customer.phone : '';

  const link = async () => {
    const { data } = await api.post(`/sales/${sale.id}/share`);
    return receiptUrl(data.token, settings);
  };
  const run = async (kind, fn) => {
    setBusy(kind);
    try { await fn(); } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  const whatsapp = () => run('wa', async () => {
    const url = await link();
    const text = `${settings.shop_name || 'Shop'} — Invoice ${sale.invoice_no}\nTotal: ৳${sale.grand_total}\nReceipt: ${url}`;
    const to = waPhone(phone);
    window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  });
  const sms = () => run('sms', async () => {
    let to = phone;
    if (!to) {
      to = window.prompt('Customer mobile number (01XXXXXXXXX)');
      if (!to) return;
    }
    const url = await link();
    await api.post(`/sales/${sale.id}/sms-receipt`, { link: url, phone: to });
    toast.success('Receipt link sent by SMS');
  });
  const copy = () => run('copy', async () => {
    const url = await link();
    try { await navigator.clipboard.writeText(url); } catch { window.prompt('Copy this link', url); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Receipt link copied');
  });
  const open = () => run('open', async () => { window.open(await link(), '_blank', 'noopener'); });

  const btn = cls('btn-secondary', compact ? 'btn-sm' : 'flex-1');
  const icon = (k, I) => (busy === k ? <Spinner className="h-4 w-4" /> : <I className="h-4 w-4" />);
  return (
    <div className={cls('flex flex-wrap gap-2', !compact && 'w-full')}>
      <button type="button" className={cls(btn, 'text-emerald-700 dark:text-emerald-400')} onClick={whatsapp} disabled={!!busy}>{icon('wa', MessageCircle)} WhatsApp</button>
      <button type="button" className={btn} onClick={sms} disabled={!!busy}>{icon('sms', MessageSquareText)} SMS</button>
      <button type="button" className={btn} onClick={copy} disabled={!!busy}>{copied ? <Check className="h-4 w-4 text-emerald-600" /> : icon('copy', Link2)} {copied ? 'Copied' : 'Copy link'}</button>
      {!compact && <button type="button" className={btn} onClick={open} disabled={!!busy}>{icon('open', ExternalLink)} Open</button>}
    </div>
  );
}
