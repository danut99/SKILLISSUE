import { describe, expect, it, vi } from 'vitest';
import { balanceScore, balanceSetup, createBalanceGame } from './balanceGame';

vi.mock('../lib/audio', () => ({ sfx: { pop: vi.fn(), ding: vi.fn(), fail: vi.fn() } }));

describe('balance', () => {
  it('lets players drag and reposition before explicitly releasing', () => {
    const finish = vi.fn();
    const placed = vi.fn();
    const released = vi.fn();
    const game = createBalanceGame('drag', finish, placed, released);
    const down = { type: 'pointerdown' } as PointerEvent;
    const up = { type: 'pointerup' } as PointerEvent;
    game.down?.({ x: 140, y: 440 }, down);
    game.move?.({ x: 160.2, y: 440 }, down);
    game.up?.({ x: 165.4, y: 440 }, up);
    expect(placed).toHaveBeenLastCalledWith(165.5);
    game.update?.(performance.now() + 4000);
    expect(finish).not.toHaveBeenCalled();
    expect(released).not.toHaveBeenCalled();
    game.release();
    game.update?.(performance.now() + 4000);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(released).toHaveBeenCalledTimes(1);
  });
  it('restores placement on pointer cancellation and ignores taps on characters', () => {
    const placed = vi.fn();
    const game = createBalanceGame('cancel', vi.fn(), placed);
    const down = { type: 'pointerdown' } as PointerEvent;
    game.place(150);
    game.down?.({ x: 60, y: 300 }, down);
    game.up?.({ x: 60, y: 300 }, { type: 'pointerup' } as PointerEvent);
    expect(placed).toHaveBeenLastCalledWith(150);
    game.down?.({ x: 240, y: 440 }, down);
    game.move?.({ x: 270, y: 440 }, down);
    game.up?.({ x: 270, y: 440 }, { type: 'pointercancel' } as PointerEvent);
    expect(placed).toHaveBeenLastCalledWith(150);
    game.place(Number.NaN);
    expect(placed).toHaveBeenLastCalledWith(150);
  });
  it('allows a perfect score through half-pixel controls across 10000 setups', () => {
    for (let seed = 0; seed < 10000; seed++) {
      const { center } = balanceSetup(String(seed));
      const reachable = Math.round(center * 2) / 2;
      expect(reachable).toBeGreaterThanOrEqual(40);
      expect(reachable).toBeLessThanOrEqual(320);
      expect(balanceScore(reachable, center)).toBe(100);
    }
  });
  it('uses the center of mass including the plank', () => {
    const setup = balanceSetup('2026-11-14');
    expect(balanceSetup('2026-11-14')).toEqual(setup);
    const torque = setup.creatures.reduce((sum, creature) => sum + creature.radius ** 2 * (creature.x - setup.center), 900 * (180 - setup.center));
    expect(torque).toBeCloseTo(0, 7);
    expect(setup.center).toBeGreaterThan(40);
    expect(setup.center).toBeLessThan(320);
  });
  it('scores equal errors equally and rewards smaller errors', () => {
    expect(balanceScore(180, 180)).toBe(100);
    expect(balanceScore(170, 180)).toBe(balanceScore(190, 180));
    expect(balanceScore(175, 180)).toBeGreaterThan(balanceScore(170, 180));
  });
  it('commits once and ignores attempts to move the support after release', () => {
    const finish = vi.fn();
    const placed = vi.fn();
    const release = vi.fn();
    const game = createBalanceGame('test', finish, placed, release);
    game.place(0);
    expect(placed).toHaveBeenLastCalledWith(40);
    game.release();
    game.place(320);
    game.release();
    game.update?.(performance.now() + 3000);
    game.update?.(performance.now() + 4000);
    expect(release).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledExactlyOnceWith(balanceScore(40, balanceSetup('test').center), Math.abs(40 - balanceSetup('test').center));
  });
});
