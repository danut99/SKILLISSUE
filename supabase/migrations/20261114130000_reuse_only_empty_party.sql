-- Reuse only an untouched solo lobby. Populated rooms and match history
-- remain available while the host creates another room for a different group.
begin;
create or replace function public.create_party_room()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); existing_id uuid; new_room_id uuid;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if not exists(select 1 from public.profiles where id=uid) then raise exception 'profile_required'; end if;
 perform pg_advisory_xact_lock(hashtext(uid::text || ':party:create'));
 select r.id into existing_id from public.party_rooms r
 where r.host_id=uid and r.expires_at>now()
   and r.started_at is null and r.match_no=1
   and exists(select 1 from public.party_members m where m.room_id=r.id and m.user_id=uid and m.active)
   -- Even a departed guest means this is an existing group's room.
   and not exists(select 1 from public.party_members m where m.room_id=r.id and m.user_id<>uid)
   and not exists(select 1 from public.party_results a where a.room_id=r.id)
   and not exists(select 1 from public.party_match_players p where p.room_id=r.id)
   and not exists(select 1 from public.party_match_settings s where s.room_id=r.id)
 order by r.created_at desc,r.id limit 1 for update;
 if existing_id is not null then
  update public.party_rooms set listed_seen_at=clock_timestamp() where id=existing_id;
  return public.party_room_payload(existing_id) || jsonb_build_object('reused_room',true);
 end if;
 insert into public.party_rooms(host_id) values(uid) returning id into new_room_id;
 insert into public.party_members(room_id,user_id) values(new_room_id,uid);
 return public.party_room_payload(new_room_id) || jsonb_build_object('reused_room',false);
end $$;
revoke all on function public.create_party_room() from public,anon,authenticated;
grant execute on function public.create_party_room() to authenticated;
commit;
