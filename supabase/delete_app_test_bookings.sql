-- ============================================================
-- WASHIO — Διαγραφή ΟΛΩΝ των κρατήσεων από την εφαρμογή ΕΩΣ ΤΩΡΑ (ήταν δοκιμές).
--
-- ΣΒΗΝΕΙ:  κρατήσεις εφαρμογής (κάρτα + μετρητά) = source <> 'manual'
--          → φεύγουν από dashboard πλυντηρίων ΚΑΙ admin (έσοδα, πληρωμές, στατιστικά),
--          τις κριτικές τους, και ό,τι άλλο κρέμεται πάνω τους (βρίσκεται αυτόματα).
-- ΚΡΑΤΑΕΙ: τις ΧΕΙΡΟΚΙΝΗΤΕΣ κρατήσεις των πλυντηρίων (source = 'manual'),
--          χρήστες, κουπόνια −3€, παραπομπές, πλυντήρια, υπηρεσίες, ωράρια.
-- ΔΕΝ αγγίζει το Stripe (μόνο τη βάση).
--
-- Τρέξε το ΟΛΟ μαζί στο Supabase → SQL Editor (transaction: όλα ή τίποτα).
-- ============================================================

-- 0) ΠΡΙΝ: τι θα σβηστεί
select
  (select count(*) from public.bookings where coalesce(source, 'platform') <> 'manual') as app_bookings_to_delete,
  (select count(*) from public.bookings where source = 'manual')                         as manual_bookings_kept;

begin;

-- Οι κρατήσεις-στόχοι (σταθερή λίστα, ώστε μια νέα κράτηση εν τω μεταξύ να ΜΗΝ σβηστεί).
create temp table _del_bookings on commit drop as
  select id from public.bookings
  where coalesce(source, 'platform') <> 'manual' and created_at <= now();

-- 1) Γνωστές αναφορές χωρίς FK: αποσύνδεση (κρατάμε το ιστορικό κουπονιών/παραπομπών).
update public.credit_ledger set booking_id = null where booking_id in (select id from _del_bookings);
update public.referrals     set booking_id = null where booking_id in (select id from _del_bookings);

-- 2) Κριτικές των κρατήσεων
delete from public.reviews where booking_id in (select id from _del_bookings);

-- 3) ΟΠΟΙΟΣ ΑΛΛΟΣ πίνακας έχει foreign key προς bookings: nullable → null, αλλιώς διαγραφή γραμμών.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, a.attname as col, a.attnotnull as notnull
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'public.bookings'::regclass
      and c.conrelid <> 'public.bookings'::regclass
  loop
    if r.notnull then
      execute format('delete from %s where %I in (select id from _del_bookings)', r.tbl, r.col);
    else
      execute format('update %s set %I = null where %I in (select id from _del_bookings)', r.tbl, r.col, r.col);
    end if;
    raise notice 'Καθαρίστηκε: %.%', r.tbl, r.col;
  end loop;
end $$;

-- 4) Οι κρατήσεις της εφαρμογής — ΟΧΙ οι χειροκίνητες
delete from public.bookings where id in (select id from _del_bookings);

commit;

-- 5) ΜΕΤΑ: έλεγχος
select
  (select count(*) from public.bookings where coalesce(source, 'platform') <> 'manual') as app_bookings_left, -- πρέπει 0
  (select count(*) from public.bookings where source = 'manual')                         as manual_bookings_kept;
