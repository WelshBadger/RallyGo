-- Sections a rally doesn't use. Stored as "hidden" lists so everything stays
-- visible until the organiser (or a crew's pack admin) switches it off.
alter table public.rallies add column if not exists hidden_sections jsonb not null default '[]'::jsonb;          -- RallyHQ rally info
alter table public.rallies add column if not exists hidden_logistics_tiles jsonb not null default '[]'::jsonb;   -- Rally Logistics, every crew
alter table public.logistics_packs add column if not exists hidden_tiles jsonb not null default '[]'::jsonb;     -- Rally Logistics, this pack

-- Several route map files per rally (e.g. one KMZ per day): [{ id, label, url }].
-- route_kmz_url mirrors the first for older app versions.
alter table public.rallies add column if not exists route_kmz_files jsonb not null default '[]'::jsonb;
