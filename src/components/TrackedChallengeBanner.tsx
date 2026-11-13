import { DailyGamesPrompt } from './DailyGamesPrompt';
import { useEffect, useState } from 'react';
import type { Mode } from '../config';
import type { PastChallenge } from './GameScreen';
import { track } from '../lib/clarity';
import { useAuth } from '../lib/auth';
import { fmtResult } from '../lib/scoring';
import { acceptTrackedChallenge, previewTrackedChallenge, challengeWinner, pastChallengeDate, type TrackedChallenge } from '../lib/trackedChallenges';
import { toast, useUi } from '../lib/ui';
import { useChallengeRefresh } from '../lib/useChallengeRefresh';

export function TrackedChallengeBanner({ token, mode, date, onPastChallenge }: { token: string; mode: Mode; date: string; onPastChallenge?: (c: PastChallenge | null) => void }) {
  const { userId, status } = useAuth();
  const version = useUi(s => s.boardVersion);
  const revision = useChallengeRefresh();
  const [result, setResult] = useState<{ token: string; owner: string | null; data?: TrackedChallenge; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    previewTrackedChallenge(token).then(data => { if (active) setResult({ token, owner: userId, data }); })
      .catch((cause: Error) => { if (active) setResult({ token, owner: userId, error: cause.message }); });
    return () => { active = false; };
  }, [token, userId, status, version, revision]);
  const current = result?.token === token && result.owner === userId ? result : null;
  const data = current?.data;
  const pastDate = data && data.mode === mode ? pastChallengeDate(data, date) : null;
  useEffect(() => { onPastChallenge?.(pastDate ? { token, date: pastDate } : null); }, [pastDate, token, onPastChallenge]);
  async function accept() {
    setBusy(true);
    try {
      const data = await acceptTrackedChallenge(token);
      setResult({ token, owner: userId, data });
      useUi.getState().refreshBoards();
      const past = data.play_date < date;
      track(past ? `challenge_accept_past_${mode}` : `challenge_accept_${mode}`);
      toast(past ? `Challenge accepted! Now playing the ${data.play_date} puzzle.` : 'Challenge accepted! The sender can now see your response.');
    }
    catch (cause) { toast(cause instanceof Error ? cause.message : 'Could not accept challenge.'); }
    finally { setBusy(false); }
  }
  if (!data) return <div className="score-challenge" role="status">{current?.error ?? 'Loading challenge...'}</div>;
  if (data.mode !== mode) return <div className="score-challenge">This link belongs to a different game. <a href={`#${data.mode}/duel/${data.token}`}>Open challenge</a></div>;
  const expired = data.play_date !== date;
  const player = data.participants.find(p => p.is_me);
  const winner = player?.score !== null && player?.score !== undefined ? Math.sign(player.score - data.creator_score) : null;
  return <div className="score-challenge">
    <div className="challenge-heading">{data.is_owner ? 'Your challenge link' : `${data.creator_name} challenged you`}</div>
    <div className="challenge-scores">
      <div className={winner === -1 ? 'challenge-winner' : ''}><small>{data.creator_name}</small><b>{fmtResult(mode, { score: data.creator_score, detail: data.creator_detail })}</b></div>
      {!data.is_owner && <><span className="challenge-versus">VS</span><div className={winner === 1 ? 'challenge-winner' : ''}><small>You</small><b>{player?.score != null ? fmtResult(mode, { score: player.score, detail: player.detail ?? {} }) : 'Not played'}</b></div></>}
    </div>
    {data.is_owner ? <p>{data.participants.length ? `${data.participants.length} ${data.participants.length === 1 ? 'player accepted' : 'players accepted'}` : 'Waiting for someone to accept'}</p> :
      data.accepted && player ? <p className={`challenge-outcome ${winner === 1 ? 'won' : ''}`} role="status">{challengeWinner(data, player)}</p> : null}
    {data.is_owner && data.participants.length > 0 && (
      <ul className="challenge-banner-responses" aria-label="Challenge responses">
        {data.participants.map((participant, index) => (
          <li key={`${participant.accepted_at}:${index}`}>
            <div className="challenge-response-player">
              <span>{participant.nickname}</span>
              <b>{participant.score !== null ? fmtResult(mode, { score: participant.score, detail: participant.detail ?? {} }) : 'Not played yet'}</b>
            </div>
            <span className="challenge-response-outcome">{challengeWinner(data, participant)}</span>
          </li>
        ))}
      </ul>
    )}
    {expired && <p>{data.is_owner ? `This challenge is from ${data.play_date}. Start a new challenge for today.`
      : data.accepted ? `You're playing the ${data.play_date} puzzle. It counts in the all-time leaderboard only, not today's daily board.`
      : `This challenge is from ${data.play_date}. You can still play that day's puzzle: it counts in the all-time leaderboard only, not today's daily board.`}</p>}
    {!data.is_owner && !data.accepted &&
      <button className="btn btn-primary" disabled={busy} onClick={() => void accept()}>{busy ? 'Accepting...' : expired ? `Accept & play ${data.play_date}` : 'Accept challenge'}</button>}
    <small className="challenge-source challenge-attribution">{data.is_owner && data.participants.length > 0 ? 'Your shared target is fixed. Results update as players finish their daily attempts.' : data.accepted ? player?.attempts_remaining === 0 ? 'Final result for that day.' : 'Best scores so far. Your result updates after scores sync.' : data.is_owner ? 'Send this link to a friend.' : 'Accept to share your daily best with the sender.'}</small>
    {player?.score != null && <DailyGamesPrompt />}
    <a className="challenge-manage" href="#friends">View challenge responses</a>
    {expired && <a className="challenge-today" href="#">Play today's challenges →</a>}
  </div>;
}
