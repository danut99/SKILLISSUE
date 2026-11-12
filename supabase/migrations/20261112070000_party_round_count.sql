begin;

alter table public.party_rooms add column if not exists round_count integer not null default 6 check (round_count between 2 and 12);
alter table public.party_results drop constraint if exists party_results_round_no_check;
alter table public.party_results add constraint party_results_round_no_check check (round_no between 0 and 11);

-- Snapshot each match length so later lobby changes cannot change its history.
create table if not exists public.party_match_settings (
  room_id uuid not null references public.party_rooms(id) on delete cascade,
  match_no integer not null,
  round_count integer not null check (round_count between 2 and 12),
  primary key (room_id, match_no)
);
alter table public.party_match_settings enable row level security;
revoke all on public.party_match_settings from public, anon, authenticated;
insert into public.party_match_settings (room_id, match_no, round_count)
  select distinct room_id, match_no, 6 from public.party_results on conflict do nothing;
insert into public.party_match_settings (room_id, match_no, round_count)
  select id, match_no, round_count from public.party_rooms where started_at is not null on conflict do nothing;

create or replace function public.party_round_offset(p_round integer)
returns integer language sql immutable set search_path = '' as $$
  select greatest(0, least(p_round, 12)) * 22;
$$;
create or replace function public.party_round_duration(p_round integer)
returns integer language sql immutable set search_path = '' as $$
  select case when p_round between 0 and 11 then 16 else 0 end;
$$;
revoke all on function public.party_round_offset(integer), public.party_round_duration(integer) from public, anon, authenticated;

create or replace function public.set_party_round_count(p_room uuid, p_round_count integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is not null then raise exception 'already_started'; end if;
  if p_round_count is null or p_round_count < 2 or p_round_count > 12 then raise exception 'bad_round_count'; end if;
  if room.round_count is distinct from p_round_count then
    update public.party_rooms set round_count = p_round_count where id = p_room;
    update public.party_members set ready = false where room_id = p_room;
  end if;
  return public.party_room_payload(p_room);
end $$;

create or replace function public.party_room_payload(p_room uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'round_count', room.round_count, 'token', room.id, 'match_no', room.match_no, 'started_at', room.started_at,
    'expires_at', room.expires_at, 'server_now', clock_timestamp(),
    'is_host', room.host_id = auth.uid(),
    'joined', exists(select 1 from public.party_members m where m.room_id = room.id and m.user_id = auth.uid()),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'name', p.nickname, 'is_me', m.user_id = auth.uid(), 'is_host', m.user_id = room.host_id, 'ready', m.ready,
      'results', coalesce((select jsonb_agg(jsonb_build_object(
        'round', r.round_no, 'score', case when r.user_id = auth.uid() or
          clock_timestamp() >= room.started_at + make_interval(secs => public.party_round_offset(r.round_no) + public.party_round_duration(r.round_no))
          then r.score else null end
      ) order by r.round_no) from public.party_results r where r.room_id = room.id and r.match_no = room.match_no and r.user_id = m.user_id), '[]'::jsonb)
    ) order by m.joined_at, m.user_id) from public.party_members m join public.profiles p on p.id = m.user_id where m.room_id = room.id), '[]'::jsonb)
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
  if (select count(*) from public.party_members where room_id = p_room) < 2 then raise exception 'need_players'; end if;
  if exists(select 1 from public.party_members where room_id = p_room and not ready) then raise exception 'not_ready'; end if;
  insert into public.party_match_settings (room_id, match_no, round_count)
    values (p_room, room.match_no, room.round_count) on conflict do nothing;
  insert into public.party_match_players (room_id, match_no, user_id)
    select p_room, room.match_no, user_id from public.party_members where room_id = p_room
    on conflict do nothing;
  update public.party_rooms set started_at = clock_timestamp() + interval '5 seconds' where id = p_room;
  return public.party_room_payload(p_room);
end $$;

create or replace function public.submit_party_result(p_room uuid, p_match integer, p_round integer, p_score numeric, p_detail jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms; round_start timestamptz; round_end timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if not exists(select 1 from public.party_members where room_id = p_room and user_id = auth.uid()) then raise exception 'not_joined'; end if;
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

create or replace function public.rematch_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is null or clock_timestamp() < room.started_at + make_interval(secs => public.party_round_offset(room.round_count)) then raise exception 'match_not_finished'; end if;
  update public.party_rooms set match_no = match_no + 1, started_at = null where id = p_room;
  update public.party_members set ready = false where room_id = p_room;
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

revoke all on function public.party_room_payload(uuid) from public, anon, authenticated;
revoke all on function public.set_party_round_count(uuid, integer), public.start_party_room(uuid),
  public.submit_party_result(uuid,integer,integer,numeric,jsonb), public.rematch_party_room(uuid), public.get_party_match(uuid,integer) from public, anon, authenticated;
grant execute on function public.set_party_round_count(uuid, integer), public.start_party_room(uuid),
  public.submit_party_result(uuid,integer,integer,numeric,jsonb), public.rematch_party_room(uuid), public.get_party_match(uuid,integer) to authenticated;

create or replace function public.get_party_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'parties_created', count(*),
    'games_played', coalesce(sum(greatest(match_no - 1, 0) +
      case when started_at is not null and
        now() >= started_at + make_interval(secs => public.party_round_offset(round_count))
      then 1 else 0 end), 0)
  ) from public.party_rooms;
$$;
revoke all on function public.get_party_stats() from public, anon, authenticated;
grant execute on function public.get_party_stats() to anon, authenticated;

commit;
