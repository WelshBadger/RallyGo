-- Marketing: email only people who agreed (UK PECR/GDPR), a separate opt-in for
-- "RallyHQ news" push notifications, one-click unsubscribe, and a send log.

-- RallyHQ accounts (organisers) can now give consent too; Rally Logistics already
-- stores it on profiles.marketing_consent.
alter table public.user_profiles add column if not exists marketing_consent boolean not null default false;
alter table public.user_profiles add column if not exists marketing_consent_at timestamptz;

-- Unsubscribe tokens (one per email, random) and the do-not-email list
create table if not exists public.marketing_tokens (
  email text primary key,
  token uuid not null unique default gen_random_uuid()
);
create table if not exists public.marketing_unsubscribes (
  email text primary key,
  at timestamptz not null default now()
);
alter table public.marketing_tokens enable row level security;        -- no policies: server only
alter table public.marketing_unsubscribes enable row level security;  -- no policies: server only

-- Devices that switched on "RallyHQ news" notifications (separate from rally bulletins)
create table if not exists public.news_push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  app text not null default 'rallygo',
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.news_push_subscriptions enable row level security; -- no policies: via functions below

-- What was sent, for the admin's history
create table if not exists public.marketing_sends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subject text not null,
  message text not null,
  link_url text,
  channels text[] not null,
  email_count integer not null default 0,
  push_count integer not null default 0,
  test boolean not null default false,
  errors text
);
alter table public.marketing_sends enable row level security;
create policy "Super admin reads sends" on public.marketing_sends for select using (public.is_super_admin());

-- News push opt-in, callable without an account (knowing the endpoint = the device)
create or replace function public.subscribe_news_push(p_endpoint text, p_p256dh text, p_auth text, p_app text default 'rallygo')
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 2000
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    return false;
  end if;
  insert into news_push_subscriptions (endpoint, p256dh, auth, app, user_id)
  values (p_endpoint, p_p256dh, p_auth, coalesce(nullif(p_app, ''), 'rallygo'), auth.uid())
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
    user_id = coalesce(excluded.user_id, news_push_subscriptions.user_id);
  return true;
end; $$;

create or replace function public.unsubscribe_news_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from news_push_subscriptions where endpoint = p_endpoint;
$$;

create or replace function public.has_news_push(p_endpoint text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from news_push_subscriptions where endpoint = p_endpoint);
$$;

-- One-click unsubscribe from a marketing email link
create or replace function public.marketing_unsubscribe(p_token uuid)
returns text language plpgsql security definer set search_path = public as $$
declare e text;
begin
  select email into e from marketing_tokens where token = p_token;
  if e is null then return null; end if;
  insert into marketing_unsubscribes (email) values (e) on conflict (email) do update set at = now();
  update profiles set marketing_consent = false where lower(email) = lower(e);
  update user_profiles set marketing_consent = false
    where id in (select id from auth.users where lower(email) = lower(e));
  return e;
end; $$;

-- Opting in again (from an account page) removes the person from the do-not-email list
create or replace function public.marketing_resubscribe()
returns void language sql security definer set search_path = public as $$
  delete from marketing_unsubscribes
  where lower(email) = lower((select email from auth.users where id = auth.uid()));
$$;

-- Who a send would reach. Super admin only.
create or replace function public.marketing_audience()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Not authorised'; end if;
  return jsonb_build_object(
    'emails', (select count(distinct lower(u.email)) from auth.users u
               left join profiles p on p.id = u.id left join user_profiles up on up.id = u.id
               where u.email is not null and not coalesce(u.is_anonymous, false)
                 and (coalesce(p.marketing_consent, false) or coalesce(up.marketing_consent, false))
                 and lower(u.email) not in (select lower(email) from marketing_unsubscribes)),
    'push', (select count(*) from news_push_subscriptions),
    'accounts', (select count(*) from auth.users where email is not null and not coalesce(is_anonymous, false))
  );
end; $$;

revoke all on function public.subscribe_news_push(text, text, text, text) from public;
revoke all on function public.unsubscribe_news_push(text) from public;
revoke all on function public.has_news_push(text) from public;
revoke all on function public.marketing_unsubscribe(uuid) from public;
revoke all on function public.marketing_resubscribe() from public;
revoke all on function public.marketing_audience() from public, anon;
grant execute on function public.subscribe_news_push(text, text, text, text) to anon, authenticated;
grant execute on function public.unsubscribe_news_push(text) to anon, authenticated;
grant execute on function public.has_news_push(text) to anon, authenticated;
grant execute on function public.marketing_unsubscribe(uuid) to anon, authenticated;
grant execute on function public.marketing_resubscribe() to authenticated;
grant execute on function public.marketing_audience() to authenticated;
