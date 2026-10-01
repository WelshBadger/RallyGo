-- RallyHQ: competitors open Rally Info with a code and have no account, so they
-- can't pass the "users manage own push subs" policy. These functions let a device
-- that holds the rally code (or a signed-in manager) manage its own subscription.
-- Knowing the push endpoint is what identifies the device.

create or replace function public.subscribe_rally_push(
  p_rally_id uuid, p_code text, p_endpoint text, p_p256dh text, p_auth text
)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not (public.check_rally_code(p_rally_id, p_code) or public.can_manage_rally(p_rally_id)) then
    return false;
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 2000
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    return false;
  end if;

  insert into push_subscriptions (user_id, rally_id, endpoint, p256dh, auth, app)
  values (auth.uid(), p_rally_id, p_endpoint, p_p256dh, p_auth, 'rallygo')
  on conflict (endpoint, rally_id, app) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_id = coalesce(excluded.user_id, push_subscriptions.user_id);
  return true;
end;
$$;

create or replace function public.unsubscribe_rally_push(p_rally_id uuid, p_endpoint text)
returns void
language sql security definer set search_path = public
as $$
  delete from push_subscriptions
  where rally_id = p_rally_id and endpoint = p_endpoint and app = 'rallygo';
$$;

create or replace function public.has_rally_push(p_rally_id uuid, p_endpoint text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from push_subscriptions
    where rally_id = p_rally_id and endpoint = p_endpoint and app = 'rallygo'
  );
$$;

revoke all on function public.subscribe_rally_push(uuid, text, text, text, text) from public;
revoke all on function public.unsubscribe_rally_push(uuid, text) from public;
revoke all on function public.has_rally_push(uuid, text) from public;
grant execute on function public.subscribe_rally_push(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.unsubscribe_rally_push(uuid, text) to anon, authenticated;
grant execute on function public.has_rally_push(uuid, text) to anon, authenticated;
