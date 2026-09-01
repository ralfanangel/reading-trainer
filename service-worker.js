/* Luma Reads — offline-first for iPad PWA (no server after install) */
const CACHE_NAME = 'luma-reads-offline-v2'

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './sw-boot.js',
  './manifest.json',
  './apple-touch-icon.png',
  './avatar.svg',
  './animals.json',
  './fonts/fonts.css',
  './fonts/fredoka-600.woff2',
  './fonts/fredoka-700.woff2',
  './fonts/nunito-700.woff2',
  './fonts/nunito-800.woff2',
  './icons/icon-152.png',
  './icons/icon-167.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/splash-1536x2048.png',
  './icons/splash-2048x1536.png',
  './icons/splash-2048x2732.png',
  './icons/splash-2732x2048.png'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('precache partial', err))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((resp) => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy))
        }
        return resp
      }).catch(() => caches.match('./index.html'))
    })
  )
})
