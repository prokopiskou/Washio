-- Washio — «Σκάνερ καταστήματος»: link ανά πλυντήριο για check-in χωρίς login (υπάλληλοι).
-- Τρέξε στο Supabase → SQL Editor. Idempotent.
alter table public.locations add column if not exists scan_token text;
create unique index if not exists locations_scan_token_uidx on public.locations (scan_token) where scan_token is not null;
