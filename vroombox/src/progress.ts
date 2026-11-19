import { COIN_VALUE, courseRevisionOf } from './game/config.ts'
import { MAP_ORDER, type MapId } from './game/maps.ts'
import {
  ACTIVE_LEVELS,
  deliveryRun,
  deliveryStars,
  LEVELS,
  levelRun,
  levelStars,
  PULL_LOADS,
  pullRun,
  pullStars,
  ROUTES,
  type RunSpec,
} from './game/modes.ts'
import type { EndKind } from './game/sim.ts'
import { MAX_UPGRADE, NO_UPGRADES, UPGRADE_COSTS, type UpgradeKey, type Upgrades } from './game/upgrades.ts'
import type { WheelDesign } from './game/wheelart.ts'
import { hash2, mulberry32 } from './game/rng.ts'
import { getBest } from './vehicle.ts'

export type MissionKind = 'flips' | 'distance' | 'levels' | 'pull' | 'eggs' | 'draw' | 'coins'
export type Mission = { kind: MissionKind; target: number; done: number; claimed: boolean }
type Daily = { day: string; missions: Mission[]; bonus: boolean }

type Data = {
  v: 1
  daily: Daily | null
  coins: number
  vehicleUpgrades: Record<string, Upgrades>
  paidLevels: Record<string, number>
  upgrades: Upgrades
  levels: Record<string, { stars: number; time: number | null; length?: number; courseRevision?: number }>
  routes: Record<string, number>
  pulls: Record<string, number>
  /** `${vehicleId}:${map}` → best endless distance. */
  endless: Record<string, number>
  selected: string | null
}

const KEY = 'vroombox:progress'

const fresh = (): Data => ({ v: 1, daily: null, coins: 0, vehicleUpgrades: {}, paidLevels: {}, upgrades: { ...NO_UPGRADES }, levels: {}, routes: {}, pulls: {}, endless: {}, selected: null })

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw) as Partial<Data>
      return { ...fresh(), ...d, upgrades: { ...NO_UPGRADES, ...d.upgrades } }
    }
  } catch {
    /* corrupted or private mode */
  }
  return fresh()
}

export const progress: Data = load()

export function saveProgress(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress))
  } catch {
    /* private mode */
  }
}

export function upgradesFor(vehicleId: string): Upgrades {
  const raw = { ...NO_UPGRADES, ...progress.upgrades, ...progress.vehicleUpgrades[vehicleId] }
  for (const key of Object.keys(raw) as UpgradeKey[]) raw[key] = Math.max(0, Math.min(MAX_UPGRADE, Math.floor(Number(raw[key]) || 0)))
  return raw
}
export function upgradeCost(key: UpgradeKey, vehicleId = progress.selected ?? ''): number | null {
  const level = upgradesFor(vehicleId)[key]
  return level >= MAX_UPGRADE ? null : UPGRADE_COSTS[level]
}
export function buyUpgrade(key: UpgradeKey, vehicleId = progress.selected ?? ''): boolean {
  if (!vehicleId || key === 'tank') return false
  const cost = upgradeCost(key, vehicleId)
  if (cost === null || progress.coins < cost) return false
  const current = upgradesFor(vehicleId)
  current[key]++
  progress.coins -= cost
  progress.vehicleUpgrades[vehicleId] = current
  saveProgress()
  return true
}

export const levelStarsOf = (id: number) => progress.levels[id]?.stars ?? 0
export const levelTimeOf = (id: number): number | null => {
  const saved = progress.levels[id]
  const level = ACTIVE_LEVELS.find(l => l.id === id)
  return saved?.courseRevision === courseRevisionOf(id) && saved.length === level?.length ? saved.time : null
}
export const levelUnlocked = (id: number) => id === 1 || levelStarsOf(id - 1) > 0
export const totalLevelStars = () => LEVELS.reduce((s, l) => s + levelStarsOf(l.id), 0)
export const routeStarsOf = (id: number) => progress.routes[id] ?? 0
export const routeUnlocked = (id: number) => id === 1 || routeStarsOf(id - 1) > 0
export const pullBestOf = (id: string) => progress.pulls[id] ?? 0
export const loadUnlocked = (index: number) => index === 0 || pullBestOf(PULL_LOADS[index - 1].id) >= 50

/** Every star earned anywhere: levels, egg routes and tractor pulls. */
export function allStars(): number {
  const pulls = PULL_LOADS.reduce((sum, l) => sum + pullStars(pullBestOf(l.id)), 0)
  return totalLevelStars() + ROUTES.reduce((sum, r) => sum + routeStarsOf(r.id), 0) + pulls
}

/** Stars needed to unlock each wheel design. */
export const WHEEL_UNLOCK: Record<WheelDesign, number> = { classic: 0, sport: 0, offroad: 3, donut: 8, ball: 15, cookie: 24 }
export const wheelUnlocked = (_d: WheelDesign) => true

/** Farm is open from the start; every other map opens once its first level is finished. */
export function mapUnlocked(map: MapId): boolean {
  if (map === MAP_ORDER[0]) return true
  const first = LEVELS.find((l) => l.map === map)
  return !!first && levelStarsOf(first.id) > 0
}

export function endlessBest(vehicleId: string, map: MapId): number {
  const v = progress.endless[`${vehicleId}:${map}`]
  if (v !== undefined) return v
  return map === 'farm' ? getBest(vehicleId) : 0
}

export type Outcome = {
  resumed?: boolean
  run: RunSpec
  vehicleId: string
  end: EndKind
  distance: number
  time: number
  coins: number
  stars: number
  eggs: number
  eggsTotal: number
  pulled: number
  flips: number
  braked: boolean
}

export type Reward = { stars: number; coins: number; best: boolean; bestValue: number; next: RunSpec | null; missions: Mission[] }

export const MISSION_COINS = 100
export const MISSIONS_BONUS = 150
const MISSION_TARGETS: Record<MissionKind, number[]> = {
  flips: [3, 5, 8],
  distance: [600, 1000, 1500],
  levels: [1, 2, 3],
  pull: [40, 60, 80],
  eggs: [3, 5, 8],
  draw: [1, 1, 1],
  coins: [20, 35, 50],
}

const today = (now = new Date()) => `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`

/** Today's three missions: the same for everyone on a given day, new ones every day. */
export function dailyMissions(day = today()): Mission[] {
  const rnd = mulberry32(hash2(20261119, [...day].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) | 0))
  const kinds = Object.keys(MISSION_TARGETS) as MissionKind[]
  const picked: Mission[] = []
  while (picked.length < 3) {
    const kind = kinds[Math.floor(rnd() * kinds.length)]
    if (picked.some((m) => m.kind === kind)) continue
    const opts = MISSION_TARGETS[kind]
    picked.push({ kind, target: opts[Math.floor(rnd() * opts.length)], done: 0, claimed: false })
  }
  return picked
}

/** Today's missions with progress (a new day starts fresh). */
export function daily(): Daily {
  const day = today()
  if (progress.daily?.day !== day) {
    progress.daily = { day, missions: dailyMissions(day), bonus: false }
    saveProgress()
  }
  return progress.daily
}

/** Adds progress to today's missions and pays out the ones just completed. */
function advanceMissions(add: Partial<Record<MissionKind, number>>, best: Partial<Record<MissionKind, number>> = {}): { coins: number; done: Mission[] } {
  const d = daily()
  const done: Mission[] = []
  let coins = 0
  for (const m of d.missions) {
    if (m.claimed) continue
    m.done = Math.max(m.done + (add[m.kind] ?? 0), best[m.kind] ?? 0)
    if (m.done >= m.target) {
      m.claimed = true
      coins += MISSION_COINS
      done.push(m)
    }
  }
  if (!d.bonus && d.missions.every((m) => m.claimed)) {
    d.bonus = true
    coins += MISSIONS_BONUS
  }
  progress.coins += coins
  return { coins, done }
}

/** A vehicle was drawn (new or edited): counts for the "draw" mission. Returns the coins paid. */
export function noteDrawn(): number {
  const r = advanceMissions({ draw: 1 })
  saveProgress()
  return r.coins
}

/** Applies a finished run to the saved progress and returns what the player earned. */
export function recordRun(o: Outcome): Reward {
  if(o.run.testDrive) return {stars:0,coins:0,best:false,bestValue:0,next:null,missions:[]}
  let coins = o.coins * COIN_VALUE
  let stars = 0
  let best = false
  let bestValue = 0
  let next: RunSpec | null = null
  const run = o.run

  if (run.kind === 'endless') {
    const map = run.ref as MapId
    const prev = endlessBest(o.vehicleId, map)
    const d = Math.floor(o.distance)
    best = d > prev
    bestValue = Math.max(prev, d)
    progress.endless[`${o.vehicleId}:${map}`] = bestValue
    coins = 0
  } else if (run.kind === 'level') {
    const idx = ACTIVE_LEVELS.findIndex((l) => String(l.id) === run.ref)
    const level = ACTIVE_LEVELS[idx]
    stars = levelStars(level, o.end === 'finish', o.stars, o.resumed ? { ...o, time: Infinity } : o)
    const prev = progress.levels[level.id]
    const prevTime = levelTimeOf(level.id)
    const prevStars = prev?.stars ?? 0
    if (stars > 0) {
      best = !o.resumed && (prevTime == null || o.time < prevTime)
      progress.levels[level.id] = { stars: Math.max(prevStars, stars), length: level.length, courseRevision: courseRevisionOf(level.id), time: o.resumed ? prevTime : prevTime == null ? o.time : Math.min(prevTime, o.time) }
    }
    bestValue = progress.levels[level.id]?.time ?? 0
    coins = 0
    if (o.end === 'finish') {
      const paid = progress.paidLevels[run.ref] ?? 0
      coins = (paid === 0 ? 120 : o.resumed ? 0 : 20) + 30 * Math.max(0, stars - paid)
      progress.paidLevels[run.ref] = Math.max(paid, stars, 1)
    }
    if (stars > 0 && ACTIVE_LEVELS[idx + 1]) next = levelRun(ACTIVE_LEVELS[idx + 1])
  } else if (run.kind === 'pull') {
    const idx = PULL_LOADS.findIndex((l) => l.id === run.ref)
    const prev = pullBestOf(run.ref)
    const meters = Math.round(o.pulled * 10) / 10
    stars = pullStars(meters)
    best = meters > prev
    bestValue = Math.max(prev, meters)
    progress.pulls[run.ref] = bestValue
    coins += Math.floor(meters) + (stars === 3 && pullStars(prev) < 3 ? 150 : 0)
    if (PULL_LOADS[idx + 1] && loadUnlocked(idx + 1)) next = pullRun(PULL_LOADS[idx + 1])
  } else {
    const idx = ROUTES.findIndex((r) => String(r.id) === run.ref)
    const route = ROUTES[idx]
    stars = deliveryStars(o.eggsTotal, o.eggs, o.end === 'finish')
    const prevStars = routeStarsOf(route.id)
    best = stars > prevStars
    progress.routes[route.id] = Math.max(prevStars, stars)
    coins += 50 * Math.max(0, stars - prevStars)
    if (stars > 0 && ROUTES[idx + 1]) next = deliveryRun(ROUTES[idx + 1])
  }


  progress.coins += coins
  saveProgress()
  return { stars, coins, best, bestValue, next, missions: [] }
}




