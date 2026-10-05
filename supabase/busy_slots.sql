-- ΗΔΗ ΕΚΤΕΛΕΣΜΕΝΟ (5/10/2026). Πιασμένες ώρες για διαθεσιμότητα (χάρτης/σελίδα πλυντηρίου),
-- χωρίς προσωπικά στοιχεία. Χρειάζεται γιατί το RLS των bookings δείχνει στον πελάτη/επισκέπτη
-- μόνο τις δικές του κρατήσεις → ο χάρτης έβλεπε πιασμένες ώρες ως ελεύθερες.
set lock_timeout = '3s';
create or replace function public.busy_slots(p_from date, p_to date, p_location uuid default null)
returns table(location_id uuid, slot_date date, slot_start_time time, duration_minutes int)
language sql stable security definer set search_path = public as $$
  select b.location_id, b.slot_date, b.slot_start_time, b.duration_minutes
  from bookings b
  where b.slot_date between p_from and least(p_to, p_from + 31)
    and (p_location is null or b.location_id = p_location)
    and b.status not in ('cancelled','no_show');
$$;
revoke all on function public.busy_slots(date, date, uuid) from public;
grant execute on function public.busy_slots(date, date, uuid) to anon, authenticated;
