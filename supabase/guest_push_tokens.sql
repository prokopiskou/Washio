-- Push σε επισκέπτες της εφαρμογής (χωρίς λογαριασμό): token ανά συσκευή.
-- Σκοπός: «Το −3€ σε περιμένει» την επόμενη μέρα σε όσους άνοιξαν την εφαρμογή και δεν έκλεισαν.
create table if not exists public.guest_push_tokens (
  device_id text primary key,
  token text not null unique,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid,
  nudges int not null default 0,
  last_nudge_at timestamptz
);
alter table public.guest_push_tokens enable row level security;
