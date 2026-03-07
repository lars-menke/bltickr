import express from 'express';
import { config } from '../config/index.js';

export function createHealthRouter({ store, pollService, healthState }) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({
      ok: true,
      service: 'BL TICK-R',
      season: config.season,
      uptimeSec: Math.round(process.uptime()),
      subscribers: store.count(),
      leagues: pollService.getLeagues(),
      inGameWindow: pollService.isGameWindow(),
      lastPollAt: healthState.lastPollAt,
      lastPollOk: healthState.lastPollOk,
      lastPollError: healthState.lastPollError,
    });
  });

  return router;
}
