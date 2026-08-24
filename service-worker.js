const CACHE_NAME = 'luma-reads-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './animals.json',
  './manifest.json',
  './apple-touch-icon.png',
  './icons/icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(()=>{})
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
  if (req.method !== 'GET') return;
  event.respondWith(
    fetch(req).then((resp) => {
      if (resp.status === 200 && (resp.type === 'basic' || resp.type === 'cors')) {
        const clon = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clon));
      }
      return resp;
    }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
