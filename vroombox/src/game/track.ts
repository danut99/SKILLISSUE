import { provingGroundSegment } from './provingGround.ts'
import { firstCourseBase, firstCourseSegment } from './firstCourse.ts'
import { rockShelf, timberPile } from './obstacles.ts'
import type { Pt } from '../geometry/poly.ts'
import { FEATURE_START, FLAT_END, SEGMENT_LEN, START_X, TERRAIN_STEP } from './config.ts'
import { MAPS, type MapDef, type MapId } from './maps.ts'
import { hash2, mulberry32 } from './rng.ts'

export type FeatureKind = 'gap' | 'ramp' | 'bump' | 'mesa' | 'pit' | 'mud' | 'ice' | 'bridge' | 'snow' | 'pothole'
/** A shaped piece of ground added on top of the rolling hills. x is world x where it starts. */
export type Landmark = 'spring-creek' | 'summer-jump' | 'autumn-log' | 'winter-slide'
export type Feature = { kind: FeatureKind; x: number; len: number; h: number; landmark?: Landmark; gapWidth?: number }
export type Rock = { x: number; r: number; lift?: number; crossing?: boolean; lodged?: boolean }
/** What the ground is made of: mud (sand, deep snow) holds wheels back, ice has almost no grip. */
export type Surface = 'ground' | 'mud' | 'ice' | 'snow'
/** An explicit surface patch, in meters from the start (used by the flat tractor-pull lane). */
export type SurfacePatch = { at: number; len: number; kind: Exclude<Surface, 'ground'>; depth?: number }
export type PickupKind = 'coin' | 'fuel' | 'star'
export type Pickup = { id: number; kind: PickupKind; x: number; y: number }

export type TrackSpec = {
  provingGround?: boolean
  firstCourse?: boolean
  checkpoints?: number[]
  map: MapId
  seed: number
  /** Finish line distance from the start; null means endless. */
  finish: number | null
  /** Base difficulty 0..1. */
  difficulty: number
  /** Endless only: difficulty grows by 1 over this many meters. */
  growth: number | null
  /** Tractor pull: perfectly flat, nothing on it. */
  flat?: boolean
  /** Level stars (distances); each one gets a ramp right before it. Keep each at 25..85 within its 100 m segment. */
  stars?: number[]
  fuelEvery: number | null
  coins: boolean
  surfaces?: SurfacePatch[]
  /** Boss level: more and longer hazards. */
  boss?: boolean
}

export type Segment = { features: Feature[]; rocks: Rock[]; logs: Rock[]; pickups: Pickup[] }

/** Ravine depth under a bridge. */
export const BRIDGE_DEPTH = 3.2
const HAZARDS: FeatureKind[] = ['mud', 'ice', 'bridge']

const SLOTS: [number, number][] = [
  [12, 46],
  [52, 88],
]

export function featureOffset(f: Feature, u: number): number {
  switch (f.kind) {
    case 'gap': {
      // Eight-meter run-up ramp, open chasm, then a long safe landing apron.
      // A slow vehicle falls to the bed; it cannot simply climb the far wall.
      const lip = 1.8
      const far = f.gapWidth === undefined ? .62 : .25 + f.gapWidth / f.len - .02
      if (u < .25) return lip * (u / .25) ** 1.35
      if (u < .27) return lip - (lip + f.h) * (u - .25) / .02
      if (u < far) return -f.h
      if (u < far + .02) return -f.h * (1 - (u - far) / .02)
      return 0
    }
    case 'ramp':
      return f.h * u ** 1.4
    case 'bump':
      return f.h * Math.sin(Math.PI * u) ** 2
    case 'mesa':
      return f.h * (u < 0.3 ? u / 0.3 : u < 0.65 ? 1 : 1 - (u - 0.65) / 0.35)
    case 'pit': {
      // A small kicker to jump the gap, then a dip whose far wall can still be climbed if you fall in.
      const kick = f.h * 0.4
      if (u < 0.25) return kick * (u / 0.25) ** 1.4
      if (u < 0.4) return kick - (kick + f.h) * ((u - 0.25) / 0.15)
      if (u < 0.7) return -f.h
      return -f.h * (1 - (u - 0.7) / 0.3)
    }
    case 'pothole':
    case 'snow':
    case 'mud':
      // A soft hollow: the wheels sink in and have to climb out.
      return -f.h * Math.sin(Math.PI * u) ** 2
    case 'ice':
      return -f.h * Math.sin(Math.PI * u) ** 2
    case 'bridge':
      // A ravine with steep walls; the planks span it at ground level. Fall in and you are stuck.
      if (u < 0.08) return -f.h * (u / 0.08)
      if (u < 0.88) return -f.h
      return -f.h * (1 - (u - 0.88) / 0.12)
  }
}

/** Planks of a bridge: [x0, x1] pairs in world x, at the ground level of the bridge ends. */
export function bridgePlanks(f: Feature): [number, number][] {
  const n = Math.max(4, Math.round(f.len / 1.2))
  const w = f.len / n
  return Array.from({ length: n }, (_, i) => [f.x + i * w + 0.03, f.x + (i + 1) * w - 0.03])
}

function offsetAt(features: readonly Feature[], x: number): number {
  for (const f of features) {
    const u = (x - f.x) / f.len
    if (u >= 0 && u < 1) return featureOffset(f, u)
  }
  return 0
}

/**
 * The ground: smooth hills per map plus obstacles, rocks and pickups generated lazily per 100 m segment.
 * Everything is a pure function of the spec, so the live run and its replay always see the same world.
 */
export class Track {
  readonly spec: TrackSpec
  readonly map: MapDef
  readonly finishX: number | null
  private readonly phase: number[]
  private readonly segments = new Map<number, Segment>()

  constructor(spec: TrackSpec) {
    this.spec = spec
    this.map = MAPS[spec.map]
    this.finishX = spec.finish === null ? null : START_X + spec.finish
    const rnd = mulberry32(spec.seed)
    this.phase = [rnd(), rnd(), rnd()].map((r) => r * Math.PI * 2)
  }

  difficultyAt(d: number): number {
    const s = this.spec
    if (s.flat) return 0
    if (s.growth) return Math.min(1, s.difficulty + Math.max(0, d) / s.growth)
    const along = s.finish ? Math.min(1, Math.max(0, d) / s.finish) : 1
    return s.difficulty * (0.6 + 0.4 * along)
  }

  /** Rolling hills without obstacles. */
  base(x: number): number {
    if (this.spec.provingGround) return 0
    if (this.spec.flat || x <= FLAT_END) return 0
    if (this.spec.firstCourse) return firstCourseBase(x)
    const d = x - FLAT_END
    const ease = Math.min(1, d / 30)
    const k = this.difficultyAt(x - START_X)
    const { a0, a1, f, climb } = this.map.hills
    let h = 0
    for (let i = 0; i < 3; i++) {
      const amp = a0[i] + (a1[i] - a0[i]) * k
      h += amp * (Math.sin(d * f[i] + this.phase[i]) - Math.sin(this.phase[i]))
    }
    return ease * (h * 1.25 + Math.sin(d / 9 + this.phase[0]) * Math.sin(d / 23) * (0.6 + k * 1.1)) + d * climb * k
  }

  /** What the ground is made of at x. */
  surfaceAt(x: number): Surface {
    const d = x - START_X
    for (const p of this.spec.surfaces ?? []) if (d >= p.at && d < p.at + p.len) return p.kind
    const i = Math.floor(d / SEGMENT_LEN)
    if (i < 0) return 'ground'
    for (const f of this.segment(i).features) {
      if (x >= f.x && x < f.x + f.len && (f.kind === 'mud' || f.kind === 'ice' || f.kind === 'snow')) return f.kind
    }
    return 'ground'
  }

  /** Actual soft depth under a wheel: shallow entries, deeper centre, independent of decoration. */
  softDepthAt(x: number): number {
    const d = x - START_X
    for (const patch of this.spec.surfaces ?? []) {
      if (d >= patch.at && d < patch.at + patch.len && (patch.kind === 'mud' || patch.kind === 'snow')) {
        return (patch.depth ?? 0.4) * Math.sin(Math.PI * (d - patch.at) / patch.len) ** 2
      }
    }
    if (d < 0) return 0
    for (const feature of this.segment(Math.floor(d / SEGMENT_LEN)).features) {
      if ((feature.kind === 'mud' || feature.kind === 'snow') && x >= feature.x && x < feature.x + feature.len) {
        return -featureOffset(feature, (x - feature.x) / feature.len)
      }
    }
    return 0
  }

  /** The straight line a bridge's planks lie on. */
  bridgeY(f: Feature, x: number): number {
    const a = this.base(f.x)
    const b = this.base(f.x + f.len)
    return a + ((b - a) * (x - f.x)) / f.len
  }

  height(x: number): number {
    const i = Math.floor((x - START_X) / SEGMENT_LEN)
    const features = i >= 0 ? this.segment(i).features : []
    const gap = features.find(f => f.kind === 'gap' && x >= f.x && x < f.x + f.len)
    if (gap) {
      const u = (x - gap.x) / gap.len
      // Equal launch/landing datum prevents a downhill background from giving slow builds a free jump.
      const blend = Math.max(0, (u - .68) / .32)
      const smooth = blend * blend * (3 - 2 * blend)
      return this.base(gap.x) * (1 - smooth) + this.base(gap.x + gap.len) * smooth + featureOffset(gap, u)
    }
    return this.base(x) + offsetAt(features, x)
  }

  /** Points on the TERRAIN_STEP grid covering [x0, x1]; physics and drawing use the same grid. */
  sample(x0: number, x1: number): Pt[] {
    const start = Math.floor(x0 / TERRAIN_STEP) * TERRAIN_STEP
    const pts: Pt[] = []
    for (let x = start; x <= x1 + TERRAIN_STEP; x += TERRAIN_STEP) pts.push({ x, y: this.height(x) })
    return pts
  }

  segment(i: number): Segment {
    let s = this.segments.get(i)
    if (!s) {
      s = this.generate(i)
      this.segments.set(i, s)
    }
    return s
  }

  /** Segments overlapping world range [x0, x1]. */
  *segmentsIn(x0: number, x1: number): Generator<Segment> {
    const a = Math.max(0, Math.floor((x0 - START_X) / SEGMENT_LEN))
    const b = Math.floor((x1 - START_X) / SEGMENT_LEN)
    for (let i = a; i <= b; i++) yield this.segment(i)
  }

  private generate(i: number): Segment {
    const spec = this.spec
    if (spec.provingGround) return provingGroundSegment(i)
    if (spec.firstCourse) return firstCourseSegment(i, spec)
    const seasonalLevel = Boolean(spec.checkpoints?.length)
    const rnd = mulberry32(hash2(spec.seed, i))
    const d0 = i * SEGMENT_LEN
    const x0 = START_X + d0
    const k = this.difficultyAt(d0 + SEGMENT_LEN / 2)
    const features: Feature[] = []
    const rocks: Rock[] = []
    const logs: Rock[] = []
    const pickups: Pickup[] = []
    const blocked: [number, number][] = []
    const free = (a: number, b: number) => blocked.every(([p, q]) => b < p || a > q)
    const hAt = (x: number) => this.base(x) + offsetAt(features, x)

    if (this.finishX !== null) blocked.push([this.finishX - 25, this.finishX + 45])

    for (const distance of spec.checkpoints ?? []) blocked.push([START_X + distance - 6, START_X + distance + 6])
    const stars: Pickup[] = []
    ;(spec.stars ?? []).forEach((sd, j) => {
      if (sd < d0 || sd >= d0 + SEGMENT_LEN) return
      const rampX = START_X + sd - 16
      features.push({ kind: 'ramp', x: rampX, len: 8, h: 1.5 + 1.3 * k })
      blocked.push([rampX - 6, START_X + sd + 14])
      stars.push({ id: i * 1000 + 900 + j, kind: 'star', x: START_X + sd + 3, y: 0 })
    })

    if (!spec.flat) {
      // Timber crossing after the 100m clearing: a stepped entry and uneven rolling trunks.
      if ((!seasonalLevel || spec.map === 'moon') && i % 4 === 1 && free(x0 + 8, x0 + 29)) {
        logs.push(...timberPile(x0 + 13, 0.88), ...timberPile(x0 + 19, 1.14))
        blocked.push([x0 + 8, x0 + 29])
      }
      // Reserve runway and landing before placing other hazards.
      // The 300m checkpoint sits immediately before this deliberate speed challenge.
      if ((!seasonalLevel || spec.map === 'desert') && i % 4 === 3 && d0 + 12 >= FEATURE_START && free(x0 + 7, x0 + 57)) {
        features.push({ kind: 'gap', x: x0 + 12, len: 32, h: 5.5 })
        blocked.push([x0 + 7, x0 + 57])
      }
      // A recognizable set piece once per short course, repeated every 600m in infinite play.
      let landmarkAdded = false
      if (i % 6 === 1) {
        const definitions: Record<MapId, Omit<Feature, 'x'>> = {
          farm: { kind: 'bridge', len: 14, h: BRIDGE_DEPTH, landmark: 'spring-creek' },
          desert: { kind: 'ramp', len: 10, h: 2.0, landmark: 'summer-jump' },
          moon: { kind: 'bridge', len: 14, h: BRIDGE_DEPTH, landmark: 'autumn-log' },
          snow: { kind: 'ice', len: 18, h: 1.6, landmark: 'winter-slide' },
        }
        const definition = definitions[spec.map]
        const start = x0 + 60
        if (free(start - 4, start + definition.len + 4)) {
          features.push({ ...definition, x: start })
          blocked.push([start - 4, start + (definition.kind === 'ramp' ? 38 : definition.len + 4)])
          landmarkAdded = true
        }
      }
      // A predictable introduction to each season's surfaces, beyond the safe start.
      // These lanes stay clear of star jumps and the finish, and also reserve space from random hazards.
      const seasonal: Record<MapId, FeatureKind[]> = {
        farm: ['mud', 'pothole'], desert: ['pothole', 'bump'], moon: ['mud', 'pothole'], snow: ['snow', 'ice'],
      }
      const kind = seasonal[spec.map][Math.abs(i) % 2]
      const at = x0 + 62
      const len = kind === 'pothole' ? 4 + rnd() * 2 : kind === 'bump' ? 4 : kind === 'ice' ? 12 : 13 + rnd() * 3
      if (!landmarkAdded && d0 + 62 >= FEATURE_START && free(at - 4, at + len + 4)) {
        features.push({ kind, x: at, len, h: kind === 'ice' ? 0 : kind === 'pothole' ? 0.85 + rnd() * .4 : kind === 'bump' ? 0.65 : 0.80 + rnd() * 0.28 + k * 0.25 })
        blocked.push([at - 4, at + len + 4])
      }
      // Rock gardens: several distinct wheel-sized steps rather than a lone pebble.
      // Reserved separately from the soft patch, star jump and finish approach.
      const gardenStart = x0 + 84
      const count = 3 + Math.floor(rnd() * 2) + Math.floor(k * 2)
      const spacing = 8 / Math.max(1, count - 1)
      if (d0 + 84 >= FEATURE_START && free(gardenStart - 0.8, gardenStart + 8.8)) {
        const sizes = [0.19, 0.34, 0.52, 0.25, 0.43, 0.21]
        const rotate = Math.floor(rnd() * sizes.length)
        for (let n = 0; n < count; n++) {
          const r = sizes[(n + rotate) % sizes.length] * (1 + k * 0.55)
          rocks.push({ x: gardenStart + n * spacing + (rnd() - .5) * .45, r, lift: n % 3 === 1 ? .06 + k * .09 : 0 })
        }
        // Low, interlocking piles: embedded approach stones form a climbable shoulder.
        // lift is shared by rendering and physics, so the top stones are real obstacles.
        const pileX = gardenStart + 3.7
        rocks.push(...rockShelf(pileX, 1 + k * .30))
        blocked.push([gardenStart - 0.8, gardenStart + 8.8])
      }
      // Alternate a broad crest, shallow double rollers and a short raised shelf.
      // Each section has room to approach and recover before the next hazard.
      const ridgeX = x0 + 35
      if (d0 + 35 >= FEATURE_START && free(ridgeX - 4, ridgeX + 20)) {
        if (i % 3 === 1) {
          features.push({ kind: 'bump', x: ridgeX, len: 6, h: .65 + k * .35 })
          features.push({ kind: 'bump', x: ridgeX + 8, len: 7, h: .85 + k * .4 })
        } else {
          features.push({ kind: i % 3 === 0 ? 'bump' : 'mesa', x: ridgeX, len: 15, h: 1.1 + k * .65 })
        }
        blocked.push([ridgeX - 4, ridgeX + 20])
      }
      // Fallen timber across the trail; paired trunks can roll when nudged.
      const timberX = x0 + 18
      if (d0 + 18 >= FEATURE_START && free(timberX - 3, timberX + 5)) {
        logs.push(...timberPile(timberX, 0.78 + k * 0.25))
        blocked.push([timberX - 3, timberX + 5])
      }
      const w = this.map.weights
      const boss = spec.boss ? 2 : 1
      const odds: Record<FeatureKind, number> = {
        gap: 0,
        snow: w.snow * (0.4 + 0.6 * k),
        pothole: w.pothole,
        ramp: w.ramp,
        bump: w.bump,
        mesa: w.mesa,
        pit: w.pit * k,
        mud: w.mud * (0.4 + 0.6 * k) * boss,
        ice: w.ice * (0.4 + 0.6 * k) * boss,
        bridge: w.bridge * (0.3 + k) * boss,
      }
      const kinds = Object.keys(odds) as FeatureKind[]
      const total = kinds.reduce((sum, kk) => sum + odds[kk], 0)
      for (const [a, b] of SLOTS) {
        if (d0 + a < FEATURE_START) continue
        if (rnd() > (spec.boss ? 0.75 : 0.3) + 0.6 * k) continue
        let r = rnd() * total
        const kind = kinds.find((kk) => (r -= odds[kk]) < 0) ?? 'bump'
        const stretch = spec.boss && HAZARDS.includes(kind) ? 1.6 : 1
        const len =
          stretch *
          { gap: 32, snow: 8 + rnd() * 5, pothole: 4 + rnd() * 2, ramp: 6 + rnd() * 4, bump: 3 + rnd() * 3, mesa: 16 + rnd() * 12, pit: 10 + 5 * k + rnd() * 3, mud: 7 + 6 * k + rnd() * 5, ice: 12 + rnd() * 10, bridge: 9 + 3 * k + rnd() * 3 }[kind]
        const h = { gap: 5.5, snow: 0.25 + 0.15 * k, pothole: 0.8 + 0.65 * k, ramp: 1 + 1.8 * k, bump: 0.4 + 0.9 * k, mesa: 1.2 + 2.2 * k, pit: 1.8 + 1.8 * k, mud: 0.85 + 0.55 * k, ice: 0, bridge: BRIDGE_DEPTH }[kind]
        const start = x0 + a + rnd() * Math.max(0, b - a - len)
        if (start + len > x0 + SEGMENT_LEN - 1 || !free(start - 4, start + len + 4)) continue
        // A gap on a steep hill would leave a wall on the far side that nothing can climb.
        const rise = Math.abs(this.base(start + len) - this.base(start))
        if ((kind === 'pit' && rise > 1.2) || (kind === 'bridge' && rise > 1.8)) continue
        features.push({ kind, x: start, len, h })
        blocked.push([start - 4, start + len + 4])
      }
      features.sort((p, q) => p.x - q.x)

      if (spec.map === 'moon' && d0 + 58 >= FEATURE_START && free(x0 + 55, x0 + 57.9)) {
        logs.push(...timberPile(x0 + 56, 0.8))
        blocked.push([x0 + 55, x0 + 57.9])
      }
      const logCount = Math.floor(rnd() * (0.8 + 2.2 * k) * this.map.logs)
      for (let n = 0; n < logCount; n++) {
        const x = x0 + 8 + rnd() * 84
        const r = 0.26 + rnd() * 0.16
        if (d0 + 8 < FEATURE_START || !free(x - 4, x + 4)) continue
        logs.push(...timberPile(x, r / 0.40))
        blocked.push([x - 4, x + 4])
      }

      const rockCount = Math.floor(rnd() * (0.5 + 2.5 * k) * this.map.rocks)
      for (let n = 0; n < rockCount; n++) {
        const x = x0 + 8 + rnd() * 84
        const r = 0.24 + rnd() * (0.32 + 0.22 * k)
        if (d0 + 8 < FEATURE_START || !free(x - 3, x + 3)) continue
        rocks.push(...rockShelf(x, r / 0.48))
        blocked.push([x - 3, x + 3])
      }
    }

    // Teach clearance with a low first pile, then leave more pronounced steps later.
    if (seasonalLevel && spec.map === 'farm') {
      const scale = i === 0 ? 0.48 : 0.72
      for (const rock of rocks) {
        rock.r *= scale
        if (rock.lift) rock.lift *= scale
      }
    }

    for (const s of stars) {
      // Technical courses reward holding the driving line; the summer stars reward airtime.
      const lowStar = seasonalLevel && (spec.map === 'moon' || spec.map === 'snow')
      s.y = hAt(s.x) + (lowStar ? 1.9 : 3.2)
      pickups.push(s)
    }

    if (spec.fuelEvery) {
      for (let n = Math.ceil(d0 / spec.fuelEvery); n * spec.fuelEvery < d0 + SEGMENT_LEN; n++) {
        if (n === 0) continue
        let x = START_X + n * spec.fuelEvery
        const inPit = (xx: number) => features.some((f) => (f.kind === 'gap' || f.kind === 'pit' || f.kind === 'bridge') && xx > f.x - 2 && xx < f.x + f.len + 2)
        while ((inPit(x) || rocks.some((r) => Math.abs(r.x - x) < 2)) && x < x0 + SEGMENT_LEN - 2) x += 3
        pickups.push({ id: i * 1000 + 500 + n, kind: 'fuel', x, y: hAt(x) + 0.75 })
      }
    }

    if (spec.coins && !spec.flat) {
      let id = i * 1000
      for (const f of features) {
        if (f.kind !== 'ramp') continue
        const top = hAt(f.x + f.len - 0.5)
        for (let c = 0; c < 4; c++) {
          const x = f.x + f.len + 2 + c * 2.2
          pickups.push({ id: id++, kind: 'coin', x, y: top + 1.4 + Math.sin((c / 3) * Math.PI) * 0.8 })
        }
      }
      for (let g = 0; g < 2; g++) {
        if (rnd() > 0.75) continue
        const cx = x0 + 10 + g * 45 + rnd() * 25
        for (let c = 0; c < 5; c++) {
          const x = cx + c * 1.5
          if (features.some((f) => (f.kind === 'gap' || f.kind === 'pit' || f.kind === 'bridge') && x > f.x - 1 && x < f.x + f.len + 1)) continue
          pickups.push({ id: id++, kind: 'coin', x, y: hAt(x) + 1.25 })
        }
      }
    }

    return { features, rocks, logs, pickups }
  }
}
