-- Προωθήσεις πλυντηρίων (dashboard → «Προωθήσεις»). Έκπτωση σε μία υπηρεσία για ραντεβού από–έως.
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid,
  location_id uuid not null references public.locations(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  discount_type text not null check (discount_type in ('percent','amount')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default true,
  check (ends_on >= starts_on)
);
create index if not exists promotions_loc_idx on public.promotions (location_id, ends_on desc);
create index if not exists promotions_svc_idx on public.promotions (service_id, starts_on, ends_on) where is_active;
alter table public.promotions enable row level security;  -- ανάγνωση/εγγραφή μόνο μέσω server (API)
