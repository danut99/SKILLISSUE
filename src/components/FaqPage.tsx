const FAQ: [string, string][] = [
  ['what is this?', 'Three stupid precision tests every day: draw a perfect circle, cut a blob 50/50, brake before a wall. Same challenges for everyone on Earth.'],
  ['why only 3 tries?', "Because unlimited tries is just practice. Three tries hurt. That's the point. Out of tries? Come back tomorrow."],
  ['where is my progress saved?', 'As a guest: only on this device and browser. Clear the browser or switch phones and it is gone. Sign in with Google or email (free, no password, in "My Skill Issue") and your name, streak, scores and cars follow you to any device.'],
  ['when do new challenges drop?', 'Every day at 00:00 UTC. The countdown is on the home screen.'],
  ['do I need an account?', 'No. Just play. You get a random silly name and every try is saved to the Top 10 automatically. Change the name anytime. If you want your streak on other devices, save your progress with Google or email (optional, no password).'],
  ['how is the circle scored?', 'How evenly your stroke stays at the same distance from the dot, minus a penalty for the gap between start and end. 100% is not possible. Sorry.'],
  ['how is the cut scored?', 'We compute the exact area of both halves. 50.0 / 50.0 is perfect. Every 0.1% off costs 0.4 points.'],
  ['how is BRAKE! scored?', 'Distance between your bumper and the wall. 0 cm = 100. 10 cm ≈ 95. Touch the wall = 💥 = 0.'],
  ['what is "save clip"?', 'Each try is recorded as a short vertical video with sound, ready for TikTok/Reels. It stays on your device until you share it.'],
  ['someone has 100.0. cheating?', 'Maybe. Scores are checked on the server (limits, tries per day), but a determined cheater can still fake one. Report weird names via feedback.'],
  ['my nickname is taken', 'Nicknames are unique. First come, first served. Be creative.'],
];

export function FaqPage() {
  return (
    <section className="screen home legal">
      <h1>faq</h1>
      {FAQ.map(([q, a]) => (
        <div key={q}>
          <h2>{q}</h2>
          <p>{a}</p>
        </div>
      ))}
    </section>
  );
}
