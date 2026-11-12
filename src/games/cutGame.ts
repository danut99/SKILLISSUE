import { drawResultCompanion } from './resultCompanion';
import { sfx } from '../lib/audio';
import { rngFor } from '../lib/daily';
import { clamp, easeOut, innerPoint, lineSide, polygonCentroid, round2, splitPolygon, type Pt } from '../lib/geometry';
import { roastFor } from '../lib/scoring';
import { paper, text } from './canvas';
import { C, H, W, type Game, type GameApi } from './types';

/** Today's asymmetric 7–9 vertex blob — identical for every player (UTC date seed). */
export function dailyShape(date: string, complexity = 0): { poly: Pt[]; hue: number } {
  const rng = rngFor(`${date}:cut`);
  const n = 7 + Math.floor(rng() * 3) + Math.max(0, Math.min(2, complexity)) * 2;
  const off = rng() * Math.PI * 2;
  let poly: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = off + ((i + (rng() - 0.5) * 0.55) * Math.PI * 2) / n;
    const r = 58 + rng() * 100;
    poly.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min(290 / (maxX - minX), 330 / (maxY - minY), 1.3);
  const cx = W / 2;
  const cy = H * 0.53;
  poly = poly.map((p) => ({ x: cx + (p.x - (minX + maxX) / 2) * s, y: cy + (p.y - (minY + maxY) / 2) * s }));
  return { poly, hue: Math.floor(rng() * 360) };
}

/** Extend segment a→b far beyond the stage edges. */
function extend(a: Pt, b: Pt, len = 900): [Pt, Pt] {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / d;
  const uy = (b.y - a.y) / d;
  return [
    { x: a.x - ux * len, y: a.y - uy * len },
    { x: b.x + ux * len, y: b.y + uy * len },
  ];
}

interface Piece {
  poly: Pt[];
  pct: number;
  centroid: Pt;
  dir: 1 | -1;
}

export function createCutGame(api: GameApi, options?: { complexity?: number }): Game {
  const { poly, hue } = dailyShape(api.date, options?.complexity);
  const face = innerPoint(poly, 6);
  const fs = clamp(face.d / 38, 0.55, 1.2);
  const fill = `hsl(${hue} 90% 66%)`;
  const dark = `hsl(${hue} 70% 30%)`;

  let state: 'ready' | 'dragging' | 'done' = 'ready';
  let A: Pt | null = null;
  let B: Pt | null = null;
  let pointer: Pt = { x: W / 2, y: H * 0.2 };
  let pieces: Piece[] = [];
  let normal: Pt = { x: 0, y: 0 };
  let cutAt = 0;
  let score = 0;
  let display = '';
  let ghost: number[] | null = null;
  let resultSound: ReturnType<typeof setTimeout> | undefined;

  function drawFace(c: CanvasRenderingContext2D, scared: boolean, sliced: boolean) {
    const { x, y } = face.p;
    for (const dx of [-15, 15]) {
      const ex = x + dx * fs;
      const ey = y - 9 * fs;
      c.fillStyle = '#fff';
      c.strokeStyle = '#000';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(ex, ey, (scared ? 12 : 10) * fs, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      const ang = Math.atan2(pointer.y - ey, pointer.x - ex);
      const pr = (sliced ? 2 : 4) * fs;
      c.fillStyle = '#000';
      c.beginPath();
      c.arc(ex + Math.cos(ang) * pr, ey + Math.sin(ang) * pr, (scared ? 3.5 : 5) * fs, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = '#000';
    c.lineWidth = 2.5;
    c.beginPath();
    if (scared || sliced) c.ellipse(x, y + 14 * fs, 6 * fs, 8 * fs, 0, 0, Math.PI * 2);
    else c.arc(x, y + 8 * fs, 9 * fs, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  }

  function pathPoly(c: CanvasRenderingContext2D, p: Pt[]) {
    c.beginPath();
    p.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
    c.closePath();
  }

  function drawBlob(c: CanvasRenderingContext2D, p: Pt[]) {
    pathPoly(c, p);
    c.fillStyle = fill;
    c.fill();
    c.lineJoin = 'round';
    c.lineWidth = 4;
    c.strokeStyle = dark;
    c.stroke();
  }

  function cut(a: Pt, b: Pt) {
    const sp = splitPolygon(poly, a, b);
    const minShare = Math.min(sp.posArea, sp.negArea) / sp.total;
    if (minShare < 0.003) {
      api.toast('Cut THROUGH the blob 🙄 (no try lost)');
      api.cancelClip();
      state = 'ready';
      A = B = null;
      return;
    }
    const posPct = Math.round((sp.posArea / sp.total) * 1000) / 10;
    const negPct = Math.round((100 - posPct) * 10) / 10;
    pieces = [
      { poly: sp.pos, pct: posPct, centroid: polygonCentroid(sp.pos), dir: 1 },
      { poly: sp.neg, pct: negPct, centroid: polygonCentroid(sp.neg), dir: -1 },
    ];
    // unit normal pointing to the positive side
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    normal = { x: -(b.y - a.y) / d, y: (b.x - a.x) / d };
    if (lineSide(a, b, { x: a.x + normal.x, y: a.y + normal.y }) < 0) normal = { x: -normal.x, y: -normal.y };

    const exact = (sp.posArea / sp.total) * 100;
    score = round2(clamp(100 - Math.abs(exact - 50) * 4, 0, 100));
    const lo = Math.min(posPct, negPct);
    const hi = Math.max(posPct, negPct);
    display = `${lo.toFixed(1)} / ${hi.toFixed(1)}`;
    state = 'done';
    cutAt = performance.now();
    sfx.slice();
    resultSound = setTimeout(() => (score >= 95 ? sfx.ding() : score < 70 ? sfx.fail() : sfx.pop()), 350);
    api.finish({ score, detail: { a: lo, b: hi, line: [a.x, a.y, b.x, b.y].map(Math.round) }, display });
  }

  return {
    destroy() { clearTimeout(resultSound); },
    setGhost(line) {
      ghost = line;
    },
    down(p) {
      pointer = p;
      if (state !== 'ready') return;
      state = 'dragging';
      A = p;
      B = p;
      api.startClip();
    },
    move(p) {
      pointer = p;
      if (state === 'dragging') B = p;
    },
    up(p) {
      if (state !== 'dragging' || !A) return;
      B = p;
      if (Math.hypot(B.x - A.x, B.y - A.y) < 30) {
        state = 'ready';
        A = B = null;
        api.cancelClip();
        return;
      }
      cut(A, B);
    },
    render(c, now) {
      paper(c);
      if (state !== 'done') {
        drawBlob(c, poly);
        c.save();
        pathPoly(c, poly);
        c.clip();
        drawFace(c, state === 'dragging', false);
        c.restore();
      } else {
        const t = easeOut(clamp((now - cutAt) / 600, 0, 1));
        for (const pc of pieces) {
          const off = 16 * t * pc.dir;
          c.save();
          c.translate(pc.centroid.x + normal.x * off, pc.centroid.y + normal.y * off);
          c.rotate(0.05 * t * pc.dir);
          c.translate(-pc.centroid.x, -pc.centroid.y);
          drawBlob(c, pc.poly);
          c.save();
          pathPoly(c, pc.poly);
          c.clip();
          drawFace(c, false, true);
          c.restore();
          c.restore();
        }
        for (const pc of pieces) {
          const off = 16 * t * pc.dir + 10 * pc.dir;
          const label = `${pc.pct.toFixed(1)}%`;
          text(c, label, pc.centroid.x + normal.x * off, pc.centroid.y + normal.y * off, {
            size: 34,
            color: '#fff',
            outline: 6,
            alpha: clamp((now - cutAt - 200) / 300, 0, 1),
          });
        }
        // slash flash
        const flash = 1 - clamp((now - cutAt) / 350, 0, 1);
        if (flash > 0 && A && B) {
          const [e1, e2] = extend(A, B);
          c.strokeStyle = `rgba(255,255,255,${flash})`;
          c.lineWidth = 4;
          c.beginPath();
          c.moveTo(e1.x, e1.y);
          c.lineTo(e2.x, e2.y);
          c.stroke();
        }
        if (ghost) {
          const [g1, g2] = extend({ x: ghost[0], y: ghost[1] }, { x: ghost[2], y: ghost[3] });
          c.save();
          c.setLineDash([8, 6]);
          c.strokeStyle = C.yellow;
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(g1.x, g1.y);
          c.lineTo(g2.x, g2.y);
          c.stroke();
          c.restore();
          text(c, "👑 #1's cut", W / 2, 520, { size: 24, color: C.yellow, outline: 4 });
        }
        text(c, roastFor('cut', { score, detail: {}, at: 0 }), W / 2, 104, { size: 25, maxWidth: W - 32 });
        drawResultCompanion(c, score, 'cut', display);
      }

      if (state === 'dragging' && A && B) {
        const [e1, e2] = extend(A, B);
        c.save();
        c.setLineDash([10, 8]);
        c.strokeStyle = 'rgba(232,241,255,0.35)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(e1.x, e1.y);
        c.lineTo(e2.x, e2.y);
        c.stroke();
        c.restore();
        c.strokeStyle = C.cyan;
        c.lineWidth = 4;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(A.x, A.y);
        c.lineTo(B.x, B.y);
        c.stroke();
      }

      if (state === 'ready') {
        text(c, 'CUT IT 50 / 50', W / 2, 92, { size: 40, color: C.pink, outline: 5 });
        text(c, 'drag one straight line', W / 2, 124, { size: 22, color: C.muted });
      }
    },
  };
}
