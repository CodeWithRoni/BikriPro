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
import * as ops from '../controllers/operations.controller.js';
import * as offers from '../controllers/offers.controller.js';
import * as orders from '../controllers/orders.controller.js';
import * as staff from '../controllers/staff.controller.js';
import * as insights from '../controllers/insights.controller.js';
import * as branches from '../controllers/branches.controller.js';
import * as online from '../controllers/online.controller.js';
import * as accounting from '../controllers/accounting.controller.js';

const r = express.Router();
const M = authorize('manager');
const A = authorize('admin');

// ---------- Public ----------
r.get('/health', (req, res) => res.json({ ok: true, app: 'BikriPro', time: new Date().toISOString() }));
r.post('/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }), auth.login);
r.get('/settings/public', settings.publicSettings);
r.post('/cron/birthdays', settings.cronBirthdays); // daily jobs, protected by CRON_SECRET header
r.post('/cron/daily', settings.cronBirthdays);
r.get('/public/receipt/:token', rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }), sales.publicReceipt);

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
r.post('/sales/exchange', M, sales.exchange);
r.post('/sales/:id/share', sales.share);
r.post('/sales/:id/sms-receipt', sales.smsReceipt);
r.get('/sales/:id', sales.get);

// ---------- Day closing (cash drawer shifts) ----------
r.get('/cash-sessions/current', ops.currentSession);
r.post('/cash-sessions/open', ops.openSession);
r.post('/cash-sessions/:id/close', ops.closeSession);
r.get('/cash-sessions', ops.listSessions);
r.get('/cash-sessions/:id', ops.getSession);

// ---------- Offers ----------
r.get('/offers/active', offers.active);
r.get('/offers', M, offers.list);
r.post('/offers', M, offers.create);
r.put('/offers/:id', M, offers.update);
r.patch('/offers/:id/toggle', M, offers.toggle);
r.delete('/offers/:id', M, offers.remove);

// ---------- Stock control: damage / lost and stock count ----------
r.get('/stock-adjustments', M, ops.listAdjustments);
r.post('/stock-adjustments', M, ops.createAdjustment);
r.get('/stock-counts', M, ops.listCounts);
r.post('/stock-counts', M, ops.createCount);
r.get('/stock-counts/:id', M, ops.getCount);
r.post('/stock-counts/:id/scan', M, ops.scanCount);
r.put('/stock-counts/:id/items', M, ops.setCountItem);
r.post('/stock-counts/:id/apply', M, ops.applyCount);
r.post('/stock-counts/:id/cancel', M, ops.cancelCount);

// ---------- Purchases ----------
r.get('/purchases', M, purchases.list);
r.get('/purchases/recent', purchases.recent);
r.get('/purchases/returns', M, purchases.listReturns);
r.post('/purchases/returns', M, purchases.createReturn);
r.get('/purchases/:id', M, purchases.get);
r.post('/purchases', M, purchases.create);

// ---------- Purchase orders ----------
r.get('/purchase-orders/suggestions', M, orders.suggestions);
r.get('/purchase-orders', M, orders.list);
r.post('/purchase-orders', M, orders.create);
r.get('/purchase-orders/:id', M, orders.get);
r.put('/purchase-orders/:id', M, orders.update);
r.post('/purchase-orders/:id/status', M, orders.setStatus);
r.post('/purchase-orders/:id/receive', M, orders.receive);
r.delete('/purchase-orders/:id', M, orders.remove);

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
r.put('/expense-categories/:id', M, finance.updateExpenseCategory);
r.delete('/expense-categories/:id', M, finance.deleteExpenseCategory);
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

// ---------- Smart reports ----------
r.get('/insights/size-colour', M, insights.sizeColour);
r.get('/insights/dead-stock', M, insights.deadStock);
r.get('/insights/heatmap', M, insights.heatmap);
r.get('/insights/compare', M, insights.compare);

// ---------- Staff ----------
r.get('/staff/options', staff.options);
r.get('/staff', M, staff.list);
r.post('/staff', M, staff.create);
r.get('/staff/attendance', M, staff.attendance);
r.put('/staff/attendance', M, staff.saveAttendance);
r.put('/staff/:id', M, staff.update);
r.get('/staff/advances', M, staff.listAdvances);
r.post('/staff/advances', M, staff.giveAdvance);
r.get('/staff/salary', M, staff.salarySheet);
r.post('/staff/salary', M, staff.paySalary);
r.get('/staff/performance', M, staff.performance);

// ---------- Online orders ----------
r.get('/online-orders', online.list);
r.get('/online-orders/customer', online.customerHistory);
r.post('/online-orders/settle', M, online.settle);
r.post('/online-orders', online.create);
r.get('/online-orders/:id', online.get);
r.put('/online-orders/:id', online.update);
r.post('/online-orders/:id/status', online.setStatus);

// ---------- Accounting, notifications & owner ----------
r.get('/accounting/daybook', M, accounting.daybook);
r.get('/accounting/pnl', M, accounting.pnl);
r.get('/accounting/balance-sheet', A, accounting.balanceSheet);
r.get('/notifications', accounting.notifications);
r.get('/owner/summary', A, accounting.ownerSummary);
r.post('/owner/summary-sms', A, async (req, res, next) => {
  try { const { runOwnerSummary } = await import('../services/cron.service.js'); res.json(await runOwnerSummary({ force: true })); } catch (e) { next(e); }
});

// ---------- Branches & stock transfers ----------
r.get('/branches', branches.list);
r.get('/branches/overview', A, branches.overview);
r.get('/branches/stock', branches.stockByBranch);
r.post('/branches', A, branches.create);
r.put('/branches/:id', A, branches.update);
r.get('/transfers', M, branches.listTransfers);
r.post('/transfers', M, branches.send);
r.get('/transfers/:id', M, branches.getTransfer);
r.post('/transfers/:id/receive', M, branches.receive);
r.post('/transfers/:id/cancel', M, branches.cancel);

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
r.post('/settings/sms/due-reminders', M, settings.runDueRemindersNow);

export default r;
