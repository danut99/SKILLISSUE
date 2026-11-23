import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todayUTC } from './daily';
import { flushPending, queueAttempt, readPending, type PendingAttempt } from './pendingAttempts';

const attempt = (at: number) => ({ score: 50, detail: {}, at });

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) });
});

describe('pending offline attempts', () => {
  it('uploads today in play order, drops past days and keeps the rest after a failure', async () => {
    const today = todayUTC();
    queueAttempt('2000-01-01', 'cut', attempt(1));
    queueAttempt(today, 'cut', attempt(2));
    queueAttempt(today, 'draw', attempt(3));
    queueAttempt(today, 'brake', attempt(4));
    const seen: number[] = [];
    const send = vi.fn(async (p: PendingAttempt) => {
      seen.push(p.attempt.at);
      return p.attempt.at === 3 ? 'retry' as const : 'ok' as const;
    });
    expect(await flushPending(send)).toBe(1);
    expect(seen).toEqual([2, 3]);
    expect(readPending().map(p => p.attempt.at)).toEqual([3, 4]);
  });

  it('keeps tries queued while an upload is running', async () => {
    queueAttempt(todayUTC(), 'cut', attempt(1));
    const sent = await flushPending(async () => {
      queueAttempt(todayUTC(), 'draw', attempt(2));
      return 'ok';
    });
    expect(sent).toBe(1);
    expect(readPending().map(p => p.attempt.at)).toEqual([2]);
  });
});
