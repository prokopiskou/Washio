-- ============================================================
-- Washio — Μέλη πλυντηρίου (location_members)
--
-- Ένα πλυντήριο έχει ΕΝΑΝ κύριο λογαριασμό (locations.owner_id) = ο ΥΠΕΥΘΥΝΟΣ του καταστήματος:
-- αυτός παίρνει τις ειδοποιήσεις, σκανάρει, αλλάζει ωράριο/τιμές.
-- Εδώ μπαίνουν ΕΠΙΠΛΕΟΝ λογαριασμοί με πρόσβαση στο ίδιο πλυντήριο — κυρίως ο ΙΔΙΟΚΤΗΤΗΣ ΑΛΥΣΙΔΑΣ
-- (role 'group') που βλέπει όλα τα πλυντήριά του από ένα dashboard.
--
-- Οι policies είναι ΠΡΟΣΘΕΤΕΣ (permissive OR), όπως στο admin_support_access.sql — δεν αλλάζουν
-- τίποτα για τους υπάρχοντες λογαριασμούς. Idempotent.
-- ============================================================

create table if not exists public.location_members (
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'group',
  created_at  timestamptz not null default now(),
  primary key (location_id, user_id)
);
create index if not exists location_members_user_idx on public.location_members (user_id);
alter table public.location_members enable row level security;

-- Ο καθένας βλέπει ΜΟΝΟ τις δικές του γραμμές. Εγγραφές γίνονται μόνο από τον server (service role).
drop policy if exists "location_members_read_own" on public.location_members;
create policy "location_members_read_own" on public.location_members
  for select using (user_id = auth.uid());

-- security definer: διαβάζει τον πίνακα χωρίς να ξαναπερνά από RLS (αποφεύγει αναδρομή στις policies).
create or replace function public.is_location_member(loc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.location_members m where m.location_id = loc and m.user_id = auth.uid())
$$;
revoke all on function public.is_location_member(uuid) from public;
grant execute on function public.is_location_member(uuid) to authenticated;

-- Ίδια πρόσβαση με τον κύριο λογαριασμό στους πίνακες που χρησιμοποιεί το dashboard.
drop policy if exists "location_member_all" on public.locations;
create policy "location_member_all" on public.locations
  for all using (public.is_location_member(id)) with check (public.is_location_member(id));

drop policy if exists "location_member_select" on public.bookings;
create policy "location_member_select" on public.bookings
  for select using (public.is_location_member(location_id));
drop policy if exists "location_member_update" on public.bookings;
create policy "location_member_update" on public.bookings
  for update using (public.is_location_member(location_id)) with check (public.is_location_member(location_id));

drop policy if exists "location_member_all" on public.services;
create policy "location_member_all" on public.services
  for all using (public.is_location_member(location_id)) with check (public.is_location_member(location_id));

drop policy if exists "location_member_all" on public.location_hours;
create policy "location_member_all" on public.location_hours
  for all using (public.is_location_member(location_id)) with check (public.is_location_member(location_id));

drop policy if exists "location_member_all" on public.location_hours_exceptions;
create policy "location_member_all" on public.location_hours_exceptions
  for all using (public.is_location_member(location_id)) with check (public.is_location_member(location_id));

drop policy if exists "location_member_all" on public.staff;
create policy "location_member_all" on public.staff
  for all using (public.is_location_member(location_id)) with check (public.is_location_member(location_id));

drop policy if exists "location_member_select" on public.reviews;
create policy "location_member_select" on public.reviews
  for select using (public.is_location_member(location_id));

drop policy if exists "location_member_all" on public.location_addons;
create policy "location_member_all" on public.location_addons
  for all using (public.is_location_member(location_id)) with check (public.is_location_member(location_id));
