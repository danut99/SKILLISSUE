import { dayNumber } from './daily';
import { round2 } from './geometry';
import type { Detail } from './store';

export const BRAKE_OBJECTIVES = ['wall', 'parking', 'stop-line'] as const;
export type BrakeObjective = typeof BRAKE_OBJECTIVES[number];
export const PARKING_TOLERANCE_M = 2.5;

export const BRAKE_GOALS: Record<BrakeObjective, { title: string; instruction: string; target: string }> = {
  wall: { title: 'WALL STOP', instruction: 'Stop close. Avoid the wall.', target: 'WALL' },
  parking: { title: 'PARK IT!', instruction: 'Stop inside the bay. Centered = 100.', target: 'PARKING' },
  'stop-line': { title: 'RED LIGHT!', instruction: 'Stop close. Stay behind the line.', target: 'STOP LINE' },
};

export function dailyBrakeObjective(date: string): BrakeObjective {
  const index = ((dayNumber(date) - 1) % BRAKE_OBJECTIVES.length + BRAKE_OBJECTIVES.length) % BRAKE_OBJECTIVES.length;
  return BRAKE_OBJECTIVES[index];
}

/** Distance in centimeters from the desired stopping position. */
export const brakeScore = (gapCm: number, distanceScaleCm = 200) => (gapCm < 0.05 ? 100 : Math.min(99.9, 100 * Math.exp(-gapCm / distanceScaleCm)));

export function brakeFeedback(score: number, detail: Detail): { title: string; tip: string } {
  if (detail.crashed || (detail.fail && detail.objective === 'stop-line') || (detail.offsetCm ?? 0) < 0) {
    // A small parking overshoot can still be an excellent result.
    if (!detail.fail && !detail.crashed && score >= 95) return { title: 'Almost perfect!', tip: 'Keep that timing. You are very close.' };
    return { title: 'Too late!', tip: 'Brake a little earlier next time.' };
  }
  if (score >= 99.95) return { title: 'Perfect stop!', tip: 'You nailed the timing.' };
  if (!detail.fail && score >= 95) return { title: 'Almost perfect!', tip: 'Keep that timing. You are very close.' };
  return { title: 'Too early!', tip: 'Wait a little longer before braking.' };
}

/**
 * `target` is where the front bumper sits when the car is centered in the parking bay.
 * Parking: fully inside the bay scores by centering; partly inside scores the bay-edge score
 * times the share of the car inside; no part inside fails. `carLenM` is the car length in meters.
 */
export function brakeStopResult(objective: BrakeObjective, target: number, position: number, carLenM = 0, distanceScaleCm = 200): { score: number; detail: Detail } {
  const offsetM = target - position;
  const gapCm = round2(Math.abs(offsetM) * 100);
  const base = { objective, gapCm, offsetCm: round2(offsetM * 100) };
  if (objective !== 'parking') {
    return offsetM < 0 ? { score: 0, detail: { ...base, fail: true } } : { score: round2(brakeScore(gapCm, distanceScaleCm)), detail: base };
  }
  const outM = Math.abs(offsetM) - PARKING_TOLERANCE_M;
  if (outM <= 0) return { score: round2(brakeScore(gapCm, distanceScaleCm)), detail: base };
  if (outM < carLenM) {
    const inside = 1 - outM / carLenM;
    return { score: round2(brakeScore(PARKING_TOLERANCE_M * 100, distanceScaleCm) * inside), detail: { ...base, partial: true } };
  }
  return { score: 0, detail: { ...base, fail: true, missCm: round2((outM - carLenM) * 100) } };
}
