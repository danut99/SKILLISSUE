import { useEffect, useState } from 'react';
import type { Mode } from '../config';
import { useAuth } from '../lib/auth';
import { fmtResult } from '../lib/scoring';
import { acceptTrackedChallenge, previewTrackedChallenge, challengeWinner, type TrackedChallenge } from '../lib/trackedChallenges';
import { toast, useUi } from '../lib/ui';
import { useChallengeRefresh } from '../lib/useChallengeRefresh';

export function TrackedChallengeBanner({ token, mode, date }: { token: string; mode: Mode; date: string }) {
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
  async function accept() {
    setBusy(true);
    try { const data = await acceptTrackedChallenge(token); setResult({ token, owner: userId, data }); useUi.getState().refreshBoards(); toast('Challenge accepted! The sender can now see your response.'); }
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
    {expired ? <p>This challenge is from {data.play_date}. Start a new challenge for today.</p> : !data.is_owner && !data.accepted ?
      <button className="btn btn-primary" disabled={busy} onClick={() => void accept()}>{busy ? 'Accepting...' : 'Accept challenge'}</button> : null}
    <small className="challenge-source challenge-attribution">{data.is_owner && data.participants.length > 0 ? 'Your shared target is fixed. Results update as players finish their daily attempts.' : data.accepted ? expired || player?.attempts_remaining === 0 ? 'Final result for that day.' : 'Best scores so far. Your result updates after scores sync.' : data.is_owner ? 'Send this link to a friend.' : 'Accept to share your daily best with the sender.'}</small>
    <a className="challenge-manage" href="#friends">View challenge responses</a>
  </div>;
}
