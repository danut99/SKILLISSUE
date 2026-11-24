import { cloneElement, useEffect, useRef, useState } from 'react';
import { ActivityCalendar } from 'react-activity-calendar';
import { LAUNCH_DATE, MODE_INFO, MODES, type BoardMode } from '../config';
import { useAuth } from '../lib/auth';
import { useUi } from '../lib/ui';
import { loadRankHistory, rankCalendar, type RankDay } from '../lib/rankHistory';

export function RankCalendar({ date }: { date: string }) {
  const { userId, status } = useAuth();
  const boardVersion = useUi(state => state.boardVersion);
  const [year, setYear] = useState(Number(date.slice(0,4)));
  const [mode, setMode] = useState<BoardMode>('overall');
  const [state, setState] = useState<{ owner: string | null; year: number; rows: RankDay[] } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const online = status === 'anon' || status === 'linked';
  useEffect(() => {
    if (!online) return;
    let active = true;
    setError('');
    loadRankHistory(year).then(rows => { if (active) setState({ owner: userId, year, rows }); })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [year, userId, status, date, retry, online, boardVersion]);
  useEffect(() => {
    const refresh = () => setRetry(value => value + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  const loaded = state?.owner === userId && state?.year === year;
  const rows = loaded ? state.rows.filter(row => row.mode === mode) : [];
  const selected = picked ?? rows.at(-1)?.play_date ?? `${year}-01-01`;
  const row = rows.find(item => item.play_date === selected);
  const byDate = new Map(rows.map(item => [item.play_date, item]));
  useEffect(() => {
    if (!loaded || !online || error) return;
    const frame = requestAnimationFrame(() => {
      const scroller = scrollRef.current?.querySelector<HTMLElement>('.react-activity-calendar__scroll-container');
      if (scroller) scroller.scrollLeft = scroller.scrollWidth;
    });
    return () => cancelAnimationFrame(frame);
  }, [year, loaded, mode, online, error]);
  function label(day: string) {
    const item = byDate.get(day);
    return item ? `${day}: #${item.rank} of ${item.players}, ${item.score.toFixed(1)} points${day === date ? ', live' : ''}` : `${day}: No ranked play`;
  }
  return <section className="me-section rank-history" aria-labelledby="rank-history-title">
    <h2 className="me-label" id="rank-history-title"><span>Your daily places</span></h2>
    <div className="me-box">
      <div className="rank-calendar-controls">
        <label>Leaderboard <select value={mode} onChange={event => { setMode(event.target.value as BoardMode); setPicked(null); }}>
          <option value="overall">Overall</option>{MODES.map(game => <option key={game} value={game}>{MODE_INFO[game].name}</option>)}
        </select></label>
        <label>Year <select value={year} onChange={event => { setYear(Number(event.target.value)); setPicked(null); setError(''); }}>
          {Array.from({length: Number(date.slice(0,4)) - Number(LAUNCH_DATE.slice(0,4)) + 1}, (_,i) => Number(date.slice(0,4))-i).map(value => <option key={value}>{value}</option>)}
        </select></label>
      </div>
      <p className="me-fine">Tap a day for your rank. Days close at 00:00 UTC; today stays live.</p>
      {!online ? <p role="status">Connect online to see your daily places. Save your account to keep this history across devices.</p> : error ? <div role="alert"><p>{error}</p><button className="btn btn-ghost btn-sm" onClick={() => setRetry(value => value+1)}>Try again</button></div> : <>
        <div className="rank-calendar-scroll" ref={scrollRef} tabIndex={0} role="region" aria-label="Daily rank calendar. Scroll horizontally for earlier months.">
          <ActivityCalendar data={rankCalendar(year,date,rows)} loading={!loaded} blockSize={14} blockMargin={4} blockRadius={0} fontSize={15}
            colorScheme="dark" theme={{dark:['#252e21','#526448','#81966a','#b9d68b','#d7ff5f']}} showWeekdayLabels={['mon','wed','fri']} showTotalCount={false} showColorLegend={false}
            renderBlock={(block, activity) => cloneElement(block, {
              role: 'button', tabIndex: 0, 'aria-label': label(activity.date), 'aria-pressed': selected === activity.date,
              onClick: () => setPicked(activity.date), onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPicked(activity.date); } },
              children: <title>{label(activity.date)}</title>,
            })} />
        </div>
        <div className="rank-calendar-legend"><span>No play</span><span>Ranked</span><span>Top 10</span><span>Top 3</span><span>#1</span></div>
        <div className="rank-day-detail" role="status" aria-live="polite">
          <span>{selected}{selected === date ? ' / Live' : ''}</span>
          {loaded && row ? <><b>#{row.rank} <small>of {row.players} players</small></b><span>{row.score.toFixed(1)} / {mode === 'overall' ? 300 : 100} points</span></> : <span>{loaded ? 'No ranked play on this day.' : 'Loading your places...'}</span>}
        </div>
        {loaded && <p className="me-fine">{rows.length} ranked days in {year}{rows.length ? ` / Best place: #${Math.min(...rows.map(item => item.rank))}` : '. Play a daily game to get started.'}</p>}
      </>}
    </div>
  </section>;
}
