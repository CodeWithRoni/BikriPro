import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Tags, Search, Save, Wand2, Package, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PageHeader, Pagination, Empty, Modal, Field, useDebounced, PageLoader } from '../components/ui';
import { tk, num, cls } from '../utils/format';

const FILTERS = [
  ['', 'All products', null],
  ['unpriced', 'Unpriced', 'unpriced'],
  ['no_retail', 'Missing retail', 'no_retail'],
  ['no_wholesale', 'Missing wholesale', 'no_wholesale'],
  ['below_cost', 'Below cost', 'below_cost'],
];

export default function PriceManager() {
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [brand, setBrand] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const cats = useApi('/categories');
  const brands = useApi('/brands');
  const { data, loading, reload } = useApi('/price-manager', { filter: filter || undefined, q: dq || undefined, category_id: cat || undefined, brand_id: brand || undefined, page });
  const [edits, setEdits] = useState({});
  const [selected, setSelected] = useState([]);
  const [bulk, setBulk] = useState(null);

  const val = (r, k) => (edits[r.variant_id]?.[k] !== undefined ? edits[r.variant_id][k] : r[k] ?? '');
  const setEdit = (id, k, v) => setEdits((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));
  const dirty = Object.keys(edits).length;

  const saveEdits = async () => {
    try {
      const updates = Object.entries(edits).map(([id, e]) => ({ variant_id: Number(id), ...e }));
      const { data: r } = await api.put('/price-manager/bulk', { updates });
      toast.success(`${r.updated} price(s) updated`); setEdits({}); reload();
    } catch (e) { toast.error(e.message); }
  };
  const applyBulk = async () => {
    try {
      const { data: r } = await api.put('/price-manager/bulk', { variant_ids: selected, rule: { ...bulk, value: Number(bulk.value), round_to: Number(bulk.round_to) || undefined } });
      toast.success(`${r.updated} price(s) updated`); setBulk(null); setSelected([]); reload();
    } catch (e) { toast.error(e.message); }
  };

  const rows = data?.data || [];
  const allSel = rows.length && rows.every((r) => selected.includes(r.variant_id));

  return (
    <div>
      <PageHeader icon={Tags} title="Price Manager" subtitle="Set retail and wholesale prices one by one or in bulk"
        actions={<>
          <Link to="/products" className="btn-secondary"><Package className="h-4 w-4" /> Products</Link>
          <button type="button" className="btn-secondary" disabled={!selected.length} onClick={() => setBulk({ field: 'retail_price', mode: 'markup_percent', value: '', round_to: 10 })}><Wand2 className="h-4 w-4" /> Bulk update ({selected.length})</button>
          <button type="button" className="btn-primary" disabled={!dirty} onClick={saveEdits}><Save className="h-4 w-4" /> Save {dirty || ''} change(s)</button>
        </>} />

      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map(([k, l, countKey]) => (
          <button type="button" key={k} className={cls('chip flex items-center gap-1.5', filter === k && 'chip-active')} onClick={() => { setFilter(k); setPage(1); }}>
            {l}{countKey && data?.counts?.[countKey] > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">{data.counts[countKey]}</span>}
          </button>
        ))}
      </div>
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[200px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="Name, SKU, barcode…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <select className="input w-44" value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }}><option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input w-44" value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }}><option value="">All brands</option>{brands.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>

      {loading && !data ? <PageLoader /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th><input type="checkbox" className="accent-ocean-600" checked={!!allSel} onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.variant_id) : [])} /></th>
              <th>Product</th><th>Category / Brand</th><th className="text-right">Stock</th><th>Cost</th><th>Retail (MRP)</th><th>Wholesale</th><th className="text-right">Margin</th>
            </tr></thead>
            <tbody>{rows.map((r) => {
              const retail = Number(val(r, 'retail_price'));
              const cost = Number(val(r, 'purchase_price'));
              const margin = retail ? ((retail - cost) / retail) * 100 : null;
              return (
                <tr key={r.variant_id} className={cls(edits[r.variant_id] && 'bg-amber-50/60 dark:bg-amber-900/10')}>
                  <td><input type="checkbox" className="accent-ocean-600" checked={selected.includes(r.variant_id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.variant_id] : s.filter((x) => x !== r.variant_id)))} /></td>
                  <td className="font-medium">{r.name}<div className="text-xs text-slate-500">{[r.size, r.color, r.sku].filter(Boolean).join(' · ')}</div></td>
                  <td className="text-slate-500">{r.category || '—'}<div className="text-xs">{r.brand}</div></td>
                  <td className="text-right">{num(r.stock_qty)}</td>
                  {['purchase_price', 'retail_price', 'wholesale_price'].map((k) => (
                    <td key={k}><input type="number" className={cls('input w-28 py-1.5', k !== 'purchase_price' && val(r, k) === '' && 'border-amber-400 bg-amber-50 dark:bg-amber-900/20')} placeholder="—" value={val(r, k)} onChange={(e) => setEdit(r.variant_id, k, e.target.value)} /></td>
                  ))}
                  <td className={cls('text-right font-semibold', margin !== null && margin < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                    {margin === null ? <AlertTriangle className="ml-auto h-4 w-4 text-amber-500" /> : `${margin.toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
          {!rows.length && <Empty icon={Tags} title="Nothing matches this filter" />}
          <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} />
        </div>
      )}

      <Modal open={!!bulk} onClose={() => setBulk(null)} title={`Bulk update ${selected.length} product(s)`} size="sm"
        footer={<><button type="button" className="btn-secondary" onClick={() => setBulk(null)}>Cancel</button><button type="button" className="btn-primary" disabled={bulk?.value === ''} onClick={applyBulk}>Apply</button></>}>
        {bulk && (
          <div className="space-y-3">
            <Field label="Price to change"><select className="input" value={bulk.field} onChange={(e) => setBulk({ ...bulk, field: e.target.value })}><option value="retail_price">Retail (MRP)</option><option value="wholesale_price">Wholesale</option></select></Field>
            <Field label="Rule"><select className="input" value={bulk.mode} onChange={(e) => setBulk({ ...bulk, mode: e.target.value })}>
              <option value="markup_percent">Cost + markup %</option><option value="increase_percent">Increase current by %</option><option value="increase_amount">Increase current by Tk</option><option value="set">Set exact price</option>
            </select></Field>
            <Field label={bulk.mode.includes('percent') ? 'Percent' : 'Amount (Tk)'} hint="Use a negative number to decrease"><input type="number" className="input" value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} /></Field>
            <Field label="Round to nearest" hint="e.g. 10 → 1,147 becomes 1,150"><select className="input" value={bulk.round_to} onChange={(e) => setBulk({ ...bulk, round_to: e.target.value })}><option value="">No rounding</option><option value="5">5</option><option value="10">10</option><option value="50">50</option><option value="100">100</option></select></Field>
            {bulk.mode === 'markup_percent' && bulk.value !== '' && <p className="text-xs text-slate-500">Example: cost {tk(500)} → {tk(500 * (1 + Number(bulk.value) / 100))}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
