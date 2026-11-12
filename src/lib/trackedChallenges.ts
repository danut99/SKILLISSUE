import type { Mode } from '../config';
import type { Detail } from './store';
import { isOnline, whenAuthReady } from './auth';
import { ensureNickname } from './leaderboard';
import { getSupabase } from './supabase';
import { todayUTC } from './daily';

export interface ChallengePlayer {
  nickname: string; accepted_at: string; is_me: boolean;
  score: number | null; detail: Detail | null;
  attempts_remaining?: number;
}
export interface TrackedChallenge {
  token: string; mode: Mode; play_date: string;
  creator_name: string; creator_score: number; creator_detail: Detail;
  is_owner: boolean; accepted: boolean; participants: ChallengePlayer[];
}
export function readTrackedToken(hash: string): string | null {
  return /^#(?:draw|cut|brake)\/duel\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(hash)?.[1] ?? null;
}
export function trackedChallengeUrl(base: string, challenge: Pick<TrackedChallenge, 'mode' | 'token'>): string {
  const url = new URL(base); url.search = ''; url.hash = `${challenge.mode}/duel/${challenge.token}`; return url.href;
}
async function rpc<T>(name: string, args = {}): Promise<T> {
  await whenAuthReady();
  const sb = await getSupabase();
  if (!sb || !isOnline()) throw new Error('Connect online to send and track challenges.');
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42P01') throw new Error('Challenge tracking is not set up yet. Apply the score challenges database migration.');
    if (error.message.includes('score_required')) throw new Error('Your score is still syncing. Try again in a moment.');
    if (error.message.includes('expired_challenge')) throw new Error('This daily challenge has expired.');
    if (error.message.includes('own_challenge')) throw new Error('This is your link. Send it to someone else.');
    if (error.message.includes('invalid_challenge')) throw new Error('This challenge link is no longer available.');
    throw new Error('Could not load challenges. Please try again.');
  }
  return data as T;
}
export async function createTrackedChallenge(mode: Mode): Promise<TrackedChallenge> {
  await whenAuthReady(); await ensureNickname();
  return rpc('create_score_challenge', { p_mode: mode });
}
export const previewTrackedChallenge = (token: string) => rpc<TrackedChallenge>('preview_score_challenge', { p_token: token });
export async function acceptTrackedChallenge(token: string): Promise<TrackedChallenge> {
  await whenAuthReady(); await ensureNickname();
  return rpc('accept_score_challenge', { p_token: token });
}
export const getTrackedChallenges = () => rpc<TrackedChallenge[]>('get_score_challenges');
export function challengeWinner(challenge: TrackedChallenge, player: ChallengePlayer): string {
  const finished = challenge.play_date < todayUTC() || player.attempts_remaining === 0;
  if (player.score === null) return finished ? 'No score submitted' : 'Accepted - waiting for a score';
  if (player.score === challenge.creator_score) return finished ? 'Finished in a tie!' : 'Tied so far';
  return `${player.score > challenge.creator_score ? player.nickname : challenge.creator_name} ${finished ? 'won!' : 'leads'}`;
}
