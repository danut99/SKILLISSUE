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
