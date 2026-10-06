-- Περιοχή (δήμος/γειτονιά) αντί για «Αθήνα» / «Νότιος Τομέας Αθηνών» σε κάθε πλυντήριο.
-- Βάση: ταχυδρομικός κώδικας (ΤΚ) της διεύθυνσης. Τρέξ' το στο Supabase SQL editor.
begin;
update public.locations set city = 'Ζωγράφου'    where id::text like '834c38a9%'; -- 19 CAR WASH        · ΤΚ 157 71
update public.locations set city = 'Βύρωνας'     where id::text like '019bcedf%'; -- AS Wash&Detailing  · ΤΚ 162 31
update public.locations set city = 'Άλιμος'      where id::text like 'b748fb42%'; -- CAR CARE           · ΤΚ 174 56
update public.locations set city = 'Ηλιούπολη'   where id::text like 'c86b7bce%'; -- PIT STOP           · ΤΚ 163 44
update public.locations set city = 'Άλιμος'      where id::text like '458dfa16%'; -- RANACAR WASH       · ΤΚ 174 56
update public.locations set city = 'Αργυρούπολη' where id::text like '4c2e5fe5%'; -- Wash plus Argyroupolis · ΤΚ 167 77 (Ελληνικό, όριο με Αργυρούπολη)
update public.locations set city = 'Ηλιούπολη'   where id::text like '78eaa266%'; -- WASH PLUS ILIOUPOLI · ΤΚ 163 46
update public.locations set city = 'Αργυρούπολη' where id::text like 'f4900b85%'; -- Wash Plus OE       · ΤΚ 164 51
update public.locations set city = 'Ζωγράφου'    where id::text like '6b38c318%'; -- ΤΣΙΤΣΗΣ ΑΝΤΡΕΑΣ   · ΤΚ 157 72
update public.locations set city = 'Άγιος Δημήτριος' where id::text like 'ef047cf7%'; -- CARDEN (ανενεργό) · ΤΚ 173 43
select name, city from public.locations where is_active order by name;
commit;
