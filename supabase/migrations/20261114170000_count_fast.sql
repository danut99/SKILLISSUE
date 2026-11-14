begin;
create table if not exists public.count_attempts (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 play_date date not null,
 answers integer[],
 score integer not null default 0 check(score between 0 and 100),
 created_at timestamptz not null default now(),
 finished_at timestamptz,
 check(answers is null or cardinality(answers) = 5)
);
create index if not exists count_attempts_user_day_idx on public.count_attempts(user_id,play_date);
alter table public.count_attempts enable row level security;
revoke all on public.count_attempts from public,anon,authenticated;

create or replace function public.get_count_state()
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('date',(now() at time zone 'utc')::date,'attempts',coalesce((
 select jsonb_agg(jsonb_build_object('id',a.id,'score',a.score,'answers',a.answers,'at',(extract(epoch from a.created_at)*1000)::bigint) order by a.created_at,a.id)
 from public.count_attempts a where a.user_id=auth.uid() and a.play_date=(now() at time zone 'utc')::date
 ),'[]'::jsonb));
$$;

create or replace function public.start_count_attempt(p_id uuid,p_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); d date:=(now() at time zone 'utc')::date;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if p_id is null then raise exception 'bad_attempt'; end if;
 if p_date is distinct from d then raise exception 'wrong_day'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(uid::text||d::text||':count'));
 if exists(select 1 from public.count_attempts where id=p_id and user_id=uid and play_date=d) then return public.get_count_state(); end if;
 if (select count(*) from public.count_attempts where user_id=uid and play_date=d)>=5 then raise exception 'no_tries_left'; end if;
 insert into public.count_attempts(id,user_id,play_date) values(p_id,uid,d);
 return public.get_count_state();
end $$;

create or replace function public.finish_count_attempt(p_id uuid,p_date date,p_answers integer[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); d date:=(now() at time zone 'utc')::date; a public.count_attempts%rowtype; points integer:=0; answer integer; i integer:=0; target integer;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if p_date is distinct from d then raise exception 'wrong_day'; end if;
 if p_answers is null or array_ndims(p_answers)<>1 or cardinality(p_answers)<>5 then raise exception 'bad_answers'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(uid::text||d::text||':count'));
 select * into a from public.count_attempts where id=p_id and user_id=uid and play_date=d for update;
 if not found then raise exception 'bad_attempt'; end if;
 if a.finished_at is not null then return public.get_count_state(); end if;
 if now()>a.created_at+interval '3 minutes' then raise exception 'attempt_expired'; end if;
 foreach answer in array p_answers loop
  if answer is null or answer < -1 or answer > 50 then raise exception 'bad_answers'; end if;
  target:=7+((((d-date '1970-01-01')*17+i*7)%10+10)%10)+i;
  if answer>=0 then points:=points+greatest(0,20-abs(answer-target)*5); end if;
  i:=i+1;
 end loop;
 update public.count_attempts set answers=p_answers,score=points,finished_at=now() where id=p_id;
 return public.get_count_state();
end $$;

create or replace function public.get_count_leaderboard()
returns table(rank bigint,nickname text,score numeric,detail jsonb,is_me boolean)
language sql stable security definer set search_path = '' as $$
 with daily as (
  select user_id,play_date,max(score) as score,min(created_at) as played_at
  from public.count_attempts where finished_at is not null and play_date<=(now() at time zone 'utc')::date group by user_id,play_date
 ), totals as (
  select user_id,sum(score)::numeric as score,count(*) as days,max(played_at) as played_at from daily group by user_id
 ), ranked as (
  select row_number() over(order by t.score desc,t.played_at,t.user_id) as rank,p.nickname,t.score,jsonb_build_object('days',t.days) as detail,coalesce(t.user_id=auth.uid(),false) as is_me
  from totals t join public.profiles p on p.id=t.user_id
 ) select * from ranked r where r.rank<=10 or r.is_me order by r.rank;
$$;
revoke all on function public.get_count_state(),public.start_count_attempt(uuid,date),public.finish_count_attempt(uuid,date,integer[]),public.get_count_leaderboard() from public,anon,authenticated;
grant execute on function public.get_count_state(),public.start_count_attempt(uuid,date),public.finish_count_attempt(uuid,date,integer[]) to authenticated;
grant execute on function public.get_count_leaderboard() to anon,authenticated;
commit;
