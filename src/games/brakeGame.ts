import { drawResultCompanion } from './resultCompanion';
import { CAR_SKINS } from '../config';
import { sfx, type LoopHandle } from '../lib/audio';
import { usePlayer, type Attempt } from '../lib/store';
import { carSprite } from '../lib/pixelAssets';
import { rngFor } from '../lib/daily';
import { clamp, easeInOut, lerp } from '../lib/geometry';
import { fmtCm, fmtResult } from '../lib/scoring';
import { BRAKE_GOALS, dailyBrakeObjective, brakeStopResult, PARKING_TOLERANCE_M } from '../lib/brakeChallenge';
export { brakeScore } from '../lib/brakeChallenge';
import { rect, text } from './canvas';
import { C, H, W, eventTime, type Game, type GameApi } from './types';

const ROADS = [
  { id: 'dry', label: '☀️ DRY ASPHALT', decel: 8.5, asphalt: '#1a2233' },
  { id: 'wet', label: '🌧️ WET ROAD', decel: 5.5, asphalt: '#152238' },
  { id: 'ice', label: '🧊 BLACK ICE', decel: 3.8, asphalt: '#1b2c44' },
] as const;

/** Today's road, speed & wall distance — identical for every player. */
export function brakeParams(date: string) {
  const rng = rngFor(`${date}:brake`);
  const roll = rng();
  const road = roll < 0.45 ? ROADS[0] : roll < 0.8 ? ROADS[1] : ROADS[2];
  const decel = road.decel * (0.9 + rng() * 0.2);
  const kmh = Math.round(55 + rng() * 45);
  const v = kmh / 3.6;
  const stopDist = (v * v) / (2 * decel);
  const D = stopDist + 30 + rng() * 30;
  return { road, decel, kmh, v, stopDist, D, objective: dailyBrakeObjective(date) };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}

const CAR_W = 56;
const CAR_H = 96;
const CAR_Y = 520;
const ROAD_L = 80;
const ROAD_R = 280;
const COUNT_MS = 1650;

export function createBrakeGame(api: GameApi, saved?: Attempt): Game {
  const P = brakeParams(api.date);
  const goal = BRAKE_GOALS[P.objective];
  const limit = P.D + (P.objective === 'parking' ? 8 : 0);
  const basePpm = clamp(430 / (P.stopDist + 12), 3.2, 22);
  const carColor = (CAR_SKINS.find((s) => s.id === usePlayer.getState().carSkin) ?? CAR_SKINS[0]).color;
  const sprite = carSprite(usePlayer.getState().carSkin);

  let state: 'ready' | 'countdown' | 'driving' | 'braking' | 'stopped' | 'crashed' | 'failed' = 'ready';
  let x = 0;
  let speed = 0;
  let countStart = 0;
  let lastBeep = -1;
  let t0 = 0;
  let tb = 0;
  let xb = 0;
  let stopX = 0;
  let tHit = Infinity;
  let impact = 0;
  let endT = 0;
  let gapCm = 0;
  let score = 0;
  let particles: Particle[] = [];
  let engine: LoopHandle | null = null;
  let screech: LoopHandle | null = null;
  let lastFrame = 0;
  let result: ReturnType<typeof brakeStopResult> | null = null;
  let resultSound = 0;

  // Restore a terminal scene without replaying input, sounds, or submitting a score.
  if (saved) {
    result = { score: saved.score, detail: saved.detail };
    score = saved.score;
    gapCm = saved.detail.gapCm ?? 0;
    stopX = P.D - (saved.detail.offsetCm ?? gapCm) / 100;
    x = saved.detail.crashed ? P.D : stopX;
    impact = (saved.detail.impactKmh ?? 0) / 3.6;
    state = saved.detail.crashed ? 'crashed' : saved.detail.fail ? 'failed' : 'stopped';
    endT = performance.now() - 10000;
  }

  function trigger(t: number) {
    if (state === 'ready') {
      state = 'countdown';
      countStart = t;
      api.startClip();
      sfx.ensure();
      return;
    }
    if (state === 'driving' && t - t0 > 150) brake(t);
  }

  function brake(t: number) {
    state = 'braking';
    tb = t;
    xb = (P.v * (t - t0)) / 1000;
    stopX = xb + (P.v * P.v) / (2 * P.decel);
    if (stopX > limit) {
      const rem = Math.max(0, limit - xb);
      impact = Math.sqrt(Math.max(0, P.v * P.v - 2 * P.decel * rem));
      tHit = t + ((P.v - impact) / P.decel) * 1000;
    }
    sfx.stop(engine);
    engine = null;
    screech = sfx.startScreech();
  }

  function crash(v: number, t: number) {
    state = 'crashed';
    impact = v;
    x = P.D;
    speed = 0;
    endT = t;
    sfx.stop(engine);
    sfx.stop(screech);
    sfx.crash();
    for (let i = 0; i < 46; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
      const s = 60 + Math.random() * 260;
      particles.push({
        x: W / 2 + (Math.random() - 0.5) * CAR_W,
        y: 0,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        size: 2 + Math.random() * 6,
        color: [C.red, C.yellow, '#ffffff', '#8b5a2b', C.muted][i % 5],
      });
    }
    const kmh = Math.round(v * 3.6);
    api.finish({ score: 0, detail: { crashed: true, objective: P.objective, impactKmh: kmh }, display: '💥 CRASH' });
  }

  function fail(t: number, position: number) {
    state = 'failed';
    x = position;
    speed = 0;
    endT = t;
    result = { score: 0, detail: { ...brakeStopResult(P.objective, P.D, position).detail, fail: true } };
    sfx.stop(engine);
    sfx.stop(screech);
    sfx.fail();
    api.finish({ ...result, display: fmtResult('brake', result) });
  }

  function reachLimit(v: number, t: number) {
    if (P.objective === 'wall') crash(v, t);
    else fail(t, limit);
  }

  function stopped(t: number) {
    result = brakeStopResult(P.objective, P.D, stopX);
    if (result.detail.fail) return fail(t, stopX);
    state = 'stopped';
    x = stopX;
    speed = 0;
    endT = t;
    sfx.stop(screech);
    gapCm = result.detail.gapCm!;
    score = result.score;
    resultSound = window.setTimeout(() => (score >= 95 ? sfx.ding() : score < 50 ? sfx.fail() : sfx.pop()), 900);
    api.finish({ ...result, display: fmtResult('brake', result) });
  }

  function drawCar(c: CanvasRenderingContext2D, frontY: number, crumple: number) {
    const x0 = W / 2 - CAR_W / 2;
    const y0 = frontY + crumple;
    const h = CAR_H - crumple;
    // shadow
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(x0 + 4, y0 + 6, CAR_W, h);
    if (sprite.image.complete && sprite.image.naturalWidth > 0) {
      const [sx, sy, sw, sh, flip] = sprite.crop;
      c.save();
      c.imageSmoothingEnabled = false;
      c.translate(x0 + CAR_W / 2, y0 + h / 2);
      if (flip) c.rotate(Math.PI);
      c.drawImage(sprite.image, sx, sy, sw, sh, -CAR_W / 2, -h / 2, CAR_W, h);
      c.restore();
      if (state === 'braking') {
        c.fillStyle = '#ff2a2a';
        c.fillRect(x0 + 5, y0 + h - 5, 9, 4);
        c.fillRect(x0 + CAR_W - 14, y0 + h - 5, 9, 4);
        c.fillStyle = 'rgba(255,40,40,0.25)';
        c.fillRect(x0 - 6, y0 + h - 4, CAR_W + 12, 26);
      }
      return;
    }
    // body
    c.fillStyle = carColor;
    rect(c, x0, y0, CAR_W, h, 10);
    c.fill();
    c.strokeStyle = '#000';
    c.lineWidth = 3;
    c.stroke();
    // windshield + rear window
    c.fillStyle = '#9be7ff';
    rect(c, x0 + 8, y0 + 20 - crumple * 0.5, CAR_W - 16, 18, 4);
    c.fill();
    c.fillStyle = '#5aa9c4';
    rect(c, x0 + 10, y0 + h - 26, CAR_W - 20, 12, 3);
    c.fill();
    // headlights
    c.fillStyle = C.yellow;
    c.fillRect(x0 + 6, y0 + 2, 10, 5);
    c.fillRect(x0 + CAR_W - 16, y0 + 2, 10, 5);
    // brake lights
    const braking = state === 'braking';
    c.fillStyle = braking ? '#ff2a2a' : '#7a1020';
    c.fillRect(x0 + 5, y0 + h - 6, 12, 5);
    c.fillRect(x0 + CAR_W - 17, y0 + h - 6, 12, 5);
    if (braking) {
      c.fillStyle = 'rgba(255,40,40,0.25)';
      c.fillRect(x0 - 6, y0 + h - 4, CAR_W + 12, 26);
    }
  }

  return {
    down(_p, e) {
      trigger(eventTime(e));
    },
    key(e) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        trigger(eventTime(e));
      }
    },
    update(now) {
      const dtFrame = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
      lastFrame = now;
      if (state === 'countdown') {
        const k = Math.floor((now - countStart) / (COUNT_MS / 3));
        if (k !== lastBeep && k < 3) {
          lastBeep = k;
          sfx.beep(440);
        }
        if (now - countStart >= COUNT_MS) {
          state = 'driving';
          t0 = countStart + COUNT_MS;
          sfx.beep(880);
          engine = sfx.startEngine();
        }
      }
      if (state === 'driving') {
        x = (P.v * Math.max(0, now - t0)) / 1000;
        speed = P.v;
        sfx.setFreq(engine, 50 + speed * 5);
        if (x >= limit) reachLimit(P.v, now);
      } else if (state === 'braking') {
        const dt = Math.max(0, (now - tb) / 1000);
        if (now >= tHit) reachLimit(impact, now);
        else if (dt >= P.v / P.decel) stopped(now);
        else {
          x = xb + P.v * dt - (P.decel * dt * dt) / 2;
          speed = P.v - P.decel * dt;
          sfx.setGain(screech, 0.05 + 0.2 * (speed / P.v));
        }
      }
      for (const p of particles) {
        p.x += p.vx * dtFrame;
        p.y += p.vy * dtFrame;
        p.vy += 420 * dtFrame;
        p.life -= dtFrame * 0.7;
      }
      particles = particles.filter((p) => p.life > 0);
    },
    render(c, now) {
      // camera: follows the car; after a clean stop it zooms into the gap
      let ppm = basePpm;
      let focusW = x;
      let focusS = CAR_Y;
      let zoomK = 0;
      if (state === 'stopped') {
        zoomK = easeInOut(clamp((now - endT) / 1000, 0, 1));
        const gap = Math.max(Math.abs(P.D - stopX), 0.0005);
        const zp = clamp(90 / gap, basePpm, 4000);
        ppm = Math.exp(lerp(Math.log(basePpm), Math.log(zp), zoomK));
        focusW = lerp(x, (x + P.D) / 2, zoomK);
        focusS = lerp(CAR_Y, 360, zoomK);
      }
      const ws = (wy: number) => focusS - (wy - focusW) * ppm;

      c.save();
      if (state === 'crashed') {
        const s = Math.max(0, 1 - (now - endT) / 500) * 10;
        c.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      }

      // grass + road
      c.fillStyle = P.objective === 'wall' ? '#07210f' : '#263043';
      c.fillRect(-20, -20, W + 40, H + 40);
      c.fillStyle = P.road.asphalt;
      c.fillRect(ROAD_L, -20, ROAD_R - ROAD_L, H + 40);
      c.fillStyle = '#e8f1ff';
      c.fillRect(ROAD_L - 6, -20, 4, H + 40);
      c.fillRect(ROAD_R + 2, -20, 4, H + 40);

      const wMin = focusW - (H - focusS) / ppm - 5;
      const wMax = focusW + focusS / ppm + 5;
      // lane dashes every 6 m
      c.fillStyle = 'rgba(232,241,255,0.55)';
      for (let k = Math.floor(wMin / 6); k * 6 < Math.min(wMax, limit); k++) {
        const y1 = ws(k * 6 + 3);
        const y2 = ws(k * 6);
        c.fillRect(W / 2 - 2, y1, 4, y2 - y1);
      }
      // distance markers every 10 m before the wall
      for (let m = 10; P.D - m > wMin; m += 10) {
        const wy = P.D - m;
        if (wy > wMax) continue;
        const y = ws(wy);
        c.fillStyle = 'rgba(255,210,63,0.5)';
        c.fillRect(ROAD_R - 30, y, 30, 2);
        text(c, `${m}m`, ROAD_R + 26, y, { size: 20, color: C.yellow });
      }

      // skid marks
      if (state !== 'ready' && state !== 'countdown' && state !== 'driving' && xb > 0) {
        c.fillStyle = 'rgba(0,0,0,0.55)';
        const yTop = ws(x) + CAR_H - 16;
        const yBot = ws(xb) + CAR_H - 16;
        c.fillRect(W / 2 - CAR_W / 2 + 6, yTop, 6, Math.max(0, yBot - yTop));
        c.fillRect(W / 2 + CAR_W / 2 - 12, yTop, 6, Math.max(0, yBot - yTop));
      }

      // wall
      const wallY = ws(P.D);
      const wallX = ROAD_L - 30;
      const wallW = ROAD_R - ROAD_L + 60;
      if (P.objective === 'wall') {
        c.fillStyle = '#7a2e1d';
        c.fillRect(wallX, wallY - 40, wallW, 40);
        c.save();
        c.beginPath();
        c.rect(wallX, wallY - 40, wallW, 40);
        c.clip();
        c.fillStyle = '#a0412a';
        for (let row = 0; row < 4; row++)
          for (let col = -1; col < 12; col++) c.fillRect(wallX + col * 24 + (row % 2) * 12, wallY - 40 + row * 10, 22, 8);
        c.fillStyle = C.yellow;
        for (let i = 0; i < 10; i++) c.fillRect(wallX + i * 26, wallY - 3, 13, 3);
        c.restore();
      } else if (P.objective === 'parking') {
        // The front bumper belongs inside this band, with the ideal stop at D.
        const bayTop = ws(P.D + PARKING_TOLERANCE_M);
        const bayBottom = ws(P.D - PARKING_TOLERANCE_M);
        c.fillStyle = 'rgba(77,227,255,0.12)';
        c.fillRect(ROAD_L + 12, bayTop, ROAD_R - ROAD_L - 24, bayBottom - bayTop + CAR_H);
        c.strokeStyle = C.cyan;
        c.lineWidth = 4;
        c.strokeRect(ROAD_L + 12, bayTop, ROAD_R - ROAD_L - 24, bayBottom - bayTop + CAR_H);
        c.save();
        c.setLineDash([8, 6]);
        c.beginPath();
        c.moveTo(ROAD_L + 16, wallY);
        c.lineTo(ROAD_R - 16, wallY);
        c.stroke();
        c.restore();
        text(c, 'P', ROAD_L + 36, bayTop + 26, { size: 36, color: C.cyan, outline: 3 });
      } else {
        // Red light and pedestrian crossing beyond the stopping line.
        c.fillStyle = '#e8f1ff';
        for (let stripe = ROAD_L + 8; stripe < ROAD_R - 8; stripe += 26) {
          c.fillRect(stripe, ws(P.D + 5), 16, Math.max(10, 2 * ppm));
        }
        c.fillRect(ROAD_L, wallY - 6, ROAD_R - ROAD_L, 6);
        c.fillStyle = '#050a14';
        c.fillRect(ROAD_R + 14, wallY - 110, 30, 86);
        c.fillStyle = '#ff4d4d';
        c.fillRect(ROAD_R + 21, wallY - 101, 16, 16);
        c.fillStyle = '#55451b';
        c.fillRect(ROAD_R + 21, wallY - 76, 16, 16);
        c.fillStyle = '#16402c';
        c.fillRect(ROAD_R + 21, wallY - 51, 16, 16);
      }

      // car
      const crumple = state === 'crashed' ? 18 : 0;
      drawCar(c, ws(x), crumple);

      // particles
      for (const p of particles) {
        c.globalAlpha = clamp(p.life, 0, 1);
        c.fillStyle = p.color;
        c.fillRect(p.x - p.size / 2, wallY + p.y - p.size / 2, p.size, p.size);
      }
      c.globalAlpha = 1;
      c.restore();

      // crash flash
      if (state === 'crashed') {
        const f = 1 - clamp((now - endT) / 250, 0, 1);
        if (f > 0) {
          c.fillStyle = `rgba(255,255,255,${f * 0.8})`;
          c.fillRect(0, 0, W, H);
        }
      }

      // measurement arrow after zoom
      if (state === 'stopped' && zoomK > 0.85) {
        const y1 = wallY;
        const y2 = ws(stopX);
        const ax = W / 2 + CAR_W / 2 + 22;
        c.strokeStyle = C.cyan;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(ax - 8, y1);
        c.lineTo(ax + 8, y1);
        c.moveTo(ax - 8, y2);
        c.lineTo(ax + 8, y2);
        c.moveTo(ax, y1);
        c.lineTo(ax, y2);
        c.stroke();
        text(c, fmtCm(gapCm), ax + 12, (y1 + y2) / 2, { size: 26, color: C.cyan, align: 'left', outline: 4 });
      }

      // HUD
      if (state !== 'stopped' && state !== 'crashed' && state !== 'failed') {
        c.fillStyle = 'rgba(5,10,20,0.8)';
        c.fillRect(0, 26, W, 30);
        text(c, P.road.label, 12, 41, { size: 22, color: C.text, align: 'left' });
        text(c, `${Math.round(speed * 3.6)} km/h`, W - 12, 41, { size: 24, color: C.yellow, align: 'right' });
        if (state === 'driving' || state === 'braking')
          text(c, `${goal.target} ${(P.D - x).toFixed(1)} m`, W / 2, 80, { size: 30, color: C.text, outline: 5, maxWidth: W - 24 });
      }

      if (state === 'ready') {
        text(c, goal.title, W / 2, 140, { size: 58, color: C.yellow, outline: 7, maxWidth: W - 24 });
        text(c, goal.instruction, W / 2, 182, { size: 23, color: C.text, outline: 4, maxWidth: W - 24 });
        text(c, `${P.kmh} km/h`, W / 2, 210, { size: 24, color: C.yellow, outline: 4 });
        text(c, 'TAP TO START', W / 2, 300 + Math.sin(now / 200) * 4, { size: 36, color: C.cyan, outline: 5 });
        text(c, 'then TAP (or SPACE) to brake', W / 2, 334, { size: 22, color: C.muted, outline: 3 });
      } else if (state === 'countdown') {
        const k = 3 - Math.floor((now - countStart) / (COUNT_MS / 3));
        text(c, String(Math.max(1, k)), W / 2, 260, { size: 120, color: C.yellow, outline: 8 });
      } else if (state === 'driving' && now - t0 < 500) {
        text(c, 'GO!', W / 2, 260, { size: 110, color: C.green, outline: 8, alpha: 1 - (now - t0) / 500 });
      }
      if (state === 'stopped' || state === 'crashed' || state === 'failed') {
        const detail = result?.detail ?? { crashed: state === 'crashed', objective: P.objective };
        drawResultCompanion(c, score, 'brake', fmtResult('brake', { score, detail }), detail);
      }
    },
    destroy() {
      clearTimeout(resultSound);
      sfx.stop(engine);
      sfx.stop(screech);
    },
  };
}
