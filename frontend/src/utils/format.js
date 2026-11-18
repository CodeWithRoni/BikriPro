const nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** ৳ 1,23,456.50 (Indian/Bangladeshi digit grouping) */
export const tk = (n, symbol = '৳') => `${symbol} ${nf.format(Number(n) || 0)}`;
export const num = (n) => nf.format(Number(n) || 0);

export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
export const addDays = (days, from = todayStr()) => {
  const d = new Date(`${from}T00:00:00`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat('en-CA').format(d);
};
export const monthStart = () => `${todayStr().slice(0, 8)}01`;

export const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(String(s).length <= 10 ? `${s}T00:00:00` : String(s).replace(' ', 'T'));
  return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const fmtDateTime = (s) => {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T'));
  return isNaN(d) ? s : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const variantLabel = (v) => [v.size, v.color].filter(Boolean).join(' / ');

export const cls = (...a) => a.filter(Boolean).join(' ');

/** Download an array of objects as CSV (opens in Excel). */
export function downloadCsv(filename, rows) {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
