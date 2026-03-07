BLTICKR LOGO FIX

Ziel:
Club-Logos nicht mehr blind aus dem jeweiligen Match- oder Tabellenobjekt ziehen,
sondern zentral über die Liga-Teamliste auflösen.

NEUE DATEI
- src/teamIcons.js

MANUELLE AENDERUNGEN

1) src/bridge.js erweitern

Import ergänzen:
import { loadTeamIconsForLeague, getResolvedTeamIcon } from './teamIcons.js';

In window.BLTICKR ergänzen:
loadTeamIconsForLeague,
getResolvedTeamIcon,

2) index.html: Vor dem ersten Rendern oder direkt nach der Ligabestimmung
einmal die Teamliste laden:

await window.BLTICKR.loadTeamIconsForLeague({
  league: curLeague,
  season: SEASON,
  fetchJson: window.BLTICKR.fetchJson,
  apiBase: API,
});

Wichtig:
Das sollte auch beim Ligawechsel erneut passieren.

3) index.html: logo(team, right) anpassen

Bisher wird direkt team.teamIconUrl genutzt.
Ersetze das durch:

const iconUrl = window.BLTICKR.getResolvedTeamIcon({
  league: curLeague,
  season: SEASON,
  team,
});

const inner = iconUrl
  ? `<img src="${iconUrl}" alt="${a}" onerror="this.outerHTML='<span>${a}</span>'">`
  : `<span>${a}</span>`;

4) Optional: vor Tabellen- oder Match-Rendern sicherstellen,
dass loadTeamIconsForLeague(...) fuer die aktive Liga bereits gelaufen ist.

HINWEIS
Diese ZIP ersetzt absichtlich nicht blind index.html oder bridge.js.
Der Fix ist klein, aber die Stellen im bestehenden HTML muessen gezielt angepasst werden.
