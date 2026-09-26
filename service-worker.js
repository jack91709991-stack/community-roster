const CACHE_NAME = 'community-roster-v9';
const ASSETS = [
  './',
  './index.html',
  './manual.html',
  './css/style.css',
  './js/app.js',
  './js/data.js',
  './js/api.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './images/manual_auth.jpg',
  './images/manual_auth_screen.jpg',
  './images/manual_sync.jpg',
  './images/manual_gas_setup.jpg',
  './images/manual_features.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Old cache cleared:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First: ネットワーク接続時は常に最新を取得し、オフライン時のみキャッシュを使用
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('script.google.com')) return;

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        }
        return networkResponse;
      })
      .catch(() => {
        // オフライン時はキャッシュから返す
        return caches.match(e.request);
      })
  );
});

