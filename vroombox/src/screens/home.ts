import { ACTIVE_LEVELS } from '../game/modes.ts'
import { t } from '../i18n.ts'
import { progress, levelStarsOf } from '../progress.ts'
import { el } from '../util/dom.ts'
import { drawVehicleThumb, type Vehicle } from '../vehicle.ts'
import { tileButton } from './menu.ts'
import type { Screen } from './screen.ts'

export type HomeNav = {
  workshop(): void
  garage(): void
  newVehicle(): void
  edit: (() => void) | null
  levels(): void
  endless(): void
  install: (() => void) | null
}
export function homeScreen(vehicle: Vehicle, nav: HomeNav): Screen {
  const stars = ACTIVE_LEVELS.reduce((sum, level) => sum + levelStarsOf(level.id), 0)
  return { el: el('div.screen.home', {}, el('div.wrap', {},
    el('div.homebar', {}, el('h1.logo.small', {}, 'VROOM', el('span', {}, 'BOX'))),
    el('div.pill', {}, t.coinsPill(progress.coins)),
    el('button.btn.big', { type: 'button', onclick: nav.newVehicle }, t.newVehicle),
    el('div.vehicle-card', {}, drawVehicleThumb(vehicle, 280, 180),
      el('div.vinfo', {}, el('div.vname', {}, vehicle.name),
        nav.edit ? el('button.btn.secondary.small', { type: 'button', onclick: nav.edit }, t.editVehicle) : null,
        el('button.btn.secondary.small', { type: 'button', onclick: nav.garage }, t.garage))),
    el('button.btn.secondary', { type: 'button', onclick: nav.workshop }, t.workshop),
    el('div.mode-grid', {},
      tileButton({ icon: '🏁', title: t.levelsTitle, sub: t.starsOf(stars, 12), onClick: nav.levels }),
      tileButton({ icon: '∞', title: t.endlessTitle, sub: t.endlessHint, onClick: nav.endless })),
    nav.install ? el('button.btn.secondary', { type: 'button', onclick: nav.install }, t.install) : null,
    el('p.note', {}, t.privacy))) }
}


