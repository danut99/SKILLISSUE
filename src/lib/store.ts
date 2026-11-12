import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BASE_TRIES, MODES, type Mode } from '../config';
import { addDays } from './daily';

/** Extra info per attempt — also stored as jsonb in the leaderboard. */
export interface Detail {
  fail?: boolean;
  /** cut: smaller / larger half in % */
  a?: number;
  b?: number;
  /** cut: the slicing line [x1, y1, x2, y2] in stage coords */
  line?: number[];
  /** brake */
  gapCm?: number;
  crashed?: boolean;
  impactKmh?: number;
}

export interface Attempt {
  score: number;
  detail: Detail;
  at: number;
}

export interface ModeDay {
  tries: Attempt[];
  bonus: boolean;
}

type DayRecord = Partial<Record<Mode, ModeDay>>;

/** Shape returned by the get_my_state() RPC. */
export interface ServerState {
  today_date: string;
  nickname: string | null;
  today: { mode: Mode; score: number; detail: Detail; at: number }[];
  bonuses: Mode[];
  dates: string[];
}

/** Consecutive played days ending today or yesterday. */
export function streakFrom(dates: string[], today: string): number {
  const set = new Set(dates);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

interface PlayerState {
  playerId: string;
  nickname: string;
  muted: boolean;
  streak: number;
  lastDay: string;
  days: Record<string, DayRecord>;
  /** logbook (Krillion-style "My stats") */
  bestStreak: number;
  daysPlayed: number;
  bestTotal: number;
  settings: Settings;
  /** BRAKE! car skin, unlocked by streaks */
  carSkin: string;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setCarSkin: (id: string) => void;
  addAttempt: (date: string, mode: Mode, attempt: Attempt) => void;
  grantBonus: (date: string, mode: Mode) => void;
  setNickname: (n: string) => void;
  toggleMuted: () => void;
  /** server is the source of truth for today's tries, nickname & streak when online */
  hydrate: (s: ServerState) => void;
  /** forget everything (sign-out) */
  resetPlayer: () => void;
}

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const EMPTY: ModeDay = { tries: [], bonus: false };

const NAME_ADJ = ['Wobbly', 'Shaky', 'Sneaky', 'Turbo', 'Sleepy', 'Spicy', 'Soggy', 'Crispy', 'Grumpy', 'Lazy', 'Chunky', 'Sweaty', 'Dizzy', 'Salty'];
const NAME_NOUN = ['Potato', 'Toaster', 'Noodle', 'Goose', 'Pigeon', 'Waffle', 'Pickle', 'Llama', 'Nugget', 'Walrus', 'Muffin', 'Gremlin', 'Donut', 'Hamster'];

/** Funny auto-assigned nickname, e.g. "WobblyPotato42" (always ≤ 15 chars). */
export function randomName(): string {
  const r = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  return `${NAME_ADJ[r(NAME_ADJ.length)]}${NAME_NOUN[r(NAME_NOUN.length)]}${r(90) + 10}`;
}

export interface Settings {
  /** no scanlines / confetti / UI animations */
  lowPower: boolean;
  /** orange/blue instead of green/yellow, brighter text */
  colorblind: boolean;
  /** append the site link to shared results */
  shareLink: boolean;
}

const DEFAULT_SETTINGS: Settings = { lowPower: false, colorblind: false, shareLink: true };

/** Longest run of consecutive dates. */
export function longestStreak(dates: string[]): number {
  const sorted = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  sorted.forEach((d, i) => {
    run = i > 0 && addDays(sorted[i - 1], 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set) => ({
      playerId: uuid(),
      nickname: randomName(),
      muted: false,
      streak: 0,
      lastDay: '',
      days: {},
      bestStreak: 0,
      daysPlayed: 0,
      bestTotal: 0,
      settings: DEFAULT_SETTINGS,
      carSkin: 'pink',
      setSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
      setCarSkin: (carSkin) => set({ carSkin }),
      addAttempt: (date, mode, attempt) =>
        set((s) => {
          const day = s.days[date] ?? {};
          const md = day[mode] ?? EMPTY;
          const days: Record<string, DayRecord> = {};
          // keep one week of history
          for (const d of Object.keys(s.days)) if (d >= addDays(date, -7)) days[d] = s.days[d];
          days[date] = { ...day, [mode]: { ...md, tries: [...md.tries, attempt] } };
          let { streak, daysPlayed } = s;
          if (s.lastDay !== date) {
            streak = s.lastDay === addDays(date, -1) ? streak + 1 : 1;
            daysPlayed += 1;
          }
          return {
            days,
            streak,
            daysPlayed,
            lastDay: date,
            bestStreak: Math.max(s.bestStreak, streak),
            bestTotal: Math.max(s.bestTotal, totalScore(days, date)),
          };
        }),
      grantBonus: (date, mode) =>
        set((s) => {
          const day = s.days[date] ?? {};
          const md = day[mode] ?? EMPTY;
          return { days: { ...s.days, [date]: { ...day, [mode]: { ...md, bonus: true } } } };
        }),
      setNickname: (nickname) => set({ nickname }),
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
      hydrate: (srv) =>
        set((s) => {
          const today: DayRecord = {};
          for (const m of MODES) today[m] = { tries: [], bonus: srv.bonuses.includes(m) };
          for (const a of srv.today) today[a.mode]!.tries.push({ score: Number(a.score), detail: a.detail ?? {}, at: a.at });
          const dates = [...srv.dates].sort();
          const days = { ...s.days, [srv.today_date]: today };
          return {
            nickname: srv.nickname ?? s.nickname,
            days,
            streak: streakFrom(dates, srv.today_date),
            lastDay: dates[dates.length - 1] ?? '',
            daysPlayed: Math.max(s.daysPlayed, dates.length),
            bestStreak: Math.max(s.bestStreak, longestStreak(dates)),
            bestTotal: Math.max(s.bestTotal, totalScore(days, srv.today_date)),
          };
        }),
      resetPlayer: () =>
        set({ playerId: uuid(), nickname: randomName(), streak: 0, lastDay: '', days: {}, bestStreak: 0, daysPlayed: 0, bestTotal: 0, carSkin: 'pink' }),
    }),
    {
      name: 'skillissue:v1',
      version: 2,
      // v0 → v1: backfill the logbook stats from what was already stored
      migrate: (persisted, version) => {
        const s = persisted as PlayerState;
        if (version < 1) {
          const dates = Object.keys(s.days ?? {});
          s.bestStreak = Math.max(s.streak ?? 0, longestStreak(dates));
          s.daysPlayed = dates.length;
          s.bestTotal = Math.max(0, ...dates.map((d) => totalScore(s.days, d)));
          s.settings = DEFAULT_SETTINGS;
          s.carSkin = 'pink';
        }
        if (version < 2 && !s.nickname) s.nickname = randomName();
        return s;
      },
    },
  ),
);

// function declarations (hoisted): persist's migrate runs while this module is still initializing
export function modeDay(days: Record<string, DayRecord>, date: string, mode: Mode): ModeDay {
  return days[date]?.[mode] ?? EMPTY;
}

export const maxTries = (md: ModeDay) => BASE_TRIES + (md.bonus ? 1 : 0);
export const triesLeft = (md: ModeDay) => Math.max(0, maxTries(md) - md.tries.length);

export function bestAttempt(md: ModeDay): Attempt | null {
  return md.tries.reduce<Attempt | null>((b, t) => (!b || t.score > b.score ? t : b), null);
}

export function totalScore(days: Record<string, DayRecord>, date: string): number {
  return MODES.reduce((sum, m) => sum + (bestAttempt(modeDay(days, date, m))?.score ?? 0), 0);
}

export function cleanNickname(raw: string): string {
  return raw
    .normalize('NFKC')
    // oxlint-disable-next-line no-control-regex -- stripping control chars is the point
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 15);
}
