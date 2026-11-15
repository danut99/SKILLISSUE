begin;

-- Include every player profile, even guests with no scores yet.
-- Called after settlement, under the same lock used for manual joins.
create or replace function public.enroll_active_league_players()
returns void language plpgsql security definer set search_path='' as $$
declare w date:=date_trunc('week',now() at time zone 'utc')::date;
 player record; gid bigint; tier integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(7152026,1);
 for player in
  select p.id as user_id from public.profiles p
  where not exists(select 1 from public.league_entries e where e.user_id=p.id and e.week=w)
  order by p.created_at,p.id
 loop
  select coalesce(e.next_division,g.division) into tier
   from public.league_entries e join public.league_groups g on g.id=e.group_id
   where e.user_id=player.user_id and e.week<w order by e.week desc limit 1;
  tier:=coalesce(tier,1);
  select g.id into gid from public.league_groups g where g.week=w and g.division=tier
   and (select count(*) from public.league_entries e where e.group_id=g.id)<20 order by g.id limit 1;
  if gid is null then insert into public.league_groups(week,division) values(w,tier) returning id into gid; end if;
  insert into public.league_entries(user_id,week,group_id) values(player.user_id,w,gid) on conflict do nothing;
 end loop;
end $$;
revoke all on function public.enroll_active_league_players() from public,anon,authenticated;

create or replace function public.get_my_league(p_join boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); w date:=date_trunc('week',now() at time zone 'utc')::date;
 settled_group record; gid bigint; tier integer:=1; n integer; previous jsonb; career jsonb;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 perform pg_catalog.pg_advisory_xact_lock(7152026,1);
 for settled_group in select * from public.league_groups where week<w and not settled order by week,id for update loop
  select count(*) into n from public.league_entries where group_id=settled_group.id;
  update public.league_entries e set final_score=s.score,final_rank=s.rank,
   next_division=case when n>=10 and s.rank<=5 and s.score>=600 then least(4,settled_group.division+1)
    else settled_group.division end
  from public.league_scores(settled_group.id) s where e.group_id=settled_group.id and e.user_id=s.user_id;
  update public.league_groups set settled=true where id=settled_group.id;
 end loop;
 perform public.enroll_active_league_players();
 select jsonb_build_object('week',e.week,'rank',e.final_rank,'score',e.final_score,'division',g.division,'next_division',e.next_division)
 into previous from public.league_entries e join public.league_groups g on g.id=e.group_id
 where e.user_id=uid and e.week<w order by e.week desc limit 1;
 select group_id into gid from public.league_entries where user_id=uid and week=w;
 if gid is null then
  if not exists(select 1 from public.profiles where id=uid) then raise exception 'nickname_required'; end if;
  tier:=coalesce((previous->>'next_division')::integer,1);
  select id into gid from public.league_groups g where week=w and division=tier
   and (select count(*) from public.league_entries where group_id=g.id)<20 order by id limit 1;
  if gid is null then insert into public.league_groups(week,division) values(w,tier) returning id into gid; end if;
  insert into public.league_entries(user_id,week,group_id) values(uid,w,gid);
 end if;
 select jsonb_build_object('highest_division',coalesce(max(greatest(g.division,coalesce(e.next_division,g.division))),1),
  'weeks',count(*) filter(where g.settled),
  'wins',count(*) filter(where e.final_rank=1 and e.final_score>0 and (select count(*) from public.league_entries members where members.group_id=g.id)>=10))
 into career from public.league_entries e join public.league_groups g on g.id=e.group_id where e.user_id=uid;
 if gid is null then return jsonb_build_object('joined',false,'division',1,'week',w,'ends_at',(w+7)::timestamp at time zone 'utc','previous',previous,'career',career); end if;
 return jsonb_build_object('joined',true,'week',w,'ends_at',(w+7)::timestamp at time zone 'utc',
  'division',(select division from public.league_groups where id=gid),'previous',previous,'career',career,
  'rows',(select coalesce(jsonb_agg(jsonb_build_object('nickname',p.nickname,'score',s.score,'rank',s.rank,'days',s.days,'is_me',s.user_id=uid) order by s.rank),'[]'::jsonb)
   from public.league_scores(gid) s join public.profiles p on p.id=s.user_id));
end $$;
revoke all on function public.get_my_league(boolean) from public,anon,authenticated;
grant execute on function public.get_my_league(boolean) to authenticated;
commit;
