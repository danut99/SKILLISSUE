-- SKILL ISSUE: run once in Supabase → SQL Editor
-- Players get a silent anonymous auth user; linking Google/email keeps the SAME id.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nickname   text not null check (char_length(nickname) between 1 and 15),
  created_at timestamptz not null default now()
);
-- reserved nicknames: one owner per name (case-insensitive)
create unique index if not exists profiles_nickname_key on public.profiles (lower(nickname));

-- every single try (enforces 5/day/mode on the server, enables cross-device resume)
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
  select 5 + count(*) into allowed from bonuses where user_id = uid and play_date = d and mode = p_mode;
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
declare v text := btrim(coalesce(p_nickname, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(v) not between 1 and 15 or v !~ '^[A-Za-z0-9][A-Za-z0-9 _-]*$' then raise exception 'bad_nickname'; end if;
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
        'attempts_remaining', greatest(0, 5 +
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


-- Past-day score challenges (20261113000000).
-- Accepting a challenge from an earlier day lets the player try that day's puzzle.
-- Scores are stored under the challenge's play_date, so they never reach today's
-- daily board but do count in the all-time board and in the challenge comparison.
begin;

alter table public.attempts
  add column if not exists challenge_id uuid references public.score_challenges(id) on delete set null;

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
  if challenge.play_date > (now() at time zone 'utc')::date then raise exception 'invalid_challenge'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'profile_required'; end if;
  insert into public.score_challenge_players (challenge_id, user_id) values (p_token, uid) on conflict do nothing;
  return public.score_challenge_payload(p_token);
end $$;

-- Record one try on an accepted challenge's day (5 tries per mode per day, shared
-- with any normal tries from that day). Mode and date come from the challenge.
create or replace function public.record_challenge_attempt(p_token uuid, p_score numeric, p_detail jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  challenge public.score_challenges;
  used int;
  allowed int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_score is null or p_score < 0 or p_score > 100 then raise exception 'bad_score'; end if;
  select * into challenge from public.score_challenges where id = p_token;
  if not found then raise exception 'invalid_challenge'; end if;
  if challenge.play_date > (now() at time zone 'utc')::date then raise exception 'invalid_challenge'; end if;
  if not exists (select 1 from public.score_challenge_players r where r.challenge_id = p_token and r.user_id = uid) then
    raise exception 'not_accepted';
  end if;
  perform pg_advisory_xact_lock(hashtext(uid::text || challenge.play_date::text || challenge.mode));
  select count(*) into used from public.attempts
    where user_id = uid and play_date = challenge.play_date and mode = challenge.mode;
  select 5 + count(*) into allowed from public.bonuses
    where user_id = uid and play_date = challenge.play_date and mode = challenge.mode;
  if used >= allowed then raise exception 'no_tries_left'; end if;

  insert into public.attempts (user_id, play_date, mode, score, detail, challenge_id)
  values (uid, challenge.play_date, challenge.mode, round(p_score, 2), coalesce(p_detail, '{}'::jsonb), p_token);

  insert into public.daily_scores (user_id, play_date, mode, score, detail)
  values (uid, challenge.play_date, challenge.mode, round(p_score, 2), coalesce(p_detail, '{}'::jsonb))
  on conflict (user_id, play_date, mode) do update
    set score = excluded.score, detail = excluded.detail, updated_at = now()
    where excluded.score > public.daily_scores.score;

  return jsonb_build_object('used', used + 1, 'allowed', allowed);
end $$;

-- Challenge replays must not count as "played that day" for streaks.
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
       where user_id = auth.uid() and play_date > (now() at time zone 'utc')::date - 400
         and (challenge_id is null or play_date = (now() at time zone 'utc')::date)), '[]'::jsonb)
  );
$$;

revoke all on function public.record_challenge_attempt(uuid, numeric, jsonb) from public, anon, authenticated;
-- Remove only empty anonymous accounts, hourly, after at least one day.
-- Remove only empty anonymous accounts, hourly, after at least one hour.
-- Run as postgres in Supabase SQL Editor after the preceding migrations.
begin;

create extension if not exists pg_cron with schema pg_catalog;

-- Invoker permissions are intentional: only the database administrator runs this.
create or replace function public.cleanup_empty_anonymous_accounts()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  removed bigint;
begin
  delete from auth.users u
  where u.is_anonymous is true
    and u.created_at < now() - interval '1 day'
    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '1 day'
    -- Preserve linked accounts and email confirmations still in progress.
    and coalesce(u.email, '') = ''
    and coalesce(u.email_change, '') = ''
    and coalesce(u.phone, '') = ''
    and not exists (
      select 1 from auth.identities i
      where i.user_id = u.id and i.provider <> 'anonymous'
    )
    -- A single saved try is enough to keep a guest, permanently.
    and not exists (select 1 from public.attempts a where a.user_id = u.id)
    and not exists (select 1 from public.daily_scores s where s.user_id = u.id)
    and not exists (select 1 from public.bonuses b where b.user_id = u.id)
    -- Also preserve social activity and Party history, even without a score.
    and not exists (select 1 from public.friends f where f.user_id = u.id or f.friend_id = u.id)
    and not exists (select 1 from public.friend_invites i where i.user_id = u.id)
    and not exists (select 1 from public.score_challenges c where c.creator_id = u.id)
    and not exists (select 1 from public.score_challenge_players p where p.user_id = u.id)
    and not exists (select 1 from public.party_rooms r where r.host_id = u.id)
    and not exists (select 1 from public.party_members m where m.user_id = u.id)
    and not exists (select 1 from public.party_results r where r.user_id = u.id)
    and not exists (select 1 from public.party_match_players p where p.user_id = u.id);

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.cleanup_empty_anonymous_accounts() from public, anon, authenticated;

-- Reusing the job name updates its schedule rather than creating duplicate jobs.
select cron.schedule(
  'cleanup-empty-anonymous-accounts',
  '17 * * * *',
  'select public.cleanup_empty_anonymous_accounts();'
);

commit;

begin;
create table if not exists public.skill_levels (
 user_id uuid not null references public.profiles(id) on delete cascade,
 mode text not null check(mode in ('draw','cut','brake')),
 level integer not null default 1 check(level between 1 and 6),
 attempt_day date not null default (now() at time zone 'utc')::date,
 used integer not null default 0 check(used between 0 and 3),
 primary key(user_id,mode)
);
create table if not exists public.skill_level_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 mode text not null,
 level integer not null,
 created_at timestamptz not null default now(),
 score numeric,
 finished boolean not null default false
);
alter table public.skill_levels enable row level security;
alter table public.skill_level_attempts enable row level security;
revoke all on public.skill_levels,public.skill_level_attempts from public,anon,authenticated;

create or replace function public.get_skill_levels()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('mode',mode,'level',level,'used',case when attempt_day = (now() at time zone 'utc')::date then used else 0 end)) from public.skill_levels where user_id=auth.uid()),'[]'::jsonb);
end $$;

create or replace function public.start_skill_level(p_mode text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare progress public.skill_levels; attempt_id uuid; d date := (now() at time zone 'utc')::date;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if p_mode is null or p_mode not in ('draw','cut','brake') then raise exception 'bad_mode'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':level:' || p_mode));
 insert into public.skill_levels(user_id,mode) values(auth.uid(),p_mode) on conflict do nothing;
 select * into progress from public.skill_levels where user_id=auth.uid() and mode=p_mode for update;
 if progress.level > 5 then raise exception 'ladder_complete'; end if;
 if progress.attempt_day <> d then progress.used := 0; end if;
 if progress.used >= 3 then raise exception 'no_level_tries'; end if;
 -- A new start forfeits an unfinished attempt, preventing parallel replays.
 update public.skill_level_attempts set finished=true where user_id=auth.uid() and mode=p_mode and not finished;
 update public.skill_levels set used=progress.used+1,attempt_day=d where user_id=auth.uid() and mode=p_mode;
 insert into public.skill_level_attempts(user_id,mode,level) values(auth.uid(),p_mode,progress.level) returning id into attempt_id;
 return jsonb_build_object('token',attempt_id,'mode',p_mode,'level',progress.level,'used',progress.used+1);
end $$;

create or replace function public.finish_skill_level(p_token uuid,p_score numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare attempt public.skill_level_attempts; progress public.skill_levels;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into attempt from public.skill_level_attempts where id=p_token and user_id=auth.uid();
 if not found then raise exception 'invalid_attempt'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':level:' || attempt.mode));
 select * into attempt from public.skill_level_attempts where id=p_token for update;
 select * into progress from public.skill_levels where user_id=auth.uid() and mode=attempt.mode for update;
 if not attempt.finished then
   if p_score is null or p_score::text in ('NaN','Infinity','-Infinity') or p_score<0 or p_score>100 then raise exception 'bad_score'; end if;
   if attempt.created_at + interval '2 minutes' < now() then raise exception 'attempt_expired'; end if;
   update public.skill_level_attempts set score=round(p_score,2),finished=true where id=p_token;
   if p_score>=90 and progress.level=attempt.level then
     update public.skill_levels set level=level+1,used=0,attempt_day=(now() at time zone 'utc')::date where user_id=auth.uid() and mode=attempt.mode;
   end if;
 end if;
 return public.get_skill_levels();
end $$;
revoke all on function public.get_skill_levels(),public.start_skill_level(text),public.finish_skill_level(uuid,numeric) from public,anon,authenticated;
grant execute on function public.get_skill_levels(),public.start_skill_level(text),public.finish_skill_level(uuid,numeric) to authenticated;
commit;

begin;
alter table public.skill_levels drop constraint if exists skill_levels_level_check;
alter table public.skill_levels add constraint skill_levels_level_check
 check(level between 1 and case when mode = 'brake' then 6 else 11 end);
-- Existing Draw/Cut level 6 represents five cleared levels; it now unlocks level 6.
create or replace function public.start_skill_level(p_mode text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare progress public.skill_levels; attempt_id uuid; d date := (now() at time zone 'utc')::date;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if p_mode is null or p_mode not in ('draw','cut','brake') then raise exception 'bad_mode'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':level:' || p_mode));
 insert into public.skill_levels(user_id,mode) values(auth.uid(),p_mode) on conflict do nothing;
 select * into progress from public.skill_levels where user_id=auth.uid() and mode=p_mode for update;
 if progress.level > (case when p_mode = 'brake' then 5 else 10 end) then raise exception 'ladder_complete'; end if;
 if progress.attempt_day <> d then progress.used := 0; end if;
 if progress.used >= 3 then raise exception 'no_level_tries'; end if;
 -- A new start forfeits an unfinished attempt, preventing parallel replays.
 update public.skill_level_attempts set finished=true where user_id=auth.uid() and mode=p_mode and not finished;
 update public.skill_levels set used=progress.used+1,attempt_day=d where user_id=auth.uid() and mode=p_mode;
 insert into public.skill_level_attempts(user_id,mode,level) values(auth.uid(),p_mode,progress.level) returning id into attempt_id;
 return jsonb_build_object('token',attempt_id,'mode',p_mode,'level',progress.level,'used',progress.used+1);
end $$;
revoke all on function public.start_skill_level(text) from public,anon,authenticated;
grant execute on function public.start_skill_level(text) to authenticated;
commit;

-- Reveal immediately once every player has submitted; keep six seconds to compare.
-- Run after the Party social and round-count migrations.
begin;

create or replace function public.submit_party_result(p_room uuid, p_match integer, p_round integer, p_score numeric, p_detail jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms; round_start timestamptz; round_end timestamptz; completed_at timestamptz;
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
  -- The room row lock serializes submissions. Only the last new result can
  -- shorten this round; duplicate retries above never advance the clock twice.
  completed_at := clock_timestamp();
  if completed_at < round_end
    and exists(select 1 from public.party_members m where m.room_id = p_room and m.active)
    and not exists (
      select 1 from public.party_members m
      where m.room_id = p_room and m.active
        and not exists (
          select 1 from public.party_results r
          where r.room_id = p_room and r.match_no = p_match
            and r.round_no = p_round and r.user_id = m.user_id
        )
    )
  then
    -- Move the shared schedule forward by the unused play time. Existing
    -- reveal, next-round, rematch and score-visibility rules use this same clock.
    -- Keep the full six-second reveal so everyone can compare attempts.
    update public.party_rooms
      set started_at = started_at - (round_end - completed_at)
      where id = p_room;
  end if;
  return public.party_room_payload(p_room);
end $$;

-- CREATE OR REPLACE preserves the existing authenticated-only RPC permissions.
commit;

-- New matches rotate Draw / Cut / Brake; keep existing matches and history unchanged.
begin;
alter table public.party_match_settings
  add column if not exists game_version integer not null default 1
    check (game_version in (1, 2));

create or replace function public.party_room_payload(p_room uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'game_version', coalesce((select game_version from public.party_match_settings where room_id = room.id and match_no = room.match_no), case when room.started_at is null then 2 else 1 end),
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
  insert into public.party_match_settings (room_id, match_no, round_count, game_version)
    values (p_room, room.match_no, room.round_count, 2) on conflict do nothing;
  insert into public.party_match_players (room_id, match_no, user_id)
    select p_room, room.match_no, user_id from public.party_members where room_id = p_room and active
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
    'game_version', coalesce((select game_version from public.party_match_settings where room_id = p_room and match_no = p_match), 1),
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

-- Existing RPC permissions are preserved by CREATE OR REPLACE.
commit;

-- Host chooses any one, two, or all three games.
-- Includes the car-round version column if that migration was not run yet.
begin;
alter table public.party_match_settings
  add column if not exists game_version integer not null default 1
    check (game_version in (1, 2));

alter table public.party_rooms
  add column if not exists selected_games text[] not null default array['draw','cut','brake']::text[]
  check (cardinality(selected_games) between 1 and 3
    and selected_games <@ array['draw','cut','brake']::text[]
    and array_position(selected_games, null) is null);
-- Nullable for legacy matches; those retain their version-one/two rules.
alter table public.party_match_settings
  add column if not exists selected_games text[];

create or replace function public.party_room_payload(p_room uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'selected_games', coalesce((select selected_games from public.party_match_settings where room_id = room.id and match_no = room.match_no), room.selected_games),
    'game_version', coalesce((select game_version from public.party_match_settings where room_id = room.id and match_no = room.match_no), case when room.started_at is null then 2 else 1 end),
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
  insert into public.party_match_settings (room_id, match_no, round_count, game_version, selected_games)
    values (p_room, room.match_no, room.round_count, 2, room.selected_games) on conflict do nothing;
  insert into public.party_match_players (room_id, match_no, user_id)
    select p_room, room.match_no, user_id from public.party_members where room_id = p_room and active
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
    'selected_games', coalesce((select selected_games from public.party_match_settings where room_id = p_room and match_no = p_match), array['draw','cut','brake']::text[]),
    'game_version', coalesce((select game_version from public.party_match_settings where room_id = p_room and match_no = p_match), 1),
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

create or replace function public.set_party_games(p_room uuid, p_games text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms; chosen text[];
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.party_rooms where id = p_room for update;
  if not found or room.expires_at <= now() then raise exception 'invalid_room'; end if;
  if room.host_id <> auth.uid() then raise exception 'host_only'; end if;
  if room.started_at is not null then raise exception 'already_started'; end if;
  if p_games is null or array_ndims(p_games) is distinct from 1
    or cardinality(p_games) not between 1 and 3
    or array_position(p_games, null) is not null
    or not (p_games <@ array['draw','cut','brake']::text[]) then
    raise exception 'bad_party_games';
  end if;
  -- Canonical order avoids changing the rotation when selecting the same set.
  select array_agg(mode order by position) into chosen
    from unnest(array['draw','cut','brake']::text[]) with ordinality as games(mode, position)
    where mode = any(p_games);
  if cardinality(chosen) <> cardinality(p_games) then raise exception 'bad_party_games'; end if;
  if room.selected_games is distinct from chosen then
    update public.party_rooms set selected_games = chosen where id = p_room;
    update public.party_members set ready = false where room_id = p_room;
  end if;
  return public.party_room_payload(p_room);
end $$;

-- Creation and configuration happen in one transaction: a failure leaves no room.
create or replace function public.create_party_room_with_games(p_games text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare created jsonb;
begin
  created := public.create_party_room();
  return public.set_party_games((created->>'token')::uuid, p_games);
end $$;

revoke all on function public.set_party_games(uuid,text[]), public.create_party_room_with_games(text[]) from public, anon, authenticated;
grant execute on function public.set_party_games(uuid,text[]), public.create_party_room_with_games(text[]) to authenticated;
commit;

-- Lower the Level mode pass threshold for all three games.
begin;
create or replace function public.finish_skill_level(p_token uuid,p_score numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare attempt public.skill_level_attempts; progress public.skill_levels;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into attempt from public.skill_level_attempts where id=p_token and user_id=auth.uid();
 if not found then raise exception 'invalid_attempt'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':level:' || attempt.mode));
 select * into attempt from public.skill_level_attempts where id=p_token for update;
 select * into progress from public.skill_levels where user_id=auth.uid() and mode=attempt.mode for update;
 if not attempt.finished then
   if p_score is null or p_score::text in ('NaN','Infinity','-Infinity') or p_score<0 or p_score>100 then raise exception 'bad_score'; end if;
   if attempt.created_at + interval '2 minutes' < now() then raise exception 'attempt_expired'; end if;
   update public.skill_level_attempts set score=round(p_score,2),finished=true where id=p_token;
   if p_score>=85 and progress.level=attempt.level then
     update public.skill_levels set level=level+1,used=0,attempt_day=(now() at time zone 'utc')::date where user_id=auth.uid() and mode=attempt.mode;
   end if;
 end if;
 return public.get_skill_levels();
end $$;
revoke all on function public.finish_skill_level(uuid,numeric) from public,anon,authenticated;
grant execute on function public.finish_skill_level(uuid,numeric) to authenticated;
commit;

begin;

-- Best result and daily budget belong to each individual level, including replays.
create table if not exists public.skill_level_records (
 user_id uuid not null references public.profiles(id) on delete cascade,
 mode text not null check(mode in ('draw','cut','brake')),
 level integer not null check(level between 1 and 10),
 best_score numeric not null default 0 check(best_score between 0 and 100),
 attempt_day date not null default (now() at time zone 'utc')::date,
 used integer not null default 0 check(used between 0 and 3),
 primary key(user_id,mode,level)
);
alter table public.skill_level_records enable row level security;
revoke all on public.skill_level_records from public,anon,authenticated;
-- Recover existing stars and today's consumed attempts, including abandoned starts.
insert into public.skill_level_records(user_id,mode,level,best_score,attempt_day,used)
 select user_id,mode,level,coalesce(max(score),0),(now() at time zone 'utc')::date,
 least(3,count(*) filter(where (created_at at time zone 'utc')::date=(now() at time zone 'utc')::date))
 from public.skill_level_attempts group by user_id,mode,level
 on conflict do nothing;

create or replace function public.get_skill_levels()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'mode',s.mode,'level',s.level,'used',case when s.attempt_day=(now() at time zone 'utc')::date then s.used else 0 end,
  'records',coalesce((select jsonb_agg(jsonb_build_object(
    'level',r.level,'best_score',r.best_score,
    'stars',case when r.best_score>=95 then 3 when r.best_score>=90 then 2 when r.best_score>=85 then 1 else 0 end,
    'used',case when r.attempt_day=(now() at time zone 'utc')::date then r.used else 0 end
  ) order by r.level) from public.skill_level_records r where r.user_id=s.user_id and r.mode=s.mode),'[]'::jsonb)
 )) from public.skill_levels s where s.user_id=auth.uid()),'[]'::jsonb);
end $$;

-- Replace the single-argument endpoint with an optional selected-level endpoint.
drop function if exists public.start_skill_level(text);
create or replace function public.start_skill_level(p_mode text,p_level integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare progress public.skill_levels; level_record public.skill_level_records;
 attempt_id uuid; chosen integer; d date := (now() at time zone 'utc')::date; cap integer;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if p_mode is null or p_mode not in ('draw','cut','brake') then raise exception 'bad_mode'; end if;
 cap := case when p_mode='brake' then 5 else 10 end;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':level:' || p_mode));
 insert into public.skill_levels(user_id,mode) values(auth.uid(),p_mode) on conflict do nothing;
 select * into progress from public.skill_levels where user_id=auth.uid() and mode=p_mode for update;
 chosen := coalesce(p_level,progress.level);
 if chosen<1 or chosen>cap or chosen>progress.level then raise exception 'level_locked'; end if;
 insert into public.skill_level_records(user_id,mode,level) values(auth.uid(),p_mode,chosen) on conflict do nothing;
 select * into level_record from public.skill_level_records where user_id=auth.uid() and mode=p_mode and level=chosen for update;
 if level_record.attempt_day<>d then level_record.used:=0; end if;
 if level_record.used>=3 then raise exception 'no_level_tries'; end if;
 update public.skill_level_attempts set finished=true where user_id=auth.uid() and mode=p_mode and not finished;
 update public.skill_level_records set used=level_record.used+1,attempt_day=d where user_id=auth.uid() and mode=p_mode and level=chosen;
 if chosen=progress.level then
  update public.skill_levels set used=level_record.used+1,attempt_day=d where user_id=auth.uid() and mode=p_mode;
 end if;
 insert into public.skill_level_attempts(user_id,mode,level) values(auth.uid(),p_mode,chosen) returning id into attempt_id;
 return jsonb_build_object('token',attempt_id,'mode',p_mode,'level',chosen,'used',level_record.used+1);
end $$;

create or replace function public.finish_skill_level(p_token uuid,p_score numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare attempt public.skill_level_attempts; progress public.skill_levels;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into attempt from public.skill_level_attempts where id=p_token and user_id=auth.uid();
 if not found then raise exception 'invalid_attempt'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':level:' || attempt.mode));
 select * into attempt from public.skill_level_attempts where id=p_token for update;
 select * into progress from public.skill_levels where user_id=auth.uid() and mode=attempt.mode for update;
 if not attempt.finished then
  if p_score is null or p_score::text in ('NaN','Infinity','-Infinity') or p_score<0 or p_score>100 then raise exception 'bad_score'; end if;
  if attempt.created_at+interval '2 minutes'<now() then raise exception 'attempt_expired'; end if;
  update public.skill_level_attempts set score=round(p_score,2),finished=true where id=p_token;
  insert into public.skill_level_records(user_id,mode,level,best_score) values(auth.uid(),attempt.mode,attempt.level,round(p_score,2))
   on conflict(user_id,mode,level) do update set best_score=greatest(public.skill_level_records.best_score,excluded.best_score);
  if p_score>=85 and progress.level=attempt.level then
   update public.skill_levels set level=level+1,used=0,attempt_day=(now() at time zone 'utc')::date where user_id=auth.uid() and mode=attempt.mode;
  end if;
 end if;
 return public.get_skill_levels();
end $$;
revoke all on function public.get_skill_levels(),public.start_skill_level(text,integer),public.finish_skill_level(uuid,numeric) from public,anon,authenticated;
grant execute on function public.get_skill_levels(),public.start_skill_level(text,integer),public.finish_skill_level(uuid,numeric) to authenticated;
commit;

-- Five daily attempts per individual level, including replays.
begin;
alter table public.skill_levels drop constraint if exists skill_levels_used_check;
alter table public.skill_levels add constraint skill_levels_used_check check(used between 0 and 5);
alter table public.skill_level_records drop constraint if exists skill_level_records_used_check;
alter table public.skill_level_records add constraint skill_level_records_used_check check(used between 0 and 5);
create or replace function public.start_skill_level(p_mode text,p_level integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare progress public.skill_levels; level_record public.skill_level_records;
 attempt_id uuid; chosen integer; d date := (now() at time zone 'utc')::date; cap integer;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if p_mode is null or p_mode not in ('draw','cut','brake') then raise exception 'bad_mode'; end if;
 cap := case when p_mode='brake' then 5 else 10 end;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':level:' || p_mode));
 insert into public.skill_levels(user_id,mode) values(auth.uid(),p_mode) on conflict do nothing;
 select * into progress from public.skill_levels where user_id=auth.uid() and mode=p_mode for update;
 chosen := coalesce(p_level,progress.level);
 if chosen<1 or chosen>cap or chosen>progress.level then raise exception 'level_locked'; end if;
 insert into public.skill_level_records(user_id,mode,level) values(auth.uid(),p_mode,chosen) on conflict do nothing;
 select * into level_record from public.skill_level_records where user_id=auth.uid() and mode=p_mode and level=chosen for update;
 if level_record.attempt_day<>d then level_record.used:=0; end if;
 if level_record.used>=5 then raise exception 'no_level_tries'; end if;
 update public.skill_level_attempts set finished=true where user_id=auth.uid() and mode=p_mode and not finished;
 update public.skill_level_records set used=level_record.used+1,attempt_day=d where user_id=auth.uid() and mode=p_mode and level=chosen;
 if chosen=progress.level then
  update public.skill_levels set used=level_record.used+1,attempt_day=d where user_id=auth.uid() and mode=p_mode;
 end if;
 insert into public.skill_level_attempts(user_id,mode,level) values(auth.uid(),p_mode,chosen) returning id into attempt_id;
 return jsonb_build_object('token',attempt_id,'mode',p_mode,'level',chosen,'used',level_record.used+1);
end $$;
revoke all on function public.start_skill_level(text,integer) from public,anon,authenticated;
grant execute on function public.start_skill_level(text,integer) to authenticated;
commit;
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

begin;

-- Three distinct driving objectives per match. Existing running matches retain
-- their recorded schedule, while lobbies and rematches use the new limits.
create or replace function public.enforce_party_car_round_limit()
returns trigger language plpgsql set search_path = '' as $$
declare maximum integer;
begin
  if 'brake' = any(new.selected_games) then
    maximum := 3 * cardinality(new.selected_games);
    if new.started_at is null then
      new.round_count := least(new.round_count, maximum);
    elsif tg_op = 'UPDATE' and old.started_at is null and new.round_count > maximum then
      raise exception 'bad_round_count';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists party_car_round_limit on public.party_rooms;
create trigger party_car_round_limit
  before insert or update of selected_games, round_count, started_at on public.party_rooms
  for each row execute function public.enforce_party_car_round_limit();

with adjusted as (
  update public.party_rooms
    set round_count = 3 * cardinality(selected_games)
  where started_at is null and 'brake' = any(selected_games)
    and round_count > 3 * cardinality(selected_games)
  returning id
)
update public.party_members set ready = false where room_id in (select id from adjusted);

revoke all on function public.enforce_party_car_round_limit() from public, anon, authenticated;
commit;


begin;
alter table public.party_rooms add column if not exists room_code text not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
create unique index if not exists party_rooms_code_idx on public.party_rooms(room_code);
alter table public.party_rooms add column if not exists is_public boolean not null default true;
alter table public.party_rooms add column if not exists listed_seen_at timestamptz;
create or replace function public.party_room_payload(p_room uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code',room.room_code,'is_public',room.is_public,
    'selected_games', coalesce((select selected_games from public.party_match_settings where room_id = room.id and match_no = room.match_no), room.selected_games),
    'game_version', coalesce((select game_version from public.party_match_settings where room_id = room.id and match_no = room.match_no), case when room.started_at is null then 2 else 1 end),
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
create or replace function public.get_party_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into room from public.party_rooms where id=p_room;
 if not found or room.expires_at<=now() then raise exception 'invalid_room'; end if;
 if room.host_id=auth.uid() then update public.party_rooms set listed_seen_at=clock_timestamp() where id=p_room; end if;
 return public.party_room_payload(p_room);
end $$;
create or replace function public.set_party_public(p_room uuid,p_public boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.party_rooms;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into room from public.party_rooms where id=p_room for update;
 if not found or room.expires_at<=now() then raise exception 'invalid_room'; end if;
 if room.host_id<>auth.uid() then raise exception 'host_only'; end if;
 update public.party_rooms set is_public=coalesce(p_public,false),listed_seen_at=clock_timestamp() where id=p_room;
 return public.party_room_payload(p_room);
end $$;
create or replace function public.find_party_code(p_code text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare found_id uuid;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if p_code is null or upper(trim(p_code)) !~ '^[A-F0-9]{8}$' then raise exception 'invalid_room_code'; end if;
 select id into found_id from public.party_rooms where room_code=upper(trim(p_code)) and expires_at>now();
 if found_id is null then raise exception 'invalid_room_code'; end if;
 return found_id;
end $$;
create or replace function public.list_public_parties()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 return coalesce((select jsonb_agg(to_jsonb(lobby)) from (
 select r.id as token,r.room_code as code,p.nickname as host,r.round_count,r.selected_games,
  (select count(*) from public.party_members m where m.room_id=r.id and m.active) as players
 from public.party_rooms r join public.profiles p on p.id=r.host_id
 where r.is_public and r.started_at is null and r.expires_at>now() and r.listed_seen_at>now()-interval '90 seconds'
 and (select count(*) from public.party_members m where m.room_id=r.id and m.active) between 1 and 7
 order by r.created_at desc limit 30
 ) lobby),'[]'::jsonb);
end $$;
revoke all on function public.party_room_payload(uuid),public.get_party_room(uuid),public.set_party_public(uuid,boolean),public.find_party_code(text),public.list_public_parties() from public,anon,authenticated;
grant execute on function public.get_party_room(uuid),public.set_party_public(uuid,boolean),public.find_party_code(text),public.list_public_parties() to authenticated;
commit;

-- New rooms are listed by default; existing room visibility is preserved.
begin;
alter table public.party_rooms alter column is_public set default true;
alter table public.party_rooms alter column listed_seen_at set default now();
commit;

begin;

-- Stop concurrent clicks/tabs from creating multiple rooms for one host.
create or replace function public.create_party_room()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); existing_id uuid; new_room_id uuid;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if not exists(select 1 from public.profiles where id=uid) then raise exception 'profile_required'; end if;
 perform pg_advisory_xact_lock(hashtext(uid::text || ':party:create'));
 select r.id into existing_id from public.party_rooms r
 where r.host_id=uid and r.expires_at>now()
   and exists(select 1 from public.party_members m where m.room_id=r.id and m.user_id=uid and m.active)
 order by (r.started_at is not null) desc, r.created_at desc limit 1 for update;
 if existing_id is not null then
  update public.party_rooms set listed_seen_at=clock_timestamp() where id=existing_id;
  return public.party_room_payload(existing_id) || jsonb_build_object('reused_room',true);
 end if;
 insert into public.party_rooms(host_id) values(uid) returning id into new_room_id;
 insert into public.party_members(room_id,user_id) values(new_room_id,uid);
 return public.party_room_payload(new_room_id) || jsonb_build_object('reused_room',false);
end $$;

-- Close only redundant waiting rooms where nobody else has joined.
-- Keep any room with another active player or a match/history intact.
with candidates as (
 select r.id,r.host_id,r.created_at,
  row_number() over(partition by r.host_id order by r.created_at desc,r.id) as position
 from public.party_rooms r
 where r.expires_at>now() and r.started_at is null and r.match_no=1
 and exists(select 1 from public.party_members m where m.room_id=r.id and m.user_id=r.host_id and m.active)
 and not exists(select 1 from public.party_members m where m.room_id=r.id and m.user_id<>r.host_id and m.active)
 and not exists(select 1 from public.party_results a where a.room_id=r.id)
)
update public.party_rooms set expires_at=now(),is_public=false
 where id in(select id from candidates where position>1);

-- Legacy creation endpoint must not reset a reused room's game configuration.
create or replace function public.create_party_room_with_games(p_games text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare created jsonb;
begin
 created := public.create_party_room();
 if coalesce((created->>'reused_room')::boolean,false) then return created; end if;
 return public.set_party_games((created->>'token')::uuid,p_games);
end $$;
revoke all on function public.create_party_room(),public.create_party_room_with_games(text[]) from public,anon,authenticated;
grant execute on function public.create_party_room(),public.create_party_room_with_games(text[]) to authenticated;
commit;

-- Reuse only an untouched solo lobby. Populated rooms and match history
-- remain available while the host creates another room for a different group.
begin;
create or replace function public.create_party_room()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); existing_id uuid; new_room_id uuid;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if not exists(select 1 from public.profiles where id=uid) then raise exception 'profile_required'; end if;
 perform pg_advisory_xact_lock(hashtext(uid::text || ':party:create'));
 select r.id into existing_id from public.party_rooms r
 where r.host_id=uid and r.expires_at>now()
   and r.started_at is null and r.match_no=1
   and exists(select 1 from public.party_members m where m.room_id=r.id and m.user_id=uid and m.active)
   -- Even a departed guest means this is an existing group's room.
   and not exists(select 1 from public.party_members m where m.room_id=r.id and m.user_id<>uid)
   and not exists(select 1 from public.party_results a where a.room_id=r.id)
   and not exists(select 1 from public.party_match_players p where p.room_id=r.id)
   and not exists(select 1 from public.party_match_settings s where s.room_id=r.id)
 order by r.created_at desc,r.id limit 1 for update;
 if existing_id is not null then
  update public.party_rooms set listed_seen_at=clock_timestamp() where id=existing_id;
  return public.party_room_payload(existing_id) || jsonb_build_object('reused_room',true);
 end if;
 insert into public.party_rooms(host_id) values(uid) returning id into new_room_id;
 insert into public.party_members(room_id,user_id) values(new_room_id,uid);
 return public.party_room_payload(new_room_id) || jsonb_build_object('reused_room',false);
end $$;
revoke all on function public.create_party_room() from public,anon,authenticated;
grant execute on function public.create_party_room() to authenticated;
commit;

-- Enforce nickname rules on the server as well as in the client.
-- Existing profiles and score ownership are preserved; invalid names must be
-- changed by their owner. This migration does not rename players automatically.
begin;

create or replace function public.set_nickname(p_nickname text)
returns text language plpgsql security definer set search_path = public as $$
declare v text := btrim(coalesce(p_nickname, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(v) not between 1 and 15 or v !~ '^[A-Za-z0-9][A-Za-z0-9 _-]*$' then
    raise exception 'bad_nickname';
  end if;
  begin
    insert into profiles (id, nickname) values (auth.uid(), v)
    on conflict (id) do update set nickname = excluded.nickname;
  exception when unique_violation then
    raise exception 'nickname_taken';
  end;
  return v;
end $$;

-- Protect other insert/rename paths too, without rewriting existing profiles.
create or replace function public.validate_profile_nickname()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.nickname is null or char_length(new.nickname) not between 1 and 15
    or new.nickname !~ '^[A-Za-z0-9][A-Za-z0-9 _-]*$' then
    raise exception 'bad_nickname';
  end if;
  return new;
end $$;

revoke all on function public.validate_profile_nickname() from public;
drop trigger if exists validate_profile_nickname on public.profiles;
create trigger validate_profile_nickname
before insert or update of nickname on public.profiles
for each row execute function public.validate_profile_nickname();

commit;


-- BALANCE! daily attempts and career leaderboard.
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

begin;
create table if not exists public.count_attempts (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 play_date date not null,
 answers integer[],
 score integer not null default 0 check(score between 0 and 100),
 created_at timestamptz not null default now(),
 finished_at timestamptz,
 check(answers is null or cardinality(answers) = 5)
);
create index if not exists count_attempts_user_day_idx on public.count_attempts(user_id,play_date);
alter table public.count_attempts enable row level security;
revoke all on public.count_attempts from public,anon,authenticated;

create or replace function public.get_count_state()
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('date',(now() at time zone 'utc')::date,'attempts',coalesce((
 select jsonb_agg(jsonb_build_object('id',a.id,'score',a.score,'answers',a.answers,'at',(extract(epoch from a.created_at)*1000)::bigint) order by a.created_at,a.id)
 from public.count_attempts a where a.user_id=auth.uid() and a.play_date=(now() at time zone 'utc')::date
 ),'[]'::jsonb));
$$;

create or replace function public.start_count_attempt(p_id uuid,p_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); d date:=(now() at time zone 'utc')::date;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if p_id is null then raise exception 'bad_attempt'; end if;
 if p_date is distinct from d then raise exception 'wrong_day'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(uid::text||d::text||':count'));
 if exists(select 1 from public.count_attempts where id=p_id and user_id=uid and play_date=d) then return public.get_count_state(); end if;
 if (select count(*) from public.count_attempts where user_id=uid and play_date=d)>=5 then raise exception 'no_tries_left'; end if;
 insert into public.count_attempts(id,user_id,play_date) values(p_id,uid,d);
 return public.get_count_state();
end $$;

create or replace function public.finish_count_attempt(p_id uuid,p_date date,p_answers integer[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); d date:=(now() at time zone 'utc')::date; a public.count_attempts%rowtype; points integer:=0; answer integer; i integer:=0; target integer;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if p_date is distinct from d then raise exception 'wrong_day'; end if;
 if p_answers is null or array_ndims(p_answers)<>1 or cardinality(p_answers)<>5 then raise exception 'bad_answers'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(uid::text||d::text||':count'));
 select * into a from public.count_attempts where id=p_id and user_id=uid and play_date=d for update;
 if not found then raise exception 'bad_attempt'; end if;
 if a.finished_at is not null then return public.get_count_state(); end if;
 if now()>a.created_at+interval '3 minutes' then raise exception 'attempt_expired'; end if;
 foreach answer in array p_answers loop
  if answer is null or answer < -1 or answer > 50 then raise exception 'bad_answers'; end if;
  target:=7+((((d-date '1970-01-01')*17+i*7)%10+10)%10)+i;
  if answer>=0 then points:=points+greatest(0,20-abs(answer-target)*5); end if;
  i:=i+1;
 end loop;
 update public.count_attempts set answers=p_answers,score=points,finished_at=now() where id=p_id;
 return public.get_count_state();
end $$;

create or replace function public.get_count_leaderboard()
returns table(rank bigint,nickname text,score numeric,detail jsonb,is_me boolean)
language sql stable security definer set search_path = '' as $$
 with daily as (
  select user_id,play_date,max(score) as score,min(created_at) as played_at
  from public.count_attempts where finished_at is not null and play_date<=(now() at time zone 'utc')::date group by user_id,play_date
 ), totals as (
  select user_id,sum(score)::numeric as score,count(*) as days,max(played_at) as played_at from daily group by user_id
 ), ranked as (
  select row_number() over(order by t.score desc,t.played_at,t.user_id) as rank,p.nickname,t.score,jsonb_build_object('days',t.days) as detail,coalesce(t.user_id=auth.uid(),false) as is_me
  from totals t join public.profiles p on p.id=t.user_id
 ) select * from ranked r where r.rank<=10 or r.is_me order by r.rank;
$$;
revoke all on function public.get_count_state(),public.start_count_attempt(uuid,date),public.finish_count_attempt(uuid,date,integer[]),public.get_count_leaderboard() from public,anon,authenticated;
grant execute on function public.get_count_state(),public.start_count_attempt(uuid,date),public.finish_count_attempt(uuid,date,integer[]) to authenticated;
grant execute on function public.get_count_leaderboard() to anon,authenticated;
commit;

-- Gentler progression: 3-5 dots initially, adding two each round.
-- Existing completed scores and daily attempt budgets are preserved.
begin;
create or replace function public.finish_count_attempt(p_id uuid,p_date date,p_answers integer[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); d date:=(now() at time zone 'utc')::date; a public.count_attempts%rowtype; points integer:=0; answer integer; i integer:=0; target integer;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if p_date is distinct from d then raise exception 'wrong_day'; end if;
 if p_answers is null or array_ndims(p_answers)<>1 or cardinality(p_answers)<>5 then raise exception 'bad_answers'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(uid::text||d::text||':count'));
 select * into a from public.count_attempts where id=p_id and user_id=uid and play_date=d for update;
 if not found then raise exception 'bad_attempt'; end if;
 if a.finished_at is not null then return public.get_count_state(); end if;
 if now()>a.created_at+interval '3 minutes' then raise exception 'attempt_expired'; end if;
 foreach answer in array p_answers loop
  if answer is null or answer < -1 or answer > 50 then raise exception 'bad_answers'; end if;
  target:=3+((((d-date '1970-01-01')%3)+3)%3)+i*2;
  if answer>=0 then points:=points+greatest(0,20-abs(answer-target)*5); end if;
  i:=i+1;
 end loop;
 update public.count_attempts set answers=p_answers,score=points,finished_at=now() where id=p_id;
 return public.get_count_state();
end $$;

commit;


-- Weekly skill leagues
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


-- Enroll all active weekly players
begin;

-- Include all players with this week's scores, even if they have not visited Leagues.
-- Called after settlement, under the same lock used for manual joins.
create or replace function public.enroll_active_league_players()
returns void language plpgsql security definer set search_path='' as $$
declare w date:=date_trunc('week',now() at time zone 'utc')::date;
 player record; gid bigint; tier integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(7152026,1);
 for player in
  select s.user_id,min(s.updated_at) as first_played
  from public.daily_scores s join public.profiles p on p.id=s.user_id
  where s.play_date>=w and s.play_date<w+7
   and not exists(select 1 from public.league_entries e where e.user_id=s.user_id and e.week=w)
  group by s.user_id order by first_played,s.user_id
 loop
  select coalesce(e.next_division,g.division) into tier
   from public.league_entries e join public.league_groups g on g.id=e.group_id
   where e.user_id=player.user_id and e.week<w order by e.week desc limit 1;
  tier:=coalesce(tier,1);
  select g.id into gid from public.league_groups g where g.week=w and g.division=tier
   and (select count(*) from public.league_entries e where e.group_id=g.id)<20 order by g.id limit 1;
  if gid is null then insert into public.league_groups(week,division) values(w,tier) returning id into gid; end if;
  insert into public.league_entries(user_id,week,group_id) values(player.user_id,w,gid) on conflict do nothing;
 end loop;
end $$;
revoke all on function public.enroll_active_league_players() from public,anon,authenticated;

create or replace function public.get_my_league(p_join boolean default false)
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
 perform public.enroll_active_league_players();
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
revoke all on function public.get_my_league(boolean) from public,anon,authenticated;
grant execute on function public.get_my_league(boolean) to authenticated;
commit;


-- Automatic league entry for all profiles
begin;

-- Include every player profile, even guests with no scores yet.
-- Called after settlement, under the same lock used for manual joins.
create or replace function public.enroll_active_league_players()
returns void language plpgsql security definer set search_path='' as $$
declare w date:=date_trunc('week',now() at time zone 'utc')::date;
 player record; gid bigint; tier integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(7152026,1);
 for player in
  select p.id as user_id from public.profiles p
  where not exists(select 1 from public.league_entries e where e.user_id=p.id and e.week=w)
  order by p.created_at,p.id
 loop
  select coalesce(e.next_division,g.division) into tier
   from public.league_entries e join public.league_groups g on g.id=e.group_id
   where e.user_id=player.user_id and e.week<w order by e.week desc limit 1;
  tier:=coalesce(tier,1);
  select g.id into gid from public.league_groups g where g.week=w and g.division=tier
   and (select count(*) from public.league_entries e where e.group_id=g.id)<20 order by g.id limit 1;
  if gid is null then insert into public.league_groups(week,division) values(w,tier) returning id into gid; end if;
  insert into public.league_entries(user_id,week,group_id) values(player.user_id,w,gid) on conflict do nothing;
 end loop;
end $$;
revoke all on function public.enroll_active_league_players() from public,anon,authenticated;

create or replace function public.get_my_league(p_join boolean default false)
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
 perform public.enroll_active_league_players();
 select jsonb_build_object('week',e.week,'rank',e.final_rank,'score',e.final_score,'division',g.division,'next_division',e.next_division)
 into previous from public.league_entries e join public.league_groups g on g.id=e.group_id
 where e.user_id=uid and e.week<w order by e.week desc limit 1;
 select group_id into gid from public.league_entries where user_id=uid and week=w;
 if gid is null then
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
revoke all on function public.get_my_league(boolean) from public,anon,authenticated;
grant execute on function public.get_my_league(boolean) to authenticated;
commit;


-- Daily return-intent poll
begin;

create table public.return_poll_votes (
 user_id uuid not null references auth.users(id) on delete cascade,
 play_date date not null,
 choice boolean not null,
 updated_at timestamptz not null default now(),
 primary key(user_id,play_date)
);
create index return_poll_votes_date_idx on public.return_poll_votes(play_date);
-- Keep every press, while counting only the player's latest answer for that day.
create table public.return_poll_events (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 play_date date not null,
 choice boolean not null,
 created_at timestamptz not null default now()
);
alter table public.return_poll_votes enable row level security;
alter table public.return_poll_events enable row level security;
revoke all on public.return_poll_votes,public.return_poll_events from public,anon,authenticated;

create function public.get_return_poll()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('date',(now() at time zone 'utc')::date,
  'yes',count(*) filter(where choice),'no',count(*) filter(where not choice),
  'my_choice',(select v.choice from public.return_poll_votes v where v.user_id=auth.uid() and v.play_date=(now() at time zone 'utc')::date))
 from public.return_poll_votes where play_date=(now() at time zone 'utc')::date;
$$;
create function public.vote_return_poll(p_choice boolean,p_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); d date:=(now() at time zone 'utc')::date;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if p_choice is null then raise exception 'bad_choice'; end if;
 if p_date is distinct from d then raise exception 'wrong_day'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(uid::text||d::text||':return_poll'));
 insert into public.return_poll_events(user_id,play_date,choice) values(uid,d,p_choice);
 insert into public.return_poll_votes(user_id,play_date,choice) values(uid,d,p_choice)
 on conflict(user_id,play_date) do update set choice=excluded.choice,updated_at=now();
 return public.get_return_poll();
end $$;
revoke all on function public.get_return_poll(),public.vote_return_poll(boolean,date) from public,anon,authenticated;
grant execute on function public.get_return_poll() to anon,authenticated;
grant execute on function public.vote_return_poll(boolean,date) to authenticated;
commit;


-- All-time unique game players
begin;

-- Aggregate unique players across completed attempts; no player identities exposed.
create or replace function public.get_game_player_counts()
returns jsonb language sql stable security definer set search_path='' as $$
 with played as (
  select mode,user_id from public.attempts
  union
  select mode,user_id from public.skill_level_attempts where finished
  union
  select case when coalesce(s.game_version,1)=1 then case when r.round_no%2=0 then 'draw' else 'cut' end
   else (coalesce(s.selected_games,room.selected_games,array['draw','cut','brake']::text[]))[1+r.round_no%cardinality(coalesce(s.selected_games,room.selected_games,array['draw','cut','brake']::text[]))] end as mode,r.user_id
  from public.party_results r join public.party_rooms room on room.id=r.room_id
  left join public.party_match_settings s on s.room_id=r.room_id and s.match_no=r.match_no
  union
  select 'balance',user_id from public.balance_attempts
  union
  select 'count',user_id from public.count_attempts where finished_at is not null
 ), totals as (
  select mode,count(distinct user_id) as players from played group by mode
 )
 select jsonb_object_agg(m.mode,coalesce(t.players,0))
 from (values('draw'),('cut'),('brake'),('balance'),('count')) m(mode)
 left join totals t on t.mode=m.mode;
$$;
revoke all on function public.get_game_player_counts() from public,anon,authenticated;
grant execute on function public.get_game_player_counts() to anon,authenticated;
commit;
