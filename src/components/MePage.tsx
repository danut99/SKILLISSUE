import type { ReactNode } from 'react';
import { CAR_SKINS, MODE_INFO, MODES, type Mode } from '../config';
import { emojiRow, fmtResult } from '../lib/scoring';
import { bestAttempt, maxTries, modeDay, usePlayer } from '../lib/store';
import { AccountCard } from './AccountCard';

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
    <section className="screen me-page">

      <header className="me-hero">
        <p className="me-eyebrow">your logbook</p>
        <h1>My Skill Issue</h1>
        <p className="me-sub">{nickname ? `Playing as ${nickname}. One history, every device.` : 'Your tests. One history. Every device.'}</p>
      </header>

      <Section label="account">
        <AccountCard page />
      </Section>

      <Section label="friends">
        <div className="me-box">
          <h3>Play with your friends.</h3>
          <p>Invite friends and compare daily scores on your own private leaderboard.</p>
          <a className="btn btn-primary" href="#friends">Invite friends</a>
        </div>
      </Section>

      <Section label="on this device">
        <dl className="me-stats">
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
        <p className="me-note">Streaks count consecutive days with at least one try. Each new day starts at 00:00 UTC.</p>
      </Section>

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
          <li className="dim">
            <span>Archive →</span>
            <span>coming soon</span>
          </li>
          <li className="dim">
            <span>Practice mode →</span>
            <span>coming soon</span>
          </li>
        </ul>
      </Section>

      <Section label="garage · brake! cars">
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
    </section>
  );
}
