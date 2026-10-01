-- ============================================================
-- WASHIO — Δώσε το −3€ καλωσορίσματος σε όσους γράφτηκαν από τις 30/9
-- και ΔΕΝ το πήραν (χαμένος κωδικός: Apple/Google redirect, άλλος browser,
-- εφαρμογή, verify μετά από 5').
-- Μόνο σε χρήστες ΧΩΡΙΣ καμία κράτηση και ΧΩΡΙΣ προηγούμενο welcome.
-- Τρέξε το στο Supabase → SQL Editor.
-- ============================================================

-- 0) ΠΡΙΝ: ποιοι θα το πάρουν
select u.id, u.email, u.raw_app_meta_data->>'provider' as provider,
       to_char(u.created_at at time zone 'Europe/Athens', 'DD/MM HH24:MI') as created
from auth.users u
where u.created_at >= '2026-09-30'::date
  and not exists (select 1 from public.credit_ledger l where l.user_id = u.id and l.kind = 'welcome')
  and not exists (select 1 from public.bookings b where b.user_id = u.id)
order by u.created_at;

-- 1) Πίστωση −3€ (ίδια συνάρτηση με την εφαρμογή → ενημερώνει υπόλοιπο + ιστορικό)
select public.apply_credit(p_user => u.id, p_delta => 3, p_kind => 'welcome', p_note => 'Καλωσόρισμα')
from auth.users u
where u.created_at >= '2026-09-30'::date
  and not exists (select 1 from public.credit_ledger l where l.user_id = u.id and l.kind = 'welcome')
  and not exists (select 1 from public.bookings b where b.user_id = u.id);

-- 2) ΜΕΤΑ: έλεγχος (πρέπει 0)
select count(*) as still_missing
from auth.users u
where u.created_at >= '2026-09-30'::date
  and not exists (select 1 from public.credit_ledger l where l.user_id = u.id and l.kind = 'welcome')
  and not exists (select 1 from public.bookings b where b.user_id = u.id);
