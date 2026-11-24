import { describe, expect, it } from 'vitest';
import { dailyProgress, dailyMilestone, nextDailyGame, personalDailyTarget, isNewPersonalBest } from './engagement';
import type { Attempt, ModeDay } from './store';
const date = '2026-11-24';
const attempt = (score: number, at: number): Attempt => ({ score, at, detail: {} });
const day = (...tries: Attempt[]): ModeDay => ({ tries, bonus: false });

describe('personal daily target', () => {
  const complete = (score: number) => ({ cut: day(attempt(score, 1)), draw: day(attempt(score, 2)), brake: day(attempt(score, 3)) });
  it('has no invented history for a new player', () => {
    expect(personalDailyTarget({}, date)).toMatchObject({ yesterday: null, record: null, previousRecord: null, complete: false });
  });
  it('excludes partial days and future days from the record', () => {
    const days = { '2026-11-23': { cut: day(attempt(100, 1)), draw: day(attempt(100, 2)) }, '2026-11-25': complete(100) };
    expect(personalDailyTarget(days, date)).toMatchObject({ yesterday: null, record: null });
  });
  it('uses the best attempt in each game, and keeps previous records separate', () => {
    const today = complete(80);
    today.cut.tries.push(attempt(95, 4));
    const target = personalDailyTarget({ '2026-11-22': complete(70), '2026-11-23': complete(75), [date]: today }, date);
    expect(target).toMatchObject({ yesterday: 225, record: 255, previousRecord: 225, today: 255, complete: true });
  });
  it('recognizes zero as a completed score rather than missing history', () => {
    expect(personalDailyTarget({ '2026-11-23': complete(0) }, date)).toMatchObject({ yesterday: 0, record: 0 });
  });
  it('keeps an older record without claiming it was yesterday', () => {
    expect(personalDailyTarget({ '2026-11-20': complete(90) }, date)).toMatchObject({ yesterday: null, record: 270 });
  });
});

describe('daily game journey', () => {
  it('offers Draw after the featured Cut, rather than skipping it for Brake', () => {
    const days = { [date]: { cut: day(attempt(0, 1)) } };
    expect(dailyProgress(days, date).played).toEqual(['cut']);
    expect(nextDailyGame(days, date, 'cut')).toBe('draw');
  });
  it('continues to an unplayed game regardless of entry order', () => {
    const days = { [date]: { draw: day(attempt(90, 1)), brake: day(attempt(80, 2)) } };
    expect(nextDailyGame(days, date, 'brake')).toBe('cut');
    expect(dailyProgress(days, date).complete).toBe(false);
  });
  it('finishes only after all three games have an attempt, including zero scores', () => {
    const days = { [date]: { cut: day(attempt(0, 1)), draw: day(attempt(0, 2)), brake: day(attempt(0, 3)) } };
    expect(dailyProgress(days, date).complete).toBe(true);
    expect(nextDailyGame(days, date, 'brake')).toBeNull();
    expect(dailyProgress(days, '2026-11-25').played).toEqual([]);
  });
  it('does not count empty or abandoned games', () => {
    expect(dailyProgress({ [date]: { cut: day() } }, date).played).toEqual([]);
  });
});

describe('personal result milestones', () => {
  it('requires beating earlier days to claim a personal best', () => {
    const fresh = attempt(93, 4);
    const days = { '2026-11-23': { cut: day(attempt(98, 1)) }, [date]: { cut: day(attempt(80, 2), fresh) } };
    expect(isNewPersonalBest(days, date, 'cut', fresh)).toBe(false);
    expect(isNewPersonalBest({ [date]: days[date] }, date, 'cut', fresh)).toBe(true);
  });
  it('does not call a first attempt, a tie, or a restored result a new record', () => {
    const first = attempt(90, 1), tied = attempt(90, 2);
    expect(isNewPersonalBest({ [date]: { cut: day(first) } }, date, 'cut', first)).toBe(false);
    expect(isNewPersonalBest({ [date]: { cut: day(first, tied) } }, date, 'cut', tied)).toBe(false);
    expect(isNewPersonalBest({ [date]: { cut: day(first) } }, date, 'cut', null)).toBe(false);
  });
  it('celebrates a first score without calling it an improvement', () => {
    const first = attempt(80, 1);
    expect(dailyMilestone({ [date]: { cut: day(first) } }, date, 'cut', first)).toEqual({ kind: 'first', score: 80, improvement: 0 });
  });
  it('compares with the previous best, not just the previous attempt', () => {
    const fresh = attempt(93, 4);
    const days = { [date]: { cut: day(attempt(90, 1), attempt(80, 2), attempt(87, 3), fresh) } };
    expect(dailyMilestone(days, date, 'cut', fresh)).toEqual({ kind: 'improved', score: 93, improvement: 3 });
  });
  it('does not celebrate ties, lower scores, restored results or missing attempts', () => {
    const tied = attempt(90, 2), lower = attempt(80, 3);
    const days = { [date]: { cut: day(attempt(90, 1), tied, lower) } };
    expect(dailyMilestone(days, date, 'cut', tied)).toBeNull();
    expect(dailyMilestone(days, date, 'cut', lower)).toBeNull();
    expect(dailyMilestone(days, date, 'cut', null)).toBeNull();
    expect(dailyMilestone(days, date, 'cut', attempt(100, 9))).toBeNull();
  });
});
