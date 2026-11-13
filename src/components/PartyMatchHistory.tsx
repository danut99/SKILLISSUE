import { useEffect, useState } from 'react';
import { getPartyMatch, partyStandings, partyRound, type PartyMatch } from '../lib/party';

export function PartyMatchHistory({ token, currentMatch }: { token: string; currentMatch: number }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(currentMatch - 1);
  const [result, setResult] = useState<{ match: number; data?: PartyMatch; error?: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    getPartyMatch(token, selected)
      .then(data => { if (active) setResult({ match: selected, data }); })
      .catch(cause => {
        if (active) setResult({ match: selected, error: cause instanceof Error ? cause.message : 'Could not load this match.' });
      });
    return () => { active = false; };
  }, [token, selected, open]);

  const current = result?.match === selected ? result : null;
  const roundCount = current?.data?.round_count ?? 6;
  const rounds = Array.from({ length: roundCount }, (_, index) => partyRound(index, current?.data?.game_version ?? 1, current?.data?.selected_games));
  const standings = partyStandings(current?.data?.players ?? [], roundCount - 1);
  return <section className="me-box party-history">
    <button className="btn btn-ghost" aria-expanded={open} aria-controls="party-history-results" onClick={() => setOpen(value => !value)}>
      {open ? 'Hide previous matches' : 'Previous match results'}
    </button>
    {open && <div id="party-history-results">
      <label className="party-history-select">View results
        <select value={selected} onChange={event => setSelected(Number(event.target.value))}>
          {Array.from({ length: currentMatch - 1 }, (_, index) => <option key={index + 1} value={index + 1}>Match {index + 1}</option>)}
        </select>
      </label>
      {current?.error ? <p role="alert">{current.error}</p> : !current?.data ? <p role="status">Loading results...</p> : <>
        <h2>Match {selected} results</h2>
        {standings.length === 0 ? <p>No recorded scores for this match.</p> : <div className="party-history-table">
          <table>
            <caption>Final scores out of {roundCount * 100}. Missing rounds count as zero.</caption>
            <thead><tr><th scope="col">Player</th>{rounds.map((round, index) => <th scope="col" key={index} title={round.mode}>R{index + 1}</th>)}<th scope="col">Total</th></tr></thead>
            <tbody>{standings.map(player => <tr key={player.order} className={player.is_me ? 'is-me' : ''}>
              <th scope="row">#{player.rank} {player.name}{player.is_me ? ' (you)' : ''}</th>
              {rounds.map((_, index) => <td key={index}>{(player.results.find(round => round.round === index)?.score ?? 0).toFixed(1)}</td>)}
              <td>{player.total.toFixed(1)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        {!current.data.roster_complete && <p className="me-fine">This older match only includes players with recorded scores.</p>}
      </>}
    </div>}
  </section>;
}
