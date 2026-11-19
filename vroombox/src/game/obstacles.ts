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
