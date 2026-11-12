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
