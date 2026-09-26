-- ============================================================
-- Υπηρεσίες ΕΥΡΟΥΣ (π.χ. Βιολογικός καθαρισμός)
--
-- Λογική: ο πλυντηριάς ορίζει εύρος (min–max) ανά όχημα. Ο πελάτης βλέπει το
-- εύρος, πληρώνει ΜΕΤΡΗΤΑ στο κατάστημα, η τελική τιμή λέγεται επιτόπου μετά την
-- εκτίμηση. Η προμήθεια της Washio είναι ΣΤΑΘΕΡΗ = rate × μέσος όρος εύρους.
--
-- Υλοποίηση προμήθειας: αποθηκεύουμε total_amount = μέσος όρος εύρους ώστε το
-- υπάρχον payout (commission = rate × total_amount σε ολοκληρωμένα μετρητά) να
-- βγάζει αυτόματα τη σταθερή προμήθεια. Η πραγματική τιμή (μετρητά) δεν μας αφορά.
-- ============================================================

-- Κεντρικός κατάλογος: ποιες υπηρεσίες είναι «εύρος».
alter table public.service_catalog
  add column if not exists is_range boolean not null default false;

update public.service_catalog
  set is_range = true
  where name = 'Βιολογικός καθαρισμός';

-- Υπηρεσίες ανά πλυντήριο: flag + όρια εύρους ανά όχημα (ΙΧ / SUV).
alter table public.services
  add column if not exists is_range   boolean not null default false,
  add column if not exists price_min      numeric,   -- ΙΧ min
  add column if not exists price_max      numeric,   -- ΙΧ max
  add column if not exists price_min_suv  numeric,   -- SUV min
  add column if not exists price_max_suv  numeric;   -- SUV max

-- Ήδη υπάρχοντες βιολογικοί των πλυντηρίων → σημάδεψέ τους ως range.
update public.services s
  set is_range = true
  from public.service_catalog c
  where s.name = c.name and c.is_range = true;
