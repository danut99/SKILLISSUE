begin;

-- Record the roster so players who miss all six rounds still appear in history.
create table if not exists public.party_match_players (
  room_id uuid not null,
  match_no integer not null,
  user_id uuid not null,
  primary key (room_id, match_no, user_id),
  foreign key (room_id, user_id) references public.party_members(room_id, user_id) on delete cascade
);
alter table public.party_match_players enable row level security;
revoke all on public.party_match_players from public, anon, authenticated;

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
  insert into public.party_match_players (room_id, match_no, user_id)
    select p_room, room.match_no, user_id from public.party_members where room_id = p_room
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

revoke all on function public.start_party_room(uuid), public.get_party_match(uuid, integer) from public, anon, authenticated;
grant execute on function public.start_party_room(uuid), public.get_party_match(uuid, integer) to authenticated;

commit;
