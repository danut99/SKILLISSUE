import { useEffect,useRef,useState } from 'react';
import { useAuth } from '../lib/auth';
import { getSupabase } from '../lib/supabase';
interface Poll { date:string;yes:number;no:number;my_choice:boolean|null }
export function ReturnPoll({date,compact=false}:{date:string;compact?:boolean}) {
 const user=useAuth(s=>s.userId);const status=useAuth(s=>s.status);
 const [state,setState]=useState<{owner:string|null;poll:Poll}|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const revision=useRef(0);const saving=useRef(false);
 const poll=state?.owner===user&&state.poll.date===date?state.poll:null;
 const online=status==='anon'||status==='linked';
 useEffect(()=>{
  let alive=true;let pending=false;setError('');
  if(!online)return;
  const refresh=async()=>{
   if(pending||saving.current||document.hidden)return;pending=true;const before=revision.current;
   try{const sb=await getSupabase();if(!sb)throw Error();const {data,error}=await sb.rpc('get_return_poll');if(error||!data)throw Error();if(alive&&before===revision.current){setState({owner:user,poll:data as Poll});setError('');}}
   catch{if(alive&&before===revision.current)setError('Votes are unavailable right now.');}finally{pending=false;}
  };
  void refresh();const timer=setInterval(()=>void refresh(),30000);window.addEventListener('focus',refresh);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[date,user,online]);
 async function vote(choice:boolean){
  if(saving.current||!online)return;saving.current=true;revision.current++;setBusy(true);setError('');
  try{const sb=await getSupabase();if(!sb)throw Error();const {data,error}=await sb.rpc('vote_return_poll',{p_choice:choice,p_date:date});if(error||!data)throw Error();if(useAuth.getState().userId===user)setState({owner:user,poll:data as Poll});}
  catch{if(useAuth.getState().userId===user)setError('Could not save your vote. Please try again.');}finally{saving.current=false;setBusy(false);}
 }
 const total=poll?Number(poll.yes)+Number(poll.no):0;
 return <section className={compact?"return-poll return-poll-compact":"card px-box return-poll"} aria-labelledby="return-poll-title">
  <div className="return-poll-heading"><div><h2 id="return-poll-title">{compact?"Back tomorrow?":"Back for tomorrow's challenge?"}</h2>{!compact&&<p>New tests. A fresh chance to prove it.</p>}</div><span className="return-poll-total">{poll?`${total.toLocaleString()} ${total===1?'vote':'votes'} today`:'Daily player poll'}</span></div>
  <div className="return-poll-options">{[true,false].map(choice=>{const count=poll?Number(choice?poll.yes:poll.no):null;const selected=poll?.my_choice===choice;return <button key={String(choice)} type="button" aria-pressed={selected} className={selected?'selected':''} disabled={!online||busy||!poll} onClick={()=>void vote(choice)}><span>{compact?(choice?'Yes':'No'):(choice?"Yes, I'll be back":'No, not tomorrow')}{selected&&!compact&&<small>YOUR VOTE</small>}</span><b>{count===null?'—':count.toLocaleString()}{!compact&&<small>{total&&count!==null?`${Math.round(count/total*100)}%`:'0%'}</small>}</b></button>;})}</div>
  <div className={compact&&!error?"return-poll-note visually-hidden":"return-poll-note"} aria-live="polite">{error?<span role="alert">{error}</span>:busy?'Saving your vote...':!online?'Connect online to vote. Guests can vote too.':!poll?'Loading votes...':poll.my_choice!==null?'Vote saved. You can change your answer.':"One vote per player today. Guests welcome."}</div>
 </section>;
}
