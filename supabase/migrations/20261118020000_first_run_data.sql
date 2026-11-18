-- First-run data so a fresh Supabase project is usable right after `supabase db push`
-- (the Edge Function does not seed). Idempotent.
-- Default login admin / admin123 and security PIN 1234 — change both after first login.
insert into public.users (name, username, password_hash, role)
select 'Shop Owner', 'admin', '$2a$10$g0LdwwIeqkzDwwb6jpBLeeuK321spzeGKxKCNRcoN2ttmh.hgAVJ.', 'admin'
where not exists (select 1 from public.users);

insert into public.settings (setting_key, setting_value)
values ('security_pin_hash', '$2a$10$ns1jT2Wcp54XPJNqT9IR0uQ5yxpL1JMND3Yi48CDYR99Ubw7055zi')
on conflict (setting_key) do nothing;

insert into public.accounts (name, type, provider, is_default)
select * from (values
  ('Cash Drawer', 'cash', null::text, true), ('bKash', 'mfs', 'bKash', true), ('Nagad', 'mfs', 'Nagad', false),
  ('Card (POS Machine)', 'card', null, true), ('Bank Account', 'bank', null, true)) v
where not exists (select 1 from public.accounts);

insert into public.customers (name, is_walk_in)
select 'Walk-in Customer', true
where not exists (select 1 from public.customers where is_walk_in);

insert into public.expense_categories (name)
values ('Shop Rent'), ('Electricity'), ('Staff Salary'), ('Transport'), ('Snacks & Tea'), ('Internet & Mobile'), ('Others')
on conflict (name) do nothing;

-- (no ON CONFLICT: category names are unique per parent since the Product Setup migration)
insert into public.categories (name)
select v.name from (values ('Shirt'), ('T-Shirt'), ('Polo'), ('Panjabi'), ('Pant'), ('Jeans'), ('Saree'), ('Three-Piece'), ('Kurti'), ('Kids Wear'), ('Accessories')) as v(name)
where not exists (select 1 from public.categories c where c.parent_id is null and lower(c.name) = lower(v.name));

-- Public image bucket (exists only on Supabase; skipped elsewhere)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('bikripro', 'bikripro', true, 5242880, array['image/webp','image/png','image/jpeg'])
    on conflict (id) do nothing;
  end if;
end $$;
