-- Reject offensive nicknames on every rename path and rename existing offenders.
-- Keep both lists in sync with src/lib/nickname.ts. Run after the preceding migrations.
begin;

-- Lowercase, undo common digit swaps (h1tl3r), treat l/i alike (HitIer), letters only.
create or replace function public.nickname_compact(p_text text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(translate(lower(coalesce(p_text, '')), '013457l', 'oieasti'), '[^a-z]', '', 'g');
$$;

create or replace function public.nickname_blocked(p_nickname text)
returns boolean language sql immutable set search_path = '' as $$
  select exists (
      -- Blocked anywhere in the name, even when glued to other words.
      select 1 from unnest(array[
        'hitler', 'nazi', 'nigger', 'nigga', 'faggot', 'kkk', 'siegheil', 'whitepower', 'holocaust', 'auschwitz',
        'fuck', 'shit', 'retard', 'whore', 'slut', 'bitch', 'pedophile', 'paedophile', 'molest'
      ]) as part
       where strpos(public.nickname_compact(p_nickname), public.nickname_compact(part)) > 0
    ) or exists (
      -- Blocked only as a whole word, because they also appear inside harmless names.
      select 1 from regexp_split_to_table(coalesce(p_nickname, ''), '[ _-]+') as word
       where public.nickname_compact(word) in (
         select public.nickname_compact(blocked) from unnest(array[
           'cunt', 'fag', 'kike', 'spic', 'chink', 'coon', 'gook', 'tranny', 'rape', 'rapist', 'pedo', 'porn', 'sex',
           'cock', 'dick', 'pussy', 'penis', 'anal', 'cum', 'heil'
         ]) as blocked)
    );
$$;

create or replace function public.set_nickname(p_nickname text)
returns text language plpgsql security definer set search_path = public as $$
declare v text := btrim(coalesce(p_nickname, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(v) not between 1 and 15 or v !~ '^[A-Za-z0-9][A-Za-z0-9 _-]*$'
    or public.nickname_blocked(v) then
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

create or replace function public.validate_profile_nickname()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.nickname is null or char_length(new.nickname) not between 1 and 15
    or new.nickname !~ '^[A-Za-z0-9][A-Za-z0-9 _-]*$'
    or public.nickname_blocked(new.nickname) then
    raise exception 'bad_nickname';
  end if;
  return new;
end $$;

-- Existing offenders get a neutral name; scores and accounts stay intact.
update public.profiles
   set nickname = 'Player' || substr(replace(id::text, '-', ''), 1, 8)
 where public.nickname_blocked(nickname);

commit;
