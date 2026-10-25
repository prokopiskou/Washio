-- Link Google Maps ανά πλυντήριο (admin → επεξεργασία σημείου). Το SMS υπενθύμισης
-- (washio.gr/m/<κωδικός>) ανοίγει αυτό· αν λείπει → οδηγίες προς τις συντεταγμένες.
alter table public.locations add column if not exists google_maps_url text;
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'locations' and column_name = 'google_maps_url';
