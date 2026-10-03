-- Κουπόνι Washio ανά κράτηση (€). Μετρητά: ο πελάτης πληρώνει total_amount - coupon_amount
-- στο πλυντήριο· το Washio επιστρέφει το coupon_amount στο πλυντήριο στην εκκαθάριση.
-- (Έτρεξε στις 3/10/2026.)
alter table public.bookings add column if not exists coupon_amount numeric not null default 0;
