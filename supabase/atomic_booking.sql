-- ============================================================
-- Washio — ΑΤΟΜΙΚΗ δημιουργία κράτησης (τέλος στο double booking).
--
-- Πρόβλημα: check-then-insert από τον server (create-cash, webhook) χωρίς
-- κλειδαριά και χωρίς constraint (το bookings_unique_active_slot έπεσε
-- σωστά για capacity>1). Δύο ταυτόχρονα αιτήματα περνούσαν και τα δύο.
--
-- Λύση: μία function που, ΜΕΣΑ ΣΤΗΝ ΙΔΙΑ ΣΥΝΑΛΛΑΓΗ:
--   1) παίρνει advisory lock ανά (location, ημέρα) → σειριοποίηση,
--   2) μετράει πληρότητα ανά 30' βήμα για όλη τη διάρκεια (ίδια λογική
--      με το canBookSlot στο lib/availability.ts),
--   3) κάνει το INSERT μόνο αν χωράει. Αλλιώς raise 'SLOT_FULL'.
--
-- Ο έλεγχος ωραρίου/εξαιρέσεων/lead-time παραμένει στον server (JS) —
-- δεν έχει race. Εδώ κλειδώνουμε ΜΟΝΟ το κομμάτι που έχει race: capacity.
--
-- Idempotent. Τρέξε το στο Supabase → SQL Editor.
-- ============================================================

create or replace function public.book_slot_atomic(p jsonb)
returns uuid
language plpgsql
as $$
declare
  v_loc   uuid := (p->>'location_id')::uuid;
  v_date  date := (p->>'slot_date')::date;
  v_start time := (p->>'slot_start_time')::time;
  v_dur   int  := greatest(30, coalesce((p->>'duration_minutes')::int, 30));
  v_end   time := v_start + make_interval(mins => v_dur);
  v_cap   int;
  v_step  time;
  v_busy  int;
  v_cols  text;
  v_id    uuid;
begin
  -- 1) Σειριοποίηση: μόνο μία κράτηση τη φορά ανά (πλυντήριο, μέρα).
  perform pg_advisory_xact_lock(hashtext(v_loc::text || '|' || v_date::text)::bigint);

  -- Capacity (μάνικες).
  select greatest(1, coalesce(capacity, 1)) into v_cap
    from public.locations where id = v_loc;
  if v_cap is null then
    raise exception 'LOCATION_NOT_FOUND';
  end if;

  -- 2) Για κάθε 30' βήμα της νέας κράτησης: πόσες ενεργές την καλύπτουν;
  v_step := v_start;
  while v_step < v_end loop
    select count(*) into v_busy
      from public.bookings b
     where b.location_id = v_loc
       and b.slot_date::date = v_date
       and b.status not in ('cancelled', 'no_show')
       and b.slot_start_time::time <= v_step
       and (b.slot_start_time::time + make_interval(mins => greatest(30, coalesce(b.duration_minutes, 30)))) > v_step;
    if v_busy >= v_cap then
      raise exception 'SLOT_FULL';
    end if;
    v_step := v_step + interval '30 minutes';
  end loop;

  -- 3) INSERT μόνο με τα πεδία που δόθηκαν (τα υπόλοιπα παίρνουν defaults).
  select string_agg(quote_ident(k), ', ') into v_cols
    from jsonb_object_keys(p) as k;

  execute format(
    'insert into public.bookings (%s) select %s from jsonb_populate_record(null::public.bookings, $1) returning id',
    v_cols, v_cols
  ) into v_id using p;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- ΑΤΟΜΙΚΗ μεταφορά κράτησης (reschedule): ίδια κλειδαριά + ίδιος έλεγχος
-- πληρότητας στη ΝΕΑ μέρα/ώρα, εξαιρώντας την ίδια την κράτηση.
-- ------------------------------------------------------------
create or replace function public.move_booking_atomic(p_booking_id uuid, p_slot_date date, p_slot_start time)
returns void
language plpgsql
as $$
declare
  v_loc  uuid;
  v_dur  int;
  v_cap  int;
  v_end  time := p_slot_start + interval '0';
  v_step time;
  v_busy int;
begin
  select location_id, greatest(30, coalesce(duration_minutes, 30)) into v_loc, v_dur
    from public.bookings where id = p_booking_id and status in ('confirmed', 'pending');
  if v_loc is null then
    raise exception 'BOOKING_NOT_ACTIVE';
  end if;
  v_end := p_slot_start + make_interval(mins => v_dur);

  perform pg_advisory_xact_lock(hashtext(v_loc::text || '|' || p_slot_date::text)::bigint);

  select greatest(1, coalesce(capacity, 1)) into v_cap from public.locations where id = v_loc;

  v_step := p_slot_start;
  while v_step < v_end loop
    select count(*) into v_busy
      from public.bookings b
     where b.location_id = v_loc
       and b.slot_date::date = p_slot_date
       and b.id <> p_booking_id
       and b.status not in ('cancelled', 'no_show')
       and b.slot_start_time::time <= v_step
       and (b.slot_start_time::time + make_interval(mins => greatest(30, coalesce(b.duration_minutes, 30)))) > v_step;
    if v_busy >= v_cap then
      raise exception 'SLOT_FULL';
    end if;
    v_step := v_step + interval '30 minutes';
  end loop;

  update public.bookings
     set slot_date = p_slot_date, slot_start_time = p_slot_start, reminder_sent = false
   where id = p_booking_id;
end;
$$;

-- Idempotency για το Stripe webhook: ένα booking ανά payment_intent, ΑΤΟΜΙΚΑ.
-- (Το read-then-insert στο webhook μπορούσε να διπλογράψει σε ταυτόχρονα redeliveries.)
create unique index if not exists bookings_stripe_pi_unique
  on public.bookings (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- Έλεγχος (προαιρετικά): select public.book_slot_atomic('{"location_id":"...","slot_date":"2026-09-22","slot_start_time":"10:00", ...}'::jsonb);
