import { describe, expect, it } from 'vitest'
import { measureSetup } from './dyno.ts'
import { buildGeom } from './geom.ts'
import { NO_UPGRADES } from './upgrades.ts'

const geom = buildGeom({ width: 320, height: 120, outline: [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 320, y: 120 }, { x: 0, y: 120 }], wheels: [{ x: 60, y: 115, r: 40 }, { x: 260, y: 115, r: 40 }] })

describe('workshop dyno', () => {
  const base = measureSetup(geom, NO_UPGRADES)

  it('shows a faster top speed and sprint after an engine upgrade', () => {
    const next = measureSetup(geom, { ...NO_UPGRADES, engine: 1 })
    expect(next.topSpeed).toBeGreaterThan(base.topSpeed)
    expect(next.sprint!).toBeLessThan(base.sprint!)
  })

  it('shows a quicker launch on ice after tire upgrades', () => {
    expect(measureSetup(geom, { ...NO_UPGRADES, tires: 3 }).iceSprint!).toBeLessThan(base.iceSprint!)
  })
})
