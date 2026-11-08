// Service worker: maakt de app offline bruikbaar en regelt updates.
//
// BIJ ELKE RELEASE: VERSION ophogen (gelijk aan js/config.js).
// NIEUW BESTAND?    Toevoegen aan PRECACHE.

const VERSION = '1.2.0';

// De cache-naam bevat het pad van de app, zodat meerdere apps onder
// <gebruiker>.github.io elkaars cache niet opruimen.
const SCOPE = new URL(self.registration.scope).pathname;
const CACHE_PREFIX = `shell:${SCOPE}:`;
const CACHE = `${CACHE_PREFIX}${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/app.css',
  './js/main.js',
  './js/config.js',
  './js/app.js',
  './js/core/shell.js',
  './js/core/vault.js',
  './js/core/crypto.js',
  './js/core/biometric.js',
  './js/core/github.js',
  './js/core/sync.js',
  './js/core/records.js',
  './js/core/dom.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
  // Geen skipWaiting(): de gebruiker kiest zelf "Bijwerken" (zie shell.js).
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  // Laat de app controleren of de versienummers gelijk zijn.
  if (event.data?.type === 'GET_VERSION') event.source?.postMessage({ type: 'VERSION', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Alleen eigen bestanden uit de cache; GitHub-API en andere domeinen altijd via het netwerk.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match('./index.html', { cacheName: CACHE });
      return cached || fetch(request);
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { cacheName: CACHE, ignoreSearch: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && url.pathname.startsWith(SCOPE)) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  })());
});
