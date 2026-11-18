import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Plus, Trash2, Star, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fileUrl } from '../api/client';
import useApi from '../hooks/useApi';
import { Modal, Field, Spinner } from './ui';
import { processProductImage, blobName } from '../utils/image';

const newVariant = () => ({ size: '', color: '', sku: '', barcode: '', purchase_price: '', retail_price: '', wholesale_price: '', opening_stock: '', low_stock_alert: 3 });

/**
 * Create / edit a product with clothing variants (size × colour) and an image.
 * The server normalises any uploaded image to a 500×500 WebP (no cropping),
 * so the preview here shows exactly what will be stored.
 */
export default function ProductForm({ open, onClose, onSaved, editId = null }) {
  const cats = useApi(open ? '/categories' : null);
  const brands = useApi(open ? '/brands' : null);
  const [f, setF] = useState({ name: '', category_id: '', brand_id: '', description: '', unit: 'pcs', is_favorite: false });
  const [variants, setVariants] = useState([newVariant()]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState({ sizes: '', colors: '' });
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    if (editId) {
      api.get(`/products/${editId}`).then(({ data }) => {
        setF({ name: data.name, category_id: data.category_id || '', brand_id: data.brand_id || '', description: data.description || '', unit: data.unit, is_favorite: !!data.is_favorite });
        setVariants(data.variants.map((v) => ({ ...v, retail_price: v.retail_price ?? '', wholesale_price: v.wholesale_price ?? '' })));
        setPreview(fileUrl(data.image_path));
      });
    } else {
      setF({ name: '', category_id: '', brand_id: '', description: '', unit: 'pcs', is_favorite: false });
      setVariants([newVariant()]);
      setPreview(null);
    }
  }, [open, editId]);

  // Normalise on the device: 500×500, trimmed, nothing cropped, compressed.
  // The preview shows exactly what will be uploaded and stored.
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

  const generate = () => {
    const sizes = gen.sizes.split(',').map((s) => s.trim()).filter(Boolean);
    const colors = gen.colors.split(',').map((s) => s.trim()).filter(Boolean);
    if (!sizes.length && !colors.length) return;
    const base = variants[0] || newVariant();
    const combos = [];
    for (const s of sizes.length ? sizes : ['']) for (const c of colors.length ? colors : ['']) combos.push({ ...newVariant(), purchase_price: base.purchase_price, retail_price: base.retail_price, wholesale_price: base.wholesale_price, size: s, color: c });
    setVariants([...variants.filter((v) => v.id || v.size || v.color), ...combos]);
  };

  const quickCreate = async (kind) => {
    const name = window.prompt(`New ${kind === 'categories' ? 'category' : 'brand'} name`);
    if (!name) return;
    const { data } = await api.post(`/${kind}`, { name });
    (kind === 'categories' ? cats : brands).reload();
    setF((x) => ({ ...x, [kind === 'categories' ? 'category_id' : 'brand_id']: data.id }));
  };

  const save = async () => {
    if (!f.name.trim()) return toast.error('Product name is required');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('data', JSON.stringify({ ...f, category_id: f.category_id || null, brand_id: f.brand_id || null, variants, remove_image: !preview }));
      if (file) fd.append('image', file, blobName(file, 'product'));
      const { data } = editId ? await api.put(`/products/${editId}`, fd) : await api.post('/products', fd);
      toast.success(editId ? 'Product updated' : 'Product created');
      onSaved?.(data);
      onClose();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editId ? 'Edit product' : 'New product'} size="xl"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner className="h-4 w-4 text-white" />} Save product</button></>}>
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        {/* Image */}
        <div>
          <button type="button" onClick={() => fileRef.current?.click()} className="group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-ocean-400 dark:border-slate-700 dark:bg-slate-800">
            {preview ? <img src={preview} alt="" className="h-full w-full object-contain" /> : <span className="flex flex-col items-center gap-2 text-sm text-slate-500"><ImagePlus className="h-8 w-8" /> Upload photo</span>}
            {processing && <span className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-slate-900/70"><Spinner /></span>}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickImage} />
          <p className="mt-2 text-center text-[11px] text-slate-400">Any size → auto 500×500, nothing cropped, compressed on this device.</p>
          {preview && <button type="button" className="mt-1 w-full text-xs text-rose-500" onClick={() => { setPreview(null); setFile(null); }}>Remove image</button>}
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Product name *" className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Cotton Casual Shirt" /></Field>
            <Field label="Category">
              <div className="flex gap-1"><select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">—</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button type="button" className="btn-secondary px-2.5" onClick={() => quickCreate('categories')}><Plus className="h-4 w-4" /></button></div>
            </Field>
            <Field label="Brand">
              <div className="flex gap-1"><select className="input" value={f.brand_id} onChange={(e) => setF({ ...f, brand_id: e.target.value })}><option value="">—</option>{brands.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button type="button" className="btn-secondary px-2.5" onClick={() => quickCreate('brands')}><Plus className="h-4 w-4" /></button></div>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ocean-600" checked={f.is_favorite} onChange={(e) => setF({ ...f, is_favorite: e.target.checked })} /><Star className="h-4 w-4 text-amber-400" /> Show in POS Favorites</label>

          <div className="rounded-xl border border-dashed border-ocean-300 bg-ocean-50/50 p-3 dark:border-ocean-800 dark:bg-ocean-950/30">
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-ocean-700 dark:text-ocean-300"><Wand2 className="h-3.5 w-3.5" /> Generate variants (size × colour)</p>
            <div className="flex flex-wrap gap-2">
              <input className="input w-auto flex-1 py-1.5" placeholder="Sizes: S, M, L, XL" value={gen.sizes} onChange={(e) => setGen({ ...gen, sizes: e.target.value })} />
              <input className="input w-auto flex-1 py-1.5" placeholder="Colours: Red, Navy" value={gen.colors} onChange={(e) => setGen({ ...gen, colors: e.target.value })} />
              <button type="button" className="btn-secondary btn-sm" onClick={generate}>Generate</button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="table min-w-[1000px]">
          <thead><tr><th>Size</th><th>Colour</th><th>SKU</th><th>Barcode</th><th>Cost</th><th>Retail</th><th>Wholesale</th>{!editId && <th>Opening stock</th>}<th>Alert ≤</th><th /></tr></thead>
          <tbody>
            {variants.map((v, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <tr key={v.id || `n${i}`}>
                <td><input className="input w-20 py-1.5" value={v.size || ''} onChange={(e) => setV(i, 'size', e.target.value)} /></td>
                <td><input className="input w-28 py-1.5" value={v.color || ''} onChange={(e) => setV(i, 'color', e.target.value)} /></td>
                <td><input className="input w-32 py-1.5" placeholder="auto" value={v.sku || ''} onChange={(e) => setV(i, 'sku', e.target.value)} /></td>
                <td><input className="input w-32 py-1.5" placeholder="= SKU" value={v.barcode || ''} onChange={(e) => setV(i, 'barcode', e.target.value)} /></td>
                <td><input type="number" className="input w-24 py-1.5" value={v.purchase_price} onChange={(e) => setV(i, 'purchase_price', e.target.value)} /></td>
                <td><input type="number" className="input w-24 py-1.5" value={v.retail_price} onChange={(e) => setV(i, 'retail_price', e.target.value)} /></td>
                <td><input type="number" className="input w-24 py-1.5" value={v.wholesale_price} onChange={(e) => setV(i, 'wholesale_price', e.target.value)} /></td>
                {!editId && <td><input type="number" className="input w-20 py-1.5" value={v.opening_stock} onChange={(e) => setV(i, 'opening_stock', e.target.value)} /></td>}
                <td><input type="number" className="input w-16 py-1.5" value={v.low_stock_alert} onChange={(e) => setV(i, 'low_stock_alert', e.target.value)} /></td>
                <td>{variants.length > 1 && <button type="button" className="text-rose-500" onClick={() => setVariants(variants.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn-ghost btn-sm mt-2 text-ocean-600" onClick={() => setVariants([...variants, newVariant()])}><Plus className="h-3.5 w-3.5" /> Add variant</button>
      </div>
    </Modal>
  );
}
