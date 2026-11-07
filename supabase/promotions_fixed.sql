-- Προωθήσεις: + «fixed» = σταθερή τελική τιμή (π.χ. βιολογικός «μόνο 120€» — το εύρος σβήνει).
alter table public.promotions drop constraint if exists promotions_discount_type_check;
alter table public.promotions add constraint promotions_discount_type_check check (discount_type in ('percent','amount','fixed'));
