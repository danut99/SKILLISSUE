import { MODES, type Mode } from '../config';
import { modeDay, totalScore, triesLeft, type Attempt, type ModeDay } from './store';
import { addDays } from './daily';

type Days = Record<string, Partial<Record<Mode, ModeDay>>>;
export const DAILY_ORDER: readonly Mode[] = ['cut', 'draw', 'brake'];

export function dailyProgress(days: Days, date: string) {
  const played = DAILY_ORDER.filter(mode => modeDay(days, date, mode).tries.length > 0);
  return { played, remaining: DAILY_ORDER.filter(mode => !played.includes(mode)), complete: played.length === MODES.length };
}

/** Only completed daily sets are comparable; partial and future days aren't records. */
export function personalDailyTarget(days: Days, date: string) {
  const yesterdayDate = addDays(date, -1);
  const completed = Object.keys(days).filter(day => day <= date && dailyProgress(days, day).complete);
  const previous = completed.filter(day => day < date);
  return {
    yesterday: dailyProgress(days, yesterdayDate).complete ? totalScore(days, yesterdayDate) : null,
    record: completed.length ? Math.max(...completed.map(day => totalScore(days, day))) : null,
    previousRecord: previous.length ? Math.max(...previous.map(day => totalScore(days, day))) : null,
    complete: dailyProgress(days, date).complete,
    today: totalScore(days, date),
    attemptsLeft: DAILY_ORDER.reduce((sum, mode) => sum + triesLeft(modeDay(days, date, mode)), 0),
  };
}

/** Compare against earlier attempts, never against the attempt just added. */
export function dailyMilestone(days: Days, date: string, mode: Mode, attempt: Attempt | null) {
  if (!attempt) return null;
  const attempts = modeDay(days, date, mode).tries;
  const index = attempts.findIndex(value => value.at === attempt.at);
  if (index < 0) return null;
  const earlier = attempts.slice(0, index);
  if (!earlier.length) return { kind: 'first' as const, improvement: 0, score: attempt.score };
  const previous = Math.max(...earlier.map(value => value.score));
  return attempt.score > previous
    ? { kind: 'improved' as const, improvement: attempt.score - previous, score: attempt.score }
    : null;
}

export function nextDailyGame(days: Days, date: string, current: Mode): Mode | null {
  return dailyProgress(days, date).remaining.find(mode => mode !== current) ?? null;
}

/** A personal record must beat earlier scores across days, not only today's tries. */
export function isNewPersonalBest(days: Days, date: string, mode: Mode, attempt: Attempt | null): boolean {
  if (!attempt || !modeDay(days, date, mode).tries.some(value => value.at === attempt.at)) return false;
  const earlier = Object.entries(days).filter(([day]) => day <= date).flatMap(([day]) =>
    modeDay(days, day, mode).tries.filter(value => day < date || value.at < attempt.at));
  return earlier.length > 0 && attempt.score > Math.max(...earlier.map(value => value.score));
}
