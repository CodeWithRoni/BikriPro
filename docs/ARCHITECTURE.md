# BikriPro — Architecture

## 1. System overview

```
 ┌───────────────────────┐   ┌──────────────────────┐   ┌───────────────────────┐
 │ Desktop till (Electron)│   │ Tablet / phone        │   │ Any browser on the LAN │
 │  Windows / macOS /     │   │ (Capacitor APK / IPA) │   │  http://SERVER-IP:5000 │
 │  Linux                 │   │                       │   │                        │
 └──────────┬────────────┘   └──────────┬───────────┘   └───────────┬────────────┘
            │      same React app (HashRouter, Redux Toolkit, Tailwind)        │
            └───────────────────────────┬─────────────────────────────────────┘
                                        │ HTTPS/HTTP + JWT (REST /api)
                         ┌──────────────▼──────────────┐
                         │  Node.js + Express API       │  ← can run embedded in the
                         │  • auth & roles              │    Electron app on the main PC
                         │  • Sharp image engine        │
                         │  • node-cron (birthday SMS)  │
                         │  • SMS gateway adapter       │
                         └──────────────┬──────────────┘
                                        │ mysql2 pool (time_zone +06:00)
                               ┌────────▼────────┐
                               │ MySQL / MariaDB │
                               └─────────────────┘
```

One codebase serves every platform: the React build is loaded from disk by Electron and Capacitor, and from the API server for browsers. The client asks for the **server address** on first launch (Login → Server), so many tills and phones share one shop database.

## 2. Backend layout (`backend/src`)

| Path | Responsibility |
|---|---|
| `config/env.js`, `config/db.js` | Environment, MySQL pool, `transaction()` helper (sets `time_zone = '+06:00'`) |
| `middleware/auth.js` | JWT verification, hierarchical `authorize('cashier'|'manager'|'admin')` |
| `middleware/upload.js` | Multer memory storage (images go straight to Sharp) |
| `controllers/*.js` | One controller per module (see routes) |
| `services/image.service.js` | 500×500 normalisation: EXIF rotate → trim borders → `contain` fit on white → adaptive WebP compression |
| `services/stock.service.js` | Row-locked stock changes (`SELECT … FOR UPDATE`), negative-stock guard |
| `services/accounts.service.js` | Cash-book entries for every money movement |
| `services/loyalty.service.js` | Earn / redeem / reverse points |
| `services/sms.service.js` | Templates, BD phone normalisation, provider adapter, `sms_logs` |
| `services/backup.service.js` | JSON export, transactional import, module reset plans |
| `services/cron.service.js` | Daily birthday wishes |
| `utils/numbering.js` | Atomic document numbers (`INV-000001`, `PUR-…`, `COL-…`) |
| `utils/activity.js` | Activity log writer |
| `db/schema.sql`, `migrate.js`, `seed.js` | Schema, idempotent migration, first-run data |

## 3. Database schema (MySQL)

All money columns are `DECIMAL(14,2)`; quantities `DECIMAL(12,2)` (supports metres of fabric).

| Area | Tables |
|---|---|
| Users & system | `users`, `settings` (key/value), `number_sequences`, `activity_logs` |
| Catalogue | `categories`, `brands`, `products` (image, favourite), `product_variants` (size, colour, SKU, barcode, cost, retail, wholesale, stock, low-stock alert), `price_history` |
| Parties | `customers` (DOB, area, opening balance, loyalty points, total purchase), `customer_contacts` (dynamic “add another” fields), `suppliers`, `supplier_contacts`, `ledger_adjustments` |
| Sales | `sales` (discounts, VAT, round-off, points, paid, change, **due_amount**, **next_payment_date**, cost snapshot), `sale_items`, `sale_payments`, `held_invoices`, `sale_returns`, `sale_return_items` |
| Purchases | `purchases`, `purchase_items`, `purchase_payments`, `purchase_returns`, `purchase_return_items` |
| Money | `accounts` (cash / bank / mfs / card), `account_transactions` (cash book), `supplier_payments`, `customer_collections`, `expense_categories`, `expenses` |
| Loyalty & SMS | `loyalty_transactions`, `sms_logs` |
| Views | `v_customer_balance`, `v_supplier_balance` |

### Balance rules

Customer balance (receivable) = opening + Σ(sale total − paid at POS) − Σ(return value − cash refunded) − Σ collections ± adjustments.
Supplier balance (payable) = opening + Σ(purchase total − paid) − Σ(return value − cash received) − Σ payments ± adjustments.

Per-invoice `due_amount` is reduced **oldest-first (FIFO)** by collections, payments, deduction adjustments and returns — this is what drives the reminders.

### Due-collection reminders

When a POS sale is paid partially, `next_payment_date` is required. `GET /api/dashboard` returns every customer with `due_amount > 0 AND next_payment_date <= CURDATE()` as `due_reminders` (with days overdue). No job is needed: the reminder shows up the moment the date arrives. Collecting a part payment can reschedule the remaining due.

### Profit

`sales.cost_total` and `sale_items.cost_price` snapshot the cost at the time of sale, so later price changes never rewrite history. Profit = (sales − returns) − (COGS − returned COGS) − expenses.

## 4. REST API (`/api`)

Auth: `Authorization: Bearer <jwt>`. Role in brackets = minimum role (C = cashier, M = manager, A = admin).

| Module | Routes |
|---|---|
| Auth & users | `POST /auth/login` · `GET /auth/me` · `POST /auth/change-password` · `GET/POST/PUT /users` [A] |
| Catalogue | `GET/POST/PUT/DELETE /categories`, `/brands` [M write] · `GET /products?q&category_id&brand_id&low_stock` · `GET /products/pos-grid` · `GET /products/lookup/:barcode` · `GET /products/:id` · `POST/PUT /products` (multipart: `data` JSON + `image`) [M] · `PATCH /products/:id/favorite` · `POST /products/image-preview` [M] |
| Customers / Suppliers | `GET/POST/PUT/DELETE /customers`, `/suppliers` (`?q&area&has_due`) · `GET /:id/ledger?from&to&txn_type` · `POST /:id/adjustments` [M] · `DELETE /:id/adjustments/:adjId` [M] |
| POS & sales | `POST /sales` · `GET /sales?from&to&q&due_only` · `GET /sales/:id` · `POST /sales/hold` · `GET /sales/held` · `GET/DELETE /sales/held/:id` · `POST /sales/returns` [M] · `GET /sales/returns` |
| Purchases | `GET/POST /purchases` [M] · `GET /purchases/recent` · `GET /purchases/:id` · `GET/POST /purchases/returns` [M] |
| Payment / Collection | `GET/POST /payments` [M] · `GET /payments/payables` [M] · `GET/POST /collections` · `GET /collections/receivables?area&overdue` |
| Accounts & expenses | `GET /accounts` · `POST/PUT /accounts` [A] · `GET /accounts/:id/transactions` [M] · `POST /accounts/transfer` [M] · `POST /accounts/:id/entry` [M] · `GET/POST /expenses` [M] · `GET/POST /expense-categories` |
| Dashboard & reports | `GET /dashboard` · `GET /reports/profit?from&to` [M] · `GET /reports` · `GET /reports/:name?from&to` [M] |
| Price & labels | `GET /price-manager?filter=unpriced|no_retail|no_wholesale|below_cost` [M] · `PUT /price-manager/bulk` [M] · `GET /price-manager/history/:variantId` [M] · `GET /barcode/purchase/:id` |
| Activity | `GET /activity?module&user_id&from&to&q` [M] |
| Settings & data | `GET /settings` · `GET /settings/public` · `PUT /settings` [A] · `POST /settings/logo` [A] · `POST /settings/pin` [A] · `GET /settings/backup/export` [A] · `POST /settings/backup/import` [A + PIN] · `GET /settings/reset/modules` [A] · `POST /settings/reset` [A + PIN + "RESET"] · `POST /settings/sms/test` [A] · `POST /settings/sms/birthdays` [A] |

### Example: credit sale

```json
POST /api/sales
{
  "customer_id": 12,
  "items": [{ "variant_id": 31, "qty": 2 }, { "variant_id": 44, "qty": 1, "discount": 50 }],
  "round_off": 20,
  "payments": [{ "account_id": 1, "amount": 1500 }, { "account_id": 2, "amount": 500, "trx_ref": "BK7H2X" }],
  "next_payment_date": "2026-11-25"
}
```

## 5. Frontend layout (`frontend/src`)

| Path | Purpose |
|---|---|
| `components/layout/` | `nav.js` (strict menu order + role visibility), `Sidebar.jsx` (300 ms ease-in-out collapse, door/panel toggle, mobile drawer), `AppLayout.jsx` (top bar, reminders bell, theme toggle) |
| `components/ui/` | Modal, Field, StatCard, DateRange, Tabs, Pagination, Empty… |
| `components/` | `PartyForm` (customer/supplier with “Add another”), `PartiesPage` (list + ledger + adjustments), `ProductForm` (variants + image), `Pickers`, `receipt/Receipt` |
| `pages/` | One file per menu item + `Products` and `Login` |
| `store/` | Redux Toolkit: auth, ui (theme, sidebar), settings |
| `api/client.js` | Axios with configurable server address (stored per device) |

Theme tokens are in `tailwind.config.js` (`ocean` palette, primary `ocean-600 #1a7cee`). Dark mode uses Tailwind's `class` strategy and is remembered per device.

## 6. Security notes

- Passwords and the security PIN are bcrypt-hashed; JWT secret comes from `.env` (the app refuses to start in production with the default).
- Login is rate-limited; Helmet headers; all SQL is parameterised.
- Restore and reset require the admin role **and** the PIN; reset also requires typing `RESET`.
- Every write action is recorded in the Activity Log with the user and IP.
