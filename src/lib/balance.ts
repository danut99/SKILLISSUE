import { balanceScore, balanceSetup } from '../games/balanceGame';
import { isOnline, useAuth, whenAuthReady } from './auth';
import { todayUTC } from './daily';
import { ensureNickname, type Board } from './leaderboard';
import { getSupabase } from './supabase';
import { usePlayer } from './store';

export const BALANCE_TRIES = 5;
export interface BalanceAttempt {
  id: string;
  score: number;
  support: number;
  error: number;
  at: number;
}
export interface BalanceDay {
  date: string;
  attempts: BalanceAttempt[];
  source: 'global' | 'local';
}
type LocalHistory = Record<string, BalanceAttempt[]>;

function localKey() {
  return `skillissue:balance:${useAuth.getState().userId ?? usePlayer.getState().playerId}`;
}

function readHistory(key: string): LocalHistory {
  const raw = localStorage.getItem(key);
  if (!raw) return {};
  try { return JSON.parse(raw) as LocalHistory; }
  catch { return {}; }
}

async function client() {
  await whenAuthReady();
  return isOnline() ? getSupabase() : null;
}

function rpcError(error: { code?: string; message: string }): Error {
  if (error.code === 'PGRST202' || error.code === '42P01') return new Error('BALANCE! online scores are being set up. Please try again later.');
  if (error.message.includes('no_tries_left')) return new Error('No tries left today. Come back after the daily reset.');
  if (error.message.includes('wrong_day')) return new Error('A new day has started. Refresh to play the new setup.');
  return new Error('Could not reach BALANCE! scores. Please try again.');
}

function readDay(data: { date: string; attempts: BalanceAttempt[] }): BalanceDay {
  return { date: data.date, source: 'global', attempts: data.attempts.map(attempt => ({
    ...attempt, score: Number(attempt.score), support: Number(attempt.support), error: Number(attempt.error), at: Number(attempt.at),
  })) };
}

export async function loadBalanceDay(date: string): Promise<BalanceDay> {
  const sb = await client();
  if (sb) {
    const { data, error } = await sb.rpc('get_balance_state');
    if (error) throw rpcError(error);
    const day = readDay(data);
    if (day.date !== date) throw new Error('A new day has started. Refresh to play the new setup.');
    return day;
  }
  return { date, attempts: readHistory(localKey())[date] ?? [], source: 'local' };
}

/** The id stays the same on network retries, so one release consumes one try. */
export async function submitBalance(date: string, support: number, id: string): Promise<BalanceDay> {
  const owner = useAuth.getState().userId;
  if (date !== todayUTC()) throw new Error('A new day has started. Refresh to play the new setup.');
  if (!Number.isFinite(support) || support < 40 || support > 320) throw new Error('Choose a support position on the plank.');
  const center = balanceSetup(date).center;
  const attempt: BalanceAttempt = { id, support, score: balanceScore(support, center), error: Math.abs(support - center), at: Date.now() };
  const sb = await client();
  if (useAuth.getState().userId !== owner) throw new Error('Your player changed. Refresh before trying again.');
  if (sb) {
    await ensureNickname();
    const { data, error } = await sb.rpc('record_balance_attempt', {
      p_id: id, p_date: date, p_support: support, p_score: attempt.score, p_error: attempt.error,
    });
    if (error) throw rpcError(error);
    return readDay(data);
  }
  // Zustand persists on writes. A guest whose first game is Balance needs their
  // generated player id saved before attempts are stored under that id.
  usePlayer.setState({ playerId: usePlayer.getState().playerId });
  const key = localKey();
  const save = () => {
    const history = readHistory(key);
    const attempts = history[date] ?? [];
    if (attempts.some(saved => saved.id === id)) return { date, attempts, source: 'local' as const };
    if (attempts.length >= BALANCE_TRIES) throw new Error('No tries left today. Come back after the daily reset.');
    const next = [...attempts, attempt];
    localStorage.setItem(key, JSON.stringify({ ...history, [date]: next }));
    return { date, attempts: next, source: 'local' as const };
  };
  return navigator.locks ? navigator.locks.request(key, save) : save();
}

/** Same career-points rule as the other games: sum one best score per day. */
export async function fetchBalanceBoard(): Promise<Board> {
  const sb = await client();
  if (sb) {
    const { data, error } = await sb.rpc('get_balance_leaderboard');
    if (error) throw rpcError(error);
    const rows = (data as Board['rows']).map(row => ({ ...row, rank: Number(row.rank), score: Number(row.score) }));
    return { rows, myRank: rows.find(row => row.is_me)?.rank ?? null, source: 'global' };
  }
  const days = Object.values(readHistory(localKey())).filter(attempts => attempts.length);
  const score = days.reduce((sum, attempts) => sum + Math.max(...attempts.map(attempt => attempt.score)), 0);
  const rows = days.length ? [{ rank: 1, nickname: usePlayer.getState().nickname, score, detail: { days: days.length }, is_me: true }] : [];
  return { rows, myRank: rows.length ? 1 : null, source: 'demo' };
}
