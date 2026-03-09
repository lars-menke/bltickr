export function createPollService({ config, pushService, healthState }) {
  const snapshots = {};          // { [code]: { [matchId]: snapshot } }
  const warmupDone = new Set();
  const currentMatchday = {};    // { [code]: number }
  const advancedMatchday = new Set();

  const leagues = [
    { code: 'BL1', label: '' },
    { code: 'BL2', label: ' · 2. BL' },
  ];

  // Retry-Queue für Tore ohne Torschützen
  const pendingScorers = new Map();

  const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED']);
  const DONE_STATUSES = new Set(['FINISHED', 'CANCELLED', 'POSTPONED', 'SUSPENDED', 'AWARDED']);

  function isGameWindow() {
    const now = new Date();
    const day = now.getUTCDay(); // 0=So, 1=Mo, ..., 5=Fr, 6=Sa
    const h = now.getUTCHours();
    if (day === 5) return h >= 13 && h < 23; // Freitag  13–23
    if (day === 6) return h >= 13 && h < 23; // Samstag  13–23
    if (day === 0) return h >= 13 && h < 22; // Sonntag  13–22
    if (day === 1) return h >= 16 && h < 23; // Montag   16–23 (BL2)
    return false;
  }

  async function fetchJson(url) {
    const res = await fetch(url, {
      headers: { 'X-Auth-Token': config.footballDataApiKey },
    });
    if (res.status === 403) {
      throw new Error(
        `HTTP 403 bei ${url} — API-Schlüssel oder Tier prüfen (BL2 benötigt ggf. höheres Tier)`
      );
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}`);
    return res.json();
  }

  // Bestimmt, ob ein Tor dem Heimteam gutgeschrieben wird.
  // Bei Eigentor: der Team-Eintrag ist das schießende Team → Punkt geht an Gegner.
  function goesToHome(g, homeTeamId) {
    return g.type === 'OWN_GOAL'
      ? g.team?.id !== homeTeamId
      : g.team?.id === homeTeamId;
  }

  // Berechnet den laufenden Spielstand nach Tor mit Index `upToIndex`.
  function calcRunningScore(goals, upToIndex, homeTeamId) {
    let h = 0, a = 0;
    for (let i = 0; i <= upToIndex; i++) {
      if (goesToHome(goals[i], homeTeamId)) h++; else a++;
    }
    return { h, a };
  }

  // Retry: Torschütze für ein bereits gepushtes Tor nachtragen.
  async function retryScorer(dedupeKey) {
    const p = pendingScorers.get(dedupeKey);
    if (!p) return;

    try {
      const data = await fetchJson(`${config.footballDataApiUrl}/v4/matches/${p.matchID}`);
      const goals = data.goals || [];
      const homeTeamId = data.homeTeam?.id;

      for (let i = 0; i < goals.length; i++) {
        const { h, a } = calcRunningScore(goals, i, homeTeamId);
        if (h === p.s1 && a === p.s2) {
          const g = goals[i];
          if (g.scorer?.name?.trim()) {
            pendingScorers.delete(dedupeKey);
            const name = g.scorer.name.trim();
            const ico = g.type === 'OWN_GOAL' ? '🔴' : '⚽';
            const typ = g.type === 'OWN_GOAL' ? 'Eigentor' : g.type === 'PENALTY' ? 'Elfmeter' : 'Tor';
            console.log('[scorer-retry] Torschütze gefunden:', name, 'für Match', p.matchID);
            // dedupeKey identisch mit Tor-Push → SW ersetzt die Notification
            await pushService.sendToFiltered(
              {
                type: 'tor-update',
                title: `${p.t1} vs ${p.t2}`,
                body: `${ico} Tor! ${p.s1}:${p.s2} (${g.minute}')${p.leagueLabel}\n${name} · ${typ}`,
                matchId: p.matchID,
                teams: p.teams,
                dedupeKey,
              },
              p.teams
            );
            return;
          }
          break; // Tor gefunden, Schütze noch nicht bekannt
        }
      }
    } catch (e) {
      console.error('[scorer-retry] Fehler bei', dedupeKey, e.message);
    }

    p.attempts++;
    if (p.attempts < 3) {
      console.log(`[scorer-retry] Versuch ${p.attempts}/3 für Match ${p.matchID} — nächster in 45s`);
      setTimeout(() => retryScorer(dedupeKey), 45_000);
    } else {
      pendingScorers.delete(dedupeKey);
      console.log('[scorer-retry] Kein Torschütze nach 3 Versuchen — aufgegeben');
    }
  }

  // Aktuellen Spieltag von football-data.org holen (einmalig pro Liga).
  async function initLeague(code) {
    const data = await fetchJson(`${config.footballDataApiUrl}/v4/competitions/${code}`);
    currentMatchday[code] = data.currentSeason?.currentMatchday ?? 1;
    console.log('[poll]', code, 'Spieltag init:', currentMatchday[code]);
  }

  async function pollLeague({ code, label }) {
    if (currentMatchday[code] == null) await initLeague(code);
    if (!snapshots[code]) snapshots[code] = {};
    const snap = snapshots[code];

    const data = await fetchJson(
      `${config.footballDataApiUrl}/v4/competitions/${code}/matches` +
      `?matchday=${currentMatchday[code]}&season=${config.season}`
    );
    const matches = data.matches || [];

    // Neuen Snapshot aufbauen
    const newSnap = {};
    for (const m of matches) {
      newSnap[m.id] = {
        status: m.status,
        goalCount: (m.goals || []).length,
        bookingCount: (m.bookings || []).length,
      };
    }

    if (!warmupDone.has(code)) {
      snapshots[code] = newSnap;
      warmupDone.add(code);
      const live = matches.filter(m => LIVE_STATUSES.has(m.status)).length;
      console.log('[poll]', code, 'Warmup —', matches.length, 'Spiele,', live, 'live');
      return live > 0;
    }

    const events = [];

    for (const m of matches) {
      const prev = snap[m.id];
      const next = newSnap[m.id];
      if (!prev || !next) continue;

      const t1 = m.homeTeam.shortName || m.homeTeam.name;
      const t2 = m.awayTeam.shortName || m.awayTeam.name;
      const teams = [m.homeTeam.name, m.awayTeam.name];
      const goals = m.goals || [];

      // ── Anstoß ─────────────────────────────────────────────────────────────
      if (!LIVE_STATUSES.has(prev.status) && LIVE_STATUSES.has(next.status)) {
        events.push({
          type: 'anstoß',
          title: `${t1} vs ${t2}`,
          body: `Anpfiff${label}\nDas Spiel hat begonnen`,
          matchId: m.id,
          teams,
          dedupeKey: `${m.id}-anstoß`,
        });
      }

      // ── Tore ────────────────────────────────────────────────────────────────
      if (next.goalCount > prev.goalCount) {
        for (let i = prev.goalCount; i < goals.length; i++) {
          const g = goals[i];
          const { h: s1, a: s2 } = calcRunningScore(goals, i, m.homeTeam.id);
          const ico = g.type === 'OWN_GOAL' ? '🔴' : '⚽';
          const typ = g.type === 'OWN_GOAL' ? 'Eigentor' : g.type === 'PENALTY' ? 'Elfmeter' : 'Tor';
          const scorer = g.scorer?.name?.trim();
          const dedupeKey = `${m.id}-tor-${s1}-${s2}`;

          events.push({
            type: 'tor',
            title: `${t1} vs ${t2}`,
            body: scorer
              ? `${ico} Tor! ${s1}:${s2} (${g.minute}')${label}\n${scorer} · ${typ}`
              : `${ico} Tor! ${s1}:${s2} (${g.minute}')${label}`,
            matchId: m.id,
            teams,
            dedupeKey,
          });

          if (!scorer && !pendingScorers.has(dedupeKey)) {
            pendingScorers.set(dedupeKey, {
              matchID: m.id, s1, s2,
              matchMinute: g.minute, leagueLabel: label, t1, t2, teams,
              attempts: 0,
            });
            setTimeout(() => retryScorer(dedupeKey), 45_000);
            console.log(`[scorer-retry] Torschütze fehlt — Retry in 45s (Match ${m.id}, ${s1}:${s2})`);
          }
        }
      }

      // ── Karten ──────────────────────────────────────────────────────────────
      if (next.bookingCount > prev.bookingCount) {
        const bookings = m.bookings || [];
        for (let i = prev.bookingCount; i < bookings.length; i++) {
          const b = bookings[i];
          const ico =
            b.card === 'RED_CARD'        ? '🟥' :
            b.card === 'YELLOW_RED_CARD' ? '🟨🟥' : '🟨';
          const typ =
            b.card === 'RED_CARD'        ? 'Rote Karte' :
            b.card === 'YELLOW_RED_CARD' ? 'Gelb-Rot' : 'Gelbe Karte';

          events.push({
            type: 'karte',
            title: `${t1} vs ${t2}`,
            body: `${ico} ${typ} (${b.minute}')${label}\n${b.player?.name || 'Unbekannt'}`,
            matchId: m.id,
            teams,
            dedupeKey: `${m.id}-karte-${b.minute}-${b.player?.id ?? i}`,
          });
        }
      }

      // ── Abpfiff ─────────────────────────────────────────────────────────────
      if (!DONE_STATUSES.has(prev.status) && next.status === 'FINISHED') {
        const finalH = m.score?.fullTime?.home ?? 0;
        const finalA = m.score?.fullTime?.away ?? 0;
        events.push({
          type: 'abpfiff',
          title: `${t1} vs ${t2}`,
          body: `Abpfiff · ${finalH}:${finalA}${label}\nDas Spiel ist zu Ende`,
          matchId: m.id,
          teams,
          dedupeKey: `${m.id}-abpfiff`,
        });
      }
    }

    if (events.length > 0) {
      console.log('[poll]', code, events.length, 'Events');
    }

    for (const event of events) {
      await pushService.sendToFiltered(event, event.teams);
    }

    snapshots[code] = newSnap;

    // Spieltag-Wechsel: wenn alle Spiele beendet sind, nächsten Spieltag laden
    const allDone =
      matches.length > 0 &&
      matches.every(m => DONE_STATUSES.has(m.status));

    if (allDone && !advancedMatchday.has(code)) {
      advancedMatchday.add(code);
      currentMatchday[code]++;
      snapshots[code] = {};
      console.log('[poll]', code, 'Spieltag abgeschlossen → nächster Spieltag:', currentMatchday[code]);
    } else if (!allDone) {
      advancedMatchday.delete(code);
    }

    return matches.some(m => LIVE_STATUSES.has(m.status));
  }

  let currentlyLive = false;

  async function poll() {
    healthState.lastPollAt = new Date().toISOString();

    if (!isGameWindow()) {
      console.log('[poll] außerhalb Spielfenster — skip');
      return;
    }

    const results = await Promise.allSettled(
      leagues.map(({ code, label }) =>
        pollLeague({ code, label }).catch(err => {
          console.error('[poll]', code, 'Fehler:', err.message);
          throw err;
        })
      )
    );

    const rejected = results.filter(r => r.status === 'rejected');

    if (rejected.length > 0) {
      healthState.lastPollOk = false;
      healthState.lastPollError = rejected.map(r => r.reason?.message).join(' | ');
      return;
    }

    healthState.lastPollOk = true;
    healthState.lastPollError = null;

    currentlyLive = results.some(r => r.status === 'fulfilled' && r.value === true);
    if (currentlyLive) {
      console.log('[poll] Live-Spiele aktiv → nächster Poll in 25s');
    }
  }

  function getLeagues() {
    return leagues.map(l => l.code.toLowerCase());
  }

  function nextInterval() {
    return currentlyLive ? 25_000 : config.pollIntervalMs;
  }

  return {
    poll,
    getLeagues,
    isGameWindow,
    nextInterval,
  };
}
