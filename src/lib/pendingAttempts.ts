import type { Mode } from '../config';
import { todayUTC } from './daily';
import type { Attempt } from './store';

/** Daily tries finished while the server was unreachable, uploaded once we're back online. */
export interface PendingAttempt {
  date: string;
  mode: Mode;
  attempt: Attempt;
}

export type SendResult = 'ok' | 'drop' | 'retry';

const KEY = 'skillissue:pending-attempts';
const MAX_PENDING = 50;

const sameItem = (a: PendingAttempt, b: PendingAttempt) => a.date === b.date && a.mode === b.mode && a.attempt.at === b.attempt.at;

export function readPending(): PendingAttempt[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writePending(list: PendingAttempt[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_PENDING)));
    else localStorage.removeItem(KEY);
  } catch { /* Storage may be unavailable. */ }
}

export function queueAttempt(date: string, mode: Mode, attempt: Attempt) {
  writePending([...readPending(), { date, mode, attempt }]);
}

export const clearPending = () => writePending([]);

let flushing: Promise<number> | null = null;

/**
 * Sends queued tries in play order and returns how many the server accepted. The server only
 * records tries for its current UTC day, so older ones are dropped. Stops at the first 'retry'.
 */
export function flushPending(send: (p: PendingAttempt) => Promise<SendResult>): Promise<number> {
  flushing ??= (async () => {
    const done: PendingAttempt[] = [];
    let sent = 0;
    try {
      for (const p of readPending()) {
        if (p.date !== todayUTC()) {
          done.push(p);
          continue;
        }
        const r = await send(p);
        if (r === 'retry') break;
        done.push(p);
        if (r === 'ok') sent++;
      }
    } finally {
      // Re-read: tries queued during the upload must survive.
      writePending(readPending().filter(p => !done.some(d => sameItem(d, p))));
      flushing = null;
    }
    return sent;
  })();
  return flushing;
}
