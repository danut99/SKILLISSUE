import { routeToken } from '../lib/navigation';
import { DailyGamesPrompt } from './DailyGamesPrompt';
import { readTrackedToken } from '../lib/trackedChallenges';
import { TrackedChallengeBanner } from './TrackedChallengeBanner';
import { useEffect, useState } from 'react';
import type { Mode } from '../config';
import type { PastChallenge } from './GameScreen';
import { readScoreChallenge } from '../lib/scoreChallenge';
import { fmtResult } from '../lib/scoring';
import { bestAttempt, modeDay, triesLeft, usePlayer } from '../lib/store';
import { recordChallengeView } from '../lib/engagementTracking';
import { focusGame } from '../lib/playEntry';

export function ScoreChallengeBanner({ mode, date, onPastChallenge }: { mode: Mode; date: string; onPastChallenge?: (c: PastChallenge | null) => void }) {
  const [token, setToken] = useState(() => readTrackedToken(routeToken()));
  const [challenge, setChallenge] = useState(() => readScoreChallenge(routeToken()));
  const days = usePlayer(s => s.days);
  useEffect(() => {
    if (challenge && challenge.mode === mode) recordChallengeView('comparison', `${mode}:${challenge.date}:${challenge.name}:${challenge.attempt.score}`);
  }, [challenge, mode]);
  useEffect(() => {
    const update = () => { setChallenge(readScoreChallenge(routeToken())); setToken(readTrackedToken(routeToken())); };
    window.addEventListener('skilly:navigate', update);
    return () => window.removeEventListener('skilly:navigate', update);
  }, []);
  useEffect(() => { if (!token) onPastChallenge?.(null); }, [token, onPastChallenge]);
  if (token) return <TrackedChallengeBanner key={token} token={token} mode={mode} date={date} onPastChallenge={onPastChallenge} />;
  if (!challenge || challenge.mode !== mode) return null;
  if (challenge.date !== date) return <div className="score-challenge expired">This challenge was for {challenge.date}. Today's test is different. Play today and send a new challenge! <a className="challenge-today" href="/">Play today's challenges →</a></div>;
  const md = modeDay(days, date, mode);
  const best = bestAttempt(md);
  const winner = !best ? null : best.score > challenge.attempt.score ? 'you' : best.score < challenge.attempt.score ? 'friend' : 'tie';
  const final = triesLeft(md) === 0;
  const outcome = winner === null ? 'Your turn. Beat that!' : winner === 'you' ? final ? 'You win!' : 'You’re ahead. Can you go higher?' : winner === 'tie' ? final ? "It's a tie!" : 'Tied so far. One more try?' : final ? `${challenge.name} wins!` : 'The target is still there. Take another shot.';

  return <div className="score-challenge">
    <div className="challenge-heading"><span className="challenge-eyebrow">A FRIEND THINKS YOU CANNOT BEAT THIS</span><h2>Can you beat {challenge.name}?</h2><p>The target: <strong>{challenge.attempt.score.toFixed(1)} / 100</strong>.</p></div>
    <div className="challenge-scores">
      <div className={winner === 'friend' ? 'challenge-winner' : ''}><small>{challenge.name}</small><b>{challenge.attempt.score.toFixed(1)}<small>/ 100</small></b><span className="challenge-measure">{fmtResult(mode, challenge.attempt)}</span></div>
      <span className="challenge-versus">VS</span>
      <div className={winner === 'you' ? 'challenge-winner' : ''}><small>You</small><b>{best ? <>{best.score.toFixed(1)}<small>/ 100</small></> : 'Your turn'}</b>{best && <span className="challenge-measure">{fmtResult(mode, best)}</span>}</div>
    </div>
    <p className={`challenge-outcome ${winner === 'you' ? 'won' : ''}`} role="status">{winner !== null && winner !== 'tie' && <span aria-hidden="true">&#127942; </span>}{outcome}</p>
    {triesLeft(md) > 0 && <button className="btn btn-primary" onClick={focusGame}>{best ? 'Try again' : `Beat ${challenge.attempt.score.toFixed(1)} points`}</button>}
    {best && triesLeft(md) > 0 && <small className="challenge-source">Best scores so far. {triesLeft(md)} {triesLeft(md) === 1 ? 'try' : 'tries'} left to improve yours.</small>}
    {best && <DailyGamesPrompt />}
    <small className="challenge-source challenge-attribution">Untracked link - only you can see this comparison</small>
  </div>;
}
