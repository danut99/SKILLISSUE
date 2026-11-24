import { useEffect, type RefObject } from 'react';
import { DAY_LABEL } from './labels';
import { watermark } from '../games/canvas';
import { H, SCALE, W, type Game } from '../games/types';
import type { Pt } from '../lib/geometry';

interface Props {
  gameRef: RefObject<Game | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  date: string;
  label?: string;
  clean?: boolean;
}

/** Runs the render loop and forwards pointer/keyboard input (in stage coords) to the active game. */
export function GameCanvas({ gameRef, canvasRef, date, label: customLabel, clean = false }: Props) {
  useEffect(() => {
    const stage = canvasRef.current?.parentElement;
    if (!stage) return;
    const fit = () => {
      // Use the document position so scrolling doesn't resize an active game.
      const top = stage.getBoundingClientRect().top + window.scrollY;
      const height = Math.max(1, (window.visualViewport?.height ?? window.innerHeight) - top - 20);
      stage.style.setProperty('--game-canvas-height', `${height}px`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage.closest('.screen') ?? stage.parentElement!);
    const header = document.querySelector('.topbar');
    if (header) observer.observe(header);
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
    };
  }, [canvasRef, date]);

  useEffect(() => {
    const label = customLabel ?? DAY_LABEL(date);
    const canvas = canvasRef.current!;
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const g = gameRef.current;
      if (!g) return;
      const now = performance.now();
      g.update?.(now);
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      if (clean && g.renderClip) g.renderClip(ctx, now);
      else g.render(ctx, now);
      watermark(ctx, label);
    };
    raf = requestAnimationFrame(loop);

    const toStage = (e: PointerEvent): Pt => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    };
    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      gameRef.current?.down?.(toStage(e), e);
    };
    const onMove = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      const g = gameRef.current;
      if (!g?.move) return;
      const events = e.getCoalescedEvents?.() ?? [];
      for (const ev of events.length ? events : [e]) g.move(toStage(ev), ev);
    };
    const onUp = (e: PointerEvent) => { if (e.isPrimary) gameRef.current?.up?.(toStage(e), e); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select, button, a, dialog, [contenteditable="true"]')) return;
      gameRef.current?.key?.(e);
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [canvasRef, gameRef, date, customLabel, clean]);

  return (
    <div className="stage-wrap">
      <canvas ref={canvasRef} className="stage" tabIndex={0} aria-label="Game canvas" />
    </div>
  );
}
