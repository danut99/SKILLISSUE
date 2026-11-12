begin;

-- Sum daily bests rather than attempts, so retries never inflate career points.
create or replace function public.get_all_time_leaderboard(
  p_mode text,
  p_friends_only boolean default false
)
returns table (rank bigint, nickname text, score numeric, detail jsonb, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_mode is null or p_mode not in ('draw', 'cut', 'brake', 'overall') then
    raise exception 'bad_mode';
  end if;
  if p_friends_only and auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  return query
    with eligible as (
      select s.user_id, p.nickname, s.play_date, s.score, s.updated_at
        from public.daily_scores s join public.profiles p on p.id = s.user_id
       where (p_mode = 'overall' or s.mode = p_mode)
         and s.play_date <= (now() at time zone 'utc')::date
         and (not coalesce(p_friends_only, false) or s.user_id = auth.uid() or exists (
           select 1 from public.friends f
            where (f.user_id = auth.uid() and f.friend_id = s.user_id)
               or (f.friend_id = auth.uid() and f.user_id = s.user_id)
         ))
    ), totals as (
      select e.user_id, e.nickname, sum(e.score) as score,
        jsonb_build_object('days', count(distinct e.play_date), 'games', count(*)) as detail,
        max(e.updated_at) as updated_at
      from eligible e group by e.user_id, e.nickname
    ), ranked as (
      select row_number() over (order by t.score desc, t.updated_at asc, t.user_id) as rank,
        t.nickname, t.score, t.detail, coalesce(t.user_id = auth.uid(), false) as is_me
      from totals t
    )
    select r.rank, r.nickname, r.score, r.detail, r.is_me from ranked r
      where r.rank <= 10 or r.is_me order by r.rank;
end $$;

revoke execute on function public.get_all_time_leaderboard(text, boolean) from public, anon, authenticated;
grant execute on function public.get_all_time_leaderboard(text, boolean) to anon, authenticated;

commit;
