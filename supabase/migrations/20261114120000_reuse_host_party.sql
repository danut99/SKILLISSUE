begin;

-- Stop concurrent clicks/tabs from creating multiple rooms for one host.
create or replace function public.create_party_room()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); existing_id uuid; new_room_id uuid;
begin
 if uid is null then raise exception 'not_authenticated'; end if;
 if not exists(select 1 from public.profiles where id=uid) then raise exception 'profile_required'; end if;
 perform pg_advisory_xact_lock(hashtext(uid::text || ':party:create'));
 select r.id into existing_id from public.party_rooms r
 where r.host_id=uid and r.expires_at>now()
   and exists(select 1 from public.party_members m where m.room_id=r.id and m.user_id=uid and m.active)
 order by (r.started_at is not null) desc, r.created_at desc limit 1 for update;
 if existing_id is not null then
  update public.party_rooms set listed_seen_at=clock_timestamp() where id=existing_id;
  return public.party_room_payload(existing_id) || jsonb_build_object('reused_room',true);
 end if;
 insert into public.party_rooms(host_id) values(uid) returning id into new_room_id;
 insert into public.party_members(room_id,user_id) values(new_room_id,uid);
 return public.party_room_payload(new_room_id) || jsonb_build_object('reused_room',false);
end $$;

-- Close only redundant waiting rooms where nobody else has joined.
-- Keep any room with another active player or a match/history intact.
with candidates as (
 select r.id,r.host_id,r.created_at,
  row_number() over(partition by r.host_id order by r.created_at desc,r.id) as position
 from public.party_rooms r
 where r.expires_at>now() and r.started_at is null and r.match_no=1
 and exists(select 1 from public.party_members m where m.room_id=r.id and m.user_id=r.host_id and m.active)
 and not exists(select 1 from public.party_members m where m.room_id=r.id and m.user_id<>r.host_id and m.active)
 and not exists(select 1 from public.party_results a where a.room_id=r.id)
)
update public.party_rooms set expires_at=now(),is_public=false
 where id in(select id from candidates where position>1);

-- Legacy creation endpoint must not reset a reused room's game configuration.
create or replace function public.create_party_room_with_games(p_games text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare created jsonb;
begin
 created := public.create_party_room();
 if coalesce((created->>'reused_room')::boolean,false) then return created; end if;
 return public.set_party_games((created->>'token')::uuid,p_games);
end $$;
revoke all on function public.create_party_room(),public.create_party_room_with_games(text[]) from public,anon,authenticated;
grant execute on function public.create_party_room(),public.create_party_room_with_games(text[]) to authenticated;
commit;
