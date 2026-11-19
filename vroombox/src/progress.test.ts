import { describe, expect, it } from 'vitest'
import { dailyMissions } from './progress.ts'

describe('daily missions', () => {
  it('are three different missions, the same all day and new the next day', () => {
    const a = dailyMissions('2026-11-19')
    expect(new Set(a.map((m) => m.kind)).size).toBe(3)
    expect(dailyMissions('2026-11-19')).toEqual(a)
    const week = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'].map((d) => JSON.stringify(dailyMissions(d)))
    expect(week.some((w) => w !== JSON.stringify(a))).toBe(true)
  })
})
