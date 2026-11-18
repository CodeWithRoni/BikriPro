-- Server-only secrets generated inside the database, so no secret has to be
-- typed into a dashboard or committed anywhere:
--   jwt_secret  — signs BikriPro login tokens
--   cron_secret — authenticates the daily birthday job (pg_cron → Edge Function)
-- The settings table has RLS on with no policies and no API grants, and the
-- API never returns these keys. Idempotent.
insert into public.settings (setting_key, setting_value)
values
  ('jwt_secret',  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
  ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (setting_key) do nothing;
