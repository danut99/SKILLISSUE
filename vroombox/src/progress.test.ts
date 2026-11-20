import { describe, expect, it } from 'vitest'
import { dailyMissions, progress, recordRun, type Outcome } from './progress.ts'
import { courseRevisionOf } from './game/config.ts'
import { ACTIVE_LEVELS, levelRun } from './game/modes.ts'

describe('daily missions', () => {
  it('are three different missions, the same all day and new the next day', () => {
    const a = dailyMissions('2026-11-19')
    expect(new Set(a.map((m) => m.kind)).size).toBe(3)
    expect(dailyMissions('2026-11-19')).toEqual(a)
    const week = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'].map((d) => JSON.stringify(dailyMissions(d)))
    expect(week.some((w) => w !== JSON.stringify(a))).toBe(true)
  })
})


describe('seasonal level results', () => {
  it('advances through every season level, preserves stars on replay, and grants course rewards', () => {
    const saved = structuredClone(progress)
    try {
      progress.levels = {}
      progress.paidLevels = {}
      const startingCoins = progress.coins
      for (const [index, level] of ACTIVE_LEVELS.entries()) {
        const outcome: Outcome = { run: levelRun(level), vehicleId: 'test-drawing', end: 'finish', distance: 320,
          time: 35, stars: level.stars.length, coins: 0, eggs: 0, eggsTotal: 0, pulled: 0, flips: 0, braked: true }
        const reward = recordRun(outcome)
        expect(reward.stars).toBe(3)
        expect(reward.coins).toBe(210)
        expect(reward.missions).toEqual([])
        expect(reward.next?.ref ?? null).toBe(ACTIVE_LEVELS[index + 1] ? String(ACTIVE_LEVELS[index + 1].id) : null)
        recordRun({ ...outcome, end: 'roof', time: 70, stars: 0 })
        expect(progress.levels[level.id]).toEqual({ stars: 3, length: level.length, time: 35, courseRevision: courseRevisionOf(level.id) })
      }
      expect(progress.coins).toBe(startingCoins + 210 * ACTIVE_LEVELS.length)
    } finally { Object.assign(progress, saved) }
  })
})

it('keeps checkpoint finishes separate from time records while preserving earned stars', () => {
 const saved = structuredClone(progress)
 try {
  const level=ACTIVE_LEVELS[0], run=levelRun(level)
  progress.levels={ [level.id]: {stars:1,time:20,length:level.length} }
  const outcome: Outcome={run,vehicleId:'checkpoint-car',resumed:true,end:'finish',distance:level.length,time:10,stars:level.stars.length,coins:0,eggs:0,eggsTotal:0,pulled:0,flips:0,braked:false}
  const reward=recordRun(outcome)
  expect(reward.stars).toBe(2)
  expect(reward.best).toBe(false)
  expect(progress.levels[level.id]).toEqual({stars:2,time:null,length:level.length,courseRevision:courseRevisionOf(level.id)})
  recordRun({...outcome,resumed:false,time:85})
  expect(progress.levels[level.id].time).toBe(85)
  recordRun({...outcome,time:2})
  expect(progress.levels[level.id].time).toBe(85)
 } finally {Object.assign(progress,saved)}
})
