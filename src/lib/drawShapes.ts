import { dayNumber } from './daily';
import { circleAccuracy, type Pt } from './geometry';

export const DRAW_SHAPES = ['circle', 'square', 'triangle', 'diamond', 'hexagon'] as const;
export type DrawShape = typeof DRAW_SHAPES[number];

export function dailyDrawShape(date: string): DrawShape {
  const index = ((dayNumber(date) - 1) % DRAW_SHAPES.length + DRAW_SHAPES.length) % DRAW_SHAPES.length;
  return DRAW_SHAPES[index];
}

/** Radius of a unit outline at an angle, with polygon vertices pointing up. */
export function shapeRadius(shape: DrawShape, angle: number): number {
  if (shape === 'circle') return 1;
  const sides = shape === 'triangle' ? 3 : shape === 'hexagon' ? 6 : 4;
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
