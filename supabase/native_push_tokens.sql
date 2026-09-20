-- ============================================================
-- Washio — Native push tokens (iOS/Android μέσω FCM).
-- Συνυπάρχει με το web push (push_subscriptions) — δεν το αντικαθιστά.
-- Τρέξε στο Supabase → SQL Editor. Idempotent.
-- ============================================================

create table if not exists public.native_push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null,
  platform    text not null default 'ios',
  updated_at  timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.native_push_tokens
  drop constraint if exists native_push_platform_valid;
alter table public.native_push_tokens
  add constraint native_push_platform_valid check (platform in ('ios', 'android'));

create index if not exists native_push_user_idx
  on public.native_push_tokens (user_id);

-- RLS: μόνο ο ίδιος ο χρήστης βλέπει/σβήνει τα δικά του tokens.
-- Η εγγραφή γίνεται server-side (service role) μέσω /api/push/register-native.
alter table public.native_push_tokens enable row level security;

drop policy if exists "native_push_own" on public.native_push_tokens;
create policy "native_push_own" on public.native_push_tokens
  for select using (auth.uid() = user_id);
