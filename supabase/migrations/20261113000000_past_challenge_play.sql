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

-- Record one try on an accepted challenge's day (3 tries per mode per day, shared
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
  select 3 + count(*) into allowed from public.bonuses
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
grant execute on function public.record_challenge_attempt(uuid, numeric, jsonb) to authenticated;

commit;
