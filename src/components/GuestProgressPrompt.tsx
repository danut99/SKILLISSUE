import { useAuth } from '../lib/auth';
import { AccountCard } from './AccountCard';
import { NicknameControl } from './NicknameControl';

export function GuestProgressPrompt({ date }: { date: string }) {
  const status = useAuth(s => s.status);
  const userId = useAuth(s => s.userId);
  if (status !== 'anon') return null;

  return <section className="guest-progress" aria-label="Your name and progress" key={userId}>
    <NicknameControl date={date} />
    <details className="guest-progress-save">
      <summary><span className="guest-save-label">Save progress / Log in</span><span className="guest-save-short">Save / Log in</span></summary>
      <AccountCard compact />
    </details>
    <p className="guest-progress-note">Your scores are saved here. Link Google to keep your name, streak, scores and cars across devices.</p>
  </section>;
}
