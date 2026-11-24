import { DailyReminder } from './DailyReminder';
import { DailyProgress } from './DailyProgress';
import { PersonalDailyTarget } from './PersonalDailyTarget';
import { DAILY_ORDER, dailyProgress, personalDailyTarget } from '../lib/engagement';
import { recordAccountPrompt } from '../lib/engagementTracking';
import { ReturnPoll } from './ReturnPoll';
import { LeagueCard } from './LeaguePage';
import { GuestProgressPrompt } from './GuestProgressPrompt';
import { track } from '../lib/clarity';
import { useAuth } from '../lib/auth';
import { useState } from 'react';
import './Home.css';
import { MODE_INFO, MODES, type Mode } from '../config';
import { addDays, dayNumber } from '../lib/daily';
import { fmtResult, overallBadge } from '../lib/scoring';
import { bestAttempt, maxTries, triesLeft, modeDay, totalScore, usePlayer } from '../lib/store';
import { Countdown } from './Countdown';
import { ShareModal } from './ShareModal';
import { AccountCard } from './AccountCard';
import { NicknameControl } from './NicknameControl';

import { dailyDrawShape, shapeRadius } from '../lib/drawShapes';
import { dailyBrakeObjective, type BrakeObjective } from '../lib/brakeChallenge';
import { PixelIcon } from './PixelIcon';
import { InstallButton } from './InstallButton';
import { dailyShape } from '../games/cutGame';

interface Props {
  date: string;
  onPlay: (mode: Mode) => void;
}

export function Home({ date, onPlay }: Props) {
  const authStatus = useAuth(s => s.status);
  const days = usePlayer((s) => s.days);
  const streak = usePlayer((s) => s.streak);
  const lastDay = usePlayer((s) => s.lastDay);
  const total = totalScore(days, date);
  const progress = dailyProgress(days, date);
  const target = personalDailyTarget(days, date);
  const replayMode = DAILY_ORDER.find(mode => triesLeft(modeDay(days, date, mode)) > 0);
  const startMode = progress.remaining[0] ?? replayMode ?? 'cut';
  const playedAny = MODES.some((m) => modeDay(days, date, m).tries.length > 0);
  const liveStreak = lastDay === date || lastDay === addDays(date, -1) ? streak : 0;


  const [shareOpen, setShareOpen] = useState(false);
  const shareDay = () => {
    track('share_open_day');
    setShareOpen(true);
  };

  return (
    <section className="screen home home-redesign">
      <header className="launch-hero">
        <div className="launch-copy">
          <span className="launch-eyebrow">YOUR DAILY DOSE OF FRIENDLY COMPETITION</span>
          <h1>Think you&#8217;ve<br />{' '}got <span>skill?</span><span className="hero-spark" aria-hidden="true">&#10035;</span></h1>
          <p className="launch-description">3 games. {authStatus === 'linked' ? 8 : 5} tries each. Every day.</p>
          <p className="launch-subcopy">Draw. Cut. Brake. Simple enough. Until you try.</p>
          <button className="launch-play" onClick={() => { track('home_hero_play'); if (progress.complete && !replayMode) document.getElementById('daily-summary')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); else onPlay(startMode); }}><span aria-hidden="true">&#9654;</span> {playedAny ? progress.complete ? replayMode ? 'Play again' : 'See today’s total' : `Continue with ${MODE_INFO[startMode].name}` : 'Play today\u2019s challenge'}</button>
          <span className="launch-free">Free to play. No signup. Just skill.</span>
        </div>
        <div className="launch-art" aria-hidden="true">
          <span className="art-note">looks easy, right?</span>
          <div className="hero-blob"><GamePreview mode="cut" date={date} /></div>
          <span className="art-sticker">50 / 50<span>or a skill issue.</span></span>
          <span className="art-star">&#10022;</span>
        </div>
      </header>
      <div className="daily-heading">
        <div><span className="launch-eyebrow">SAME CHALLENGES. EVERYONE. EVERYWHERE.</span><h2>Today&#8217;s little ego check<span>.</span></h2></div>
        <div className="daily-reset"><span>DAY {String(dayNumber(date)).padStart(3, '0')} &middot; {MODES.filter(m => modeDay(days, date, m).tries.length > 0).length}/3 PLAYED</span><span>New challenges in <Countdown /></span></div>
      </div>
      {!progress.complete && target.record !== null && <p className="personal-target-inline">{target.yesterday !== null && <span>Yesterday: <b>{target.yesterday.toFixed(1)}</b></span>}<span>Personal best: <b>{target.record.toFixed(1)}</b></span><span className="personal-target-inline-prompt">Can you beat it?</span></p>}
      <div className="launch-games">
        {(['cut', 'draw', 'brake'] as const).map(m => {
          const md = modeDay(days, date, m);
          const best = bestAttempt(md);
          const left = triesLeft(md);
          return <button key={m} className={`launch-game launch-game-${m}`} onClick={() => { track(`home_card_${m}`); onPlay(m); }}>
            <div className="launch-game-top"><span>{m === 'cut' ? 'TODAY\u2019S MAIN EVENT' : m === 'draw' ? 'STEADY HANDS?' : 'NO PRESSURE.'}</span><span aria-hidden="true">{m === 'cut' ? '\u2733' : m === 'draw' ? '\u270e' : '\u2691'}</span></div>
            <div className="launch-preview"><GamePreview mode={m} date={date} /></div>
            <div className="launch-game-copy"><h3>{m === 'cut' ? 'CUT IT.' : m === 'draw' ? 'DRAW IT.' : 'BRAKE!'}</h3><p>{m === 'cut' ? 'One cut. Two equal halves.' : m === 'draw' ? `One ${dailyDrawShape(date)}. One perfect stroke.` : `Today: ${BRAKE_TODAY[dailyBrakeObjective(date)]}.`}</p><span className="launch-attempts">{best ? `Best: ${fmtResult(m, best)} | ${left} tries left` : `${maxTries(md)} tries. Make them count.`}</span></div>
            <span className="launch-game-play">{best ? left > 0 ? 'Beat your best' : 'View your result' : m === 'cut' ? 'Let\u2019s cut' : m === 'draw' ? 'Let\u2019s draw' : 'Let\u2019s brake'}<span aria-hidden="true">&#9654;</span></span>
          </button>;
        })}
      </div>
      {progress.complete ? <PersonalDailyTarget date={date} onPlay={onPlay} /> : playedAny ? <DailyProgress date={date} onPlay={onPlay} showTarget={false} /> : null}
      <DailyReminder />
      <div className="launch-taunt"><span>Bad score? Skill issue. &#129760;</span><p>Come back tomorrow. Prove it wasn&#8217;t luck.</p></div>
      <div className="launch-account">
        <div><span className="launch-eyebrow">{liveStreak > 0 ? `${liveStreak} DAY STREAK. KEEP IT GOING.` : 'A LITTLE BETTER. EVERY DAY.'}</span><h2>{authStatus === 'linked' ? 'Your next personal best is waiting.' : playedAny ? 'That progress? Worth keeping.' : 'Play first. Make it personal.'}</h2><p>{authStatus === 'linked' ? 'Your scores and streak travel with you. Ready for another try?' : 'Create a free account to keep your scores, streak and unlocks across devices.'}</p></div>
        <a href="/profile" className="launch-account-button" onClick={() => { track('home_account_cta'); recordAccountPrompt('home'); }}>{authStatus === 'linked' ? 'My progress' : 'Save my progress'}</a>
      </div>
      <div className="with-board">
      <div className="main-col">
      {playedAny && <HomeIdentity date={date} />}


      {playedAny && (
        <div className="card px-box total-card" id="daily-summary">
          <div className="daily-total-summary">
            <div className="eyebrow">today's total</div>
            <div className="total-score">
              {total.toFixed(1)}
              <small>/300</small>
            </div>
            <div className="badge">{overallBadge(total)}</div>
          </div>
          <button className="btn btn-primary daily-total-share" onClick={shareDay}>
            Share my day <span aria-hidden="true">&#8599;</span>
          </button>
          <div className="daily-total-games">
            {MODES.map(mode => {
              const best = bestAttempt(modeDay(days, date, mode));
              return <button key={mode} className={`daily-total-game ${best ? 'played' : ''}`} onClick={() => onPlay(mode)} aria-label={`${MODE_INFO[mode].name}: ${best ? fmtResult(mode, best) : 'not played'}`}>
                <span className="daily-total-game-label"><PixelIcon name={mode} size={26} />{MODE_INFO[mode].name}</span>
                <span className="daily-total-game-score">{best ? `${best.score.toFixed(1)} / 100` : 'Not played'}</span>
              </button>;
            })}
          </div>

        </div>
      )}


      {playedAny && <div className="home-account">
        <ReturnPoll date={date} compact />
      </div>}

      <LeagueCard date={date} />


      <section className="home-explore" aria-labelledby="home-explore-heading">
        <div className="section-heading"><div><span className="launch-eyebrow">STILL GOT SOMETHING TO PROVE?</span><h2 id="home-explore-heading">A little more trouble.</h2></div><a href="/games">All games &amp; modes</a></div>
        <div className="home-extra-grid">
          <a href="/party" className="home-extra home-extra-party"><span className="extra-symbol" aria-hidden="true">&#10035;</span><span><small>BETTER WITH FRIENDS</small><h3>Find the skill issue.</h3><p>2-8 players. One group chat rivalry.</p><b>Start a party</b></span></a>
          <a href="/games" className="home-extra home-extra-levels"><span className="extra-symbol" aria-hidden="true">&#9733;</span><span><small>KEEP GETTING BETTER</small><h3>Not done yet?</h3><p>Level ladders, Balance and Count Fast.</p><b>Explore more games</b></span></a>
        </div>
      </section>
      <section className="home-how" id="how" aria-labelledby="home-how-heading"><div className="section-heading"><h2 id="home-how-heading">Small games. Simple rules.</h2><a href="/how-to-play">How to play</a></div><div className="home-how-steps"><div><b>Pick your test.</b><p>Cut, draw or brake. No account needed.</p></div><div><b>Make every try count.</b><p>Only your best score in each game counts.</p></div><div><b>Settle it tomorrow.</b><p>New challenges daily. Same test for everyone.</p></div></div></section>
      <InstallButton />
      {authStatus !== 'anon' && <AccountCard />}
      </div>

      </div>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} date={date} />
    </section>
  );
}

const BRAKE_TODAY: Record<BrakeObjective, string> = { wall: 'stop before the wall', parking: 'park in the bay', 'stop-line': 'stop at the red light' };

function GamePreview({ mode, date }: { mode: Mode; date: string }) {
  const shape = dailyShape(date);
  const xs = shape.poly.map(p => p.x), ys = shape.poly.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  if (mode === 'cut') return <svg viewBox="0 0 300 200" aria-hidden="true"><g className="preview-cut-shape"><path d={shape.poly.map((p, i) => `${i ? 'L' : 'M'}${65 + (p.x - x) / w * 170},${20 + (p.y - y) / h * 160}`).join(' ') + 'Z'} fill="#d5ff58" stroke="#202120" strokeWidth="5" strokeLinejoin="round" /><g fill="white" stroke="#202120" strokeWidth="3"><ellipse cx="133" cy="87" rx="12" ry="15" /><ellipse cx="163" cy="87" rx="12" ry="15" /></g><g fill="#202120"><circle cx="137" cy="89" r="5" /><circle cx="167" cy="89" r="5" /></g></g><path className="preview-cut-line" d="M58 165 L245 32" stroke="#202120" strokeWidth="3" strokeDasharray="8 7" /></svg>;
  const drawShape = dailyDrawShape(date);
  const drawPath = Array.from({ length: 121 }, (_, i) => { const angle = i / 120 * Math.PI * 2; const r = shapeRadius(drawShape, angle) * 70; return `${i ? 'L' : 'M'}${145 + Math.cos(angle) * r},${103 + Math.sin(angle) * r}`; }).join(' ') + 'Z';
  if (mode === 'draw') return <svg viewBox="0 0 300 200" aria-hidden="true"><path d={drawPath} fill="none" stroke="#202120" strokeWidth="2" strokeDasharray="4 7" opacity=".25" /><path className="preview-draw-line" d={drawPath} pathLength="460" fill="none" stroke="#202120" strokeWidth="7" strokeLinecap="round" /><g className="preview-pencil" transform="translate(190 25) rotate(35)"><path d="M0 0 H24 V80 L12 103 L0 80Z" fill="#fff9ee" stroke="#202120" strokeWidth="4" /><path d="M6 90 L12 103 L18 90Z" fill="#202120" /></g></svg>;
  return <svg viewBox="0 0 300 200" aria-hidden="true"><rect x="87" y="-10" width="126" height="230" rx="6" fill="#292c2a" /><path d="M150 0 V200" stroke="#fff9ee" strokeWidth="3" strokeDasharray="16 14" opacity=".65" /><path d="M87 48 H213" stroke="#d5ff58" strokeWidth="8" /><g className="preview-car"><rect x="124" y="70" width="52" height="93" rx="15" fill="#fff9ee" stroke="#202120" strokeWidth="4" /><rect x="132" y="84" width="36" height="21" rx="6" fill="#292c2a" /><path d="M133 141 H167" stroke="#ff779d" strokeWidth="5" /></g></svg>;
}

/** Always-visible name + account bar: change your name, or save progress to an account. */
function HomeIdentity({ date }: { date: string }) {
  const status = useAuth(s => s.status);
  if (status === 'anon') return <div className="home-identity"><GuestProgressPrompt date={date} /></div>;
  return (
    <div className="home-identity">
      <section className="guest-progress" aria-label="Your name and account">
        <NicknameControl date={date} />
        {status === 'linked'
          ? <a className="link-btn" href="/profile">✓ saved · My account</a>
          : <a className="btn btn-primary home-save" href="/profile">💾 Save progress</a>}
      </section>
    </div>
  );
}
