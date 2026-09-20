-- ============================================================
-- Washio — Καθάρισμα διπλών υπηρεσιών (π.χ. 19x «Βιολογικός
-- καθαρισμός» στο Aqua Shine) + ΚΛΕΙΔΩΜΑ ώστε να μην ξαναγίνει.
-- Τρέξε στο Supabase → SQL Editor. Idempotent.
-- ============================================================

-- 1) Δες πρώτα τα διπλά (προαιρετικό):
-- select location_id, name, count(*) from public.services
-- group by 1, 2 having count(*) > 1;

-- 2) Σβήσε τα διπλά. Κρατάμε ΕΝΑ ανά (location, name):
--    προτεραιότητα σε όποιο έχει κρατήσεις, μετά σε ενεργό.
--    Όσα έχουν κρατήσεις ΔΕΝ σβήνονται ποτέ (extra προστασία).
with ranked as (
  select
    s.id,
    row_number() over (
      partition by s.location_id, s.name
      order by
        (exists (select 1 from public.bookings b where b.service_id = s.id)) desc,
        s.is_active desc,
        s.id
    ) as rn
  from public.services s
)
delete from public.services s
where s.id in (select id from ranked where rn > 1)
  and not exists (select 1 from public.bookings b where b.service_id = s.id);

-- 3) ΚΛΕΙΔΩΜΑ: μία υπηρεσία ανά όνομα ανά πλυντήριο — ΤΕΛΟΣ τα διπλά,
--    ακόμα και με διπλά πατήματα/races.
create unique index if not exists services_location_name_unique
  on public.services (location_id, name);

-- 4) Έλεγχος — πρέπει να γυρίσει 0 γραμμές:
-- select location_id, name, count(*) from public.services
-- group by 1, 2 having count(*) > 1;
