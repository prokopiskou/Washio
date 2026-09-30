-- ============================================================
-- WASHIO — Καθαρισμός ΟΛΩΝ των test δεδομένων πριν το launch.
--
-- ΣΒΗΝΕΙ:  κρατήσεις πλατφόρμας (app: κάρτα + μετρητά), κριτικές τους,
--          εγκαταλελειμμένα checkout, πληρωμές (payouts).
-- ΚΡΑΤΑΕΙ: τις ΧΕΙΡΟΚΙΝΗΤΕΣ κρατήσεις των πλυντηρίων (source = 'manual'),
--          κουπόνια/πιστώσεις (υπόλοιπα + ιστορικό) και παραπομπές,
--          χρήστες/λογαριασμούς, πλυντήρια, υπηρεσίες, τιμές, ωράρια, φωτογραφίες,
--          λίστα αναμονής (waitlist).
--
-- Τρέξε το ΟΛΟ μαζί στο Supabase → SQL Editor. Είναι μέσα σε transaction:
-- αν κάτι αποτύχει, δεν σβήνεται τίποτα.
-- ============================================================

-- 0) ΠΡΙΝ: δες τι θα σβηστεί (τρέξε μόνο αυτό αν θες πρώτα να ελέγξεις)
select
  (select count(*) from public.bookings where coalesce(source, 'platform') <> 'manual') as platform_bookings_to_delete,
  (select count(*) from public.bookings where source = 'manual')                         as manual_bookings_kept,
  (select count(*) from public.reviews)                                                  as reviews_total,
  (select count(*) from public.payouts)                                                  as payouts;

begin;

-- 1) Κριτικές που αφορούν test κρατήσεις πλατφόρμας
delete from public.reviews
where booking_id in (
  select id from public.bookings where coalesce(source, 'platform') <> 'manual'
);

-- 4) Εγκαταλελειμμένα checkout (test)
delete from public.checkout_attempts;

-- 5) Πληρωμές/εκκαθαρίσεις πλυντηρίων (υπολογίστηκαν πάνω σε test κρατήσεις)
delete from public.payouts;

-- 6) Οι ίδιες οι κρατήσεις πλατφόρμας — ΟΧΙ οι χειροκίνητες
delete from public.bookings
where coalesce(source, 'platform') <> 'manual';

commit;

-- 7) ΜΕΤΑ: επιβεβαίωση
select
  (select count(*) from public.bookings where coalesce(source, 'platform') <> 'manual') as platform_bookings_left, -- πρέπει 0
  (select count(*) from public.bookings where source = 'manual')                         as manual_bookings_kept;

-- ------------------------------------------------------------
-- ΠΡΟΑΙΡΕΤΙΚΟ: αν ΚΑΙ όλες οι υπόλοιπες κριτικές είναι test (π.χ. δοκιμές
-- χωρίς κράτηση), βγάλε το σχόλιο από την παρακάτω γραμμή και τρέξ' την:
-- delete from public.reviews;
-- ------------------------------------------------------------
