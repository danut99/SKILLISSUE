import type { User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { getSupabase, isSupabaseConfigured, redirectUrl } from './supabase';
import { usePlayer, type ServerState } from './store';
import { toast, useUi } from './ui';

/**
 * Identity model (like Krillion):
 *  - first visit → silent Supabase anonymous user (no login screen)
 *  - optional "save progress" → link Google or an email to the SAME user
 *  - new device → same buttons log into the existing account
 * Without Supabase configured everything runs locally ("offline").
 */
export type AuthStatus = 'offline' | 'connecting' | 'anon' | 'linked' | 'error';

interface AuthState {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  providers: string[];
  /** set when the chosen Google account already belongs to another player */
  conflict: 'google' | null;
}

export const useAuth = create<AuthState>(() => ({
  status: isSupabaseConfigured() ? 'connecting' : 'offline',
  userId: null,
  email: null,
  providers: [],
  conflict: null,
}));

export const isOnline = () => {
  const s = useAuth.getState().status;
  return s === 'anon' || s === 'linked';
};

function applyUser(user: User | null) {
  if (!user) return;
  useAuth.setState({
    status: user.is_anonymous ? 'anon' : 'linked',
    userId: user.id,
    email: user.email ?? null,
    providers: (user.identities ?? []).map((i) => i.provider).filter((p) => p !== 'anonymous'),
  });
}

/** OAuth / magic-link errors come back in the URL (query or hash). */
function readUrlError() {
  const params = new URLSearchParams(location.search);
  new URLSearchParams(location.hash.replace(/^#/, '')).forEach((v, k) => params.set(k, v));
  const code = params.get('error_code');
  if (!code) return;
  if (code === 'identity_already_exists') useAuth.setState({ conflict: 'google' });
  else toast(`Login failed: ${params.get('error_description') ?? code}`);
  history.replaceState(null, '', location.pathname);
}

export async function syncFromServer() {
  const sb = await getSupabase();
  if (!sb || !isOnline()) return;
  const { data, error } = await sb.rpc('get_my_state');
  if (error) return console.warn('get_my_state failed', error);
  usePlayer.getState().hydrate(data as ServerState);
  useUi.getState().refreshBoards();
}

let ready: Promise<void> | null = null;

/** Resolves once we know who the player is (or that we're offline). */
export function whenAuthReady(): Promise<void> {
  ready ??= init();
  return ready;
}

async function init() {
  const sb = await getSupabase();
  if (!sb) {
    useAuth.setState({ status: 'offline' });
    return;
  }
  readUrlError();
  let user = (await sb.auth.getSession()).data.session?.user ?? null;
  if (!user) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) {
      console.warn('Anonymous sign-in failed → offline mode', error);
      useAuth.setState({ status: 'error' });
      return;
    }
    user = data.user;
  }
  applyUser(user);
  sb.auth.onAuthStateChange((_event, session) => {
    const prev = useAuth.getState().userId;
    applyUser(session?.user ?? null);
    // never await Supabase calls inside this callback (SDK deadlock) → defer
    if (session?.user && session.user.id !== prev) setTimeout(() => void syncFromServer(), 0);
  });
  await syncFromServer();
}

export async function connectGoogle() {
  const sb = await getSupabase();
  if (!sb) return;
  const options = { redirectTo: redirectUrl() };
  const { error } =
    useAuth.getState().status === 'anon'
      ? await sb.auth.linkIdentity({ provider: 'google', options })
      : await sb.auth.signInWithOAuth({ provider: 'google', options });
  if (error) toast(error.message);
}

/** Abandon this device's anonymous player and log into the existing Google account. */
export async function switchToGoogle() {
  const sb = await getSupabase();
  if (!sb) return;
  useAuth.setState({ conflict: null });
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } });
  if (error) toast(error.message);
}

/** Anonymous → attach email (confirm link). If that email already has an account → send a login link instead. */
export async function connectEmail(email: string): Promise<'link_sent' | 'login_sent' | 'error'> {
  const sb = await getSupabase();
  if (!sb) return 'error';
  const emailRedirectTo = redirectUrl();
  if (useAuth.getState().status === 'anon') {
    const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo });
    if (!error) return 'link_sent';
    if (error.code !== 'email_exists' && !/already/i.test(error.message)) {
      toast(error.message);
      return 'error';
    }
  }
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo } });
  if (error) {
    toast(error.message);
    return 'error';
  }
  return 'login_sent';
}

export async function signOut() {
  const sb = await getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
  usePlayer.getState().resetPlayer();
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    useAuth.setState({ status: 'error' });
    return;
  }
  applyUser(data.user);
  useUi.getState().refreshBoards();
  toast('Signed out. Fresh anonymous player 👻');
}
