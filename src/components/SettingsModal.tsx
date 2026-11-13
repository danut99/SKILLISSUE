import { AnimatePresence, motion } from 'motion/react';
import { track } from '../lib/clarity';
import { usePlayer, type Settings } from '../lib/store';

interface Props {
  open: boolean;
  onClose: () => void;
}

const TOGGLES: { key: keyof Settings; label: string; hint: string }[] = [
  { key: 'lowPower', label: 'Low-power mode', hint: 'No scanlines, confetti or UI animations.' },
  { key: 'colorblind', label: 'Colorblind mode', hint: 'Orange/blue instead of green/yellow, brighter text.' },
  { key: 'shareLink', label: 'Share link', hint: 'Add the site link under shared results.' },
];

/** Settings toggles (stats & garage live on the #me page). */
export function SettingsModal({ open, onClose }: Props) {
  const settings = usePlayer((s) => s.settings);
  const setSetting = usePlayer((s) => s.setSetting);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="modal-box px-box settings-box"
            role="dialog"
            aria-label="Settings"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close-x" onClick={onClose} aria-label="Close settings">
              ×
            </button>

            <div className="eyebrow">settings</div>
            {TOGGLES.map((t) => (
              <label key={t.key} className="toggle-row">
                <span>
                  <span className="t-label">{t.label}</span>
                  <span className="t-hint">{t.hint}</span>
                </span>
                <input type="checkbox" checked={settings[t.key]} onChange={(e) => { track(`setting_${t.key}_${e.target.checked ? 'on' : 'off'}`); setSetting(t.key, e.target.checked); }} />
                <span className={`t-pill ${settings[t.key] ? 'on' : ''}`}>{settings[t.key] ? 'ON' : 'OFF'}</span>
              </label>
            ))}

            <div className="modal-links">
              <a href="#privacy" onClick={onClose}>
                privacy
              </a>
              <a href="#me" onClick={onClose}>
                my stats &amp; garage
              </a>
              <a href="#faq" onClick={onClose}>
                faq
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
