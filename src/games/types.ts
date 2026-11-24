import type { Pt } from '../lib/geometry';
import type { Detail } from '../lib/store';

/** Logical stage size (9:16). Rendered at 2× for crisp TikTok clips (720×1280). */
export const W = 360;
export const H = 640;
export const SCALE = 2;

export const C = {
  bg: '#101310',
  grid: '#1d241b',
  panel: '#1a2019',
  line: '#374030',
  cyan: '#bfa7ff',
  pink: '#ffb2d0',
  text: '#f6f5ed',
  muted: '#abb4a1',
  yellow: '#ffd27c',
  green: '#b9ed91',
  red: '#ff8a83',
};

export const FONT = 'Arial, Helvetica, sans-serif';

export interface AttemptResult {
  score: number;
  detail: Detail;
  display: string;
}

export interface GameApi {
  date: string;
  finish: (res: AttemptResult) => void;
  startClip: () => void;
  cancelClip: () => void;
  toast: (msg: string) => void;
}

export interface Game {
  down?: (p: Pt, e: PointerEvent) => void;
  move?: (p: Pt, e: PointerEvent) => void;
  up?: (p: Pt, e: PointerEvent) => void;
  key?: (e: KeyboardEvent) => void;
  update?: (now: number) => void;
  render: (c: CanvasRenderingContext2D, now: number) => void;
  /** Same scene without HUD/prompts/companions, for full-screen video clips. */
  renderClip?: (c: CanvasRenderingContext2D, now: number) => void;
  destroy?: () => void;
  /** cut: show the #1 player's line after you're out of tries */
  setGhost?: (line: number[] | null) => void;
}

/** Event time on the performance.now() clock (exact tap timing, not frame timing). */
export function eventTime(e?: Event): number {
  const n = performance.now();
  const t = e?.timeStamp;
  return t && Math.abs(t - n) < 1000 ? t : n;
}
