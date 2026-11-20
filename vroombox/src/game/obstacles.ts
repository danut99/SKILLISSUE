import type { Rock } from './track.ts'

/** Lodged trunks support a loose upper log. Another loose trunk rolls on the exit. */
export function timberPile(x: number, scale = 1): Rock[] {
  return [
    { x: x - 0.58 * scale, r: 0.23 * scale, lodged: true },
    { x, r: 0.39 * scale, lodged: true },
    { x: x + 0.68 * scale, r: 0.32 * scale, lodged: true },
    { x: x + 0.36 * scale, r: 0.26 * scale, lift: 0.39 * scale },
    { x: x + 1.72 * scale, r: 0.28 * scale },
  ].map(log => ({ ...log, crossing: true }))
}

/** Stepping stones lead to a raised shelf that can catch a low chassis. */
export function rockShelf(x: number, scale = 1): Rock[] {
  return [
    [-1.12, 0.21, 0], [-0.68, 0.34, 0], [-0.18, 0.48, 0.06],
    [0.42, 0.40, 0.03], [0.12, 0.30, 0.43], [1.03, 0.28, 0],
  ].map(([dx, radius, lift]) => ({ x: x + dx * scale, r: radius * scale, lift: lift * scale }))
}

/**
 * A row of `count` logs lying across the trail, `gap` m of ground between them. Radii vary in a fixed
 * pattern; every third log is loose and rolls under the wheels, the rest are bedded in.
 */
export function logField(x: number, count: number, gap = 0.7, scale = 1): Rock[] {
  const radii = [0.34, 0.42, 0.3, 0.38, 0.45, 0.32]
  const logs: Rock[] = []
  let at = x
  for (let n = 0; n < count; n++) {
    const r = radii[n % radii.length] * scale
    at += r
    logs.push({ x: at, r, crossing: true, lodged: n % 3 !== 2 })
    at += r + gap
  }
  return logs
}

/**
 * A ridge of big boulders to crawl over: `tops` are the heights (m) of successive boulders, `spacing` m apart.
 * Uneven steps and deep cracks between the round tops catch small wheels; filler stones underneath keep it solid.
 */
export function boulderRidge(x: number, tops: number[], spacing = 1.2): Rock[] {
  const rocks: Rock[] = []
  tops.forEach((top, n) => {
    const at = x + n * spacing
    const r = Math.min(0.55 + 0.12 * (n % 3) + (top > 1.5 ? 0.15 : 0), 0.3 + top * 0.6)
    // Rocks sit r * ROCK_LIFT (0.1) above the ground plus `lift`, so this puts the top of the boulder at `top`.
    const lift = Math.max(0, top - r * 1.1)
    rocks.push({ x: at, r, lift })
    for (let below = lift - 0.7, k = 0; below > -0.35; below -= 0.7, k++) {
      rocks.push({ x: at + (k % 2 ? 0.25 : -0.25), r: 0.5 + 0.08 * ((n + k) % 3), lift: Math.max(0, below) })
    }
  })
  return rocks
}
