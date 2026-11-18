import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { appSecret } from '../services/settings.service.js';

/** JWT signing key: JWT_SECRET env var, else a random secret kept in the database. */
const jwtSecret = async () => env.jwtSecret || appSecret('jwt_secret');
import { one } from '../config/db.js';
import { HttpError } from '../utils/http.js';

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
    const user = await one('SELECT id, name, username, role, is_active FROM users WHERE id = ?', [payload.sub]);
    if (!user || !user.is_active) throw new HttpError(401, 'Account disabled');
    req.user = user;
    next();
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
