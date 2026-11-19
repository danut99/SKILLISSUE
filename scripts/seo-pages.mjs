// Generates the static, crawlable landing pages in public/ (one per game).
// Run: node scripts/seo-pages.mjs   (output is committed; Vite copies public/ as-is)
import { mkdirSync, writeFileSync } from 'node:fs';

const SITE = 'https://skilly.pages.dev';
const UPDATED = '2026-11-19';

const pages = [
  {
    slug: 'cut-in-half',
    hash: 'cut',
    color: '#ff5d8f',
    title: 'Cut in Half Game: Cut the Shape Exactly 50/50 | Skilly',
    description: 'Free cut in half game: slice a new shape with one straight line and try to split it exactly 50/50. Same shape for everyone each day, 5 tries, global leaderboard.',
    h1: 'Cut in Half Game: can you cut it exactly 50/50?',
    intro: 'One shape. One straight cut. Two halves that should be exactly the same size. Skilly\'s Cut game gives everyone on Earth the same shape every day, and you get 5 tries to split it as close to 50/50 as you can. It sounds easy. It isn\'t.',
    play: 'Cut today\'s shape',
    how: [
      'Open today\'s shape (a new one every day at 00:00 UTC, the same for every player).',
      'Drag one straight line across the shape and let go.',
      'The shape splits and shows both halves as percentages, for example 49.6% / 50.4%.',
      'You have 5 seconds per try and 5 tries per day. Your best cut counts.',
    ],
    scoring: 'Skilly measures the exact area of both pieces. 50.0 / 50.0 is a perfect 100. Every 0.1 percentage point away from 50/50 costs 0.4 points, so 49.0 / 51.0 scores 96 and 45 / 55 scores 80.',
    tips: [
      'Aim for equal <b>areas</b>, not equal widths: a long thin tail holds less than it looks.',
      'Find the "heavy" side of the shape first, then move your line toward it.',
      'Use your earlier tries to learn: if 46 / 54 was your first cut, shift the line a little toward the bigger half.',
      'Watch the halves react: the smaller piece cries, the bigger one gloats. Get it perfect for heart eyes.',
    ],
    faq: [
      ['Is the cut in half game free?', 'Yes. Skilly is free in any browser on phone or computer, with no download and no account needed.'],
      ['Does everyone get the same shape?', 'Yes. The shape changes every day at 00:00 UTC and is the same for every player, so you can compare scores with friends and on the global leaderboard.'],
      ['What is a good score?', 'Anything within 1 percentage point of 50/50 (49.0 / 51.0 or better) is excellent. 50.0 / 50.0 is perfect.'],
      ['Is it like Cutle or "cut the shape in half"?', 'Same idea: split a shape into two equal areas with one line. Skilly adds a daily shape for everyone, 5 tries, a global leaderboard, shareable video clips and two more daily games.'],
    ],
  },
  {
    slug: 'draw-perfect-circle',
    hash: 'draw',
    color: '#4de3ff',
    title: 'Draw a Perfect Circle (and Square, Triangle…) Game | Skilly',
    description: 'Can you draw a perfect circle in one stroke? Free daily drawing test: circle, square, triangle, diamond or hexagon, with an accuracy score. 5 tries a day.',
    h1: 'Draw a Perfect Circle, Square or Triangle in One Stroke',
    intro: 'Drawing a perfect circle by hand is famously hard, and Skilly makes it a daily test. Every day there\'s a new shape (circle, square, triangle, diamond or hexagon). Draw it in one continuous stroke and see how close to perfect you really are.',
    play: 'Draw today\'s shape',
    how: [
      'Look at today\'s shape outline around the center dot.',
      'Draw it in one continuous stroke with your finger or mouse, and close the loop.',
      'You can draw bigger or smaller than the guide: proportions and a clean, closed outline are what count.',
      'You have 8 seconds per try and 5 tries per day. Your best drawing counts.',
    ],
    scoring: 'Your score (0 to 100%) rewards an accurate outline and a closed loop. The line changes color live while you draw, from cyan (great) to yellow to red. Tiny shapes, unfinished loops or drawing too close to the dot don\'t count.',
    tips: [
      'Draw at a steady medium speed: too fast wobbles, too slow shakes.',
      'Move your whole arm or wrist instead of just your fingers.',
      'For a circle, keep the same distance from the center dot all the way around.',
      'For corners (square, triangle, diamond), keep the sides straight and the corners sharp.',
    ],
    faq: [
      ['Can you draw a perfect circle?', 'A truly perfect circle by hand is almost impossible, but scores above 95% are possible with practice. Try it with today\'s shape on Skilly.'],
      ['Which shapes are there?', 'The daily shape rotates between circle, square, triangle, diamond and hexagon. The level mode adds more, like stars and octagons.'],
      ['Is it like the "draw a perfect circle" game?', 'Yes, the same idea, extended to a new shape every day, with 5 tries, a global leaderboard and two more daily games.'],
      ['Is it free?', 'Yes, free in any browser on phone or computer. No download and no account needed.'],
    ],
  },
  {
    slug: 'brake-game',
    hash: 'brake',
    color: '#ffd23f',
    title: 'Brake Game: Stop the Car at the Perfect Spot | Skilly',
    description: 'Free reaction and timing game: brake at the perfect moment to stop your car right before the wall, on the red line or in the parking bay. New road every day, 5 tries.',
    h1: 'Brake Game: stop the car at the perfect spot',
    intro: 'The car is coming fast. One tap to brake. Stop too early and you\'re miles away; too late and you crash. Skilly\'s BRAKE! is a daily timing game: a new road, speed and objective every day, the same for every player.',
    play: 'Play today\'s brake test',
    how: [
      'Read today\'s objective: stop close to the wall, park in the bay, or stop before the red line.',
      'Check the road (dry, wet or icy) and the speed: they change your stopping distance.',
      'Tap to start, then tap again (or press Space) to brake.',
      'You have 5 tries per day. Your best stop counts.',
    ],
    scoring: 'Closer is better, but crossing the limit fails. Braking uses the exact moment you tap, not the screen\'s frame rate, so precision really is up to you.',
    tips: [
      'On wet and icy roads the car slides much further: brake earlier.',
      'Faster speed means a longer stopping distance; adjust after each try.',
      'Use your first try to learn the distance, then fine-tune.',
    ],
    faq: [
      ['Is the brake game free?', 'Yes, free in any browser on phone or computer, with no download.'],
      ['Does everyone get the same road?', 'Yes. Road, speed and objective change every day at 00:00 UTC and are the same for everyone.'],
      ['What happens if I crash?', 'A crash scores zero and uses a try. You can try again while you have tries left.'],
    ],
  },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const strip = (s) => s.replace(/<[^>]+>/g, '');

for (const p of pages) {
  const url = `${SITE}/${p.slug}/`;
  const others = pages.filter((o) => o !== p);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'VideoGame', name: p.h1, url, image: `${SITE}/og-image-5-tries.jpg`, description: p.description, genre: ['Casual', 'Skill', 'Daily challenge'], gamePlatform: ['Web browser', 'iOS', 'Android'], applicationCategory: 'Game', operatingSystem: 'Any', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, isPartOf: { '@type': 'WebSite', name: 'Skilly', url: `${SITE}/` } },
      { '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Skilly', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: strip(p.h1), item: url }] },
    ],
  };
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}" />
<link rel="canonical" href="${url}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<meta name="theme-color" content="#050a14" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Skilly" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(p.title)}" />
<meta property="og:description" content="${esc(p.description)}" />
<meta property="og:image" content="${SITE}/og-image-5-tries.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="stylesheet" href="/seo.css" />
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body style="--accent:${p.color}">
<header class="top"><a class="logo" href="/">SKILL<span>Y</span></a><a class="btn small" href="/#${p.hash}">Play</a></header>
<main>
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Skilly</a> › ${esc(strip(p.h1))}</nav>
<h1>${esc(p.h1)}</h1>
<p class="lead">${esc(p.intro)}</p>
<p><a class="btn" href="/#${p.hash}">${esc(p.play)} ▶</a></p>
<p class="muted">Free · no download · works on phone and computer · new challenge every day</p>
<h2>How to play</h2>
<ol>${p.how.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
<h2>How scoring works</h2>
<p>${esc(p.scoring)}</p>
<h2>Tips to score higher</h2>
<ul>${p.tips.map((s) => `<li>${s}</li>`).join('')}</ul>
<h2>FAQ</h2>
${p.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
<p><a class="btn" href="/#${p.hash}">${esc(p.play)} ▶</a></p>
<h2>More daily skill games on Skilly</h2>
<ul class="games">${others.map((o) => `<li><a href="/${o.slug}/">${esc(strip(o.h1))}</a></li>`).join('')}<li><a href="/">All Skilly daily games</a></li></ul>
</main>
<footer><a href="/">Skilly</a> · 3 stupid daily skill tests. Fail one? Skill issue. 🫠 · Updated ${UPDATED}</footer>
</body>
</html>
`;
  mkdirSync(`public/${p.slug}`, { recursive: true });
  writeFileSync(`public/${p.slug}/index.html`, html);
}

const urls = [['', '1.0'], ...pages.map((p) => [`${p.slug}/`, '0.8'])];
writeFileSync('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, pr]) => `  <url>\n    <loc>${SITE}/${u}</loc>\n    <lastmod>${UPDATED}</lastmod>\n    <changefreq>${u ? 'weekly' : 'daily'}</changefreq>\n    <priority>${pr}</priority>\n  </url>`).join('\n')}
</urlset>
`);
console.log('wrote', pages.map((p) => p.slug).join(', '), '+ sitemap.xml');
