import type { Vehicle } from '../vehicle.ts'
import { drawVehicleThumb } from '../vehicle.ts'
import {upgradeComparison} from '../game/upgradeComparison.ts'
import { MAX_UPGRADE, UPGRADE_KEYS, type UpgradeKey } from '../game/upgrades.ts'
import { t } from '../i18n.ts'
import { buyUpgrade, progress, upgradeCost, upgradesFor } from '../progress.ts'
import { el, toast } from '../util/dom.ts'
import { topBar } from './menu.ts'
import type { Screen } from './screen.ts'

export function workshopScreen(vehicle: Vehicle, nav: { back(): void; atelier(key: UpgradeKey): void }): Screen {
  const wrap = el('div.wrap')
  const render = () => {
    wrap.replaceChildren(
      topBar(t.workshopTitle, nav.back),
      el('h2.section-title', {}, vehicle.name),
      drawVehicleThumb(vehicle, 240, 140),
      el('div.pill', {}, t.coinsPill(progress.coins)),
      el('p.note', {}, t.workshopHint),
      el('p.note', {}, t.wheelTradeoff),
      el('p.note', {}, t.percentBaseline),
      ...UPGRADE_KEYS.map((key) => {
        const setup = upgradesFor(vehicle.id)
        const level = setup[key]
        const labels = {force:t.forceMetric,speed:t.speedMetric,grip:t.gripMetric,damping:t.dampingMetric,air:t.airMetric}
        const cost = upgradeCost(key, vehicle.id)
        const bar = el('div.upbar', {}, ...Array.from({ length: MAX_UPGRADE }, (_, i) => el(i < level ? 'span.on' : 'span')))
        const buy = el(
          'button.btn',
          {
            type: 'button',
            disabled: cost === null || progress.coins < cost,
            onclick: () => {
              if (buyUpgrade(key, vehicle.id)) {
                toast(t.bought)
                render()
              } else toast(t.notEnough, 1800)
            },
          },
          cost === null ? t.maxed : t.buy(cost),
        )
        if (cost !== null && progress.coins < cost) buy.classList.add('poor')
        return el(
          'div.upcard',
          {},
          el('div.upinfo', {}, el('div.upname', {}, t.upgradeNames[key]), el('div.note.left', {}, t.upgradeDesc[key]), bar,
            cost !== null ? el('div.upgrade-comparison', {}, el('strong',{},t.comparison),
              ...upgradeComparison(setup,key).map(m=>el('div',{},`${labels[m.key]}: ${m.before}% → ${m.after}%`))) : null,
            el('button.btn.secondary.small', {type:'button',onclick:()=>nav.atelier(key)},t.openAtelier)),
          buy,
        )
      }),
    )
  }
  render()
  return { el: el('div.screen', {}, wrap) }
}
