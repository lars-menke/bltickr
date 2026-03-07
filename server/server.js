import express from 'express';

import { config } from './config/index.js';
import { createSubscriptionStore } from './storage/subscriptionStore.js';
import { createPushService } from './services/pushService.js';
import { createPollService } from './services/pollService.js';
import { createHealthRouter } from './routes/health.js';
import { createSubscribeRouter } from './routes/subscribe.js';
import { createPushTestRouter } from './routes/pushTest.js';
import { createAdminRouter } from './routes/admin.js';
import { createTeamIconProxyRouter } from './routes/teamIconProxy.js';

const app = express();
app.use(express.json());

const healthState = {
  lastPollAt: null,
  lastPollOk: null,
  lastPollError: null,
};

const store = createSubscriptionStore(config.subsFile);
await store.load();

const pushService = createPushService({
  vapidSubject: config.vapidSubject,
  vapidPublicKey: config.vapidPublicKey,
  vapidPrivateKey: config.vapidPrivateKey,
  store,
});

const pollService = createPollService({
  config,
  pushService,
  healthState,
});

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (config.allowedOrigins.length === 0) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'BL TICK-R',
    season: config.season,
  });
});

app.use(createHealthRouter({ store, pollService, healthState }));
app.use(createSubscribeRouter(store));
app.use(createPushTestRouter({ store, pushService }));
app.use(createAdminRouter(store));
app.use(createTeamIconProxyRouter());

app.listen(config.port, () => {
  console.log('[server] BL TICK-R läuft auf Port', config.port);

  if (!config.adminSecret) {
    console.warn('[security] ADMIN_SECRET nicht gesetzt — /admin und /push-test sind ohne Authentifizierung erreichbar!');
  }

  setTimeout(() => {
    pollService.poll();
    setInterval(() => pollService.poll(), config.pollIntervalMs);
  }, config.pollStartupDelayMs);
});
