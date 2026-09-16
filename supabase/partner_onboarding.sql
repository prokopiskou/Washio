-- ============================================================
-- Washio — partner_onboarding
-- Στοιχεία τιμολόγησης & πληρωμής συνεργατών (πλυντηρίων).
-- Τρέξε το στο Supabase → SQL Editor.
--
-- ΠΡΟΣΟΧΗ: ο πίνακας περιέχει IBAN. Το RLS είναι ενεργό ΧΩΡΙΣ
-- policies, δηλαδή ΚΑΝΕΝΑΣ client (anon/authenticated) δεν
-- διαβάζει ή γράφει. Μόνο το service_role key (server-side,
-- app/api/onboarding/route.ts) έχει πρόσβαση.
-- ============================================================

create table if not exists public.partner_onboarding (
  id                        uuid primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),

  -- Στοιχεία τιμολόγησης
  business_name             text not null,
  afm                       text not null,
  doy                       text not null,
  address                   text not null,

  -- Λογαριασμός πληρωμής
  iban_holder               text not null,
  iban                      text not null,

  -- Επικοινωνία
  contact_name              text not null,
  phone                     text not null,
  email                     text not null,

  -- Δήλωση (αντικαθιστά την υπεύθυνη δήλωση gov.gr)
  declaration_accepted      boolean not null default false,
  declaration_accepted_at   timestamptz,

  -- Διαχείριση
  status                    text not null default 'pending',
  notes                     text,

  constraint partner_onboarding_afm_format check (afm ~ '^[0-9]{9}$'),
  constraint partner_onboarding_status_valid
    check (status in ('pending', 'verified', 'active', 'rejected'))
);

create index if not exists partner_onboarding_afm_idx
  on public.partner_onboarding (afm);

create index if not exists partner_onboarding_created_at_idx
  on public.partner_onboarding (created_at desc);

-- Κλείδωμα: RLS on, καμία policy → μόνο service_role.
alter table public.partner_onboarding enable row level security;

-- ------------------------------------------------------------
-- Χρήσιμο view για γρήγορο έλεγχο ΧΩΡΙΣ να εκθέτει το IBAN.
-- ------------------------------------------------------------
create or replace view public.partner_onboarding_safe as
select
  id,
  created_at,
  business_name,
  afm,
  doy,
  address,
  iban_holder,
  left(iban, 4) || ' **** **** ' || right(iban, 4) as iban_masked,
  contact_name,
  phone,
  email,
  status
from public.partner_onboarding;

-- ------------------------------------------------------------
-- Πρόσφατες υποβολές (τρέξ' το για να δεις τι ήρθε)
-- ------------------------------------------------------------
-- select * from public.partner_onboarding_safe order by created_at desc limit 50;
