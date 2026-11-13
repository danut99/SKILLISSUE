import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),online:vi.fn(()=>true),nickname:vi.fn(),user:'player-a'}));
vi.mock('./auth',()=>({whenAuthReady:vi.fn(async()=>{}),isOnline:mocks.online,useAuth:{getState:()=>({userId:mocks.user})}}));
vi.mock('./leaderboard',()=>({ensureNickname:mocks.nickname}));
vi.mock('./supabase',()=>({getSupabase:vi.fn(async()=>({rpc:mocks.rpc}))}));
import {finishLevel,loadLevels,startLevel,useLevels,levelCount,LEVEL_SHAPES,starsForScore} from './levels';
beforeEach(()=>{vi.clearAllMocks();mocks.online.mockReturnValue(true);useLevels.setState({rows:[],owner:null});});
describe('level progression client',()=>{
 it('loads independent saved levels for all three games',async()=>{
  const rows=[{mode:'draw',level:2,used:1},{mode:'cut',level:1,used:3},{mode:'brake',level:5,used:0}];
  mocks.rpc.mockResolvedValue({data:rows,error:null});
  await loadLevels('player-a');expect(useLevels.getState()).toEqual({rows,owner:'player-a'});
 });
 it('reserves attempts separately from daily play, including Car',async()=>{
  mocks.rpc.mockResolvedValue({data:{token:'attempt',mode:'brake',level:1,used:1},error:null});
  expect(await startLevel('brake')).toMatchObject({used:1,level:1});
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('start_skill_level',{p_mode:'brake'});
  expect(mocks.nickname).toHaveBeenCalledOnce();
 });
 it('uses server progression when passing instead of advancing locally',async()=>{
  mocks.rpc.mockResolvedValue({data:[{mode:'draw',level:3,used:0}],error:null});
  expect(await finishLevel('attempt',90)).toEqual([{mode:'draw',level:3,used:0}]);
  expect(mocks.rpc).toHaveBeenCalledWith('finish_skill_level',{p_token:'attempt',p_score:90});
 });
 it('explains the daily lock after three unsuccessful attempts',async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{message:'no_level_tries'}});
  await expect(startLevel('cut')).rejects.toThrow('00:00 UTC');
 });
 it('does not show missing setup as a playable offline ladder',async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'missing'}});
  await expect(loadLevels('player-a')).rejects.toThrow('migration');
  mocks.online.mockReturnValue(false);
  await expect(startLevel('draw')).rejects.toThrow('online');
 });
 it('does not replace another account state with a late response',async()=>{
  mocks.rpc.mockResolvedValue({data:[{mode:'draw',level:4,used:0}],error:null});
  await loadLevels('old-account');expect(useLevels.getState().owner).toBeNull();
 });
});

it('offers ten distinct Draw shapes and ten Cut levels while Car keeps five',()=>{
 expect(LEVEL_SHAPES).toHaveLength(10);
 expect(new Set(LEVEL_SHAPES).size).toBe(10);
 expect(levelCount('draw')).toBe(10);
 expect(levelCount('cut')).toBe(10);
 expect(levelCount('brake')).toBe(5);
});

it('assigns stars at the exact pass and mastery boundaries',()=>{
 expect([0,84.99,85,89.99,90,94.99,95,100].map(starsForScore)).toEqual([0,0,1,1,2,2,3,3]);
});
it('sends the selected cleared level for replay without claiming a new unlock',async()=>{
 mocks.rpc.mockResolvedValue({data:{token:'replay',mode:'draw',level:2,used:2},error:null});
 expect(await startLevel('draw',2)).toMatchObject({level:2,used:2});
 expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('start_skill_level',{p_mode:'draw',p_level:2});
 expect(useLevels.getState().rows).toEqual([]);
});
