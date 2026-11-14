import {describe,it,expect} from 'vitest';
import {gameAverages,progressSeries,scoreChange} from './progress';
import {addDays} from './daily';
import type {RankDay} from './rankHistory';
const row=(date:string,score:number):RankDay=>({play_date:date,mode:'draw',score,rank:1,players:10});
describe('profile progress',()=>{
 it('keeps zero scores and gaps across a year boundary',()=>{
  const data=progressSeries([row('2026-12-31',0),row('2027-01-02',90)],'2027-01-02',3);
  expect(data.map(day=>day.draw)).toEqual([0,null,90]);
  expect(data[0].date).toBe('2026-12-31');
 });
 it('averages played days only, excluding out-of-window days and future scores',()=>{
  const result=gameAverages([row('2026-11-01',99),row('2026-11-13',0),row('2026-11-14',80),row('2026-11-15',100)],'2026-11-14',7);
  expect(result[0]).toEqual({mode:'draw',days:2,average:40});
  expect(result[1].average).toBeNull();
 });
 it('requires two full groups of seven played days',()=>{
  const rows=Array.from({length:14},(_,i)=>row(addDays('2026-11-01',i*2),i<7?60:80));
  expect(scoreChange(rows.slice(1),'draw','2026-12-01')).toBeNull();
  expect(scoreChange(rows,'draw','2026-12-01')).toBe(20);
  expect(scoreChange(rows,'cut','2026-12-01')).toBeNull();
 });
});
