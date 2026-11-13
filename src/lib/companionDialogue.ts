import type { Mode } from '../config';
import { dailyDrawShape } from './drawShapes';
import { dailyBrakeObjective } from './brakeChallenge';

export type Companion = 'demon' | 'angel';
export interface CompanionLine { speaker: Companion; text: string }

export const GAME_INTROS: Record<Mode, CompanionLine[]> = {
  draw: [
    { speaker: 'demon', text: "A perfect shape? Your last one looked like a potato." },
    { speaker: 'angel', text: "Ignore him. One smooth stroke around the dot. You've got this." },
    { speaker: 'demon', text: "Three tries. Plenty of time to invent a new shape." },
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
    return [{ speaker: 'angel', text: `${instruction} Check the road and speed, then tap to start and tap or press Space to brake.` }];
  }
  if (mode !== 'draw') return GAME_INTROS[mode];
  const shape = dailyDrawShape(date);
  return [
    { speaker: 'demon', text: `A perfect ${shape}? Your last one looked like a potato.` },
    { speaker: 'angel', text: `Today's shape is a ${shape}. Study the outline, then draw it in one stroke.` },
    ...GAME_INTROS.draw.slice(2),
  ];
}

export function resultDialogue(mode: Mode, score: number, date?: string): CompanionLine[] {
  if (score >= 80) return [
    { speaker: 'angel', text: score >= 95 ? "Look at that score! I knew you had it in you." : "Nice work! You've got this. Let's aim even higher." },
  ];
  const tease: Record<Mode, string> = {
    draw: "A shape with personality. That's what we're calling it?",
    cut: "One half is definitely getting more dinner.",
    brake: date && dailyBrakeObjective(date) === 'parking'
      ? "It's a parking bay. Somehow you made it a suggestion."
      : date && dailyBrakeObjective(date) === 'stop-line'
        ? 'The traffic camera is getting your best angle.'
        : score === 0 ? "The wall would like your insurance details." : "You left enough room to park another car.",
  };
  return [{ speaker: 'demon', text: tease[mode] }];
}
