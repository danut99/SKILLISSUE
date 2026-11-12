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
