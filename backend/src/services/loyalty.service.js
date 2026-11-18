import * as settings from './settings.service.js';
import { money } from '../utils/http.js';

async function getConfig() {
  const s = await settings.getAll();
  return {
    enabled: s.loyalty_enabled === '1',
    spendPerPoint: Number(s.loyalty_spend_per_point) || 100,
    pointValue: Number(s.loyalty_point_value) || 1,
    minRedeem: Number(s.loyalty_min_redeem_points) || 0,
  };
}

/** Whole points earned for an amount actually spent. */
function pointsFor(amount, cfg) {
  if (!cfg.enabled || amount <= 0) return 0;
  return Math.floor(amount / cfg.spendPerPoint);
}

/** Apply a signed points change and record it. */
async function applyPoints(conn, { customerId, saleId = null, type, points, note = null }) {
  if (!points) return;
  await conn.query('UPDATE customers SET loyalty_points = GREATEST(loyalty_points + ?, 0) WHERE id = ?', [points, customerId]);
  await conn.query(
    'INSERT INTO loyalty_transactions (customer_id, sale_id, type, points, note) VALUES (?,?,?,?,?)',
    [customerId, saleId, type, points, note]
  );
}

const valueOf = (points, cfg) => money(points * cfg.pointValue);

export { getConfig, pointsFor, applyPoints, valueOf };
