/**
 * BikriPro REST API — all routes under /api
 * Roles: cashier < manager < admin (authorize(min) allows that role and above)
 */
import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize } from '../middleware/auth.js';
import { imageUpload, backupUpload } from '../middleware/upload.js';

import * as auth from '../controllers/auth.controller.js';
import * as products from '../controllers/products.controller.js';
import { customers, suppliers } from '../controllers/parties.controller.js';
import * as sales from '../controllers/sales.controller.js';
import * as purchases from '../controllers/purchases.controller.js';
import * as finance from '../controllers/finance.controller.js';
import * as reports from '../controllers/reports.controller.js';
import * as settings from '../controllers/settings.controller.js';

const r = express.Router();
const M = authorize('manager');
const A = authorize('admin');

// ---------- Public ----------
r.get('/health', (req, res) => res.json({ ok: true, app: 'BikriPro', time: new Date().toISOString() }));
r.post('/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), auth.login);
r.get('/settings/public', settings.publicSettings);
r.post('/cron/birthdays', settings.cronBirthdays); // protected by CRON_SECRET header

// Everything below requires a valid JWT
r.use(authenticate);

// ---------- Auth & users ----------
r.get('/auth/me', auth.me);
r.post('/auth/change-password', auth.changePassword);
r.get('/users', A, auth.listUsers);
r.post('/users', A, auth.createUser);
r.put('/users/:id', A, auth.updateUser);

// ---------- Catalogue ----------
for (const [path, c] of [['categories', products.categories], ['brands', products.brands]]) {
  r.get(`/${path}`, c.list);
  r.post(`/${path}`, M, c.create);
  r.put(`/${path}/:id`, M, c.update);
  r.delete(`/${path}/:id`, M, c.remove);
}
r.get('/product-attributes', products.attributes.all);
r.post('/product-attributes/:kind', M, products.attributes.create);
r.put('/product-attributes/:kind/:id', M, products.attributes.update);
r.delete('/product-attributes/:kind/:id', M, products.attributes.remove);
r.get('/products', products.list);
r.get('/products/facets', products.facets);
r.get('/products/pos-grid', products.posGrid);
r.get('/products/lookup/:code', products.lookup);
r.post('/products/image-preview', M, imageUpload.single('image'), products.imagePreview);
r.get('/products/:id', products.get);
r.post('/products', M, imageUpload.single('image'), products.create);
r.put('/products/:id', M, imageUpload.single('image'), products.update);
r.patch('/products/:id/favorite', products.toggleFavorite);
r.delete('/products/:id', M, products.remove);

// ---------- Customers & Suppliers ----------
for (const [path, c, writeRole] of [['customers', customers, null], ['suppliers', suppliers, M]]) {
  const w = writeRole ? [writeRole] : []; // cashiers may add customers from the POS
  r.get(`/${path}`, c.list);
  r.get(`/${path}/:id`, c.get);
  r.post(`/${path}`, ...w, c.create);
  r.put(`/${path}/:id`, ...w, c.update);
  r.delete(`/${path}/:id`, M, c.remove);
  r.get(`/${path}/:id/ledger`, c.ledger);
  r.post(`/${path}/:id/adjustments`, M, c.addAdjustment);
  r.delete(`/${path}/:id/adjustments/:adjId`, M, c.removeAdjustment);
}

// ---------- POS / Sales ----------
r.post('/sales', sales.create);
r.get('/sales', sales.list);
r.post('/sales/hold', sales.hold);
r.get('/sales/held', sales.listHeld);
r.get('/sales/held/:id', sales.getHeld);
r.delete('/sales/held/:id', sales.deleteHeld);
r.get('/sales/returns', sales.listReturns);
r.get('/sales/returns/:id', sales.getReturn);
r.post('/sales/returns', M, sales.createReturn);
r.get('/sales/:id', sales.get);

// ---------- Purchases ----------
r.get('/purchases', M, purchases.list);
r.get('/purchases/recent', purchases.recent);
r.get('/purchases/returns', M, purchases.listReturns);
r.post('/purchases/returns', M, purchases.createReturn);
r.get('/purchases/:id', M, purchases.get);
r.post('/purchases', M, purchases.create);

// ---------- Payment (to suppliers) & Collection (from customers) ----------
r.get('/payments', M, finance.listPayments);
r.get('/payments/payables', M, finance.payables);
r.post('/payments', M, finance.createPayment);
r.get('/collections', finance.listCollections);
r.get('/collections/receivables', finance.receivables);
r.post('/collections', finance.createCollection);

// ---------- Cash, Bank & MFS ----------
r.get('/accounts', finance.listAccounts);
r.post('/accounts', A, finance.createAccount);
r.put('/accounts/:id', A, finance.updateAccount);
r.get('/accounts/:id/transactions', M, finance.accountStatement);
r.post('/accounts/transfer', M, finance.transfer);
r.post('/accounts/:id/entry', M, finance.manualEntry);

// ---------- Expenses ----------
r.get('/expense-categories', finance.listExpenseCategories);
r.post('/expense-categories', M, finance.createExpenseCategory);
r.get('/expenses', M, finance.listExpenses);
r.post('/expenses', M, finance.createExpense);

// ---------- Dashboard, Profit, Reports ----------
r.get('/dashboard', reports.dashboard);
r.get('/reports/profit', M, reports.profit);
r.get('/reports', M, reports.reportList);
r.get('/reports/:name', M, reports.report);

// ---------- Price Manager & Barcode Labels ----------
r.get('/price-manager', M, reports.priceList);
r.put('/price-manager/bulk', M, reports.priceBulk);
r.get('/price-manager/history/:variantId', M, reports.priceHistory);
r.get('/barcode/purchase/:id', reports.barcodeFromPurchase);

// ---------- Activity Log ----------
r.get('/activity', M, reports.activity);

// ---------- Shop Setup / Admin ----------
r.get('/settings', settings.getSettings);
r.put('/settings', A, settings.updateSettings);
r.post('/settings/logo', A, imageUpload.single('logo'), settings.uploadLogo);
r.post('/settings/pin', A, settings.setPin);
r.get('/settings/backup/export', A, settings.exportDb);
r.post('/settings/backup/import', A, backupUpload.single('file'), settings.importDb);
r.get('/settings/reset/modules', A, settings.resetModules);
r.post('/settings/reset', A, settings.resetDb);
r.post('/settings/sms/test', A, settings.testSms);
r.post('/settings/sms/birthdays', A, settings.runBirthdays);

export default r;
