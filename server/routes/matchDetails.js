import express from 'express';

export function createMatchDetailsRouter({ config }) {
  const router = express.Router();

  router.get('/match-details', async (req, res) => {
    const { league, utcDate } = req.query;

    if (!['bl1', 'bl2'].includes(league)) {
      return res.status(400).json({ error: 'Ungültige Liga (bl1 oder bl2 erwartet)' });
    }
    if (!utcDate) {
      return res.status(400).json({ error: 'utcDate fehlt' });
    }

    const code = league.toUpperCase(); // bl1 → BL1
    const targetMs = new Date(utcDate).getTime();
    if (isNaN(targetMs)) {
      return res.status(400).json({ error: 'Ungültiges utcDate-Format' });
    }

    if (!config.footballDataApiKey) {
      console.warn('[match-details] FOOTBALL_DATA_API_KEY nicht gesetzt');
      return res.status(503).json({ error: 'API-Key nicht konfiguriert' });
    }

    // Datumsbereich: ±1 Tag um den Anstoß (fängt Zeitzonenunterschiede ab)
    const d = new Date(targetMs);
    const dateFrom = new Date(d.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dateTo   = new Date(d.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      const url = `${config.footballDataApiUrl}/v4/competitions/${code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
      console.log(`[match-details] GET ${url}`);
      const fdRes = await fetch(url, {
        headers: { 'X-Auth-Token': config.footballDataApiKey },
        signal: AbortSignal.timeout(8000),
      });
      if (fdRes.status === 403) {
        console.warn(`[match-details] 403 von fd.org — Liga ${code} im aktuellen Tier gesperrt?`);
        return res.status(403).json({ error: `API-Tier für ${code} nicht freigeschaltet` });
      }
      if (fdRes.status === 401) {
        console.warn('[match-details] 401 — ungültiger API-Key');
        return res.status(503).json({ error: 'Ungültiger API-Key' });
      }
      if (!fdRes.ok) throw new Error(`HTTP ${fdRes.status} von football-data.org`);

      const data = await fdRes.json();
      console.log(`[match-details] ${data.matches?.length ?? 0} Spiele in [${dateFrom}…${dateTo}]`);

      // Spiel per Anstoßzeit finden — Toleranz 3h (deckt Zeitzonenabweichungen ab)
      const match = (data.matches || []).find(m => {
        const diff = Math.abs(new Date(m.utcDate).getTime() - targetMs);
        return diff < 3 * 60 * 60 * 1000;
      });

      if (!match) {
        const times = (data.matches || []).map(m => m.utcDate).join(', ');
        console.warn(`[match-details] kein Match für ${utcDate}. Verfügbare Zeiten: ${times}`);
        return res.status(404).json({ error: 'Kein passendes Spiel gefunden' });
      }
      console.log(`[match-details] ✓ ${match.homeTeam?.name} vs ${match.awayTeam?.name} — ${match.bookings?.length ?? 0} Karten`);

      if (match.status === 'FINISHED') {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }

      res.json({
        goals: match.goals || [],
        bookings: match.bookings || [],
        status: match.status,
      });
    } catch (e) {
      console.error('[match-details]', e.message);
      res.status(502).json({ error: e.message });
    }
  });

  return router;
}
