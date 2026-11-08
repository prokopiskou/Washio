-- Μετρήσεις ΑΝΑ ΔΙΑΦΗΜΙΣΗ (admin → Μετρήσεις → «Ανά διαφήμιση»).
-- Πηγή αλήθειας = ΔΙΚΑ ΜΑΣ δεδομένα: κάθε εγγραφή κρατά από ποια διαφήμιση ήρθε (user_metadata.acq_ad).
-- Έξοδα ανά διαφήμιση: πίνακας ad_spend_by_ad (sync από Meta Marketing API ή χειροκίνητα).
-- Τρέξε ΜΙΑ φορά στο Supabase SQL editor.

create table if not exists public.ad_spend_by_ad (
  day date not null,
  campaign text not null default '',
  ad_name text not null,
  spend numeric(10,2) not null default 0,
  clicks int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, campaign, ad_name)
);
alter table public.ad_spend_by_ad enable row level security; -- μόνο service role

create or replace function public.ads_by_ad(p_from timestamptz, p_to timestamptz)
returns table (ad text, signups int, bookers int, bookings int, first_bookings int, booking_value numeric, spend numeric, clicks int, campaigns text)
language sql security definer set search_path = public, auth as $$
  with team as (select '(withinsuccess|prokopis71|giwrgos2070|alexandr\.sph|sk5vhy6dhz|g7cbwtydrr|\+test)'::text re),
  u as (
    select au.id, coalesce(nullif(au.raw_user_meta_data->>'acq_ad', ''), '(χωρίς διαφήμιση)') ad, au.created_at
    from auth.users au, team
    where coalesce(au.email, '') !~* team.re
  ),
  s as (select ad, count(*)::int n from u where created_at >= p_from and created_at < p_to group by ad),
  b as (
    select u.ad, count(*)::int n, count(distinct bk.user_id)::int people,
      count(*) filter (where not exists (select 1 from bookings p where p.user_id = bk.user_id and p.created_at < bk.created_at and p.status <> 'cancelled'))::int firsts,
      coalesce(sum(bk.total_amount), 0) val
    from bookings bk join u on u.id = bk.user_id
    where bk.created_at >= p_from and bk.created_at < p_to and bk.status <> 'cancelled' and coalesce(bk.source, 'platform') <> 'manual'
    group by u.ad
  ),
  sp as (
    select ad_name ad, sum(spend) spend, sum(clicks)::int clicks, string_agg(distinct campaign, ', ') campaigns
    from ad_spend_by_ad
    where day >= (p_from at time zone 'Europe/Athens')::date and day < (p_to at time zone 'Europe/Athens')::date
    group by ad_name
  ),
  ads as (select ad from s union select ad from b union select ad from sp)
  select a.ad, coalesce(s.n, 0), coalesce(b.people, 0), coalesce(b.n, 0), coalesce(b.firsts, 0), coalesce(b.val, 0),
         coalesce(sp.spend, 0), coalesce(sp.clicks, 0), coalesce(sp.campaigns, '')
  from ads a left join s on s.ad = a.ad left join b on b.ad = a.ad left join sp on sp.ad = a.ad
  order by coalesce(sp.spend, 0) desc, coalesce(s.n, 0) desc
$$;
revoke all on function public.ads_by_ad(timestamptz, timestamptz) from public, anon, authenticated;
