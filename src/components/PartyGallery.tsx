import { useState } from 'react';
import { dailyShape } from '../games/cutGame';
import { splitPolygon } from '../lib/geometry';
import { partyRound, partyStandings, type PartyRoom } from '../lib/party';
import type { Detail } from '../lib/store';

function Preview({ room, round, detail }: { room: PartyRoom; round: number; detail?: Detail | null }) {
  const rule = partyRound(round, room.game_version ?? 1, room.selected_games);
  if (!detail) return <span className="party-no-preview">No attempt</span>;
  if (detail.timedOut) return <span className="party-no-preview">Time up</span>;
  if (rule.mode === 'brake') {
    const front = Math.max(200, Math.min(360, 280 + (detail.offsetCm ?? detail.gapCm ?? 0) / 10));
    return <svg viewBox="0 150 360 350" aria-label="Player car stop">
      <rect x="80" y="150" width="200" height="350" fill="#182333" />
      <path d="M95 150V500M265 150V500" stroke="#e8f1ff" strokeWidth="4" />
      {detail.objective === 'parking' ? <rect x="135" y="245" width="90" height="125" fill="none" stroke="#5dff9d" strokeWidth="5" /> : <path d="M95 280H265" stroke={detail.objective === 'wall' ? '#ff5d8f' : '#ffd23f'} strokeWidth="10" />}
      <rect x="150" y={front} width="60" height="85" rx="8" fill={detail.crashed ? '#ff5d8f' : '#4de3ff'} stroke="#050a14" strokeWidth="5" />
      <rect x="158" y={front + 16} width="44" height="20" fill="#101d33" />
      <text x="180" y="465" textAnchor="middle" fill="#e8f1ff" fontSize="28">{detail.crashed ? 'CRASH' : `${((detail.gapCm ?? 0) / 100).toFixed(2)} m`}</text>
    </svg>;
  }
  const points = (detail.stroke ?? []).slice(0, 501).filter(p => p.length === 2 && p.every(Number.isFinite));
  const shape = dailyShape(`party:${room.token}:${room.match_no}:${round}`, rule.complexity);
  const line = detail.line;
  const pieces = line?.length === 4 ? splitPolygon(shape.poly, { x: line[0], y: line[1] }, { x: line[2], y: line[3] }) : null;
  return <svg viewBox="0 150 360 350" aria-label={rule.mode === 'draw' ? 'Player drawing' : 'Player cut'}>
    {rule.mode === 'draw' ? <polyline points={points.map(p => p.join(',')).join(' ')} fill="none" stroke="#4de3ff" strokeWidth="6" /> :
      (pieces ? [pieces.pos, pieces.neg] : [shape.poly]).map((poly, i) => <polygon key={i} points={poly.map(p => `${p.x},${p.y}`).join(' ')} fill={i ? '#ff5d8f' : '#4de3ff'} stroke="#050a14" strokeWidth="4" />)}
  </svg>;
}
export function PartyGallery({ room, round, final = false, compact = false }: { room: PartyRoom; round: number; final?: boolean; compact?: boolean }) {
  const [selectedRound, setRound] = useState(0);
  const [enlarged, setEnlarged] = useState<number | null>(null);
  const current = final ? selectedRound : round;
  const highest = Math.max(0, ...room.players.map(p => p.results.find(r => r.round === current)?.score ?? 0));
  const players = compact ? partyStandings(room.players, final ? (room.round_count ?? 6) - 1 : round) : room.players;
  return <section className={`party-gallery ${compact ? 'party-gallery-compact' : ''}`}>
    {!compact && <h3>{final ? "Everyone's attempts" : 'Round reveal'}</h3>}
    {final && <label>Round <select value={selectedRound} onChange={e => setRound(Number(e.target.value))}>{Array.from({ length: room.round_count ?? 6 }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>}
    <div className={compact ? 'party-attempt-list' : final ? 'party-gallery-grid' : 'party-gallery-strip'}>{players.map((p, i) => {
      const result = p.results.find(r => r.round === current);
      return <button className={`party-attempt ${result && result.score === highest ? 'winner' : ''} ${p.is_me ? 'is-me' : ''}`} key={p.name} title={p.name} aria-label={`View ${p.name}'s attempt, ${(result?.score ?? 0).toFixed(1)} points`} onClick={() => setEnlarged(i)}>
        <Preview room={room} round={current} detail={result?.detail} /><span className="party-attempt-info"><span>{compact && 'rank' in p ? `#${p.rank} ` : ''}{p.name}{p.is_me ? ' (you)' : ''}</span>{compact && 'total' in p && <b className="party-match-total">Total: {Number(p.total).toFixed(1)}</b>}<small className="party-round-score">Round {current + 1}: {(result?.score ?? 0).toFixed(1)}{result && result.score === highest ? ' / best' : ''}</small></span>
      </button>;
    })}</div>
    {enlarged !== null && <div className="modal" onClick={() => setEnlarged(null)}><div className="modal-box party-preview-large" role="dialog" aria-modal="true" aria-label="Attempt preview" onClick={e => e.stopPropagation()}><button className="btn btn-ghost" onClick={() => setEnlarged(null)}>Close</button><h3>{players[enlarged]?.name}</h3><Preview room={room} round={current} detail={players[enlarged]?.results.find(r => r.round === current)?.detail} /></div></div>}
  </section>;
}
