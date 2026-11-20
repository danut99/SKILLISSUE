import { describe, expect, it } from 'vitest'
import { Revs, type EngineInput } from './audio.ts'

const FRAME = 1 / 60
const drive = (load: number, throttle: number, extra: Partial<EngineInput> = {}): EngineInput => ({ load, throttle, reverse: false, airborne: false, ...extra })

/** Steps like the drive screen: the pedal is smoothed toward `pedal` (0/1), so it never jumps straight from 1 to 0. */
function run(revs: Revs, load: number, pedal: 0 | 1, seconds: number, state: { t: number; throttle: number }, extra: Partial<EngineInput> = {}) {
  let shifts = 0
  for (const end = state.t + seconds; state.t < end; state.t += FRAME) {
    state.throttle += (pedal - state.throttle) * Math.min(1, FRAME * 8)
    const r = revs.step(drive(load, state.throttle, extra), state.t)
    if (r.shiftedUp) shifts++
  }
  return { shifts }
}

describe('engine revs', () => {
  it('idles low when standing still', () => {
    const revs = new Revs()
    run(revs, 0, 0, 1, { t: 0, throttle: 0 })
    expect(revs.rpm).toBeLessThan(0.15)
  })

  it('shifts up through the gears while pulling away, dropping the revs at each shift', () => {
    const revs = new Revs()
    const state = { t: 0, throttle: 0 }
    let shifts = 0
    let dropped = false
    for (let speed = 0; speed <= 1.1; speed += 0.01) {
      const before = revs.rpm
      const r = run(revs, speed, 1, 0.05, state)
      shifts += r.shifts
      if (r.shifts && revs.rpm < before) dropped = true
    }
    expect(shifts).toBe(3)
    expect(revs.gear).toBe(3)
    expect(dropped).toBe(true)
  })

  it('engine-brakes for a moment after lifting off from high revs, but not from low revs', () => {
    const high = new Revs()
    const state = { t: 0, throttle: 0 }
    run(high, 0.2, 1, 1, state, { airborne: true })
    expect(high.rpm).toBeGreaterThan(0.95)
    run(high, 0.2, 0, 0.6, state)
    expect(high.decel).toBe(true)
    expect(high.rpm).toBeGreaterThan(0.4)
    run(high, 0.2, 0, 2, state)
    expect(high.decel).toBe(false)

    const low = new Revs()
    const calm = { t: 0, throttle: 0 }
    run(low, 0.02, 1, 0.3, calm)
    run(low, 0.02, 0, 0.2, calm)
    expect(low.decel).toBe(false)
  })
})
