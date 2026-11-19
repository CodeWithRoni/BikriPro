import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { appSecret } from '../services/settings.service.js';

/** JWT signing key: JWT_SECRET env var, else a random secret kept in the database. */
const jwtSecret = async () => env.jwtSecret || appSecret('jwt_secret');
import { one } from '../config/db.js';
import { HttpError } from '../utils/http.js';
import { runWithContext } from '../utils/context.js';

let mainCache = { id: null, at: 0 };
async function mainBranch() {
  if (mainCache.id && Date.now() - mainCache.at < 60000) return mainCache.id;
  const r = await one('SELECT bp_main_branch() AS id');
  mainCache = { id: r?.id || null, at: Date.now() };
  return mainCache.id;
}

/** Verify Bearer JWT and attach req.user = { id, name, username, role }. */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Authentication required');
    let payload;
    try {
      payload = jwt.verify(token, await jwtSecret());
    } catch {
      throw new HttpError(401, 'Session expired, please log in again');
    }
    const user = await one('SELECT id, name, username, role, is_active, branch_id FROM users WHERE id = ?', [payload.sub]);
    if (!user || !user.is_active) throw new HttpError(401, 'Account disabled');
    req.user = user;
    // Branch: staff work in their own branch; an admin may switch (X-Branch-Id: <id> | all)
    const own = user.branch_id || (await mainBranch());
    let branchId = own;
    let scope = own;
    const wanted = String(req.headers['x-branch-id'] || '');
    if (user.role === 'admin' && wanted) {
      if (wanted === 'all') scope = null;
      else if (await one('SELECT id FROM branches WHERE id = ? AND is_active', [wanted])) { branchId = Number(wanted); scope = branchId; }
    }
    req.branchId = branchId;
    req.branchScope = scope;
    runWithContext({ branchId, scope }, () => next());
  } catch (err) {
    next(err);
  }
}

/**
 * Role guard. Roles are hierarchical: admin > manager > cashier.
 * authorize('manager') lets managers and admins through.
 */
const RANK = { cashier: 1, manager: 2, admin: 3 };
const authorize = (minRole) => (req, res, next) => {
  if (!req.user || RANK[req.user.role] < RANK[minRole]) {
    return next(new HttpError(403, `This action needs ${minRole} access`));
  }
  next();
};

async function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, await jwtSecret(), { expiresIn: env.jwtExpiresIn });
}

export { authenticate, authorize, signToken, RANK };
