import { DT } from './config.ts'
import { drawbridgeDownFor } from './gadgets.ts'
import { buildGeom, type VehicleGeom } from './geom.ts'
import type { RunSpec } from './modes.ts'
import { Sim, type Input } from './sim.ts'
import type { WheelDesign } from './wheelart.ts'

/** Test-only drivers used to check that a course rewards control rather than a held gas pedal. */
export type Driver = (sim: Sim) => Input

export const fullGas: Driver = () => ({ gas: true, brake: false })

/**
 * A careful driver: follows a pace (target speed per x), keeps the nose down on the ground,
 * lines the body up with the landing slope in the air, and rocks out of mud.
 */
export function carefulDriver(pace: (x: number) => number): Driver {
  let mudClock = 0
  let committed = -Infinity
  return (sim) => {
    const p = sim.chassis.getPosition()
    const v = sim.chassis.getLinearVelocity()
    const angle = sim.chassis.getAngle()
    const slopeAt = (x: number) => Math.atan2(sim.track.height(x + 0.5) - sim.track.height(x - 0.5), 1)
    if (sim.airborne) {
      const h = Math.max(0, p.y - sim.track.height(p.x))
      const aim = slopeAt(p.x + Math.max(0, v.x) * Math.min(1, Math.sqrt((2 * h) / 10)))
      const err = angle - aim
      return { gas: err < -0.1, brake: err > 0.1 }
    }
    const pitch = angle - slopeAt(p.x)
    if (sim.mudWheels > 0) {
      // Feather through mud so the tires never dig in; if it still stops, rock back and charge again.
      mudClock += DT
      if (Math.abs(v.x) < 0.3 && mudClock > 1) {
        const phase = mudClock % 1.6
        return { gas: phase >= 0.6, brake: phase < 0.6 }
      }
      if (v.x < 3) return { gas: mudClock % 0.8 < 0.45, brake: false }
    } else mudClock = 0
    // Wait before a drawbridge until it will stay down long enough to cross.
    for (const seg of sim.track.segmentsIn(p.x, p.x + 25)) {
      for (const g of seg.gadgets ?? []) {
        if (g.kind !== 'drawbridge' || g.x - p.x > 20 || g.x - p.x < 3 || committed === g.x) continue
        // Creep up to about 5 m from the deck, wait there, then go as soon as it will stay down long enough.
        const gap = g.x - p.x
        if (drawbridgeDownFor(sim.time) >= (g.x + g.len - p.x) / Math.max(6, v.x + 2) + 0.3) {
          committed = g.x
          return { gas: true, brake: false }
        }
        if (gap > 6) return { gas: v.x < 2.5, brake: v.x > 4 }
        return { gas: false, brake: v.x > 0.2 }
      }
    }
    if (pitch > 0.7) return { gas: false, brake: true }
    if (pitch > 0.4) return { gas: false, brake: false }
    const target = pace(p.x)
    return { gas: v.x < target - 0.3, brake: v.x > target + 1.2 }
  }
}

export function drive(geom: VehicleGeom, run: RunSpec, driver: Driver, opts: { startDistance?: number; seconds?: number; until?: number } = {}): Sim {
  const sim = new Sim({ geom, track: run.track, mode: run.mode, startDistance: opts.startDistance })
  const limit = (opts.seconds ?? 150) / DT
  for (let n = 0; n < limit && !sim.ended && sim.distance < (opts.until ?? Infinity); n++) sim.step(driver(sim))
  return sim
}

/** The stock red tractor (samples.ts): big rear wheel, small front wheel, off-road tires. */
export const tractorGeom = () =>
  buildGeom({
    width: 340,
    height: 232,
    outline: [{ x: 12, y: 22 }, { x: 142, y: 22 }, { x: 142, y: 122 }, { x: 262, y: 122 }, { x: 262, y: 62 }, { x: 276, y: 62 }, { x: 276, y: 122 }, { x: 322, y: 122 }, { x: 322, y: 208 }, { x: 12, y: 208 }],
    wheels: [{ x: 80, y: 200, r: 70, design: 'offroad' }, { x: 282, y: 226, r: 44, design: 'offroad' }],
  })

/** A plain box car; radius in sprite pixels (100 px = 1 m). */
export const boxGeom = (radius: number, design: WheelDesign = 'classic', height = 120) =>
  buildGeom({
    width: 320,
    height,
    outline: [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 320, y: height }, { x: 0, y: height }],
    wheels: [{ x: 60, y: height - 5, r: radius, design }, { x: 260, y: height - 5, r: radius, design }],
  })
