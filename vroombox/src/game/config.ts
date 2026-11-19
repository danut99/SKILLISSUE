/** Physics and gameplay tuning. Units: meters, kilograms, seconds, radians. */
export const DT = 1 / 60
export const VELOCITY_ITERATIONS = 8
export const POSITION_ITERATIONS = 3

/** Every vehicle is scaled so its largest side is this long, whether it is a toy or a real car. */
export const VEHICLE_LENGTH = 3.2
export const WHEEL_MASS = 1.2
export const MIN_WHEEL_RADIUS = 0.22
export const MAX_WHEEL_RADIUS = 1.0
export const MAX_HULL_VERTICES = 8

/** Wheel motors are sized per wheel so tiny and huge wheels both reach TOP_SPEED with the same total push. */
export const TOP_SPEED = 14
export const DRIVE_FORCE = 140
export const ROLLING_FORCE = 4
export const REVERSE_FACTOR = 0.55
/** Air pedals ask for a small tilt, with slow rotation and gentle recovery on release. */
export const AIR_TILT = 0.4
export const AIR_SPIN = 1.2
export const AIR_RESPONSE = 4
export const AIR_ACCEL = 5
/** The chassis center of mass is pulled down to the axles so odd shapes stay drivable. */
export const INERTIA_SCALE = 1.4
export const SUSPENSION_HZ = 4.5
export const SUSPENSION_DAMPING = 0.7
export const WHEEL_FRICTION = 0.95

export const START_X = 0
// Seasonal geometry revision for comparable times and deterministic replays.
export const COURSE_REVISION = 8
export const courseRevisionOf = (id: number) => COURSE_REVISION + (id === 101 ? 1 : 0)
export const WALL_X = -7
export const TERRAIN_X0 = -12
export const CHUNK_LEN = 40
export const TERRAIN_STEP = 1
export const FLAT_END = 26
export const SPAWN_CLEARANCE = 0.35
/** Obstacles never appear before this distance, so every run starts calm. */
export const FEATURE_START = 50
export const SEGMENT_LEN = 100
/** Rocks are mostly buried: their center sits this fraction of the radius above the ground. */
export const ROCK_LIFT = 0.1

/** Seconds of full throttle in a stock tank. Braking burns half as much. */
export const BASE_FUEL = 40
export const FUEL_OUT_TIME = 1.5
export const COIN_VALUE = 5

/** Run ends when upside down on the ground this long, or after STUCK_TIME of gas without forward progress. */
export const FLIP_ANGLE = 2.0
export const FLIP_TIME = 1.2
export const STUCK_TIME = 5
export const AIR_MIN_TIME = 0.25
/** The top part of the vehicle (above this fraction of its height) counts as the roof. */
export const ROOF_FROM = 0.62

/** Tractor pull: a full pull is this far; the run ends after STALL_TIME of gas without moving the load. */
export const PULL_FULL = 100
export const STALL_TIME = 2.5
export const SLED_FRICTION = 0.8
export const SLED_MASS = 2

/** Mud: drag per (m/s) per kg of vehicle, and how much tire push it takes away (both scaled by how much a tire sinks). */
export const MUD_DRAG = 7
export const MUD_SLIP = 0.55
export const ICE_FRICTION = 0.06
export const LOG_MASS = 6
export const PLANK_MASS = 8
export const PLANK_THICK = 0.24
/** Seconds a bridge plank holds after something first touches it. */
export const PLANK_HOLD = 0.55
/** Tractor pull revs (per second up while on the gas / down while off), the green band, and the push left when the tires spin. */
/** Tractor pull: push scales with (mass / PULL_REF_MASS) ^ PULL_MASS_EXP. */
export const PULL_REF_MASS = 12
export const PULL_MASS_EXP = 0.7
export const RPM_RISE = 0.9
export const RPM_FALL = 1.4
export const RPM_GREEN: [number, number] = [0.55, 0.8]
export const RPM_SPIN = 0.35

export const EGG_RADIUS = 0.16
export const EGG_MASS = 0.12

export const REPLAY_SECONDS = 12
export const SLOWMO_SECONDS = 2.6
export const SLOWMO_SCALE = 0.35
export const REPLAY_TAIL_SECONDS = 0.6
