begin;
create table if not exists public.skill_levels (
 user_id uuid not null references public.profiles(id) on delete cascade,
 mode text not null check(mode in ('draw','cut','brake')),
 level integer not null default 1 check(level between 1 and 6),
 attempt_day date not null default (now() at time zone 'utc')::date,
 used integer not null default 0 check(used between 0 and 3),
 primary key(user_id,mode)
);
create table if not exists public.skill_level_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 mode text not null,
 level integer not null,
 created_at timestamptz not null default now(),
 score numeric,
 finished boolean not null default false
);
alter table public.skill_levels enable row level security;
alter table public.skill_level_attempts enable row level security;
revoke all on public.skill_levels,public.skill_level_attempts from public,anon,authenticated;

create or replace function public.get_skill_levels()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('mode',mode,'level',level,'used',case when attempt_day = (now() at time zone 'utc')::date then used else 0 end)) from public.skill_levels where user_id=auth.uid()),'[]'::jsonb);
end $$;

create or replace function public.start_skill_level(p_mode text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare progress public.skill_levels; attempt_id uuid; d date := (now() at time zone 'utc')::date;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if p_mode is null or p_mode not in ('draw','cut','brake') then raise exception 'bad_mode'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':level:' || p_mode));
 insert into public.skill_levels(user_id,mode) values(auth.uid(),p_mode) on conflict do nothing;
 select * into progress from public.skill_levels where user_id=auth.uid() and mode=p_mode for update;
 if progress.level > 5 then raise exception 'ladder_complete'; end if;
 if progress.attempt_day <> d then progress.used := 0; end if;
 if progress.used >= 3 then raise exception 'no_level_tries'; end if;
 -- A new start forfeits an unfinished attempt, preventing parallel replays.
 update public.skill_level_attempts set finished=true where user_id=auth.uid() and mode=p_mode and not finished;
 update public.skill_levels set used=progress.used+1,attempt_day=d where user_id=auth.uid() and mode=p_mode;
 insert into public.skill_level_attempts(user_id,mode,level) values(auth.uid(),p_mode,progress.level) returning id into attempt_id;
 return jsonb_build_object('token',attempt_id,'mode',p_mode,'level',progress.level,'used',progress.used+1);
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
   if attempt.created_at + interval '2 minutes' < now() then raise exception 'attempt_expired'; end if;
   update public.skill_level_attempts set score=round(p_score,2),finished=true where id=p_token;
   if p_score>=90 and progress.level=attempt.level then
     update public.skill_levels set level=level+1,used=0,attempt_day=(now() at time zone 'utc')::date where user_id=auth.uid() and mode=attempt.mode;
   end if;
 end if;
 return public.get_skill_levels();
end $$;
revoke all on function public.get_skill_levels(),public.start_skill_level(text),public.finish_skill_level(uuid,numeric) from public,anon,authenticated;
grant execute on function public.get_skill_levels(),public.start_skill_level(text),public.finish_skill_level(uuid,numeric) to authenticated;
commit;
