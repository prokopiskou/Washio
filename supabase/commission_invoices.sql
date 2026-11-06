-- Τιμολόγια προμήθειας Washio → πλυντήρια (Oxygen). Ένα ανά πλυντήριο ανά μήνα.
-- 1) ΑΦΜ / ΔΟΥ πάνω στο πλυντήριο (για το τιμολόγιο)
alter table public.locations add column if not exists afm text;
alter table public.locations add column if not exists doy text;

-- Backfill από τις αιτήσεις ένταξης (partner_onboarding) με βάση το email του ιδιοκτήτη
update public.locations l
set afm = po.afm, doy = coalesce(l.doy, po.doy)
from auth.users u, public.partner_onboarding po
where u.id = l.owner_id
  and lower(trim(po.email)) = lower(trim(u.email))
  and coalesce(po.afm, '') <> ''
  and coalesce(l.afm, '') = '';

-- 2) Ιστορικό τιμολογίων
create table if not exists public.commission_invoices (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  month text not null,                         -- 'YYYY-MM'
  bookings_count int not null default 0,
  gross numeric(10,2) not null,                -- σύνολο προμήθειας (με ΦΠΑ)
  net numeric(10,2) not null,
  vat numeric(10,2) not null,
  settlement text not null default 'paid',     -- 'paid' (μας πλήρωσε) | 'offset' (συμψηφισμός)
  status text not null default 'pending',      -- pending | issued | emailed | failed
  oxygen_invoice_id text,
  invoice_number text,
  mydata_mark text,
  emailed_to text,
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, month)
);
alter table public.commission_invoices enable row level security;  -- μόνο service role

select name, afm from public.locations where is_active order by name;
