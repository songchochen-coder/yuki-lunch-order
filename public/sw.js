// Bumping the cache name invalidates every previously-cached response on
// activate (see the activate handler below). Bump this any time a deploy ships
// user-visible changes that must show up immediately.
const CACHE_NAME = 'lunch-order-v2';

const PRECACHE_URLS = [
  '/',
  '/add',
  '/history',
  '/stats',
  '/settings',
  '/menus',
  '/weekly-plan',
  '/scan',
  '/scan/confirm',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;

  const isNavigation = event.request.mode === 'navigate';
  const accept = event.request.headers.get('Accept') || '';
  const isHTML = accept.includes('text/html');

  // Network-first for pages (HTML / navigations). This is what fixes the
  // "I deployed but my app still shows the old UI" problem: every navigation
  // tries the network first so fresh builds reach users immediately. Cache
  // is only used as the offline fallback.
  if (isNavigation || isHTML) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match('/'))
      )
    );
    return;
  }

  // Stale-while-revalidate for static assets (JS / CSS / images). Next.js
  // fingerprints filenames so stale chunks are never actually stale — each
  // deploy ships new filenames — so cache-first here is safe and fast.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (cached) return cached;
        return new Response('Offline', { status: 503 });
      });
      return cached || fetchPromise;
    })
  );
});
