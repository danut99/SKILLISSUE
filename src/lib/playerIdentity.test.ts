import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({state:{} as Record<string,unknown>}));
vi.mock('./store',()=>({usePlayer:{getState:()=>mocks.state,setState:(patch:Record<string,unknown>)=>Object.assign(mocks.state,patch)}}));
import { bindPlayerIdentity } from './playerIdentity';
function player(owner:string|null,name:string){return {accountOwner:owner,playerId:'device',nickname:name,days:{'2026-11-14':{draw:{tries:[{score:90}]}}},streak:5,lastDay:'2026-11-14',bestStreak:5,daysPlayed:5,bestTotal:250,carSkin:'taxi',settings:{lowPower:true},resetPlayer:()=>Object.assign(mocks.state,{nickname:'FreshGuest',playerId:'new-device',days:{},streak:0,lastDay:'',bestStreak:0,daysPlayed:0,bestTotal:0,carSkin:'pink'})};}
beforeEach(()=>{const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});mocks.state=player('account-a','Alice');});
describe('player identity caches',()=>{
 it('does not show account A nickname, history or stats to a new guest',()=>{bindPlayerIdentity('guest-b');expect(mocks.state.nickname).toBe('FreshGuest');expect(mocks.state.days).toEqual({});expect(mocks.state.streak).toBe(0);expect(mocks.state.accountOwner).toBe('guest-b');expect(mocks.state.settings).toEqual({lowPower:true});});
 it('restores the matching player cache when returning to an account',()=>{bindPlayerIdentity('guest-b');bindPlayerIdentity('account-a');expect(mocks.state.nickname).toBe('Alice');expect(mocks.state.streak).toBe(5);expect(mocks.state.carSkin).toBe('taxi');});
 it('preserves guest progress when Google links to the same player id',()=>{const before=mocks.state.days;bindPlayerIdentity('account-a');expect(mocks.state.days).toBe(before);expect(mocks.state.nickname).toBe('Alice');});
 it('backs up legacy unowned data without assigning it to a new guest',()=>{mocks.state.accountOwner=null;bindPlayerIdentity('guest-b');expect(mocks.state.nickname).toBe('FreshGuest');expect(JSON.parse(localStorage.getItem('skillissue:player-cache:local:device')!).nickname).toBe('Alice');});
 it('clears the displayed account when its session disappears',()=>{bindPlayerIdentity(null);expect(mocks.state.accountOwner).toBeNull();expect(mocks.state.nickname).toBe('FreshGuest');});
});
