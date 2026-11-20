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

  it('refuels on the endless track without economy pickups', () => {
    const sim = simOn({ ...flat(null), fuelEvery: 25 })
    let refills = 0
    for (let i = 0; i < seconds(60) && !sim.ended; i++) {
      const angle = Math.atan2(Math.sin(sim.chassis.getAngle()), Math.cos(sim.chassis.getAngle()))
      const input = sim.airborne ? { gas: angle < -0.25, brake: angle > 0.25 } : { gas: angle < 1, brake: false }
      if (sim.step(input).fuel) refills++
    }
    expect(sim.coins).toBe(0)
    expect(refills).toBeGreaterThan(0)
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

  it('spinning tires dig into mud: flooring sport tires bogs them, pulsing the gas or off-road tires get through', () => {
    const muddy: TrackSpec = { ...flat(70), surfaces: [{ at: 20, len: 25, kind: 'mud' }] }
    const cross = (design: WheelDesign, pulse: boolean) => {
      const sim = new Sim({ geom: designCar(design), track: muddy, mode: { kind: 'level' } })
      sim.fuel = 1000
      for (let i = 0; i < seconds(60) && !sim.ended; i++) sim.step({ gas: !pulse || sim.mudWheels === 0 || i % 48 < 27, brake: false })
      return sim
    }
    expect(cross('sport', false).ended).toBe('bogged')
    expect(cross('sport', true).ended).toBe('finish')
    expect(cross('offroad', false).ended).toBe('finish')
    expect(cross('offroad', false).dig.every((d) => d === 0)).toBe(true)
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


describe('air controls', () => {
  const airborneCar = () => {
    const sim = simOn(flat(null))
    for (const body of [sim.chassis, ...sim.wheels]) {
      const position = body.getPosition()
      body.setTransform({ x: position.x, y: position.y + 100 }, body.getAngle())
    }
    return sim
  }
  for (const input of [GAS, { gas: false, brake: true }]) {
    it(`${input.gas ? 'gas spins the nose up' : 'brake spins the nose down'} and the spin carries on after release`, () => {
      const sim = airborneCar()
      const dir = input.gas ? 1 : -1
      for (let i = 0; i < seconds(0.5); i++) sim.step(input)
      const tilted = sim.chassis.getAngle() * dir
      expect(tilted).toBeGreaterThan(0.3)
      expect(tilted).toBeLessThan(1)
      for (let i = 0; i < seconds(0.3); i++) sim.step(NO_INPUT)
      expect(sim.chassis.getAngle() * dir).toBeGreaterThan(tilted + 0.2)
    })
  }
  it('flips a car whose driver holds the gas through a long jump', () => {
    const sim = airborneCar()
    for (let i = 0; i < seconds(1.3); i++) sim.step(GAS)
    expect(Math.abs(sim.chassis.getAngle())).toBeGreaterThan(2)
  })
  it('makes a short tap a small correction', () => {
    const sim = airborneCar()
    for (let i = 0; i < seconds(0.1); i++) sim.step(GAS)
    expect(Math.abs(sim.chassis.getAngle())).toBeLessThan(0.1)
  })
})


describe('soft terrain depth', () => {
  it('makes deeper mud slower for the same vehicle and tire design', () => {
    const cross = (depth: number) => {
      const track: TrackSpec = { ...flat(70), surfaces: [{ at: 20, len: 25, kind: 'mud', depth }] }
      const sim = new Sim({ geom: designCar('cookie'), track, mode: { kind: 'level' } })
      sim.fuel = 1000
      for (let i = 0; i < seconds(90) && !sim.ended; i++) sim.step({ gas: sim.mudWheels === 0 || i % 48 < 27, brake: false })
      return sim
    }
    const shallow = cross(0.1), medium = cross(0.4), deep = cross(0.7)
    expect(shallow.ended).toBe('finish')
    expect(medium.ended).toBe('finish')
    expect(deep.ended).toBe('finish')
    expect(medium.time).toBeGreaterThan(shallow.time * 1.2)
    expect(deep.time).toBeGreaterThan(medium.time * 1.2)
  })
})

describe('restarting in mud', () => {
  const patch = (depth: number, startDistance: number, kind: 'mud' | 'snow' = 'mud') => new Sim({
    geom: designCar('offroad'), mode: { kind: 'level' }, startDistance,
    track: { ...flat(42), surfaces: [{ at: 14, len: 12, kind, depth }] },
  })

  it('bogs down a car that floors it from a standstill in deep mud, but never ends a run while rocking', () => {
    const stuck = (rock: boolean) => {
      const sim = new Sim({ geom: designCar('classic'), mode: { kind: 'level' }, startDistance: 20, track: { ...flat(42), surfaces: [{ at: 14, len: 12, kind: 'mud', depth: 0.95 }] } })
      for (let n = 0; n < seconds(0.6); n++) sim.step(NO_INPUT)
      for (let n = 0; n < seconds(12) && !sim.ended; n++) sim.step(rock && n % 90 < 30 ? { gas: false, brake: true } : GAS)
      return sim
    }
    const floored = stuck(false)
    expect(floored.ended).toBe('bogged')
    expect(floored.dig.every((d) => d > 0.9)).toBe(true)
    expect(stuck(true).ended).not.toBe('bogged')
  })

  it('can cross that patch with momentum and restart at a shallow edge or in snow', () => {
    for (const sim of [patch(0.95, 0), patch(0.95, 14), patch(0.25, 20), patch(0.95, 20, 'snow')]) {
      for (let n = 0; n < seconds(20) && !sim.ended; n++) sim.step(GAS)
      expect(sim.ended).toBe('finish')
    }
  })
})

 describe('unpowered mud resistance', () => {
  it('absorbs coasting momentum rather than letting a car roll freely out', () => {
    const coast = (mud: boolean) => {
      const sim = simOn({ ...flat(null), surfaces: mud ? [{ at: -10, len: 100, kind: 'mud', depth: .9 }] : [] })
      for (let i = 0; i < seconds(.8); i++) sim.step(NO_INPUT)
      const start = sim.chassis.getPosition().x
      for (const body of [sim.chassis, ...sim.wheels]) body.setLinearVelocity({ x: 4, y: 0 })
      for (let i = 0; i < seconds(1.5); i++) sim.step(NO_INPUT)
      expect(Number.isFinite(sim.chassis.getPosition().x)).toBe(true)
      return sim.chassis.getPosition().x - start
    }
    expect(coast(true)).toBeLessThan(coast(false) * .45)
  })
 })

 describe('mud on an incline', () => {
  it('holds an unpowered car inside a muddy downhill section', () => {
    const sim = simOn({ ...flat(null), flat: false, difficulty: .25, surfaces: [{ at: 50, len: 100, kind: 'mud', depth: 1 }] })
    let x = 75, steepest = 0
    for (let at = 75; at < 110; at += .5) {
      const slope = sim.track.height(at + .2) - sim.track.height(at - .2)
      if (slope < steepest) { steepest = slope; x = at }
    }
    expect(steepest).toBeLessThan(-.01)
    const dx = x - sim.chassis.getPosition().x
    const dy = Math.max(...sim.wheels.map((wheel, i) => {
      const p = wheel.getPosition()
      return sim.track.height(p.x + dx) + sim.geom.wheels[i].r - p.y
    }))
    for (const body of [sim.chassis, ...sim.wheels]) {
      const p = body.getPosition()
      body.setTransform({ x: p.x + dx, y: p.y + dy + .03 }, body.getAngle())
      body.setLinearVelocity({ x: 0, y: 0 })
    }
    for (let i = 0; i < seconds(3) && !sim.ended; i++) sim.step(NO_INPUT)
    expect(Math.abs(sim.chassis.getPosition().x - x)).toBeLessThan(2)
    expect(Math.abs(sim.chassis.getLinearVelocity().x)).toBeLessThan(.5)
  })
 })

