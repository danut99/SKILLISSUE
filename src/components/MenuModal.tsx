import { AnimatePresence, motion } from 'motion/react';
import { LINKS, MODE_INFO, MODES } from '../config';
import { emojiRow } from '../lib/scoring';
import { maxTries, modeDay, usePlayer } from '../lib/store';
import type { Route } from '../App';

interface Props {
  open: boolean;
  route: Route;
  date: string;
  onClose: () => void;
  onNavigate: (r: Route) => void;
  onSettings: () => void;
}

interface Tile {
  id: string;
  icon: string;
  label: string;
  sub?: string;
  route?: Route;
  action?: () => void;
  soon?: boolean;
}

/** Krillion-style main menu: big pixel tiles in a 2-column grid. */
export function MenuModal({ open, route, date, onClose, onNavigate, onSettings }: Props) {
  const days = usePlayer((s) => s.days);

  const play: Tile[] = [
    { id: 'home', icon: '🫠', label: 'today', sub: 'all 3 tests', route: null },
    ...MODES.map((m) => {
      const md = modeDay(days, date, m);
      return {
        id: m,
        icon: MODE_INFO[m].emoji,
        label: MODE_INFO[m].name,
        sub: emojiRow(md) + '⬜'.repeat(Math.max(0, maxTries(md) - md.tries.length)),
        route: m,
      };
    }),
  ];
  const more: Tile[] = [
    { id: 'me', icon: '👤', label: 'my skill issue', route: 'me' },
    { id: 'settings', icon: '⚙️', label: 'settings', action: onSettings },
    { id: 'faq', icon: '❓', label: 'faq', route: 'faq' },
    { id: 'privacy', icon: '🔏', label: 'privacy', route: 'privacy' },
    { id: 'archive', icon: '⟲', label: 'archive', soon: true },
    { id: 'unlimited', icon: '∞', label: 'practice', soon: true },
    { id: 'friends', icon: '👯', label: 'friends', soon: true },
    { id: 'party', icon: '💥', label: 'brake battle', soon: true },
  ];

  const click = (t: Tile) => {
    if (t.soon) return;
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
      <span className="mt-icon">{t.icon}</span>
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

            <p className="menu-rule">
              <span>play today</span>
            </p>
            <div className="menu-grid">{play.map(renderTile)}</div>

            <p className="menu-rule">
              <span>more</span>
            </p>
            <div className="menu-grid">{more.map(renderTile)}</div>

            {LINKS.tiktok && (
              <a className="menu-link pink" href={LINKS.tiktok} target="_blank" rel="noopener">
                <span className="ml-icon">🎵</span>
                <span className="ml-copy">
                  <span className="ml-label">follow on tiktok</span>
                  <span className="ml-detail">fails, crashes &amp; daily top 10</span>
                </span>
                <span className="ml-arrow">↗</span>
              </a>
            )}
            {LINKS.feedback && (
              <a className="menu-link cyan" href={LINKS.feedback}>
                <span className="ml-icon">💬</span>
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
