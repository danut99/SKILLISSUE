# VROOMBOX

Draw a vehicle, optionally give it a voice engine, and drive it through the seasons.

## Current scope

- Drawing editor: pencil, fill, eraser, movable wheels, six free wheel styles, and undo/redo for both drawing and wheel changes. The pencil starts selected, the paper fits the initial screen size, and the tool dock keeps its height when switching tools.
- Garage: saved drawings and engines stay on the device. A failed save keeps the editor available for retry.
- Six levels: three hand-built Spring levels (Easy 300 m, Medium 350 m, Hard 400 m; each harder one unlocks after finishing the previous) and one 480 m level for each other season. Finish to earn a star, collect all the track stars for another, and finish from the start within the posted time (46 / 61 / 80 seconds for Spring 1 / 2 / 3, 100 in the other seasons) for the time star.
- Infinite driving in all four seasons, with fuel pickups and personal distance records.
- Seasonal hazards appear beyond the safe start: spring mud/potholes/rocks, summer potholes/bumps/rocks, autumn mud/potholes/rocks, winter snow drifts/ice. Mud and snow have shallow edges and deeper centres; resistance depends on depth, tire type and wheel size. Holding the gas while crawling through mud or snow spins the tires and digs them in (off-road tires never dig); pulsing the gas or backing up lets them recover. Holding the gas for 5 s without progress in mud ends the run as bogged; reversing resets that timer. Ice reduces friction. Rock gardens group 3–6 mixed-size rocks, growing tougher along infinite tracks. Small-wheel, low-clearance drawings can get caught; larger wheels are a useful redesign. Warning signs announce surface hazards.
- Replay/video export, optional voice engine, mute, pause, and automatic pause when the window loses focus. Driving is weighty: the center of mass sits partway up the body, so hard gas lifts the nose and braking dips it. In the air GAS spins the nose up and BRAKE spins it down; releasing both keeps the current rotation, so holding the gas through a long jump flips the vehicle. Flips are not celebrated or presented as a goal.

Pulling, delivery, daily missions, coins, and upgrades are outside the active player flow. Their older data and supporting definitions are retained for compatibility; driving uses stock settings. Seasonal level records use IDs 101–104, separate from the old campaign. Internal map IDs are retained for garage/record compatibility: farm = spring, desert = summer, moon = autumn, snow = winter. Every season uses normal gravity.

## Development

Run inside `vroombox/`:

```sh
npm install
npm run dev
npm test
npm run build
```

The local URL is http://localhost:5180. For microphone testing on a phone on the same Wi-Fi, use `npm run dev:phone` and the printed HTTPS address.

The original `PLAN.md` is historical research, not the current feature specification. Real-device microphone permissions, mobile video sharing, and installed/offline PWA behavior still need device testing.

World scenery now uses procedural Canvas geometry and cached code-generated soil grain, with no world image requests. Mud/snow render a soft surface above the solid bed, including a foreground layer over submerged wheels; resistance uses actual tire immersion. This is a lightweight approximation rather than a fluid simulation.

Spring starts with low rocks and builds up to larger clusters. Summer features the long jump, autumn has two staggered timber piles, and winter combines deep snow with ice. The full-course simulation checks each season with one stock build, normal fuel and all three stars.

Levels have a checkpoint every 100 m. Retry or edit the vehicle to return to the last checkpoint during the same session. A resumed finish can earn completion and collection stars. Time awards and ghosts require an uninterrupted run from the start on the current course revision. Earned stars carry over when courses change.

The summer course reserves a runway after 300 m, an 8 m takeoff ramp, a roughly 12 m gap and a clear landing. A camera pullback and an approach hint signal the jump. Larger wheels trade speed for ground clearance.

The autumn course introduces two timber piles after 100 m. Each has three lodged trunks, a loose upper log and a loose exit log. Rocky sections pair approach stones with a raised shelf.  Endless routes retain both long jumps and timber crossings.

Jump correction: the gap now spans roughly 12m and uses a common elevation datum for launch and landing, preventing downhill map slopes from granting slow builds an easy crossing. Real-map tests across all seasons compare medium sport tires against oversized off-road tires from the 300m checkpoint. The former clear the jump; the latter fail before the far bank. No speed gate or scripted failure is applied.

Garage economy: completed seasonal courses award 120 coins for first completion plus 30 per newly paid star, and 20 for subsequent full replays. Resumed repeats pay only newly earned goals, preventing checkpoint-finish farming; failed attempts pay nothing. Payout history is separate from existing saved stars. The selected vehicle has three tracks (engine, tires, suspension), each with three levels costing 100/220/400. Upgrade balances and per-vehicle levels persist locally; existing legacy upgrades remain a capped compatibility baseline. Workshop is reachable from Home, Garage, and race results. Drawing remains free.

Spring levels (`src/game/springCourses.ts`, ids 101 / 111 / 112): three authored courses, easy to hard, where every section asks for a driving skill and holding full gas never finishes. Obstacles are mixed along each course. Gentle rolling waves (up to about 0.9 m) run under the courses after the start straight, flattening out around the set pieces. Jumps use built wooden ramps (`kicker` gadgets: a wedge you drive up and launch off) rather than bumps of earth. Holding the gas through a long jump flips the car. Spring 1 (Easy, 300 m): rollers, a small first ramp, shallow mud, low stones, a steep crest topped by a ramp (arrive fast and you fly down the slope), the collapsing creek bridge, logs, a ramp over a ditch and a last ramp. Spring 2 (Medium, 350 m): bigger stones and logs than Spring 1, tall rollers, a seesaw plank (crawl up, let it tip), deep mud (pulse the gas), a pit, a ramp over a deep ditch, the 8 m gap with a 3 m lip, a drawbridge over a ravine (hinged at the far bank; down 4 s, lifts for about 3 s; a traffic light beside it shows green, then flashing yellow 1.5 s before it lifts with two beeps, then red with a low tone while it is up), another stone shelf, tall whoops and a final ramp. Spring 3 (Hard, 400 m, needs big wheels): big stone shelves and log piles, tall whoops, deep mud, a 1.9 m ramp over a deep ditch, a seesaw, a big 2.5 m star ramp, a second crest with a ramp on top, a collapsing bridge, a pit, deeper mud and a climb with small barrels rolling down it every 4.5 s, then a plateau ramp. Gadgets (`Gadget` in `track.ts`, tuning in `gadgets.ts`: kicker, seesaw, drawbridge, barrels) are physics bodies built per chunk in `sim.ts` and drawn in `render.ts`; their timers use the step count, so replays and ghosts stay exact. Barrels never count as a roof crash. Each course's `sections` drive the on-screen hint. Each level has three track stars on jump lines. Time stars: 46 / 61 / 80 s; careful drivers finish in about 50 / 67 / 90 s, confident ones in about 43 / 58 / 75 s. Tests (`springCourses.test.ts`, using the test-only drivers in `drivers.testutil.ts`) check, per level, that full gas fails for every build after the first 100 m, a careful driver finishes with the stock tractor and medium classic/off-road/cookie builds (big-wheel builds on the hard level) and every star, confident driving earns the time star and tiny wheels need a redesign; plus that small wheels pass the medium level but not the hard one, sport tires pass the easy level but sink later, the crest ramp flips a car held on the gas, a slow car falls through the creek bridge, the seesaw tips, the gap needs momentum, the drawbridge lifts on its timer, and barrels roll toward the player. The Spring course revision is bumped so old times and ghosts are not compared with the new layouts.

Workshop previews and failure feedback: upgrade cards show current/next physics effect percentages relative to an unupgraded setup. Each card opens the Atelier page: a side-by-side replay of a 50 m full-throttle sprint (current setup vs. the next upgrade level) with live km/h and finish times, plus measured speed at 50 m, 0–50 m and 0–50 m on ice. Engine is compared on tarmac, tires on ice; suspension shows its effect percentages only, since it does not change straight-line speed. Measurements run the real deterministic sim on a flat lane, are cached per vehicle and setup, and never spend coins; buying is still an explicit button. Failure messages distinguish actual low far-bank contacts, falls into a gap, chassis support with unloaded wheels and observed wheelspin without progress. Conservative surface/crash advice remains the fallback when no specific observation is available.
