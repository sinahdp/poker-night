const VERSION = 'poker-red-v6';
const ASSETS = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/logic.js', 'js/store.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'fonts/PeydaWebFaNum-Regular.woff2', 'fonts/PeydaWebFaNum-SemiBold.woff2'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS.map(path => new Request(path, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const oldCaches = (await caches.keys()).filter(k => k.startsWith('poker-') && k !== VERSION);
    await Promise.all(oldCaches.map(k => caches.delete(k)));
    await self.clients.claim();
    // Old pages have no controllerchange listener. Reload once on upgrade.
    // Game records remain in localStorage; pagehide saves pending inputs.
    if (oldCaches.length) {
      const clients = await self.clients.matchAll({ type: 'window' });
      // Do not await navigation here: the navigation's fetch waits for this
      // activation to finish, so awaiting it would deadlock the page.
      for (const client of clients.filter(client => client.url.startsWith(self.registration.scope))) {
        client.navigate(client.url).catch(() => {});
      }
    }
  })());
});
// Keep each release's code together, including while offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { cacheName: VERSION, ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
