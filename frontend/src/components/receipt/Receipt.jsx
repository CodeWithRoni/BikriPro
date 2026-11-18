import { useSelector } from 'react-redux';
import { fileUrl } from '../../api/client';
import { fmtDateTime, fmtDate, num } from '../../utils/format';

/** Thermal receipt (58/80 mm) for a completed sale. */
export function Receipt({ sale, shop }) {
  const stored = useSelector((st) => st.settings.data);
  const s = shop || stored; // `shop` is passed on the public receipt page (no login)
  if (!sale) return null;
  const width = `${Number(s.receipt_width_mm) || 80}mm`;
  const row = 'flex justify-between gap-2';
  return (
    <div style={{ width, padding: '3mm', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 11, lineHeight: 1.35, color: '#000' }}>
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        {s.shop_logo && <img src={fileUrl(s.shop_logo)} alt="" style={{ maxHeight: 40, margin: '0 auto 4px' }} />}
        <div style={{ fontSize: 14, fontWeight: 700 }}>{s.shop_name}</div>
        {s.shop_address && <div>{s.shop_address}</div>}
        {s.shop_phone && <div>Phone: {s.shop_phone}</div>}
        {s.shop_bin && <div>BIN: {s.shop_bin}</div>}
      </div>
      <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '3px 0', margin: '4px 0' }}>
        <div className={row}><span>Invoice</span><b>{sale.invoice_no}</b></div>
        <div className={row}><span>Date</span><span>{fmtDateTime(sale.sale_date)}</span></div>
        {sale.customer && !sale.customer.is_walk_in && <div className={row}><span>Customer</span><span>{sale.customer.name}</span></div>}
        {sale.customer?.phone && <div className={row}><span>Phone</span><span>{sale.customer.phone}</span></div>}
        <div className={row}><span>Cashier</span><span>{sale.cashier}</span></div>
      </div>
      {sale.items.map((i) => (
        <div key={i.id} style={{ marginBottom: 3 }}>
          <div>{i.product_name}{i.variant_label ? ` (${i.variant_label})` : ''}</div>
          <div className={row}><span>{num(i.qty)} x {num(i.unit_price)}{i.discount > 0 ? ` -${num(i.discount)}` : ''}</span><span>{num(i.line_total)}</span></div>
        </div>
      ))}
      {sale.exchange && (
        <div style={{ borderTop: '1px dashed #000', marginTop: 4, paddingTop: 3 }}>
          <div style={{ fontWeight: 700 }}>EXCHANGE · returned from {sale.exchange.invoice_no}</div>
          {sale.exchange.items.map((i, k) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={k} className={row}><span>{i.product_name}{i.variant_label ? ` (${i.variant_label})` : ''} x{num(i.qty)}</span><span>-{num(i.line_total)}</span></div>
          ))}
          <div className={row}><span>Return {sale.exchange.return_no}</span><span>-{num(sale.exchange.total_amount)}</span></div>
        </div>
      )}
      <div style={{ borderTop: '1px dashed #000', marginTop: 4, paddingTop: 3 }}>
        <div className={row}><span>Subtotal</span><span>{num(sale.subtotal)}</span></div>
        {sale.item_discount + sale.invoice_discount > 0 && <div className={row}><span>Discount</span><span>-{num(sale.item_discount + sale.invoice_discount)}</span></div>}
        {sale.vat_amount > 0 && <div className={row}><span>VAT</span><span>{num(sale.vat_amount)}</span></div>}
        {sale.round_off > 0 && <div className={row}><span>Round off</span><span>-{num(sale.round_off)}</span></div>}
        {sale.points_value > 0 && <div className={row}><span>Points ({num(sale.points_redeemed)})</span><span>-{num(sale.points_value)}</span></div>}
        <div className={row} style={{ fontSize: 13, fontWeight: 700 }}><span>TOTAL</span><span>{s.currency_symbol} {num(sale.grand_total)}</span></div>
        {sale.exchange_credit > 0 && <div className={row}><span>Exchange credit</span><span>-{num(sale.exchange_credit)}</span></div>}
        {sale.payments.map((p, i) => <div key={p.id || i} className={row}><span>Paid ({p.account_name})</span><span>{num(p.amount)}</span></div>)}
        {sale.exchange?.cash_refund > 0 && <div className={row} style={{ fontWeight: 700 }}><span>Cash back (exchange)</span><span>{num(sale.exchange.cash_refund)}</span></div>}
        {sale.change_amount > 0 && <div className={row}><span>Change</span><span>{num(sale.change_amount)}</span></div>}
        {sale.due_amount > 0 && (
          <>
            <div className={row} style={{ fontWeight: 700 }}><span>DUE</span><span>{num(sale.due_amount)}</span></div>
            {sale.next_payment_date && <div className={row}><span>Next payment</span><span>{fmtDate(sale.next_payment_date)}</span></div>}
          </>
        )}
        {sale.offer_discount > 0 && <div className={row} style={{ fontWeight: 700 }}><span>You saved (offers)</span><span>{num(sale.offer_discount)}</span></div>}
        {sale.points_earned > 0 && <div className={row}><span>Points earned</span><span>+{num(sale.points_earned)} (total {num(sale.customer?.loyalty_points)})</span></div>}
      </div>
      <div style={{ textAlign: 'center', marginTop: 8, borderTop: '1px dashed #000', paddingTop: 4 }}>
        <div>{s.invoice_footer}</div>
        <div style={{ fontSize: 9, marginTop: 2 }}>Powered by BikriPro</div>
      </div>
    </div>
  );
}

/**
 * Print any React node via the browser/Electron print dialog.
 * pageCss sets @page size (e.g. thermal 80mm or A4).
 */
export function printNode(renderTarget, pageCss = '@page { size: 80mm auto; margin: 0; }') {
  const style = document.createElement('style');
  style.id = 'bp-print-page';
  style.textContent = pageCss;
  document.getElementById('bp-print-page')?.remove();
  document.head.appendChild(style);
  // renderTarget is already mounted inside a .print-area element; give React a tick to paint
  setTimeout(() => {
    window.print();
    setTimeout(() => style.remove(), 500);
  }, 150);
  return renderTarget;
}
