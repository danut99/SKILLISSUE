import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), online: vi.fn(() => true), nickname: vi.fn() }));
vi.mock('./auth', () => ({ isOnline: mocks.online, whenAuthReady: vi.fn(async () => {}) }));
vi.mock('./leaderboard', () => ({ ensureNickname: mocks.nickname }));
vi.mock('./supabase', () => ({ getSupabase: vi.fn(async () => ({ rpc: mocks.rpc })) }));
import { PARTY_DURATION, PARTY_ROUNDS, createPartyRoom, getPartyMatch, joinPartyRoom, partyPhase, partyRound, partyRoundCounts, partyRoundOffset, partyStandings, partyUrl, readPartyToken, readyPartyRoom, setPartyGames, setPartyRoundCount, startPartyRoom, submitPartyResult, type PartyPlayer } from './party';
import { MODES } from '../config';

const token = '12345678-1234-4234-8234-123456789012';
const start = Date.parse('2026-11-12T12:00:00Z');
const date = new Date(start).toISOString();
beforeEach(() => { vi.clearAllMocks(); mocks.online.mockReturnValue(true); mocks.rpc.mockResolvedValue({ data: { token }, error: null }); });
describe('six-round party schedule', () => {
  it('offers twelve distinct Draw targets and Cut silhouettes without changing legacy targets', () => {
    for (const mode of ['draw', 'cut'] as const) {
      const rounds = Array.from({ length: 12 }, (_, round) => partyRound(round, 2, [mode]));
      expect(new Set(rounds.map(rule => mode === 'draw' ? rule.shape : rule.cutShape)).size).toBe(12);
    }
    expect(partyRound(10, 1).shape).toBe('triangle');
    expect(partyRound(1, 1).cutShape).toBeUndefined();
  });
  it('limits car selections to three unique objectives without repeating them', () => {
    expect(partyRoundCounts(['brake'])).toEqual([2, 3]);
    expect(Math.max(...partyRoundCounts(['draw', 'brake']))).toBe(6);
    expect(Math.max(...partyRoundCounts(['cut', 'brake']))).toBe(6);
    expect(Math.max(...partyRoundCounts(MODES))).toBe(9);
    expect(Math.max(...partyRoundCounts(['draw', 'cut']))).toBe(12);
    for (let mask = 1; mask < 8; mask++) {
      const games = MODES.filter((_, index) => mask & (1 << index));
      if (!games.includes('brake')) continue;
      for (const count of partyRoundCounts(games)) {
        const cars = Array.from({ length: count }, (_, round) => partyRound(round, 2, games)).filter(rule => rule.mode === 'brake');
        expect(cars.length).toBeLessThanOrEqual(3);
        expect(new Set(cars.map(rule => rule.objective)).size).toBe(cars.length);
      }
    }
  });
  it('rotates Draw, Cut and Brake with the same sixteen-second limit', () => {
    expect(PARTY_ROUNDS.map(r => r.mode)).toEqual(['draw', 'cut', 'brake', 'draw', 'cut', 'brake']);
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
  it('reveals early on the shared server schedule and preserves the full reveal', () => {
    // Everyone finishes round two eight seconds into its sixteen-second window.
    const finishedAt = start + 22000 + 8000;
    const shortenedStart = new Date(start - 8000).toISOString();
    expect(partyPhase(shortenedStart, finishedAt)).toMatchObject({ kind: 'reveal', round: 1, secondsLeft: 6 });
    expect(partyPhase(shortenedStart, finishedAt + 5999)).toMatchObject({ kind: 'reveal', round: 1 });
    expect(partyPhase(shortenedStart, finishedAt + 6000)).toMatchObject({ kind: 'playing', round: 2, secondsLeft: 16 });
    // The final round still shows results before the podium and rematch unlock.
    const lastFinishedAt = start + 110000 + 8000;
    expect(partyPhase(shortenedStart, lastFinishedAt)).toMatchObject({ kind: 'reveal', round: 5, secondsLeft: 6 });
    expect(partyPhase(shortenedStart, lastFinishedAt + 6000)).toMatchObject({ kind: 'finished', round: 5 });
  });
  it('finishes at the selected round count and continues past the default six rounds', () => {
    for (const count of [2, 3, 6, 8, 12]) {
      const end = start + count * 22000;
      expect(partyPhase(date, end - 1, count)).toMatchObject({ kind: 'reveal', round: count - 1 });
      expect(partyPhase(date, end, count)).toMatchObject({ kind: 'finished', round: count - 1, end });
    }
    expect(partyPhase(date, start + 132000, 12)).toMatchObject({ kind: 'playing', round: 6 });
    expect(partyRound(6)).toMatchObject({ mode: 'draw', shape: 'triangle', seconds: 16 });
    expect(partyRound(11)).toMatchObject({ mode: 'brake', complexity: 3, seconds: 16 });
  });
  it('only totals revealed rounds, counts missing results as zero, and shares tied places', () => {
    const make = (name: string, scores: number[]): PartyPlayer => ({ name, is_me: false, is_host: false, ready: true, results: scores.map((score, round) => ({ round, score })) });
    const players = [make('Alex', [80, 99]), make('Danik', [80]), make('Mia', [70])];
    expect(partyStandings(players, -1).every(p => p.total === 0)).toBe(true);
    expect(partyStandings(players, 0).map(p => [p.name, p.total, p.rank])).toEqual([['Alex', 80, 1], ['Danik', 80, 1], ['Mia', 70, 3]]);
    expect(partyStandings(players, 1)[0].total).toBe(179);
  });
  it('preserves legacy match rules and rotates car objectives for new matches', () => {
    expect(Array.from({length:6}, (_, r) => partyRound(r, 1).mode)).toEqual(['draw', 'cut', 'draw', 'cut', 'draw', 'cut']);
    expect(partyRound(6, 1)).toMatchObject({mode:'draw',shape:'diamond'});
    expect([2,5,8,11].map(r => partyRound(r).objective)).toEqual(['wall','parking','stop-line','wall']);
  });
  it('cycles only the selected games for all seven possible combinations', () => {
    for (let mask = 1; mask < 8; mask++) {
      const games = MODES.filter((_, index) => mask & (1 << index));
      const rounds = Array.from({length:12}, (_, index) => partyRound(index, 2, games));
      expect(rounds.map(round => round.mode)).toEqual(Array.from({length:12}, (_, index) => games[index % games.length]));
      expect(rounds.every(round => round.seconds === 16)).toBe(true);
      expect(rounds[games.length].complexity).toBe(rounds[games.length].mode === 'cut' ? 3 : 1);
    }
    expect(partyRound(2, 1, ['brake']).mode).toBe('draw');
  });
  it('roundtrips room invite links as real paths', () => {
    const url = partyUrl(token, 'https://example.com/game/#draw');
    expect(new URL(url).pathname).toBe(`/party/${token}`);
    expect(new URL(url).hash).toBe('');
    expect(readPartyToken(url)).toBe(token);
    expect(readPartyToken('#party/bogus')).toBeNull();
  });
});
describe('party RPCs', () => {
  it('creates with a game selection atomically and lets the host update it', async () => {
    await createPartyRoom(['brake']);
    expect(mocks.rpc).toHaveBeenLastCalledWith('create_party_room_with_games', { p_games: ['brake'] });
    await setPartyGames(token, ['brake', 'draw']);
    expect(mocks.rpc).toHaveBeenLastCalledWith('set_party_games', { p_room: token, p_games: ['draw', 'brake'] });
  });
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
