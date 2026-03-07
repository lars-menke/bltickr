import express from 'express';

export function createSubscribeRouter(store) {
  const router = express.Router();

  router.post('/subscribe', async (req, res) => {
    try {
      const sub = req.body;

      if (!sub?.endpoint) {
        return res.status(400).json({ error: 'Invalid subscription payload' });
      }

      const key = await store.add(sub);
      const favCount = store.get(key)?.favorites?.length;

      console.log(
        '[api] Neue Subscription:',
        key,
        '· Favoriten:',
        favCount > 0 ? favCount : 'alle'
      );

      res.status(201).json({ ok: true, key });
    } catch (err) {
      console.error('[api] /subscribe Fehler:', err.message);
      res.status(500).json({ error: 'Interner Fehler' });
    }
  });

  return router;
}
