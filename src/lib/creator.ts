import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Mode } from '../config';
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
  postingGame: Mode | null;
  setPostingGame: (mode: Mode) => void;
  /** Hide companions, ads and extra UI while playing, for clean screen recordings. */
  clean: boolean;
  /** "Day N of trying…" series text on clips; counts from this UTC date. */
  seriesStart: string | null;
  /** Custom hook replacing the default opening title (blank = default). */
  hook: string;
  format: 'classic' | 'guess-cut' | 'beat-score';
  /** Calendar days already posted. */
  posted: Record<string, boolean>;
  setEnabled: (enabled: boolean) => void;
  setClean: (clean: boolean) => void;
  setSeriesStart: (date: string | null) => void;
  setHook: (hook: string) => void;
  setFormat: (format: 'classic' | 'guess-cut' | 'beat-score') => void;
  togglePosted: (date: string) => void;
}

export const useCreator = create<CreatorState>()(
  persist(
    (set) => ({
      enabled: false,
      postingGame: null,
      setPostingGame: (postingGame) => set({ postingGame }),
      clean: false,
      seriesStart: null,
      hook: '',
      format: 'classic',
      posted: {},
      setEnabled: (enabled) => set({ enabled }),
      setClean: (clean) => set({ clean }),
      setSeriesStart: (seriesStart) => set({ seriesStart }),
      setHook: (hook) => set({ hook: hook.slice(0, 40) }),
      setFormat: (format) => set({ format }),
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
  const { enabled, seriesStart, hook, format } = useCreator.getState();
  if (!enabled) return {};
  const selected = format === 'beat-score' ? format : mode === 'cut' && format === 'guess-cut' ? format : 'classic' as const;
  if (hook.trim()) return { hook: hook.trim(), format: selected };
  if (selected !== 'classic') return { format: selected };
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
  const shape = dailyDrawShape(date);
  const subject = mode === 'cut' ? 'cut this shape 50/50' : mode === 'draw' ? `draw a perfect ${shape}` : 'nail the perfect stop';
  const score = result ? mode === 'cut' ? `My split: ${result}.` : mode === 'draw' ? `My accuracy: ${result}.` : `My stop: ${result}.` : '';
  const hooks: Record<Mode, [string, string, string]> = {
    cut: [
      'Where would YOU cut this 50/50? Pick your line before the reveal.',
      'One straight cut. Two equal halves. Harder than it looks.',
      'A new shape. Another chance to get that perfect 50/50.',
    ],
    draw: [
      `Could you draw this ${shape} in one stroke? No ruler. No undo.`,
      `Drawing a ${shape} sounds easy. Keeping it perfect is the hard part.`,
      `Today’s test: one ${shape}, one steady hand. Tomorrow, a fresh challenge.`,
    ],
    brake: [
      'When would YOU hit the brakes? Pick your moment before the stop.',
      'One tap to brake. Too early or too late? Watch the final distance.',
      'Same car. Same road. A fresh chance to get the timing right.',
    ],
  };
  const invitations: Record<Mode, [string, string, string]> = {
    cut: ['Where would your line go?', 'Can you get closer to 50/50?', 'Try today’s shape and share your split.'],
    draw: ['How steady is your hand?', 'Can you draw it more accurately?', 'Try today’s shape and share your accuracy.'],
    brake: ['Would you brake earlier or later?', 'Can you stop closer to the target?', 'Try today’s drive and share your distance.'],
  };
  const tags = `#skilly #skillissue #${mode === 'draw' ? 'drawingchallenge' : mode === 'cut' ? '5050challenge' : 'timingchallenge'} #dailychallenge`;
  return hooks[mode].map((hook, index) => {
    const opening = index === 2 && seriesStart ? `Day ${seriesDay(seriesStart, date)} of trying to ${subject}.` : hook;
    return [opening, score, invitations[mode][index], `Play free in your browser (no app, no download): ${site}`, tags].filter(Boolean).join('\n');
  });
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
