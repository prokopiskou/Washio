-- ============================================================
-- DATA FIXES — για ΥΠΑΡΧΟΝΤΑ δεδομένα (τρέξ' τα στο Supabase → SQL Editor).
-- Κάθε ενότητα: SELECT πρώτα (δες τι υπάρχει) → μετά UPDATE.
-- ============================================================


-- ############################################################
-- 1) ΠΕΡΙΟΧΗ πλυντηρίων: «Νότιος Τομέας…» → δήμος (π.χ. «Άλιμος Αττικής»)
-- ############################################################
-- Ο κώδικας πλέον συμπληρώνει σωστά τα ΝΕΑ. Τα παλιά διορθώνονται εδώ.
-- ΔΕΝ γίνεται αυτόματα — δεν βγαίνει ο δήμος από το «Τομέας». Δες τα και
-- γράψε τον σωστό δήμο ανά πλυντήριο.

-- 1a) Δες ποια θέλουν διόρθωση (έχουν «Τομέα» ή γενικό «Αθήνα»):
select id, name, address, city, postal_code
from public.locations
where city ilike '%τομέα%' or city ilike '%τομέας%'
   or city ilike '%αθήνα%' or city ilike '%athens%'
order by name;

-- 1b) Διόρθωσε ΕΝΑ-ΕΝΑ (αντίγραψε το id από πάνω, γράψε τον σωστό δήμο):
-- update public.locations set city = 'Άλιμος Αττικής'     where id = '<paste-id>';
-- update public.locations set city = 'Ηλιούπολη Αττικής'  where id = '<paste-id>';
-- update public.locations set city = 'Γλυφάδα Αττικής'    where id = '<paste-id>';


-- ############################################################
-- 2) ΥΠΗΡΕΣΙΑ «Πλύσιμο» (σκέτο) → «Πλύσιμο ΜΟΤΟ»
-- ############################################################
-- 2a) Δες ποιες υπηρεσίες λέγονται σκέτο «Πλύσιμο» και σε ποιο πλυντήριο:
select s.id, s.name, s.price, s.location_id, l.name as location
from public.services s
join public.locations l on l.id = s.location_id
where trim(s.name) ilike 'πλύσιμο'
order by l.name;

-- 2b) Αν είναι ΟΛΕΣ μοτό → μετονόμασέ τες μαζικά:
-- update public.services set name = 'Πλύσιμο ΜΟΤΟ' where trim(name) ilike 'πλύσιμο';

-- 2c) …ή ΜΟΝΟ τη συγκεκριμένη (πιο ασφαλές — βάλε το id από το 2a):
-- update public.services set name = 'Πλύσιμο ΜΟΤΟ' where id = '<paste-service-id>';
