begin;

-- Aggregate unique players across completed attempts; no player identities exposed.
create or replace function public.get_game_player_counts()
returns jsonb language sql stable security definer set search_path='' as $$
 with played as (
  select mode,user_id from public.attempts
  union
  select mode,user_id from public.skill_level_attempts where finished
  union
  select case when coalesce(s.game_version,1)=1 then case when r.round_no%2=0 then 'draw' else 'cut' end
   else (coalesce(s.selected_games,room.selected_games,array['draw','cut','brake']::text[]))[1+r.round_no%cardinality(coalesce(s.selected_games,room.selected_games,array['draw','cut','brake']::text[]))] end as mode,r.user_id
  from public.party_results r join public.party_rooms room on room.id=r.room_id
  left join public.party_match_settings s on s.room_id=r.room_id and s.match_no=r.match_no
  union
  select 'balance',user_id from public.balance_attempts
  union
  select 'count',user_id from public.count_attempts where finished_at is not null
 ), totals as (
  select mode,count(distinct user_id) as players from played group by mode
 )
 select jsonb_object_agg(m.mode,coalesce(t.players,0))
 from (values('draw'),('cut'),('brake'),('balance'),('count')) m(mode)
 left join totals t on t.mode=m.mode;
$$;
revoke all on function public.get_game_player_counts() from public,anon,authenticated;
grant execute on function public.get_game_player_counts() to anon,authenticated;
commit;
