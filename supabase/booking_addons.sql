-- Πρόσθετα & τιμή υπηρεσίας ανά κράτηση (έτρεξε 5/10/2026).
-- ΠΡΟΣΟΧΗ σε μελλοντικά ALTER στον πίνακα bookings: βάλε πρώτα  set lock_timeout = '3s';
-- ώστε αν υπάρχει ανοιχτή συναλλαγή να αποτύχει γρήγορα αντί να «κρεμάσει» το API.
set lock_timeout = '3s';
alter table public.bookings add column if not exists addons jsonb not null default '[]'::jsonb;
alter table public.bookings add column if not exists service_price numeric;
