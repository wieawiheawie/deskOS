/* DeskOS offline app shell. The desktop itself makes no network requests. */
const CACHE_PREFIX = 'deskos-shell-v2';
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_PREFIX);
    const scope = self.registration.scope;
    const page = await fetch(new URL('./', scope));
    if (!page.ok) throw new Error('Could not cache DeskOS app shell');
    const html = await page.clone().text();
    await cache.put(new URL('./', scope), page);
    await cache.put(new URL('./index.html', scope), new Response(html, { headers: { 'Content-Type': 'text/html' } }));
    const assets = new Set(['./manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png']);
    for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) assets.add(match[1]);
    assets.add('./network-apps.js');
    for (const path of assets) {
      try { const response = await fetch(new URL(path, scope)); if (response.ok) await cache.put(new URL(path, scope), response); } catch { /* one optional asset must not block installation */ }
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('deskos-shell-') && key !== CACHE_PREFIX).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_PREFIX);
    if (request.mode === 'navigate') {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(new URL('./index.html', self.registration.scope), response.clone());
          return response;
        }
      } catch { /* use the cached shell when offline */ }
      return (await cache.match(new URL('./index.html', self.registration.scope))) || (await cache.match(new URL('./', self.registration.scope))) || Response.error();
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    } catch { return Response.error(); }
  })());
});
