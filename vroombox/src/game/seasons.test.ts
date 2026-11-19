import { describe, expect, it } from 'vitest'
import { DT } from './config.ts'
import { buildGeom } from './geom.ts'
import { MAP_ORDER, MAPS } from './maps.ts'
import { ACTIVE_LEVELS, endlessRun, levelRun } from './modes.ts'
import { Sim } from './sim.ts'
import { featureOffset, Track } from './track.ts'

import type { WheelDesign } from './wheelart.ts'

// A beginner driver stabilizes the drawing in the air and eases off on steep climbs.
const car = (design: WheelDesign, radius = 55) => buildGeom({ width: 320, height: 120,
  outline: [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 320, y: 120 }, { x: 0, y: 120 }],
  wheels: [{ x: 60, y: 115, r: radius, design }, { x: 260, y: 115, r: radius, design }] })

describe('seasonal drawing and driving', () => {
  it('offers one extended level and an infinite track per season, without coin pickups', () => {
    expect(ACTIVE_LEVELS.map((level) => level.map)).toEqual(MAP_ORDER)
    expect(new Set(ACTIVE_LEVELS.map((level) => level.id)).size).toBe(4)
    for (const level of ACTIVE_LEVELS) {
      expect(levelRun(level).track.coins).toBe(false)
      expect(levelRun(level).track.finish).toBe(480)
      expect(endlessRun(level.map).track.finish).toBeNull()
      expect(endlessRun(level.map).track.coins).toBe(false)
      expect(MAPS[level.map].gravity).toBe(-10)
    }
  })
  it('introduces the right hazards in the first 300m and gives them physical surfaces', () => {
    for (const level of ACTIVE_LEVELS) {
      const track = new Track(levelRun(level).track)
      const segments = [...track.segmentsIn(0, 290)]
      const features = segments.flatMap((s) => s.features)
      const expected = level.map === 'snow' ? ['snow', 'ice'] : level.map === 'desert' ? ['pothole', 'ramp'] : ['mud', 'bridge']
      for (const kind of expected) expect(features.some((f) => f.kind === kind)).toBe(true)
      if (level.map === 'desert') expect(features.some((f) => f.kind === 'mud' || f.kind === 'ice' || f.kind === 'snow')).toBe(false)
      if (level.map !== 'snow') expect(segments.some((s) => s.rocks.length > 0)).toBe(true)
      for (const feature of features) {
        if (feature.kind === 'mud' || feature.kind === 'snow' || feature.kind === 'ice') {
          expect(track.surfaceAt(feature.x + feature.len / 2)).toBe(feature.kind)
        }
        if (feature.kind === 'pothole') expect(featureOffset(feature, 0.5)).toBeLessThan(0)
      }
    }
  })
  it('gives each short course one distinct physical landmark and a clear landing/finish', () => {
    const names = ['spring-creek', 'summer-jump', 'autumn-log', 'winter-slide']
    for (const [index, level] of ACTIVE_LEVELS.entries()) {
      const track = new Track(levelRun(level).track)
      const segments = [...track.segmentsIn(0, 320)]
      const landmarks = segments.flatMap((s) => s.features).filter((f) => f.landmark)
      expect(landmarks).toHaveLength(1)
      expect(landmarks[0].landmark).toBe(names[index])
      expect(landmarks[0].x).toBeGreaterThanOrEqual(50)
      expect(landmarks[0].x + landmarks[0].len).toBeLessThan(295)
      if (level.map === 'desert') expect(segments.flatMap((s) => s.rocks).some((r) => r.x >= 170 && r.x <= 198)).toBe(false)
      if (level.map === 'snow') {
        const f = landmarks[0]
        expect(featureOffset(f, 0.5)).toBeLessThan(-1)
        expect(track.surfaceAt(f.x + f.len / 2)).toBe('ice')
      }
      if (level.map === 'moon') expect(segments.some((s) => s.logs.length > 0)).toBe(true)
    }
  })
  it('builds mixed-size rock clusters and keeps the finish approach clear', () => {
    for (const level of ACTIVE_LEVELS) {
      const track = new Track(levelRun(level).track)
      const garden = track.segment(0).rocks.filter((rock) => rock.x >= 83 && rock.x <= 94)
      expect(garden.length).toBeGreaterThanOrEqual(3)
      expect(Math.max(...garden.map((r) => r.r)) / Math.min(...garden.map((r) => r.r))).toBeGreaterThan(1.4)
      expect([...track.segmentsIn(450, 510)].flatMap((s) => s.rocks).every((r) => r.x + r.r < 455 || r.x - r.r > 525)).toBe(true)
      const soft = [...track.segmentsIn(0, 290)].flatMap((s) => s.features).find((f) => f.kind === 'mud' || f.kind === 'snow')
      if (soft) expect(track.softDepthAt(soft.x + soft.len / 2)).toBeGreaterThan(track.softDepthAt(soft.x + 1) * 2)
    }
  })
  it('lets a small balanced build finish the introductory course without upgrades', () => {
    const sim = new Sim({geom:car('classic',40),...levelRun(ACTIVE_LEVELS[0])})
    for(let n=0;n<100/DT&&!sim.ended;n++) {const a=sim.chassis.getAngle();sim.step(sim.airborne?{gas:a<-.25,brake:a>.25}:{gas:a<1,brake:false})}
    expect(sim.ended).toBe('finish')
    expect(sim.stars).toBe(3)
    expect(sim.time).toBeLessThanOrEqual(ACTIVE_LEVELS[0].par)
  })
  for (const level of ACTIVE_LEVELS) {
    it(`can earn all three stars with one vehicle in ${level.map}`, () => {
      const design = { farm: 'classic', desert: 'sport', moon: 'offroad', snow: 'classic' } as const
      const radius = { farm: 40, desert: 55, moon: 65, snow: 65 }
      const sim = new Sim({ geom: car(design[level.map], radius[level.map]), ...levelRun(level) })
      for (let i = 0; i < level.par / DT && !sim.ended; i++) {
        const a = sim.chassis.getAngle()
        const angle = Math.atan2(Math.sin(a), Math.cos(a))
        sim.step(sim.airborne ? { gas: angle < -0.25, brake: angle > 0.25 } : { gas: angle < 1, brake: false })
      }
      expect(sim.ended).toBe('finish')
      expect(sim.stars).toBe(level.stars.length)
      expect(sim.time).toBeLessThanOrEqual(level.par)
    })
  }
})

 describe('expanded trail obstacles', () => {
  it('generates deterministic raised rock piles and timber clusters beyond the safe start', () => {
    for (const map of MAP_ORDER) {
      const spec = endlessRun(map).track
      const a = new Track(spec), b = new Track(spec)
      const segments = [...a.segmentsIn(0, 600)]
      expect(segments).toEqual([...b.segmentsIn(0, 600)])
      const rocks = segments.flatMap(s => s.rocks)
      const logs = segments.flatMap(s => s.logs)
      expect(rocks.some(r => (r.lift ?? 0) > .2)).toBe(true)
      expect(logs.some(r => logs.some(other => other !== r && Math.abs(other.x - r.x) < .5))).toBe(true)
      for (const top of rocks.filter(r => (r.lift ?? 0) > .2)) {
        expect(rocks.some(base => base !== top && Math.abs(base.x - top.x) < .5 && (base.lift ?? 0) < .1)).toBe(true)
      }
      expect(logs.every(r => r.x > 30)).toBe(true)
    }
  })
 })








