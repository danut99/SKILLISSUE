import { tokenFromUrl } from './navigation';
import { isOnline, whenAuthReady } from './auth';
import { ensureNickname } from './leaderboard';
import { getSupabase } from './supabase';
import { MODES, type Mode } from '../config';
import type { Detail } from './store';
import type { AttemptResult } from '../games/types';

import { PARTY_REVEAL_SECONDS, PARTY_SECONDS } from './gameRules';
export { PARTY_REVEAL_SECONDS } from './gameRules';
export const PARTY_ROUND_COUNTS = Array.from({ length: 11 }, (_, index) => index + 2);
export const partyModes = (selected?: readonly Mode[]) => {
  const modes = MODES.filter(mode => selected?.includes(mode));
  return modes.length ? modes : [...MODES];
};
export function partyRoundCounts(selected?: readonly Mode[]) {
  const modes = partyModes(selected);
  const maximum = modes.includes('brake') ? modes.length * 3 : 12;
  return PARTY_ROUND_COUNTS.filter(count => count <= maximum);
}
export const partyRound = (round: number, version = 2, selected?: readonly Mode[]) => {
  const modes = partyModes(selected);
    const shapes = version >= 2
      ? ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'pentagon', 'oval', 'rectangle', 'heptagon', 'octagon', 'star', 'flower'] as const
      : ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'triangle'] as const;
    const tier = Math.min(shapes.length - 1, Math.floor(round / (version >= 2 ? modes.length : 2)));
  const mode = version >= 2 ? modes[round % modes.length] : round % 2 === 0 ? 'draw' as const : 'cut' as const;
    return { mode, shape: shapes[tier], seconds: PARTY_SECONDS, level: ['Warm-up', 'Corners count', 'Tricky angles', 'Sharp turns', 'Many sides', 'New angles', 'Smooth curves', 'Long sides', 'Seven sides', 'Eight sides', 'Star power', 'Flower power'][tier], complexity: mode === 'cut' ? [0, 3, 6, 7, 8, 9][Math.min(5, tier)] : tier,
      cutShape: version >= 2 ? shapes[tier] : undefined,
    objective: (['wall', 'parking', 'stop-line'] as const)[tier % 3] };
};
export const PARTY_ROUNDS = Array.from({ length: 6 }, (_, index) => partyRound(index));
export const partyRoundLabel = (round: number, version = 2, selected?: readonly Mode[]) => {
  const rule = partyRound(round, version, selected);
  return rule.mode === 'draw' ? `Draw a ${rule.shape}` : rule.mode === 'cut' ? 'Cut 50/50' : rule.objective === 'parking' ? 'Park the car' : rule.objective === 'stop-line' ? 'Stop at the line' : 'Brake before the wall';
};
export const PARTY_DURATION = PARTY_ROUNDS.reduce((n, r) => n + r.seconds + PARTY_REVEAL_SECONDS, 0);
export interface PartyPlayer {
  player_id?: string; name: string; is_me: boolean; is_host: boolean; ready: boolean;
  results: { round: number; score: number | null; detail?: Detail | null }[];
}
export interface PartyRoom {
  reused_room?: boolean;
  code?: string; is_public?: boolean;
  game_version?: number;
  selected_games?: Mode[];
  round_count?: number;
  token: string; match_no: number; started_at: string | null; expires_at: string;
  server_now: string; is_host: boolean; joined: boolean; players: PartyPlayer[];
}
export interface PartyMatch {
  game_version?: number;
  selected_games?: Mode[];
  round_count?: number;
  match_no: number;
  roster_complete: boolean;
  players: PartyPlayer[];
}
export type PartyPhase = { kind: 'lobby' | 'countdown' | 'playing' | 'reveal' | 'finished'; round: number; secondsLeft: number; start: number; end: number };
export function partyRoundOffset(round: number): number {
  return round * (PARTY_ROUNDS[0].seconds + PARTY_REVEAL_SECONDS);
}
export function partyPhase(startedAt: string | null, now: number, roundCount = 6): PartyPhase {
  if (!startedAt) return { kind: 'lobby', round: 0, secondsLeft: 0, start: 0, end: 0 };
  const start = Date.parse(startedAt);
  if (now < start) return { kind: 'countdown', round: 0, secondsLeft: (start - now) / 1000, start, end: start };
  for (let round = 0; round < roundCount; round++) {
    const roundStart = start + partyRoundOffset(round) * 1000;
    const end = roundStart + partyRound(round).seconds * 1000;
    const revealEnd = end + PARTY_REVEAL_SECONDS * 1000;
    if (now < revealEnd) return { kind: now < end ? 'playing' : 'reveal', round, secondsLeft: (now < end ? end - now : revealEnd - now) / 1000, start: roundStart, end };
  }
  return { kind: 'finished', round: roundCount - 1, secondsLeft: 0, start, end: start + partyRoundOffset(roundCount) * 1000 };
}
export function partyStandings(players: PartyPlayer[], revealedThrough: number) {
  const rows = players.map(player => ({ ...player, total: Math.round(player.results.reduce((sum, result) => sum + (result.round <= revealedThrough ? result.score ?? 0 : 0), 0) * 100) / 100 }));
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return rows.map((row, index) => ({ ...row, rank: rows.findIndex(r => r.total === row.total) + 1, order: index }));
}
export function readPartyToken(hash: string): string | null {
  hash = tokenFromUrl(hash);
  return /^#party\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(hash)?.[1] ?? null;
}
export function partyUrl(token: string, base = location.href) {
  const url = new URL(base); url.search = ''; url.hash = ''; url.pathname = `/party/${token}`; return url.href;
}
const ERRORS: Record<string, string> = {
  invalid_room_code: 'Room code not found or expired. Check the 8-character code.',
  invalid_room: 'This room has expired or no longer exists.', room_full: 'This room is full (8 players).',
  already_started: 'This party has already started. Join the next match.', not_joined: 'Join the room first.',
  host_only: 'Only the host can do that.', need_players: 'You need at least 2 players.',
  not_ready: 'Wait until everyone is ready.', round_closed: 'The round ended. No score was received in time.',
  wrong_match: 'A new match has started. Rejoin the current round.', match_not_finished: 'Wait until the match finishes.',
  room_limit: 'You already have 10 active rooms. Reuse one of your invite links.',
  removed_player: 'The host removed you from this room.',
  match_in_progress: 'Players can leave or be removed in the lobby or after the match.',
  bad_party_games: 'Choose one, two, or all three games.',
  bad_round_count: 'Choose a round count supported by the selected games.',
};
async function rpc<T>(name: string, args = {}): Promise<T> {
  await whenAuthReady(); const sb = await getSupabase();
  if (!sb || !isOnline()) throw new Error('Party Mode needs an online connection.');
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42P01') throw new Error('Party Mode is not set up yet. Apply the party rooms database migration.');
    for (const [key, message] of Object.entries(ERRORS)) if (error.message.includes(key)) throw new Error(message);
    throw new Error('Could not connect to the party. Please try again.');
  }
  return data as T;
}
export async function createPartyRoom(games?: readonly Mode[]) { await whenAuthReady(); await ensureNickname(); return games ? rpc<PartyRoom>('create_party_room_with_games', { p_games: partyModes(games) }) : rpc<PartyRoom>('create_party_room'); }
export const setPartyGames = (token: string, games: readonly Mode[]) => rpc<PartyRoom>('set_party_games', { p_room: token, p_games: partyModes(games) });
export const getPartyRoom = (token: string) => rpc<PartyRoom>('get_party_room', { p_room: token });
export const getPartyMatch = (token: string, match: number) => rpc<PartyMatch>('get_party_match', { p_room: token, p_match: match });
export async function joinPartyRoom(token: string) { await whenAuthReady(); await ensureNickname(); return rpc<PartyRoom>('join_party_room', { p_room: token }); }
export const readyPartyRoom = (token: string, ready: boolean) => rpc<PartyRoom>('ready_party_room', { p_room: token, p_ready: ready });
export const setPartyRoundCount = (token: string, count: number) => rpc<PartyRoom>('set_party_round_count', { p_room: token, p_round_count: count });
export const startPartyRoom = (token: string) => rpc<PartyRoom>('start_party_room', { p_room: token });
export const rematchPartyRoom = (token: string) => rpc<PartyRoom>('rematch_party_room', { p_room: token });
export const submitPartyResult = (token: string, match: number, round: number, result: AttemptResult) => rpc<PartyRoom>('submit_party_result', { p_room: token, p_match: match, p_round: round, p_score: result.score, p_detail: result.detail });

export const leavePartyRoom = (token: string, player?: string) => rpc<void>('leave_party_room', { p_room: token, p_player: player ?? null });

export interface PublicParty { token:string; code:string; host:string; round_count:number; selected_games:Mode[]; players:number; games_played?:number; latest_match?:number; latest_round_count?:number; winners?:string[]; winning_score?:number|null; status?:'Waiting'|'Playing'|'Finished'|'Expired'; expired?:boolean; is_mine?:boolean }
export const listPublicParties=()=>rpc<PublicParty[]>('list_public_parties');
export const findPartyCode=(code:string)=>rpc<string>('find_party_code',{p_code:code.trim().toUpperCase()});
export const setPartyPublic=(token:string,visible:boolean)=>rpc<PartyRoom>('set_party_public',{p_room:token,p_public:visible});
