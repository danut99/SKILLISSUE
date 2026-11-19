import {describe,expect,it} from 'vitest'
import {buildGeom} from './geom.ts'
import {Sim} from './sim.ts'
import {DT} from './config.ts'
import {ACTIVE_LEVELS,levelRun} from './modes.ts'
import {Track} from './track.ts'
import {vehicleStats} from './traits.ts'
const shape=(radius:number)=>({width:320,height:120,outline:[{x:0,y:0},{x:320,y:0},{x:320,y:120},{x:0,y:120}],wheels:[{x:60,y:115,r:radius},{x:260,y:115,r:radius}]})
function drive(radius:number,cap=Infinity,gap=false){
 const geom=buildGeom(shape(radius))
 const sim=new Sim({geom,track:{map:'farm',seed:1,flat:true,finish:190,difficulty:0,growth:null,fuelEvery:null,coins:false},mode:{kind:'level'}})
 if(gap)sim.track.segment(1).features.push({kind:'gap',x:140,len:32,h:5.5})
 sim.fuel=Infinity
 let speed=0
 for(let n=0;n<60/DT&&!sim.ended;n++){
  const x=sim.chassis.getPosition().x
  if(x>130&&x<148)for(const body of [sim.chassis,...sim.wheels]){const v=body.getLinearVelocity();if(v.x>cap)body.setLinearVelocity({x:cap,y:v.y})}
  if(x>100&&x<105)speed=sim.chassis.getLinearVelocity().x
  const a=sim.chassis.getAngle()
  sim.step(sim.airborne?{gas:a<-.25,brake:a>.25}:{gas:true,brake:false})
 }
 return {sim,speed}
}
describe('speed, wheel size and long jumps',()=>{
 it('requires momentum to cross the same gap with the same vehicle',()=>{
  expect(drive(45,14,true).sim.ended).toBe('finish')
  const slow=drive(45,5,true).sim
  expect(slow.ended).not.toBe('finish')
  expect(slow.distance).toBeLessThan(160)
 })
 it('trades larger-wheel clearance for lower real speed and matching editor stats',()=>{
  expect(drive(90).speed).toBeLessThan(drive(45).speed*.8)
  expect(drive(45, Infinity, true).sim.ended).toBe('finish')
  const small=buildGeom(shape(45)),large=buildGeom(shape(90))
  expect(vehicleStats(large.area,large.wheels).speed).toBeLessThan(vehicleStats(small.area,small.wheels).speed)
 })
 it('checks fast and oversized builds at the summer jump',()=>{
  const level = ACTIVE_LEVELS.find(l => l.map === 'desert')!
  const crossing=(radius:number,design:'sport'|'offroad')=>{
   const base=shape(radius);const geom=buildGeom({...base,wheels:base.wheels.map(w=>({...w,design}))})
   const sim=new Sim({geom,...levelRun(level),startDistance:300});sim.fuel=Infinity
   for(let n=0;n<30/DT&&!sim.ended&&sim.distance<345;n++){
    const a=sim.chassis.getAngle();sim.step(sim.airborne?{gas:a<-.25,brake:a>.25}:{gas:true,brake:false})
   }
   return sim
  }
  expect(crossing(45,'sport').distance).toBeGreaterThan(344)
  expect(crossing(90,'offroad').distance).toBeLessThan(340)
 })
 it('reserves a runway and landing for the summer jump and keeps it out of the other courses',()=>{
  for(const level of ACTIVE_LEVELS){
   const track=new Track(levelRun(level).track)
   const segments=[...track.segmentsIn(300,360)]
   const gap=segments.flatMap(s=>s.features).find(f=>f.kind==='gap')!
   if(level.map === 'farm') {
     expect(gap.gapWidth).toBe(8)
     continue
   }
   if(level.map !== 'desert') {
     expect(gap).toBeUndefined()
     continue
   }
   expect(gap).toBeDefined()
   expect(gap.len*(.64-.25)).toBeGreaterThan(7)
   expect(track.height(gap.x+gap.len*.4)).toBeLessThan(track.base(gap.x)-5)
   expect(segments.flatMap(s=>[...s.rocks,...s.logs]).every(r=>r.x<gap.x-5||r.x>gap.x+gap.len+12)).toBe(true)
  }
 })
})



