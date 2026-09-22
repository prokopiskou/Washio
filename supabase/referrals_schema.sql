-- ============================================================
-- REFERRALS + ΚΟΥΠΟΝΙΑ (wallet)
--   • Νέος από link/ad: −3€ έκπτωση (welcome).
--   • Referrer: +3€ πίστωση μόλις ο φίλος ολοκληρώσει κράτηση — έως 2 φορές.
--   • Πίστωση = wallet (referral_credit), εξαργυρώνεται ΜΟΝΟ σε κράτηση.
-- Τρέξ' το στο Supabase → SQL Editor. Idempotent.
-- ============================================================

-- 1) Wallet + κωδικός + ποιος με έφερε.
alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referral_credit numeric(6,2) not null default 0,
  add column if not exists referred_by uuid references public.profiles(id);

create unique index if not exists profiles_referral_code_key
  on public.profiles (referral_code) where referral_code is not null;

-- 2) Πίνακας παραπομπών (ποιος έφερε ποιον, κατάσταση).
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',          -- pending | completed | cancelled
  friend_discount numeric(6,2) not null default 3,
  referrer_reward numeric(6,2) not null default 3,
  booking_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (referred_id)                             -- κάθε χρήστης παραπέμπεται ΜΙΑ φορά
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);

-- 3) Ιστορικό κινήσεων wallet (tab «Κουπόνια»).
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(6,2) not null,                    -- + πίστωση, − εξαργύρωση
  kind text not null,                              -- welcome | referral_reward | redeem
  booking_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);

-- 4) Γεννήτρια μοναδικού κωδικού (χωρίς μπερδεμένα 0/O/1/I).
create or replace function public.gen_referral_code() returns text as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text; ok boolean;
begin
  loop
    code := '';
    for i in 1..6 loop code := code || substr(chars, 1 + floor(random()*length(chars))::int, 1); end loop;
    select not exists(select 1 from public.profiles where referral_code = code) into ok;
    exit when ok;
  end loop;
  return code;
end; $$ language plpgsql;

-- 5) Ατομική κίνηση wallet: ενημερώνει balance + γράφει ledger μαζί.
create or replace function public.apply_credit(
  p_user uuid, p_delta numeric, p_kind text, p_booking uuid default null, p_note text default null
) returns void as $$
begin
  update public.profiles set referral_credit = greatest(0, referral_credit + p_delta) where id = p_user;
  insert into public.credit_ledger (user_id, amount, kind, booking_id, note)
    values (p_user, p_delta, p_kind, p_booking, p_note);
end; $$ language plpgsql;

-- 6) Κωδικός σε υπάρχοντες + auto σε νέους.
update public.profiles set referral_code = public.gen_referral_code() where referral_code is null;

create or replace function public.set_referral_code() returns trigger as $$
begin
  if new.referral_code is null then new.referral_code := public.gen_referral_code(); end if;
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_profiles_referral_code on public.profiles;
create trigger trg_profiles_referral_code before insert on public.profiles
  for each row execute function public.set_referral_code();

-- 7) RLS.
alter table public.referrals enable row level security;
drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);

alter table public.credit_ledger enable row level security;
drop policy if exists credit_ledger_select_own on public.credit_ledger;
create policy credit_ledger_select_own on public.credit_ledger
  for select using (auth.uid() = user_id);

select count(*) as users_with_code from public.profiles where referral_code is not null;
