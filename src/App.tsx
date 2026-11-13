import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { LINKS, MODES, type Mode } from './config';
import { AdBanner } from './components/AdBanner';
import { GameScreen } from './components/GameScreen';
import { PixelIcon } from './components/PixelIcon';
import { Home } from './components/Home';
import { FaqPage } from './components/FaqPage';
import { FriendsPage } from './components/FriendsPage';
import { readFriendInvite } from './lib/friends';
import { MePage } from './components/MePage';
import { MenuModal } from './components/MenuModal';
import { MobileLeaderboard } from './components/MobileLeaderboard';
import { PrivacyPage } from './components/PrivacyPage';
import { SettingsModal } from './components/SettingsModal';
import { C } from './games/types';
import { sfx } from './lib/audio';
import { todayUTC } from './lib/daily';
import { usePlayer } from './lib/store';
import { whenAuthReady } from './lib/auth';
import { toast, useUi } from './lib/ui';
import { tag, track } from './lib/clarity';

const PartyPage = lazy(() => import('./components/PartyPage').then(module => ({ default: module.PartyPage })));

const PAGES = ['privacy', 'faq', 'me', 'friends', 'challenges', 'party'] as const;
const ChallengePreview = import.meta.env.DEV
  ? lazy(() => import('./components/ChallengesPage').then(module => ({ default: module.ChallengesPage })))
  : null;
type Page = (typeof PAGES)[number];
export type Route = Mode | Page | null;

const parseHash = (): Route => {
  const h = location.hash.replace('#', '').split('/')[0];
  if (h === 'challenges' && !import.meta.env.DEV) return null;
  if (PAGES.includes(h as Page)) return h as Page;
  return MODES.includes(h as Mode) ? (h as Mode) : null;
};

export default function App() {
  const [mode, setMode] = useState<Route>(parseHash);
  const [inviteToken, setInviteToken] = useState(readFriendInvite);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const settings = usePlayer((s) => s.settings);
  const [date, setDate] = useState(todayUTC);
  const muted = usePlayer((s) => s.muted);
  const toggleMuted = usePlayer((s) => s.toggleMuted);
  const toastState = useUi((s) => s.toast);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setMode(parseHash());
      setInviteToken(readFriendInvite());
      setLeaderboardOpen(false);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // new UTC day → new challenges
  useEffect(() => {
    const id = setInterval(() => {
      const d = todayUTC();
      if (d !== date) {
        setDate(d);
        toast('🌅 New day, new challenges!');
        const current = parseHash();
        if (current === null || MODES.includes(current as Mode)) location.hash = '';
      }
    }, 1000);
    return () => clearInterval(id);
  }, [date]);

  useEffect(() => {
    void whenAuthReady();
  }, []);

  useEffect(() => {
    const page = mode ?? 'home';
    track(`page_${page}`);
    tag('page', page);
  }, [mode]);

  useEffect(() => sfx.setMuted(muted), [muted]);

  useEffect(() => {
    document.body.classList.toggle('colorblind', settings.colorblind);
    document.body.classList.toggle('low-power', settings.lowPower);
    // canvas palette follows the same colorblind swap as the CSS
    C.green = settings.colorblind ? '#ff9f1c' : '#5dff9d';
    C.yellow = settings.colorblind ? '#4da6ff' : '#ffd23f';
  }, [settings.colorblind, settings.lowPower]);

  useEffect(() => {
    if (!toastState) return;
    setToastVisible(true);
    const id = setTimeout(() => setToastVisible(false), 2400);
    return () => clearTimeout(id);
  }, [toastState]);

  const navigate = (m: Route) => {
    location.hash = m ?? '';
    setMode(m);
    window.scrollTo({ top: 0 });
  };

  return (
    <MotionConfig reducedMotion={settings.lowPower ? 'always' : 'user'}>
      <header className="topbar">
        <button className="corner-btn px-box" onClick={() => { track('menu_open'); setMenuOpen(true); }} aria-label="Open menu">
          ☰
        </button>
        {mode !== null ? (
          <a
            className="mini-logo"
            href="#"
            aria-label="SKILL ISSUE home"
            onClick={(e) => {
              e.preventDefault();
              navigate(null);
            }}
          >
            SKILL<span>ISSUE</span>
          </a>
        ) : (
          <span />
        )}
        <div className="topbar-right">
          <a className="corner-btn px-box header-feedback" href={LINKS.feedback} onClick={() => track('feedback_click')} aria-label="Send feedback by email" title="Send feedback">
            <PixelIcon name="feedback" size={24} />
            <span>Feedback</span>
          </a>
          <button className="corner-btn px-box mobile-leaderboard-button" onClick={() => { track('leaderboard_open'); setLeaderboardOpen(true); }} aria-label="Open leaderboard" aria-haspopup="dialog" aria-expanded={leaderboardOpen}>
            <PixelIcon name="trophy" size={28} />
          </button>
          <button className="corner-btn px-box" onClick={() => { track(muted ? 'sound_on' : 'sound_off'); toggleMuted(); }} aria-label={muted ? 'Turn sound on' : 'Mute sound'} aria-pressed={!muted}>
            <PixelIcon name={muted ? 'sound-off' : 'sound-on'} size={28} />
          </button>
          <button className="corner-btn px-box" onClick={() => { track('settings_open'); setSettingsOpen(true); }} aria-label="Open settings">
            <PixelIcon name="settings" size={28} />
          </button>
        </div>
      </header>
      <main id="app" key={settings.colorblind ? 'cb' : 'std'}>
        {mode === 'challenges' ? (
          ChallengePreview ? <Suspense fallback={<p>Loading preview…</p>}><ChallengePreview today={date} /></Suspense> : <Home date={date} onPlay={navigate} />
        ) : mode === 'privacy' ? (
          <PrivacyPage />
        ) : mode === 'faq' ? (
          <FaqPage />
        ) : mode === 'me' ? (
          <MePage date={date} onPlay={navigate} />
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
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {leaderboardOpen && <MobileLeaderboard key={`${mode}:${date}`} date={date}
        initialMode={mode && MODES.includes(mode as Mode) ? mode as Mode : 'overall'}
        onClose={() => setLeaderboardOpen(false)} />}
      <MenuModal
        open={menuOpen}
        route={mode}
        onClose={() => setMenuOpen(false)}
        onNavigate={navigate}
        onSettings={() => setSettingsOpen(true)}
      />
      <AdBanner />
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
