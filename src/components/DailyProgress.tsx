import { MODE_INFO, type Mode } from '../config';
import { DAILY_ORDER, dailyProgress } from '../lib/engagement';
import { track } from '../lib/clarity';
import { usePlayer } from '../lib/store';
import { PersonalDailyTarget } from './PersonalDailyTarget';

export function DailyProgress({ date, current, onPlay, showTarget = true, showAccount = true }: { date: string; current?: Mode; onPlay: (mode: Mode) => void; showTarget?: boolean; showAccount?: boolean }) {
  const days = usePlayer(state => state.days);
  const progress = dailyProgress(days, date);
  return <section className={`daily-journey ${current ? 'daily-journey-compact' : ''}`} aria-label="Today's game progress">
    <div className="daily-journey-heading"><b>{progress.complete ? 'Today’s three: done.' : 'Your daily three'}</b><span>{progress.played.length} / 3 played</span></div>
    <div className="daily-journey-games">{DAILY_ORDER.map(mode => {
      const played = progress.played.includes(mode);
      return <button key={mode} className={played ? 'complete' : ''} aria-current={mode === current ? 'step' : undefined} onClick={() => { track(`daily_progress_play_${mode}`); onPlay(mode); }}><span aria-hidden="true">{played ? '✓' : '○'}</span>{MODE_INFO[mode].name}<small>{played ? 'Played' : 'Try it'}</small></button>;
    })}</div>
    {!progress.complete && <p>{`${progress.remaining.length} ${progress.remaining.length === 1 ? 'game' : 'games'} left. Your best scores add up to a total out of 300.`}</p>}
    {progress.complete && showTarget && <PersonalDailyTarget date={date} compact showAccount={showAccount} />}
  </section>;
}
