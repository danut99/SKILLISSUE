import { useDailyAllowance } from './dailyAllowance';
import { recordAccountSuccess } from './engagementTracking';
import type { User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { AUTH_STORAGE_KEY, getSupabase, isSupabaseConfigured, redirectUrl } from './supabase';
import { usePlayer, type ServerState } from './store';
import { toast, useUi } from './ui';
import { bindPlayerIdentity } from './playerIdentity';
import { tag, track } from './clarity';
import { clearPending } from './pendingAttempts';

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

useAuth.subscribe(state => useDailyAllowance.setState({ linked: state.status === 'linked' }));

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
  if (!user.is_anonymous) { recordAccountSuccess(user.id); window.google?.accounts.id.cancel(); }
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

type Supabase = NonNullable<Awaited<ReturnType<typeof getSupabase>>>;

const LOGIN_EXPIRED = 'Your login expired. Log in again to keep saving to your account.';
const RETRY_DELAYS_S = [5, 15, 30, 60, 120, 300];
let retryable = false;
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let connecting = false;
let listening = false;
let signingOut = false;
const connectedTasks: Array<() => Promise<unknown>> = [];

/**
 * Runs after every successful (re)connect, before the server state sync — e.g. uploading tries
 * played offline. Tasks run inside whenAuthReady(), so they must not wait for it.
 */
export function onConnected(task: () => Promise<unknown>) {
  connectedTasks.push(task);
}

async function runConnectedTasks() {
  for (const task of connectedTasks) {
    try {
      await task();
    } catch (e) {
      console.warn('post-connect task failed', e);
    }
  }
}

async function afterConnect() {
  await runConnectedTasks();
  await syncFromServer();
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
  if (typeof window.addEventListener === 'function') window.addEventListener('online', retryNow);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && retryNow());
  if (await connect(sb)) await afterConnect();
}

/** Restores the session or starts a guest. Returns false (status 'error') when that's not possible yet. */
async function connect(sb: Supabase): Promise<boolean> {
  connecting = true;
  try {
    const wasGuest = storedSessionIsGuest();
    const restored = await sb.auth.getSession();
    if (restored.error) {
      console.warn('Session restore failed', restored.error);
      track('auth_restore_failed');
      tag('auth_error', authErrorLabel(restored.error));
      // A guest whose anonymous user was deleted (empty-account cleanup) can safely start over.
      // Never replace a real account, and never give up on a session over a network hiccup.
      if (!wasGuest || !isDeadSession(restored.error)) {
        if (isDeadSession(restored.error)) toast(LOGIN_EXPIRED);
        return fail(restored.error);
      }
      track('auth_guest_recreated');
    }
    let user = restored.data.session?.user ?? null;
    if (!user) {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error || !data.user) {
        console.warn('Anonymous sign-in failed → offline mode', error);
        track('auth_failed');
        tag('auth_error', error ? authErrorLabel(error) : 'no_user');
        return fail(error ?? {});
      }
      user = data.user;
    }
    retryable = false;
    retryCount = 0;
    clearTimeout(retryTimer);
    applyUser(user);
    listen(sb);
    return true;
  } finally {
    connecting = false;
  }
}

/** Network, rate-limit and server errors are retried with backoff; a rejected session is not. */
function fail(error: AuthErrorInfo): false {
  retryable = !isDeadSession(error);
  useAuth.setState({ status: 'error' });
  clearTimeout(retryTimer);
  if (retryable && retryCount < RETRY_DELAYS_S.length) retryTimer = setTimeout(() => void reconnect(), RETRY_DELAYS_S[retryCount++] * 1000);
  return false;
}

/** Try to get online again after a temporary failure (also used by the "retry" button). */
export const canReconnect = () => retryable && useAuth.getState().status === 'error';

export async function reconnect() {
  if (connecting || !canReconnect()) return;
  clearTimeout(retryTimer);
  const sb = await getSupabase();
  if (sb && (await connect(sb))) await afterConnect();
}

function retryNow() {
  if (useAuth.getState().status === 'error') void reconnect();
  else if (isOnline()) void runConnectedTasks();
}

function listen(sb: Supabase) {
  if (listening) return;
  listening = true;
  sb.auth.onAuthStateChange((event, session) => {
    const prev = useAuth.getState().userId;
    const prevStatus = useAuth.getState().status;
    applyUser(session?.user ?? null);
    if (connecting) return; // connect() finishes the job itself
    // never await Supabase calls inside this callback (SDK deadlock) → defer
    if (event === 'SIGNED_OUT' && !signingOut) setTimeout(() => void recoverFromSignOut(prevStatus), 0);
    else if (session?.user && (session.user.id !== prev || useAuth.getState().status !== prevStatus)) setTimeout(() => void afterConnect(), 0);
  });
}

/** The session died mid-visit (refresh token rejected, e.g. the guest was deleted). */
async function recoverFromSignOut(prevStatus: AuthStatus) {
  if (prevStatus === 'linked') {
    retryable = false;
    useAuth.setState({ status: 'error' });
    toast(LOGIN_EXPIRED);
    return;
  }
  track('auth_guest_recreated');
  const sb = await getSupabase();
  if (sb && (await connect(sb))) await afterConnect();
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
  signingOut = true;
  try {
    const { error: signOutError } = await sb.auth.signOut();
    if (signOutError) { toast('Could not sign out. Please try again.'); return; }
    // Offline tries belong to the account that just left.
    clearPending();
    applyUser(null);
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) {
      fail(error);
      return;
    }
    applyUser(data.user);
  } finally {
    signingOut = false;
  }
  useUi.getState().refreshBoards();
  toast('Signed out. Fresh anonymous player 👻');
}
