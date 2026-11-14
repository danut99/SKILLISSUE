import { rngFor } from '../lib/daily';
import { clamp } from '../lib/geometry';
import { sfx } from '../lib/audio';
import { paper, text } from './canvas';
import { C, type Game } from './types';

export function balanceSetup(seed: string) {
  const random = rngFor(`balance:${seed}`);
  const creatures = [
    { x: 65 + random() * 35, radius: 20 + random() * 17, color: C.pink },
    { x: 255 - random() * 35, radius: 20 + random() * 17, color: C.cyan },
  ];
  const plankMass = 900;
  const mass = creatures.map(creature => creature.radius ** 2);
  const center = (mass[0] * creatures[0].x + mass[1] * creatures[1].x + plankMass * 180)
    / (mass[0] + mass[1] + plankMass);
  return { creatures, center };
}

export function balanceScore(support: number, center: number) {
  // Half-pixel controls can always reach the perfect-score tolerance.
  return Math.round(1000 * Math.exp(-Math.max(0, Math.abs(support - center) - .25) / 32)) / 10;
}

function drawCreature(c: CanvasRenderingContext2D, radius: number, color: string, worried: boolean, blink: boolean) {
  c.save();
  c.scale(radius / 8, radius / 8);
  // All creatures use the same silhouette, so visible area tracks their weight.
  c.fillStyle = '#17233d';
  c.fillRect(-6, -16, 12, 16);
  c.fillRect(-8, -13, 16, 10);
  c.fillStyle = color;
  c.fillRect(-5, -15, 10, 14);
  c.fillRect(-7, -12, 14, 8);
  c.fillStyle = '#ffffff40';
  c.fillRect(-4, -14, 7, 2);
  c.fillRect(-6, -11, 2, 4);
  c.fillStyle = '#050a143d';
  c.fillRect(4, -11, 2, 8);
  c.fillRect(-4, -3, 8, 2);
  c.fillStyle = '#17233d';
  c.fillRect(-5, -1, 4, 2);
  c.fillRect(2, -1, 4, 2);
  c.fillStyle = '#fff';
  c.fillRect(-4, -10, 3, blink ? 1 : 4);
  c.fillRect(2, -10, 3, blink ? 1 : 4);
  c.fillStyle = '#17233d';
  c.fillRect(-3, -9, 1, blink ? 1 : 2);
  c.fillRect(3, -9, 1, blink ? 1 : 2);
  c.fillRect(-1, -5, worried ? 3 : 2, worried ? 3 : 1);
  c.restore();
}

export function createBalanceGame(seed: string, onFinish: (score: number, error: number) => void,
  onPlace: (x: number) => void = () => {}, onRelease: () => void = () => {},
  reducedMotion: () => boolean = () => false,
  options: { savedSupport?: number; canPlace?: () => boolean } = {},
): Game & { place: (x: number) => void; release: () => void } {
  const { creatures, center } = balanceSetup(seed);
  let support = options.savedSupport ?? 180;
  let released = options.savedSupport !== undefined;
  let started = released ? performance.now() - 2800 : 0;
  let dragging = false;
  let dragOrigin = support;
  let finished = released;
  const place = (x: number) => {
    if (released || options.canPlace?.() === false || !Number.isFinite(x)) return;
    support = clamp(Math.round(x * 2) / 2, 40, 320);
    onPlace(support);
  };
  const release = () => {
    if (released) return;
    released = true;
    dragging = false;
    started = performance.now();
    onRelease();
    sfx.pop();
  };
  return {
    place,
    release,
    down(p) {
      if (released || p.y < 365 || p.y > 515) return;
      dragging = true;
      dragOrigin = support;
      place(p.x);
    },
    move(p) { if (dragging) place(p.x); },
    up(p, event) {
      if (!dragging) return;
      dragging = false;
      place(event.type === 'pointercancel' ? dragOrigin : p.x);
    },
    update(now) {
      if (!released || finished || now - started < 2200) return;
      finished = true;
      const score = balanceScore(support, center);
      if (score >= 85) sfx.ding(); else sfx.fail();
      onFinish(score, Math.abs(support - center));
    },
    render(c, now) {
      paper(c);
      c.imageSmoothingEnabled = false;
      const elapsed = released ? Math.min(2.8, Math.max(0, (now - started) / 1000)) : 0;
      const error = center - support;
      const score = balanceScore(support, center);
      const stable = score >= 85;
      const direction = Math.sign(error);
      const reduceMotion = reducedMotion();
      const fallingArm = direction > 0 ? 330 - support : support - 30;
      const restingAngle = Math.min(.62, Math.asin(Math.min(1, 132 / fallingArm)));
      let angle = 0;
      if (released) {
        angle = stable
          ? Math.sin(elapsed * 9) * Math.exp(-elapsed * 2.5) * error * .018
          : direction * Math.min(restingAngle, Math.abs(error) * elapsed * elapsed * .014);
        if (reduceMotion) angle = stable ? 0 : direction * .15;
      }
      const revealing = released && elapsed >= 1.8;
      text(c, released ? stable ? 'LUNCH SAVED.' : 'THERE GOES LUNCH.' : 'KEEP THEM LEVEL.', 180, 76, {
        size: 34, color: released && stable ? C.green : C.yellow, maxWidth: 324,
      });
      text(c, released ? stable ? 'Pip and Bob approve.' : 'Gravity has entered the chat.' : 'Bigger creature = more weight.', 180, 112, {
        size: 21, color: C.muted, maxWidth: 324,
      });

      // Fixed stage and a wide, draggable fulcrum.
      c.fillStyle = '#081323'; c.fillRect(20, 499, 320, 18);
      c.fillStyle = C.line; c.fillRect(20, 499, 320, 3);
      c.fillStyle = '#b47626';
      c.beginPath(); c.moveTo(support, 350); c.lineTo(support + 29, 496); c.lineTo(support - 29, 496); c.closePath(); c.fill();
      c.fillStyle = C.yellow;
      c.beginPath(); c.moveTo(support, 350); c.lineTo(support + 17, 489); c.lineTo(support - 25, 489); c.closePath(); c.fill();
      c.fillStyle = '#17233d'; c.fillRect(support - 8, 427, 16, 35);
      c.fillStyle = '#9b651f'; c.fillRect(support - 4, 434, 3, 21); c.fillRect(support + 2, 434, 3, 21);
      c.fillStyle = C.line; c.fillRect(support - 33, 491, 66, 8);
      if (!released) {
        const pulse = reduceMotion ? 1 : .65 + Math.sin(now / 280) * .2;
        text(c, '<', support - 43, 449, { size: 28, color: C.yellow, alpha: pulse });
        text(c, '>', support + 43, 449, { size: 28, color: C.yellow, alpha: pulse });
      }

      c.save(); c.translate(support, 350); c.rotate(angle);
      c.fillStyle = '#714727'; c.fillRect(30 - support, 0, 300, 17);
      c.fillStyle = '#c58a50'; c.fillRect(30 - support, 0, 300, 11);
      c.fillStyle = '#f4c787'; c.fillRect(30 - support, 0, 300, 3);
      c.fillStyle = '#986336';
      for (const x of [46, 122, 214, 302]) c.fillRect(x - support, 6, 20, 2);
      c.restore();

      for (const [index, creature] of creatures.entries()) {
        const slide = released && !stable && !reduceMotion
          ? direction * Math.max(0, elapsed - .65) ** 2 * 55 : 0;
        const localX = creature.x + slide;
        const edge = clamp(localX, 30, 330);
        const offEdge = Math.abs(localX - edge);
        const worldX = clamp(
          support + Math.cos(angle) * (edge - support) + direction * Math.min(60, offEdge),
          12 + creature.radius * 1.5, 348 - creature.radius * 1.5,
        );
        const worldY = Math.min(498, 350 + Math.sin(angle) * (edge - support) + offEdge * offEdge * .055);
        c.save(); c.translate(worldX, worldY);
        c.rotate(offEdge > 0 ? direction * Math.min(.2, offEdge / 100) : angle);
        const blink = !released && !reduceMotion && (now + index * 1300) % 4500 < 140;
        drawCreature(c, creature.radius, creature.color, released && !stable, blink);
        text(c, index === 0 ? 'PIP' : 'BOB', 0, -creature.radius * 2 - 18, { size: 19, color: creature.color });
        c.restore();
      }
      if (revealing) {
        c.strokeStyle = C.green; c.lineWidth = 2; c.setLineDash([4, 4]);
        c.beginPath(); c.moveTo(center, 330); c.lineTo(center, 523); c.stroke(); c.setLineDash([]);
        c.fillStyle = C.green; c.fillRect(center - 4, 520, 8, 8);
        text(c, 'BALANCE POINT', center, 548, { size: 19, color: C.green });
      }
      if (!released) text(c, dragging ? 'NICE. FIND YOUR SPOT.' : 'DRAG THE YELLOW SUPPORT', 180, 554, {
        size: 22, color: dragging ? C.yellow : C.muted, maxWidth: 324,
      });
      text(c, revealing ? `${score.toFixed(1)} / 100` : released ? '...' : 'Then press LET GO.', 180, 594, {
        size: revealing ? 32 : 21, color: revealing && stable ? C.green : C.text, maxWidth: 324,
      });
    },
  };
}
