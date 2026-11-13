import { afterEach, describe, expect, it, vi } from 'vitest';
import { localAllTimeBoard } from './leaderboard';
import { usePlayer, type Attempt } from './store';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
});

const attempt = (score: number): Attempt => ({ score, detail: {}, at: 1 });
afterEach(() => usePlayer.getState().resetPlayer());

describe('all-time totals', () => {
  it('adds daily bests across days and games without counting retries twice', () => {
    usePlayer.setState({ nickname: 'Tester', days: {
      '2026-11-01': { draw: { bonus: false, tries: [attempt(20), attempt(90), attempt(60)] }, cut: { bonus: false, tries: [attempt(80)] } },
      '2026-11-02': { draw: { bonus: false, tries: [attempt(95)] }, brake: { bonus: false, tries: [attempt(40)] } },
      '2026-11-20': { draw: { bonus: false, tries: [attempt(100)] } },
    } });
    const overall = localAllTimeBoard('2026-11-12', 'overall').rows.find(row => row.is_me)!;
    expect(overall.score).toBe(305);
    expect(overall.detail).toEqual({ days: 2, games: 4 });
    expect(localAllTimeBoard('2026-11-12', 'draw').rows.find(row => row.is_me)?.score).toBe(185);
    expect(localAllTimeBoard('2026-11-12', 'cut').rows.find(row => row.is_me)?.score).toBe(80);
  });

  it('keeps history older than a week when a new attempt is saved', () => {
    usePlayer.setState({ days: { '2026-01-01': { draw: { bonus: false, tries: [attempt(90)] } } } });
    usePlayer.getState().addAttempt('2026-11-12', 'draw', attempt(95));
    expect(localAllTimeBoard('2026-11-12', 'draw').rows.find(row => row.is_me)?.score).toBe(185);
  });

  it('counts a past-day challenge replay in all-time without touching the streak', () => {
    usePlayer.getState().addAttempt('2026-11-12', 'draw', attempt(70));
    usePlayer.getState().addAttempt('2026-11-05', 'cut', attempt(60), true);
    const s = usePlayer.getState();
    expect([s.streak, s.daysPlayed, s.lastDay]).toEqual([1, 1, '2026-11-12']);
    expect(localAllTimeBoard('2026-11-12', 'overall').rows.find(row => row.is_me)?.score).toBe(130);
  });

  it('includes a played zero-score day and omits players with no attempts', () => {
    expect(localAllTimeBoard('2026-11-12', 'draw').rows.some(row => row.is_me)).toBe(false);
    usePlayer.getState().addAttempt('2026-11-12', 'draw', attempt(0));
    expect(localAllTimeBoard('2026-11-12', 'draw').rows.find(row => row.is_me)?.detail.days).toBe(1);
  });
});
