begin;

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

commit;
