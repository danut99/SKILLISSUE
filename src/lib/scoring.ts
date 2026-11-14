import { GAME_NAME, MODE_INFO, MODES, type BoardMode, type Mode, siteUrl } from '../config';
import { PARKING_TOLERANCE_M } from './brakeChallenge';
import { dayNumber } from './daily';
import { bestAttempt, modeDay, totalScore, type Attempt, type ModeDay, usePlayer } from './store';

export const fmtCm = (cm: number) => (cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${cm.toFixed(1)} cm`);

/** Human-readable result of an attempt / leaderboard row. */
export function fmtResult(mode: BoardMode, a: Pick<Attempt, 'score' | 'detail'> | null): string {
  if (!a) return '—';
  if (mode === 'overall') return a.score.toFixed(1);
  const d = a.detail ?? {};
  if (mode === 'brake' && d.fail && d.objective === 'parking') return 'MISSED BAY';
  if (mode === 'brake' && d.fail && d.objective === 'stop-line') return 'OVER LINE';
  if (d.timedOut) return 'TIME UP';
  if (d.fail) return '💀';
  if (mode === 'draw') return `${a.score.toFixed(1)}%`;
  if (mode === 'cut') return d.a != null && d.b != null ? `${d.a.toFixed(1)} / ${d.b.toFixed(1)}` : `${a.score.toFixed(1)}`;
  if (d.crashed) return '💥 CRASH';
  return d.gapCm != null ? fmtCm(d.gapCm) : a.score.toFixed(1);
}

export function emojiFor(a: Attempt): string {
  if (a.detail.fail || a.detail.crashed) return '💥';
  const cb = usePlayer.getState().settings.colorblind;
  if (a.score >= 95) return cb ? '🟧' : '🟩';
  if (a.score >= 80) return cb ? '🟦' : '🟨';
  return cb ? '⬛' : '🟥';
}

export const emojiRow = (md: ModeDay) => md.tries.map(emojiFor).join('');

export type Tone = 'good' | 'ok' | 'bad';
export const toneFor = (score: number): Tone => (score >= 95 ? 'good' : score >= 80 ? 'ok' : 'bad');

const BADGES: Record<Mode, [number, string][]> = {
  draw: [
    [98, 'Laser-Guided Robot 🤖'],
    [93, 'Human Compass 🧭'],
    [85, 'Steady Barista ☕'],
    [70, 'Wobbly Toddler 🍼'],
    [50, 'Drew It On A Bus 🚌'],
    [0, 'Blindfolded Potato 🥔'],
  ],
  cut: [
    [99.5, 'Laser Surgeon 🔬'],
    [97, 'Pizza Diplomat 🍕'],
    [90, 'Fair-ish Sibling 👀'],
    [75, 'Takes The Bigger Half 😏'],
    [50, 'Lumberjack With Hiccups 🪓'],
    [0, 'Blindfolded Potato 🥔'],
  ],
  brake: [
    [99, 'Human Parking Sensor 📡'],
    [95, 'F1 Rookie 🏎️'],
    [80, 'Nervous Driving Instructor 😬'],
    [50, 'Grandma On A Sunday 👵'],
    [1, 'Brakes In Another Postcode 🐌'],
    [0, 'Insurance Fraud 💥'],
  ],
};

export function badgeFor(mode: Mode, a: Attempt | null): string {
  if (!a) return 'Unranked Mystery 🫥';
  return BADGES[mode].find(([min]) => a.score >= min)![1];
}

export function overallBadge(total: number): string {
  if (total >= 285) return 'Laser-Guided Robot 🤖';
  if (total >= 255) return 'Human Compass 🧭';
  if (total >= 210) return 'Suspiciously Average 😐';
  if (total >= 150) return 'Wobbly Intern 🫠';
  return 'Blindfolded Potato 🥔';
}

const CRASH_ROASTS = ['The wall won.', 'Insurance has been notified.', 'Brakes are the OTHER pedal.'];

export function roastFor(mode: Mode, a: Attempt): string {
  const s = a.score;
  if (mode === 'draw') {
    if (s >= 98) return 'Ok robot, calm down.';
    if (s >= 93) return 'Your geometry teacher just smiled.';
    if (s >= 85) return 'Almost perfect. Your ruler is nervous.';
    if (s >= 70) return 'That shape has seen things.';
    if (s >= 50) return 'Geometry has left the chat.';
    return 'Picasso would call this "a bit much".';
  }
  if (mode === 'cut') {
    if (s >= 99.5) return 'Surgeons are taking notes.';
    if (s >= 97) return 'Your siblings would accept this split.';
    if (s >= 90) return "Someone's getting the bigger piece. It's you.";
    if (s >= 75) return "That's not half. That's a negotiation.";
    return 'You cut it like a toddler with safety scissors.';
  }
  if (a.detail.crashed) return CRASH_ROASTS[(a.detail.impactKmh ?? 0) % CRASH_ROASTS.length];
  if (a.detail.objective === 'parking') {
    if (a.detail.fail) {
      const offset = a.detail.offsetCm ?? 0;
      const outCm = Math.max(1, Math.round(a.detail.missCm ?? Math.abs(offset) - PARKING_TOLERANCE_M * 100));
      const out = outCm >= 100 ? `${(outCm / 100).toFixed(1)} m` : `${outCm} cm`;
      return offset < 0 ? `Overshot the bay by ${out}.` : `Stopped ${out} short of the bay.`;
    }
    if (a.detail.partial) return (a.detail.offsetCm ?? 0) < 0 ? 'Half parked, half on the road ahead.' : 'Half parked. The rest is still driving in.';
    if (s >= 95) return 'Valet parking wants your number.';
    return 'Safely inside the bay. Center it for more points.';
  }
  if (a.detail.objective === 'stop-line') {
    if (a.detail.fail) return 'Red means stop. The camera saw that.';
    if (s >= 95) return 'Driving test passed. Somehow.';
    if (s >= 85) return 'A sensible gap. Your driving instructor approves.';
    return 'The light is red. Your timing needs work.';
  }
  const cm = a.detail.gapCm ?? 9999;
  if (cm < 1) return 'The wall felt your breath. 😱';
  if (cm < 10) return 'Parking sensors are jealous.';
  if (cm < 50) return 'Solid. Mildly terrifying.';
  if (cm <= 250) return 'Safe stop. The bumper thanks you.';
  return 'You braked in a different postcode.';
}

export type Ranks = Partial<Record<BoardMode, number | null>>;

/** Wordle-style share text. */
export function shareText(date: string, ranks: Ranks, onlyMode?: Mode): string {
  const { days } = usePlayer.getState();
  const lines = [`${GAME_NAME} #${dayNumber(date)} 🫠`];
  for (const m of onlyMode ? [onlyMode] : MODES) {
    const md = modeDay(days, date, m);
    const best = bestAttempt(md);
    const info = MODE_INFO[m];
    if (!best) {
      lines.push(`${info.emoji} ${info.name}: skipped 🐔`);
      continue;
    }
    const rank = ranks[m] ? ` (#${ranks[m]} today)` : '';
    lines.push(`${info.emoji} ${info.name}: ${fmtResult(m, best)} ${emojiRow(md)}${rank}`);
  }
  if (!onlyMode) {
    const total = totalScore(days, date);
    const rank = ranks.overall ? ` · #${ranks.overall} worldwide` : '';
    lines.push(`🏆 ${total.toFixed(1)}/300${rank}`);
  }
  if (usePlayer.getState().settings.shareLink) lines.push(siteUrl());
  return lines.join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
