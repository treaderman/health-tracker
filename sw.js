/* Service worker.
 *
 * Caches the app itself so it opens with no signal. It deliberately never
 * caches anything from the sheet — your data lives in IndexedDB, and a stale
 * cached reply would be worse than no reply.
 */

const CACHE = 'health-tracker-v2';

const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/db.js',
  'js/api.js',
  'js/state.js',
  'js/sync.js',
  'js/ui.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch the sheet's API

  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) {
        // Refresh in the background so the next launch is current.
        fetch(req).then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('index.html'));
    })
  );
});
