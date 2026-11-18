import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client';

/**
 * GET helper: const { data, loading, error, reload } = useApi('/sales', { from, to });
 * Re-fetches whenever url/params change. Pass url = null to skip.
 */
export default function useApi(url, params) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState(null);
  const key = JSON.stringify(params || {});
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(url, { params: JSON.parse(key) });
      if (my === seq.current) setData(res.data);
    } catch (e) {
      if (my === seq.current) setError(e.message);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [url, key]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load, setData };
}
