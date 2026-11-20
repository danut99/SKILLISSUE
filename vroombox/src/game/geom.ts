import { clamp, clipAbove, convexHull, polygonArea, polygonCentroid, simplifyClosed, type Pt } from '../geometry/poly.ts'
import { COM_RISE, MAX_HULL_VERTICES, MAX_WHEEL_RADIUS, MIN_WHEEL_RADIUS, VEHICLE_LENGTH } from './config.ts'
import { chassisMass } from './traits.ts'
import type { WheelDesign } from './wheelart.ts'

/** A wheel in sprite pixels (y down). */
export type WheelPx = { x: number; y: number; r: number }

/** What the player built: a sprite, its outline and wheels (with their designs), all in sprite pixels. */
export type VehicleShape = { width: number; height: number; outline: Pt[]; wheels: (WheelPx & { design?: WheelDesign })[] }

/** The same vehicle in meters, y up, origin at the hull centroid. */
export type VehicleGeom = {
  scale: number
  origin: Pt
  hull: Pt[]
  area: number
  wheels: { x: number; y: number; r: number; design: WheelDesign }[]
  /** Chassis mass in kg: bigger bodies weigh more. */
  mass: number
  /** Center of mass used by the physics: between the wheels, partway from axle height up to the centroid (COM_RISE). */
  com: Pt
}

export function buildGeom(shape: VehicleShape): VehicleGeom {
  const scale = VEHICLE_LENGTH / Math.max(shape.width, shape.height, 1)
  const hullPx = convexHull(shape.outline)
  const origin = polygonCentroid(hullPx)
  const toLocal = (p: Pt): Pt => ({ x: (p.x - origin.x) * scale, y: (origin.y - p.y) * scale })
  let hull = simplifyClosed(convexHull(hullPx.map(toLocal)), MAX_HULL_VERTICES, 0.002)
  if (hull.length < 3 || Math.abs(polygonArea(hull)) < 0.05) {
    const w = (shape.width * scale) / 2
    const h = Math.max(0.2, (shape.height * scale) / 2)
    hull = [
      { x: -w, y: -h },
      { x: w, y: -h },
      { x: w, y: h },
      { x: -w, y: h },
    ]
  }
  const wheels = shape.wheels.map((w) => {
    const c = toLocal(w)
    return { x: c.x, y: c.y, r: clamp(w.r * scale, MIN_WHEEL_RADIUS, MAX_WHEEL_RADIUS), design: w.design ?? ('classic' as const) }
  })
  hull = liftOffWheels(hull, wheels)
  const area = Math.abs(polygonArea(hull))
  return { scale, origin, hull, area, wheels, mass: chassisMass(area), com: stableCenter(hull, wheels) }
}

/**
 * A body drawn down around its wheels reaches as low as they do and would scrape the ground.
 * When the body bottom sits about level with the wheel bottoms, trim it just above them.
 */
function liftOffWheels(hull: Pt[], wheels: { x: number; y: number; r: number }[]): Pt[] {
  if (!wheels.length) return hull
  const avgR = wheels.reduce((s, w) => s + w.r, 0) / wheels.length
  const wheelBottom = Math.min(...wheels.map((w) => w.y - w.r))
  const hullBottom = Math.min(...hull.map((p) => p.y))
  const cut = wheelBottom + avgR * 0.25
  if (hullBottom >= cut || hullBottom < wheelBottom - avgR * 0.5) return hull
  const lifted = simplifyClosed(clipAbove(hull, cut), MAX_HULL_VERTICES, 0.002)
  return lifted.length >= 3 && Math.abs(polygonArea(lifted)) > 0.3 ? lifted : hull
}

function stableCenter(hull: Pt[], wheels: { x: number; y: number }[]): Pt {
  if (!wheels.length) return { x: 0, y: 0 }
  const xs = hull.map((p) => p.x)
  const ys = hull.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const axleX = wheels.reduce((s, w) => s + w.x, 0) / wheels.length
  const axleY = wheels.reduce((s, w) => s + w.y, 0) / wheels.length
  const low = clamp(axleY + 0.15, Math.min(0, minY + 0.1), 0)
  return {
    x: clamp(axleX, minX * 0.5, maxX * 0.5),
    y: low + (0 - low) * COM_RISE,
  }
}
