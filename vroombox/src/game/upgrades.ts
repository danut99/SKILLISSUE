import { BASE_FUEL, SUSPENSION_DAMPING, SUSPENSION_HZ, WHEEL_FRICTION } from './config.ts'

export type UpgradeKey = 'engine' | 'tires' | 'suspension' | 'tank'
export const UPGRADE_KEYS: UpgradeKey[] = ['engine', 'tires', 'suspension']
export type Upgrades = Record<UpgradeKey, number>

export const NO_UPGRADES: Upgrades = { engine: 0, tires: 0, suspension: 0, tank: 0 }
export const MAX_UPGRADE = 3
/** Cost of buying level n+1, in coins. */
export const UPGRADE_COSTS = [100, 220, 400]

/** Per-vehicle improvements; tire design and geometry still determine handling. */
export function effects(u: Upgrades) {
  return {
    force: 1 + 0.08 * u.engine,
    speed: 1 + 0.04 * u.engine,
    grip: WHEEL_FRICTION + 0.06 * u.tires,
    air: 1 + 0.1 * u.suspension,
    suspensionHz: SUSPENSION_HZ - 0.2 * u.suspension,
    damping: SUSPENSION_DAMPING + 0.03 * u.suspension,
    fuel: BASE_FUEL * (1 + 0.2 * u.tank),
  }
}
