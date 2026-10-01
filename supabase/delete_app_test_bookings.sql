-- ============================================================
-- WASHIO — Διαγραφή ΟΛΩΝ των κρατήσεων από την εφαρμογή (ήταν δοκιμές).
--
-- ΣΒΗΝΕΙ:  κρατήσεις εφαρμογής (κάρτα + μετρητά) = source <> 'manual',
--          τις κριτικές τους, τα checkout των ΠΑΛΙΩΝ/δοκιμαστικών λογαριασμών.
-- ΚΡΑΤΑΕΙ: τις ΧΕΙΡΟΚΙΝΗΤΕΣ κρατήσεις των πλυντηρίων (source = 'manual'),
--          χρήστες, κουπόνια −3€, παραπομπές, πλυντήρια, υπηρεσίες, ωράρια,
--          και τα checkout των ΝΕΩΝ χρηστών (από 28/9) — χρήσιμα για ανάλυση/υπενθύμιση.
--
-- Τρέξε το ΟΛΟ μαζί στο Supabase → SQL Editor (transaction: όλα ή τίποτα).
-- ============================================================

-- 0) ΠΡΙΝ: τι θα σβηστεί
select
  (select count(*) from public.bookings where coalesce(source, 'platform') <> 'manual') as app_bookings_to_delete,
  (select count(*) from public.bookings where source = 'manual')                         as manual_bookings_kept,
  (select count(*) from public.checkout_attempts c join auth.users u on u.id = c.user_id
     where u.created_at < '2026-09-28')                                                   as test_checkouts_to_delete;

begin;

-- 1) Αποσύνδεση αναφορών (ώστε να μη μπλοκάρει η διαγραφή)
update public.credit_ledger set booking_id = null
where booking_id in (select id from public.bookings where coalesce(source, 'platform') <> 'manual');

update public.referrals set booking_id = null
where booking_id in (select id from public.bookings where coalesce(source, 'platform') <> 'manual');

-- 2) Κριτικές των δοκιμαστικών κρατήσεων
delete from public.reviews
where booking_id in (select id from public.bookings where coalesce(source, 'platform') <> 'manual');

-- 3) Checkout δοκιμαστικών/παλιών λογαριασμών (πριν τις 28/9)
delete from public.checkout_attempts
where user_id in (select id from auth.users where created_at < '2026-09-28');

-- 4) Οι κρατήσεις της εφαρμογής — ΟΧΙ οι χειροκίνητες
delete from public.bookings
where coalesce(source, 'platform') <> 'manual';

commit;

-- 5) ΜΕΤΑ: έλεγχος
select
  (select count(*) from public.bookings where coalesce(source, 'platform') <> 'manual') as app_bookings_left, -- πρέπει 0
  (select count(*) from public.bookings where source = 'manual')                         as manual_bookings_kept;
