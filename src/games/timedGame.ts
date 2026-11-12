import type { Mode } from '../config';
import { drawResultCompanion } from './resultCompanion';
import { banner, text } from './canvas';
import { C, W, type Game, type GameApi } from './types';

export const TIME_LIMITS = { draw: 8, cut: 5 } as const;

/** One deadline per attempt; releasing or missing cannot restart the clock. */
export function createTimedGame(mode: Mode, factory: (api: GameApi) => Game, api: GameApi): Game {
  if (mode === 'brake') return factory(api);
  const seconds = TIME_LIMITS[mode];
  let deadline: number | null = null;
  let ended = false;
  let expired = false;
  let disposed = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const finish: GameApi['finish'] = result => {
    if (ended || disposed) return;
    ended = true;
    clearTimeout(timeout);
    api.finish(result);
  };
  const game = factory({ ...api, finish, startClip: () => {}, cancelClip: () => { /* clock and recording continue until completion */ } });
  const expire = () => {
    if (ended || disposed) return;
    expired = true;
    game.destroy?.();
    finish({ score: 0, detail: { fail: true, timedOut: true }, display: 'TIME UP' });
  };
  const check = () => {
    if (!ended && deadline !== null && performance.now() >= deadline) expire();
    return !ended && !disposed;
  };
  const start = () => {
    if (deadline !== null) return;
    deadline = performance.now() + seconds * 1000;
    timeout = setTimeout(expire, seconds * 1000);
    api.startClip();
  };
  return {
    down(p, e) { if (!check()) return; start(); game.down?.(p, e); },
    move(p, e) { if (check()) game.move?.(p, e); },
    up(p, e) { if (check()) game.up?.(p, e); },
    key(e) { if (check()) game.key?.(e); },
    update(now) { if (check()) game.update?.(now); },
    render(c, now) {
      game.render(c, now);
      if (expired) {
        banner(c, 'TIME UP', 'Too slow. One try used.', C.red, 1000);
        drawResultCompanion(c, 0, mode);
        return;
      }
      if (ended) return;
      const left = deadline === null ? seconds : Math.max(0, (deadline - performance.now()) / 1000);
      text(c, deadline === null ? `${seconds}s limit - starts on touch` : `${left.toFixed(1)}s`, W / 2, 565,
        { size: deadline === null ? 22 : 34, color: left <= 2 ? C.red : C.cyan, outline: 4 });
      if (deadline !== null) {
        c.fillStyle = C.line; c.fillRect(40, 595, W - 80, 6);
        c.fillStyle = left <= 2 ? C.red : C.cyan; c.fillRect(40, 595, (W - 80) * left / seconds, 6);
      }
    },
    setGhost: line => game.setGhost?.(line),
    destroy() { disposed = true; clearTimeout(timeout); if (!expired) game.destroy?.(); },
  };
}
