import { siteUrl, type Mode } from '../config';
import { fmtResult } from './scoring';
import type { Attempt } from './store';

/**
 * TikTok-style clips: the game full screen, one short challenge line on top,
 * a big reveal at the moment of truth, then it ends (so it loops). No cards, no boxes.
 */
export const CLIP_GAMEPLAY_MS = 8000;
/** How long the reveal stays on screen after the game's own result animation. */
export const CLIP_HOLD_MS = 1200;
export type ClipMode = Mode | 'balance';
export interface ClipResult { mode: ClipMode; attempt: Attempt }
/** `hook` replaces the default challenge line (creator series / custom hook). */
export interface ClipOptions { hook?: string }

const W = 720, H = 1280;
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** 3–6 word challenges, rotated by day so the feed doesn't repeat itself. */
const HOOKS: Record<ClipMode, string[]> = {
 cut: ['Cut this exactly in half 🔪', "Bet you can't cut this 50/50", 'One cut. Perfectly in half?', 'Cut it 50/50. First try.'],
 draw: ['Draw it perfectly. One stroke.', "Bet you can't draw this perfectly", 'One stroke. No undo.'],
 brake: ['Stop as close as possible 🚗', "Bet you can't stop closer", 'One tap to brake. Go.'],
 balance: ['Find the perfect balance point', "Bet you can't balance this"],
};
export function clipHook(mode: ClipMode, seed = 0) {
 const list = HOOKS[mode];
 return list[((seed % list.length) + list.length) % list.length];
}

/** One-word reaction for the reveal. */
export function clipReaction(mode: ClipMode, attempt: Attempt): { text: string; color: string } {
 const { score, detail } = attempt;
 if (mode === 'brake' && detail.crashed) return { text: 'CRASHED 💥', color: '#ff5d8f' };
 if (score <= 0) return { text: 'FAIL 💀', color: '#ff5d8f' };
 if (mode === 'cut') {
  if (score >= 99) return { text: 'PERFECT 🤯', color: '#7dff9b' };
  if (score >= 95) return { text: 'SO CLOSE 😭', color: '#ffd23f' };
  if (score >= 85) return { text: 'ALMOST... 😬', color: '#ffd23f' };
  if (score >= 60) return { text: 'ROBBERY 💀', color: '#ff5d8f' };
  return { text: 'CRIME 🚨', color: '#ff5d8f' };
 }
 if (score >= 97) return { text: 'NO WAY 🤯', color: '#7dff9b' };
 if (score >= 90) return { text: 'SO CLOSE 😭', color: '#ffd23f' };
 if (score >= 75) return { text: 'NOT BAD... 😬', color: '#ffd23f' };
 return { text: 'SKILL ISSUE 💀', color: '#ff5d8f' };
}

export function clipWebsite(url=typeof document!=='undefined' ? document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? siteUrl() : siteUrl()) { try { const u=new URL(url);return u.host+(u.pathname==='/'?'':u.pathname.replace(/\/$/,'')); }catch{return url.replace(/^https?:\/\//,'').replace(/\/$/,'');} }

/** Ready-to-paste TikTok/Instagram caption: the call to action lives here, not in the video. */
export function clipCaption(mode: Mode, result: string, site: string, today = true) {
 const when = today ? ' today' : '';
 const hook = {
  cut: `Everyone on Earth got this exact blob${when}. I got ${result} 🔪 Can you cut it 50/50?`,
  draw: `Everyone on Earth got the same shape${when}. I scored ${result} 🎯 Can you draw it better?`,
  brake: `Same car, same road for everyone${when}. My result: ${result} 🚗 Can you stop closer?`,
 }[mode];
 return `${hook}\nComment your score 👇\n🎮 ${site}\n#skilly #skillissue #challenge #game #fyp`;
}

/** TikTok's native caption look: bold white text on a dark rounded pill. */
export function drawPill(c: CanvasRenderingContext2D, text: string, y: number, size = 44, minWidth = 0) {
 c.save();
 c.font = `800 ${size}px ${SANS}`;
 c.textAlign = 'center'; c.textBaseline = 'middle';
 const max = W - 80;
 const measured = c.measureText(text).width;
 if (measured > max - 44) c.font = `800 ${size * (max - 44) / measured}px ${SANS}`;
 const width = Math.max(minWidth, Math.min(max, c.measureText(text).width + 44));
 const height = size * 1.55;
 c.fillStyle = 'rgba(0,0,0,.72)';
 c.beginPath(); c.roundRect(W / 2 - width / 2, y - height / 2, width, height, 16); c.fill();
 c.fillStyle = '#fff'; c.fillText(text, W / 2, y + 1);
 c.restore();
}

/** Big outlined meme text for the reveal. */
export function drawOutlined(c: CanvasRenderingContext2D, text: string, y: number, size: number, color: string) {
 c.save();
 c.font = `900 ${size}px ${SANS}`;
 c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
 const measured = c.measureText(text).width;
 if (measured > W - 60) c.font = `900 ${size * (W - 60) / measured}px ${SANS}`;
 c.lineWidth = size / 6; c.strokeStyle = '#000'; c.strokeText(text, W / 2, y);
 c.fillStyle = color; c.fillText(text, W / 2, y);
 c.restore();
}

export function drawWatermark(c: CanvasRenderingContext2D) {
 c.save();
 c.font = `600 24px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle';
 c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(clipWebsite(), W / 2, 150);
 c.fillStyle = 'rgba(255,255,255,.85)'; c.fillText(clipWebsite(), W / 2, 150);
 c.restore();
}

/**
 * Paints each video frame. `source` is the game drawn full screen (9:16);
 * after `reveal()` the challenge line is replaced by the result and a reaction.
 */
export function createClipPainter(source: HTMLCanvasElement, mode: ClipMode = 'draw', options: ClipOptions = {}, seed = 0) {
 const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
 const c = canvas.getContext('2d')!;
 const hook = options.hook || clipHook(mode, seed);
 let result: ClipResult | null = null;
 let revealedAt = 0;
 const paint = () => {
  c.imageSmoothingEnabled = false;
  c.drawImage(source, 0, 0, W, H);
  if (!result) drawPill(c, hook, 236);
  else {
   const reaction = clipReaction(result.mode, result.attempt);
   // A quick pop-in makes the reveal feel like a punchline.
   const t = Math.min(1, (performance.now() - revealedAt) / 180);
   drawOutlined(c, reaction.text, 236, 64 + 36 * t, reaction.color);
   const value = result.mode === 'draw' || result.mode === 'balance' ? `${result.attempt.score.toFixed(1)}%` : fmtResult(result.mode, result.attempt);
   drawOutlined(c, value, 336, 62, '#ffffff');
  }
  drawWatermark(c);
 };
 const reveal = (value: ClipResult) => { if (!result) { result = value; revealedAt = performance.now(); } };
 return { canvas, paint, reveal };
}
