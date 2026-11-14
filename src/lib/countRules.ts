import { rngFor } from './daily';

export const COUNT_ROUNDS = 5;
export const COUNT_TRIES = 5;
export const COUNT_FLASH_MS = 1300;
export const COUNT_ANSWER_MS = 10000;

/** Integer formula is mirrored in SQL for server-side scoring. */
export function dotCount(date: string, round: number): number {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  // A small daily offset, then two more dots each round: 3–5 up to 11–13.
  return 3 + ((day % 3) + 3) % 3 + round * 2;
}
export function countScore(date: string, answers: number[]): number {
  return answers.reduce((sum, answer, round) => sum + (answer < 0 ? 0 : Math.max(0, 20 - Math.abs(answer - dotCount(date, round)) * 5)), 0);
}
export function countDots(date: string, round: number) {
  const rng = rngFor(`${date}:count:${round}`);
  const cells = Array.from({ length: 48 }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  return cells.slice(0, dotCount(date, round)).map(cell => ({ x: 35 + cell % 6 * 58 + rng() * 12, y: 40 + Math.floor(cell / 6) * 43 + rng() * 12 }));
}
