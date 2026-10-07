-- Αποτελέσματα flyers ΑΝΑ ΚΑΝΑΛΙ (acq_ref):
--   FLYER          = τυπωμένο QR (παρμπρίζ / γενική διανομή)
--   FLYER_FANARI   = αυτοκόλλητο QR washio.gr/f/fanari (φανάρια)
--   FLYER_<ΆΛΛΟ>   = οποιοδήποτε άλλο washio.gr/f/<κανάλι>
-- Η «ζώνη» φαίνεται από το πλυντήριο όπου έγινε η κράτηση.
with u as (
  select id, raw_user_meta_data->>'acq_ref' ch, created_at from auth.users
  where raw_user_meta_data->>'acq_ref' like 'FLYER%' and last_sign_in_at is not null
    and coalesce(email,'') not ilike '%+test%'
),
ca as (select distinct user_id from checkout_attempts),
bk as (select b.user_id, count(*) n, sum(b.total_amount - coalesce(b.coupon_amount,0)) gmv,
              string_agg(distinct l.name, ', ') washers
       from bookings b join locations l on l.id=b.location_id
       where b.source is distinct from 'manual' and b.status <> 'cancelled' group by 1)
select u.ch channel, count(*) signups, count(ca.user_id) reached_checkout, count(bk.user_id) bookers,
       coalesce(sum(bk.n),0) bookings, coalesce(sum(bk.gmv),0) gmv_eur,
       string_agg(distinct bk.washers, ' | ') washers
from u left join ca on ca.user_id=u.id left join bk on bk.user_id=u.id
group by 1 order by 1;
