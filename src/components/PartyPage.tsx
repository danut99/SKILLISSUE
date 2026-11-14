import { DailyGamesPrompt } from './DailyGamesPrompt';
import { PartyDirectory } from './PartyDirectory';
import { setPartyPublic } from '../lib/party';
import { MODES, type Mode } from '../config';
import { PartyGallery } from './PartyGallery';
import { sharePartyInvite, sharePartyPodium } from '../lib/partyShare';
import { claimNickname } from '../lib/leaderboard';
import { usePlayer, cleanNickname } from '../lib/store';
import { leavePartyRoom } from '../lib/party';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { copyText } from '../lib/scoring';
import { partyRoundCounts, partyRound, partyRoundLabel, partyModes, setPartyGames, setPartyRoundCount, createPartyRoom, getPartyRoom, joinPartyRoom, partyPhase, partyStandings, partyUrl, readPartyToken, readyPartyRoom, rematchPartyRoom, startPartyRoom, type PartyRoom } from '../lib/party';
import { toast } from '../lib/ui';
import { PixelIcon } from './PixelIcon';
import { PartyRound } from './PartyRound';
import { PartyMatchHistory } from './PartyMatchHistory';

const GAME_LABELS = { draw: 'Draw', cut: 'Cut', brake: 'Brake' };
function PartyGamePicker({ games, disabled, onChange }: { games: readonly Mode[]; disabled: boolean; onChange: (games: Mode[]) => void }) {
  return <fieldset className="party-game-picker" disabled={disabled}><legend>Games</legend>
    <div>{MODES.map(mode => <button type="button" className={`btn btn-ghost btn-sm ${games.includes(mode) ? 'selected' : ''}`} key={mode} aria-pressed={games.includes(mode)} disabled={games.length === 1 && games.includes(mode)}
      onClick={() => onChange(partyModes(games.includes(mode) ? games.filter(game => game !== mode) : [...games, mode]))}><PixelIcon name={mode} size={24} />{GAME_LABELS[mode]}</button>)}</div>
    <small>{games.length === 3 ? 'Mix: all three games.' : games.map(mode => GAME_LABELS[mode]).join(' + ')} Pick one, two, or all three.</small>
  </fieldset>;
}
export function PartyPage() {
  const { status, userId } = useAuth();
  const [token, setToken] = useState(() => readPartyToken(location.hash));
  const [state, setState] = useState<{ token: string; userId: string | null; room: PartyRoom; offset: number } | null>(null);
  const [nickname, setNickname] = useState(usePlayer.getState().nickname);
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
    try { const room = await action(); updateRoom(room, before); if(room.reused_room) toast('Reopened your empty lobby. Rooms with other players or match history stay separate.'); if (room.token !== token) { location.hash = `party/${room.token}`; setToken(room.token); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update party.'); }
    finally { setBusy(false); }
  }
  async function joinNamed(room: PartyRoom) {
    const name = cleanNickname(nickname);
    if (!name) throw new Error('Choose a nickname first.');
    const result = await claimNickname('', name);
    if (!result.ok) throw new Error(result.reason === 'taken' ? 'Nickname taken. Pick another.' : 'Could not save nickname.');
    usePlayer.getState().setNickname(result.nickname);
    return joinPartyRoom(room.token);
  }
  async function removePlayer(room: PartyRoom, player?: string) {
    setBusy(true);
    try { await leavePartyRoom(room.token, player); if (!player) { location.hash = 'party'; setToken(null); } else refresh(); }
    catch(cause) { setError(cause instanceof Error ? cause.message : 'Could not leave room.'); }
    finally { setBusy(false); }
  }
  const room = state?.token === token && state.userId === userId ? state.room : null;
  const now = clock + (state?.offset ?? 0);
  const roundCount = room?.round_count ?? 6;
  const phase = partyPhase(room?.started_at ?? null, now, roundCount);
  const me = room?.players.find(p => p.is_me);
  const ready = !!room && room.players.length >= 2 && room.players.every(p => p.ready);
  const gameVersion = room?.game_version ?? 1;
  const selectedGames = partyModes(room?.selected_games);
  const allowedRounds = partyRoundCounts(selectedGames);
  const maxRounds = allowedRounds[allowedRounds.length - 1];
  const invalidRoundCount = !!room && !room.started_at && roundCount > maxRounds;
  const rule = partyRound(phase.round, gameVersion, selectedGames);
  const standings = partyStandings(room?.players ?? [], phase.kind === 'playing' ? phase.round - 1 : phase.kind === 'finished' ? roundCount - 1 : phase.kind === 'reveal' ? phase.round : -1);
  const winners = standings.filter(p => p.rank === 1);
  return <section className="screen party-page">
    <header className="me-hero"><h1>Party Mode</h1><p className="me-sub">Pick your games and match length. 16 seconds each round.</p></header>
    {error && <div className="party-error" role="alert">{error}</div>}
    {!online ? <div className="me-box">{status === 'connecting' ? 'Connecting...' : 'Connect online to play with friends.'}</div> : !token ? <>
      <PartyDirectory createCard={<div className="me-box party-entry-card party-create-card">
        <div className="party-entry-eyebrow">YOUR ROOM. YOUR RULES.</div>
        <div className="party-create-heading"><h2>Start the party</h2><div aria-hidden="true" className="party-entry-icons"><PixelIcon name="draw" size={30} /><PixelIcon name="cut" size={30} /><PixelIcon name="brake" size={30} /></div></div>
        <p className="party-entry-description">Bring your friends. Find out who's the skill issue.</p>
        <div className="party-entry-badges"><span>2&ndash;8 players</span><span>16s rounds</span><span>Pick your games</span></div>
        <button className="btn btn-primary party-create-button" disabled={busy} onClick={() => void run(() => createPartyRoom())}>{busy ? 'Creating...' : 'Create party'} <span aria-hidden="true">&#8594;</span></button>
        <p className="me-fine">Public by default. Make it private in the lobby.<br />An unused solo lobby is reused. Played rooms stay separate.</p>
      </div>} />
    </> : !room ? <div className="me-box"><p>{error ? 'Check your connection or create a new party.' : 'Loading party...'}</p><a href="#party">New party</a></div> : <>
      <div className="party-room-bar"><span>Room {room.code ?? room.token.slice(0, 6).toUpperCase()} <small>Match {room.match_no}</small></span><button className="btn btn-ghost btn-sm" onClick={() => void copyText(partyUrl(room.token)).then(ok => toast(ok ? 'Room link copied. Send it to your friends!' : 'Could not copy link.'))}>Copy invite</button><button className="btn btn-primary btn-sm" onClick={() => void sharePartyInvite(room).catch(() => toast('Could not share invite.'))}>Share invite</button></div>
      {room.code && <div className="party-code-display"><span>Room code <b>{room.code}</b></span><button className="btn btn-ghost btn-sm" onClick={()=>void copyText(room.code!).then(ok=>toast(ok?'Room code copied.':'Could not copy code.'))}>Copy code</button></div>}
      {room.is_host && phase.kind==='lobby' && <label className="party-public-switch"><input type="checkbox" checked={!(room.is_public??true)} disabled={busy} onChange={e=>void run(()=>setPartyPublic(room.token,!e.target.checked))} /> Private room <small>{room.is_public?'Anyone can find this lobby and join.':'Private: only people with your code or invite link can find this room.'}</small></label>}
      {!room.joined ? <div className="me-box"><h2>You've been invited!</h2><label>Your nickname <input maxLength={15} value={nickname} onChange={e => setNickname(e.target.value)} autoComplete="nickname" /></label><p>{room.players.length}/8 players in this room.</p><button className="btn btn-primary" disabled={busy || room.started_at !== null || room.players.length >= 8} onClick={() => void run(() => joinNamed(room))}>{room.started_at ? 'Match in progress' : 'Join party'}</button>{room.started_at && <p>Wait here for the host to start a rematch lobby.</p>}</div> : null}
      {phase.kind === 'lobby' ? <div className="me-box party-lobby"><h2>Get the squad ready</h2><ul className="party-players">{room.players.map((player, index) => <li key={index}><span>{player.name}{player.is_me ? ' (you)' : ''}{player.is_host ? ' - host' : ''}</span><b className={player.ready ? 'ready' : ''}>{player.ready ? 'Ready' : 'Waiting'}</b>{room.is_host && !player.is_me && player.player_id && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void removePlayer(room, player.player_id)}>Remove</button>}</li>)}</ul>
        {room.is_host ? <PartyGamePicker games={selectedGames} disabled={busy} onChange={games => void run(() => setPartyGames(room.token, games))} /> : <p className="party-games-summary">Games: {selectedGames.map(mode => GAME_LABELS[mode]).join(' + ')}</p>}
        <div className="party-round-settings">
          {room.is_host ? <label htmlFor="party-round-count">Rounds
            <select id="party-round-count" aria-label="Rounds" value={roundCount} disabled={busy} onChange={event => void run(() => setPartyRoundCount(room.token, Number(event.target.value)))}>
              {invalidRoundCount && <option value={roundCount} disabled>{roundCount} rounds — choose up to {maxRounds}</option>}
              {allowedRounds.map(count => <option key={count} value={count}>{count} rounds</option>)}
            </select>
          </label> : <span>{roundCount} rounds selected by the host</span>}
          <small>Up to {roundCount * 100} points. Changing games or rounds resets everyone's Ready status.</small>
          {selectedGames.includes('brake') && <small>Up to {maxRounds} rounds with these games. Each car objective appears once.</small>}
          {invalidRoundCount && <p role="alert">The host needs to select {maxRounds} rounds or fewer.</p>}
        </div>
        {room.joined && <div className="r-actions"><button className="btn btn-primary" disabled={busy || invalidRoundCount} onClick={() => void run(() => readyPartyRoom(room.token, !me?.ready))}>{me?.ready ? 'Not ready' : "I'm ready"}</button>{room.is_host && <button className="btn btn-pink" disabled={busy || !ready || invalidRoundCount} onClick={() => void run(() => startPartyRoom(room.token))}>Start {roundCount} rounds</button>}</div>}
        <p className="me-fine">{room.players.length < 2 ? 'Invite at least one friend to start.' : !ready ? 'Everyone must be ready before the host starts.' : 'All ready. Host can start!'} The clock starts together, not on your first touch. Reloading an active round forfeits that attempt.</p>
      </div> : phase.kind === 'countdown' ? <div className="me-box party-countdown"><p>Round 1 - {partyRoundLabel(0, gameVersion, selectedGames)}</p><strong>{Math.max(1, Math.ceil(phase.secondsLeft))}</strong><p>Get ready. Everyone starts together.</p></div> : <div className={`party-match-layout party-phase-${phase.kind}`}>
        {phase.kind !== 'finished' && <div className="party-round-heading"><PixelIcon name={rule.mode} size={36} /><span>Round {phase.round + 1}/{roundCount} - {partyRoundLabel(phase.round, gameVersion, selectedGames)}<small>{rule.level} - {rule.seconds}s</small></span></div>}
        <div>
          {phase.kind === 'finished' ? <div className="me-box party-podium"><PixelIcon name="trophy" size={72} /><h2>{winners.length > 1 ? 'Shared glory!' : `${winners[0]?.name ?? 'Nobody'} wins!`}</h2><p>{winners.map(p => p.name).join(' & ')} - {standings[0]?.total.toFixed(1) ?? 0}/{roundCount * 100}</p><p className="me-fine">Play another match with the same players and invite link. Everyone readies up again.</p>{room.is_host ? <button className="btn btn-primary party-restart" disabled={busy} onClick={() => void run(() => rematchPartyRoom(room.token))}>{busy ? 'Restarting...' : 'Play again'} <span aria-hidden="true">&#8635;</span></button> : <p>Waiting for the host to restart the game.</p>}<button className="btn btn-ghost party-restart" onClick={() => void sharePartyPodium(room).catch(() => toast('Could not share results.'))}>Share podium</button><DailyGamesPrompt /></div> : <>
            {room.joined && userId && <PartyRound key={`${token}:${room.match_no}:${phase.round}:${userId}`} token={room.token} match={room.match_no} round={phase.round} roundCount={roundCount} gameVersion={gameVersion} selectedGames={selectedGames} userId={userId} end={phase.end} offset={state?.offset ?? 0} receivedScore={me?.results.find(r => r.round === phase.round)?.score} onRefresh={refresh} reveal={phase.kind === 'reveal'} secondsLeft={phase.secondsLeft} finishedPlayers={room.players.filter(p => p.results.some(r => r.round === phase.round)).length} totalPlayers={room.players.length} />}
            {phase.kind === 'reveal' && phase.round + 1 < roundCount && <p className="party-next-preview">Next: {partyRoundLabel(phase.round + 1, gameVersion, selectedGames)} / 16s</p>}
            {phase.kind === 'reveal' && <div className="party-reveal" role="status">Round over! {phase.round === roundCount - 1 ? 'Final podium' : 'Next round'} in {Math.ceil(phase.secondsLeft)}s</div>}
          </>}
        </div>
        <aside className="card party-scoreboard"><h3>{phase.kind === 'finished' ? 'Final standings' : 'Party standings'}</h3>{phase.kind !== 'reveal' ? <ol>{standings.map(player => <li className={player.is_me ? 'is-me' : ''} key={player.order}><span>#{player.rank} {player.name}{player.is_me ? ' (you)' : ''}{phase.kind === 'playing' && <small>{player.results.some(r => r.round === phase.round) ? 'Finished this round' : 'Playing...'}</small>}</span><b className="party-match-total">Total: {player.total.toFixed(1)}</b></li>)}</ol> : <><p className="party-results-hint">{phase.kind === 'reveal' ? `Round ${phase.round + 1} results / Next in ${Math.ceil(phase.secondsLeft)}s` : 'Explore each round. Tap an attempt to enlarge.'}</p><PartyGallery room={room} round={phase.round} compact /></>}<p className="me-fine">{roundCount} scores added together. Missed rounds score 0. Ties share a place.</p></aside>
      </div>}
      {phase.kind === 'finished' && <PartyGallery key={`${room.token}:${room.match_no}`} room={room} round={0} final />}
      {room.joined && room.match_no > 1 && <PartyMatchHistory key={`${room.token}:${userId}:${room.match_no}`} token={room.token} currentMatch={room.match_no} />}
      <p className="me-fine">{room.joined && (phase.kind === 'lobby' || phase.kind === 'finished') ? <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void removePlayer(room)}>Leave party</button> : <a href="#party">Back to Party</a>} - Your invite link works for 24 hours.</p>
    </>}
  </section>;
}
