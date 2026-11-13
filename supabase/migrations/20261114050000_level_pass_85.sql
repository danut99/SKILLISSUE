-- Lower the Level mode pass threshold for all three games.
begin;
create or replace function public.finish_skill_level(p_token uuid,p_score numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare attempt public.skill_level_attempts; progress public.skill_levels;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into attempt from public.skill_level_attempts where id=p_token and user_id=auth.uid();
 if not found then raise exception 'invalid_attempt'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':level:' || attempt.mode));
 select * into attempt from public.skill_level_attempts where id=p_token for update;
 select * into progress from public.skill_levels where user_id=auth.uid() and mode=attempt.mode for update;
 if not attempt.finished then
   if p_score is null or p_score::text in ('NaN','Infinity','-Infinity') or p_score<0 or p_score>100 then raise exception 'bad_score'; end if;
   if attempt.created_at + interval '2 minutes' < now() then raise exception 'attempt_expired'; end if;
   update public.skill_level_attempts set score=round(p_score,2),finished=true where id=p_token;
   if p_score>=85 and progress.level=attempt.level then
     update public.skill_levels set level=level+1,used=0,attempt_day=(now() at time zone 'utc')::date where user_id=auth.uid() and mode=attempt.mode;
   end if;
 end if;
 return public.get_skill_levels();
end $$;
revoke all on function public.finish_skill_level(uuid,numeric) from public,anon,authenticated;
grant execute on function public.finish_skill_level(uuid,numeric) to authenticated;
commit;
