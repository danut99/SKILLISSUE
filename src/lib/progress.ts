import { MODES, type Mode } from '../config';
import { addDays } from './daily';
import type { RankDay } from './rankHistory';
export function progressSeries(rows: RankDay[], date: string, length: number) {
  const byDay = new Map(rows.map(row => [`${row.play_date}:${row.mode}`, row.score]));
  return Array.from({length}, (_,index) => {
    const day = addDays(date,index-length+1);
    return { date:day, draw:byDay.get(`${day}:draw`) ?? null, cut:byDay.get(`${day}:cut`) ?? null, brake:byDay.get(`${day}:brake`) ?? null };
  });
}
export function gameAverages(rows: RankDay[], date: string, length: number) {
  const start = addDays(date,1-length);
  return MODES.map(mode => {
    const scores = rows.filter(row => row.mode === mode && row.play_date >= start && row.play_date <= date).map(row => row.score);
    return {mode,days:scores.length,average:scores.length ? scores.reduce((sum,score) => sum+score,0)/scores.length : null};
  });
}
export function scoreChange(rows: RankDay[], mode: Mode, today: string): number | null {
  const scores = rows.filter(row => row.mode === mode && row.play_date <= today).sort((a,b) => b.play_date.localeCompare(a.play_date)).slice(0,14);
  if(scores.length < 14) return null;
  const average = (start:number) => scores.slice(start,start+7).reduce((sum,row) => sum+row.score,0)/7;
  return average(0)-average(7);
}
