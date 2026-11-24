export function focusGame() {
  const canvas = document.querySelector<HTMLCanvasElement>('.game-screen canvas');
  if (!canvas) return;
  canvas.scrollIntoView({ block: 'center', behavior: document.body.classList.contains('low-power') || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  canvas.focus({ preventScroll: true });
}
