-- «Απόκτησε το δικό σου πλυντήριο αυτοκινήτων» — leads από το banner της αρχικής.
create table if not exists public.business_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  area text not null,        -- Κέντρο Αθήνας | Βόρεια | Νότια | Ανατολικά | Δυτικά | Πειραιάς
  timing text not null,      -- Άμεσα | Σε 3 μήνες | Σε 6 μήνες
  intent text not null,      -- Αγορά | Μίσθωση | Δημιουργία νέου
  name text not null,
  phone text not null,
  user_id uuid,
  source text,
  status text not null default 'new',   -- new | called | interested | not_interested
  notes text
);
alter table public.business_leads enable row level security;  -- μόνο service role
