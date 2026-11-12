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


-- Friends and invite links (also available as an incremental migration).
begin;

-- One undirected friendship per pair. Invite links grant permission to connect.
create table if not exists public.friends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id < friend_id)
);
create index if not exists friends_friend_id_idx on public.friends(friend_id);

create table if not exists public.friend_invites (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default now() + interval '7 days'
);

alter table public.friends enable row level security;
alter table public.friend_invites enable row level security;
revoke all on public.friends, public.friend_invites from public, anon, authenticated;
grant select on public.friends to authenticated;
drop policy if exists "own friendships" on public.friends;
create policy "own friendships" on public.friends for select to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

create or replace function public.create_friend_invite(p_reset boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  invitation public.friend_invites;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile_required';
  end if;
  insert into public.friend_invites as current_invite (user_id) values (uid)
  on conflict (user_id) do update set
    token = case when p_reset or current_invite.expires_at <= now()
      then gen_random_uuid() else current_invite.token end,
    expires_at = case when p_reset or current_invite.expires_at <= now()
      then now() + interval '7 days' else current_invite.expires_at end
  returning * into invitation;
  return jsonb_build_object('token', invitation.token, 'expires_at', invitation.expires_at);
end $$;

-- Preview reveals only the inviter's public nickname to a valid link holder.
create or replace function public.preview_friend_invite(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  invitation public.friend_invites;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into invitation from public.friend_invites where token = p_token and expires_at > now();
  if not found then raise exception 'invalid_invite'; end if;
  return jsonb_build_object(
    'nickname', (select nickname from public.profiles where id = invitation.user_id),
    'is_me', invitation.user_id = uid,
    'already_friends', exists (select 1 from public.friends
      where user_id = least(uid, invitation.user_id) and friend_id = greatest(uid, invitation.user_id))
  );
end $$;

-- Retrying an acceptance is safe. The invite owner has consented by sharing the link.
create or replace function public.accept_friend_invite(p_token uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inviter uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile_required';
  end if;
  select user_id into inviter from public.friend_invites
    where token = p_token and expires_at > now() for update;
  if not found then raise exception 'invalid_invite'; end if;
  if inviter = uid then raise exception 'own_invite'; end if;
  insert into public.friends(user_id, friend_id)
    values (least(uid, inviter), greatest(uid, inviter)) on conflict do nothing;
  return (select nickname from public.profiles where id = inviter);
end $$;

create or replace function public.get_friends()
returns table (friend_id uuid, nickname text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return query select p.id, p.nickname, f.created_at from public.friends f
    join public.profiles p on p.id = case when f.user_id = auth.uid() then f.friend_id else f.user_id end
    where f.user_id = auth.uid() or f.friend_id = auth.uid()
    order by lower(p.nickname), p.id;
end $$;

create or replace function public.remove_friend(p_friend_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from public.friends
    where user_id = least(auth.uid(), p_friend_id) and friend_id = greatest(auth.uid(), p_friend_id);
end $$;

create or replace function public.get_friends_leaderboard(p_mode text)
returns table (rank bigint, nickname text, score numeric, detail jsonb, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_mode is null or p_mode not in ('draw', 'cut', 'brake', 'overall') then
    raise exception 'bad_mode';
  end if;
  return query
    with members as (
      select auth.uid() as id
      union
      select case when f.user_id = auth.uid() then f.friend_id else f.user_id end
        from public.friends f where f.user_id = auth.uid() or f.friend_id = auth.uid()
    ), today as (
      select s.*, p.nickname from public.daily_scores s
        join members m on m.id = s.user_id join public.profiles p on p.id = s.user_id
        where s.play_date = (now() at time zone 'utc')::date
    ), base as (
      select t.user_id, t.nickname, t.score, t.detail, t.updated_at from today t
        where p_mode <> 'overall' and t.mode = p_mode
      union all
      select t.user_id, max(t.nickname), sum(t.score), jsonb_build_object('games', count(*)), max(t.updated_at)
        from today t where p_mode = 'overall' group by t.user_id
    ), ranked as (
      select row_number() over (order by b.score desc, b.updated_at asc, b.user_id) as rank,
        b.nickname, b.score, b.detail, b.user_id = auth.uid() as is_me from base b
    )
    select r.rank, r.nickname, r.score, r.detail, r.is_me from ranked r
      where r.rank <= 10 or r.is_me order by r.rank;
end $$;

revoke execute on function public.create_friend_invite(boolean), public.preview_friend_invite(uuid),
  public.accept_friend_invite(uuid), public.get_friends(), public.remove_friend(uuid),
  public.get_friends_leaderboard(text) from public, anon, authenticated;
grant execute on function public.create_friend_invite(boolean), public.preview_friend_invite(uuid),
  public.accept_friend_invite(uuid), public.get_friends(), public.remove_friend(uuid),
  public.get_friends_leaderboard(text) to authenticated;

commit;
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



-- Persistent score challenges (20261112020000).
begin;

-- A shareable daily score, owned by its sender. Scores come from daily_scores,
-- never from link parameters or client-submitted challenge results.
create table if not exists public.score_challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('draw', 'cut', 'brake')),
  play_date date not null,
  score numeric not null check (score >= 0 and score <= 100),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (creator_id, mode, play_date, score)
);
create table if not exists public.score_challenge_players (
  challenge_id uuid not null references public.score_challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists score_challenge_players_user_idx on public.score_challenge_players(user_id);
alter table public.score_challenges enable row level security;
alter table public.score_challenge_players enable row level security;
revoke all on public.score_challenges, public.score_challenge_players from public, anon, authenticated;

-- Internal projection: sender sees all responses; everyone else sees only their
-- own response. No account IDs or other recipients are exposed to link holders.
create or replace function public.score_challenge_payload(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'token', c.id, 'mode', c.mode, 'play_date', c.play_date,
    'creator_name', p.nickname, 'creator_score', c.score, 'creator_detail', c.detail,
    'is_owner', c.creator_id = auth.uid(),
    'accepted', exists (select 1 from public.score_challenge_players x where x.challenge_id = c.id and x.user_id = auth.uid()),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nickname', rp.nickname, 'accepted_at', r.accepted_at,
        'is_me', r.user_id = auth.uid(), 'score', s.score, 'detail', s.detail,
        'attempts_remaining', greatest(0, 3 +
          (select count(*) from public.bonuses b where b.user_id = r.user_id and b.mode = c.mode and b.play_date = c.play_date) -
          (select count(*) from public.attempts a where a.user_id = r.user_id and a.mode = c.mode and a.play_date = c.play_date))
      ) order by r.accepted_at)
      from public.score_challenge_players r
      join public.profiles rp on rp.id = r.user_id
      left join public.daily_scores s on s.user_id = r.user_id and s.mode = c.mode and s.play_date = c.play_date
      where r.challenge_id = c.id and (c.creator_id = auth.uid() or r.user_id = auth.uid())
    ), '[]'::jsonb)
  ) from public.score_challenges c join public.profiles p on p.id = c.creator_id where c.id = p_id;
$$;
revoke all on function public.score_challenge_payload(uuid) from public, anon, authenticated;

create or replace function public.create_score_challenge(p_mode text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  saved public.daily_scores;
  challenge_id uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_mode not in ('draw', 'cut', 'brake') or p_mode is null then raise exception 'bad_mode'; end if;
  select * into saved from public.daily_scores
    where user_id = uid and mode = p_mode and play_date = (now() at time zone 'utc')::date;
  if not found then raise exception 'score_required'; end if;
  insert into public.score_challenges as existing (creator_id, mode, play_date, score, detail)
    values (uid, p_mode, saved.play_date, saved.score, saved.detail)
    on conflict (creator_id, mode, play_date, score) do update set detail = existing.detail
    returning id into challenge_id;
  return public.score_challenge_payload(challenge_id);
end $$;

create or replace function public.preview_score_challenge(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  result := public.score_challenge_payload(p_token);
  if result is null then raise exception 'invalid_challenge'; end if;
  return result;
end $$;

create or replace function public.accept_score_challenge(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  challenge public.score_challenges;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into challenge from public.score_challenges where id = p_token for update;
  if not found then raise exception 'invalid_challenge'; end if;
  if challenge.creator_id = uid then raise exception 'own_challenge'; end if;
  if challenge.play_date <> (now() at time zone 'utc')::date then raise exception 'expired_challenge'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'profile_required'; end if;
  insert into public.score_challenge_players (challenge_id, user_id) values (p_token, uid) on conflict do nothing;
  return public.score_challenge_payload(p_token);
end $$;

create or replace function public.get_score_challenges()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return coalesce((select jsonb_agg(public.score_challenge_payload(recent.id) order by recent.created_at desc)
    from (select c.id, c.created_at from public.score_challenges c
      where c.play_date >= (now() at time zone 'utc')::date - 7 and (
        c.creator_id = auth.uid() or exists (select 1 from public.score_challenge_players r
          where r.challenge_id = c.id and r.user_id = auth.uid()))
      order by c.created_at desc limit 30) recent), '[]'::jsonb);
end $$;

revoke all on function public.create_score_challenge(text), public.preview_score_challenge(uuid),
  public.accept_score_challenge(uuid), public.get_score_challenges() from public, anon, authenticated;
grant execute on function public.create_score_challenge(text), public.preview_score_challenge(uuid),
  public.accept_score_challenge(uuid), public.get_score_challenges() to authenticated;

commit;


-- Six-round Draw/Cut parties (20261112030000).
begin;

create table if not exists public.party_rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  match_no integer not null default 1,
  started_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now()
);
create table if not exists public.party_members (
  room_id uuid not null references public.party_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists party_members_user_idx on public.party_members(user_id);
create table if not exists public.party_results (
  room_id uuid not null,
  match_no integer not null,
  user_id uuid not null,
  round_no integer not null check (round_no between 0 and 5),
  score numeric not null check (score >= 0 and score <= 100),
  detail jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  primary key (room_id, match_no, user_id, round_no),
  foreign key (room_id, user_id) references public.party_members(room_id, user_id) on delete cascade
);
alter table public.party_rooms enable row level security;
alter table public.party_members enable row level security;
alter table public.party_results enable row level security;
revoke all on public.party_rooms, public.party_members, public.party_results from public, anon, authenticated;

-- Six simultaneous rounds, with six seconds to reveal each result.
create or replace function public.party_round_offset(p_round integer)
returns integer language sql immutable set search_path = '' as $$
  select case p_round when 0 then 0 when 1 then 18 when 2 then 34
    when 3 then 48 when 4 then 60 when 5 then 71 else 81 end;
$$;
create or replace function public.party_round_duration(p_round integer)
returns integer language sql immutable set search_path = '' as $$
  select case p_round when 0 then 12 when 1 then 10 when 2 then 8
    when 3 then 6 when 4 then 5 when 5 then 4 else 0 end;
$$;
revoke all on function public.party_round_offset(integer), public.party_round_duration(integer) from public, anon, authenticated;

-- Internal read model. Opponents' scores remain hidden until the round ends.
create or replace function public.party_room_payload(p_room uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'token', room.id, 'match_no', room.match_no, 'started_at', room.started_at,
    'expires_at', room.expires_at, 'server_now', clock_timestamp(),
    'is_host', room.host_id = auth.uid(),
    'joined', exists(select 1 from public.party_members m where m.room_id = room.id and m.user_id = auth.uid()),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'name', p.nickname, 'is_me', m.user_id = auth.uid(), 'is_host', m.user_id = room.host_id, 'ready', m.ready,
      'results', coalesce((select jsonb_agg(jsonb_build_object(
        'round', r.round_no, 'score', case when r.user_id = auth.uid() or
          clock_timestamp() >= room.started_at + make_interval(secs => public.party_round_offset(r.round_no) + public.party_round_duration(r.round_no))
          then r.score else null end
      ) order by r.round_no) from public.party_results r where r.room_id = room.id and r.match_no = room.match_no and r.user_id = m.user_id), '[]'::jsonb)
    ) order by m.joined_at, m.user_id) from public.party_members m join public.profiles p on p.id = m.user_id where m.room_id = room.id), '[]'::jsonb)
  ) from public.party_rooms room where room.id = p_room;
$$;
revoke all on function public.party_room_payload(uuid) from public, anon, authenticated;

create or replace function public.create_party_room()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); new_room_id uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists(select 1 from public.profiles where id = uid) then raise exception 'profile_required'; end if;
  if (select count(*) from public.party_rooms where host_id = uid and expires_at > now()) >= 10 then raise exception 'room_limit'; end if;
  insert into public.party_rooms(host_id) values(uid) returning id into new_room_id;
  insert into public.party_members(room_id, user_id) values(new_room_id, uid);
  return public.party_room_payload(new_room_id);
end $$;

create or replace function public.get_party_room(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  return public.party_room_payload(p_room);
end $$;

create or replace function public.join_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); room public.party_rooms;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if exists(select 1 from public.party_members where room_id = p_room and user_id = uid) then return public.party_room_payload(p_room); end if;
  if room.started_at is not null then raise exception 'already_started'; end if;
  if (select count(*) from public.party_members where room_id = p_room) >= 8 then raise exception 'room_full'; end if;
  if not exists(select 1 from public.profiles where id = uid) then raise exception 'profile_required'; end if;
  insert into public.party_members(room_id, user_id) values(p_room, uid);
  return public.party_room_payload(p_room);
end $$;

create or replace function public.ready_party_room(p_room uuid, p_ready boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.started_at is not null then raise exception 'already_started'; end if;
  update public.party_members set ready = coalesce(p_ready, false) where room_id = p_room and user_id = auth.uid();
  if not found then raise exception 'not_joined'; end if;
  return public.party_room_payload(p_room);
end $$;

create or replace function public.start_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is not null then return public.party_room_payload(p_room); end if;
  if (select count(*) from public.party_members where room_id = p_room) < 2 then raise exception 'need_players'; end if;
  if exists(select 1 from public.party_members where room_id = p_room and not ready) then raise exception 'not_ready'; end if;
  update public.party_rooms set started_at = clock_timestamp() + interval '5 seconds' where id = p_room;
  return public.party_room_payload(p_room);
end $$;

create or replace function public.submit_party_result(p_room uuid, p_match integer, p_round integer, p_score numeric, p_detail jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms; round_start timestamptz; round_end timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if not exists(select 1 from public.party_members where room_id = p_room and user_id = auth.uid()) then raise exception 'not_joined'; end if;
  if room.started_at is null or p_match is distinct from room.match_no then raise exception 'wrong_match'; end if;
  if p_round is null or p_round < 0 or p_round > 5 then raise exception 'bad_round'; end if;
  -- Idempotent retry of an already received result never changes the score.
  if exists(select 1 from public.party_results where room_id = p_room and match_no = p_match and user_id = auth.uid() and round_no = p_round) then return public.party_room_payload(p_room); end if;
  round_start := room.started_at + make_interval(secs => public.party_round_offset(p_round));
  round_end := round_start + make_interval(secs => public.party_round_duration(p_round));
  if clock_timestamp() < round_start or clock_timestamp() > round_end + interval '2 seconds' then raise exception 'round_closed'; end if;
  if p_score is null or p_score::text in ('NaN', 'Infinity', '-Infinity') or p_score < 0 or p_score > 100 then raise exception 'bad_score'; end if;
  if octet_length(coalesce(p_detail, '{}'::jsonb)::text) > 24000 then raise exception 'bad_detail'; end if;
  insert into public.party_results(room_id, match_no, user_id, round_no, score, detail)
    values(p_room, p_match, auth.uid(), p_round, round(p_score, 2), coalesce(p_detail, '{}'::jsonb));
  return public.party_room_payload(p_room);
end $$;

create or replace function public.rematch_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is null or clock_timestamp() < room.started_at + interval '81 seconds' then raise exception 'match_not_finished'; end if;
  update public.party_rooms set match_no = match_no + 1, started_at = null where id = p_room;
  update public.party_members set ready = false where room_id = p_room;
  return public.party_room_payload(p_room);
end $$;

revoke all on function public.create_party_room(), public.get_party_room(uuid), public.join_party_room(uuid),
  public.ready_party_room(uuid,boolean), public.start_party_room(uuid), public.submit_party_result(uuid,integer,integer,numeric,jsonb),
  public.rematch_party_room(uuid) from public, anon, authenticated;
grant execute on function public.create_party_room(), public.get_party_room(uuid), public.join_party_room(uuid),
  public.ready_party_room(uuid,boolean), public.start_party_room(uuid), public.submit_party_result(uuid,integer,integer,numeric,jsonb),
  public.rematch_party_room(uuid) to authenticated;

commit;


-- Equal party round timers (20261112040000).
begin;

-- Uniform 16-second rounds; difficulty comes from shape complexity.
-- Each round still has a six-second reveal (22 seconds per round).
create or replace function public.party_round_offset(p_round integer)
returns integer language sql immutable set search_path = '' as $$
  select greatest(0, least(p_round, 6)) * 22;
$$;
create or replace function public.party_round_duration(p_round integer)
returns integer language sql immutable set search_path = '' as $$
  select case when p_round between 0 and 5 then 16 else 0 end;
$$;
revoke all on function public.party_round_offset(integer), public.party_round_duration(integer) from public, anon, authenticated;

create or replace function public.rematch_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is null or clock_timestamp() < room.started_at + make_interval(secs => public.party_round_offset(6)) then raise exception 'match_not_finished'; end if;
  update public.party_rooms set match_no = match_no + 1, started_at = null where id = p_room;
  update public.party_members set ready = false where room_id = p_room;
  return public.party_room_payload(p_room);
end $$;

revoke all on function public.rematch_party_room(uuid) from public, anon, authenticated;
grant execute on function public.rematch_party_room(uuid) to authenticated;

commit;


-- Party match history
begin;

-- Record the roster so players who miss all six rounds still appear in history.
create table if not exists public.party_match_players (
  room_id uuid not null,
  match_no integer not null,
  user_id uuid not null,
  primary key (room_id, match_no, user_id),
  foreign key (room_id, user_id) references public.party_members(room_id, user_id) on delete cascade
);
alter table public.party_match_players enable row level security;
revoke all on public.party_match_players from public, anon, authenticated;

create or replace function public.start_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is not null then return public.party_room_payload(p_room); end if;
  if (select count(*) from public.party_members where room_id = p_room) < 2 then raise exception 'need_players'; end if;
  if exists(select 1 from public.party_members where room_id = p_room and not ready) then raise exception 'not_ready'; end if;
  insert into public.party_match_players (room_id, match_no, user_id)
    select p_room, room.match_no, user_id from public.party_members where room_id = p_room
    on conflict do nothing;
  update public.party_rooms set started_at = clock_timestamp() + interval '5 seconds' where id = p_room;
  return public.party_room_payload(p_room);
end $$;

create or replace function public.get_party_match(p_room uuid, p_match integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if not exists(select 1 from public.party_members where room_id = p_room and user_id = auth.uid()) then raise exception 'not_joined'; end if;
  if p_match is null or p_match < 1 or p_match >= room.match_no then raise exception 'match_not_finished'; end if;
  return jsonb_build_object(
    'match_no', p_match,
    'roster_complete', exists(select 1 from public.party_match_players where room_id = p_room and match_no = p_match),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'name', p.nickname, 'is_me', m.user_id = auth.uid(), 'is_host', m.user_id = room.host_id, 'ready', false,
      'results', coalesce((select jsonb_agg(jsonb_build_object('round', r.round_no, 'score', r.score) order by r.round_no)
        from public.party_results r where r.room_id = p_room and r.match_no = p_match and r.user_id = m.user_id), '[]'::jsonb)
    ) order by m.joined_at, m.user_id)
      from public.party_members m join public.profiles p on p.id = m.user_id
      where m.room_id = p_room and (
        exists(select 1 from public.party_match_players mp where mp.room_id = p_room and mp.match_no = p_match and mp.user_id = m.user_id)
        or exists(select 1 from public.party_results r where r.room_id = p_room and r.match_no = p_match and r.user_id = m.user_id)
      )), '[]'::jsonb)
  );
end $$;

revoke all on function public.start_party_room(uuid), public.get_party_match(uuid, integer) from public, anon, authenticated;
grant execute on function public.start_party_room(uuid), public.get_party_match(uuid, integer) to authenticated;

commit;


-- Public party activity totals.
begin;

-- Aggregate only: no room links, player identities, or scores are exposed.
-- Every restart advances match_no only after the previous match finishes.
create or replace function public.get_party_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'parties_created', count(*),
    'games_played', coalesce(sum(greatest(match_no - 1, 0) +
      case when started_at is not null and
        now() >= started_at + make_interval(secs => public.party_round_offset(6))
      then 1 else 0 end), 0)
  ) from public.party_rooms;
$$;
revoke all on function public.get_party_stats() from public, anon, authenticated;
grant execute on function public.get_party_stats() to anon, authenticated;

commit;


-- Host-selected Party match length
begin;

alter table public.party_rooms add column if not exists round_count integer not null default 6 check (round_count between 2 and 12);
alter table public.party_results drop constraint if exists party_results_round_no_check;
alter table public.party_results add constraint party_results_round_no_check check (round_no between 0 and 11);

-- Snapshot each match length so later lobby changes cannot change its history.
create table if not exists public.party_match_settings (
  room_id uuid not null references public.party_rooms(id) on delete cascade,
  match_no integer not null,
  round_count integer not null check (round_count between 2 and 12),
  primary key (room_id, match_no)
);
alter table public.party_match_settings enable row level security;
revoke all on public.party_match_settings from public, anon, authenticated;
insert into public.party_match_settings (room_id, match_no, round_count)
  select distinct room_id, match_no, 6 from public.party_results on conflict do nothing;
insert into public.party_match_settings (room_id, match_no, round_count)
  select id, match_no, round_count from public.party_rooms where started_at is not null on conflict do nothing;

create or replace function public.party_round_offset(p_round integer)
returns integer language sql immutable set search_path = '' as $$
  select greatest(0, least(p_round, 12)) * 22;
$$;
create or replace function public.party_round_duration(p_round integer)
returns integer language sql immutable set search_path = '' as $$
  select case when p_round between 0 and 11 then 16 else 0 end;
$$;
revoke all on function public.party_round_offset(integer), public.party_round_duration(integer) from public, anon, authenticated;

create or replace function public.set_party_round_count(p_room uuid, p_round_count integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is not null then raise exception 'already_started'; end if;
  if p_round_count is null or p_round_count < 2 or p_round_count > 12 then raise exception 'bad_round_count'; end if;
  if room.round_count is distinct from p_round_count then
    update public.party_rooms set round_count = p_round_count where id = p_room;
    update public.party_members set ready = false where room_id = p_room;
  end if;
  return public.party_room_payload(p_room);
end $$;

create or replace function public.party_room_payload(p_room uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'round_count', room.round_count, 'token', room.id, 'match_no', room.match_no, 'started_at', room.started_at,
    'expires_at', room.expires_at, 'server_now', clock_timestamp(),
    'is_host', room.host_id = auth.uid(),
    'joined', exists(select 1 from public.party_members m where m.room_id = room.id and m.user_id = auth.uid()),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'name', p.nickname, 'is_me', m.user_id = auth.uid(), 'is_host', m.user_id = room.host_id, 'ready', m.ready,
      'results', coalesce((select jsonb_agg(jsonb_build_object(
        'round', r.round_no, 'score', case when r.user_id = auth.uid() or
          clock_timestamp() >= room.started_at + make_interval(secs => public.party_round_offset(r.round_no) + public.party_round_duration(r.round_no))
          then r.score else null end
      ) order by r.round_no) from public.party_results r where r.room_id = room.id and r.match_no = room.match_no and r.user_id = m.user_id), '[]'::jsonb)
    ) order by m.joined_at, m.user_id) from public.party_members m join public.profiles p on p.id = m.user_id where m.room_id = room.id), '[]'::jsonb)
  ) from public.party_rooms room where room.id = p_room;
$$;

create or replace function public.start_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is not null then return public.party_room_payload(p_room); end if;
  if (select count(*) from public.party_members where room_id = p_room) < 2 then raise exception 'need_players'; end if;
  if exists(select 1 from public.party_members where room_id = p_room and not ready) then raise exception 'not_ready'; end if;
  insert into public.party_match_settings (room_id, match_no, round_count)
    values (p_room, room.match_no, room.round_count) on conflict do nothing;
  insert into public.party_match_players (room_id, match_no, user_id)
    select p_room, room.match_no, user_id from public.party_members where room_id = p_room
    on conflict do nothing;
  update public.party_rooms set started_at = clock_timestamp() + interval '5 seconds' where id = p_room;
  return public.party_room_payload(p_room);
end $$;

create or replace function public.submit_party_result(p_room uuid, p_match integer, p_round integer, p_score numeric, p_detail jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms; round_start timestamptz; round_end timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if not exists(select 1 from public.party_members where room_id = p_room and user_id = auth.uid()) then raise exception 'not_joined'; end if;
  if room.started_at is null or p_match is distinct from room.match_no then raise exception 'wrong_match'; end if;
  if p_round is null or p_round < 0 or p_round >= room.round_count then raise exception 'bad_round'; end if;
  -- Idempotent retry of an already received result never changes the score.
  if exists(select 1 from public.party_results where room_id = p_room and match_no = p_match and user_id = auth.uid() and round_no = p_round) then return public.party_room_payload(p_room); end if;
  round_start := room.started_at + make_interval(secs => public.party_round_offset(p_round));
  round_end := round_start + make_interval(secs => public.party_round_duration(p_round));
  if clock_timestamp() < round_start or clock_timestamp() > round_end + interval '2 seconds' then raise exception 'round_closed'; end if;
  if p_score is null or p_score::text in ('NaN', 'Infinity', '-Infinity') or p_score < 0 or p_score > 100 then raise exception 'bad_score'; end if;
  if octet_length(coalesce(p_detail, '{}'::jsonb)::text) > 24000 then raise exception 'bad_detail'; end if;
  insert into public.party_results(room_id, match_no, user_id, round_no, score, detail)
    values(p_room, p_match, auth.uid(), p_round, round(p_score, 2), coalesce(p_detail, '{}'::jsonb));
  return public.party_room_payload(p_room);
end $$;

create or replace function public.rematch_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is null or clock_timestamp() < room.started_at + make_interval(secs => public.party_round_offset(room.round_count)) then raise exception 'match_not_finished'; end if;
  update public.party_rooms set match_no = match_no + 1, started_at = null where id = p_room;
  update public.party_members set ready = false where room_id = p_room;
  return public.party_room_payload(p_room);
end $$;

create or replace function public.get_party_match(p_room uuid, p_match integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if not exists(select 1 from public.party_members where room_id = p_room and user_id = auth.uid()) then raise exception 'not_joined'; end if;
  if p_match is null or p_match < 1 or p_match >= room.match_no then raise exception 'match_not_finished'; end if;
  return jsonb_build_object(
    'match_no', p_match,
    'round_count', coalesce((select round_count from public.party_match_settings where room_id = p_room and match_no = p_match), 6),
    'roster_complete', exists(select 1 from public.party_match_players where room_id = p_room and match_no = p_match),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'name', p.nickname, 'is_me', m.user_id = auth.uid(), 'is_host', m.user_id = room.host_id, 'ready', false,
      'results', coalesce((select jsonb_agg(jsonb_build_object('round', r.round_no, 'score', r.score) order by r.round_no)
        from public.party_results r where r.room_id = p_room and r.match_no = p_match and r.user_id = m.user_id), '[]'::jsonb)
    ) order by m.joined_at, m.user_id)
      from public.party_members m join public.profiles p on p.id = m.user_id
      where m.room_id = p_room and (
        exists(select 1 from public.party_match_players mp where mp.room_id = p_room and mp.match_no = p_match and mp.user_id = m.user_id)
        or exists(select 1 from public.party_results r where r.room_id = p_room and r.match_no = p_match and r.user_id = m.user_id)
      )), '[]'::jsonb)
  );
end $$;

revoke all on function public.party_room_payload(uuid) from public, anon, authenticated;
revoke all on function public.set_party_round_count(uuid, integer), public.start_party_room(uuid),
  public.submit_party_result(uuid,integer,integer,numeric,jsonb), public.rematch_party_room(uuid), public.get_party_match(uuid,integer) from public, anon, authenticated;
grant execute on function public.set_party_round_count(uuid, integer), public.start_party_room(uuid),
  public.submit_party_result(uuid,integer,integer,numeric,jsonb), public.rematch_party_room(uuid), public.get_party_match(uuid,integer) to authenticated;

commit;


-- Match activity follows the host-selected round count.
create or replace function public.get_party_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'parties_created', count(*),
    'games_played', coalesce(sum(greatest(match_no - 1, 0) +
      case when started_at is not null and
        now() >= started_at + make_interval(secs => public.party_round_offset(round_count))
      then 1 else 0 end), 0)
  ) from public.party_rooms;
$$;
revoke all on function public.get_party_stats() from public, anon, authenticated;
grant execute on function public.get_party_stats() to anon, authenticated;


begin;
alter table public.party_members add column if not exists active boolean not null default true;
alter table public.party_members add column if not exists kicked boolean not null default false;
create or replace function public.party_room_payload(p_room uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'round_count', room.round_count, 'token', room.id, 'match_no', room.match_no, 'started_at', room.started_at,
    'expires_at', room.expires_at, 'server_now', clock_timestamp(),
    'is_host', room.host_id = auth.uid(),
    'joined', exists(select 1 from public.party_members m where m.room_id = room.id and m.user_id = auth.uid() and m.active),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'name', p.nickname, 'player_id', m.user_id, 'is_me', m.user_id = auth.uid(), 'is_host', m.user_id = room.host_id, 'ready', m.ready,
      'results', coalesce((select jsonb_agg(jsonb_build_object(
        'round', r.round_no, 'detail', case when r.user_id = auth.uid() or clock_timestamp() >= room.started_at + make_interval(secs => public.party_round_offset(r.round_no) + public.party_round_duration(r.round_no)) then r.detail else null end, 'score', case when r.user_id = auth.uid() or
          clock_timestamp() >= room.started_at + make_interval(secs => public.party_round_offset(r.round_no) + public.party_round_duration(r.round_no))
          then r.score else null end
      ) order by r.round_no) from public.party_results r where r.room_id = room.id and r.match_no = room.match_no and r.user_id = m.user_id), '[]'::jsonb)
    ) order by m.joined_at, m.user_id) from public.party_members m join public.profiles p on p.id = m.user_id where m.room_id = room.id and m.active), '[]'::jsonb)
  ) from public.party_rooms room where room.id = p_room;
$$;
create or replace function public.start_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is not null then return public.party_room_payload(p_room); end if;
  if (select count(*) from public.party_members where room_id = p_room and active) < 2 then raise exception 'need_players'; end if;
  if exists(select 1 from public.party_members where room_id = p_room and active and not ready) then raise exception 'not_ready'; end if;
  insert into public.party_match_settings (room_id, match_no, round_count)
    values (p_room, room.match_no, room.round_count) on conflict do nothing;
  insert into public.party_match_players (room_id, match_no, user_id)
    select p_room, room.match_no, user_id from public.party_members where room_id = p_room and active
    on conflict do nothing;
  update public.party_rooms set started_at = clock_timestamp() + interval '5 seconds' where id = p_room;
  return public.party_room_payload(p_room);
end $$;
create or replace function public.ready_party_room(p_room uuid, p_ready boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.started_at is not null then raise exception 'already_started'; end if;
  update public.party_members set ready = coalesce(p_ready, false) where room_id = p_room and user_id = auth.uid() and active;
  if not found then raise exception 'not_joined'; end if;
  return public.party_room_payload(p_room);
end $$;
create or replace function public.join_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); room public.party_rooms;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if exists(select 1 from public.party_members where room_id = p_room and user_id = uid and active) then return public.party_room_payload(p_room); end if;
  if exists(select 1 from public.party_members where room_id = p_room and user_id = uid and kicked) then raise exception 'removed_player'; end if;
  if room.started_at is not null then raise exception 'already_started'; end if;
  if (select count(*) from public.party_members where room_id = p_room and active) >= 8 then raise exception 'room_full'; end if;
  if not exists(select 1 from public.profiles where id = uid) then raise exception 'profile_required'; end if;
  insert into public.party_members(room_id, user_id) values(p_room, uid) on conflict (room_id, user_id) do update set active = true, ready = false;
  return public.party_room_payload(p_room);
end $$;
create or replace function public.submit_party_result(p_room uuid, p_match integer, p_round integer, p_score numeric, p_detail jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms; round_start timestamptz; round_end timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if not exists(select 1 from public.party_members where room_id = p_room and user_id = auth.uid() and active) then raise exception 'not_joined'; end if;
  if room.started_at is null or p_match is distinct from room.match_no then raise exception 'wrong_match'; end if;
  if p_round is null or p_round < 0 or p_round >= room.round_count then raise exception 'bad_round'; end if;
  -- Idempotent retry of an already received result never changes the score.
  if exists(select 1 from public.party_results where room_id = p_room and match_no = p_match and user_id = auth.uid() and round_no = p_round) then return public.party_room_payload(p_room); end if;
  round_start := room.started_at + make_interval(secs => public.party_round_offset(p_round));
  round_end := round_start + make_interval(secs => public.party_round_duration(p_round));
  if clock_timestamp() < round_start or clock_timestamp() > round_end + interval '2 seconds' then raise exception 'round_closed'; end if;
  if p_score is null or p_score::text in ('NaN', 'Infinity', '-Infinity') or p_score < 0 or p_score > 100 then raise exception 'bad_score'; end if;
  if octet_length(coalesce(p_detail, '{}'::jsonb)::text) > 24000 then raise exception 'bad_detail'; end if;
  insert into public.party_results(room_id, match_no, user_id, round_no, score, detail)
    values(p_room, p_match, auth.uid(), p_round, round(p_score, 2), coalesce(p_detail, '{}'::jsonb));
  return public.party_room_payload(p_room);
end $$;
create or replace function public.leave_party_room(p_room uuid, p_player uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms; target uuid := coalesce(p_player, auth.uid()); next_host uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found then raise exception 'invalid_room'; end if;
  if not exists(select 1 from public.party_members where room_id = p_room and user_id = auth.uid() and active) then raise exception 'not_joined'; end if;
  if target <> auth.uid() and room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is not null and clock_timestamp() < room.started_at + make_interval(secs => public.party_round_offset(room.round_count)) then raise exception 'match_in_progress'; end if;
  update public.party_members set active = false, ready = false, kicked = (target <> auth.uid()) where room_id = p_room and user_id = target;
  if target = room.host_id then
    select user_id into next_host from public.party_members where room_id = p_room and active order by joined_at, user_id limit 1;
    if next_host is null then update public.party_rooms set expires_at = now() where id = p_room;
    else update public.party_rooms set host_id = next_host where id = p_room; end if;
  end if;
end $$;
revoke all on function public.leave_party_room(uuid,uuid), public.party_room_payload(uuid) from public, anon, authenticated;
grant execute on function public.leave_party_room(uuid,uuid) to authenticated;
commit;
