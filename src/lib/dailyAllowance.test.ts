import { afterEach, describe, expect, it } from 'vitest';
import { dailyTryLimit, useDailyAllowance } from './dailyAllowance';
import { bestAttempt, maxTries, triesLeft, type ModeDay } from './store';

afterEach(() => useDailyAllowance.setState({ linked: false }));
const played = (count: number): ModeDay => ({ bonus: false, tries: Array.from({ length: count }, (_, i) => ({ score: 70 + i, detail: {}, at: i })) });

describe('daily account allowance', () => {
 it('gives guests five tries and stops at their fifth', () => {
  useDailyAllowance.setState({ linked: false });
  expect(dailyTryLimit()).toBe(5);
  expect(triesLeft(played(4))).toBe(1);
  expect(triesLeft(played(5))).toBe(0);
 });
 it('unlocks three additional tries without resetting guest results', () => {
  const day = played(5);
  const original = [...day.tries];
  const best = bestAttempt(day);
  useDailyAllowance.setState({ linked: true });
  expect(maxTries(day)).toBe(8);
  expect(triesLeft(day)).toBe(3);
  expect(day.tries).toEqual(original);
  expect(bestAttempt(day)).toBe(best);
  expect(triesLeft(played(8))).toBe(0);
 });
 it('gives existing registered players eight fresh tries and keeps ad bonuses separate', () => {
  useDailyAllowance.setState({ linked: true });
  expect(triesLeft(played(0))).toBe(8);
  expect(maxTries({ ...played(0), bonus: true })).toBe(9);
 });
 it('removes the account allowance on logout and never reports negative tries', () => {
  useDailyAllowance.setState({ linked: true });
  useDailyAllowance.setState({ linked: false });
  expect(maxTries(played(8))).toBe(5);
  expect(triesLeft(played(8))).toBe(0);
 });
});
