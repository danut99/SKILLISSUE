import { dayNumber } from './daily';
import { circleAccuracy, type Pt } from './geometry';

export const DRAW_SHAPES = ['circle', 'square', 'triangle', 'diamond', 'hexagon'] as const;
export type DrawShape = typeof DRAW_SHAPES[number] | 'pentagon' | 'octagon' | 'oval' | 'star' | 'flower' | 'rectangle' | 'heptagon';

export function dailyDrawShape(date: string): typeof DRAW_SHAPES[number] {
  const index = ((dayNumber(date) - 1) % DRAW_SHAPES.length + DRAW_SHAPES.length) % DRAW_SHAPES.length;
  return DRAW_SHAPES[index];
}

/** Radius of a unit outline at an angle, with polygon vertices pointing up. */
export function shapeRadius(shape: DrawShape, angle: number): number {
  if (shape === 'circle') return 1;
  if (shape === 'rectangle') return Math.min(.65 / Math.max(Math.abs(Math.cos(angle)), 1e-9), 1 / Math.max(Math.abs(Math.sin(angle)), 1e-9));
  if (shape === 'oval') return 1 / Math.sqrt(Math.cos(angle) ** 2 / .7 ** 2 + Math.sin(angle) ** 2);
  if (shape === 'flower') return .78 + .22 * Math.cos(5 * (angle + Math.PI / 2));
  if (shape === 'star') {
    const step = Math.PI / 5;
    const normalized = ((angle + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const i = Math.floor(normalized / step);
    const t = normalized - i * step;
    const r1 = i % 2 === 0 ? 1 : .48;
    const r2 = i % 2 === 0 ? .48 : 1;
    return r1 * r2 * Math.sin(step) / (r2 * Math.sin(step - t) + r1 * Math.sin(t));
  }
  const sides = shape === 'triangle' ? 3 : shape === 'pentagon' ? 5 : shape === 'hexagon' ? 6 : shape === 'heptagon' ? 7 : shape === 'octagon' ? 8 : 4;
  const rotation = shape === 'square' ? Math.PI / 4 : -Math.PI / 2;
  const sector = 2 * Math.PI / sides;
  const normal = rotation + sector / 2;
  const offset = ((angle - normal + Math.PI / sides) % sector + sector) % sector - Math.PI / sides;
  return Math.cos(Math.PI / sides) / Math.cos(offset);
}

/** Normalize each sample against the target outline before fitting its size. */
export function shapeAccuracy(points: Pt[], center: Pt, final: boolean, shape: DrawShape) {
  const normalized = points.map(point => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const radius = shapeRadius(shape, Math.atan2(dy, dx));
    return { x: center.x + dx / radius, y: center.y + dy / radius };
  });
  return circleAccuracy(normalized, center, final);
}
