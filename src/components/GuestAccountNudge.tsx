import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MODES } from '../config';
import { accountNudgeDue, lastAccountNudgeDay, markAccountNudgeShown } from '../lib/accountNudge';
import { useAuth } from '../lib/auth';
import { track } from '../lib/clarity';
import { todayUTC } from '../lib/daily';
import { pixelArtUrl } from '../lib/pixelAssets';
import { modeDay, usePlayer } from '../lib/store';
import { AccountCard } from './AccountCard';

/** Mounted only for a fresh daily result; never interrupts a game or a restored result. */
export function GuestAccountNudge({ date, attemptAt, blocked }: { date: string; attemptAt: number; blocked: boolean }) {
  const status = useAuth(s => s.status);
  const owner = useAuth(s => s.userId);
  const attempts = usePlayer(s => MODES.reduce((sum, mode) => sum + modeDay(s.days, date, mode).tries.length, 0));
  const dialog = useRef<HTMLDialogElement>(null);
  const [speaker] = useState(() => Math.random() < 0.5 ? 'angel' : 'demon');

  useEffect(() => {
    if (blocked || !accountNudgeDue(status, attempts, date, lastAccountNudgeDay(), todayUTC())) return;
    const element = dialog.current;
    if (!element) return;
    const timer = window.setTimeout(() => {
      const auth = useAuth.getState();
      if (auth.userId !== owner || !accountNudgeDue(auth.status, attempts, date, lastAccountNudgeDay(), todayUTC())) return;
      // Leave sharing, account editing, and other dialogs undisturbed.
      if (document.visibilityState !== 'visible' || document.querySelector('.modal, dialog[open], .guest-progress-save[open]')) return;
      if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return;
      element.showModal();
      markAccountNudgeShown(date);
      track(`account_nudge_shown_${speaker}`);
    }, 3500);
    return () => {
      window.clearTimeout(timer);
      element.close();
    };
  }, [status, owner, attempts, date, attemptAt, blocked, speaker]);

  if (status !== 'anon') return null;
  return createPortal(<dialog ref={dialog} className={`account-nudge-dialog px-box ${speaker}`}
    aria-labelledby="account-nudge-title" aria-describedby="account-nudge-copy"
    onClose={() => track('account_nudge_closed')}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
    }}>
    <button type="button" className="btn btn-ghost account-nudge-close" aria-label="Close account invitation" onClick={() => dialog.current?.close()} autoFocus>&times;</button>
    <img src={pixelArtUrl(`${speaker}-192.png`)} width="96" height="96" alt="" aria-hidden="true" />
    <p className="account-nudge-speaker">{speaker === 'angel' ? 'Hype Angel' : 'Little Menace'}</p>
    <h2 id="account-nudge-title">{speaker === 'angel' ? 'Take your progress with you.' : 'Different device. Same questionable skills.'}</h2>
    <p id="account-nudge-copy">{speaker === 'angel'
      ? 'Your scores are already saved here. Link Google to keep your nickname, streak, scores and unlocked cars across devices.'
      : 'Your scores are saved here, genius. Link Google so your nickname, streak, scores and cars can follow you to another device.'}</p>
    <AccountCard compact />
    <button type="button" className="btn btn-ghost account-nudge-later" onClick={() => dialog.current?.close()}>Maybe tomorrow</button>
    <p className="account-nudge-note">Keep playing as a guest. We won&apos;t ask again today.</p>
  </dialog>, document.body);
}
