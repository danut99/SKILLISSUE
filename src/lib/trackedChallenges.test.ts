import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), ensureNickname: vi.fn(), online: vi.fn(() => true) }));
vi.mock('./auth', () => ({ whenAuthReady: vi.fn(async () => {}), isOnline: mocks.online }));
vi.mock('./leaderboard', () => ({ ensureNickname: mocks.ensureNickname }));
vi.mock('./supabase', () => ({ getSupabase: vi.fn(async () => ({ rpc: mocks.rpc })) }));
import { acceptTrackedChallenge, challengeWinner, createTrackedChallenge, getTrackedChallenges, pastChallengeDate, previewTrackedChallenge, readTrackedToken, recordChallengeAttempt, trackedChallengeUrl, type TrackedChallenge, type ChallengePlayer } from './trackedChallenges';

const token = '12345678-1234-4234-8234-123456789012';
const challenge: TrackedChallenge = { token, mode: 'cut', play_date: '2026-11-12', creator_name: 'Danik', creator_score: 98, creator_detail: { a: 49.5, b: 50.5 }, is_owner: true, accepted: false, participants: [] };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-12T23:59:59Z')); vi.clearAllMocks(); mocks.online.mockReturnValue(true); mocks.rpc.mockResolvedValue({ data: challenge, error: null }); });
afterEach(() => { vi.useRealTimers(); });
describe('persistent challenges', () => {
  it('creates a challenge from the server score, sending no client score or user ID', async () => {
    expect(await createTrackedChallenge('cut')).toEqual(challenge);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('create_score_challenge', { p_mode: 'cut' });
    expect(mocks.ensureNickname).toHaveBeenCalledOnce();
  });
  it('previews without implicitly accepting', async () => {
    await previewTrackedChallenge(token);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('preview_score_challenge', { p_token: token });
    expect(mocks.ensureNickname).not.toHaveBeenCalled();
  });
  it('accepts through an idempotent RPC without submitting a result', async () => {
    await acceptTrackedChallenge(token);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('accept_score_challenge', { p_token: token });
  });
  it('lists challenges scoped by the authenticated server session', async () => {
    mocks.rpc.mockResolvedValue({ data: [challenge], error: null });
    expect(await getTrackedChallenges()).toEqual([challenge]);
    expect(mocks.rpc).toHaveBeenCalledWith('get_score_challenges', {});
  });
  it('roundtrips tracked links as real paths', () => {
    const url = trackedChallengeUrl('https://example.com/game/#draw', challenge);
    expect(new URL(url).pathname).toBe(`/play/cut/duel/${token}`);
    expect(new URL(url).hash).toBe('');
    expect(readTrackedToken(url)).toBe(token);
    expect(readTrackedToken('#cut/duel/not-a-token')).toBeNull();
    expect(readTrackedToken('#friends/duel/' + token)).toBeNull();
  });
  it('distinguishes acceptance, a zero score, ties, and either winner', () => {
    const player: ChallengePlayer = { nickname: 'Alex', accepted_at: '', is_me: false, score: null, detail: null };
    expect(challengeWinner(challenge, player)).toContain('waiting');
    expect(challengeWinner(challenge, { ...player, score: 0 })).toBe('Danik leads');
    expect(challengeWinner(challenge, { ...player, score: 98 })).toBe('Tied so far');
    expect(challengeWinner(challenge, { ...player, score: 99 })).toBe('Alex leads');
    expect(challengeWinner(challenge, { ...player, attempts_remaining: 0 })).toBe('No score submitted');
  });
  it('keeps a past-day challenge open while the recipient still has tries', () => {
    vi.setSystemTime(new Date('2026-11-14T10:00:00Z'));
    const player: ChallengePlayer = { nickname: 'Alex', accepted_at: '', is_me: true, score: null, detail: null, attempts_remaining: 3 };
    expect(challengeWinner(challenge, player)).toContain('waiting');
    expect(challengeWinner(challenge, { ...player, score: 99, attempts_remaining: 2 })).toBe('Alex leads');
  });
  it('replays only accepted challenges from earlier days, never your own', () => {
    const received = { ...challenge, is_owner: false, accepted: true };
    expect(pastChallengeDate(received, '2026-11-14')).toBe('2026-11-12');
    expect(pastChallengeDate(received, '2026-11-12')).toBeNull();
    expect(pastChallengeDate({ ...received, accepted: false }, '2026-11-14')).toBeNull();
    expect(pastChallengeDate({ ...received, is_owner: true }, '2026-11-14')).toBeNull();
  });
  it('records a replay against the challenge token, and reports when that day is used up', async () => {
    const attempt = { score: 91.237, detail: { a: 45 }, at: 0 };
    expect(await recordChallengeAttempt(token, attempt)).toBe('ok');
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('record_challenge_attempt', { p_token: token, p_score: 91.24, p_detail: { a: 45 } });
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'no_tries_left' } });
    expect(await recordChallengeAttempt(token, attempt)).toBe('no_tries_left');
  });
  it('finalizes either winner or a tie when the recipient has no attempts left', () => {
    const player: ChallengePlayer = { nickname: 'Alex', accepted_at: '', is_me: false, score: 97, detail: null, attempts_remaining: 0 };
    expect(challengeWinner(challenge, player)).toBe('Danik won!');
    expect(challengeWinner(challenge, { ...player, score: 99 })).toBe('Alex won!');
    expect(challengeWinner(challenge, { ...player, score: 98 })).toBe('Finished in a tie!');
    expect(challengeWinner(challenge, { ...player, attempts_remaining: 1 })).toBe('Danik leads');
  });
  it('reports a missing migration instead of claiming that tracking worked', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    await expect(createTrackedChallenge('cut')).rejects.toThrow('migration');
  });
  it('does not fabricate tracked challenges while offline', async () => {
    mocks.online.mockReturnValue(false);
    await expect(createTrackedChallenge('cut')).rejects.toThrow('online');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
