-- Κουπόνι Washio ανά κράτηση (€). Μετρητά: ο πελάτης πληρώνει total_amount - coupon_amount
-- στο πλυντήριο (ΧΩΡΙΣ επιστροφή στο πλυντήριο· η προμήθεια υπολογίζεται στο ποσό που εισπράττει).
-- (Έτρεξε στις 3/10/2026.)
alter table public.bookings add column if not exists coupon_amount numeric not null default 0;
