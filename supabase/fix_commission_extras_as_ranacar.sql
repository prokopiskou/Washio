-- Διόρθωση προμήθειας στα AS Wash & Detailing και RANACAR WASH (συμφωνία «χωρίς προμήθεια με κουπόνι 3€»).
-- ΣΩΣΤΟΣ κανόνας: το μηδέν ισχύει ΜΟΝΟ στο πλύσιμο. Κάθε extra (πρόσθετο προϊόν/υπηρεσία) έχει
-- κανονική προμήθεια = τιμή extras × commission_rate.
-- Μέχρι 22/10/2026 γραφόταν platform_fee = 0 σε ΟΛΗ την κράτηση → χαμένη προμήθεια στα extras.
--
-- Επηρεάζονται (έλεγχος 22/10/2026) — όλες AS Wash, πληρωμή στο πλυντήριο, προμήθεια 5%:
--   WS-715CEE5D  9/10 12:00  πλύσιμο 18€ + extras 8€  (Αρωματικό 3 + Κέρωμα 5)                 0,00 → 0,40€
--   WS-3655B6F3 10/10 10:30  πλύσιμο 20€ + extras 38€ (Αρωματικό 3 + Κέρωμα 5 + Υαλοκ/ρες 30)  0,00 → 1,90€
--   WS-67F229F1 19/10 12:00  πλύσιμο 20€ + extras 5€  (Κέρωμα 5)                                0,00 → 0,25€
--   Σύνολο: +2,55€ προμήθεια (Οκτώβριος — δεν έχει γίνει ακόμα διακανονισμός/payout).
-- RANACAR: καμία κράτηση με κουπόνι + extras → τίποτα προς διόρθωση.
-- Ασφαλές να ξανατρέξει (ενημερώνει μόνο όπου η τιμή διαφέρει).

with x as (
  select b.id,
         round(coalesce((select sum((a->>'price')::numeric)
                         from jsonb_array_elements(case when jsonb_typeof(b.addons::jsonb) = 'array' then b.addons::jsonb else '[]'::jsonb end) a), 0)
               * l.commission_rate / 100, 2) as fee
  from public.bookings b join public.locations l on l.id = b.location_id
  where b.location_id in ('458dfa16-47c1-471a-ad7a-acdf08d11cce', '019bcedf-9092-484a-971a-8b8a68232cd9')
    and b.source is distinct from 'manual'
    and abs(coalesce(b.coupon_amount, 0) - 3) < 0.005
)
update public.bookings b set platform_fee = x.fee
from x
where b.id = x.id and x.fee > 0 and coalesce(b.platform_fee, 0) <> x.fee;

-- Έλεγχος:
select b.booking_ref, b.slot_date, b.total_amount, b.service_price, b.coupon_amount, b.platform_fee
from public.bookings b
where b.booking_ref in ('WS-715CEE5D', 'WS-3655B6F3', 'WS-67F229F1')
order by b.slot_date;
