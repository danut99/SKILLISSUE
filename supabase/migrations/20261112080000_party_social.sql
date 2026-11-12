begin;
alter table public.party_members add column if not exists active boolean not null default true;
alter table public.party_members add column if not exists kicked boolean not null default false;
create or replace function public.party_room_payload(p_room uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'round_count', room.round_count, 'token', room.id, 'match_no', room.match_no, 'started_at', room.started_at,
    'expires_at', room.expires_at, 'server_now', clock_timestamp(),
    'is_host', room.host_id = auth.uid(),
    'joined', exists(select 1 from public.party_members m where m.room_id = room.id and m.user_id = auth.uid() and m.active),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'name', p.nickname, 'player_id', m.user_id, 'is_me', m.user_id = auth.uid(), 'is_host', m.user_id = room.host_id, 'ready', m.ready,
      'results', coalesce((select jsonb_agg(jsonb_build_object(
        'round', r.round_no, 'detail', case when r.user_id = auth.uid() or clock_timestamp() >= room.started_at + make_interval(secs => public.party_round_offset(r.round_no) + public.party_round_duration(r.round_no)) then r.detail else null end, 'score', case when r.user_id = auth.uid() or
          clock_timestamp() >= room.started_at + make_interval(secs => public.party_round_offset(r.round_no) + public.party_round_duration(r.round_no))
          then r.score else null end
      ) order by r.round_no) from public.party_results r where r.room_id = room.id and r.match_no = room.match_no and r.user_id = m.user_id), '[]'::jsonb)
    ) order by m.joined_at, m.user_id) from public.party_members m join public.profiles p on p.id = m.user_id where m.room_id = room.id and m.active), '[]'::jsonb)
  ) from public.party_rooms room where room.id = p_room;
$$;
create or replace function public.start_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is not null then return public.party_room_payload(p_room); end if;
  if (select count(*) from public.party_members where room_id = p_room and active) < 2 then raise exception 'need_players'; end if;
  if exists(select 1 from public.party_members where room_id = p_room and active and not ready) then raise exception 'not_ready'; end if;
  insert into public.party_match_settings (room_id, match_no, round_count)
    values (p_room, room.match_no, room.round_count) on conflict do nothing;
  insert into public.party_match_players (room_id, match_no, user_id)
    select p_room, room.match_no, user_id from public.party_members where room_id = p_room and active
    on conflict do nothing;
  update public.party_rooms set started_at = clock_timestamp() + interval '5 seconds' where id = p_room;
  return public.party_room_payload(p_room);
end $$;
create or replace function public.ready_party_room(p_room uuid, p_ready boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.started_at is not null then raise exception 'already_started'; end if;
  update public.party_members set ready = coalesce(p_ready, false) where room_id = p_room and user_id = auth.uid() and active;
  if not found then raise exception 'not_joined'; end if;
  return public.party_room_payload(p_room);
end $$;
create or replace function public.join_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); room public.party_rooms;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if exists(select 1 from public.party_members where room_id = p_room and user_id = uid and active) then return public.party_room_payload(p_room); end if;
  if exists(select 1 from public.party_members where room_id = p_room and user_id = uid and kicked) then raise exception 'removed_player'; end if;
  if room.started_at is not null then raise exception 'already_started'; end if;
  if (select count(*) from public.party_members where room_id = p_room and active) >= 8 then raise exception 'room_full'; end if;
  if not exists(select 1 from public.profiles where id = uid) then raise exception 'profile_required'; end if;
  insert into public.party_members(room_id, user_id) values(p_room, uid) on conflict (room_id, user_id) do update set active = true, ready = false;
  return public.party_room_payload(p_room);
end $$;
create or replace function public.submit_party_result(p_room uuid, p_match integer, p_round integer, p_score numeric, p_detail jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms; round_start timestamptz; round_end timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if not exists(select 1 from public.party_members where room_id = p_room and user_id = auth.uid() and active) then raise exception 'not_joined'; end if;
  if room.started_at is null or p_match is distinct from room.match_no then raise exception 'wrong_match'; end if;
  if p_round is null or p_round < 0 or p_round >= room.round_count then raise exception 'bad_round'; end if;
  -- Idempotent retry of an already received result never changes the score.
  if exists(select 1 from public.party_results where room_id = p_room and match_no = p_match and user_id = auth.uid() and round_no = p_round) then return public.party_room_payload(p_room); end if;
  round_start := room.started_at + make_interval(secs => public.party_round_offset(p_round));
  round_end := round_start + make_interval(secs => public.party_round_duration(p_round));
  if clock_timestamp() < round_start or clock_timestamp() > round_end + interval '2 seconds' then raise exception 'round_closed'; end if;
  if p_score is null or p_score::text in ('NaN', 'Infinity', '-Infinity') or p_score < 0 or p_score > 100 then raise exception 'bad_score'; end if;
  if octet_length(coalesce(p_detail, '{}'::jsonb)::text) > 24000 then raise exception 'bad_detail'; end if;
  insert into public.party_results(room_id, match_no, user_id, round_no, score, detail)
    values(p_room, p_match, auth.uid(), p_round, round(p_score, 2), coalesce(p_detail, '{}'::jsonb));
  return public.party_room_payload(p_room);
end $$;
create or replace function public.leave_party_room(p_room uuid, p_player uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms; target uuid := coalesce(p_player, auth.uid()); next_host uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found then raise exception 'invalid_room'; end if;
  if not exists(select 1 from public.party_members where room_id = p_room and user_id = auth.uid() and active) then raise exception 'not_joined'; end if;
  if target <> auth.uid() and room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is not null and clock_timestamp() < room.started_at + make_interval(secs => public.party_round_offset(room.round_count)) then raise exception 'match_in_progress'; end if;
  update public.party_members set active = false, ready = false, kicked = (target <> auth.uid()) where room_id = p_room and user_id = target;
  if target = room.host_id then
    select user_id into next_host from public.party_members where room_id = p_room and active order by joined_at, user_id limit 1;
    if next_host is null then update public.party_rooms set expires_at = now() where id = p_room;
    else update public.party_rooms set host_id = next_host where id = p_room; end if;
  end if;
end $$;
revoke all on function public.leave_party_room(uuid,uuid), public.party_room_payload(uuid) from public, anon, authenticated;
grant execute on function public.leave_party_room(uuid,uuid) to authenticated;
commit;
