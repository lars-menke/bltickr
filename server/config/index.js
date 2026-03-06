export const config = {
  port: Number(process.env.PORT || 3000),

  openLigaApi: process.env.OPENLIGA_API || 'https://api.openligadb.de',
  season: process.env.SEASON || '2025',

  vapidSubject: process.env.VAPID_SUBJECT || '',
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',

  adminSecret: process.env.ADMIN_SECRET || '',

  subsFile: process.env.SUBS_FILE || '/data/subscriptions.json',

  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean),

  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 60_000),
  pollStartupDelayMs: Number(process.env.POLL_STARTUP_DELAY_MS || 10_000),
};
