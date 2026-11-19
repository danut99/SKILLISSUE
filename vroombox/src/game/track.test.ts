import { describe, expect, it } from 'vitest'
import { FEATURE_START, FLAT_END, START_X } from './config.ts'
import { endlessRun, LEVELS, levelRun, pullRun, PULL_LOADS } from './modes.ts'
import { Track } from './track.ts'

describe('Track', () => {
  const endless = new Track(endlessRun('farm').track)

  it('is flat at the start line and joins the hills without a step', () => {
    for (let x = -12; x <= FLAT_END; x += 0.5) expect(endless.height(x)).toBe(0)
    expect(Math.abs(endless.height(FLAT_END + 0.01))).toBeLessThan(0.01)
  })

  it('is the same track for everyone with the same spec', () => {
    const other = new Track(endlessRun('farm').track)
    for (let x = 0; x < 3000; x += 37.3) expect(other.height(x)).toBe(endless.height(x))
    expect(new Track(endlessRun('snow').track).height(500)).not.toBe(endless.height(500))
  })

  it('keeps the rolling hills drivable', () => {
    let maxSlope = 0
    for (let x = 0; x < 3000; x++) maxSlope = Math.max(maxSlope, Math.abs(endless.base(x + 1) - endless.base(x)))
    expect(maxSlope).toBeLessThan(1.6)
  })

  it('adds obstacles as the run gets harder, never in the calm start', () => {
    const early = [...endless.segmentsIn(0, FEATURE_START)].flatMap((s) => s.features)
    expect(early.every((f) => f.x >= START_X + FEATURE_START)).toBe(true)
    const late = [...endless.segmentsIn(1500, 3000)].flatMap((s) => s.features)
    expect(late.length).toBeGreaterThan(5)
    expect(late.some((f) => f.kind === 'pothole')).toBe(true)
    expect(late.some((f) => f.kind === 'mud')).toBe(true)
  })

  it('gives every level three stars, each right after a ramp and high enough to need a jump', () => {
    for (const l of LEVELS) {
      const track = new Track(levelRun(l).track)
      const stars = [...track.segmentsIn(0, l.length)].flatMap((s) => s.pickups.filter((p) => p.kind === 'star'))
      expect(stars).toHaveLength(3)
      for (const s of stars) {
        const ramp = [...track.segmentsIn(s.x - 30, s.x)].flatMap((seg) => seg.features).find((f) => f.kind === 'ramp' && f.x < s.x && s.x - f.x < 25)
        expect(ramp).toBeDefined()
        expect(s.y - track.height(s.x)).toBeGreaterThan(3)
      }
    }
  })

  it('keeps the finish line clear', () => {
    for (const l of LEVELS) {
      const track = new Track(levelRun(l).track)
      const fx = START_X + l.length
      const near = [...track.segmentsIn(fx - 30, fx + 50)].flatMap((s) => [...s.features.map((f) => [f.x, f.x + f.len]), ...s.rocks.map((r) => [r.x, r.x])])
      expect(near.every(([a, b]) => b < fx - 20 || a > fx + 40)).toBe(true)
    }
  })

  it('tractor pull ground is perfectly flat and empty', () => {
    const track = new Track(pullRun(PULL_LOADS[0]).track)
    for (let x = -10; x < 200; x += 3.7) expect(track.height(x)).toBe(0)
    expect([...track.segmentsIn(0, 200)].every((s) => !s.features.length && !s.rocks.length && !s.pickups.length)).toBe(true)
  })
})
