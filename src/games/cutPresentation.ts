import { text } from './canvas';
import { C } from './types';
import type { Pt } from '../lib/geometry';

/** Share the shape's finish between live play and restored results. */
export function paintCutBlob(c: CanvasRenderingContext2D, poly: Pt[], design: { color: string; dark: string; pattern: string }, face: Pt, scale: number) {
  c.save();
  c.beginPath();
  poly.forEach((point, i) => i ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y));
  c.closePath();
  c.fillStyle = design.color;
  c.fill();
  c.lineJoin = 'round';
  c.lineWidth = 4;
  c.strokeStyle = design.dark;
  c.stroke();
  c.clip();
  if (design.pattern === 'spots') {
    c.fillStyle = design.dark + '44';
    for (const [dx, dy, r] of [[-48,-40,13],[48,-30,10],[-20,50,9],[70,35,15]]) {
      c.beginPath();c.arc(face.x + dx * scale, face.y + dy * scale, r * scale, 0, Math.PI * 2);c.fill();
    }
  } else if (design.pattern === 'veins') {
    c.strokeStyle = design.dark + '66';c.lineWidth = 3;c.beginPath();c.moveTo(70,440);c.lineTo(280,230);
    for (let i = 0; i < 4; i++) { const x = 95 + i * 40, y = 415 - i * 40;c.moveTo(x,y);c.lineTo(x-8,y-35);c.moveTo(x,y);c.lineTo(x+35,y+8); }
    c.stroke();
  } else if (design.pattern === 'shine') {
    c.strokeStyle = '#ffffff77';c.lineWidth = 5;c.beginPath();c.moveTo(face.x-45*scale,face.y-42*scale);c.lineTo(face.x-20*scale,face.y-58*scale);c.stroke();
  }
  c.restore();
}

/** Keep the numbers in a stable strip below the shape, away from both faces. */
export function paintCutSplit(c: CanvasRenderingContext2D, a: number, b: number, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  const values = [Math.min(a, b), Math.max(a, b)];
  values.forEach((value, index) => {
    const x = 18 + index * 170;
    c.fillStyle = C.panel;
    c.strokeStyle = C.line;
    c.lineWidth = 1;
    c.beginPath();
    c.roundRect(x, 544, 154, 70, 12);
    c.fill();
    c.stroke();
    text(c, a === b ? index === 0 ? 'ONE HALF' : 'OTHER HALF' : index === 0 ? 'SMALLER HALF' : 'LARGER HALF', x + 77, 561, { size: 12, color: C.muted, alpha });
    text(c, `${value.toFixed(1)}%`, x + 77, 589, { size: 30, color: C.text, alpha });
  });
  c.restore();
}
