begin;

create or replace function public.list_public_parties()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 return coalesce((select jsonb_agg(to_jsonb(directory) order by directory.is_mine desc, directory.expired, directory.status_order, directory.created_at desc) from (
 select r.id as token,r.room_code as code,p.nickname as host,r.round_count,r.selected_games,r.created_at,
  latest.match_no as latest_match,latest.round_count as latest_round_count,
  coalesce(podium.winners,'[]'::jsonb) as winners,podium.winning_score,
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
 left join lateral (
  select s.match_no,s.round_count from public.party_match_settings s
  where s.room_id=r.id and (s.match_no<r.match_no or
   (s.match_no=r.match_no and r.started_at is not null and now()>=r.started_at+make_interval(secs=>public.party_round_offset(s.round_count))))
  order by s.match_no desc limit 1
 ) latest on true
 left join lateral (
  select jsonb_agg(t.nickname order by t.nickname) as winners,max(t.score) as winning_score from (
   select p.nickname,sum(coalesce(result.score,0)) as score,
    dense_rank() over(order by sum(coalesce(result.score,0)) desc) as place
   from (
    select mp.user_id from public.party_match_players mp where mp.room_id=r.id and mp.match_no=latest.match_no
    union select pr.user_id from public.party_results pr where pr.room_id=r.id and pr.match_no=latest.match_no
   ) roster join public.profiles p on p.id=roster.user_id
   left join public.party_results result on result.room_id=r.id and result.match_no=latest.match_no and result.user_id=roster.user_id
   group by roster.user_id,p.nickname
  ) t where t.place=1
 ) podium on true
 where r.is_public
 ) directory where directory.games_played > 0),'[]'::jsonb);
end $$;
revoke all on function public.list_public_parties() from public,anon,authenticated;
grant execute on function public.list_public_parties() to authenticated;
commit;
