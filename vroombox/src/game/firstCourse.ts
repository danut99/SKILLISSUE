import { timberPile, rockShelf } from './obstacles.ts'
import type { Feature, Segment, TrackSpec } from './track.ts'

/** A paced introduction to every dry-land obstacle, with clear 100m checkpoint landings. */
export function firstCourseBase(x: number): number {
  const hill = (start: number, length: number, height: number) => x > start && x < start + length ? height * Math.sin(Math.PI * (x - start) / length) ** 2 : 0
  return hill(110, 45, 2.6) + hill(208, 45, .8) + hill(350, 44, 2.4)
}
export function firstCourseSegment(i: number, spec: TrackSpec): Segment {
  const features: Feature[] = [
    {kind:'ramp',x:24,len:8,h:1.35},
    {kind:'mud',x:62,len:12,h:.28},
    {kind:'bump',x:136,len:7,h:.45},
    {kind:'bridge',x:160,len:14,h:3.2,landmark:'spring-creek'},
    {kind:'ramp',x:224,len:8,h:1.45},
    {kind:'mud',x:263,len:8,h:.62},
    {kind:'mesa',x:282,len:10,h:.55},
    {kind:'gap',x:312,len:32,h:4.5,gapWidth:8},
    {kind:'pothole',x:365,len:6,h:.48},
    {kind:'pit',x:378,len:8,h:.55},
    {kind:'ramp',x:424,len:8,h:1.55},
  ]
  const rocks = [...rockShelf(85.5, 0.78), ...rockShelf(186, 1.40)]
  const logs = [...timberPile(113, 0.78), ...timberPile(119, 0.9), ...timberPile(413, 1)]
  const belongs = (x:number) => Math.floor(x/100)===i
  return {
    features: features.filter(f=>belongs(f.x)),
    rocks: rocks.filter(r=>belongs(r.x)),
    logs: logs.filter(l=>belongs(l.x)),
    pickups: [
      // Introductory stars must also be reachable by the stock tractor's smaller front wheel.
      ...(spec.stars??[]).map((x,j)=>({id:900+j,kind:'star' as const,x:x+3,y:firstCourseBase(x+3)+1.9})),
      ...[120,240,360].map((x,j)=>({id:950+j,kind:'fuel' as const,x,y:firstCourseBase(x)+.75})),
    ].filter(p=>belongs(p.x)),
  }
}
