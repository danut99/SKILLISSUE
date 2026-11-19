import { MAX_UPGRADE, UPGRADE_KEYS } from '../game/upgrades.ts'
import { t } from '../i18n.ts'
import { buyUpgrade, progress, upgradeCost } from '../progress.ts'
import { el, toast } from '../util/dom.ts'
import { topBar } from './menu.ts'
import type { Screen } from './screen.ts'

export function workshopScreen(nav: { back(): void }): Screen {
  const wrap = el('div.wrap')
  const render = () => {
    wrap.replaceChildren(
      topBar(t.workshopTitle, nav.back),
      el('p.note', {}, t.workshopHint),
      ...UPGRADE_KEYS.map((key) => {
        const level = progress.upgrades[key]
        const cost = upgradeCost(key)
        const bar = el('div.upbar', {}, ...Array.from({ length: MAX_UPGRADE }, (_, i) => el(i < level ? 'span.on' : 'span')))
        const buy = el(
          'button.btn',
          {
            type: 'button',
            disabled: cost === null,
            onclick: () => {
              if (buyUpgrade(key)) {
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
          el('div.upinfo', {}, el('div.upname', {}, t.upgradeNames[key]), el('div.note.left', {}, t.upgradeDesc[key]), bar),
          buy,
        )
      }),
    )
  }
  render()
  return { el: el('div.screen', {}, wrap) }
}
