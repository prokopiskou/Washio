-- Μάρκα/μοντέλο οχήματος (ορίζει ΙΧ/SUV) + ταξί — στα αποθηκευμένα οχήματα και στις κρατήσεις.
alter table public.vehicles add column if not exists car_model text;
alter table public.vehicles add column if not exists is_taxi boolean not null default false;
alter table public.bookings add column if not exists car_model text;
alter table public.bookings add column if not exists is_taxi boolean not null default false;
