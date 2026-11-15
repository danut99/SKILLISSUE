import { useEffect,useState } from 'react';
import { useAuth } from './auth';
import { getSupabase } from './supabase';
import { ensureNickname } from './leaderboard';
import { useUi } from './ui';
export const DIVISIONS=['Bronze','Silver','Gold','Diamond','Elite'];
export interface LeagueRow { nickname:string;score:number;rank:number;is_me:boolean;days:{date:string;score:number;counted:boolean}[] }
export interface League { career?:{highest_division:number;weeks:number;wins:number};joined:boolean;week:string;ends_at:string;division?:number;rows?:LeagueRow[];previous?:{week:string;rank:number;score:number;division:number;next_division:number}|null }
export function leagueZone(rank:number,size:number,score:number){return size<10?'forming':rank<=5&&score>=600?'promotion':'safe';}
export async function fetchLeague(join=true):Promise<League>{
 const sb=await getSupabase();if(!sb)throw new Error('Connect online to enter leagues.');
 await ensureNickname();
 const {data,error}=await sb.rpc('get_my_league',{p_join:join});
 if(error)throw new Error(error.code==='PGRST202'?'Leagues are not available yet.':'Could not load your league. Please try again.');
 return data as League;
}
export function useLeague(date:string){
 const user=useAuth(s=>s.userId);const status=useAuth(s=>s.status);const version=useUi(s=>s.boardVersion);
 const [result,setResult]=useState<{key:string;data:League}|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const key=`${user}:${date}:${version}`;
 useEffect(()=>{let alive=true;let pending=false;setError('');
  if(status!=='anon'&&status!=='linked')return;
  const load=async()=>{if(pending||document.hidden)return;pending=true;try{const data=await fetchLeague();if(alive){setResult({key,data});setError('');}}catch(e){if(alive)setError(e instanceof Error?e.message:'Could not load league.');}finally{pending=false;}};
  void load();const timer=setInterval(()=>void load(),60000);window.addEventListener('focus',load);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',load);};
 },[key,status]);
 async function join(){if(busy)return;setBusy(true);try{const data=await fetchLeague(true);if(useAuth.getState().userId===user){setResult({key,data});setError('');}}catch(e){setError(e instanceof Error?e.message:'Could not enter league.');}finally{setBusy(false);}}
 return {league:result?.key===key?result.data:null,error,busy,join,online:status==='anon'||status==='linked'};
}
