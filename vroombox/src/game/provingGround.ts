import type { Segment } from './track.ts'
/** Identical test sections for current and preview setups; no random hazards or payouts. */
export function provingGroundSegment(i:number):Segment {
 const inside=(x:number)=>Math.floor(x/100)===i
 return {
  features:[{kind:'bump' as const,x:38,len:14,h:1.4},{kind:'mud' as const,x:65,len:13,h:.4},{kind:'gap' as const,x:138,len:32,h:4,gapWidth:6}].filter(f=>inside(f.x)),
  rocks:[{x:26,r:.14},{x:28,r:.24},{x:30,r:.18}].filter(r=>inside(r.x)),logs:[],pickups:[],
 }
}
