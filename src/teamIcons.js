import { APP_CONFIG } from './config.js';

const teamIconMaps = new Map();

export async function loadTeamIconsForLeague({ league, season, fetchJson, apiBase }) {
  const teams = await fetchJson(`${apiBase}/getavailableteams/${league}/${season}`);
  const map = new Map();

  for (const team of teams || []) {
    if (team?.teamInfoId && team?.teamIconUrl) {
      map.set(team.teamInfoId, team.teamIconUrl);
    }
  }

  teamIconMaps.set(`${league}:${season}`, map);
  return map;
}

export function getResolvedTeamIcon({ league, season, team }) {
  const map = teamIconMaps.get(`${league}:${season}`);
  const hasKnownIcon = map?.has(team?.teamInfoId);

  if (hasKnownIcon && team?.teamInfoId) {
    return `${APP_CONFIG.serverUrl}/team-icon/${league}/${season}/${team.teamInfoId}`;
  }

  return team?.teamIconUrl || '';
}
