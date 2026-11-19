import { buildGeom, type VehicleGeom, type WheelPx } from './game/geom.ts'
import { drawWheel } from './game/paint.ts'
import type { Pt } from './geometry/poly.ts'
import type { WheelDesign } from './game/wheelart.ts'
import type { PlacedWheel } from './util/objectimage.ts'
import { blobToCanvas, canvasToBlob, ctx2d, makeCanvas } from './util/image.ts'
import { stripWhiteRim } from './util/sticker.ts'

export type EngineData = { kind: 'synth' } | { kind: 'voice'; sampleRate: number; pcm: Float32Array }
/** own: the wheels drawn in the picture spin (wheelSprites) · classic: generated wheels (ready-made vehicles) */
export type WheelStyle = 'own' | 'classic'

/** What the editor needs to reopen a vehicle: the drawing layer (PNG) and the wheels placed on it, in layer pixels. */
export type VehicleDraft = { layer: Blob; wheels: PlacedWheel[] }

export type Vehicle = {
  id: string
  name: string
  sample: boolean
  createdAt: number
  sprite: HTMLCanvasElement
  outline: Pt[]
  wheels: WheelPx[]
  wheelStyle: WheelStyle
  /** One round crop per wheel, used when wheelStyle is 'own'. */
  wheelSprites: HTMLCanvasElement[]
  /** Design of each wheel (what it does in the physics). Missing = classic. */
  wheelDesigns?: WheelDesign[]
  engine: EngineData
  /** Vehicles drawn in the editor keep their drawing, so they can be edited later. */
  draft?: VehicleDraft
}

/**
 * Saved layout version. 1 (no field): sprites had a white sticker border baked in. 2: transparent around the object.
 * 3: wheel styles 'own' | 'classic' (older records used 'photo' for own wheels and had 'mud' tires).
 */
export const RECORD_FORMAT = 3

/** Wheel style of a record saved by any version. */
function wheelStyleOf(saved: string): WheelStyle {
  return saved === 'own' || saved === 'photo' ? 'own' : 'classic'
}

export type VehicleRecord = Omit<Vehicle, 'sprite' | 'wheelSprites' | 'sample'> & {
  sprite: Blob
  wheelSprites: Blob[]
  thumb: Blob
  format?: number
}

const geomCache = new WeakMap<Vehicle, VehicleGeom>()

export function geomOf(v: Vehicle): VehicleGeom {
  let g = geomCache.get(v)
  if (!g) {
    g = buildGeom({
      width: v.sprite.width,
      height: v.sprite.height,
      outline: v.outline,
      wheels: v.wheels.map((w, i) => ({ ...w, design: v.wheelDesigns?.[i] })),
    })
    geomCache.set(v, g)
  }
  return g
}

export function wheelSpriteOf(v: Vehicle, i: number): HTMLCanvasElement | undefined {
  return v.wheelStyle === 'own' ? v.wheelSprites[i] : undefined
}

/** Sprite plus wheels, fitted into a w×h canvas. */
export function drawVehicleThumb(v: Vehicle, w = 280, h = 180): HTMLCanvasElement {
  const c = makeCanvas(w, h)
  const g = ctx2d(c)
  let minX = 0
  let minY = 0
  let maxX = v.sprite.width
  let maxY = v.sprite.height
  for (const wh of v.wheels) {
    minX = Math.min(minX, wh.x - wh.r)
    minY = Math.min(minY, wh.y - wh.r)
    maxX = Math.max(maxX, wh.x + wh.r)
    maxY = Math.max(maxY, wh.y + wh.r)
  }
  const pad = 8
  const k = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY))
  g.translate((w - (maxX - minX) * k) / 2 - minX * k, (h - (maxY - minY) * k) / 2 - minY * k)
  g.scale(k, k)
  g.drawImage(v.sprite, 0, 0)
  v.wheels.forEach((wh, i) => {
    g.save()
    g.translate(wh.x, wh.y)
    drawWheel(g, wh.r, wheelSpriteOf(v, i))
    g.restore()
  })
  return c
}

export async function toRecord(v: Vehicle): Promise<VehicleRecord> {
  return {
    id: v.id,
    name: v.name,
    createdAt: v.createdAt,
    outline: v.outline,
    wheels: v.wheels,
    wheelStyle: v.wheelStyle,
    engine: v.engine,
    sprite: await canvasToBlob(v.sprite),
    wheelSprites: await Promise.all(v.wheelSprites.map((c) => canvasToBlob(c))),
    thumb: await canvasToBlob(drawVehicleThumb(v)),
    format: RECORD_FORMAT,
    draft: v.draft,
    wheelDesigns: v.wheelDesigns,
  }
}

/** The old 8 px white border around sprites (format 1), plus a little slack for its anti-aliased edge. */
const OLD_BORDER = 10

function stripOldBorder(sprite: HTMLCanvasElement): HTMLCanvasElement {
  const g = ctx2d(sprite, true)
  const img = g.getImageData(0, 0, sprite.width, sprite.height)
  if (stripWhiteRim({ data: img.data, w: img.width, h: img.height }, OLD_BORDER)) g.putImageData(img, 0, 0)
  return sprite
}

export async function fromRecord(r: VehicleRecord): Promise<Vehicle> {
  return {
    id: r.id,
    name: r.name,
    sample: false,
    createdAt: r.createdAt,
    outline: r.outline,
    wheels: r.wheels,
    wheelStyle: wheelStyleOf(r.wheelStyle),
    engine: r.engine,
    sprite: (r.format ?? 1) < 2 ? stripOldBorder(await blobToCanvas(r.sprite)) : await blobToCanvas(r.sprite),
    wheelSprites: await Promise.all(r.wheelSprites.map((b) => blobToCanvas(b))),
    draft: r.draft,
    wheelDesigns: r.wheelDesigns ?? r.draft?.wheels.map((w) => w.look.design),
  }
}

const bestKey = (id: string) => `vroombox:best:${id}`

export function getBest(id: string): number {
  try {
    return Number(localStorage.getItem(bestKey(id))) || 0
  } catch {
    return 0
  }
}

export const newId = () => `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
