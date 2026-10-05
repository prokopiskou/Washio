-- Αποτελέσματα A/B τεστ landing (lp=login vs lp=map). Τρέξ' το στο SQL editor.
-- Παραλλαγή = auth.users.raw_user_meta_data->>'acq_lp' (γράφεται στην εγγραφή).
with u as (
  select id, coalesce(raw_user_meta_data->>'acq_lp', '—') as lp
  from auth.users
  where created_at >= '2026-10-06'
),
ca as (select distinct user_id from checkout_attempts),
bk as (
  select user_id, count(*) n, sum(total_amount - coalesce(coupon_amount, 0)) gmv
  from bookings
  where source is distinct from 'manual' and status <> 'cancelled'
  group by 1
)
select u.lp                                            as variant,
       count(*)                                        as signups,
       count(ca.user_id)                               as reached_checkout,
       round(100.0 * count(ca.user_id) / nullif(count(*), 0), 1) as pct_checkout,
       count(bk.user_id)                               as bookers,
       coalesce(sum(bk.n), 0)                          as bookings,
       round(100.0 * count(bk.user_id) / nullif(count(*), 0), 1) as pct_booked,
       coalesce(sum(bk.gmv), 0)                        as gmv_eur
from u
left join ca on ca.user_id = u.id
left join bk on bk.user_id = u.id
group by 1
order by 1;
-- Κόστος ανά κράτηση = έξοδα του αντίστοιχου ad set στο Meta ÷ bookings.
