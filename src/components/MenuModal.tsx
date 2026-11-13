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
  const options: Tile[] = [
    { id: 'home', icon: 'calendar', label: 'home', route: null },
    { id: 'me', icon: 'profile', label: 'my skill issue', route: 'me' },
    { id: 'friends', icon: 'friends', label: 'friends', route: 'friends' },
    { id: 'party', icon: 'battle', label: 'party', sub: '2-8 players', route: 'party' },
    { id: 'settings', icon: 'settings', label: 'settings', action: onSettings },
    { id: 'faq', icon: 'faq', label: 'faq', route: 'faq' },
    { id: 'privacy', icon: 'privacy', label: 'privacy', route: 'privacy' },
  ];
  const upcoming: Tile[] = [
    { id: 'archive', icon: 'archive', label: 'archive', soon: true },
    { id: 'unlimited', icon: 'practice', label: 'practice', soon: true },
  ];

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
            aria-label="Main menu"
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -24, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="menu-head">
              <div>
                <div className="menu-eyebrow">skill issue</div>
                <h2 className="menu-title">MENU</h2>
              </div>
              <button className="menu-x" onClick={onClose} aria-label="Close menu">
                X
              </button>
            </header>

            <div className="menu-grid">{options.map(renderTile)}</div>
            <p className="menu-rule"><span>coming soon</span></p>
            <div className="menu-grid">{upcoming.map(renderTile)}</div>

            {LINKS.tiktok ? (
              <a className="menu-link pink" href={LINKS.tiktok} target="_blank" rel="noopener">
                <span className="ml-icon"><PixelIcon name="social" size={32} /></span>
                <span className="ml-copy">
                  <span className="ml-label">follow on tiktok</span>
                  <span className="ml-detail">fails, crashes &amp; daily top 10</span>
                </span>
                <span className="ml-arrow">↗</span>
              </a>
            ) : (
              <button className="menu-link pink" disabled>
                <span className="ml-icon"><PixelIcon name="social" size={32} /></span>
                <span className="ml-copy">
                  <span className="ml-label">TikTok</span>
                  <span className="ml-detail">Coming soon</span>
                </span>
              </button>
            )}
            {LINKS.feedback && (
              <a className="menu-link cyan" href={LINKS.feedback}>
                <span className="ml-icon"><PixelIcon name="feedback" size={32} /></span>
                <span className="ml-copy">
                  <span className="ml-label">ideas &amp; feedback</span>
                  <span className="ml-detail">suggest the next stupid test</span>
                </span>
                <span className="ml-arrow">↗</span>
              </a>
            )}

            <footer className="menu-foot">it's a skill issue.</footer>
          </motion.nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
