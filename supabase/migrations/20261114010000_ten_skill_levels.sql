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
