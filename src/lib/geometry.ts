export interface Pt {
  x: number;
  y: number;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const round2 = (v: number) => Math.round(v * 100) / 100;

/** Shoelace formula (absolute area). */
export function polygonArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return Math.abs(s) / 2;
}

export function polygonCentroid(poly: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    a += f;
    cx += (poly[j].x + poly[i].x) * f;
    cy += (poly[j].y + poly[i].y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Signed side of p relative to the directed line a→b. */
export const lineSide = (a: Pt, b: Pt, p: Pt) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

/**
 * Sutherland–Hodgman clipping of a polygon against one side of the infinite
 * line a→b (sign=+1 keeps the positive side, -1 the negative side).
 * Works for concave polygons too: the result may contain degenerate edges,
 * but its Shoelace area is exact.
 */
export function clipHalfPlane(poly: Pt[], a: Pt, b: Pt, sign: 1 | -1): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const cur = poly[i];
    const prev = poly[(i + n - 1) % n];
    const sc = lineSide(a, b, cur) * sign;
    const sp = lineSide(a, b, prev) * sign;
    if (sc >= 0) {
      if (sp < 0) out.push(intersect(prev, cur, sp, sc));
      out.push(cur);
    } else if (sp >= 0) {
      out.push(intersect(prev, cur, sp, sc));
    }
  }
  return out;
}

function intersect(p: Pt, q: Pt, sp: number, sq: number): Pt {
  const t = sp / (sp - sq);
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
}

export function splitPolygon(poly: Pt[], a: Pt, b: Pt) {
  const pos = clipHalfPlane(poly, a, b, 1);
  const neg = clipHalfPlane(poly, a, b, -1);
  const total = polygonArea(poly);
  const posArea = pos.length >= 3 ? polygonArea(pos) : 0;
  const negArea = neg.length >= 3 ? polygonArea(neg) : 0;
  return { pos, neg, posArea, negArea, total };
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy || 1;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len, 0, 1);
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Approximate "pole of inaccessibility": the interior point farthest from any edge. */
export function innerPoint(poly: Pt[], step = 5): { p: Pt; d: number } {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  let best = { p: polygonCentroid(poly), d: 0 };
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) {
      const p = { x, y };
      if (!pointInPolygon(p, poly)) continue;
      let d = Infinity;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segmentDistance(p, poly[j], poly[i]));
      if (d > best.d) best = { p, d };
    }
  }
  return best;
}

/** Circle accuracy (0–99.9) from a freehand stroke around a fixed center: radial variance + closure gap. */
export function circleAccuracy(pts: Pt[], center: Pt, final: boolean) {
  const rs = pts.map((p) => Math.hypot(p.x - center.x, p.y - center.y));
  const n = rs.length || 1;
  const mean = rs.reduce((a, b) => a + b, 0) / n;
  const dev = rs.reduce((a, r) => a + Math.abs(r - mean), 0) / n / (mean || 1);
  let score = 100 * (1 - dev * 4.5);
  let gap = 0;
  if (final && pts.length > 1) {
    const f = pts[0];
    const l = pts[pts.length - 1];
    gap = Math.hypot(f.x - l.x, f.y - l.y) / (mean || 1);
    score -= Math.min(gap, 1.5) * 25;
  }
  return { mean, dev, gap, score: clamp(score, 0, 99.9) };
}
