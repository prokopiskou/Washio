-- ============================================================
-- Washio — Υποδομή κοινού (CRM) για στοχευμένες καμπάνιες.
-- 1) device_links      : ποια συσκευή ανήκει σε ποιον χρήστη (για να μετράνε και οι προβολές πριν τη σύνδεση)
-- 2) audience_profiles : 1 γραμμή ανά χρήστη — περιοχή (~1 χλμ.), τελευταία επίσκεψη, πλύσεις, κανάλια επικοινωνίας
-- 3) audience_segment(): «ποιοι» για ένα πλυντήριο (κοντά / το είδαν / έκλεισαν / αγαπημένο / ανενεργοί)
-- 4) campaigns + campaign_sends : καταγραφή αποστολών, όριο συχνότητας, μέτρηση αποτελέσματος (για αργότερα)
-- Κανόνες: ποτέ ακριβής θέση (μόνο στρογγυλεμένη ~1 χλμ.), ποτέ δεδομένα χρηστών προς πλυντήρια,
-- ομάδα/δοκιμές εξαιρούνται, email μόνο όπου δεν υπάρχει email_opt_out. Idempotent.
-- ============================================================

-- Ταχύτητα στις αναζητήσεις
create index if not exists funnel_events_loc_idx on public.funnel_events (location_id, created_at desc);
create index if not exists funnel_events_dev_idx on public.funnel_events (device_id);
create index if not exists map_opens_dev_idx on public.map_opens (device_id);

-- 1) Συσκευή → χρήστης (από κάθε γεγονός που έχει και τα δύο)
create or replace view public.device_links as
select distinct on (device_id) device_id, user_id
from (
  select device_id, user_id, created_at from public.funnel_events where device_id is not null and user_id is not null
  union all
  select device_id, user_id, created_at from public.map_opens where device_id is not null and user_id is not null
) x
order by device_id, created_at desc;

-- 2) Προφίλ κοινού
create or replace view public.audience_profiles as
with users as (
  select u.id user_id, u.email, u.created_at signed_up_at,
         coalesce(u.raw_app_meta_data->>'internal','') = 'true'
           or lower(coalesce(u.email,'')) ~ '(withinsuccess|prokopis71|giwrgos2070|alexandr\.sph|sk5vhy6dhz|g7cbwtydrr|\+test)' as internal,
         coalesce((u.raw_app_meta_data->>'email_opt_out')::boolean, false) as email_opt_out
  from auth.users u
  where u.deleted_at is null
),
mo as (  -- θέσεις χάρτη (στρογγυλεμένες) των τελευταίων 90 ημερών, με σύνδεση συσκευής
  select coalesce(m.user_id, d.user_id) user_id, m.lat_r, m.lng_r, m.created_at
  from public.map_opens m left join public.device_links d on d.device_id = m.device_id
  where m.lat_r is not null and m.created_at > now() - interval '90 days'
),
home as (  -- η πιο συχνή περιοχή του χρήστη = «γειτονιά»
  select distinct on (user_id) user_id, lat_r home_lat, lng_r home_lng, n home_hits
  from (select user_id, lat_r, lng_r, count(*) n, max(created_at) last from mo where user_id is not null group by 1,2,3) g
  order by user_id, n desc, last desc
),
seen as (
  select coalesce(f.user_id, d.user_id) user_id, max(f.created_at) last_seen_at
  from public.funnel_events f left join public.device_links d on d.device_id = f.device_id
  group by 1
),
bk as (
  select user_id,
         count(*) filter (where status <> 'cancelled') bookings_ok,
         count(*) filter (where status = 'cancelled') bookings_cancelled,
         max(slot_date) filter (where status <> 'cancelled' and slot_date <= current_date) last_wash_date,
         min(created_at) filter (where status <> 'cancelled') first_booking_at
  from public.bookings group by user_id
),
pw as (select distinct user_id from public.push_subscriptions),
pn as (select distinct user_id from public.native_push_tokens)
select us.user_id, us.email, us.signed_up_at, us.internal,
       h.home_lat, h.home_lng, h.home_hits,
       s.last_seen_at,
       coalesce(b.bookings_ok,0) bookings_ok, coalesce(b.bookings_cancelled,0) bookings_cancelled,
       b.last_wash_date, b.first_booking_at,
       (pw.user_id is not null) push_web, (pn.user_id is not null) push_native,
       (pw.user_id is not null or pn.user_id is not null) can_push,
       (us.email is not null and not us.email_opt_out) can_email,  -- Apple relay: washio.gr + send.washio.gr + noreply@ δηλωμένα στην Apple (SPF ✓)
       us.email_opt_out
from users us
left join home h on h.user_id = us.user_id
left join seen s on s.user_id = us.user_id
left join bk b on b.user_id = us.user_id
left join pw on pw.user_id = us.user_id
left join pn on pn.user_id = us.user_id;

-- ΑΣΦΑΛΕΙΑ: τα views τρέχουν με δικαιώματα ιδιοκτήτη (βλέπουν auth.users) → ΚΑΜΙΑ πρόσβαση από την εφαρμογή.
-- Μόνο ο server (service role) τα διαβάζει.
revoke all on public.device_links from public, anon, authenticated;
revoke all on public.audience_profiles from public, anon, authenticated;

-- 3) Τμήμα κοινού για ένα πλυντήριο. Κάθε κριτήριο προαιρετικό (null = δεν χρησιμοποιείται)· τα κριτήρια ενώνονται (OR).
--    p_km           : η «γειτονιά» του χρήστη ή ένα άνοιγμα χάρτη τις τελευταίες p_days μέρες ≤ p_km από το πλυντήριο
--    p_viewed_days  : άνοιξε τη σελίδα του πλυντηρίου τις τελευταίες Χ μέρες
--    p_booked       : έχει κλείσει εκεί (όχι ακυρωμένη)
--    p_favorite     : το έχει στα αγαπημένα
--    p_lapsed_days  : (φίλτρο AND) κράτα μόνο όσους δεν έχουν πλύνει πουθενά εδώ και ≥ Χ μέρες (ή ποτέ)
create or replace function public.audience_segment(
  p_location uuid, p_km numeric default null, p_days int default 60,
  p_viewed_days int default null, p_booked boolean default false, p_favorite boolean default false,
  p_lapsed_days int default null
) returns table (user_id uuid, near boolean, viewed boolean, booked boolean, favorite boolean,
                 can_push boolean, can_email boolean, last_wash_date date)
language sql stable security definer set search_path = public as $$
  with loc as (select id, lat, lng from public.locations where id = p_location),
  dist as (  -- απόσταση σε χλμ. (σφαιρικός τύπος)
    select a.user_id,
           least(
             case when a.home_lat is null then 9999 else 6371*acos(least(1, cos(radians(l.lat))*cos(radians(a.home_lat))*cos(radians(a.home_lng)-radians(l.lng)) + sin(radians(l.lat))*sin(radians(a.home_lat)))) end,
             coalesce((select min(6371*acos(least(1, cos(radians(l.lat))*cos(radians(m.lat_r))*cos(radians(m.lng_r)-radians(l.lng)) + sin(radians(l.lat))*sin(radians(m.lat_r)))))
                       from public.map_opens m left join public.device_links d on d.device_id = m.device_id
                       where coalesce(m.user_id, d.user_id) = a.user_id and m.lat_r is not null and m.created_at > now() - make_interval(days => p_days)), 9999)
           ) km
    from public.audience_profiles a, loc l where not a.internal
  ),
  v as (
    select distinct coalesce(f.user_id, d.user_id) user_id
    from public.funnel_events f left join public.device_links d on d.device_id = f.device_id
    where p_viewed_days is not null and f.location_id = p_location and f.step in ('washer_open','washer_page')
      and f.created_at > now() - make_interval(days => p_viewed_days)
  ),
  b as (select distinct user_id from public.bookings where p_booked and location_id = p_location and status <> 'cancelled'),
  fv as (select distinct user_id from public.favorites where p_favorite and location_id = p_location)
  select a.user_id,
         (p_km is not null and dist.km <= p_km) near,
         (v.user_id is not null) viewed, (b.user_id is not null) booked, (fv.user_id is not null) favorite,
         a.can_push, a.can_email, a.last_wash_date
  from public.audience_profiles a
  join dist on dist.user_id = a.user_id
  left join v on v.user_id = a.user_id
  left join b on b.user_id = a.user_id
  left join fv on fv.user_id = a.user_id
  where not a.internal
    and ((p_km is not null and dist.km <= p_km) or v.user_id is not null or b.user_id is not null or fv.user_id is not null)
    and (p_lapsed_days is null or a.last_wash_date is null or a.last_wash_date <= current_date - p_lapsed_days)
$$;
revoke all on function public.audience_segment(uuid, numeric, int, int, boolean, boolean, int) from public, anon, authenticated;

-- 4) Καμπάνιες (για αργότερα — τώρα μόνο η δομή)
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text,
  location_id uuid references public.locations(id) on delete set null,
  title text not null,                 -- π.χ. «Μέσα & Έξω 12€ αντί 15€»
  body text,
  offer jsonb,                         -- { service_id, price, valid_until } — εφαρμογή τιμής αργότερα
  segment jsonb,                       -- τα κριτήρια audience_segment που χρησιμοποιήθηκαν
  channels text[] not null default '{}', -- push | email | inapp
  status text not null default 'draft',  -- draft | scheduled | sent | cancelled
  scheduled_at timestamptz,
  sent_at timestamptz,
  audience_size int,
  paid_by_location boolean not null default false,   -- «Washio Promote» (πληρωμένη από πλυντήριο)
  price_eur numeric(10,2)
);
create table if not exists public.campaign_sends (
  id bigserial primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null,
  channel text not null,               -- push | email | inapp
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  booked_booking_id uuid,              -- κράτηση που αποδίδεται στην καμπάνια (π.χ. εντός 7 ημερών)
  unique (campaign_id, user_id, channel)
);
create index if not exists campaign_sends_user_idx on public.campaign_sends (user_id, sent_at desc);
alter table public.campaigns enable row level security;
alter table public.campaign_sends enable row level security;

-- Γρήγορος έλεγχος (19 Car Wash, 3 χλμ., είδαν 60 μέρες, έκλεισαν, αγαπημένα):
-- select count(*) total, count(*) filter (where can_push) push, count(*) filter (where can_email) email
-- from public.audience_segment((select id from locations where name ilike '19 car%' limit 1), 3, 60, 60, true, true, null);
