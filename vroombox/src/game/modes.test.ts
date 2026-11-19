import { describe, expect, it } from 'vitest'
import { LEVELS, levelStars } from './modes.ts'

describe('level goals', () => {
  const run = { time: 999, flips: 0, braked: true, coins: 0 }

  it('gives the third star only for the level goal', () => {
    for (const l of LEVELS) {
      const all = l.stars.length
      expect(levelStars(l, false, all, run)).toBe(0)
      expect(levelStars(l, true, 0, run)).toBe(1)
      expect(levelStars(l, true, all, run)).toBe(2)
      const met = { time: l.par, flips: 9, braked: false, coins: 999 }
      expect(levelStars(l, true, all, met)).toBe(3)
    }
  })

  it('has a boss at the end of every map and a mix of goals', () => {
    expect(LEVELS.filter((l) => l.boss).map((l) => l.id)).toEqual([5, 10, 15, 20])
    expect(new Set(LEVELS.map((l) => l.goal.kind))).toEqual(new Set(['par', 'flips', 'nobrake', 'coins']))
  })
})
