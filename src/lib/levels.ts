import { useAuth } from './auth';
import { create } from 'zustand';
import { whenAuthReady, isOnline } from './auth';
import { ensureNickname } from './leaderboard';
import { getSupabase } from './supabase';
import { useUi } from './ui';
export type LevelMode = 'draw' | 'cut' | 'brake';
export const LEVEL_SHAPES = ['circle','square','triangle','diamond','hexagon','pentagon','octagon','oval','star','flower'] as const;
export const levelCount = (mode: LevelMode) => mode === 'brake' ? 5 : 10;
export const LEVEL_TRIES = 5;
export const starsForScore = (score: number) => score >= 95 ? 3 : score >= 90 ? 2 : score >= 85 ? 1 : 0;
export interface LevelRecord { level: number; best_score: number; stars: number; used: number }
export interface LevelProgress { mode: LevelMode; level: number; used: number; records?: LevelRecord[] }
export interface LevelAttempt extends LevelProgress { token: string }
export const useLevels = create<{ rows: LevelProgress[]; owner: string | null }>(() => ({ rows: [], owner: null }));
async function rpc<T>(name: string, args = {}): Promise<T> {
 await whenAuthReady(); const sb=await getSupabase();
 if(!sb || !isOnline()) throw new Error('Connect online to save Level mode progress.');
 const {data,error}=await sb.rpc(name,args);
 if(error) {
  if(error.code==='PGRST202'||error.code==='42P01') throw new Error('Level mode needs the skill levels database migration.');
  if(error.message.includes('level_locked')) throw new Error('Clear the previous level to unlock this one.');
  if(error.message.includes('no_level_tries')) throw new Error('No tries left at this level. Come back after 00:00 UTC.');
  if(error.message.includes('ladder_complete')) throw new Error('All levels cleared!');
  if(error.message.includes('attempt_expired')) throw new Error('This attempt expired. Start a new attempt.');
  throw new Error('Could not save level progress. Please try again.');
 }
 return data as T;
}
export async function loadLevels(owner: string | null) { const rows=await rpc<LevelProgress[]>('get_skill_levels'); if (useAuth.getState().userId === owner) useLevels.setState({rows,owner}); return rows; }
export async function startLevel(mode: LevelMode, level?: number) { await whenAuthReady(); await ensureNickname(); return rpc<LevelAttempt>('start_skill_level',{p_mode:mode, ...(level === undefined ? {} : {p_level:level})}); }
export async function finishLevel(token: string, score: number) {
 const rows = await rpc<LevelProgress[]>('finish_skill_level', { p_token: token, p_score: score });
 useUi.getState().refreshBoards();
 return rows;
}

/** Exact safe-stop distance that earns the 85-point Level pass threshold. */
export const levelBrakePassCm = (level: number) => 150 - 20 * (Math.max(1, Math.min(5, level)) - 1);
export const levelBrakeScoreScale = (level: number) => levelBrakePassCm(level) / -Math.log(.85);
