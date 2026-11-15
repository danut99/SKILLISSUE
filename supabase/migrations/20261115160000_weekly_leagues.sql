begin;
create table public.league_groups (
 id bigint generated always as identity primary key,
 week date not null,
 division integer not null check(division between 1 and 4),
 settled boolean not null default false
);
create index league_groups_week_idx on public.league_groups(week,division);
create table public.league_entries (
 user_id uuid not null references public.profiles(id) on delete cascade,
 week date not null,
 group_id bigint not null references public.league_groups(id) on delete cascade,
 final_score numeric,
 final_rank integer,
 next_division integer,
 primary key(user_id,week)
);
create index league_entries_group_idx on public.league_entries(group_id);
alter table public.league_groups enable row level security;
alter table public.league_entries enable row level security;
revoke all on public.league_groups,public.league_entries from public,anon,authenticated;

-- One scoring implementation for live standings and final results.
create function public.league_scores(p_group bigint)
returns table(user_id uuid,score numeric,days jsonb,rank bigint)
language sql stable security definer set search_path='' as $$
 with daily as (
  select s.user_id,s.play_date,sum(s.score) as score
  from public.daily_scores s join public.league_entries e on e.user_id=s.user_id
  join public.league_groups g on g.id=e.group_id
  where g.id=p_group and s.play_date>=g.week and s.play_date<g.week+7
  group by s.user_id,s.play_date
 ), ordered as (
  select *,row_number() over(partition by user_id order by score desc,play_date) as position from daily
 ), totals as (
  select e.user_id,coalesce(sum(d.score) filter(where d.position<=5),0) as score,
   coalesce(jsonb_agg(jsonb_build_object('date',d.play_date,'score',d.score,'counted',d.position<=5) order by d.play_date) filter(where d.play_date is not null),'[]'::jsonb) as days
  from public.league_entries e left join ordered d on d.user_id=e.user_id
  where e.group_id=p_group group by e.user_id
 ) select *,row_number() over(order by score desc,user_id) from totals;
$$;

-- Run on every visit. A single lock makes settlement and group allocation atomic.
create function public.get_my_league(p_join boolean default false)
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
 select jsonb_build_object('week',e.week,'rank',e.final_rank,'score',e.final_score,'division',g.division,'next_division',e.next_division)
 into previous from public.league_entries e join public.league_groups g on g.id=e.group_id
 where e.user_id=uid and e.week<w order by e.week desc limit 1;
 select group_id into gid from public.league_entries where user_id=uid and week=w;
 if gid is null and (p_join or exists(select 1 from public.daily_scores where user_id=uid and play_date>=w and play_date<w+7)) then
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
revoke all on function public.league_scores(bigint),public.get_my_league(boolean) from public,anon,authenticated;
grant execute on function public.get_my_league(boolean) to authenticated;
commit;
