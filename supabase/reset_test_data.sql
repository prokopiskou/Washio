-- ============================================================
-- WASHIO — Καθαρισμός ΟΛΩΝ των test δεδομένων πριν το launch.
--
-- ΣΒΗΝΕΙ:  κρατήσεις πλατφόρμας (app: κάρτα + μετρητά), κριτικές τους,
--          κουπόνια/πιστώσεις, παραπομπές, εγκαταλελειμμένα checkout, πληρωμές (payouts).
-- ΚΡΑΤΑΕΙ: τις ΧΕΙΡΟΚΙΝΗΤΕΣ κρατήσεις των πλυντηρίων (source = 'manual'),
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
  (select count(*) from public.credit_ledger)                                            as credit_rows,
  (select count(*) from public.referrals)                                                as referrals,
  (select count(*) from public.payouts)                                                  as payouts;

begin;

-- 1) Κριτικές που αφορούν test κρατήσεις πλατφόρμας
delete from public.reviews
where booking_id in (
  select id from public.bookings where coalesce(source, 'platform') <> 'manual'
);

-- 2) Κουπόνια / πιστώσεις (όλα test) + μηδενισμός υπολοίπων
delete from public.credit_ledger;
update public.profiles set referral_credit = 0 where coalesce(referral_credit, 0) <> 0;

-- 3) Παραπομπές (test) — οι χρήστες μπορούν να ξαναχρησιμοποιηθούν ως «νέοι»
delete from public.referrals;
update public.profiles set referred_by = null where referred_by is not null;

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
