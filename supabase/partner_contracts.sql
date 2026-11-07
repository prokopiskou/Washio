-- Ηλεκτρονικά συμβόλαια συνεργατών (Συμφωνητικό Συνεργασίας) — υπογραφή με OTP + audit trail.
-- Ροή: admin «Υποβολή» → sent (email με link) → ο συνεργάτης υπογράφει → signed → πρατήριο (ανενεργό) + αντίγραφα και στους δύο.
create table if not exists public.partner_contracts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid,
  token text not null unique,                 -- προσωπικό link /contract/<token>
  status text not null default 'sent',        -- sent | signed | void
  version text not null,
  fields jsonb not null,                      -- date, businessName, afm, doy, address, contactName, promoMonths
  email text not null,
  phone text,
  iban text,
  sent_by text,
  sent_at timestamptz not null default now(),
  washio_signed_at timestamptz not null default now(),
  opened_at timestamptz,
  otp_hash text,
  otp_expires_at timestamptz,
  otp_attempts int not null default 0,
  otp_sends int not null default 0,
  signed_at timestamptz,
  signer_name text,
  signer_ip text,
  signer_user_agent text,
  content_sha256 text,
  pdf_path text,
  pdf_sha256 text,
  location_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists partner_contracts_app_idx on public.partner_contracts (application_id, created_at desc);
alter table public.partner_contracts enable row level security;   -- μόνο service role (χωρίς policies)

-- Αιτήσεις: σύνδεση με το τελευταίο συμβόλαιο
alter table public.applications add column if not exists contract_id uuid;
alter table public.applications add column if not exists contract_status text;   -- sent | signed

-- Προνομιακή προμήθεια 5% για Χ μήνες → μετά 10% (το cron την επαναφέρει)
alter table public.locations add column if not exists commission_promo_until date;

-- Ιδιωτικό bucket για τα υπογεγραμμένα PDF
insert into storage.buckets (id, name, public) values ('contracts', 'contracts', false)
on conflict (id) do nothing;
