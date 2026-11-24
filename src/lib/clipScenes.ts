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
 cut: ['Can you cut this 50/50?', 'One cut. Two equal halves?', 'Looks easy. Cut it in half.', 'Cut it 50/50. First try.'],
 draw: ['Can you draw this perfectly?', 'One shape. One steady hand.', 'One stroke. No undo.'],
 brake: ['Can you nail this stop?', 'One tap. Stop before the line.', 'One tap to brake. Go.'],
 balance: ['Find the perfect balance point', "Bet you can't balance this"],
};
export function clipHook(mode: ClipMode, seed = 0) {
 const list = HOOKS[mode];
 return list[((seed % list.length) + list.length) % list.length];
}

/** One-word reaction for the reveal. */
export function clipReaction(mode: ClipMode, attempt: Attempt): { text: string; color: string } {
 const { score, detail } = attempt;
 if (mode === 'brake' && detail.crashed) return { text: 'CRASHED 💥', color: '#ffb2d0' };
 if (score <= 0) return { text: 'FAIL 💀', color: '#ffb2d0' };
 if (mode === 'cut') {
  if (score >= 99) return { text: 'PERFECT 🤯', color: '#d7ff5f' };
  if (score >= 95) return { text: 'SO CLOSE 😭', color: '#ffd27c' };
  if (score >= 85) return { text: 'ALMOST... 😬', color: '#ffd27c' };
  if (score >= 60) return { text: 'ROBBERY 💀', color: '#ffb2d0' };
  return { text: 'CRIME 🚨', color: '#ffb2d0' };
 }
 if (score >= 97) return { text: 'NO WAY 🤯', color: '#d7ff5f' };
 if (score >= 90) return { text: 'SO CLOSE 😭', color: '#ffd27c' };
 if (score >= 75) return { text: 'NOT BAD... 😬', color: '#ffd27c' };
 return { text: 'SKILL ISSUE 💀', color: '#ffb2d0' };
}

export function clipWebsite(url=siteUrl()) { try { const u=new URL(url);return u.host+(u.pathname==='/'?'':u.pathname.replace(/\/$/,'')); }catch{return url.replace(/^https?:\/\//,'').replace(/\/$/,'');} }

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
 c.fillStyle = '#d7ff5f';
 c.beginPath(); c.roundRect(W / 2 - width / 2, y - height / 2, width, height, 16); c.fill();
 c.fillStyle = '#202120'; c.fillText(text, W / 2, y + 1);
 c.restore();
}

/** Big outlined meme text for the reveal. */
export function drawOutlined(c: CanvasRenderingContext2D, text: string, y: number, size: number, color: string) {
 c.save();
 c.font = `900 ${size}px ${SANS}`;
 c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
 const measured = c.measureText(text).width;
 if (measured > W - 60) c.font = `900 ${size * (W - 60) / measured}px ${SANS}`;
 c.lineWidth = 3; c.strokeStyle = 'rgba(16,19,16,.65)'; c.strokeText(text, W / 2, y);
 c.fillStyle = color; c.fillText(text, W / 2, y);
 c.restore();
}

export function drawWatermark(c: CanvasRenderingContext2D) {
 c.save();
 c.fillStyle = '#101310'; c.fillRect(0, 0, W, 132);
 c.font = `900 54px ${SANS}`; c.textAlign = 'left'; c.textBaseline = 'middle';
 c.fillStyle = '#f6f5ed'; c.fillText('skilly', 48, 90);
 c.fillStyle = '#d7ff5f'; c.fillText('.', 48 + c.measureText('skilly').width, 90);
 c.font = `600 20px ${SANS}`; c.textAlign = 'right'; c.fillStyle = '#c1cbb8'; c.fillText(clipWebsite(), W - 48, 90);
 c.restore();
}

export function drawClipFooter(c: CanvasRenderingContext2D) {
 c.save();
 c.fillStyle = '#101310'; c.fillRect(0, 1130, W, 150);
 c.fillStyle = '#d7ff5f'; c.beginPath(); c.roundRect(70, 1152, W - 140, 70, 20); c.fill();
 c.font = `800 29px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#202120';
 c.fillText('Your turn. Beat this.', W / 2, 1187);
 c.font = `500 18px ${SANS}`; c.fillStyle = '#c1cbb8'; c.fillText('Free to play. No signup needed.', W / 2, 1250);
 c.restore();
}

export function clipScoreText(attempt: Attempt) { return `${attempt.score.toFixed(1)} / 100`; }

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
  c.imageSmoothingEnabled = true;
  c.fillStyle = '#101310'; c.fillRect(0, 0, W, H);
  c.drawImage(source, 0, 0, W, H);
  c.save();
  c.fillStyle = '#101310'; c.fillRect(0, 132, W, result ? 265 : 158);
  if (!result) drawPill(c, hook, 224, 38);
  else {
   const reaction = clipReaction(result.mode, result.attempt);
   const t = Math.min(1, (performance.now() - revealedAt) / 180);
   drawOutlined(c, reaction.text, 179, 28, reaction.color);
   drawOutlined(c, clipScoreText(result.attempt), 268, 72 + 8 * t, '#f6f5ed');
   const value = result.mode === 'cut' || result.mode === 'brake' ? fmtResult(result.mode, result.attempt) : result.mode === 'draw' ? 'Drawing accuracy' : 'Balance score';
   drawOutlined(c, value, 354, 29, '#c1cbb8');
  }
  c.restore();
  drawWatermark(c);
  drawClipFooter(c);
 };
 const reveal = (value: ClipResult) => { if (!result) { result = value; revealedAt = performance.now(); } };
 return { canvas, paint, reveal };
}
