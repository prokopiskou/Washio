-- Σύντομη σημείωση ανά πρόσθετο και πλυντήριο (π.χ. «με κρυσταλλοποίηση»), έως 40 χαρακτήρες.
alter table public.location_addons add column if not exists note text;
alter table public.location_addons drop constraint if exists location_addons_note_len;
alter table public.location_addons add constraint location_addons_note_len check (note is null or char_length(note) <= 40);
