import { sfx, type LoopHandle } from '../lib/audio';
import { drawResultCompanion } from './resultCompanion';
import { clamp, round2, type Pt } from '../lib/geometry';
import { dailyDrawShape, shapeAccuracy, shapeRadius, type DrawShape } from '../lib/drawShapes';
import { roastFor } from '../lib/scoring';
import { banner, paper, text } from './canvas';
import { C, H, W, type Game, type GameApi } from './types';

const CENTER: Pt = { x: W / 2, y: H * 0.52 };
const MIN_R = 24;
const FULL = Math.PI * 2;

/** 0 = perfect (cyan) → yellow → red. */
function devColor(dev: number): string {
  const t = clamp(dev / 0.12, 0, 1);
  if (t < 0.4) {
    const k = t / 0.4;
    return `rgb(${Math.round(77 + (255 - 77) * k)},${Math.round(227 + (210 - 227) * k)},${Math.round(255 + (63 - 255) * k)})`;
  }
  const k = (t - 0.4) / 0.6;
  return `rgb(255,${Math.round(210 - 133 * k)},${Math.round(63 + 14 * k)})`;
}

export function createDrawGame(api: GameApi, options?: { shape?: DrawShape }): Game {
  const shape = options?.shape ?? dailyDrawShape(api.date);
  const accuracy = (points: Pt[], final: boolean) => shapeAccuracy(points, CENTER, final, shape);
  let state: 'ready' | 'drawing' | 'done' = 'ready';
  let pts: Pt[] = [];
  let sweep = 0;
  let lastAng = 0;
  let live: ReturnType<typeof shapeAccuracy> | null = null;
  let fit: ReturnType<typeof shapeAccuracy> | null = null;
  let failMsg = '';
  let doneAt = 0;
  let score = 0;
  let hum: LoopHandle | null = null;

  function savedStroke() {
    const stride = Math.max(1, Math.ceil(pts.length / 500));
    return pts.filter((_, index) => index % stride === 0 || index === pts.length - 1)
      .map(p => [round2(p.x), round2(p.y)]);
  }

  function finish(fail?: string) {
    if (state === 'done') return;
    state = 'done';
    doneAt = performance.now();
    sfx.stop(hum);
    if (!fail) {
      fit = accuracy(pts, true);
      if (fit.mean < 40) fail = 'Microscopic shape. 🔬';
    }
    if (fail) {
      failMsg = fail;
      score = 0;
      sfx.fail();
      api.finish({ score: 0, detail: { fail: true, stroke: savedStroke() }, display: '💀' });
      return;
    }
    score = round2(fit!.score);
    if (score >= 90) sfx.ding();
    else if (score < 60) sfx.fail();
    else sfx.pop();
    api.finish({ score, detail: { stroke: savedStroke() }, display: `${score.toFixed(1)}%` });
  }

  return {
    down(p) {
      if (state !== 'ready') return;
      if (Math.hypot(p.x - CENTER.x, p.y - CENTER.y) < MIN_R) {
        api.toast('Start away from the dot 👉');
        return;
      }
      state = 'drawing';
      pts = [p];
      sweep = 0;
      lastAng = Math.atan2(p.y - CENTER.y, p.x - CENTER.x);
      api.startClip();
      hum = sfx.startHum();
    },
    move(p) {
      if (state !== 'drawing') return;
      const l = pts[pts.length - 1];
      const step = Math.hypot(p.x - l.x, p.y - l.y);
      // ignore jitter and impossible teleports (palm touches, bogus coalesced events)
      if (step < 1.5 || step > 70 || p.x < 0 || p.y < 0 || p.x > W || p.y > H) return;
      if (Math.hypot(p.x - CENTER.x, p.y - CENTER.y) < MIN_R) return finish('Too close to the dot. 🫵');
      const a = Math.atan2(p.y - CENTER.y, p.x - CENTER.x);
      let d = a - lastAng;
      if (d > Math.PI) d -= FULL;
      if (d < -Math.PI) d += FULL;
      sweep += d;
      lastAng = a;
      pts.push(p);
      live = accuracy(pts, false);
      sfx.setFreq(hum, 220 + (1 - clamp(live.dev / 0.12, 0, 1)) * 440);
      if (Math.abs(sweep) >= FULL) finish();
    },
    up() {
      if (state !== 'drawing') return;
      if (pts.length < 12) {
        // accidental tap: doesn't cost a try
        state = 'ready';
        pts = [];
        live = null;
        sfx.stop(hum);
        api.cancelClip();
        return;
      }
      if (Math.abs(sweep) < (FULL * 5) / 6) return finish('Close the shape around the dot.');
      finish();
    },
    render(c, now) {
      paper(c);
      const ref = fit ?? live;

      if (state === 'ready' || (state === 'done' && fit && !failMsg)) {
        c.save();
        c.setLineDash([6, 6]);
        c.strokeStyle = state === 'ready' ? 'rgba(77,227,255,0.35)' : 'rgba(93,255,157,0.55)';
        c.lineWidth = 2;
        c.beginPath();
        const scale = state === 'ready' ? 130 : fit!.mean;
        for (let i = 0; i <= 180; i++) {
          const angle = i / 180 * FULL;
          const radius = shapeRadius(shape, angle) * scale;
          const x = CENTER.x + Math.cos(angle) * radius;
          const y = CENTER.y + Math.sin(angle) * radius;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.closePath();
        c.stroke();
        c.restore();
      }

      // center dot
      const pulse = state === 'ready' ? 1 + Math.sin(now / 250) * 0.25 : 1;
      c.fillStyle = C.text;
      c.fillRect(CENTER.x - 4 * pulse, CENTER.y - 4 * pulse, 8 * pulse, 8 * pulse);

      if (pts.length > 1 && ref) {
        // glow pass
        c.lineCap = 'round';
        c.lineJoin = 'round';
        c.strokeStyle = 'rgba(77,227,255,0.18)';
        c.lineWidth = 16;
        c.beginPath();
        pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.stroke();
        // colored segments (batched by color bucket)
        c.lineWidth = 6;
        let bucket = -1;
        c.beginPath();
        for (let i = 1; i < pts.length; i++) {
          const r = Math.hypot(pts[i].x - CENTER.x, pts[i].y - CENTER.y);
          const angle = Math.atan2(pts[i].y - CENTER.y, pts[i].x - CENTER.x);
          const target = shapeRadius(shape, angle) * ref.mean;
          const dev = Math.abs(r - target) / target;
          const b = Math.min(12, Math.floor(dev / 0.01));
          if (b !== bucket) {
            if (bucket >= 0) c.stroke();
            bucket = b;
            c.strokeStyle = devColor(b * 0.01);
            c.beginPath();
            c.moveTo(pts[i - 1].x, pts[i - 1].y);
          }
          c.lineTo(pts[i].x, pts[i].y);
        }
        c.stroke();
      }

      if (state === 'ready') {
        text(c, `DRAW A ${shape.toUpperCase()}`, W / 2, 96, { size: 34, color: C.cyan, outline: 5 });
        text(c, 'around the dot · one stroke', W / 2, 126, { size: 22, color: C.muted });
      } else if (state === 'drawing' && live && pts.length > 20) {
        text(c, `${live.score.toFixed(1)}%`, W / 2, 104, { size: 64, color: devColor(live.dev), outline: 6 });
      } else if (state === 'done') {
        drawResultCompanion(c, score);
        const since = now - doneAt;
        if (failMsg) banner(c, '💀 FAIL', failMsg, C.red, since);
        else
          text(c, roastFor('draw', { score, detail: {}, at: 0 }), W / 2, 104, { size: 25, color: C.text, maxWidth: W - 32 });
      }
    },
    destroy() {
      sfx.stop(hum);
    },
  };
}
