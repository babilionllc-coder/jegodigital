// Service Worker for JegoDigital
const CACHE_NAME = 'jegodigital-v1';
const urlsToCache = [
  '/',
  '/js/index-CG7-YbQk.js',
  '/assets/index-DcHfjoXt.css',
  '/manifest.json'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});
