import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  online: false, owner: null as string | null, player: 'guest-a', nickname: 'PipFan',
  rpc: vi.fn(), ensureNickname: vi.fn(),
}));
vi.mock('./auth', () => ({
  whenAuthReady: async () => {}, isOnline: () => mocks.online,
  useAuth: { getState: () => ({ userId: mocks.owner }) },
}));
vi.mock('./supabase', () => ({ getSupabase: async () => ({ rpc: mocks.rpc }) }));
vi.mock('./leaderboard', () => ({ ensureNickname: mocks.ensureNickname }));
vi.mock('./store', () => ({ usePlayer: { getState: () => ({ playerId: mocks.player, nickname: mocks.nickname }), setState: vi.fn() } }));
vi.mock('./daily', async importOriginal => ({ ...await importOriginal<typeof import('./daily')>(), todayUTC: () => '2026-11-14' }));

import { fetchBalanceBoard, loadBalanceDay, submitBalance } from './balance';

const date = '2026-11-14';
beforeEach(() => {
  mocks.online = false;
  mocks.owner = null;
  mocks.player = 'guest-a';
  mocks.rpc.mockReset();
  mocks.ensureNickname.mockReset();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  let queue = Promise.resolve();
  vi.stubGlobal('navigator', { locks: {
    request: (_key: string, callback: () => unknown) => {
      const current = queue.then(callback);
      queue = current.then(() => {}, () => {});
      return current;
    },
  } });
});

describe('Balance daily progress', () => {
  it('enforces five tries across concurrent submissions and reloads', async () => {
    const submissions = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => submitBalance(date, 130 + i, `try-${i}`)));
    expect(submissions.filter(result => result.status === 'fulfilled')).toHaveLength(5);
    expect(submissions.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await loadBalanceDay(date)).attempts).toHaveLength(5);
  });
  it('does not consume another try when the same submission is retried', async () => {
    const first = await submitBalance(date, 150, 'same-id');
    const second = await submitBalance(date, 200, 'same-id');
    expect(second.attempts).toEqual(first.attempts);
    expect(second.attempts).toHaveLength(1);
  });
  it('keeps different players separate and starts the next day empty', async () => {
    await submitBalance(date, 150, 'player-a');
    expect((await loadBalanceDay('2026-11-15')).attempts).toEqual([]);
    mocks.player = 'guest-b';
    expect((await loadBalanceDay(date)).attempts).toEqual([]);
    mocks.player = 'guest-a';
    expect((await loadBalanceDay(date)).attempts).toHaveLength(1);
  });
  it('counts one daily best in career points and rejects stale-day submissions', async () => {
    const first = await submitBalance(date, 100, 'a');
    const second = await submitBalance(date, 160, 'b');
    const board = await fetchBalanceBoard();
    expect(board.rows[0].score).toBe(Math.max(first.attempts[0].score, second.attempts[1].score));
    expect(board.rows[0].detail.days).toBe(1);
    await expect(submitBalance('2026-11-13', 160, 'old')).rejects.toThrow('new day');
  });
  it('reports storage failures without accepting a try', async () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage full'); });
    await expect(submitBalance(date, 160, 'unsaved')).rejects.toThrow();
    expect((await loadBalanceDay(date)).attempts).toHaveLength(0);
  });
  it('uses the authenticated server state and stable attempt id', async () => {
    mocks.online = true;
    mocks.owner = 'user-a';
    const saved = { date, attempts: [{ id: 'stable-id', score: '92.1', support: '160', error: '2.6', at: 1 }] };
    mocks.rpc.mockResolvedValue({ data: saved, error: null });
    const day = await submitBalance(date, 160, 'stable-id');
    expect(mocks.ensureNickname).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('record_balance_attempt', expect.objectContaining({ p_id: 'stable-id', p_date: date, p_support: 160 }));
    expect(day.source).toBe('global');
    expect(day.attempts[0].score).toBe(92.1);
  });
  it('surfaces server limits and migration failures instead of adding local tries', async () => {
    mocks.online = true;
    mocks.owner = 'user-a';
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'no_tries_left' } });
    await expect(submitBalance(date, 160, 'limit')).rejects.toThrow('No tries left');
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing function' } });
    await expect(loadBalanceDay(date)).rejects.toThrow('being set up');
  });
});
