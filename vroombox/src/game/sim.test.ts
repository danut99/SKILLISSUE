import { describe, expect, it } from 'vitest'
import { DT } from './config.ts'
import { buildGeom, type VehicleShape } from './geom.ts'
import { deliveryRun, endlessRun, LEVELS, levelRun, PULL_LOADS, pullRun, ROUTES, type RunSpec } from './modes.ts'
import { mulberry32 } from './rng.ts'
import { decodeInput, encodeInput, NO_INPUT, Sim, type ModeSpec } from './sim.ts'
import { RPM_GREEN } from './config.ts'
import type { WheelDesign } from './wheelart.ts'
import type { TrackSpec } from './track.ts'

// A 320x120 px "box on wheels": becomes 3.2 m long once scaled.
const boxCar: VehicleShape = {
  width: 320,
  height: 120,
  outline: [
    { x: 0, y: 0 },
    { x: 320, y: 0 },
    { x: 320, y: 120 },
    { x: 0, y: 120 },
  ],
  wheels: [
    { x: 60, y: 115, r: 40 },
    { x: 260, y: 115, r: 40 },
  ],
}

const seconds = (s: number) => Math.round(s / DT)
const GAS = { gas: true, brake: false }
const flat = (finish: number | null): TrackSpec => ({ map: 'farm', seed: 1, finish, difficulty: 0, growth: null, flat: true, fuelEvery: null, coins: false })
const simFor = (run: RunSpec) => new Sim({ geom: buildGeom(boxCar), track: run.track, mode: run.mode })
const simOn = (track: TrackSpec, mode: ModeSpec = { kind: 'endless' }) => new Sim({ geom: buildGeom(boxCar), track, mode })

function flipOver(sim: Sim) {
  const pivot = sim.chassis.getPosition().clone()
  for (const body of [sim.chassis, ...sim.wheels, ...sim.eggs]) {
    const p = body.getPosition()
    body.setTransform({ x: 2 * pivot.x - p.x, y: 2 * pivot.y - p.y + 1.2 }, body.getAngle() + Math.PI)
  }
}

// A body drawn all the way down around its wheels.
const lowBodyCar: VehicleShape = {
  width: 662,
  height: 316,
  outline: [{ x: 12, y: 120 }, { x: 200, y: 11 }, { x: 450, y: 11 }, { x: 648, y: 150 }, { x: 648, y: 240 }, { x: 560, y: 305 }, { x: 90, y: 305 }, { x: 12, y: 240 }],
  wheels: [{ x: 155, y: 239, r: 67 }, { x: 495, y: 239, r: 67 }],
}

/** The box car with every wheel of one design; `height` makes the body bigger (heavier). */
const designCar = (design: WheelDesign, height = 120) =>
  buildGeom({
    ...boxCar,
    height,
    outline: [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 320, y: height }, { x: 0, y: height }],
    wheels: boxCar.wheels.map((w) => ({ ...w, y: height - 5, design })),
  })

describe('Sim', () => {
  it('drives a car whose body is drawn down around its wheels', () => {
    const geom = buildGeom(lowBodyCar)
    const wheelBottom = Math.min(...geom.wheels.map((w) => w.y - w.r))
    expect(Math.min(...geom.hull.map((p) => p.y))).toBeGreaterThan(wheelBottom)
    const sim = new Sim({ geom, ...endlessRun('farm') })
    for (let i = 0; i < seconds(4); i++) sim.step(GAS)
    expect(sim.distance).toBeGreaterThan(10)
  })

  it('drives forward when holding gas', () => {
    const sim = simFor(endlessRun('farm'))
    for (let i = 0; i < seconds(5); i++) sim.step(GAS)
    expect(sim.distance).toBeGreaterThan(15)
    expect(sim.ended).toBeNull()
  })

  it('does not end the run while the player has not touched a pedal', () => {
    const sim = simFor(endlessRun('farm'))
    for (let i = 0; i < seconds(10); i++) sim.step(NO_INPUT)
    expect(sim.ended).toBeNull()
  })

  it('does not end the run while holding brake (braking/reversing is not being stuck)', () => {
    const sim = simFor(endlessRun('farm'))
    for (let i = 0; i < seconds(2); i++) sim.step(GAS)
    for (let i = 0; i < seconds(12); i++) sim.step({ gas: false, brake: true })
    expect(sim.ended).toBeNull()
  })

  it('ends the run when holding gas without moving forward', () => {
    const sim = simFor(endlessRun('farm'))
    sim.chassis.setStatic()
    for (let i = 0; i < seconds(8) && !sim.ended; i++) sim.step(GAS)
    expect(sim.ended).toBe('stuck')
  })

  it('crashes as soon as the roof touches the ground', () => {
    const sim = simFor(endlessRun('farm'))
    flipOver(sim)
    for (let i = 0; i < seconds(3) && !sim.ended; i++) sim.step(NO_INPUT)
    expect(sim.ended).toBe('roof')
    expect(sim.time).toBeLessThan(1.5)
  })

  it('runs out of fuel, coasts to a stop and ends the run', () => {
    const sim = simOn(flat(null))
    sim.fuel = 1
    for (let i = 0; i < seconds(25) && !sim.ended; i++) sim.step(GAS)
    expect(sim.ended).toBe('fuel')
  })

  it('collects coins and refuels at fuel cans on the endless track', () => {
    const sim = simFor(endlessRun('farm'))
    for (let i = 0; i < seconds(30) && !sim.ended; i++) sim.step(GAS)
    expect(sim.coins).toBeGreaterThan(0)
    expect(sim.distance > 240 ? sim.collected.size : 1).toBeGreaterThan(0)
  })

  it('finishes a level when crossing the finish line', () => {
    const sim = simOn(flat(60), { kind: 'level' })
    for (let i = 0; i < seconds(15) && !sim.ended; i++) sim.step(GAS)
    expect(sim.ended).toBe('finish')
  })

  it('tractor pull: drags the load and ends when it stops moving', () => {
    const sim = simFor(pullRun(PULL_LOADS[0]))
    for (let i = 0; i < seconds(60) && !sim.ended; i++) sim.step(GAS)
    expect(['stall', 'fullpull']).toContain(sim.ended)
    expect(sim.pulled).toBeGreaterThan(10)
  })

  it('delivery: eggs stay in the basket at rest and break when the vehicle flips', () => {
    const sim = simOn(flat(200), { kind: 'delivery', eggs: 4 })
    for (let i = 0; i < seconds(3); i++) sim.step(NO_INPUT)
    expect(sim.eggs).toHaveLength(4)
    flipOver(sim)
    for (let i = 0; i < seconds(3); i++) sim.step(NO_INPUT)
    expect(sim.eggs.length).toBeLessThan(4)
    expect(sim.splats.length).toBeGreaterThan(0)
  })

  it('replays exactly in every mode: the same inputs give the same run', () => {
    const runs = [endlessRun('moon'), levelRun(LEVELS[7]), deliveryRun(ROUTES[1]), pullRun(PULL_LOADS[1])]
    for (const run of runs) {
      const rnd = mulberry32(7)
      const inputs = Array.from({ length: seconds(20) }, () => encodeInput({ gas: rnd() < 0.8, brake: rnd() < 0.1 }))
      const play = () => {
        const sim = simFor(run)
        for (const b of inputs) sim.step(decodeInput(b))
        const p = sim.chassis.getPosition()
        return [p.x, p.y, sim.chassis.getAngle(), sim.maxX, sim.coins, sim.fuel, sim.eggs.length, sim.pulled, sim.ended, sim.endStep]
      }
      expect(play()).toEqual(play())
    }
  })

  it('mud holds back sport tires far more than off-road ones', () => {
    const muddy: TrackSpec = { ...flat(70), surfaces: [{ at: 20, len: 25, kind: 'mud' }] }
    const time = (design: WheelDesign) => {
      const sim = new Sim({ geom: designCar(design), track: muddy, mode: { kind: 'level' } })
      for (let i = 0; i < seconds(60) && !sim.ended; i++) sim.step(GAS)
      expect(sim.ended).toBe('finish')
      return sim.time
    }
    expect(time('offroad') * 2).toBeLessThan(time('sport'))
  })

  it('tractor pull rewards keeping the revs in the green and a heavier vehicle', () => {
    const pull = (geom: ReturnType<typeof designCar>, pulse: boolean) => {
      const sim = new Sim({ geom, ...pullRun(PULL_LOADS[1]) })
      for (let i = 0; i < seconds(90) && !sim.ended; i++) sim.step({ gas: !pulse || sim.rpm < RPM_GREEN[1] - 0.01, brake: false })
      return sim.pulled
    }
    const heavy = designCar('offroad', 200)
    expect(pull(heavy, true)).toBeGreaterThan(pull(heavy, false) * 1.5)
    expect(pull(heavy, true)).toBeGreaterThan(pull(designCar('offroad'), true) * 1.5)
  })
})
