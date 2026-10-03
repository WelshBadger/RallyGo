-- Several roadbooks per rally (e.g. one per day): [{ id, label, url }].
-- roadbook_pdf_url is kept in step with the first one for older app versions;
-- rallies with only roadbook_pdf_url keep working (the apps fall back to it).
alter table public.rallies add column if not exists roadbook_files jsonb not null default '[]'::jsonb;
