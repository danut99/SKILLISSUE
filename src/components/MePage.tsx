import { LeagueCareer } from './LeaguePage';
import { RankCalendar } from './RankCalendar';
import { lazy, Suspense, type ReactNode } from 'react';
const ProgressCharts = lazy(() => import('./ProgressCharts'));
import { CAR_SKINS, MODE_INFO, MODES, type Mode } from '../config';
import { emojiRow, fmtResult } from '../lib/scoring';
import { bestAttempt, maxTries, modeDay, usePlayer } from '../lib/store';
import { AccountCard } from './AccountCard';
import { NicknameControl } from './NicknameControl';

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="me-section">
      <h2 className="me-label">
        <span>{label}</span>
      </h2>
      {children}
    </section>
  );
}

/** "My Krillion"-style logbook: clean labels, stat strip, list rows, garage tiles. */
export function MePage({ date, onPlay }: { date: string; onPlay: (m: Mode) => void }) {
  const { streak, bestStreak, daysPlayed, bestTotal, nickname, days, carSkin, setCarSkin } = usePlayer();

  return (
    <section className="screen me-page profile-page">

      <header className="me-hero">
        <p className="me-eyebrow">your logbook</p>
        <h1>My Skilly</h1>
        <p className="me-sub">{nickname ? `Playing as ${nickname}` : 'Your scores, progress and daily places.'}</p>
      </header>


      <div className="profile-account-banner">
      <Section label="account">
        <div className="me-box me-nickname">
          <NicknameControl date={date} />
        </div>
        <AccountCard page />
      </Section>
      </div>
      <LeagueCareer date={date} />
      <div className="profile-overview">
        <div className="profile-progress-column">
      <Suspense fallback={<p role="status">Loading progress charts...</p>}><ProgressCharts date={date}><div className="progress-lifetime"><h3 className="progress-chart-title">Overall stats</h3>        <dl className="me-stats">
          <div>
            <dt>Current streak</dt>
            <dd>{streak}</dd>
          </div>
          <div>
            <dt>Best streak</dt>
            <dd>{bestStreak}</dd>
          </div>
          <div>
            <dt>Days played</dt>
            <dd>{daysPlayed}</dd>
          </div>
          <div>
            <dt>Best daily total</dt>
            <dd>{bestTotal.toFixed(1)}</dd>
          </div>
        </dl>
        <p className="me-note">Streaks grow when you play on consecutive days.</p>
</div></ProgressCharts></Suspense>
        </div>
        <div className="profile-summary-column">
      <RankCalendar date={date} />
      <Section label="today's tests">
        <ul className="me-list">
          {MODES.map((m) => {
            const md = modeDay(days, date, m);
            const best = bestAttempt(md);
            const dots = emojiRow(md) + '⬜'.repeat(Math.max(0, maxTries(md) - md.tries.length));
            return (
              <li key={m}>
                <button onClick={() => onPlay(m)}>{MODE_INFO[m].title} →</button>
                <span>
                  {best ? fmtResult(m, best) : 'not played'} <span className="emojis">{dots}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>


      <Section label="friends">
        <div className="me-box">
          <p>Compare daily scores with your friends.</p>
          <a className="btn btn-primary" href="#friends">Invite friends</a>
        </div>
      </Section>


        </div>
      </div>
      <div className="profile-settings-grid">
      <Section label="garage">
        <div className="me-garage">
          {CAR_SKINS.map((s) => {
            const unlocked = bestStreak >= s.streak;
            const picked = carSkin === s.id;
            return (
              <button
                key={s.id}
                className={`me-car ${unlocked ? '' : 'locked'} ${picked ? 'picked' : ''}`}
                disabled={!unlocked}
                onClick={() => setCarSkin(s.id)}
                title={unlocked ? `Drive the ${s.name}` : `Unlocks at a ${s.streak}-day streak`}
              >
                <img className="garage-car-art" src={`${import.meta.env.BASE_URL}art/pixellab/car-top-${s.id}.png`} width="48" height="80" alt="" />
                <span className="me-car-name">{s.name}</span>
                <span className="me-car-req">{picked ? 'Driving' : unlocked ? 'Earned' : `${s.streak}-day streak`}</span>
              </button>
            );
          })}
        </div>
      </Section>

      </div>
    </section>
  );
}
