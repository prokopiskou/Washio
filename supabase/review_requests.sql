-- Κριτικές ανά πλυντήριο (push → email → SMS + κάρτα στην αρχική).
-- Τρέξε ΜΙΑ φορά στο Supabase SQL editor.

-- Πότε / από πού ζητήθηκε κριτική για την κράτηση (μία φορά ανά κράτηση).
alter table public.bookings add column if not exists review_requested_at timestamptz;
alter table public.bookings add column if not exists review_channel text;

-- Μία κριτική ανά κράτηση (κόβει διπλά πατήματα / διπλά links).
create unique index if not exists reviews_booking_unique on public.reviews (booking_id) where booking_id is not null;
create index if not exists reviews_user_location_idx on public.reviews (user_id, location_id);

-- Παλιές κρατήσεις: να ΜΗΝ πάρουν μαζικά αίτημα κριτικής την πρώτη φορά που θα τρέξει.
update public.bookings set review_requested_at = now(), review_channel = 'backfill'
where review_requested_at is null and slot_date < current_date - 1;
