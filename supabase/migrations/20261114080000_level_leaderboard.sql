begin;

create or replace function public.get_level_leaderboard(p_mode text, p_friends_only boolean default false)
returns table(rank bigint, nickname text, score numeric, detail jsonb, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_mode is null or p_mode not in ('draw','cut','brake','overall') then
    raise exception 'bad_mode';
  end if;
  if p_friends_only and auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  return query
    with totals as (
      select r.user_id, p.nickname,
        sum(case when r.best_score>=95 then 3 when r.best_score>=90 then 2 when r.best_score>=85 then 1 else 0 end)::numeric as stars,
        count(*) filter(where r.best_score>=85) as completed,
        sum(r.best_score) as best_score
      from public.skill_level_records r join public.profiles p on p.id=r.user_id
      where (p_mode='overall' or r.mode=p_mode)
        and r.level between 1 and case when r.mode='brake' then 5 else 10 end
        and (not coalesce(p_friends_only,false) or r.user_id=auth.uid() or exists (
          select 1 from public.friends f
          where (f.user_id=auth.uid() and f.friend_id=r.user_id)
             or (f.friend_id=auth.uid() and f.user_id=r.user_id)
        ))
      group by r.user_id,p.nickname
    ), ranked as (
      select row_number() over(order by t.stars desc,t.completed desc,t.best_score desc,t.user_id) as rank,
        t.nickname,t.stars as score,
        jsonb_build_object('stars',t.stars,'completed',t.completed,'best_score',t.best_score) as detail,
        coalesce(t.user_id=auth.uid(),false) as is_me
      from totals t
    )
    select r.rank,r.nickname,r.score,r.detail,r.is_me from ranked r
    where r.rank<=10 or r.is_me order by r.rank;
end $$;

revoke all on function public.get_level_leaderboard(text,boolean) from public,anon,authenticated;
grant execute on function public.get_level_leaderboard(text,boolean) to anon,authenticated;
commit;
