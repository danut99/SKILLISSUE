# VROOMBOX

Draw a vehicle, optionally give it a voice engine, and drive it through the seasons.

## Current scope

- Drawing editor: pencil, fill, eraser, movable wheels, six free wheel styles, and undo/redo for both drawing and wheel changes. The pencil starts selected, the paper fits the initial screen size, and the tool dock keeps its height when switching tools.
- Garage: saved drawings and engines stay on the device. A failed save keeps the editor available for retry.
- Four standalone 480 m levels, one per season. Finish to earn a star, collect all three track stars for another, and finish from the start within the posted time (100 seconds) for the time star.
- Infinite driving in all four seasons, with fuel pickups and personal distance records.
- Seasonal hazards appear beyond the safe start: spring mud/potholes/rocks, summer potholes/bumps/rocks, autumn mud/potholes/rocks, winter snow drifts/ice. Mud and snow have shallow edges and deeper centres; resistance depends on depth, tire type and wheel size. Ice reduces friction. Rock gardens group 3–6 mixed-size rocks, growing tougher along infinite tracks. Small-wheel, low-clearance drawings can get caught; larger wheels are a useful redesign. Warning signs announce surface hazards.
- Replay/video export, optional voice engine, mute, pause, and automatic pause when the window loses focus. Air controls give gentle tilt and level the vehicle on release. Flips are no longer celebrated or presented as a goal; physical rollovers remain possible.

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

Levels have checkpoints at 100, 200, 300 and 400 m. Retry or edit the vehicle to return to the last checkpoint during the same session. A resumed finish can earn completion and collection stars. Time awards and ghosts require an uninterrupted run from the start on the current course revision. Earned stars carry over when courses change.

The summer course reserves a runway after 300 m, an 8 m takeoff ramp, a roughly 12 m gap and a clear landing. A camera pullback and an approach hint signal the jump. Larger wheels trade speed for ground clearance.

The autumn course introduces two timber piles after 100 m. Each has three lodged trunks, a loose upper log and a loose exit log. Rocky sections pair approach stones with a raised shelf. Stopping with all wheel hubs submerged in deep mud ends the attempt after the vehicle settles. Endless routes retain both long jumps and timber crossings.

Jump correction: the gap now spans roughly 12m and uses a common elevation datum for launch and landing, preventing downhill map slopes from granting slow builds an easy crossing. Real-map tests across all seasons compare medium sport tires against oversized off-road tires from the 300m checkpoint. The former clear the jump; the latter fail before the far bank. No speed gate or scripted failure is applied.

Garage economy: completed seasonal courses award 120 coins for first completion plus 30 per newly paid star, and 20 for subsequent full replays. Resumed repeats pay only newly earned goals, preventing checkpoint-finish farming; failed attempts pay nothing. Payout history is separate from existing saved stars. The selected vehicle has three tracks (engine, tires, suspension), each with three levels costing 100/220/400. Upgrade balances and per-vehicle levels persist locally; existing legacy upgrades remain a capped compatibility baseline. Workshop is reachable from Home, Garage, and race results. Drawing remains free.

First-course redesign (level 101 only): authored 480m progression replaces random obstacle placement. Includes introductory ramp, shallow mud, small mixed stones, rolling timber, a hill and fixed creek bridge, a second deeper mud patch, raised shelf, an 8m momentum jump, pothole and short recoverable pit, and a final collectible ramp. Checkpoint clearings stay at 100/200/300/400m. First-course time goal is 55s; completion has no time limit beyond normal fuel mechanics. A direct retry button skips result/clip waiting. Course revision is bumped only for 101, retaining stars and isolating new time/ghost records from its previous layout. Other seasonal courses retain their layout and time goals. Tests cover unupgraded classic/sport/offroad completion, collectible/time mastery with a small balanced build, and slow-versus-fast jump crossing.

Workshop previews and failure feedback: upgrade cards show current/next physics effect percentages relative to an unupgraded setup. Free current/next-setup test drives use a fixed 190m proving ground (stones, hill, mud and a small jump), infinite fuel and no persistent rewards, time records or ghosts. Upgrade previews are immutable snapshots, never purchases. Trial results skip clip generation and return to the workshop. Failure messages distinguish actual low far-bank contacts, falls into a gap, chassis support with unloaded wheels and observed wheelspin without progress. Conservative surface/crash advice remains the fallback when no specific observation is available.
