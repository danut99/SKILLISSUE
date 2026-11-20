import { describe, expect, it } from 'vitest'
import { DT } from './config.ts'
import { boxGeom, carefulDriver, drive, fullGas, tractorGeom } from './drivers.testutil.ts'
import { DRAWBRIDGE_LIFT, DRAWBRIDGE_PERIOD, DRAWBRIDGE_WARN, drawbridgeDownFor, drawbridgeLift, drawbridgeSignal } from './gadgets.ts'
import { ACTIVE_LEVELS, levelRun } from './modes.ts'
import { NO_INPUT } from './sim.ts'
import { COURSES, type CourseId } from './springCourses.ts'

const builds = { tractor: tractorGeom(), classic: boxGeom(55), offroad: boxGeom(55, 'offroad'), cookie: boxGeom(45, 'cookie') }
const springLevels = ACTIVE_LEVELS.filter((l) => l.course)
const runOf = (id: CourseId) => levelRun(springLevels.find((l) => l.course === id)!)

describe('spring levels reward control over a held gas pedal', () => {
  it('come in three tiers that get longer and ask for more', () => {
    expect(springLevels.map((l) => l.tier)).toEqual([1, 2, 3])
    expect(springLevels.map((l) => l.length)).toEqual([300, 350, 400])
  })

  for (const level of springLevels) {
    const course = COURSES[level.course!]
    const run = levelRun(level)
    describe(course.id, () => {
      it(`does not let any build finish on full gas${course.tier === 1 ? ', but gets it through the first 100 m' : ''}`, () => {
        for (const geom of Object.values(builds)) {
          const sim = drive(geom, run, fullGas)
          expect(sim.ended).not.toBe('finish')
          if (course.tier === 1) expect(sim.distance).toBeGreaterThan(110)
        }
      })

      // The hard level's big stones and logs need big wheels.
      const fit = course.tier === 3 ? [builds.tractor, builds.classic, builds.offroad, boxGeom(70)] : Object.values(builds)
      it('lets a careful driver finish with every reasonable build and every star, without upgrades', () => {
        for (const geom of fit) {
          const sim = drive(geom, run, carefulDriver(course.pace))
          expect(sim.ended).toBe('finish')
          expect(sim.stars).toBe(level.stars.length)
        }
      })

      it('keeps the time star for confident driving', () => {
        for (const geom of [builds.tractor, builds.classic]) {
          expect(drive(geom, run, carefulDriver(course.pace)).time).toBeGreaterThan(level.par)
          const confident = drive(geom, run, carefulDriver((x) => course.pace(x) * 1.2))
          expect(confident.ended).toBe('finish')
          expect(confident.time).toBeLessThanOrEqual(level.par)
        }
      })

      it('asks tiny wheels for a redesign', () => {
        expect(drive(boxGeom(30), run, carefulDriver(course.pace)).ended).not.toBe('finish')
      })
    })
  }

  it('asks small wheels for a redesign on the hard level only', () => {
    expect(drive(builds.cookie, runOf('spring2'), carefulDriver(COURSES.spring2.pace)).ended).toBe('finish')
    expect(drive(builds.cookie, runOf('spring3'), carefulDriver(COURSES.spring3.pace)).ended).not.toBe('finish')
  })

  it('lets sport tires through the easy level but sinks them in the deeper mud later', () => {
    const sport = boxGeom(55, 'sport')
    expect(drive(sport, runOf('spring1'), carefulDriver(COURSES.spring1.pace)).ended).toBe('finish')
    expect(drive(sport, runOf('spring2'), carefulDriver(COURSES.spring2.pace)).ended).not.toBe('finish')
  })
})

describe('spring set pieces', () => {
  const pace = (id: CourseId) => carefulDriver(COURSES[id].pace)

  it('flips a car held on the gas off the built ramp on the crest, while a careful driver hops it', () => {
    const floored = drive(builds.classic, runOf('spring1'), fullGas, { startDistance: 100, until: 160 })
    expect(floored.ended).toBe('roof')
    expect(floored.distance).toBeLessThan(155)
    const careful = drive(builds.classic, runOf('spring1'), pace('spring1'), { startDistance: 100, until: 155 })
    expect(careful.ended).toBeNull()
  })

  it('drops a car that crawls across the creek bridge', () => {
    const crawl = drive(builds.classic, runOf('spring1'), carefulDriver((x) => (x >= 150 ? 2 : COURSES.spring1.pace(x))), { startDistance: 100, seconds: 40 })
    const { x, y } = crawl.chassis.getPosition()
    expect(crawl.ended).not.toBe('finish')
    expect(x).toBeGreaterThan(160)
    expect(x).toBeLessThan(174)
    expect(y).toBeLessThan(crawl.track.base(x))
  })

  it('tips the seesaw under a crawling car', () => {
    const crawl = drive(builds.classic, runOf('spring2'), pace('spring2'), { until: 72 })
    const plank = crawl.props.find((p) => p.kind === 'plank' && Math.abs(p.body.getPosition().x - 68) < 1)!
    expect(crawl.ended).toBeNull()
    expect(plank.body.getAngle()).toBeLessThan(0)
  })

  it('needs momentum for the big gap', () => {
    const slow = drive(builds.classic, runOf('spring2'), carefulDriver((x) => (x > 190 ? 5 : COURSES.spring2.pace(x))), { startDistance: 200, until: 255 })
    expect(slow.distance).toBeLessThan(236)
    const paced = drive(builds.classic, runOf('spring2'), pace('spring2'), { startDistance: 200, until: 255 })
    expect(paced.ended).toBeNull()
  })

  it('lifts the drawbridge on its timer', () => {
    const sim = drive(builds.classic, runOf('spring2'), pace('spring2'), { startDistance: 200, until: 250 })
    const deck = () => sim.props.find((p) => p.kind === 'plank' && p.ox !== undefined)!.body
    for (let n = 0; n < 8 / DT && Math.abs(deck().getAngle()) < DRAWBRIDGE_LIFT - 0.01; n++) sim.step(NO_INPUT)
    expect(deck().getAngle()).toBeCloseTo(-DRAWBRIDGE_LIFT, 1)
  })

  it('warns before the drawbridge lifts and never shows green or yellow while it is up or moving', () => {
    for (let t = 0; t < DRAWBRIDGE_PERIOD * 2; t += 0.05) {
      const signal = drawbridgeSignal(t)
      if (drawbridgeLift(t) > 0) expect(signal).toBe('stop')
      if (signal === 'go') expect(drawbridgeDownFor(t)).toBeGreaterThan(DRAWBRIDGE_WARN)
    }
    expect(drawbridgeSignal(4 - DRAWBRIDGE_WARN / 2)).toBe('soon')
  })

  it('rolls barrels down the final climb toward the player', () => {
    const sim = drive(builds.classic, runOf('spring3'), pace('spring3'), { startDistance: 300, until: 332 })
    const barrels = sim.props.filter((p) => p.kind === 'barrel')
    expect(barrels.length).toBeGreaterThan(0)
    expect(barrels.every((b) => b.body.getLinearVelocity().x < 0)).toBe(true)
  })
})
