import { DailyGamesPrompt } from './DailyGamesPrompt';
import { readTrackedToken } from '../lib/trackedChallenges';
import { TrackedChallengeBanner } from './TrackedChallengeBanner';
import { useEffect, useState } from 'react';
import type { Mode } from '../config';
import type { PastChallenge } from './GameScreen';
import { readScoreChallenge } from '../lib/scoreChallenge';
import { fmtResult } from '../lib/scoring';
import { bestAttempt, modeDay, triesLeft, usePlayer } from '../lib/store';

export function ScoreChallengeBanner({ mode, date, onPastChallenge }: { mode: Mode; date: string; onPastChallenge?: (c: PastChallenge | null) => void }) {
  const [token, setToken] = useState(() => readTrackedToken(location.hash));
  const [challenge, setChallenge] = useState(() => readScoreChallenge(location.hash));
  const days = usePlayer(s => s.days);
  useEffect(() => {
    const update = () => { setChallenge(readScoreChallenge(location.hash)); setToken(readTrackedToken(location.hash)); };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => { if (!token) onPastChallenge?.(null); }, [token, onPastChallenge]);
  if (token) return <TrackedChallengeBanner key={token} token={token} mode={mode} date={date} onPastChallenge={onPastChallenge} />;
  if (!challenge || challenge.mode !== mode) return null;
  if (challenge.date !== date) return <div className="score-challenge expired">This challenge was for {challenge.date}. Today's test is different. Play today and send a new challenge! <a className="challenge-today" href="#">Play today's challenges →</a></div>;
  const md = modeDay(days, date, mode);
  const best = bestAttempt(md);
  const winner = !best ? null : best.score > challenge.attempt.score ? 'you' : best.score < challenge.attempt.score ? 'friend' : 'tie';
  const outcome = winner === null ? 'Your turn. Beat that!' : winner === 'you' ? 'You win!' : winner === 'tie' ? "It's a tie!" : `${challenge.name} wins!`;

  return <div className="score-challenge">
    <div className="challenge-heading">{challenge.name} challenged you</div>
    <div className="challenge-scores">
      <div className={winner === 'friend' ? 'challenge-winner' : ''}><small>{challenge.name}</small><b>{fmtResult(mode, challenge.attempt)}</b></div>
      <span className="challenge-versus">VS</span>
      <div className={winner === 'you' ? 'challenge-winner' : ''}><small>You</small><b>{best ? fmtResult(mode, best) : 'Not played'}</b></div>
    </div>
    <p className={`challenge-outcome ${winner === 'you' ? 'won' : ''}`} role="status">{winner !== null && winner !== 'tie' && <span aria-hidden="true">&#127942; </span>}{outcome}</p>
    {best && triesLeft(md) > 0 && <small className="challenge-source">Best scores so far. {triesLeft(md)} {triesLeft(md) === 1 ? 'try' : 'tries'} left to improve yours.</small>}
    {best && <DailyGamesPrompt />}
    <small className="challenge-source challenge-attribution">Untracked link - only you can see this comparison</small>
  </div>;
}
