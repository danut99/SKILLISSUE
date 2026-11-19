import { useAuth } from '../lib/auth';
import { AccountCard } from './AccountCard';
import { NicknameControl } from './NicknameControl';

export function GuestProgressPrompt({ date }: { date: string }) {
  const status = useAuth(s => s.status);
  const userId = useAuth(s => s.userId);
  if (status !== 'anon') return null;

  return <section className="guest-progress" aria-label="Your name and progress" key={userId}>
    <NicknameControl date={date} />
    <div className="guest-account-link">
    <p className="guest-progress-note">Keep your name and progress on every device.</p>
    <details className="guest-progress-save">
      <summary>💾 Save progress</summary>
      <AccountCard compact />
    </details>
    </div>
  </section>;
}
