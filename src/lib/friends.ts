import type { BoardMode, LeaderboardPeriod } from '../config';
import { isOnline, whenAuthReady } from './auth';
import { ensureNickname, type Board, type BoardRow } from './leaderboard';
import { getSupabase } from './supabase';

export interface Friend {
  friend_id: string;
  nickname: string;
  created_at: string;
}

export interface FriendInvite {
  token: string;
  expires_at: string;
}

export interface InvitePreview {
  nickname: string;
  is_me: boolean;
  already_friends: boolean;
}

export function readFriendInvite(): string | null {
  return location.hash.startsWith('#friends/') ? location.hash.slice('#friends/'.length) : null;
}

export function friendInviteUrl(token: string): string {
  return `${location.origin}${location.pathname}#friends/${token}`;
}

async function friendsRpc<T>(name: string, args = {}): Promise<T> {
  await whenAuthReady();
  const sb = await getSupabase();
  if (!sb || !isOnline()) throw new Error('Connect to play with friends. Please try again shortly.');
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    console.warn(`${name} failed`, error);
    if (error.message.includes('invalid_invite') || error.code === '22P02') {
      throw new Error('This invite has expired or changed. Ask your friend for a new link.');
    }
    if (error.message.includes('own_invite')) throw new Error('This is your invite. Send it to a friend.');
    throw new Error('Could not load friends. Please try again shortly.');
  }
  return data as T;
}

export const getFriends = () => friendsRpc<Friend[]>('get_friends');
export const previewFriendInvite = (token: string) => friendsRpc<InvitePreview>('preview_friend_invite', { p_token: token });

export async function createFriendInvite(reset = false): Promise<FriendInvite> {
  await whenAuthReady();
  await ensureNickname();
  return friendsRpc<FriendInvite>('create_friend_invite', { p_reset: reset });
}

export async function acceptFriendInvite(token: string): Promise<string> {
  await whenAuthReady();
  await ensureNickname();
  return friendsRpc<string>('accept_friend_invite', { p_token: token });
}

export const removeFriend = (friendId: string) => friendsRpc<void>('remove_friend', { p_friend_id: friendId });

export async function fetchFriendsBoard(mode: BoardMode, period: LeaderboardPeriod = 'daily'): Promise<Board> {
  const data = period === 'all-time'
    ? await friendsRpc<BoardRow[]>('get_all_time_leaderboard', { p_mode: mode, p_friends_only: true })
    : await friendsRpc<BoardRow[]>('get_friends_leaderboard', { p_mode: mode });
  const rows = data.map((row) => ({ ...row, rank: Number(row.rank), score: Number(row.score), detail: row.detail ?? {} }));
  return { rows, myRank: rows.find((row) => row.is_me)?.rank ?? null, source: 'friends' };
}
