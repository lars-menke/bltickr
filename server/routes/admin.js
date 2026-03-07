import express from 'express';
import { adminAuth } from '../utils/adminAuth.js';

export function createAdminRouter(store) {
  const router = express.Router();

  router.get('/admin', (req, res) => {
    res.type('html').send(`
      <h1>BL TICK-R · Admin</h1>
      <p>Server läuft.</p>
      <p>Geschützte Endpunkte erwarten den Header <code>x-admin-secret</code>.</p>
    `);
  });

  router.get('/admin/subscriptions', (req, res) => {
    if (!adminAuth(req, res)) return;

    res.json({
      count: store.count(),
      subscriptions: store.listForAdmin(),
    });
  });

  router.delete('/admin/subscriptions/:key', async (req, res) => {
    if (!adminAuth(req, res)) return;

    const { key } = req.params;

    if (!await store.remove(key)) {
      return res.status(404).json({ error: 'Nicht gefunden' });
    }

    console.log('[admin] Subscription gelöscht:', key);
    res.json({ ok: true, key });
  });

  return router;
}
