-- ============================================================
-- Washio — Μετρήσεις: ημερολόγιο αλλαγών + κόστος διαφήμισης + συγκεντρωτικά funnel/κρατήσεων.
-- Admin → «Μετρήσεις». Idempotent.
-- ============================================================

-- Ημερολόγιο αλλαγών (κώδικας ή ρυθμίσεις admin)
create table if not exists public.change_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),       -- πότε μπήκε σε ισχύ (live)
  title text not null,
  area text,                                    -- χάρτης | checkout | κουπόνι | διαφημίσεις | πλυντήρια | …
  source text not null default 'code',          -- code | admin | ads
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists change_log_at_idx on public.change_log (at desc);
alter table public.change_log enable row level security;

-- Κόστος διαφήμισης ανά μέρα (χειροκίνητα από το admin ή αυτόματα από Meta αργότερα)
create table if not exists public.ad_spend (
  day date primary key,
  amount numeric(10,2) not null,
  source text not null default 'manual',
  updated_at timestamptz not null default now()
);
alter table public.ad_spend enable row level security;

-- Συγκεντρωτικά για ένα χρονικό παράθυρο (μοναδικοί επισκέπτες ανά βήμα + κρατήσεις + οικονομικά)
create or replace function public.metrics_window(p_from timestamptz, p_to timestamptz)
returns table (
  map_open int, washer_open int, picker_open int, car_picked int, service_select int, book_click int,
  booking_page int, pay_click int, bookings int, cancelled int, no_show int, scanned int, card int,
  commission numeric, ad_spend numeric
) language sql stable security definer set search_path = public as $$
  with f as (
    select step, coalesce(device_id, user_id::text) who from public.funnel_events
    where created_at >= p_from and created_at < p_to
  ),
  b as (
    select b.* from public.bookings b left join public.profiles p on p.id = b.user_id
    where coalesce(b.source,'') <> 'manual' and b.created_at >= p_from and b.created_at < p_to
      and lower(coalesce(p.email,'')) !~ '(withinsuccess|prokopis71|giwrgos2070|alexandr\.sph|sk5vhy6dhz|g7cbwtydrr|\+test)'
  )
  select
    (select count(distinct who) from f where step = 'map_open')::int,
    (select count(distinct who) from f where step = 'washer_open')::int,
    (select count(distinct who) from f where step = 'car_picker_open')::int,
    (select count(distinct who) from f where step = 'car_picked')::int,
    (select count(distinct who) from f where step = 'service_select')::int,
    (select count(distinct who) from f where step = 'book_click')::int,
    (select count(distinct who) from f where step = 'booking_page')::int,
    (select count(distinct who) from f where step = 'pay_click')::int,
    (select count(*) from b)::int,
    (select count(*) from b where status = 'cancelled')::int,
    (select count(*) from b where status = 'no_show')::int,
    (select count(*) from b where checked_in_at is not null)::int,
    (select count(*) from b where stripe_payment_status in ('paid','refunded'))::int,
    coalesce((select sum(platform_fee) from b where status <> 'cancelled'), 0),
    coalesce((select sum(amount) from public.ad_spend
              where day >= (p_from at time zone 'Europe/Athens')::date and day < (p_to at time zone 'Europe/Athens')::date), 0)
$$;
revoke all on function public.metrics_window(timestamptz, timestamptz) from public, anon, authenticated;

-- Ανά μέρα (ώρα Ελλάδας), τελευταίες p_days μέρες
create or replace function public.metrics_daily(p_days int default 21)
returns table (
  d date, map_open int, washer_open int, picker_open int, car_picked int, service_select int, book_click int,
  booking_page int, pay_click int, bookings int, cancelled int, no_show int, scanned int, card int,
  commission numeric, ad_spend numeric
) language sql stable security definer set search_path = public as $$
  select g.d, w.*
  from generate_series((now() at time zone 'Europe/Athens')::date - (p_days - 1), (now() at time zone 'Europe/Athens')::date, '1 day') as g(d)
  cross join lateral public.metrics_window(
    (g.d::timestamp at time zone 'Europe/Athens'), ((g.d + 1)::timestamp at time zone 'Europe/Athens')
  ) w
  order by g.d desc
$$;
revoke all on function public.metrics_daily(int) from public, anon, authenticated;

-- Αρχικό ημερολόγιο (σημαντικές αλλαγές για πελάτες — ώρες ≈ commit, διορθώνονται από το admin)
insert into public.change_log (at, title, area, source) values
  ('2026-11-07 17:19+02', '«Τι όχημα έχεις;» στον χάρτη/σελίδα αντί για ΙΧ/SUV — καμία τιμή πριν την επιλογή', 'χάρτης', 'code'),
  ('2026-11-07 18:30+02', 'Χάρτης: όλες οι διαθέσιμες ώρες της μέρας', 'χάρτης', 'code'),
  ('2026-11-07 18:32+02', 'Χωρίς όχημα: μόνο μεγάλο κουμπί «Τι όχημα έχεις;», καμία υπηρεσία', 'χάρτης', 'code'),
  ('2026-11-07 21:27+02', 'Μάρκα/μοντέλο υποχρεωτικά στο checkout', 'checkout', 'code'),
  ('2026-11-07 21:30+02', 'Κλείσιμο καμπάνιας washio_local_west', 'διαφημίσεις', 'ads'),
  ('2026-11-07 22:00+02', 'Washio Club: κοινές σταγόνες σε όλα τα πλυντήρια', 'κουπόνι', 'code'),
  ('2026-11-08 10:30+02', 'washio_partners 5€ → 10€/μέρα', 'διαφημίσεις', 'ads'),
  ('2026-11-08 15:20+02', 'Χωρίς πινακίδα — μόνο μάρκα & μοντέλο', 'checkout', 'code'),
  ('2026-11-08 15:35+02', 'Κουπόνι: «ισχύει 7 μέρες» + αντίστροφη μέτρηση + push «λήγει αύριο»', 'κουπόνι', 'code'),
  ('2026-11-08 15:45+02', 'Checkout: κάρτα προεπιλογή, χωρίς τέλος υπηρεσίας', 'checkout', 'code')
on conflict do nothing;
