import { SPRING_COURSES, type CourseId } from './springCourses.ts'
import { MAP_ORDER, type MapId } from './maps.ts'
import type { ModeSpec, PullLoad } from './sim.ts'
import { Track, type TrackSpec } from './track.ts'

export type RunKind = 'endless' | 'level' | 'pull' | 'delivery'
/** ref: map id (endless), level id, pull load id or route id. */
export type RunSpec = { testDrive?: boolean; testLabel?: string; kind: RunKind; ref: string; track: TrackSpec; mode: ModeSpec }

/** The third star of a level: beat the time, do flips, never brake, or grab coins. */
export type LevelGoal = { kind: 'par' } | { kind: 'flips'; n: number } | { kind: 'nobrake' } | { kind: 'coins'; n: number }
export type LevelDef = {
  id: number
  map: MapId
  length: number
  difficulty: number
  seed: number
  par: number
  stars: number[]
  goal: LevelGoal
  /** The last level of each map: longer, more and bigger hazards. */
  boss: boolean
  /** Hand-built course and its difficulty (1 easy .. 3 hard). */
  course?: CourseId
  tier?: 1 | 2 | 3
}
export type RouteDef = { id: number; map: MapId; length: number; eggs: number; difficulty: number; seed: number }

/** Three star spots, each at 40 m into its own 100 m segment (so the ramp before it stays inside that segment), spread over the level. */
function starSpots(length: number): number[] {
  const usable = Math.floor((length - 70) / 100) + 1
  return [0, 1, 2].map((i) => Math.round((i * (usable - 1)) / 2) * 100 + 40)
}

/** Par times (seconds): the best time of a simple test driver over every wheel design (no upgrades), plus ~10%. Index = level id - 1. */
const PAR = [24, 32, 37, 55, 72, 26, 32, 47, 50, 70, 36, 40, 50, 59, 78, 41, 54, 59, 79, 91]

/** Coins on a level's track (pickups, not their value). */
function coinsOn(track: TrackSpec, length: number): number {
  const t = new Track(track)
  let n = 0
  for (const seg of t.segmentsIn(0, length)) n += seg.pickups.filter((p) => p.kind === 'coin').length
  return n
}

function goalFor(j: number, m: number, track: TrackSpec, length: number): LevelGoal {
  switch (j) {
    case 1:
      return { kind: 'flips', n: m < 2 ? 1 : 2 }
    case 2:
      return { kind: 'nobrake' }
    case 3:
      return { kind: 'coins', n: Math.max(5, Math.round(coinsOn(track, length) * 0.7)) }
    default:
      return { kind: 'par' }
  }
}

export const LEVELS: LevelDef[] = (['farm', 'desert', 'snow', 'moon'] as MapId[]).flatMap((map, m) =>
  [0, 1, 2, 3, 4].map((j) => {
    const id = m * 5 + j + 1
    const boss = j === 4
    const length = 320 + j * 80 + m * 40
    const base = { id, map, length, difficulty: Math.min(1, 0.18 + 0.13 * j + 0.1 * m), seed: 4000 + id * 7919, par: PAR[id - 1], stars: starSpots(length), boss }
    return { ...base, goal: goalFor(j, m, levelTrack(base), length) }
  }),
)

/** Spring level ids, easy to hard (101 keeps the first slot; records are separate from the legacy campaign). */
export const SPRING_IDS = [101, 111, 112]

/** Three hand-built Spring levels (easy to hard), then one approachable course per other season. */
export const ACTIVE_LEVELS: LevelDef[] = [
  ...SPRING_COURSES.map((c, index): LevelDef => ({
    ...LEVELS[0], id: SPRING_IDS[index], length: c.length, difficulty: 0.18, par: c.par, boss: false,
    stars: c.stars.map((s) => s.x), goal: { kind: 'par' }, course: c.id, tier: c.tier,
  })),
  ...[LEVELS[5], LEVELS[15], LEVELS[10]].map((level, index) => ({
    ...level, id: 102 + index, length: 480, difficulty: 0.18, par: 100, boss: false, stars: starSpots(480), goal: { kind: 'par' } as const,
  })),
]

export const PULL_LOADS: PullLoad[] = [
  { id: 'piano', emoji: '🎹', base: 40, growth: 60 },
  { id: 'cow', emoji: '🐄', base: 69, growth: 60 },
  { id: 'sofa', emoji: '🛋️', base: 92, growth: 80 },
  { id: 'whale', emoji: '🐋', base: 100, growth: 80 },
  { id: 'house', emoji: '🏠', base: 100, growth: 80 },
]

export const ROUTES: RouteDef[] = [
  { id: 1, map: 'farm', length: 260, eggs: 3, difficulty: 0.15, seed: 9101 },
  { id: 2, map: 'farm', length: 320, eggs: 4, difficulty: 0.3, seed: 9102 },
  { id: 3, map: 'desert', length: 360, eggs: 5, difficulty: 0.35, seed: 9103 },
  { id: 4, map: 'snow', length: 380, eggs: 5, difficulty: 0.4, seed: 9104 },
  { id: 5, map: 'moon', length: 420, eggs: 6, difficulty: 0.5, seed: 9105 },
]

export function endlessRun(map: MapId): RunSpec {
  return {
    kind: 'endless',
    ref: map,
    track: { map, seed: 777 + MAP_ORDER.indexOf(map), finish: null, difficulty: 0, growth: 650, fuelEvery: 150, coins: false },
    mode: { kind: 'endless' },
  }
}

function levelTrack(l: Omit<LevelDef, 'goal'>): TrackSpec {
  return { course: l.course, map: l.map, seed: l.seed, finish: l.length, difficulty: l.difficulty, growth: null, stars: l.stars, fuelEvery: 120, coins: l.id < 100, boss: l.boss, checkpoints: l.id >= 100 ? Array.from({ length: Math.ceil(l.length / 100) - 1 }, (_, i) => (i + 1) * 100) : undefined }
}

export function levelRun(l: LevelDef): RunSpec {
  return { kind: 'level', ref: String(l.id), track: levelTrack(l), mode: { kind: 'level' } }
}

/** Two muddy stretches on the pull lane (meters from the start): the tractor has to push through them. */
const PULL_MUD: TrackSpec['surfaces'] = [
  { at: 32, len: 10, kind: 'mud' },
  { at: 68, len: 12, kind: 'mud' },
]

export function pullRun(load: PullLoad): RunSpec {
  return {
    kind: 'pull',
    ref: load.id,
    track: { map: 'farm', seed: 31, finish: null, difficulty: 0, growth: null, flat: true, fuelEvery: null, coins: false, surfaces: PULL_MUD },
    mode: { kind: 'pull', load },
  }
}

export function deliveryRun(r: RouteDef): RunSpec {
  return {
    kind: 'delivery',
    ref: String(r.id),
    track: { map: r.map, seed: r.seed, finish: r.length, difficulty: r.difficulty, growth: null, fuelEvery: 160, coins: true },
    mode: { kind: 'delivery', eggs: r.eggs },
  }
}

/** What a run did that level goals look at. */
export type GoalStats = { time: number; flips: number; braked: boolean; coins: number }

export function goalMet(l: LevelDef, r: GoalStats): boolean {
  switch (l.goal.kind) {
    case 'par':
      return r.time <= l.par
    case 'flips':
      return r.flips >= l.goal.n
    case 'nobrake':
      return !r.braked
    case 'coins':
      return r.coins >= l.goal.n
  }
}

/** ★ finish · ★★ all stars on the track · ★★★ the level's goal. */
export function levelStars(l: LevelDef, finished: boolean, starsCollected: number, r: GoalStats): number {
  if (!finished) return 0
  return 1 + (starsCollected >= l.stars.length ? 1 : 0) + (goalMet(l, r) ? 1 : 0)
}

export function deliveryStars(total: number, delivered: number, finished: boolean): number {
  if (!finished || delivered <= 0) return 0
  return delivered >= total ? 3 : delivered * 2 >= total ? 2 : 1
}

export function pullStars(meters: number): number {
  return meters >= 100 ? 3 : meters >= 65 ? 2 : meters >= 30 ? 1 : 0
}



export function provingGroundRun(): RunSpec {
 return {testDrive:true,kind:'level',ref:'test-drive',mode:{kind:'level'},track:{provingGround:true,map:'farm',seed:1,finish:190,difficulty:0,growth:null,coins:false,fuelEvery:null,checkpoints:[55,95,130]}}
}
