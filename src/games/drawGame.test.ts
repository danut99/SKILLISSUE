import { describe, expect, it, vi } from 'vitest';
import { createDrawGame } from './drawGame';
import { addDays } from '../lib/daily';
import { dailyDrawShape, shapeRadius } from '../lib/drawShapes';

vi.mock('../lib/audio', () => ({
  sfx: { startHum: vi.fn(), stop: vi.fn(), setFreq: vi.fn(), ding: vi.fn(), fail: vi.fn(), pop: vi.fn() },
}));

describe('daily shape game input', () => {
  it('finishes and scores all five daily targets through pointer input', () => {
    for (let day = 0; day < 5; day++) {
      const date = addDays('2026-11-12', day);
      const shape = dailyDrawShape(date);
      for (const direction of [-1, 1]) {
        const finish = vi.fn();
        const startClip = vi.fn();
        const game = createDrawGame({ date, finish, startClip, cancelClip: vi.fn(), toast: vi.fn() });
        const points = Array.from({ length: 182 }, (_, i) => {
          const angle = direction * i / 180 * Math.PI * 2;
          const radius = shapeRadius(shape, angle) * 125;
          return { x: 180 + Math.cos(angle) * radius, y: 640 * .52 + Math.sin(angle) * radius };
        });
        const event = {} as PointerEvent;
        game.down!(points[0], event);
        points.slice(1).forEach(point => game.move!(point, event));
        game.up!(points.at(-1)!, event);
        expect(startClip).toHaveBeenCalledOnce();
        expect(finish).toHaveBeenCalledOnce();
        expect(finish.mock.calls[0][0].score).toBeGreaterThan(95);
        const stroke = finish.mock.calls[0][0].detail.stroke;
        expect(stroke.length).toBeGreaterThan(12);
        expect(stroke.length).toBeLessThanOrEqual(501);
        expect(stroke[0]).toEqual([Math.round(points[0].x * 100) / 100, Math.round(points[0].y * 100) / 100]);
        game.destroy!();
      }
    }
  });

  it('does not consume a try for accidental taps', () => {
    const finish = vi.fn();
    const cancelClip = vi.fn();
    const game = createDrawGame({ date: '2026-11-13', finish, startClip: vi.fn(), cancelClip, toast: vi.fn() });
    const point = { x: 280, y: 330 };
    const event = {} as PointerEvent;
    game.down!(point, event);
    game.up!(point, event);
    expect(finish).not.toHaveBeenCalled();
    expect(cancelClip).toHaveBeenCalledOnce();
    game.destroy!();
  });
});

it('uses a party shape override without changing the daily challenge', () => {
  const finish = vi.fn();
  const game = createDrawGame({ date: 'party:room:1:2', finish, startClip: vi.fn(), cancelClip: vi.fn(), toast: vi.fn() }, { shape: 'square' });
  const points = Array.from({ length: 182 }, (_, i) => {
    const angle = i / 180 * Math.PI * 2;
    const radius = shapeRadius('square', angle) * 125;
    return { x: 180 + Math.cos(angle) * radius, y: 640 * .52 + Math.sin(angle) * radius };
  });
  const event = {} as PointerEvent;
  game.down!(points[0], event);
  points.slice(1).forEach(p => game.move!(p, event));
  game.up!(points.at(-1)!, event);
  expect(finish).toHaveBeenCalledOnce();
  expect(finish.mock.calls[0][0].score).toBeGreaterThan(95);
  game.destroy!();
});
