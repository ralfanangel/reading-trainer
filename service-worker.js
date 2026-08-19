// Simple service worker for offline caching of demo assets
const CACHE_NAME = 'reading-trainer-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/animals.json',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => {
      if (k !== CACHE_NAME) return caches.delete(k);
    })))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        // optionally cache new requests
        if (req.method === 'GET' && resp.status === 200 && resp.type === 'basic') {
          const clon = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clon));
        }
        return resp;
      }).catch(() => caches.match('/'));
    })
  );
});
