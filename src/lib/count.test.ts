import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ online:false, owner:null as string|null, rpc:vi.fn() }));
vi.mock('./auth',()=>({whenAuthReady:async()=>{},isOnline:()=>mocks.online,useAuth:{getState:()=>({userId:mocks.owner})}}));
vi.mock('./supabase',()=>({getSupabase:async()=>({rpc:mocks.rpc})}));
vi.mock('./leaderboard',()=>({ensureNickname:async()=>{}}));
vi.mock('./store',()=>({usePlayer:{getState:()=>({playerId:'guest',nickname:'DotFan'}),setState:vi.fn()}}));
vi.mock('./daily',async original=>({...await original<typeof import('./daily')>(),todayUTC:()=> '2026-11-14'}));
import { countScore, dotCount, countDots } from './countRules';
import { loadCountDay, saveCount, fetchCountBoard } from './count';
const date='2026-11-14';
beforeEach(()=>{
 mocks.online=false;mocks.owner=null;mocks.rpc.mockReset();const store=new Map<string,string>();
 vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)});
 let queue=Promise.resolve();vi.stubGlobal('navigator',{locks:{request:(_k:string,cb:()=>unknown)=>{const next=queue.then(cb);queue=next.then(()=>{},()=>{});return next;}}});
});
describe('Count Fast',()=>{
 it('starts small and steadily increases difficulty on every day',()=>{
  for(let day=1;day<=28;day++){
   const date=`2026-11-${String(day).padStart(2,'0')}`;
   const counts=Array.from({length:5},(_,round)=>dotCount(date,round));
   expect(counts[0]).toBeGreaterThanOrEqual(3);
   expect(counts[0]).toBeLessThanOrEqual(5);
   expect(counts[4]).toBeLessThanOrEqual(13);
   for(let round=1;round<5;round++)expect(counts[round]-counts[round-1]).toBe(2);
  }
 });
 it('makes consistent visible non-overlapping dots and exact scores',()=>{
  for(let round=0;round<5;round++){
   const dots=countDots(date,round);expect(dots).toEqual(countDots(date,round));expect(dots.length).toBe(dotCount(date,round));
   for(const a of dots){expect(a.x).toBeGreaterThan(11);expect(a.x).toBeLessThan(389);expect(a.y).toBeLessThan(389);for(const b of dots)if(a!==b)expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeGreaterThan(22);}
  }
  const exact=Array.from({length:5},(_,i)=>dotCount(date,i));expect(countScore(date,exact)).toBe(100);expect(countScore(date,exact.map(n=>n+1))).toBe(75);expect(countScore(date,[-1,-1,-1,-1,-1])).toBe(0);
 });
 it('reserves only five tries across concurrent starts, including abandoned ones',async()=>{
  const starts=await Promise.allSettled(Array.from({length:6},(_,i)=>saveCount(date,`id-${i}`)));expect(starts.filter(r=>r.status==='fulfilled')).toHaveLength(5);
  expect((await loadCountDay(date)).attempts).toHaveLength(5);
 });
 it('keeps start and finish retries idempotent and completed results immutable',async()=>{
  await saveCount(date,'a');await saveCount(date,'a');const exact=Array.from({length:5},(_,i)=>dotCount(date,i));await saveCount(date,'a',exact);const day=await saveCount(date,'a',[0,0,0,0,0]);expect(day.attempts).toHaveLength(1);expect(day.attempts[0].score).toBe(100);expect((await fetchCountBoard()).rows[0].score).toBe(100);
 });
 it('rejects unreserved results, invalid answers and stale days',async()=>{
  await expect(saveCount(date,'missing',[1,2,3,4,5])).rejects.toThrow('Start');await expect(saveCount(date,'a',[NaN,1,2,3,4])).rejects.toThrow('Invalid');await expect(saveCount('2026-11-13','a')).rejects.toThrow('new day');
 });
 it('does not silently downgrade online errors to local progress',async()=>{
  mocks.online=true;mocks.rpc.mockResolvedValue({error:{code:'PGRST202',message:'missing'}});await expect(loadCountDay(date)).rejects.toThrow('migration');
 });
});
