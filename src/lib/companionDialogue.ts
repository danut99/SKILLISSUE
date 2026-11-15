import { resultTaunt } from './resultTaunts';
import type { Mode } from '../config';
import { dailyDrawShape } from './drawShapes';
import { dailyBrakeObjective } from './brakeChallenge';

export type Companion = 'demon' | 'angel';
export interface CompanionLine { speaker: Companion; text: string; scoring?: string }

export const GAME_INTROS: Record<Mode, CompanionLine[]> = {
  draw: [
    { speaker: 'demon', text: "A perfect shape? Your last one looked like a potato." },
    { speaker: 'angel', text: "Ignore him. One smooth stroke around the dot. You've got this." },
    { speaker: 'demon', text: "Five tries. Plenty of time to invent a new shape." },
    { speaker: 'angel', text: "Follow today's outline and close the loop. Let's draw!" },
  ],
  cut: [
    { speaker: 'demon', text: "Fifty-fifty? You can't even split a pizza fairly." },
    { speaker: 'angel', text: "Look at the whole blob. Aim for equal areas, not equal widths." },
    { speaker: 'demon', text: "The blob has eyes. It's judging your knife skills." },
    { speaker: 'angel', text: "Drag one straight cut through it. Take your time before you slice." },
  ],
  brake: [
    { speaker: 'demon', text: "Meet the wall. I think you two will get very close." },
    { speaker: 'angel', text: "Check today's road and speed. You need room to slow down." },
    { speaker: 'demon', text: "Keep going. The wall looks softer from here." },
    { speaker: 'angel', text: "Tap to start, then tap or press Space to brake. Stop close, stay in one piece!" },
  ],
};

export function gameDialogue(mode: Mode, date: string): CompanionLine[] {
  if (mode === 'brake') {
    const instruction = {
      wall: 'Stop as close to the wall as you can without hitting it.',
      parking: 'Stop with the whole car inside the parking bay. Line it up with the dashed outline: dead center scores 100.',
      'stop-line': 'The light is red. Stop as close as you can before the white line. Crossing it costs the try.',
    }[dailyBrakeObjective(date)];
    const objective = dailyBrakeObjective(date);
    const scoring = objective === 'parking'
      ? 'Your final position decides your points: centered = 100; 1 m off center = about 92; 2 m = about 85. Partly outside the bay reduces your score further. Miss the bay entirely = 0.'
      : 'Your final stopping gap decides your points, not where you brake: 10 cm = about 99; 50 cm = 96; 1 m = 92; 2 m = 85; 5 m = 66; 10 m = 43. Closer earns more, with no fixed distance cutoff. Hit the wall or cross the stop line = 0.';
    return [
      { speaker: 'angel', text: `${instruction} Check the road and speed. Tap to start, then tap or press Space to brake. The car takes time to stop!`, scoring },
      { speaker: 'demon', text: objective === 'parking' ? 'One parking bay. An entire car. Try introducing them properly.' : 'The brake pedal. Try using it before the wall does.' },
    ];
  }
  if (mode === 'cut') return [
    { speaker: 'angel', text: 'Drag across the shape, then release to make one straight cut. Aim for two equal areas, not equal widths.', scoring: 'A 50/50 split earns 100 points. 55/45 earns 80; 60/40 earns 60. The more evenly you split the area, the higher your score.' },
    { speaker: 'demon', text: "Fifty-fifty? You can't even split a pizza fairly." },
  ];
  const shape = dailyDrawShape(date);
  return [
    { speaker: 'angel', text: `Today's shape is a ${shape}. Study the outline, then hold and draw around the dot in one continuous stroke. Close the loop without lifting. You have 8 seconds, starting on touch.`, scoring: 'A more accurate shape earns a higher percentage, up to 99.9%. Uneven edges and a gap between the ends lower your score. Getting too close to the dot or leaving the shape incomplete earns 0.' },
    { speaker: 'demon', text: `A perfect ${shape}? Let's see if you can resist drawing a potato.` },
  ];
}

export function resultDialogue(mode: Mode, score: number, date?: string): CompanionLine[] {
  if (score >= 80) return [
    { speaker: 'angel', text: score >= 95 ? "Look at that score! I knew you had it in you." : "Nice work! You've got this. Let's aim even higher." },
  ];
  return [{ speaker: 'demon', text: resultTaunt(mode, score, mode === 'brake' && date ? { objective: dailyBrakeObjective(date) } : {}) }];
}
