-- Σύνδεση web → εφαρμογή χωρίς ξανά login: κλειδί μιας χρήσης (2 ώρες).
-- Το web το βάζει στο πρόχειρο (iPhone) και στο link του Google Play (Android).
create table if not exists public.app_handoffs (
  token text primary key,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  used_at timestamptz,
  used_via text
);
create index if not exists app_handoffs_user_idx on public.app_handoffs (user_id, created_at desc);
alter table public.app_handoffs enable row level security;
