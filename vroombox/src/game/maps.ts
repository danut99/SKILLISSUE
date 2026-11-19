export type MapId = 'farm' | 'desert' | 'snow' | 'moon'
export const MAP_ORDER: MapId[] = ['farm', 'desert', 'moon', 'snow']

export type Triple = [number, number, number]

export type MapDef = {
  id: MapId
  emoji: string
  gravity: number
  /** Ground friction; mixed with tire grip by Box2D (sqrt of the product). */
  friction: number
  /** Hill amplitudes at difficulty 0 (a0) and 1 (a1), their frequencies and the slow overall climb. */
  hills: { a0: Triple; a1: Triple; f: Triple; climb: number }
  /** Relative odds of each obstacle; pits and bridges only appear as difficulty rises. */
  weights: { ramp: number; bump: number; mesa: number; pit: number; mud: number; ice: number; bridge: number; snow: number; pothole: number }
  rocks: number
  /** How many rolling logs (relative). */
  logs: number
  /** Mud look: farm mud, desert sand, snow drifts. */
  mud: [string, string]
  sky: [string, string]
  far: string
  near: string
  grass: [string, string]
  dirt: [string, string]
  rock: 'hay' | 'stone' | 'snowball' | 'moonrock'
  decor: 'tree' | 'cactus' | 'pine' | 'crater'
  night: boolean
}

export const MAPS: Record<MapId, MapDef> = {
  farm: {
    id: 'farm',
    emoji: '🌷',
    gravity: -10,
    friction: 0.9,
    hills: { a0: [2.0, 0.8, 0.12], a1: [8.0, 3.0, 0.42], f: [1 / 16, 1 / 6.5, 1 / 2.4], climb: 0.012 },
    weights: { snow: 0, pothole: 0.2, ramp: 0.3, bump: 0.22, mesa: 0.15, pit: 0.12, mud: 0.35, ice: 0, bridge: 0.12 },
    rocks: 1,
    logs: 1,
    mud: ['#6b4423', '#4a2e16'],
    sky: ['#4fb3ff', '#cdeeff'],
    far: '#a7d8c9',
    near: '#7cc4a0',
    grass: ['#3e8e41', '#6cc04a'],
    dirt: ['#9a6a3c', '#5b3a1e'],
    rock: 'stone',
    decor: 'tree',
    night: false,
  },
  desert: {
    id: 'desert',
    emoji: '☀️',
    gravity: -10,
    friction: 0.72,
    hills: { a0: [3.0, 0.5, 0.05], a1: [10.0, 1.6, 0.15], f: [1 / 22, 1 / 9, 1 / 3], climb: 0.008 },
    weights: { snow: 0, pothole: 0.6, ramp: 0.28, bump: 0.22, mesa: 0.2, pit: 0.12, mud: 0, ice: 0, bridge: 0.15 },
    rocks: 1.2,
    logs: 0.4,
    mud: ['#a27b4d', '#755235'],
    sky: ['#45b5ec', '#d6f1ff'],
    far: '#94c77d',
    near: '#74a85b',
    grass: ['#83924d', '#b1b46c'],
    dirt: ['#b98450', '#85582f'],
    rock: 'stone',
    decor: 'tree',
    night: false,
  },
  snow: {
    id: 'snow',
    emoji: '❄️',
    gravity: -10,
    friction: 0.5,
    hills: { a0: [1.4, 0.8, 0.18], a1: [5.0, 2.2, 0.4], f: [1 / 14, 1 / 5.5, 1 / 2], climb: 0.008 },
    weights: { snow: 0.65, pothole: 0, ramp: 0.25, bump: 0.25, mesa: 0.1, pit: 0.1, mud: 0, ice: 0.55, bridge: 0.12 },
    rocks: 0.8,
    logs: 0.8,
    mud: ['#ffffff', '#d6e4f5'],
    sky: ['#8fc3ff', '#eef6ff'],
    far: '#dbe8f6',
    near: '#c3d8ee',
    grass: ['#bcd3ec', '#ffffff'],
    dirt: ['#e6eef8', '#9db5d2'],
    rock: 'stone',
    decor: 'pine',
    night: false,
  },
  moon: {
    id: 'moon',
    emoji: '🍂',
    gravity: -10,
    friction: 0.8,
    hills: { a0: [2.0, 0.6, 0.1], a1: [7.0, 2.2, 0.3], f: [1 / 18, 1 / 7, 1 / 2.6], climb: 0.01 },
    weights: { snow: 0, pothole: 0.35, ramp: 0.28, bump: 0.2, mesa: 0.1, pit: 0.12, mud: 0.3, ice: 0, bridge: 0.25 },
    rocks: 1,
    logs: 0,
    mud: ['#785136', '#4c3325'],
    sky: ['#edb07a', '#ffe0b0'],
    far: '#c38a58',
    near: '#a66a45',
    grass: ['#ae7d42', '#d3aa65'],
    dirt: ['#95603e', '#573c2e'],
    rock: 'stone',
    decor: 'tree',
    night: false,
  },
}
