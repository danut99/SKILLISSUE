// Generate crawlable route entries from the same metadata used by the client.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SITE as base, pages, sitemap } from './seo-config.mjs';

const shell = readFileSync('dist/index.html', 'utf8');
const esc = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const links = pages.filter(p => p.index).map(p => `<a href="${p.path}">${esc(p.heading)}</a>`).join(' &middot; ');
const guideLinks = `<a href="/cut-in-half/">Cut in half guide</a> &middot; <a href="/draw-perfect-circle/">Drawing guide</a> &middot; <a href="/brake-game/">Brake guide</a>`;
const prerendered = new Map();
// Render informational pages from their actual React components: one source of content.
const server = await createServer({ configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  for (const [path, modulePath, name] of [
    ['/faq', '/src/components/FaqPage.tsx', 'FaqPage'],
    ['/how-to-play', '/src/components/HowToPlayPage.tsx', 'HowToPlayPage'],
    ['/privacy', '/src/components/PrivacyPage.tsx', 'PrivacyPage'],
  ]) {
    const module = await server.ssrLoadModule(modulePath);
    prerendered.set(path, renderToStaticMarkup(createElement(module[name])));
  }
} finally { await server.close(); }

function renderPage(page, content) {
  const robots = page.index ? 'index, follow, max-image-preview:large' : 'noindex, follow';
  let html = shell.replace(/<title>.*?<\/title>/s, `<title>${esc(page.title)}</title>`);
  const attributes = [
    ['meta name="description" content', page.description],
    ['link rel="canonical" href', base + page.path],
    ['meta property="og:title" content', page.title],
    ['meta property="og:description" content', page.description],
    ['meta property="og:url" content', base + page.path],
    ['meta name="robots" content', robots],
    ['meta name="twitter:title" content', page.title],
    ['meta name="twitter:description" content', page.description],
  ];
  for (const [attribute, value] of attributes) {
    html = html.replace(new RegExp(`(<${attribute}=")[^"]*`), (_match, prefix) => prefix + esc(value));
  }
  const body = content ?? `<h1>${esc(page.heading)}</h1><p>${esc(page.description)}</p>${page.index ? '<p>Play free in your browser on phone or computer. The daily Cut, Draw and Brake challenges reset at 00:00 UTC. Five guest tries or eight with a free account per daily game; your best results add up to a score out of 300.</p>' : ''}`;
  const initial = `<div id="root"><main style="max-width:1000px;margin:60px auto;padding:24px;font:16px/1.6 Arial,sans-serif;color:#f7f6ed"><a href="/">SKILLY.</a>${body}<nav aria-label="Explore Skilly">${links} &middot; ${guideLinks}</nav><noscript><p>Enable JavaScript to play. The rules, FAQ and guides are available without JavaScript.</p></noscript></main></div>`;
  html = html.replace(/<div id="root">[\s\S]*?<\/div>/, initial);
  if (page.path !== '/') html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  if (page.index && page.path !== '/') {
    const data = { '@context': 'https://schema.org', '@type': 'WebPage', name: page.title, description: page.description, url: base + page.path, isPartOf: { '@type': 'WebSite', name: 'Skilly', url: base + '/' } };
    html = html.replace('</head>', `<script type="application/ld+json">${json(data)}</script></head>`);
  }
  return html;
}
for (const page of pages) {
  const dir = page.path === '/' ? 'dist' : `dist${page.path}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/index.html`, renderPage(page, prerendered.get(page.path)));
}
// Invites and account-only tools get noindex in the original response, before JS.
const invite = { path: '/invite', title: 'Challenge a Friend | Skilly', description: 'Open a shared score challenge, friend invite or party room on Skilly.', heading: 'Your next challenge awaits.', index: false };
mkdirSync('dist/invite', { recursive: true });
writeFileSync('dist/invite/index.html', renderPage(invite));
const exactRoutes = pages.filter(page => page.path !== '/').map(page => `${page.path} ${page.path}/index.html 200`);
const inviteRoutes = ['/levels/cut/*', '/levels/draw/*', '/levels/brake/*', '/play/count/*', '/play/cut/*', '/play/draw/*', '/play/brake/*', '/play/balance/*', '/party/*', '/friends/*', '/creator', '/challenges'];
writeFileSync('dist/_redirects', [...exactRoutes, ...inviteRoutes.map(path => `${path} /invite/index.html 200`), '/levels /levels/draw 301'].join('\n') + '\n');
// A real 404 prevents unknown paths from becoming indexable copies of Home.
writeFileSync('dist/404.html', '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found | Skilly</title><meta name="robots" content="noindex, follow"></head><body><main><h1>Page not found</h1><p>This page does not exist. <a href="/">Play today&apos;s games</a> or <a href="/games">explore Skilly</a>.</p></main></body></html>');
writeFileSync('dist/sitemap.xml', sitemap);
console.log(`Generated ${pages.length} route entry pages, noindex invite entry and sitemap.`);
