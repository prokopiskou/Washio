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

-- ── Τιμή: φεύγουν οι ακριβότερες επιλογές; (από 21/10: service_select / book_click έχουν price/disc) ──
-- Ανά επίπεδο τιμής που διάλεξαν: πόσες συνεδρίες διάλεξαν υπηρεσία → πόσες πάτησαν «Κλείσε» → πόσες έκλεισαν.
-- with f as (
--   select e.* from funnel_events e left join auth.users u on u.id=e.user_id
--   where e.created_at > now() - interval '7 days' and coalesce(u.raw_app_meta_data->>'internal','') <> 'true'
-- ), sel as (
--   select distinct on (session_id) session_id, (meta->>'price')::numeric price, (meta->>'disc')::numeric disc, meta->>'svc' svc
--   from f where step='service_select' and meta ? 'price' order by session_id, created_at
-- )
-- select case when price < 12 then 'α <12€' when price < 15 then 'β 12–14€' when price < 18 then 'γ 15–17€' else 'δ 18€+' end band,
--        count(*) chose, count(*) filter (where exists (select 1 from f where f.session_id=sel.session_id and step='book_click')) book_click,
--        count(*) filter (where exists (select 1 from f where f.session_id=sel.session_id and step='booked')) booked,
--        round(avg(disc),2) avg_disc
-- from sel group by 1 order by 1;

-- ── Ακυρώσεις vs αλλαγή ώρας (από 23/10) ──
-- opened = άνοιξαν την ακύρωση · saved_click = πάτησαν «Αλλαγή ώρας» μέσα στην ακύρωση
-- saved = έκαναν τελικά αλλαγή ώρας από εκεί · cancelled = ακύρωσαν (ανά λόγο: meta->>'r')
-- select count(*) filter (where step='cancel_open') opened,
--        count(*) filter (where step='cancel_save_click') saved_click,
--        count(*) filter (where step='rescheduled' and meta->>'from'='cancel') saved,
--        count(*) filter (where step='rescheduled' and meta->>'from'='direct') resched_direct,
--        count(*) filter (where step='cancelled') cancelled
-- from funnel_events where created_at > now() - interval '7 days';
-- Λόγοι ακύρωσης:
-- select meta->>'r' reason, count(*) from funnel_events
-- where step='cancelled' and created_at > now() - interval '30 days' group by 1 order by 2 desc;
