import { useEffect, useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MODE_INFO, MODES, type Mode } from '../config';
import { useAuth } from '../lib/auth';
import { useUi } from '../lib/ui';
import { loadRankHistory, type RankDay } from '../lib/rankHistory';
import { gameAverages, progressSeries, scoreChange } from '../lib/progress';

export default function ProgressCharts({date, children}: {date:string; children?:ReactNode}) {
  const {userId,status} = useAuth();
  const boardVersion = useUi(state => state.boardVersion);
  const [mode,setMode] = useState<Mode>('draw');
  const [length,setLength] = useState(30);
  const [retry,setRetry] = useState(0);
  const [error,setError] = useState('');
  const [state,setState] = useState<{owner:string|null;date:string;rows:RankDay[]}|null>(null);
  const online = status === 'anon' || status === 'linked';
  useEffect(() => {
    if(!online) return;
    let active=true;setError('');
    const year=Number(date.slice(0,4));
    const years=year>2026?[year-1,year]:[year];
    Promise.all(years.map(loadRankHistory)).then(result => {if(active)setState({owner:userId,date,rows:result.flat()});})
      .catch((cause:Error) => {if(active)setError(cause.message);});
    return()=>{active=false;};
  },[userId,status,date,retry,boardVersion,online]);
  useEffect(()=>{const refresh=()=>setRetry(value=>value+1);window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
  const loaded=state?.owner===userId&&state?.date===date;
  const rows=loaded?state.rows:[];
  const data=progressSeries(rows,date,length);
  const averages=gameAverages(rows,date,length);
  const selected=averages.find(game=>game.mode===mode)!;
  const change=scoreChange(rows,mode,date);
  const played=data.filter(day=>day[mode]!==null);
  const best=played.length?Math.max(...played.map(day=>day[mode]!)):null;
  return <section className="me-section progress-section" aria-labelledby="progress-title">
    <h2 className="me-label" id="progress-title"><span>Your progress</span></h2>
    <div className="me-box">
      {children}
      <div className="progress-controls">
        <div className="progress-tabs" role="group" aria-label="Progress game">{MODES.map(game=><button key={game} aria-pressed={mode===game} onClick={()=>setMode(game)}>{MODE_INFO[game].name}</button>)}</div>
        <div className="progress-tabs" role="group" aria-label="Progress period">{[7,30].map(days=><button key={days} aria-pressed={length===days} onClick={()=>setLength(days)}>{days} days</button>)}</div>
      </div>
      {!online?<p role="status">Connect online to see your saved daily score history.</p>:error?<div role="alert"><p>{error}</p><button className="btn btn-ghost btn-sm" onClick={()=>setRetry(value=>value+1)}>Try again</button></div>:!loaded?<p role="status">Loading your progress...</p>:<>
        <div className="progress-summary">
          <div><span>Average</span><b>{selected.average===null?'--':selected.average.toFixed(1)}<small>/100</small></b></div>
          <div><span>Best</span><b>{best===null?'--':best.toFixed(1)}<small>/100</small></b></div>
          <div><span>Days played</span><b>{selected.days}<small>/{length}</small></b></div>
        </div>
        <h3 className="progress-chart-title">Daily best / 100</h3>
        {played.length?<div className="progress-chart" aria-label={`${MODE_INFO[mode].name} daily best scores out of 100 over the last ${length} days`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={data} margin={{top:12,right:14,bottom:4,left:-20}} accessibilityLayer>
              <CartesianGrid stroke="#1b3050" strokeDasharray="3 5" vertical={false}/>
              <XAxis dataKey="date" tickFormatter={day=>String(day).slice(5).replace('-','/')} stroke="#7d93b8" minTickGap={32} tickLine={false}/>
              <YAxis domain={[0,100]} ticks={[0,25,50,75,100]} stroke="#7d93b8" tickLine={false}/>
              <Tooltip labelFormatter={label=>String(label)} formatter={value=>[`${Number(value).toFixed(1)} / 100`,'Daily best']} contentStyle={{background:'#101d33',border:'1px solid #36566f',color:'#e8f1ff'}}/>
              <Line type="linear" dataKey={mode} name={MODE_INFO[mode].name} stroke={MODE_INFO[mode].color} strokeWidth={3} dot={{r:4,fill:MODE_INFO[mode].color,stroke:'#050a14',strokeWidth:2}} activeDot={{r:6}} connectNulls={false} isAnimationActive={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>:<p className="progress-empty">No {MODE_INFO[mode].name.toLowerCase()} scores in these {length} days. Play a daily game to start your chart.</p>}
        <p className="progress-insight" role="status">{change===null?'Play on 14 days to unlock your score trend.':`${MODE_INFO[mode].name}: ${change>=0?'+':''}${change.toFixed(1)} points in your latest 7 played days compared with the previous 7.`}</p>
        <details className="progress-data"><summary>View daily scores</summary><table><thead><tr><th>Day (UTC)</th><th>{MODE_INFO[mode].name} / 100</th></tr></thead><tbody>{[...data].reverse().map(day=><tr key={day.date}><td>{day.date}</td><td>{day[mode]===null?'Not played':day[mode]!.toFixed(1)}</td></tr>)}</tbody></table></details>
        <p className="me-fine">Daily games only. Gaps mean no play; challenge difficulty varies.</p>
      </>}
    </div>
  </section>;
}
