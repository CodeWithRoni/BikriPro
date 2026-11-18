import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImagePlus, Plus, Trash2, Star, Wand2, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fileUrl } from '../api/client';
import useCatalog from '../hooks/useCatalog';
import { Modal, Spinner } from './ui';
import { processProductImage, blobName } from '../utils/image';
import { cls } from '../utils/format';

const newVariant = () => ({ size: '', color: '', sku: '', barcode: '', purchase_price: '', retail_price: '', wholesale_price: '', opening_stock: '', low_stock_alert: 3 });
const blankProduct = () => ({ name: '', main_id: '', sub_id: '', brand_id: '', description: '', unit: 'pcs', is_favorite: false });
const split = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

/** Variant columns: fixed proportions so every field fits without sideways scrolling. */
const COLS = (withStock) => (withStock
  ? 'lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,.9fr)_minmax(0,.9fr)_minmax(0,.9fr)_minmax(0,.8fr)_minmax(0,.6fr)_2rem]'
  : 'lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,.9fr)_minmax(0,.9fr)_minmax(0,.9fr)_minmax(0,.6fr)_2rem]');

/**
 * Create / edit a product with clothing variants (size × colour) and an image.
 * Drop-downs and chips come from Product Setup. The image is normalised on the
 * device to 500×500 (nothing cropped), so the preview is exactly what is stored.
 */
export default function ProductForm({ open, onClose, onSaved, editId = null }) {
  const c = useCatalog(open);
  const [f, setF] = useState(blankProduct);
  const [variants, setVariants] = useState([newVariant()]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState({ sizes: '', colors: '', set: '' });
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setGen({ sizes: '', colors: '', set: '' });
    if (editId) {
      api.get(`/products/${editId}`).then(({ data }) => {
        setF({ name: data.name, main_id: data.category_id || '', sub_id: '', brand_id: data.brand_id || '', description: data.description || '', unit: data.unit || 'pcs', is_favorite: !!data.is_favorite, _category_id: data.category_id });
        setVariants(data.variants.map((v) => ({ ...v, retail_price: v.retail_price ?? '', wholesale_price: v.wholesale_price ?? '' })));
        setPreview(fileUrl(data.image_path));
      }).catch((e) => toast.error(e.message));
    } else {
      setF(blankProduct());
      setVariants([newVariant()]);
      setPreview(null);
    }
  }, [open, editId]);

  // When editing a product filed under a sub-category, split it into main + sub once categories load
  useEffect(() => {
    if (!f._category_id || !c.categories.length) return;
    const cat = c.categoryById[f._category_id];
    setF((x) => ({ ...x, _category_id: undefined, main_id: cat?.parent_id || x.main_id, sub_id: cat?.parent_id ? cat.id : '' }));
  }, [f._category_id, c.categories, c.categoryById]);

  const pickImage = async (e) => {
    const img = e.target.files?.[0];
    e.target.value = '';
    if (!img) return;
    setProcessing(true);
    try {
      const out = await processProductImage(img);
      setFile(out.blob);
      setPreview(out.url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const setV = (i, k, v) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const toggleGen = (key, v) => {
    const list = split(gen[key]);
    const has = list.some((x) => x.toLowerCase() === v.toLowerCase());
    setGen({ ...gen, [key]: (has ? list.filter((x) => x.toLowerCase() !== v.toLowerCase()) : [...list, v]).join(', ') });
  };
  const pickSet = (id) => {
    const set = c.variations.find((v) => String(v.id) === String(id));
    setGen({ ...gen, set: id, sizes: set ? set.value : gen.sizes });
  };

  const generate = () => {
    const sizes = split(gen.sizes);
    const colors = split(gen.colors);
    if (!sizes.length && !colors.length) return toast.error('Choose sizes and/or colours first');
    const base = variants[0] || newVariant();
    const existing = new Set(variants.map((v) => `${(v.size || '').toLowerCase()}|${(v.color || '').toLowerCase()}`));
    const combos = [];
    for (const s of sizes.length ? sizes : ['']) {
      for (const col of colors.length ? colors : ['']) {
        if (!existing.has(`${s.toLowerCase()}|${col.toLowerCase()}`)) {
          combos.push({ ...newVariant(), purchase_price: base.purchase_price, retail_price: base.retail_price, wholesale_price: base.wholesale_price, low_stock_alert: base.low_stock_alert, size: s, color: col });
        }
      }
    }
    if (!combos.length) return toast('These variants are already in the list');
    setVariants([...variants.filter((v) => v.id || v.size || v.color || v.sku || v.purchase_price), ...combos]);
    toast.success(`${combos.length} variant${combos.length === 1 ? '' : 's'} added`);
  };

  const quickCreate = async (kind) => {
    const label = { main: 'category', sub: 'sub category', brand: 'brand' }[kind];
    if (kind === 'sub' && !f.main_id) return toast.error('Choose a category first');
    const name = window.prompt(`New ${label} name`);
    if (!name?.trim()) return;
    try {
      if (kind === 'brand') {
        const { data } = await api.post('/brands', { name });
        c.reloadBrands();
        setF((x) => ({ ...x, brand_id: data.id }));
      } else {
        const { data } = await api.post('/categories', { name, parent_id: kind === 'sub' ? f.main_id : null });
        c.reloadCategories();
        setF((x) => (kind === 'sub' ? { ...x, sub_id: data.id } : { ...x, main_id: data.id, sub_id: '' }));
      }
    } catch (e) { toast.error(e.message); }
  };

  const save = async () => {
    if (!f.name.trim()) return toast.error('Product name is required');
    setBusy(true);
    try {
      const fd = new FormData();
      const { main_id: mainId, sub_id: subId, _category_id: _unused, ...rest } = f;
      fd.append('data', JSON.stringify({ ...rest, category_id: subId || mainId || null, brand_id: f.brand_id || null, variants, remove_image: !preview }));
      if (file) fd.append('image', file, blobName(file, 'product'));
      const { data } = editId ? await api.put(`/products/${editId}`, fd) : await api.post('/products', fd);
      toast.success(editId ? 'Product updated' : 'Product created');
      onSaved?.(data);
      onClose();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const subs = c.subsOf(f.main_id);
  const units = c.units.some((u) => (u.value || u.name) === f.unit) || !f.unit ? c.units : [...c.units, { id: 'cur', name: f.unit, value: f.unit }];
  const withStock = !editId;
  const genSizes = split(gen.sizes).map((x) => x.toLowerCase());
  const genColors = split(gen.colors).map((x) => x.toLowerCase());

  return (
    <Modal open={open} onClose={onClose} title={editId ? 'Edit product' : 'New product'} size="2xl"
      footer={<>
        <Link to="/product-setup" onClick={onClose} className="mr-auto inline-flex items-center gap-1.5 self-center text-xs font-semibold text-slate-500 hover:text-ocean-600"><Settings2 className="h-3.5 w-3.5" /> Product Setup</Link>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner className="h-4 w-4 text-white" />} Save product</button>
      </>}>
      <datalist id="bp-sizes">{c.sizes.map((s) => <option key={s.id} value={s.name} />)}</datalist>
      <datalist id="bp-colors">{c.colors.map((s) => <option key={s.id} value={s.name} />)}</datalist>

      <div className="grid gap-5 md:grid-cols-[190px_minmax(0,1fr)]">
        {/* Image */}
        <div>
          <button type="button" onClick={() => fileRef.current?.click()} className="group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-ocean-400 dark:border-slate-700 dark:bg-slate-800">
            {preview ? <img src={preview} alt="" className="h-full w-full object-contain" /> : <span className="flex flex-col items-center gap-2 text-sm text-slate-500"><ImagePlus className="h-8 w-8" /> Upload photo</span>}
            {processing && <span className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-slate-900/70"><Spinner /></span>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickImage} />
          <p className="mt-2 text-center text-[11px] leading-snug text-slate-400">Any size → auto 500×500, nothing cropped, compressed on this device.</p>
          {preview && <button type="button" className="mt-1 w-full text-xs text-rose-500" onClick={() => { setPreview(null); setFile(null); }}>Remove image</button>}
        </div>

        {/* Details */}
        <div className="min-w-0 space-y-4">
          <div>
            <span className="label">Product name *</span>
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Cotton Casual Shirt" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PickWithAdd label="Category" value={f.main_id} onChange={(v) => setF({ ...f, main_id: v, sub_id: '' })} options={c.main} onAdd={() => quickCreate('main')} />
            <PickWithAdd label="Sub category" value={f.sub_id} onChange={(v) => setF({ ...f, sub_id: v })} options={subs} onAdd={() => quickCreate('sub')} disabled={!f.main_id} placeholder={f.main_id ? (subs.length ? '—' : 'None yet') : 'Pick category'} />
            <PickWithAdd label="Brand" value={f.brand_id} onChange={(v) => setF({ ...f, brand_id: v })} options={c.brands} onAdd={() => quickCreate('brand')} />
            <div>
              <span className="label">Unit</span>
              <select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
                {units.map((u) => <option key={u.id} value={u.value || u.name}>{u.name}{u.value && u.value !== u.name ? ` (${u.value})` : ''}</option>)}
                {!units.length && <option value="pcs">Piece (pcs)</option>}
              </select>
            </div>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="accent-ocean-600" checked={f.is_favorite} onChange={(e) => setF({ ...f, is_favorite: e.target.checked })} /><Star className="h-4 w-4 text-amber-400" /> Show in POS Favorites</label>

          {/* Variant generator */}
          <div className="space-y-2.5 rounded-xl border border-dashed border-ocean-300 bg-ocean-50/50 p-3.5 dark:border-ocean-800 dark:bg-ocean-950/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ocean-700 dark:text-ocean-300"><Wand2 className="h-3.5 w-3.5" /> Generate variants (size × colour)</p>
              {c.variations.length > 0 && (
                <select className="input-sm w-auto py-1 text-xs" value={gen.set} onChange={(e) => pickSet(e.target.value)} aria-label="Variation set">
                  <option value="">Use a variation set…</option>
                  {c.variations.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.value})</option>)}
                </select>
              )}
            </div>
            {c.sizes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-12 text-[11px] font-semibold uppercase text-slate-500">Size</span>
                {c.sizes.map((s) => <button type="button" key={s.id} className={cls('chip py-0.5', genSizes.includes(s.name.toLowerCase()) && 'chip-active')} onClick={() => toggleGen('sizes', s.name)}>{s.name}</button>)}
              </div>
            )}
            {c.colors.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-12 text-[11px] font-semibold uppercase text-slate-500">Colour</span>
                {c.colors.map((s) => (
                  <button type="button" key={s.id} className={cls('chip inline-flex items-center gap-1.5 py-0.5', genColors.includes(s.name.toLowerCase()) && 'chip-active')} onClick={() => toggleGen('colors', s.name)}>
                    {s.value && <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: s.value }} />}{s.name}
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input className="input-sm" placeholder="Sizes: S, M, L, XL" value={gen.sizes} onChange={(e) => setGen({ ...gen, sizes: e.target.value, set: '' })} />
              <input className="input-sm" placeholder="Colours: Red, Navy" value={gen.colors} onChange={(e) => setGen({ ...gen, colors: e.target.value })} />
              <button type="button" className="btn-primary btn-sm px-4" onClick={generate}><Wand2 className="h-3.5 w-3.5" /> Generate</button>
            </div>
          </div>
        </div>
      </div>

      {/* Variants */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold">Variants <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{variants.length}</span></p>
          <p className="hidden text-[11px] text-slate-400 sm:block">SKU and barcode are created automatically when left empty.</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800">
          <div className={cls('hidden gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 lg:grid', COLS(withStock))}>
            <span>Size</span><span>Colour</span><span>SKU</span><span>Barcode</span><span>Cost</span><span>Retail</span><span>Wholesale</span>{withStock && <span>Opening stock</span>}<span>Alert ≤</span><span />
          </div>
          <div className={cls('divide-y divide-slate-100 dark:divide-slate-800', variants.length > 6 && 'max-h-[19rem] overflow-y-auto')}>
            {variants.map((v, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={v.id || `n${i}`} className={cls('relative grid grid-cols-2 gap-2 p-3 pr-11 sm:grid-cols-4 lg:items-center lg:py-2 lg:pr-3', COLS(withStock))}>
                <Cell label="Size"><input className="input-sm" list="bp-sizes" value={v.size || ''} onChange={(e) => setV(i, 'size', e.target.value)} /></Cell>
                <Cell label="Colour">
                  <div className="relative">
                    {c.colorHex(v.color) && <span className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-black/10" style={{ background: c.colorHex(v.color) }} />}
                    <input className={cls('input-sm', c.colorHex(v.color) && 'pl-7')} list="bp-colors" value={v.color || ''} onChange={(e) => setV(i, 'color', e.target.value)} />
                  </div>
                </Cell>
                <Cell label="SKU"><input className="input-sm" placeholder="auto" value={v.sku || ''} onChange={(e) => setV(i, 'sku', e.target.value)} /></Cell>
                <Cell label="Barcode"><input className="input-sm" placeholder="= SKU" value={v.barcode || ''} onChange={(e) => setV(i, 'barcode', e.target.value)} /></Cell>
                <Cell label="Cost"><input type="number" min="0" inputMode="decimal" className="input-sm no-spin text-right" value={v.purchase_price} onChange={(e) => setV(i, 'purchase_price', e.target.value)} /></Cell>
                <Cell label="Retail"><input type="number" min="0" inputMode="decimal" className="input-sm no-spin text-right" value={v.retail_price} onChange={(e) => setV(i, 'retail_price', e.target.value)} /></Cell>
                <Cell label="Wholesale"><input type="number" min="0" inputMode="decimal" className="input-sm no-spin text-right" value={v.wholesale_price} onChange={(e) => setV(i, 'wholesale_price', e.target.value)} /></Cell>
                {withStock && <Cell label="Opening stock"><input type="number" min="0" inputMode="numeric" className="input-sm no-spin text-right" value={v.opening_stock} onChange={(e) => setV(i, 'opening_stock', e.target.value)} /></Cell>}
                <Cell label="Alert ≤"><input type="number" min="0" inputMode="numeric" className="input-sm no-spin text-right" value={v.low_stock_alert} onChange={(e) => setV(i, 'low_stock_alert', e.target.value)} /></Cell>
                <div className="absolute right-2 top-2 lg:static lg:flex lg:justify-center">
                  {variants.length > 1 && <button type="button" className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/30" onClick={() => setVariants(variants.filter((_, j) => j !== i))} aria-label="Remove variant"><Trash2 className="h-4 w-4" /></button>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <button type="button" className="btn-ghost btn-sm mt-2 text-ocean-600" onClick={() => setVariants([...variants, newVariant()])}><Plus className="h-3.5 w-3.5" /> Add variant</button>
      </div>
    </Modal>
  );
}

/** Field inside a variant row: labelled on small screens, label hidden in the desktop grid (header row shows it). */
function Cell({ label, children }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 lg:hidden">{label}</span>
      {children}
    </label>
  );
}

function PickWithAdd({ label, value, onChange, options, onAdd, disabled, placeholder = '—' }) {
  return (
    <div className="min-w-0">
      <span className="label">{label}</span>
      <div className="flex gap-1.5">
        <select className="input min-w-0" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="">{placeholder}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <button type="button" className="btn-secondary shrink-0 px-2.5" onClick={onAdd} disabled={disabled} aria-label={`New ${label.toLowerCase()}`}><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
