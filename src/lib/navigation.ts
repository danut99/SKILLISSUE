const paths: Record<string, string> = {
  draw: '/play/draw', cut: '/play/cut', brake: '/play/brake',
  me: '/profile', league: '/leagues', friends: '/friends', party: '/party',
  levels: '/levels', balance: '/play/balance', count: '/play/count',
  faq: '/faq', privacy: '/privacy', creator: '/creator', challenges: '/challenges',
  games: '/games', how: '/how-to-play', leaderboard: '/leaderboards',
};

export function routeHref(route: string | null): string {
  if (!route) return '/';
  const [key, ...rest] = route.replace(/^#/, '').split('/');
  return `${paths[key] ?? '/'}${rest.length ? '/' + rest.join('/') : ''}`;
}

/** Preserve old challenge, friend and party parsers while URLs use real paths. */
export function routeToken(): string {
  return tokenFromUrl(location.pathname + location.search);
}

export function tokenFromUrl(input: string): string {
  if (input.startsWith('#')) return input;
  let url: URL;
  try { url = new URL(input, 'https://skilly.pages.dev'); } catch { return ''; }
  const path = url.pathname.replace(/\/$/, '') || '/';
  const found = Object.entries(paths).find(([, prefix]) => path === prefix || path.startsWith(prefix + '/'));
  return found ? `#${found[0]}${path.slice(found[1].length)}${path.endsWith('/beat') ? url.search : ''}` : '';
}

export function navigateTo(path: string, replace = false) {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.dispatchEvent(new Event('skilly:navigate'));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function installNavigation() {
  const migrate = () => {
    const token = location.hash.slice(1);
    if (Object.hasOwn(paths, token.split('/')[0])) {
      navigateTo(routeHref(token), true);
    }
  };
  // Auth fragments must remain intact for Supabase to consume.
  migrate();
  window.addEventListener('hashchange', migrate);
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('skilly:navigate')));
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href);
    if (url.origin !== location.origin || url.hash || !Object.values(paths).some(path => url.pathname === path || url.pathname.startsWith(path + '/')) && url.pathname !== '/') return;
    event.preventDefault();
    navigateTo(url.pathname + url.search);
  });
}
