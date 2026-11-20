import { dynoStats, sprintTrace, SPRINT, type DynoLane, type DynoStats, type DynoTrace } from '../game/dyno.ts'
import { upgradeComparison } from '../game/upgradeComparison.ts'
import { MAX_UPGRADE, UPGRADE_KEYS, type UpgradeKey, type Upgrades } from '../game/upgrades.ts'
import { t } from '../i18n.ts'
import { buyUpgrade, progress, upgradeCost, upgradesFor } from '../progress.ts'
import { ctx2d, makeCanvas } from '../util/image.ts'
import { el, toast } from '../util/dom.ts'
import { drawVehicleThumb, geomOf, type Vehicle } from '../vehicle.ts'
import { DT } from '../game/config.ts'
import { topBar } from './menu.ts'
import type { Screen } from './screen.ts'

type StatKey = 'topSpeed' | 'sprint' | 'iceSprint'
const STATS: Record<StatKey, { label: () => string; show: (v: number | null) => string; higherIsBetter: boolean }> = {
  topSpeed: { label: () => t.topSpeedStat, show: (v) => t.kmh(v ?? 0), higherIsBetter: true },
  sprint: { label: () => t.sprintStat, show: (v) => t.secs(v), higherIsBetter: false },
  iceSprint: { label: () => t.iceSprintStat, show: (v) => t.secs(v), higherIsBetter: false },
}
const LANE: Record<UpgradeKey, DynoLane | null> = { engine: 'ground', tires: 'ice', suspension: null, tank: null }

function gained(key: StatKey, before: number | null, after: number | null): boolean {
  if (after === null) return false
  if (before === null) return true
  return STATS[key].higherIsBetter ? after > before : after < before
}

function statRow(key: StatKey, before: DynoStats, after: DynoStats | null) {
  const a = before[key]
  const b = after ? after[key] : null
  return el('div.dyno-row', {},
    el('span.dyno-label', {}, STATS[key].label()),
    el('span.dyno-value', {}, STATS[key].show(a)),
    after ? el('span.dyno-arrow', {}, '→') : null,
    after ? el(gained(key, a, b) ? 'span.dyno-value.gain' : 'span.dyno-value', {}, STATS[key].show(b)) : null)
}

/** Two lanes replaying real sprints: the current setup above, the upgraded one below. */
function raceView(vehicle: Vehicle, lanes: { label: string; trace: DynoTrace; after: boolean }[]) {
  const W = 640, LANE_H = 92, H = LANE_H * lanes.length
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const canvas = makeCanvas(W * dpr, H * dpr)
  canvas.className = 'atelier-race'
  const g = ctx2d(canvas)
  const thumb = drawVehicleThumb(vehicle, 84, 54)
  const startX = 18, finishX = W - 70
  let start = 0
  let raf = 0

  const frame = (now: number) => {
    if (!start) start = now
    const step = Math.floor((now - start) / 1000 / DT)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, W, H)
    let running = false
    lanes.forEach((lane, i) => {
      const y = i * LANE_H
      const n = lane.trace.distance.length
      const k = Math.min(step, n - 1)
      if (step < n - 1) running = true
      const d = n ? lane.trace.distance[k] : 0
      const kmh = n ? Math.round(lane.trace.kmh[k]) : 0
      const done = n > 0 && step >= n - 1 && d >= SPRINT
      g.fillStyle = i % 2 ? '#ffffff10' : '#ffffff1c'
      g.fillRect(0, y, W, LANE_H)
      g.fillStyle = '#ffffff55'
      g.fillRect(startX + 42, y + LANE_H - 10, finishX - startX - 42, 2)
      for (let c = 0; c < 6; c++) {
        g.fillStyle = c % 2 ? '#fff' : '#222'
        g.fillRect(finishX + 42, y + 12 + c * 12, 8, 12)
      }
      g.drawImage(thumb, startX + (finishX - startX) * (d / SPRINT), y + LANE_H - 64, 84, 54)
      g.fillStyle = lane.after ? '#7ee081' : '#edf1ff'
      g.font = '800 15px system-ui'
      g.fillText(lane.label, 10, y + 20)
      g.font = '900 22px system-ui'
      const time = done ? ` · ${t.secs(Math.round(n * DT * 10) / 10)}` : ''
      g.fillText(`${kmh} km/h${time}`, 10, y + 44)
    })
    raf = running ? requestAnimationFrame(frame) : 0
  }
  const play = () => {
    cancelAnimationFrame(raf)
    start = 0
    raf = requestAnimationFrame(frame)
  }
  play()
  return { canvas, play, stop: () => cancelAnimationFrame(raf) }
}

export function atelierScreen(vehicle: Vehicle, first: UpgradeKey, nav: { back(): void }): Screen {
  const wrap = el('div.wrap')
  const geom = geomOf(vehicle)
  let key = first
  let race: ReturnType<typeof raceView> | null = null

  const render = () => {
    race?.stop()
    race = null
    const setup = upgradesFor(vehicle.id)
    const level = setup[key]
    const cost = upgradeCost(key, vehicle.id)
    const next: Upgrades | null = cost === null ? null : { ...setup, [key]: level + 1 }
    const now = dynoStats(geom, setup)
    const after = next ? dynoStats(geom, next) : null
    const lane = LANE[key]
    const labels = { force: t.forceMetric, speed: t.speedMetric, grip: t.gripMetric, damping: t.dampingMetric, air: t.airMetric }

    if (lane) {
      race = raceView(vehicle, [
        { label: t.nowLabel, trace: sprintTrace(geom, setup, lane), after: false },
        ...(next ? [{ label: t.afterLabel(level + 1), trace: sprintTrace(geom, next, lane), after: true }] : []),
      ])
    }

    const buy = el('button.btn.big', {
      type: 'button',
      disabled: cost === null || progress.coins < cost,
      onclick: () => {
        if (buyUpgrade(key, vehicle.id)) {
          toast(t.bought)
          render()
        } else toast(t.notEnough, 1800)
      },
    }, cost === null ? t.maxed : t.buy(cost))
    if (cost !== null && progress.coins < cost) buy.classList.add('poor')

    const children: (Node | null)[] = [
      topBar(t.atelierTitle, nav.back),
      el('h2.section-title', {}, vehicle.name),
      el('div.pill', {}, t.coinsPill(progress.coins)),
      el('div.atelier-tabs', { role: 'tablist' }, ...UPGRADE_KEYS.map((k) => {
        const tab = el('button.btn.secondary.small', { type: 'button', role: 'tab', ariaSelected: String(k === key), onclick: () => { key = k; render() } }, t.upgradeNames[k])
        if (k === key) tab.classList.add('active')
        return tab
      })),
      el('div.upbar.atelier-level', {}, ...Array.from({ length: MAX_UPGRADE }, (_, i) => el(i < level ? 'span.on' : 'span'))),
      lane ? el('div.note', {}, lane === 'ice' ? t.laneIce : t.laneGround) : null,
      race ? race.canvas : el('p.note', {}, t.suspensionNote),
      race ? el('button.btn.secondary.small', { type: 'button', onclick: () => race?.play() }, t.replayRace) : null,
      el('div.dyno', {},
        el('strong', {}, next ? t.comparison : t.maxedNote),
        ...(['topSpeed', 'sprint', 'iceSprint'] as const).map((s) => statRow(s, now, after)),
        ...(next ? upgradeComparison(setup, key).map((m) => el('div.dyno-row', {},
          el('span.dyno-label', {}, labels[m.key]), el('span.dyno-value', {}, `${m.before}%`),
          el('span.dyno-arrow', {}, '→'), el('span.dyno-value.gain', {}, `${m.after}%`))) : []),
        el('div.note.left', {}, t.atelierHint)),
      buy,
    ]
    wrap.replaceChildren(...children.filter((n): n is Node => n !== null))
  }
  render()
  return { el: el('div.screen', {}, wrap), destroy: () => race?.stop() }
}
