import type { MapId } from './maps.ts'

const palettes: Record<MapId, string[]> = {
  farm: ['#f8ecd3', '#b6cbb0', '#7fa887', '#547d61', '#e7b1b8'],
  desert: ['#fff0ce', '#c3cf94', '#8eaf71', '#60864e', '#e7c765'],
  moon: ['#f9e3cd', '#d0b48b', '#b58e65', '#996f46', '#d58b51'],
  snow: ['#edf0f7', '#c8d3e2', '#9fbbce', '#638b99', '#e5eff4'],
}
// All world art is canvas geometry. No image assets need loading.
export function preloadWorldArt(): void {}
export function worldPreview(map: MapId): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 400
  canvas.className = 'world-preview'; canvas.setAttribute('aria-hidden', 'true')
  const g = canvas.getContext('2d')!
  drawBackdrop(g, map, 0, 0, 600, 400, 0)
  for (let i = 0; i < 5; i++) drawSceneryArt(g, map, 65 + i * 125, 370, 85 + i % 2 * 40)
  return canvas
}
export function drawBackdrop(g: CanvasRenderingContext2D, map: MapId, x: number, y: number, w: number, h: number, travel: number): boolean {
  const p = palettes[map]
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip()
  g.fillStyle = p[0]; g.fillRect(x, y, w, h)
  g.fillStyle = map === 'snow' ? '#fff9e7' : '#edc572'
  g.beginPath(); g.arc(x + w * .8, y + h * .18, Math.min(w, h) * .065, 0, Math.PI * 2); g.fill()
  for (let i = 0; i < 6; i++) {
    const cx = x + ((i * 227 - travel * .035) % (w + 280) + w + 280) % (w + 280) - 100
    const cy = y + h * (.13 + i % 3 * .065)
    g.fillStyle = '#ffffff99'; g.strokeStyle = '#8198a344'; g.lineWidth = 1.3
    g.beginPath(); g.ellipse(cx, cy, 43, 13, -.05, 0, Math.PI * 2); g.fill(); g.stroke()
  }
  for (let layer = 0; layer < 3; layer++) {
    g.fillStyle = p[layer + 1]; g.strokeStyle = '#52654a33'; g.lineWidth = 1.4
    g.beginPath(); g.moveTo(x, y + h)
    for (let px = 0; px <= w + 8; px += 8) {
      const u = (px + travel * (.06 + layer * .055)) / (170 - layer * 28)
      g.lineTo(x + px, y + h * (.57 + layer * .13) + Math.sin(u) * h * .047 + Math.sin(u * 2.1 + layer) * h * .022)
    }
    g.lineTo(x + w + 8, y + h); g.closePath(); g.fill(); g.stroke()
  }
  // Distant trees move more slowly than the road and never imply physical obstacles.
  g.save(); g.globalAlpha = .48
  const spacing = 145
  const offset = travel * .12
  const first = Math.floor(offset / spacing) - 1
  for (let i = first; i < first + Math.ceil(w / spacing) + 3; i++) {
    const px = i * spacing - offset
    const rise = Math.sin(i * 1.7) * h * .025
    drawSceneryArt(g, map, x + px, y + h * .78 + rise, h * (.12 + (Math.sin(i * 3.1) + 1) * .035))
  }
  g.restore()
  g.strokeStyle = '#785e3e0c'; g.lineWidth = .7
  for (let i = 0; i < 180; i++) {
    const px = x + (i * 137.51 % w), py = y + (i * 73.79 % h)
    g.beginPath(); g.moveTo(px, py); g.lineTo(px + 7, py - 3); g.stroke()
  }
  g.restore(); return true
}
export function drawSceneryArt(g: CanvasRenderingContext2D, map: MapId, x: number, bottom: number, height: number): boolean {
  const p = palettes[map]
  g.save(); g.translate(x, bottom); g.scale(height, height)
  g.lineCap = 'round'; g.strokeStyle = '#765c45'; g.lineWidth = .045
  g.beginPath(); g.moveTo(0, 0); g.lineTo(.015, -.74); g.moveTo(0, -.37); g.lineTo(-.19, -.62); g.moveTo(.01, -.5); g.lineTo(.2, -.75); g.stroke()
  if (map === 'snow') {
    for (let i = 0; i < 3; i++) {
      const top = -.98 + i * .2, width = .17 + i * .065
      g.fillStyle = p[3]; g.beginPath(); g.moveTo(0, top); g.lineTo(width, top + .4); g.lineTo(-width, top + .4); g.closePath(); g.fill()
      g.fillStyle = '#edf4f4'; g.beginPath(); g.moveTo(0, top); g.lineTo(width * .8, top + .27); g.lineTo(-width * .8, top + .24); g.closePath(); g.fill()
    }
  } else {
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4
      g.fillStyle = i % 3 === 0 ? p[4] : i % 2 ? p[2] : p[3]
      g.strokeStyle = '#53604733'; g.lineWidth = .008
      g.beginPath(); g.ellipse(Math.cos(a) * .17, -.69 + Math.sin(a) * .14, .2, .19, a, 0, Math.PI * 2); g.fill(); g.stroke()
    }
  }
  g.restore(); return true
}
export function drawRockArt(g: CanvasRenderingContext2D, map: MapId, variant: number, x: number, y: number, radius: number): boolean {
  g.save(); g.translate(x, y)
  g.fillStyle = map === 'snow' ? '#d5e2ea' : '#a29b87'; g.strokeStyle = '#655f53'; g.lineWidth = Math.max(1, radius * .045)
  g.beginPath()
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, r = radius * (.84 + .12 * Math.sin(i * 7 + variant))
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  g.closePath(); g.fill(); g.stroke()
  g.strokeStyle = '#ffffff66'; g.beginPath(); g.moveTo(-radius * .5, -radius * .3); g.lineTo(radius * .1, -radius * .65); g.lineTo(radius * .5, -radius * .25); g.stroke()
  g.restore(); return true
}
const groundTiles = new Map<MapId, HTMLCanvasElement>()
export function groundTexture(g: CanvasRenderingContext2D, map: MapId, scale: number, x: number, y: number): CanvasPattern | null {
  let tile = groundTiles.get(map)
  if (!tile) {
    tile = document.createElement('canvas'); tile.width = tile.height = 192
    const ink = tile.getContext('2d')!
    ink.fillStyle = map === 'snow' ? '#dce7eb' : map === 'moon' ? '#b49171' : '#bba17a'; ink.fillRect(0, 0, 192, 192)
    for (let i = 0; i < 420; i++) {
      const px = i * 71.31 % 192, py = i * 119.73 % 192
      ink.strokeStyle = i % 2 ? '#ffffff22' : '#68503922'; ink.lineWidth = .8
      ink.beginPath(); ink.moveTo(px, py); ink.lineTo(px + 3 + i % 6, py - 2); ink.stroke()
    }
    groundTiles.set(map, tile)
  }
  const pattern = g.createPattern(tile, 'repeat')
  pattern?.setTransform(new DOMMatrix([scale, 0, 0, scale, x, y]))
  return pattern
}

