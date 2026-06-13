const CACHE = 'mundial2026-v5';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Bebas+Neue&display=swap'
];

// ── INSTALL: precachear assets — NO skipWaiting, esperar confirmación del usuario ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
    // Sin skipWaiting() → el SW nuevo queda en estado "waiting"
    // hasta que el usuario pulse "Actualizar ahora" en el banner
  );
});

// ── ACTIVATE: borrar caches viejos y tomar control de todos los clientes ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()) // tomar control inmediato de tabs abiertas
      .then(async () => {
        // Notificar a todos los clientes que hay nueva versión disponible
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }));
      })
  );
});

// ── FETCH: cache-first para assets, network-first para HTML ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Para el HTML principal: network-first para siempre tener la versión más nueva
  if (url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Para el resto: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

// ── NOTIFICATIONCLICK: abrir/enfocar la app ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});

// ── MESSAGE: programar notificaciones o activarse inmediatamente ──
self.addEventListener('message', e => {
  if (!e.data) return;

  // El cliente pide que el SW nuevo se active ya (para el banner de actualización)
  if (e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (e.data.type === 'SCHEDULE_NOTIF') {
    const { id, fireAt, title, body } = e.data;
    const delay = fireAt - Date.now();
    if (delay <= 0 || delay > 2147000000) return;

    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: id,           // evita duplicados si el SW recibe el mensaje varias veces
        renotify: false,
        vibrate: [120, 60, 120],
        requireInteraction: false
      });
    }, delay);
  }
});
