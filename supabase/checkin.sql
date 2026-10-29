-- ============================================================
-- Washio — QR check-in στο πλυντήριο.
-- Το πλυντήριο σκανάρει το QR της κράτησης → checked_in_at = τώρα («Ήρθε»).
-- Τρέξε στο Supabase → SQL Editor ΠΡΙΝ το push. Idempotent.
-- ============================================================
alter table public.bookings add column if not exists checked_in_at timestamptz;
alter table public.bookings add column if not exists checked_in_by uuid references auth.users(id) on delete set null;
create index if not exists bookings_checked_in_idx on public.bookings (location_id, checked_in_at) where checked_in_at is not null;
