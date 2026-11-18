import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import JsBarcode from 'jsbarcode';
import { Barcode as BarcodeIcon, Printer, Trash2, FileText, Ruler } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fileUrl } from '../api/client';
import useApi from '../hooks/useApi';
import { ProductPicker } from '../components/Pickers';
import { PageHeader, Field, Empty } from '../components/ui';
import { printNode } from '../components/receipt/Receipt';
import { fmtDate, num, variantLabel, cls } from '../utils/format';

const A4_LAYOUTS = [
  { id: '3x8', cols: 3, rows: 8, label: '3 × 8 (24 per sheet, 70×37mm)' },
  { id: '4x10', cols: 4, rows: 10, label: '4 × 10 (40 per sheet, 52×29mm)' },
  { id: '5x13', cols: 5, rows: 13, label: '5 × 13 (65 per sheet, 38×21mm)' },
];
const THERMAL_PRESETS = [
  { w: 38, h: 25, label: '38 × 25 mm' }, { w: 40, h: 30, label: '40 × 30 mm' },
  { w: 50, h: 25, label: '50 × 25 mm' }, { w: 50, h: 30, label: '50 × 30 mm' }, { w: 58, h: 40, label: '58 × 40 mm' },
];
const FIELDS = [
  ['logo', 'Shop Logo'], ['shop', 'Shop Name'], ['name', 'Product Name'], ['brand', 'Brand'],
  ['variant', 'Size / Color'], ['sku', 'SKU'], ['price', 'Selling Price / MRP'],
];

function BarcodeSvg({ value, height }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, { format: 'CODE128', displayValue: true, fontSize: 10, height, margin: 0, width: 1.3, textMargin: 1 });
    } catch { /* invalid characters */ }
  }, [value, height]);
  return <svg ref={ref} style={{ maxWidth: '100%', height: 'auto' }} />;
}

function Label({ item, show, shop, priceField, widthMm, heightMm }) {
  const price = item[priceField] ?? item.retail_price;
  const small = heightMm < 28;
  return (
    <div style={{ width: `${widthMm}mm`, height: `${heightMm}mm`, padding: '1.2mm', boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: 'Arial, sans-serif', color: '#000', background: '#fff', lineHeight: 1.1 }}>
      {(show.logo || show.shop) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1mm', fontSize: small ? 7 : 8, fontWeight: 700 }}>
          {show.logo && shop.shop_logo && <img src={fileUrl(shop.shop_logo)} alt="" style={{ height: small ? '3mm' : '4mm' }} />}
          {show.shop && <span>{shop.shop_name}</span>}
        </div>
      )}
      {show.name && <div style={{ fontSize: small ? 7 : 8.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{item.name}</div>}
      {(show.brand || show.variant) && <div style={{ fontSize: small ? 6.5 : 7.5 }}>{[show.brand && item.brand, show.variant && variantLabel(item)].filter(Boolean).join(' · ')}</div>}
      <BarcodeSvg value={item.barcode || item.sku} height={small ? 18 : 26} />
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: small ? 7 : 8 }}>
        {show.sku ? <span>{item.sku}</span> : <span />}
        {show.price && price !== null && price !== undefined && <b style={{ fontSize: small ? 8.5 : 10 }}>MRP ৳{num(price)}</b>}
      </div>
    </div>
  );
}

export default function BarcodeLabels() {
  const shop = useSelector((s) => s.settings.data);
  const recent = useApi('/purchases/recent');
  const [purchaseId, setPurchaseId] = useState('');
  const [queue, setQueue] = useState([]);
  const [show, setShow] = useState({ logo: false, shop: true, name: true, brand: false, variant: true, sku: false, price: true });
  const [mode, setMode] = useState('thermal');
  const [a4, setA4] = useState('3x8');
  const [size, setSize] = useState({ w: 38, h: 25 });
  const [priceField, setPriceField] = useState('retail_price');

  const loadPurchase = async (id) => {
    setPurchaseId(id);
    if (!id) return;
    try {
      const { data } = await api.get(`/barcode/purchase/${id}`);
      setQueue(data.filter((r) => r.qty > 0));
      toast.success(`${data.length} item(s) loaded into the print queue`);
    } catch (e) { toast.error(e.message); }
  };
  const addProduct = (p) => setQueue((q) => (q.some((x) => x.variant_id === p.variant_id) ? q.map((x) => (x.variant_id === p.variant_id ? { ...x, qty: x.qty + 1 } : x)) : [...q, { ...p, qty: 1 }]));

  const labels = useMemo(() => queue.flatMap((it) => Array.from({ length: Math.max(0, Math.min(Number(it.qty) || 0, 500)) }, () => it)), [queue]);
  const layout = A4_LAYOUTS.find((l) => l.id === a4);
  const dims = mode === 'a4'
    ? { w: Math.floor((200 / layout.cols) * 10) / 10, h: Math.floor((287 / layout.rows) * 10) / 10 }
    : { w: Number(size.w) || 38, h: Number(size.h) || 25 };

  const print = () => {
    if (!labels.length) return toast.error('Print queue is empty');
    printNode(null, mode === 'a4' ? '@page { size: A4; margin: 5mm; }' : `@page { size: ${dims.w}mm ${dims.h}mm; margin: 0; }`);
  };

  const sheet = (
    mode === 'a4' ? (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${layout.cols}, ${dims.w}mm)`, gridAutoRows: `${dims.h}mm`, width: '200mm', background: '#fff' }}>
        {labels.map((it, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} style={{ outline: '0.1mm dashed #ddd', pageBreakInside: 'avoid' }}><Label item={it} show={show} shop={shop} priceField={priceField} widthMm={dims.w} heightMm={dims.h} /></div>
        ))}
      </div>
    ) : (
      <div>
        {labels.map((it, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} style={{ pageBreakAfter: 'always', breakAfter: 'page' }}><Label item={it} show={show} shop={shop} priceField={priceField} widthMm={dims.w} heightMm={dims.h} /></div>
        ))}
      </div>
    )
  );

  return (
    <div>
      <PageHeader icon={BarcodeIcon} title="Barcode Labels" subtitle="Load a purchase, pick label content, preview and print"
        actions={<button type="button" className="btn-primary" onClick={print}><Printer className="h-4 w-4" /> Print {labels.length} label(s)</button>} />
      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <div className="card space-y-3 p-4">
            <Field label="Load from recent purchase (last 10)">
              <select className="input" value={purchaseId} onChange={(e) => loadPurchase(e.target.value)}>
                <option value="">— select purchase invoice —</option>
                {recent.data?.map((p) => <option key={p.id} value={p.id}>{p.invoice_no} · {p.supplier_name || '—'} · {fmtDate(p.purchase_date)} · {num(p.total_qty)} pcs</option>)}
              </select>
            </Field>
            <Field label="…or add products"><ProductPicker onPick={addProduct} placeholder="Search / scan product" /></Field>
          </div>

          <div className="card p-4">
            <div className="mb-2 flex items-center justify-between"><p className="font-bold">Print queue</p>{queue.length > 0 && <button type="button" className="text-xs text-rose-500" onClick={() => setQueue([])}>Clear all</button>}</div>
            {!queue.length ? <Empty title="Queue is empty" /> : (
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {queue.map((q, i) => (
                  <li key={q.variant_id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{q.name}</span><span className="text-xs text-slate-500">{[variantLabel(q), q.sku].filter(Boolean).join(' · ')}</span></span>
                    <input type="number" min="0" className="input w-20 py-1" value={q.qty} onChange={(e) => setQueue(queue.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                    <button type="button" className="text-rose-500" onClick={() => setQueue(queue.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card space-y-3 p-4">
            <p className="font-bold">Label content</p>
            <div className="grid grid-cols-2 gap-2">
              {FIELDS.map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ocean-600" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />{l}</label>
              ))}
            </div>
            {show.price && <Field label="Price shown"><select className="input" value={priceField} onChange={(e) => setPriceField(e.target.value)}><option value="retail_price">Retail / MRP</option><option value="wholesale_price">Wholesale</option></select></Field>}
          </div>

          <div className="card space-y-3 p-4">
            <p className="font-bold">Printer</p>
            <div className="grid grid-cols-2 gap-2">
              {[['thermal', 'Thermal label printer', Ruler], ['a4', 'A4 sheet', FileText]].map(([k, l, I]) => (
                <button type="button" key={k} onClick={() => setMode(k)} className={cls('flex items-center gap-2 rounded-xl border-2 p-3 text-sm font-semibold', mode === k ? 'border-ocean-500 text-ocean-700 dark:text-ocean-300' : 'border-slate-200 dark:border-slate-700')}><I className="h-4 w-4" />{l}</button>
              ))}
            </div>
            {mode === 'a4' ? (
              <Field label="Sheet layout"><select className="input" value={a4} onChange={(e) => setA4(e.target.value)}>{A4_LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></Field>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">{THERMAL_PRESETS.map((p) => <button type="button" key={p.label} className={cls('chip', Number(size.w) === p.w && Number(size.h) === p.h && 'chip-active')} onClick={() => setSize({ w: p.w, h: p.h })}>{p.label}</button>)}</div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Custom width (mm)"><input type="number" min="20" max="120" className="input" value={size.w} onChange={(e) => setSize({ ...size, w: e.target.value })} /></Field>
                  <Field label="Custom height (mm)"><input type="number" min="10" max="120" className="input" value={size.h} onChange={(e) => setSize({ ...size, h: e.target.value })} /></Field>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Live preview */}
        <div className="card min-w-0 p-4">
          <p className="mb-3 font-bold">Live preview <span className="text-sm font-normal text-slate-500">· {labels.length} label(s) · {dims.w} × {dims.h} mm</span></p>
          {!labels.length ? <Empty icon={BarcodeIcon} title="Nothing to preview" hint="Load a purchase or add products." /> : (
            <div className="max-h-[75vh] overflow-auto rounded-xl bg-slate-200 p-4 dark:bg-slate-800">
              {mode === 'a4' ? <div className="mx-auto w-fit bg-white p-[5mm] shadow-lg">{sheet}</div> : (
                <div className="flex flex-wrap gap-3">
                  {labels.slice(0, 60).map((it, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={i} className="shadow-md"><Label item={it} show={show} shop={shop} priceField={priceField} widthMm={dims.w} heightMm={dims.h} /></div>
                  ))}
                  {labels.length > 60 && <p className="self-center text-sm text-slate-500">+{labels.length - 60} more…</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="print-area hidden print:block">{sheet}</div>
    </div>
  );
}
