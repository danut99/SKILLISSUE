begin;

create table if not exists public.party_rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  match_no integer not null default 1,
  started_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now()
);
create table if not exists public.party_members (
  room_id uuid not null references public.party_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists party_members_user_idx on public.party_members(user_id);
create table if not exists public.party_results (
  room_id uuid not null,
  match_no integer not null,
  user_id uuid not null,
  round_no integer not null check (round_no between 0 and 5),
  score numeric not null check (score >= 0 and score <= 100),
  detail jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  primary key (room_id, match_no, user_id, round_no),
  foreign key (room_id, user_id) references public.party_members(room_id, user_id) on delete cascade
);
alter table public.party_rooms enable row level security;
alter table public.party_members enable row level security;
alter table public.party_results enable row level security;
revoke all on public.party_rooms, public.party_members, public.party_results from public, anon, authenticated;

-- Six simultaneous rounds, with six seconds to reveal each result.
create or replace function public.party_round_offset(p_round integer)
returns integer language sql immutable set search_path = '' as $$
  select case p_round when 0 then 0 when 1 then 18 when 2 then 34
    when 3 then 48 when 4 then 60 when 5 then 71 else 81 end;
$$;
create or replace function public.party_round_duration(p_round integer)
returns integer language sql immutable set search_path = '' as $$
  select case p_round when 0 then 12 when 1 then 10 when 2 then 8
    when 3 then 6 when 4 then 5 when 5 then 4 else 0 end;
$$;
revoke all on function public.party_round_offset(integer), public.party_round_duration(integer) from public, anon, authenticated;

-- Internal read model. Opponents' scores remain hidden until the round ends.
create or replace function public.party_room_payload(p_room uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'token', room.id, 'match_no', room.match_no, 'started_at', room.started_at,
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
revoke all on function public.party_room_payload(uuid) from public, anon, authenticated;

create or replace function public.create_party_room()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); new_room_id uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists(select 1 from public.profiles where id = uid) then raise exception 'profile_required'; end if;
  if (select count(*) from public.party_rooms where host_id = uid and expires_at > now()) >= 10 then raise exception 'room_limit'; end if;
  insert into public.party_rooms(host_id) values(uid) returning id into new_room_id;
  insert into public.party_members(room_id, user_id) values(new_room_id, uid);
  return public.party_room_payload(new_room_id);
end $$;

create or replace function public.get_party_room(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  return public.party_room_payload(p_room);
end $$;

create or replace function public.join_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); room public.party_rooms;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if exists(select 1 from public.party_members where room_id = p_room and user_id = uid) then return public.party_room_payload(p_room); end if;
  if room.started_at is not null then raise exception 'already_started'; end if;
  if (select count(*) from public.party_members where room_id = p_room) >= 8 then raise exception 'room_full'; end if;
  if not exists(select 1 from public.profiles where id = uid) then raise exception 'profile_required'; end if;
  insert into public.party_members(room_id, user_id) values(p_room, uid);
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
  update public.party_members set ready = coalesce(p_ready, false) where room_id = p_room and user_id = auth.uid();
  if not found then raise exception 'not_joined'; end if;
  return public.party_room_payload(p_room);
end $$;

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
  if p_round is null or p_round < 0 or p_round > 5 then raise exception 'bad_round'; end if;
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
  if room.started_at is null or clock_timestamp() < room.started_at + interval '81 seconds' then raise exception 'match_not_finished'; end if;
  update public.party_rooms set match_no = match_no + 1, started_at = null where id = p_room;
  update public.party_members set ready = false where room_id = p_room;
  return public.party_room_payload(p_room);
end $$;

revoke all on function public.create_party_room(), public.get_party_room(uuid), public.join_party_room(uuid),
  public.ready_party_room(uuid,boolean), public.start_party_room(uuid), public.submit_party_result(uuid,integer,integer,numeric,jsonb),
  public.rematch_party_room(uuid) from public, anon, authenticated;
grant execute on function public.create_party_room(), public.get_party_room(uuid), public.join_party_room(uuid),
  public.ready_party_room(uuid,boolean), public.start_party_room(uuid), public.submit_party_result(uuid,integer,integer,numeric,jsonb),
  public.rematch_party_room(uuid) to authenticated;

commit;
