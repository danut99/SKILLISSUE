-- Five daily attempts per game, shared with challenge replays.
-- Run after 20261113000000_past_challenge_play.sql.
begin;

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

commit;
