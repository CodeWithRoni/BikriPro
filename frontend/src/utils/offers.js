/**
 * Work out which running offers apply to a POS cart.
 *
 * Item offers (percent / amount / bogo) are compared per line and the best one wins.
 * Buy-X-get-Y counts every unit in the offer's scope together and makes the cheapest
 * units free. Bill offers (bill_percent / bill_amount) apply to the bill after item
 * discounts, when it reaches the minimum; the best bill offer wins.
 *
 * items: [{ variant_id, product_id, category_id, brand_id, qty, unit_price, discount (manual) }]
 * Returns { lines: { [variant_id]: { offer_id, name, amount } }, bill: { offer_id, name, amount } | null, total }
 */
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const n = (v) => Number(v) || 0;

function inScope(o, it) {
  const ids = (o.scope_ids || []).map(Number);
  switch (o.scope) {
    case 'category': return ids.includes(Number(it.category_id));
    case 'brand': return ids.includes(Number(it.brand_id));
    case 'product': return ids.includes(Number(it.product_id));
    default: return true;
  }
}

export function computeOffers(items, offers, { manualInvoiceDiscount = 0 } = {}) {
  const out = { lines: {}, bill: null, total: 0 };
  if (!offers?.length || !items?.length) return out;
  // room left on each line after the cashier's own discount
  const room = Object.fromEntries(items.map((it) => [it.variant_id, Math.max(n(it.qty) * n(it.unit_price) - n(it.discount), 0)]));
  const candidates = {}; // variant_id -> [{offer_id, name, amount}]
  const push = (vid, o, amount) => {
    const a = r2(Math.min(amount, room[vid]));
    if (a > 0) (candidates[vid] ||= []).push({ offer_id: o.id, name: o.name, amount: a });
  };

  for (const o of offers) {
    if (o.type === 'percent' || o.type === 'amount') {
      for (const it of items) {
        if (!inScope(o, it) || !(n(it.unit_price) > 0)) continue;
        const gross = n(it.qty) * n(it.unit_price);
        push(it.variant_id, o, o.type === 'percent' ? (gross * n(o.value)) / 100 : n(o.value) * n(it.qty));
      }
    } else if (o.type === 'bogo') {
      const buy = Math.max(parseInt(o.buy_qty, 10) || 0, 0);
      const get = Math.max(parseInt(o.get_qty, 10) || 0, 0);
      if (!buy || !get) continue;
      // every eligible unit, cheapest first
      const units = [];
      for (const it of items) {
        if (!inScope(o, it) || !(n(it.unit_price) > 0)) continue;
        const whole = Math.floor(n(it.qty));
        for (let k = 0; k < whole; k += 1) units.push({ vid: it.variant_id, price: n(it.unit_price) });
      }
      const free = Math.floor(units.length / (buy + get)) * get;
      if (!free) continue;
      units.sort((a, b) => a.price - b.price);
      const per = {};
      for (const u of units.slice(0, free)) per[u.vid] = (per[u.vid] || 0) + u.price;
      for (const [vid, amt] of Object.entries(per)) push(Number(vid), o, amt);
    }
  }

  for (const it of items) {
    const best = (candidates[it.variant_id] || []).sort((a, b) => b.amount - a.amount)[0];
    if (best) { out.lines[it.variant_id] = best; out.total += best.amount; }
  }

  // Bill offers on what is left after all item discounts
  const afterItems = items.reduce((t, it) => t + n(it.qty) * n(it.unit_price) - n(it.discount) - (out.lines[it.variant_id]?.amount || 0), 0) - n(manualInvoiceDiscount);
  let bestBill = null;
  for (const o of offers) {
    if (!o.type.startsWith('bill_') || afterItems <= 0 || afterItems < n(o.min_amount)) continue;
    let amt = o.type === 'bill_percent' ? (afterItems * n(o.value)) / 100 : n(o.value);
    if (o.max_discount !== null && o.max_discount !== undefined && o.max_discount !== '') amt = Math.min(amt, n(o.max_discount));
    amt = r2(Math.min(amt, afterItems));
    if (amt > 0 && (!bestBill || amt > bestBill.amount)) bestBill = { offer_id: o.id, name: o.name, amount: amt };
  }
  out.bill = bestBill;
  out.total = r2(out.total + (bestBill?.amount || 0));
  return out;
}
