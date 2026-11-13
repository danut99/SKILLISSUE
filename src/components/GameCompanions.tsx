import { useReducedMotion } from 'motion/react';
import type { Mode } from '../config';
import { gameDialogue, resultDialogue } from '../lib/companionDialogue';
import { pixelArtUrl } from '../lib/pixelAssets';
import { usePlayer } from '../lib/store';

const NAMES = { demon: 'Little Menace', angel: 'Hype Angel' };

export function GameCompanions({ mode, date, score }: { mode: Mode; date: string; score?: number }) {
  const lowPower = usePlayer(s => s.settings.lowPower);
  const reducedMotion = useReducedMotion();
  const animate = !lowPower && !reducedMotion;
  const current = score === undefined
    ? {
      speaker: 'angel' as const,
      text: gameDialogue(mode, date).filter(line => line.speaker === 'angel').map(line => line.text).join(' '),
    }
    : resultDialogue(mode, score, date)[0];
  const name = current.speaker;
  const animation = score === undefined ? 'angel-hover.webp'
    : name === 'angel' ? 'angel-cheer.webp' : 'demon-taunt.webp';

  return <div className={`result-companion ${name} ${animate ? '' : 'still'}`}>
    <img className="floating-companion-art" width="192" height="192" aria-hidden="true" alt=""
      src={pixelArtUrl(animate ? animation : `${name}-192.png`)}
      onError={e => {
        const fallback = pixelArtUrl(`${name}-192.png`);
        if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback;
      }} />
    <p className="floating-companion-bubble" role="status">
      <b>{NAMES[name]}</b>{current.text}
      {score === undefined && <span className="companion-rules">5 tries. Best one counts. Same challenge for everyone today.</span>}
    </p>
  </div>;
}
