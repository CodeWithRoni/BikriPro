import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, ReceiptText } from 'lucide-react';
import api from '../api/client';
import { Receipt, printNode } from '../components/receipt/Receipt';
import { Spinner } from '../components/ui';

/** Receipt opened from an SMS / WhatsApp link — no login needed. */
export default function PublicReceipt() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/public/receipt/${token}`).then((r) => setData(r.data)).catch((e) => setError(e.message || 'Receipt not found'));
  }, [token]);

  useEffect(() => { if (data) document.title = `${data.shop.shop_name} · ${data.sale.invoice_no}`; }, [data]);

  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-100 px-3 py-6 dark:bg-slate-950">
      {!data && !error && <div className="mt-24"><Spinner /></div>}
      {error && (
        <div className="card mt-24 max-w-sm p-8 text-center">
          <ReceiptText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-bold">Receipt not found</p>
          <p className="mt-1 text-sm text-slate-500">The link may be wrong or the receipt was removed. Please contact the shop.</p>
        </div>
      )}
      {data && (
        <>
          <div className="rounded-xl bg-white shadow-lg ring-1 ring-black/5"><Receipt sale={data.sale} shop={data.shop} /></div>
          <button type="button" className="btn-primary mt-4 print:hidden" onClick={() => printNode(null, `@page { size: ${Number(data.shop.receipt_width_mm) || 80}mm auto; margin: 0; }`)}>
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
          <div className="print-area hidden print:block"><Receipt sale={data.sale} shop={data.shop} /></div>
        </>
      )}
    </div>
  );
}
