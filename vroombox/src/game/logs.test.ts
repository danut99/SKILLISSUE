import {describe,expect,it} from 'vitest'
import {ACTIVE_LEVELS,levelRun} from './modes.ts'
import {Track} from './track.ts'
import {Sim} from './sim.ts'
import {buildGeom} from './geom.ts'
import {DT} from './config.ts'
describe('timber crossings',()=>{
 it('places and physically crosses the autumn timber section',()=>{
  const level = ACTIVE_LEVELS.find(l => l.map === 'moon')!
  const run=levelRun(level),track=new Track(run.track)
  const logs=track.segment(1).logs.filter(l=>l.crossing)
  expect(logs).toHaveLength(10)
  expect(logs.filter(l => l.lodged)).toHaveLength(6)
  expect(logs.filter(l => l.lift)).toHaveLength(2)
  expect(new Set(logs.map(l=>l.r)).size).toBeGreaterThan(4)
  expect(logs.every(l=>l.x>110&&l.x<125)).toBe(true)
  const geom=buildGeom({width:320,height:120,outline:[{x:0,y:0},{x:320,y:0},{x:320,y:120},{x:0,y:120}],wheels:[{x:60,y:115,r:65,design:'offroad'},{x:260,y:115,r:65,design:'offroad'}]})
  const sim=new Sim({geom,...run,startDistance:100});sim.fuel=Infinity
  const bodies=sim.props.filter(p=>p.kind==='log'&&p.body.getPosition().x>110&&p.body.getPosition().x<125)
  expect(bodies).toHaveLength(10)
  const initial=bodies.map(p=>p.body.getPosition().x)
  for(let n=0;n<20/DT&&!sim.ended&&sim.distance<135;n++){
   const a=sim.chassis.getAngle();sim.step(sim.airborne?{gas:a<-.25,brake:a>.25}:{gas:true,brake:false})
  }
  expect(sim.distance).toBeGreaterThan(125)
  expect(bodies.some((p,i)=>p.body.isDynamic() && Math.abs(p.body.getPosition().x-initial[i])>.05)).toBe(true)
  expect(bodies.every((p,i)=>p.body.isDynamic() || Math.abs(p.body.getPosition().x - initial[i]) < 0.0001)).toBe(true)
 })
})
