-- ============================================================
-- Washio — Capacity (μάνικες), διάρκειες, χειροκίνητες κρατήσεις,
-- εξαιρέσεις ωρών, SUV τιμές, no-show.
-- Τρέξε στο Supabase → SQL Editor. Ασφαλές να ξανατρέξει (idempotent).
-- ============================================================

-- 1) Μάνικες / θέσεις εξυπηρέτησης ανά πλυντήριο.
--    Πόσες κρατήσεις χωράνε ΤΑΥΤΟΧΡΟΝΑ στην ίδια ώρα.
alter table public.locations
  add column if not exists capacity int not null default 1;

alter table public.locations
  drop constraint if exists locations_capacity_range;
alter table public.locations
  add constraint locations_capacity_range check (capacity between 1 and 10);

-- 2) Τιμή SUV ανά υπηρεσία (όπως υπάρχει price_moto).
alter table public.services
  add column if not exists price_suv numeric;

-- 3) Κρατήσεις: πηγή, στοιχεία πελάτη εκτός πλατφόρμας, διάρκεια.
alter table public.bookings
  add column if not exists source text not null default 'platform';
alter table public.bookings
  drop constraint if exists bookings_source_valid;
alter table public.bookings
  add constraint bookings_source_valid check (source in ('platform', 'manual'));

alter table public.bookings
  add column if not exists customer_name text;
alter table public.bookings
  add column if not exists customer_phone text;

-- Διάρκεια κράτησης (snapshot από την υπηρεσία τη στιγμή της κράτησης).
alter table public.bookings
  add column if not exists duration_minutes int;

-- Backfill: πάρε τη διάρκεια από την υπηρεσία, αλλιώς 30'.
update public.bookings b
set duration_minutes = coalesce(s.duration_minutes, 30)
from public.services s
where b.service_id = s.id and b.duration_minutes is null;

update public.bookings
set duration_minutes = 30
where duration_minutes is null;

-- 4) Εξαιρέσεις ωραρίου: νέο μοντέλο «κλειστό από-έως».
--    is_closed = true  → κλειστό ΟΛΗ τη μέρα.
--    closed_from/closed_to → κλειστό μόνο σε αυτό το διάστημα.
alter table public.location_hours_exceptions
  add column if not exists closed_from time;
alter table public.location_hours_exceptions
  add column if not exists closed_to time;

-- 5) ΚΡΙΣΙΜΟ: το παλιό unique index επέτρεπε ΜΙΑ κράτηση ανά slot.
--    Με capacity (μάνικες) > 1 πρέπει να φύγει — ο έλεγχος χωρητικότητας
--    γίνεται πλέον server-side με βάση locations.capacity.
drop index if exists bookings_unique_active_slot;

-- 6) Ευρετήριο για γρήγορο occupancy ανά μέρα.
create index if not exists bookings_location_date_idx
  on public.bookings (location_id, slot_date);

-- ------------------------------------------------------------
-- Έλεγχος: δες τι έχει τώρα κάθε πλυντήριο.
-- select name, capacity from public.locations order by name;
-- ------------------------------------------------------------
