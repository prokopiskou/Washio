-- Καταγραφή ανοιγμάτων χάρτη: ΠΟΣΟ μακριά από το κοντινότερο πλυντήριο είναι όσοι ανοίγουν τον χάρτη.
-- Θέση ΣΤΡΟΓΓΥΛΕΜΕΝΗ (2 δεκαδικά ≈ 1 χλμ.) — η ακριβής δεν αποθηκεύεται ποτέ.
-- Γράφει μόνο ο server (service role) από το /api/map-open. Καμία πρόσβαση από client (RLS χωρίς policies).

create table if not exists public.map_opens (
  id                  bigserial primary key,
  created_at          timestamptz not null default now(),
  user_id             uuid references auth.users(id) on delete set null,
  device_id           text,
  has_location        boolean not null default false,
  loc_source          text,            -- cache | quick | precise | none
  lat_r               numeric(6,2),
  lng_r               numeric(6,2),
  nearest_km          numeric(6,1),
  nearest_location_id uuid,
  n_within_3km        int,
  n_within_5km        int,
  n_within_10km       int,
  acq_ref             text,
  acq_ad              text,
  native              boolean
);

create index if not exists map_opens_created_idx on public.map_opens (created_at desc);
create index if not exists map_opens_user_idx on public.map_opens (user_id);

alter table public.map_opens enable row level security;
