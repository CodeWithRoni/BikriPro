import { useState } from 'react';
import { Receipt as ReceiptIcon, Search, Printer, Eye, Download } from 'lucide-react';
import api from '../api/client';
import useApi from '../hooks/useApi';
import { PageHeader, Pagination, Modal, Empty, Badge, useDebounced, PageLoader } from '../components/ui';
import FilterBar, { useFilters, toParams, Sum, METHODS } from '../components/FilterBar';
import { Receipt, printNode } from '../components/receipt/Receipt';
import { tk, num, fmtDateTime, fmtDate, monthStart, todayStr, downloadCsv } from '../utils/format';

const INIT = { status: '', pay: '', method: '', account_id: '', customer_id: null, amount: { min: '', max: '' }, walk_in: false };

export default function Sales() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [f, set, reset] = useFilters(INIT, () => setPage(1));
  const dq = useDebounced(q);
  const df = useDebounced(f, 350);
  const { data, loading } = useApi('/sales', { from: from || undefined, to: to || undefined, q: dq || undefined, page, sort, ...toParams(df) });
  const [view, setView] = useState(null);
  const [printSale, setPrintSale] = useState(null);

  const open = async (id) => setView((await api.get(`/sales/${id}`)).data);
  const statusTone = { completed: 'green', returned: 'rose', partial_return: 'amber', cancelled: 'slate' };

  return (
    <div>
      <PageHeader icon={ReceiptIcon} title="Sales" subtitle="All invoices"
        actions={<button type="button" className="btn-secondary" onClick={() => downloadCsv(`sales-${from}-${to}.csv`, data?.data)}><Download className="h-4 w-4" /> Export</button>} />
      <FilterBar
        search={{ value: q, onChange: (v) => { setQ(v); setPage(1); }, placeholder: 'Invoice no, customer name or phone…' }}
        date={{ from, to, onChange: (a, b) => { setFrom(a); setTo(b); setPage(1); } }} defaultDate={[monthStart(), todayStr()]}
        sort={{ value: sort, onChange: (v) => { setSort(v); setPage(1); }, options: [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['amount_desc', 'Amount: high → low'], ['amount_asc', 'Amount: low → high'], ['due_desc', 'Biggest due first']] }}
        values={f} onChange={set} onClear={reset}
        fields={[
          { key: 'customer_id', label: 'Customer', type: 'party', party: 'customer' },
          { key: 'method', label: 'Payment method', type: 'select', options: METHODS, placeholder: 'Any method' },
          { key: 'account_id', label: 'Received in', type: 'account' },
          { key: 'amount', label: 'Invoice total (৳)', type: 'range' },
          { key: 'pay', label: 'Payment', type: 'segment', options: [['paid', 'Fully paid'], ['due', 'Has due'], ['overdue', 'Overdue']] },
          { key: 'status', label: 'Status', type: 'segment', options: [['completed', 'Completed'], ['partial_return', 'Partly returned'], ['returned', 'Returned']] },
          { key: 'walk_in', label: 'Walk-in only', type: 'toggle' },
        ]}
        summary={data?.summary && <>
          <Sum label="Invoices" value={num(data.summary.total)} />
          <Sum label="Total" value={tk(data.summary.amount)} />
          <Sum label="Paid" value={tk(data.summary.paid)} tone="green" />
          <Sum label="Due" value={tk(data.summary.due)} tone="rose" />
        </>} />
      {loading && !data ? <PageLoader /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th className="text-right">Items</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Due</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data?.data.map((s) => (
                <tr key={s.id} className="cursor-pointer" onClick={() => open(s.id)}>
                  <td className="font-semibold text-ocean-700 dark:text-ocean-300">{s.invoice_no}</td>
                  <td className="whitespace-nowrap text-slate-500">{fmtDateTime(s.sale_date)}</td>
                  <td>{s.customer_name || 'Walk-in'}<div className="text-xs text-slate-500">{s.customer_phone}</div></td>
                  <td className="text-right">{s.item_count}</td>
                  <td className="text-right font-semibold">{tk(s.grand_total)}</td>
                  <td className="text-right">{tk(s.paid_amount)}</td>
                  <td className="text-right">{s.due_amount > 0 ? <span className="font-semibold text-rose-600">{tk(s.due_amount)}<div className="text-[11px] font-normal text-slate-500">{fmtDate(s.next_payment_date)}</div></span> : '—'}</td>
                  <td><Badge tone={statusTone[s.status]}>{s.status.replace('_', ' ')}</Badge></td>
                  <td><Eye className="h-4 w-4 text-slate-400" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.data.length && <Empty title="No invoices match these filters" hint="Change the date or remove a filter." />}
          <Pagination page={page} limit={data?.limit} total={data?.total} onPage={setPage} />
        </div>
      )}

      <Modal open={!!view} onClose={() => setView(null)} title={`Invoice ${view?.invoice_no || ''}`} size="sm"
        footer={<button type="button" className="btn-primary" onClick={() => { setPrintSale(view); printNode(); }}><Printer className="h-4 w-4" /> Print</button>}>
        <div className="flex justify-center rounded-xl bg-slate-100 p-3 dark:bg-slate-800"><div className="bg-white shadow"><Receipt sale={view} /></div></div>
        {view?.returns?.length > 0 && <p className="mt-3 text-sm text-amber-600">Returns: {view.returns.map((r) => `${r.return_no} (${tk(r.total_amount)})`).join(', ')}</p>}
      </Modal>
      <div className="print-area hidden print:block"><Receipt sale={printSale} /></div>
    </div>
  );
}
