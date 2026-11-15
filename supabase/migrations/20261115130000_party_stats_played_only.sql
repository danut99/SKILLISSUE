begin;

-- Count only parties that have at least one completed match, including ended rooms.
-- Keep this public endpoint aggregate-only; no room or player details are exposed.
create or replace function public.get_party_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
 with completed_games as (
  select r.id,s.match_no
  from public.party_rooms r
  join public.party_match_settings s on s.room_id=r.id
  where s.match_no<r.match_no or (
   s.match_no=r.match_no and r.started_at is not null
   and now()>=r.started_at+make_interval(secs=>public.party_round_offset(s.round_count))
  )
 )
 select jsonb_build_object(
  'parties_created',count(distinct id),
  'games_played',count(*)
 ) from completed_games;
$$;
revoke all on function public.get_party_stats() from public,anon,authenticated;
grant execute on function public.get_party_stats() to anon,authenticated;

commit;
