// Studio 33 — Service Worker (offline cache + Web Push)
const CACHE = 'studio33-v3';
const ASSETS = ['/', '/index.html', '/logo S33.png'];
const APP_NAME = 'Studio 33';
const APP_ICON = '/logo S33.png';

// ── Lifecycle ───────────────────────────────────────────────
self.addEventListener('install', e => {
  // Skip pre-caching — assets use absolute paths that break on GitHub Pages subfolders
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Drop any old caches
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ── Stale-while-revalidate ───────────────────────────────────
// L'app (1,7 Mo) s'affiche instantanément depuis le cache ; la nouvelle
// version est téléchargée en arrière-plan et servie à l'ouverture suivante.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Skip Supabase API calls — never cache
  const url = e.request.url;
  if (url.includes('supabase.co') || url.includes('/auth/v1/') || url.includes('/rest/v1/') || url.includes('/storage/v1/')) {
    return; // let the network handle it normally
  }
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    const network = fetch(e.request)
      .then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    const res = await network;
    return res || caches.match('/index.html');
  })());
});

// ── Push handler ────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = { title: APP_NAME, body: 'Nouvelle notification', url: '/' };
  if (event.data) {
    try { payload = Object.assign({}, payload, event.data.json()); }
    catch (e) { payload.body = event.data.text(); }
  }
  const options = {
    body: payload.body,
    icon: payload.icon || APP_ICON,
    badge: APP_ICON,
    tag: payload.tag || 'studio33-notif',
    renotify: true,
    requireInteraction: false,
    data: { url: payload.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(payload.title || APP_NAME, options));
});

// ── Click handler — focus existing tab or open new one ──────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let targetUrl = (event.notification.data && event.notification.data.url) || self.registration.scope;
  if (!targetUrl || targetUrl === '/') targetUrl = self.registration.scope;
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if ('focus' in client) {
        await client.focus();
        if (client.url !== targetUrl && 'navigate' in client) {
          try { await client.navigate(targetUrl); } catch (e) {}
        }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});
