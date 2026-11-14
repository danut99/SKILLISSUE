import { isOnline, useAuth, whenAuthReady } from './auth';
import { getSupabase } from './supabase';
import { ensureNickname, type Board } from './leaderboard';
import { usePlayer } from './store';
import { todayUTC } from './daily';
import { countScore, COUNT_TRIES, COUNT_ROUNDS } from './countRules';

export interface CountAttempt { id: string; score: number; answers: number[] | null; at: number }
export interface CountDay { date: string; attempts: CountAttempt[]; source: 'global' | 'local' }
type History = Record<string, CountAttempt[]>;
const key = () => `skillissue:count:${useAuth.getState().userId ?? usePlayer.getState().playerId}`;
function history(storageKey = key()): History {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as History; } catch { return {}; }
}
async function client() { await whenAuthReady(); return isOnline() ? getSupabase() : null; }
function failure(error: { code?: string; message: string }) {
  if (error.code === 'PGRST202' || error.code === '42P01') return new Error('Count Fast online scores need the latest database migration.');
  if (error.message.includes('no_tries_left')) return new Error('All five tries used. Come back after 00:00 UTC.');
  if (error.message.includes('wrong_day')) return new Error('A new day has started. Refresh to play.');
  if (error.message.includes('attempt_expired')) return new Error('This attempt expired. Reload the page to start a new try.');
  return new Error('Could not save Count Fast. Please try again.');
}
function globalDay(data: Omit<CountDay, 'source'>): CountDay {
  return { ...data, source: 'global', attempts: data.attempts.map(a => ({ ...a, score: Number(a.score), at: Number(a.at) })) };
}
export async function loadCountDay(date: string): Promise<CountDay> {
  const sb = await client();
  if (sb) { const { data, error } = await sb.rpc('get_count_state'); if (error) throw failure(error); if (data.date !== date) throw new Error('A new day has started. Refresh to play.'); return globalDay(data); }
  return { date, source: 'local', attempts: history()[date] ?? [] };
}
/** Start and finish are idempotent. An abandoned start still uses one try. */
export async function saveCount(date: string, id: string, answers?: number[]): Promise<CountDay> {
  const owner = useAuth.getState().userId;
  if (date !== todayUTC()) throw new Error('A new day has started. Refresh to play.');
  if (answers && (answers.length !== COUNT_ROUNDS || answers.some(n => !Number.isInteger(n) || n < -1 || n > 50))) throw new Error('Invalid answers.');
  const sb = await client();
  if (owner !== useAuth.getState().userId) throw new Error('Your player changed. Refresh to play.');
  if (sb) {
    await ensureNickname();
    const { data, error } = await sb.rpc(answers ? 'finish_count_attempt' : 'start_count_attempt', { p_date: date, p_id: id, ...(answers ? { p_answers: answers } : {}) });
    if (error) throw failure(error); return globalDay(data);
  }
  usePlayer.setState({ playerId: usePlayer.getState().playerId });
  const storageKey = key();
  const save = () => {
    const all = history(storageKey), attempts = all[date] ?? [], found = attempts.find(a => a.id === id);
    if (answers) {
      if (!found) throw new Error('Start an attempt first.');
      if (!found.answers && Date.now() - found.at > 180000) throw new Error('This attempt expired. Reload the page to start a new try.');
      if (!found.answers) { found.answers = answers; found.score = countScore(date, answers); }
    } else if (!found) {
      if (attempts.length >= COUNT_TRIES) throw new Error('All five tries used. Come back after 00:00 UTC.');
      attempts.push({ id, answers: null, score: 0, at: Date.now() });
    }
    localStorage.setItem(storageKey, JSON.stringify({ ...all, [date]: attempts }));
    return { date, attempts, source: 'local' as const };
  };
  return navigator.locks ? navigator.locks.request(storageKey, save) : save();
}
export async function fetchCountBoard(): Promise<Board> {
  const sb = await client();
  if (sb) { const { data, error } = await sb.rpc('get_count_leaderboard'); if (error) throw failure(error); const rows = (data as Board['rows']).map(r => ({ ...r, rank: Number(r.rank), score: Number(r.score) })); return { rows, myRank: rows.find(r => r.is_me)?.rank ?? null, source: 'global' }; }
  const days = Object.values(history()).filter(a => a.some(r => r.answers));
  const score = days.reduce((s, a) => s + Math.max(...a.map(r => r.score)), 0);
  return { source: 'demo', myRank: days.length ? 1 : null, rows: days.length ? [{ rank: 1, nickname: usePlayer.getState().nickname, score, detail: { days: days.length }, is_me: true }] : [] };
}
