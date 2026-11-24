-- Optional daily-only Web Push. No friend/challenge notification categories.
begin;
create table if not exists public.daily_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  reminder_time time not null,
  timezone text not null,
  updated_at timestamptz not null default now()
);
create index if not exists daily_reminders_user_idx on public.daily_reminders(user_id);
create table if not exists public.daily_reminder_deliveries (
  user_id uuid not null references auth.users(id) on delete cascade,
  play_date date not null,
  claimed_at timestamptz not null default now(),
  sent boolean not null default false,
  primary key (user_id, play_date)
);
alter table public.daily_reminders enable row level security;
alter table public.daily_reminder_deliveries enable row level security;
revoke all on public.daily_reminders, public.daily_reminder_deliveries from anon, authenticated;
grant all on public.daily_reminders, public.daily_reminder_deliveries to service_role;

create or replace function public.save_daily_reminder(p_subscription jsonb, p_time text, p_timezone text)
returns void language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := auth.uid();
 endpoint_value text := p_subscription->>'endpoint';
 key_value jsonb := p_subscription->'keys';
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'bad_time'; end if;
 if p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone) then raise exception 'bad_timezone'; end if;
 -- Only browser push services: arbitrary supplied URLs must never be fetched.
 if endpoint_value is null or length(endpoint_value) > 4096 or endpoint_value !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com)/[^[:space:]]+$' then raise exception 'bad_endpoint'; end if;
 if key_value->>'p256dh' is null or key_value->>'auth' is null
    or (key_value->>'p256dh') !~ '^[A-Za-z0-9_-]{87}={0,2}$'
    or (key_value->>'auth') !~ '^[A-Za-z0-9_-]{22}={0,2}$' then raise exception 'bad_keys'; end if;
 -- Proof of possession of this device's subscription allows account switching.
 if exists (select 1 from public.daily_reminders r where r.endpoint = endpoint_value and r.keys <> key_value) then raise exception 'subscription_mismatch'; end if;
 if (select count(*) from public.daily_reminders r where r.user_id = uid and r.endpoint <> endpoint_value) >= 5 then raise exception 'too_many_devices'; end if;
 insert into public.daily_reminders(user_id, endpoint, keys, reminder_time, timezone)
 values(uid, endpoint_value, key_value, p_time::time, p_timezone)
 on conflict (endpoint) do update set user_id = excluded.user_id, keys = excluded.keys,
 reminder_time = excluded.reminder_time, timezone = excluded.timezone, updated_at = now();
end $$;
create or replace function public.get_daily_reminder(p_endpoint text)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('reminder_time', r.reminder_time, 'timezone', r.timezone)
 from public.daily_reminders r where r.user_id = auth.uid() and r.endpoint = p_endpoint;
$$;
create or replace function public.delete_daily_reminder(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
 delete from public.daily_reminders where user_id = auth.uid() and endpoint = p_endpoint;
$$;
revoke all on function public.save_daily_reminder(jsonb,text,text), public.get_daily_reminder(text), public.delete_daily_reminder(text) from public, anon;
grant execute on function public.save_daily_reminder(jsonb,text,text), public.get_daily_reminder(text), public.delete_daily_reminder(text) to authenticated;

-- Atomic per-player/day claim prevents overlapping scheduler runs and multiple devices
-- from sending duplicate reminders. Latest configured device wins among due devices.
create or replace function public.claim_daily_reminders()
returns table(id uuid, user_id uuid, endpoint text, keys jsonb, play_date date)
language sql security definer set search_path = '' as $$
 with due as materialized (
   select distinct on (r.user_id) r.*, (now() at time zone 'utc')::date as day
   from public.daily_reminders r
   where (now() at time zone r.timezone) >= (now() at time zone r.timezone)::date + r.reminder_time
     and (now() at time zone r.timezone) < (now() at time zone r.timezone)::date + r.reminder_time + interval '15 minutes'
     and not exists (select 1 from public.attempts a where a.user_id = r.user_id and a.play_date = (now() at time zone 'utc')::date)
     and not exists (select 1 from public.daily_reminder_deliveries d where d.user_id = r.user_id and d.play_date = (now() at time zone 'utc')::date)
   order by r.user_id, r.updated_at desc
   limit 200
 ), claimed as (
   insert into public.daily_reminder_deliveries(user_id, play_date)
   select due.user_id, due.day from due
   on conflict do nothing returning daily_reminder_deliveries.user_id, daily_reminder_deliveries.play_date
 )
 select due.id, due.user_id, due.endpoint, due.keys, due.day
 from due join claimed on claimed.user_id = due.user_id and claimed.play_date = due.day;
$$;
revoke all on function public.claim_daily_reminders() from public, anon, authenticated;
grant execute on function public.claim_daily_reminders() to service_role;
commit;
