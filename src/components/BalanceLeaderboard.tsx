import { useEffect, useState } from 'react';
import { fetchBalanceBoard } from '../lib/balance';
import { useAuth } from '../lib/auth';
import type { Board } from '../lib/leaderboard';
import { useUi } from '../lib/ui';
import { LeaderboardRank } from './Leaderboard';
import { NicknameControl } from './NicknameControl';
import { PixelIcon } from './PixelIcon';

export function BalanceLeaderboard({ date }: { date: string }) {
  const identity = useAuth(state => state.userId);
  const version = useUi(state => state.boardVersion);
  const key = `${date}:${identity}:${version}`;
  const [result, setResult] = useState<{ key: string; board?: Board; error?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchBalanceBoard().then(board => {
      if (alive) setResult({ key, board });
    }).catch(error => {
      if (alive) setResult({ key, error: error instanceof Error ? error.message : 'Could not load scores.' });
    });
    return () => { alive = false; };
  }, [key]);
  const board = result?.key === key ? result.board : undefined;
  const error = result?.key === key ? result.error : undefined;
  return <section className="card lb-card balance-leaderboard" aria-label="Balance all-time leaderboard">
    <h2 className="leaderboard-heading"><PixelIcon name="trophy" />BALANCE! all-time</h2>
    <p className="leaderboard-period-note">Total points from your best BALANCE! score each day.</p>
    {error ? <div className="lb-empty" role="alert"><p>{error}</p><button className="btn btn-ghost" onClick={() => useUi.getState().refreshBoards()}>Try again</button></div>
      : !board ? <p role="status" className="lb-empty">Loading scores...</p>
      : board.rows.length === 0 ? <p className="lb-empty">No scores yet. Be the first to find the balance.</p>
      : <table className="lb lb-all-time" aria-label="Balance all-time rankings"><tbody>
        {board.rows.map(row => <tr key={row.rank} className={row.is_me ? 'me' : ''}>
          <td><LeaderboardRank rank={row.rank} /></td>
          <td className="nick"><span className={row.rank <= 3 ? `podium-name podium-name-${row.rank}` : undefined}>{row.nickname}</span>{row.is_me && ' (you)'}</td>
          <td>{row.score.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
        </tr>)}
      </tbody></table>}
    {board?.source === 'demo' && <p className="lb-note">Scores on this device. Global rankings are available when connected.</p>}
    <NicknameControl date={date} />
  </section>;
}
