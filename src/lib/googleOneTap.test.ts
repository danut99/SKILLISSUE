import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({auth:{status:'anon',userId:'guest'},link:vi.fn(),signIn:vi.fn(),sync:vi.fn(),reset:vi.fn(),set:vi.fn()}));
vi.mock('./supabase',()=>({getSupabase:async()=>({auth:{linkIdentity:mocks.link,signInWithIdToken:mocks.signIn}})}));
vi.mock('./auth',()=>({useAuth:{getState:()=>mocks.auth,setState:mocks.set},syncFromServer:mocks.sync}));
vi.mock('./store',()=>({usePlayer:{getState:()=>({resetPlayer:mocks.reset})}}));
import {acceptGoogleCredential,googleNonce} from './googleOneTap';
describe('Google One Tap identity handling',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.auth={status:'anon',userId:'guest'};mocks.link.mockResolvedValue({data:{user:{id:'guest',email:'test@example.com',identities:[{provider:'google'}]}},error:null});});
 it('links to the guest without signing into a different player',async()=>{
  expect(await acceptGoogleCredential('token','nonce','guest')).toBe('linked');
  expect(mocks.link).toHaveBeenCalledWith({provider:'google',token:'token',nonce:'nonce'});
  expect(mocks.signIn).not.toHaveBeenCalled();expect(mocks.reset).not.toHaveBeenCalled();expect(mocks.sync).toHaveBeenCalled();
 });
 it('returns existing-account conflicts without switching or wiping scores',async()=>{
  mocks.link.mockResolvedValue({data:{user:null},error:{code:'identity_already_exists'}});
  expect(await acceptGoogleCredential('token','nonce','guest')).toBe('conflict');
  expect(mocks.signIn).not.toHaveBeenCalled();expect(mocks.reset).not.toHaveBeenCalled();
 });
 it('switches only with explicit consent and clears guest display data',async()=>{
  mocks.signIn.mockResolvedValue({data:{user:{id:'existing'}},error:null});
  expect(await acceptGoogleCredential('token','nonce','guest',true)).toBe('linked');
  expect(mocks.link).not.toHaveBeenCalled();expect(mocks.reset).toHaveBeenCalled();expect(mocks.sync).toHaveBeenCalled();
 });
 it('preserves the guest when an exchange fails',async()=>{
  mocks.signIn.mockResolvedValue({data:{user:null},error:{code:'invalid_credentials'}});
  await expect(acceptGoogleCredential('token','nonce','guest',true)).rejects.toThrow('could not finish');
  expect(mocks.reset).not.toHaveBeenCalled();expect(mocks.set).not.toHaveBeenCalled();
 });
 it('rejects callbacks for another player or already signed-in users',async()=>{
  mocks.auth.userId='other';await expect(acceptGoogleCredential('token','nonce','guest')).rejects.toThrow('player changed');
  mocks.auth={status:'linked',userId:'guest'};await expect(acceptGoogleCredential('token','nonce','guest')).rejects.toThrow('player changed');
  expect(mocks.link).not.toHaveBeenCalled();
 });
 it('rejects missing credentials',async()=>{await expect(acceptGoogleCredential('','nonce','guest')).rejects.toThrow('credential');});
 it('sends a fresh SHA-256 nonce to Google while retaining its raw value',async()=>{
  const first=await googleNonce(),second=await googleNonce();expect(first.raw).not.toBe(second.raw);
  const expected=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(first.raw))),v=>v.toString(16).padStart(2,'0')).join('');
  expect(first.hashed).toBe(expected);expect(first.raw).not.toBe(first.hashed);
 });
});
