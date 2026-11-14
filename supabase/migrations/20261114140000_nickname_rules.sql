-- Enforce nickname rules on the server as well as in the client.
-- Existing profiles and score ownership are preserved; invalid names must be
-- changed by their owner. This migration does not rename players automatically.
begin;

create or replace function public.set_nickname(p_nickname text)
returns text language plpgsql security definer set search_path = public as $$
declare v text := btrim(coalesce(p_nickname, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(v) not between 1 and 15 or v !~ '^[A-Za-z0-9][A-Za-z0-9 _-]*$' then
    raise exception 'bad_nickname';
  end if;
  begin
    insert into profiles (id, nickname) values (auth.uid(), v)
    on conflict (id) do update set nickname = excluded.nickname;
  exception when unique_violation then
    raise exception 'nickname_taken';
  end;
  return v;
end $$;

-- Protect other insert/rename paths too, without rewriting existing profiles.
create or replace function public.validate_profile_nickname()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.nickname is null or char_length(new.nickname) not between 1 and 15
    or new.nickname !~ '^[A-Za-z0-9][A-Za-z0-9 _-]*$' then
    raise exception 'bad_nickname';
  end if;
  return new;
end $$;

revoke all on function public.validate_profile_nickname() from public;
drop trigger if exists validate_profile_nickname on public.profiles;
create trigger validate_profile_nickname
before insert or update of nickname on public.profiles
for each row execute function public.validate_profile_nickname();

commit;
