import { APP_CONFIG } from './config.js';

export async function fetchJson(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} bei ${url}`);
  }

  return res.json();
}

export async function fetchCurrentGroup(league) {
  return fetchJson(`${APP_CONFIG.openLigaApi}/getcurrentgroup/${league}`);
}

export async function fetchMatchData(league, season, groupOrderId) {
  return fetchJson(
    `${APP_CONFIG.openLigaApi}/getmatchdata/${league}/${season}/${groupOrderId}`
  );
}

export async function fetchTable(league, season) {
  return fetchJson(`${APP_CONFIG.openLigaApi}/getbltable/${league}/${season}`);
}

export async function subscribePush(subscription, favorites) {
  const res = await fetch(`${APP_CONFIG.serverUrl}/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...subscription,
      favorites,
    }),
  });

  if (!res.ok) {
    throw new Error(`Push-Subscribe fehlgeschlagen: HTTP ${res.status}`);
  }

  return res.json();
}
