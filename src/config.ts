// ---------------------------------------------------------------------------
// App configuration.
// Leaderboard: create a Supabase project, run supabase/schema.sql in its SQL
// editor, then put the values in a .env file (see .env.example) or replace the
// placeholders below. Until then a local demo leaderboard is used automatically.
// ---------------------------------------------------------------------------
export const SUPABASE_URL: string =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://YOUR-PROJECT-ID.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY: string =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  'YOUR-SUPABASE-PUBLISHABLE-KEY';

/** Microsoft Clarity project id (public, it ships in the page). Override with VITE_CLARITY_PROJECT_ID; set it to an empty value to disable. */
export const CLARITY_PROJECT_ID: string = import.meta.env.VITE_CLARITY_PROJECT_ID?.trim() ?? 'zcwstocts6';

export const GAME_NAME = 'SKILL ISSUE';
export const LAUNCH_DATE = '2026-11-12';
export const BASE_TRIES = 5;
/** "Watch an ad → +1 try". Off for now; flip to true once a real rewarded-ad network is wired in. */
export const REWARDED_ADS = false;

export const MODES = ['draw', 'cut', 'brake'] as const;
export type Mode = (typeof MODES)[number];
export type BoardMode = Mode | 'overall';
export type LeaderboardPeriod = 'daily' | 'all-time' | 'levels';

export interface ModeInfo {
  emoji: string;
  name: string;
  title: string;
  tagline: string;
  crown: string;
  color: string;
}

export const MODE_INFO: Record<Mode, ModeInfo> = {
  draw: {
    emoji: '🎯',
    name: 'Draw',
    title: 'Perfect Shape',
    tagline: 'One shape. One stroke. No excuses.',
    crown: 'Master of Drawing',
    color: '#4de3ff',
  },
  cut: {
    emoji: '🔪',
    name: 'Cut',
    title: 'Perfect Cut',
    tagline: "Today's shape. One cut. Two equal halves.",
    crown: 'Master of Cuts',
    color: '#ff5d8f',
  },
  brake: {
    emoji: '🚗',
    name: 'Brake',
    title: 'Perfect Stop',
    tagline: 'A new driving objective each day. Nail the stop.',
    crown: 'Master of Brakes',
    color: '#ffd23f',
  },
};

/** Public destination for social buttons, copied text and exported cards. */
export const siteUrl = (): string =>
  (typeof document !== 'undefined' && document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href)
  || (typeof location !== 'undefined' && location.host ? location.origin + location.pathname : 'https://playskillissue.pages.dev/');

/** BRAKE! car skins — unlocked by best streak (like Krillion's dive buddies). */
export const CAR_SKINS = [
  { id: 'pink', name: 'Pink Potato', color: '#ff9ccf', streak: 0 },
  { id: 'taxi', name: 'Panic Taxi', color: '#ffd23f', streak: 3 },
  { id: 'cop', name: 'Fake Cop', color: '#4d7cff', streak: 7 },
  { id: 'lime', name: 'Toxic Lime', color: '#5dff9d', streak: 14 },
  { id: 'void', name: 'Void Grandma', color: '#b06bff', streak: 30 },
] as const;

/** Social / contact links shown in the menu. Replace before launch (leave '' to hide). */
export const LINKS = {
  tiktok: 'https://www.tiktok.com/@playskillissue',
  feedback: 'mailto:bocadanut99@gmail.com?subject=SKILL%20ISSUE%20feedback',
};
