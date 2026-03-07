import express from 'express';

export function createSubscribeRouter(store) {
  const router = express.Router();

  router.post('/subscribe', async (req, res) => {
    const sub = req.body;

    if (!sub?.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription payload' });
    }

    const key = await store.add(sub);

    console.log(
      '[api] Neue Subscription:',
      key,
      '· Favoriten:',
      store.get(key)?.favorites?.length || 'alle'
    );

    res.status(201).json({ ok: true, key });
  });

  return router;
}
