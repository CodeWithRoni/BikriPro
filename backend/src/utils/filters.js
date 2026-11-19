import { currentScope } from './context.js';
/** Small helpers shared by list endpoints with filter bars. */

/** Adds `col >= min_<key>` / `col <= max_<key>` when those query params are present. */
export function addRange(where, params, query, key, col) {
  const min = query[`min_${key}`];
  const max = query[`max_${key}`];
  if (min !== undefined && min !== '' && !Number.isNaN(Number(min))) { where.push(`${col} >= ?`); params.push(Number(min)); }
  if (max !== undefined && max !== '' && !Number.isNaN(Number(max))) { where.push(`${col} <= ?`); params.push(Number(max)); }
}

/** Whitelisted ORDER BY: returns map[sort] or the fallback. */
export const orderBy = (sort, map, fallback) => map[sort] || fallback;

/** Limit a list to the branch being viewed (no filter in the admin's "All branches" view). */
export function scopeFilter(where, params, col) {
  const scope = currentScope();
  if (scope) { where.push(`${col} = ?`); params.push(scope); }
}
