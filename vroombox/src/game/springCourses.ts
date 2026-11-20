import { rockShelf, timberPile } from './obstacles.ts'
import type { Feature, Gadget, Pickup, Rock, Segment } from './track.ts'

/** The three hand-built Spring levels, easy to hard. Every one rewards control over a held gas pedal. */
export type CourseId = 'spring1' | 'spring2' | 'spring3'

/** What each stretch asks of the driver; drives the on-screen hint, shown a little before `from`. */
export type SpringSkill = 'air' | 'ramp' | 'crawl' | 'crest' | 'bridge' | 'mud' | 'jump' | 'rhythm' | 'seesaw' | 'drawbridge' | 'barrels'
export type Section = { from: number; to: number; skill: SpringSkill }
/** A star `above` the ground at `ref` (usually the takeoff point). */
export type StarSpot = { x: number; ref: number; above: number }

export type Course = {
  id: CourseId
  /** 1 = easy, 2 = medium, 3 = hard. */
  tier: 1 | 2 | 3
  length: number
  /** Time star (seconds). */
  par: number
  base(x: number): number
  segment(i: number): Segment
  sections: Section[]
  stars: StarSpot[]
  /** Target speeds (m/s) a careful driver holds; used by the tuning tests. */
  pace(x: number): number
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Gentle waves so the car is always pitching; softer in the first 100 m and flat around set pieces (`calm`). */
function rolling(x: number, calm: [number, number][]): number {
  let strength = smooth(26, 46, x) * (0.6 + 0.4 * smooth(90, 110, x))
  for (const [a, b] of calm) strength *= 1 - (smooth(a - 6, a, x) - smooth(b, b + 6, x))
  return strength * (0.6 * Math.sin((2 * Math.PI * (x - 26)) / 34) + 0.3 * Math.sin((2 * Math.PI * (x - 26)) / 14.5 + 1.3))
}

type CourseDef = Omit<Course, 'base' | 'segment' | 'pace'> & {
  calm: [number, number][]
  hills(x: number): number
  features: Feature[]
  gadgets: Gadget[]
  rocks: Rock[]
  logs: Rock[]
  fuel: number[]
  paceSteps: [number, number][]
}

function course(def: CourseDef): Course {
  const base = (x: number) => rolling(x, def.calm) + def.hills(x)
  return {
    id: def.id,
    tier: def.tier,
    length: def.length,
    par: def.par,
    sections: def.sections,
    stars: def.stars,
    base,
    segment(i) {
      const belongs = (x: number) => Math.floor(x / 100) === i
      const pickups: Pickup[] = [
        ...def.stars.map((s, j) => ({ id: 900 + j, kind: 'star' as const, x: s.x, y: base(s.ref) + s.above })),
        ...def.fuel.map((x, j) => ({ id: 950 + j, kind: 'fuel' as const, x, y: base(x) + 0.75 })),
      ]
      return {
        features: def.features.filter((f) => belongs(f.x)),
        rocks: def.rocks.filter((r) => belongs(r.x)),
        logs: def.logs.filter((l) => belongs(l.x)),
        pickups: pickups.filter((p) => belongs(p.x)),
        gadgets: def.gadgets.filter((g) => belongs(g.x)),
      }
    },
    pace(x) {
      let v = def.paceSteps[0][1]
      for (const [from, speed] of def.paceSteps) if (x >= from) v = speed
      return v
    },
  }
}

/** Easy: learn the pedals, a first built ramp, the crest and the falling creek bridge. */
const spring1 = course({
  id: 'spring1', tier: 1, length: 300, par: 46,
  calm: [[42, 62], [154, 180], [222, 250], [272, 300]],
  hills: (x) => 4.2 * (smooth(108, 124, x) - smooth(132, 142, x)),
  features: [
    { kind: 'bump', x: 30, len: 6, h: 0.4 },
    { kind: 'pothole', x: 64, len: 3.5, h: 0.3 },
    { kind: 'mud', x: 68, len: 8, h: 0.2 },
    { kind: 'bridge', x: 160, len: 14, h: 3.2, landmark: 'spring-creek', collapse: true },
    { kind: 'bump', x: 178, len: 5, h: 0.45 },
    { kind: 'pothole', x: 234, len: 6, h: 0.8 },
    { kind: 'mud', x: 254, len: 8, h: 0.3 },
  ],
  gadgets: [
    { kind: 'kicker', x: 46, len: 4, h: 0.8 },
    { kind: 'kicker', x: 126, len: 4, h: 0.9 },
    { kind: 'kicker', x: 227, len: 6, h: 2 },
    { kind: 'kicker', x: 280, len: 4, h: 1 },
  ],
  rocks: [...rockShelf(80, 0.35), ...rockShelf(89, 0.5), ...rockShelf(210, 0.5)],
  logs: [...timberPile(190, 0.8)],
  fuel: [120, 240],
  stars: [
    { x: 54, ref: 46, above: 2.6 },
    { x: 237, ref: 227, above: 4.2 },
    { x: 288, ref: 280, above: 2.8 },
  ],
  sections: [
    { from: 40, to: 56, skill: 'ramp' },
    { from: 76, to: 93, skill: 'crawl' },
    { from: 118, to: 150, skill: 'crest' },
    { from: 152, to: 176, skill: 'bridge' },
    { from: 182, to: 193, skill: 'crawl' },
    { from: 205, to: 214, skill: 'crawl' },
    { from: 220, to: 244, skill: 'ramp' },
    { from: 250, to: 262, skill: 'mud' },
    { from: 272, to: 292, skill: 'ramp' },
  ],
  paceSteps: [
    [0, 9], [40, 8], [56, 7], [62, 6], [76, 3.5], [93, 8], [118, 6], [126, 3], [146, 9.5],
    [178, 6], [186, 3], [196, 7], [204, 3], [216, 8.5], [246, 6], [264, 8],
  ],
})

/** Medium: bigger stones and logs than the easy level, a seesaw, deep mud, a pit, a ramp over a deep ditch, the big gap, the drawbridge and tall whoops. */
const spring2 = course({
  id: 'spring2', tier: 2, length: 350, par: 61,
  calm: [[56, 80], [108, 130], [154, 182], [204, 250], [258, 284], [320, 350]],
  hills: () => 0,
  features: [
    { kind: 'bump', x: 28, len: 3.5, h: 0.5 },
    { kind: 'bump', x: 32, len: 3.5, h: 0.6 },
    { kind: 'mud', x: 112, len: 16, h: 0.55 },
    { kind: 'pit', x: 143, len: 7, h: 0.8 },
    { kind: 'pothole', x: 167, len: 6, h: 1.1 },
    { kind: 'gap', x: 214, len: 32, h: 4.5, gapWidth: 8, lip: 3 },
    { kind: 'bump', x: 252, len: 4, h: 0.5 },
    { kind: 'bridge', x: 266, len: 12, h: 3.2, drawbridge: true },
    { kind: 'bump', x: 306, len: 3.5, h: 0.55 },
    { kind: 'bump', x: 310, len: 3.5, h: 0.6 },
    { kind: 'bump', x: 314, len: 3.5, h: 0.65 },
  ],
  gadgets: [
    { kind: 'seesaw', x: 68, len: 8 },
    { kind: 'kicker', x: 160, len: 6, h: 1.6 },
    { kind: 'drawbridge', x: 266, len: 12 },
    { kind: 'kicker', x: 326, len: 6, h: 1.5 },
  ],
  rocks: [...rockShelf(45, 0.7), ...rockShelf(188, 0.7), ...rockShelf(291, 0.6)],
  logs: [...timberPile(91, 0.7), ...timberPile(138, 0.7)],
  fuel: [100, 200, 300],
  stars: [
    { x: 170, ref: 160, above: 3.4 },
    { x: 226, ref: 214, above: 4.4 },
    { x: 335, ref: 326, above: 3.4 },
  ],
  sections: [
    { from: 40, to: 48, skill: 'crawl' },
    { from: 58, to: 76, skill: 'seesaw' },
    { from: 84, to: 93, skill: 'crawl' },
    { from: 108, to: 128, skill: 'mud' },
    { from: 132, to: 150, skill: 'crawl' },
    { from: 152, to: 176, skill: 'ramp' },
    { from: 180, to: 190, skill: 'crawl' },
    { from: 200, to: 241, skill: 'jump' },
    { from: 256, to: 282, skill: 'drawbridge' },
    { from: 284, to: 293, skill: 'crawl' },
    { from: 300, to: 318, skill: 'rhythm' },
    { from: 320, to: 340, skill: 'ramp' },
  ],
  paceSteps: [
    [0, 9], [38, 4], [50, 6], [58, 3], [80, 6], [84, 3], [95, 7], [108, 6], [130, 3], [150, 8.5],
    [178, 7], [183, 3], [191, 9], [200, 11], [241, 7], [256, 6], [284, 3], [294, 7], [300, 5], [320, 8.5], [340, 6],
  ],
})

/** Hard: big stones and logs, tall whoops, a deep ditch jump, a seesaw, the big star ramp, a second crest and bridge, a pit, deep mud and the barrel climb. Needs big wheels. */
const spring3 = course({
  id: 'spring3', tier: 3, length: 400, par: 80,
  calm: [[72, 94], [104, 122], [134, 166], [240, 264], [274, 292], [356, 376]],
  hills: (x) => 3.5 * (smooth(204, 220, x) - smooth(226, 236, x)) + 4 * (smooth(334, 352, x) - smooth(376, 388, x)),
  features: [
    { kind: 'bump', x: 48, len: 3.5, h: 0.55 },
    { kind: 'bump', x: 52, len: 3.5, h: 0.65 },
    { kind: 'bump', x: 56, len: 3.5, h: 0.75 },
    { kind: 'mud', x: 63, len: 9, h: 0.5 },
    { kind: 'pothole', x: 85, len: 7, h: 1.2 },
    { kind: 'bridge', x: 244, len: 14, h: 3.2, collapse: true },
    { kind: 'pit', x: 265, len: 8, h: 1 },
    { kind: 'mud', x: 276, len: 16, h: 0.6 },
    { kind: 'bump', x: 391, len: 3.5, h: 0.4 },
  ],
  gadgets: [
    { kind: 'kicker', x: 78, len: 6, h: 1.9 },
    { kind: 'seesaw', x: 113, len: 8 },
    { kind: 'kicker', x: 140, len: 7, h: 2.5 },
    { kind: 'kicker', x: 220, len: 4, h: 1 },
    { kind: 'barrels', x: 362, every: 4.5 },
    { kind: 'kicker', x: 366, len: 6, h: 1.2 },
  ],
  rocks: [
    ...rockShelf(40, 0.85), ...rockShelf(128, 0.9), ...rockShelf(184, 1),
    ...rockShelf(307, 0.9),
  ],
  logs: [...timberPile(171, 0.8), ...timberPile(318, 0.85)],
  fuel: [100, 200, 300],
  stars: [
    { x: 88, ref: 78, above: 4 },
    { x: 150, ref: 140, above: 4.6 },
    { x: 374, ref: 366, above: 2.8 },
  ],
  sections: [
    { from: 34, to: 43, skill: 'crawl' },
    { from: 44, to: 60, skill: 'rhythm' },
    { from: 61, to: 72, skill: 'mud' },
    { from: 72, to: 92, skill: 'ramp' },
    { from: 104, to: 120, skill: 'seesaw' },
    { from: 122, to: 131, skill: 'crawl' },
    { from: 132, to: 160, skill: 'ramp' },
    { from: 164, to: 188, skill: 'crawl' },
    { from: 214, to: 240, skill: 'crest' },
    { from: 241, to: 260, skill: 'bridge' },
    { from: 272, to: 290, skill: 'mud' },
    { from: 303, to: 322, skill: 'crawl' },
    { from: 322, to: 356, skill: 'barrels' },
    { from: 360, to: 386, skill: 'ramp' },
  ],
  paceSteps: [
    [0, 9], [34, 3], [44, 4], [60, 6], [72, 8.5], [95, 6], [104, 3], [122, 3], [132, 9], [160, 6], [164, 3],
    [190, 7], [212, 5], [220, 3], [236, 9.5], [262, 4], [274, 6], [292, 6], [303, 3], [324, 6], [356, 9], [386, 6],
  ],
})

export const COURSES: Record<CourseId, Course> = { spring1, spring2, spring3 }
export const SPRING_COURSES: Course[] = [spring1, spring2, spring3]
