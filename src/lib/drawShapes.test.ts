import { describe, expect, it } from 'vitest';
import { addDays } from './daily';
import { dailyDrawShape, DRAW_SHAPES, shapeAccuracy, shapeRadius, type DrawShape } from './drawShapes';

const center = { x: 180, y: 330 };
function outline(shape: DrawShape, scale = 110, reverse = false) {
  return Array.from({ length: 361 }, (_, index) => {
    const angle = index / 360 * Math.PI * 2 * (reverse ? -1 : 1);
    const radius = shapeRadius(shape, angle) * scale;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

describe('daily drawing targets', () => {
  it('rotates through every shape and wraps consistently across dates', () => {
    const dates = Array.from({ length: 10 }, (_, i) => addDays('2026-11-12', i));
    expect(dates.slice(0, 5).map(dailyDrawShape)).toEqual([...DRAW_SHAPES]);
    for (let i = 0; i < 5; i++) expect(dailyDrawShape(dates[i])).toBe(dailyDrawShape(dates[i + 5]));
    expect(dailyDrawShape('2026-11-11')).toBe('hexagon');
  });

  for (const shape of DRAW_SHAPES) {
    it(`scores a matching ${shape} at different sizes and in both directions`, () => {
      for (const scale of [65, 130]) for (const reverse of [false, true]) {
        expect(shapeAccuracy(outline(shape, scale, reverse), center, true, shape).score).toBeGreaterThan(99);
      }
    });
  }

  it('penalizes the wrong shape, wrong orientation, distortion and open strokes', () => {
    const circle = outline('circle');
    expect(shapeAccuracy(circle, center, true, 'triangle').score).toBeLessThan(75);
    expect(shapeAccuracy(outline('diamond'), center, true, 'square').score).toBeLessThan(75);
    const stretched = outline('hexagon').map(p => ({ x: center.x + (p.x - center.x) * 1.5, y: p.y }));
    expect(shapeAccuracy(stretched, center, true, 'hexagon').score).toBeLessThan(80);
    const open = outline('square').slice(0, 310);
    expect(shapeAccuracy(open, center, true, 'square').score).toBeLessThan(shapeAccuracy(open, center, false, 'square').score);
  });
});
