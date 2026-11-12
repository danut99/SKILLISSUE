import { useState } from 'react';
import { dailyShape } from '../games/cutGame';
import { splitPolygon } from '../lib/geometry';
import { partyRound, type PartyRoom } from '../lib/party';
import type { Detail } from '../lib/store';

function Preview({ room, round, detail }: { room: PartyRoom; round: number; detail?: Detail | null }) {
  const rule = partyRound(round);
  if (!detail) return <span className="party-no-preview">No attempt</span>;
  if (detail.timedOut) return <span className="party-no-preview">Time up</span>;
  const points = (detail.stroke ?? []).slice(0, 501).filter(p => p.length === 2 && p.every(Number.isFinite));
  const shape = dailyShape(`party:${room.token}:${room.match_no}:${round}`, rule.complexity);
  const line = detail.line;
  const pieces = line?.length === 4 ? splitPolygon(shape.poly, { x: line[0], y: line[1] }, { x: line[2], y: line[3] }) : null;
  return <svg viewBox="0 150 360 350" aria-label={rule.mode === 'draw' ? 'Player drawing' : 'Player cut'}>
    {rule.mode === 'draw' ? <polyline points={points.map(p => p.join(',')).join(' ')} fill="none" stroke="#4de3ff" strokeWidth="6" /> :
      (pieces ? [pieces.pos, pieces.neg] : [shape.poly]).map((poly, i) => <polygon key={i} points={poly.map(p => `${p.x},${p.y}`).join(' ')} fill={i ? '#ff5d8f' : '#4de3ff'} stroke="#050a14" strokeWidth="4" />)}
  </svg>;
}
export function PartyGallery({ room, round, final = false }: { room: PartyRoom; round: number; final?: boolean }) {
  const [selectedRound, setRound] = useState(0);
  const [enlarged, setEnlarged] = useState<number | null>(null);
  const current = final ? selectedRound : round;
  const highest = Math.max(0, ...room.players.map(p => p.results.find(r => r.round === current)?.score ?? 0));
  return <section className="party-gallery"><h3>{final ? 'Everyone?s attempts' : 'Round reveal'}</h3>
    {final && <label>Round <select value={selectedRound} onChange={e => setRound(Number(e.target.value))}>{Array.from({ length: room.round_count ?? 6 }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>}
    <div className={final ? 'party-gallery-grid' : 'party-gallery-strip'}>{room.players.map((p, i) => {
      const result = p.results.find(r => r.round === current);
      return <button className={`party-attempt ${result?.score === highest ? 'winner' : ''}`} key={i} onClick={() => setEnlarged(i)}>
        <Preview room={room} round={current} detail={result?.detail} /><span>{p.name}{p.is_me ? ' (you)' : ''}</span><b>{result?.score ?? 0} pts{result?.score === highest ? ' ?' : ''}</b>
      </button>;
    })}</div>
    {enlarged !== null && <div className="modal" onClick={() => setEnlarged(null)}><div className="modal-box party-preview-large" role="dialog" aria-modal="true" aria-label="Attempt preview" onClick={e => e.stopPropagation()}><button className="btn btn-ghost" onClick={() => setEnlarged(null)}>Close</button><h3>{room.players[enlarged]?.name}</h3><Preview room={room} round={current} detail={room.players[enlarged]?.results.find(r => r.round === current)?.detail} /></div></div>}
  </section>;
}
