-- RallyHQ: per-rally access code that competitors enter to open Rally Info.
-- Kept in its own table (not on rallies) because the apps select('*') from rallies,
-- which is publicly readable.

create table if not exists public.rally_access_codes (
  rally_id   uuid primary key references public.rallies(id) on delete cascade,
  code       text not null check (length(btrim(code)) >= 4),
  updated_at timestamptz not null default now()
);

alter table public.rally_access_codes enable row level security;

-- Owner of the rally, or a super admin
create or replace function public.can_manage_rally(p_rally_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from rallies r where r.id = p_rally_id and r.organiser_id = auth.uid())
      or exists (select 1 from user_profiles p where p.id = auth.uid() and p.is_super_admin);
$$;

create policy "Managers read rally code" on public.rally_access_codes
  for select using (public.can_manage_rally(rally_id));
create policy "Managers insert rally code" on public.rally_access_codes
  for insert with check (public.can_manage_rally(rally_id));
create policy "Managers update rally code" on public.rally_access_codes
  for update using (public.can_manage_rally(rally_id)) with check (public.can_manage_rally(rally_id));

-- 6 characters, no 0/O/1/I
create or replace function public.generate_rally_code()
returns text
language sql volatile
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;

create or replace function public.rally_access_code_on_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into rally_access_codes (rally_id, code)
  values (new.id, generate_rally_code())
  on conflict (rally_id) do nothing;
  return new;
end;
$$;

drop trigger if exists rally_access_code_create on public.rallies;
create trigger rally_access_code_create
  after insert on public.rallies
  for each row execute function public.rally_access_code_on_insert();

-- Backfill existing rallies
insert into public.rally_access_codes (rally_id, code)
select r.id, public.generate_rally_code() from public.rallies r
on conflict (rally_id) do nothing;

-- Competitor-side check: returns true/false only, never the code
create or replace function public.check_rally_code(p_rally_id uuid, p_code text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from rally_access_codes c
    where c.rally_id = p_rally_id
      and upper(btrim(c.code)) = upper(btrim(coalesce(p_code, '')))
  );
$$;

revoke all on function public.check_rally_code(uuid, text) from public;
grant execute on function public.check_rally_code(uuid, text) to anon, authenticated;
revoke all on function public.rally_access_code_on_insert() from public, anon, authenticated;
