import { REWARDED_ADS } from '../config';
import { timeToNextDay } from '../lib/daily';
import { banner, paper, text } from './canvas';
import { C, H, W, type Game } from './types';

/** Shown when the player has no tries left today. */
export function createLockedGame(best: string, remaining = 0): Game {
  return {
    render(c, now) {
      paper(c);
      if (remaining > 0) {
        text(c, 'BEST TODAY', W / 2, 200, { size: 44, color: C.cyan, outline: 5 });
        banner(c, best, `${remaining} ${remaining === 1 ? 'try' : 'tries'} left today`, C.cyan, 1000, 280);
        text(c, 'Choose try again to beat it!', W / 2, 440, { size: 24, color: C.muted });
        return;
      }
      text(c, '😵', W / 2, 250 + Math.sin(now / 300) * 6, { size: 110 });
      banner(c, 'NO TRIES LEFT', `Today's best: ${best}`, C.pink, 1000, 110);
      text(c, 'new challenge in', W / 2, 380, { size: 26, color: C.muted });
      text(c, timeToNextDay(), W / 2, 420, { size: 54, color: C.cyan, outline: 5 });
      if (REWARDED_ADS) text(c, 'or watch an ad for 1 more try 👇', W / 2, H - 70, { size: 22, color: C.muted });
    },
  };
}
