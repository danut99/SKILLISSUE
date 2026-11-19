import { MAPS } from '../game/maps.ts'
import type { LevelDef, RunSpec } from '../game/modes.ts'
import { t } from '../i18n.ts'

export function modeLabel(run: RunSpec): string {
  const map = run.track.map
  const mapText = `${MAPS[map].emoji} ${t.mapNames[map]}`
  switch (run.kind) {
    case 'endless':
      return `♾️ ${mapText}`
    case 'level':
      return `${t.level} ${run.ref} · ${mapText}`
    case 'pull':
      return `🚜 ${run.mode.kind === 'pull' ? run.mode.load.emoji : ''} ${t.loadNames[run.ref] ?? ''}`
    case 'delivery':
      return `🥚 ${t.route} ${run.ref} · ${mapText}`
  }
}

export const starRow = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n))

/** The level's third-star goal, e.g. "⏱ 37 s" or "🔄 2 flips". */
export function goalLabel(l: LevelDef): string {
  switch (l.goal.kind) {
    case 'par':
      return t.goalPar(l.par)
    case 'flips':
      return t.goalFlips(l.goal.n)
    case 'nobrake':
      return t.goalNoBrake
    case 'coins':
      return t.goalCoins(l.goal.n)
  }
}

/** Live progress toward the goal for the HUD. */
export function goalProgress(l: LevelDef, r: { time: number; flips: number; braked: boolean; coins: number }): string {
  switch (l.goal.kind) {
    case 'par':
      return `⏱ ${r.time.toFixed(0)}/${l.par}s`
    case 'flips':
      return `🔄 ${Math.min(r.flips, l.goal.n)}/${l.goal.n}`
    case 'nobrake':
      return r.braked ? '🛑 ✗' : '🚫🛑 ✓'
    case 'coins':
      return `🪙 ${Math.min(r.coins, l.goal.n)}/${l.goal.n}`
  }
}
