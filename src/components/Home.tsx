import { LeagueCard } from './LeaguePage';
import { ResponsiveSection } from './ResponsiveSection';
import { LEVEL_TRIES, levelCount, loadLevels, useLevels } from '../lib/levels';
import { GuestProgressPrompt } from './GuestProgressPrompt';
import { track } from '../lib/clarity';
import { useAuth } from '../lib/auth';
import { RecentChampions } from './RecentChampions';
import { PartyStats } from './PartyStats';
import { ChallengeInbox } from './ChallengeInbox';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { LINKS, MODE_INFO, MODES, type Mode } from '../config';
import { addDays, dayNumber } from '../lib/daily';
import { emojiRow, fmtResult, overallBadge } from '../lib/scoring';
import { bestAttempt, maxTries, triesLeft, modeDay, totalScore, usePlayer } from '../lib/store';
import { Countdown } from './Countdown';
import { Leaderboard } from './Leaderboard';
import { ShareModal } from './ShareModal';
import { AccountCard } from './AccountCard';
import { NicknameControl } from './NicknameControl';
import { pixelArtUrl, preloadPixelCars } from '../lib/pixelAssets';
import { dailyDrawShape } from '../lib/drawShapes';
import { PixelIcon } from './PixelIcon';

/** Challenging / mocking one-liners under the logo. Random per visit, tap for another. */
const TAGLINES = [
  "3 easy tests. you'll still fail.",
  "your hands shake. we can tell.",
  "a toddler scored 94% yesterday. just saying.",
  "draw a shape. how hard can it be? (very.)",
  "your grandma brakes better than you.",
  "100% is possible. not for you, but possible.",
  "go on. prove it's not a skill issue.",
  "5 tries. 0 excuses. infinite shame.",
  "the blob believes in you. we don't.",
  "everyone on earth gets the same test. most fail.",
];

interface Props {
  date: string;
  onPlay: (mode: Mode) => void;
}

export function Home({ date, onPlay }: Props) {
  const lowPower = usePlayer(s => s.settings.lowPower);
  const reducedMotion = useReducedMotion();
  const [gameModes, setGameModes] = useState<Record<string, 'daily' | 'level'>>({});
  const levelOwner = useAuth(s => s.userId);
  const authStatus = useAuth(s => s.status);
  const levelState = useLevels();
  const levelRows = levelState.owner === levelOwner ? levelState.rows : [];
  useEffect(() => {
    if (authStatus === 'anon' || authStatus === 'linked') void loadLevels(levelOwner).catch(() => {});
  }, [levelOwner, authStatus, date]);
  useEffect(() => { preloadPixelCars(); }, []);
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
  const shareDay = () => {
    track('share_open_day');
    setShareOpen(true);
  };

  return (
    <section className="screen home">
      <header className="hero">
        <motion.h1 className="logo" initial={{ scale: 0.6, rotate: -6 }} animate={{ scale: 1, rotate: -2 }} transition={{ type: 'spring', stiffness: 200, damping: 10 }}>
          <span className="logo-skill">SKILL</span><span className="logo-issue">ISSUE</span>
        </motion.h1>
        <button
          className="tagline taunt"
          onClick={() => setLine((i) => (i + 1) % TAGLINES.length)}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          title="click for another insult"
        >
          <img className="taunt-demon" src={pixelArtUrl(lowPower || reducedMotion ? 'demon-192.png' : 'demon-taunt.webp')} width="56" height="56" alt="" aria-hidden="true"
            onError={e => {
              const fallback = pixelArtUrl('demon-192.png');
              if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback;
            }} />
          <motion.span className="taunt-speech" key={line} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} style={{ display: 'inline-block' }}>
            {TAGLINES[line]}
          </motion.span>
        </button>

        <div className="meta">
          <span className="pill hero-progress"><span className="hero-stat-label">TODAY #{dayNumber(date)}</span> {MODES.filter(m => modeDay(days, date, m).tries.length > 0).length}/3 played</span>
          {liveStreak > 0 && <span className="pill">🔥 {liveStreak} day streak</span>}
          <span className="pill">
            <span className="hero-stat-label">NEXT RESET</span> <Countdown />
          </span>
        </div>
        <details className="how2" id="how" open={location.hash === '#how'}>
          <summary>&#9656; how to play</summary>
          <ul>
            <li>3 stupid tests a day. same for everyone on earth.</li>
            <li>5 tries each. only your best counts.</li>
            <li>draw today's shape in one stroke. cut today's shape 50/50. nail today's driving objective.</li>
            <li>out of tries? come back tomorrow. or cope.</li>
            <li>every try is saved to the global top 10 under a random silly name. change it anytime.</li>
            <li>play daily to grow your &#128293; streak and unlock cars.</li>
            <li>new tests every day at 00:00 UTC.</li>
          </ul>
          <div className="how-save">
            <b>where is your progress saved?</b>
            <p>
              <span className="tag guest">guest</span> right now everything (name, streak, scores, cars) lives only on <b>this device &amp; browser</b>.
              Clear your browser or switch phones and it's gone.
            </p>
            <p>
              <span className="tag acc">account</span> sign in with email (free, no password) and your progress is tied to your account, so
              you can continue on <b>any device</b>.
            </p>
            <a className="btn btn-primary how-cta" href="#me">
              save my progress
            </a>
          </div>
        </details>
      </header>

      <div className="with-board">
      <div className="main-col">

      <div className="home-account">
        <GuestProgressPrompt date={date} />
        {authStatus === 'linked' && <section className="guest-progress" aria-label="Your name and account">
          <NicknameControl date={date} />
          <a className="link-btn" href="#me">My account</a>
          <p className="guest-progress-note">Your progress is saved to your account.</p>
        </section>}
      </div>
      <div className="cards">
      {MODES.map((m, i) => {
        const levelMode = gameModes[m] === 'level';
        const level = levelRows.find(row => row.mode === m) ?? { level: 1, used: 0, records: [] };
        const md = modeDay(days, date, m);
        const best = bestAttempt(md);
        const info = MODE_INFO[m];
        const dots = emojiRow(md) + '⬜'.repeat(Math.max(0, maxTries(md) - md.tries.length));
        return (
          <div className="game-mode-card" key={m} style={{ ['--accent' as string]: info.color }}>
          <div className="game-mode-switch" role="group" aria-label={`${info.title} mode`}>
            <button aria-pressed={!levelMode} onClick={() => setGameModes(s => ({...s, [m]: 'daily'}))}>Daily</button><button aria-pressed={levelMode} onClick={() => setGameModes(s => ({...s, [m]: 'level'}))}>Levels</button>
          </div>
          <motion.button
            className="game-card px-box"
            style={{ ['--accent' as string]: info.color }}
            onClick={() => { track(`home_card_${m}`); if (levelMode) location.hash = `levels/${m}`; else onPlay(m); }}
            initial={{ opacity: 0, x: i % 2 ? 30 : -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 * i }}
            whileHover={{ rotate: i % 2 ? 1 : -1, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="gc-num">test 0{i + 1}</span>
            <div className="gc-emoji"><PixelIcon name={m} size={64} /></div>
            <div className="gc-body">
              <div className="gc-title">{info.title}</div>
              <div className="gc-tag">{levelMode ? `Reach 85+. ${LEVEL_TRIES} tries per level. Pass to advance.` : m === 'draw' ? `Today's ${dailyDrawShape(date)}. One stroke. No excuses.` : info.tagline}</div>
              <div className="gc-tries">{levelMode ? level.level > levelCount(m) ? 'All levels cleared' : `Level ${level.level} / ${levelCount(m)} - ${Math.max(0,LEVEL_TRIES-level.used)} tries left` : <><span aria-hidden="true">{dots}</span><span className="gc-attempt-label">{triesLeft(md)} tries left</span></>}</div>
              {levelMode && <div className="gc-level-stars">&#9733; {(level.records ?? []).reduce((sum, r) => sum + r.stars, 0)} / {levelCount(m) * 3}</div>}
            </div>
            <div className={`gc-cta ${best ? 'played' : ''}`}>
              {levelMode ? (level.level > levelCount(m) ? 'Ladder cleared' : level.used >= LEVEL_TRIES ? 'Come back tomorrow' : `Play level ${level.level}`) : best ? (
                <>
                  <small>best</small> {fmtResult(m, best)}
                </>
              ) : (
                <>play ▶</>
              )}
            </div>
          </motion.button>
          </div>
        );
      })}
      </div>

      <LeagueCard date={date} />
      <RecentChampions date={date} />

      <a className="card px-box balance-promo" href="#balance">
        <PixelIcon name="balance" size={64} />
        <div><span className="party-beta">Playable beta</span><h2>BALANCE!</h2><p>One plank. Two creatures. Find the balance point.</p></div>
        <span className="btn btn-primary">Try Balance! &#8594;</span>
      </a>

      <a className="card px-box balance-promo count-promo" href="#count">
        <PixelIcon name="count" size={64} />
        <div><span className="party-beta">New challenge</span><h2>COUNT FAST</h2><p>A quick flash. How many dots? Five rounds to prove your eyes work.</p></div>
        <span className="btn btn-primary">Play Count Fast →</span>
      </a>

      <section className="card px-box home-party party-promo" aria-labelledby="home-party-title">
        <div className="party-promo-main">
          <div className="party-promo-copy">
            <div className="party-promo-heading"><h2 id="home-party-title">PARTY MODE</h2><span className="party-beta">Beta</span></div>
            <p className="party-promo-hook">Who's the skill issue in your group?</p>
            <p className="party-promo-details">2&ndash;8 players &middot; Draw, Cut &amp; Car &middot; Play together</p>
          </div>
          <div className="party-promo-icons" aria-hidden="true"><PixelIcon name="draw" size={42} /><PixelIcon name="cut" size={42} /><PixelIcon name="brake" size={42} /></div>
          <a className="btn btn-primary party-promo-link" href="#party">Play with friends <span aria-hidden="true">&#8594;</span></a>
        </div>
        <div className="party-promo-footer"><PartyStats /><small>In testing &mdash; you may run into bugs.</small></div>
      </section>

      {playedAny && (
        <div className="card px-box total-card">
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
              return <button key={mode} className={`daily-total-game ${best ? 'played' : ''}`} onClick={() => onPlay(mode)} aria-label={`${MODE_INFO[mode].title}: ${best ? fmtResult(mode, best) : 'not played'}`}>
                <span className="daily-total-game-label"><PixelIcon name={mode} size={26} />{MODE_INFO[mode].name}</span>
                <span className="daily-total-game-score">{best ? fmtResult(mode, best).replace(/\s*\/\s*/, '/') : 'Not played'}</span>
              </button>;
            })}
          </div>
          {MODES.every(mode => modeDay(days, date, mode).tries.length > 0) && <div className="daily-return-dialogue">
            <div className="daily-companion angel">
              <img src={pixelArtUrl('angel-192.png')} width="64" height="64" alt="" aria-hidden="true" />
              <p><b>Hype Angel</b>{authStatus === 'anon' ? 'Link Google to keep your scores, streak and unlocks across devices. ' : 'Nice work today! '}New challenges in <Countdown />.</p>
            </div>
            <div className="daily-companion demon">
              <img src={pixelArtUrl('demon-192.png')} width="64" height="64" alt="" aria-hidden="true" />
              <p><b>Little Menace</b>{authStatus === 'anon' ? 'Keep your progress. Come back tomorrow. Prove it wasn\'t luck.' : 'Beat today\'s score tomorrow. Prove it wasn\'t luck.'}</p>
            </div>
            {authStatus === 'anon' && <a className="btn btn-primary" href="#me">Link Google</a>}
          </div>}
        </div>
      )}

      {authStatus !== 'anon' && <AccountCard />}
      </div>

      <aside className="board-col" id="today-leaderboard">
      <ResponsiveSection title="Leaderboards"><Leaderboard mode="overall" date={date} title="Top Tryhards" /></ResponsiveSection>
      <ResponsiveSection title="Your challenges"><ChallengeInbox compact /></ResponsiveSection>
      </aside>
      </div>

      <p className="footer-note">
        <a href="#privacy">privacy</a> · <a href="#how">how to play</a>
        {LINKS.tiktok && <> &middot; <a href={LINKS.tiktok} target="_blank" rel="noopener noreferrer">TikTok @playskillissue</a></>}
      </p>
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} date={date} />
    </section>
  );
}
