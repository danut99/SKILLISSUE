import type { Mode } from '../config';
import type { Detail } from '../lib/store';
import { pixelArtUrl } from '../lib/pixelAssets';
import { text } from './canvas';
import { C, W } from './types';

const sprites = new Map<string, HTMLImageElement>();

function resultSprite(speaker: string) {
  let sprite = sprites.get(speaker);
  if (!sprite && typeof Image !== 'undefined') {
    sprite = new Image();
    sprite.src = pixelArtUrl(`${speaker}-192.png`);
    sprites.set(speaker, sprite);
  }
  return sprite;
}

export async function preloadResultCompanions() {
  await Promise.all(['angel', 'demon'].map(async speaker => {
    const sprite = resultSprite(speaker);
    if (sprite) await sprite.decode().catch(() => {});
  }));
}

/** Kept inside the stage so snapshots and recorded clips include the reaction. */
export function drawResultCompanion(c: CanvasRenderingContext2D, score: number, mode: Mode = 'draw', result = `${score.toFixed(1)}%`, detail: Detail = {}) {
  const angel = score >= 80;
  const speaker = angel ? 'angel' : 'demon';
  const color = angel ? C.cyan : C.pink;
  const reaction = mode === 'brake'
    ? angel ? 'Smooth stop. Keep the keys.'
      : detail.crashed ? 'The wall has filed a complaint.'
      : detail.objective === 'parking' ? detail.fail ? 'Parking is apparently optional.' : detail.partial ? 'Half parked. Half the points.' : 'In the bay. Barely centered.'
      : detail.objective === 'stop-line' && detail.fail ? 'The red light was a hint.'
      : 'Left room for another car?'
    : mode === 'cut'
    ? angel ? 'A fair split. Even the blob agrees.' : 'Someone got the bigger half.'
    : angel
    ? score >= 95 ? 'Okay. That was ridiculously good.' : 'That shape deserves a screenshot.'
    : 'You drew that with confidence.';
  c.save();
  // The driving scene needs its lower road clear for the car and stopping gap.
  if (mode === 'brake') c.translate(0, -476);
  c.fillStyle = C.bg;
  c.fillRect(12, 536, W - 24, 96);
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.strokeRect(82, 540, W - 96, 88);
  const sprite = resultSprite(speaker);
  if (sprite?.complete && sprite.naturalWidth) {
    c.imageSmoothingEnabled = false;
    c.drawImage(sprite, 10, 560, 72, 72);
  }
  text(c, angel ? 'Hype Angel' : 'Little Menace', 93, 554, { size: 19, color, align: 'left' });
  text(c, result, 93, 580, { size: 32, maxWidth: W - 112, color, align: 'left' });
  const words = reaction.split(' ');
  let line = '';
  let y = 604;
  c.font = '17px "VT323", monospace';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (c.measureText(next).width > W - 112 && line) {
      text(c, line, 93, y, { size: 17, align: 'left' });
      y += 17;
      line = word;
    } else line = next;
  }
  text(c, line, 93, y, { size: 17, align: 'left' });
  const transform = c.getTransform();
  c.restore();
  // Saved result canvases only render once; fill the sprite when it loads too.
  if (sprite && !sprite.complete) {
    sprite.addEventListener('load', () => {
      c.save();
      c.setTransform(transform);
      c.imageSmoothingEnabled = false;
      c.drawImage(sprite, 10, 560, 72, 72);
      c.restore();
    }, { once: true });
  }
}
