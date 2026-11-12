import { describe, expect, it } from 'vitest';
import { challengeUrl, readScoreChallenge } from './scoreChallenge';

describe('score challenge links', () => {
  it('roundtrips a cut challenge and preserves its day and score', () => {
    const url = challengeUrl('https://example.com/game/#draw', 'cut', '2026-11-12', 'A & B', { score: 98, detail: { a: 49.5, b: 50.5 }, at: 123 });
    const parsed = readScoreChallenge(new URL(url).hash);
    expect(parsed).toMatchObject({ mode: 'cut', date: '2026-11-12', name: 'A & B', attempt: { score: 98, detail: { a: 49.5, b: 50.5 } } });
    expect(new URL(url).pathname).toBe('/game/');
  });
  it('rejects malformed, impossible and out-of-range values', () => {
    for (const hash of ['#cut/beat?date=2026-11-12', '#cut/beat?date=2026-02-30&score=50', '#draw/beat?date=2026-11-12&score=NaN', '#draw/beat?date=2026-11-12&score=101', '#cut/beat?date=2026-11-12&score=50&a=-1', '#wat/beat?date=2026-11-12&score=50']) {
      expect(readScoreChallenge(hash)).toBeNull();
    }
  });
  it('keeps older dates so the UI can mark challenges expired', () => {
    expect(readScoreChallenge('#draw/beat?date=2025-01-01&score=95')?.date).toBe('2025-01-01');
  });
});
