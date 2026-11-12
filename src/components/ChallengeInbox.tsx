import { useChallengeRefresh } from '../lib/useChallengeRefresh';
import { useEffect, useState } from 'react';
import { MODE_INFO } from '../config';
import { useAuth } from '../lib/auth';
import { copyText, fmtResult } from '../lib/scoring';
import { challengeWinner, getTrackedChallenges, trackedChallengeUrl, type TrackedChallenge } from '../lib/trackedChallenges';
import { toast, useUi } from '../lib/ui';


export function ChallengeInbox({ compact = false }: { compact?: boolean }) {
  const { status, userId } = useAuth();
  const version = useUi(s => s.boardVersion);
  const revision = useChallengeRefresh();
  const [result, setResult] = useState<{ owner: string | null; rows?: TrackedChallenge[]; error?: string } | null>(null);
  const [pagination, setPagination] = useState({ owner: userId, page: 0 });
  const online = status === 'anon' || status === 'linked';
  useEffect(() => {
    if (!online) return;
    let active = true;
    getTrackedChallenges().then(rows => { if (active) setResult({ owner: userId, rows }); })
      .catch((cause: Error) => { if (active) setResult({ owner: userId, error: cause.message }); });
    return () => { active = false; };
  }, [online, userId, version, revision]);
  if (!online) return compact ? null : <div className="me-box">Connect online to track challenges.</div>;
  const current = result?.owner === userId ? result : null;
  const rows = current?.rows;
  const pageSize = 3;
  const pageCount = Math.max(1, Math.ceil((rows?.length ?? 0) / pageSize));
  const page = compact || pagination.owner !== userId ? 0 : Math.min(pagination.page, pageCount - 1);
  const visibleRows = rows?.slice(page * pageSize, (page + 1) * pageSize);
  if (compact && (!rows || rows.length === 0)) return null;
  return <section className="card challenge-inbox" aria-label="Your challenges">
    <h3>Your challenges</h3>
    {current?.error ? <p role="status">{current.error}</p> : !rows ? <p>Loading challenges...</p> : rows.length === 0 ? <p>Use Beat my score after a game. Responses will appear here when someone accepts.</p> :
      <ul className="challenge-inbox-list">{visibleRows?.map(challenge => <li key={challenge.token}>
        <div className="challenge-inbox-title">{MODE_INFO[challenge.mode].title} <small>{challenge.is_owner ? 'Your challenge' : `From ${challenge.creator_name}`}</small></div>
        <div className="challenge-inbox-score">{challenge.creator_name}: {fmtResult(challenge.mode, { score: challenge.creator_score, detail: challenge.creator_detail })}</div>
        {challenge.participants.length === 0 ? <p>Waiting for someone to accept</p> : <details className="challenge-response-details">
          <summary>{challenge.participants.length} {challenge.participants.length === 1 ? 'response' : 'responses'} - view results</summary>
          <div className="challenge-response-list">{challenge.participants.map((player, index) => <div className="challenge-response" key={`${player.accepted_at}:${index}`}>
          <span>{player.nickname} accepted{player.score !== null ? ` - ${fmtResult(challenge.mode, { score: player.score, detail: player.detail ?? {} })}` : ''}</span>
          <b>{challengeWinner(challenge, player)}</b>
        </div>)}</div></details>}
        <small>{challenge.play_date} - daily challenge</small>
        <div className="challenge-inbox-actions">
          <a href={`#${challenge.mode}/duel/${challenge.token}`}>View</a>
          {challenge.is_owner && <button className="btn btn-ghost btn-sm" onClick={() => void copyText(trackedChallengeUrl(location.href, challenge)).then(ok => toast(ok ? 'Challenge link copied.' : 'Could not copy link.'))}>Copy link</button>}
        </div>
      </li>)}</ul>}
    {!compact && !current?.error && rows && pageCount > 1 && <nav className="challenge-pagination" aria-label="Challenge pages">
      <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPagination({ owner: userId, page: page - 1 })}>Previous</button>
      <span aria-live="polite">{page + 1} / {pageCount}</span>
      <button className="btn btn-ghost btn-sm" disabled={page === pageCount - 1} onClick={() => setPagination({ owner: userId, page: page + 1 })}>Next</button>
    </nav>}
    {compact && <a href="#friends">All challenges &amp; friends &#8594;</a>}
    {!compact && <p className="me-fine">Targets are fixed when shared; accepted players use their daily best. Updates every 15 seconds while open. Save your account to keep challenges across devices.</p>}
  </section>;
}
