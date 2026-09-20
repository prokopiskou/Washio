-- ============================================================
-- Washio — ΚΕΝΤΡΙΚΟΣ κατάλογος βασικών υπηρεσιών (admin-managed).
-- Η πηγή αλήθειας για το ΤΙ υπηρεσίες υπάρχουν στην πλατφόρμα.
-- Ο admin προσθέτει/επεξεργάζεται από το Admin Dashboard → Υπηρεσίες.
-- Τα πλυντήρια βλέπουν τον κατάλογο και ενεργοποιούν όσες προσφέρουν.
-- Τρέξε στο Supabase → SQL Editor. Idempotent.
-- ============================================================

create table if not exists public.service_catalog (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,
  duration_minutes  int not null default 30,
  vehicles          text[] not null default array['ΙΧ','SUV'],
  sort_order        int not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

alter table public.service_catalog
  drop constraint if exists service_catalog_duration_valid;
alter table public.service_catalog
  add constraint service_catalog_duration_valid
  check (duration_minutes in (30, 60, 90, 120));

-- RLS: όλοι διαβάζουν (τα dashboards των πλυντηρίων χρειάζονται τον κατάλογο).
-- Γράφει ΜΟΝΟ το service role (API route με έλεγχο admin).
alter table public.service_catalog enable row level security;

drop policy if exists "catalog_public_read" on public.service_catalog;
create policy "catalog_public_read" on public.service_catalog
  for select using (true);

-- Μετονομασία «Πλύσιμο» → «Πλύσιμο Μοτο» ΠΑΝΤΟΥ (idempotent).
update public.service_catalog set name = 'Πλύσιμο Μοτο' where name = 'Πλύσιμο';
update public.services set name = 'Πλύσιμο Μοτο' where name = 'Πλύσιμο';

-- Seed: οι 5 αρχικές βασικές υπηρεσίες (δεν ξαναγράφονται αν υπάρχουν).
insert into public.service_catalog (name, duration_minutes, vehicles, sort_order) values
  ('Μέσα',                  30, array['ΙΧ','SUV'],        1),
  ('Έξω',                   30, array['ΙΧ','SUV'],        2),
  ('Μέσα & Έξω',            30, array['ΙΧ','SUV'],        3),
  ('Πλύσιμο Μοτο',          30, array['Μοτοσικλέτα'],     4),
  ('Βιολογικός καθαρισμός', 90, array['ΙΧ','SUV'],        5)
on conflict (name) do nothing;

-- Έλεγχος:
-- select name, duration_minutes, vehicles, sort_order, is_active from public.service_catalog order by sort_order;
