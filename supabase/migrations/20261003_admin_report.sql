-- Everything the private Reports screen shows, in one call. Super admin only.
-- SECURITY DEFINER so it can read auth.users / auth.sessions / storage.objects,
-- which the browser can't; the is_super_admin() check is the gate.
create or replace function public.admin_report()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
  result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Not authorised';
  end if;

  with
  last_seen as (
    select user_id, max(coalesce(refreshed_at, updated_at, created_at)) as seen
    from auth.sessions group by user_id
  ),
  people as (
    select u.id, u.email, u.created_at, coalesce(u.is_anonymous, false) as guest,
           coalesce(p.full_name, up.full_name) as name,
           up.role = 'organiser' as organiser,
           coalesce(up.is_super_admin, false) as admin,
           p.id is not null as logistics,
           coalesce(p.marketing_consent, false) as marketing,
           greatest(ls.seen, u.last_sign_in_at) as seen
    from auth.users u
    left join profiles p on p.id = u.id
    left join user_profiles up on up.id = u.id
    left join last_seen ls on ls.user_id = u.id
  ),
  days as (
    select d::date as day from generate_series(today - 29, today, interval '1 day') d
  )
  select jsonb_build_object(
    'generated_at', now(),

    'totals', jsonb_build_object(
      'accounts', (select count(*) from people where not guest),
      'guests', (select count(*) from people where guest),
      'organisers', (select count(*) from people where organiser),
      'logistics_users', (select count(*) from people where logistics),
      'marketing_opt_in', (select count(*) from people where marketing),
      'new_7d', (select count(*) from people where created_at > now() - interval '7 days'),
      'active_24h', (select count(*) from people where seen > now() - interval '24 hours'),
      'active_7d', (select count(*) from people where seen > now() - interval '7 days'),
      'rallies', (select count(*) from rallies),
      'rallies_active', (select count(*) from rallies where status = 'active'),
      'calendar_events', (select count(*) from calendar_events),
      'packs', (select count(*) from logistics_packs),
      'pack_members', (select count(*) from pack_members),
      'code_devices', (select count(*) from rally_unlocks),
      'code_devices_24h', (select count(*) from rally_unlocks where last_at > now() - interval '24 hours'),
      'alert_signups', (select count(*) from push_subscriptions),
      'chat_messages', (select count(*) from team_chat_messages),
      'chat_7d', (select count(*) from team_chat_messages where created_at > now() - interval '7 days'),
      'sharing_now', (select count(*) from team_positions where updated_at > now() - interval '15 minutes'),
      'documents', (select count(*) from rally_documents),
      'files', (select count(*) from storage.objects where bucket_id in ('rally-docs', 'rally-logos', 'team-chat-images')),
      'files_mb', (select round(coalesce(sum((metadata->>'size')::bigint), 0) / 1048576.0, 1) from storage.objects
                   where bucket_id in ('rally-docs', 'rally-logos', 'team-chat-images', 'news-images'))
    ),

    'daily', (select jsonb_agg(jsonb_build_object(
        'day', day,
        'accounts', (select count(*) from people where not guest and (created_at at time zone 'Europe/London')::date = day),
        'active', (select count(*) from people where (seen at time zone 'Europe/London')::date = day),
        'packs', (select count(*) from logistics_packs where (created_at at time zone 'Europe/London')::date = day),
        'code_devices', (select count(*) from rally_unlocks where (first_at at time zone 'Europe/London')::date = day),
        'alerts', (select count(*) from push_subscriptions where (created_at at time zone 'Europe/London')::date = day),
        'chat', (select count(*) from team_chat_messages where (created_at at time zone 'Europe/London')::date = day),
        'uploads', (select count(*) from storage.objects where bucket_id in ('rally-docs', 'team-chat-images')
                     and (created_at at time zone 'Europe/London')::date = day)
      ) order by day) from days),

    'rallies', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'date', r.date, 'end_date', r.end_date, 'status', r.status,
        'organiser', coalesce(op.name, op.email, '—'),
        'code_devices', (select count(*) from rally_unlocks x where x.rally_id = r.id),
        'code_devices_24h', (select count(*) from rally_unlocks x where x.rally_id = r.id and x.last_at > now() - interval '24 hours'),
        'code_opens', (select coalesce(sum(opens), 0) from rally_unlocks x where x.rally_id = r.id),
        'entries', jsonb_array_length(coalesce(r.entry_list_data, '[]'::jsonb)),
        'documents', (select count(*) from rally_documents d where d.rally_id = r.id),
        'roadbooks', greatest(jsonb_array_length(coalesce(r.roadbook_files, '[]'::jsonb)), case when r.roadbook_pdf_url is not null then 1 else 0 end),
        'route_files', greatest(jsonb_array_length(coalesce(r.route_kmz_files, '[]'::jsonb)), case when r.route_kmz_url is not null then 1 else 0 end),
        'stage_maps', jsonb_array_length(coalesce(r.stage_maps, '[]'::jsonb)),
        'alerts', (select count(*) from push_subscriptions ps where ps.rally_id = r.id),
        'packs', (select count(*) from logistics_packs lp where lp.rally_id = r.id),
        'chat', (select count(*) from team_chat_messages m where m.rally_id = r.id),
        'hidden_sections', jsonb_array_length(coalesce(r.hidden_sections, '[]'::jsonb))
      ) order by r.date desc), '[]'::jsonb)
      from rallies r left join people op on op.id = r.organiser_id),

    'people', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', coalesce(name, email, 'Guest'), 'email', email,
        'type', case when admin then 'Admin' when organiser then 'Organiser' when guest then 'Guest' when logistics then 'Crew' else 'Account' end,
        'joined', created_at, 'last_seen', seen,
        'packs', (select count(*) from logistics_packs lp where lp.user_id = people.id)
          + (select count(*) from pack_members pm where pm.user_id = people.id),
        'marketing', marketing
      ) order by created_at desc), '[]'::jsonb) from people),

    'packs', (select coalesce(jsonb_agg(jsonb_build_object(
        'rally', coalesce(r.name, ce.name, lp.custom_name, 'Untitled'),
        'kind', case when lp.rally_id is not null then 'RallyHQ rally' when lp.calendar_event_id is not null then 'Calendar' else 'Own rally' end,
        'owner', coalesce(o.name, o.email, '—'),
        'car', lp.car_number,
        'members', (select count(*) from pack_members pm where pm.pack_id = lp.id),
        'created', lp.created_at, 'updated', lp.updated_at,
        'sharing', (select count(*) from team_positions tp where tp.pack_id = lp.id and tp.updated_at > now() - interval '15 minutes')
      ) order by coalesce(lp.updated_at, lp.created_at) desc), '[]'::jsonb)
      from logistics_packs lp
      left join rallies r on r.id = lp.rally_id
      left join calendar_events ce on ce.id = lp.calendar_event_id
      left join people o on o.id = lp.user_id)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_report() from public, anon;
grant execute on function public.admin_report() to authenticated;
