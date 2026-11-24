import { clamp, easeOutBack } from '../lib/geometry';
import { C, FONT, H, W } from './types';

export function paper(c: CanvasRenderingContext2D) {
  c.fillStyle = C.bg;
  c.fillRect(0, 0, W, H);
  c.fillStyle = C.grid;
  for (let x = 12; x < W; x += 24) for (let y = 12; y < H; y += 24) {
    c.beginPath(); c.arc(x, y, 1, 0, Math.PI * 2); c.fill();
  }
}

/** Retro CRT scanlines, drawn last. */
export function scanlines(c: CanvasRenderingContext2D) {
  c.fillStyle = 'rgba(0,0,0,0.13)';
  for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
}

export function text(
  c: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  o: { size?: number; color?: string; align?: CanvasTextAlign; outline?: number; maxWidth?: number; alpha?: number } = {},
) {
  let size = o.size ?? 22;
  c.save();
  c.globalAlpha = o.alpha ?? 1;
  c.textAlign = o.align ?? 'center';
  c.textBaseline = 'middle';
  c.font = `${size >= 30 ? 800 : 500} ${size}px ${FONT}`;
  const maxWidth = o.maxWidth ?? W - 24;
  if (maxWidth) {
    const w = c.measureText(s).width;
    if (w > maxWidth) {
      size = Math.floor((size * maxWidth) / w);
      c.font = `${size >= 30 ? 800 : 500} ${size}px ${FONT}`;
    }
  }
  if (o.outline) {
    c.lineJoin = 'round';
    c.lineWidth = o.outline;
    c.strokeStyle = '#000';
    c.strokeText(s, x, y);
  }
  c.fillStyle = o.color ?? C.text;
  c.fillText(s, x, y);
  c.restore();
}

/** Big result stamp that pops in (kept on-canvas so it ends up in the video clip). */
export function banner(c: CanvasRenderingContext2D, big: string, small: string, color: string, sinceMs: number, y = 112) {
  const t = clamp(sinceMs / 450, 0, 1);
  if (t <= 0) return;
  const s = 0.5 + 0.5 * easeOutBack(t);
  c.save();
  c.translate(W / 2, y);
  c.scale(s, s);
  c.rotate(-0.04);
  // pixel box behind
  c.fillStyle = 'rgba(16,19,16,0.94)';
  c.fillRect(-168, -46, 336, small ? 98 : 80);
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.strokeRect(-168, -46, 336, small ? 98 : 80);
  text(c, big, 0, -6, { size: 68, color, outline: 6, maxWidth: 320 });
  if (small) text(c, small, 0, 34, { size: 22, color: C.text, maxWidth: 320 });
  c.restore();
}

export function watermark(c: CanvasRenderingContext2D, label: string) {
  text(c, label, 10, 16, { size: 11, color: C.muted, align: 'left', alpha: 0.9 });
}

export function rect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
