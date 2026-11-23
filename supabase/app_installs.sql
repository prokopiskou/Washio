-- Ανοίγματα της εφαρμογής (iOS/Android) — ΚΑΙ χωρίς λογαριασμό / χωρίς ειδοποιήσεις.
-- Μία γραμμή ανά συσκευή (device_id = ws_dev). user_id μπαίνει μόλις συνδεθεί.
create table if not exists public.app_installs (
  device_id text primary key,
  platform text not null,                 -- ios | android
  user_id uuid,
  first_open_at timestamptz not null default now(),
  last_open_at timestamptz not null default now(),
  opens int not null default 1,
  app_version text
);
create index if not exists app_installs_user_idx on public.app_installs (user_id);
alter table public.app_installs enable row level security;
