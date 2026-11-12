import { GAME_NAME, MODE_INFO, MODES, type Mode, siteUrl } from '../config';
import { C, FONT } from '../games/types';
import { dayNumber } from './daily';
import { badgeFor, emojiRow, fmtResult, overallBadge, roastFor, toneFor } from './scoring';
import { bestAttempt, modeDay, totalScore, usePlayer, type Attempt } from './store';

/** 9:16 story size — fits TikTok, Instagram/Facebook stories, Reels. */
const CW = 1080;
const CH = 1920;

export interface CardInput {
  date: string;
  /** single test card; omit for the "my day" summary card */
  mode?: Mode;
  attempt?: Attempt | null;
  rank?: number | null;
  /** frozen frame of the game canvas at the result moment */
  snapshot?: HTMLCanvasElement | null;
}

function txt(
  c: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  o: { align?: CanvasTextAlign; shadow?: string; maxWidth?: number } = {},
) {
  c.font = `${size}px ${FONT}`;
  let f = size;
  if (o.maxWidth && c.measureText(s).width > o.maxWidth) {
    f = Math.floor((size * o.maxWidth) / c.measureText(s).width);
    c.font = `${f}px ${FONT}`;
  }
  c.textAlign = o.align ?? 'center';
  c.textBaseline = 'middle';
  if (o.shadow) {
    c.fillStyle = o.shadow;
    c.fillText(s, x + f * 0.06, y + f * 0.06);
  }
  c.fillStyle = color;
  c.fillText(s, x, y);
}

function box(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, border: string, fill = C.panel) {
  c.fillStyle = '#000';
  c.fillRect(x + 12, y + 12, w, h);
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
  c.strokeStyle = border;
  c.lineWidth = 6;
  c.strokeRect(x + 3, y + 3, w - 6, h - 6);
}

function background(c: CanvasRenderingContext2D) {
  c.fillStyle = C.bg;
  c.fillRect(0, 0, CW, CH);
  c.strokeStyle = C.grid;
  c.lineWidth = 2;
  c.beginPath();
  for (let x = 0; x <= CW; x += 60) {
    c.moveTo(x, 0);
    c.lineTo(x, CH);
  }
  for (let y = 0; y <= CH; y += 60) {
    c.moveTo(0, y);
    c.lineTo(CW, y);
  }
  c.stroke();
}

function header(c: CanvasRenderingContext2D, date: string) {
  // chromatic logo like the site
  c.font = `150px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const y = 170;
  c.fillStyle = '#000';
  c.fillText('SKILL ISSUE', CW / 2 + 12, y + 12);
  c.fillStyle = C.pink;
  c.fillText('SKILL ISSUE', CW / 2 + 6, y);
  c.fillStyle = C.cyan;
  c.fillText('SKILL ISSUE', CW / 2 - 6, y);
  c.fillStyle = C.text;
  c.fillText('SKILL ISSUE', CW / 2, y);
  txt(c, `daily test #${dayNumber(date)} · ${date}`, CW / 2, 270, 46, C.muted);
}

function footer(c: CanvasRenderingContext2D, nickname: string) {
  txt(c, nickname ? `played by ${nickname}` : '', CW / 2, CH - 230, 44, C.muted);
  box(c, 120, CH - 180, CW - 240, 110, C.cyan, C.bg);
  txt(c, `can you beat me? → ${siteUrl().replace(/^https?:\/\//, '').replace(/\/$/, '')}`, CW / 2, CH - 125, 48, C.text, { maxWidth: CW - 300 });
}

/** Draws the share card and returns it as a PNG blob. */
export async function renderShareCard(input: CardInput): Promise<Blob> {
  try {
    await document.fonts.load(`40px ${FONT.split(',')[0]}`);
  } catch {
    /* font may already be there */
  }
  const cv = document.createElement('canvas');
  cv.width = CW;
  cv.height = CH;
  const c = cv.getContext('2d')!;
  const { nickname, days } = usePlayer.getState();
  background(c);
  header(c, input.date);

  if (input.mode) {
    const m = input.mode;
    const info = MODE_INFO[m];
    const md = modeDay(days, input.date, m);
    const a = input.attempt ?? bestAttempt(md);
    const tone = a ? toneFor(a.score) : 'bad';
    const color = tone === 'good' ? C.green : tone === 'ok' ? C.yellow : C.red;

    txt(c, `${info.emoji} ${info.title.toUpperCase()}`, CW / 2, 380, 70, info.color, { shadow: '#000' });

    // game snapshot
    const top = 450;
    const sh = 820;
    const sw = Math.round((sh * 9) / 16);
    const sx = (CW - sw) / 2;
    box(c, sx - 10, top - 10, sw + 20, sh + 20, info.color, C.bg);
    if (input.snapshot) c.drawImage(input.snapshot, sx, top, sw, sh);

    // result
    txt(c, a ? fmtResult(m, a) : '—', CW / 2, top + sh + 120, 170, color, { shadow: '#000', maxWidth: CW - 120 });
    if (a) txt(c, roastFor(m, a), CW / 2, top + sh + 225, 46, C.text, { maxWidth: CW - 160 });
    txt(c, badgeFor(m, bestAttempt(md)), CW / 2, top + sh + 300, 56, C.yellow, { maxWidth: CW - 160 });
    const rank = input.rank ? `  ·  #${input.rank} today` : '';
    txt(c, `${emojiRow(md)}${rank}`, CW / 2, top + sh + 380, 50, C.muted);
  } else {
    // "my day" summary
    const total = totalScore(days, input.date);
    let y = 420;
    for (const m of MODES) {
      const info = MODE_INFO[m];
      const md = modeDay(days, input.date, m);
      const best = bestAttempt(md);
      box(c, 110, y, CW - 220, 230, info.color);
      txt(c, info.emoji, 200, y + 115, 90, C.text);
      txt(c, info.title.toUpperCase(), 290, y + 75, 54, info.color, { align: 'left' });
      txt(c, best ? emojiRow(md) : 'skipped 🐔', 290, y + 155, 44, C.muted, { align: 'left' });
      txt(c, best ? fmtResult(m, best) : '—', CW - 150, y + 115, 76, C.text, { align: 'right', maxWidth: 360 });
      y += 290;
    }
    txt(c, "TODAY'S TOTAL", CW / 2, y + 60, 46, C.muted);
    txt(c, `${total.toFixed(1)} / 300`, CW / 2, y + 170, 160, C.yellow, { shadow: '#000' });
    txt(c, overallBadge(total), CW / 2, y + 290, 64, C.text, { maxWidth: CW - 160 });
    if (input.rank) txt(c, `#${input.rank} worldwide today`, CW / 2, y + 380, 54, C.cyan);
  }

  footer(c, nickname);
  // CRT scanlines, same vibe as the game
  c.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < CH; y += 6) c.fillRect(0, y, CW, 2);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
}

export const cardFileName = (date: string, mode?: Mode) => `${GAME_NAME.toLowerCase().replace(/\s+/g, '-')}-${dayNumber(date)}${mode ? '-' + mode : ''}.png`;

/** Copy of a canvas (game frame) that survives the next attempt redrawing the original. */
export function snapshotCanvas(src: HTMLCanvasElement | null): HTMLCanvasElement | null {
  if (!src) return null;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}
