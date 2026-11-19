import { CUT_CHARACTERS, cutCharacterIndex, halfMood, paintCutFace, paintHalfFace, type CutMood } from '../lib/cutCharacters';
import { drawResultCompanion } from './resultCompanion';
import { sfx } from '../lib/audio';
import { rngFor } from '../lib/daily';
import { shapeRadius, type DrawShape } from '../lib/drawShapes';
import { clamp, easeOut, innerPoint, lineSide, polygonCentroid, round2, splitPolygon, type Pt } from '../lib/geometry';
import { roastFor } from '../lib/scoring';
import { paper, text } from './canvas';
import { C, H, W, type Game, type GameApi } from './types';

/** Today's asymmetric 7–9 vertex blob — identical for every player (UTC date seed). */
export function dailyShape(date: string, complexity = 0, partyShape?: DrawShape, forcedCharacter?: number): { poly: Pt[]; hue: number; color: string; dark: string; mood: CutMood; name: string; character?: number; pattern: string } {
  const rng = rngFor(`${date}:cut`);
  const n = 7 + Math.floor(rng() * 3) + Math.max(0, Math.min(9, complexity)) * 2;
  const off = rng() * Math.PI * 2;
  let poly: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = off + ((i + (rng() - 0.5) * 0.55) * Math.PI * 2) / n;
    const r = 58 + rng() * 100;
    poly.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  // Ordered silhouettes stay simple (no crossing edges), but move mass away
  // from the bounding-box center: big lobes, thin necks and deep side pockets.
  const tier = Math.max(0, Math.min(9, Math.floor(complexity)));
  if (tier >= 3) {
    const silhouettes: number[][][] = [
      // A heavy body and a long, light tail.
      [[-145,-48],[-105,-92],[-40,-102],[6,-72],[24,-24],[146,-12],[158,6],[32,20],[12,68],[-48,102],[-114,72],[-150,16]],
      // Unequal dumbbell lobes joined by a thin, off-center neck.
      [[-155,-55],[-116,-100],[-48,-94],[-15,-48],[0,-9],[63,-14],[76,-58],[119,-67],[151,-30],[156,30],[121,65],[79,48],[65,10],[0,17],[-13,68],[-76,105],[-133,72],[-161,17]],
      // Deep bays and narrow peninsulas hide where the area really lies.
      [[-158,-80],[-86,-112],[-22,-80],[-12,-16],[34,-22],[46,-94],[99,-114],[147,-76],[111,-43],[65,-40],[58,8],[153,26],[139,73],[63,59],[39,30],[12,40],[24,111],[-41,101],[-62,50],[-104,62],[-137,101],[-161,59],[-100,14],[-35,8],[-40,-29],[-120,-17]],
    ];
    const family = tier < 6 ? 0 : tier < 8 ? 1 : 2;
    const template = silhouettes[family];
    const mirror = rng() < .5 ? -1 : 1;
    const stretch = .8 + rng() * .35;
    const rotation = rng() * Math.PI * 2;
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    poly = template.map(([x, y]) => {
      // Small global affine variations preserve the narrow connecting regions.
      const px = x * mirror;
      const py = y * stretch + x * (.08 + tier * .012);
      return { x: px * cos - py * sin, y: px * sin + py * cos };
    });
  }
  if (partyShape) {
    // A shared seeded lean and unequal lobes make familiar outlines asymmetric.
    // Positive radial distances in angular order keep the outline simple.
    const lean = rng() * Math.PI * 2;
    const rotation = rng() * Math.PI * 2;
    poly = Array.from({ length: 120 }, (_, i) => {
      const angle = i / 120 * Math.PI * 2;
      const radius = 145 * shapeRadius(partyShape, angle) * (1 + .22 * Math.cos(angle - lean) + .08 * Math.sin(3 * angle + lean));
      return { x: Math.cos(angle + rotation) * radius, y: Math.sin(angle + rotation) * radius };
    });
  }
  const character = forcedCharacter ?? (date.startsWith('level:cut:') || partyShape ? cutCharacterIndex(complexity, partyShape) : undefined);
  const design = character === undefined ? undefined : CUT_CHARACTERS[Math.max(0,Math.min(9,character))];
  if (design) {
    const rotation = (rng()-.5) * (partyShape ? .65 : .15);
    const cos=Math.cos(rotation),sin=Math.sin(rotation);
    const lean=(rng()-.5)*.16;
    poly=design.poly.map(p=>({x:p.x*cos-(p.y+p.x*lean)*sin,y:p.x*sin+(p.y+p.x*lean)*cos}));
  }
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min(290 / (maxX - minX), 330 / (maxY - minY), 1.3);
  const cx = W / 2;
  const cy = H * 0.53;
  poly = poly.map((p) => ({ x: cx + (p.x - (minX + maxX) / 2) * s, y: cy + (p.y - (minY + maxY) / 2) * s }));
  const hue = Math.floor(rng() * 360);
  const look=design??CUT_CHARACTERS[hue%CUT_CHARACTERS.length];
  return { poly, hue, color: look.color, dark: look.dark, mood:look.mood, name:design?.name??'Daily blob', character, pattern:look.pattern };
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
  /** Each half gets its own face, placed at its roomiest interior point. */
  face: { p: Pt; d: number };
}
/** Halves look shocked for a beat, then react to how fair the split was. */
const SHOCK_MS = 380;

export function createCutGame(api: GameApi, options?: { complexity?: number; partyShape?: DrawShape }): Game {
  const design = dailyShape(api.date, options?.complexity, options?.partyShape);
  const {poly}=design;
  const face = innerPoint(poly, 6);
  const fs = clamp(face.d / 38, 0.55, 1.2);
  const fill = design.color;
  const dark = design.dark;

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
    paintCutFace(c, face.p, fs, design.mood, pointer, scared, sliced);
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
    c.save();pathPoly(c,p);c.clip();
    if(design.pattern==='spots'){
      c.fillStyle=dark+'44';
      for(const [dx,dy,r] of [[-48,-40,13],[48,-30,10],[-20,50,9],[70,35,15]]){
        c.beginPath();c.arc(face.p.x+dx*fs,face.p.y+dy*fs,r*fs,0,Math.PI*2);c.fill();
      }
    }else if(design.pattern==='veins'){
      c.strokeStyle=dark+'66';c.lineWidth=3;c.beginPath();c.moveTo(70,440);c.lineTo(280,230);
      for(let i=0;i<4;i++){const x=95+i*40,y=415-i*40;c.moveTo(x,y);c.lineTo(x-8,y-35);c.moveTo(x,y);c.lineTo(x+35,y+8);}c.stroke();
    }else if(design.pattern==='shine'){
      c.strokeStyle='#ffffff77';c.lineWidth=5;c.beginPath();c.moveTo(face.p.x-45*fs,face.p.y-42*fs);c.lineTo(face.p.x-20*fs,face.p.y-58*fs);c.stroke();
    }
    c.restore();
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
      { poly: sp.pos, pct: posPct, centroid: polygonCentroid(sp.pos), dir: 1, face: innerPoint(sp.pos, 6) },
      { poly: sp.neg, pct: negPct, centroid: polygonCentroid(sp.neg), dir: -1, face: innerPoint(sp.neg, 6) },
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
    api.finish({ score, detail: { a: lo, b: hi, cutCharacter:design.character, line: [a.x, a.y, b.x, b.y].map(Math.round) }, display });
  }

  /** `clean`: no prompts, roast or companion (used for full-screen video clips). */
  function draw(c: CanvasRenderingContext2D, now: number, clean: boolean) {
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
        const other = pieces.find((q) => q !== pc) ?? pc;
        const since = now - cutAt;
        const smaller = pc.pct < other.pct || (pc.pct === other.pct && pc.dir < 0);
        paintHalfFace(c, pc.face.p, clamp(pc.face.d / 32, 0.5, 1.3), since < SHOCK_MS ? 'shocked' : halfMood(score, smaller), other.face.p, since - SHOCK_MS);
        c.restore();
      }
      for (const pc of pieces) {
        const off = 16 * t * pc.dir;
        const label = `${pc.pct.toFixed(1)}%`;
        // Under each half's face, so the reaction and the number read together.
        const below = 34 * clamp(pc.face.d / 32, 0.5, 1.3) + 22;
        text(c, label, pc.face.p.x + normal.x * off, pc.face.p.y + below + normal.y * off, {
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
      if (ghost && !clean) {
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
      if (!clean) {
        text(c, roastFor('cut', { score, detail: {}, at: 0 }), W / 2, 104, { size: 25, maxWidth: W - 32 });
        drawResultCompanion(c, score, 'cut', display);
      }
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

    if (state === 'ready' && !clean) {
      text(c, 'CUT IT 50 / 50', W / 2, 92, { size: 40, color: C.pink, outline: 5 });
      text(c, design.character === undefined ? 'drag one straight line' : design.name, W / 2, 124, { size: 22, color: C.muted });
    }
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
    render(c, now) { draw(c, now, false); },
    renderClip(c, now) { draw(c, now, true); },
  };
}
