import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { MODES, type Mode } from './config';
import { AdBanner } from './components/AdBanner';
import { GameScreen } from './components/GameScreen';
import { Home } from './components/Home';
import { FaqPage } from './components/FaqPage';
import { MePage } from './components/MePage';
import { MenuModal } from './components/MenuModal';
import { PrivacyPage } from './components/PrivacyPage';
import { SettingsModal } from './components/SettingsModal';
import { C } from './games/types';
import { sfx } from './lib/audio';
import { todayUTC } from './lib/daily';
import { usePlayer } from './lib/store';
import { whenAuthReady } from './lib/auth';
import { toast, useUi } from './lib/ui';

const PAGES = ['privacy', 'faq', 'me'] as const;
type Page = (typeof PAGES)[number];
export type Route = Mode | Page | null;

const parseHash = (): Route => {
  const h = location.hash.replace('#', '');
  if (PAGES.includes(h as Page)) return h as Page;
  return MODES.includes(h as Mode) ? (h as Mode) : null;
};

export default function App() {
  const [mode, setMode] = useState<Route>(parseHash);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const settings = usePlayer((s) => s.settings);
  const [date, setDate] = useState(todayUTC);
  const muted = usePlayer((s) => s.muted);
  const toggleMuted = usePlayer((s) => s.toggleMuted);
  const toastState = useUi((s) => s.toast);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    const onHash = () => setMode(parseHash());
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
        location.hash = '';
      }
    }, 1000);
    return () => clearInterval(id);
  }, [date]);

  useEffect(() => {
    void whenAuthReady();
  }, []);

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
      <header className={`topbar ${mode === null || MODES.includes(mode as Mode) ? '' : 'narrow'}`}>
        <button className="corner-btn px-box" onClick={() => setMenuOpen(true)} aria-label="Open menu">
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
          <button className="corner-btn px-box" onClick={toggleMuted} aria-label="Toggle sound">
            {muted ? '🔇' : '🔊'}
          </button>
          <button className="corner-btn px-box" onClick={() => setSettingsOpen(true)} aria-label="Open settings">
            ⚙️
          </button>
        </div>
      </header>
      <main id="app" key={settings.colorblind ? 'cb' : 'std'}>
        {mode === 'privacy' ? (
          <PrivacyPage />
        ) : mode === 'faq' ? (
          <FaqPage />
        ) : mode === 'me' ? (
          <MePage date={date} onPlay={navigate} />
        ) : mode ? (
          <GameScreen key={`${mode}:${date}`} mode={mode} date={date} onNavigate={navigate} />
        ) : (
          <Home date={date} onPlay={navigate} />
        )}
      </main>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <MenuModal
        open={menuOpen}
        route={mode}
        date={date}
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
