/**
 * What the drawing changes in the physics, so how a vehicle is drawn matters:
 * - the wheel design (each has its own grip, speed, push, bounce and mud handling),
 * - the wheel size (big wheels: slower but better at rolling over obstacles; medium wheels favor speed),
 * - the body size (a bigger body is heavier: slower to speed up, but it pulls more),
 * - the wheelbase (long = steady, short = flips easily).
 */
import { clamp } from '../geometry/poly.ts'
import { VEHICLE_LENGTH } from './config.ts'
import type { WheelDesign } from './wheelart.ts'

export type WheelTrait = {
  /** Multiplies tire friction. */
  grip: number
  /** Multiplies top speed. */
  speed: number
  /** Multiplies motor push. */
  force: number
  /** Tire restitution: how much it bounces. */
  bounce: number
  /** 0 = sinks in mud, 1 = drives through it as if it were not there. */
  mud: number
}

export const TRAITS: Record<WheelDesign, WheelTrait> = {
  classic: { grip: 1, speed: 1, force: 1, bounce: 0.1, mud: 0.45 },
  sport: { grip: 0.8, speed: 1.22, force: 0.95, bounce: 0.05, mud: 0.15 },
  offroad: { grip: 1.15, speed: 0.86, force: 1.2, bounce: 0.1, mud: 1 },
  donut: { grip: 0.9, speed: 1, force: 1, bounce: 0.55, mud: 0.35 },
  ball: { grip: 1.05, speed: 1.08, force: 0.9, bounce: 0.35, mud: 0.3 },
  cookie: { grip: 1.3, speed: 0.92, force: 1.05, bounce: 0.05, mud: 0.6 },
}

export const traitOf = (design: WheelDesign | undefined): WheelTrait => TRAITS[design ?? 'classic'] ?? TRAITS.classic

/** Radius (m) of an "average" wheel: large tires trade top speed and acceleration for obstacle clearance. */
const REF_RADIUS = 0.45

export function sizeFactors(r: number): { speed: number; force: number } {
  const speed = clamp((REF_RADIUS / r) ** 0.65, 0.56, 1.10)
  return { speed, force: clamp((REF_RADIUS / r) ** 0.25, 0.78, 1.08) }
}

/** Chassis mass (kg) from the hull area (m²): every vehicle is the same length, so a taller, bulkier drawing weighs more. */
export function chassisMass(area: number): number {
  return clamp(area * 3, 6, 18)
}

export type StatWheel = { x: number; r: number; design?: WheelDesign }
/** Bars shown in the editor, each 0..1. */
export type Stats = { speed: number; grip: number; mud: number; weight: number; steady: number }

const norm = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo), 0, 1)

export function vehicleStats(area: number, wheels: readonly StatWheel[]): Stats {
  if (!wheels.length) return { speed: 0, grip: 0, mud: 0, weight: norm(chassisMass(area), 6, 18), steady: 0 }
  const avg = (f: (w: StatWheel) => number) => wheels.reduce((s, w) => s + f(w), 0) / wheels.length
  const speed = avg((w) => traitOf(w.design).speed * sizeFactors(w.r).speed)
  const xs = wheels.map((w) => w.x)
  const base = (Math.max(...xs) - Math.min(...xs)) / VEHICLE_LENGTH
  return {
    speed: norm(speed, 0.7, 1.45),
    grip: norm(avg((w) => traitOf(w.design).grip), 0.7, 1.35),
    mud: avg((w) => traitOf(w.design).mud),
    weight: norm(chassisMass(area), 6, 18),
    steady: norm(base, 0.25, 0.9),
  }
}

