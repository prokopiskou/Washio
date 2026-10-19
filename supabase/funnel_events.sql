-- Βήματα διαδρομής μέσα στην εφαρμογή (χάρτης → πλυντήριο → υπηρεσία → ώρα → κράτηση → πληρωμή).
-- Γράφει μόνο ο server (/api/funnel). Εσωτερικοί λογαριασμοί/συσκευές δεν καταγράφονται.
create table if not exists public.funnel_events (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  session_id   text,
  device_id    text,
  user_id      uuid references auth.users(id) on delete set null,
  step         text not null,
  location_id  uuid,
  meta         jsonb,
  native       boolean
);
create index if not exists funnel_events_created_idx on public.funnel_events (created_at desc);
create index if not exists funnel_events_step_idx on public.funnel_events (step, created_at desc);
alter table public.funnel_events enable row level security;
