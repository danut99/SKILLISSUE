import { text } from './canvas';
import { C, W } from './types';

export function paintDrawSummary(c: CanvasRenderingContext2D, score: number) {
  c.save();
  c.fillStyle = C.bg;
  c.fillRect(12, 506, W - 24, 122);
  c.strokeStyle = C.green;c.lineWidth = 2;c.setLineDash([5,4]);
  c.beginPath();c.moveTo(30,523);c.lineTo(60,523);c.stroke();
  c.setLineDash([]);c.strokeStyle = C.cyan;
  c.beginPath();c.moveTo(190,523);c.lineTo(220,523);c.stroke();
  text(c, 'Target', 70, 523, { size:16, color:C.muted, align:'left' });
  text(c, 'Your line', 230, 523, { size:16, color:C.muted, align:'left' });
  c.fillStyle = C.panel;c.strokeStyle = C.line;
  c.beginPath();c.roundRect(18,544,W-36,70,12);c.fill();c.stroke();
  text(c, 'DRAWING ACCURACY', W/2, 560, { size:12, color:C.muted });
  text(c, `${score.toFixed(1)}%`, W/2, 589, { size:32, color:score>=90?C.green:C.text });
  c.restore();
}
