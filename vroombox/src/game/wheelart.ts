/**
 * The wheels players put on their drawings: a few designs at any size. Sport and off-road rims take the
 * color picked in the palette. The editor paints them live and the game uses the same art as sprites,
 * so the preview on the drawing is exactly what drives.
 */
import { ctx2d, makeCanvas } from '../util/image.ts'
import { drawClassicWheel } from './paint.ts'

export const WHEEL_DESIGNS = ['classic', 'sport', 'offroad', 'donut', 'ball', 'cookie'] as const
export type WheelDesign = (typeof WHEEL_DESIGNS)[number]
export type WheelLook = { design: WheelDesign; color: string }

const EMOJI: Partial<Record<WheelDesign, string>> = { donut: '🍩', ball: '⚽', cookie: '🍪' }
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'

function rgbOf(color: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  const n = m ? parseInt(m[1], 16) : 0x888888
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** `color` moved toward white (to = 255) or black (to = 0) by t. */
function shade(color: string, to: number, t: number): string {
  const [r, g, b] = rgbOf(color).map((c) => Math.round(c + (to - c) * t))
  return `rgb(${r},${g},${b})`
}

const isDark = (color: string) => {
  const [r, g, b] = rgbOf(color)
  return 0.299 * r + 0.587 * g + 0.114 * b < 70
}

function disc(g: CanvasRenderingContext2D, r: number, fill: string | CanvasGradient) {
  g.fillStyle = fill
  g.beginPath()
  g.arc(0, 0, r, 0, Math.PI * 2)
  g.fill()
}

function sport(g: CanvasRenderingContext2D, r: number, color: string) {
  disc(g, r, '#17171b')
  g.strokeStyle = '#2d2d34'
  g.lineWidth = r * 0.05
  g.beginPath()
  g.arc(0, 0, r * 0.86, 0, Math.PI * 2)
  g.stroke()
  const rim = r * 0.72
  const light = g.createRadialGradient(-rim * 0.35, -rim * 0.35, rim * 0.1, 0, 0, rim)
  light.addColorStop(0, shade(color, 255, 0.5))
  light.addColorStop(1, color)
  disc(g, rim, light)
  g.fillStyle = isDark(color) ? '#5a5a64' : '#1d1d22'
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 10
    g.beginPath()
    g.arc(0, 0, rim * 0.84, a - 0.4, a + 0.4)
    g.arc(0, 0, rim * 0.34, a + 0.28, a - 0.28, true)
    g.closePath()
    g.fill()
  }
  disc(g, rim * 0.24, shade(color, 255, 0.3))
  disc(g, rim * 0.08, '#1d1d22')
}

function offroad(g: CanvasRenderingContext2D, r: number, color: string) {
  g.fillStyle = '#18181b'
  for (let i = 0; i < 14; i++) {
    g.save()
    g.rotate((i / 14) * Math.PI * 2)
    g.beginPath()
    g.roundRect(r * 0.74, -r * 0.13, r * 0.26, r * 0.26, r * 0.05)
    g.fill()
    g.restore()
  }
  disc(g, r * 0.86, '#27272c')
  g.strokeStyle = '#36363d'
  g.lineWidth = r * 0.05
  g.beginPath()
  g.arc(0, 0, r * 0.62, 0, Math.PI * 2)
  g.stroke()
  disc(g, r * 0.46, color)
  g.fillStyle = shade(color, 0, 0.4)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    g.beginPath()
    g.arc(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3, r * 0.05, 0, Math.PI * 2)
    g.fill()
  }
  disc(g, r * 0.13, shade(color, 255, 0.35))
}

/** How to draw an emoji so its visible glyph exactly fills a circle of radius r: font = scale·r, offset (dx, dy)·r. */
type EmojiFit = { scale: number; dx: number; dy: number }
const emojiFits = new Map<string, EmojiFit>()

function emojiFit(ch: string): EmojiFit {
  let fit = emojiFits.get(ch)
  if (fit) return fit
  const S = 160
  const c = makeCanvas(S * 2, S * 2)
  const g = ctx2d(c, true)
  g.font = `${S}px ${EMOJI_FONT}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(ch, S, S)
  const d = g.getImageData(0, 0, S * 2, S * 2).data
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < S * 2; y++) {
    for (let x = 0; x < S * 2; x++) {
      if (d[(y * S * 2 + x) * 4 + 3] < 24) continue
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
  }
  const side = Math.max(x1 - x0 + 1, y1 - y0 + 1)
  fit = x1 < 0 ? { scale: 1.6, dx: 0, dy: 0 } : { scale: (2 * S) / side, dx: (-2 * ((x0 + x1 + 1) / 2 - S)) / side, dy: (-2 * ((y0 + y1 + 1) / 2 - S)) / side }
  emojiFits.set(ch, fit)
  return fit
}

/** Paints a wheel centered at (0, 0). */
export function paintWheel(g: CanvasRenderingContext2D, r: number, look: WheelLook): void {
  const ch = EMOJI[look.design]
  if (ch) {
    const fit = emojiFit(ch)
    g.font = `${fit.scale * r}px ${EMOJI_FONT}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(ch, fit.dx * r, fit.dy * r)
  } else if (look.design === 'sport') sport(g, r, look.color)
  else if (look.design === 'offroad') offroad(g, r, look.color)
  else drawClassicWheel(g, r)
}

/** The wheel as a square sprite (the circle fills it), which the game spins. */
export function wheelSprite(look: WheelLook, size = 256): HTMLCanvasElement {
  const c = makeCanvas(size, size)
  const g = ctx2d(c)
  g.translate(size / 2, size / 2)
  paintWheel(g, size / 2, look)
  return c
}
