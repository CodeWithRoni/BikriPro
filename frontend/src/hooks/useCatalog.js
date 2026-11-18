import { useMemo } from 'react';
import useApi from './useApi';

/**
 * Everything defined in Product Setup, in one place:
 * categories (main + sub), brands, unit types, colours, sizes and variation sets.
 * Pass enabled = false to skip loading (e.g. while a modal is closed).
 */
export default function useCatalog(enabled = true) {
  const cats = useApi(enabled ? '/categories' : null);
  const brands = useApi(enabled ? '/brands' : null);
  const attrs = useApi(enabled ? '/product-attributes' : null);

  const derived = useMemo(() => {
    const all = cats.data || [];
    const main = all.filter((c) => !c.parent_id);
    const subsOf = (parentId) => all.filter((c) => parentId && Number(c.parent_id) === Number(parentId));
    const byId = Object.fromEntries(all.map((c) => [c.id, c]));
    const a = attrs.data || {};
    const colorHex = Object.fromEntries((a.color || []).map((c) => [c.name.toLowerCase(), c.value]));
    return {
      categories: all, main, subs: all.filter((c) => c.parent_id), subsOf, categoryById: byId,
      brands: brands.data || [],
      units: a.unit || [], colors: a.color || [], sizes: a.size || [], variations: a.variation || [],
      colorHex: (name) => colorHex[String(name || '').toLowerCase()] || null,
    };
  }, [cats.data, brands.data, attrs.data]);

  const reload = () => { cats.reload(); brands.reload(); attrs.reload(); };
  return { ...derived, loading: cats.loading || brands.loading || attrs.loading, reload, reloadCategories: cats.reload, reloadBrands: brands.reload, reloadAttrs: attrs.reload };
}
