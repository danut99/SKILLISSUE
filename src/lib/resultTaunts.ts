import type { Mode } from '../config';
import type { Detail } from './store';
export type TauntMode = Mode | 'balance' | 'count';
export type TauntBand = 'zero' | 'low' | 'mid' | 'high' | 'great';
export const RESULT_TAUNTS: Record<TauntMode, Record<TauntBand, readonly string[]>> = {
 draw: {
  zero: ['That shape has filed a missing person report.', 'Even the dot is confused.', 'You invented geometry. Unfortunately.', 'The outline was a suggestion, apparently.', 'A potato would like its portrait back.'],
  low: ['You drew that with confidence.', 'That belongs on a fridge. Facing the wall.', 'Your finger took the scenic route.', 'The shape asked for a different artist.', 'Somewhere, a ruler just snapped.'],
  mid: ["A shape with personality. That's what we're calling it?", 'The circle is considering legal action.', 'Recognizable. Under very generous lighting.', 'Geometry has requested a second opinion.', 'The outline and you have creative differences.'],
  high: ['Almost good. Annoyingly close, actually.', 'I can insult it, but I have to squint.', 'Your geometry teacher might unblock you.', 'A few corners away from bragging rights.', 'Fine. That resembles the assignment.'],
  great: ['Who drew that? Put the usual player back.', 'I had a roast ready. You ruined it.', 'Your finger has suspicious qualifications.', 'Fine. Screenshot it before reality returns.', 'That was good. I will deny saying this.'],
 },
 cut: {
  zero: ['You divided it into lunch and a crumb.', 'The knife missed its only responsibility.', 'The blob won without moving.', 'Two equal halves. Neither was found.', 'That was a slice of disappointment.'],
  low: ['Someone got the bigger half.', 'One half gets dinner. The other gets therapy.', 'That split needs a lawyer.', 'You cut the cake and kept the cake.', 'One side is paying all the rent.'],
  mid: ['One half is definitely getting more dinner.', "Fair, if you're the bigger half.", 'Equal enough to start an argument.', 'The smaller half would like a recount.', 'You split it using vibes and optimism.'],
  high: ["I'd let you split the bill. With supervision.", 'Almost fair. The blob is checking.', 'The family argument would be brief.', 'A little uneven. Like your confidence.', 'Fine. Both halves get a birthday.'],
  great: ['Even the blob suspects a calculator.', 'That knife has a mathematics degree.', 'Both halves have stopped complaining.', 'Fair enough to make siblings suspicious.', 'I checked twice. Annoyingly balanced.'],
 },
 brake: {
  zero: ['The wall would like your insurance details.', 'The brake pedal filed a missing driver report.', 'Your driving instructor left the chat.', 'The keys are going back to mum.', 'You found the wall. Finding the brake was the task.'],
  low: ['You left enough room to park another car.', 'Planning to walk the rest?', 'Your destination needs another taxi.', 'That gap has its own postcode.', 'The brake works. Your timing is under review.'],
  mid: ['Stopped safely. Somewhere in the general region.', 'The road is long. Apparently you noticed.', 'A stop was made. Precision was not.', 'Your instructor is doing breathing exercises.', 'The car stopped. The criticism continues.'],
  high: ["I'd trust you with a shopping cart.", 'Nearly trusted with the actual keys.', 'A decent stop. Do not honk for applause.', 'Your instructor only flinched a little.', 'Fine. The bumper lives another day.'],
  great: ["Fine. You can park. Don't make it your personality.", 'That bumper is holding its breath.', 'Your brake pedal deserves a promotion.', 'The instructor wants your notes.', 'Suspiciously good. Was the car helping?'],
 },
 balance: {
  zero: ['Gravity won. It was not a close match.', 'The plank has requested new management.', 'Two creatures trusted you. Past tense.', 'Your support was emotionally unavailable.', 'That was a seesaw demonstration. Wrong game.'],
  low: ['The plank leaned away from your decision.', 'Gravity sends its regards.', 'Your balance point is in another postcode.', 'Pip and Bob are reconsidering the friendship.', 'The support showed up. Accuracy did not.'],
  mid: ['Almost balanced. Very confidently tilted.', 'A fair effort. An unfair amount of leaning.', 'The plank is politely disagreeing.', 'Your physics teacher is taking a deep breath.', 'The middle and the balance point are different. Surprise.'],
  high: ['Nearly steady. The snacks are still nervous.', 'I would trust you with an empty tray.', 'A little wobble. A lot of confidence.', 'Fine. Most of lunch survived.', 'The plank is impressed. I remain difficult.'],
  great: ['Gravity would like a rematch.', 'You balanced that better than your priorities.', 'Fine. You may carry the drinks.', 'Pip and Bob have canceled their complaint.', 'That plank is suspiciously relaxed.'],
 },
 count: {
  zero: ['The dots were there. Where were you?', 'Your eyes submitted a blank answer sheet.', 'Counting was the task. Guessing was your choice.', 'Even the dots are recounting that disaster.', 'Five rounds. An impressive commitment to chaos.'],
  low: ['You counted the vibes, not the dots.', 'The dots outnumbered your attention span.', 'Your estimate came from another screen.', 'Your eyes would like a rematch.', 'Blinking is not a counting strategy.'],
  mid: ['Close enough for a guess. This was a count.', 'Some dots escaped your investigation.', 'Your eyes and your answer had a disagreement.', 'You spotted most of the problem.', 'Counting. With a creative margin of error.'],
  high: ['Sharp eyes. Slightly blunt counting.', 'Almost trusted to count the change.', 'A few dots are still waiting to be noticed.', 'Not bad. The dots look mildly concerned.', 'Your eyes have nearly earned their salary.'],
  great: ['Sharp eyes. Suspiciously sharp.', 'The dots are asking for witness protection.', 'Fine. You can count. Do not start with my flaws.', 'Your eyes apparently have a pause button.', 'Blink once if you are secretly a calculator.'],
 },
};
export const DRIVING_TAUNTS = {
 crash: ['The wall would like your insurance details.', 'You found the wall. Finding the brake was the task.', 'Your bumper is now wall decor.', 'The wall did not ask for a hug.', 'That was a collision, not a parking technique.'],
 parking: ["It's a parking bay. Somehow you made it a suggestion.", 'Lovely parking. Wrong postcode.', 'The parking bay is over THERE.', 'An entire bay. Still not enough instructions.', 'You parked outside the terms and conditions.'],
 line: ['The traffic camera is getting your best angle.', 'Red was apparently a suggestion.', 'You just subscribed to traffic fines.', 'The stop line is behind you, genius.', 'The light said stop. You heard sightseeing.'],
 parkingLow: ['The bay has a center. Introductions are overdue.', 'Inside the lines. Outside the ambition.', 'You parked diagonally from greatness.', 'The center of the bay misses you.', 'Safely parked. Artistically off-center.'],
 parkingGreat: ["Fine. You can park. Don't make it your personality.", 'The valet wants your number.', 'Centered. Unlike your usual decisions.', 'The parking lines are applauding.', 'Even the instructor took a screenshot.'],
};
export function tauntBand(score:number):TauntBand {
 return score<=0?'zero':score<40?'low':score<70?'mid':score<90?'high':'great';
}
/** A stable choice prevents flicker during canvas redraws and changes after reload. */
export function resultTaunt(mode:TauntMode,score:number,detail:Detail={},seed='',choice?:number):string {
 let pool:readonly string[]=RESULT_TAUNTS[mode][tauntBand(score)];
 if(mode==='brake') {
  if(detail.crashed)pool=DRIVING_TAUNTS.crash;
  else if(detail.fail&&detail.objective==='parking')pool=DRIVING_TAUNTS.parking;
  else if(detail.fail&&detail.objective==='stop-line')pool=DRIVING_TAUNTS.line;
  else if(detail.objective==='parking'&&score>0&&score<70)pool=DRIVING_TAUNTS.parkingLow;
  else if(detail.objective==='parking'&&score>=90)pool=DRIVING_TAUNTS.parkingGreat;
 }
 let hash=2166136261;
 for(const char of `${mode}:${score.toFixed(2)}:${JSON.stringify(detail)}:${seed}`){hash=Math.imul(hash^char.charCodeAt(0),16777619);}
 const index=choice===undefined?(hash>>>0)%pool.length:Math.min(pool.length-1,Math.max(0,Math.floor(choice*pool.length)));
 return pool[index];
}
