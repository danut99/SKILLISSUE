import { DAILY_ORDER, dailyProgress, personalDailyTarget } from '../lib/engagement';
import { modeDay, triesLeft, usePlayer } from '../lib/store';
import type { Mode } from '../config';
import { track } from '../lib/clarity';
import { useAuth } from '../lib/auth';
import { recordAccountPrompt } from '../lib/engagementTracking';

export function PersonalDailyTarget({ date, compact = false, onPlay, showAccount = true }: { date: string; compact?: boolean; onPlay?: (mode: Mode) => void; showAccount?: boolean }) {
  const days = usePlayer(s => s.days);
  const linked = useAuth(s => s.status === 'linked');
  const target = personalDailyTarget(days, date);
  if (!target.complete && target.record === null) return null;
  const newRecord = target.complete && target.previousRecord !== null && target.today > target.previousRecord;
  const next = dailyProgress(days, date).remaining[0] ?? DAILY_ORDER.find(mode => triesLeft(modeDay(days, date, mode)) > 0);
  return <section className={`personal-target ${compact ? 'personal-target-compact' : ''}`} aria-label="Your personal daily target">
    <div className="personal-target-copy">
      <span className="personal-target-label">YOU VS. YOU</span>
      <h2>{target.complete ? newRecord ? 'Your best day yet.' : 'A score to come back for.' : target.yesterday !== null ? 'Can you beat yesterday?' : 'Your next personal best awaits.'}</h2>
      <div className="personal-target-stats">
        {target.complete ? <div><span>Today</span><strong>{target.today.toFixed(1)}<small> / 300</small></strong></div> : target.yesterday !== null ? <div><span>Yesterday</span><strong>{target.yesterday.toFixed(1)}<small> / 300</small></strong></div> : null}
        <div><span>Personal best</span><strong>{target.record?.toFixed(1)}<small> / 300</small></strong></div>
      </div>
      <p>{target.complete ? target.attemptsLeft > 0 ? `${target.attemptsLeft} ${target.attemptsLeft === 1 ? 'attempt left' : 'attempts left'} across today’s games to improve your total. Tomorrow, take another shot.` : 'Your score is set. Come back tomorrow and try to beat it.' : 'Play all three games. Your best score in each adds up to a total out of 300.'}</p>
      <small className="personal-target-note">Challenges change daily. These totals track your own progress.</small>
      {onPlay && next && <button className="btn btn-primary personal-target-play" onClick={() => { track('personal_target_play'); onPlay(next); }}>{target.complete ? 'Improve today’s total' : 'Play today’s three'} <span aria-hidden="true">&#8594;</span></button>}
    </div>
    {!linked && showAccount && <div className="personal-target-save"><p>Keep your scores and history across devices with a free account.</p><a className="btn btn-ghost" href="/profile" onClick={() => recordAccountPrompt('personal-daily-target')}>Save my progress</a></div>}
  </section>;
}
