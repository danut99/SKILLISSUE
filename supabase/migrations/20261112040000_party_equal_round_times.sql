begin;

-- Uniform 16-second rounds; difficulty comes from shape complexity.
-- Each round still has a six-second reveal (22 seconds per round).
create or replace function public.party_round_offset(p_round integer)
returns integer language sql immutable set search_path = '' as $$
  select greatest(0, least(p_round, 6)) * 22;
$$;
create or replace function public.party_round_duration(p_round integer)
returns integer language sql immutable set search_path = '' as $$
  select case when p_round between 0 and 5 then 16 else 0 end;
$$;
revoke all on function public.party_round_offset(integer), public.party_round_duration(integer) from public, anon, authenticated;

create or replace function public.rematch_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is null or clock_timestamp() < room.started_at + make_interval(secs => public.party_round_offset(6)) then raise exception 'match_not_finished'; end if;
  update public.party_rooms set match_no = match_no + 1, started_at = null where id = p_room;
  update public.party_members set ready = false where room_id = p_room;
  return public.party_room_payload(p_room);
end $$;

revoke all on function public.rematch_party_room(uuid) from public, anon, authenticated;
grant execute on function public.rematch_party_room(uuid) to authenticated;

commit;
