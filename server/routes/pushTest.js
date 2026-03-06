import express from 'express';

export function createPushTestRouter({ store, pushService }) {
  const router = express.Router();

  async function handlePushTest(req, res) {
    const count = store.count();

    if (count === 0) {
      return res.json({ ok: false, subscribers: 0, error: 'Keine Subscriber' });
    }

    const filterKey = req.query.key || req.body?.key;
    const keys = filterKey
      ? store.get(filterKey)
        ? [filterKey]
        : []
      : store.keys();

    if (filterKey && keys.length === 0) {
      return res.status(404).json({ ok: false, error: 'Subscriber nicht gefunden' });
    }

    const results = await pushService.sendTestToKeys(keys);

    const ok = results.filter(r => r.status === 'fulfilled').length;
    const errs = results
      .filter(r => r.status === 'rejected')
      .map(r => {
        const e = r.reason;
        return {
          status: e?.statusCode,
          message: e?.message,
          body: e?.body,
        };
      });

    console.log('[push-test] OK:', ok, 'Fehler:', JSON.stringify(errs));

    res.json({
      ok: ok > 0,
      subscribers: count,
      sent: ok,
      errors: errs,
    });
  }

  router.get('/push-test', handlePushTest);
  router.post('/push-test', express.json(), handlePushTest);

  return router;
}
