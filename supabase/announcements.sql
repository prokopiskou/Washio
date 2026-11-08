-- Ενημερώσεις Washio → πλυντήρια, με επιβεβαίωση ανάγνωσης («Το διάβασα ✓»).
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text,
  title text not null,
  body text not null,
  important boolean not null default false,
  target_location_ids uuid[]            -- null = όλα τα ενεργά πλυντήρια
);
create table if not exists public.announcement_receipts (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  owner_id uuid,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  acked_at timestamptz,
  acked_by text,
  reminded_at timestamptz,
  sms_at timestamptz,
  unique (announcement_id, location_id)
);
create index if not exists announcement_receipts_owner_idx on public.announcement_receipts (owner_id, acked_at);
alter table public.announcements enable row level security;
alter table public.announcement_receipts enable row level security;
