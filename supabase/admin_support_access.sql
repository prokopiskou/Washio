-- ============================================================
-- Washio — Support mode: πρόσβαση admin στα dashboards των πλυντηρίων
-- ΧΩΡΙΣ τον κωδικό τους. Ο admin συνδέεται με τον ΔΙΚΟ του λογαριασμό
-- και ανοίγει /dashboard?location=<id>.
--
-- Οι policies εδώ είναι ΠΡΟΣΘΕΤΕΣ (permissive OR) — δεν αλλάζουν
-- τίποτα για τους ιδιοκτήτες. Idempotent.
--
-- ⚠ Αν προστεθεί νέος admin: ενημέρωσε ΚΑΙ το lib/admins.ts ΚΑΙ εδώ.
-- ============================================================

create or replace function public.is_washio_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() ->> 'email') in ('withinsuccess@gmail.com', 'giwrgos2070@gmail.com'),
    false
  )
$$;

-- Πλήρης πρόσβαση admin στους πίνακες που χρησιμοποιεί το dashboard.
drop policy if exists "washio_admin_all" on public.locations;
create policy "washio_admin_all" on public.locations
  for all using (public.is_washio_admin()) with check (public.is_washio_admin());

drop policy if exists "washio_admin_all" on public.bookings;
create policy "washio_admin_all" on public.bookings
  for all using (public.is_washio_admin()) with check (public.is_washio_admin());

drop policy if exists "washio_admin_all" on public.services;
create policy "washio_admin_all" on public.services
  for all using (public.is_washio_admin()) with check (public.is_washio_admin());

drop policy if exists "washio_admin_all" on public.location_hours;
create policy "washio_admin_all" on public.location_hours
  for all using (public.is_washio_admin()) with check (public.is_washio_admin());

drop policy if exists "washio_admin_all" on public.location_hours_exceptions;
create policy "washio_admin_all" on public.location_hours_exceptions
  for all using (public.is_washio_admin()) with check (public.is_washio_admin());

drop policy if exists "washio_admin_all" on public.staff;
create policy "washio_admin_all" on public.staff
  for all using (public.is_washio_admin()) with check (public.is_washio_admin());

drop policy if exists "washio_admin_all" on public.reviews;
create policy "washio_admin_all" on public.reviews
  for all using (public.is_washio_admin()) with check (public.is_washio_admin());

drop policy if exists "washio_admin_all" on public.location_addons;
create policy "washio_admin_all" on public.location_addons
  for all using (public.is_washio_admin()) with check (public.is_washio_admin());

-- Έλεγχος: συνδεδεμένος ως admin, πρέπει να γυρίσει true.
-- select public.is_washio_admin();
