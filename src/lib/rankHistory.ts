import type { BoardMode } from '../config';
import { addDays } from './daily';
import { getSupabase } from './supabase';

export interface RankDay { play_date: string; mode: BoardMode; rank: number; players: number; score: number }
export async function loadRankHistory(year: number): Promise<RankDay[]> {
  const sb = await getSupabase();
  if (!sb) throw new Error('Connect online to see your daily places.');
  const { data, error } = await sb.rpc('get_my_rank_history', { p_year: year });
  if (error) throw new Error(error.code === 'PGRST202' ? 'Rank history needs the latest database update.' : 'Could not load your rank history. Please try again.');
  return (data ?? []).map((row: RankDay) => ({ ...row, rank: Number(row.rank), players: Number(row.players), score: Number(row.score) }));
}
export function rankLevel(rank: number): number {
  return rank === 1 ? 4 : rank <= 3 ? 3 : rank <= 10 ? 2 : 1;
}
export function rankCalendar(year: number, today: string, rows: RankDay[]) {
  const byDate = new Map(rows.map(row => [row.play_date, row]));
  const last = year === Number(today.slice(0,4)) ? today : `${year}-12-31`;
  const data = [];
  for (let date = `${year}-01-01`; date <= last; date = addDays(date,1)) {
    const row = byDate.get(date);
    data.push({ date, count: row ? 1 : 0, level: row ? rankLevel(row.rank) : 0 });
  }
  return data;
}
