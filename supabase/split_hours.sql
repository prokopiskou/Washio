-- Διπλό ωράριο ανά μέρα (π.χ. 09:00–15:00 και 16:00–21:00). ΗΔΗ ΕΚΤΕΛΕΣΜΕΝΟ.
set lock_timeout = '3s';
alter table public.location_hours
  add column if not exists open_time2 time,
  add column if not exists close_time2 time;
