-- Αναφορά: πόσο μακριά είναι όσοι ανοίγουν τον χάρτη, και πόσοι από κάθε ζώνη κλείνουν.
-- Μία γραμμή ανά συσκευή (το πιο πρόσφατο άνοιγμα με θέση, αλλιώς το πιο πρόσφατο).
with o as (
  select distinct on (coalesce(m.device_id, m.id::text))
         m.*, coalesce(m.acq_ad, u.raw_user_meta_data->>'acq_ad') ad
  from map_opens m left join auth.users u on u.id = m.user_id
  where m.created_at > now() - interval '14 days'
    and coalesce(u.raw_app_meta_data->>'internal','') <> 'true'
  order by coalesce(m.device_id, m.id::text), m.has_location desc, m.created_at desc
),
b as (
  select distinct user_id from bookings
  where status <> 'cancelled' and source is distinct from 'manual'
),
z as (
  select o.*,
    case when not has_location then '0 · χωρίς θέση'
         when nearest_km <= 3  then '1 · ≤3 χλμ.'
         when nearest_km <= 5  then '2 · 3–5 χλμ.'
         when nearest_km <= 10 then '3 · 5–10 χλμ.'
         else '4 · >10 χλμ.' end zone,
    (b.user_id is not null) booked
  from o left join b on b.user_id = o.user_id
)
select zone,
       count(*)                                   devices,
       round(100.0 * count(*) / sum(count(*)) over (), 0) pct,
       count(*) filter (where ad is not null)     from_ads,
       count(*) filter (where user_id is not null) logged_in,
       count(*) filter (where booked)             booked
from z group by zone order by zone;

-- Πού βρίσκονται όσοι είναι >5 χλμ. (κελιά ~1 χλμ.) — για επόμενο πλυντήριο / στόχευση:
-- select lat_r, lng_r, count(distinct coalesce(device_id, id::text)) devices, min(nearest_km) km
-- from map_opens where has_location and nearest_km > 5 and created_at > now() - interval '14 days'
-- group by 1,2 order by devices desc limit 30;
