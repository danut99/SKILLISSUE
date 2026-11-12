import { dayNumber } from './daily';
import { round2 } from './geometry';
import type { Detail } from './store';

export const BRAKE_OBJECTIVES = ['wall', 'parking', 'stop-line'] as const;
export type BrakeObjective = typeof BRAKE_OBJECTIVES[number];
export const PARKING_TOLERANCE_M = 2.5;

export const BRAKE_GOALS: Record<BrakeObjective, { title: string; instruction: string; target: string }> = {
  wall: { title: 'WALL STOP', instruction: 'Stop close. Avoid the wall.', target: 'WALL' },
  parking: { title: 'PARK IT!', instruction: 'Park with your bumper on the marker.', target: 'PARKING' },
  'stop-line': { title: 'RED LIGHT!', instruction: 'Stop close. Stay behind the line.', target: 'STOP LINE' },
};

export function dailyBrakeObjective(date: string): BrakeObjective {
  const index = ((dayNumber(date) - 1) % BRAKE_OBJECTIVES.length + BRAKE_OBJECTIVES.length) % BRAKE_OBJECTIVES.length;
  return BRAKE_OBJECTIVES[index];
}

/** Distance in centimeters from the desired stopping position. */
export const brakeScore = (gapCm: number) => (gapCm < 0.05 ? 100 : Math.min(99.9, 100 * Math.exp(-gapCm / 200)));

export function brakeStopResult(objective: BrakeObjective, target: number, position: number): { score: number; detail: Detail } {
  const offsetM = target - position;
  const gapCm = round2(Math.abs(offsetM) * 100);
  const failed = objective === 'parking' ? Math.abs(offsetM) > PARKING_TOLERANCE_M : offsetM < 0;
  return {
    score: failed ? 0 : round2(brakeScore(gapCm)),
    detail: { objective, gapCm, offsetCm: round2(offsetM * 100), ...(failed ? { fail: true } : {}) },
  };
}
