import { useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase';
import { addDays } from '../lib/daily';
import { PixelIcon, type PixelIconName } from './PixelIcon';

interface DailyRecord { nickname: string; score: number; date: string }
interface ChampionDay { date: string; winners: { rank: number; nickname: string; score: number }[] }
const crowns: PixelIconName[] = ['crown-gold', 'crown-silver', 'crown-bronze'];
const labelDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function RecentChampions({ date }: { date: string }) {
 const [selected,setSelected]=useState(1);
 const [retry,setRetry]=useState(0);
 const [result,setResult]=useState<{date:string;days:ChampionDay[]}|null>(null);
 const [record,setRecord]=useState<{date:string;value:DailyRecord|null}|null>(null);
 const [error,setError]=useState(false);
 useEffect(()=>{
  let alive=true;
  setError(false);
  async function load(){
   try {
    const sb=await getSupabase();
    if(!sb) throw new Error('offline');
    const [champions,recordResult]=await Promise.allSettled([sb.rpc('get_recent_champions'),sb.rpc('get_daily_record')]);
    if(alive&&recordResult.status==='fulfilled'&&!recordResult.value.error){setRecord({date,value:recordResult.value.data as DailyRecord|null});}
    if(champions.status==='rejected')throw new Error('unavailable');
    const {data,error}=champions.value;
    if(error||!Array.isArray(data)) throw new Error('unavailable');
    if(alive)setResult({date,days:data as ChampionDay[]});
   } catch {if(alive)setError(true);}
  }
  void load();
  return()=>{alive=false;};
 },[date,retry]);
 const days=result?.date===date?result.days:null;
 const dailyRecord=record?.date===date?record.value:null;
 const selectedDate=addDays(date,-selected);
 const winners=days?.find(day=>day.date===selectedDate)?.winners??[];
 return <section className="card px-box recent-champions" aria-labelledby="champions-heading">
  <div className="champions-heading"><h2 id="champions-heading"><PixelIcon name="trophy" size={22} />DAILY LEGENDS</h2><div className="champions-dates" role="group" aria-label="Previous days">{[1,2,3].map(offset=><button key={offset} type="button" aria-pressed={selected===offset} onClick={()=>setSelected(offset)}>{offset===1?'Yesterday':labelDate(addDays(date,-offset))}</button>)}</div></div>
  <div className="champions-columns">

  <div className="champions-daily">
  {error?<p role="status">Champions are unavailable. <button type="button" className="link-btn" onClick={()=>setRetry(n=>n+1)}>Try again</button></p>:!days?<p role="status">Loading champions...</p>:winners.length===0?<p className="me-fine">No scores for this day. Today's podium is waiting for you.</p>:<ol className="champions-podium" aria-label="Daily top three">{winners.map(winner=><li key={winner.rank} className={`champion-place-${winner.rank}`}><PixelIcon name={crowns[winner.rank-1]} size={24} /><span className="champion-name"><small className="champion-rank">#{winner.rank}</small><b>{winner.nickname}</b></span><strong>{Number(winner.score).toFixed(1)}<small>pts</small></strong></li>)}</ol>}

  </div>
  {dailyRecord&&<div className="champions-record"><PixelIcon name="crown-record" size={22} /><div className="champions-record-player"><small>DAILY RECORD</small><b className="champion-record-name">{dailyRecord.nickname}</b></div><div className="champions-record-result"><span>{labelDate(dailyRecord.date)}</span><strong>{Number(dailyRecord.score).toFixed(1)}<small>/300</small></strong></div></div>}
  </div>
 </section>;
}
