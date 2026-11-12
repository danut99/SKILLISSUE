import { describe, expect, it } from 'vitest';
import { brakeParams, brakeScore } from '../games/brakeGame';
import { dailyShape } from '../games/cutGame';
import { circleAccuracy, polygonArea, splitPolygon } from './geometry';

describe('splitPolygon', () => {
  it('splits a square exactly in half through its center', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const s = splitPolygon(sq, { x: 5, y: -1 }, { x: 5, y: 11 });
    expect(s.posArea).toBeCloseTo(50);
    expect(s.negArea).toBeCloseTo(50);
  });

  it('conserves area on a concave polygon cut through two lobes', () => {
    // U shape: a horizontal cut crosses both arms
    const u = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 30 },
      { x: 20, y: 30 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 30 },
      { x: 0, y: 30 },
    ];
    const s = splitPolygon(u, { x: -5, y: 20 }, { x: 40, y: 20 });
    expect(s.posArea + s.negArea).toBeCloseTo(polygonArea(u));
    expect(Math.min(s.posArea, s.negArea)).toBeCloseTo(200); // two 10×10 arm tips
  });
});

describe('daily seed', () => {
  it('gives every player the same 7–9 vertex shape for a date, and a different one tomorrow', () => {
    const a = dailyShape('2026-11-12');
    expect(dailyShape('2026-11-12')).toEqual(a);
    expect(a.poly.length).toBeGreaterThanOrEqual(7);
    expect(a.poly.length).toBeLessThanOrEqual(9);
    expect(dailyShape('2026-11-13').poly).not.toEqual(a.poly);
    expect(brakeParams('2026-11-12')).toEqual(brakeParams('2026-11-12'));
  });

  it('always leaves room to stop before the wall', () => {
    for (let d = 1; d <= 60; d++) {
      const p = brakeParams(`2027-01-${String((d % 28) + 1).padStart(2, '0')}`);
      expect(p.D).toBeGreaterThan(p.stopDist + 29);
    }
  });
});

describe('scoring', () => {
  it('rates a perfect circle near 99.9 and an ellipse much lower', () => {
    const c = { x: 0, y: 0 };
    const circle = Array.from({ length: 200 }, (_, i) => ({ x: Math.cos((i / 199) * 2 * Math.PI) * 100, y: Math.sin((i / 199) * 2 * Math.PI) * 100 }));
    const egg = circle.map((p) => ({ x: p.x * 1.3, y: p.y * 0.8 }));
    expect(circleAccuracy(circle, c, true).score).toBeGreaterThan(99);
    expect(circleAccuracy(egg, c, true).score).toBeLessThan(70);
  });

  it('brake score decays with the gap', () => {
    expect(brakeScore(0)).toBe(100);
    expect(brakeScore(1)).toBeGreaterThan(99);
    expect(brakeScore(100)).toBeLessThan(65);
  });
});
