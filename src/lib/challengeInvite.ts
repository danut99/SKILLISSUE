import type { Mode } from '../config';
import type { Attempt } from './store';
import { fmtResult } from './scoring';

/** Use the server's frozen challenge target, not a newer local attempt. */
export function challengeInviteText(mode: Mode, target: Pick<Attempt, 'score' | 'detail'>): string {
  if (mode === 'cut') return `I split it ${fmtResult(mode, target)}. Can you get closer?`;
  if (mode === 'draw') return `I scored ${target.score.toFixed(1)}/100 drawing today's shape. Can you beat me?`;
  return `I scored ${target.score.toFixed(1)}/100 in Brake. Can you stop closer?`;
}
