-- Κλείδωμα δημόσιων δεδομένων (12/11/2026).
-- Πριν: ανώνυμος με το public key διάβαζε IBAN/ΑΦΜ/προμήθειες/scan_token πλυντηρίων,
-- emails πελατών (bookings_with_email) και αιτήσεις onboarding.

-- 1) Views που παρακάμπτουν το RLS → μόνο service role (server).
revoke all on public.bookings_with_email from anon, authenticated;
revoke all on public.partner_onboarding_safe from anon, authenticated;
revoke all on public.locations_checklist from anon, authenticated;

-- 2) locations: ευαίσθητες στήλες όχι στον browser (ούτε για συνδεδεμένους).
revoke select on public.locations from anon, authenticated;
grant select (id, partner_id, name, slug, address, city, postal_code, lat, lng, phone, description, cover_image_url,
  is_active, subscription_tier, created_at, updated_at, owner_id, photos, waitlist_notified_at, capacity,
  extra_instructions, google_maps_url, morning_push_date) on public.locations to anon, authenticated;
