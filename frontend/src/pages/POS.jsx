import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  PauseCircle, ListRestart, UserPlus, Printer, CheckCircle2, Trash2, Star, Plus, Minus, Package,
  ShoppingCart, X, Gift, CalendarClock, Clock, Flame, Heart, Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fileUrl } from '../api/client';
import useApi from '../hooks/useApi';
import { ProductPicker, PartyPicker } from '../components/Pickers';
import PartyForm from '../components/PartyForm';
import { Modal, Empty, Spinner } from '../components/ui';
import { Receipt, printNode } from '../components/receipt/Receipt';
import { tk, num, addDays, todayStr, variantLabel, cls, fmtDateTime } from '../utils/format';

// ---------------- cart state ----------------
const EMPTY = { items: [], customer: null, invoiceDiscount: '', roundOff: '', pointsRedeem: '', note: '', holdId: null };

function reducer(state, a) {
  switch (a.type) {
    case 'add': {
      const p = a.product;
      const i = state.items.findIndex((x) => x.variant_id === p.variant_id);
      if (i >= 0) return { ...state, items: state.items.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)) };
      return {
        ...state,
        items: [...state.items, {
          variant_id: p.variant_id, name: p.name, label: variantLabel(p), sku: p.sku, image_path: p.image_path,
          unit_price: p.retail_price ?? '', stock: p.stock_qty, qty: 1, discount: '',
        }],
      };
    }
    case 'set': return { ...state, items: state.items.map((x) => (x.variant_id === a.id ? { ...x, [a.key]: a.value } : x)) };
    case 'qty': return { ...state, items: state.items.map((x) => (x.variant_id === a.id ? { ...x, qty: Math.max(1, x.qty + a.delta) } : x)) };
    case 'remove': return { ...state, items: state.items.filter((x) => x.variant_id !== a.id) };
    case 'field': return { ...state, [a.key]: a.value };
    case 'load': return { ...EMPTY, ...a.cart };
    case 'clear': return EMPTY;
    default: return state;
  }
}

const loadSaved = () => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem('bp_pos_cart')) }; } catch { return EMPTY; } };
const n = (v) => Number(v) || 0;

const DUE_PRESETS = [['3 days', 3], ['7 days', 7], ['15 days', 15], ['1 month', 30]];

export default function POS() {
  const settings = useSelector((s) => s.settings.data);
  const [cart, dispatch] = useReducer(reducer, undefined, loadSaved);
  const [tab, setTab] = useState('recent');
  const [cartOpen, setCartOpen] = useState(false); // mobile bottom sheet
  const [quickAdd, setQuickAdd] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [payments, setPayments] = useState([]); // [{account_id, amount, trx_ref}]
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // completed sale
  const [printSale, setPrintSale] = useState(null);
  const searchRef = useRef(null);

  const grid = useApi('/products/pos-grid');
  const accounts = useApi('/accounts');
  const held = useApi('/sales/held');
  const accList = (accounts.data?.data || []).filter((a) => a.is_active);
  const cashAcc = accList.find((a) => a.type === 'cash');

  useEffect(() => { localStorage.setItem('bp_pos_cart', JSON.stringify(cart)); }, [cart]);

  // Keyboard shortcuts: F2 search · F8 hold · F9 complete · F10 complete & print
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F8') { e.preventDefault(); hold(); }
      if (e.key === 'F9') { e.preventDefault(); complete(false); }
      if (e.key === 'F10') { e.preventDefault(); complete(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- totals ----------
  const t = useMemo(() => {
    const subtotal = cart.items.reduce((s, i) => s + n(i.qty) * n(i.unit_price), 0);
    const itemDiscount = cart.items.reduce((s, i) => s + n(i.discount), 0);
    const taxable = subtotal - itemDiscount - n(cart.invoiceDiscount);
    const vat = Math.round(taxable * n(settings.vat_percent)) / 100;
    const pointValue = n(cart.pointsRedeem) * n(settings.loyalty_point_value || 1);
    const grand = Math.max(Math.round((taxable + vat - n(cart.roundOff) - pointValue) * 100) / 100, 0);
    const tendered = payments.reduce((s, p) => s + n(p.amount), 0);
    const paid = Math.min(tendered, grand);
    return { subtotal, itemDiscount, vat, pointValue, grand, tendered, paid, change: Math.max(tendered - grand, 0), due: Math.max(grand - tendered, 0), qty: cart.items.reduce((s, i) => s + n(i.qty), 0) };
  }, [cart, payments, settings]);

  // Default: full cash payment that follows the total until the cashier edits it
  const [payTouched, setPayTouched] = useState(false);
  useEffect(() => {
    if (!payTouched && cashAcc) setPayments([{ account_id: cashAcc.id, amount: t.grand ? String(t.grand) : '', trx_ref: '' }]);
  }, [t.grand, cashAcc?.id, payTouched]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPay = (i, k, v) => { setPayTouched(true); setPayments((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p))); };
  const addPay = (acc) => {
    setPayTouched(true);
    setPayments((ps) => {
      const remaining = Math.max(t.grand - ps.reduce((s, p) => s + n(p.amount), 0), 0);
      return [...ps, { account_id: acc.id, amount: remaining ? String(remaining) : '', trx_ref: '' }];
    });
  };
  const payOnly = (acc) => { setPayTouched(true); setPayments([{ account_id: acc.id, amount: String(t.grand), trx_ref: '' }]); };

  const add = (p) => {
    if (p.retail_price === null) toast('No selling price set — enter it in the cart', { icon: '⚠️' });
    if (p.stock_qty <= 0) toast(`${p.name} is out of stock`, { icon: '📦' });
    dispatch({ type: 'add', product: p });
  };

  const reset = () => { dispatch({ type: 'clear' }); setPayments([]); setPayTouched(false); setDueDate(''); };

  const hold = async () => {
    if (!cart.items.length) return toast.error('Cart is empty');
    try {
      await api.post('/sales/hold', { cart, customer_id: cart.customer?.id || null, note: cart.note || null });
      if (cart.holdId) await api.delete(`/sales/held/${cart.holdId}`);
      toast.success('Invoice held');
      reset();
      held.reload();
    } catch (e) { toast.error(e.message); }
  };

  const retrieve = async (h) => {
    try {
      const { data } = await api.get(`/sales/held/${h.id}`);
      if (cart.items.length && !window.confirm('Replace the current cart with this held invoice?')) return;
      dispatch({ type: 'load', cart: { ...data.cart, holdId: h.id } });
      setPayTouched(false);
      setHeldOpen(false);
      toast.success(`${h.hold_ref} retrieved`);
    } catch (e) { toast.error(e.message); }
  };

  const complete = async (print) => {
    if (busy) return;
    if (!cart.items.length) return toast.error('Cart is empty');
    if (cart.items.some((i) => i.unit_price === '' || i.unit_price === null)) return toast.error('Enter a price for every item');
    if (t.due > 0.009) {
      if (!cart.customer) return toast.error('Select a customer for a credit (due) sale');
      if (!dueDate) return toast.error('Select the next payment date');
    }
    setBusy(true);
    try {
      const { data } = await api.post('/sales', {
        customer_id: cart.customer?.id || null,
        items: cart.items.map((i) => ({ variant_id: i.variant_id, qty: n(i.qty), unit_price: n(i.unit_price), discount: n(i.discount) })),
        invoice_discount: n(cart.invoiceDiscount), round_off: n(cart.roundOff), points_redeem: n(cart.pointsRedeem),
        payments: payments.filter((p) => n(p.amount) > 0).map((p) => ({ ...p, amount: n(p.amount) })),
        next_payment_date: t.due > 0.009 ? dueDate : null, note: cart.note || null, hold_id: cart.holdId,
      });
      toast.success(`${data.invoice_no} completed`);
      reset();
      setCartOpen(false);
      grid.reload(); held.reload(); accounts.reload();
      if (print) { setPrintSale(data); printNode(); } else setDone(data);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const roundDown = (step) => {
    const before = t.grand + n(cart.roundOff);
    const r = Math.round((before % step) * 100) / 100;
    dispatch({ type: 'field', key: 'roundOff', value: r ? String(r) : '' });
  };

  const gridItems = grid.data?.[{ recent: 'recent', best: 'best_selling', fav: 'favorite' }[tab]] || [];
  const customerPoints = n(cart.customer?.loyalty_points);

  // ---------------- render ----------------
  const cartPanel = (
    <div className="flex h-full flex-col">
      {/* Customer */}
      <div className="border-b border-slate-100 p-3 dark:border-slate-800">
        <div className="flex gap-2">
          <div className="flex-1"><PartyPicker type="customer" value={cart.customer} onChange={(c) => dispatch({ type: 'field', key: 'customer', value: c })} placeholder="Walk-in customer — search…" /></div>
          <button type="button" className="btn-secondary px-3" title="Quick add customer" onClick={() => setQuickAdd(true)}><UserPlus className="h-4 w-4" /></button>
        </div>
        {cart.customer && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {n(cart.customer.balance) > 0 && <span className="badge bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">Previous due {tk(cart.customer.balance)}</span>}
            <span className="badge bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"><Gift className="h-3 w-3" /> {num(customerPoints)} points</span>
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto">
        {cart.items.length === 0 ? (
          <Empty icon={ShoppingCart} title="Cart is empty" hint="Scan a barcode or tap a product to add it." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {cart.items.map((i) => (
              <li key={i.variant_id} className="px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{i.name}</p>
                    <p className="text-xs text-slate-500">{[i.label, i.sku].filter(Boolean).join(' · ')}{n(i.qty) > n(i.stock) && <span className="ml-1 text-rose-500">· stock {i.stock}</span>}</p>
                  </div>
                  <p className="text-sm font-bold">{tk(n(i.qty) * n(i.unit_price) - n(i.discount))}</p>
                  <button type="button" className="text-slate-400 hover:text-rose-500" onClick={() => dispatch({ type: 'remove', id: i.variant_id })} aria-label="Remove"><X className="h-4 w-4" /></button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700">
                    <button type="button" className="px-2 py-1 text-slate-500 hover:text-ocean-600" onClick={() => dispatch({ type: 'qty', id: i.variant_id, delta: -1 })}><Minus className="h-3.5 w-3.5" /></button>
                    <input className="w-10 bg-transparent text-center text-sm font-semibold outline-none" value={i.qty} inputMode="decimal"
                      onChange={(e) => dispatch({ type: 'set', id: i.variant_id, key: 'qty', value: e.target.value.replace(/[^\d.]/g, '') })} />
                    <button type="button" className="px-2 py-1 text-slate-500 hover:text-ocean-600" onClick={() => dispatch({ type: 'qty', id: i.variant_id, delta: 1 })}><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                  <label className="flex items-center gap-1 text-xs text-slate-500">৳<input className="input w-20 px-2 py-1 text-sm" inputMode="decimal" value={i.unit_price} placeholder="Price"
                    onChange={(e) => dispatch({ type: 'set', id: i.variant_id, key: 'unit_price', value: e.target.value })} /></label>
                  <label className="flex items-center gap-1 text-xs text-slate-500">Disc<input className="input w-16 px-2 py-1 text-sm" inputMode="decimal" value={i.discount} placeholder="0"
                    onChange={(e) => dispatch({ type: 'set', id: i.variant_id, key: 'discount', value: e.target.value })} /></label>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Totals & payment */}
      <div className="space-y-2.5 border-t border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex justify-between"><span className="text-slate-500">Subtotal ({num(t.qty)} items)</span><span className="font-semibold">{tk(t.subtotal)}</span></div>
        {t.itemDiscount > 0 && <div className="flex justify-between text-slate-500"><span>Item discount</span><span>-{tk(t.itemDiscount)}</span></div>}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">Invoice discount<input className="input mt-0.5 py-1.5" inputMode="decimal" value={cart.invoiceDiscount} onChange={(e) => dispatch({ type: 'field', key: 'invoiceDiscount', value: e.target.value })} /></label>
          <label className="text-xs text-slate-500">Round off (waive)
            <div className="mt-0.5 flex gap-1">
              <input className="input py-1.5" inputMode="decimal" value={cart.roundOff} onChange={(e) => dispatch({ type: 'field', key: 'roundOff', value: e.target.value })} />
            </div>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">Waive loose change:</span>
          {[10, 20, 50, 100].map((s) => <button type="button" key={s} className="chip px-2 py-0.5" onClick={() => roundDown(s)}>to {s}</button>)}
        </div>
        {cart.customer && settings.loyalty_enabled === '1' && customerPoints >= n(settings.loyalty_min_redeem_points) && (
          <label className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Gift className="h-3.5 w-3.5 text-violet-500" /> Redeem points (max {num(customerPoints)})</span>
            <input className="input w-24 py-1" inputMode="numeric" value={cart.pointsRedeem}
              onChange={(e) => dispatch({ type: 'field', key: 'pointsRedeem', value: String(Math.min(n(e.target.value.replace(/\D/g, '')), customerPoints) || '') })} />
          </label>
        )}
        {t.vat > 0 && <div className="flex justify-between text-slate-500"><span>VAT ({settings.vat_percent}%)</span><span>{tk(t.vat)}</span></div>}
        <div className="flex items-end justify-between rounded-xl bg-ocean-600 px-3 py-2.5 text-white">
          <span className="text-sm font-medium">Grand total</span><span className="text-2xl font-extrabold tracking-tight">{tk(t.grand)}</span>
        </div>

        {/* Payment methods */}
        <div className="flex flex-wrap gap-1.5">
          {accList.map((a) => (
            <button type="button" key={a.id} onClick={() => payOnly(a)} onContextMenu={(e) => { e.preventDefault(); addPay(a); }}
              title="Click: pay full with this · Right-click: add split payment"
              className={cls('chip', payments.length === 1 && payments[0].account_id === a.id && 'chip-active')}>{a.name}</button>
          ))}
        </div>
        {payments.map((p, i) => {
          const acc = accList.find((a) => a.id === p.account_id);
          return (
            // eslint-disable-next-line react/no-array-index-key
            <div key={i} className="flex items-center gap-2">
              <span className="flex w-28 shrink-0 items-center gap-1 truncate text-xs font-semibold text-slate-600 dark:text-slate-300"><Wallet className="h-3.5 w-3.5" />{acc?.name}</span>
              <input className="input py-1.5 font-semibold" inputMode="decimal" placeholder="Amount" value={p.amount} onChange={(e) => setPay(i, 'amount', e.target.value)} />
              {acc && acc.type !== 'cash' && <input className="input w-28 py-1.5" placeholder="TrxID" value={p.trx_ref} onChange={(e) => setPay(i, 'trx_ref', e.target.value)} />}
              {payments.length > 1 && <button type="button" className="text-slate-400 hover:text-rose-500" onClick={() => setPayments((ps) => ps.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>}
            </div>
          );
        })}
        <button type="button" className="text-xs font-semibold text-ocean-600 hover:underline" onClick={() => cashAcc && addPay(accList.find((a) => !payments.some((p) => p.account_id === a.id)) || cashAcc)}>+ Split payment</button>

        {t.change > 0 && <div className="flex justify-between rounded-lg bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"><span>Change to return</span><span>{tk(t.change)}</span></div>}

        {/* Credit sale: Next Payment Date */}
        {t.due > 0.009 && cart.items.length > 0 && (
          <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-700/60 dark:bg-amber-900/20">
            <div className="flex justify-between font-semibold text-amber-800 dark:text-amber-300"><span className="flex items-center gap-1"><CalendarClock className="h-4 w-4" /> Due (credit sale)</span><span>{tk(t.due)}</span></div>
            {!cart.customer && <p className="text-xs text-rose-600">Select or add a customer to sell on credit.</p>}
            <div className="flex flex-wrap gap-1.5">
              {DUE_PRESETS.map(([l, d]) => (
                <button type="button" key={l} className={cls('chip bg-white dark:bg-slate-800', dueDate === addDays(d) && 'chip-active')} onClick={() => setDueDate(addDays(d))}>{l}</button>
              ))}
              <input type="date" min={todayStr()} className="input w-auto py-1 text-xs" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400">A Due Collection Reminder will appear on the Dashboard on this date.</p>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button type="button" className="btn-primary col-span-3 py-3 text-base" disabled={busy || !cart.items.length} onClick={() => complete(true)}>
            {busy ? <Spinner className="h-5 w-5 text-white" /> : <Printer className="h-5 w-5" />} Complete &amp; Print <kbd className="hidden text-[10px] opacity-70 xl:inline">F10</kbd>
          </button>
          <button type="button" className="btn-success col-span-2" disabled={busy || !cart.items.length} onClick={() => complete(false)}><CheckCircle2 className="h-4 w-4" /> Complete <kbd className="hidden text-[10px] opacity-70 xl:inline">F9</kbd></button>
          <button type="button" className="btn-secondary text-rose-600" disabled={!cart.items.length && !cart.customer} onClick={() => { if (window.confirm('Clear the whole cart?')) reset(); }}><Trash2 className="h-4 w-4" /> Clear</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-5.5rem)] gap-3">
      {/* LEFT: search + grid */}
      <section className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="card flex items-center gap-2 p-2.5">
          <ProductPicker onPick={add} autoFocus inputRef={searchRef} />
          <button type="button" className="btn-secondary h-12" onClick={hold} title="Hold current invoice (F8)"><PauseCircle className="h-5 w-5 text-amber-500" /><span className="hidden sm:inline">Hold</span></button>
          <button type="button" className="btn-secondary relative h-12" onClick={() => setHeldOpen(true)} title="View held invoices">
            <ListRestart className="h-5 w-5 text-ocean-600" /><span className="hidden sm:inline">Held</span>
            {held.data?.length > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-white">{held.data.length}</span>}
          </button>
        </div>

        <div className="card flex min-h-0 flex-1 flex-col">
          <div className="flex gap-1 border-b border-slate-100 p-2 dark:border-slate-800">
            {[['recent', 'Recent', Clock], ['best', 'Best Selling', Flame], ['fav', 'Favorites', Heart]].map(([k, l, Icon]) => (
              <button type="button" key={k} onClick={() => setTab(k)} className={cls('flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition', tab === k ? 'bg-ocean-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}>
                <Icon className="h-4 w-4" />{l}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {grid.loading ? <div className="flex h-40 items-center justify-center"><Spinner /></div>
              : gridItems.length === 0 ? <Empty icon={Package} title={tab === 'fav' ? 'No favourites yet' : 'No products yet'} hint={tab === 'fav' ? 'Tap the ☆ on a product card to pin it here.' : 'Products appear here as you sell.'} />
                : (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {gridItems.map((p) => (
                      <button type="button" key={p.variant_id} onClick={() => add(p)}
                        className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-ocean-400 hover:shadow-pop active:scale-[.98] dark:border-slate-800 dark:bg-slate-900">
                        <div className="relative aspect-square w-full bg-slate-50 dark:bg-slate-800">
                          {p.image_path ? <img src={fileUrl(p.image_path)} alt="" loading="lazy" className="h-full w-full object-contain" />
                            : <div className="flex h-full items-center justify-center text-3xl font-black text-ocean-200 dark:text-slate-700">{p.name.slice(0, 2).toUpperCase()}</div>}
                          <span role="button" tabIndex={0} title="Favourite"
                            onClick={async (e) => { e.stopPropagation(); await api.patch(`/products/${p.product_id}/favorite`); grid.reload(); }}
                            className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 shadow-sm dark:bg-slate-900/90">
                            <Star className={cls('h-3.5 w-3.5', p.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-slate-400')} />
                          </span>
                          <span className={cls('absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold', p.stock_qty > 0 ? 'bg-white/90 text-slate-600 dark:bg-slate-900/90 dark:text-slate-300' : 'bg-rose-500 text-white')}>{p.stock_qty > 0 ? `${num(p.stock_qty)} in stock` : 'Out of stock'}</span>
                        </div>
                        <div className="p-2">
                          <p className="line-clamp-1 text-xs font-semibold">{p.name}</p>
                          <p className="line-clamp-1 text-[11px] text-slate-500">{variantLabel(p) || p.sku}</p>
                          <p className="mt-0.5 text-sm font-bold text-ocean-700 dark:text-ocean-300">{p.retail_price === null ? <span className="text-amber-600">Set price</span> : tk(p.retail_price)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
          </div>
        </div>
      </section>

      {/* RIGHT: cart (desktop / landscape tablet) */}
      <aside className="card hidden w-[23rem] shrink-0 overflow-hidden lg:block xl:w-[26rem]">{cartPanel}</aside>

      {/* Mobile cart button + bottom sheet */}
      <button type="button" onClick={() => setCartOpen(true)} className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-2xl bg-ocean-600 px-5 py-3.5 font-bold text-white shadow-pop lg:hidden">
        <ShoppingCart className="h-5 w-5" /> {num(t.qty)} · {tk(t.grand)}
      </button>
      <div className={cls('fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-300 ease-in-out lg:hidden', cartOpen ? 'opacity-100' : 'pointer-events-none opacity-0')} onClick={() => setCartOpen(false)} />
      <div className={cls('fixed inset-x-0 bottom-0 z-50 h-[92vh] overflow-hidden rounded-t-3xl bg-white shadow-2xl transition-transform duration-300 ease-in-out dark:bg-slate-900 lg:hidden', cartOpen ? 'translate-y-0' : 'translate-y-full')}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800"><b>Cart</b><button type="button" onClick={() => setCartOpen(false)}><X className="h-5 w-5" /></button></div>
        <div className="h-[calc(92vh-2.75rem)]">{cartPanel}</div>
      </div>

      {/* Quick customer add */}
      <PartyForm type="customer" quick open={quickAdd} onClose={() => setQuickAdd(false)}
        onSaved={(c) => dispatch({ type: 'field', key: 'customer', value: c })} />

      {/* Held invoices */}
      <Modal open={heldOpen} onClose={() => setHeldOpen(false)} title="Held invoices" size="md">
        {!held.data?.length ? <Empty icon={PauseCircle} title="No held invoices" hint="Use Hold to park a cart and serve the next customer." /> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {held.data.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{h.hold_ref} <span className="font-normal text-slate-500">· {h.customer_name || 'Walk-in'}</span></p>
                  <p className="text-xs text-slate-500">{h.item_count} items · {fmtDateTime(h.created_at)} · {h.cashier}</p>
                </div>
                <b>{tk(h.total)}</b>
                <button type="button" className="btn-primary btn-sm" onClick={() => retrieve(h)}>Retrieve</button>
                <button type="button" className="btn-ghost btn-sm text-rose-500" onClick={async () => { await api.delete(`/sales/held/${h.id}`); held.reload(); }}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* Completed (no print) */}
      <Modal open={!!done} onClose={() => setDone(null)} title={`Invoice ${done?.invoice_no || ''} completed`} size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setDone(null)}>New sale</button><button type="button" className="btn-primary" onClick={() => { setPrintSale(done); setDone(null); printNode(); }}><Printer className="h-4 w-4" /> Print receipt</button></>}>
        {done && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Total</span><b>{tk(done.grand_total)}</b></div>
            <div className="flex justify-between"><span>Paid</span><b>{tk(done.paid_amount)}</b></div>
            {done.change_amount > 0 && <div className="flex justify-between text-emerald-600"><span>Change</span><b>{tk(done.change_amount)}</b></div>}
            {done.due_amount > 0 && <div className="flex justify-between text-rose-600"><span>Due</span><b>{tk(done.due_amount)}</b></div>}
            {done.points_earned > 0 && <div className="flex justify-between text-violet-600"><span>Points earned</span><b>+{done.points_earned}</b></div>}
          </div>
        )}
      </Modal>

      {/* Hidden print area */}
      <div className="print-area hidden print:block"><Receipt sale={printSale} /></div>
    </div>
  );
}
