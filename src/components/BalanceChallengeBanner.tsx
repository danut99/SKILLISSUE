import { useEffect, useState } from 'react';
import { readScoreChallenge } from '../lib/scoreChallenge';

export function BalanceChallengeBanner({ date, score, remaining }: { date: string; score: number | null; remaining: number }) {
  const [challenge, setChallenge] = useState(() => readScoreChallenge(location.hash));
  useEffect(() => {
    const update = () => setChallenge(readScoreChallenge(location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  if (challenge?.mode !== 'balance') return null;
  if (challenge.date !== date) return <div className="score-challenge expired">
    This challenge was for {challenge.date}. Today's balance is different.
    <a className="challenge-today" href="#balance">Play today's balance</a>
  </div>;
  const final = remaining === 0;
  const winner = score === null ? null : score > challenge.attempt.score ? 'you' : score < challenge.attempt.score ? 'friend' : 'tie';
  const outcome = winner === null ? 'Your turn. Find the balance!' : winner === 'tie' ? final ? 'Finished in a tie!' : 'Tied so far'
    : winner === 'you' ? final ? 'You win!' : 'You lead!' : `${challenge.name} ${final ? 'wins!' : 'leads'}`;
  return <div className="score-challenge balance-challenge">
    <div className="challenge-heading">{challenge.name} challenged you</div>
    <div className="challenge-scores">
      <div className={winner === 'friend' ? 'challenge-winner' : ''}><small>{challenge.name}</small><b>{challenge.attempt.score.toFixed(1)} / 100</b></div>
      <span className="challenge-versus">VS</span>
      <div className={winner === 'you' ? 'challenge-winner' : ''}><small>You</small><b>{score === null ? 'Not played' : `${score.toFixed(1)} / 100`}</b></div>
    </div>
    <p className="challenge-outcome" role="status">{outcome}</p>
    <small className="challenge-source">Daily tries apply. This link compares scores on your device.</small>
  </div>;
}
