const VERSION = 'poker-red-v5';
const ASSETS = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/logic.js', 'js/store.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'fonts/PeydaWebFaNum-Regular.woff2', 'fonts/PeydaWebFaNum-SemiBold.woff2'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('poker-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Keep each release's code together; the next worker installs the next release.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { cacheName: VERSION, ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
