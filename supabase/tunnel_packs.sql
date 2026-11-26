-- Πακέτα πλυσιμάτων για τούνελ (χωρίς ραντεβού). Φάση 1: GREEN CAR WASH.
-- Ροή: ο πελάτης αγοράζει πακέτο (κάρτα) → «Χρησιμοποίησε 1 πλύσιμο» → δημιουργείται κράτηση
-- για ΤΩΡΑ με κανονικό QR (stripe_payment_status='pack') → το πλυντήριο σκανάρει όπως πάντα
-- → ΤΟΤΕ αφαιρείται 1 πλύσιμο. Ασκανάριστο QR = κανένα πλύσιμο δεν χάνεται.

alter table public.locations add column if not exists is_tunnel boolean not null default false;

create table if not exists public.wash_packs (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  name text not null,
  washes int not null check (washes between 1 and 100),
  price numeric(8,2) not null check (price > 0),
  valid_days int not null default 180,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists wash_packs_loc on public.wash_packs(location_id) where is_active;

create table if not exists public.pack_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id uuid not null references public.wash_packs(id),
  location_id uuid not null references public.locations(id),
  service_id uuid not null references public.services(id),
  name text not null,
  washes_total int not null,
  washes_left int not null check (washes_left >= 0),
  price numeric(8,2) not null,
  platform_fee numeric(8,2) not null default 0,
  expires_at timestamptz not null,
  payment_intent_id text unique,
  status text not null default 'active', -- active | refunded
  created_at timestamptz not null default now()
);
create index if not exists pack_purchases_user on public.pack_purchases(user_id);

create table if not exists public.pack_redemptions (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.pack_purchases(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  consumed_at timestamptz, -- πότε σκαναρίστηκε (τότε αφαιρείται το πλύσιμο)
  created_at timestamptz not null default now()
);
create index if not exists pack_redemptions_purchase on public.pack_redemptions(purchase_id);

alter table public.wash_packs enable row level security;
alter table public.pack_purchases enable row level security;
alter table public.pack_redemptions enable row level security;
drop policy if exists "packs public read" on public.wash_packs;
create policy "packs public read" on public.wash_packs for select using (is_active);
drop policy if exists "own purchases" on public.pack_purchases;
create policy "own purchases" on public.pack_purchases for select using (auth.uid() = user_id);
-- Γραφές μόνο από τον server (service role).

-- GREEN CAR WASH: τούνελ + πακέτα (τιμές πίνακα 27/11).
update public.locations set is_tunnel = true where id = '5cca4ee5-2f6e-4fbd-985e-7f4dd0b58e64';

insert into public.wash_packs (location_id, service_id, name, washes, price, sort_order)
select '5cca4ee5-2f6e-4fbd-985e-7f4dd0b58e64', s.id, v.name, v.washes, v.price, v.ord
from (values
  ('f776fb8c', '10 εξωτερικά πλυσίματα', 10, 45.00, 1),
  ('f776fb8c', '15 εξωτερικά πλυσίματα', 15, 55.00, 2),
  ('f099ac82', '5 πλυσίματα μέσα-έξω',   5, 35.00, 3)
) as v(sid, name, washes, price, ord)
join public.services s on s.id::text like v.sid || '%' and s.location_id = '5cca4ee5-2f6e-4fbd-985e-7f4dd0b58e64'
where not exists (select 1 from public.wash_packs p where p.location_id = '5cca4ee5-2f6e-4fbd-985e-7f4dd0b58e64' and p.name = v.name);

-- Έλεγχος
select p.name, p.washes, p.price, round(p.price / p.washes, 2) per_wash, s.name service, s.price single_price
from public.wash_packs p join public.services s on s.id = p.service_id order by p.sort_order;
