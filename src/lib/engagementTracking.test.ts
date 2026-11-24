import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ track: vi.fn(), tag: vi.fn() }));
vi.mock('./clarity', () => calls);
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  const storage = () => { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) }; };
  vi.stubGlobal('localStorage', storage()); vi.stubGlobal('sessionStorage', storage());
});

describe('engagement funnel events', () => {
  it('deduplicates refreshes and identifies next-day visits', async () => {
    const { recordVisit } = await import('./engagementTracking');
    recordVisit('2026-11-23'); recordVisit('2026-11-23'); recordVisit('2026-11-24'); recordVisit('2026-11-24');
    expect(calls.track.mock.calls.filter(([event]) => event === 'funnel_visit')).toHaveLength(2);
    expect(calls.track.mock.calls.filter(([event]) => event === 'funnel_next_day_return')).toHaveLength(1);
  });
  it('counts repeated attempts but emits each visitor and daily milestone once', async () => {
    const { recordPlayStarted, recordPlayCompleted } = await import('./engagementTracking');
    recordPlayStarted('cut'); recordPlayStarted('cut');
    recordPlayCompleted('2026-11-24', ['cut']);
    recordPlayCompleted('2026-11-24', ['cut', 'draw']);
    recordPlayCompleted('2026-11-24', ['cut', 'draw']);
    recordPlayCompleted('2026-11-24', ['cut', 'draw', 'brake']);
    recordPlayCompleted('2026-11-24', ['cut', 'draw', 'brake']);
    for (const event of ['funnel_first_play', 'funnel_first_completion', 'funnel_second_game_completed', 'funnel_daily_complete']) expect(calls.track.mock.calls.filter(([value]) => value === event)).toHaveLength(1);
    expect(calls.track.mock.calls.filter(([event]) => event === 'funnel_attempt_completed')).toHaveLength(5);
  });
  it('does not label an existing-account login as a newly saved guest account', async () => {
    const { recordAccountIntent, recordAccountSuccess } = await import('./engagementTracking');
    recordAccountSuccess('existing');
    expect(calls.track).not.toHaveBeenCalled();
    recordAccountIntent('guest'); recordAccountSuccess('guest'); recordAccountSuccess('guest');
    expect(calls.track.mock.calls.filter(([event]) => event === 'funnel_guest_account_saved')).toHaveLength(1);
    recordAccountIntent('other-guest', true); recordAccountSuccess('existing');
    expect(calls.track).toHaveBeenCalledWith('funnel_existing_account_signed_in');
  });
  it('records one challenge view per link per session, not every score refresh', async () => {
    const { recordChallengeView } = await import('./engagementTracking');
    recordChallengeView('tracked', 'a'); recordChallengeView('tracked', 'a'); recordChallengeView('tracked', 'b');
    expect(calls.track.mock.calls.filter(([event]) => event === 'funnel_challenge_view')).toHaveLength(2);
  });
  it('deduplicates result views and completed invitations separately from preview views', async () => {
    const { recordResultView, recordChallengeCompleted, recordChallengeView } = await import('./engagementTracking');
    recordResultView('cut', '2026-11-24', 123);
    recordResultView('cut', '2026-11-24', 123);
    recordResultView('cut', '2026-11-24', 124);
    recordChallengeView('tracked', 'invite-a');
    recordChallengeCompleted('invite-a'); recordChallengeCompleted('invite-a');
    recordChallengeCompleted('invite-b');
    expect(calls.track.mock.calls.filter(([event]) => event === 'funnel_result_view')).toHaveLength(2);
    expect(calls.track.mock.calls.filter(([event]) => event === 'funnel_challenge_completed')).toHaveLength(2);
    expect(calls.track.mock.calls.filter(([event]) => event === 'funnel_challenge_view')).toHaveLength(1);
  });

});
