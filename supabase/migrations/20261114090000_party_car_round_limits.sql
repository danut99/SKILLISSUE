begin;

-- Three distinct driving objectives per match. Existing running matches retain
-- their recorded schedule, while lobbies and rematches use the new limits.
create or replace function public.enforce_party_car_round_limit()
returns trigger language plpgsql set search_path = '' as $$
declare maximum integer;
begin
  if 'brake' = any(new.selected_games) then
    maximum := 3 * cardinality(new.selected_games);
    if new.started_at is null then
      new.round_count := least(new.round_count, maximum);
    elsif tg_op = 'UPDATE' and old.started_at is null and new.round_count > maximum then
      raise exception 'bad_round_count';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists party_car_round_limit on public.party_rooms;
create trigger party_car_round_limit
  before insert or update of selected_games, round_count, started_at on public.party_rooms
  for each row execute function public.enforce_party_car_round_limit();

with adjusted as (
  update public.party_rooms
    set round_count = 3 * cardinality(selected_games)
  where started_at is null and 'brake' = any(selected_games)
    and round_count > 3 * cardinality(selected_games)
  returning id
)
update public.party_members set ready = false where room_id in (select id from adjusted);

revoke all on function public.enforce_party_car_round_limit() from public, anon, authenticated;
commit;
