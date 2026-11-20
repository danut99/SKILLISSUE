import { Box, Chain, Circle, Polygon, RevoluteJoint, RopeJoint, Vec2, WheelJoint, World, type Body, type Contact } from 'planck'
import { clipAbove, inflate, polygonArea, simplifyClosed, type Pt } from '../geometry/poly.ts'
import * as C from './config.ts'
import type { VehicleGeom } from './geom.ts'
import * as G from './gadgets.ts'
import { bridgePlanks, Track, type Pickup, type Surface, type TrackSpec } from './track.ts'
import { sizeFactors, traitOf } from './traits.ts'
import { effects, NO_UPGRADES, type Upgrades } from './upgrades.ts'

export type Input = { gas: boolean; brake: boolean }
export const NO_INPUT: Input = { gas: false, brake: false }
export const encodeInput = (i: Input): number => (i.gas ? 1 : 0) | (i.brake ? 2 : 0)
export const decodeInput = (b: number): Input => ({ gas: (b & 1) !== 0, brake: (b & 2) !== 0 })

/** A tractor-pull load: friction it puts up at the start, growing as it is dragged (like a weight transfer sled). */
export type PullLoad = { id: string; emoji: string; base: number; growth: number }

export type ModeSpec =
  | { kind: 'endless' }
  | { kind: 'level' }
  | { kind: 'pull'; load: PullLoad }
  | { kind: 'delivery'; eggs: number }

export type SimConfig = { startDistance?: number; geom: VehicleGeom; track: TrackSpec; mode: ModeSpec; upgrades?: Upgrades }

export type EndKind = 'roof' | 'flip' | 'stuck' | 'bogged' | 'fuel' | 'finish' | 'eggs' | 'stall' | 'fullpull'

export type StepEvents = {
  landing: number
  flip: boolean
  coins: number
  fuel: boolean
  star: boolean
  eggsLost: number
  ended: EndKind | null
}

/**
 * 'wall' is the start barrier: solid ground for wheels, but backing into it never counts as a roof crash.
 * 'loose' (rolling barrels) also never crashes the roof.
 */
type Tag = 'ground' | 'wall' | 'loose' | 'head' | 'egg' | 'sled'
const GROUND_TAGS: readonly (Tag | undefined)[] = ['ground', 'wall', 'loose']
export type PropKind = 'log' | 'plank' | 'barrel' | 'fulcrum' | 'kicker'

/**
 * The whole game world. Fully deterministic for a given config and input sequence,
 * which is what makes replays possible without recording video during play.
 */
export class Sim {
  readonly config: SimConfig
  readonly geom: VehicleGeom
  readonly track: Track
  readonly world: World
  readonly chassis: Body
  readonly wheels: Body[] = []
  readonly joints: WheelJoint[] = []
  /** Delivery: eggs still in play, and where the lost ones splatted. */
  readonly eggs: Body[] = []
  readonly splats: Pt[] = []
  readonly eggsTotal: number
  /** Tractor pull: the sled and the hitch point on the chassis (local). */
  readonly sled: Body | null = null
  readonly hitch: Pt | null = null
  readonly basket: { x: number; y: number; w: number; h: number } | null = null
  readonly collected = new Set<number>()
  stepCount = 0
  maxX: number
  flips = 0
  coins = 0
  stars = 0
  fuel: number
  readonly fuelMax: number
  pulled = 0
  /** Tractor pull: engine revs 0..1. The green band pulls best; past it the tires spin and lose grip. */
  rpm = 0
  /** Whether the brake was ever used (some level goals forbid it). */
  braked = false
  /** Wheels currently in mud (for effects). */
  mudWheels = 0
  /** Physics props for drawing; (ox, oy) is the shape center relative to the body origin, flip mirrors a kicker into a landing ramp. */
  readonly props: { body: Body; kind: PropKind; w: number; h: number; ox?: number; oy?: number; flip?: boolean }[] = []
  ended: EndKind | null = null
  endStep = -1

  private readonly wheelSpeed: number[] = []
  private readonly wheelTorque: number[] = []
  private readonly wheelIdle: number[] = []
  private readonly wheelMud: number[] = []
  /** How far each tire has dug itself into mud by spinning (0..1). */
  readonly dig: number[] = []
  private readonly planks = new Map<Body, number>()
  private readonly drawbridges: Body[] = []
  private readonly barrels: { body: Body; from: number; born: number }[] = []
  /** Barrels that hit the vehicle this step: they knock it back once, then break. */
  private readonly smashed = new Set<Body>()
  private readonly totalMass: number
  /** Spin rate (rad/s) GAS/BRAKE steer toward in the air. */
  private readonly airTorque: number
  private readonly collectR: number
  readonly sledStartX: number = 0
  private readonly chunks = new Map<number, Body[]>()
  private chassisContacts = 0
  private readonly wheelContacts = new Map<Body,number>()
  gapImpact: {farX:number;height:number} | null = null
  get chassisGrounded():boolean {return this.chassisContacts>0}
  get groundedWheelCount():number {return [...this.wheelContacts.values()].filter(n=>n>0).length}
  private groundContacts = 0
  private roofHit = false
  private readonly eggHits = new Set<Body>()
  private airSteps = 0
  private airSpin = 0
  private minAirVy = 0
  private lastAngle = 0
  private upsideSteps = 0
  private progress: number
  /** Steps spent holding GAS since the last bit of forward progress. Braking/reversing resets it. */
  private stuckGasSteps = 0
  private stillSteps = 0
  private readonly events: StepEvents = { landing: 0, flip: false, coins: 0, fuel: false, star: false, eggsLost: 0, ended: null }

  constructor(config: SimConfig) {
    this.config = config
    const geom = (this.geom = config.geom)
    const eff = effects(config.upgrades ?? NO_UPGRADES)
    this.track = new Track(config.track)
    const map = this.track.map
    this.world = new World({ gravity: { x: 0, y: map.gravity } })
    this.world.on('begin-contact', (c) => this.onContact(c, 1))
    this.world.on('end-contact', (c) => this.onContact(c, -1))

    const wall = this.world.createBody({ type: 'static' })
    wall.createFixture(new Box(0.5, 25, new Vec2(C.WALL_X - 0.5, 20), 0), { friction: 0.4, userData: 'wall' satisfies Tag })
    const spawnX = C.START_X + (config.startDistance ?? 0)
    this.ensureChunks(spawnX)

    const lowest = Math.min(...geom.hull.map((p) => p.y), ...geom.wheels.map((w) => w.y - w.r))
    const pos = new Vec2(spawnX, Math.max(this.track.height(spawnX) - lowest, ...geom.wheels.map(w => this.track.height(spawnX + w.x) - w.y + w.r)) + C.SPAWN_CLEARANCE)
    this.chassis = this.world.createBody({ type: 'dynamic', position: pos, angularDamping: 0.05 })
    this.chassis.createFixture(new Polygon(geom.hull.map((p) => new Vec2(p.x, p.y))), {
      density: geom.mass / geom.area,
      friction: 0.6,
      restitution: 0.05,
      filterGroupIndex: -1,
    })

    const ys = geom.hull.map((p) => p.y)
    const xs = geom.hull.map((p) => p.x)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const roof = simplifyClosed(inflate(clipAbove(geom.hull, minY + (maxY - minY) * C.ROOF_FROM), 0.05), C.MAX_HULL_VERTICES)
    if (roof.length >= 3 && Math.abs(polygonArea(roof)) > 0.01) {
      this.chassis.createFixture(new Polygon(roof.map((p) => new Vec2(p.x, p.y))), {
        isSensor: true,
        filterGroupIndex: -1,
        userData: 'head' satisfies Tag,
      })
    }

    if (config.mode.kind === 'delivery') {
      const w = Math.min(1.9, Math.max(1.2, (Math.max(...xs) - Math.min(...xs)) * 0.6))
      const h = 0.55
      const t = 0.07
      this.basket = { x: 0, y: maxY, w, h }
      const opt = { density: 0.3, friction: 0.8, filterGroupIndex: -1, userData: 'head' satisfies Tag }
      this.chassis.createFixture(new Box(w / 2 + t, t / 2, new Vec2(0, maxY + t / 2), 0), opt)
      this.chassis.createFixture(new Box(t / 2, h / 2, new Vec2(-w / 2 - t / 2, maxY + h / 2), 0), opt)
      this.chassis.createFixture(new Box(t / 2, h / 2, new Vec2(w / 2 + t / 2, maxY + h / 2), 0), opt)
    }

    const md = { mass: 0, center: new Vec2(0, 0), I: 0 }
    this.chassis.getMassData(md)
    const iCenter = md.I - md.mass * (md.center.x ** 2 + md.center.y ** 2)
    const com = geom.com
    this.chassis.setMassData({
      mass: md.mass,
      center: new Vec2(com.x, com.y),
      I: iCenter * C.INERTIA_SCALE + md.mass * (com.x ** 2 + com.y ** 2),
    })

    // Pulling is about weight on the wheels: in tractor pull a heavier vehicle pushes harder.
    const heft = config.mode.kind === 'pull' ? (geom.mass / C.PULL_REF_MASS) ** C.PULL_MASS_EXP : 1
    const perWheelForce = (C.DRIVE_FORCE * eff.force * heft) / Math.max(1, geom.wheels.length)
    for (const w of geom.wheels) {
      const trait = traitOf(w.design)
      const size = sizeFactors(w.r)
      this.wheelSpeed.push((C.TOP_SPEED * eff.speed * trait.speed * size.speed) / w.r)
      this.wheelTorque.push(perWheelForce * trait.force * size.force * w.r)
      this.wheelIdle.push(C.ROLLING_FORCE * w.r)
      this.wheelMud.push(1 - trait.mud)
      this.dig.push(0)
      const wheel = this.world.createBody({
        type: 'dynamic',
        position: new Vec2(pos.x + w.x, pos.y + w.y),
        angularDamping: 0.05,
      })
      wheel.createFixture(new Circle(w.r), {
        density: C.WHEEL_MASS / (Math.PI * w.r * w.r),
        friction: eff.grip * trait.grip,
        restitution: trait.bounce,
        filterGroupIndex: -1,
      })
      const joint = this.world.createJoint(
        new WheelJoint(
          {
            enableMotor: true,
            motorSpeed: 0,
            maxMotorTorque: C.ROLLING_FORCE * w.r,
            frequencyHz: eff.suspensionHz,
            dampingRatio: eff.damping,
          },
          this.chassis,
          wheel,
          wheel.getPosition(),
          new Vec2(0, 1),
        ),
      )
      if (joint) this.joints.push(joint)
      this.wheels.push(wheel)
    }
    this.airTorque = C.AIR_SPIN * eff.air
    this.totalMass = this.chassis.getMass() + this.wheels.reduce((m, w) => m + w.getMass(), 0)
    this.collectR = 0.45 + 0.75 * Math.max(...geom.hull.map((p) => Math.hypot(p.x, p.y)))

    this.eggsTotal = config.mode.kind === 'delivery' ? config.mode.eggs : 0
    if (this.basket) {
      const perRow = Math.max(1, Math.floor(this.basket.w / (C.EGG_RADIUS * 2.2)))
      for (let e = 0; e < this.eggsTotal; e++) {
        const col = e % perRow
        const row = Math.floor(e / perRow)
        const lx = -this.basket.w / 2 + C.EGG_RADIUS * 1.1 + col * C.EGG_RADIUS * 2.2
        const ly = this.basket.y + 0.08 + C.EGG_RADIUS + row * C.EGG_RADIUS * 2.1
        const egg = this.world.createBody({ type: 'dynamic', position: new Vec2(pos.x + lx, pos.y + ly), linearDamping: 0.05 })
        egg.createFixture(new Circle(C.EGG_RADIUS), {
          density: C.EGG_MASS / (Math.PI * C.EGG_RADIUS ** 2),
          friction: 0.7,
          restitution: 0.05,
          userData: 'egg' satisfies Tag,
        })
        this.eggs.push(egg)
      }
    }

    if (config.mode.kind === 'pull') {
      const sw = 1.5
      const sh = 0.5
      const hitch = { x: Math.min(...xs), y: com.y }
      const sx = pos.x + hitch.x - 2.2 - sw / 2
      const sled = this.world.createBody({ type: 'dynamic', position: new Vec2(sx, this.track.height(sx) + sh / 2 + 0.02), fixedRotation: true })
      sled.createFixture(new Box(sw / 2, sh / 2), {
        density: C.SLED_MASS / (sw * sh),
        friction: C.SLED_FRICTION,
        userData: 'sled' satisfies Tag,
      })
      const a = new Vec2(pos.x + hitch.x, pos.y + hitch.y)
      const b = new Vec2(sx + sw / 2, sled.getPosition().y)
      this.world.createJoint(
        new RopeJoint({
          bodyA: this.chassis,
          bodyB: sled,
          localAnchorA: new Vec2(hitch.x, hitch.y),
          localAnchorB: new Vec2(sw / 2, 0),
          maxLength: Math.hypot(a.x - b.x, a.y - b.y) + 0.05,
        }),
      )
      this.sled = sled
      this.hitch = hitch
      this.sledStartX = sled.getPosition().x
    }

    this.fuelMax = config.mode.kind === 'pull' ? Infinity : eff.fuel
    this.fuel = this.fuelMax
    this.maxX = pos.x
    this.progress = config.mode.kind === 'pull' ? 0 : pos.x
  }

  get distance(): number {
    return Math.max(0, this.maxX - C.START_X)
  }

  get airborne(): boolean {
    return this.groundContacts <= 0
  }

  get engineOn(): boolean {
    return this.fuel > 0
  }

  get time(): number {
    return (this.endStep >= 0 ? this.endStep : this.stepCount) * C.DT
  }

  /** Wheel rim speed as a fraction of top speed (0..~1.2), used for the engine sound. */
  engineLoad(): number {
    if (!this.wheels.length) return 0
    let s = 0
    for (let i = 0; i < this.wheels.length; i++) s += Math.abs(this.wheels[i].getAngularVelocity()) * this.geom.wheels[i].r
    return s / this.wheels.length / C.TOP_SPEED
  }

  step(input: Input): StepEvents {
    const ev = this.events
    ev.landing = 0
    ev.flip = false
    ev.coins = 0
    ev.fuel = false
    ev.star = false
    ev.eggsLost = 0
    ev.ended = null

    const powered = this.engineOn && (input.gas || input.brake)
    if (powered && this.fuel !== Infinity) this.fuel = Math.max(0, this.fuel - C.DT * (input.gas ? 1 : 0.5))
    if (input.brake && this.engineOn) this.braked = true
    const dir = !powered ? 0 : input.gas ? -1 : C.REVERSE_FACTOR
    const revs = this.revs(input.gas && this.engineOn)
    this.mudWheels = 0
    const crawling = Math.abs(this.chassis.getLinearVelocity().x) < C.DIG_SPEED
    for (let i = 0; i < this.joints.length; i++) {
      const wheel = this.wheels[i]
      const soft = this.surface(wheel.getPosition().x)
      const depth = this.track.softDepthAt(wheel.getPosition().x)
      const radius = Math.max(0.1, this.geom.wheels[i].r)
      const submerged = Math.max(0, this.track.height(wheel.getPosition().x) + depth - (wheel.getPosition().y - radius))
      const immersion = Math.min(1.8, Math.min(depth, submerged) / radius)
      const inMud = this.inMud(i)
      // Flooring it while crawling spins the tire and digs it in; easing off or reversing lets it climb back out.
      const digging = inMud && input.gas && this.engineOn && crawling
      this.dig[i] = Math.max(0, Math.min(1, this.dig[i] + (digging ? C.DIG_RATE * this.wheelMud[i] : -(input.gas ? C.DIG_SETTLE : C.DIG_RECOVER)) * C.DT))
      const sink = inMud ? (0.12 + this.wheelMud[i] * 0.88) * (0.35 + immersion) * (soft === 'snow' ? 0.65 : 1) * (1 + this.dig[i] * C.DIG_SINK) : 0
      if (sink > 0) {
        // Mud holds the wheel back (drag) and the tire slips (less push). Off-road tires barely notice.
        this.mudWheels++
        const v = wheel.getLinearVelocity()
        // Viscous drag plus a yield resistance: mud bleeds momentum even downhill.
        // Cap resistance per step so it cannot reverse a wheel or inject energy.
        const share = this.totalMass / this.wheels.length
        const drag = Math.min(Math.abs(v.x) * C.MUD_DRAG * sink + (powered ? 0 : sink * 4.5), Math.abs(v.x) / C.DT * .65)
        wheel.applyForceToCenter(new Vec2(-Math.sign(v.x) * drag * share, 0), true)
        if (!powered && Math.abs(this.chassis.getLinearVelocity().x) < .7) {
          const x = wheel.getPosition().x
          const slope = (this.track.height(x + .15) - this.track.height(x - .15)) / .3
          // A submerged tire's static resistance can hold the car on an incline.
          const hold = Math.min(1, immersion * 1.5)
          this.chassis.applyForceToCenter(new Vec2(-this.track.map.gravity * slope / (1 + slope * slope) * share * hold, 0), true)
        }
      }
      this.joints[i].setMotorSpeed(dir * this.wheelSpeed[i])
      const wheelTorque = powered ? this.wheelTorque[i] * (1 - Math.min(0.85, C.MUD_SLIP * sink)) * (input.gas ? revs : 1) : this.wheelIdle[i]
      // Spinning a free wheel must not kick the whole drawing into a backflip.
      this.joints[i].setMaxMotorTorque(wheelTorque * (this.airborne ? 0.08 : 1))
    }
    if (this.airborne && powered && input.gas !== input.brake) {
      // GAS spins the nose up, BRAKE spins it down; with no pedal the body keeps its rotation.
      const I = this.chassis.getInertia()
      const target = (input.gas ? 1 : -1) * this.airTorque
      const torque = (target - this.chassis.getAngularVelocity()) * I * C.AIR_RESPONSE
      const cap = I * C.AIR_ACCEL
      this.chassis.applyTorque(Math.max(-cap, Math.min(cap, torque)), true)
    }
    const mode = this.config.mode
    if (this.sled && mode.kind === 'pull') {
      const g = -this.track.map.gravity
      const mu = Math.sqrt(C.SLED_FRICTION * this.track.map.friction)
      const down = (mode.load.base * (1 + this.pulled / mode.load.growth)) / mu - this.sled.getMass() * g
      if (down > 0) this.sled.applyForceToCenter(new Vec2(0, -down), true)
    }

    this.moveGadgets()
    this.world.step(C.DT, C.VELOCITY_ITERATIONS, C.POSITION_ITERATIONS)
    this.stepCount++
    this.dropPlanks()

    const pos = this.chassis.getPosition()
    this.ensureChunks(pos.x)
    this.updateEggs(pos)
    this.collect(pos)

    const angle = this.chassis.getAngle()
    const spin = angle - this.lastAngle
    this.lastAngle = angle
    if (this.airborne) {
      this.airSteps++
      this.airSpin += spin
      this.minAirVy = Math.min(this.minAirVy, this.chassis.getLinearVelocity().y)
      if (Math.abs(this.airSpin) >= Math.PI * 2 - 0.3) {
        this.flips++
        ev.flip = true
        this.airSpin -= Math.sign(this.airSpin) * Math.PI * 2
      }
    } else {
      if (this.airSteps * C.DT >= C.AIR_MIN_TIME) ev.landing = -this.minAirVy
      this.airSteps = 0
      this.airSpin = 0
      this.minAirVy = 0
    }

    if (pos.x > this.maxX) this.maxX = pos.x
    if (this.sled) this.pulled = Math.max(this.pulled, this.sled.getPosition().x - this.sledStartX)
    const measure = mode.kind === 'pull' ? this.pulled : this.maxX
    const needed = mode.kind === 'pull' ? 0.25 : 1
    if (measure >= this.progress + needed) {
      this.progress = measure
      this.stuckGasSteps = 0
    } else if (input.brake && this.engineOn) {
      // Backing up to rock out or take another run-up is not being stuck.
      this.stuckGasSteps = 0
    } else if (input.gas && this.engineOn) {
      this.stuckGasSteps++
    }
    const speed = this.chassis.getLinearVelocity().length()
    this.stillSteps = !this.engineOn && speed < 0.35 ? this.stillSteps + 1 : 0

    if (!this.ended) {
      const upsideDown = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) > C.FLIP_ANGLE
      if (!upsideDown) this.upsideSteps = 0
      else if (!this.airborne) this.upsideSteps++
      const finishX = this.track.finishX
      let end: EndKind | null = null
      if (finishX !== null && pos.x >= finishX) end = 'finish'
      else if (mode.kind === 'pull' && this.pulled >= C.PULL_FULL) end = 'fullpull'
      else if (this.roofHit) end = 'roof'
      else if (this.upsideSteps * C.DT >= C.FLIP_TIME) end = 'flip'
      else if (mode.kind === 'delivery' && this.eggs.length === 0) end = 'eggs'
      else if (mode.kind === 'pull' && this.stuckGasSteps * C.DT >= C.STALL_TIME) end = 'stall'
      else if (this.stillSteps * C.DT >= C.FUEL_OUT_TIME) end = 'fuel'
      else if (this.stuckGasSteps * C.DT >= C.STUCK_TIME) end = this.mudWheels > 0 ? 'bogged' : 'stuck'
      else if (pos.y < this.track.height(pos.x) - 30) end = 'flip'
      if (end) {
        this.ended = end
        this.endStep = this.stepCount
        ev.ended = end
      }
    }
    return ev
  }

  /** Tractor pull revs: rise while on the gas, fall when off. Returns the push factor for this step (1 elsewhere). */
  private revs(gas: boolean): number {
    if (this.config.mode.kind !== 'pull') return 1
    this.rpm = gas ? Math.min(1, this.rpm + C.DT * C.RPM_RISE) : Math.max(0, this.rpm - C.DT * C.RPM_FALL)
    if (this.rpm < C.RPM_GREEN[0]) return 0.3 + (0.7 * this.rpm) / C.RPM_GREEN[0]
    return this.rpm <= C.RPM_GREEN[1] ? 1 : C.RPM_SPIN
  }

  /** The tire is on (or in) mud. */
  private inMud(i: number): boolean {
    const p = this.wheels[i].getPosition()
    if (!['mud', 'snow'].includes(this.surface(p.x))) return false
    return p.y - this.geom.wheels[i].r - this.track.height(p.x) - this.track.softDepthAt(p.x) < 0.15
  }

  private surface(x: number): Surface {
    return this.track.surfaceAt(x)
  }

  /** Drives drawbridge decks along their timer and rolls barrels down toward the player. */
  private moveGadgets() {
    const t = (this.stepCount + 1) * C.DT
    for (const deck of this.drawbridges) deck.setAngularVelocity((-G.drawbridgeLift(t) - deck.getAngle()) / C.DT)
    const x = this.chassis.getPosition().x
    for (const seg of this.track.segmentsIn(x - 5, x + 70)) {
      for (const g of seg.gadgets ?? []) {
        if (g.kind !== 'barrels' || x < g.x - 60 || x > g.x - 20 || this.stepCount % Math.round(g.every / C.DT) !== 0) continue
        if (this.barrels.length >= 5) continue
        const body = this.world.createBody({ type: 'dynamic', position: new Vec2(g.x, this.track.height(g.x) + G.BARREL_R + 0.05), linearVelocity: new Vec2(-2.5, 0), angularVelocity: 2.5 / G.BARREL_R })
        body.createFixture(new Circle(G.BARREL_R), { density: G.BARREL_MASS / (Math.PI * G.BARREL_R ** 2), friction: 0.6, restitution: 0.1, userData: 'loose' satisfies Tag })
        this.barrels.push({ body, from: g.x, born: this.stepCount })
        this.props.push({ body, kind: 'barrel', w: G.BARREL_R, h: G.BARREL_R })
      }
    }
    for (let i = this.barrels.length - 1; i >= 0; i--) {
      const { body, from, born } = this.barrels[i]
      const p = body.getPosition()
      // Barrels roll away after a while so they never pile up into a wall at the foot of the climb.
      if (!this.smashed.has(body) && p.x > from - 55 && p.y > this.track.height(p.x) - 6 && (this.stepCount - born) * C.DT < G.BARREL_LIFE) continue
      this.props.splice(this.props.findIndex((q) => q.body === body), 1)
      this.world.destroyBody(body)
      this.barrels.splice(i, 1)
    }
    this.smashed.clear()
  }

  /** Builds the gadgets of one chunk; returns their bodies so they go away with the chunk. */
  private createGadgets(x0: number, x1: number): Body[] {
    const h = (x: number) => this.track.height(x)
    const bodies: Body[] = []
    for (const seg of this.track.segmentsIn(x0, x1)) {
      for (const g of seg.gadgets ?? []) {
        if (g.x < x0 || g.x >= x1) continue
        if (g.kind === 'kicker') {
          const rise = h(g.x + g.len) - h(g.x)
          const ramp = this.world.createBody({ type: 'static', position: new Vec2(g.x, h(g.x)) })
          const pts = g.down ? [new Vec2(0, 0), new Vec2(g.len, rise), new Vec2(0, g.h)] : [new Vec2(0, 0), new Vec2(g.len, rise), new Vec2(g.len, rise + g.h)]
          ramp.createFixture(new Polygon(pts), { friction: 0.9, userData: 'ground' satisfies Tag })
          this.props.push({ body: ramp, kind: 'kicker', w: g.len, h: g.h, flip: g.down })
          bodies.push(ramp)
        } else if (g.kind === 'seesaw') {
          // Plank and fulcrum share a negative group so only the joint holds the plank up.
          const tilt = G.SEESAW_TILT
          // Pivot height that rests the lower end of the plank flat on the ground.
          const H = (g.len / 2) * Math.sin(tilt) + 0.13 / Math.cos(tilt)
          const fulcrum = this.world.createBody({ type: 'static', position: new Vec2(g.x, h(g.x)) })
          fulcrum.createFixture(new Polygon([new Vec2(-0.7, 0), new Vec2(0.7, 0), new Vec2(0, H - 0.1)]), { friction: 0.8, filterGroupIndex: -2, userData: 'ground' satisfies Tag })
          const plank = this.world.createBody({ type: 'dynamic', position: new Vec2(g.x, h(g.x) + H), angle: tilt, angularDamping: 0.3 })
          plank.createFixture(new Box(g.len / 2, 0.13), { density: 12 / (g.len * 0.26), friction: 0.9, filterGroupIndex: -2, userData: 'ground' satisfies Tag })
          this.world.createJoint(new RevoluteJoint({ enableLimit: true, lowerAngle: -2 * tilt, upperAngle: 0 }, fulcrum, plank, new Vec2(g.x, h(g.x) + H)))
          this.props.push({ body: fulcrum, kind: 'fulcrum', w: 1.4, h: H - 0.1 }, { body: plank, kind: 'plank', w: g.len, h: 0.26 })
          bodies.push(plank, fulcrum)
        } else if (g.kind === 'drawbridge') {
          // Hinged at the far bank: lifting it raises the near end into a wall above the ravine.
          const deck = this.world.createBody({ type: 'kinematic', position: new Vec2(g.x + g.len, h(g.x + g.len)), angle: -G.drawbridgeLift(this.stepCount * C.DT) })
          deck.createFixture(new Box(g.len / 2, C.PLANK_THICK / 2, new Vec2(-g.len / 2, -C.PLANK_THICK / 2), 0), { friction: 0.9, userData: 'ground' satisfies Tag })
          this.drawbridges.push(deck)
          this.props.push({ body: deck, kind: 'plank', w: g.len, h: C.PLANK_THICK, ox: -g.len / 2, oy: -C.PLANK_THICK / 2 })
          bodies.push(deck)
        }
      }
    }
    return bodies
  }

  /** A plank gives way a moment after something first touches it: cross bridges fast. */
  private dropPlanks() {
    for (const [body, touched] of this.planks) {
      if (touched < 0 || this.stepCount - touched < C.PLANK_HOLD / C.DT) continue
      body.setDynamic()
      body.setAwake(true)
      this.planks.delete(body)
    }
  }

  private onContact(c: Contact, delta: number) {
    const fa = c.getFixtureA()
    const fb = c.getFixtureB()
    const ta = fa.getUserData() as Tag | undefined
    const tb = fb.getUserData() as Tag | undefined
    const groundA = GROUND_TAGS.includes(ta)
    const groundB = GROUND_TAGS.includes(tb)
    if (groundA === groundB) return
    const other = groundA ? fb : fa
    const tag = groundA ? tb : ta
    if (!other.isSensor() && (groundA ? ta : tb) !== 'wall') {
      if(other.getBody() === this.chassis) this.chassisContacts = Math.max(0,this.chassisContacts+delta)
      if(this.wheels.includes(other.getBody())) this.wheelContacts.set(other.getBody(),Math.max(0,(this.wheelContacts.get(other.getBody())??0)+delta))
      if(delta>0 && (other.getBody()===this.chassis || this.wheels.includes(other.getBody()))) {
        const p=other.getBody().getPosition()
        for(const segment of this.track.segmentsIn(p.x-35,p.x+3)) for(const f of segment.features) {
          if(f.kind!=='gap')continue
          const farX=f.x+f.len*(f.gapWidth===undefined?.64:.25+f.gapWidth/f.len)
          const height=this.track.base(f.x)
          if(Math.abs(p.x-farX)<2 && p.y<height+.15) this.gapImpact={farX,height}
        }
      }
    }
    const groundTag = groundA ? ta : tb
    const isWall = groundTag === 'wall'
    const groundBody = (groundA ? fa : fb).getBody()
    const mine = other.getBody() === this.chassis || this.wheels.includes(other.getBody())
    if (delta > 0 && mine && groundTag === 'loose') this.smashed.add(groundBody)
    if (delta > 0 && this.planks.get(groundBody) === -1) this.planks.set(groundBody, this.stepCount)
    if (tag === 'head') {
      if (delta > 0 && !isWall && groundTag !== 'loose') this.roofHit = true
    } else if (tag === 'egg') {
      if (delta > 0) this.eggHits.add(other.getBody())
    } else if (tag !== 'sled') {
      this.groundContacts += delta
    }
  }

  private updateEggs(pos: Vec2) {
    if (!this.eggs.length) return
    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const egg = this.eggs[i]
      const p = egg.getPosition()
      if (this.eggHits.has(egg) || p.x < pos.x - 12 || p.y < pos.y - 8) {
        this.splats.push({ x: p.x, y: this.track.height(p.x) })
        this.world.destroyBody(egg)
        this.eggs.splice(i, 1)
        this.events.eggsLost++
      }
    }
    this.eggHits.clear()
  }

  private collect(pos: Vec2) {
    for (const seg of this.track.segmentsIn(pos.x - 6, pos.x + 6)) {
      for (const p of seg.pickups) {
        if (this.collected.has(p.id) || Math.abs(p.x - pos.x) > 6 || !this.touches(p, pos)) continue
        this.collected.add(p.id)
        if (p.kind === 'coin') {
          this.coins++
          this.events.coins++
        } else if (p.kind === 'fuel') {
          this.fuel = this.fuelMax
          this.events.fuel = true
        } else {
          this.stars++
          this.events.star = true
        }
      }
    }
  }

  private touches(p: Pickup, pos: Vec2): boolean {
    if (Math.hypot(p.x - pos.x, p.y - pos.y) < this.collectR) return true
    return this.wheels.some((w, i) => {
      const wp = w.getPosition()
      return Math.hypot(p.x - wp.x, p.y - wp.y) < this.geom.wheels[i].r + 0.45
    })
  }

  private ensureChunks(x: number) {
    const i = Math.floor((x - C.TERRAIN_X0) / C.CHUNK_LEN)
    for (let k = Math.max(0, i - 1); k <= i + 2; k++) {
      if (!this.chunks.has(k)) this.chunks.set(k, this.createChunk(k))
    }
    for (const [k, bodies] of this.chunks) {
      if (k < i - 2) {
        for (const b of bodies) {
          this.planks.delete(b)
          const deck = this.drawbridges.indexOf(b)
          if (deck >= 0) this.drawbridges.splice(deck, 1)
          const at = this.props.findIndex((p) => p.body === b)
          if (at >= 0) this.props.splice(at, 1)
          this.world.destroyBody(b)
        }
        this.chunks.delete(k)
      }
    }
  }

  private createChunk(k: number): Body[] {
    const x0 = C.TERRAIN_X0 + k * C.CHUNK_LEN
    const x1 = x0 + C.CHUNK_LEN
    const h = (x: number) => this.track.height(x)
    const ground = this.world.createBody({ type: 'static' })
    // One chain per stretch of the same surface, so ice can have its own (tiny) friction.
    const step = C.TERRAIN_STEP
    let a = x0
    while (a < x1) {
      const kind = this.surface(a + step / 2)
      let b = a + step
      while (b < x1 && this.surface(b + step / 2) === kind) b += step
      const pts: Vec2[] = []
      for (let x = a; x <= b + 1e-9; x += step) pts.push(new Vec2(x, h(x)))
      const chain = new Chain(pts, false)
      // Ghost vertices stop wheels from catching on the seams between chains.
      chain.setPrevVertex(new Vec2(a - step, h(a - step)))
      chain.setNextVertex(new Vec2(b + step, h(b + step)))
      ground.createFixture(chain, { friction: kind === 'ice' ? C.ICE_FRICTION : kind === 'snow' ? 0.5 : this.track.map.friction, userData: 'ground' satisfies Tag })
      a = b
    }
    const bodies = [ground]
    for (const seg of this.track.segmentsIn(x0, x1)) {
      for (const r of seg.rocks) {
        if (r.x < x0 || r.x >= x1) continue
        const rock = this.world.createBody({ type: 'static', position: new Vec2(r.x, h(r.x) + r.r * C.ROCK_LIFT + (r.lift ?? 0)) })
        rock.createFixture(new Circle(r.r), { friction: 0.8, userData: 'ground' satisfies Tag })
        bodies.push(rock)
      }
      for (const l of seg.logs) {
        if (l.x < x0 || l.x >= x1) continue
        // Asleep until touched, so it waits on its spot; then it rolls and gets pushed around.
        const centerY = h(l.x) + l.r * (l.lodged ? 0.55 : 1) + (l.lift ?? 0)
        const log = this.world.createBody({ type: l.lodged ? 'static' : 'dynamic', position: new Vec2(l.x, centerY), awake: false, angularDamping: l.crossing ? 1.8 : 0.4, linearDamping: l.crossing ? 0.65 : 0 })
        log.createFixture(new Circle(l.r), { density: C.LOG_MASS / (Math.PI * l.r * l.r), friction: 0.9, restitution: 0.05, userData: 'ground' satisfies Tag })
        this.props.push({ body: log, kind: 'log', w: l.r, h: l.r })
        bodies.push(log)
      }
      for (const f of seg.features) {
        if (f.kind !== 'bridge' || f.drawbridge) continue
        for (const [p0, p1] of bridgePlanks(f)) {
          const mid = (p0 + p1) / 2
          if (mid < x0 || mid >= x1) continue
          const w = p1 - p0
          const y = this.track.bridgeY(f, mid) - C.PLANK_THICK / 2
          const plank = this.world.createBody({ type: 'static', position: new Vec2(mid, y), angle: Math.atan2(this.track.bridgeY(f, p1) - this.track.bridgeY(f, p0), w) })
          plank.createFixture(new Box(w / 2, C.PLANK_THICK / 2), { density: C.PLANK_MASS / (w * C.PLANK_THICK), friction: 0.9, userData: 'ground' satisfies Tag })
          if (!f.landmark || f.collapse) this.planks.set(plank, -1)
          this.props.push({ body: plank, kind: 'plank', w, h: C.PLANK_THICK })
          bodies.push(plank)
        }
      }
    }
    bodies.push(...this.createGadgets(x0, x1))
    return bodies
  }
}







