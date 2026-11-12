import { useState, type FormEvent } from 'react';
import { connectEmail, signOut, useAuth } from '../lib/auth';
import { toast } from '../lib/ui';

/**
 * "Save progress" (Krillion-style): optional, never required.
 * Same buttons work on a new device — they log into the existing player.
 */
export function AccountCard({ compact = false, page = false }: { compact?: boolean; page?: boolean }) {
  const { status, email } = useAuth();
  const [mail, setMail] = useState('');
  const [sent, setSent] = useState<'link_sent' | 'login_sent' | null>(null);
  const [busy, setBusy] = useState(false);

  const unavailable = status === 'offline' || status === 'connecting' || status === 'error';
  // elsewhere the prompt only appears when accounts actually work; on the account page it's always shown
  if (unavailable && !page) return null;
  const notLive = () =>
    toast(status === 'connecting' ? 'Connecting… try again in a second ⏳' : "Accounts aren't live yet. Your scores are safe on this device 🔌");

  if (status === 'linked') {
    if (compact) return null;
    const via = email ?? 'your account';
    return (
      <div className="card px-box account-card linked">
        <div className="acc-title">progress saved</div>
        <p className="acc-text">
          as <b>{via}</b>. log in with it on any device to continue.
        </p>
        <button className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
          sign out
        </button>
      </div>
    );
  }

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    if (unavailable) return notLive();
    if (!/^\S+@\S+\.\S+$/.test(mail)) return;
    setBusy(true);
    const r = await connectEmail(mail.trim());
    setBusy(false);
    if (r !== 'error') setSent(r);
  }

  if (page) {
    return (
      <div className="me-box">
        <h3>Keep your scores together.</h3>
        <p>Sign in with email to save your nickname, streak, scores and cars on every device. Free. No password.</p>
        <p className="me-fine">We will email you a confirmation link. Click it to confirm your email and save your progress. No password needed.</p>
        {sent ? (
          <p className="acc-sent">📬 {sent === 'link_sent' ? 'Check your inbox and click the link to confirm your email and save your progress. Check spam too.' : 'Check your inbox and click the link to sign in. Check spam too.'}</p>
        ) : (
          <form className="me-email" onSubmit={sendLink}>
            <input
              type="email"
              value={mail}
              onChange={(e) => setMail(e.target.value)}
              placeholder="Your email"
              aria-label="Email"
              autoComplete="email"
              required
            />
            <button className="btn btn-ghost" type="submit" disabled={busy}>
              {busy ? '…' : 'Send link'}
            </button>
          </form>
        )}
        <p className="me-fine">
          Everything you played on this device comes with you. Already have an account on another device? Enter the same email to log in
          (guest tries from this device won't be merged).
        </p>
      </div>
    );
  }

  return (
    <div className={`card px-box account-card ${compact ? 'compact' : ''}`}>
      <div className="acc-title">save your progress</div>
      <p className="acc-text">
        keep your name, streak &amp; scores on any device. no password.
        {!compact && <> already played somewhere else? use the same email to log in.</>}
      </p>
      <p className="acc-text">Enter your email, then click the link in your inbox to confirm it and save your progress.</p>
      {sent ? (
        <p className="acc-sent">
          📬 {sent === 'link_sent' ? 'check your inbox and click the link to confirm your email and save your progress. check spam too.' : 'check your inbox and click the link to sign in. check spam too.'}
        </p>
      ) : (
        <form className="nick-form" onSubmit={sendLink}>
          <input
            type="email"
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            placeholder="your email"
            aria-label="Email"
            autoComplete="email"
            required
          />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? '…' : 'send link'}
          </button>
        </form>
      )}
    </div>
  );
}
