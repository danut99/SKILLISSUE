begin;

create table public.return_poll_votes (
 user_id uuid not null references auth.users(id) on delete cascade,
 play_date date not null,
 choice boolean not null,
 updated_at timestamptz not null default now(),
 primary key(user_id,play_date)
);
create index return_poll_votes_date_idx on public.return_poll_votes(play_date);
-- Keep every press, while counting only the player's latest answer for that day.
create table public.return_poll_events (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 play_date date not null,
 choice boolean not null,
 created_at timestamptz not null default now()
);
alter table public.return_poll_votes enable row level security;
alter table public.return_poll_events enable row level security;
revoke all on public.return_poll_votes,public.return_poll_events from public,anon,authenticated;

create function public.get_return_poll()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('date',(now() at time zone 'utc')::date,
  'yes',count(*) filter(where choice),'no',count(*) filter(where not choice),
  'my_choice',(select v.choice from public.return_poll_votes v where v.user_id=auth.uid() and v.play_date=(now() at time zone 'utc')::date))
 from public.return_poll_votes where play_date=(now() at time zone 'utc')::date;
$$;
create function public.vote_return_poll(p_choice boolean,p_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); d date:=(now() at time zone 'utc')::date;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if p_choice is null then raise exception 'bad_choice'; end if;
 if p_date is distinct from d then raise exception 'wrong_day'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(uid::text||d::text||':return_poll'));
 insert into public.return_poll_events(user_id,play_date,choice) values(uid,d,p_choice);
 insert into public.return_poll_votes(user_id,play_date,choice) values(uid,d,p_choice)
 on conflict(user_id,play_date) do update set choice=excluded.choice,updated_at=now();
 return public.get_return_poll();
end $$;
revoke all on function public.get_return_poll(),public.vote_return_poll(boolean,date) from public,anon,authenticated;
grant execute on function public.get_return_poll() to anon,authenticated;
grant execute on function public.vote_return_poll(boolean,date) to authenticated;
commit;
