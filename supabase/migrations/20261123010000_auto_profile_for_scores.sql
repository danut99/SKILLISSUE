-- A saved try always gets a leaderboard name. The client claims its nickname before the first
-- score, but if that call fails (network) the score would be hidden by the profiles join.
-- The fallback name is replaced as soon as the client claims its own nickname.
-- Run after the preceding migrations.
begin;

create or replace function public.ensure_profile_for_score()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles where id = new.user_id) then return new; end if;
  for i in 1..10 loop
    begin
      insert into public.profiles (id, nickname)
      values (new.user_id, 'Player' || lpad(floor(random() * 1000000)::int::text, 6, '0'))
      on conflict (id) do nothing;
      return new;
    exception when unique_violation then
      null; -- nickname already taken: try another number
    end;
  end loop;
  return new;
end $$;

revoke all on function public.ensure_profile_for_score() from public, anon, authenticated;

drop trigger if exists ensure_profile_for_score on public.attempts;
create trigger ensure_profile_for_score before insert on public.attempts
for each row execute function public.ensure_profile_for_score();

drop trigger if exists ensure_profile_for_score on public.balance_attempts;
create trigger ensure_profile_for_score before insert on public.balance_attempts
for each row execute function public.ensure_profile_for_score();

drop trigger if exists ensure_profile_for_score on public.count_attempts;
create trigger ensure_profile_for_score before insert on public.count_attempts
for each row execute function public.ensure_profile_for_score();

drop trigger if exists ensure_profile_for_score on public.skill_level_attempts;
create trigger ensure_profile_for_score before insert on public.skill_level_attempts
for each row execute function public.ensure_profile_for_score();

commit;
