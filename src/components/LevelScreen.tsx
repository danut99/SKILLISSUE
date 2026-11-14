import { ResponsiveSection } from './ResponsiveSection';
import { fmtCm, fmtResult } from '../lib/scoring';
import { useEffect, useRef, useState } from 'react';
import { MODE_INFO } from '../config';
import { useAuth } from '../lib/auth';
import { LEVEL_SHAPES, levelBrakePassCm, levelBrakeScoreScale, LEVEL_TRIES, levelCount, starsForScore, finishLevel, loadLevels, startLevel, useLevels, type LevelAttempt, type LevelMode } from '../lib/levels';
import { createDrawGame } from '../games/drawGame';
import { createCutGame } from '../games/cutGame';
import { createBrakeGame } from '../games/brakeGame';
import { createTimedGame } from '../games/timedGame';
import type { AttemptResult, Game, GameApi } from '../games/types';
import { GameCanvas } from './GameCanvas';
import { Countdown } from './Countdown';
import { addDays } from '../lib/daily';

export function LevelScreen({ mode, date }: { mode: LevelMode; date: string }) {
 const {userId,status}=useAuth();
 const levelState=useLevels();
 const rows=levelState.owner===userId?levelState.rows:[];
 const progress=rows.find(r=>r.mode===mode) ?? {mode,level:1,used:0};
 const [selected,setSelected]=useState<number|null>(null);
 const [loaded,setLoaded]=useState(false);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [attempt,setAttempt]=useState<LevelAttempt|null>(null);
 const [result,setResult]=useState<AttemptResult|null>(null);
 const [saved,setSaved]=useState(false);
 const [retrySave,setRetrySave]=useState(0);
 const resultRef=useRef<HTMLDivElement|null>(null);
 const canvasRef=useRef<HTMLCanvasElement|null>(null);
 const gameRef=useRef<Game|null>(null);

 useEffect(()=>{let active=true;loadLevels(userId).then(()=>{if(active){setLoaded(true);setError('');}}).catch((e:Error)=>{if(active)setError(e.message);});return()=>{active=false;};},[userId,status,date]);
 useEffect(()=>{
  if(!attempt)return;
  let active=true;
  const level=attempt.level;
  const api:GameApi={date:addDays('2026-11-12',level-1),finish:value=>{if(active)setResult(value);},startClip:()=>{},cancelClip:()=>{},toast:message=>setError(message)};
  const factory=(a:GameApi)=>mode==='draw'?createDrawGame(a,{shape:LEVEL_SHAPES[level-1]}):mode==='cut'?createCutGame({...a,date:`level:cut:${level}`},{complexity:level-1}):createBrakeGame(a,undefined,{speedMultiplier:.8+(level-1)*.15,scoreDistanceCm:levelBrakeScoreScale(level),passDistanceCm:levelBrakePassCm(level)});
  gameRef.current=createTimedGame(mode,factory,api);
  return()=>{active=false;gameRef.current?.destroy?.();gameRef.current=null;};
 },[attempt,mode]);
 useEffect(()=>{
  if(!attempt||!result)return;
  let active=true;
  setBusy(true);
  finishLevel(attempt.token,result.score).then(rows=>{if(active){useLevels.setState({rows,owner:userId});setSaved(true);setError('');}}).catch((e:Error)=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[attempt,result,userId,retrySave]);
 useEffect(()=>{
  if(!result||!matchMedia('(max-width:899px)').matches)return;
  const frame=requestAnimationFrame(()=>resultRef.current?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
  return()=>cancelAnimationFrame(frame);
 },[result]);
 async function begin(level: number){
  if(busy)return;
  setBusy(true);setError('');
  try{
    const next=await startLevel(mode,level);
    // Preserve the furthest unlocked level when replaying an earlier one.
    const records=[...(progress.records??[]).filter(r=>r.level!==next.level),{
      level:next.level,used:next.used,best_score:progress.records?.find(r=>r.level===next.level)?.best_score??0,
      stars:progress.records?.find(r=>r.level===next.level)?.stars??0,
    }];
    useLevels.setState({owner:userId,rows:[...rows.filter(r=>r.mode!==mode),{...progress,records,used:next.level===progress.level?next.used:progress.used}]});
    setSelected(next.level);setResult(null);setSaved(false);setAttempt(next);
  }
  catch(e){setError(e instanceof Error?e.message:'Could not start level.');}
  finally{setBusy(false);}
 }
 const totalLevels=levelCount(mode);
 const complete=progress.level>totalLevels;
 const picked=selected??Math.min(progress.level,totalLevels);
 const shownLevel=attempt?.level??picked;
 const passed=!!result&&result.score>=85;
 const canChoose=!attempt||!!result&&saved;
 const pickedRecord=progress.records?.find(r=>r.level===picked);
 const used=pickedRecord?.used??(picked===progress.level?progress.used:0);
 const bestStars=pickedRecord?.stars??0;
 const starText=(count:number)=>'\u2605'.repeat(count)+'\u2606'.repeat(3-count);
 function choose(level:number){if(!canChoose||busy)return;setAttempt(null);setResult(null);setSaved(false);setSelected(level);setError('');}
 return <section className="screen level-screen">
  <a href="#">Back to games</a><h1>{MODE_INFO[mode].title} <small>Level mode</small></h1>
  <ResponsiveSection title="Level rules"><p>Score <b>85+</b> to advance. {LEVEL_TRIES} tries per level each day. Passing unlocks the next level immediately.</p>
  <p className="level-star-guide">&#9733; 85+ &nbsp; &#9733;&#9733; 90+ &nbsp; &#9733;&#9733;&#9733; 95+ &middot; Replay cleared levels to improve your best stars.</p></ResponsiveSection>
  {error&&<p className="party-error" role="alert">{error}</p>}
  <div className="level-picker" role="group" aria-label="Choose a level">
    {Array.from({length:totalLevels},(_,i)=>{
      const level=i+1;const record=progress.records?.find(r=>r.level===level);const locked=level>progress.level;
      return <button key={level} className={picked===level?'selected':''} disabled={locked||!loaded||!canChoose||busy} aria-pressed={picked===level} aria-label={`Level ${level}, ${locked?'locked':`${record?.stars??0} stars`}`} onClick={()=>choose(level)}>
        <span>Level {level}</span><b aria-hidden="true">{locked?'Locked':starText(record?.stars??0)}</b>
      </button>;
    })}
  </div>
  <div className={`level-layout ${result?'has-result':''}`}>
   <div>{attempt&&<GameCanvas gameRef={gameRef} canvasRef={canvasRef} date={date} label={`LEVEL ${shownLevel} / ${totalLevels}`} />}</div>
   <div className="card px-box level-status" ref={resultRef}>
    <h2>Level {shownLevel} / {totalLevels}{shownLevel<progress.level?' - Cleared':''}</h2>
    <p>{mode==='draw'?`Draw a ${LEVEL_SHAPES[shownLevel-1]}`:mode==='cut'?`Cut complexity ${shownLevel} - equal areas`:`Driving difficulty ${shownLevel} - faster each level`}</p>
    {mode==='brake'&&<p>Pass goal: stop safely within <b>{fmtCm(levelBrakePassCm(shownLevel))}</b> of the target for 85/100. Stay inside the parking bay and avoid crossing the stop line or hitting the wall.</p>}
    {result?<>
      <div className="level-score">{result.score.toFixed(1)} / 100</div>
      {mode==='brake'&&<p className="level-distance">{fmtResult('brake',result)} &middot; 85/100 needed to pass</p>}
      <div className="level-earned-stars" aria-label={`${starsForScore(result.score)} stars this attempt`}>{starText(starsForScore(result.score))}</div>
      <p role="status">{!saved?(busy?'Saving your result...':'Result not saved yet. Retry below.'):passed?complete?'All levels cleared! Replay any level to improve your stars.':progress.level===shownLevel+1?'Level cleared! Next level unlocked.':'Replay saved. Your best stars stay.':'Below 85. Your previous stars and unlocked levels stay saved.'}</p>
      {!saved&&!busy&&<button className="btn btn-ghost" onClick={()=>setRetrySave(n=>n+1)}>Retry saving</button>}
    </>:<p>Ready when you are. Starting uses one try; leaving does not refund it.</p>}
    {loaded&&canChoose&&<>
      <p className="level-best-stars">Best: <span aria-label={`${bestStars} stars`}>{starText(bestStars)}</span>{pickedRecord?` ? ${pickedRecord.best_score.toFixed(1)}/100`:''}</p>
      {used<LEVEL_TRIES?<><p>{Math.max(0,LEVEL_TRIES-used)} tries left at level {picked}</p><button className="btn btn-primary" disabled={busy} onClick={()=>void begin(picked)}>{busy?'Starting...':picked<progress.level?'Replay level':attempt?'Retry level':'Start level'}</button></>:<p role="status">No tries left at level {picked}. Fresh tries in <Countdown /> (00:00 UTC). You can still play another unlocked level.</p>}
      {passed&&!complete&&progress.level>shownLevel&&<button className="btn btn-ghost" disabled={busy} onClick={()=>choose(progress.level)}>Continue to level {progress.level} &#8594;</button>}
    </>}
    <p className="me-fine">Each level has its own {LEVEL_TRIES} daily tries, including replays. Lower scores never reduce best stars. {mode==='draw'?'8 seconds per attempt.':mode==='cut'?'5 seconds per attempt.':'Tap to start, then tap or press Space to brake.'}</p>
   </div>
  </div>
 </section>;
}
