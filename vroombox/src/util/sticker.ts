import type { Pt } from '../geometry/poly.ts'
import { ctx2d, makeCanvas } from './image.ts'

export function outlinePath(outline: readonly Pt[]): Path2D {
  const path = new Path2D()
  outline.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)))
  path.closePath()
  return path
}

/** `paint` clipped to `outline`, on a transparent background. */
export function shapeSprite(
  w: number,
  h: number,
  outline: readonly Pt[],
  paint: (g: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const c = makeCanvas(w, h)
  const g = ctx2d(c)
  g.clip(outlinePath(outline))
  paint(g)
  return c
}

/**
 * Removes the near-white rim (up to `depth` px) around the opaque part of an RGBA picture: the white die-cut
 * border older versions baked into vehicle sprites. Only white reachable from the transparent area goes.
 */
export function stripWhiteRim(img: { data: Uint8ClampedArray; w: number; h: number }, depth: number): number {
  const { data, w, h } = img
  const seen = new Uint8Array(w * h)
  let ring: number[] = []
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] === 0) {
      seen[i] = 1
      ring.push(i)
    }
  }
  const whiteish = (i: number) => data[i * 4 + 3] > 0 && data[i * 4] >= 236 && data[i * 4 + 1] >= 236 && data[i * 4 + 2] >= 236
  let removed = 0
  for (let d = 0; d < depth && ring.length; d++) {
    const next: number[] = []
    for (const p of ring) {
      const x = p % w
      const y = (p - x) / w
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const q = ny * w + nx
          if (seen[q] || !whiteish(q)) continue
          seen[q] = 1
          next.push(q)
        }
      }
    }
    for (const q of next) data[q * 4 + 3] = 0
    removed += next.length
    ring = next
  }
  return removed
}
