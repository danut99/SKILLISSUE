/**
 * Ghosts: the input log of your best finish on a level, per vehicle. The simulation is deterministic,
 * so replaying those inputs with the same vehicle and upgrades re-drives that exact run next to you.
 */
import type { VehicleGeom } from './game/geom.ts'
import type { Upgrades } from './game/upgrades.ts'

type Saved = { sig: string; time: number; upgrades: Upgrades; inputs: string }
export type Ghost = { time: number; upgrades: Upgrades; inputs: Uint8Array }

const key = (levelRef: string, vehicleId: string) => `vroombox:ghost:${levelRef}:${vehicleId}`

/** Changes whenever the vehicle's physics shape changes (an edited vehicle gets a new ghost). */
export function vehicleSig(geom: VehicleGeom): string {
  const text = JSON.stringify([geom.hull, geom.wheels, geom.mass, geom.com])
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

function read(levelRef: string, vehicleId: string): Saved | null {
  try {
    const raw = localStorage.getItem(key(levelRef, vehicleId))
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}

export function loadGhost(levelRef: string, vehicleId: string, sig: string): Ghost | null {
  const g = read(levelRef, vehicleId)
  if (!g || g.sig !== sig) return null
  try {
    return { time: g.time, upgrades: g.upgrades, inputs: fromBase64(g.inputs) }
  } catch {
    return null
  }
}

/** Keeps the run if it is the first, the fastest, or the vehicle changed since the saved one. Returns whether it was kept. */
export function saveGhost(levelRef: string, vehicleId: string, sig: string, time: number, upgrades: Upgrades, inputs: Uint8Array): boolean {
  const prev = read(levelRef, vehicleId)
  if (prev && prev.sig === sig && prev.time <= time) return false
  try {
    localStorage.setItem(key(levelRef, vehicleId), JSON.stringify({ sig, time, upgrades, inputs: toBase64(inputs) } satisfies Saved))
    return true
  } catch {
    return false
  }
}
