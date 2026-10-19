-- Πού φεύγουν: μοναδικές συνεδρίες ανά βήμα (τελευταίες 3 μέρες). Χωρίς εσωτερικούς.
with e as (
  select f.* from funnel_events f left join auth.users u on u.id = f.user_id
  where f.created_at > now() - interval '3 days'
    and coalesce(u.raw_app_meta_data->>'internal','') <> 'true'
)
select step, count(distinct session_id) sessions, count(distinct coalesce(user_id::text, device_id)) people
from e group by step
order by array_position(array['map_open','washer_open','washer_page','no_slots','service_select','slot_select','book_click','login_wall','booking_page','pay_click','booked'], step);

-- Πλυντήρια που ανοίγουν αλλά δεν έχουν ώρες (no_slots) — ποια και πόσες φορές:
-- select l.name, count(*) from funnel_events f join locations l on l.id=f.location_id
-- where f.step='no_slots' and f.created_at > now() - interval '3 days' group by 1 order by 2 desc;
