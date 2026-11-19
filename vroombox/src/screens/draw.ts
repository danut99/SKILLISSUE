import { MIN_WHEEL_RADIUS, VEHICLE_LENGTH } from '../game/config.ts'
import { buildGeom } from '../game/geom.ts'
import { vehicleStats, type Stats } from '../game/traits.ts'
import { WHEEL_UNLOCK, wheelUnlocked } from '../progress.ts'
import { paintWheel, WHEEL_DESIGNS, type WheelDesign } from '../game/wheelart.ts'
import { clamp, type Pt } from '../geometry/poly.ts'
import { t } from '../i18n.ts'
import { autoSizeCanvas, canvasPoint, el, toast } from '../util/dom.ts'
import { blobToCanvas, ctx2d, makeCanvas } from '../util/image.ts'
import { alphaBox, finalize, fitWheels, fromDrawing, type Box, type Drawing, type PlacedWheel } from '../util/objectimage.ts'
import type { Vehicle } from '../vehicle.ts'
import type { Screen } from './screen.ts'

export type DrawNav = { back(): void; next(drawing: Drawing): void }
/** The vehicle being drawn: strokes on `layer` plus the wheels put on it, in layer pixels. */
export type Sketch = { layer: HTMLCanvasElement; wheels: PlacedWheel[] }
type Tool = 'pen' | 'eraser' | 'fill' | 'wheel'

const W = 1000
const H = 700
const COLORS = ['#1b1b1b', '#e63946', '#f77f00', '#ffd23f', '#2a9d8f', '#3a86ff', '#8338ec', '#8d5524', '#ffffff']
const SIZES = [8, 18, 36]
const MAX_UNDO = 20
const MAX_WHEELS = 4
const WHEEL_MIN = 20
const WHEEL_MAX = 200
const WHEEL_START = 75
const CHIP = 88
const WHEEL_COLOR = '#e63946'
/** Designs whose rim takes the palette color. */
const COLORED: readonly WheelDesign[] = ['sport', 'offroad']

/** Fills the region connected to (x, y) that has the same color (alpha included). Refuses open areas touching the border. */
function floodFill(c: HTMLCanvasElement, x: number, y: number, color: string): 'ok' | 'open' | 'same' {
  const g = ctx2d(c)
  const img = g.getImageData(0, 0, W, H)
  const d = img.data
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || py < 0 || px >= W || py >= H) return 'open'
  const probe = makeCanvas(1, 1)
  const pg = ctx2d(probe)
  pg.fillStyle = color
  pg.fillRect(0, 0, 1, 1)
  const [fr, fg, fb] = pg.getImageData(0, 0, 1, 1).data
  const i0 = (py * W + px) * 4
  const s = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]]
  if (s[3] > 200 && Math.abs(s[0] - fr) + Math.abs(s[1] - fg) + Math.abs(s[2] - fb) < 10) return 'same'
  const close = (i: number) =>
    Math.abs(d[i] - s[0]) + Math.abs(d[i + 1] - s[1]) + Math.abs(d[i + 2] - s[2]) + Math.abs(d[i + 3] - s[3]) * 2 < 90
  const seen = new Uint8Array(W * H)
  const region: number[] = []
  const stack = [py * W + px]
  seen[py * W + px] = 1
  let open = false
  while (stack.length) {
    const p = stack.pop() as number
    region.push(p)
    const cx = p % W
    const cy = (p - cx) / W
    if (cx === 0 || cy === 0 || cx === W - 1 || cy === H - 1) open = true
    for (const q of [cx > 0 ? p - 1 : -1, cx < W - 1 ? p + 1 : -1, cy > 0 ? p - W : -1, cy < H - 1 ? p + W : -1]) {
      if (q >= 0 && !seen[q]) {
        seen[q] = 1
        if (close(q * 4)) stack.push(q)
      }
    }
  }
  if (open && s[3] < 20) return 'open'
  for (const p of region) {
    d[p * 4] = fr
    d[p * 4 + 1] = fg
    d[p * 4 + 2] = fb
    d[p * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return 'ok'
}

/** The stats bars for what is on the paper (wheels only, until there is a drawing). */
function sketchStats(layer: HTMLCanvasElement, wheels: readonly PlacedWheel[]): Stats {
  const drawing = fromDrawing(layer, wheels)
  if (drawing) {
    const done = finalize(drawing)
    const geom = buildGeom({
      width: done.sprite.width,
      height: done.sprite.height,
      outline: done.outline,
      wheels: done.wheels.map((w, i) => ({ ...w, design: done.wheelDesigns[i] })),
    })
    return vehicleStats(geom.area, geom.wheels)
  }
  const frame = fitWheels(null, wheels).frame
  const k = frame ? VEHICLE_LENGTH / Math.max(frame.w, frame.h, 1) : 0
  return vehicleStats(0, wheels.map((w) => ({ x: w.x * k, r: w.r * k, design: w.look.design })))
}

const STAT_KEYS: (keyof Stats)[] = ['speed', 'grip', 'mud', 'weight', 'steady']
const STAT_ICONS: Record<keyof Stats, string> = { speed: '⚡', grip: '🧲', mud: '🟤', weight: '⚖️', steady: '🤸' }

/** A new sketch starts with two wheels already in place: pick their type and size, then draw the vehicle on them. */
export function newSketch(): Sketch {
  const layer = makeCanvas(W, H)
  ctx2d(layer, true)
  const wheel = (x: number): PlacedWheel => ({ x, y: 500, r: WHEEL_START, look: { design: 'classic', color: WHEEL_COLOR } })
  return { layer, wheels: [wheel(300), wheel(700)] }
}

/**
 * The editable drawing of a saved vehicle: its saved sketch, or for vehicles made before sketches were saved,
 * its picture fitted onto the paper with classic wheels where its wheels were.
 */
export async function sketchOf(v: Vehicle): Promise<Sketch> {
  const sketch = newSketch()
  const lg = ctx2d(sketch.layer, true)
  if (v.draft) {
    lg.drawImage(await blobToCanvas(v.draft.layer), 0, 0)
    sketch.wheels = v.draft.wheels.map((w) => ({ ...w, look: { ...w.look } }))
    return sketch
  }
  const frame = fitWheels({ x: 0, y: 0, w: v.sprite.width, h: v.sprite.height }, v.wheels).frame as Box
  const k = Math.min((W * 0.8) / frame.w, (H * 0.7) / frame.h)
  const x0 = (W - frame.w * k) / 2 - frame.x * k
  const y0 = (H - frame.h * k) / 2 - frame.y * k
  lg.drawImage(v.sprite, x0, y0, v.sprite.width * k, v.sprite.height * k)
  sketch.wheels = v.wheels.map((w) => ({ x: x0 + w.x * k, y: y0 + w.y * k, r: w.r * k, look: { design: 'classic', color: WHEEL_COLOR } }))
  return sketch
}

/**
 * Making the vehicle, in two steps: first its wheels (type, size, where), then drawing it on them.
 * The sketch belongs to the caller, so coming back here continues the same drawing.
 * Wheels are shown at the exact size they will drive with.
 */
export function drawScreen(sketch: Sketch, nav: DrawNav): Screen {
  const { layer } = sketch
  const wheels = sketch.wheels
  const lg = ctx2d(layer, true)
  const canvas = el('canvas')
  const g = ctx2d(canvas)
  let fit = { k: 1, ox: 0, oy: 0 }
  let tool: Tool = 'wheel'
  let color = COLORS[0]
  let size = SIZES[1]
  let last: Pt | null = null
  let strokes: Box | null = alphaBox(layer)
  let design: WheelDesign = wheels[0]?.look.design ?? 'classic'
  let wheelColor = wheels[0]?.look.color ?? WHEEL_COLOR
  let wheelR = wheels[0]?.r ?? WHEEL_START
  /** The wheel being changed on its own; -1 = the wheel settings apply to all wheels. */
  let selected = -1
  let drag: Pt | null = null
  const undo: ImageData[] = []

  const sizedWheels = () => fitWheels(strokes, wheels)
  const targets = () => (selected >= 0 ? [wheels[selected]] : wheels)

  function snapshot() {
    undo.push(lg.getImageData(0, 0, W, H))
    if (undo.length > MAX_UNDO) undo.shift()
  }

  function draw() {
    const { k, ox, oy } = fit
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.fillStyle = '#0b1530'
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.fillStyle = '#fffdf6'
    g.fillRect(ox, oy, W * k, H * k)
    g.strokeStyle = '#e9e4d6'
    g.lineWidth = 1
    for (let x = 50; x < W; x += 50) {
      g.beginPath()
      g.moveTo(ox + x * k, oy)
      g.lineTo(ox + x * k, oy + H * k)
      g.stroke()
    }
    for (let y = 50; y < H; y += 50) {
      g.beginPath()
      g.moveTo(ox, oy + y * k)
      g.lineTo(ox + W * k, oy + y * k)
      g.stroke()
    }
    g.drawImage(layer, ox, oy, W * k, H * k)
    sizedWheels().wheels.forEach((w, i) => {
      const x = ox + w.x * k
      const y = oy + w.y * k
      g.save()
      g.translate(x, y)
      paintWheel(g, w.r * k, w.look)
      g.restore()
      if (tool !== 'wheel' || (selected >= 0 && i !== selected)) return
      g.strokeStyle = i === selected ? '#ffd23f' : 'rgba(42,157,143,.9)'
      g.lineWidth = 4
      g.setLineDash([10, 7])
      g.beginPath()
      g.arc(x, y, w.r * k + 7, 0, Math.PI * 2)
      g.stroke()
      g.setLineDash([])
    })
  }

  const disposeSize = autoSizeCanvas(canvas, (cw, ch) => {
    const k = Math.min(cw / W, ch / H)
    fit = { k, ox: (cw - W * k) / 2, oy: (ch - H * k) / 2 }
    draw()
  })
  const toLayer = (e: PointerEvent): Pt => {
    const p = canvasPoint(canvas, e)
    return { x: (p.x - fit.ox) / fit.k, y: (p.y - fit.oy) / fit.k }
  }

  function stroke(a: Pt, b: Pt) {
    lg.save()
    lg.lineCap = 'round'
    lg.lineJoin = 'round'
    lg.lineWidth = tool === 'eraser' ? size * 1.6 : size
    if (tool === 'eraser') lg.globalCompositeOperation = 'destination-out'
    lg.strokeStyle = color
    lg.beginPath()
    lg.moveTo(a.x, a.y)
    lg.lineTo(b.x, b.y)
    lg.stroke()
    lg.restore()
  }

  function strokesChanged() {
    strokes = alphaBox(layer)
    refresh()
    draw()
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId)
    const p = toLayer(e)
    if (tool === 'wheel') {
      // Tap a wheel to change just that one (and drag it); tap anywhere else to go back to all wheels.
      selected = sizedWheels().wheels.findIndex((w) => Math.hypot(w.x - p.x, w.y - p.y) <= w.r + 24 / fit.k)
      const w = wheels[selected]
      drag = w ? { x: p.x - w.x, y: p.y - w.y } : null
      refresh()
      draw()
      return
    }
    snapshot()
    if (tool === 'fill') {
      const r = floodFill(layer, p.x, p.y, color)
      if (r !== 'ok') undo.pop()
      if (r === 'open') toast(t.fillClosed, 1800)
      strokesChanged()
      return
    }
    last = p
    stroke(p, { x: p.x + 0.01, y: p.y })
    draw()
  })
  canvas.addEventListener('pointermove', (e) => {
    const p = toLayer(e)
    const w = wheels[selected]
    if (drag && w) {
      w.x = clamp(p.x - drag.x, 0, W)
      w.y = clamp(p.y - drag.y, 0, H)
      draw()
      return
    }
    if (!last) return
    stroke(last, p)
    last = p
    draw()
  })
  const stop = () => {
    if (drag) queueStats()
    drag = null
    if (!last) return
    last = null
    strokesChanged()
  }
  canvas.addEventListener('pointerup', stop)
  canvas.addEventListener('pointercancel', stop)

  const toolBtns: Record<Tool, HTMLButtonElement> = {
    wheel: el('button', { type: 'button', onclick: () => pickTool('wheel') }, t.wheelTool),
    pen: el('button', { type: 'button', onclick: () => pickTool('pen') }, t.pen),
    eraser: el('button', { type: 'button', onclick: () => pickTool('eraser') }, t.eraser),
    fill: el('button', { type: 'button', onclick: () => pickTool('fill') }, t.fill),
  }
  const hint = el('p.hint', {})
  const swatches = COLORS.map((c) => el('button.swatch', { type: 'button', style: `background:${c}`, onclick: () => pickColor(c) }))
  const palette = el('div.palette', {}, ...swatches)
  const sizeBtns = SIZES.map((s, i) =>
    el(
      'button',
      {
        type: 'button',
        className: s === size ? 'on' : '',
        onclick: () => {
          size = s
          sizeBtns.forEach((b, j) => (b.className = j === i ? 'on' : ''))
        },
      },
      el('span.dot', { style: `width:${6 + i * 6}px;height:${6 + i * 6}px` }),
    ),
  )
  const sizeSeg = el('div.seg.brush', {}, ...sizeBtns)

  const statFills = STAT_KEYS.map(() => el('div'))
  const statsRow = el(
    'div.stats',
    { onclick: () => toast(t.statsHelp, 3200) },
    ...STAT_KEYS.map((key, i) => el('div.stat', { title: t.statNames[key] }, el('span', {}, STAT_ICONS[key]), el('div.statbar', {}, statFills[i]))),
  )
  let statsQueued = 0
  /** Stats need the finished vehicle (a bit of work), so they update once per frame at most. */
  function queueStats() {
    cancelAnimationFrame(statsQueued)
    statsQueued = requestAnimationFrame(() => {
      const st = sketchStats(layer, wheels)
      STAT_KEYS.forEach((key, i) => (statFills[i].style.width = `${Math.round(8 + st[key] * 92)}%`))
    })
  }

  const chips = WHEEL_DESIGNS.map((d) => {
    const art = makeCanvas(CHIP, CHIP)
    const lock = el('span.lock', {}, `🔒${WHEEL_UNLOCK[d]}⭐`)
    const button = el('button.wheelchip', { type: 'button', title: t.wheelNames[d], onclick: () => pickDesign(d) }, art, lock)
    button.setAttribute('aria-label', t.wheelNames[d])
    return { d, art, button }
  })
  const wheelSize = el('input', { type: 'range', min: String(WHEEL_MIN), max: String(WHEEL_MAX), step: '1' })
  wheelSize.setAttribute('aria-label', t.wheelSize)
  const addWheelBtn = el('button.btn.secondary.icon', { type: 'button', title: t.addWheel, onclick: () => addWheel() }, '➕')
  const removeWheelBtn = el('button.btn.secondary.icon', { type: 'button', title: t.removeWheel, onclick: () => removeWheel() }, '➖')
  const wheelPanel = el(
    'div.wheelpanel',
    {},
    el('div.wheelchips', {}, ...chips.map((c) => c.button)),
    el('div.wheelrow', {}, el('span.sizedot', {}), wheelSize, el('span.sizedot.big', {}), addWheelBtn, removeWheelBtn),
  )
  const mainBtn = el('button.btn.main', { type: 'button', onclick: () => (strokes ? finish() : pickTool('pen')) })

  /** The design the targeted wheels share, or null when they differ (then no chip is lit). */
  function sharedDesign(): WheelDesign | null {
    const list = targets()
    if (!list.length) return design
    return list.every((w) => w.look.design === list[0].look.design) ? list[0].look.design : null
  }
  const activeColor = () => (tool === 'wheel' ? (targets()[0]?.look.color ?? wheelColor) : color)

  function refresh() {
    for (const [k, b] of Object.entries(toolBtns)) b.className = k === tool ? 'on' : ''
    const current = sharedDesign()
    // On the wheel step the palette stays put (so the drawing doesn't jump) and only lights up for colored rims.
    palette.hidden = tool === 'eraser'
    palette.classList.toggle('dim', tool === 'wheel' && !targets().some((w) => COLORED.includes(w.look.design)))
    swatches.forEach((s, i) => s.classList.toggle('on', COLORS[i] === activeColor()))
    sizeSeg.hidden = tool !== 'pen' && tool !== 'eraser'
    wheelPanel.hidden = tool !== 'wheel'
    hint.textContent = { wheel: selected >= 0 ? t.oneWheel : t.hintWheels, pen: t.hintPen, eraser: t.hintEraser, fill: t.hintFill }[tool]
    for (const { d, art, button } of chips) {
      button.classList.toggle('on', d === current)
      button.classList.toggle('locked', !wheelUnlocked(d))
      const cg = ctx2d(art)
      cg.setTransform(1, 0, 0, 1, CHIP / 2, CHIP / 2)
      cg.clearRect(-CHIP / 2, -CHIP / 2, CHIP, CHIP)
      paintWheel(cg, CHIP * 0.45, { design: d, color: activeColor() })
    }
    // Physics keeps wheels at least this big for the vehicle's size, so the slider starts there.
    const { frame, wheels: sized } = sizedWheels()
    const lo = frame ? Math.ceil((Math.max(frame.w, frame.h) * MIN_WHEEL_RADIUS) / VEHICLE_LENGTH) : WHEEL_MIN
    wheelSize.min = String(clamp(lo, WHEEL_MIN, WHEEL_MAX))
    wheelSize.value = String(Math.round(sized[Math.max(0, selected)]?.r ?? wheelR))
    removeWheelBtn.disabled = selected < 0
    mainBtn.textContent = strokes ? t.next : t.drawNow
    queueStats()
  }

  function pickTool(next: Tool) {
    tool = next
    selected = -1
    refresh()
    draw()
  }

  function pickColor(c: string) {
    if (tool === 'wheel') {
      wheelColor = c
      for (const w of targets()) w.look = { ...w.look, color: c }
    } else {
      color = c
      if (tool === 'eraser') tool = 'pen'
    }
    refresh()
    draw()
  }

  function pickDesign(d: WheelDesign) {
    if (!wheelUnlocked(d)) {
      toast(t.unlockAt(WHEEL_UNLOCK[d]), 2200)
      return
    }
    toast(`${t.wheelNames[d]}: ${t.wheelInfo[d]}`, 2400)
    design = d
    for (const w of targets()) w.look = { ...w.look, design: d }
    refresh()
    draw()
  }

  wheelSize.oninput = () => {
    wheelR = Number(wheelSize.value)
    for (const w of targets()) w.r = wheelR
    draw()
  }
  wheelSize.onchange = () => queueStats()

  /** A new wheel goes between the others (or next to the only one), picked so it can be dragged into place. */
  function addWheel() {
    if (wheels.length >= MAX_WHEELS) {
      toast(t.maxWheels)
      return
    }
    const xs = wheels.map((w) => w.x)
    let x = !xs.length ? 300 : xs.length === 1 ? (xs[0] < W / 2 ? xs[0] + 400 : xs[0] - 400) : (Math.min(...xs) + Math.max(...xs)) / 2
    const y = wheels.length ? wheels.reduce((sum, w) => sum + w.y, 0) / wheels.length : 500
    const r = wheels[wheels.length - 1]?.r ?? wheelR
    for (let i = 0; i < 6 && wheels.some((w) => Math.hypot(w.x - x, w.y - y) < (w.r + r) * 0.8); i++) x = clamp(x + r * 1.3, r, W - r)
    wheels.push({ x, y, r, look: { design, color: wheelColor } })
    selected = wheels.length - 1
    refresh()
    draw()
  }

  function removeWheel() {
    if (selected < 0) return
    wheels.splice(selected, 1)
    selected = -1
    refresh()
    draw()
  }

  function flip() {
    const copy = makeCanvas(W, H)
    ctx2d(copy).drawImage(layer, 0, 0)
    lg.save()
    lg.clearRect(0, 0, W, H)
    lg.translate(W, 0)
    lg.scale(-1, 1)
    lg.drawImage(copy, 0, 0)
    lg.restore()
    for (const w of wheels) w.x = W - w.x
    // Undo snapshots are of the unflipped drawing.
    undo.length = 0
    strokesChanged()
  }

  function finish() {
    const drawing = fromDrawing(layer, wheels)
    if (!drawing) {
      toast(t.drawEmpty)
      pickTool('pen')
    } else if (wheels.length < 2) {
      toast(t.needTwoWheels, 2000)
      pickTool('wheel')
    } else nav.next(drawing)
  }

  refresh()

  const root = el(
    'div.screen.editor',
    {},
    el(
      'div.wrap.grow',
      {},
      el('div.topbar', {}, el('button.btn.ghost.backbtn', { type: 'button', onclick: () => nav.back() }, t.back), el('h1.title', {}, t.drawTitle)),
      hint,
      el('div.stage', {}, canvas),
      statsRow,
      el('div.seg.tools', {}, toolBtns.wheel, toolBtns.pen, toolBtns.eraser, toolBtns.fill),
      wheelPanel,
      palette,
      sizeSeg,
      el(
        'div.row',
        {},
        el(
          'button.btn.secondary.icon',
          {
            type: 'button',
            title: t.undoLabel,
            onclick: () => {
              const prev = undo.pop()
              if (prev) lg.putImageData(prev, 0, 0)
              strokesChanged()
            },
          },
          t.undo,
        ),
        el(
          'button.btn.secondary.icon',
          {
            type: 'button',
            title: t.clearLabel,
            onclick: () => {
              snapshot()
              lg.clearRect(0, 0, W, H)
              strokesChanged()
            },
          },
          t.clearAll,
        ),
        el('button.btn.secondary.icon', { type: 'button', title: t.flip, onclick: flip }, '↔️'),
        mainBtn,
      ),
    ),
  )
  return {
    el: root,
    destroy: () => {
      cancelAnimationFrame(statsQueued)
      disposeSize()
    },
  }
}
