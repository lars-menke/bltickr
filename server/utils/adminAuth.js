import { config } from '../config/index.js';

export function adminAuth(req, res) {
  if (!config.adminSecret) {
    res.status(503).json({ error: 'Admin-Zugang nicht konfiguriert (ADMIN_SECRET fehlt)' });
    return false;
  }

  const providedSecret = req.header('x-admin-secret');

  if (providedSecret !== config.adminSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}
