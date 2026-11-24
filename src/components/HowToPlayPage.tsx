export function HowToPlayPage() {
  return <section className="screen guide-page">
    <header className="page-intro"><span className="eyebrow">SMALL GAMES. BIG EGO CHECK.</span><h1>Looks easy.<br /><span>That’s the trap.</span></h1><p>Three daily skill games. Five tries as a guest, eight with a free account. Only your best score counts.</p></header>
    <div className="how-game-grid">
      <a href="/play/cut" className="pastel-purple"><b>CUT IT.</b><p>Drag one straight line across the shape. Aim for two equal areas: exactly 50/50.</p><span>Try Cut</span></a>
      <a href="/play/draw" className="pastel-pink"><b>DRAW IT.</b><p>Draw today’s shape in one continuous stroke. Close the loop and keep your hand steady.</p><span>Try Draw</span></a>
      <a href="/play/brake" className="pastel-yellow"><b>BRAKE!</b><p>Read today’s road and objective. Tap to start, then tap again or press Space to brake.</p><span>Try Brake</span></a>
    </div>
    <section className="guide-rules"><h2>Your daily ritual, explained.</h2><dl><div><dt>Same test for everyone.</dt><dd>Shapes, roads and challenges reset daily at 00:00 UTC. Compare like for like.</dd></div><div><dt>More shots at glory.</dt><dd>Each daily Cut, Draw and Brake game gives guests five attempts and registered players eight. Your best result in each game adds to a daily total out of 300.</dd></div><div><dt>Play now. Save when you’re ready.</dt><dd>Guest progress stays in this browser. A free account keeps your scores, streak and unlocks across devices.</dd></div><div><dt>Make it a friendly rivalry.</dt><dd>After a result, challenge a friend to beat your score. Come back tomorrow for a fresh test.</dd></div></dl><a className="btn btn-primary" href="/">Play today’s challenges</a><a className="guide-faq" href="/faq">More questions? Read the FAQ</a></section>
  </section>;
}

