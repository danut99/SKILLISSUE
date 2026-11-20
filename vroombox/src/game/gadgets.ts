/** Drawbridge cycle (seconds): down for DOWN, rises over MOVE, stays up for UP, lowers over MOVE. */
const DOWN = 4
const MOVE = 1
const UP = 1.2
export const DRAWBRIDGE_PERIOD = DOWN + MOVE + UP + MOVE
/** How far the deck lifts (rad). */
export const DRAWBRIDGE_LIFT = 1.2

const ease = (u: number) => u * u * (3 - 2 * u)

/** Deck lift (0 = down, DRAWBRIDGE_LIFT = up) at run time t. */
export function drawbridgeLift(t: number): number {
  const p = t % DRAWBRIDGE_PERIOD
  if (p < DOWN) return 0
  if (p < DOWN + MOVE) return DRAWBRIDGE_LIFT * ease((p - DOWN) / MOVE)
  if (p < DOWN + MOVE + UP) return DRAWBRIDGE_LIFT
  return DRAWBRIDGE_LIFT * (1 - ease((p - DOWN - MOVE - UP) / MOVE))
}

/** Seconds the deck stays down from run time t (0 while it is moving or up). */
export function drawbridgeDownFor(t: number): number {
  const p = t % DRAWBRIDGE_PERIOD
  return p < DOWN ? DOWN - p : 0
}

/** The warning light turns yellow this many seconds before the deck starts to lift. */
export const DRAWBRIDGE_WARN = 1.5
export type DrawbridgeSignal = 'go' | 'soon' | 'stop'
/** Traffic light beside a drawbridge: green while it stays down, yellow just before it lifts, red while it moves or is up. */
export function drawbridgeSignal(t: number): DrawbridgeSignal {
  const down = drawbridgeDownFor(t)
  return down > DRAWBRIDGE_WARN ? 'go' : down > 0 ? 'soon' : 'stop'
}

export const BARREL_R = 0.3
export const BARREL_MASS = 3
export const SEESAW_TILT = 0.2
