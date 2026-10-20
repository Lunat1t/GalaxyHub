/* Cache public immutable resources only. Account data and page HTML stay online. */
const CACHE = 'galaxy-static-v1.1.2';
const OFFLINE = '/offline.html';
const STATIC = [OFFLINE, '/app-icons/icon-192.png', '/app-icons/icon-512.png'];
const MAX_ENTRIES = 160;
const SPRITES = ['/sprites/lavender-doll-v1.png', '/sprites/lavender-doll-v1.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('galaxy-static-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE)) || new Response('Нет соединения. Попробуйте снова.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
    return;
  }
  const immutable = url.pathname.startsWith('/_next/static/') && !url.search;
  if (!immutable && !STATIC.includes(url.pathname) && !SPRITES.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(request);
    if (saved) return saved;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic' && !response.headers.has('set-cookie')) {
      try {
      await cache.put(request, response.clone());
      const keys = await cache.keys();
      const removable = keys.filter(key => !STATIC.includes(new URL(key.url).pathname));
      while (removable.length > MAX_ENTRIES) await cache.delete(removable.shift());
      } catch { /* Storage can be full; the online response remains usable. */ }
    }
    return response;
  })());
});
