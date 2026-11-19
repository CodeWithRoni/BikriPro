/**
 * Per-request context (AsyncLocalStorage): which branch the request works in.
 *   branchId — the working branch: new sales, purchases, stock moves … go here
 *   scope    — the branch that lists and reports show; null = all branches (admin view)
 * The db layer reads it to fill the @BRANCH / @SCOPE SQL tokens and the
 * bikripro.branch_id transaction setting (used by the branch_id insert trigger).
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();
export const runWithContext = (ctx, fn) => als.run(ctx, fn);
export const currentBranch = () => als.getStore()?.branchId ?? null;
export const currentScope = () => {
  const s = als.getStore();
  return s ? s.scope ?? null : null;
};
