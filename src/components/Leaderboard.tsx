import { useEffect, useRef, useState } from 'react';
import type { BoardMode, LeaderboardPeriod } from '../config';
import { fetchAllTimeBoard, fetchBoard, fetchLevelBoard, type Board } from '../lib/leaderboard';
import { fmtResult } from '../lib/scoring';
import { useUi } from '../lib/ui';
import { fetchFriendsBoard } from '../lib/friends';
import { useAuth } from '../lib/auth';
import { PixelIcon, type PixelIconName } from './PixelIcon';

const PODIUM_CROWNS: PixelIconName[] = ['crown-gold', 'crown-silver', 'crown-bronze'];

export function LeaderboardRank({ rank }: { rank: number }) {
  if (rank > 3) return <>#{rank}</>;
  return <span className={`leaderboard-crown place-${rank}`} aria-label={`Rank ${rank}`} title={`Rank ${rank}`}>
    <PixelIcon name={PODIUM_CROWNS[rank - 1]} size={18} />
    <span aria-hidden="true">{rank}</span>
  </span>;
}

interface Props {
  mode: BoardMode;
  date: string;
  title: string;
  onLoad?: (b: Board) => void;
  scope?: 'global' | 'friends';
}

export function Leaderboard({ mode, date, title, onLoad, scope = 'global' }: Props) {
  const [period, setPeriod] = useState<LeaderboardPeriod>('daily');
  const version = useUi((s) => s.boardVersion);
  const setRank = useUi((s) => s.setRank);
  const userId = useAuth((s) => s.userId);
  const requestKey = `${date}:${mode}:${scope}:${period}:${version}:${userId}`;
  const [result, setResult] = useState<{ key: string; board: Board | null; error?: string } | null>(null);
  const board = result?.key === requestKey ? result.board : null;
  const error = result?.key === requestKey ? result.error : null;
  const onLoadRef = useRef(onLoad);
  const meRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    onLoadRef.current = onLoad;
  });

  useEffect(() => {
    let alive = true;
    const request = period === 'levels' ? fetchLevelBoard(mode, scope === 'friends')
      : scope === 'friends' ? fetchFriendsBoard(mode, period)
      : period === 'all-time' ? fetchAllTimeBoard(date, mode) : fetchBoard(date, mode);
    request
      .then((b) => {
        if (!alive) return;
        setResult({ key: requestKey, board: b });
        if (period === 'daily') {
          if (scope === 'global') setRank(mode, b.myRank);
          onLoadRef.current?.(b);
        }
      })
      .catch(() => {
        if (alive) setResult({ key: requestKey, board: null, error: 'Could not load scores. Please try again.' });
      });
    // Result cards and the cut ghost always use today's rank and best cut.
    if (period !== 'daily' && scope === 'global') {
      fetchBoard(date, mode).then(daily => {
        if (!alive) return;
        setRank(mode, daily.myRank);
        onLoadRef.current?.(daily);
      }).catch(() => { /* The selected board reports its own loading error. */ });
    }
    return () => {
      alive = false;
    };
  }, [date, mode, scope, period, requestKey, setRank]);

  const top = board?.rows.filter((r) => r.rank <= 10) ?? [];
  const meOutside = board?.rows.find((r) => r.is_me && r.rank > 10);
  const formatScore = (row: Board['rows'][number]) => period === 'all-time'
    ? row.score.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : period === 'levels' ? `${row.score} ★` : fmtResult(mode, row);
  const periodLabel = period === 'levels' ? 'Levels' : period === 'daily' ? 'Daily' : 'All-time';

  return (
    <div className="card lb-card">
      <h3 className="leaderboard-heading"><PixelIcon name="trophy" />{title}</h3>
      <div className="leaderboard-period" role="group" aria-label="Leaderboard period">
        <button type="button" aria-pressed={period === 'daily'} onClick={() => setPeriod('daily')}>Daily</button>
        <button type="button" aria-pressed={period === 'all-time'} onClick={() => setPeriod('all-time')}>All-time</button>
        <button type="button" aria-pressed={period === 'levels'} onClick={() => setPeriod('levels')}>Levels</button>
      </div>
      <p className="leaderboard-period-note">{period === 'daily' ? "Today's best scores" : period === 'levels' ? 'Ranked by stars, levels cleared, then best scores' : 'Total points · best score per game per day'}</p>
      {error ? (
        <div className="lb-empty" role="alert">
          <p>{error}</p>
          <button className="btn btn-ghost btn-sm" onClick={() => useUi.getState().refreshBoards()}>Try again</button>
        </div>
      ) : !board ? (
        <div className="lb-empty">loading…</div>
      ) : top.length === 0 ? (
        <div className="lb-empty">{period === 'daily' ? 'No scores yet today. Be the first legend.' : 'No scores yet. Be the first legend.'}</div>
      ) : (
        <table className={`lb ${period === 'all-time' ? 'lb-all-time' : ''}`} aria-label={`${periodLabel} rankings`}>
          <tbody>
            {top.map((r) => (
              <tr key={r.rank} className={r.is_me ? 'me' : ''} ref={r.is_me ? meRef : undefined}>
                <td><LeaderboardRank rank={r.rank} /></td>
                <td className="nick">
                  <span className={r.rank <= 3 ? `podium-name podium-name-${r.rank}` : undefined}>{r.nickname}</span>
                  {r.is_me && ' (you)'}
                </td>
                <td>{formatScore(r)}{period === 'levels' && <small className="lb-level-progress">{r.detail.completed ?? 0} cleared</small>}</td>
              </tr>
            ))}
            {meOutside && (
              <>
                <tr className="gap">
                  <td colSpan={3}>· · ·</td>
                </tr>
                <tr className="me" ref={meRef}>
                  <td>#{meOutside.rank}</td>
                  <td className="nick">{meOutside.nickname} (you)</td>
                  <td>{formatScore(meOutside)}{period === 'levels' && <small className="lb-level-progress">{meOutside.detail.completed ?? 0} cleared</small>}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      )}
      {board?.myRank && <div className="lb-you">▶ you're <b>#{board.myRank}</b> {period === 'daily' ? 'today' : period === 'levels' ? 'in levels' : 'all-time'}</div>}
      {board?.source === 'demo' && <div className="lb-note">demo board (bots + you) — connect Supabase for the real global one</div>}
    </div>
  );
}
