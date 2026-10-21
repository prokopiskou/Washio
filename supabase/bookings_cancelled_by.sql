-- Ποιος ακύρωσε την κράτηση: 'customer' (χρήστης) · 'partner' (συνεργάτης/πλυντήριο) · 'admin'.
-- Το γράφει ο server στο /api/bookings/cancel. Τρέξε μία φορά.
alter table public.bookings add column if not exists cancelled_by text;

-- Συμπλήρωση για τις παλιές ακυρώσεις (από το cancellation_reason):
--   'owner_cancelled' → συνεργάτης (dashboard πλυντηρίου — ή admin σε support mode, δεν ξεχωρίζει για τα παλιά)
--   'admin_refund'    → admin
--   οτιδήποτε άλλο    → πελάτης (στέλνει τον λόγο που διάλεξε, π.χ. «Άλλαξαν τα σχέδιά μου»)
update public.bookings
set cancelled_by = case
  when cancellation_reason = 'owner_cancelled' then 'partner'
  when cancellation_reason = 'admin_refund' then 'admin'
  else 'customer' end
where status = 'cancelled' and cancelled_by is null;

-- Έλεγχος:
select cancelled_by, count(*) from public.bookings where status = 'cancelled' group by 1;
