const bcrypt = require('bcryptjs');
const { query, one } = require('../config/db');
const { signToken } = require('../middleware/auth');
const { asyncHandler, requireFields, badRequest, notFound, HttpError } = require('../utils/http');
const { logActivity } = require('../utils/activity');

exports.login = asyncHandler(async (req, res) => {
  requireFields(req.body, ['username', 'password']);
  const user = await one('SELECT * FROM users WHERE username = ?', [String(req.body.username).trim()]);
  if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
    throw new HttpError(401, 'Wrong username or password');
  }
  if (!user.is_active) throw new HttpError(403, 'This account is disabled');
  await query('UPDATE users SET last_login_at = bp_now() WHERE id = ?', [user.id]);
  req.user = user;
  await logActivity(req, 'auth', 'login', user.id);
  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, username: user.username, role: user.role },
  });
});

exports.me = asyncHandler(async (req, res) => res.json({ user: req.user }));

exports.changePassword = asyncHandler(async (req, res) => {
  requireFields(req.body, ['current_password', 'new_password']);
  if (String(req.body.new_password).length < 6) throw badRequest('New password must be at least 6 characters');
  const user = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(req.body.current_password, user.password_hash))) throw badRequest('Current password is wrong');
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(req.body.new_password, 10), req.user.id]);
  await logActivity(req, 'auth', 'change_password', req.user.id);
  res.json({ message: 'Password changed' });
});

// ---------- User management (admin) ----------
exports.listUsers = asyncHandler(async (req, res) => {
  res.json(await query('SELECT id, name, username, phone, role, is_active, last_login_at, created_at FROM users ORDER BY id'));
});

exports.createUser = asyncHandler(async (req, res) => {
  requireFields(req.body, ['name', 'username', 'password', 'role']);
  const { name, username, phone = null, password, role } = req.body;
  if (!['admin', 'manager', 'cashier'].includes(role)) throw badRequest('Invalid role');
  if (String(password).length < 6) throw badRequest('Password must be at least 6 characters');
  const r = await query('INSERT INTO users (name, username, phone, password_hash, role) VALUES (?,?,?,?,?)',
    [name, username.trim(), phone, await bcrypt.hash(password, 10), role]);
  await logActivity(req, 'users', 'create', r.insertId, { username, role });
  res.status(201).json({ id: r.insertId });
});

exports.updateUser = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const u = await one('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) throw notFound('User not found');
  const { name = u.name, phone = u.phone, role = u.role, is_active = u.is_active, password } = req.body;
  if (id === req.user.id && (role !== 'admin' || !Number(is_active))) throw badRequest('You cannot demote or disable yourself');
  await query('UPDATE users SET name=?, phone=?, role=?, is_active=? WHERE id=?', [name, phone, role, is_active ? 1 : 0, id]);
  if (password) await query('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(password, 10), id]);
  await logActivity(req, 'users', 'update', id, { role, is_active });
  res.json({ message: 'User updated' });
});
