import { useDailyAllowance } from './lib/dailyAllowance';
import { routeToken, routeHref, navigateTo } from './lib/navigation';
import { ExplorePage, HowToPlayPage, RankingsPage } from './components/DiscoverPages';
import { updatePageMeta } from './lib/pageMeta';
import { MobileNav } from './components/MobileNav';
import { LeaguePage } from './components/LeaguePage';
import { GoogleOneTap } from './components/GoogleOneTap';
import { LevelScreen } from './components/LevelScreen';
import { BalancePage } from './components/BalancePage';
import { CountPage } from './components/CountPage';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { MODES, type Mode } from './config';
import { GameScreen } from './components/GameScreen';
import { Home } from './components/Home';
import { FaqPage } from './components/FaqPage';
import { FriendsPage } from './components/FriendsPage';
import { readFriendInvite } from './lib/friends';
import { MePage } from './components/MePage';
import { MenuModal } from './components/MenuModal';
import { PrivacyPage } from './components/PrivacyPage';
import { SettingsModal } from './components/SettingsModal';
import { C } from './games/types';
import { sfx } from './lib/audio';
import { todayUTC } from './lib/daily';
import { usePlayer } from './lib/store';
import { whenAuthReady, useAuth } from './lib/auth';
import { toast, useUi } from './lib/ui';
import { tag, track } from './lib/clarity';
import { useCreator } from './lib/creator';

const PartyPage = lazy(() => import('./components/PartyPage').then(module => ({ default: module.PartyPage })));

const PAGES = ['privacy', 'faq', 'me', 'friends', 'challenges', 'party', 'levels', 'balance', 'count', 'league', 'creator', 'games', 'how', 'leaderboard'] as const;
const CreatorPage = lazy(() => import('./components/CreatorPage').then(module => ({ default: module.CreatorPage })));
const ChallengePreview = import.meta.env.DEV
  ? lazy(() => import('./components/ChallengesPage').then(module => ({ default: module.ChallengesPage })))
  : null;
type Page = (typeof PAGES)[number];
export type Route = Mode | Page | null;

const parseRoute = (): Route => {
  const h = routeToken().replace('#', '').split('/')[0];
  if (h === 'challenges' && !import.meta.env.DEV) return null;
  if (PAGES.includes(h as Page)) return h as Page;
  return MODES.includes(h as Mode) ? (h as Mode) : null;
};

export default function App() {
  const linkedAllowance = useDailyAllowance(s => s.linked);
  const levelIdentity = useAuth(s => s.userId);
  const [mode, setMode] = useState<Route>(parseRoute);
  useEffect(() => { document.body.classList.toggle('homepage-active', mode === null); return () => document.body.classList.remove('homepage-active'); }, [mode]);
  const [routeKey, setRouteKey] = useState(() => location.pathname + location.search);
  const [inviteToken, setInviteToken] = useState(readFriendInvite);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const settings = usePlayer((s) => s.settings);
  const [date, setDate] = useState(todayUTC);
  const muted = usePlayer((s) => s.muted);
  const toastState = useUi((s) => s.toast);
  const creatorClean = useCreator((s) => s.enabled && s.clean);
  useEffect(() => { document.body.classList.toggle('creator-clean', creatorClean); }, [creatorClean]);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setMode(parseRoute());
      setRouteKey(location.pathname + location.search);
      setInviteToken(readFriendInvite());
    };
    window.addEventListener('skilly:navigate', onHash);
    return () => window.removeEventListener('skilly:navigate', onHash);
  }, []);

  // new UTC day → new challenges
  useEffect(() => {
    const id = setInterval(() => {
      const d = todayUTC();
      if (d !== date) {
        setDate(d);
        toast('🌅 New day, new challenges!');
        const current = parseRoute();
        if (current === null || MODES.includes(current as Mode)) navigateTo('/');
      }
    }, 1000);
    return () => clearInterval(id);
  }, [date]);

  useEffect(() => {
    void whenAuthReady();
  }, []);

  useEffect(() => {
    updatePageMeta();
    const page = mode ?? 'home';
    track(`page_${page}`);
    tag('page', page);
  }, [mode, routeKey]);

  useEffect(() => sfx.setMuted(muted), [muted]);

  useEffect(() => {
    document.body.classList.toggle('colorblind', settings.colorblind);
    document.body.classList.toggle('low-power', settings.lowPower);
    // canvas palette follows the same colorblind swap as the CSS
    C.green = settings.colorblind ? '#ffad55' : '#b9ed91';
    C.yellow = settings.colorblind ? '#8fc8ff' : '#ffd27c';
  }, [settings.colorblind, settings.lowPower]);

  useEffect(() => {
    if (!toastState) return;
    setToastVisible(true);
    const id = setTimeout(() => setToastVisible(false), 2400);
    return () => clearTimeout(id);
  }, [toastState]);

  const navigate = (m: Route) => {
    navigateTo(routeHref(m));
    setMode(m);
    window.scrollTo({ top: 0 });
  };

  return (
    <MotionConfig reducedMotion={settings.lowPower ? 'always' : 'user'}>
      <header className={`topbar ${mode === null ? 'topbar-home' : ''}`}>
        <button className="corner-btn px-box header-menu-button" onClick={() => { track('menu_open'); setMenuOpen(true); }} aria-label="Open menu">
          <span aria-hidden="true">☰</span><span className="header-menu-label">Menu</span>
        </button>
        {mode !== null ? (
          <div className="header-home-nav">
          <a
            className="mini-logo"
            href="/"
            aria-label="SKILLY home"
            onClick={(e) => {
              e.preventDefault();
              navigate(null);
            }}
          >
            skilly<span>.</span>
          </a>
          <a className="header-daily-link" href="/" onClick={e=>{e.preventDefault();navigate(null);}}><span aria-hidden="true">&#8592;</span> Daily games</a>
          </div>
        ) : (
          <a href="/" className="brand-logo home-header-logo" aria-label="Skilly home">skilly<span>.</span><i aria-hidden="true">&#10035;</i></a>
        )}
        <div className="topbar-right"><nav className="desktop-nav primary-nav" aria-label="Main navigation">
          <a href="/" aria-current={mode === null || MODES.includes(mode as Mode) ? 'page' : undefined}>Play</a>
          <a href="/leaderboards" aria-current={mode === 'leaderboard' ? 'page' : undefined}>Rankings</a>
          <a href="/profile" aria-current={mode === 'me' ? 'page' : undefined}>My progress</a>
        </nav></div>
      </header>
      <main data-account-tries={linkedAllowance ? 8 : 5} id="app" key={settings.colorblind ? 'cb' : 'std'}>
        {mode === 'games' ? <ExplorePage /> : mode === 'how' ? <HowToPlayPage /> : mode === 'leaderboard' ? <RankingsPage date={date} /> : mode === 'challenges' ? (
          ChallengePreview ? <Suspense fallback={<p>Loading preview…</p>}><ChallengePreview today={date} /></Suspense> : <Home date={date} onPlay={navigate} />
        ) : mode === 'creator' ? (
          <Suspense fallback={<p>Loading studio…</p>}><CreatorPage date={date} onPlay={navigate} /></Suspense>
        ) : mode === 'league' ? (
          <LeaguePage date={date} />
        ) : mode === 'count' ? (
          <CountPage date={date} />
        ) : mode === 'balance' ? (
          <BalancePage key={date} date={date} />
        ) : mode === 'privacy' ? (
          <PrivacyPage />
        ) : mode === 'faq' ? (
          <FaqPage />
        ) : mode === 'me' ? (
          <MePage date={date} onPlay={navigate} />
        ) : mode === 'levels' ? (
          <LevelScreen key={`${routeKey}:${date}:${levelIdentity}`} mode={routeToken().split('/')[1] === 'cut' ? 'cut' : routeToken().split('/')[1] === 'brake' ? 'brake' : 'draw'} date={date} />
        ) : mode === 'party' ? (
          <Suspense fallback={<p>Loading party...</p>}><PartyPage /></Suspense>
        ) : mode === 'friends' ? (
          <FriendsPage date={date} inviteToken={inviteToken} />
        ) : mode ? (
          <GameScreen key={`${mode}:${date}`} mode={mode} date={date} onNavigate={navigate} />
        ) : (
          <Home date={date} onPlay={navigate} />
        )}
      </main>
      <MobileNav active={mode === 'leaderboard' ? 'rankings' : mode === 'me' ? 'progress' : mode === null || MODES.includes(mode as Mode) || ['games', 'levels', 'balance', 'count', 'party'].includes(mode ?? '') ? 'play' : null} />
      <footer className="site-footer"><a className="footer-brand" href="/">skilly<span>.</span></a><p>Think you have got skill? Prove it.</p><nav aria-label="Footer"><a href="/games">All games</a><a href="/leagues">Leagues</a><a href="/leaderboards">Rankings</a><a href="/how-to-play">How to play</a><a href="/faq">FAQ</a><a href="/privacy">Privacy</a></nav><small>3 daily games. 5 guest tries. 8 with an account.</small></footer>
      <GoogleOneTap eligible={(mode === null || mode === 'me') && !menuOpen && !settingsOpen} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <MenuModal
        open={menuOpen}
        route={mode}
        onClose={() => setMenuOpen(false)}
        onNavigate={navigate}
        onSettings={() => setSettingsOpen(true)}
      />

      <AnimatePresence>
        {toastVisible && toastState && (
          <motion.div
            key={toastState.id}
            className="toast px-box"
            role="status"
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
          >
            {toastState.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
