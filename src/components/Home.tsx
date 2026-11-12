import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { MODE_INFO, MODES, type Mode } from '../config';
import { addDays, dayNumber } from '../lib/daily';
import { emojiRow, fmtResult, overallBadge } from '../lib/scoring';
import { bestAttempt, maxTries, modeDay, totalScore, usePlayer } from '../lib/store';
import { Countdown } from './Countdown';
import { Leaderboard } from './Leaderboard';
import { ShareModal } from './ShareModal';
import { AccountCard } from './AccountCard';

/** Challenging / mocking one-liners under the logo. Random per visit, tap for another. */
const TAGLINES = [
  "3 easy tests. you'll still fail.",
  "your hands shake. we can tell. 🫵",
  "a toddler scored 94% yesterday. just saying.",
  "draw a circle. how hard can it be? (very.)",
  "your grandma brakes better than you.",
  "100% is possible. not for you, but possible.",
  "go on. prove it's not a skill issue.",
  "3 tries. 0 excuses. infinite shame.",
  "the blob believes in you. we don't.",
  "everyone on earth gets the same test. most fail.",
];

interface Props {
  date: string;
  onPlay: (mode: Mode) => void;
}

export function Home({ date, onPlay }: Props) {
  const [line, setLine] = useState(() => Math.floor(Math.random() * TAGLINES.length));
  const [paused, setPaused] = useState(false);
  // rotate the taunt every 4s; paused while hovered, timer restarts after a click
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setLine((i) => (i + 1) % TAGLINES.length), 4000);
    return () => clearInterval(id);
  }, [line, paused]);
  const days = usePlayer((s) => s.days);
  const streak = usePlayer((s) => s.streak);
  const lastDay = usePlayer((s) => s.lastDay);
  const total = totalScore(days, date);
  const playedAny = MODES.some((m) => modeDay(days, date, m).tries.length > 0);
  const liveStreak = lastDay === date || lastDay === addDays(date, -1) ? streak : 0;


  const [shareOpen, setShareOpen] = useState(false);
  const shareDay = () => setShareOpen(true);

  return (
    <section className="screen home">
      <header className="hero">
        <motion.h1 className="logo" initial={{ scale: 0.6, rotate: -6 }} animate={{ scale: 1, rotate: -2 }} transition={{ type: 'spring', stiffness: 200, damping: 10 }}>
          SKILL<span>ISSUE</span>
          <span className="melt">🫠</span>
        </motion.h1>
        <button
          className="tagline taunt"
          onClick={() => setLine((i) => (i + 1) % TAGLINES.length)}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          title="click for another insult"
        >
          <motion.span key={line} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} style={{ display: 'inline-block' }}>
            {TAGLINES[line]}
          </motion.span>
        </button>
        <details className="how2" id="how" open={location.hash === '#how'}>
          <summary>▸ how to play</summary>
          <ul>
            <li>3 stupid tests a day. same for everyone on earth.</li>
            <li>3 tries each. only your best counts.</li>
            <li>🎯 draw a circle in one stroke. 🔪 cut the blob 50/50. 🚗 brake before the wall.</li>
            <li>out of tries? come back tomorrow. or cope.</li>
            <li>every try is saved to the global top 10 under a random silly name. change it anytime.</li>
            <li>play daily to grow your 🔥 streak and unlock cars.</li>
            <li>new tests every day at 00:00 UTC.</li>
          </ul>
          <div className="how-save">
            <b>⚠️ where is your progress saved?</b>
            <p>
              <span className="tag guest">guest</span> right now everything (name, streak, scores, cars) lives only on <b>this device &amp; browser</b>.
              Clear your browser or switch phones and it's gone.
            </p>
            <p>
              <span className="tag acc">account</span> sign in with Google or email (free, no password) and your progress is tied to your account, so
              you can continue on <b>any device</b>.
            </p>
            <a className="btn btn-primary how-cta" href="#me">
              🔒 save my progress
            </a>
          </div>
        </details>
        <div className="meta">
          <span className="pill">#{dayNumber(date)}</span>
          {liveStreak > 0 && <span className="pill">🔥 {liveStreak} day streak</span>}
          <span className="pill">
            ⏳ new in <Countdown />
          </span>
        </div>
      </header>

      <div className="with-board">
      <div className="main-col">

      <div className="cards">
      {MODES.map((m, i) => {
        const md = modeDay(days, date, m);
        const best = bestAttempt(md);
        const info = MODE_INFO[m];
        const dots = emojiRow(md) + '⬜'.repeat(Math.max(0, maxTries(md) - md.tries.length));
        return (
          <motion.button
            key={m}
            className="game-card px-box"
            style={{ ['--accent' as string]: info.color }}
            onClick={() => onPlay(m)}
            initial={{ opacity: 0, x: i % 2 ? 30 : -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i }}
            whileHover={{ rotate: i % 2 ? 1 : -1, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="gc-num">test 0{i + 1}</span>
            <div className="gc-emoji">{info.emoji}</div>
            <div className="gc-body">
              <div className="gc-title">{info.title}</div>
              <div className="gc-tag">{info.tagline}</div>
              <div className="gc-tries">{dots}</div>
            </div>
            <div className={`gc-cta ${best ? 'played' : ''}`}>
              {best ? (
                <>
                  <small>best</small> {fmtResult(m, best)}
                </>
              ) : (
                <>play ▶</>
              )}
            </div>
          </motion.button>
        );
      })}
      </div>

      {playedAny && (
        <div className="card px-box total-card">
          <div className="eyebrow">today's total</div>
          <div className="total-score">
            {total.toFixed(1)}
            <small>/300</small>
          </div>
          <div className="badge">{overallBadge(total)}</div>
          <button className="btn btn-primary wide" onClick={shareDay}>
            📤 share my day
          </button>
        </div>
      )}

      <AccountCard />
      </div>

      <aside className="board-col">
      <Leaderboard mode="overall" date={date} title="🏆 Grand Master · Today's Top 10" />
      </aside>
      </div>

      <p className="footer-note">
        no account needed. <a href="#privacy">privacy</a> · <a href="#how">how to play</a>
      </p>
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} date={date} />
    </section>
  );
}
