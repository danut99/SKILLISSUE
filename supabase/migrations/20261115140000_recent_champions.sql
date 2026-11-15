begin;

-- Only finalized UTC days, with the same best-per-mode total as the daily board.
create or replace function public.get_recent_champions()
returns jsonb language sql stable security definer set search_path = '' as $$
 with totals as (
  select s.play_date,s.user_id,sum(s.score) as score,max(s.updated_at) as achieved_at
  from public.daily_scores s
  where s.play_date >= (now() at time zone 'utc')::date-3
    and s.play_date < (now() at time zone 'utc')::date
  group by s.play_date,s.user_id
 ), ranked as (
  select t.play_date,p.nickname,t.score,
   row_number() over(partition by t.play_date order by t.score desc,t.achieved_at,t.user_id) as rank
  from totals t join public.profiles p on p.id=t.user_id
 )
 select coalesce(jsonb_agg(jsonb_build_object('date',d.play_date,'winners',coalesce((
  select jsonb_agg(jsonb_build_object('rank',r.rank,'nickname',r.nickname,'score',r.score) order by r.rank)
  from ranked r where r.play_date=d.play_date and r.rank<=3
 ),'[]'::jsonb)) order by d.play_date desc),'[]'::jsonb)
 from (select (now() at time zone 'utc')::date-offset_days as play_date from generate_series(1,3) as offset_days) d;
$$;
revoke all on function public.get_recent_champions() from public,anon,authenticated;
grant execute on function public.get_recent_champions() to anon,authenticated;

commit;
