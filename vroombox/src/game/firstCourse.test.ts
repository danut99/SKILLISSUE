import {describe,expect,it} from 'vitest'
import {ACTIVE_LEVELS,levelRun} from './modes.ts'
import {Sim} from './sim.ts'
import {Track} from './track.ts'
import {buildGeom} from './geom.ts'
import {DT} from './config.ts'
const run=levelRun(ACTIVE_LEVELS[0])
const car=(radius:number,design:'classic'|'offroad'|'sport')=>buildGeom({width:320,height:120,outline:[{x:0,y:0},{x:320,y:0},{x:320,y:120},{x:0,y:120}],wheels:[{x:60,y:115,r:radius,design},{x:260,y:115,r:radius,design}]})
describe('first course pacing',()=>{
 for(const startDistance of [0,200,400])it(`tractor can collect the star after ${startDistance}m without upgrades`,()=>{
  const geom=buildGeom({width:340,height:232,outline:[{x:12,y:22},{x:142,y:22},{x:142,y:122},{x:262,y:122},{x:262,y:62},{x:276,y:62},{x:276,y:122},{x:322,y:122},{x:322,y:208},{x:12,y:208}],wheels:[{x:80,y:200,r:70,design:'offroad'},{x:282,y:226,r:44,design:'offroad'}]})
  const sim=new Sim({geom,...run,startDistance})
  for(let n=0;n<15/DT&&!sim.ended&&sim.distance<startDistance+55;n++){
   const a=sim.chassis.getAngle();sim.step(sim.airborne?{gas:a<-.25,brake:a>.25}:{gas:a<1,brake:false})
  }
  expect(sim.stars).toBe(1)
 })
 it('still requires momentum for the introductory jump',()=>{
  const jump=(cap:number)=>{
   const sim=new Sim({geom:car(40,'classic'),...run,startDistance:300})
   for(let n=0;n<25/DT&&!sim.ended&&sim.distance<348;n++){
    const x=sim.chassis.getPosition().x
    if(x>=308&&x<=320)for(const body of [sim.chassis,...sim.wheels]){const v=body.getLinearVelocity();if(v.x>cap)body.setLinearVelocity({x:cap,y:v.y})}
    const a=sim.chassis.getAngle();sim.step(sim.airborne?{gas:a<-.25,brake:a>.25}:{gas:true,brake:false})
   }
   return sim.distance
  }
  expect(jump(14)).toBeGreaterThan(344)
  expect(jump(4)).toBeLessThan(335)
 })
 it('includes all non-winter challenges with a gentler first mud patch and protected landing',()=>{
  const track=new Track(run.track),segments=[...track.segmentsIn(0,480)]
  expect(new Set(segments.flatMap(s=>s.features).map(f=>f.kind))).toEqual(new Set(['ramp','mud','bump','bridge','mesa','gap','pothole','pit']))
  expect(segments.some(s=>s.logs.some(l=>l.crossing))).toBe(true)
  expect(segments.some(s=>s.rocks.some(r=>(r.lift??0)>0))).toBe(true)
  const mud=segments.flatMap(s=>s.features).filter(f=>f.kind==='mud')
  expect(mud[0].h).toBeLessThan(mud[1].h)
  expect(track.segment(3).features.find(f=>f.kind==='gap')?.gapWidth).toBe(8)
  expect(track.segment(3).rocks).toHaveLength(0)
 })
 for(const [radius,design] of [[40,'classic'],[55,'classic'],[55,'offroad'],[55,'sport']] as const)it(`can finish on ${radius}px ${design} wheels without upgrades or edits`,()=>{
  const sim=new Sim({geom:car(radius,design),...run})
  for(let n=0;n<100/DT&&!sim.ended;n++){const a=sim.chassis.getAngle();sim.step(sim.airborne?{gas:a<-.25,brake:a>.25}:{gas:a<1,brake:false})}
  expect(sim.ended).toBe('finish')
  if(radius===40){expect(sim.stars).toBe(3);expect(sim.time).toBeLessThanOrEqual(ACTIVE_LEVELS[0].par)}
 })
})

