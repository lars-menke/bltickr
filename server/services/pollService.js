export function createPollService({ config, pushService, healthState }) {
  const snapshots = {};       // { [leagueKey]: { [matchId]: { goalCount, state } } }
  const warmupDone = new Set();

  const leagues = [
    { key: 'bl1', label: '' },
    { key: 'bl2', label: ' · 2. BL' },
  ];

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
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}`);
    return res.json();
  }

  // Leitet den Spielzustand aus OpenLigaDB-Feldern ab (kein explizites Status-Feld).
  // 'live'     → Anpfiff war, Spiel noch nicht beendet, plausible Spielzeit
  // 'finished' → matchIsFinished === true
  // 'upcoming' → Anstoß liegt noch in der Zukunft (oder Spieldauer >140 min ohne finished-Flag)
  function matchState(m, now) {
    if (m.matchIsFinished) return 'finished';
    const ko = new Date(m.matchDateTimeUTC);
    const elapsedMin = (now - ko) / 60_000;
    if (ko <= now && elapsedMin < 140) return 'live';
    return 'upcoming';
  }

  async function pollLeague({ key, label }) {
    const url = `${config.openLigaApi}/getmatchdata/${key}`;
    const matches = await fetchJson(url);
    const now = new Date();

    if (!snapshots[key]) snapshots[key] = {};
    const snap = snapshots[key];

    // Neuen Snapshot aufbauen
    const newSnap = {};
    for (const m of matches) {
      newSnap[m.matchID] = {
        goalCount: (m.goals || []).length,
        state: matchState(m, now),
      };
    }

    // Erster Poll = Warmup: Ausgangszustand speichern, keine Events auslösen
    if (!warmupDone.has(key)) {
      snapshots[key] = newSnap;
      warmupDone.add(key);
      const live = matches.filter(m => matchState(m, now) === 'live').length;
      console.log('[poll]', key, 'Warmup —', matches.length, 'Spiele,', live, 'live');
      return live > 0;
    }

    const events = [];

    for (const m of matches) {
      const prev = snap[m.matchID];
      const next = newSnap[m.matchID];
      if (!prev || !next) continue;

      const t1 = m.team1.shortName || m.team1.teamName;
      const t2 = m.team2.shortName || m.team2.teamName;
      const teams = [m.team1.teamName, m.team2.teamName];
      const goals = m.goals || [];

      // ── Anstoß ─────────────────────────────────────────────────────────────
      if (prev.state !== 'live' && next.state === 'live') {
        events.push({
          type: 'anstoß',
          title: `${t1} vs ${t2}`,
          body: `⚽ Anpfiff${label}\nDas Spiel hat begonnen`,
          matchId: m.matchID,
          teams,
          dedupeKey: `${m.matchID}-anstoß`,
        });
      }

      // ── Tore ────────────────────────────────────────────────────────────────
      if (next.goalCount > prev.goalCount) {
        for (let i = prev.goalCount; i < goals.length; i++) {
          const g = goals[i];
          const s1 = g.scoreTeam1 ?? 0;
          const s2 = g.scoreTeam2 ?? 0;
          const ico = g.isOwnGoal ? '🔴' : '⚽';
          const typ = g.isOwnGoal ? 'Eigentor' : g.isPenalty ? 'Elfmeter' : 'Tor';
          const scorer = g.goalGetterName?.trim() || '';

          events.push({
            type: 'tor',
            title: `${t1} vs ${t2}`,
            body: scorer
              ? `${ico} Tor! ${s1}:${s2} (${g.matchMinute}')${label}\n${scorer} · ${typ}`
              : `${ico} Tor! ${s1}:${s2} (${g.matchMinute}')${label}`,
            matchId: m.matchID,
            teams,
            dedupeKey: `${m.matchID}-tor-${s1}-${s2}`,
          });
        }
      }

      // ── Abpfiff ─────────────────────────────────────────────────────────────
      if (prev.state !== 'finished' && next.state === 'finished') {
        const res = m.matchResults?.find(r => r.resultTypeID === 2)
          ?? m.matchResults?.[m.matchResults.length - 1];
        const finalH = res?.pointsTeam1 ?? 0;
        const finalA = res?.pointsTeam2 ?? 0;
        events.push({
          type: 'abpfiff',
          title: `${t1} vs ${t2}`,
          body: `🏁 Abpfiff · ${finalH}:${finalA}${label}\nDas Spiel ist zu Ende`,
          matchId: m.matchID,
          teams,
          dedupeKey: `${m.matchID}-abpfiff`,
        });
      }
    }

    if (events.length > 0) {
      console.log('[poll]', key, events.length, 'Events');
    }

    for (const event of events) {
      await pushService.sendToFiltered(event, event.teams);
    }

    snapshots[key] = newSnap;

    return matches.some(m => matchState(m, now) === 'live');
  }

  let currentlyLive = false;

  async function poll() {
    healthState.lastPollAt = new Date().toISOString();

    if (!isGameWindow()) {
      console.log('[poll] außerhalb Spielfenster — skip');
      return;
    }

    const results = await Promise.allSettled(
      leagues.map(({ key, label }) =>
        pollLeague({ key, label }).catch(err => {
          console.error('[poll]', key, 'Fehler:', err.message);
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
    return leagues.map(l => l.key);
  }

  function nextInterval() {
    return currentlyLive ? 25_000 : config.pollIntervalMs;
  }

  return { poll, getLeagues, isGameWindow, nextInterval };
}
