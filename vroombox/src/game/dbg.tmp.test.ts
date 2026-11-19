import { it } from 'vitest'
import { DT } from './config.ts'
import { buildGeom } from './geom.ts'
import { LEVELS, levelRun } from './modes.ts'
import { Sim, type Input } from './sim.ts'
import type { WheelDesign } from './wheelart.ts'
const car = (d: WheelDesign) => buildGeom({ width: 320, height: 120, outline: [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 320, y: 120 }, { x: 0, y: 120 }], wheels: [{ x: 60, y: 115, r: 40, design: d }, { x: 260, y: 115, r: 40, design: d }] })
const careful = (sim: Sim): Input => { const a = sim.chassis.getAngle(); if (sim.airborne) return a > 0.35 ? { gas: false, brake: true } : { gas: true, brake: false }; return { gas: a < 1.0, brake: false } }
it('flips', () => {
  const out: string[] = []
  for (const l of LEVELS.filter((x) => x.goal.kind === 'flips')) {
    const sim = new Sim({ geom: car('classic'), ...levelRun(l) })
    let start = 0, wasAir = false, go = false, air = 0
    for (let i = 0; i < 150 / DT && !sim.ended; i++) {
      const a = sim.chassis.getAngle()
      const v = sim.chassis.getLinearVelocity()
      if (sim.airborne && !wasAir) { start = a; air = 0; go = v.y > 3 && v.x > 7 }
      if (sim.airborne) air += DT
      wasAir = sim.airborne
      const rel = a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI
      const spun = a - start
      let inp: Input
      if (!sim.airborne) inp = { gas: rel < 1.0, brake: false }
      else if (go && spun < 2 * Math.PI - 0.5) inp = { gas: true, brake: false }
      else inp = rel > 0.3 ? { gas: false, brake: true } : rel < -0.3 ? { gas: true, brake: false } : { gas: false, brake: false }
      sim.step(inp)
    }
    out.push(`L${l.id} need ${(l.goal as { n: number }).n} flipper: flips=${sim.flips} ended=${sim.ended}@${sim.distance.toFixed(0)}`)
  }
  for (const l of [] as typeof LEVELS) {
    const row = [`L${l.id}`]
    for (const d of ['classic', 'sport', 'offroad', 'cookie'] as WheelDesign[]) {
      const sim = new Sim({ geom: car(d), ...levelRun(l) })
      for (let i = 0; i < 200 / DT && !sim.ended; i++) sim.step(careful(sim))
      row.push(`${d.slice(0, 2)}:${sim.ended === 'finish' ? sim.time.toFixed(0) + 's' : sim.ended + '@' + sim.distance.toFixed(0)}`)
    }
    out.push(row.join(' ') + ` par=${l.par}`)
  }
  throw new Error(out.join('\n'))
})
