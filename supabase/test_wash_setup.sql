-- ============================================================
-- TEST WASH — κάνει το CARDEN bookable για smoke test.
--   • Υπηρεσία «ΤΕΣΤ Πλύσιμο» στο 1€, ενεργή, 30'.
--   • Ωράριο: όλες οι μέρες 08:00–22:00.
--   • Ενεργό, 1 μάνικα (capacity 1) → ιδανικό για τεστ double-booking.
--
-- Τρέξ' το στο Supabase → SQL Editor. Idempotent.
-- Μετά το τεστ, για να το «κλείσεις»: κάνε την υπηρεσία is_active=false.
-- ============================================================

-- 1) Υπηρεσία 1€ (η υπάρχουσα «Μέσα» του CARDEN).
update public.services
  set name = 'ΤΕΣΤ Πλύσιμο',
      price = 1,
      price_moto = null,
      price_suv = null,
      duration_minutes = 30,
      is_active = true
  where id = '811566aa-440b-44b3-972a-9c3d724e89f0';

-- 2) Ωράριο: όλες οι μέρες ανοιχτά 08:00–22:00.
delete from public.location_hours
  where location_id = 'ef047cf7-efb7-4602-9138-54d9b769cfdb';

insert into public.location_hours (location_id, day_of_week, open_time, close_time, is_closed)
select 'ef047cf7-efb7-4602-9138-54d9b769cfdb', d, '08:00', '22:00', false
from generate_series(1, 7) as d;

-- 3) Σιγουριά: ενεργό + 1 μάνικα.
update public.locations
  set is_active = true, capacity = 1
  where id = 'ef047cf7-efb7-4602-9138-54d9b769cfdb';

-- Έλεγχος:
select l.name, l.is_active, l.capacity,
       s.name as service, s.price, s.is_active as service_active,
       count(h.*) filter (where not h.is_closed) as open_days
from public.locations l
left join public.services s on s.location_id = l.id
left join public.location_hours h on h.location_id = l.id
where l.id = 'ef047cf7-efb7-4602-9138-54d9b769cfdb'
group by l.name, l.is_active, l.capacity, s.name, s.price, s.is_active;
