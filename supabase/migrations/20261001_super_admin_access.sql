-- RallyHQ: organisers can only touch rallies they added (existing owner policies);
-- the super admin can read and manage everything; nobody can make themselves
-- an admin.

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from user_profiles p where p.id = auth.uid() and p.is_super_admin);
$$;

create policy "Super admin manages all rallies" on public.rallies
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Super admin manages all documents" on public.rally_documents
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- "Users update own profile" would otherwise let any signed-in user set
-- is_super_admin on their own row. Only an existing super admin (or the
-- dashboard / service role, where auth.uid() is null) may change it.
create or replace function public.protect_super_admin_flag()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_super_admin := false;
  elsif new.is_super_admin is distinct from old.is_super_admin then
    new.is_super_admin := old.is_super_admin;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_super_admin_flag on public.user_profiles;
create trigger protect_super_admin_flag
  before insert or update on public.user_profiles
  for each row execute function public.protect_super_admin_flag();

revoke all on function public.protect_super_admin_flag() from public, anon, authenticated;
