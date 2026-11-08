-- Ρυθμίσεις εφαρμογής από το admin (χωρίς push κώδικα).
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.app_settings enable row level security; -- μόνο μέσω server (service role)

-- Checkout: προεπιλογή κάρτα, ΧΩΡΙΣ τέλος υπηρεσίας (δοκιμή από σήμερα).
insert into public.app_settings (key, value) values
  ('checkout', jsonb_build_object('default_pay', 'card', 'card_fee', false, 'since', now()))
on conflict (key) do nothing;
