-- Route / stage map file (KMZ or KML) for a rally. Holds the URL of our own copy in
-- the rally-docs bucket, so it is served from our storage (works offline via the
-- service worker's file cache, and isn't blocked by the organiser's site).
alter table public.rallies add column if not exists route_kmz_url text;
