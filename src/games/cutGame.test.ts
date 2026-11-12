import { describe, expect, it } from 'vitest';
import { dailyShape } from './cutGame';
import { polygonArea, splitPolygon } from '../lib/geometry';

describe('party cut shapes', () => {
  it('gives every player the same seeded polygon and adds vertices at later levels', () => {
    const seed = 'party:room-token:2:5';
    for (let level = 0; level < 3; level++) {
      const first = dailyShape(seed, level);
      expect(dailyShape(seed, level)).toEqual(first);
      expect(first.poly.length).toBeGreaterThanOrEqual(7 + level * 2);
      expect(first.poly.length).toBeLessThanOrEqual(9 + level * 2);
      expect(polygonArea(first.poly)).toBeGreaterThan(0);
      const split = splitPolygon(first.poly, { x: 0, y: 340 }, { x: 360, y: 340 });
      expect(split.posArea + split.negArea).toBeCloseTo(split.total, 5);
    }
  });
  it('leaves the original daily shapes unchanged with default options', () => {
    expect(dailyShape('2026-11-12')).toEqual(dailyShape('2026-11-12', 0));
  });
});
