-- Which devices have opened each rally's info with its code. Competitors have no
-- account, so each device carries a random id (localStorage). Recorded by
-- check_rally_code on success; the apps re-check whenever they open a rally with
-- signal, so last_at doubles as "last seen".
create table if not exists public.rally_unlocks (
  rally_id  uuid not null references public.rallies(id) on delete cascade,
  device_id text not null check (length(device_id) between 8 and 64),
  first_at  timestamptz not null default now(),
  last_at   timestamptz not null default now(),
  opens     integer not null default 1,
  primary key (rally_id, device_id)
);

alter table public.rally_unlocks enable row level security;

create policy "Managers read unlocks" on public.rally_unlocks
  for select using (public.can_manage_rally(rally_id));

drop function if exists public.check_rally_code(uuid, text);

create or replace function public.check_rally_code(p_rally_id uuid, p_code text, p_device text default null)
returns boolean
language plpgsql volatile security definer set search_path = public
as $$
declare ok boolean;
begin
  select exists (
    select 1 from rally_access_codes c
    where c.rally_id = p_rally_id
      and upper(btrim(c.code)) = upper(btrim(coalesce(p_code, '')))
  ) into ok;

  if ok and p_device is not null and length(p_device) between 8 and 64 then
    insert into rally_unlocks (rally_id, device_id) values (p_rally_id, p_device)
    on conflict (rally_id, device_id) do update
      set last_at = now(), opens = rally_unlocks.opens + 1;
  end if;
  return ok;
end;
$$;

revoke all on function public.check_rally_code(uuid, text, text) from public;
grant execute on function public.check_rally_code(uuid, text, text) to anon, authenticated;
