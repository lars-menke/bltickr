export function createPollService({ config, pushService, healthState }) {
  const snapshots = {
    bl1: {},
    bl2: {},
  };

  const lastChangeDates = {
    bl1: null,
    bl2: null,
  };

  const warmupDone = new Set();
  const leagues = ['bl1', 'bl2'];

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

  function isLive(match) {
    return !match.matchIsFinished && new Date(match.matchDateTimeUTC).getTime() <= Date.now();
  }

  function getScore(match) {
    const result =
      match.matchResults?.find(r => r.resultTypeID === 2) ??
      match.matchResults?.[match.matchResults.length - 1];

    return result
      ? { g1: result.pointsTeam1, g2: result.pointsTeam2 }
      : { g1: 0, g2: 0 };
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}`);
    return res.json();
  }

  async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}`);
    return res.text();
  }

  async function pollLeague(leagueId) {
    const snap = snapshots[leagueId];
    const leagueLabel = leagueId === 'bl2' ? ' · 2. BL' : '';

    const group = await fetchJson(`${config.openLigaApi}/getcurrentgroup/${leagueId}`);
    const changeDate = await fetchText(
      `${config.openLigaApi}/getlastchangedate/${leagueId}/${config.season}/${group.groupOrderID}`
    );

    if (changeDate === lastChangeDates[leagueId]) {
      console.log('[poll]', leagueId.toUpperCase(), 'keine Änderung, skip');
      return;
    }

    lastChangeDates[leagueId] = changeDate;

    const matches = await fetchJson(
      `${config.openLigaApi}/getmatchdata/${leagueId}/${config.season}/${group.groupOrderID}`
    );

    const newSnap = {};

    for (const m of matches) {
      const s = getScore(m);
      newSnap[m.matchID] = {
        goalCount: (m.goals || []).length,
        finished: m.matchIsFinished,
        live: isLive(m),
        g1: s.g1,
        g2: s.g2,
      };
    }

    if (!warmupDone.has(leagueId)) {
      snapshots[leagueId] = newSnap;
      warmupDone.add(leagueId);

      const live = matches.filter(m => isLive(m)).length;
      console.log(
        '[poll]',
        leagueId.toUpperCase(),
        'Warmup abgeschlossen —',
        matches.length,
        'Spiele,',
        live,
        'live'
      );
      return;
    }

    const events = [];

    for (const m of matches) {
      const prev = snap[m.matchID];
      const next = newSnap[m.matchID];

      if (!prev || !next) continue;

      const t1 = m.team1.shortName;
      const t2 = m.team2.shortName;
      const teams = [m.team1.teamName, m.team2.teamName];

      if (!prev.live && next.live && !next.finished) {
        events.push({
          type: 'anstoß',
          title: `${t1} vs ${t2}`,
          body: `Anpfiff${leagueLabel}\nDas Spiel hat begonnen`,
          matchId: m.matchID,
          teams,
          dedupeKey: `${m.matchID}-anstoß`,
        });
      }

      if (next.goalCount > prev.goalCount) {
        for (const g of (m.goals || []).slice(prev.goalCount)) {
          const ico = g.isOwnGoal ? '' : g.isPenalty ? '' : '⚽';
          const typ = g.isOwnGoal ? 'Eigentor' : g.isPenalty ? 'Elfmeter' : 'Tor';
          const s1 = g.scoreTeam1 ?? next.g1;
          const s2 = g.scoreTeam2 ?? next.g2;

          events.push({
            type: 'tor',
            title: `${t1} vs ${t2}`,
            body: `${ico} Tor! ${s1}:${s2} (${g.matchMinute}')${leagueLabel}\n${g.goalGetterName || 'Unbekannt'} · ${typ}`,
            matchId: m.matchID,
            teams,
            dedupeKey: `${m.matchID}-tor-${s1}-${s2}`,
          });
        }
      }

      if (!prev.finished && next.finished) {
        events.push({
          type: 'abpfiff',
          title: `${t1} vs ${t2}`,
          body: `Abpfiff · ${next.g1}:${next.g2}${leagueLabel}\nDas Spiel ist zu Ende`,
          matchId: m.matchID,
          teams,
          dedupeKey: `${m.matchID}-abpfiff`,
        });
      }
    }

    if (events.length > 0) {
      console.log('[poll]', leagueId.toUpperCase(), events.length, 'Events');
    }

    for (const event of events) {
      await pushService.sendToFiltered(event, event.teams);
    }

    snapshots[leagueId] = newSnap;
  }

  async function poll() {
    healthState.lastPollAt = new Date().toISOString();

    if (!isGameWindow()) {
      console.log('[poll] außerhalb Spielfenster — skip');
      return;
    }

    const results = await Promise.allSettled(
      leagues.map(id =>
        pollLeague(id).catch(err => {
          console.error('[poll]', id, 'Fehler:', err.message);
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
  }

  function getLeagues() {
    return leagues;
  }

  return {
    poll,
    getLeagues,
    isGameWindow,
  };
}
