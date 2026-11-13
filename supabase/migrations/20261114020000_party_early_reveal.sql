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
