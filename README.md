<p align="center">
  <img src="branding/BikriPro_Logo.png" alt="BikriPro" height="90" />
</p>

<h3 align="center">POS & ERP for garments and clothing retail shops in Bangladesh</h3>

<p align="center">
  Sales · Credit sales & due reminders · Purchases · Stock (size/colour) · Customers & suppliers with ledgers ·
  Cash/Bank/bKash/Nagad · Profit · Barcode labels · Loyalty points · SMS
</p>

---

## What's inside

| Folder | What it is |
|---|---|
| `backend/` | Node.js + Express REST API (runs on Supabase Edge Functions or any Node host), PostgreSQL, JWT roles (Admin / Manager / Cashier), Sharp image engine, cron jobs |
| `frontend/` | React 18 + Tailwind CSS + Redux Toolkit web app (Ocean Blue theme, light/dark, collapsible sidebar). Also contains the Capacitor `android/` and `ios/` projects |
| `desktop/` | Electron shell + electron-builder config for Windows `.exe`, macOS `.dmg`, Linux `.deb` |
| `branding/` | Logo and app icons for every platform |
| `supabase/migrations/` | PostgreSQL schema (applied automatically on start, or with `supabase db push`) |
| `supabase/functions/api/` | Supabase Edge Function wrapper + generated API bundle (`npm run build:edge`) |
| `docs/` | Supabase/cloud guide, install guide, architecture & API reference, packaging guide |
| `.github/workflows/build.yml` | One-click CI build of all installers (exe, dmg, deb, apk, ipa) |

## Quick start

**Cloud (live):** everything runs on Supabase — PostgreSQL, the API as an Edge Function, and photo storage — plus GitHub Pages for the website. See [`docs/SUPABASE.md`](docs/SUPABASE.md).

**Development:** requires **Node.js 18+** and a PostgreSQL database (a Supabase project or a local PostgreSQL 14+).

```bash
# 1. install
npm run install:all

# 2. configure the database connection
cp backend/.env.example backend/.env      # set DATABASE_URL and JWT_SECRET

# 3. run API (port 5000) and web app (port 5173) in two terminals.
#    The API creates the tables and the admin user on its first start.
npm run dev:api
npm run dev:web

# optional: sample products, supplier and customer
npm run seed:demo
```

Open http://localhost:5173 and sign in with **admin / admin123**. The security PIN (for restore/reset) is **1234**.
**Change both right after the first login** (top-right menu → Change password; Shop Setup → Security PIN).

Single-port production run (API also serves the built web app): `npm start` → http://localhost:5000

## Feature map (side menu order)

1. **Point of Sale** — barcode scan / search, Hold & Held invoices, Recent / Best-selling / Favourite grid, quick customer add, split payments (Cash, bKash, Nagad, Card, Bank), loose-change waiver, loyalty redemption, **credit sale with Next Payment Date** (3 days / 7 days / 1 month / custom), Complete & Print · Complete · Clear, keyboard shortcuts (F2 search, F8 hold, F9 complete, F10 complete & print)
2. **Dashboard** — **Due Collection Reminders** (appear automatically when a due date arrives), today/month figures, receivable & payable (click to open Collection / Payment), stock value, low stock, best sellers, loyalty, birthdays
3. **Sales** · 4. **Sales Return** (restock, refund or credit to due, loyalty reversal)
5. **Purchase** (stock in, latest cost, set new MRP from the purchase, supplier's previous due shown on selection) · 6. **Purchase Return**
7. **Customers** · 8. **Suppliers** — separate menus, dynamic “Add another” contact fields, optional DOB, ledgers filterable by date / transaction type / area, ledger adjustments (customer round-off waivers, supplier rebates & commissions)
9. **Payment** (to suppliers) · 10. **Collection** (from credit customers, with waiver & rescheduling)
11. **Products** — catalogue, size/colour variants, SKU & barcode, photos (auto 500×500), professional filter bar (category / sub-category / brand / unit / size / colour / stock status / price range / sort, active-filter chips, result count & stock value) · **Product Setup** page: Category, Sub Category, Brand, Unit Type, Size, Color and Variation sets, used as drop-downs and one-tap chips in the product form
12. **Cash, Bank & MFS** — accounts, statements, transfers, deposits/withdrawals
13. **Expenses** — shop costs by category, paid from any account
14. **Profit** — net sales, COGS, gross margin, expenses, net profit, by category
15. **Report Hub** — 11 reports, CSV export, print
16. **Activity Log** · 17. **Barcode Labels** (load from the last 10 purchases, choose label fields, A4 sheets or thermal presets / custom mm, live preview) · 18. **Price Manager** (unpriced / missing retail / missing wholesale / below-cost filters, inline edit, bulk markup rules)
19. **Shop Setup** (admin, last in the menu) — shop info & logo, VAT, receipt width, loyalty rates, SMS templates, users & roles, security PIN, **database Export / Import / Reset** (PIN + typed confirmation)

Product images of any size are automatically converted on the server to a **500 × 500 WebP** — trimmed, fitted without cropping or stretching, and compressed (typically 2–40 KB) — on the device itself (browser, desktop or phone app) before upload, then stored in Supabase Storage.

## Building installers

The easiest way: push a tag (`git tag v1.0.0 && git push --tags`) or run **Actions → Build installers** on GitHub.
The workflow produces `BikriPro-Setup-x.y.z.exe`, `.dmg`, `.deb`, `BikriPro-android.apk` and an unsigned iOS `.ipa`.
Manual steps for each platform are in [`docs/PACKAGING.md`](docs/PACKAGING.md).

## Documentation

- [docs/SUPABASE.md](docs/SUPABASE.md) — Supabase setup: database, Edge Function API, storage, birthday cron, deploys
- [docs/INSTALL.md](docs/INSTALL.md) — installing at a shop (tills, phones, printers, offline server option)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, database schema, API routes, business rules
- [docs/PACKAGING.md](docs/PACKAGING.md) — Electron and Capacitor build guide
