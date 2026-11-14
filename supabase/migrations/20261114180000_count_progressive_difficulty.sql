-- Gentler progression: 3-5 dots initially, adding two each round.
-- Existing completed scores and daily attempt budgets are preserved.
begin;
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
  target:=3+((((d-date '1970-01-01')%3)+3)%3)+i*2;
  if answer>=0 then points:=points+greatest(0,20-abs(answer-target)*5); end if;
  i:=i+1;
 end loop;
 update public.count_attempts set answers=p_answers,score=points,finished_at=now() where id=p_id;
 return public.get_count_state();
end $$;

commit;
