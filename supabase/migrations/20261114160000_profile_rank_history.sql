-- Profile calendar: reconstruct end-of-day ranks from on-time attempts.
begin;
create index if not exists attempts_history_rank_idx on public.attempts(play_date, mode, user_id, score desc, created_at);
create or replace function public.get_my_rank_history(p_year integer)
returns table(play_date date, mode text, rank bigint, players bigint, score numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_year is null or p_year < 2026 or p_year > extract(year from now() at time zone 'utc')::integer then
    raise exception 'invalid_year';
  end if;
  return query
  with best as (
    select distinct on (a.play_date,a.mode,a.user_id)
      a.play_date,a.mode,a.user_id,a.score,a.created_at
    from public.attempts a join public.profiles p on p.id=a.user_id
    where a.play_date >= make_date(p_year,1,1) and a.play_date < make_date(p_year+1,1,1)
      and a.play_date <= (now() at time zone 'utc')::date
      and a.created_at < ((a.play_date+1)::timestamp at time zone 'utc')
    order by a.play_date,a.mode,a.user_id,a.score desc,a.created_at asc,a.id asc
  ), boards as (
    select b.play_date,b.mode,b.user_id,b.score,b.created_at from best b
    union all
    select b.play_date,'overall'::text,b.user_id,sum(b.score),max(b.created_at)
    from best b group by b.play_date,b.user_id
  ), ranked as (
    select b.play_date,b.mode,b.user_id,b.score,
      row_number() over(partition by b.play_date,b.mode order by b.score desc,b.created_at asc,b.user_id) as rank,
      count(*) over(partition by b.play_date,b.mode) as players
    from boards b
  )
  select r.play_date,r.mode,r.rank,r.players,r.score from ranked r
  where r.user_id=auth.uid() order by r.play_date,r.mode;
end $$;
revoke all on function public.get_my_rank_history(integer) from public,anon,authenticated;
grant execute on function public.get_my_rank_history(integer) to authenticated;
commit;
