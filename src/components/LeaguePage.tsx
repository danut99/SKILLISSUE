import { DIVISIONS,useLeague,type League,type LeagueRow } from '../lib/leagues';
import { useAuth } from '../lib/auth';
import { AccountCard } from './AccountCard';
import { PixelIcon } from './PixelIcon';
const plural=(count:number,word:string)=>`${count} ${word}${count===1?'':'s'}`;
// Nobody is placed ahead of anyone until they have points.
const rankLabel=(row:LeagueRow)=>Number(row.score)>0?`#${row.rank}`:'\u2014';
function deadline(league:League){return new Date(league.ends_at).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'})+' · 00:00 UTC';}
export function LeagueCard({date}:{date:string}){
 const {league,online}=useLeague(date);if(!online)return null;
 const division=league?.division??1;const rows=league?.rows??[];const me=rows.find(row=>row.is_me);
 return <a className="card px-box league-home league-home-v2" href="#league">
  <div className="league-home-heading"><LeagueBadge division={division}/><div><small>YOUR WEEKLY LEAGUE</small><h2>{DIVISIONS[division]} league</h2><p>{me?<><b>{rankLabel(me)}</b> of {rows.length}<span className="league-home-dot">&middot;</span>{Number(me.score).toFixed(1)} <span className="league-home-total">/ 1,500 pts</span></>:league&&!league.joined?'Play a daily game to join.':'Preparing your weekly standing...'}</p></div><span className="league-home-cta">View league &#8594;</span></div>
  <div className="league-home-bottom"><div className="league-home-track" aria-label="League progression">{[1,2,3,4].map(tier=><span key={tier} className={tier===division?'current':tier<division?'earned':''} aria-current={tier===division?'step':undefined}><LeagueBadge division={tier}/><span>{DIVISIONS[tier]}</span></span>)}</div><small>{division===4?'Elite reached. Chase the weekly title.':'Top 5 + 600 points advance. No relegation.'}</small></div>
 </a>;
}
export function LeagueHeaderLink({date}:{date:string}){
 const {league}=useLeague(date);const division=league?.division??1;
 return <a className="corner-btn px-box header-league" href="#league" aria-label={`Open ${DIVISIONS[division]} league`} title={`${DIVISIONS[division]} league`}><LeagueBadge division={division}/></a>;
}

function LeagueBadge({division}:{division:number}) {
 const colors=['#c2d4e7','#c2d4e7','#f0cc74','#67dbea','#c9a2ff'];
 return <svg className="league-emblem" viewBox="0 0 64 72" aria-hidden="true" shapeRendering="crispEdges"><path fill="#081425" stroke={colors[division]} strokeWidth="3" d="M8 4h48v39L32 67 8 43z"/><path fill={colors[division]} opacity=".15" d="M14 10h36v30L32 58 14 40z"/><path fill={colors[division]} d="m32 15 5 10 11 2-8 8 2 12-10-6-10 6 2-12-8-8 11-2z"/><path fill="#fff" opacity=".45" d="m32 15 5 10-5 8-5-8z"/></svg>;
}
function LeagueDays({row,week}:{row:LeagueRow;week:string}) {
 return <div className="league-days" aria-label="Daily scores">{Array.from({length:7},(_,i)=>{
  const d=new Date(`${week}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+i);const day=d.toISOString().slice(0,10);const result=row.days.find(r=>r.date===day);
  return <span key={day} className={result?.counted?'counted':''} title={`${day}${result&&!result.counted?' - Not in best five':''}`}><small>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</small>{result?Number(result.score).toFixed(1):'\u2014'}</span>;
 })}</div>;
}
export function LeaguePage({date}:{date:string}){
 const guest=useAuth(s=>s.status==='anon');
 const {league,error,online}=useLeague(date);const rows=league?.rows??[];const previous=league?.previous;
 const me=rows.find(row=>row.is_me);const division=league?.division??1;
 const target=Math.max(600,Number(rows[4]?.score??0));
 const remaining=me?Math.max(0,target-Number(me.score)):600;
 const eligible=!!me&&me.rank<=5&&Number(me.score)>=600;
 const targetText=rows.length<10?'Your group is forming. Promotion unlocks at 10 players.':division===4?'You reached Elite. Compete for the weekly title.':eligible?'You are on track for promotion. Hold your top-five place.':remaining>0?`${remaining.toFixed(1)} points to match the promotion target. Finish in the top five.`:'Promotion score reached. Climb into the top five.';
 return <section className="screen league-page">
  <header className="league-page-title"><div><span className="league-eyebrow">WEEKLY COMPETITION</span><h1>Skill Leagues</h1></div><a href="#" className="link-btn">Daily games &#8599;</a></header>
  <nav className="league-ladder" aria-label="League progression">{[1,2,3,4].map(tier=><div key={tier} className={tier===division?'current':tier<division?'earned':''} aria-current={tier===division?'step':undefined}><LeagueBadge division={tier}/><span>{DIVISIONS[tier]}</span><small>{tier===division?'YOUR LEAGUE':tier<division?'REACHED':tier===division+1?'UP NEXT':'LOCKED'}</small></div>)}</nav>
  <details className="league-how league-rules-top"><summary>Top 5 + 600 points to advance <span>Rules &#8964;</span></summary><p>Your best five daily totals count, up to 1,500 points. Each daily total adds your best Draw, Cut and Brake scores.</p><p>Promotion needs a group of at least 10 players. No relegation. Elite is the highest league. Scores reset Monday at 00:00 UTC; your division stays. Ties use a stable player order.</p></details>
  {!online?<p className="me-box">Connect online to enter your weekly league.</p>:error?<p className="me-box" role="alert">{error}</p>:!league?<p role="status">Preparing your league...</p>:!league.joined?<p className="me-box">Play a daily game to join this week's league.</p>:<>
   <section className="league-personal" aria-label="Your league position">
    <div className="league-personal-top"><LeagueBadge division={division}/><div><span className="league-eyebrow">{DIVISIONS[division].toUpperCase()} LEAGUE</span><h2>Your weekly standing</h2><p>Resets {deadline(league)}</p></div><a className="btn btn-primary" href="#">Play & climb &#8594;</a></div>
    {me&&<><div className="league-personal-stats"><div><small>YOUR POSITION</small><strong>{rankLabel(me)}<span> / {rows.length}</span></strong></div><div><small>WEEKLY POINTS</small><strong>{Number(me.score).toFixed(1)}<span> / 1,500</span></strong></div><div><small>PLAYED</small><strong>{me.days.length}<span> {me.days.length===1?'day':'days'}</span></strong></div></div>
    <div className="league-goal"><div><span>{division===4?'WEEKLY TITLE':'NEXT TARGET'}</span><b>{Number(me.score).toFixed(1)} / {target.toFixed(0)} pts</b></div><progress value={Math.min(Number(me.score),target)} max={target} aria-label="Points toward promotion target"/><p>{targetText}</p></div>
    <details className="league-my-days"><summary>Your daily scores <span>Best five count &#8964;</span></summary><LeagueDays row={me} week={league.week}/></details></>}
   </section>
   {guest&&<aside className="league-save"><div><b>Make this progress yours.</b><p>Link an account to keep your league on every device. Guest access can be lost when you clear data or close incognito.</p></div><details className="guest-progress-save"><summary>Save progress</summary><AccountCard compact/></details></aside>}
   <section className="league-board" aria-labelledby="league-standings-title"><div className="league-board-heading"><div><h2 id="league-standings-title">This week's rivals</h2><p>{rows.length}/20 players &middot; Top 5 + 600 points advance{division===4?' \u00b7 Elite stays Elite':''}</p></div><span className="league-live">LIVE</span></div>
    <ol className="league-compact-list">{rows.map(row=><li key={row.rank} className={row.is_me?'is-me':''}>
     <details><summary><span className={`league-position place-${row.rank}`}>{Number(row.score)<=0?'\u2014':row.rank<=3?<PixelIcon name={row.rank===1?'crown-gold':row.rank===2?'crown-silver':'crown-bronze'} size={22}/>:row.rank}</span><span className="league-avatar" aria-hidden="true">{row.nickname.slice(0,1).toUpperCase()}</span><span className="league-player-name">{row.nickname}{row.is_me&&<small>YOU</small>}</span><strong>{Number(row.score).toFixed(1)}<small> pts</small></strong><span className="league-expand" aria-hidden="true">+</span></summary><div className="league-player-details"><LeagueDays row={row} week={league.week}/><p>{plural(row.days.length,'day')} played &middot; Highlighted days count toward the weekly total.</p></div></details>
     {row.rank===5&&rows.length>5&&<div className="league-cutoff">TOP 5 CUTOFF <span>600 points minimum &middot; {rows.length<10?'10 players required':'Hold your place until reset'}</span></div>}
    </li>)}</ol>
   </section>
   {previous&&<p className="league-previous">Last week: #{previous.rank} &middot; {Number(previous.score).toFixed(1)} points &middot; {DIVISIONS[previous.division]} &rarr; {DIVISIONS[previous.next_division]}</p>}
  </>}

 </section>;
}

export function LeagueCareer({date}:{date:string}){
 const {league}=useLeague(date);const career=league?.career;if(!career||(!league?.joined&&!career.weeks))return null;
 return <a href="#league" className="me-box league-career"><LeagueBadge division={career.highest_division}/><div><b>League career</b><p>{DIVISIONS[career.highest_division]} peak &middot; {plural(career.wins,'league win')} &middot; {plural(career.weeks,'completed week')}</p></div><span>View league &rarr;</span></a>;
}
