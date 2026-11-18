import { useState } from 'react';
import { Package, Plus, Search, Pencil, Trash2, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fileUrl } from '../api/client';
import useApi from '../hooks/useApi';
import ProductForm from '../components/ProductForm';
import { PageHeader, Pagination, Empty, useDebounced, PageLoader } from '../components/ui';
import { tk, num, cls } from '../utils/format';

/** Product catalogue (opened from Purchase / Price Manager). */
export default function Products() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [cat, setCat] = useState('');
  const [low, setLow] = useState(false);
  const dq = useDebounced(q);
  const cats = useApi('/categories');
  const { data, loading, reload } = useApi('/products', { q: dq, page, category_id: cat || undefined, low_stock: low ? 1 : undefined });
  const [form, setForm] = useState({ open: false, id: null });

  const remove = async (id) => {
    if (!window.confirm('Archive this product? It will disappear from POS but stay in old invoices.')) return;
    try { await api.delete(`/products/${id}`); toast.success('Archived'); reload(); } catch (e) { toast.error(e.message); }
  };

  return (
    <div>
      <PageHeader icon={Package} title="Products" subtitle="Catalogue, variants, stock and photos"
        actions={<button type="button" className="btn-primary" onClick={() => setForm({ open: true, id: null })}><Plus className="h-4 w-4" /> New product</button>} />
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="Name, SKU, barcode, brand…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <select className="input w-48" value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }}><option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-ocean-600" checked={low} onChange={(e) => setLow(e.target.checked)} /> Low stock</label>
      </div>
      {loading && !data ? <PageLoader /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Product</th><th>Variant</th><th>SKU / Barcode</th><th>Category</th><th className="text-right">Cost</th><th className="text-right">Retail</th><th className="text-right">Stock</th><th /></tr></thead>
            <tbody>{data?.data.map((p) => (
              <tr key={p.variant_id}>
                <td>
                  <div className="flex items-center gap-3">
                    {p.image_path ? <img src={fileUrl(p.image_path)} alt="" className="h-10 w-10 rounded-lg border border-slate-100 object-contain dark:border-slate-800" /> : <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-400 dark:bg-slate-800">{p.name.slice(0, 2)}</span>}
                    <span className="font-medium">{p.name}{p.is_favorite ? <Star className="ml-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" /> : null}<div className="text-xs text-slate-500">{p.brand}</div></span>
                  </div>
                </td>
                <td>{[p.size, p.color].filter(Boolean).join(' / ') || '—'}</td>
                <td className="text-xs">{p.sku}<div className="text-slate-500">{p.barcode}</div></td>
                <td>{p.category || '—'}</td>
                <td className="text-right">{tk(p.purchase_price)}</td>
                <td className="text-right font-semibold">{p.retail_price === null ? <span className="text-amber-600">Not set</span> : tk(p.retail_price)}</td>
                <td className={cls('text-right font-semibold', p.stock_qty <= p.low_stock_alert && 'text-rose-600')}>{num(p.stock_qty)}</td>
                <td className="whitespace-nowrap text-right">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setForm({ open: true, id: p.product_id })}><Pencil className="h-4 w-4" /></button>
                  <button type="button" className="btn-ghost btn-sm text-rose-500" onClick={() => remove(p.product_id)}><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {!data?.data.length && <Empty icon={Package} title="No products" hint="Add your first product to start selling." action={<button type="button" className="btn-primary" onClick={() => setForm({ open: true, id: null })}><Plus className="h-4 w-4" /> New product</button>} />}
          <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} />
        </div>
      )}
      <ProductForm open={form.open} editId={form.id} onClose={() => setForm({ open: false, id: null })} onSaved={reload} />
    </div>
  );
}
