-- Εσωτερικοί λογαριασμοί (ομάδα / δοκιμές) → app_metadata.internal = true.
-- Εξαιρούνται από Pixel/CAPI/GA4 (κώδικας: lib/internal.ts) και από τις αναφορές
-- (φίλτρο: coalesce(raw_app_meta_data->>'internal','') <> 'true').
-- Νέο μέλος ομάδας: πρόσθεσε το email εδώ ΚΑΙ στο INTERNAL_EMAILS του lib/internal.ts.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"internal": true}'::jsonb
where lower(email) in (
  'withinsuccess@gmail.com',
  'prokopis71@gmail.com',
  'giwrgos2070@gmail.com',
  'alexandr.sph@gmail.com',
  'sk5vhy6dhz@privaterelay.appleid.com',
  'g7cbwtydrr@privaterelay.appleid.com'
) or email ilike '%+test%';

-- Έλεγχος:
select email, created_at from auth.users where raw_app_meta_data->>'internal' = 'true' order by created_at;
