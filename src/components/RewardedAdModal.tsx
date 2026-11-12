import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onReward: () => void;
}

const AD_SECONDS = 5;

/**
 * Rewarded-ad placeholder. To monetize, replace the countdown with your ad
 * network's rewarded unit (e.g. Google Ad Manager rewarded, AppLixir,
 * Adsterra) and call onReward() from its "reward granted" callback.
 */
export function RewardedAdModal({ open, onClose, onReward }: Props) {
  const [left, setLeft] = useState(AD_SECONDS);

  useEffect(() => {
    if (!open) return;
    setLeft(AD_SECONDS);
    const id = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (open && left <= 0) {
      onReward();
      onClose();
    }
  }, [open, left, onReward, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="modal-box px-box" initial={{ scale: 0.8, rotate: -3 }} animate={{ scale: 1, rotate: 0 }}>
            <div className="eyebrow">sponsored · totally real ad</div>
            <div className="big">📺</div>
            <p>Your extra try is loading…</p>
            <div className="ad-count">{Math.max(0, left)}</div>
            <button className="btn btn-ghost" onClick={onClose}>
              nah, I give up
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
