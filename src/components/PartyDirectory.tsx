import { useEffect,useState } from 'react';
import { findPartyCode,listPublicParties,type PublicParty } from '../lib/party';
import type { ReactNode } from 'react';
import { PixelIcon } from './PixelIcon';
import { MODE_INFO } from '../config';
export function PartyDirectory({ createCard }: { createCard: ReactNode }){
 const [code,setCode]=useState('');const [rooms,setRooms]=useState<PublicParty[]|null>(null);
 const [visibleActive,setVisibleActive]=useState(3);const [visibleEnded,setVisibleEnded]=useState(3);
 const [error,setError]=useState('');const [joinError,setJoinError]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;let pending=false;
  const refresh=async()=>{if(pending||document.hidden)return;pending=true;try{const rows=await listPublicParties();if(alive){setRooms(rows.filter(room=>(room.games_played??0)>0));setError('');}}catch(e){if(alive)setError(e instanceof Error?e.message:'Could not load rooms.');}finally{pending=false;}};
  void refresh();const timer=setInterval(()=>void refresh(),10000);window.addEventListener('focus',refresh);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[]);
 async function join(){setBusy(true);setJoinError('');try{const token=await findPartyCode(code);location.hash=`party/${token}`;}catch(e){setJoinError(e instanceof Error?e.message:'Could not find room.');}finally{setBusy(false);}}
 const activeRooms=rooms?.filter(room=>!room.expired&&room.status!=='Finished')??[];
 const endedRooms=rooms?.filter(room=>room.expired||room.status==='Finished')??[];
 function roomList(items:PublicParty[]){return <ul className="party-directory-cards">{items.map(room=><li className="party-directory-card" key={room.token}>
  <div className="party-card-top"><span className={`party-card-status ${room.expired||room.status==='Finished'?'ended':''}`}>{room.expired?'Ended':room.status??'Waiting'}</span>{room.is_mine&&<span className="me-fine">Your party</span>}</div>
  <h3>{room.host}'s party</h3>
  <p className="party-card-games">{room.selected_games.map(m=>MODE_INFO[m].name).join(' + ')} &middot; {room.round_count} rounds</p>
  <div className="party-card-winner"><PixelIcon name="trophy" size={32} /><div><small>{(room.winners?.length??0)>1?'Shared winners':'Latest winner'}{room.latest_match?` ? Game ${room.latest_match}`:''}</small><strong>{room.winners?.length?room.winners.join(' & '):'Results unavailable'}</strong>{room.winning_score!=null&&<span>{Number(room.winning_score).toFixed(1)}{room.latest_round_count?` / ${room.latest_round_count*100}`:''} points</span>}</div></div>
  <div className="party-card-stats"><span><b>{room.players}</b> / 8 players</span><span><b>{room.games_played}</b> {room.games_played===1?'game':'games'} played</span></div>
  <div className="party-card-footer">{room.expired?<span className="me-fine">Party ended</span>:<><code>{room.code}</code><a className="btn btn-ghost btn-sm" href={`#party/${room.token}`}>{room.status==='Waiting'&&room.players<8?'Join party':'View room'} &#8594;</a></>}</div>
 </li>)}</ul>;}
 return <section className="party-directory party-entry-grid">
  {createCard}
  <form className="me-box party-entry-card party-join-card" onSubmit={e=>{e.preventDefault();void join();}}><div className="party-entry-eyebrow">GOT AN INVITE?</div><h2>Join your friends</h2><p className="party-entry-description">Enter their room code. Let the rivalry begin.</p><label htmlFor="party-code">8-character room code</label><div className="party-code-form"><input id="party-code" value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,8))} autoComplete="off" autoCapitalize="characters" placeholder="A1B2C3D4" maxLength={8} required /><button className="btn btn-primary" disabled={busy||code.length!==8}>{busy?'Finding...':'Find room'}</button></div>{joinError&&<p role="alert">{joinError}</p>}<p className="me-fine">Open the room, choose your nickname, then join.</p></form>
  <div className="me-box party-public-rooms"><div className="party-directory-heading"><div><h2>Public parties</h2><p className="me-fine">The latest wins and rivalries, including ended parties.</p></div><span className="party-live-label"><span />LIVE</span></div>
   {rooms!==null&&!error&&<div className="party-directory-summary"><span><b>{activeRooms.length}</b> active parties</span><span><b>{activeRooms.reduce((sum,room)=>sum+room.players,0)}</b> player spots filled</span><span><b>{rooms.reduce((sum,room)=>sum+(room.games_played??0),0)}</b> games played</span></div>}
   {error?<p role="status">{error}</p>:rooms===null?<p>Loading parties...</p>:rooms.length===0?<div className="party-empty-rooms"><PixelIcon name="friends" size={40} /><b>Be the first to start the chaos.</b><p>No completed party games yet. Create a party and finish a game to appear here.</p></div>:<><section className="party-directory-group" aria-labelledby="active-parties-heading"><h3 id="active-parties-heading">Active parties ({activeRooms.length})</h3>{activeRooms.length?roomList(activeRooms.slice(0,visibleActive)):<p className="me-fine">No active parties with completed games.</p>}{activeRooms.length>visibleActive&&<button type="button" className="btn btn-ghost party-show-more" onClick={()=>setVisibleActive(count=>count+3)}>Show more ({activeRooms.length-visibleActive} remaining)</button>}</section><section className="party-directory-group" aria-labelledby="ended-parties-heading"><h3 id="ended-parties-heading">Ended parties ({endedRooms.length})</h3>{endedRooms.length?roomList(endedRooms.slice(0,visibleEnded)):<p className="me-fine">No ended parties yet.</p>}{endedRooms.length>visibleEnded&&<button type="button" className="btn btn-ghost party-show-more" onClick={()=>setVisibleEnded(count=>count+3)}>Show more ({endedRooms.length-visibleEnded} remaining)</button>}</section></>}

  </div>
 </section>;
}
