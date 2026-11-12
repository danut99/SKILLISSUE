import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), online: vi.fn(() => true), nickname: vi.fn() }));
vi.mock('./auth', () => ({ isOnline: mocks.online, whenAuthReady: vi.fn(async () => {}) }));
vi.mock('./leaderboard', () => ({ ensureNickname: mocks.nickname }));
vi.mock('./supabase', () => ({ getSupabase: vi.fn(async () => ({ rpc: mocks.rpc })) }));
import { PARTY_DURATION, PARTY_ROUNDS, createPartyRoom, getPartyMatch, joinPartyRoom, partyPhase, partyRound, partyRoundOffset, partyStandings, partyUrl, readPartyToken, readyPartyRoom, setPartyRoundCount, startPartyRoom, submitPartyResult, type PartyPlayer } from './party';

const token = '12345678-1234-4234-8234-123456789012';
const start = Date.parse('2026-11-12T12:00:00Z');
const date = new Date(start).toISOString();
beforeEach(() => { vi.clearAllMocks(); mocks.online.mockReturnValue(true); mocks.rpc.mockResolvedValue({ data: { token }, error: null }); });
describe('six-round party schedule', () => {
  it('alternates only Draw and Cut, using the same sixteen-second limit for every shape', () => {
    expect(PARTY_ROUNDS.map(r => r.mode)).toEqual(['draw', 'cut', 'draw', 'cut', 'draw', 'cut']);
    expect(PARTY_ROUNDS.map(r => r.seconds)).toEqual([16, 16, 16, 16, 16, 16]);
    expect(PARTY_DURATION).toBe(132);
    expect(PARTY_ROUNDS.map((_, index) => partyRoundOffset(index))).toEqual([0, 22, 44, 66, 88, 110]);
  });
  it('shares absolute round boundaries instead of granting a timer per player', () => {
    expect(partyPhase(null, start).kind).toBe('lobby');
    expect(partyPhase(date, start - 1000)).toMatchObject({ kind: 'countdown', secondsLeft: 1 });
    for (let i = 0; i < 6; i++) {
      const begin = start + partyRoundOffset(i) * 1000;
      const end = begin + PARTY_ROUNDS[i].seconds * 1000;
      expect(partyPhase(date, begin)).toMatchObject({ kind: 'playing', round: i });
      expect(partyPhase(date, end - 1)).toMatchObject({ kind: 'playing', round: i });
      expect(partyPhase(date, end)).toMatchObject({ kind: 'reveal', round: i, secondsLeft: 6 });
    }
    expect(partyPhase(date, start + 132000).kind).toBe('finished');
  });
  it('catches up missed rounds without restarting their clock', () => {
    expect(partyPhase(date, start + 50000)).toMatchObject({ round: 2, kind: 'playing', secondsLeft: 10 });
    expect(partyPhase(date, start + 140000).kind).toBe('finished');
  });
  it('finishes at the selected round count and continues past the default six rounds', () => {
    for (const count of [2, 3, 6, 8, 12]) {
      const end = start + count * 22000;
      expect(partyPhase(date, end - 1, count)).toMatchObject({ kind: 'reveal', round: count - 1 });
      expect(partyPhase(date, end, count)).toMatchObject({ kind: 'finished', round: count - 1, end });
    }
    expect(partyPhase(date, start + 132000, 12)).toMatchObject({ kind: 'playing', round: 6 });
    expect(partyRound(6)).toMatchObject({ mode: 'draw', shape: 'diamond', seconds: 16 });
    expect(partyRound(11)).toMatchObject({ mode: 'cut', complexity: 5, seconds: 16 });
  });
  it('only totals revealed rounds, counts missing results as zero, and shares tied places', () => {
    const make = (name: string, scores: number[]): PartyPlayer => ({ name, is_me: false, is_host: false, ready: true, results: scores.map((score, round) => ({ round, score })) });
    const players = [make('Alex', [80, 99]), make('Danik', [80]), make('Mia', [70])];
    expect(partyStandings(players, -1).every(p => p.total === 0)).toBe(true);
    expect(partyStandings(players, 0).map(p => [p.name, p.total, p.rank])).toEqual([['Alex', 80, 1], ['Danik', 80, 1], ['Mia', 70, 3]]);
    expect(partyStandings(players, 1)[0].total).toBe(179);
  });
  it('roundtrips room invite links under a subpath', () => {
    const url = partyUrl(token, 'https://example.com/game/#draw');
    expect(new URL(url).pathname).toBe('/game/');
    expect(readPartyToken(new URL(url).hash)).toBe(token);
    expect(readPartyToken('#party/bogus')).toBeNull();
  });
});
describe('party RPCs', () => {
  it('sends the host round selection to the server', async () => {
    await setPartyRoundCount(token, 12);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('set_party_round_count', { p_room: token, p_round_count: 12 });
  });
  it('loads a previous match without changing or submitting current scores', async () => {
    const history = { match_no: 1, roster_complete: true, players: [] };
    mocks.rpc.mockResolvedValue({ data: history, error: null });
    expect(await getPartyMatch(token, 1)).toEqual(history);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('get_party_match', { p_room: token, p_match: 1 });
  });
  it('uses a separate room and score endpoint instead of consuming daily tries', async () => {
    await createPartyRoom();
    await joinPartyRoom(token);
    await readyPartyRoom(token, true);
    await startPartyRoom(token);
    await submitPartyResult(token, 2, 4, { score: 91, detail: {}, display: '91%' });
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(['create_party_room', 'join_party_room', 'ready_party_room', 'start_party_room', 'submit_party_result']);
    expect(mocks.rpc).toHaveBeenLastCalledWith('submit_party_result', { p_room: token, p_match: 2, p_round: 4, p_score: 91, p_detail: {} });
  });
  it('reports missing database setup and capacity errors clearly', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing function' } });
    await expect(createPartyRoom()).rejects.toThrow('migration');
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'room_full' } });
    await expect(joinPartyRoom(token)).rejects.toThrow('8 players');
  });
  it('does not pretend to join a party while offline', async () => {
    mocks.online.mockReturnValue(false);
    await expect(joinPartyRoom(token)).rejects.toThrow('online');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
