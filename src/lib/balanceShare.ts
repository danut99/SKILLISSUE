import { siteUrl } from '../config';
import { createBalanceGame } from '../games/balanceGame';
import { watermark } from '../games/canvas';
import { SCALE, W, H } from '../games/types';
import type { BalanceAttempt } from './balance';
import { createClipPainter } from './clipScenes';
import { dayNumber } from './daily';
import type { Attempt } from './store';
import { clipRecorder } from './clip';

export const balanceLink = () => `${siteUrl().split('#')[0]}#balance`;
export const balanceCaption = (date: string, score: number) =>
  `SKILL ISSUE #${dayNumber(date)}\nBALANCE! ${score.toFixed(1)} / 100\nTwo friends. One support. Can you beat me?\n${balanceLink()}`;

export function balanceClipAttempt(attempt: BalanceAttempt): Attempt {
  return { score: attempt.score, detail: {}, at: attempt.at };
}

/** Restore a real saved attempt for sharing after a refresh or the last try. */
export function balanceSnapshot(date: string, support: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const context = canvas.getContext('2d')!;
  context.scale(SCALE, SCALE);
  createBalanceGame(date, () => {}, undefined, undefined, () => true, { savedSupport: support }).render(context, performance.now());
  watermark(context, `BALANCE! #${dayNumber(date)}`);
  return canvas;
}

export async function renderBalanceCard(date: string, attempt: BalanceAttempt, snapshot?: HTMLCanvasElement | null): Promise<Blob> {
  await document.fonts.ready;
  const painter = createClipPainter(snapshot ?? balanceSnapshot(date, attempt.support), 'balance');
  painter.reveal({ mode: 'balance', attempt: balanceClipAttempt(attempt) });
  painter.paint();
  return new Promise((resolve, reject) => painter.canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create image.')), 'image/png'));
}

/** Recreate the same deterministic animation when a saved result is reopened. */
export async function recordBalanceReplay(date: string, attempt: BalanceAttempt, signal: AbortSignal) {
  if (!clipRecorder.supported) return null;
  await document.fonts.ready;
  if (signal.aborted) return null;
  const source = document.createElement('canvas');
  source.width = W * SCALE;
  source.height = H * SCALE;
  const context = source.getContext('2d')!;
  const game = createBalanceGame(date, () => {});
  game.place(attempt.support);
  const render = (now: number) => {
    context.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    game.update?.(now);
    game.render(context, now);
    watermark(context, `BALANCE! #${dayNumber(date)}`);
  };
  render(performance.now());
  clipRecorder.start(source, 'balance');
  game.release();
  const completed = await new Promise<boolean>(resolve => {
    let frame = 0;
    const started = performance.now();
    const cancel = () => { cancelAnimationFrame(frame); clipRecorder.cancel(); resolve(false); };
    signal.addEventListener('abort', cancel, { once: true });
    const loop = (now: number) => {
      render(now);
      if (now - started < 2800) { frame = requestAnimationFrame(loop); return; }
      signal.removeEventListener('abort', cancel);
      resolve(true);
    };
    frame = requestAnimationFrame(loop);
  });
  return completed ? clipRecorder.stop({ mode: 'balance', attempt: balanceClipAttempt(attempt) }) : null;
}
