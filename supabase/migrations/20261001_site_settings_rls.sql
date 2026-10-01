-- site_settings had RLS off, so anyone with the publishable key could change it.
-- Everyone reads it (homepage news toggle); only super admins write it.
alter table public.site_settings enable row level security;
create policy "Anyone reads site settings" on public.site_settings for select to anon, authenticated using (true);
create policy "Super admin updates site settings" on public.site_settings for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "Super admin inserts site settings" on public.site_settings for insert to authenticated with check (public.is_super_admin());
create policy "Super admin deletes site settings" on public.site_settings for delete to authenticated using (public.is_super_admin());
