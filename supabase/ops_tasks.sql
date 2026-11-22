-- ============================================================
-- CRM & Operations — εργασίες ομάδας (Προκόπης / Γιώργος)
-- Κανόνας: κανένα lead χωρίς επόμενη ενέργεια, κανένα σοβαρό πρόβλημα χωρίς υπεύθυνο.
--  • ops_tasks: κάθε εργασία (χειροκίνητη ή αυτόματη). Ένα ανοιχτό task ανά dedupe_key
--    (π.χ. «qr:<location>» — 8 προβληματικές κρατήσεις = 1 task με 8 περιστατικά στο items).
--  • applications: + lost_reason, next_action (επόμενη ενέργεια του lead).
-- Πρόσβαση ΜΟΝΟ μέσω service role (API admin) — RLS χωρίς policies.
-- ============================================================

create table if not exists public.ops_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  details text,
  assignee text not null,                       -- email admin
  created_by text not null default 'auto',      -- email ή 'auto'
  source text not null default 'manual',        -- manual | auto
  rule text,                                    -- review_low | qr_unscanned | new_lead | yesterday_calls | lead_no_next | washer_cancel | washer_idle | pay_abandon
  priority text not null default 'normal',      -- high | normal | low
  status text not null default 'todo',          -- todo | in_progress | blocked | done
  outcome text,                                 -- resolved | no_answer | needs_tech | waiting
  due_at timestamptz,
  claimed_at timestamptz,
  done_at timestamptz,
  escalated_at timestamptz,
  dedupe_key text,
  parent_id uuid references public.ops_tasks(id) on delete set null,
  application_id uuid,
  location_id uuid,
  booking_id uuid,
  review_id uuid,
  items jsonb not null default '[]'::jsonb,     -- λίστα (π.χ. χθεσινοί πελάτες) [{key,label,phone,done}]
  log jsonb not null default '[]'::jsonb        -- ιστορικό [{at,by,text}]
);

create unique index if not exists ops_tasks_open_dedupe on public.ops_tasks (dedupe_key)
  where dedupe_key is not null and status <> 'done';
create index if not exists ops_tasks_assignee_idx on public.ops_tasks (assignee, status, due_at);
alter table public.ops_tasks enable row level security;

alter table public.applications add column if not exists lost_reason text;
alter table public.applications add column if not exists next_action text;
