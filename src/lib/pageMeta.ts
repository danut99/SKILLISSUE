import pages from '../route-pages.json';

export function updatePageMeta() {
  const path = location.pathname.replace(/\/$/, '') || '/';
  const page = pages.find(p => p.path === path);
  const base = 'https://skilly.pages.dev';
  document.title = page?.title ?? 'Challenge a Friend | Skilly';
  const set = (selector: string, attr: string, value: string) => {
    let element = document.head.querySelector(selector);
    if (!element) {
      element = document.createElement('meta');
      const match = /\[(name|property)="([^"]+)"\]/.exec(selector);
      if (match) element.setAttribute(match[1], match[2]);
      document.head.append(element);
    }
    element.setAttribute(attr, value);
  };
  set('meta[name="description"]', 'content', page?.description ?? 'A friend thinks you cannot beat their score. Play the challenge on Skilly.');
  set('meta[name="robots"]', 'content', page?.index ? 'index, follow, max-image-preview:large' : 'noindex, follow');
  set('meta[property="og:title"]', 'content', document.title);
  set('meta[property="og:description"]', 'content', page?.description ?? 'Think you have got skill? Prove it.');
  set('meta[property="og:url"]', 'content', base + path);
  set('meta[name="twitter:title"]', 'content', document.title);
  set('meta[name="twitter:description"]', 'content', page?.description ?? 'Think you have got skill? Prove it.');
  // Remove server-rendered structured data when navigating to a different page.
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent ?? '{}');
      const url = data.url ?? data['@graph']?.find((item: { url?: string }) => item.url)?.url;
      if (url && url !== base + path) script.remove();
    } catch { script.remove(); }
  }
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', base + path);
}
