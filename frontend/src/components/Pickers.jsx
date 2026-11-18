import { useEffect, useRef, useState } from 'react';
import { Search, Package, Banknote, Smartphone, Building2, CreditCard } from 'lucide-react';
import api, { fileUrl } from '../api/client';
import { useDebounced } from './ui';
import { tk, variantLabel, cls } from '../utils/format';
import useApi from '../hooks/useApi';
import Select from './ui/Select';

/** Icon per account type, used in account drop-downs */
export const ACCOUNT_ICONS = { cash: Banknote, mfs: Smartphone, bank: Building2, card: CreditCard };

/** Search-as-you-type picker for customers / suppliers. */
export function PartyPicker({ type = 'customer', value, onChange, placeholder, allowClear = true }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const dq = useDebounced(q, 250);
  const ref = useRef(null);
  const path = type === 'customer' ? '/customers' : '/suppliers';

  useEffect(() => {
    if (!open) return;
    api.get(path, { params: { q: dq, limit: 15 } }).then((r) => setList(r.data.data)).catch(() => {});
  }, [dq, open, path]);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9"
          placeholder={value ? '' : placeholder || `Search ${type} by name / phone`}
          value={open ? q : value ? `${value.name}${value.phone ? ` · ${value.phone}` : ''}` : ''}
          onFocus={() => { setOpen(true); setQ(''); }}
          onChange={(e) => setQ(e.target.value)}
        />
        {allowClear && value && !open && (
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 text-xs text-slate-400 hover:text-rose-500" onClick={() => onChange(null)}>clear</button>
        )}
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {list.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">{q ? 'No match' : `No ${type}s yet — use + to add one`}</p>}
          {list.map((p) => (
            <button type="button" key={p.id} onClick={() => { onChange(p); setOpen(false); }} className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-ocean-50 dark:hover:bg-slate-800">
              <span className="min-w-0"><span className="block truncate font-medium">{p.name}</span><span className="text-xs text-slate-500">{p.phone || p.company || p.address || ''}</span></span>
              {Number(p.balance) !== 0
                ? <span className={cls('shrink-0 text-right text-xs font-semibold', p.balance > 0 ? 'text-rose-600' : 'text-emerald-600')}><span className="block text-[10px] font-medium uppercase text-slate-400">{p.balance > 0 ? (type === 'supplier' ? 'Due' : 'Owes') : 'Advance'}</span>{tk(Math.abs(p.balance))}</span>
                : type === 'supplier' && <span className="shrink-0 text-[11px] text-slate-400">No due</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Product variant search (name / SKU / barcode). Enter on an exact barcode
 * adds immediately — works with USB/Bluetooth barcode scanners.
 */
export function ProductPicker({ onPick, placeholder = 'Search product, SKU or scan barcode…', autoFocus = false, inputRef }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const dq = useDebounced(q, 200);
  const ref = useRef(null);

  useEffect(() => {
    if (!dq.trim()) { setList([]); return; }
    api.get('/products', { params: { q: dq, limit: 20 } }).then((r) => { setList(r.data.data); setHi(0); }).catch(() => {});
  }, [dq]);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (p) => { onPick(p); setQ(''); setList([]); setOpen(false); };

  const onKey = async (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = q.trim();
      if (!code) return;
      try {
        const { data } = await api.get(`/products/lookup/${encodeURIComponent(code)}`);
        pick(data);
      } catch {
        if (list[hi]) pick(list[hi]);
      }
    }
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="relative flex-1" ref={ref}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      <input ref={inputRef} autoFocus={autoFocus} className="input h-12 pl-11 text-base" placeholder={placeholder}
        value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey} />
      {open && list.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-96 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {list.map((p, i) => (
            <button type="button" key={p.variant_id} onMouseEnter={() => setHi(i)} onClick={() => pick(p)}
              className={cls('flex w-full items-center gap-3 px-3 py-2 text-left text-sm', i === hi ? 'bg-ocean-50 dark:bg-slate-800' : '')}>
              {p.image_path ? <img src={fileUrl(p.image_path)} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800"><Package className="h-5 w-5" /></span>}
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.name}</span><span className="text-xs text-slate-500">{[variantLabel(p), p.sku, p.brand].filter(Boolean).join(' · ')}</span></span>
              <span className="text-right"><span className="block font-semibold">{p.retail_price === null ? <span className="text-amber-600">No price</span> : tk(p.retail_price)}</span><span className={cls('text-xs', p.stock_qty <= 0 ? 'text-rose-500' : 'text-slate-500')}>Stock {p.stock_qty}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Select an active cash / bank / MFS account. */
export function AccountSelect({ value, onChange, className = '', filter }) {
  const { data } = useApi('/accounts');
  const list = (data?.data || []).filter((a) => a.is_active && (!filter || filter(a)));
  useEffect(() => {
    if (!value && list.length) onChange(list.find((a) => a.type === 'cash')?.id || list[0].id);
  }, [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Select className={cls('input', className)} value={value || ''} onChange={(e) => onChange(Number(e.target.value))}>
      {list.map((a) => <option key={a.id} value={a.id} data-icon={ACCOUNT_ICONS[a.type]} data-hint={tk(a.balance)}>{a.name} ({a.type.toUpperCase()})</option>)}
    </Select>
  );
}
