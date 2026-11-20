-- =====================================================================
-- Quotations: a priced offer for a customer, kept with held invoices.
-- kind = 'hold' (parked cart) or 'quotation' (QTN-…, printable, valid until).
-- Idempotent.
-- =====================================================================

alter table public.held_invoices add column if not exists kind text not null default 'hold';
alter table public.held_invoices add column if not exists valid_until date;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'held_invoices_kind_check') then
    alter table public.held_invoices add constraint held_invoices_kind_check check (kind in ('hold','quotation'));
  end if;
end $$;

create index if not exists idx_held_kind on public.held_invoices (kind, id);
