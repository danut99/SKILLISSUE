export type Pt = { x: number; y: number }

export function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Andrew's monotone chain. Collinear points are dropped. */
export function convexHull(points: readonly Pt[]): Pt[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const pts: Pt[] = []
  for (const p of sorted) {
    const last = pts[pts.length - 1]
    if (!last || last.x !== p.x || last.y !== p.y) pts.push(p)
  }
  if (pts.length < 3) return pts
  const lower: Pt[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/** Signed shoelace area (positive when counter-clockwise in a y-up frame). */
export function polygonArea(poly: readonly Pt[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

export function polygonCentroid(poly: readonly Pt[]): Pt {
  const area = polygonArea(poly)
  if (Math.abs(area) < 1e-9) {
    const sum = poly.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 })
    return { x: sum.x / Math.max(1, poly.length), y: sum.y / Math.max(1, poly.length) }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  return { x: cx / (6 * area), y: cy / (6 * area) }
}

/**
 * Visvalingam–Whyatt on a closed polygon: drops the vertex that spans the smallest triangle
 * until there are at most `maxVerts` vertices and every remaining triangle is at least `minArea`.
 */
export function simplifyClosed(poly: readonly Pt[], maxVerts: number, minArea = 0): Pt[] {
  const pts = [...poly]
  const tri = (i: number) => {
    const n = pts.length
    return Math.abs(cross(pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n])) / 2
  }
  while (pts.length > 3) {
    let minI = 0
    let minA = Infinity
    for (let i = 0; i < pts.length; i++) {
      const a = tri(i)
      if (a < minA) {
        minA = a
        minI = i
      }
    }
    if (pts.length <= maxVerts && minA >= minArea) break
    pts.splice(minI, 1)
  }
  return pts
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Sutherland–Hodgman: the part of a polygon with y >= cutY (y up). */
export function clipAbove(poly: readonly Pt[], cutY: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const inA = a.y >= cutY
    const inB = b.y >= cutY
    if (inA) out.push(a)
    if (inA !== inB) {
      const t = (cutY - a.y) / (b.y - a.y)
      out.push({ x: a.x + (b.x - a.x) * t, y: cutY })
    }
  }
  return out
}

/** Pushes every vertex `by` units away from the polygon's centroid. */
export function inflate(poly: readonly Pt[], by: number): Pt[] {
  const c = polygonCentroid(poly)
  return poly.map((p) => {
    const dx = p.x - c.x
    const dy = p.y - c.y
    const len = Math.hypot(dx, dy) || 1
    return { x: p.x + (dx / len) * by, y: p.y + (dy / len) * by }
  })
}
