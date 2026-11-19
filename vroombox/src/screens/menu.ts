import { t } from '../i18n.ts'
import { el } from '../util/dom.ts'
import { starRow } from './labels.ts'
import type { Screen } from './screen.ts'

export type Tile = {
  icon: string
  title: string
  sub?: string
  stars?: number | null
  /** When set, the tile is disabled and shows why. */
  locked?: string | null
  onClick?: () => void
}
export type Section = { title?: string; tiles: Tile[] }

export function tileButton(tile: Tile): HTMLButtonElement {
  return el(
    'button.tile',
    { type: 'button', disabled: !!tile.locked, onclick: () => tile.onClick?.() },
    el('span.tile-icon', {}, tile.locked ? '🔒' : tile.icon),
    el('span.tile-title', {}, tile.title),
    tile.locked
      ? el('span.tile-sub', {}, tile.locked)
      : el(
          'span.tile-sub',
          {},
          tile.stars !== undefined && tile.stars !== null ? el('span.tile-stars', {}, starRow(tile.stars)) : null,
          tile.sub ? el('span', {}, tile.sub) : null,
        ),
  )
}

export function topBar(title: string, back: () => void): HTMLElement {
  return el(
    'div.topbar',
    {},
    el('button.btn.ghost.backbtn', { type: 'button', onclick: back }, t.back),
    el('h1.title', {}, title),
  )
}

/** A titled list of tiles grouped in sections: used for levels, maps, loads and routes. */
export function menuScreen(opts: { title: string; hint?: string; back(): void; sections: Section[] }): Screen {
  const root = el(
    'div.screen',
    {},
    el(
      'div.wrap',
      {},
      topBar(opts.title, opts.back),
      opts.hint ? el('p.note', {}, opts.hint) : null,
      ...opts.sections.flatMap((s) => [
        s.title ? el('h2.section-title', {}, s.title) : null,
        el('div.tile-grid', {}, ...s.tiles.map(tileButton)),
      ]),
    ),
  )
  return { el: root }
}
