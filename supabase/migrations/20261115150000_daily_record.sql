begin;

-- Highest single-day total across completed UTC days; ties go to the earliest achievement.
create or replace function public.get_daily_record()
returns jsonb language sql stable security definer set search_path = '' as $$
 with totals as (
  select s.user_id,s.play_date,sum(s.score) as score,max(s.updated_at) as achieved_at
  from public.daily_scores s
  where s.play_date < (now() at time zone 'utc')::date
  group by s.user_id,s.play_date
 )
 select jsonb_build_object('nickname',p.nickname,'score',t.score,'date',t.play_date)
 from totals t join public.profiles p on p.id=t.user_id
 order by t.score desc,t.achieved_at,t.user_id,t.play_date
 limit 1;
$$;
revoke all on function public.get_daily_record() from public,anon,authenticated;
grant execute on function public.get_daily_record() to anon,authenticated;

commit;
