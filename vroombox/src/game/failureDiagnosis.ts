import type { Sim } from './sim.ts'
export type FailureDiagnosis = 'hit-bank'|'fell-gap'|'belly-ground'|'wheelspin'|null
/** Diagnose observed geometry/contacts, rather than assuming proximity means a collision. */
export function failureDiagnosis(sim:Sim):FailureDiagnosis {
 if(!sim.ended||sim.ended==='finish'||sim.ended==='fuel'||sim.ended==='bogged') return null
 const p=sim.chassis.getPosition(),speed=sim.chassis.getLinearVelocity().length()
 if(sim.gapImpact && p.x<sim.gapImpact.farX+2 && p.y<sim.gapImpact.height+.5) return 'hit-bank'
 for(const segment of sim.track.segmentsIn(p.x-35,p.x+3))for(const f of segment.features){
  if(f.kind!=='gap')continue
  const far=f.x+f.len*(f.gapWidth===undefined?.64:.25+f.gapWidth/f.len)
  if(p.x>f.x+f.len*.25&&p.x<far&&p.y<sim.track.base(f.x)-1.2)return 'fell-gap'
 }
 if(sim.ended==='roof'||sim.ended==='flip')return null
 if(sim.chassisGrounded && sim.groundedWheelCount<sim.wheels.length && speed<.7)return 'belly-ground'
 const rim=sim.wheels.reduce((sum,w,i)=>sum+Math.abs(w.getAngularVelocity())*sim.geom.wheels[i].r,0)/Math.max(1,sim.wheels.length)
 if(sim.groundedWheelCount>0&&speed<.7&&rim>2)return 'wheelspin'
 return null
}
