import { useState } from 'react';
import { History, Search } from 'lucide-react';
import useApi from '../hooks/useApi';
import { PageHeader, DateRange, Pagination, Empty, Badge, useDebounced, PageLoader } from '../components/ui';
import { fmtDateTime, addDays, todayStr } from '../utils/format';
import Select from '../components/ui/Select';

const TONE = { create: 'green', update: 'ocean', delete: 'rose', login: 'slate', reset: 'rose', import: 'amber', export: 'ocean' };

export default function ActivityLog() {
  const [from, setFrom] = useState(addDays(-6));
  const [to, setTo] = useState(todayStr());
  const [module, setModule] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, loading } = useApi('/activity', { from, to, module: module || undefined, q: dq || undefined, page });

  const pretty = (d) => {
    if (!d) return '';
    try { const o = JSON.parse(d); return typeof o === 'object' ? Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : String(o); } catch { return d; }
  };

  return (
    <div>
      <PageHeader icon={History} title="Activity Log" subtitle="Who did what, and when" />
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[200px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="Search details…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select className="input w-44" value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }}><option value="">All modules</option>{data?.modules.map((m) => <option key={m} value={m}>{m}</option>)}</Select>
        <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); setPage(1); }} />
      </div>
      {loading && !data ? <PageLoader /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Time</th><th>User</th><th>Module</th><th>Action</th><th>Ref</th><th>Details</th></tr></thead>
            <tbody>{data?.data.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-slate-500">{fmtDateTime(l.created_at)}</td>
                <td>{l.user_name || 'System'}<div className="text-xs capitalize text-slate-500">{l.role}</div></td>
                <td className="capitalize">{l.module.replace(/_/g, ' ')}</td>
                <td><Badge tone={TONE[l.action.split('_')[0]] || 'slate'}>{l.action.replace(/_/g, ' ')}</Badge></td>
                <td>{l.ref_id || ''}</td>
                <td className="max-w-md truncate text-xs text-slate-500" title={pretty(l.details)}>{pretty(l.details)}</td>
              </tr>
            ))}</tbody>
          </table>
          {!data?.data.length && <Empty title="No activity" />}
          <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
