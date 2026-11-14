import { paintCutFace } from './cutCharacters';
import { createBrakeGame } from '../games/brakeGame';
import { drawResultCompanion } from '../games/resultCompanion';
import type { Mode } from '../config';
import { dailyShape } from '../games/cutGame';
import { paper, text } from '../games/canvas';
import { C, W, H, SCALE } from '../games/types';
import { innerPoint, polygonArea, polygonCentroid, splitPolygon } from './geometry';
import { fmtResult } from './scoring';
import { dailyDrawShape, shapeAccuracy, shapeRadius } from './drawShapes';
import type { Attempt } from './store';

/** Rebuild a saved cut from its seeded polygon and persisted slicing line. */
export function savedCutCanvas(date: string, attempt: Attempt): HTMLCanvasElement | null {
  const line = attempt.detail.line;
  if (!line || line.length !== 4 || !line.every(Number.isFinite)) return null;
  const a = { x: line[0], y: line[1] };
  const b = { x: line[2], y: line[3] };
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (!length) return null;
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const c = canvas.getContext('2d')!;
  c.scale(SCALE, SCALE);
  paper(c);
  const design = dailyShape(date,0,undefined,attempt.detail.cutCharacter);
  const {poly}=design;
  const face=innerPoint(poly,6);
  const split = splitPolygon(poly, a, b);
  const pieces = [split.pos, split.neg];
  const total = polygonArea(poly);
  const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
  text(c, 'YOUR BEST CUT', W / 2, 100, { size: 30, color: C.cyan });
  pieces.forEach((piece, index) => {
    if (!piece.length) return;
    const direction = index === 0 ? 1 : -1;
    c.save();
    c.translate(normal.x * 18 * direction, normal.y * 18 * direction);
    c.beginPath();
    piece.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
    c.closePath();
    c.fillStyle = design.color;
    c.fill();
    c.strokeStyle = '#000';
    c.lineWidth = 3;
    c.stroke();
    c.save();c.clip();paintCutFace(c,face.p,Math.max(.45,Math.min(1.2,face.d/38)),design.mood,{x:180,y:100},false,true);c.restore();
    const center = polygonCentroid(piece);
    text(c, `${(polygonArea(piece) / total * 100).toFixed(1)}%`, center.x, center.y, { size: 27, color: C.text, outline: 5 });
    c.restore();
  });
  drawResultCompanion(c, attempt.score, 'cut', fmtResult('cut', attempt));
  return canvas;
}

/** A score summary for older attempts with no recoverable picture. */
export function savedScoreCanvas(mode: Mode, attempt: Attempt): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const c = canvas.getContext('2d')!;
  c.scale(SCALE, SCALE);
  paper(c);
  text(c, 'SAVED RESULT', W / 2, 230, { size: 30, color: C.muted });
  if (mode === 'cut') drawResultCompanion(c, attempt.score, 'cut', fmtResult('cut', attempt));
  else text(c, fmtResult(mode, attempt), W / 2, 320, { size: 48, color: C.cyan });
  return canvas;
}

/** Shared renderer for reopened games and share cards. */
export function savedResultCanvas(mode: Mode, date: string, attempt: Attempt): HTMLCanvasElement {
  if (mode === 'cut') return savedCutCanvas(date, attempt) ?? savedScoreCanvas(mode, attempt);
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const c = canvas.getContext('2d')!;
  c.scale(SCALE, SCALE);
  if (mode === 'brake') {
    const game = createBrakeGame({ date, finish: () => {}, startClip: () => {}, cancelClip: () => {}, toast: () => {} }, attempt);
    game.render(c, performance.now());
    game.destroy?.();
    return canvas;
  }
  paper(c);
  const stroke = (attempt.detail.stroke ?? []).slice(0, 501).filter(p =>
    Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= 0 && p[0] <= W && p[1] >= 0 && p[1] <= H);
  const shape = dailyDrawShape(date);
  const center = { x: W / 2, y: H * .52 };
  const hasStroke = stroke.length > 1;
  const fitted = hasStroke
    ? shapeAccuracy(stroke.map(([x, y]) => ({ x, y })), center, true, shape).mean
    : 130;
  const radius = Number.isFinite(fitted) && fitted > 0 ? fitted : 130;
  text(c, `TODAY'S ${shape.toUpperCase()}`, W / 2, 96, { size: 32, color: C.cyan, maxWidth: W - 32 });
  text(c, hasStroke ? 'your best drawing' : 'the daily target', W / 2, 126, { size: 22, color: C.muted });

  // Use the same dated target, center and fitted size as the playable game.
  c.save();
  c.setLineDash([6, 6]);
  c.strokeStyle = hasStroke ? 'rgba(93,255,157,0.55)' : 'rgba(77,227,255,0.65)';
  c.lineWidth = 2;
  c.beginPath();
  for (let i = 0; i <= 180; i++) {
    const angle = i / 180 * Math.PI * 2;
    const r = shapeRadius(shape, angle) * radius;
    const x = center.x + Math.cos(angle) * r;
    const y = center.y + Math.sin(angle) * r;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
  c.stroke();
  c.restore();
  if (hasStroke) {
    c.strokeStyle = C.cyan; c.lineWidth = 5; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath();
    stroke.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.stroke();
  }
  c.fillStyle = C.text;
  c.fillRect(center.x - 4, center.y - 4, 8, 8);
  text(c, hasStroke ? 'dashed: target / solid: you' : 'Drawing unavailable for this score', W / 2, 478, {
    size: 21, color: C.muted, maxWidth: W - 28,
  });
  drawResultCompanion(c, attempt.score);
  return canvas;
}
