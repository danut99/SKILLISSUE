import { readFileSync } from 'node:fs';
export const SITE = 'https://skilly.pages.dev';
export const pages = JSON.parse(readFileSync(new URL('../src/route-pages.json', import.meta.url), 'utf8'));
export const guides = ['cut-in-half', 'draw-perfect-circle', 'brake-game'];
export const sitemapUrls = [...pages.filter(page => page.index).map(page => SITE + page.path), ...guides.map(slug => `${SITE}/${slug}/`)];
export const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(url => `  <url><loc>${url}</loc></url>`).join('\n')}
</urlset>
`;
