-- Αντιγραφή υπηρεσιών, ωραρίου, extras και ρυθμίσεων από «Nikolaoy car wash»
-- στα «Nitro wash» και «Toxic car wash» (ίδιος ιδιοκτήτης: umarch1850@gmail.com).
-- Ασφαλές να ξανατρέξει: αντιγράφει ΜΟΝΟ σε όποιο προορισμό δεν έχει ήδη υπηρεσίες/ωράριο/extras.
-- ΔΕΝ ενεργοποιεί τα πλυντήρια (is_active μένει όπως είναι).
begin;

with src as (select 'a5526715-b8db-4034-97d5-524f073e3c0b'::uuid id),
dst as (select unnest(array['c3ccf745-76e3-4614-9613-ad7f16c043ec','24c5c7ea-0621-4cd6-8a65-b177d4d7f196']::uuid[]) id)

-- 1) Υπηρεσίες (τιμές, διάρκειες, σειρά, μοτο/SUV, εύρη)
insert into public.services (location_id, name, description, duration_minutes, price, is_active, sort_order,
  price_moto, price_suv, display_duration_minutes, is_range, price_min, price_max, price_min_suv, price_max_suv)
select d.id, s.name, s.description, s.duration_minutes, s.price, s.is_active, s.sort_order,
  s.price_moto, s.price_suv, s.display_duration_minutes, s.is_range, s.price_min, s.price_max, s.price_min_suv, s.price_max_suv
from dst d cross join public.services s
where s.location_id = (select id from src)
  and not exists (select 1 from public.services x where x.location_id = d.id);

-- 2) Ωράριο (7 μέρες, και διπλό ωράριο αν υπάρχει)
insert into public.location_hours (location_id, day_of_week, open_time, close_time, is_closed, open_time2, close_time2)
select d.id, h.day_of_week, h.open_time, h.close_time, h.is_closed, h.open_time2, h.close_time2
from (select unnest(array['c3ccf745-76e3-4614-9613-ad7f16c043ec','24c5c7ea-0621-4cd6-8a65-b177d4d7f196']::uuid[]) id) d
cross join public.location_hours h
where h.location_id = 'a5526715-b8db-4034-97d5-524f073e3c0b'
  and not exists (select 1 from public.location_hours x where x.location_id = d.id);

-- 3) Extras (πρόσθετα) με τις ίδιες τιμές
insert into public.location_addons (location_id, addon_id, price_override)
select d.id, a.addon_id, a.price_override
from (select unnest(array['c3ccf745-76e3-4614-9613-ad7f16c043ec','24c5c7ea-0621-4cd6-8a65-b177d4d7f196']::uuid[]) id) d
cross join public.location_addons a
where a.location_id = 'a5526715-b8db-4034-97d5-524f073e3c0b'
  and not exists (select 1 from public.location_addons x where x.location_id = d.id);

-- 4) Ρυθμίσεις + ιδιοκτήτης (ίδιος λογαριασμός → τα βλέπει στο dashboard με επιλογή)
update public.locations t
set capacity = s.capacity,
    commission_rate = s.commission_rate,
    subscription_tier = s.subscription_tier,
    owner_id = coalesce(t.owner_id, s.owner_id)
from public.locations s
where s.id = 'a5526715-b8db-4034-97d5-524f073e3c0b'
  and t.id in ('c3ccf745-76e3-4614-9613-ad7f16c043ec','24c5c7ea-0621-4cd6-8a65-b177d4d7f196');

commit;

-- Έλεγχος:
select l.name, (select count(*) from public.services s where s.location_id=l.id) services,
       (select count(*) from public.location_hours h where h.location_id=l.id) hours,
       (select count(*) from public.location_addons a where a.location_id=l.id) addons,
       l.capacity, l.is_active, (l.owner_id is not null) has_owner
from public.locations l
where l.id in ('a5526715-b8db-4034-97d5-524f073e3c0b','c3ccf745-76e3-4614-9613-ad7f16c043ec','24c5c7ea-0621-4cd6-8a65-b177d4d7f196');
