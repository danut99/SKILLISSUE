import { useState } from 'react';
import { connectGoogle, signOut, switchToGoogle, useAuth } from '../lib/auth';
import { track } from '../lib/clarity';
import { toast } from '../lib/ui';

/**
 * "Save progress" (Krillion-style): optional, never required.
 * The same button works on a new device — it logs into the existing player.
 */
export function AccountCard({ compact = false, page = false }: { compact?: boolean; page?: boolean }) {
  const { status, email, conflict } = useAuth();
  const [busy, setBusy] = useState(false);

  const unavailable = status === 'offline' || status === 'connecting' || status === 'error';
  // elsewhere the prompt only appears when accounts actually work; on the account page it's always shown
  if (unavailable && !page) return null;

  if (status === 'linked') {
    if (compact) return null;
    const via = email ?? 'your Google account';
    return (
      <div className="card px-box account-card linked">
        <div className="acc-title">progress saved</div>
        <p className="acc-text">
          as <b>{via}</b>. continue with Google on any device to keep playing.
        </p>
        <button className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
          sign out
        </button>
      </div>
    );
  }

  async function google(action: 'link' | 'switch') {
    if (unavailable) {
      toast(status === 'connecting' ? 'Connecting… try again in a second ⏳' : "Accounts aren't live yet. Your scores are safe on this device 🔌");
      return;
    }
    track(action === 'switch' ? 'google_switch' : 'google_continue');
    setBusy(true);
    await (action === 'switch' ? switchToGoogle() : connectGoogle());
    setBusy(false);
  }

  const button = (
    <button className={`btn google ${page ? 'me-google' : ''}`} disabled={busy} onClick={() => void google('link')}>
      <span className="g" aria-hidden="true">G</span>
      {busy ? 'Opening Google…' : 'Continue with Google'}
    </button>
  );

  const conflictBox = conflict === 'google' && (
    <div className="acc-conflict" role="alert">
      <p>That Google account already has a player. Switch to it? Tries from this device won't be merged.</p>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void google('switch')}>Switch to that player</button>
      <button className="btn btn-ghost btn-sm" onClick={() => useAuth.setState({ conflict: null })}>Stay here</button>
    </div>
  );

  if (page) {
    return (
      <div className="me-box">
        <h3>Keep your scores together.</h3>
        <p>Continue with Google to save your nickname, streak, scores and cars on every device. Free. No password.</p>
        {conflictBox || button}
        <p className="me-fine">
          Everything you played on this device comes with you. Already played on another device? Use the same Google account to log in
          (guest tries from this device won't be merged).
        </p>
      </div>
    );
  }

  return (
    <div className={`card px-box account-card ${compact ? 'compact' : ''}`}>
      {!compact && <div className="acc-title">save your progress</div>}
      <p className="acc-text">keep your name, streak &amp; scores on any device. no password.</p>
      {conflictBox || button}
    </div>
  );
}
