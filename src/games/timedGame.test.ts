import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimedGame } from './timedGame';
import type { Game, GameApi } from './types';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
afterEach(() => vi.useRealTimers());
function setup(mode: 'draw' | 'cut' | 'brake') {
  const api: GameApi = { date: '2026-11-12', finish: vi.fn(), startClip: vi.fn(), cancelClip: vi.fn(), toast: vi.fn() };
  let innerApi: GameApi;
  const inner: Game = { render: vi.fn(), down: vi.fn(), up: vi.fn(), destroy: vi.fn() };
  const game = createTimedGame(mode, a => { innerApi = a; return inner; }, api);
  return { api, game, inner, get innerApi() { return innerApi!; } };
}
const point = { x: 100, y: 100 };
const event = {} as PointerEvent;
describe('attempt deadlines', () => {
  it('waits for interaction, then expires exactly once after eight seconds', () => {
    const s = setup('draw');
    vi.advanceTimersByTime(20000);
    expect(s.api.finish).not.toHaveBeenCalled();
    s.game.down!(point, event);
    vi.advanceTimersByTime(7999);
    expect(s.api.finish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    s.game.up!(point, event);
    s.game.update!(performance.now());
    expect(s.api.finish).toHaveBeenCalledExactlyOnceWith({ score: 0, detail: { fail: true, timedOut: true }, display: 'TIME UP' });
  });
  it('does not restart five-second cut deadlines after cancelled gestures', () => {
    const s = setup('cut');
    s.game.down!(point, event);
    vi.advanceTimersByTime(3000);
    s.innerApi.cancelClip();
    s.game.down!(point, event);
    s.innerApi.startClip();
    vi.advanceTimersByTime(2000);
    expect(s.api.finish).toHaveBeenCalledOnce();
    expect(s.api.startClip).toHaveBeenCalledOnce();
  });
  it('accepts success before the deadline and clears expiry', () => {
    const s = setup('draw');
    s.game.down!(point, event);
    s.innerApi.finish({ score: 95, detail: {}, display: '95%' });
    vi.advanceTimersByTime(10000);
    expect(s.api.finish).toHaveBeenCalledOnce();
    expect(s.api.finish).toHaveBeenCalledWith(expect.objectContaining({ score: 95 }));
  });
  it('cleans up deadlines on navigation', () => {
    const s = setup('cut');
    s.game.down!(point, event);
    s.game.destroy!();
    vi.advanceTimersByTime(10000);
    expect(s.api.finish).not.toHaveBeenCalled();
    expect(s.inner.destroy).toHaveBeenCalledOnce();
  });
  it('leaves the driving game timing intact', () => {
    const s = setup('brake');
    expect(s.game).toBe(s.inner);
  });
});
