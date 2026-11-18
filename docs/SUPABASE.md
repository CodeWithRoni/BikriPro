# BikriPro on Supabase (cloud)

Everything runs on Supabase — no other server or hosting account is needed.

| Part | Supabase feature | Details |
|---|---|---|
| Database | PostgreSQL | All shop data. Schema in `supabase/migrations/` |
| API | **Edge Function `api`** | The same Express API as `backend/`, bundled for Supabase's Deno runtime |
| Images | Storage bucket `bikripro` | Product photos (500×500, made on the device) and the shop logo |
| Birthday SMS | `pg_cron` + `pg_net` | Calls the API once a day at 10:00 Bangladesh time |
| Website | GitHub Pages | Landing page + web app at `/app/` |

```
 Windows / Mac / Linux app ─┐
 Android / iPhone app ──────┼──► https://pnhaxcbxhbjvqzpohbet.supabase.co/functions/v1/api
 Browser (GitHub Pages) ────┘        Edge Function ──► Postgres + Storage
```

**Project:** `bikripro` (organization *BikriPro's Org*, region Singapore `ap-southeast-1`)
**API URL used by all apps:** `https://pnhaxcbxhbjvqzpohbet.supabase.co/functions/v1` (set in `frontend/.env.production`)

## Security model

- Every table has Row Level Security on with **no policies**, and the `anon` / `authenticated` roles have no grants. Supabase's publishable/anon keys therefore can't read or change any shop data.
- Only the Edge Function talks to the database (with the connection string Supabase gives it). It enforces BikriPro's own login and Admin / Manager / Cashier permissions.
- The login-token signing key and the cron key are random values generated inside the database (`settings.jwt_secret`, `settings.cron_secret`). They are never sent to apps and never included in backups. You don't have to type any secret anywhere.
- The function is deployed with "Verify JWT" **off**, because BikriPro uses its own login tokens, not Supabase Auth.

## First login

Open the web app (GitHub Pages `/app/`, or any BikriPro app) and sign in with **admin / admin123**.
Change the password (top-right menu) and the security PIN (Shop Setup → Security PIN, default **1234**) immediately.

## Updating the API after code changes

The bundle `supabase/functions/api/bikripro.js` is generated from `backend/src`:

```bash
cd backend
npm run build:edge        # rebuild the bundle
```

Deploy it in one of these ways:

1. **Automatic (recommended):** add a GitHub secret `SUPABASE_ACCESS_TOKEN` (a scoped personal access token from supabase.com → Account → Access Tokens). Every push to `main` that touches the backend runs **Deploy API to Supabase**.
2. **Supabase CLI:** `supabase functions deploy api --project-ref pnhaxcbxhbjvqzpohbet --no-verify-jwt --use-api`

New database migrations are applied with `supabase db push` (or by pasting the SQL into the dashboard SQL editor). A brand-new project gets the schema, server secrets, default admin, accounts, categories and the image bucket from the three files in `supabase/migrations/`.

## Birthday SMS schedule

Created once in the SQL editor (already done for the `bikripro` project):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('bikripro-birthday-sms', '0 4 * * *', $$
  select net.http_post(
    url     := 'https://pnhaxcbxhbjvqzpohbet.supabase.co/functions/v1/api/cron/birthdays',
    headers := jsonb_build_object('Content-Type', 'application/json',
               'x-cron-secret', (select setting_value from public.settings where setting_key = 'cron_secret')),
    body    := '{}'::jsonb)
$$);
```

`0 4 * * *` UTC is 10:00 in Bangladesh.

## SMS gateway

Add Edge Function secrets in the dashboard (Edge Functions → Secrets): `SMS_PROVIDER` (`bulksmsbd` or `generic`), `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER_ID`. Until then messages are only logged (Report Hub → SMS log).

## Running the API yourself instead (optional)

The `backend/` folder is still a normal Node.js server. Point it at the same database with `DATABASE_URL` (Supabase → Connect → Session pooler URI) and it behaves exactly like the Edge Function — useful for an offline shop PC or local development:

```bash
cp backend/.env.example backend/.env   # set DATABASE_URL
npm run dev:api
```

## Free-plan notes

- Supabase free projects pause after 7 days without any database activity (a shop selling daily never hits this). 500 MB database and 1 GB storage are enough for years of a single shop's data.
- Free projects have no automatic backups — use **Shop Setup → Backup & Reset → Export database** regularly.
