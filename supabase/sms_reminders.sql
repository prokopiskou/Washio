-- SMS υπενθύμιση πριν το ραντεβού (/api/cron/sms). Μία φορά ανά κράτηση.
-- Ασφαλές να τρέξει ξανά. Τίποτα δεν σβήνεται.
alter table public.bookings add column if not exists sms_reminder_sent boolean not null default false;

-- Οι παλιές/περασμένες κρατήσεις να μην πάρουν ποτέ SMS.
update public.bookings set sms_reminder_sent = true
where sms_reminder_sent = false and slot_date < current_date;

-- Έλεγχος: 1 γραμμή
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'bookings' and column_name = 'sms_reminder_sent';
