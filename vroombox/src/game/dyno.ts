import { DT } from './config.ts'
import type { VehicleGeom } from './geom.ts'
import { Sim } from './sim.ts'
import type { TrackSpec } from './track.ts'
import type { Upgrades } from './upgrades.ts'

/** Measured on the workshop's flat dyno lane by the real physics, so they reflect this exact vehicle. */
export type DynoStats = { topSpeed: number; sprint: number | null; iceSprint: number | null }

export const SPRINT = 50
const RUN_TIME = 8
export type DynoLane = 'ground' | 'ice'
export type DynoTrace = { distance: number[]; kmh: number[] }
const lane = (surfaces?: TrackSpec['surfaces']): TrackSpec =>
  ({ map: 'farm', seed: 1, flat: true, finish: null, difficulty: 0, growth: null, fuelEvery: null, coins: false, surfaces })

function drive(geom: VehicleGeom, upgrades: Upgrades, track: TrackSpec, onStep: (sim: Sim, kmh: number) => void): void {
  const sim = new Sim({ geom, track, mode: { kind: 'level' }, upgrades })
  for (let i = 0; i < RUN_TIME / DT && !sim.ended; i++) {
    sim.step({ gas: true, brake: false })
    onStep(sim, Math.max(0, sim.chassis.getLinearVelocity().x) * 3.6)
  }
}

const seconds = (s: number | null) => (s === null ? null : Math.round(s * 10) / 10)

export function measureSetup(geom: VehicleGeom, upgrades: Upgrades): DynoStats {
  let sprint: number | null = null
  let topSpeed = 0
  // Speed at the end of the sprint: the same moment the atelier race lanes finish on.
  drive(geom, upgrades, lane(), (sim, kmh) => {
    if (sprint !== null) return
    topSpeed = kmh
    if (sim.distance >= SPRINT) sprint = sim.time
  })
  let iceSprint: number | null = null
  drive(geom, upgrades, lane([{ at: 0, len: 400, kind: 'ice' }]), (sim) => {
    if (iceSprint === null && sim.distance >= SPRINT) iceSprint = sim.time
  })
  return {
    topSpeed: Math.round(topSpeed),
    sprint: seconds(sprint),
    iceSprint: seconds(iceSprint),
  }
}

const cache = new WeakMap<VehicleGeom, Map<string, DynoStats>>()
const keyOf = (u: Upgrades) => `${u.engine}.${u.tires}.${u.suspension}.${u.tank}`

export function dynoStats(geom: VehicleGeom, upgrades: Upgrades): DynoStats {
  let byGeom = cache.get(geom)
  if (!byGeom) cache.set(geom, (byGeom = new Map()))
  const key = keyOf(upgrades)
  let stats = byGeom.get(key)
  if (!stats) byGeom.set(key, (stats = measureSetup(geom, upgrades)))
  return stats
}

const laneTrack = (kind: DynoLane) => (kind === 'ice' ? lane([{ at: 0, len: 400, kind: 'ice' }]) : lane())

/** Per-step distance and speed of a full-throttle sprint, replayed side by side in the atelier. */
export function sprintTrace(geom: VehicleGeom, upgrades: Upgrades, kind: DynoLane): DynoTrace {
  const trace: DynoTrace = { distance: [], kmh: [] }
  const sim = new Sim({ geom, track: laneTrack(kind), mode: { kind: 'level' }, upgrades })
  for (let i = 0; i < RUN_TIME / DT && !sim.ended && sim.distance < SPRINT; i++) {
    sim.step({ gas: true, brake: false })
    trace.distance.push(Math.min(SPRINT, sim.distance))
    trace.kmh.push(Math.max(0, sim.chassis.getLinearVelocity().x) * 3.6)
  }
  return trace
}
