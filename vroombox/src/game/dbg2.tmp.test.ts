import { it } from 'vitest'
import { DT } from './config.ts'
import { buildGeom } from './geom.ts'
import { LEVELS, levelRun } from './modes.ts'
import { Sim, type Input } from './sim.ts'
const geom = buildGeom({ width: 320, height: 120, outline: [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 320, y: 120 }, { x: 0, y: 120 }], wheels: [{ x: 60, y: 115, r: 40 }, { x: 260, y: 115, r: 40 }] })
const careful = (sim: Sim): Input => { const a = sim.chassis.getAngle(); if (sim.airborne) return a > 0.35 ? { gas: false, brake: true } : { gas: true, brake: false }; return { gas: a < 1.0, brake: false } }
it('jumps', () => {
  const out: string[] = []
  for (const l of LEVELS.filter((x) => x.goal.kind === 'flips')) {
    const sim = new Sim({ geom, ...levelRun(l) })
    let air = 0, t0x = 0, vx = 0, vy = 0
    const jumps: string[] = []
    for (let i = 0; i < 150 / DT && !sim.ended; i++) {
      const was = sim.airborne
      if (!was) { const v = sim.chassis.getLinearVelocity(); vx = v.x; vy = v.y; t0x = sim.chassis.getPosition().x }
      sim.step(careful(sim))
      if (sim.airborne) air += DT
      else if (air > 0) { if (air > 0.6) jumps.push(`@${t0x.toFixed(0)} air=${air.toFixed(2)} v=(${vx.toFixed(1)},${vy.toFixed(1)})`); air = 0 }
    }
    out.push(`L${l.id} ${sim.ended}: ${jumps.join(' | ')}`)
  }
  throw new Error(out.join('\n'))
})
