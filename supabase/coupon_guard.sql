-- «Ένα −3€ πρώτου πλυσίματος ανά άνθρωπο» (lib/coupon-guard) + εβδομαδιαίο report ύποπτων.
-- Νέες στήλες στις κρατήσεις: συσκευή (cookie ws_dev), IP, αποτύπωμα κάρτας (Stripe).
-- Ασφαλές να τρέξει ξανά. Τίποτα δεν σβήνεται.

alter table public.bookings add column if not exists device_id text;
alter table public.bookings add column if not exists client_ip text;
alter table public.bookings add column if not exists card_fingerprint text;

create index if not exists bookings_device_id_idx on public.bookings (device_id) where device_id is not null;
create index if not exists bookings_card_fp_idx on public.bookings (card_fingerprint) where card_fingerprint is not null;

-- Έλεγχος: πρέπει να δείξει 3 γραμμές.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'bookings'
  and column_name in ('device_id', 'client_ip', 'card_fingerprint');
