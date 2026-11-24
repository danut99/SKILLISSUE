import { useState } from 'react';
import { Leaderboard } from './Leaderboard';
import { RecentChampions } from './RecentChampions';
import { type BoardMode } from '../config';

const extras = [
  { url: '/party', symbol: '✳', name: 'Bring your rivals.', tag: 'PARTY MODE', text: '2–8 friends. Same games. One very smug winner.', color: 'pink' },
  { url: '/play/balance', symbol: '⚖', name: 'Find your balance.', tag: 'PLAYABLE BETA', text: 'One plank. Two creatures. Pick the balance point.', color: 'purple' },
  { url: '/play/count', symbol: '⠿', name: 'Blink and you’ll miss it.', tag: 'COUNT FAST', text: 'A quick flash. Count the dots. Trust your eyes.', color: 'yellow' },
];

export function ExplorePage() {
  return <section className="screen discover-page">
    <header className="page-intro"><span className="eyebrow">A FEW MORE SKILL ISSUES</span><h1>Can’t leave it alone<span>?</span></h1><p>Daily tests done? There’s more trouble to get into.</p></header>
    <div className="explore-grid">{extras.map(item => <a className={`explore-card pastel-${item.color}`} href={item.url} key={item.url}><span className="explore-symbol" aria-hidden="true">{item.symbol}</span><small>{item.tag}</small><h2>{item.name}</h2><p>{item.text}</p><b>Play now <span aria-hidden="true">▶</span></b></a>)}</div>
    <section className="level-discovery"><div><span className="eyebrow">ONE LEVEL BETTER</span><h2>A little practice. A lot of pride.</h2><p>Work through level challenges, earn stars, and sharpen your precision.</p></div><div className="level-choice">{['cut', 'draw', 'brake'].map(mode => <a href={`/levels/${mode}`} key={mode}>{mode === 'brake' ? 'Brake' : mode === 'cut' ? 'Cut' : 'Draw'} levels <span aria-hidden="true">★</span></a>)}</div></section>
    <a className="back-daily" href="/">Back to today’s three challenges</a>
  </section>;
}

export { HowToPlayPage } from './HowToPlayPage';

export function RankingsPage({ date }: { date: string }) {
  const [mode, setMode] = useState<BoardMode>(() => {
    const game = new URLSearchParams(location.search).get('game');
    return game === 'cut' || game === 'draw' || game === 'brake' ? game : 'overall';
  });
  return <section className="screen rankings-page"><header className="page-intro"><span className="eyebrow">A LITTLE FRIENDLY COMPETITION</span><h1>Big scores.<br /><span>Bigger bragging rights.</span></h1><p>Today’s personal best could be tomorrow’s score to beat.</p></header><nav className="ranking-tabs" aria-label="Choose game">{(['overall', 'cut', 'draw', 'brake'] as const).map(item => <button key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>{item === 'overall' ? 'All' : item === 'cut' ? 'Cut' : item === 'draw' ? 'Draw' : 'Brake'}</button>)}</nav><Leaderboard mode={mode} date={date} title="The scores to beat" /><RecentChampions date={date} /><a className="back-daily" href="/">Your turn. Play today’s challenges.</a></section>;
}
