-- Per-stage recce videos and back-up pacenotes on a Rally Logistics pack.
--   pacenotes    { "<SS number>": [{ id, url }] }               pages in reading order
--   recce_videos { "<SS number>": [{ id, url, label, kind }] }   kind 'file' | 'link'
alter table public.logistics_packs add column if not exists pacenotes jsonb not null default '{}'::jsonb;
alter table public.logistics_packs add column if not exists recce_videos jsonb not null default '{}'::jsonb;
