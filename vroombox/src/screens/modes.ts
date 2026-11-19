import { MAP_ORDER, MAPS } from '../game/maps.ts'
import { deliveryRun, endlessRun, LEVELS, levelRun, PULL_LOADS, pullRun, ROUTES, type RunSpec } from '../game/modes.ts'
import { t } from '../i18n.ts'
import {
  endlessBest,
  levelStarsOf,
  levelTimeOf,
  levelUnlocked,
  loadUnlocked,
  mapUnlocked,
  pullBestOf,
  routeStarsOf,
  routeUnlocked,
  totalLevelStars,
} from '../progress.ts'
import { goalLabel } from './labels.ts'
import { menuScreen, type Tile } from './menu.ts'
import type { Screen } from './screen.ts'

export type ModeNav = { back(): void; play(run: RunSpec): void }

export function levelsScreen(nav: ModeNav): Screen {
  return menuScreen({
    title: `${t.levelsTitle} · ${t.starsOf(totalLevelStars(), LEVELS.length * 3)}`,
    hint: t.levelsHint,
    back: nav.back,
    sections: MAP_ORDER.map((map) => ({
      title: `${MAPS[map].emoji} ${t.mapNames[map]}`,
      tiles: LEVELS.filter((l) => l.map === map).map((l): Tile => {
        const time = levelTimeOf(l.id)
        return {
          icon: l.boss ? '👑' : String(l.id),
          title: l.boss ? `${t.boss} ${l.id}` : `${t.level} ${l.id}`,
          stars: levelStarsOf(l.id),
          sub: `★★★ ${goalLabel(l)}${time !== null ? ` · ${t.seconds(time)}` : ''}`,
          locked: levelUnlocked(l.id) ? null : t.lockedPrev,
          onClick: () => nav.play(levelRun(l)),
        }
      }),
    })),
  })
}

export function endlessScreen(vehicleId: string, nav: ModeNav): Screen {
  return menuScreen({
    title: t.endlessTitle,
    hint: t.endlessHint,
    back: nav.back,
    sections: [
      {
        tiles: MAP_ORDER.map((map): Tile => {
          const best = endlessBest(vehicleId, map)
          const first = LEVELS.find((l) => l.map === map)
          return {
            icon: MAPS[map].emoji,
            title: t.mapNames[map],
            sub: best > 0 ? t.bestMeters(best) : t.notPlayedShort,
            locked: mapUnlocked(map) ? null : t.lockedMap(first?.id ?? 1),
            onClick: () => nav.play(endlessRun(map)),
          }
        }),
      },
    ],
  })
}

export function pullScreen(nav: ModeNav): Screen {
  return menuScreen({
    title: t.pullTitle,
    hint: `${t.pullHint} ${t.pullTip}`,
    back: nav.back,
    sections: [
      {
        tiles: PULL_LOADS.map((load, i): Tile => {
          const best = pullBestOf(load.id)
          const prev = PULL_LOADS[i - 1]
          return {
            icon: load.emoji,
            title: t.loadNames[load.id],
            stars: best >= 100 ? 3 : best >= 65 ? 2 : best >= 30 ? 1 : 0,
            sub: best > 0 ? t.bestMeters(best) : t.notPlayedShort,
            locked: loadUnlocked(i) ? null : t.lockedLoad(t.loadNames[prev.id]),
            onClick: () => nav.play(pullRun(load)),
          }
        }),
      },
    ],
  })
}

export function deliveryScreen(nav: ModeNav): Screen {
  return menuScreen({
    title: t.deliveryTitle,
    hint: t.deliveryHint,
    back: nav.back,
    sections: [
      {
        tiles: ROUTES.map(
          (r): Tile => ({
            icon: MAPS[r.map].emoji,
            title: `${t.route} ${r.id}`,
            stars: routeStarsOf(r.id),
            sub: `🥚 ${t.eggsCount(r.eggs)} · ${r.length} m`,
            locked: routeUnlocked(r.id) ? null : t.lockedPrev,
            onClick: () => nav.play(deliveryRun(r)),
          }),
        ),
      },
    ],
  })
}
