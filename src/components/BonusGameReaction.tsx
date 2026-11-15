import { useReducedMotion } from 'motion/react';
import { pixelArtUrl } from '../lib/pixelAssets';
import { resultTaunt } from '../lib/resultTaunts';
import { usePlayer } from '../lib/store';

export function BonusGameReaction({ mode, score, seed }: { mode: 'balance' | 'count'; score: number; seed: string }) {
 const lowPower=usePlayer(s=>s.settings.lowPower);
 const reducedMotion=useReducedMotion();
 return <div className="bonus-game-reaction">
  <img src={pixelArtUrl(lowPower||reducedMotion?'demon-192.png':'demon-taunt.webp')} width="64" height="64" alt="" aria-hidden="true" onError={e=>{const fallback=pixelArtUrl('demon-192.png');if(!e.currentTarget.src.endsWith(fallback))e.currentTarget.src=fallback;}}/>
  <div className="bonus-game-reaction-bubble"><b>Little Menace</b><p>{resultTaunt(mode,score,{},seed)}</p></div>
 </div>;
}
