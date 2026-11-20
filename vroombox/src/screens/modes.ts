import { MAP_ORDER, MAPS } from '../game/maps.ts'
import { ACTIVE_LEVELS, endlessRun, levelRun, type RunSpec } from '../game/modes.ts'
import { t } from '../i18n.ts'
import { endlessBest, levelStarsOf, levelTimeOf } from '../progress.ts'
import { goalLabel, levelName } from './labels.ts'
import { menuScreen } from './menu.ts'
import type { Screen } from './screen.ts'
export type ModeNav = { back(): void; play(run: RunSpec): void }
export function levelsScreen(nav: ModeNav): Screen {
  return menuScreen({ title: t.levelsTitle, hint: t.levelsHint, back: nav.back,
    sections: [{ tiles: ACTIVE_LEVELS.map((level, index) => {
      const time = levelTimeOf(level.id)
      // Harder Spring levels open once the previous one is finished.
      const before = level.tier && level.tier > 1 ? ACTIVE_LEVELS[index - 1] : null
      return { icon: MAPS[level.map].emoji, title: levelName(level), stars: levelStarsOf(level.id),
        locked: before && levelStarsOf(before.id) === 0 ? t.unlockAfter(levelName(before)) : null,
        sub: `${level.tier ? t.tierNames[level.tier - 1] : t.seasonHazards[level.map]} · ${goalLabel(level)}${time !== null ? ` · ${t.seconds(time)}` : ''}`,
        onClick: () => nav.play(levelRun(level)) }
    }) }] })
}
export function endlessScreen(vehicleId: string, nav: ModeNav): Screen {
  return menuScreen({ title: t.endlessTitle, hint: t.endlessHint, back: nav.back,
    sections: [{ tiles: MAP_ORDER.map((map) => ({ icon: MAPS[map].emoji,
      title: t.mapNames[map], sub: `${t.seasonHazards[map]}${endlessBest(vehicleId, map) > 0 ? ` · ${t.bestMeters(endlessBest(vehicleId, map))}` : ''}`,
      onClick: () => nav.play(endlessRun(map)) })) }] })
}
