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
      <summary>Save progress / Log in</summary>
      <AccountCard compact />
    </details>
    <p className="guest-progress-note">Playing as a guest. Keep your name and scores across devices.</p>
  </section>;
}
