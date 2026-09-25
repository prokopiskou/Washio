-- ============================================================
-- Επιπλέον χρήσιμες οδηγίες ανά πλυντήριο + ενημερωτική διάρκεια ανά υπηρεσία
-- ============================================================

-- 1) Οδηγίες που ορίζει το admin ανά location (π.χ. πώς να πας, πού να παρκάρεις).
--    Εμφανίζονται στον χρήστη στο success page ΚΑΙ στο email επιβεβαίωσης.
alter table public.locations
  add column if not exists extra_instructions text;

-- 2) Ενημερωτική διάρκεια πλυσίματος (λεπτά) που δηλώνει ο πλυντηριάς ανά υπηρεσία.
--    ΚΑΘΑΡΑ ενημερωτικό για τον χρήστη (checkout) — ΔΕΝ επηρεάζει τα slots
--    (τα slots χρησιμοποιούν το services.duration_minutes, που δεν το αγγίζουμε).
alter table public.services
  add column if not exists display_duration_minutes int;
