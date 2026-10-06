-- Αποτελέσματα flyers: όσοι γράφτηκαν από QR flyer (acq_ref = 'FLYER').
-- (Οι flyers της 1ης παρτίδας γράφουν ?ref=WASHIO&utm_source=flyer — η εφαρμογή τους
--  μετατρέπει σε FLYER ώστε να μη μπλέκονται με τη διαφήμιση.)
with u as (
  select id, created_at from auth.users
  where raw_user_meta_data->>'acq_ref' = 'FLYER' and last_sign_in_at is not null
    and coalesce(email,'') not ilike '%+test%'
),
ca as (select distinct user_id from checkout_attempts),
bk as (select user_id, count(*) n, sum(total_amount - coalesce(coupon_amount,0)) gmv
       from bookings where source is distinct from 'manual' and status <> 'cancelled' group by 1)
select count(*) signups, count(ca.user_id) reached_checkout, count(bk.user_id) bookers,
       coalesce(sum(bk.n),0) bookings, coalesce(sum(bk.gmv),0) gmv_eur,
       min(u.created_at) first_signup, max(u.created_at) last_signup
from u left join ca on ca.user_id=u.id left join bk on bk.user_id=u.id;
