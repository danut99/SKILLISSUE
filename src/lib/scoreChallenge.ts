import { MODES, type Mode } from '../config';
import type { Attempt, Detail } from './store';

type ChallengeMode = Mode | 'balance';
export interface ScoreChallenge { mode: ChallengeMode; date: string; name: string; attempt: Attempt }

export function challengeUrl(base: string, mode: ChallengeMode, date: string, name: string, attempt: Attempt): string {
  const url = new URL(base);
  url.search = '';
  const params = new URLSearchParams({ date, name: name.slice(0, 30), score: String(attempt.score) });
  for (const key of ['a', 'b', 'gapCm'] as const) {
    const value = attempt.detail[key];
    if (typeof value === 'number' && Number.isFinite(value)) params.set(key, String(value));
  }
  if (attempt.detail.fail || attempt.detail.crashed) params.set('fail', '1');
  url.hash = `${mode}/beat?${params}`;
  return url.href;
}

export function readScoreChallenge(hash: string): ScoreChallenge | null {
  if (hash.length > 1500) return null;
  const match = /^#(draw|cut|brake|balance)\/beat\?(.+)$/.exec(hash);
  if (!match) return null;
  const mode = match[1] as ChallengeMode;
  if (mode !== 'balance' && !MODES.includes(mode)) return null;
  const p = new URLSearchParams(match[2]);
  const date = p.get('date') ?? '';
  const rawScore = p.get('score');
  const score = Number(rawScore);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || rawScore === null || !Number.isFinite(score) || score < 0 || score > 100) return null;
  const parsedDate = new Date(date);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return null;
  const detail: Detail = {};
  for (const key of ['a', 'b', 'gapCm'] as const) {
    const value = p.get(key);
    if (value === null) continue;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > (key === 'gapCm' ? 100000 : 100)) return null;
    detail[key] = number;
  }
  if (p.get('fail') === '1') detail.fail = true;
  return { mode, date, name: (p.get('name') || 'A friend').slice(0, 30), attempt: { score, detail, at: 0 } };
}
