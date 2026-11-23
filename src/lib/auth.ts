import type { User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { AUTH_STORAGE_KEY, getSupabase, isSupabaseConfigured, redirectUrl } from './supabase';
import { usePlayer, type ServerState } from './store';
import { toast, useUi } from './ui';
import { bindPlayerIdentity } from './playerIdentity';
import { tag, track } from './clarity';

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

export function applyUser(user: User | null) {
  if (!user) {
    bindPlayerIdentity(null);
    useAuth.setState({ status: 'connecting', userId: null, email: null, providers: [], conflict: null });
    window.google?.accounts.id.cancel();
    return;
  }
  bindPlayerIdentity(user.id);
  if (!user.is_anonymous) sessionStorage.removeItem(SWITCH_KEY);
  useAuth.setState({
    status: user.is_anonymous ? 'anon' : 'linked',
    userId: user.id,
    email: user.email ?? null,
    providers: (user.identities ?? []).map((i) => i.provider).filter((p) => p !== 'anonymous'),
    conflict: null,
  });
  if (!user.is_anonymous) window.google?.accounts.id.cancel();
}

const SWITCH_KEY = 'skillissue:google-switch';

/** OAuth / magic-link errors come back in the URL (query or hash). */
function readUrlError() {
  const params = new URLSearchParams(location.search);
  new URLSearchParams(location.hash.replace(/^#/, '')).forEach((v, k) => params.set(k, v));
  const code = params.get('error_code');
  if (!code) return;
  history.replaceState(null, '', location.pathname);
  // Linking Google to this guest failed because that Google account (or its email, e.g. from an
  // older email login) already has a player → log into that player instead. Guarded against loops.
  if (['identity_already_exists', 'email_exists', 'user_already_exists'].includes(code) && !sessionStorage.getItem(SWITCH_KEY)) {
    sessionStorage.setItem(SWITCH_KEY, '1');
    toast('Logging into your existing player…');
    void switchToGoogle();
    return;
  }
  sessionStorage.removeItem(SWITCH_KEY);
  toast(`Login failed: ${params.get('error_description') ?? code}`);
}

export async function syncFromServer() {
  const owner = useAuth.getState().userId;
  const sb = await getSupabase();
  if (!sb || !owner || !isOnline() || useAuth.getState().userId !== owner) return;
  const { data, error } = await sb.rpc('get_my_state');
  if (useAuth.getState().userId !== owner || !isOnline()) return;
  if (error) return console.warn('get_my_state failed', error);
  // A server nickname means a public.profiles row exists for this player.
  if ((data as ServerState).nickname) tag('saved_to_db', 'true');
  usePlayer.getState().hydrate(data as ServerState);
  useUi.getState().refreshBoards();
}

type AuthErrorInfo = { name?: string; code?: string; status?: number };

const authErrorLabel = (e: AuthErrorInfo) => e.code ?? e.name ?? 'unknown';

/** Rejected refresh token / deleted user, as opposed to a network, rate-limit or server problem. */
const isDeadSession = (e: AuthErrorInfo) =>
  e.name !== 'AuthRetryableFetchError' && typeof e.status === 'number' && e.status >= 400 && e.status < 500 && e.status !== 429;

/** Read before getSession(), which drops a dead session from storage. */
function storedSessionIsGuest(): boolean {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? 'null')?.user?.is_anonymous === true;
  } catch {
    return false;
  }
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
  const wasGuest = storedSessionIsGuest();
  const restored = await sb.auth.getSession();
  if (restored.error) {
    console.warn('Session restore failed', restored.error);
    track('auth_restore_failed');
    tag('auth_error', authErrorLabel(restored.error));
    // A guest whose anonymous user was deleted (empty-account cleanup) can safely start over.
    // Never replace a real account, and never give up on a session over a network hiccup.
    if (!wasGuest || !isDeadSession(restored.error)) {
      useAuth.setState({ status: 'error' });
      return;
    }
    track('auth_guest_recreated');
  }
  let user = restored.data.session?.user ?? null;
  if (!user) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) {
      console.warn('Anonymous sign-in failed → offline mode', error);
      track('auth_failed');
      tag('auth_error', authErrorLabel(error));
      useAuth.setState({ status: 'error' });
      return;
    }
    user = data.user;
  }
  applyUser(user);
  sb.auth.onAuthStateChange((_event, session) => {
    const prev = useAuth.getState().userId;
    const prevStatus = useAuth.getState().status;
    applyUser(session?.user ?? null);
    // never await Supabase calls inside this callback (SDK deadlock) → defer
    if (session?.user && (session.user.id !== prev || useAuth.getState().status !== prevStatus)) setTimeout(() => void syncFromServer(), 0);
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
  window.google?.accounts.id.disableAutoSelect();
  sessionStorage.setItem('skillissue:one-tap-shown', '1');
  const { error: signOutError } = await sb.auth.signOut();
  if (signOutError) { toast('Could not sign out. Please try again.'); return; }
  applyUser(null);
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    useAuth.setState({ status: 'error' });
    return;
  }
  applyUser(data.user);
  useUi.getState().refreshBoards();
  toast('Signed out. Fresh anonymous player 👻');
}
