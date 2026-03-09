import webpush from 'web-push';

export function createPushService({ vapidSubject, vapidPublicKey, vapidPrivateKey, store }) {
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    console.log('[vapid] OK');
  } catch (err) {
    console.error('[vapid] Fehler:', err.message);
  }

  async function sendNotification(subscription, payload, options = {}) {
    return webpush.sendNotification(subscription, JSON.stringify(payload), options);
  }

  async function sendToFiltered(payload, teams = []) {
    const keys = store.keys();

    if (keys.length === 0) {
      console.log('[push] Keine Subscriber');
      return { sent: 0, removed: 0 };
    }

    let sent = 0;
    let removed = 0;

    await Promise.allSettled(
      keys.map(async key => {
        const entry = store.get(key);
        if (!entry) return;

        const { subscription, favorites } = entry;

        if (teams.length > 0 && favorites?.length > 0) {
          const match = teams.some(t => favorites.includes(t));
          if (!match) return;
        }

        try {
          const ttl =
            payload.type === 'abpfiff' ? 900 :
            payload.type === 'anstoß'  ? 600 :
            payload.type === 'karte'   ? 180 :
            300;

          await sendNotification(subscription, payload, {
            TTL: ttl,
            urgency: 'high',
          });

          sent += 1;
        } catch (err) {
          console.error('[push] Fehler bei', key, '— Status:', err.statusCode, err.message);

          if (
            err.statusCode === 410 ||
            err.statusCode === 404 ||
            (err.statusCode === 400 && err.body?.includes('VapidPkHashMismatch'))
          ) {
            if (await store.remove(key)) {
              removed += 1;
              console.log('[push] Subscription entfernt:', key);
            }
          }
        }
      })
    );

    return { sent, removed };
  }

  async function sendToAll(payload) {
    return sendToFiltered(payload, []);
  }

  async function sendTestToKeys(keys) {
    const results = await Promise.allSettled(
      keys.map(async key => {
        const entry = store.get(key);
        if (!entry) {
          throw new Error(`Subscription ${key} nicht gefunden`);
        }

        try {
          await sendNotification(
            entry.subscription,
            {
              type: 'tor',
              title: 'Push-Test vs BL TICK-R',
              body: "⚽ Tor! 2:1 (90+2')\nMüller · Push-Pipeline funktioniert ✓",
              matchId: 'test',
            },
            { TTL: 300, urgency: 'high' }
          );
          return key;
        } catch (err) {
          if (
            err.statusCode === 410 ||
            err.statusCode === 404 ||
            (err.statusCode === 400 && err.body?.includes('VapidPkHashMismatch'))
          ) {
            await store.remove(key);
            console.log('[push-test] Subscription entfernt:', key);
          }
          throw err;
        }
      })
    );

    return results;
  }

  return {
    sendToFiltered,
    sendToAll,
    sendTestToKeys,
  };
}
