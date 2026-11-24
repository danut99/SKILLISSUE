-- Today's Top 10 ranks real scores only. Crashes, missed objectives and timeouts score 0,
-- so they no longer fill the board when few players have finished. Tries stay in history.
-- CREATE OR REPLACE preserves the existing RPC permissions.
begin;

create or replace function public.get_leaderboard(p_mode text)
returns table (rank bigint, nickname text, score numeric, detail jsonb, is_me boolean)
language sql stable security definer set search_path = public as $$
  with today as (
    select s.user_id, p.nickname, s.mode, s.score, s.detail, s.updated_at
      from daily_scores s join profiles p on p.id = s.user_id
     where s.play_date = (now() at time zone 'utc')::date
  ), base as (
    select user_id, nickname, score, detail, updated_at from today
     where p_mode <> 'overall' and mode = p_mode
    union all
    select user_id, max(nickname), sum(score), jsonb_build_object('games', count(*)), max(updated_at)
      from today where p_mode = 'overall' group by user_id
  ), ranked as (
    select row_number() over (order by score desc, updated_at asc) as rank,
           nickname, score, detail, coalesce(user_id = auth.uid(), false) as is_me
      from base where score > 0
  )
  select rank, nickname, score, detail, is_me from ranked where rank <= 10 or is_me order by rank;
$$;

commit;
