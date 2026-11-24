import { TIME_LIMITS } from '../games/timedGame';
import { PARTY_ROUNDS, PARTY_REVEAL_SECONDS } from '../lib/party';

const SECTIONS: { title: string; questions: [string, string][] }[] = [
  { title: 'Daily games', questions: [
    ['What is Skilly?', 'Three daily precision tests: draw the daily shape, cut a blob 50/50, and complete the daily driving objective. Everyone gets the same tests for that day. Play with your finger or mouse.'],
    ['How many tries do I get?', 'Five tries per game each day. Only your best score in each game counts; the three best scores add up to a total out of 300. A failed attempt scores zero and uses a try. Retry shows your remaining attempts.'],
    ['When do the games reset?', 'Every day at 00:00 UTC. The homepage countdown shows the time remaining. This resets daily attempts and daily rankings, while your history stays saved.'],
    ['How do I draw?', 'Draw one continuous stroke around the center dot, following the proportions and orientation of the outline. Close the loop. You can draw larger or smaller than the guide. Tiny shapes, incomplete loops, or getting too close to the dot can fail.'],
    ['How do I cut?', 'Drag a straight line through the blob, then release to slice. Aim for equal areas, not equal widths. The two percentages show the split; 50.0 / 50.0 is perfect.'],
    ['Is there a time limit?', `Daily Draw gives you ${TIME_LIMITS.draw} seconds and daily Cut gives you ${TIME_LIMITS.cut} seconds, starting on your first touch. Releasing, tapping, or missing does not restart the timer. Running out scores zero and uses an attempt. The clock keeps running if you switch tabs. Brake uses its driving countdown and movement instead.`],
    ['How do I play Brake?', 'Read the objective and check the road and speed. Tap to start. Once the car is moving, tap again or press Space to brake. The car slows automatically after you brake. Dry, wet, and icy roads have different stopping distances.'],
    ['What are the driving objectives?', 'Wall stop: stop close without hitting the wall. Parking: aim your front bumper at the marker and keep it inside the bay; a little short or past is allowed. Red light: stop close before the line without crossing it. Crashes and failed objectives score zero.'],
    ['How are scores calculated?', 'Draw rewards an accurate outline and a closed loop. Cut measures the exact areas: every 0.1 percentage point away from 50/50 costs 0.4 score points. Brake rewards safe stops: a 1 metre gap earns about 92 points and 2 metres earns about 85. Parking fully inside the bay earns at least 81 points, with more for centering. Crashing or crossing the stop line scores zero. Higher scores always rank better.'],
    ['What do the leaderboard tabs show?', 'Daily compares best scores for today. All-time adds your best score per game per day across your history. Levels ranks total stars, then levels cleared, then the sum of best level scores. Overall combines all three games. Replaying can improve a best score, but extra tries are not added together. Online play is required for shared rankings.'],
    ['What happens when I reopen a game?', "You see today's best result, with Retry available if you have attempts left. New drawings save their stroke; older drawings without a saved stroke show a medal and score. Cut and Brake rebuild the result scene from saved details."],
    ['Why an angel or a demon?', 'The angel celebrates scores of 80 or more. The demon roasts lower scores. Their reaction does not affect your score.'],
  ] },
  { title: 'Friends & score challenges', questions: [
    ['How do I add friends?', 'Open Menu ? Friends, create an invite link, and send it to someone. They open the link and accept to connect. You can compare daily and all-time scores on your Friends leaderboard.'],
    ['How long do friend invites last?', 'Seven days. You can replace an invite in Friends; the old link then stops working. Removing a friend removes the connection, not their scores or account.'],
    ['How does Beat my score work?', 'After a daily result, tap Beat my score and send the link. Your friend opens the same game and accepts the challenge. The target is your saved daily score when you created the link; their best daily score updates as they play.'],
    ['Where can the sender see responses?', 'Under Your challenges on Home or in Menu ? Friends. You can see who accepted, their score, and who is winning. The list refreshes every 15 seconds while open and when you return to it.'],
    ['Does accepting give extra tries?', 'No. Challenges use the normal daily attempts. If you already played that game today, your existing daily best can count. You do not need to add the sender as a friend first.'],
    ['When is the winner final?', 'Scores can improve while attempts remain. Equal scores are a tie. Once the recipient has no attempts left, or the daily challenge ends, their result is final against the shared target.'],
    ['Do score challenge links expire?', "They only apply to that day's test. Older links show an expired challenge rather than comparing different daily shapes. Older untracked links show a local comparison only and do not notify the sender."],
  ] },
  { title: 'Party Mode', questions: [
    ['How do I start a party?', 'Open Menu ? Party and create a room. Copy the invite link and send it to friends. Each player joins and taps I?m ready. The host starts once all players are ready. You need 2?8 players and an online connection.'],
    ['How many rounds can we play?', `Brake-only parties have 2-3 rounds. Brake with one other game allows up to 6 rounds, and all three games allow up to 9. Each driving objective appears once. Draw and Cut parties without Brake allow up to 12 rounds. The host can change games and rounds in the lobby, which resets Ready status. Rounds cycle through the selected games. Every round gives everyone ${PARTY_ROUNDS[0].seconds} seconds.`],
    ['When does the timer start?', 'After the shared countdown, everyone starts each round together. The timer starts automatically, not on first touch. There is one scored attempt per round. Keep the game visible and be ready for the next round.'],
    ['What happens after I finish?', `Your result shows immediately with Saving your score or Score saved, a finished-player count, and a countdown to the reveal. The reveal starts when everyone has submitted or time runs out. Opponents' scores stay hidden until then. There are ${PARTY_REVEAL_SECONDS} seconds to view results before the next round.`],
    ['How do we win?', 'Your round scores add up. Each round is worth up to 100 points, so a six-round match is out of 600. Highest total wins. Tied totals share a place. A missed or timed-out round scores zero. Party scores do not affect daily rankings or use daily tries.'],
    ['Can we restart after the final results?', 'Yes. The host taps Restart game. The same room, players, and invite link are kept; the host can adjust the round count and everyone readies up again.'],
    ['What if I reload, leave, or join late?', 'Reloading or leaving an unfinished active round forfeits that attempt. Missed rounds score zero, and the match continues on its shared schedule. Players must join before the match starts; late arrivals wait for the next lobby. Room links last 24 hours.'],
  ] },
  { title: 'Account, progress & sharing', questions: [
    ['Do I need an account?', 'No. You can play as a guest and receive a random nickname. Online guest sessions can save scores, but you need that same browser session to access them. Offline/demo progress stays on your device.'],
    ['How do I keep my progress?', 'Open My Skilly and tap Continue with Google. This saves your guest account so you can use it on other devices. No password needed.'],
    ['How do I sign in on another device?', 'Tap Continue with Google in My Skilly and pick the same Google account. Your nickname, scores, streak, cars, friends, and challenges follow your account. Guest attempts made on the new device are not merged when you switch to an existing account.'],
    ['What if I clear my browser data?', 'You may lose access to an anonymous guest session. Save your account with Google first. A Google-linked account can be restored by signing in again.'],
    ['How do streaks and cars work?', 'Play daily to grow your streak and unlock car skins. My Skilly shows your stats, streak, and garage, including the streak required for each car. Pick an unlocked car there.'],
    ['Can I change my nickname?', 'Yes, from the result card. Nicknames are unique; if yours is taken, choose another.'],
    ['Share result, Save clip, or Beat my score?', 'Share result creates an image card. Save clip saves a daily attempt as a vertical video when your browser supports recording. Beat my score creates a tracked challenge link that friends can accept.'],
    ['How do I post to TikTok or Instagram?', 'Use the share buttons on your phone to open its share sheet when supported. Otherwise the image or clip downloads so you can upload it in the app yourself. Recording and sharing support varies by browser.'],
    ['Where are sound and accessibility options?', 'Use the sound button in the top bar. Settings includes low-power and colorblind options. Reduced-motion preferences are respected for supported animations.'],
    ['Are the scores cheat-proof?', 'No. The server checks attempt limits and score ranges, but gameplay scores are calculated in the browser. Party rooms also enforce membership, submission windows, and one received result per round. Report suspicious activity using feedback.'],
  ] },
];

export function FaqPage() {
  return <section className="screen home legal faq-page">
    <h1>faq</h1>
    <p>Controls, rules, friends, and party chaos. Pick a question.</p>
    <nav className="faq-topics" aria-label="FAQ topics">{SECTIONS.map((section, index) => <a key={section.title} href={`#faq/topic-${index}`} onClick={() => requestAnimationFrame(() => document.getElementById(`faq-topic-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}>{section.title}</a>)}</nav>
    <div className="faq-groups">{SECTIONS.map((section, index) => <section className="faq-group" id={`faq-topic-${index}`} key={section.title} aria-labelledby={`faq-heading-${index}`}>
      <h2 id={`faq-heading-${index}`}>{section.title}</h2>
      {section.questions.map(([question, answer]) => <details className="faq-question" key={question}>
        <summary>{question}</summary><p>{answer}</p>
      </details>)}
    </section>)}</div>
    <p><a href="#">Back to today's games</a></p>
  </section>;
}
