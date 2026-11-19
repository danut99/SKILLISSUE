import { MAX_WHEEL_RADIUS, MIN_WHEEL_RADIUS, VEHICLE_LENGTH } from '../game/config.ts'
import type { WheelPx } from '../game/geom.ts'
import { wheelSprite, type WheelDesign, type WheelLook } from '../game/wheelart.ts'
import { clamp, convexHull, simplifyClosed, type Pt } from '../geometry/poly.ts'
import { ctx2d, makeCanvas } from './image.ts'
import { fillHoles } from './paper.ts'

/** Paper color: what the inside of a drawn shape looks like once it becomes a sticker. */
export const PAPER: [number, number, number] = [255, 253, 246]

/** A wheel the player put on the drawing: where, how big and which design. */
export type PlacedWheel = WheelPx & { look: WheelLook }

/** A finished drawing: its strokes (transparent around them) and its wheels, in the same pixels. */
export type Drawing = { image: HTMLCanvasElement; wheels: PlacedWheel[] }

/** The finished sprite with wheels mapped into its pixel space. */
export type Finished = {
  sprite: HTMLCanvasElement
  outline: Pt[]
  wheels: WheelPx[]
  wheelSprites: HTMLCanvasElement[]
  wheelDesigns: WheelDesign[]
}

export type Box = { x: number; y: number; w: number; h: number }

const SPRITE_MAX = 640
const ALPHA_ON = 40

function union(a: Box | null, b: Box): Box {
  if (!a) return b
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

/**
 * The vehicle's frame (its strokes plus its wheels, which may stick out of the drawing) and the wheels
 * at the size the physics will really use: radii are kept within limits relative to the whole vehicle.
 * The editor and the finished vehicle both size wheels with this, so the preview is what drives.
 */
export function fitWheels<T extends WheelPx>(strokes: Box | null, wheels: readonly T[]): { frame: Box | null; wheels: T[] } {
  const frameOf = (list: readonly T[]) =>
    list.reduce<Box | null>((box, w) => union(box, { x: w.x - w.r, y: w.y - w.r, w: w.r * 2, h: w.r * 2 }), strokes)
  const frame = frameOf(wheels)
  if (!frame) return { frame: null, wheels: [] }
  const side = Math.max(frame.w, frame.h)
  const lo = (side * MIN_WHEEL_RADIUS) / VEHICLE_LENGTH
  const hi = (side * MAX_WHEEL_RADIUS) / VEHICLE_LENGTH
  const sized = wheels.map((w) => ({ ...w, r: clamp(w.r, lo, hi) }))
  return { frame: frameOf(sized), wheels: sized }
}

/**
 * Trims the drawing layer to the vehicle (strokes and wheels) and maps the wheels along, left to right.
 * Returns null when nothing (or almost nothing) is drawn.
 */
export function fromDrawing(layer: HTMLCanvasElement, wheels: readonly PlacedWheel[]): Drawing | null {
  const strokes = alphaBox(layer)
  if (!strokes) return null
  const fit = fitWheels(strokes, wheels)
  const f = fit.frame ?? strokes
  const pad = 4
  const k = Math.min(1, SPRITE_MAX / Math.max(f.w, f.h))
  const image = makeCanvas(f.w * k + pad * 2, f.h * k + pad * 2)
  const g = ctx2d(image, true)
  g.setTransform(k, 0, 0, k, pad - f.x * k, pad - f.y * k)
  g.drawImage(layer, 0, 0)
  const placed = fit.wheels.map((w) => ({ ...w, x: (w.x - f.x) * k + pad, y: (w.y - f.y) * k + pad, r: w.r * k }))
  return { image, wheels: placed.sort((a, b) => a.x - b.x) }
}

export function alphaBox(c: HTMLCanvasElement): Box | null {
  const { width: W, height: H } = c
  const d = ctx2d(c).getImageData(0, 0, W, H).data
  let x0 = W
  let y0 = H
  let x1 = -1
  let y1 = -1
  let count = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > ALPHA_ON) {
        count++
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0 || count < W * H * 0.004 || x1 - x0 < 12 || y1 - y0 < 12) return null
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** Drops loose specks: keeps the biggest blob and anything at least `keep` of its size. */
export function removeSpecks(c: HTMLCanvasElement, keep = 0.08): void {
  const { width: W, height: H } = c
  const g = ctx2d(c)
  const img = g.getImageData(0, 0, W, H)
  const d = img.data
  const label = new Int32Array(W * H).fill(-1)
  const sizes: number[] = []
  const stack: number[] = []
  for (let i = 0; i < W * H; i++) {
    if (label[i] !== -1 || d[i * 4 + 3] <= ALPHA_ON) continue
    const id = sizes.length
    let size = 0
    label[i] = id
    stack.push(i)
    while (stack.length) {
      const p = stack.pop() as number
      size++
      const x = p % W
      const y = (p - x) / W
      const n = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]
      for (const q of n) {
        if (q >= 0 && label[q] === -1 && d[q * 4 + 3] > ALPHA_ON) {
          label[q] = id
          stack.push(q)
        }
      }
    }
    sizes.push(size)
  }
  if (sizes.length < 2) return
  const biggest = Math.max(...sizes)
  let changed = false
  for (let i = 0; i < W * H; i++) {
    const id = label[i]
    if (id >= 0 && sizes[id] < biggest * keep) {
      d[i * 4 + 3] = 0
      changed = true
    }
  }
  if (changed) g.putImageData(img, 0, 0)
}

/**
 * Convex hull of the opaque pixels, ignoring the area under each wheel: wheels are their own physics bodies,
 * so drawing under a wheel must not turn into a chassis that drags on the ground.
 */
function hullOfAlpha(c: HTMLCanvasElement, wheels: readonly WheelPx[]): Pt[] {
  const { width: W, height: H } = c
  const d = ctx2d(c).getImageData(0, 0, W, H).data
  const step = Math.max(2, Math.round(Math.max(W, H) / 160))
  const underWheel = (x: number, y: number) =>
    wheels.some((w) => y > w.y - w.r * 0.1 && (x - w.x) ** 2 + (y - w.y) ** 2 < (w.r * 1.2) ** 2)
  const solid = (x: number, y: number) => d[(y * W + x) * 4 + 3] > ALPHA_ON && !underWheel(x, y)
  const pts: Pt[] = []
  for (let y = 0; y < H; y += step) {
    let first = -1
    let last = -1
    for (let x = 0; x < W; x++) {
      if (solid(x, y)) {
        if (first < 0) first = x
        last = x
      }
    }
    if (first >= 0) pts.push({ x: first, y }, { x: last + 1, y })
  }
  for (let x = 0; x < W; x += step) {
    let first = -1
    let last = -1
    for (let y = 0; y < H; y++) {
      if (solid(x, y)) {
        if (first < 0) first = y
        last = y
      }
    }
    if (first >= 0) pts.push({ x, y: first }, { x, y: last + 1 })
  }
  return simplifyClosed(convexHull(pts), 48)
}

/**
 * Turns the drawing and its wheels into the final vehicle: the body sprite (paper-filled, transparent around it,
 * framed to include the wheels so the game keeps the same proportions) and one sprite per wheel.
 */
export function finalize(d: Drawing): Finished {
  const body = paperCopy(d.image)
  removeSpecks(body)
  const fit = fitWheels(alphaBox(body), d.wheels)
  const f = fit.frame ?? { x: 0, y: 0, w: body.width, h: body.height }
  const m = 2
  const sprite = makeCanvas(Math.ceil(f.w) + m * 2, Math.ceil(f.h) + m * 2)
  ctx2d(sprite, true).drawImage(body, m - f.x, m - f.y)
  const wheels = fit.wheels.map((w) => ({ x: w.x - f.x + m, y: w.y - f.y + m, r: w.r }))
  return {
    sprite,
    outline: hullOfAlpha(sprite, wheels),
    wheels,
    wheelSprites: fit.wheels.map((w) => wheelSprite(w.look)),
    wheelDesigns: fit.wheels.map((w) => w.look.design),
  }
}

/** A copy where closed shapes are filled with paper, so a line drawing reads as a solid sticker. */
export function paperCopy(c: HTMLCanvasElement): HTMLCanvasElement {
  const out = makeCanvas(c.width, c.height)
  const g = ctx2d(out)
  g.drawImage(c, 0, 0)
  const img = g.getImageData(0, 0, c.width, c.height)
  if (fillHoles({ data: img.data, w: c.width, h: c.height }, PAPER)) g.putImageData(img, 0, 0)
  return out
}
