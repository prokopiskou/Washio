-- Αιτήσεις πλυντηρίων (apply + Meta leads) → στάδια διαδικασίας στο admin.
-- new → (κλήση) no_answer / answered → followup → onboarding → done   ·   lost = δεν ενδιαφέρεται
alter table public.applications add column if not exists stage text not null default 'new';
alter table public.applications add column if not exists stage_updated_at timestamptz;
alter table public.applications add column if not exists call_attempts int not null default 0;
alter table public.applications add column if not exists last_call_at timestamptz;
alter table public.applications add column if not exists last_call_by text;
alter table public.applications add column if not exists followup_at timestamptz;
alter table public.applications add column if not exists followup_by text;
alter table public.applications add column if not exists followup_notified_at timestamptz;
alter table public.applications add column if not exists doy text;
alter table public.applications add column if not exists pipeline_notes text;
alter table public.applications add column if not exists location_id uuid;
alter table public.applications add column if not exists onboarding_id uuid;

-- Οι παλιές: εγκεκριμένες → done, απορριφθείσες → lost, υπόλοιπες → new
update public.applications set stage = case
  when status in ('approved','active') then 'done'
  when status = 'rejected' then 'lost'
  else 'new' end
where stage = 'new' and status is not null and status <> 'pending';

create index if not exists applications_stage_idx on public.applications (stage, created_at desc);
create index if not exists applications_followup_idx on public.applications (followup_at) where followup_notified_at is null;
