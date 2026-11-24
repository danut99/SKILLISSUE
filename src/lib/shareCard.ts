import { savedResultCanvas } from './savedResult';
import { preloadResultCompanions } from '../games/resultCompanion';
import { carSprite } from './pixelAssets';
import { GAME_NAME, MODE_INFO, MODES, type Mode } from '../config';
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
  c.beginPath(); c.roundRect(x, y, w, h, 22);
  c.fillStyle = fill; c.fill(); c.strokeStyle = border; c.lineWidth = 3; c.stroke();
}

/** Keep the full cut play area, including the separated halves, inside its frame. */
function drawCutPreview(c: CanvasRenderingContext2D, image: HTMLCanvasElement, x: number, y: number, width: number, height: number) {
  // Shapes occupy y=174..504; separation, rotation and labels need extra room.
  const sourceY = 130;
  const sourceHeight = 430;
  const padding = 12;
  const scale = Math.min((width - padding * 2) / 360, (height - padding * 2) / sourceHeight);
  const w = 360 * scale;
  const h = sourceHeight * scale;
  c.drawImage(image, 0, sourceY * image.height / 640, image.width, sourceHeight * image.height / 640,
    x + (width - w) / 2, y + (height - h) / 2, w, h);
}

function background(c: CanvasRenderingContext2D) {
  c.fillStyle = C.bg; c.fillRect(0, 0, CW, CH);
  c.fillStyle = C.grid;
  for (let x = 30; x < CW; x += 60) for (let y = 30; y < CH; y += 60) {
    c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill();
  }
}

function header(c: CanvasRenderingContext2D, date: string) {
  c.font = `900 110px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = C.text; c.fillText('skilly.', CENTER, 248);
  box(c, CENTER - 378, 315, 756, 100, '#d7ff5f', '#d7ff5f');
  txt(c, "THINK YOU'VE GOT SKILL?", CENTER, 365, 48, C.bg, { maxWidth: 700 });
  txt(c, `DAILY #${dayNumber(date)}  /  ${date}`, CENTER - 376, 460, 32, C.muted, { align: 'left', maxWidth: 500 });
}

function footer(c: CanvasRenderingContext2D, nickname: string) {
  box(c, CENTER - 378, 1305, 756, 105, '#d7ff5f', '#d7ff5f');
  txt(c, 'YOUR TURN. BEAT THIS.', CENTER, 1358, 65, C.bg, { maxWidth: 700 });
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

    txt(c, info.name.toUpperCase(), CENTER, 535, 50, info.color, { shadow: '#000', maxWidth: 740 });

    // game snapshot
    const top = 750;
    const sh = 360;
    const sw = 600;
    const sx = CENTER - sw / 2;
    box(c, sx - 10, top - 10, sw + 20, sh + 20, info.color, C.bg);
    const image = input.snapshot ?? (a ? savedResultCanvas(m, input.date, a) : null);
    if (image && m === 'cut') {
      drawCutPreview(c, image, sx, top, sw, sh);
    } else if (image) {
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
      txt(c, info.name.toUpperCase(), center, 820, 37, info.color, { maxWidth: width - 24 });
      if (best) {
        const image = savedResultCanvas(m, input.date, best);
        if (m === 'cut') drawCutPreview(c, image, x + 12, 865, width - 24, 180);
        else c.drawImage(image, 0, image.height * .28, image.width, image.height * .36, x + 12, 865, width - 24, 180);
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
