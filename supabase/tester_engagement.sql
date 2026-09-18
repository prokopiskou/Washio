-- ============================================================
-- Washio — Tester engagement tracking (τρέξε στο Supabase → SQL Editor)
-- Σκοπός: να δεις αν οι testers ΧΡΗΣΙΜΟΠΟΙΟΥΝ πραγματικά το app
-- (αυτό που κοιτάει η Google για production access).
-- ============================================================

-- ------------------------------------------------------------
-- QUERY A — Ανά tester: πότε μπήκε, πόσα sessions, πόσες
-- ενεργές μέρες, πόσες κρατήσεις. (τελευταίες 14 μέρες)
-- ------------------------------------------------------------
select
  u.email,
  u.created_at::date                                as joined,
  u.last_sign_in_at,
  count(distinct s.id)                              as sessions_14d,
  count(distinct s.created_at::date)                as active_days_14d,
  count(distinct b.id)                              as bookings_14d
from auth.users u
left join auth.sessions s
       on s.user_id = u.id
      and s.created_at > now() - interval '14 days'
left join bookings b
       on b.user_id = u.id
      and b.created_at > now() - interval '14 days'
group by u.id, u.email, u.created_at, u.last_sign_in_at
order by active_days_14d desc, sessions_14d desc;

-- Πώς το διαβάζεις:
--  active_days_14d = σε πόσες ΔΙΑΦΟΡΕΤΙΚΕΣ μέρες ήταν ενεργός ο tester.
--  Θέλεις οι περισσότεροι testers να έχουν active_days ΠΟΛΛΑΠΛΕΣ μέρες,
--  όχι 1. Ένας tester με active_days_14d = 1 είναι "φάντασμα".

-- ------------------------------------------------------------
-- QUERY B — Ανά ΜΕΡΑ: πόσοι ΔΙΑΦΟΡΕΤΙΚΟΙ testers ήταν ενεργοί.
-- Αυτό αποδεικνύει "≥12 ενεργοί για 14 συνεχόμενες μέρες".
-- ------------------------------------------------------------
select
  day,
  count(distinct user_id) as active_testers
from (
  select created_at::date as day, user_id
  from auth.sessions
  where created_at > now() - interval '20 days'
  union
  select created_at::date as day, user_id
  from bookings
  where created_at > now() - interval '20 days'
) activity
group by day
order by day;

-- Πώς το διαβάζεις:
--  Θέλεις ΚΑΘΕ μέρα (14 συνεχόμενες) να έχει active_testers >= 12.
--  Αν κάποια μέρα πέφτει κάτω από 12 → εκεί "σπάει" το streak.

-- ------------------------------------------------------------
-- QUERY C — Σύνοψη: πόσοι testers, πόσοι πραγματικά ενεργοί
-- ------------------------------------------------------------
select
  count(*)                                                          as total_users,
  count(*) filter (where last_sign_in_at > now() - interval '14 days') as signed_in_14d,
  count(*) filter (where last_sign_in_at > now() - interval '2 days')  as signed_in_48h
from auth.users;
