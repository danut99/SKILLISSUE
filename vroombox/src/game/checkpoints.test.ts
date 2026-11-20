import { describe, expect, it } from 'vitest'
import { DT, START_X } from './config.ts'
import { buildGeom } from './geom.ts'
import { ACTIVE_LEVELS, levelRun } from './modes.ts'
import { Sim } from './sim.ts'
import { Track } from './track.ts'
const geom = buildGeom({ width: 320, height: 120,
 outline: [{x:0,y:0},{x:320,y:0},{x:320,y:120},{x:0,y:120}],
 wheels: [{x:60,y:115,r:70,design:'offroad'},{x:260,y:115,r:70,design:'offroad'}] })
describe('level checkpoints', () => {
 for(const level of ACTIVE_LEVELS) {
  it(`keeps ${level.map} checkpoint approaches clear and spawns safely`,()=>{
   const run=levelRun(level), track=new Track(run.track)
   expect(run.track.checkpoints).toEqual(Array.from({length:Math.ceil(level.length/100)-1},(_,i)=>(i+1)*100))
   const segments=[...track.segmentsIn(0,level.length)]
   for(const distance of run.track.checkpoints!) {
    const x=START_X+distance
    expect(segments.flatMap(s=>s.features).every(f=>f.x+f.len<x-5||f.x>x+5)).toBe(true)
    expect(segments.flatMap(s=>[...s.rocks,...s.logs]).every(r=>Math.abs(r.x-x)>5)).toBe(true)
    const sim=new Sim({geom,track:run.track,mode:run.mode,startDistance:distance})
    expect(sim.distance).toBeCloseTo(distance)
    for(let n=0;n<.5/DT;n++) sim.step({gas:false,brake:false})
    expect(sim.ended).toBeNull()
    expect(Number.isFinite(sim.chassis.getPosition().y)).toBe(true)
   }
  })
 }
})

