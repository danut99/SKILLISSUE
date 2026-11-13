-- New matches rotate Draw / Cut / Brake; keep existing matches and history unchanged.
begin;
alter table public.party_match_settings
  add column if not exists game_version integer not null default 1
    check (game_version in (1, 2));

create or replace function public.party_room_payload(p_room uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'game_version', coalesce((select game_version from public.party_match_settings where room_id = room.id and match_no = room.match_no), case when room.started_at is null then 2 else 1 end),
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
  insert into public.party_match_settings (room_id, match_no, round_count, game_version)
    values (p_room, room.match_no, room.round_count, 2) on conflict do nothing;
  insert into public.party_match_players (room_id, match_no, user_id)
    select p_room, room.match_no, user_id from public.party_members where room_id = p_room and active
    on conflict do nothing;
  update public.party_rooms set started_at = clock_timestamp() + interval '5 seconds' where id = p_room;
  return public.party_room_payload(p_room);
end $$;

create or replace function public.get_party_match(p_room uuid, p_match integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if not exists(select 1 from public.party_members where room_id = p_room and user_id = auth.uid()) then raise exception 'not_joined'; end if;
  if p_match is null or p_match < 1 or p_match >= room.match_no then raise exception 'match_not_finished'; end if;
  return jsonb_build_object(
    'match_no', p_match,
    'game_version', coalesce((select game_version from public.party_match_settings where room_id = p_room and match_no = p_match), 1),
    'round_count', coalesce((select round_count from public.party_match_settings where room_id = p_room and match_no = p_match), 6),
    'roster_complete', exists(select 1 from public.party_match_players where room_id = p_room and match_no = p_match),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'name', p.nickname, 'is_me', m.user_id = auth.uid(), 'is_host', m.user_id = room.host_id, 'ready', false,
      'results', coalesce((select jsonb_agg(jsonb_build_object('round', r.round_no, 'score', r.score) order by r.round_no)
        from public.party_results r where r.room_id = p_room and r.match_no = p_match and r.user_id = m.user_id), '[]'::jsonb)
    ) order by m.joined_at, m.user_id)
      from public.party_members m join public.profiles p on p.id = m.user_id
      where m.room_id = p_room and (
        exists(select 1 from public.party_match_players mp where mp.room_id = p_room and mp.match_no = p_match and mp.user_id = m.user_id)
        or exists(select 1 from public.party_results r where r.room_id = p_room and r.match_no = p_match and r.user_id = m.user_id)
      )), '[]'::jsonb)
  );
end $$;

-- Existing RPC permissions are preserved by CREATE OR REPLACE.
commit;
