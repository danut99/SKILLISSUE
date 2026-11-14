import { getSupabase } from './supabase';
import { syncFromServer, useAuth } from './auth';
import { usePlayer } from './store';

export async function googleNonce() {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2,'0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return { raw, hashed: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2,'0')).join('') };
}

/** Link first: never replace a guest session without explicit switch-account consent. */
export async function acceptGoogleCredential(token: string, nonce: string, owner: string, switchAccount = false): Promise<'linked' | 'conflict'> {
  if (!token || !nonce) throw new Error('Google did not return a sign-in credential. Please use Continue with Google.');
  if (useAuth.getState().status !== 'anon' || useAuth.getState().userId !== owner) throw new Error('Your player changed. Please try signing in again.');
  const sb = await getSupabase();
  if (!sb) throw new Error('Connect online to sign in.');
  if (useAuth.getState().status !== 'anon' || useAuth.getState().userId !== owner) throw new Error('Your player changed. Please try signing in again.');
  const credentials = { provider: 'google', token, nonce };
  const { data, error } = switchAccount ? await sb.auth.signInWithIdToken(credentials) : await sb.auth.linkIdentity(credentials);
  if (error) {
    if (!switchAccount && ['identity_already_exists','email_exists','user_already_exists','identity_already_linked'].includes(error.code ?? '')) return 'conflict';
    throw new Error('Google sign-in could not finish. Please try Continue with Google.');
  }
  if (!data.user) throw new Error('Google sign-in did not return a player. Please try again.');
  if (switchAccount && data.user.id !== owner) usePlayer.getState().resetPlayer();
  useAuth.setState({ status:'linked',userId:data.user.id,email:data.user.email??null,providers:(data.user.identities??[]).map(identity=>identity.provider),conflict:null });
  await syncFromServer();
  return 'linked';
}

export interface GoogleIdentity {
  initialize(options: {client_id:string;nonce:string;auto_select:boolean;use_fedcm_for_prompt:boolean;callback:(response:{credential:string})=>void}): void;
  prompt(): void;
  cancel(): void;
  disableAutoSelect(): void;
}
declare global { interface Window { google?: { accounts: { id: GoogleIdentity } } } }
let loading: Promise<GoogleIdentity> | null = null;
export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id);
  loading ??= new Promise<GoogleIdentity>((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.id='google-identity-services';
    const timer=setTimeout(()=>fail(),12000);
    const fail=()=>{clearTimeout(timer);script.remove();loading=null;reject(new Error('Google prompt unavailable'));};
    script.onload=()=>{clearTimeout(timer);if(window.google?.accounts.id)resolve(window.google.accounts.id);else fail();};
    script.onerror=fail;document.head.append(script);
  });
  return loading;
}
