import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),getSession:vi.fn(),anonymous:vi.fn(),onChange:vi.fn(),hydrate:vi.fn(),bind:vi.fn(),cancel:vi.fn(),boards:vi.fn()}));
vi.mock('./supabase',()=>({isSupabaseConfigured:()=>true,redirectUrl:()=> 'https://example.com/',getSupabase:async()=>({rpc:mocks.rpc,auth:{getSession:mocks.getSession,signInAnonymously:mocks.anonymous,onAuthStateChange:mocks.onChange}})}));
vi.mock('./store',()=>({usePlayer:{getState:()=>({hydrate:mocks.hydrate})}}));
vi.mock('./playerIdentity',()=>({bindPlayerIdentity:mocks.bind}));
vi.mock('./ui',()=>({toast:vi.fn(),useUi:{getState:()=>({refreshBoards:mocks.boards})}}));
const user=(id:string,anonymous=false)=>({id,is_anonymous:anonymous,email:anonymous?undefined:'a@example.com',identities:anonymous?[]:[{provider:'google'}]}) as User;
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();vi.stubGlobal('sessionStorage',{getItem:()=>null,removeItem:vi.fn(),setItem:vi.fn()});vi.stubGlobal('window',{google:{accounts:{id:{cancel:mocks.cancel}}}});vi.stubGlobal('location',{search:'',hash:'',pathname:'/'});});
describe('auth session ownership',()=>{
 it('ignores a server response that arrives after switching accounts',async()=>{
  let resolve!:(data:unknown)=>void;mocks.rpc.mockReturnValue(new Promise(r=>{resolve=r;}));const auth=await import('./auth');auth.applyUser(user('a'));const pending=auth.syncFromServer();await vi.waitFor(()=>expect(mocks.rpc).toHaveBeenCalled());auth.applyUser(user('b'));resolve({data:{nickname:'Alice'},error:null});await pending;expect(mocks.hydrate).not.toHaveBeenCalled();
 });
 it('cancels One Tap when linked, and clears auth state when signed out',async()=>{const auth=await import('./auth');auth.applyUser(user('a'));expect(auth.useAuth.getState().status).toBe('linked');expect(mocks.cancel).toHaveBeenCalled();auth.applyUser(null);expect(auth.useAuth.getState()).toMatchObject({status:'connecting',userId:null,email:null,providers:[]});expect(mocks.bind).toHaveBeenLastCalledWith(null);});
 it('does not create a guest after a session restore error',async()=>{mocks.getSession.mockResolvedValue({data:{session:null},error:{message:'refresh failed'}});const auth=await import('./auth');await auth.whenAuthReady();expect(auth.useAuth.getState().status).toBe('error');expect(mocks.anonymous).not.toHaveBeenCalled();});
 it('restores the existing linked account before syncing',async()=>{mocks.getSession.mockResolvedValue({data:{session:{user:user('existing')}},error:null});mocks.rpc.mockResolvedValue({data:{nickname:'Existing'},error:null});const auth=await import('./auth');await auth.whenAuthReady();expect(auth.useAuth.getState()).toMatchObject({status:'linked',userId:'existing'});expect(mocks.bind).toHaveBeenCalledWith('existing');expect(mocks.anonymous).not.toHaveBeenCalled();expect(mocks.hydrate).toHaveBeenCalledWith({nickname:'Existing'});});
});
