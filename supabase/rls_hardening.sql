-- ============================================================
-- Washio — Προστασία «ευαίσθητων στηλών» που το RLS δεν μπορεί να περιορίσει.
--
-- Το RLS λέει ΠΟΙΕΣ γραμμές αλλάζει κάποιος, όχι ΠΟΙΕΣ στήλες. Σήμερα:
--   • profiles: ο χρήστης μπορεί να αλλάξει το δικό του role (→ admin).
--   • locations: ο owner μπορεί να αλλάξει commission_rate / owner_id / slug.
--   • bookings: ο owner μπορεί να αλλάξει total_amount / platform_fee / user_id...
--
-- Λύση: BEFORE UPDATE triggers που απορρίπτουν αλλαγές σε αυτές τις στήλες
-- εκτός αν το κάνει admin ή ο server (service role → auth.uid() είναι NULL).
-- Idempotent. Τρέξε το στο Supabase → SQL Editor.
-- ============================================================

-- Ποιος επιτρέπεται να αγγίξει «κλειδωμένες» στήλες: server (service role)
-- ή admin (η is_washio_admin() ελέγχει email από το JWT — όχι το profiles.role).
create or replace function public.is_privileged_writer()
returns boolean
language sql
stable
as $$
  select auth.uid() is null or public.is_washio_admin()
$$;

-- ── profiles: role, has_reviewed ─────────────────────────────
create or replace function public.guard_profiles_columns()
returns trigger
language plpgsql
as $$
begin
  if public.is_privileged_writer() then return new; end if;
  if new.role is distinct from old.role then
    raise exception 'FORBIDDEN_COLUMN: role';
  end if;
  if new.has_reviewed is distinct from old.has_reviewed then
    raise exception 'FORBIDDEN_COLUMN: has_reviewed';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_profiles_columns on public.profiles;
create trigger trg_guard_profiles_columns
  before update on public.profiles
  for each row execute function public.guard_profiles_columns();

-- ── locations: commission_rate, owner_id, slug ────────────────
create or replace function public.guard_locations_columns()
returns trigger
language plpgsql
as $$
begin
  if public.is_privileged_writer() then return new; end if;
  if new.commission_rate is distinct from old.commission_rate then
    raise exception 'FORBIDDEN_COLUMN: commission_rate';
  end if;
  if new.owner_id is distinct from old.owner_id then
    raise exception 'FORBIDDEN_COLUMN: owner_id';
  end if;
  if new.slug is distinct from old.slug then
    raise exception 'FORBIDDEN_COLUMN: slug';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_locations_columns on public.locations;
create trigger trg_guard_locations_columns
  before update on public.locations
  for each row execute function public.guard_locations_columns();

-- ── bookings: χρήματα / ταυτότητα / slot ─────────────────────
-- Ο owner μπορεί να αλλάξει μόνο λειτουργικά πεδία (π.χ. status για no-show,
-- σημειώσεις πελάτη). Όλα τα άλλα αλλάζουν ΜΟΝΟ από τον server.
create or replace function public.guard_bookings_columns()
returns trigger
language plpgsql
as $$
begin
  if public.is_privileged_writer() then return new; end if;
  if new.total_amount is distinct from old.total_amount
     or new.platform_fee is distinct from old.platform_fee
     or new.refund_amount is distinct from old.refund_amount
     or new.user_id is distinct from old.user_id
     or new.location_id is distinct from old.location_id
     or new.service_id is distinct from old.service_id
     or new.booking_ref is distinct from old.booking_ref
     or new.slot_date is distinct from old.slot_date
     or new.slot_start_time is distinct from old.slot_start_time
     or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
     or new.stripe_payment_status is distinct from old.stripe_payment_status
  then
    raise exception 'FORBIDDEN_COLUMN: bookings money/identity/slot';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_bookings_columns on public.bookings;
create trigger trg_guard_bookings_columns
  before update on public.bookings
  for each row execute function public.guard_bookings_columns();

-- Έλεγχος: ως απλός χρήστης, `update profiles set role='admin' where id=auth.uid()`
-- πρέπει να αποτύχει με FORBIDDEN_COLUMN.
