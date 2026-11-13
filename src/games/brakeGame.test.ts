import { levelBrakePassCm, levelBrakeScoreScale } from '../lib/levels';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { brakeParams, createBrakeGame } from './brakeGame';
import { brakeFeedback, brakeStopResult, dailyBrakeObjective } from '../lib/brakeChallenge';
import { fmtResult, roastFor } from '../lib/scoring';
import type { AttemptResult } from './types';

vi.mock('../lib/audio', () => ({ sfx: {
  ensure: vi.fn(), stop: vi.fn(), startEngine: vi.fn(), startScreech: vi.fn(),
  crash: vi.fn(), fail: vi.fn(), ding: vi.fn(), pop: vi.fn(), beep: vi.fn(), setFreq: vi.fn(), setGain: vi.fn(),
} }));
vi.mock('../lib/pixelAssets', () => ({ carSprite: () => ({ image: { complete: false }, crop: [0, 0, 48, 80, false] }) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function drive(date: string, overshootM: number | null, fps = 60): AttemptResult {
  const finish = vi.fn();
  const game = createBrakeGame({ date, finish, startClip: vi.fn(), cancelClip: vi.fn(), toast: vi.fn() });
  const params = brakeParams(date);
  let clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const press = () => game.key!({ code: 'Space', timeStamp: clock, preventDefault: vi.fn() } as unknown as KeyboardEvent);
  press();
  const start = clock + 1650;
  game.update!(start);
  const brakingAt = overshootM === null ? Infinity : start + (params.D - params.stopDist + overshootM) / params.v * 1000;
  for (let time = start; time < Math.min(brakingAt, start + 30000); time += 1000 / fps) game.update!(time);
  if (overshootM !== null) {
    clock = brakingAt;
    press();
    for (let time = brakingAt; time <= brakingAt + 15000; time += 1000 / fps) game.update!(time);
  }
  expect(finish).toHaveBeenCalledOnce();
  const result = finish.mock.calls[0][0] as AttemptResult;
  game.destroy!();
  return result;
}

describe('daily driving objectives', () => {
  it('explains which way to adjust braking for each result', () => {
    expect(brakeFeedback(0, { crashed: true }).title).toBe('Too late!');
    expect(brakeFeedback(0, { objective: 'stop-line', fail: true, offsetCm: 0 }).title).toBe('Too late!');
    expect(brakeFeedback(60, { objective: 'parking', offsetCm: -100 }).tip).toContain('earlier');
    expect(brakeFeedback(60, { objective: 'parking', offsetCm: 100 }).tip).toContain('longer');
    expect(brakeFeedback(96, { objective: 'parking', offsetCm: -8 }).title).toBe('Almost perfect!');
    expect(brakeFeedback(100, { objective: 'parking', offsetCm: 0 }).title).toBe('Perfect stop!');
  });
  it('runs every Party objective from a shared room seed within the round limit', () => {
    const seed = 'party:12345678-1234-4234-8234-123456789012:1:2';
    expect(brakeParams(seed)).toEqual(brakeParams(seed));
    for (const objective of ['wall', 'parking', 'stop-line'] as const) {
      const finish = vi.fn();
      let clock = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => clock);
      const game = createBrakeGame({ date: seed, finish, startClip: vi.fn(), cancelClip: vi.fn(), toast: vi.fn() }, undefined, { objective });
      const params = brakeParams(seed);
      const press = () => game.key!({ code: 'Space', timeStamp: clock, preventDefault: vi.fn() } as unknown as KeyboardEvent);
      press();
      const brakeAt = 1000 + 1650 + (params.D - params.stopDist - .01) / params.v * 1000;
      let braked = false;
      for (clock = 1016; clock < 17000 && !finish.mock.calls.length; clock += 16) {
        game.update!(clock);
        if (!braked && clock >= brakeAt) { press(); braked = true; }
      }
      expect(finish).toHaveBeenCalledOnce();
      expect(finish.mock.calls[0][0].detail.objective).toBe(objective);
      game.destroy!();
    }
  });
  it('changes the objective every day and gives everyone the same objective', () => {
    expect(dailyBrakeObjective('2026-11-12')).toBe('wall');
    expect(dailyBrakeObjective('2026-11-13')).toBe('parking');
    expect(dailyBrakeObjective('2026-11-14')).toBe('stop-line');
    expect(dailyBrakeObjective('2026-11-15')).toBe('wall');
  });

  it('scores an exact stop and rewards equal parking errors on either side', () => {
    expect(brakeStopResult('parking', 50, 50).score).toBe(100);
    expect(brakeStopResult('parking', 50, 49.9).score).toBe(brakeStopResult('parking', 50, 50.1).score);
    expect(brakeStopResult('parking', 50, 50.1).detail.offsetCm).toBe(-10);
    expect(brakeStopResult('parking', 50, 47).detail.fail).toBe(true);
    expect(brakeStopResult('parking', 50, 53).detail.fail).toBe(true);
    expect(brakeStopResult('stop-line', 50, 50.001).score).toBe(0);
  });

  for (const date of ['2026-11-12', '2026-11-13', '2026-11-14']) {
    it(`scores exact input timing consistently at 30, 60 and 144fps on ${date}`, () => {
      const results = [30, 60, 144].map(fps => drive(date, -.01, fps));
      expect(results[0].score).toBeGreaterThan(99);
      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);
    });
  }

  it('allows parking past the marker, gives partial credit half in the bay, fails a red-light crossing and crashes into the wall', () => {
    const parking = drive('2026-11-13', .1);
    expect(parking.score).toBeGreaterThan(90);
    expect(parking.detail.fail).toBeUndefined();
    expect(parking.detail.offsetCm).toBe(-10);
    expect(drive('2026-11-14', .1).display).toBe('OVER LINE');
    expect(drive('2026-11-12', .1).detail.crashed).toBe(true);
    const partly = drive('2026-11-13', -3);
    expect(partly.detail.partial).toBe(true);
    expect(partly.score).toBeGreaterThan(0);
    expect(drive('2026-11-13', -40).display).toBe('MISSED BAY');
  });

  it('finishes even if the player never brakes', () => {
    expect(drive('2026-11-12', null).detail.crashed).toBe(true);
    expect(drive('2026-11-13', null).display).toBe('MISSED BAY');
    expect(drive('2026-11-14', null).display).toBe('OVER LINE');
  });

  it('keeps displaying previously saved car scores', () => {
    expect(fmtResult('brake', { score: 95, detail: { gapCm: 10 } })).toBe('10.0 cm');
    expect(fmtResult('brake', { score: 0, detail: { crashed: true } })).toContain('CRASH');
  });
});

it('restores saved driving results without starting play or recording another attempt', () => {
  for (const detail of [{ gapCm: 439, offsetCm: 439 }, { crashed: true, impactKmh: 30 }, { fail: true, gapCm: 300, offsetCm: -300 }]) {
    const finish = vi.fn();
    const startClip = vi.fn();
    const game = createBrakeGame({ date: '2026-11-12', finish, startClip, cancelClip: vi.fn(), toast: vi.fn() }, { score: 10, detail, at: 0 });
    game.key!({ code: 'Space', timeStamp: performance.now(), preventDefault: vi.fn() } as unknown as KeyboardEvent);
    game.update!(performance.now() + 30000);
    expect(finish).not.toHaveBeenCalled();
    expect(startClip).not.toHaveBeenCalled();
    game.destroy!();
  }
});

describe('partly parked', () => {
  it('scores a car partly inside the bay by how much of it is in, and fails only with no overlap', () => {
    const edge = brakeStopResult('parking', 50, 52.5, 4).score;
    const half = brakeStopResult('parking', 50, 54.5, 4);
    expect(half.detail.partial).toBe(true);
    expect(half.score).toBeCloseTo(edge / 2, 1);
    expect(brakeStopResult('parking', 50, 45.5, 4).score).toBeCloseTo(edge / 2, 1);
    const miss = brakeStopResult('parking', 50, 57, 4);
    expect([miss.score, miss.detail.fail, miss.detail.missCm]).toEqual([0, true, 50]);
  });
});

describe('missed parking bay feedback', () => {
  it('says how far the car ended up outside the bay, in either direction', () => {
    const over = brakeStopResult('parking', 50, 52.9);
    const short = brakeStopResult('parking', 50, 46);
    expect(roastFor('brake', { ...over, at: 0 })).toBe('Overshot the bay by 40 cm.');
    expect(roastFor('brake', { ...short, at: 0 })).toBe('Stopped 1.5 m short of the bay.');
  });
});

describe('more forgiving Car level scoring', () => {
  it('passes safe stops at the advertised distance for every level', () => {
    for (let level=1; level<=5; level++) {
      const gap=levelBrakePassCm(level);
      const scale=levelBrakeScoreScale(level);
      for (const objective of ['wall','stop-line','parking'] as const) {
        expect(brakeStopResult(objective,50,50-gap/100,4,scale).score).toBe(85);
        expect(brakeStopResult(objective,50,50-(gap+2)/100,4,scale).score).toBeLessThan(85);
      }
      expect(brakeStopResult('stop-line',50,50.1,4,scale).score).toBe(0);
      expect(brakeStopResult('parking',50,60,4,scale).detail.fail).toBe(true);
    }
  });
  it('keeps the default scoring unchanged',()=>{
    expect(brakeStopResult('wall',50,49).score).toBeCloseTo(60.65,2);
    expect(brakeStopResult('wall',50,48.5,4,levelBrakeScoreScale(1)).score).toBe(85);
  });
});
