import { track, tag } from './clarity';
import { addDays, todayUTC } from './daily';
import type { Mode } from '../config';

// These events appear in Clarity's custom-event filters. Flags contain no email,
// nickname or score; they prevent reloads and repeated attempts inflating milestones.
const PREFIX = 'skillissue:funnel:';
const memory = new Map<string, string>();
function read(key: string, session = false): string | null {
  try { return (session ? sessionStorage : localStorage).getItem(PREFIX + key) ?? memory.get(key) ?? null; }
  catch { return memory.get(key) ?? null; }
}
function write(key: string, value: string, session = false) {
  memory.set(key, value);
  try { (session ? sessionStorage : localStorage).setItem(PREFIX + key, value); } catch { /* Storage may be unavailable. */ }
}
function once(event: string, key = event, session = false) {
  if (read(key, session)) return;
  write(key, '1', session);
  track(event);
}

export function recordVisit(date = todayUTC()) {
  once('funnel_visit', `visit:${date}`, true);
  const previous = read('last-visit');
  if (previous && previous < date) {
    once('funnel_return_visit', `return:${date}`);
    if (previous === addDays(date, -1)) once('funnel_next_day_return', `next-day:${date}`);
  }
  write('last-visit', date);
}

export function recordPlayStarted(mode: Mode | 'balance' | 'count') {
  once('funnel_first_play');
  track('funnel_attempt_started');
  tag('funnel_game', mode);
}

export function recordBonusCompleted(mode: 'balance' | 'count') {
  once('funnel_first_completion');
  track('funnel_attempt_completed');
  tag('funnel_game', mode);
}

export function recordPlayCompleted(date: string, played: readonly Mode[]) {
  once('funnel_first_completion');
  track('funnel_attempt_completed');
  tag('daily_games_completed', String(played.length));
  if (played.length >= 2) once('funnel_second_game_completed', `second-game:${date}`);
  if (played.length === 3) once('funnel_daily_complete', `daily-complete:${date}`);
}

export function recordAccountPrompt(source: string) {
  tag('account_prompt_source', source);
  track('funnel_account_prompt_clicked');
}

export function recordAccountIntent(guestId: string | null, switching = false) {
  write('account-intent', JSON.stringify({ guestId: switching ? null : guestId, at: Date.now() }));
  track('funnel_account_started');
}

export function recordAccountSuccess(userId: string) {
  const raw = read('account-intent');
  if (!raw) return;
  write('account-intent', '');
  try {
    const intent = JSON.parse(raw) as { guestId: string | null; at: number };
    if (Date.now() - intent.at > 60 * 60 * 1000) return;
    // Same anonymous ID becoming linked means guest progress was saved.
    // An existing-account login is reported separately, not as a new account.
    track(intent.guestId === userId ? 'funnel_guest_account_saved' : 'funnel_existing_account_signed_in');
  } catch { /* Ignore an expired or malformed intent. */ }
}

export function recordChallengeView(kind: 'tracked' | 'comparison', identity: string) {
  // Deduplicate locally without retaining names or full shared URLs in keys.
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
  once('funnel_challenge_view', `challenge:${kind}:${(hash >>> 0).toString(16)}`, true);
  tag('challenge_link_type', kind);
}

export function recordResultView(mode: Mode, date: string, at: number) {
  once('funnel_result_view', `result:${mode}:${date}:${at}`, true);
}

export function recordChallengeCompleted(identity: string) {
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
  once('funnel_challenge_completed', `challenge-completed:${(hash >>> 0).toString(16)}`, true);
}
