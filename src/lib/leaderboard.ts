/*
================================================================================
 SUPABASE SETUP — run once in Supabase → SQL Editor (same as supabase/schema.sql)
 Then in Authentication → Providers: enable "Anonymous sign-ins", "Email" and
 "Google"; in Authentication → Sign In / Providers enable "Manual linking";
 add your site URL under Authentication → URL Configuration → Redirect URLs.
================================================================================

-- Players get a silent anonymous auth user; linking Google/email keeps the SAME id.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nickname   text not null check (char_length(nickname) between 1 and 15),
  created_at timestamptz not null default now()
);
-- reserved nicknames: one owner per name (case-insensitive)
create unique index if not exists profiles_nickname_key on public.profiles (lower(nickname));

-- every single try (enforces 5/day/mode on the server, enables cross-device resume)
create table if not exists public.attempts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  play_date  date not null default ((now() at time zone 'utc')::date),
  mode       text not null check (mode in ('draw', 'cut', 'brake')),
  score      numeric(5,2) not null check (score >= 0 and score <= 100),
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists attempts_user_day_idx on public.attempts (user_id, play_date, mode);

-- +1 try per mode/day (rewarded ad)
create table if not exists public.bonuses (
  user_id   uuid not null references auth.users (id) on delete cascade,
  play_date date not null,
  mode      text not null check (mode in ('draw', 'cut', 'brake')),
  primary key (user_id, play_date, mode)
);

-- best score per (player, day, mode) → leaderboard
create table if not exists public.daily_scores (
  user_id    uuid not null references auth.users (id) on delete cascade,
  play_date  date not null,
  mode       text not null check (mode in ('draw', 'cut', 'brake')),
  score      numeric(5,2) not null check (score >= 0 and score <= 100),
  detail     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, play_date, mode)
);
create index if not exists daily_scores_board_idx on public.daily_scores (play_date, mode, score desc, updated_at);

-- RLS: players may only READ their own rows; all WRITES go through the functions below.
alter table public.profiles     enable row level security;
alter table public.attempts     enable row level security;
alter table public.bonuses      enable row level security;
alter table public.daily_scores enable row level security;
revoke all on public.profiles, public.attempts, public.bonuses, public.daily_scores from anon, authenticated;
grant select on public.profiles, public.attempts, public.bonuses to authenticated;
create policy "own profile"  on public.profiles for select to authenticated using (id = auth.uid());
create policy "own attempts" on public.attempts for select to authenticated using (user_id = auth.uid());
create policy "own bonuses"  on public.bonuses  for select to authenticated using (user_id = auth.uid());

-- Record one try. Server decides the date (UTC) and enforces the daily limit.
create or replace function public.record_attempt(p_mode text, p_score numeric, p_detail jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d date := (now() at time zone 'utc')::date;
  used int;
  allowed int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_mode not in ('draw', 'cut', 'brake') then raise exception 'bad_mode'; end if;
  if p_score is null or p_score < 0 or p_score > 100 then raise exception 'bad_score'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text || d::text || p_mode));
  select count(*) into used from attempts where user_id = uid and play_date = d and mode = p_mode;
  select 5 + count(*) into allowed from bonuses where user_id = uid and play_date = d and mode = p_mode;
  if used >= allowed then raise exception 'no_tries_left'; end if;

  insert into attempts (user_id, play_date, mode, score, detail)
  values (uid, d, p_mode, round(p_score, 2), coalesce(p_detail, '{}'::jsonb));

  insert into daily_scores (user_id, play_date, mode, score, detail)
  values (uid, d, p_mode, round(p_score, 2), coalesce(p_detail, '{}'::jsonb))
  on conflict (user_id, play_date, mode) do update
    set score = excluded.score, detail = excluded.detail, updated_at = now()
    where excluded.score > daily_scores.score;

  return jsonb_build_object('used', used + 1, 'allowed', allowed);
end $$;

create or replace function public.grant_bonus(p_mode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_mode not in ('draw', 'cut', 'brake') then raise exception 'bad_mode'; end if;
  insert into bonuses (user_id, play_date, mode)
  values (auth.uid(), (now() at time zone 'utc')::date, p_mode) on conflict do nothing;
end $$;

-- Claim / rename nickname. Raises 'nickname_taken' if someone else owns it.
create or replace function public.set_nickname(p_nickname text)
returns text language plpgsql security definer set search_path = public as $$
declare v text := btrim(coalesce(p_nickname, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(v) not between 1 and 15 or v !~ '^[A-Za-z0-9][A-Za-z0-9 _-]*$' then raise exception 'bad_nickname'; end if;
  begin
    insert into profiles (id, nickname) values (auth.uid(), v)
    on conflict (id) do update set nickname = excluded.nickname;
  exception when unique_violation then
    raise exception 'nickname_taken';
  end;
  return v;
end $$;

-- Everything a returning player needs on a new device.
create or replace function public.get_my_state()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today_date', (now() at time zone 'utc')::date,
    'nickname', (select nickname from profiles where id = auth.uid()),
    'today', coalesce((
      select jsonb_agg(jsonb_build_object('mode', mode, 'score', score, 'detail', detail,
                       'at', (extract(epoch from created_at) * 1000)::bigint) order by created_at)
        from attempts where user_id = auth.uid() and play_date = (now() at time zone 'utc')::date), '[]'::jsonb),
    'bonuses', coalesce((
      select jsonb_agg(mode) from bonuses
       where user_id = auth.uid() and play_date = (now() at time zone 'utc')::date), '[]'::jsonb),
    'dates', coalesce((
      select jsonb_agg(distinct play_date) from attempts
       where user_id = auth.uid() and play_date > (now() at time zone 'utc')::date - 400), '[]'::jsonb)
  );
$$;

-- Today's Top 10 (+ caller's row if outside). Only players with a nickname appear.
-- p_mode: 'draw' | 'cut' | 'brake' | 'overall' (sum of the 3 best scores).
create or replace function public.get_leaderboard(p_mode text)
returns table (rank bigint, nickname text, score numeric, detail jsonb, is_me boolean)
language sql stable security definer set search_path = public as $$
  with today as (
    select s.user_id, p.nickname, s.mode, s.score, s.detail, s.updated_at
      from daily_scores s join profiles p on p.id = s.user_id
     where s.play_date = (now() at time zone 'utc')::date
  ), base as (
    select user_id, nickname, score, detail, updated_at from today
     where p_mode <> 'overall' and mode = p_mode
    union all
    select user_id, max(nickname), sum(score), jsonb_build_object('games', count(*)), max(updated_at)
      from today where p_mode = 'overall' group by user_id
  ), ranked as (
    select row_number() over (order by score desc, updated_at asc) as rank,
           nickname, score, detail, coalesce(user_id = auth.uid(), false) as is_me
      from base
  )
  select rank, nickname, score, detail, is_me from ranked where rank <= 10 or is_me order by rank;
$$;

revoke execute on function public.record_attempt(text, numeric, jsonb), public.grant_bonus(text),
  public.set_nickname(text), public.get_my_state(), public.get_leaderboard(text) from public;
grant execute on function public.record_attempt(text, numeric, jsonb) to authenticated;
grant execute on function public.grant_bonus(text) to authenticated;
grant execute on function public.set_nickname(text) to authenticated;
grant execute on function public.get_my_state() to authenticated;
grant execute on function public.get_leaderboard(text) to anon, authenticated;

================================================================================
*/
import { type BoardMode, type Mode, MODES } from '../config';
import { isOnline, syncFromServer, useAuth, whenAuthReady } from './auth';
import { rngFor } from './daily';
import { brakeScore } from './brakeChallenge';
import { round2 } from './geometry';
import { bestAttempt, modeDay, randomName, usePlayer, type Attempt, type Detail } from './store';
import { getSupabase } from './supabase';

export interface BoardRow {
  rank: number;
  nickname: string;
  score: number;
  detail: Detail;
  is_me: boolean;
}

export interface Board {
  rows: BoardRow[];
  myRank: number | null;
  source: 'global' | 'demo' | 'friends';
}

// ---------------------------------------------------------------------------
// Demo leaderboard (localStorage + a few seeded bots) so the app works before
// Supabase is connected. Clearly labelled as "demo" in the UI.
// ---------------------------------------------------------------------------
const MOCK_KEY = 'skillissue:mocklb';
const BOT_NAMES = [
  'CircleGod', 'xX_Slicer_Xx', 'Grandma_Turbo', 'NoBrakesNick', 'PotatoHands', 'LaserLisa',
  'CompassKid', 'Mr.Wobbly', 'SkidMarkSam', 'HalfHalfHarry', 'TikTokTony', 'DrunkGeometry',
];

interface MockEntry {
  nickname: string;
  score: number;
  detail: Detail;
  updated: number;
}
type MockStore = { date: string; entries: Partial<Record<Mode, MockEntry>> };

function loadMock(date: string): MockStore {
  try {
    const s = JSON.parse(localStorage.getItem(MOCK_KEY) ?? 'null') as MockStore | null;
    if (s?.date === date) return s;
  } catch {
    /* ignore */
  }
  return { date, entries: {} };
}

function botEntries(date: string, mode: Mode): MockEntry[] {
  const rng = rngFor(`${date}:bots`);
  const names = [...BOT_NAMES].sort(() => rng() - 0.5).slice(0, 9);
  return names.map((nickname, i) => {
    const r = rngFor(`${date}:bot:${i}:${mode}`);
    if (mode === 'draw') return { nickname, score: round2(62 + r() * 37), detail: {}, updated: i };
    if (mode === 'cut') {
      const a = +(50 - r() * 6).toFixed(1);
      return { nickname, score: round2(100 - (50 - a) * 4), detail: { a, b: +(100 - a).toFixed(1) }, updated: i };
    }
    if (r() < 0.15) return { nickname, score: 0, detail: { crashed: true, impactKmh: Math.round(5 + r() * 40) }, updated: i };
    const gapCm = Math.exp(r() * 6);
    return { nickname, score: round2(brakeScore(gapCm)), detail: { gapCm: +gapCm.toFixed(1) }, updated: i };
  });
}

function mockBoard(date: string, mode: BoardMode): Board {
  const store = loadMock(date);
  type Row = MockEntry & { me: boolean };
  let rows: Row[];
  if (mode === 'overall') {
    const bots = new Map<string, Row>();
    for (const m of MODES)
      for (const e of botEntries(date, m)) {
        const r = bots.get(e.nickname) ?? { nickname: e.nickname, score: 0, detail: {}, updated: e.updated, me: false };
        r.score = round2(r.score + e.score);
        bots.set(e.nickname, r);
      }
    rows = [...bots.values()];
    const mine = MODES.map((m) => store.entries[m]).filter((e): e is MockEntry => !!e);
    if (mine.length)
      rows.push({ nickname: mine[0].nickname, score: round2(mine.reduce((s, e) => s + e.score, 0)), detail: {}, updated: Date.now(), me: true });
  } else {
    rows = botEntries(date, mode).map((e) => ({ ...e, me: false }));
    const mine = store.entries[mode];
    if (mine) rows.push({ ...mine, me: true });
  }
  rows.sort((a, b) => b.score - a.score || a.updated - b.updated);
  const ranked = rows.map((r, i) => ({ rank: i + 1, nickname: r.nickname, score: r.score, detail: r.detail, is_me: r.me }));
  const me = ranked.find((r) => r.is_me);
  return { rows: ranked.filter((r) => r.rank <= 10 || r.is_me), myRank: me?.rank ?? null, source: 'demo' };
}

/** Demo totals use saved history, with only one best score per day and game. */
export function localAllTimeBoard(date: string, mode: BoardMode): Board {
  const { days, nickname } = usePlayer.getState();
  const dates = [...new Set([...Object.keys(days).filter(day => day <= date), date])].sort();
  const modes = mode === 'overall' ? MODES : [mode];
  const bots = new Map<string, { score: number; days: Set<string>; games: number }>();
  let score = 0;
  let games = 0;
  let playedDays = 0;
  for (const day of dates) {
    let played = false;
    for (const game of modes) {
      for (const entry of botEntries(day, game)) {
        const bot = bots.get(entry.nickname) ?? { score: 0, days: new Set<string>(), games: 0 };
        bot.score += entry.score;
        bot.games++;
        bot.days.add(day);
        bots.set(entry.nickname, bot);
      }
      const best = bestAttempt(modeDay(days, day, game));
      if (best) {
        score += best.score;
        games++;
        played = true;
      }
    }
    if (played) playedDays++;
  }
  const rows = [...bots].map(([name, bot]) => ({ nickname: name, score: round2(bot.score),
    detail: { days: bot.days.size, games: bot.games }, is_me: false }));
  if (games) rows.push({ nickname, score: round2(score), detail: { days: playedDays, games }, is_me: true });
  rows.sort((a, b) => b.score - a.score || Number(a.is_me) - Number(b.is_me) || a.nickname.localeCompare(b.nickname));
  const ranked = rows.map((row, index) => ({ ...row, rank: index + 1 }));
  return { rows: ranked.filter(row => row.rank <= 10 || row.is_me), myRank: ranked.find(row => row.is_me)?.rank ?? null, source: 'demo' };
}

function mockSubmit(date: string, mode: Mode, a: Attempt, nickname: string) {
  const store = loadMock(date);
  const prev = store.entries[mode];
  if (!prev || a.score > prev.score) store.entries[mode] = { nickname, score: a.score, detail: a.detail, updated: Date.now() };
  for (const m of MODES) if (store.entries[m]) store.entries[m]!.nickname = nickname;
  localStorage.setItem(MOCK_KEY, JSON.stringify(store));
}

function mockSubmitAll(date: string, nickname: string) {
  const { days } = usePlayer.getState();
  for (const m of MODES) {
    const best = bestAttempt(modeDay(days, date, m));
    if (best) mockSubmit(date, m, best, nickname);
  }
}

// ---------------------------------------------------------------------------
// Public API — Supabase when online, demo board otherwise
// ---------------------------------------------------------------------------

import { validNickname } from './nickname';

let nameClaimedFor: string | null = null;

/** Online: make sure the auto-assigned name is registered (unique) before the first score shows up. */
export async function ensureNickname() {
  if (nameClaimedFor === useAuth.getState().userId && nameClaimedFor !== null) return;
  const st = usePlayer.getState();
  let name = st.nickname || randomName();
  for (let i = 0; i < 5; i++) {
    const r = await claimNickname('', name);
    if (r.ok) {
      st.setNickname(r.nickname);
      return;
    }
    if (r.reason !== 'taken') return;
    name = randomName();
  }
}

/** Store a finished try (always auto-submitted). Online: server enforces the daily limit. */
export async function recordAttempt(date: string, mode: Mode, a: Attempt): Promise<'ok' | 'no_tries_left' | 'error'> {
  await whenAuthReady();
  const sb = await getSupabase();
  if (sb && isOnline()) {
    await ensureNickname();
    const { error } = await sb.rpc('record_attempt', { p_mode: mode, p_score: round2(a.score), p_detail: a.detail });
    if (!error) return 'ok';
    console.warn('record_attempt failed', error);
    return error.message.includes('no_tries_left') ? 'no_tries_left' : 'error';
  }
  const { nickname } = usePlayer.getState();
  if (nickname) mockSubmitAll(date, nickname);
  return 'ok';
}

/** Claim a (unique) nickname. Online scores are already recorded, so this is all "Submit Score" needs. */
export async function claimNickname(date: string, raw: string): Promise<{ ok: true; nickname: string } | { ok: false; reason: 'taken' | 'invalid' | 'error' }> {
  raw = raw.trim();
  if (!validNickname(raw)) return { ok: false, reason: 'invalid' };
  await whenAuthReady();
  const owner = useAuth.getState().userId;
  const sb = await getSupabase();
  if (useAuth.getState().userId !== owner) return { ok: false, reason: 'error' };
  if (sb && isOnline()) {
    const { data, error } = await sb.rpc('set_nickname', { p_nickname: raw });
    if (useAuth.getState().userId !== owner) return { ok: false, reason: 'error' };
    if (error) return { ok: false, reason: error.message.includes('nickname_taken') ? 'taken' : error.message.includes('bad_nickname') ? 'invalid' : 'error' };
    nameClaimedFor = useAuth.getState().userId;
    return { ok: true, nickname: String(data) };
  }
  if (date) mockSubmitAll(date, raw);
  return { ok: true, nickname: raw };
}

/** Server said we're out of tries (other device) → pull the real state. */
export const syncAfterLimit = () => syncFromServer();

export async function grantBonusRemote(mode: Mode) {
  await whenAuthReady();
  const sb = await getSupabase();
  if (sb && isOnline()) {
    const { error } = await sb.rpc('grant_bonus', { p_mode: mode });
    if (error) console.warn('grant_bonus failed', error);
  }
}

export async function fetchBoard(date: string, mode: BoardMode): Promise<Board> {
  await whenAuthReady();
  const sb = await getSupabase();
  if (sb && isOnline()) {
    const { data, error } = await sb.rpc('get_leaderboard', { p_mode: mode });
    if (!error && Array.isArray(data)) {
      const rows = (data as BoardRow[]).map((r) => ({ ...r, rank: Number(r.rank), score: Number(r.score), detail: r.detail ?? {} }));
      return { rows, myRank: rows.find((r) => r.is_me)?.rank ?? null, source: 'global' };
    }
    console.warn('get_leaderboard failed → demo board', error);
  }
  return mockBoard(date, mode);
}

export async function fetchAllTimeBoard(date: string, mode: BoardMode): Promise<Board> {
  await whenAuthReady();
  const sb = await getSupabase();
  if (sb && isOnline()) {
    const { data, error } = await sb.rpc('get_all_time_leaderboard', { p_mode: mode, p_friends_only: false });
    if (error || !Array.isArray(data)) {
      console.warn('get_all_time_leaderboard failed', error);
      throw new Error('All-time scores are temporarily unavailable.');
    }
    const rows = (data as BoardRow[]).map(row => ({ ...row, rank: Number(row.rank), score: Number(row.score), detail: row.detail ?? {} }));
    return { rows, myRank: rows.find(row => row.is_me)?.rank ?? null, source: 'global' };
  }
  return localAllTimeBoard(date, mode);
}

export async function fetchLevelBoard(mode: BoardMode, friendsOnly = false): Promise<Board> {
  await whenAuthReady();
  const sb = await getSupabase();
  if (!sb || !isOnline()) throw new Error('Connect online to view level rankings.');
  const { data, error } = await sb.rpc('get_level_leaderboard', { p_mode: mode, p_friends_only: friendsOnly });
  if (error || !Array.isArray(data)) throw new Error('Level rankings are temporarily unavailable.');
  const rows = (data as BoardRow[]).map(row => ({ ...row, rank: Number(row.rank), score: Number(row.score), detail: row.detail ?? {} }));
  return { rows, myRank: rows.find(row => row.is_me)?.rank ?? null, source: friendsOnly ? 'friends' : 'global' };
}
