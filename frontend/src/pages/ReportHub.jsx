import { useState } from 'react';
import { FileBarChart, Download, Printer, ShoppingBag, Package, Boxes, Users, Truck, Gift, Receipt, UserCog, CreditCard, MessageSquare } from 'lucide-react';
import useApi from '../hooks/useApi';
import { PageHeader, DateRange, Empty, PageLoader } from '../components/ui';
import { printNode } from '../components/receipt/Receipt';
import { monthStart, todayStr, downloadCsv, cls, num, fmtDate, fmtDateTime } from '../utils/format';

const REPORTS = [
  ['sales_summary', 'Daily sales summary', ShoppingBag, true],
  ['product_sales', 'Product-wise sales', Package, true],
  ['purchases', 'Purchases', Truck, true],
  ['stock', 'Stock & valuation', Boxes, false],
  ['receivables', 'Customer dues (receivable)', Users, false],
  ['payables', 'Supplier dues (payable)', Truck, false],
  ['loyalty', 'Loyalty points', Gift, false],
  ['expenses', 'Expenses', Receipt, true],
  ['cashier_sales', 'Sales by cashier', UserCog, true],
  ['payment_methods', 'Payment methods (Cash/MFS/Card)', CreditCard, true],
  ['sms_logs', 'SMS log', MessageSquare, true],
];

const MONEY = /amount|total|paid|due|price|value|balance|profit|discount|vat|subtotal|credit|collected|round_off|purchase$/;

export default function ReportHub() {
  const [name, setName] = useState('sales_summary');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const meta = REPORTS.find((r) => r[0] === name);
  const { data, loading } = useApi(`/reports/${name}`, meta[3] ? { from, to } : {});
  const rows = data?.rows || [];
  const cols = rows.length ? Object.keys(rows[0]) : [];

  const fmt = (c, v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (/_at$/.test(c)) return fmtDateTime(v);
    if (/date|day$|^day$|since/.test(c)) return fmtDate(v);
    if (typeof v === 'number') return num(v);
    return String(v);
  };
  const totals = cols.map((c) => (MONEY.test(c) || /qty|points|invoices|payments|earned|redeemed/.test(c) ? rows.reduce((s, r) => s + (Number(r[c]) || 0), 0) : null));

  return (
    <div>
      <PageHeader icon={FileBarChart} title="Report Hub" subtitle="Every report in one place — export to Excel (CSV) or print" />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="card h-fit p-2">
          {REPORTS.map(([k, l, Icon]) => (
            <button type="button" key={k} onClick={() => setName(k)} className={cls('flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition', name === k ? 'bg-ocean-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}>
              <Icon className="h-4 w-4 shrink-0" />{l}
            </button>
          ))}
        </div>
        <div className="min-w-0">
          <div className="card mb-3 flex flex-wrap items-center gap-3 p-3">
            <p className="font-bold">{meta[1]}</p>
            {meta[3] && <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />}
            <div className="ml-auto flex gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => downloadCsv(`${name}-${from}-${to}.csv`, rows)}><Download className="h-4 w-4" /> CSV</button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => printNode(null, '@page { size: A4 landscape; margin: 10mm; }')}><Printer className="h-4 w-4" /> Print</button>
            </div>
          </div>
          {loading ? <PageLoader /> : !rows.length ? <div className="card"><Empty title="No data for this report" /></div> : (
            <div className="table-wrap print-area">
              <h2 className="hidden p-2 text-lg font-bold print:block">{meta[1]} {meta[3] && `(${fmtDate(from)} – ${fmtDate(to)})`}</h2>
              <table className="table">
                <thead><tr>{cols.map((c) => <th key={c} className={typeof rows[0][c] === 'number' ? 'text-right' : ''}>{c.replace(/_/g, ' ')}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <tr key={i}>{cols.map((c) => <td key={c} className={cls(typeof r[c] === 'number' && 'text-right', c === 'message' && 'max-w-xs truncate')}>{fmt(c, r[c])}</td>)}</tr>
                  ))}
                  {totals.some((t) => t !== null) && (
                    <tr className="bg-slate-50 font-bold dark:bg-slate-800/50">{totals.map((t, i) => <td key={cols[i]} className="text-right">{i === 0 ? 'Total' : t === null ? '' : num(t)}</td>)}</tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
