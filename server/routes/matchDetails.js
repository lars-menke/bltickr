import express from 'express';

export function createMatchDetailsRouter({ config }) {
  const router = express.Router();

  router.get('/match-details', async (req, res) => {
    const { league, matchday, utcDate } = req.query;

    if (!['bl1', 'bl2'].includes(league)) {
      return res.status(400).json({ error: 'Ungültige Liga (bl1 oder bl2 erwartet)' });
    }
    const md = parseInt(matchday, 10);
    if (isNaN(md) || md < 1 || md > 38) {
      return res.status(400).json({ error: 'Ungültiger Spieltag' });
    }
    if (!utcDate) {
      return res.status(400).json({ error: 'utcDate fehlt' });
    }

    const code = league.toUpperCase(); // bl1 → BL1
    const targetMs = new Date(utcDate).getTime();
    if (isNaN(targetMs)) {
      return res.status(400).json({ error: 'Ungültiges utcDate-Format' });
    }

    try {
      const fdRes = await fetch(
        `${config.footballDataApiUrl}/v4/competitions/${code}/matches` +
        `?matchday=${md}&season=${config.season}`,
        {
          headers: { 'X-Auth-Token': config.footballDataApiKey },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (fdRes.status === 403) {
        return res.status(403).json({ error: `API-Tier für ${code} nicht freigeschaltet` });
      }
      if (!fdRes.ok) throw new Error(`HTTP ${fdRes.status} von football-data.org`);

      const data = await fdRes.json();

      // Spiel per Anstoßzeit finden (Toleranz 30 Min)
      const match = (data.matches || []).find(m => {
        const diff = Math.abs(new Date(m.utcDate).getTime() - targetMs);
        return diff < 30 * 60 * 1000;
      });

      if (!match) {
        return res.status(404).json({ error: 'Kein passendes Spiel gefunden' });
      }

      // Abgeschlossene Spiele können gecacht werden
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
