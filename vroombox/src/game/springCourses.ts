import { boulderRidge, logField, rockShelf, timberPile } from './obstacles.ts'
import type { Feature, Gadget, Pickup, Rock, Segment } from './track.ts'

/** The three hand-built Spring levels, easy to hard. Every one rewards control over a held gas pedal. */
export type CourseId = 'spring1' | 'spring2' | 'spring3' | 'spring4' | 'spring5'

/** What each stretch asks of the driver; drives the on-screen hint, shown a little before `from`. */
export type SpringSkill = 'air' | 'ramp' | 'crawl' | 'crest' | 'bridge' | 'mud' | 'jump' | 'rhythm' | 'seesaw' | 'drawbridge' | 'barrels' | 'logs' | 'boulders'
export type Section = { from: number; to: number; skill: SpringSkill }
/** A star `above` the ground at `ref` (usually the takeoff point). */
export type StarSpot = { x: number; ref: number; above: number }

export type Course = {
  id: CourseId
  /** 1 = easy .. 5 = extreme. */
  tier: 1 | 2 | 3 | 4 | 5
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
  id: 'spring3', tier: 3, length: 400, par: 77,
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
    { kind: 'barrels', x: 362, every: 6 },
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

/**
 * Very hard: a slow crawl. Tall boulder ridges with cracks and drops, a log field on a climb with logs that roll
 * back down, deep mud, a falling bridge, a big ditch ramp, a drawbridge and barrels. Little fuel. Needs big wheels.
 */
const spring4 = course({
  id: 'spring4', tier: 4, length: 400, par: 107,
  calm: [[28, 48], [50, 72], [76, 96], [106, 124], [150, 166], [210, 234], [236, 262], [264, 294], [300, 330], [332, 352]],
  // A climb carrying the log field up to a ledge at the 200 m checkpoint, then the final climb to the barrels.
  hills: (x) => 2.5 * (smooth(166, 188, x) - smooth(198, 212, x)) + 4 * smooth(360, 378, x),
  features: [
    { kind: 'mud', x: 128, len: 16, h: 0.6 },
    { kind: 'bridge', x: 218, len: 14, h: 3.2, collapse: true },
    { kind: 'pothole', x: 247, len: 7, h: 1.2 },
    { kind: 'bridge', x: 312, len: 12, h: 3.2, drawbridge: true },
  ],
  gadgets: [
    { kind: 'seesaw', x: 116, len: 8 },
    { kind: 'kicker', x: 191, len: 4, h: 1 },
    { kind: 'kicker', x: 239, len: 7, h: 2.4 },
    { kind: 'drawbridge', x: 312, len: 12 },
    { kind: 'barrels', x: 392, every: 4.5 },
  ],
  rocks: [
    ...boulderRidge(30, [0.4, 0.8, 1.2, 1, 1.4, 1.8, 1.4, 0.9, 0.5]),
    // Crack in the middle, then a tall top and a stepped drop.
    ...boulderRidge(80, [0.4, 0.8, 1.2, 1.6, 2, 2.4, 1.95, 2.4, 2.8, 3.2, 2.4, 1.6, 0.8], 1.05),
    ...boulderRidge(152, [0.5, 0.9, 1.3, 1.8, 2.3, 2.8, 2, 1, 0.4]),
    ...boulderRidge(266, [0.4, 0.8, 1.2, 1.6, 2, 2.5, 3, 3.5, 3, 3.5, 2.8, 2, 1.2, 0.5]),
    ...boulderRidge(337, [0.5, 0.9, 1.4, 1.9, 2.4, 2.9, 1.8, 0.8]),
  ],
  logs: [...logField(54, 8, 0.5), ...logField(170, 10, 0.4, 0.8), ...timberPile(290, 0.9)],
  fuel: [150, 300],
  stars: [
    { x: 89.5, ref: 89.5, above: 4.5 },
    { x: 250, ref: 239, above: 4.5 },
    { x: 343, ref: 343, above: 4.2 },
  ],
  sections: [
    { from: 28, to: 42, skill: 'boulders' },
    { from: 50, to: 70, skill: 'logs' },
    { from: 76, to: 94, skill: 'boulders' },
    { from: 106, to: 122, skill: 'seesaw' },
    { from: 124, to: 144, skill: 'mud' },
    { from: 148, to: 164, skill: 'boulders' },
    { from: 166, to: 190, skill: 'logs' },
    { from: 212, to: 232, skill: 'bridge' },
    { from: 234, to: 256, skill: 'ramp' },
    { from: 262, to: 284, skill: 'boulders' },
    { from: 286, to: 293, skill: 'crawl' },
    { from: 302, to: 326, skill: 'drawbridge' },
    { from: 333, to: 347, skill: 'boulders' },
    { from: 352, to: 382, skill: 'barrels' },
  ],
  paceSteps: [
    [0, 8], [28, 2.5], [42, 4], [50, 2.5], [70, 5], [76, 2], [96, 6], [106, 3], [122, 6], [146, 2], [164, 4], [168, 2],
    [194, 6], [206, 9], [232, 8.5], [256, 5], [262, 2], [294, 6], [333, 2], [348, 6], [378, 7],
  ],
})

/**
 * Extreme: towering boulder ridges with a knife-edge top, cracks and drops, long log fields (one on a climb),
 * a crest ramp, a falling bridge, deep mud, a huge ramp, the big gap, a drawbridge and barrels, on very little fuel.
 */
const spring5 = course({
  id: 'spring5', tier: 5, length: 450, par: 110,
  calm: [[24, 50], [54, 80], [80, 100], [136, 166], [166, 200], [204, 234], [276, 292], [306, 352], [356, 384], [384, 398]],
  hills: (x) =>
    4 * (smooth(104, 120, x) - smooth(126, 134, x)) + 3 * (smooth(234, 252, x) - smooth(262, 272, x)) + 4 * smooth(414, 432, x),
  features: [
    { kind: 'bridge', x: 140, len: 14, h: 3.2, collapse: true },
    { kind: 'mud', x: 168, len: 16, h: 0.7 },
    { kind: 'pothole', x: 216, len: 8, h: 1.3 },
    { kind: 'gap', x: 318, len: 32, h: 4.5, gapWidth: 8, lip: 3 },
    { kind: 'bridge', x: 366, len: 12, h: 3.2, drawbridge: true },
    { kind: 'pit', x: 386, len: 8, h: 0.8 },
  ],
  gadgets: [
    { kind: 'kicker', x: 120, len: 4, h: 1 },
    { kind: 'kicker', x: 208, len: 7, h: 2.5 },
    { kind: 'seesaw', x: 284, len: 8 },
    { kind: 'drawbridge', x: 366, len: 12 },
    { kind: 'barrels', x: 446, every: 4 },
  ],
  rocks: [
    ...boulderRidge(28, [0.5, 0.9, 1.4, 1.9, 2.4, 1.9, 2.4, 2.9, 2.1, 1.3, 0.5]),
    // The tallest ridge: a knife-edge top, a crack and a stepped drop.
    ...boulderRidge(80.5, [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 3.7, 3.2, 3.6, 2.8, 2, 1.2, 0.5], 0.93),
    ...boulderRidge(185, [0.6, 1.1, 1.6, 2.1, 1.2, 0.5]),
    ...boulderRidge(406, [0.5, 1, 1.5, 2, 2.5, 3, 2.2, 1.2, 0.5]),
    ...boulderRidge(434, [0.4, 0.9, 1.4, 0.9, 0.4]),
  ],
  logs: [...logField(58, 12, 0.5, 1.05), ...logField(236, 10, 0.4, 0.85), ...timberPile(256, 1)],
  fuel: [150, 300],
  stars: [
    { x: 88.5, ref: 88.5, above: 5.8 },
    { x: 219, ref: 208, above: 4.6 },
    { x: 330, ref: 318, above: 4.4 },
  ],
  sections: [
    { from: 24, to: 40, skill: 'boulders' },
    { from: 54, to: 76, skill: 'logs' },
    { from: 78, to: 96, skill: 'boulders' },
    { from: 110, to: 134, skill: 'crest' },
    { from: 136, to: 156, skill: 'bridge' },
    { from: 164, to: 184, skill: 'mud' },
    { from: 185, to: 193, skill: 'boulders' },
    { from: 204, to: 228, skill: 'ramp' },
    { from: 232, to: 260, skill: 'logs' },
    { from: 274, to: 292, skill: 'seesaw' },
    { from: 304, to: 345, skill: 'jump' },
    { from: 356, to: 380, skill: 'drawbridge' },
    { from: 384, to: 394, skill: 'crawl' },
    { from: 402, to: 416, skill: 'boulders' },
    { from: 418, to: 444, skill: 'barrels' },
  ],
  paceSteps: [
    [0, 8], [24, 2.5], [40, 4], [54, 2.5], [78, 2], [97, 6], [116, 3], [134, 9.5], [158, 6], [184, 2], [194, 7],
    [202, 9], [230, 4], [234, 2.5], [262, 5], [274, 3], [294, 7], [300, 11], [345, 7], [384, 3], [396, 5], [402, 2],
    [416, 6], [432, 2.5], [444, 5],
  ],
})

export const COURSES: Record<CourseId, Course> = { spring1, spring2, spring3, spring4, spring5 }
export const SPRING_COURSES: Course[] = [spring1, spring2, spring3, spring4, spring5]
