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
  const lines = score === undefined ? gameDialogue(mode, date) : resultDialogue(mode, score, date);
  const current = lines[0];
  const name = current.speaker;
  const animation = score === undefined ? 'angel-hover.webp'
    : name === 'angel' ? 'angel-cheer.webp' : 'demon-taunt.webp';

  const content = <div className={score === undefined ? 'companion-intro' : undefined}>{lines.map((line, index) => {
    const name = line.speaker;
    const art = score === undefined ? name === 'angel' ? 'angel-hover.webp' : 'demon-taunt.webp' : animation;
    return <div key={`${name}:${index}`} className={`result-companion ${name} ${animate ? '' : 'still'} ${score === undefined ? '' : 'desktop-reaction'}`}
    >
    <img className="floating-companion-art" width="192" height="192" aria-hidden="true" alt=""
      src={pixelArtUrl(animate ? art : `${name}-192.png`)}
      onError={e => {
        const fallback = pixelArtUrl(`${name}-192.png`);
        if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback;
      }} />
    <p className="floating-companion-bubble" role={score === undefined ? undefined : 'status'}>
      <b>{NAMES[name]}</b>{line.text}
      {line.scoring && <span className="companion-scoring"><strong>How points work</strong>{line.scoring}</span>}
      {score === undefined && name === 'angel' && <span className="companion-rules">5 guest tries, 8 with an account. Best one counts. Same daily challenge.</span>}
    </p>
  </div>;
  })}</div>;
  return content;
}
