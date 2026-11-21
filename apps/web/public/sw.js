// Struo field app service worker: the app opens without network.
// - Built assets (/assets/*, hashed names): cache first.
// - Field pages (/field…): network first, cached copy when offline.
// - Everything else (API, office pages) goes to the network untouched: data is never served stale
//   by the worker; the field app keeps its own data in IndexedDB.
const VERSION = 'struo-field-v2';
const SHELL = ['/field', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    if (url.pathname !== '/field') {
      event.respondWith(
        caches.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((response) => {
              if (response.ok) {
                const copy = response.clone();
                caches.open(VERSION).then((cache) => cache.put(request, copy));
              }
              return response;
            }),
        ),
      );
      return;
    }
  }

  if (request.mode === 'navigate' && url.pathname.startsWith('/field')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put('/field', copy));
          }
          return response;
        })
        .catch(() => caches.match('/field').then((cached) => cached || Response.error())),
    );
  }
});

// Phone notifications (spec 051): shown as they come, opening the page they point to.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Struo', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Struo', {
    body: data.body || '', tag: data.tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) if (client.url === url && 'focus' in client) return client.focus();
      return self.clients.openWindow(url);
    }),
  );
});
