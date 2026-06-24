-- Slot uniqueness — πλήρης ατομικότητα ενάντια σε double-booking.
-- Εφάρμοσέ το στο Supabase (SQL editor) ΑΦΟΥ βεβαιωθείς ότι δεν υπάρχουν ήδη
-- διπλές ενεργές κρατήσεις στο ίδιο slot (δες το SELECT έλεγχο πιο κάτω).
--
-- Επιτρέπει ΜΙΑ ενεργή κράτηση ανά (πρατήριο, ημερομηνία, ώρα).
-- Οι ακυρωμένες (status = 'cancelled') εξαιρούνται, ώστε να ξανακλείνει το slot.

-- 1) Έλεγχος για υπάρχοντα διπλότυπα ΠΡΙΝ το index (πρέπει να γυρίσει 0 rows):
-- SELECT location_id, slot_date, slot_start_time, count(*)
-- FROM bookings
-- WHERE status <> 'cancelled'
-- GROUP BY location_id, slot_date, slot_start_time
-- HAVING count(*) > 1;

-- 2) Partial unique index:
CREATE UNIQUE INDEX IF NOT EXISTS bookings_unique_active_slot
ON bookings (location_id, slot_date, slot_start_time)
WHERE status <> 'cancelled';
