begin;

-- One undirected friendship per pair. Invite links grant permission to connect.
create table if not exists public.friends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id < friend_id)
);
create index if not exists friends_friend_id_idx on public.friends(friend_id);

create table if not exists public.friend_invites (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default now() + interval '7 days'
);

alter table public.friends enable row level security;
alter table public.friend_invites enable row level security;
revoke all on public.friends, public.friend_invites from public, anon, authenticated;
grant select on public.friends to authenticated;
drop policy if exists "own friendships" on public.friends;
create policy "own friendships" on public.friends for select to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

create or replace function public.create_friend_invite(p_reset boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  invitation public.friend_invites;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile_required';
  end if;
  insert into public.friend_invites as current_invite (user_id) values (uid)
  on conflict (user_id) do update set
    token = case when p_reset or current_invite.expires_at <= now()
      then gen_random_uuid() else current_invite.token end,
    expires_at = case when p_reset or current_invite.expires_at <= now()
      then now() + interval '7 days' else current_invite.expires_at end
  returning * into invitation;
  return jsonb_build_object('token', invitation.token, 'expires_at', invitation.expires_at);
end $$;

-- Preview reveals only the inviter's public nickname to a valid link holder.
create or replace function public.preview_friend_invite(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  invitation public.friend_invites;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into invitation from public.friend_invites where token = p_token and expires_at > now();
  if not found then raise exception 'invalid_invite'; end if;
  return jsonb_build_object(
    'nickname', (select nickname from public.profiles where id = invitation.user_id),
    'is_me', invitation.user_id = uid,
    'already_friends', exists (select 1 from public.friends
      where user_id = least(uid, invitation.user_id) and friend_id = greatest(uid, invitation.user_id))
  );
end $$;

-- Retrying an acceptance is safe. The invite owner has consented by sharing the link.
create or replace function public.accept_friend_invite(p_token uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inviter uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile_required';
  end if;
  select user_id into inviter from public.friend_invites
    where token = p_token and expires_at > now() for update;
  if not found then raise exception 'invalid_invite'; end if;
  if inviter = uid then raise exception 'own_invite'; end if;
  insert into public.friends(user_id, friend_id)
    values (least(uid, inviter), greatest(uid, inviter)) on conflict do nothing;
  return (select nickname from public.profiles where id = inviter);
end $$;

create or replace function public.get_friends()
returns table (friend_id uuid, nickname text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return query select p.id, p.nickname, f.created_at from public.friends f
    join public.profiles p on p.id = case when f.user_id = auth.uid() then f.friend_id else f.user_id end
    where f.user_id = auth.uid() or f.friend_id = auth.uid()
    order by lower(p.nickname), p.id;
end $$;

create or replace function public.remove_friend(p_friend_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from public.friends
    where user_id = least(auth.uid(), p_friend_id) and friend_id = greatest(auth.uid(), p_friend_id);
end $$;

create or replace function public.get_friends_leaderboard(p_mode text)
returns table (rank bigint, nickname text, score numeric, detail jsonb, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_mode is null or p_mode not in ('draw', 'cut', 'brake', 'overall') then
    raise exception 'bad_mode';
  end if;
  return query
    with members as (
      select auth.uid() as id
      union
      select case when f.user_id = auth.uid() then f.friend_id else f.user_id end
        from public.friends f where f.user_id = auth.uid() or f.friend_id = auth.uid()
    ), today as (
      select s.*, p.nickname from public.daily_scores s
        join members m on m.id = s.user_id join public.profiles p on p.id = s.user_id
        where s.play_date = (now() at time zone 'utc')::date
    ), base as (
      select t.user_id, t.nickname, t.score, t.detail, t.updated_at from today t
        where p_mode <> 'overall' and t.mode = p_mode
      union all
      select t.user_id, max(t.nickname), sum(t.score), jsonb_build_object('games', count(*)), max(t.updated_at)
        from today t where p_mode = 'overall' group by t.user_id
    ), ranked as (
      select row_number() over (order by b.score desc, b.updated_at asc, b.user_id) as rank,
        b.nickname, b.score, b.detail, b.user_id = auth.uid() as is_me from base b
    )
    select r.rank, r.nickname, r.score, r.detail, r.is_me from ranked r
      where r.rank <= 10 or r.is_me order by r.rank;
end $$;

revoke execute on function public.create_friend_invite(boolean), public.preview_friend_invite(uuid),
  public.accept_friend_invite(uuid), public.get_friends(), public.remove_friend(uuid),
  public.get_friends_leaderboard(text) from public, anon, authenticated;
grant execute on function public.create_friend_invite(boolean), public.preview_friend_invite(uuid),
  public.accept_friend_invite(uuid), public.get_friends(), public.remove_friend(uuid),
  public.get_friends_leaderboard(text) to authenticated;

commit;
