import { clamp } from '../geometry/poly.ts'
import { t } from '../i18n.ts'
import { geomOf, wheelSpriteOf, type Vehicle } from '../vehicle.ts'
import { EGG_RADIUS, PULL_FULL, ROCK_LIFT, START_X, TERRAIN_STEP, WALL_X } from './config.ts'
import type { MapDef } from './maps.ts'
import { drawWheel } from './paint.ts'
import { hash2 } from './rng.ts'
import type { Sim } from './sim.ts'
import type { FeatureKind } from './track.ts'

export type View = { x: number; y: number; w: number; h: number }

type Fn = (v: number) => number

export class Camera {
  x = 0
  y = 0
  ppm = 50
  shake = 0

  /** Portrait screens show ~10 m across so the vehicle stays big; landscape shows ~17 m. */
  basePpm(view: View): number {
    return view.h > view.w ? Math.min(view.w / 10.5, view.h / 9.5) : Math.min(view.w / 17, view.h / 9.5)
  }

  snap(sim: Sim, view: View): void {
    const p = sim.chassis.getPosition()
    this.x = p.x + 2
    this.y = p.y + 1.2
    this.ppm = this.basePpm(view)
  }

  follow(sim: Sim, view: View, dt: number): void {
    const p = sim.chassis.getPosition()
    const v = sim.chassis.getLinearVelocity()
    const speed = Math.hypot(v.x, v.y)
    const tx = p.x + 2 + clamp(v.x * 0.35, -3, 7)
    const ty = p.y + 1.2
    const tppm = this.basePpm(view) / (1 + Math.min(speed, 25) * 0.014)
    this.x += (tx - this.x) * (1 - Math.exp(-dt * 5))
    this.y += (ty - this.y) * (1 - Math.exp(-dt * 3.5))
    this.ppm += (tppm - this.ppm) * (1 - Math.exp(-dt * 2))
    this.shake *= Math.exp(-dt * 7)
  }
}

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }

/** '#rrggbb' → 'r,g,b' for rgba() strings. */
function hexRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'

/** Draws the world for one sim into any rectangle of any 2D context (screen or the vertical clip). */
export class Renderer {
  private particles: Particle[] = []
  private readonly ground: number[] = []
  private readonly vehicle: Vehicle
  private time = 0

  constructor(vehicle: Vehicle) {
    this.vehicle = vehicle
  }

  /** `ghost`: an earlier run of the same vehicle, drawn see-through. */
  draw(g: CanvasRenderingContext2D, view: View, cam: Camera, sim: Sim, best: number, dt: number, throttle: number, ghost: Sim | null = null): void {
    this.time += dt
    const map = sim.track.map
    const { w, h } = view
    const ppm = cam.ppm
    const jx = cam.shake ? (Math.random() - 0.5) * cam.shake * ppm * 0.25 : 0
    const jy = cam.shake ? (Math.random() - 0.5) * cam.shake * ppm * 0.25 : 0
    const ox = view.x + w / 2 - cam.x * ppm + jx
    const oy = view.y + h / 2 + cam.y * ppm + jy
    const sx: Fn = (x) => ox + x * ppm
    const sy: Fn = (y) => oy - y * ppm
    const halfW = w / 2 / ppm
    const x0 = cam.x - halfW - 3
    const x1 = cam.x + halfW + 3

    g.save()
    g.beginPath()
    g.rect(view.x, view.y, w, h)
    g.clip()
    this.sky(g, view, cam, map)
    this.decor(g, sim, sx, sy, ppm, x0, x1, false)
    this.terrain(g, view, cam, sim, sx, sy)
    this.surfaces(g, sim, sx, sy, ppm, x0, x1)
    this.decor(g, sim, sx, sy, ppm, x0, x1, true)
    this.signs(g, sim, sx, sy, ppm, x0, x1)
    this.rocks(g, sim, sx, sy, ppm, x0, x1)
    this.props(g, sim, sx, sy, ppm, x0, x1)
    this.markers(g, sim, sx, sy, ppm, x0, x1, best)
    this.pickups(g, sim, sx, sy, ppm, x0, x1)
    this.splats(g, sim, sx, sy, ppm)
    this.sled(g, sim, sx, sy, ppm)
    this.dust(g, sim, sx, sy, ppm, dt, throttle)
    if (ghost) {
      g.save()
      g.globalAlpha = 0.35
      this.drawVehicle(g, ghost, sx, sy, ppm)
      g.restore()
    }
    this.drawVehicle(g, sim, sx, sy, ppm)
    this.eggs(g, sim, sx, sy, ppm)
    g.restore()
  }

  private sky(g: CanvasRenderingContext2D, view: View, cam: Camera, map: MapDef) {
    const { x, y, w, h } = view
    const s = Math.min(w, h)
    const sky = g.createLinearGradient(0, y, 0, y + h)
    sky.addColorStop(0, map.sky[0])
    sky.addColorStop(1, map.sky[1])
    g.fillStyle = sky
    g.fillRect(x, y, w, h)

    if (map.night) {
      g.fillStyle = '#fff'
      for (let i = 0; i < 70; i++) {
        const hx = hash2(99, i)
        const px = (((hx % 10000) / 10000) * (w + 200) - cam.x * cam.ppm * 0.02) % (w + 200)
        const py = ((hash2(98, i) % 10000) / 10000) * h * 0.7
        g.globalAlpha = 0.4 + ((hx >> 8) % 60) / 100
        g.fillRect(x + ((px + w + 200) % (w + 200)) - 100, y + py, 2, 2)
      }
      g.globalAlpha = 1
      g.fillStyle = '#3d7bd9'
      g.beginPath()
      g.arc(x + w * 0.8, y + h * 0.2, s * 0.08, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#4caf50'
      g.beginPath()
      g.arc(x + w * 0.79, y + h * 0.19, s * 0.035, 0, Math.PI * 2)
      g.arc(x + w * 0.82, y + h * 0.225, s * 0.025, 0, Math.PI * 2)
      g.fill()
    } else {
      g.fillStyle = 'rgba(255,244,176,.35)'
      g.beginPath()
      g.arc(x + w * 0.83, y + h * 0.18, s * 0.11, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#fff4b0'
      g.beginPath()
      g.arc(x + w * 0.83, y + h * 0.18, s * 0.07, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = 'rgba(255,255,255,.92)'
      const span = w + s
      for (let i = 0; i < 4; i++) {
        const cx = x + ((((i * 0.31 + 0.1) * span - cam.x * cam.ppm * 0.08) % span) + span) % span - s * 0.3
        const cy = y + h * (0.12 + 0.09 * (i % 3))
        const r = s * (0.05 + 0.015 * (i % 2))
        g.beginPath()
        g.arc(cx, cy, r, 0, Math.PI * 2)
        g.arc(cx + r * 1.1, cy + r * 0.2, r * 0.8, 0, Math.PI * 2)
        g.arc(cx - r * 1.0, cy + r * 0.25, r * 0.7, 0, Math.PI * 2)
        g.fill()
      }
    }

    const layer = (factor: number, color: string, base: number, amp: number, freq: number, phase: number) => {
      const lift = clamp(cam.y * cam.ppm * factor * 0.5, -h * 0.25, h * 0.25)
      g.fillStyle = color
      g.beginPath()
      g.moveTo(x, y + h)
      for (let px = 0; px <= w + 10; px += 10) {
        const u = ((px - w / 2) / cam.ppm + cam.x * factor) * freq
        g.lineTo(x + px, y + h * base + lift - (Math.sin(u + phase) * 0.6 + Math.sin(u * 2.7 + phase * 2) * 0.4) * amp * h)
      }
      g.lineTo(x + w, y + h)
      g.closePath()
      g.fill()
    }
    layer(0.15, map.far, 0.56, 0.08, 0.08, 1.3)
    layer(0.35, map.near, 0.66, 0.07, 0.14, 4.1)
  }

  private decor(g: CanvasRenderingContext2D, sim: Sim, sx: Fn, sy: Fn, ppm: number, x0: number, x1: number, onSurface: boolean) {
    const kind = sim.track.map.decor
    if ((kind === 'crater') !== onSurface) return
    const step = 11
    for (let i = Math.floor(x0 / step); i <= Math.ceil(x1 / step); i++) {
      const hv = hash2(sim.track.spec.seed + 5, i)
      if (hv % 100 > 38) continue
      const x = i * step + ((hv >> 8) % 600) / 100
      if (x < WALL_X + 2) continue
      const X = sx(x)
      const Y = sy(sim.track.height(x))
      const size = (1 + ((hv >> 16) % 100) / 100) * ppm
      if (kind === 'tree') {
        g.fillStyle = '#6d4c41'
        g.fillRect(X - size * 0.12, Y - size * 1.6, size * 0.24, size * 1.7)
        g.fillStyle = '#4c9a3f'
        g.beginPath()
        g.arc(X, Y - size * 1.9, size * 0.75, 0, Math.PI * 2)
        g.arc(X - size * 0.5, Y - size * 1.5, size * 0.5, 0, Math.PI * 2)
        g.arc(X + size * 0.5, Y - size * 1.5, size * 0.5, 0, Math.PI * 2)
        g.fill()
      } else if (kind === 'cactus') {
        g.strokeStyle = '#3f8f4e'
        g.lineCap = 'round'
        g.lineWidth = size * 0.32
        g.beginPath()
        g.moveTo(X, Y)
        g.lineTo(X, Y - size * 1.8)
        g.moveTo(X, Y - size * 0.9)
        g.lineTo(X - size * 0.45, Y - size * 0.9)
        g.lineTo(X - size * 0.45, Y - size * 1.35)
        g.moveTo(X, Y - size * 1.2)
        g.lineTo(X + size * 0.45, Y - size * 1.2)
        g.lineTo(X + size * 0.45, Y - size * 1.6)
        g.stroke()
      } else if (kind === 'pine') {
        g.fillStyle = '#5d4037'
        g.fillRect(X - size * 0.1, Y - size * 0.5, size * 0.2, size * 0.6)
        for (let k = 0; k < 3; k++) {
          const top = Y - size * (1.1 + k * 0.55)
          const half = size * (0.75 - k * 0.18)
          g.fillStyle = '#2e6b4a'
          g.beginPath()
          g.moveTo(X, top - size * 0.55)
          g.lineTo(X - half, top + size * 0.15)
          g.lineTo(X + half, top + size * 0.15)
          g.closePath()
          g.fill()
          g.fillStyle = '#ffffff'
          g.beginPath()
          g.moveTo(X, top - size * 0.55)
          g.lineTo(X - half * 0.35, top - size * 0.3)
          g.lineTo(X + half * 0.35, top - size * 0.3)
          g.closePath()
          g.fill()
        }
      } else {
        g.fillStyle = 'rgba(40,42,52,.55)'
        g.beginPath()
        g.ellipse(X, Y + size * 0.08, size * 0.9, size * 0.18, 0, 0, Math.PI * 2)
        g.fill()
      }
    }
  }

  private terrain(g: CanvasRenderingContext2D, view: View, cam: Camera, sim: Sim, sx: Fn, sy: Fn) {
    const map = sim.track.map
    const halfW = view.w / 2 / cam.ppm
    const x0 = Math.floor((cam.x - halfW - 2) / TERRAIN_STEP) * TERRAIN_STEP
    const x1 = cam.x + halfW + 2
    const pts = this.ground
    pts.length = 0
    for (let x = x0; x <= x1 + TERRAIN_STEP; x += TERRAIN_STEP) pts.push(sx(x), sy(sim.track.height(x)))
    const bottom = view.y + view.h + 10

    const dirt = g.createLinearGradient(0, view.y + view.h * 0.4, 0, bottom)
    dirt.addColorStop(0, map.dirt[0])
    dirt.addColorStop(1, map.dirt[1])
    g.fillStyle = dirt
    g.beginPath()
    g.moveTo(pts[0], pts[1])
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
    g.lineTo(pts[pts.length - 2], bottom)
    g.lineTo(pts[0], bottom)
    g.closePath()
    g.fill()

    g.lineJoin = 'round'
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(pts[0], pts[1])
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
    g.strokeStyle = map.grass[0]
    g.lineWidth = Math.max(6, cam.ppm * 0.42)
    g.stroke()
    g.strokeStyle = map.grass[1]
    g.lineWidth = Math.max(3, cam.ppm * 0.22)
    g.stroke()

    if (x0 < WALL_X + 2) {
      const wx = sx(WALL_X - 1)
      const top = sy(14)
      g.fillStyle = '#6b7280'
      g.fillRect(wx, top, cam.ppm, sy(0) - top)
      g.strokeStyle = '#4b5563'
      g.lineWidth = 2
      for (let yy = sy(0); yy > top; yy -= cam.ppm * 0.5) {
        g.beginPath()
        g.moveTo(wx, yy)
        g.lineTo(wx + cam.ppm, yy)
        g.stroke()
      }
    }
  }

  /** Mud (sand, snow drifts) and ice painted over the ground line. */
  private surfaces(g: CanvasRenderingContext2D, sim: Sim, sx: Fn, sy: Fn, ppm: number, x0: number, x1: number) {
    const track = sim.track
    const step = 0.5
    let x = Math.floor(x0 / step) * step
    while (x < x1) {
      const kind = track.surfaceAt(x + step / 2)
      if (kind === 'ground') {
        x += step
        continue
      }
      const a = x
      while (x < x1 + 2 && track.surfaceAt(x + step / 2) === kind) x += step
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.beginPath()
      for (let xx = a; xx <= x + 1e-9; xx += step) {
        const X = sx(xx)
        const Y = sy(track.height(xx))
        if (xx === a) g.moveTo(X, Y)
        else g.lineTo(X, Y)
      }
      if (kind === 'mud') {
        const [light, dark] = track.map.mud
        g.strokeStyle = dark
        g.lineWidth = ppm * 0.6
        g.stroke()
        g.strokeStyle = light
        g.lineWidth = ppm * 0.36
        g.stroke()
        g.fillStyle = dark
        for (let xx = a + 0.4; xx < x; xx += 0.9) {
          const wob = Math.sin(xx * 3.1 + this.time * 2) * 0.05
          g.beginPath()
          g.arc(sx(xx), sy(track.height(xx) + 0.06 + wob), ppm * (0.05 + 0.03 * Math.sin(xx * 7)), 0, Math.PI * 2)
          g.fill()
        }
      } else {
        g.strokeStyle = '#8fd3ff'
        g.lineWidth = ppm * 0.5
        g.stroke()
        g.strokeStyle = '#e6f7ff'
        g.lineWidth = ppm * 0.22
        g.stroke()
        g.fillStyle = '#ffffff'
        for (let xx = a + 0.7; xx < x; xx += 2.3) g.fillRect(sx(xx), sy(track.height(xx) + 0.12), ppm * 0.35, ppm * 0.06)
      }
    }
  }

  /** A little warning sign before mud, ice and bridges, so the player sees what is coming. */
  private signs(g: CanvasRenderingContext2D, sim: Sim, sx: Fn, sy: Fn, ppm: number, x0: number, x1: number) {
    const icon: Partial<Record<FeatureKind, string>> = { mud: sim.track.map.decor === 'pine' ? '❄️' : sim.track.map.decor === 'cactus' ? '🏜️' : '🟤', ice: '🧊', bridge: '🌉' }
    for (const seg of sim.track.segmentsIn(x0, x1 + 8)) {
      for (const f of seg.features) {
        const ch = icon[f.kind]
        const x = f.x - 4
        if (!ch || x < x0 || x > x1) continue
        const X = sx(x)
        const Y = sy(sim.track.height(x))
        g.fillStyle = '#7a5530'
        g.fillRect(X - ppm * 0.05, Y - ppm * 1.3, ppm * 0.1, ppm * 1.3)
        g.fillStyle = '#ffd23f'
        g.strokeStyle = '#3d2b16'
        g.lineWidth = Math.max(1.5, ppm * 0.05)
        g.beginPath()
        g.roundRect(X - ppm * 0.42, Y - ppm * 2.1, ppm * 0.84, ppm * 0.84, ppm * 0.12)
        g.fill()
        g.stroke()
        g.font = `${Math.round(ppm * 0.55)}px ${EMOJI_FONT}`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(ch, X, Y - ppm * 1.66)
      }
    }
  }

  /** Logs and bridge planks (physics bodies). */
  private props(g: CanvasRenderingContext2D, sim: Sim, sx: Fn, sy: Fn, ppm: number, x0: number, x1: number) {
    for (const p of sim.props) {
      const pos = p.body.getPosition()
      if (pos.x < x0 - 2 || pos.x > x1 + 2) continue
      g.save()
      g.translate(sx(pos.x), sy(pos.y))
      g.rotate(-p.body.getAngle())
      if (p.kind === 'log') {
        const R = p.w * ppm
        g.fillStyle = '#8d5a2b'
        g.beginPath()
        g.arc(0, 0, R, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = '#5b3a1a'
        g.lineWidth = Math.max(1.5, R * 0.14)
        g.stroke()
        g.strokeStyle = '#c99a6a'
        g.lineWidth = Math.max(1, R * 0.08)
        for (const k of [0.62, 0.32]) {
          g.beginPath()
          g.arc(0, 0, R * k, 0, Math.PI * 2)
          g.stroke()
        }
        g.strokeStyle = '#5b3a1a'
        g.beginPath()
        g.moveTo(0, 0)
        g.lineTo(R * 0.9, 0)
        g.stroke()
      } else {
        const W = p.w * ppm
        const H = p.h * ppm
        g.fillStyle = '#a8743f'
        g.fillRect(-W / 2, -H / 2, W, H)
        g.strokeStyle = '#6d4724'
        g.lineWidth = Math.max(1, ppm * 0.04)
        g.strokeRect(-W / 2, -H / 2, W, H)
        g.fillStyle = '#4a3018'
        g.fillRect(-W / 2 + ppm * 0.12, -ppm * 0.03, ppm * 0.06, ppm * 0.06)
        g.fillRect(W / 2 - ppm * 0.18, -ppm * 0.03, ppm * 0.06, ppm * 0.06)
      }
      g.restore()
    }
  }

  private rocks(g: CanvasRenderingContext2D, sim: Sim, sx: Fn, sy: Fn, ppm: number, x0: number, x1: number) {
    const style = sim.track.map.rock
    for (const seg of sim.track.segmentsIn(x0, x1)) {
      for (const r of seg.rocks) {
        if (r.x < x0 || r.x > x1) continue
        const X = sx(r.x)
        const Y = sy(sim.track.height(r.x) + r.r * ROCK_LIFT)
        const R = r.r * ppm
        const fill = { hay: '#e9c46a', stone: '#a1887f', snowball: '#f4f8ff', moonrock: '#9a9ca6' }[style]
        g.fillStyle = fill
        g.beginPath()
        g.arc(X, Y, R, 0, Math.PI * 2)
        g.fill()
        g.lineWidth = Math.max(1.5, R * 0.12)
        g.strokeStyle = { hay: '#c99a2e', stone: '#6d5a52', snowball: '#b8cbe6', moonrock: '#6b6d78' }[style]
        g.stroke()
        if (style === 'hay') {
          g.beginPath()
          g.arc(X, Y, R * 0.55, 0.3, Math.PI * 1.6)
          g.arc(X, Y, R * 0.25, Math.PI * 1.6, Math.PI * 3)
          g.stroke()
        } else {
          g.fillStyle = 'rgba(255,255,255,.35)'
          g.beginPath()
          g.arc(X - R * 0.3, Y - R * 0.3, R * 0.25, 0, Math.PI * 2)
          g.fill()
        }
      }
    }
  }

  private markers(g: CanvasRenderingContext2D, sim: Sim, sx: Fn, sy: Fn, ppm: number, x0: number, x1: number, best: number) {
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const sign = (x: number, text: string, color: string) => {
      const X = sx(x)
      const Y = sy(sim.track.height(x))
      g.fillStyle = '#6d4c41'
      g.fillRect(X - ppm * 0.06, Y - ppm * 1.7, ppm * 0.12, ppm * 1.7)
      g.fillStyle = color
      g.strokeStyle = '#333'
      g.lineWidth = Math.max(1.5, ppm * 0.04)
      g.beginPath()
      g.roundRect(X - ppm * 0.75, Y - ppm * 2.35, ppm * 1.5, ppm * 0.7, ppm * 0.12)
      g.fill()
      g.stroke()
      g.fillStyle = '#222'
      g.font = `800 ${Math.round(ppm * 0.38)}px system-ui, sans-serif`
      g.fillText(text, X, Y - ppm * 2.0)
    }

    if (sim.sled) {
      const base = sim.sledStartX
      for (let m = 10; m <= PULL_FULL; m += 10) {
        const x = base + m
        if (x < x0 || x > x1) continue
        g.fillStyle = m === PULL_FULL ? '#e63946' : 'rgba(255,255,255,.8)'
        g.fillRect(sx(x) - ppm * 0.05, sy(0), ppm * 0.1, ppm * 0.5)
        if (m === PULL_FULL) sign(x, '🏆 100 m', '#ffd23f')
        else sign(x, `${m} m`, '#fff')
      }
      return
    }

    const from = Math.max(0, Math.ceil((x0 - START_X) / 50) * 50)
    for (let m = from; START_X + m <= x1; m += 50) sign(START_X + m, m === 0 ? 'START' : `${m} m`, m === 0 ? '#ffd23f' : '#fff')

    const fx = sim.track.finishX
    if (fx !== null && fx > x0 - 2 && fx < x1 + 2) {
      const X = sx(fx)
      const Y = sy(sim.track.height(fx))
      const top = Y - ppm * 4
      g.fillStyle = '#333'
      g.fillRect(X - ppm * 0.08, top, ppm * 0.16, Y - top)
      const cell = ppm * 0.3
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 2; j++) {
          g.fillStyle = (i + j) % 2 ? '#fff' : '#111'
          g.fillRect(X + ppm * 0.08 + i * cell, top + j * cell, cell, cell)
        }
      }
      g.fillStyle = '#111'
      g.font = `900 ${Math.round(ppm * 0.5)}px system-ui, sans-serif`
      g.fillText(t.finishLine, X + ppm * 1.3, top - ppm * 0.4)
    }

    if (fx === null && best > 5) {
      const bx = START_X + best
      if (bx > x0 && bx < x1) {
        const X = sx(bx)
        const Y = sy(sim.track.height(bx))
        g.fillStyle = '#333'
        g.fillRect(X - ppm * 0.05, Y - ppm * 3, ppm * 0.1, ppm * 3)
        const fw = ppm * 1.1
        const fh = ppm * 0.7
        const cell = fw / 4
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 2; j++) {
            g.fillStyle = (i + j) % 2 ? '#fff' : '#e63946'
            g.fillRect(X + i * cell, Y - ppm * 3 + j * (fh / 2), cell, fh / 2)
          }
        }
        g.fillStyle = '#e63946'
        g.font = `900 ${Math.round(ppm * 0.4)}px system-ui, sans-serif`
        g.fillText(`🏆 ${Math.round(best)} m`, X, Y - ppm * 3.4)
      }
    }
  }

  private pickups(g: CanvasRenderingContext2D, sim: Sim, sx: Fn, sy: Fn, ppm: number, x0: number, x1: number) {
    for (const seg of sim.track.segmentsIn(x0, x1)) {
      for (const p of seg.pickups) {
        if (p.x < x0 || p.x > x1 || sim.collected.has(p.id)) continue
        const X = sx(p.x)
        const Y = sy(p.y)
        if (p.kind === 'coin') {
          const R = ppm * 0.32
          const k = Math.abs(Math.cos(this.time * 3 + p.x))
          g.fillStyle = '#f4b400'
          g.beginPath()
          g.ellipse(X, Y, Math.max(1, R * k), R, 0, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = '#ffe066'
          g.beginPath()
          g.ellipse(X, Y, Math.max(0.5, R * 0.68 * k), R * 0.68, 0, 0, Math.PI * 2)
          g.fill()
        } else if (p.kind === 'fuel') {
          const w = ppm * 0.62
          const h = ppm * 0.78
          g.fillStyle = '#d62828'
          g.beginPath()
          g.roundRect(X - w / 2, Y - h / 2, w, h, ppm * 0.08)
          g.fill()
          g.fillStyle = '#9d0208'
          g.fillRect(X - w * 0.15, Y - h / 2 - ppm * 0.14, w * 0.3, ppm * 0.16)
          g.fillStyle = '#ffd23f'
          g.font = `900 ${Math.round(ppm * 0.42)}px system-ui, sans-serif`
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          g.fillText('F', X, Y + ppm * 0.03)
        } else {
          const R = ppm * 0.55
          const bob = Math.sin(this.time * 3 + p.x) * ppm * 0.12
          g.fillStyle = '#ffd23f'
          g.strokeStyle = '#fff'
          g.lineWidth = Math.max(2, ppm * 0.06)
          g.beginPath()
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5
            const r = i % 2 ? R * 0.45 : R
            g.lineTo(X + Math.cos(a) * r, Y + bob + Math.sin(a) * r)
          }
          g.closePath()
          g.fill()
          g.stroke()
        }
      }
    }
  }

  private splats(g: CanvasRenderingContext2D, sim: Sim, sx: Fn, sy: Fn, ppm: number) {
    for (const s of sim.splats) {
      const X = sx(s.x)
      const Y = sy(s.y) - ppm * 0.05
      g.fillStyle = '#fffdf5'
      g.beginPath()
      g.ellipse(X, Y, ppm * 0.38, ppm * 0.1, 0, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#ffb703'
      g.beginPath()
      g.ellipse(X + ppm * 0.05, Y - ppm * 0.03, ppm * 0.12, ppm * 0.07, 0, 0, Math.PI * 2)
      g.fill()
    }
  }

  private sled(g: CanvasRenderingContext2D, sim: Sim, sx: Fn, sy: Fn, ppm: number) {
    if (!sim.sled || !sim.hitch || sim.config.mode.kind !== 'pull') return
    const p = sim.sled.getPosition()
    const hitch = sim.chassis.getWorldPoint(sim.hitch)
    g.strokeStyle = '#7b5e3b'
    g.lineWidth = Math.max(2, ppm * 0.07)
    g.beginPath()
    g.moveTo(sx(hitch.x), sy(hitch.y))
    g.lineTo(sx(p.x + 0.75), sy(p.y))
    g.stroke()
    const X = sx(p.x)
    const Y = sy(p.y)
    g.fillStyle = '#a0522d'
    g.beginPath()
    g.roundRect(X - ppm * 0.75, Y - ppm * 0.25, ppm * 1.5, ppm * 0.5, ppm * 0.08)
    g.fill()
    g.fillStyle = '#5d4037'
    g.fillRect(X - ppm * 0.85, Y + ppm * 0.18, ppm * 1.7, ppm * 0.08)
    g.font = `${Math.round(ppm * 1.5)}px ${EMOJI_FONT}`
    g.textAlign = 'center'
    g.textBaseline = 'bottom'
    g.fillText(sim.config.mode.load.emoji, X, Y - ppm * 0.18)
  }

  private dust(g: CanvasRenderingContext2D, sim: Sim, sx: Fn, sy: Fn, ppm: number, dt: number, throttle: number) {
    const dustColor = { tree: '160,120,80', cactus: '222,184,120', pine: '255,255,255', crater: '185,187,196' }[sim.track.map.decor]
    const mudColor = hexRgb(sim.track.map.mud[1])
    const speed = Math.abs(sim.chassis.getLinearVelocity().x)
    if (throttle > 0 && (speed > 1.5 || sim.mudWheels > 0)) {
      sim.wheels.forEach((wb, i) => {
        const p = wb.getPosition()
        const r = sim.geom.wheels[i].r
        const mud = sim.track.surfaceAt(p.x) === 'mud'
        if (p.y - r - sim.track.height(p.x) < 0.2 && Math.random() < (mud ? 0.9 : 0.5) && this.particles.length < 90) {
          this.particles.push({
            color: mud ? mudColor : dustColor,
            x: p.x - r * 0.6,
            y: p.y - r * 0.8,
            vx: -1 - Math.random() * 2,
            vy: 0.5 + Math.random() * 1.5,
            life: 0,
            max: 0.5 + Math.random() * 0.5,
            size: 0.12 + Math.random() * 0.18,
          })
        }
      })
    }
    const live: Particle[] = []
    for (const p of this.particles) {
      p.life += dt
      if (p.life >= p.max) continue
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy -= 1.5 * dt
      g.fillStyle = `rgba(${p.color},${0.55 * (1 - p.life / p.max)})`
      g.beginPath()
      g.arc(sx(p.x), sy(p.y), (p.size + p.life * 0.4) * ppm, 0, Math.PI * 2)
      g.fill()
      live.push(p)
    }
    this.particles = live
  }

  private drawVehicle(g: CanvasRenderingContext2D, sim: Sim, sx: Fn, sy: Fn, ppm: number) {
    const v = this.vehicle
    const geom = geomOf(v)
    const k = geom.scale * ppm
    const p = sim.chassis.getPosition()
    g.save()
    g.translate(sx(p.x), sy(p.y))
    g.rotate(-sim.chassis.getAngle())
    g.drawImage(v.sprite, -geom.origin.x * k, -geom.origin.y * k, v.sprite.width * k, v.sprite.height * k)
    const b = sim.basket
    if (b) {
      const wall = 0.07 * ppm
      g.fillStyle = '#b07d4f'
      g.strokeStyle = '#6d4c2f'
      g.lineWidth = Math.max(1, ppm * 0.02)
      const left = (b.x - b.w / 2) * ppm
      const floorY = -b.y * ppm
      g.fillRect(left - wall, floorY - wall, b.w * ppm + wall * 2, wall)
      g.fillRect(left - wall, floorY - b.h * ppm, wall, b.h * ppm)
      g.fillRect(left + b.w * ppm, floorY - b.h * ppm, wall, b.h * ppm)
      g.strokeRect(left - wall, floorY - b.h * ppm, b.w * ppm + wall * 2, b.h * ppm)
    }
    g.restore()
    sim.wheels.forEach((wb, i) => {
      const wp = wb.getPosition()
      g.save()
      g.translate(sx(wp.x), sy(wp.y))
      g.rotate(-wb.getAngle())
      drawWheel(g, geom.wheels[i].r * ppm, wheelSpriteOf(v, i))
      g.restore()
    })
  }

  private eggs(g: CanvasRenderingContext2D, sim: Sim, sx: Fn, sy: Fn, ppm: number) {
    for (const egg of sim.eggs) {
      const p = egg.getPosition()
      g.save()
      g.translate(sx(p.x), sy(p.y))
      g.rotate(-egg.getAngle())
      g.fillStyle = '#fff8ec'
      g.strokeStyle = '#d9c9a8'
      g.lineWidth = Math.max(1, ppm * 0.02)
      g.beginPath()
      g.ellipse(0, -EGG_RADIUS * ppm * 0.1, EGG_RADIUS * ppm, EGG_RADIUS * ppm * 1.22, 0, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.restore()
    }
  }
}
