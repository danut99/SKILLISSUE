begin;

create or replace function public.list_public_parties()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 return coalesce((select jsonb_agg(to_jsonb(directory) order by directory.is_mine desc, directory.expired, directory.status_order, directory.created_at desc) from (
 select r.id as token,r.room_code as code,p.nickname as host,r.round_count,r.selected_games,r.created_at,
  r.host_id=auth.uid() as is_mine,r.expires_at<=now() as expired,
  case when r.expires_at<=now() then 'Expired'
   when r.started_at is null then 'Waiting'
   when now()<r.started_at+make_interval(secs=>public.party_round_offset(r.round_count)) then 'Playing'
   else 'Finished' end as status,
  case when r.started_at is null then 0 when now()<r.started_at+make_interval(secs=>public.party_round_offset(r.round_count)) then 1 else 2 end as status_order,
  (select count(*) from public.party_members m where m.room_id=r.id and m.active) as players,
  (select count(*) from public.party_match_settings s where s.room_id=r.id and
   (s.match_no<r.match_no or (s.match_no=r.match_no and r.started_at is not null and now()>=r.started_at+make_interval(secs=>public.party_round_offset(s.round_count))))) as games_played
 from public.party_rooms r join public.profiles p on p.id=r.host_id
 where r.is_public
 ) directory),'[]'::jsonb);
end $$;
revoke all on function public.list_public_parties() from public,anon,authenticated;
grant execute on function public.list_public_parties() to authenticated;
commit;
