-- ============================================================
-- FRESH START — μηδενίζει ΟΛΑ τα test δεδομένα πριν μπουν πραγματικοί χρήστες.
--
-- ΤΙ ΣΒΗΝΕΙ (test συναλλαγές / user-generated):
--   bookings, reviews, checkout_attempts, waitlist, favorites, vehicles
--
-- ΤΙ ΜΕΝΕΙ ΑΝΕΓΓΙΧΤΟ (πραγματικά δεδομένα):
--   locations, services, location_hours, addons, profiles, auth.users,
--   applications/partner_onboarding (αιτήσεις πρατηρίων), staff, payouts
--
-- Τρέξ' το στο Supabase → SQL Editor.
-- ΒΗΜΑ 0 (SELECT) πρώτα — δες πόσα θα φύγουν. Μετά ΒΗΜΑ 1+.
-- ============================================================

-- ΒΗΜΑ 0 — Έλεγχος: πόσες γραμμές θα σβηστούν ανά πίνακα
select 'bookings'          as table, count(*) from public.bookings
union all select 'reviews',            count(*) from public.reviews
union all select 'checkout_attempts',  count(*) from public.checkout_attempts
union all select 'waitlist',           count(*) from public.waitlist
union all select 'favorites',          count(*) from public.favorites
union all select 'vehicles',           count(*) from public.vehicles;

-- ------------------------------------------------------------
-- ΒΗΜΑ 1 — Μηδένισμα κρατήσεων (ΟΛΕΣ ήταν test)
delete from public.bookings;

-- ΒΗΜΑ 2 — Αξιολογήσεις (test)
delete from public.reviews;

-- ΒΗΜΑ 3 — Ημιτελείς πληρωμές / waitlist / αγαπημένα (test)
delete from public.checkout_attempts;
delete from public.waitlist;
delete from public.favorites;

-- ΒΗΜΑ 4 — Οχήματα/πινακίδες test χρηστών (προαιρετικό — αν θες καθαρά)
delete from public.vehicles;

-- ------------------------------------------------------------
-- ΒΗΜΑ 5 — Test πλυντήριο CARDEN: κλείσε την test υπηρεσία «1€»
-- ώστε να ΜΗΝ δέχεται κρατήσεις μέχρι να τη ρυθμίσεις σωστά από το admin.
-- (Είχε μετονομαστεί σε «ΤΕΣΤ Πλύσιμο» στο 1€ — γύρνα την ανενεργή.)
update public.services set is_active = false
where id = '811566aa-440b-44b3-972a-9c3d724e89f0';

-- ------------------------------------------------------------
-- ΒΗΜΑ 6 (ΠΡΟΑΙΡΕΤΙΚΟ — τρέξ' το ΜΟΝΟ αν θες) ------------------
-- Push subscriptions / tokens των test συσκευών. Αν τα σβήσεις, τα
-- test κινητά (και το δικό σου) θα ξανακαταγραφούν μόλις ανοίξεις το app.
-- delete from public.push_subscriptions;
-- delete from public.native_push_tokens;

-- ΠΡΟΣΟΧΗ — ΜΗΝ τρέξεις αυτά εκτός αν ΞΕΡΕΙΣ ότι είναι όλα test:
--   applications / partner_onboarding = αιτήσεις πρατηρίων (ίσως πραγματικές!)
--   locations / services = το inventory σου (τα πρατήρια)
--   profiles = οι λογαριασμοί (ο δικός σου + πρατηριούχοι + appreview)

-- ------------------------------------------------------------
-- ΒΗΜΑ 7 — Επιβεβαίωση: όλα μηδέν;
select 'bookings' as table, count(*) from public.bookings
union all select 'reviews', count(*) from public.reviews
union all select 'checkout_attempts', count(*) from public.checkout_attempts
union all select 'waitlist', count(*) from public.waitlist
union all select 'favorites', count(*) from public.favorites;
