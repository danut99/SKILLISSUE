import { savedResultCanvas } from './savedResult';
import { preloadResultCompanions } from '../games/resultCompanion';
import { carSprite } from './pixelAssets';
import { GAME_NAME, MODE_INFO, MODES, type Mode } from '../config';
import { clipWebsite } from './clipScenes';
import { C, FONT } from '../games/types';
import { dayNumber } from './daily';
import { badgeFor, fmtResult, overallBadge, roastFor, toneFor } from './scoring';
import { bestAttempt, modeDay, totalScore, usePlayer, type Attempt } from './store';

/** 9:16 story size — fits TikTok, Instagram/Facebook stories, Reels. */
const CW = 1080;
const CH = 1920;
// Center the composition; keep generous margins and the bottom quarter clear.
const CENTER = CW / 2;

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
  const glow = c.createLinearGradient(0, 0, CW, CH);
  glow.addColorStop(0, '#172347');
  glow.addColorStop(.5, '#080d20');
  glow.addColorStop(1, '#2a1039');
  c.fillStyle = glow;
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
  c.fillStyle = C.pink;
  c.fillRect(120, 175, 9, 1250);
  c.fillStyle = C.cyan;
  c.fillRect(120, 175, 840, 9);
  c.fillStyle = C.pink;
  c.fillRect(951, 175, 9, 1250);
  // Decorative pixels can sit outside the content safe area.
  for (let i = 0; i < 8; i++) {
    c.fillStyle = i % 2 ? C.cyan : C.pink;
    c.fillRect(110 + i * 115, 1640 + (i % 3) * 55, 18, 18);
  }
}

function header(c: CanvasRenderingContext2D, date: string) {
  // chromatic logo like the site
  c.font = `100px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const y = 248;
  c.fillStyle = '#000';
  c.fillText(GAME_NAME, CENTER + 9, y + 9);
  c.fillStyle = C.pink;
  c.fillText(GAME_NAME, CENTER + 5, y);
  c.fillStyle = C.cyan;
  c.fillText(GAME_NAME, CENTER - 5, y);
  c.fillStyle = C.text;
  c.fillText(GAME_NAME, CENTER, y);
  box(c, CENTER - 378, 315, 756, 100, C.cyan, '#081724');
  txt(c, clipWebsite(), CENTER, 365, 59, C.cyan, { maxWidth: 700 });
  txt(c, `DAILY #${dayNumber(date)}  /  ${date}`, CENTER - 376, 460, 32, C.muted, { align: 'left', maxWidth: 500 });
}

function footer(c: CanvasRenderingContext2D, nickname: string) {
  box(c, CENTER - 378, 1305, 756, 105, C.pink, '#29152f');
  txt(c, 'YOUR TURN. BEAT THIS.', CENTER, 1358, 65, C.text, { maxWidth: 700 });
  txt(c, nickname ? `@${nickname}` : '3 GAMES. ONE EGO.', CENTER, 1450, 36, C.muted, { maxWidth: 700 });
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
  const { nickname, days, carSkin } = usePlayer.getState();
  await Promise.all([
    preloadResultCompanions(),
    carSprite(carSkin).image.decode().catch(() => {}),
  ]);
  background(c);
  header(c, input.date);
  if (input.rank) txt(c, `#${input.rank} TODAY`, CENTER + 354, 460, 30, C.cyan, { align: 'right', maxWidth: 140 });

  if (input.mode) {
    const m = input.mode;
    const info = MODE_INFO[m];
    const md = modeDay(days, input.date, m);
    const a = input.attempt ?? bestAttempt(md);
    const tone = a ? toneFor(a.score) : 'bad';
    const color = tone === 'good' ? C.green : tone === 'ok' ? C.yellow : C.red;

    txt(c, info.title.toUpperCase(), CENTER, 535, 50, info.color, { shadow: '#000', maxWidth: 740 });

    // game snapshot
    const top = 750;
    const sh = 360;
    const sw = 600;
    const sx = CENTER - sw / 2;
    box(c, sx - 10, top - 10, sw + 20, sh + 20, info.color, C.bg);
    const image = input.snapshot ?? (a ? savedResultCanvas(m, input.date, a) : null);
    if (image) {
      // Enlarge the actual play area instead of nesting a tiny full game screen.
      const cropY = m === 'brake' ? 220 : 155;
      const cropH = m === 'brake' ? 380 : 310;
      const cropW = cropH * sw / sh;
      c.save();
      c.beginPath(); c.rect(sx, top, sw, sh); c.clip();
      c.drawImage(image, (360 - cropW) / 2 * image.width / 360, cropY * image.height / 640,
        cropW * image.width / 360, cropH * image.height / 640, sx, top, sw, sh);
      c.restore();
    }

    // result
    txt(c, a ? fmtResult(m, a) : '—', CENTER, 635, 145, color, { shadow: '#000', maxWidth: 700 });
    txt(c, badgeFor(m, a), CENTER, 1195, 51, C.yellow, { maxWidth: 730 });
    if (a) txt(c, roastFor(m, a), CENTER, 1255, 39, C.text, { maxWidth: 730 });
  } else {
    // "my day" summary
    const total = totalScore(days, input.date);
    for (const [index, m] of MODES.entries()) {
      const info = MODE_INFO[m];
      const md = modeDay(days, input.date, m);
      const best = bestAttempt(md);
      const x = CENTER - 378 + index * 258;
      const width = 240;
      const center = x + width / 2;
      box(c, x, 780, width, 380, info.color);
      txt(c, info.title.toUpperCase(), center, 820, 37, info.color, { maxWidth: width - 24 });
      if (best) {
        const image = savedResultCanvas(m, input.date, best);
        c.drawImage(image, 0, image.height * .28, image.width, image.height * .36, x + 12, 865, width - 24, 180);
      } else {
        txt(c, 'NOT PLAYED', center, 950, 38, C.muted, { maxWidth: width - 24 });
      }
      txt(c, best ? fmtResult(m, best) : '—', center, 1100, 56, best ? C.text : C.muted, { maxWidth: width - 28 });
    }
    txt(c, "TODAY'S TOTAL", CENTER, 540, 46, C.muted);
    txt(c, `${total.toFixed(1)} / 300`, CENTER, 650, 155, C.yellow, { shadow: '#000', maxWidth: 740 });
    txt(c, overallBadge(total), CENTER, 1230, 54, C.text, { maxWidth: 730 });
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
