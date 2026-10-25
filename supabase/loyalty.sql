-- Washio Club «Μάζεψε σταγόνες»: 3 ολοκληρωμένα πλυσίματα στο ίδιο πλυντήριο → το επόμενο −3€. Η έκπτωση μπαίνει στο coupon_amount
-- (το πλυντήριο εισπράττει τιμή − έκπτωση, όπως με το κουπόνι) και σημειώνεται εδώ για αναφορές.
alter table public.bookings add column if not exists loyalty_discount numeric not null default 0;
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'bookings' and column_name = 'loyalty_discount';
