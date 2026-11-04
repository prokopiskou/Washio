-- Push «Οι κρατήσεις σου σήμερα» στο πλυντήριο: μία φορά τη μέρα
alter table public.locations add column if not exists morning_push_date date;
