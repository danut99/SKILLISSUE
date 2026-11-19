import { describe, expect, it } from 'vitest'
import { convexHull, cross, polygonArea, polygonCentroid, simplifyClosed, type Pt } from './poly.ts'

const circle = (n: number, r = 10): Pt[] =>
  Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((i / n) * Math.PI * 2), y: r * Math.sin((i / n) * Math.PI * 2) }))

const isConvex = (poly: Pt[]) => {
  const signs = poly.map((_, i) => Math.sign(cross(poly[i], poly[(i + 1) % poly.length], poly[(i + 2) % poly.length])))
  return signs.every((s) => s >= 0) || signs.every((s) => s <= 0)
}

describe('convexHull', () => {
  it('keeps only the outer corners of a lasso with interior and collinear points', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 },
      { x: 0, y: 10 }, { x: 4, y: 6 }, { x: 2, y: 3 }, { x: 0, y: 0 },
    ]
    const hull = convexHull(pts)
    expect(hull).toHaveLength(4)
    expect(Math.abs(polygonArea(hull))).toBeCloseTo(100)
  })
})

describe('simplifyClosed', () => {
  it('reduces a dense outline to at most 8 convex vertices without losing much area', () => {
    const dense = circle(60)
    const simple = simplifyClosed(dense, 8)
    expect(simple.length).toBeLessThanOrEqual(8)
    expect(isConvex(simple)).toBe(true)
    expect(Math.abs(polygonArea(simple)) / Math.abs(polygonArea(dense))).toBeGreaterThan(0.85)
  })

  it('drops near-collinear vertices even when already under the vertex limit', () => {
    const square = [{ x: 0, y: 0 }, { x: 5, y: 0.001 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    expect(simplifyClosed(square, 8, 0.5)).toHaveLength(4)
  })
})

describe('polygonCentroid', () => {
  it('finds the area-weighted center of an L shape', () => {
    const l = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }]
    const c = polygonCentroid(l)
    expect(c.x).toBeCloseTo(5 / 6)
    expect(c.y).toBeCloseTo(5 / 6)
  })
})
