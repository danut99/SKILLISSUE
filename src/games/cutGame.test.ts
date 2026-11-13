import { describe, expect, it } from 'vitest';
import { dailyShape } from './cutGame';
import { polygonArea, splitPolygon } from '../lib/geometry';

describe('party cut shapes', () => {
  it('provides twelve reproducible, bounded silhouettes that conserve area when sliced', () => {
    const shapes = ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'pentagon', 'oval', 'rectangle', 'heptagon', 'octagon', 'star', 'flower'] as const;
    const outlines = new Set<string>();
    for (const shape of shapes) {
      const result = dailyShape('party:shared-seed', 0, shape);
      expect(dailyShape('party:shared-seed', 0, shape)).toEqual(result);
      expect(result.poly.every(p => p.x >= 0 && p.x <= 360 && p.y >= 0 && p.y <= 640)).toBe(true);
      expect(polygonArea(result.poly)).toBeGreaterThan(1000);
      outlines.add(JSON.stringify(result.poly));
      for (const angle of [0, .5, 1, 2]) {
        const dx = Math.cos(angle) * 500, dy = Math.sin(angle) * 500;
        const split = splitPolygon(result.poly, { x: 180 - dx, y: 340 - dy }, { x: 180 + dx, y: 340 + dy });
        expect(split.posArea + split.negArea).toBeCloseTo(split.total, 5);
      }
    }
    expect(outlines.size).toBe(12);
  });
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

describe('deceptive level and party silhouettes', () => {
  it('keeps advanced shapes bounded, simple and correctly sliceable across many seeds', () => {
    const orient=(a:{x:number;y:number},b:{x:number;y:number},c:{x:number;y:number})=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    for (const complexity of [3,4,5,6,7,8,9]) for(let seed=0;seed<20;seed++) {
      const {poly}=dailyShape(`advanced:${seed}`,complexity);
      expect(poly.every(p=>p.x>=0&&p.x<=360&&p.y>=0&&p.y<=640)).toBe(true);
      expect(polygonArea(poly)).toBeGreaterThan(1000);
      for(let i=0;i<poly.length;i++) for(let j=i+2;j<poly.length;j++) {
        if(i===0&&j===poly.length-1)continue;
        const a=poly[i],b=poly[(i+1)%poly.length],c=poly[j],d=poly[(j+1)%poly.length];
        expect(orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0).toBe(false);
      }
      for(const angle of [0,.4,1,2]) {
        const a={x:180-Math.cos(angle)*400,y:340-Math.sin(angle)*400};
        const b={x:180+Math.cos(angle)*400,y:340+Math.sin(angle)*400};
        const split=splitPolygon(poly,a,b);
        expect(split.posArea+split.negArea).toBeCloseTo(split.total,4);
      }
      expect(dailyShape(`advanced:${seed}`,complexity).poly).toEqual(poly);
    }
  });
});
