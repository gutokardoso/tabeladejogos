const CACHE_NAME = 'copa-v17';
const ASSETS = ['./', './index.html', './style.css', './app.js', './data.js', './manifest.webmanifest', './icon.svg', './favicon-16x16.png', './favicon-32x32.png', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './assets/logo-taboo.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => null));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
