-- Ονόματα χρηστών: Google/Facebook/Apple → profiles.full_name.
-- 1) Νέοι χρήστες: full_name || name || given+family
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(trim(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    concat_ws(' ', new.raw_user_meta_data->>'given_name', new.raw_user_meta_data->>'family_name')
  )), ''))
  on conflict (id) do nothing;
  return new;
end; $$;

-- 2) Όταν αλλάζει το metadata (π.χ. 2ο login Google/Apple, αλλαγή στο προφίλ) → συμπλήρωσε κενό όνομα.
create or replace function public.sync_profile_name() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  n := nullif(trim(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    concat_ws(' ', new.raw_user_meta_data->>'given_name', new.raw_user_meta_data->>'family_name')
  )), '');
  if n is not null then
    update public.profiles set full_name = n where id = new.id and coalesce(full_name, '') = '';
  end if;
  return new;
end; $$;

drop trigger if exists on_auth_user_meta_updated on auth.users;
create trigger on_auth_user_meta_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function public.sync_profile_name();

-- 3) Backfill: από metadata
update public.profiles p set full_name = nullif(trim(coalesce(
    u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name',
    concat_ws(' ', u.raw_user_meta_data->>'given_name', u.raw_user_meta_data->>'family_name'))), '')
from auth.users u
where u.id = p.id and coalesce(p.full_name, '') = ''
  and nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name',
      concat_ws(' ', u.raw_user_meta_data->>'given_name', u.raw_user_meta_data->>'family_name'))), '') is not null;

-- 4) Backfill: από το όνομα της τελευταίας κράτησης
update public.profiles p set full_name = b.customer_name
from (select distinct on (user_id) user_id, customer_name from public.bookings
      where user_id is not null and coalesce(trim(customer_name), '') <> ''
      order by user_id, created_at desc) b
where b.user_id = p.id and coalesce(p.full_name, '') = '';
