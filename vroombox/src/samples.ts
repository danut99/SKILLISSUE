import type { Pt } from './geometry/poly.ts'
import { t } from './i18n.ts'
import { ctx2d, makeCanvas } from './util/image.ts'
import { shapeSprite } from './util/sticker.ts'
import type { Vehicle } from './vehicle.ts'

function tractorTire(size = 160): HTMLCanvasElement {
  const c = makeCanvas(size, size)
  const g = ctx2d(c)
  const r = size / 2
  g.translate(r, r)
  g.fillStyle = '#1b1b1b'
  g.beginPath()
  g.arc(0, 0, r, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#343434'
  for (let i = 0; i < 16; i++) {
    g.save()
    g.rotate((i / 16) * Math.PI * 2)
    g.beginPath()
    g.moveTo(r * 0.74, -r * 0.13)
    g.lineTo(r * 0.98, -r * 0.02)
    g.lineTo(r * 0.98, r * 0.1)
    g.lineTo(r * 0.74, 0)
    g.closePath()
    g.fill()
    g.restore()
  }
  g.fillStyle = '#ffb703'
  g.beginPath()
  g.arc(0, 0, r * 0.56, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#d98e04'
  g.lineWidth = r * 0.08
  g.beginPath()
  g.arc(0, 0, r * 0.42, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = '#6c757d'
  g.beginPath()
  g.arc(0, 0, r * 0.2, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#343a40'
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    g.beginPath()
    g.arc(Math.cos(a) * r * 0.31, Math.sin(a) * r * 0.31, r * 0.045, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

function tractor(): Vehicle {
  const W = 340
  const H = 232
  const outline: Pt[] = [
    { x: 12, y: 22 }, { x: 142, y: 22 }, { x: 142, y: 122 }, { x: 262, y: 122 }, { x: 262, y: 62 },
    { x: 276, y: 62 }, { x: 276, y: 122 }, { x: 322, y: 122 }, { x: 322, y: 208 }, { x: 12, y: 208 },
  ]
  const sprite = shapeSprite(W, H, outline, (g) => {
    g.fillStyle = '#d62828'
    g.fillRect(0, 0, W, H)
    const shade = g.createLinearGradient(0, 120, 0, 210)
    shade.addColorStop(0, 'rgba(0,0,0,0)')
    shade.addColorStop(1, 'rgba(0,0,0,0.28)')
    g.fillStyle = shade
    g.fillRect(0, 120, W, 100)
    g.fillStyle = '#3d0c11'
    g.fillRect(0, 0, 150, 36)
    g.fillStyle = '#a8dadc'
    g.beginPath()
    g.roundRect(30, 48, 94, 66, 10)
    g.fill()
    g.strokeStyle = '#3d0c11'
    g.lineWidth = 6
    g.stroke()
    g.strokeStyle = 'rgba(255,255,255,.75)'
    g.lineWidth = 7
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(50, 100)
    g.lineTo(76, 64)
    g.stroke()
    g.fillStyle = '#333'
    g.fillRect(262, 50, 14, 80)
    g.fillStyle = '#111'
    g.fillRect(258, 60, 22, 8)
    g.strokeStyle = 'rgba(0,0,0,.25)'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(150, 152)
    g.lineTo(298, 152)
    g.moveTo(134, 42)
    g.lineTo(134, 118)
    g.stroke()
    g.fillStyle = '#2b2d42'
    g.fillRect(304, 128, 20, 82)
    g.strokeStyle = '#8d99ae'
    g.lineWidth = 3
    for (let y = 136; y < 206; y += 10) {
      g.beginPath()
      g.moveTo(306, y)
      g.lineTo(322, y)
      g.stroke()
    }
    g.fillStyle = '#ffd166'
    g.beginPath()
    g.arc(292, 142, 9, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#9d0208'
    g.beginPath()
    g.arc(80, 204, 84, Math.PI, 0)
    g.fill()
  })
  return {
    id: 'sample-tractor',
    name: t.sampleTractor,
    sample: true,
    createdAt: 0,
    sprite,
    outline,
    wheels: [
      { x: 80, y: 200, r: 70 },
      { x: 282, y: 212, r: 44 },
    ],
    wheelStyle: 'own',
    wheelSprites: [tractorTire(), tractorTire()],
    wheelDesigns: ['offroad', 'offroad'],
    engine: { kind: 'synth' },
  }
}

function loafOutline(): Pt[] {
  const P0 = { x: 16, y: 186 }
  const C1 = { x: 6, y: -18 }
  const C2 = { x: 374, y: -18 }
  const P3 = { x: 364, y: 186 }
  const pts: Pt[] = []
  for (let i = 0; i <= 28; i++) {
    const s = i / 28
    const a = (1 - s) ** 3
    const b = 3 * (1 - s) ** 2 * s
    const c = 3 * (1 - s) * s ** 2
    const d = s ** 3
    pts.push({ x: a * P0.x + b * C1.x + c * C2.x + d * P3.x, y: a * P0.y + b * C1.y + c * C2.y + d * P3.y })
  }
  return pts
}

function bread(): Vehicle {
  const W = 380
  const H = 200
  const outline = loafOutline()
  const sprite = shapeSprite(W, H, outline, (g) => {
    const crust = g.createLinearGradient(0, 20, 0, 192)
    crust.addColorStop(0, '#eab676')
    crust.addColorStop(0.6, '#c98a43')
    crust.addColorStop(1, '#93571f')
    g.fillStyle = crust
    g.fillRect(0, 0, W, H)
    g.strokeStyle = '#f6dca8'
    g.lineWidth = 11
    g.lineCap = 'round'
    for (const x of [130, 196, 262]) {
      g.beginPath()
      g.moveTo(x - 20, 62)
      g.quadraticCurveTo(x + 10, 92, x - 4, 138)
      g.stroke()
    }
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    g.fillStyle = 'rgba(255,255,255,.5)'
    for (let i = 0; i < 70; i++) {
      g.beginPath()
      g.arc(40 + rnd() * 300, 40 + rnd() * 110, 1 + rnd() * 2.2, 0, Math.PI * 2)
      g.fill()
    }
  })
  return {
    id: 'sample-bread',
    name: t.sampleBread,
    sample: true,
    createdAt: 0,
    sprite,
    outline,
    wheels: [
      { x: 92, y: 180, r: 40 },
      { x: 288, y: 180, r: 40 },
    ],
    wheelStyle: 'classic',
    wheelSprites: [],
    engine: { kind: 'synth' },
  }
}

function box(): Vehicle {
  const W = 360
  const H = 240
  const outline: Pt[] = [
    { x: 12, y: 12 }, { x: 348, y: 12 }, { x: 348, y: 228 }, { x: 12, y: 228 },
  ]
  const sprite = shapeSprite(W, H, outline, (g) => {
    g.fillStyle = '#c8955a'
    g.fillRect(0, 0, W, H)
    g.strokeStyle = '#a3713c'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(12, 60)
    g.lineTo(348, 60)
    g.stroke()
    g.fillStyle = 'rgba(240,214,160,.85)'
    g.fillRect(160, 0, 40, H)
    g.save()
    g.translate(268, 150)
    g.rotate(-0.14)
    g.strokeStyle = '#d62828'
    g.lineWidth = 5
    g.strokeRect(-74, -28, 148, 56)
    g.fillStyle = '#d62828'
    g.font = '900 34px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(t.sampleFragile, 0, 2)
    g.restore()
    g.strokeStyle = '#2b2b2b'
    g.lineWidth = 6
    g.lineCap = 'round'
    g.lineJoin = 'round'
    for (const x of [62, 104]) {
      g.beginPath()
      g.moveTo(x, 170)
      g.lineTo(x, 110)
      g.moveTo(x - 14, 126)
      g.lineTo(x, 110)
      g.lineTo(x + 14, 126)
      g.stroke()
    }
  })
  return {
    id: 'sample-box',
    name: t.sampleBox,
    sample: true,
    createdAt: 0,
    sprite,
    outline,
    wheels: [
      { x: 70, y: 226, r: 38 },
      { x: 290, y: 226, r: 38 },
    ],
    wheelStyle: 'classic',
    wheelSprites: [],
    engine: { kind: 'synth' },
  }
}

let cache: Vehicle[] | null = null

export function sampleVehicles(): Vehicle[] {
  cache ??= [tractor(), bread(), box()]
  return cache
}
