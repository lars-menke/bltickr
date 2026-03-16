import express from 'express';
import { config } from '../config/index.js';

// In-Memory-Cache: { [key]: { data, cachedAt, finished } }
const detailsCache = new Map();

export function createMatchDetailsRouter() {
  const router = express.Router();

  router.get('/match-details', async (req, res) => {
    const { league, utcDate } = req.query;

    if (!['bl1', 'bl2'].includes(league)) {
      return res.status(400).json({ error: 'Ungültige Liga (bl1 oder bl2 erwartet)' });
    }
    if (!utcDate) {
      return res.status(400).json({ error: 'utcDate fehlt' });
    }

    const targetMs = new Date(utcDate).getTime();
    if (isNaN(targetMs)) {
      return res.status(400).json({ error: 'Ungültiges utcDate-Format' });
    }

    // Cache prüfen
    const cacheKey = `${league}-${utcDate}`;
    const cached = detailsCache.get(cacheKey);
    if (cached) {
      const age = Date.now() - cached.cachedAt;
      if (cached.finished || age < 30_000) {
        res.setHeader('Cache-Control', cached.finished ? 'public, max-age=3600' : 'no-cache');
        return res.json(cached.data);
      }
    }

    try {
      const url = `${config.openLigaApi}/getmatchdata/${league}`;
      const matches = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      }).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} von OpenLigaDB`);
        return r.json();
      });

      // Spiel per Anstoßzeit finden — Toleranz 3h
      const match = (matches || []).find(m => {
        const diff = Math.abs(new Date(m.matchDateTimeUTC).getTime() - targetMs);
        return diff < 3 * 60 * 60 * 1000;
      });

      if (!match) {
        return res.status(404).json({ error: 'Kein passendes Spiel gefunden' });
      }

      const finished = match.matchIsFinished === true;
      // OpenLigaDB enthält keine Karten-Daten — bookings bleibt leer
      const result = {
        goals: match.goals || [],
        bookings: [],
        status: finished ? 'FINISHED' : 'live',
      };

      detailsCache.set(cacheKey, { data: result, cachedAt: Date.now(), finished });
      res.setHeader('Cache-Control', finished ? 'public, max-age=3600' : 'no-cache');
      res.json(result);
    } catch (e) {
      console.error('[match-details]', e.message);
      res.status(502).json({ error: e.message });
    }
  });

  return router;
}
