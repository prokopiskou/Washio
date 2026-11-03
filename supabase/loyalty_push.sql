-- 1) Push «+1 σταγόνα»: μία φορά ανά κράτηση
alter table public.bookings add column if not exists drop_notified_at timestamptz;
-- (αν δεν έχει τρέξει ποτέ το loyalty.sql)
alter table public.bookings add column if not exists loyalty_discount numeric not null default 0;

-- 2) Κινητό πλυντηρίου: από onboarding / αίτηση (με το email του ιδιοκτήτη), αλλιώς με το όνομα.
create or replace function public.location_phone_guess(p_owner uuid, p_name text) returns text
language sql stable security definer set search_path = public, auth as $$
  select coalesce(
    (select o.phone from partner_onboarding o join auth.users u on lower(u.email) = lower(o.email)
      where u.id = p_owner and coalesce(trim(o.phone), '') <> '' order by o.created_at desc limit 1),
    (select a.phone from applications a join auth.users u on lower(u.email) = lower(a.email)
      where u.id = p_owner and coalesce(trim(a.phone), '') <> '' order by a.created_at desc limit 1),
    (select o.phone from partner_onboarding o
      where lower(trim(o.business_name)) = lower(trim(p_name)) and coalesce(trim(o.phone), '') <> '' order by o.created_at desc limit 1)
  )
$$;

-- Backfill: μόνο όσα δεν έχουν κινητό
update public.locations l set phone = public.location_phone_guess(l.owner_id, l.name)
where coalesce(trim(l.phone), '') = '' and public.location_phone_guess(l.owner_id, l.name) is not null;

-- Αυτόματα για νέα πλυντήρια / αλλαγή ιδιοκτήτη
create or replace function public.locations_fill_phone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(new.phone), '') = '' then
    new.phone := public.location_phone_guess(new.owner_id, new.name);
  end if;
  return new;
end $$;

drop trigger if exists trg_locations_fill_phone on public.locations;
create trigger trg_locations_fill_phone
  before insert or update of owner_id, name on public.locations
  for each row execute function public.locations_fill_phone();

-- Έλεγχος
select name, phone from public.locations order by name;
