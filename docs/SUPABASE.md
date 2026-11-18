# Running BikriPro on Supabase (cloud)

BikriPro's cloud setup has three parts, all with free tiers:

| Part | Service | What it holds |
|---|---|---|
| Database + image storage | **Supabase** (PostgreSQL + Storage) | All shop data, product photos, shop logo |
| API + web app | **Render** web service (`render.yaml`) | Node/Express API on HTTPS, also serves the web app |
| Website | **GitHub Pages** | Landing page and a copy of the web app at `/app/` |

Every till, phone, tablet and browser then talks to one HTTPS address, from anywhere.

```
 Windows/Mac/Linux app ─┐
 Android / iPhone app ──┼──► https://bikripro-api.onrender.com/api ──► Supabase Postgres
 Browser / GitHub Pages ┘          (Render, Singapore)                 + Supabase Storage
```

## 1. Create the Supabase project

1. In your new **BikriPro** organization click **New project**.
   - Name: `bikripro`
   - Database password: generate a strong one and **save it** (you need it in step 3).
   - Region: **Southeast Asia (Singapore)** — closest to Bangladesh and to Render's Singapore region.
2. Wait until the project is ready.

## 2. Create the tables

Pick one:

- **Automatic (easiest):** do nothing — the API creates all tables, the first admin user and default accounts on its first start.
- **Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push` (applies `supabase/migrations/`).
- **SQL Editor:** paste `supabase/migrations/20261118000000_bikripro_init.sql` and run it.

Security: every table has Row Level Security enabled with no policies, and the `anon` / `authenticated` roles are revoked. Supabase's publishable/anon keys therefore cannot read or change shop data. Only the BikriPro API (which connects with the database password) can, and it enforces Admin / Manager / Cashier permissions itself.

## 3. Collect three values from Supabase

| Value | Where |
|---|---|
| `DATABASE_URL` | Project → **Connect** → **Session pooler** → URI. Replace `[YOUR-PASSWORD]` with the database password. Looks like `postgresql://postgres.abcd…:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres` |
| `SUPABASE_URL` | Settings → API → **Project URL** (`https://abcd….supabase.co`) |
| `SUPABASE_SECRET_KEY` | Settings → **API Keys** → **Secret keys** → create/copy `sb_secret_…` |

Use the **Session pooler** (port 5432), not the direct connection: Render and most home/shop networks are IPv4-only, and the direct connection is IPv6. Never put the secret key in the frontend, the mobile app or GitHub — it only goes into the server's environment variables.

## 4. Deploy the API on Render

1. Sign in to [render.com](https://render.com) with GitHub.
2. **New → Blueprint** → choose `CodeWithRoni/BikriPro`. Render reads `render.yaml`.
3. Paste `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` when asked. `JWT_SECRET` is generated automatically.
4. Deploy. The first start creates the tables and prints `✅ BikriPro API running`.
5. Open `https://<your-service>.onrender.com` → sign in with **admin / admin123**, then change the password and the security PIN (default **1234**) immediately.

The free Render plan sleeps after 15 minutes without requests; the first request after that takes up to a minute. For a shop that opens all day, choose the **Starter** plan (always on) by changing `plan: free` to `plan: starter` in `render.yaml`.

## 5. Point all apps at the server

Set it once in GitHub so every build uses it:

GitHub → repo **Settings → Secrets and variables → Actions → Variables → New variable**
- Name: `BIKRIPRO_API_URL`
- Value: `https://<your-service>.onrender.com`

Then re-run **Deploy website** (GitHub Pages web app) and **Build installers** (exe / dmg / deb / apk / ipa). Users can still change the address on the login screen (**Server** button).

## 6. Local development against Supabase

```bash
cp backend/.env.example backend/.env
# put DATABASE_URL (and optionally SUPABASE_URL / SUPABASE_SECRET_KEY) in backend/.env
npm run dev:api     # creates tables on first start
npm run dev:web
```

Or run a local PostgreSQL and use `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/bikripro`.

## Free-plan notes

- Supabase free projects pause after 7 days with no database activity (a shop that sells daily never hits this) and include 500 MB of database space — enough for years of a single shop's invoices. Product photos are ~20–40 KB each in the 1 GB storage.
- Keep using **Shop Setup → Backup & Reset → Export database** regularly; free Supabase projects have no automatic backups.
