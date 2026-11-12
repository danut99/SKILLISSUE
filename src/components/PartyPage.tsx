import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { copyText } from '../lib/scoring';
import { PARTY_ROUNDS, createPartyRoom, getPartyRoom, joinPartyRoom, partyPhase, partyStandings, partyUrl, readPartyToken, readyPartyRoom, rematchPartyRoom, startPartyRoom, type PartyRoom } from '../lib/party';
import { toast } from '../lib/ui';
import { PixelIcon } from './PixelIcon';
import { PartyRound } from './PartyRound';

export function PartyPage() {
  const { status, userId } = useAuth();
  const [token, setToken] = useState(() => readPartyToken(location.hash));
  const [state, setState] = useState<{ token: string; userId: string | null; room: PartyRoom; offset: number } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const online = status === 'anon' || status === 'linked';
  useEffect(() => {
    const update = () => { setToken(readPartyToken(location.hash)); setError(''); };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const updateRoom = useCallback((room: PartyRoom, requestStart = Date.now()) => {
    const offset = Date.parse(room.server_now) - (requestStart + Date.now()) / 2;
    setState(previous => previous?.token === room.token && previous.userId === userId && Date.parse(previous.room.server_now) > Date.parse(room.server_now)
      ? previous : { token: room.token, userId, room, offset });
    setError('');
  }, [userId]);
  useEffect(() => {
    if (!token || !online) return;
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (!active || pending || document.hidden) return;
      pending = true;
      const before = Date.now();
      try { const room = await getPartyRoom(token); if (active) updateRoom(room, before); }
      catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Could not load room.'); }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [token, online, updateRoom]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 100); return () => clearInterval(timer); }, []);
  const refresh = useCallback(() => {
    if (!token) return;
    const before = Date.now();
    void getPartyRoom(token).then(room => updateRoom(room, before)).catch(() => {});
  }, [token, updateRoom]);
  async function run(action: () => Promise<PartyRoom>) {
    if (busy) return;
    setBusy(true);
    const before = Date.now();
    try { const room = await action(); updateRoom(room, before); if (room.token !== token) { location.hash = `party/${room.token}`; setToken(room.token); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update party.'); }
    finally { setBusy(false); }
  }
  const room = state?.token === token && state.userId === userId ? state.room : null;
  const now = clock + (state?.offset ?? 0);
  const phase = partyPhase(room?.started_at ?? null, now);
  const me = room?.players.find(p => p.is_me);
  const ready = !!room && room.players.length >= 2 && room.players.every(p => p.ready);
  const rule = PARTY_ROUNDS[phase.round];
  const standings = partyStandings(room?.players ?? [], phase.kind === 'playing' ? phase.round - 1 : phase.kind === 'finished' ? 5 : phase.kind === 'reveal' ? phase.round : -1);
  const winners = standings.filter(p => p.rank === 1);
  return <section className="screen party-page">
    <header className="me-hero"><h1>Party Mode</h1><p className="me-sub">Draw. Cut. Six rounds. 16 seconds each. Wilder shapes.</p></header>
    {error && <div className="party-error" role="alert">{error}</div>}
    {!online ? <div className="me-box">{status === 'connecting' ? 'Connecting...' : 'Connect online to play with friends.'}</div> : !token ? <>
      <div className="me-box party-intro"><PixelIcon name="battle" size={64} /><h2>Bring 2-8 players.</h2><p>Share a room link, get ready, then race the same six challenges together.</p><p>One attempt each round. Your total out of 600 decides the winner. Daily tries stay untouched.</p><button className="btn btn-primary" disabled={busy} onClick={() => void run(createPartyRoom)}>{busy ? 'Creating...' : 'Create party'}</button></div>
      <ol className="party-round-plan">{PARTY_ROUNDS.map((r, index) => <li key={index}><PixelIcon name={r.mode} size={28} /><span>Round {index + 1}<small>{r.level}</small></span><b>{r.seconds}s</b></li>)}</ol>
    </> : !room ? <div className="me-box"><p>{error ? 'Check your connection or create a new party.' : 'Loading party...'}</p><a href="#party">New party</a></div> : <>
      <div className="party-room-bar"><span>Room {room.token.slice(0, 6).toUpperCase()} <small>Match {room.match_no}</small></span><button className="btn btn-ghost btn-sm" onClick={() => void copyText(partyUrl(room.token)).then(ok => toast(ok ? 'Room link copied. Send it to your friends!' : 'Could not copy link.'))}>Copy invite</button></div>
      {!room.joined ? <div className="me-box"><h2>You've been invited!</h2><p>{room.players.length}/8 players in this room.</p><button className="btn btn-primary" disabled={busy || room.started_at !== null || room.players.length >= 8} onClick={() => void run(() => joinPartyRoom(room.token))}>{room.started_at ? 'Match in progress' : 'Join party'}</button>{room.started_at && <p>Wait here for the host to start a rematch lobby.</p>}</div> : null}
      {phase.kind === 'lobby' ? <div className="me-box party-lobby"><h2>Get the squad ready</h2><ul className="party-players">{room.players.map((player, index) => <li key={index}><span>{player.name}{player.is_me ? ' (you)' : ''}{player.is_host ? ' - host' : ''}</span><b className={player.ready ? 'ready' : ''}>{player.ready ? 'Ready' : 'Waiting'}</b></li>)}</ul>
        {room.joined && <div className="r-actions"><button className="btn btn-primary" disabled={busy} onClick={() => void run(() => readyPartyRoom(room.token, !me?.ready))}>{me?.ready ? 'Not ready' : "I'm ready"}</button>{room.is_host && <button className="btn btn-pink" disabled={busy || !ready} onClick={() => void run(() => startPartyRoom(room.token))}>Start 6 rounds</button>}</div>}
        <p className="me-fine">{room.players.length < 2 ? 'Invite at least one friend to start.' : !ready ? 'Everyone must be ready before the host starts.' : 'All ready. Host can start!'} The clock starts together, not on your first touch. Reloading an active round forfeits that attempt.</p>
      </div> : phase.kind === 'countdown' ? <div className="me-box party-countdown"><p>Round 1 - Draw a circle</p><strong>{Math.max(1, Math.ceil(phase.secondsLeft))}</strong><p>Get ready. Everyone starts together.</p></div> : <div className="party-match-layout">
        <div>
          <div className="party-round-heading"><PixelIcon name={rule.mode} size={36} /><span>Round {phase.round + 1}/6 - {rule.mode === 'draw' ? `Draw a ${rule.shape}` : 'Cut 50/50'}<small>{rule.level} - {rule.seconds}s</small></span></div>
          {phase.kind === 'finished' ? <div className="me-box party-podium"><PixelIcon name="trophy" size={72} /><h2>{winners.length > 1 ? 'Shared glory!' : `${winners[0]?.name ?? 'Nobody'} wins!`}</h2><p>{winners.map(p => p.name).join(' & ')} - {standings[0]?.total.toFixed(1) ?? 0}/600</p><p className="me-fine">Play six new rounds with the same players and invite link. Everyone readies up again.</p>{room.is_host ? <button className="btn btn-primary party-restart" disabled={busy} onClick={() => void run(() => rematchPartyRoom(room.token))}>{busy ? 'Restarting...' : 'Restart game'} <span aria-hidden="true">&#8635;</span></button> : <p>Waiting for the host to restart the game.</p>}</div> : <>
            {room.joined && userId && <PartyRound key={`${token}:${room.match_no}:${phase.round}:${userId}`} token={room.token} match={room.match_no} round={phase.round} userId={userId} end={phase.end} offset={state?.offset ?? 0} receivedScore={me?.results.find(r => r.round === phase.round)?.score} onRefresh={refresh} reveal={phase.kind === 'reveal'} secondsLeft={phase.secondsLeft} finishedPlayers={room.players.filter(p => p.results.some(r => r.round === phase.round)).length} totalPlayers={room.players.length} />}
            {phase.kind === 'reveal' && <div className="party-reveal" role="status">Round over! {phase.round === 5 ? 'Final podium' : 'Next round'} in {Math.ceil(phase.secondsLeft)}s</div>}
          </>}
        </div>
        <aside className="card party-scoreboard"><h3>{phase.kind === 'finished' ? 'Final standings' : 'Party standings'}</h3><ol>{standings.map(player => <li className={player.is_me ? 'is-me' : ''} key={player.order}><span>#{player.rank} {player.name}{player.is_me ? ' (you)' : ''}<small>{phase.kind === 'playing' ? player.results.some(r => r.round === phase.round) ? 'Finished this round' : 'Playing...' : phase.kind === 'reveal' && !player.results.some(r => r.round === phase.round) ? 'No result received - 0 pts' : ''}</small></span><b>{player.total.toFixed(1)}</b></li>)}</ol><p className="me-fine">Six scores added together. Missed rounds score 0. Ties share a place.</p></aside>
      </div>}
      <p className="me-fine"><a href="#party">Leave room</a> - Your invite link works for 24 hours.</p>
    </>}
  </section>;
}
