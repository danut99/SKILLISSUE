begin;

create table if not exists public.balance_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  play_date date not null,
  support numeric not null check (support between 40 and 320),
  score numeric(5,2) not null check (score between 0 and 100),
  error numeric not null check (error between 0 and 320),
  created_at timestamptz not null default now()
);
create index if not exists balance_attempts_user_day_idx on public.balance_attempts(user_id, play_date);
alter table public.balance_attempts enable row level security;
revoke all on public.balance_attempts from public, anon, authenticated;

create or replace function public.get_balance_state()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'date', (now() at time zone 'utc')::date,
    'attempts', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id, 'support', a.support, 'score', a.score, 'error', a.error,
      'at', (extract(epoch from a.created_at) * 1000)::bigint
    ) order by a.created_at, a.id)
    from public.balance_attempts a where a.user_id = auth.uid()
      and a.play_date = (now() at time zone 'utc')::date), '[]'::jsonb)
  );
$$;

create or replace function public.record_balance_attempt(
  p_id uuid, p_date date, p_support numeric, p_score numeric, p_error numeric
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  d date := (now() at time zone 'utc')::date;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_id is null then raise exception 'bad_attempt'; end if;
  if p_date is distinct from d then raise exception 'wrong_day'; end if;
  if p_support is null or p_support::text in ('NaN','Infinity','-Infinity') or p_support < 40 or p_support > 320
    or p_score is null or p_score::text in ('NaN','Infinity','-Infinity') or p_score < 0 or p_score > 100
    or p_error is null or p_error::text in ('NaN','Infinity','-Infinity') or p_error < 0 or p_error > 320 then
    raise exception 'bad_score';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(uid::text || d::text || ':balance'));
  if exists(select 1 from public.balance_attempts where id = p_id and user_id = uid and play_date = d) then
    return public.get_balance_state();
  end if;
  if (select count(*) from public.balance_attempts where user_id = uid and play_date = d) >= 5 then
    raise exception 'no_tries_left';
  end if;
  insert into public.balance_attempts(id, user_id, play_date, support, score, error)
    values(p_id, uid, d, p_support, p_score, p_error);
  return public.get_balance_state();
end $$;

create or replace function public.get_balance_leaderboard()
returns table(rank bigint, nickname text, score numeric, detail jsonb, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with daily as (
    select a.user_id, a.play_date, max(a.score) as score, min(a.created_at) as played_at
    from public.balance_attempts a where a.play_date <= (now() at time zone 'utc')::date
    group by a.user_id, a.play_date
  ), totals as (
    select d.user_id, sum(d.score) as score, count(*) as days, max(d.played_at) as played_at
    from daily d group by d.user_id
  ), ranked as (
    select row_number() over(order by t.score desc, t.played_at asc, t.user_id) as rank,
      p.nickname, t.score, jsonb_build_object('days', t.days) as detail,
      coalesce(t.user_id = auth.uid(), false) as is_me
    from totals t join public.profiles p on p.id = t.user_id
  )
  select r.rank, r.nickname, r.score, r.detail, r.is_me from ranked r where r.rank <= 10 or r.is_me order by r.rank;
$$;

revoke all on function public.get_balance_state(), public.record_balance_attempt(uuid,date,numeric,numeric,numeric), public.get_balance_leaderboard() from public, anon, authenticated;
grant execute on function public.get_balance_state(), public.record_balance_attempt(uuid,date,numeric,numeric,numeric) to authenticated;
grant execute on function public.get_balance_leaderboard() to anon, authenticated;

commit;
