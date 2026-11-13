begin;
alter table public.party_rooms add column if not exists room_code text not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
create unique index if not exists party_rooms_code_idx on public.party_rooms(room_code);
alter table public.party_rooms add column if not exists is_public boolean not null default true;
alter table public.party_rooms add column if not exists listed_seen_at timestamptz;
create or replace function public.party_room_payload(p_room uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code',room.room_code,'is_public',room.is_public,
    'selected_games', coalesce((select selected_games from public.party_match_settings where room_id = room.id and match_no = room.match_no), room.selected_games),
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
create or replace function public.get_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into room from public.party_rooms where id=p_room;
 if not found or room.expires_at<=now() then raise exception 'invalid_room'; end if;
 if room.host_id=auth.uid() then update public.party_rooms set listed_seen_at=clock_timestamp() where id=p_room; end if;
 return public.party_room_payload(p_room);
end $$;
create or replace function public.set_party_public(p_room uuid,p_public boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into room from public.party_rooms where id=p_room for update;
 if not found or room.expires_at<=now() then raise exception 'invalid_room'; end if;
 if room.host_id<>auth.uid() then raise exception 'host_only'; end if;
 update public.party_rooms set is_public=coalesce(p_public,false),listed_seen_at=clock_timestamp() where id=p_room;
 return public.party_room_payload(p_room);
end $$;
create or replace function public.find_party_code(p_code text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare found_id uuid;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if p_code is null or upper(trim(p_code)) !~ '^[A-F0-9]{8}$' then raise exception 'invalid_room_code'; end if;
 select id into found_id from public.party_rooms where room_code=upper(trim(p_code)) and expires_at>now();
 if found_id is null then raise exception 'invalid_room_code'; end if;
 return found_id;
end $$;
create or replace function public.list_public_parties()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 return coalesce((select jsonb_agg(to_jsonb(lobby)) from (
 select r.id as token,r.room_code as code,p.nickname as host,r.round_count,r.selected_games,
  (select count(*) from public.party_members m where m.room_id=r.id and m.active) as players
 from public.party_rooms r join public.profiles p on p.id=r.host_id
 where r.is_public and r.started_at is null and r.expires_at>now() and r.listed_seen_at>now()-interval '90 seconds'
 and (select count(*) from public.party_members m where m.room_id=r.id and m.active) between 1 and 7
 order by r.created_at desc limit 30
 ) lobby),'[]'::jsonb);
end $$;
revoke all on function public.party_room_payload(uuid),public.get_party_room(uuid),public.set_party_public(uuid,boolean),public.find_party_code(text),public.list_public_parties() from public,anon,authenticated;
grant execute on function public.get_party_room(uuid),public.set_party_public(uuid,boolean),public.find_party_code(text),public.list_public_parties() to authenticated;
commit;
