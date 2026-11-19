import {describe,expect,it} from 'vitest'
import {Sim} from './sim.ts'
import {DT} from './config.ts'
import {buildGeom} from './geom.ts'
import {failureDiagnosis} from './failureDiagnosis.ts'
import {provingGroundRun} from './modes.ts'
import {NO_UPGRADES,effects} from './upgrades.ts'
import {upgradeComparison} from './upgradeComparison.ts'
const geom=()=>buildGeom({width:320,height:120,outline:[{x:0,y:0},{x:320,y:0},{x:320,y:120},{x:0,y:120}],wheels:[{x:60,y:115,r:40},{x:260,y:115,r:40}]})
const flat={map:'farm' as const,seed:1,flat:true,finish:190,difficulty:0,growth:null,fuelEvery:null,coins:false}
describe('observed failure feedback',()=>{
 it('records a physical strike against the far wall of a gap',()=>{
  const run=provingGroundRun(),sim=new Sim({geom:geom(),...run,startDistance:149})
  for(const body of [sim.chassis,...sim.wheels]) {
   const p=body.getPosition();body.setTransform({x:p.x,y:p.y+2.5},body.getAngle());body.setLinearVelocity({x:6,y:0})
  }
  for(let n=0;n<3/DT&&!sim.gapImpact&&!sim.ended;n++)sim.step({gas:true,brake:false})
  expect(sim.gapImpact).not.toBeNull()
  sim.ended='stuck'
  expect(failureDiagnosis(sim)).toBe('hit-bank')
 })
 it('identifies a chassis resting on terrain with unloaded wheels',()=>{
  const g=geom();g.wheels=g.wheels.map(w=>({...w,y:1}))
  const sim=new Sim({geom:g,track:flat,mode:{kind:'level'}})
  for(let n=0;n<15/DT&&!sim.ended;n++)sim.step({gas:true,brake:false})
  expect(sim.chassisGrounded).toBe(true)
  expect(sim.groundedWheelCount).toBe(0)
  expect(failureDiagnosis(sim)).toBe('belly-ground')
 })
 it('does not report a bank impact just because a vehicle is near a gap',()=>{
  const sim=new Sim({geom:geom(),track:flat,mode:{kind:'level'}})
  sim.track.segment(1).features.push({kind:'gap',x:140,len:32,h:5.5})
  for(let n=0;n<30/DT&&!sim.ended;n++){
   const x=sim.chassis.getPosition().x
   if(x>130&&x<148)for(const b of [sim.chassis,...sim.wheels]){const v=b.getLinearVelocity();if(v.x>4)b.setLinearVelocity({x:4,y:v.y})}
   const a=sim.chassis.getAngle();sim.step(sim.airborne?{gas:a<-.25,brake:a>.25}:{gas:true,brake:false})
  }
  expect(sim.ended).not.toBe('finish')
  expect(['fell-gap','hit-bank']).toContain(failureDiagnosis(sim))
  if(failureDiagnosis(sim)==='hit-bank')expect(sim.gapImpact).not.toBeNull()
 })
 it('only identifies wheelspin with grounded rotating wheels and little body motion',()=>{
  const sim=new Sim({geom:geom(),track:flat,mode:{kind:'level'}})
  for(let n=0;n<2/DT;n++)sim.step({gas:false,brake:false})
  sim.ended='stuck'
  expect(failureDiagnosis(sim)).toBeNull()
  sim.wheels.forEach(w=>w.setAngularVelocity(15))
  expect(failureDiagnosis(sim)).toBe('wheelspin')
 })
})
describe('test track and upgrade preview',()=>{
 it('uses real effect deltas without changing the stored setup',()=>{
  const current={...NO_UPGRADES},before=structuredClone(current)
  expect(upgradeComparison(current,'engine')).toEqual([{key:'force',before:100,after:108},{key:'speed',before:100,after:104}])
  expect(current).toEqual(before)
  expect(effects({...current,engine:1}).speed).toBe(1.04)
 })
 it('provides consistent short test sections including mud and a jump',()=>{
  const run=provingGroundRun(),a=new Sim({geom:geom(),...run}),b=new Sim({geom:geom(),...run})
  expect(run.testDrive).toBe(true)
  expect([...a.track.segmentsIn(0,190)]).toEqual([...b.track.segmentsIn(0,190)])
  expect(a.track.segment(0).features.some(f=>f.kind==='mud')).toBe(true)
  expect(a.track.segment(1).features.some(f=>f.kind==='gap')).toBe(true)
 })
})

