-- New rooms are listed by default; existing room visibility is preserved.
begin;
alter table public.party_rooms alter column is_public set default true;
alter table public.party_rooms alter column listed_seen_at set default now();
commit;
