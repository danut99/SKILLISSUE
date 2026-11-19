import { GamePlayerCount, useGamePlayerCounts } from './GamePlayerCount';
import { ReturnPoll } from './ReturnPoll';
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
import { InstallButton } from './InstallButton';
import { dailyShape } from '../games/cutGame';
import { polygonCentroid } from '../lib/geometry';

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
  const playerCounts = useGamePlayerCounts();
  const lowPower = usePlayer(s => s.settings.lowPower);
  const reducedMotion = useReducedMotion();
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
          <span className="logo-skill">SKILL</span><span className="logo-issue">Y</span>
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

        <div className="hero-status">
        <div className="meta">
          <span className="pill hero-progress"><span className="hero-stat-label">TODAY #{dayNumber(date)}</span> {MODES.filter(m => modeDay(days, date, m).tries.length > 0).length}/3 played</span>
          {liveStreak > 0 && <span className="pill">🔥 {liveStreak} day streak</span>}
          <span className="pill">
            <span className="hero-stat-label">NEXT RESET</span> <Countdown />
          </span>
        </div>
        <HomeIdentity date={date} />
        </div>
      </header>

      <div className="with-board">
      <div className="main-col">

      <FeaturedCut date={date} onPlay={() => { track('home_card_cut'); onPlay('cut'); }} />

      <div className="also-today">
        <div className="eyebrow">also today</div>
        <div className="also-cards">
          {MODES.filter(m => m !== 'cut').map((m, i) => {
            const md = modeDay(days, date, m);
            const best = bestAttempt(md);
            const info = MODE_INFO[m];
            return (
              <motion.button
                key={m}
                className="game-card px-box mini-card"
                style={{ ['--accent' as string]: info.color }}
                onClick={() => { track(`home_card_${m}`); onPlay(m); }}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + 0.08 * i }}
                whileTap={{ scale: 0.97 }}
              >
                <GamePlayerCount count={playerCounts[m]} />
                <PixelIcon name={m} size={48} />
                <span className="gc-title">{info.title}</span>
                <span className="gc-tag">{m === 'draw' ? `Today's ${dailyDrawShape(date)}. One stroke.` : info.tagline}</span>
                <span className="gc-tries" aria-hidden="true">{emojiRow(md) + '⬜'.repeat(Math.max(0, maxTries(md) - md.tries.length))}</span>
                <span className={`gc-cta ${best ? 'played' : ''}`}>{best ? <><small>best</small> {fmtResult(m, best)}</> : <>play ▶</>}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      <InstallButton />

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

      {playedAny && <div className="home-account">
        <ReturnPoll date={date} compact />
      </div>}

      <details className="home-more" open={location.hash === '#more'}>
        <summary>&#9656; more games &amp; modes</summary>

        <div className="home-levels">
          <div className="eyebrow">level ladders</div>
          {MODES.map(m => {
            const level = levelRows.find(row => row.mode === m) ?? { level: 1, used: 0, records: [] };
            const done = level.level > levelCount(m);
            return <a key={m} className="home-level-link" href={`#levels/${m}`} style={{ ['--accent' as string]: MODE_INFO[m].color }}>
              <PixelIcon name={m} size={28} />
              <span>{MODE_INFO[m].name}</span>
              <small>{done ? 'all cleared' : `level ${level.level}/${levelCount(m)} · ${Math.max(0, LEVEL_TRIES - level.used)} tries`}</small>
            </a>;
          })}
        </div>

        <a className="card px-box balance-promo" href="#balance">
          <GamePlayerCount count={playerCounts.balance} />
          <PixelIcon name="balance" size={64} />
          <div><span className="party-beta">Playable beta</span><h2>BALANCE!</h2><p>One plank. Two creatures. Find the balance point.</p></div>
          <span className="btn btn-primary">Try Balance! &#8594;</span>
        </a>

        <a className="card px-box balance-promo count-promo" href="#count">
          <GamePlayerCount count={playerCounts.count} />
          <PixelIcon name="count" size={64} />
          <div><span className="party-beta">New challenge</span><h2>COUNT FAST</h2><p>A quick flash. How many dots? Five rounds to prove your eyes work.</p></div>
          <span className="btn btn-primary">Play Count Fast →</span>
        </a>

        <a className="card px-box home-party party-promo" href="#party" aria-labelledby="home-party-title">
          <div className="party-promo-main">
            <div className="party-promo-copy">
              <div className="party-promo-heading"><h2 id="home-party-title">PARTY MODE</h2><span className="party-beta">Beta</span></div>
              <p className="party-promo-hook">Who's the skill issue in your group?</p>
              <p className="party-promo-details">2&ndash;8 players &middot; Draw, Cut &amp; Car &middot; Play together</p>
            </div>
            <div className="party-promo-icons" aria-hidden="true"><PixelIcon name="draw" size={42} /><PixelIcon name="cut" size={42} /><PixelIcon name="brake" size={42} /></div>
            <span className="btn btn-primary party-promo-link">Play with friends <span aria-hidden="true">&#8594;</span></span>
          </div>
          <div className="party-promo-footer"><PartyStats /><small>In testing &mdash; you may run into bugs.</small></div>
        </a>

        <LeagueCard date={date} />
        <RecentChampions date={date} />
      </details>

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

      {authStatus !== 'anon' && <AccountCard />}
      </div>

      <aside className="board-col" id="today-leaderboard">
      <ResponsiveSection title="Leaderboards"><Leaderboard mode="overall" date={date} title="Top Tryhards" /></ResponsiveSection>
      <ResponsiveSection title="Your challenges"><ChallengeInbox compact /></ResponsiveSection>
      </aside>
      </div>

      <p className="footer-note">
        <a href="/cut-in-half/">cut in half game</a> · <a href="/draw-perfect-circle/">draw a perfect circle</a> · <a href="/brake-game/">brake game</a>
        <br />
        <a href="#privacy">privacy</a> · <a href="#how">how to play</a>
        {LINKS.tiktok && <> &middot; <a href={LINKS.tiktok} target="_blank" rel="noopener noreferrer">TikTok @playskillissue</a></>}
      </p>
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} date={date} />
    </section>
  );
}

/** The hero game: today's Cut blob, big and front and center. */
function FeaturedCut({ date, onPlay }: { date: string; onPlay: () => void }) {
  const days = usePlayer(s => s.days);
  const md = modeDay(days, date, 'cut');
  const best = bestAttempt(md);
  const left = triesLeft(md);
  const info = MODE_INFO.cut;
  const shape = dailyShape(date);
  const c = polygonCentroid(shape.poly);
  const points = shape.poly.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const xs = shape.poly.map(p => p.x), ys = shape.poly.map(p => p.y);
  const pad = 24;
  const box = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
  return (
    <motion.button
      className="game-card px-box featured-cut"
      style={{ ['--accent' as string]: info.color }}
      onClick={onPlay}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 18 }}
      whileTap={{ scale: 0.98 }}
    >
      <span className="gc-num">today's main event</span>
      <svg className="fc-blob" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} aria-hidden="true">
        <polygon points={points} fill={shape.color} stroke="#000" strokeWidth="8" strokeLinejoin="round" />
        {[-22, 22].map(dx => <g key={dx}>
          <circle cx={c.x + dx} cy={c.y - 10} r="17" fill="#fff" stroke="#000" strokeWidth="5" />
          <circle className="fc-pupil" cx={c.x + dx + 4} cy={c.y - 6} r="7" fill="#000" />
        </g>)}
        <line className="fc-slice" x1={box.x} y1={box.y + box.h * .9} x2={box.x + box.w} y2={box.y + box.h * .1} stroke="#fff" strokeWidth="5" strokeDasharray="14 10" />
      </svg>
      <span className="gc-title">{info.title}</span>
      <span className="gc-tag">One cut. Exactly 50/50. Everyone on earth gets this blob today.</span>
      <span className="gc-tries"><span aria-hidden="true">{emojiRow(md) + '⬜'.repeat(Math.max(0, maxTries(md) - md.tries.length))}</span> <span className="gc-attempt-label">{left} tries left</span></span>
      <span className={`gc-cta ${best ? 'played' : ''}`}>
        {best ? <><small>best {fmtResult('cut', best)}</small>{left > 0 ? 'try again ▶' : 'out of tries'}</> : <>cut it ▶</>}
      </span>
    </motion.button>
  );
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
          ? <a className="link-btn" href="#me">✓ saved · My account</a>
          : <a className="btn btn-primary home-save" href="#me">💾 Save progress</a>}
      </section>
    </div>
  );
}
