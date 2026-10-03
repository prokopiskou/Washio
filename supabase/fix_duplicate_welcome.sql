-- ============================================================
-- WASHIO — Διόρθωση διπλού κουπονιού καλωσορίσματος (race condition)
--
-- Πρόβλημα: 2 ταυτόχρονες κλήσεις στην εγγραφή έδιναν −3€ δύο φορές
-- (4 χρήστες με 6€/9€ αντί για 3€). ΚΑΝΕΝΑΣ δεν ήταν από referral.
--
-- Κάνει:
--   1) Κρατάει ΜΟΝΟ το πρώτο welcome ανά χρήστη, σβήνει τα διπλά
--      και αφαιρεί τα αντίστοιχα 3€ από το υπόλοιπο.
--   2) Unique index: ένα welcome ανά χρήστη — ΠΟΤΕ ξανά διπλό,
--      ακόμα κι αν έρθουν 2 αιτήματα την ίδια στιγμή.
-- Τρέξε το ΟΛΟ μαζί στο Supabase → SQL Editor.
-- ============================================================

-- ΠΡΙΝ
select user_id, count(*) as welcomes from public.credit_ledger
where kind = 'welcome' group by user_id having count(*) > 1;

begin;

with ranked as (
  select id, user_id, amount,
         row_number() over (partition by user_id order by created_at, id) as rn
  from public.credit_ledger
  where kind = 'welcome'
),
extra as (
  delete from public.credit_ledger l
  using ranked r
  where l.id = r.id and r.rn > 1
  returning l.user_id, l.amount
),
per_user as (
  select user_id, sum(amount) as remove_amt from extra group by user_id
)
update public.profiles p
set referral_credit = greatest(0, coalesce(p.referral_credit, 0) - u.remove_amt)
from per_user u
where p.id = u.user_id;

create unique index if not exists credit_ledger_one_welcome_per_user
  on public.credit_ledger (user_id) where kind = 'welcome';

commit;

-- ΜΕΤΑ: πρέπει 0 γραμμές και max υπόλοιπο 3
select user_id, count(*) from public.credit_ledger where kind = 'welcome' group by user_id having count(*) > 1;
select max(referral_credit) as max_balance from public.profiles;
