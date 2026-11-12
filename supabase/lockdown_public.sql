-- Κλείδωμα δημόσιων δεδομένων (12/11/2026).
-- Πριν: ανώνυμος με το public key διάβαζε IBAN/ΑΦΜ/προμήθειες/scan_token πλυντηρίων,
-- emails πελατών (bookings_with_email) και αιτήσεις onboarding.

-- 1) Views που παρακάμπτουν το RLS → μόνο service role (server).
revoke all on public.bookings_with_email from anon, authenticated;
revoke all on public.partner_onboarding_safe from anon, authenticated;
revoke all on public.locations_checklist from anon, authenticated;

-- 2) locations: ευαίσθητες στήλες όχι στον browser (ούτε για συνδεδεμένους).
revoke select on public.locations from anon, authenticated;
-- ΧΩΡΙΣ phone (κινητό ιδιοκτήτη), partner_id, subscription_tier, commission_rate, iban, afm, scan_token κ.λπ.
grant select (id, name, slug, address, city, postal_code, lat, lng, description, cover_image_url,
  is_active, created_at, updated_at, owner_id, photos, capacity, extra_instructions, google_maps_url) on public.locations to anon, authenticated;

-- 3) Καταγραφή μπλοκ scraping (lib/scrape-guard.ts) — μόνο server.
create table if not exists public.security_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  ip text not null,
  path text,
  reason text,
  user_agent text,
  blocked_until timestamptz
);
create index if not exists security_events_ip_idx on public.security_events (ip, blocked_until desc);
alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
