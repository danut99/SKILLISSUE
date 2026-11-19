import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MODE_INFO, type Mode } from '../config';
import { addDays, dayNumber } from './daily';
import { dailyDrawShape } from './drawShapes';
import type { ClipOptions } from './clipScenes';
import type { ClipTiming } from './clip';

/**
 * Creator mode: hidden tools for the game's own TikTok/Instagram account.
 * Enabled per device from the secret #creator page; nothing here is visible to normal players.
 */
interface CreatorState {
  enabled: boolean;
  /** Hide companions, ads and extra UI while playing, for clean screen recordings. */
  clean: boolean;
  /** "Day N of trying…" series text on clips; counts from this UTC date. */
  seriesStart: string | null;
  /** Custom hook replacing the default opening title (blank = default). */
  hook: string;
  /** Calendar days already posted. */
  posted: Record<string, boolean>;
  setEnabled: (enabled: boolean) => void;
  setClean: (clean: boolean) => void;
  setSeriesStart: (date: string | null) => void;
  setHook: (hook: string) => void;
  togglePosted: (date: string) => void;
}

export const useCreator = create<CreatorState>()(
  persist(
    (set) => ({
      enabled: false,
      clean: false,
      seriesStart: null,
      hook: '',
      posted: {},
      setEnabled: (enabled) => set({ enabled }),
      setClean: (clean) => set({ clean }),
      setSeriesStart: (seriesStart) => set({ seriesStart }),
      setHook: (hook) => set({ hook: hook.slice(0, 40) }),
      togglePosted: (date) => set((s) => ({ posted: { ...s.posted, [date]: !s.posted[date] } })),
    }),
    { name: 'skillissue:creator' },
  ),
);

export const SERIES_GOAL: Record<Mode, string> = {
  cut: 'CUT THIS BLOB 50/50',
  draw: 'DRAW THE PERFECT SHAPE',
  brake: 'STOP AT THE PERFECT SPOT',
};

export function seriesDay(seriesStart: string, date: string): number {
  return Math.max(1, dayNumber(date) - dayNumber(seriesStart) + 1);
}

/** Clip challenge line for the creator's recordings: custom hook > series > default. */
export function creatorClipOptions(mode: Mode, date: string): ClipOptions {
  const { enabled, seriesStart, hook } = useCreator.getState();
  if (!enabled) return {};
  if (hook.trim()) return { hook: hook.trim() };
  if (seriesStart) return { hook: `Day ${seriesDay(seriesStart, date)} of trying to ${SERIES_GOAL[mode].toLowerCase()}` };
  return {};
}

// ---------------------------------------------------------------------------
// Daily content calendar
// ---------------------------------------------------------------------------

export interface ContentIdea { key: string; title: string; how: string }

/** Formats that work for this game (written for Cut, the main event), rotated day by day. */
export const IDEAS: ContentIdea[] = [
  { key: 'pause-guess', title: 'Pause & guess', how: 'Post a Cut clip with the caption "pause & guess where you\'d cut 👀". People argue in the comments.' },
  { key: 'five-tries', title: '5 tries challenge', how: 'Play all 5 Cut tries, then tap "Make 5-tries video". The fails are the content.' },
  { key: 'near-miss', title: 'So close: 49.x%', how: 'Post your closest cut. Add a voiceover or text reaction to how close it was.' },
  { key: 'same-for-everyone', title: 'Same blob for everyone', how: 'Post today\'s best cut. "Everyone got this exact blob today, comment your split." Reply to comments with videos.' },
  { key: 'pass-the-phone', title: 'Pass the phone', how: 'Film a friend or family member cutting today\'s blob. "Who is the skill issue in my family?"' },
  { key: 'series', title: 'Day N of trying', how: 'Turn on the series counter below and post one cut a day. Same format every day builds followers.' },
  { key: 'roast', title: 'Read the roast', how: 'Post your worst cut and read the demon\'s roast out loud with a voiceover.' },
  { key: 'leaderboard', title: 'Leaderboard drama', how: 'Show the Cut top 10: "I was #1 for 3 hours…". Then show the cut that beat you.' },
];

// Cut is the main event; BRAKE! once a week keeps the feed varied.
const FOCUS: Mode[] = ['cut', 'cut', 'cut', 'brake', 'cut', 'cut', 'cut'];

export interface CalendarDay { date: string; day: number; mode: Mode; idea: ContentIdea }

export function planFor(date: string): CalendarDay {
  const day = dayNumber(date);
  const n = ((day % 7) + 7) % 7;
  return { date, day, mode: FOCUS[n], idea: IDEAS[(((day * 3) % IDEAS.length) + IDEAS.length) % IDEAS.length] };
}

export function calendar(today: string, before = 3, after = 10): CalendarDay[] {
  return Array.from({ length: before + after + 1 }, (_, i) => planFor(addDays(today, i - before)));
}

/** Three caption styles to rotate, so posts don't all read the same. */
export function captionVariants(mode: Mode, date: string, result: string | null, site: string): string[] {
  const { seriesStart } = useCreator.getState();
  const game = mode === 'draw' ? `draw today's ${dailyDrawShape(date)}` : mode === 'cut' ? 'cut this blob 50/50' : 'stop at the perfect spot';
  const score = result ? ` I got ${result}.` : '';
  const tags = `#skillissue #${MODE_INFO[mode].name.toLowerCase()} #challenge #game #fyp`;
  const series = seriesStart ? `Day ${seriesDay(seriesStart, date)} of trying to ${game} 😤` : `Trying to ${game} 😤`;
  const opener = mode === 'cut'
    ? `Pause & guess: where would YOU cut this blob 50/50? 👀 Everyone on Earth got it today.${score} Comment your split 👇`
    : `Everyone on Earth got this exact challenge today.${score} Can you beat it? Comment your score 👇`;
  return [
    `${opener}\n🎮 ${site}\n${tags}`,
    `5 tries to ${game}. Try 5 broke me 💀${score}\nComment your score 👇\n🎮 ${site}\n${tags}`,
    `${series}${score}\nSame challenge for everyone, new one every day.\n🎮 ${site}\n${tags}`,
  ];
}

// ---------------------------------------------------------------------------
// Every try's clip, kept on this device (IndexedDB) for the creator studio.
// ---------------------------------------------------------------------------

export interface StoredClip { id?: number; date: string; mode: Mode; score: number; label: string; at: number; blob: Blob; ext: string; timing: ClipTiming }

const DB = 'skillissue-creator';
const STORE = 'clips';
const KEEP_DAYS = 3;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      store.createIndex('date', 'date');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCreatorClip(clip: StoredClip): Promise<void> {
  if (!useCreator.getState().enabled || typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    await done(store.add(clip));
    // Videos are large: keep only the last few days.
    const old = await done(store.index('date').getAllKeys(IDBKeyRange.upperBound(addDays(clip.date, -KEEP_DAYS))));
    await Promise.all(old.map((key) => done(store.delete(key))));
    db.close();
  } catch (error) {
    console.warn('Could not keep creator clip', error);
  }
}

export async function loadCreatorClips(date: string): Promise<StoredClip[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await openDb();
    const clips = await done(db.transaction(STORE).objectStore(STORE).index('date').getAll(date)) as StoredClip[];
    db.close();
    return clips.sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

export async function deleteCreatorClip(id: number): Promise<void> {
  const db = await openDb();
  await done(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
  db.close();
}
