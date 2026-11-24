import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { SITE, sitemapUrls, pages, guides } from './seo-config.mjs';

const read = path => readFileSync(path, 'utf8');
const sitemap = read('dist/sitemap.xml');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert.deepEqual(urls, sitemapUrls, 'Sitemap must contain exactly the public canonical URLs');
assert.equal(new Set(urls).size, urls.length, 'Duplicate sitemap URLs');
assert.equal(sitemap, read('public/sitemap.xml'), 'Source and build sitemaps differ');
assert.match(read('dist/robots.txt'), new RegExp(`Sitemap: ${SITE.replaceAll('.', '\\.')}\\/sitemap\\.xml`));
assert.doesNotMatch(read('dist/robots.txt'), /Disallow:\s*\/\s*$/m, 'Public crawling is blocked');
for (const url of urls) {
  const path = new URL(url).pathname;
  const file = `dist${path === '/' ? '' : path.replace(/\/$/, '')}/index.html`;
  assert.ok(existsSync(file), `Missing HTML for ${url}`);
  const html = read(file);
  assert.ok(html.includes(`<link rel="canonical" href="${url}"`), `Canonical mismatch: ${url}`);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /<h1[ >]/);
  assert.match(html, /<meta name="description" content="[^"]+"/);
  assert.doesNotMatch(html, /content="noindex/);
  assert.match(html, /<meta name="twitter:image"/);
  assert.doesNotMatch(html, /content="image\/jpeg"/);
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(match[1]);
}
for (const page of pages.filter(page => !page.index)) assert.match(read(`dist${page.path}/index.html`), /content="noindex, follow"/);
assert.match(read('dist/404.html'), /content="noindex, follow"/);
assert.match(read('dist/invite/index.html'), /content="noindex, follow"/);
for (const line of read('dist/_redirects').trim().split('\n')) {
  const [source, target, status] = line.split(/\s+/);
  if (source.includes('*')) assert.equal(target, '/invite/index.html', `Invite must use noindex shell: ${source}`);
  if (status === '200') assert.ok(existsSync(`dist${target}`), `Missing rewrite target: ${target}`);
}
assert.ok((read('dist/faq/index.html').match(/<summary>/g) ?? []).length >= 30, 'FAQ answers missing from initial HTML');
assert.ok(read('dist/how-to-play/index.html').includes('Your daily ritual'), 'How-to content missing');
assert.ok(read('dist/privacy/index.html').includes('on your device'), 'Privacy content missing');
const image = readFileSync('dist/og-skilly.png');
assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(image.readUInt32BE(16), 1200);
assert.equal(image.readUInt32BE(20), 630);
for (const slug of guides) assert.ok(read(`dist/${slug}/index.html`).includes('How to play'));
console.log(`SEO checks passed: ${urls.length} canonical pages, social metadata, structured JSON, crawlable content and noindex invite rewrites.`);
