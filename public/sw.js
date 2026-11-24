// SKILL ISSUE service worker: makes the app installable and fast to reopen.
// Pages are network-first (fresh deploys show up immediately); the cached page is only an offline fallback.
// Vite's hashed /assets/* files never change, so they are cache-first.
// Pixel art and icons are served from cache and refreshed in the background.
const CACHE = 'skill-issue-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only the game shell is the offline fallback, not the static info pages.
          if (response.ok && url.pathname === '/') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then((cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }),
        ),
      ),
    );
  }

  if (url.pathname.startsWith('/art/') || /^\/(icon-\d+|apple-touch-icon)\.png$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const fresh = fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
          if (cached) {
            event.waitUntil(fresh.catch(() => {}));
            return cached;
          }
          return fresh;
        }),
      ),
    );
  }
});

// Daily reminders only: content and destination are fixed by the app.
self.addEventListener('push', (event) => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (payload?.type !== 'daily-reminder') return;
  event.waitUntil(self.registration.showNotification("Today's shapes are ready", {
    body: 'Got 2 minutes? Cut, draw and brake. Your daily challenges are waiting.',
    icon: '/icon-192.png', badge: '/icon-192.png', tag: 'skilly-daily',
    renotify: false, data: { type: 'daily-reminder' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  if (event.notification.data?.type !== 'daily-reminder') return;
  event.notification.close();
  const destination = new URL('/?utm_source=daily_reminder', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(destination);
      return existing.focus();
    }
    return self.clients.openWindow(destination);
  }));
});
