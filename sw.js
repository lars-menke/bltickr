// BL TICK-R — Service Worker v2
// Handles Web Push messages and shows browser notifications

const CACHE_NAME = 'bl-ticker-v3';

// ── Install & activate ──
// skipWaiting + claim stellt sicher dass der neue SW sofort aktiv wird
self.addEventListener('install', e => {
  console.log('[SW] install');
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  console.log('[SW] activate — claiming clients');
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// ── Push event ──
self.addEventListener('push', e => {
  console.log('[SW] push received');
  if (!e.data) {
    console.warn('[SW] push event hat keine Daten');
    return;
  }

  let data;
  try { data = e.data.json(); }
  catch { data = { title: 'BL TICK-R', body: e.data.text(), type: 'info' }; }

  const { title, body, type, matchId } = data;

  const options = {
    body,
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: `blticker-${type || 'event'}-${matchId || Date.now()}`,
    renotify: true,
    requireInteraction: type === 'tor',
    vibrate: type === 'tor' ? [200, 100, 200] : [100],
    data: { matchId, url: '/' },
  };

  e.waitUntil(
    // Prüfen ob App gerade offen und sichtbar ist
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const appVisible = clientList.some(c =>
        c.url.includes(self.location.origin) && c.visibilityState === 'visible'
      );

      if (appVisible) {
        // App ist offen — nur In-App Toast via postMessage, keine System-Notification
        console.log('[SW] App sichtbar — sende nur In-App Message');
        clientList.forEach(c => {
          if (c.url.includes(self.location.origin)) {
            c.postMessage({ type: 'PUSH_EVENT', data });
          }
        });
        return;
      }

      // App im Hintergrund — System-Notification anzeigen
      return self.registration.showNotification(title, options)
        .then(() => console.log('[SW] Notification angezeigt:', title))
        .catch(err => console.error('[SW] showNotification Fehler:', err));
    })
  );
});

// ── Notification click ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const matchId = e.notification.data?.matchId;
  const url = matchId ? `/?match=${matchId}` : '/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({ type: 'OPEN_MATCH', matchId });
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
