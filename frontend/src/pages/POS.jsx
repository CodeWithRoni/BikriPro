import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  PauseCircle, UserPlus, Printer, Trash2, X, Gift, Repeat2, BadgePercent, Coins, Undo2, History, Wallet, Maximize2, Minimize2,
  CalendarDays, FileText, NotebookPen, Layers, Banknote, ShoppingCart, Pencil, UserRound, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { ProductPicker, PartyPicker } from '../components/Pickers';
import PartyForm from '../components/PartyForm';
import { Modal } from '../components/ui';
import Select from '../components/ui/Select';
import { Receipt, printNode } from '../components/receipt/Receipt';
import ShareReceipt from '../components/ShareReceipt';
import CartTable from '../components/pos/CartTable';
import Catalog from '../components/pos/Catalog';
import PaymentModal from '../components/pos/PaymentModal';
import RecentDrawer from '../components/pos/RecentDrawer';
import ExchangeModal from '../components/pos/ExchangeModal';
import { QuickExpense, QuotationModal } from '../components/pos/SmallModals';
import { Kbd, TotalCell } from '../components/pos/parts';
import { computeOffers } from '../utils/offers';
import { tk, num, variantLabel, cls } from '../utils/format';

// ---------------- cart state ----------------
const EMPTY = {
  items: [], customer: null, salesperson: '', invoiceDiscount: '', roundOff: '', pointsRedeem: '', note: '',
  holdId: null, noOffers: false, exchange: null, leftover: 'cash', priceMode: 'retail',
};
const priceFor = (item, mode) => (mode === 'wholesale' && item.wholesale_price !== null && item.wholesale_price !== undefined && item.wholesale_price !== ''
  ? item.wholesale_price : item.retail_price ?? '');

function reducer(state, a) {
  switch (a.type) {
    case 'add': {
      const p = a.product;
      const i = state.items.findIndex((x) => x.variant_id === p.variant_id);
      if (i >= 0) return { ...state, items: state.items.map((x, j) => (j === i ? { ...x, qty: Number(x.qty) + 1 } : x)) };
      const item = {
        variant_id: p.variant_id, name: p.name, label: variantLabel(p), sku: p.sku, image_path: p.image_path,
        product_id: p.product_id, category_id: p.category_id, brand_id: p.brand_id, low_alert: p.low_stock_alert,
        retail_price: p.retail_price, wholesale_price: p.wholesale_price, stock: p.stock_qty, qty: 1, discount: '',
      };
      return { ...state, items: [...state.items, { ...item, unit_price: priceFor(item, state.priceMode) }] };
    }
    case 'set': return { ...state, items: state.items.map((x) => (x.variant_id === a.id ? { ...x, [a.key]: a.value } : x)) };
    case 'qty': return { ...state, items: state.items.map((x) => (x.variant_id === a.id ? { ...x, qty: Math.max(1, Number(x.qty) + a.delta) } : x)) };
    case 'remove': return { ...state, items: state.items.filter((x) => x.variant_id !== a.id) };
    case 'field': return { ...state, [a.key]: a.value };
    case 'priceMode': return { ...state, priceMode: a.mode, items: state.items.map((x) => ({ ...x, unit_price: priceFor(x, a.mode) })) };
    case 'load': return { ...EMPTY, ...a.cart };
    case 'clear': return EMPTY;
    default: return state;
  }
}

const loadSaved = () => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem('bp_pos_cart')) }; } catch { return EMPTY; } };
const n = (v) => Number(v) || 0;
const r2 = (x) => Math.round(x * 100) / 100;

export default function POS() {
  const settings = useSelector((s) => s.settings.data);
  const user = useSelector((s) => s.auth.user);
  const role = user?.role;
  const isManager = role === 'manager' || role === 'admin';
  const [cart, dispatch] = useReducer(reducer, undefined, loadSaved);
  const [payments, setPayments] = useState([]); // [{account_id, amount, trx_ref}]
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [printSale, setPrintSale] = useState(null);
  const [payMode, setPayMode] = useState(null); // 'pay' | 'credit' | null
  const [drawer, setDrawer] = useState(null); // tab name or null
  const [quickAdd, setQuickAdd] = useState(false);
  const [exOpen, setExOpen] = useState(false);
  const [expOpen, setExpOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [pop, setPop] = useState(null); // 'disc' | 'round'
  const [selected, setSelected] = useState(null);
  const [sendSms, setSendSms] = useState(true);
  const [sheet, setSheet] = useState(false); // phone cart sheet
  const [full, setFull] = useState(false);
  const [now, setNow] = useState(new Date());
  const [reloadKey, setReloadKey] = useState(0);
  const [quoteKey, setQuoteKey] = useState(0);
  const searchRef = useRef(null);
  const popRef = useRef(null);

  const accounts = useApi('/accounts');
  const held = useApi('/sales/held');
  const offersApi = useApi('/offers/active');
  const staffApi = useApi('/staff/options');
  const shift = useApi('/cash-sessions/current');
  const accList = (accounts.data?.data || []).filter((a) => a.is_active);
  const cashAcc = accList.find((a) => a.type === 'cash');

  useEffect(() => { localStorage.setItem('bp_pos_cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const onFs = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  useEffect(() => {
    if (!pop) return undefined;
    const close = (e) => popRef.current && !popRef.current.contains(e.target) && setPop(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [pop]);

  // ---------- totals ----------
  const offers = useMemo(
    () => (cart.noOffers ? { lines: {}, bill: null, total: 0 } : computeOffers(cart.items, offersApi.data, { manualInvoiceDiscount: cart.invoiceDiscount })),
    [cart.items, cart.noOffers, cart.invoiceDiscount, offersApi.data],
  );
  const t = useMemo(() => {
    const subtotal = cart.items.reduce((s, i) => s + n(i.qty) * n(i.unit_price), 0);
    const manualItemDiscount = cart.items.reduce((s, i) => s + n(i.discount), 0);
    const itemOffer = cart.items.reduce((s, i) => s + (offers.lines[i.variant_id]?.amount || 0), 0);
    const billOffer = offers.bill?.amount || 0;
    const taxable = subtotal - manualItemDiscount - itemOffer - n(cart.invoiceDiscount) - billOffer;
    const vat = Math.round(taxable * n(settings.vat_percent)) / 100;
    const pointValue = n(cart.pointsRedeem) * n(settings.loyalty_point_value || 1);
    const grand = Math.max(r2(taxable + vat - n(cart.roundOff) - pointValue), 0);
    const credit = n(cart.exchange?.credit);
    const net = Math.max(r2(grand - credit), 0);
    const leftover = Math.max(r2(credit - grand), 0);
    const tendered = payments.reduce((s, p) => s + n(p.amount), 0);
    return {
      subtotal, itemOffer, billOffer, offerTotal: r2(itemOffer + billOffer), manualDiscount: r2(manualItemDiscount + n(cart.invoiceDiscount)),
      vat, pointValue, grand, credit, net, leftover, tendered,
      change: Math.max(r2(tendered - net), 0), due: Math.max(r2(net - tendered), 0), qty: cart.items.reduce((s, i) => s + n(i.qty), 0),
    };
  }, [cart, payments, settings, offers]);
  const cartQty = useMemo(() => Object.fromEntries(cart.items.map((i) => [i.variant_id, n(i.qty)])), [cart.items]);

  // ---------- actions ----------
  const add = (p) => {
    if (p.retail_price === null && !(cart.priceMode === 'wholesale' && p.wholesale_price !== null)) toast('No selling price set — type it in the cart', { icon: '⚠️' });
    if (n(p.stock_qty) <= 0) toast(`${p.name} is out of stock here`, { icon: '📦' });
    dispatch({ type: 'add', product: p });
    setSelected(p.variant_id);
  };
  const reset = () => {
    const sp = cart.salesperson; const mode = cart.priceMode;
    dispatch({ type: 'clear' });
    if (sp) dispatch({ type: 'field', key: 'salesperson', value: sp });
    if (mode !== 'retail') dispatch({ type: 'priceMode', mode });
    setPayments([]); setDueDate(''); setSelected(null); setSendSms(true);
  };
  const reloadAll = () => { setReloadKey((k) => k + 1); held.reload(); accounts.reload(); shift.reload(); };

  const hold = async () => {
    if (!cart.items.length) return toast.error('Cart is empty');
    try {
      const { data } = await api.post('/sales/hold', { cart, customer_id: cart.customer?.id || null, note: cart.note || null, total: t.net });
      if (cart.holdId) await api.delete(`/sales/held/${cart.holdId}`);
      toast.success(`${data.hold_ref} held — serve the next customer`);
      reset(); held.reload();
    } catch (e) { toast.error(e.message); }
  };

  const quoteDoc = (c, meta, total) => ({
    is_quotation: true, invoice_no: meta.hold_ref, sale_date: meta.created_at || new Date().toISOString(), valid_until: meta.valid_until,
    customer: c.customer, cashier: meta.cashier || user?.name, salesperson: null, payments: [],
    items: c.items.map((i) => {
      const off = c.quote?.lines?.[i.variant_id] || 0;
      return { id: i.variant_id, product_name: i.name, variant_label: i.label, qty: n(i.qty), unit_price: n(i.unit_price), discount: r2(n(i.discount) + off), line_total: r2(n(i.qty) * n(i.unit_price) - n(i.discount) - off) };
    }),
    subtotal: c.quote?.subtotal ?? 0, item_discount: c.quote?.item_discount ?? 0, invoice_discount: c.quote?.invoice_discount ?? 0,
    vat_amount: c.quote?.vat ?? 0, round_off: n(c.roundOff), points_value: 0, grand_total: total,
  });
  const saveQuote = async ({ valid_until, note, print }) => {
    try {
      const snapshot = {
        ...cart, holdId: null, exchange: null,
        quote: {
          lines: Object.fromEntries(Object.entries(offers.lines).map(([k, v]) => [k, v.amount])),
          subtotal: t.subtotal, item_discount: r2(cart.items.reduce((s, i) => s + n(i.discount), 0) + t.itemOffer),
          invoice_discount: r2(n(cart.invoiceDiscount) + t.billOffer), vat: t.vat,
        },
      };
      const { data } = await api.post('/sales/hold', { kind: 'quotation', cart: snapshot, customer_id: cart.customer?.id || null, note: note || null, valid_until, total: t.grand });
      toast.success(`${data.hold_ref} saved`);
      setQuoteOpen(false); setQuoteKey((k) => k + 1);
      if (print) { setPrintSale(quoteDoc(snapshot, { hold_ref: data.hold_ref, valid_until }, t.grand)); printNode(); }
      reset();
    } catch (e) { toast.error(e.message); }
  };
  const printQuotation = async (id) => {
    try {
      const { data } = await api.get(`/sales/held/${id}`);
      setPrintSale(quoteDoc({ ...data.cart, customer: data.cart.customer }, data, n(data.total))); printNode();
    } catch (e) { toast.error(e.message); }
  };
  const printOld = async (id) => {
    try { const { data } = await api.get(`/sales/${id}`); setPrintSale(data); printNode(); } catch (e) { toast.error(e.message); }
  };
  const retrieve = async (h) => {
    try {
      const { data } = await api.get(`/sales/held/${h.id}`);
      if (cart.items.length && !window.confirm('Replace the current cart?')) return;
      const { quote, ...c } = data.cart;
      dispatch({ type: 'load', cart: { ...c, holdId: data.kind === 'hold' ? h.id : null } });
      setPayments([]); setDrawer(null);
      toast.success(`${h.hold_ref} loaded`);
    } catch (e) { toast.error(e.message); }
  };

  const validate = () => {
    if (!cart.items.length) { toast.error('Cart is empty'); return false; }
    if (cart.items.some((i) => i.unit_price === '' || i.unit_price === null)) { toast.error('Enter a price for every item'); return false; }
    if (settings.shift_required === '1' && shift.data && !shift.data.session) { toast.error('Open your shift first (Day Closing)'); return false; }
    return true;
  };
  const openPay = (mode = 'pay') => { if (validate()) setPayMode(mode); };

  const complete = async (print, override) => {
    if (busy || !validate()) return;
    const pays = override || payments;
    const tendered = pays.reduce((s, p) => s + n(p.amount), 0);
    const due = Math.max(r2(t.net - tendered), 0);
    if (due > 0.009) {
      if (!cart.customer || cart.customer.is_walk_in) { toast.error('Select a customer for a credit (due) sale'); setPayMode((m) => m || 'credit'); return; }
      if (!dueDate) { toast.error('Select the next payment date'); setPayMode((m) => m || 'credit'); return; }
    }
    setBusy(true);
    try {
      const body = {
        customer_id: cart.customer?.id || null,
        items: cart.items.map((i) => {
          const o = offers.lines[i.variant_id];
          return { variant_id: i.variant_id, qty: n(i.qty), unit_price: n(i.unit_price), discount: n(i.discount) + (o?.amount || 0), offer_id: o?.offer_id || null, offer_discount: o?.amount || 0 };
        }),
        invoice_discount: n(cart.invoiceDiscount) + t.billOffer, bill_offer_id: offers.bill?.offer_id || null, bill_offer_discount: t.billOffer,
        round_off: n(cart.roundOff), points_redeem: n(cart.pointsRedeem), salesperson_id: cart.salesperson || null,
        payments: pays.filter((p) => n(p.amount) > 0).map((p) => ({ ...p, amount: n(p.amount) })),
        next_payment_date: due > 0.009 ? dueDate : null, note: cart.note || null, hold_id: cart.holdId, send_sms: sendSms,
      };
      const { data } = cart.exchange
        ? await api.post('/sales/exchange', {
          ...body, sale_id: cart.exchange.sale_id, leftover: cart.leftover,
          return_items: cart.exchange.items.map((r) => ({ sale_item_id: r.sale_item_id, qty: r.qty, restock: r.restock !== false })),
        })
        : await api.post('/sales', body);
      toast.success(cart.exchange ? `Exchange done — ${data.invoice_no}` : `${data.invoice_no} completed`);
      reset(); setPayMode(null); setSheet(false); reloadAll();
      if (print) { setPrintSale(data); printNode(); } else setDone(data);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const quickCash = () => {
    if (!validate()) return;
    if (!cashAcc) return toast.error('No cash account found');
    const pays = t.net > 0 ? [{ account_id: cashAcc.id, amount: String(t.net), trx_ref: '' }] : [];
    setPayments(pays);
    complete(false, pays);
  };
  const clearCart = () => { if ((cart.items.length || cart.customer) && window.confirm('Clear the whole cart?')) reset(); };
  const roundDown = (step) => {
    const before = t.grand + n(cart.roundOff);
    const r = Math.round((before % step) * 100) / 100;
    dispatch({ type: 'field', key: 'roundOff', value: r ? String(r) : '' });
  };
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()).catch?.(() => {});

  // Keyboard: F2 search · F4/F8 hold · F6 credit · F7 split · F9 cash / complete · F10 pay / complete & print
  useEffect(() => {
    const onKey = (e) => {
      if (!/^F(2|4|6|7|8|9|10)$/.test(e.key)) return;
      if (quoteOpen || expOpen || exOpen || quickAdd || done) return;
      e.preventDefault();
      if (payMode) {
        if (e.key === 'F9') complete(false);
        if (e.key === 'F10') complete(true);
        return;
      }
      if (e.key === 'F2') searchRef.current?.focus();
      if (e.key === 'F4' || e.key === 'F8') hold();
      if (e.key === 'F6') openPay('credit');
      if (e.key === 'F7') openPay('pay');
      if (e.key === 'F9') quickCash();
      if (e.key === 'F10') openPay('pay');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const customerPoints = n(cart.customer?.loyalty_points);
  const canRedeem = cart.customer && settings.loyalty_enabled === '1' && customerPoints >= n(settings.loyalty_min_redeem_points);
  const shiftOn = shift.data?.session;
  const offerCount = new Set([...Object.values(offers.lines).map((o) => o.offer_id), ...(offers.bill ? [offers.bill.offer_id] : [])]).size;
  const dateText = now.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

  // ---------------- cart card ----------------
  const cartCard = (
    <section className="card flex min-h-0 flex-1 flex-col">
      {/* search + customer */}
      <div className="grid gap-2.5 p-3 pb-2.5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="relative">
          <ProductPicker onPick={add} autoFocus inputRef={searchRef} placeholder="Scan barcode or type product name, SKU…" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"><Kbd>F2</Kbd></span>
        </div>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1"><PartyPicker type="customer" value={cart.customer} onChange={(c) => dispatch({ type: 'field', key: 'customer', value: c })} placeholder="Walk-in customer — search name or phone…" /></div>
          <button type="button" className="btn-secondary px-3" title="Add a new customer" aria-label="Add a new customer" onClick={() => setQuickAdd(true)}><UserPlus className="h-4 w-4 text-ocean-600" /></button>
        </div>
      </div>

      {/* meta row */}
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2.5 text-xs">
        {staffApi.data?.length > 0 && (
          <div className="flex items-center gap-1.5">
            <UserRound className="h-3.5 w-3.5 text-slate-400" />
            <Select className="input h-8 w-40 py-1 text-xs" value={String(cart.salesperson || '')} onChange={(e) => dispatch({ type: 'field', key: 'salesperson', value: e.target.value })} aria-label="Sales person">
              <option value="">Sales person</option>{staffApi.data.map((x) => <option key={x.id} value={String(x.id)}>{x.name}</option>)}
            </Select>
          </div>
        )}
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800" role="group" aria-label="Price list">
          {[['retail', 'Retail'], ['wholesale', 'Wholesale']].map(([k, l]) => (
            <button type="button" key={k} onClick={() => dispatch({ type: 'priceMode', mode: k })}
              className={cls('rounded-md px-2.5 py-1 font-semibold transition', cart.priceMode === k ? 'bg-white text-ocean-700 shadow-sm dark:bg-slate-700 dark:text-ocean-200' : 'text-slate-500')}>{l}</button>
          ))}
        </div>
        {cart.customer && !cart.customer.is_walk_in && (
          <>
            {n(cart.customer.balance) > 0 && <span className="badge bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300">Old due {tk(cart.customer.balance)}</span>}
            {settings.loyalty_enabled === '1' && <span className="badge bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300"><Gift className="h-3 w-3" /> {num(customerPoints)} pts</span>}
          </>
        )}
        {(offersApi.data?.length > 0) && (
          <button type="button" onClick={() => dispatch({ type: 'field', key: 'noOffers', value: !cart.noOffers })}
            title={cart.noOffers ? 'Offers are off for this bill — click to turn on' : 'Click to turn offers off for this bill'}
            className={cls('badge ml-auto transition', cart.noOffers ? 'bg-slate-100 text-slate-500 line-through dark:bg-slate-800' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300')}>
            <BadgePercent className="h-3.5 w-3.5" /> {cart.noOffers ? 'Offers off' : offerCount ? `${offerCount} offer${offerCount > 1 ? 's' : ''} · saved ${tk(t.offerTotal)}` : 'Offers on'}
          </button>
        )}
      </div>

      {/* exchange banner */}
      {cart.exchange && (
        <div className="mx-3 mb-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
          <div className="flex items-center gap-2">
            <Repeat2 className="h-4 w-4 shrink-0 text-amber-600" />
            <p className="min-w-0 flex-1 font-semibold text-amber-800 dark:text-amber-300">Exchange for {cart.exchange.invoice_no} · returned {tk(cart.exchange.credit)}</p>
            <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => dispatch({ type: 'field', key: 'exchange', value: null })}>Cancel exchange</button>
          </div>
          <p className="mt-0.5 truncate text-xs text-amber-900/80 dark:text-amber-200/80">
            <Undo2 className="mr-1 inline h-3 w-3" />{cart.exchange.items.map((r) => `${r.name}${r.label ? ` (${r.label})` : ''} × ${num(r.qty)}`).join(', ')}
          </p>
          {t.leftover > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-semibold text-amber-800 dark:text-amber-300">Balance {tk(t.leftover)}:</span>
              {[['cash', 'Give cash back'], ['credit', 'Keep as customer credit']].map(([k, l]) => (
                <button type="button" key={k} disabled={k === 'credit' && (!cart.customer || cart.customer.is_walk_in)} onClick={() => dispatch({ type: 'field', key: 'leftover', value: k })}
                  className={cls('chip bg-white disabled:opacity-40 dark:bg-slate-800', (cart.leftover || 'cash') === k && 'chip-active')}>{l}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* lines */}
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-200 dark:border-slate-800">
        <CartTable items={cart.items} offers={offers} dispatch={dispatch} selected={selected} onSelect={setSelected} />
      </div>

      {/* totals strip */}
      <div ref={popRef} className="relative grid grid-cols-3 border-t border-slate-200 dark:border-slate-800 sm:grid-cols-[repeat(5,minmax(0,1fr))_minmax(max-content,1.5fr)]">
        <TotalCell label="Items" value={<>{num(t.qty)} <span className="text-xs font-semibold text-slate-400">pcs</span></>} />
        <TotalCell label="Subtotal" value={tk(t.subtotal - t.itemOffer)} />
        <TotalCell label="Discount" icon={Pencil} value={t.manualDiscount + t.billOffer + t.pointValue > 0 ? `− ${tk(t.manualDiscount + t.billOffer + t.pointValue)}` : tk(0)}
          tone={t.manualDiscount + t.billOffer + t.pointValue > 0 ? 'text-rose-600' : ''} onClick={() => setPop(pop === 'disc' ? null : 'disc')} active={pop === 'disc'} />
        <TotalCell label={`VAT ${n(settings.vat_percent)}%`} value={tk(t.vat)} />
        <TotalCell label="Round off" icon={Pencil} value={n(cart.roundOff) ? `− ${tk(cart.roundOff)}` : tk(0)} tone={n(cart.roundOff) ? 'text-slate-500' : ''} onClick={() => setPop(pop === 'round' ? null : 'round')} active={pop === 'round'} />
        <div className="col-span-3 flex items-center justify-between gap-3 bg-gradient-to-br from-ocean-600 to-ocean-700 px-4 py-2.5 text-white sm:col-span-1 sm:rounded-br-2xl">
          <div className="min-w-0">
            <p className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wider opacity-85">{cart.exchange ? (t.leftover > 0 ? 'Give back' : 'Customer pays') : 'Total payable'}</p>
            {cart.exchange ? <p className="truncate text-[11px] opacity-80">New {tk(t.grand)} − returned {tk(t.credit)}</p>
              : n(cart.customer?.balance) > 0 ? <p className="truncate text-[11px] opacity-80">+ old due {tk(cart.customer.balance)}</p> : null}
          </div>
          <p className="whitespace-nowrap text-[22px] font-extrabold tabular-nums leading-none tracking-tight 2xl:text-[26px]">{tk(cart.exchange && t.leftover > 0 ? t.leftover : t.net)}</p>
        </div>

        {pop === 'disc' && (
          <div className="absolute bottom-full left-1/2 z-20 mb-2 w-72 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl animate-[bpPopUp_150ms_ease-out] dark:border-slate-700 dark:bg-slate-900 sm:left-[30%]">
            <p className="mb-2 text-sm font-bold">Discount on this bill</p>
            <label className="block text-xs font-semibold text-slate-500">Bill discount (৳)
              <input className="input mt-1" inputMode="decimal" autoFocus value={cart.invoiceDiscount} onChange={(e) => dispatch({ type: 'field', key: 'invoiceDiscount', value: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0" />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[5, 10, 15].map((p) => (
                <button type="button" key={p} className="chip" onClick={() => dispatch({ type: 'field', key: 'invoiceDiscount', value: String(Math.round((t.subtotal - t.itemOffer - cart.items.reduce((s, i) => s + n(i.discount), 0)) * p) / 100) })}>{p}%</button>
              ))}
            </div>
            {canRedeem && (
              <label className="mt-3 block text-xs font-semibold text-slate-500">Use loyalty points (max {num(customerPoints)})
                <input className="input mt-1" inputMode="numeric" value={cart.pointsRedeem} onChange={(e) => dispatch({ type: 'field', key: 'pointsRedeem', value: String(Math.min(n(e.target.value.replace(/\D/g, '')), customerPoints) || '') })} placeholder="0" />
              </label>
            )}
            {t.manualDiscount - n(cart.invoiceDiscount) > 0 && <p className="mt-2 text-xs text-slate-500">Line discounts: {tk(t.manualDiscount - n(cart.invoiceDiscount))}</p>}
            {offers.bill && <p className="mt-1 text-xs text-emerald-600">{offers.bill.name}: − {tk(t.billOffer)}</p>}
          </div>
        )}
        {pop === 'round' && (
          <div className="absolute bottom-full left-1/2 z-20 mb-2 w-72 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl animate-[bpPopUp_150ms_ease-out] dark:border-slate-700 dark:bg-slate-900 sm:left-[62%]">
            <p className="mb-2 text-sm font-bold">Waive loose change</p>
            <div className="flex flex-wrap gap-1.5">
              {[5, 10, 20, 50, 100].map((s) => <button type="button" key={s} className="chip" onClick={() => roundDown(s)}>Round to {s}</button>)}
            </div>
            <label className="mt-3 block text-xs font-semibold text-slate-500">Or type the amount (৳)
              <input className="input mt-1" inputMode="decimal" value={cart.roundOff} onChange={(e) => dispatch({ type: 'field', key: 'roundOff', value: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0" />
            </label>
          </div>
        )}
      </div>
    </section>
  );

  const btn = 'inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-bold transition disabled:opacity-40';
  const plain = cls(btn, 'border-slate-200 bg-white text-slate-700 hover:border-ocean-300 hover:text-ocean-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200');
  const empty = !cart.items.length;

  return (
    <div className="flex h-[calc(100vh-5.5rem)] flex-col gap-2.5">
      {/* toolbar */}
      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
        <Link to="/day-closing" title={shiftOn ? 'Your shift is open' : 'Open your shift in Day Closing'}
          className={cls('inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-[12.5px] font-semibold transition',
            shiftOn ? 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              : settings.shift_required === '1' ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900')}>
          <span className={cls('h-2 w-2 rounded-full', shiftOn ? 'bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-900/50' : 'bg-slate-300')} />
          {shiftOn ? `Shift open · ${shiftOn.user_name || user?.name}` : 'No shift open — tap to open'}
        </Link>
        <span className="hidden h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[12.5px] font-semibold tabular-nums text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 md:inline-flex"><CalendarDays className="h-4 w-4" />{dateText}</span>
        <div className="flex-1" />
        <button type="button" className={cls(plain, 'relative h-9')} onClick={() => setDrawer('held')}>
          <PauseCircle className="h-4 w-4 text-amber-500" /><span className="hidden sm:inline">Held</span>
          {held.data?.length > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-bold text-white dark:border-slate-900">{held.data.length}</span>}
        </button>
        <button type="button" className={cls(plain, 'h-9')} onClick={() => setDrawer('sales')}><History className="h-4 w-4 text-ocean-600" /><span className="hidden sm:inline">Recent</span></button>
        {isManager && <button type="button" className={cls(plain, 'h-9', cart.exchange && 'border-amber-400 text-amber-700')} onClick={() => setExOpen(true)}><Repeat2 className="h-4 w-4 text-amber-600" /><span className="hidden sm:inline">Exchange</span></button>}
        {isManager && <button type="button" className={cls(plain, 'h-9')} onClick={() => setExpOpen(true)}><Wallet className="h-4 w-4 text-rose-500" /><span className="hidden lg:inline">Expense</span></button>}
        {shiftOn && <Link to="/day-closing" className={cls(plain, 'h-9')}><Coins className="h-4 w-4 text-emerald-600" /><span className="hidden lg:inline">Close shift</span></Link>}
        <button type="button" className={cls(plain, 'h-9 px-2.5')} title={full ? 'Exit full screen' : 'Full screen'} aria-label="Full screen" onClick={toggleFull}>{full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
      </div>

      {/* work area */}
      <div className="grid min-h-0 flex-1 gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,34%)] 2xl:grid-cols-[minmax(0,1fr)_minmax(24rem,36%)]">
        <div className="hidden min-h-0 lg:flex lg:flex-col">{cartCard}</div>
        <Catalog onAdd={add} cartQty={cartQty} offers={offersApi.data} priceMode={cart.priceMode} reloadKey={reloadKey} />
      </div>

      {/* action bar */}
      <div className="card flex items-center gap-2 overflow-x-auto px-2.5 py-2 [scrollbar-width:none]">
        <button type="button" className={cls(btn, 'border-rose-200 bg-white text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-slate-900 dark:hover:bg-rose-900/20')} disabled={empty && !cart.customer} onClick={clearCart}><X className="h-4 w-4" /> Cancel</button>
        <span className="mx-0.5 h-7 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
        <button type="button" className={plain} disabled={empty} onClick={hold}><PauseCircle className="h-4 w-4 text-amber-500" /> Hold <Kbd>F4</Kbd></button>
        <button type="button" className={plain} disabled={empty || Boolean(cart.exchange)} onClick={() => setQuoteOpen(true)}><FileText className="h-4 w-4 text-violet-500" /> Quotation</button>
        <button type="button" className={plain} disabled={empty} onClick={() => openPay('credit')}><NotebookPen className="h-4 w-4 text-rose-500" /> Credit sale <Kbd>F6</Kbd></button>
        {isManager && <Link to="/sales-return" className={plain} title="Sales return"><Undo2 className="h-4 w-4 text-slate-500" /><span className="hidden 2xl:inline">Return</span></Link>}
        <div className="min-w-2 flex-1" />
        <button type="button" className={cls(btn, 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800 dark:border-slate-200 dark:bg-slate-100 dark:text-slate-900')} disabled={empty} onClick={() => openPay('pay')}><Layers className="h-4 w-4" /> Split<span className="hidden xl:inline"> / bKash</span> <Kbd light className="dark:border-slate-400 dark:bg-transparent dark:text-slate-600">F7</Kbd></button>
        <button type="button" className={cls(btn, 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700')} disabled={empty || busy} onClick={quickCash}><Banknote className="h-4 w-4" /> Cash <Kbd light>F9</Kbd></button>
        <button type="button" className={cls(btn, 'h-12 border-0 bg-gradient-to-br from-ocean-600 to-ocean-700 px-5 text-[14px] text-white shadow-[0_10px_22px_-12px_rgb(26_124_238/.9)] hover:brightness-110')} disabled={empty} onClick={() => openPay('pay')}>
          <Printer className="h-4 w-4" /> Pay {tk(cart.exchange && t.leftover > 0 ? 0 : t.net)} <Kbd light>F10</Kbd>
        </button>
      </div>

      {/* phones / portrait tablets: cart sheet */}
      <button type="button" onClick={() => setSheet(true)} className="fixed bottom-24 right-4 z-30 flex items-center gap-2 rounded-2xl bg-ocean-600 px-5 py-3.5 font-bold text-white shadow-pop lg:hidden">
        <ShoppingCart className="h-5 w-5" /> {num(t.qty)} · {tk(t.net)} <ChevronUp className="h-4 w-4" />
      </button>
      <div className={cls('fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-300 lg:hidden', sheet ? 'opacity-100' : 'pointer-events-none opacity-0')} onClick={() => setSheet(false)} />
      <div className={cls('fixed inset-x-0 bottom-0 z-40 flex h-[88vh] flex-col overflow-hidden rounded-t-3xl bg-slate-50 p-2 shadow-2xl transition-transform duration-300 ease-in-out dark:bg-slate-950 lg:hidden', sheet ? 'translate-y-0' : 'translate-y-full')}>
        <div className="flex items-center justify-between px-2 pb-2"><b>Cart</b><button type="button" aria-label="Close cart" onClick={() => setSheet(false)}><X className="h-5 w-5" /></button></div>
        {sheet && <div className="flex min-h-0 flex-1 flex-col">{cartCard}</div>}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button type="button" className="btn-secondary h-12" disabled={empty} onClick={() => { setSheet(false); openPay('credit'); }}><NotebookPen className="h-4 w-4" /> Credit</button>
          <button type="button" className="btn-primary h-12" disabled={empty} onClick={() => { setSheet(false); openPay('pay'); }}><Printer className="h-4 w-4" /> Pay {tk(t.net)}</button>
        </div>
      </div>

      <PaymentModal open={Boolean(payMode)} mode={payMode} onClose={() => setPayMode(null)} t={t} cart={cart} accList={accList}
        payments={payments} setPayments={setPayments} dueDate={dueDate} setDueDate={setDueDate} busy={busy} onComplete={complete}
        sendSms={sendSms} setSendSms={setSendSms} settings={settings} />

      <RecentDrawer open={Boolean(drawer)} initialTab={drawer || 'sales'} onClose={() => setDrawer(null)} onPrintSale={printOld} onRetrieve={retrieve}
        onPrintQuotation={printQuotation} shift={shiftOn} heldCount={held.data?.length || 0} quoteReload={quoteKey} />

      <QuickExpense open={expOpen} onClose={() => setExpOpen(false)} onSaved={() => { accounts.reload(); shift.reload(); }} />
      <QuotationModal open={quoteOpen} onClose={() => setQuoteOpen(false)} total={t.grand} customer={cart.customer} onSave={saveQuote} />

      <PartyForm type="customer" quick open={quickAdd} onClose={() => setQuickAdd(false)} onSaved={(c) => dispatch({ type: 'field', key: 'customer', value: c })} />

      <Modal open={!!done} onClose={() => setDone(null)} title={`Invoice ${done?.invoice_no || ''} completed`} size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setDone(null)}>New sale</button><button type="button" className="btn-primary" onClick={() => { setPrintSale(done); setDone(null); printNode(); }}><Printer className="h-4 w-4" /> Print receipt</button></>}>
        {done && (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Total</span><b>{tk(done.grand_total)}</b></div>
            <div className="flex justify-between"><span>Paid</span><b>{tk(done.paid_amount)}</b></div>
            {done.change_amount > 0 && <div className="flex justify-between text-emerald-600"><span>Change</span><b>{tk(done.change_amount)}</b></div>}
            {done.due_amount > 0 && <div className="flex justify-between text-rose-600"><span>Due</span><b>{tk(done.due_amount)}</b></div>}
            {done.points_earned > 0 && <div className="flex justify-between text-violet-600"><span>Points earned</span><b>+{done.points_earned}</b></div>}
            {done.offer_discount > 0 && <div className="flex justify-between text-emerald-600"><span>Saved with offers</span><b>{tk(done.offer_discount)}</b></div>}
            {done.exchange_leftover > 0 && <div className="flex justify-between text-amber-600"><span>{done.exchange?.cash_refund > 0 ? 'Cash back' : 'Kept as credit'}</span><b>{tk(done.exchange_leftover)}</b></div>}
            <div className="pt-3"><p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Send receipt</p><ShareReceipt sale={done} /></div>
          </div>
        )}
      </Modal>

      <ExchangeModal open={exOpen} onClose={() => setExOpen(false)}
        onPick={(ex, customer) => {
          if (cart.items.length && !cart.exchange && !window.confirm('Start an exchange? The current cart stays and becomes the new items.')) return;
          dispatch({ type: 'field', key: 'exchange', value: ex });
          if (customer && !cart.customer) dispatch({ type: 'field', key: 'customer', value: customer });
          setExOpen(false); setPayments([]);
          toast.success(`Returning ${ex.items.length} item(s) worth ${tk(ex.credit)} — now add the new items`);
        }} />

      <div className="print-area hidden print:block"><Receipt sale={printSale} /></div>
    </div>
  );
}
