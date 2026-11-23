-- Keep empty anonymous accounts for a day (was one hour) so returning guests keep their session.
-- Run as postgres in Supabase SQL Editor after the preceding migrations. The hourly job is unchanged.
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
