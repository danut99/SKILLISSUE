import { useEffect,useState } from 'react';
import { getSupabase } from '../lib/supabase';
import { useUi } from '../lib/ui';
import { useAuth } from '../lib/auth';
type Counts=Partial<Record<'draw'|'cut'|'brake'|'balance'|'count',number>>;
export function useGamePlayerCounts(){
 const [counts,setCounts]=useState<Counts>({});
 const version=useUi(s=>s.boardVersion);const status=useAuth(s=>s.status);
 useEffect(()=>{let alive=true;let pending=false;
  async function load(){if(pending||document.hidden)return;pending=true;
   try{const sb=await getSupabase();if(!sb)return;const {data,error}=await sb.rpc('get_game_player_counts');if(!error&&data&&alive)setCounts(data as Counts);}catch{/* Hide counts when unavailable. */}finally{pending=false;}
  }
  void load();const timer=setInterval(()=>void load(),60000);window.addEventListener('focus',load);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',load);};
 },[version,status]);
 return counts;
}
export function GamePlayerCount({count}:{count?:number}){
 const total=Number(count);if(!Number.isSafeInteger(total)||total<=0)return null;
 return <span className="game-player-count" title="Unique players who have completed this game, all time">{total.toLocaleString()} {total===1?'player':'players'}</span>;
}
