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
    // dedupeKey als Tag → tor-update ersetzt original Tor-Notification,
    // jede Karte bekommt einen eigenen Tag statt alle im selben Match zu stapeln
    tag: data.dedupeKey
      ? `blticker-${data.dedupeKey}`
      : `blticker-${type || 'event'}-${matchId || Date.now()}`,
    renotify: true,
    requireInteraction: type === 'tor' || type === 'tor-update',
    vibrate: (type === 'tor' || type === 'tor-update') ? [200, 100, 200] : [100],
    data: { matchId, url: '/' },
  };

  // Immer System-Notification anzeigen — stellt Zustellung auch bei
  // gesperrtem Bildschirm / Standby sicher.
  // visibilityState-Check ist auf iOS unzuverlässig (kann 'visible' melden
  // obwohl Bildschirm aus ist) und wurde daher entfernt.
  e.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => {
        console.log('[SW] Notification angezeigt:', title);
        return clients.matchAll({ type: 'window', includeUncontrolled: true });
      })
      .then(clientList => {
        // Falls App gerade aktiv sichtbar: postMessage senden.
        // Die App schließt dann die System-Notification und zeigt stattdessen
        // ihren In-App-Toast — verhindert Doppel-Anzeige.
        clientList.forEach(c => {
          if (c.url.includes(self.location.origin) && c.visibilityState === 'visible') {
            console.log('[SW] App sichtbar — sende zusätzlich In-App Message');
            c.postMessage({ type: 'PUSH_EVENT', data });
          }
        });
      })
      .catch(err => console.error('[SW] push handler Fehler:', err))
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
