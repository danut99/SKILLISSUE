import { useEffect,useState } from 'react';
import { findPartyCode,listPublicParties,type PublicParty } from '../lib/party';
import { MODE_INFO } from '../config';
export function PartyDirectory(){
 const [code,setCode]=useState('');const [rooms,setRooms]=useState<PublicParty[]|null>(null);
 const [error,setError]=useState('');const [joinError,setJoinError]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{let alive=true;let pending=false;
  const refresh=async()=>{if(pending||document.hidden)return;pending=true;try{const rows=await listPublicParties();if(alive){setRooms(rows);setError('');}}catch(e){if(alive)setError(e instanceof Error?e.message:'Could not load rooms.');}finally{pending=false;}};
  void refresh();const timer=setInterval(()=>void refresh(),10000);window.addEventListener('focus',refresh);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[]);
 async function join(){setBusy(true);setJoinError('');try{const token=await findPartyCode(code);location.hash=`party/${token}`;}catch(e){setJoinError(e instanceof Error?e.message:'Could not find room.');}finally{setBusy(false);}}
 return <section className="party-directory">
  <form className="me-box" onSubmit={e=>{e.preventDefault();void join();}}><h2>Join by code</h2><label htmlFor="party-code">8-character room code</label><div className="party-code-form"><input id="party-code" value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,8))} autoComplete="off" autoCapitalize="characters" placeholder="A1B2C3D4" maxLength={8} required /><button className="btn btn-primary" disabled={busy||code.length!==8}>{busy?'Finding...':'Find room'}</button></div>{joinError&&<p role="alert">{joinError}</p>}<p className="me-fine">Open the room, choose your nickname, then join.</p></form>
  <div className="me-box"><h2>Active rooms</h2><p className="me-fine">Public lobbies waiting for players. Refreshes every 10 seconds.</p>
   {error?<p role="status">{error}</p>:rooms===null?<p>Loading rooms...</p>:rooms.length===0?<p>No public rooms waiting right now. Create a party ? new rooms are public unless you enable Private room.</p>:<ul className="public-party-list">{rooms.map(room=><li key={room.token}><div><b>{room.host}'s party</b><small>{room.selected_games.map(m=>MODE_INFO[m].name).join(' + ')} ? {room.round_count} rounds</small><code>{room.code}</code></div><span>{room.players}/8</span><a className="btn btn-ghost btn-sm" href={`#party/${room.token}`}>View room ?</a></li>)}</ul>}
  </div>
 </section>;
}
