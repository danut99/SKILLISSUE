import { usePlayer } from '../lib/store';
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { track } from '../lib/clarity';
import { LINKS } from '../config';
import type { Route } from '../App';
import { PixelIcon, type PixelIconName } from './PixelIcon';

interface Props {
  open: boolean;
  route: Route;
  onClose: () => void;
  onNavigate: (r: Route) => void;
  onSettings: () => void;
}

interface Tile {
  id: string;
  icon?: PixelIconName;
  label: string;
  sub?: string;
  route?: Route;
  action?: () => void;
  soon?: boolean;
}

/** Krillion-style main menu: big pixel tiles in a 2-column grid. */
export function MenuModal({ open, route, onClose, onNavigate, onSettings }: Props) {
  const muted = usePlayer(state => state.muted);
  const toggleMuted = usePlayer(state => state.toggleMuted);
  const options: Tile[] = [
    { id: 'home', icon: 'calendar', label: 'Daily games', route: null },
    { id: 'games', icon: 'practice', label: 'More games', route: 'games' },
    { id: 'me', icon: 'profile', label: 'My progress', route: 'me' },
    { id: 'league', icon: 'league-shield', label: 'Leagues', route: 'league' },
    { id: 'party', icon: 'battle', label: 'Party mode', sub: '2-8 players', route: 'party' },
    { id: 'friends', icon: 'friends', label: 'Friends', route: 'friends' },
    { id: 'leaderboard', icon: 'trophy', label: 'Rankings', route: 'leaderboard' },
    { id: 'how', icon: 'faq', label: 'How to play', route: 'how' },
  ];
  const menuRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const items = menuRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [open, onClose]);

  const click = (t: Tile) => {
    if (t.soon) return;
    track(`menu_${t.id}`);
    onClose();
    if (t.action) t.action();
    else onNavigate(t.route ?? null);
  };

  const renderTile = (t: Tile) => (
    <button
      key={t.id}
      className={`menu-tile ${t.route !== undefined && t.route === route && !t.action ? 'current' : ''} ${t.soon ? 'soon' : ''}`}
      onClick={() => click(t)}
      disabled={t.soon}
    >
      {t.icon && <span className="mt-icon"><PixelIcon name={t.icon} size={48} /></span>}
      <span className="mt-label">{t.label}</span>
      {t.sub && <span className="mt-sub">{t.sub}</span>}
      {t.soon && <span className="mt-soon">soon</span>}
    </button>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal menu-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.nav
            className="menu-box px-box"
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -24, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="menu-head">
              <div>
                <div className="menu-eyebrow">THINK YOU HAVE GOT SKILL?</div>
                <h2 className="menu-title">Pick your next move.</h2>
              </div>
              <button className="menu-x" onClick={onClose} aria-label="Close menu">
                X
              </button>
            </header>

            <div className="menu-grid">{options.map(renderTile)}</div>
            <nav className="menu-small-links" aria-label="More links"><button type="button" aria-pressed={!muted} onClick={() => { track(muted ? 'sound_on' : 'sound_off'); toggleMuted(); }}>Sound: {muted ? 'off' : 'on'}</button><button type="button" onClick={() => { onClose(); onSettings(); }}>Settings</button><a href="/faq" onClick={onClose}>FAQ</a><a href="/privacy" onClick={onClose}>Privacy</a>{LINKS.tiktok && <a href={LINKS.tiktok} target="_blank" rel="noopener noreferrer">TikTok</a>}</nav>
            <footer className="menu-foot">it's a skill issue.</footer>
          </motion.nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
