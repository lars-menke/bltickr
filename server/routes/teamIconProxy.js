import express from 'express';
import { config } from '../config/index.js';

export function createTeamIconProxyRouter() {
  const router = express.Router();

  const ALLOWED_LEAGUES = new Set(['bl1', 'bl2', 'bl3']);

  router.get('/team-icon/:league/:season/:teamInfoId', async (req, res) => {
    try {
      const { league, season, teamInfoId } = req.params;

      if (!ALLOWED_LEAGUES.has(league)) {
        return res.status(400).json({ error: 'Invalid league' });
      }
      if (!/^\d{4}$/.test(season)) {
        return res.status(400).json({ error: 'Invalid season' });
      }
      if (!/^\d+$/.test(teamInfoId)) {
        return res.status(400).json({ error: 'Invalid teamInfoId' });
      }

      const teamsRes = await fetch(
        `${config.openLigaApi}/getavailableteams/${league}/${season}`
      );

      if (!teamsRes.ok) {
        return res.status(502).json({ error: 'Failed to load teams from OpenLigaDB' });
      }

      const teams = await teamsRes.json();
      const team = (teams || []).find(t => String(t.teamInfoId) === String(teamInfoId));

      if (!team?.teamIconUrl) {
        return res.status(404).json({ error: 'Team icon not found' });
      }

      const iconRes = await fetch(team.teamIconUrl, {
        redirect: 'follow',
      });

      if (!iconRes.ok) {
        return res.status(502).json({ error: 'Failed to fetch remote team icon' });
      }

      const contentType = iconRes.headers.get('content-type') || '';

      if (!contentType.startsWith('image/')) {
        return res.status(415).json({ error: 'Remote response is not an image' });
      }

      const arrayBuffer = await iconRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    } catch (err) {
      console.error('[team-icon-proxy] Fehler:', err.message);
      return res.status(500).json({ error: 'Team icon proxy failed' });
    }
  });

  return router;
}
