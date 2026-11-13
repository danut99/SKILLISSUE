begin;

-- Best result and daily budget belong to each individual level, including replays.
create table if not exists public.skill_level_records (
 user_id uuid not null references public.profiles(id) on delete cascade,
 mode text not null check(mode in ('draw','cut','brake')),
 level integer not null check(level between 1 and 10),
 best_score numeric not null default 0 check(best_score between 0 and 100),
 attempt_day date not null default (now() at time zone 'utc')::date,
 used integer not null default 0 check(used between 0 and 3),
 primary key(user_id,mode,level)
);
alter table public.skill_level_records enable row level security;
revoke all on public.skill_level_records from public,anon,authenticated;
-- Recover existing stars and today's consumed attempts, including abandoned starts.
insert into public.skill_level_records(user_id,mode,level,best_score,attempt_day,used)
 select user_id,mode,level,coalesce(max(score),0),(now() at time zone 'utc')::date,
 least(3,count(*) filter(where (created_at at time zone 'utc')::date=(now() at time zone 'utc')::date))
 from public.skill_level_attempts group by user_id,mode,level
 on conflict do nothing;

create or replace function public.get_skill_levels()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'mode',s.mode,'level',s.level,'used',case when s.attempt_day=(now() at time zone 'utc')::date then s.used else 0 end,
  'records',coalesce((select jsonb_agg(jsonb_build_object(
    'level',r.level,'best_score',r.best_score,
    'stars',case when r.best_score>=95 then 3 when r.best_score>=90 then 2 when r.best_score>=85 then 1 else 0 end,
    'used',case when r.attempt_day=(now() at time zone 'utc')::date then r.used else 0 end
  ) order by r.level) from public.skill_level_records r where r.user_id=s.user_id and r.mode=s.mode),'[]'::jsonb)
 )) from public.skill_levels s where s.user_id=auth.uid()),'[]'::jsonb);
end $$;

-- Replace the single-argument endpoint with an optional selected-level endpoint.
drop function if exists public.start_skill_level(text);
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
 if level_record.used>=3 then raise exception 'no_level_tries'; end if;
 update public.skill_level_attempts set finished=true where user_id=auth.uid() and mode=p_mode and not finished;
 update public.skill_level_records set used=level_record.used+1,attempt_day=d where user_id=auth.uid() and mode=p_mode and level=chosen;
 if chosen=progress.level then
  update public.skill_levels set used=level_record.used+1,attempt_day=d where user_id=auth.uid() and mode=p_mode;
 end if;
 insert into public.skill_level_attempts(user_id,mode,level) values(auth.uid(),p_mode,chosen) returning id into attempt_id;
 return jsonb_build_object('token',attempt_id,'mode',p_mode,'level',chosen,'used',level_record.used+1);
end $$;

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
  if attempt.created_at+interval '2 minutes'<now() then raise exception 'attempt_expired'; end if;
  update public.skill_level_attempts set score=round(p_score,2),finished=true where id=p_token;
  insert into public.skill_level_records(user_id,mode,level,best_score) values(auth.uid(),attempt.mode,attempt.level,round(p_score,2))
   on conflict(user_id,mode,level) do update set best_score=greatest(public.skill_level_records.best_score,excluded.best_score);
  if p_score>=85 and progress.level=attempt.level then
   update public.skill_levels set level=level+1,used=0,attempt_day=(now() at time zone 'utc')::date where user_id=auth.uid() and mode=attempt.mode;
  end if;
 end if;
 return public.get_skill_levels();
end $$;
revoke all on function public.get_skill_levels(),public.start_skill_level(text,integer),public.finish_skill_level(uuid,numeric) from public,anon,authenticated;
grant execute on function public.get_skill_levels(),public.start_skill_level(text,integer),public.finish_skill_level(uuid,numeric) to authenticated;
commit;
