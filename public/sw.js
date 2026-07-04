const CACHE = 'cardfit-v2';
const CORE = [
  '.',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!shouldCache(url, request)) return;

  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) return response;
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('.')))
  );
});

function shouldCache(url, request) {
  if (request.mode === 'navigate') return true;
  return CORE.some((path) => {
    if (path === '.') return url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
    return url.pathname.endsWith(`/${path.replace(/^\//, '')}`);
  })
    || url.pathname.includes('/assets/')
    || url.pathname.includes('/image/clean/')
    || url.pathname.includes('/icons/');
}
