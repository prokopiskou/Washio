-- Απόδοση διαφήμισης μέσω store (web → App Store/Play → εφαρμογή). Βλ. app/api/attrib/route.ts
create table if not exists public.attrib_clicks (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  ip text not null,
  platform text,
  ad text,
  ref text,
  lp text,
  claimed_at timestamptz
);
create index if not exists attrib_clicks_ip_idx on public.attrib_clicks (ip, created_at desc);
alter table public.attrib_clicks enable row level security;
