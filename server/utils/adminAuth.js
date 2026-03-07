import { config } from '../config/index.js';

export function adminAuth(req, res) {
  if (!config.adminSecret) {
    return true;
  }

  const providedSecret = req.header('x-admin-secret');

  if (providedSecret !== config.adminSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}
