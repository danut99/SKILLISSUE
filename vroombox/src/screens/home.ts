import { LEVELS, PULL_LOADS, ROUTES } from '../game/modes.ts'
import { t } from '../i18n.ts'
import { daily, endlessBest, loadUnlocked, MISSION_COINS, MISSIONS_BONUS, progress, routeStarsOf, totalLevelStars } from '../progress.ts'
import { el } from '../util/dom.ts'
import { drawVehicleThumb, type Vehicle } from '../vehicle.ts'
import { tileButton } from './menu.ts'
import type { Screen } from './screen.ts'

export type HomeNav = {
  garage(): void
  newVehicle(): void
  /** Null when the vehicle can't be edited (the ready-made ones). */
  edit: (() => void) | null
  levels(): void
  endless(): void
  pull(): void
  delivery(): void
  workshop(): void
  install: (() => void) | null
}

const split = (label: string): [string, string] => {
  const i = label.indexOf(' ')
  return [label.slice(0, i), label.slice(i + 1)]
}

/** Today's missions with their progress. */
function missionsCard(): HTMLElement {
  const d = daily()
  return el(
    'div.missions',
    {},
    el('div.missions-title', {}, t.missionsTitle, el('span', {}, t.missionsReward(MISSION_COINS, MISSIONS_BONUS))),
    ...d.missions.map((m) =>
      el(
        m.claimed ? 'div.mission.done' : 'div.mission',
        {},
        el('span', {}, t.mission(m.kind, m.target)),
        el('span.mprog', {}, m.claimed ? '✅' : `${Math.min(m.done, m.target)}/${m.target}`),
      ),
    ),
  )
}

export function homeScreen(vehicle: Vehicle, nav: HomeNav): Screen {
  const [lvIcon, lvTitle] = split(t.modeLevels)
  const [enIcon, enTitle] = split(t.modeEndless)
  const [puIcon, puTitle] = split(t.modePull)
  const [deIcon, deTitle] = split(t.modeDelivery)
  const routeStars = ROUTES.reduce((s, r) => s + routeStarsOf(r.id), 0)
  const loadsOpen = PULL_LOADS.filter((_, i) => loadUnlocked(i)).length
  const farmBest = endlessBest(vehicle.id, 'farm')

  const root = el(
    'div.screen.home',
    {},
    el(
      'div.wrap',
      {},
      el('div.homebar', {}, el('h1.logo.small', {}, 'VROOM', el('span', {}, 'BOX')), el('span.pill.coins', {}, t.coinsPill(progress.coins))),
      el(
        'div.vehicle-card',
        {},
        drawVehicleThumb(vehicle, 280, 180),
        el(
          'div.vinfo',
          {},
          el('div.vname', {}, vehicle.name),
          nav.edit ? el('button.btn.secondary.small', { type: 'button', onclick: () => nav.edit?.() }, t.editVehicle) : null,
          el('button.btn.secondary.small', { type: 'button', onclick: () => nav.garage() }, t.change),
          el('button.btn.small', { type: 'button', onclick: () => nav.newVehicle() }, t.newShort),
        ),
      ),
      el(
        'div.mode-grid',
        {},
        tileButton({ icon: lvIcon, title: lvTitle, sub: t.starsOf(totalLevelStars(), LEVELS.length * 3), onClick: nav.levels }),
        tileButton({ icon: enIcon, title: enTitle, sub: farmBest > 0 ? t.bestMeters(farmBest) : t.notPlayedShort, onClick: nav.endless }),
        tileButton({
          icon: puIcon,
          title: puTitle,
          sub: `${PULL_LOADS.slice(0, loadsOpen).map((l) => l.emoji).join('')} ${loadsOpen}/${PULL_LOADS.length}`,
          onClick: nav.pull,
        }),
        tileButton({ icon: deIcon, title: deTitle, sub: t.starsOf(routeStars, ROUTES.length * 3), onClick: nav.delivery }),
      ),
      missionsCard(),
      el('button.btn.big.workshop', { type: 'button', onclick: () => nav.workshop() }, t.workshop),
      el('p.note', {}, t.workshopSub),
      nav.install ? el('button.btn.secondary', { type: 'button', onclick: () => nav.install?.() }, t.install) : null,
      el('p.note', {}, t.privacy),
    ),
  )
  return { el: root }
}
