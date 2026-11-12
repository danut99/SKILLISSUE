import { useEffect, useRef, useState } from 'react';
import type { BoardMode } from '../config';
import { fetchBoard, type Board } from '../lib/leaderboard';
import { fmtResult } from '../lib/scoring';
import { useUi } from '../lib/ui';

interface Props {
  mode: BoardMode;
  date: string;
  title: string;
  onLoad?: (b: Board) => void;
}

export function Leaderboard({ mode, date, title, onLoad }: Props) {
  const version = useUi((s) => s.boardVersion);
  const setRank = useUi((s) => s.setRank);
  const [board, setBoard] = useState<Board | null>(null);
  const onLoadRef = useRef(onLoad);
  const meRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    onLoadRef.current = onLoad;
  });

  useEffect(() => {
    let alive = true;
    fetchBoard(date, mode)
      .then((b) => {
        if (!alive) return;
        setBoard(b);
        setRank(mode, b.myRank);
        onLoadRef.current?.(b);
      })
      .catch(() => alive && setBoard({ rows: [], myRank: null, source: 'demo' }));
    return () => {
      alive = false;
    };
  }, [date, mode, version, setRank]);

  const top = board?.rows.filter((r) => r.rank <= 10) ?? [];
  const meOutside = board?.rows.find((r) => r.is_me && r.rank > 10);

  return (
    <div className="card lb-card">
      <h3>{title}</h3>
      {!board ? (
        <div className="lb-empty">loading…</div>
      ) : top.length === 0 ? (
        <div className="lb-empty">No scores yet today. Be the first legend.</div>
      ) : (
        <table className="lb">
          <tbody>
            {top.map((r) => (
              <tr key={r.rank} className={r.is_me ? 'me' : ''} ref={r.is_me ? meRef : undefined}>
                <td>{r.rank === 1 ? '👑' : `#${r.rank}`}</td>
                <td className="nick">
                  {r.nickname}
                  {r.is_me && ' (you)'}
                </td>
                <td>{fmtResult(mode, r)}</td>
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
                  <td>{fmtResult(mode, meOutside)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      )}
      {board?.myRank && <div className="lb-you">▶ you're <b>#{board.myRank}</b> today</div>}
      {board?.source === 'demo' && <div className="lb-note">🧪 demo board (bots + you) — connect Supabase for the real global one</div>}
    </div>
  );
}
