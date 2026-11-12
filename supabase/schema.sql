-- SKILL ISSUE: run once in Supabase → SQL Editor
-- Players get a silent anonymous auth user; linking Google/email keeps the SAME id.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nickname   text not null check (char_length(nickname) between 1 and 15),
  created_at timestamptz not null default now()
);
-- reserved nicknames: one owner per name (case-insensitive)
create unique index if not exists profiles_nickname_key on public.profiles (lower(nickname));

-- every single try (enforces 3/day/mode on the server, enables cross-device resume)
create table if not exists public.attempts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  play_date  date not null default ((now() at time zone 'utc')::date),
  mode       text not null check (mode in ('draw', 'cut', 'brake')),
  score      numeric(5,2) not null check (score >= 0 and score <= 100),
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists attempts_user_day_idx on public.attempts (user_id, play_date, mode);

-- +1 try per mode/day (rewarded ad)
create table if not exists public.bonuses (
  user_id   uuid not null references auth.users (id) on delete cascade,
  play_date date not null,
  mode      text not null check (mode in ('draw', 'cut', 'brake')),
  primary key (user_id, play_date, mode)
);

-- best score per (player, day, mode) → leaderboard
create table if not exists public.daily_scores (
  user_id    uuid not null references auth.users (id) on delete cascade,
  play_date  date not null,
  mode       text not null check (mode in ('draw', 'cut', 'brake')),
  score      numeric(5,2) not null check (score >= 0 and score <= 100),
  detail     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, play_date, mode)
);
create index if not exists daily_scores_board_idx on public.daily_scores (play_date, mode, score desc, updated_at);

-- RLS: players may only READ their own rows; all WRITES go through the functions below.
alter table public.profiles     enable row level security;
alter table public.attempts     enable row level security;
alter table public.bonuses      enable row level security;
alter table public.daily_scores enable row level security;
revoke all on public.profiles, public.attempts, public.bonuses, public.daily_scores from anon, authenticated;
grant select on public.profiles, public.attempts, public.bonuses to authenticated;
create policy "own profile"  on public.profiles for select to authenticated using (id = auth.uid());
create policy "own attempts" on public.attempts for select to authenticated using (user_id = auth.uid());
create policy "own bonuses"  on public.bonuses  for select to authenticated using (user_id = auth.uid());

-- Record one try. Server decides the date (UTC) and enforces the daily limit.
create or replace function public.record_attempt(p_mode text, p_score numeric, p_detail jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d date := (now() at time zone 'utc')::date;
  used int;
  allowed int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_mode not in ('draw', 'cut', 'brake') then raise exception 'bad_mode'; end if;
  if p_score is null or p_score < 0 or p_score > 100 then raise exception 'bad_score'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text || d::text || p_mode));
  select count(*) into used from attempts where user_id = uid and play_date = d and mode = p_mode;
  select 3 + count(*) into allowed from bonuses where user_id = uid and play_date = d and mode = p_mode;
  if used >= allowed then raise exception 'no_tries_left'; end if;

  insert into attempts (user_id, play_date, mode, score, detail)
  values (uid, d, p_mode, round(p_score, 2), coalesce(p_detail, '{}'::jsonb));

  insert into daily_scores (user_id, play_date, mode, score, detail)
  values (uid, d, p_mode, round(p_score, 2), coalesce(p_detail, '{}'::jsonb))
  on conflict (user_id, play_date, mode) do update
    set score = excluded.score, detail = excluded.detail, updated_at = now()
    where excluded.score > daily_scores.score;

  return jsonb_build_object('used', used + 1, 'allowed', allowed);
end $$;

create or replace function public.grant_bonus(p_mode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_mode not in ('draw', 'cut', 'brake') then raise exception 'bad_mode'; end if;
  insert into bonuses (user_id, play_date, mode)
  values (auth.uid(), (now() at time zone 'utc')::date, p_mode) on conflict do nothing;
end $$;

-- Claim / rename nickname. Raises 'nickname_taken' if someone else owns it.
create or replace function public.set_nickname(p_nickname text)
returns text language plpgsql security definer set search_path = public as $$
declare v text := left(btrim(regexp_replace(coalesce(p_nickname, ''), '[[:cntrl:]<>]', '', 'g')), 15);
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(v) < 1 then raise exception 'bad_nickname'; end if;
  begin
    insert into profiles (id, nickname) values (auth.uid(), v)
    on conflict (id) do update set nickname = excluded.nickname;
  exception when unique_violation then
    raise exception 'nickname_taken';
  end;
  return v;
end $$;

-- Everything a returning player needs on a new device.
create or replace function public.get_my_state()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today_date', (now() at time zone 'utc')::date,
    'nickname', (select nickname from profiles where id = auth.uid()),
    'today', coalesce((
      select jsonb_agg(jsonb_build_object('mode', mode, 'score', score, 'detail', detail,
                       'at', (extract(epoch from created_at) * 1000)::bigint) order by created_at)
        from attempts where user_id = auth.uid() and play_date = (now() at time zone 'utc')::date), '[]'::jsonb),
    'bonuses', coalesce((
      select jsonb_agg(mode) from bonuses
       where user_id = auth.uid() and play_date = (now() at time zone 'utc')::date), '[]'::jsonb),
    'dates', coalesce((
      select jsonb_agg(distinct play_date) from attempts
       where user_id = auth.uid() and play_date > (now() at time zone 'utc')::date - 400), '[]'::jsonb)
  );
$$;

-- Today's Top 10 (+ caller's row if outside). Only players with a nickname appear.
-- p_mode: 'draw' | 'cut' | 'brake' | 'overall' (sum of the 3 best scores).
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
      from base
  )
  select rank, nickname, score, detail, is_me from ranked where rank <= 10 or is_me order by rank;
$$;

revoke execute on function public.record_attempt(text, numeric, jsonb), public.grant_bonus(text),
  public.set_nickname(text), public.get_my_state(), public.get_leaderboard(text) from public;
grant execute on function public.record_attempt(text, numeric, jsonb) to authenticated;
grant execute on function public.grant_bonus(text) to authenticated;
grant execute on function public.set_nickname(text) to authenticated;
grant execute on function public.get_my_state() to authenticated;
grant execute on function public.get_leaderboard(text) to anon, authenticated;
