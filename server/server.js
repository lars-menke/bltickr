// server/server.js — BL TICK-R Fly.io Server

import express from 'express';
import webpush from 'web-push';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── VAPID ──
console.log('[vapid] PUBLIC_KEY:', process.env.VAPID_PUBLIC_KEY?.slice(0, 10) + '...');
console.log('[vapid] SUBJECT:', process.env.VAPID_SUBJECT);
try {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('[vapid] OK');
} catch (err) {
  console.error('[vapid] Fehler:', err.message);
}

// ── Subscriptions ──
const SUBS_FILE = path.join(__dirname, 'data', 'subscriptions.json');
let subscriptions = {};

function loadSubs() {
  try {
    if (fs.existsSync(SUBS_FILE)) {
      subscriptions = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
      console.log('[store] ' + Object.keys(subscriptions).length + ' Subscriptions geladen');
    }
  } catch (e) { console.warn('[store] Ladefehler:', e.message); }
}

function saveSubs() {
  try {
    fs.mkdirSync(path.dirname(SUBS_FILE), { recursive: true });
    fs.writeFileSync(SUBS_FILE, JSON.stringify(subscriptions, null, 2));
  } catch (e) { console.warn('[store] Speicherfehler:', e.message); }
}

function addSub(body) {
  const { favorites: favs, ...pushSub } = body;
  const key = Buffer.from(pushSub.endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 64);
  subscriptions[key] = {
    subscription: pushSub,
    favorites: Array.isArray(favs) ? favs : [],
    createdAt: new Date().toISOString(),
  };
  saveSubs();
  return key;
}

// Favoriten-gefilterter Push
async function sendToFiltered(payload, teams) {
  const keys = Object.keys(subscriptions);
  if (keys.length === 0) { console.log('[push] Keine Subscriber'); return; }
  await Promise.allSettled(keys.map(async key => {
    const { subscription, favorites } = subscriptions[key];
    // Favoriten-Filter: wenn gesetzt UND teams bekannt, nur Spiele mit passendem Team
    if (teams.length > 0 && favorites && favorites.length > 0) {
      const match = teams.some(t => favorites.includes(t));
      if (!match) return;
    }
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
    } catch (err) {
      console.error('[push] Fehler bei', key, '— Status:', err.statusCode, err.message);
      if (err.statusCode === 410 || err.statusCode === 404 ||
          (err.statusCode === 400 && err.body?.includes('VapidPkHashMismatch'))) {
        delete subscriptions[key];
        saveSubs();
        console.log('[push] Subscription entfernt:', key);
      }
    }
  }));
}

// Für den Push-Test: alle Subscriber
async function sendToAll(payload) {
  return sendToFiltered(payload, []); // leeres teams-Array → kein Filter
}

// ── Spiellogik ──
const OPENLIGA_API = 'https://api.openligadb.de';
const SEASON = '2025';
const LEAGUES = ['bl1', 'bl2'];
const MATCH_WINDOWS = [
  { day: 5, from: 13, to: 23 },
  { day: 6, from: 13, to: 23 },
  { day: 0, from: 13, to: 22 },
  { day: 1, from: 16, to: 23 }, // Montag (BL2)
];

function isMatchWindow() {
  const now = new Date();
  return MATCH_WINDOWS.some(w => w.day === now.getUTCDay() && now.getUTCHours() >= w.from && now.getUTCHours() < w.to);
}
function isLive(m) { return !m.matchIsFinished && new Date(m.matchDateTimeUTC).getTime() <= Date.now(); }
function getScore(m) {
  const r = m.matchResults?.find(r => r.resultTypeID === 2) ?? m.matchResults?.[m.matchResults.length - 1];
  return r ? { g1: r.pointsTeam1, g2: r.pointsTeam2 } : { g1: 0, g2: 0 };
}

// Separater Snapshot pro Liga
const snapshots = { bl1: {}, bl2: {} };

async function pollLeague(leagueId) {
  const snap = snapshots[leagueId];
  const leagueLabel = leagueId === 'bl2' ? ' · 2. BL' : '';
  const group = await fetch(OPENLIGA_API + '/getcurrentgroup/' + leagueId).then(r => r.json());
  const matches = await fetch(OPENLIGA_API + '/getmatchdata/' + leagueId + '/' + SEASON + '/' + group.groupOrderID).then(r => r.json());
  const newSnap = {};
  for (const m of matches) {
    const s = getScore(m);
    newSnap[m.matchID] = { goalCount: (m.goals||[]).length, finished: m.matchIsFinished, live: isLive(m), g1: s.g1, g2: s.g2 };
  }
  const events = [];
  for (const m of matches) {
    const p = snap[m.matchID], n = newSnap[m.matchID];
    if (!p || !n) continue;
    const t1 = m.team1.shortName, t2 = m.team2.shortName;
    const teams = [m.team1.teamName, m.team2.teamName];
    if (!p.live && n.live && !n.finished)
      events.push({ type: 'anstoß', title: t1 + ' vs ' + t2, body: '🟢 Anpfiff' + leagueLabel + '\nDas Spiel hat begonnen', matchId: m.matchID, teams });
    if (n.goalCount > p.goalCount) {
      for (const g of (m.goals||[]).slice(p.goalCount)) {
        const ico = g.isOwnGoal ? '🔴' : g.isPenalty ? '🎯' : '⚽';
        const typ = g.isOwnGoal ? 'Eigentor' : g.isPenalty ? 'Elfmeter' : 'Tor';
        events.push({ type: 'tor', title: t1 + ' vs ' + t2, body: ico + ' Tor! ' + n.g1 + ':' + n.g2 + " (" + g.matchMinute + "')" + leagueLabel + '\n' + (g.goalGetterName||'Unbekannt') + ' · ' + typ, matchId: m.matchID, teams });
      }
    }
    if (!p.finished && n.finished)
      events.push({ type: 'abpfiff', title: t1 + ' vs ' + t2, body: '🏁 Abpfiff · ' + n.g1 + ':' + n.g2 + leagueLabel + '\nDas Spiel ist zu Ende', matchId: m.matchID, teams });
  }
  if (events.length > 0) console.log('[poll] ' + leagueId.toUpperCase() + ' ' + events.length + ' Events');
  for (const e of events) await sendToFiltered(e, e.teams);
  snapshots[leagueId] = newSnap;
}

async function poll() {
  if (!isMatchWindow()) { console.log('[poll] Außerhalb Spielzeit'); return; }
  try {
    await Promise.allSettled(LEAGUES.map(id => pollLeague(id).catch(err => console.error('[poll] ' + id + ' Fehler:', err.message))));
  } catch (err) { console.error('[poll] Fehler:', err.message); }
}

// ── Express ──
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/', (req, res) => res.json({ ok: true, service: 'BL TICK-R' }));

app.post('/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint) return res.status(400).json({ error: 'Invalid' });
  const key = addSub(sub);
  console.log('[api] Neue Subscription: ' + key + ' · Favoriten: ' + (subscriptions[key].favorites.length || 'alle'));
  res.status(201).json({ ok: true, key });
});

async function handlePushTest(req, res) {
  const count = Object.keys(subscriptions).length;
  if (count === 0) return res.json({ ok: false, subscribers: 0, error: 'Keine Subscriber' });
  const filterKey = req.query.key || req.body?.key;
  const keys = filterKey
    ? (subscriptions[filterKey] ? [filterKey] : [])
    : Object.keys(subscriptions);
  if (filterKey && keys.length === 0)
    return res.status(404).json({ ok: false, error: 'Subscriber nicht gefunden' });
  const results = await Promise.allSettled(
    keys.map(async key => {
      const { subscription } = subscriptions[key];
      try {
        await webpush.sendNotification(subscription, JSON.stringify({
          type: 'tor', title: 'Push-Test vs BL Tick-R',
          body: "⚽ Tor! 2:1 (90+2')\nMüller · Push-Pipeline funktioniert ✓", matchId: 'test',
        }));
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404 ||
            (err.statusCode === 400 && err.body?.includes('VapidPkHashMismatch'))) {
          delete subscriptions[key];
          saveSubs();
          console.log('[push-test] Subscription entfernt:', key);
        }
        throw err;
      }
      return key;
    })
  );
  const ok = results.filter(r => r.status === 'fulfilled').length;
  const errs = results.filter(r => r.status === 'rejected').map(r => {
    const e = r.reason;
    return { status: e?.statusCode, message: e?.message, body: e?.body };
  });
  console.log('[push-test] OK:', ok, 'Fehler:', JSON.stringify(errs));
  res.json({ ok: ok > 0, subscribers: count, sent: ok, errors: errs });
}

app.get('/push-test', handlePushTest);
app.post('/push-test', handlePushTest);

app.get('/health', (req, res) => {
  res.json({ ok: true, subscribers: Object.keys(subscriptions).length, window: isMatchWindow() });
});

// ── Start ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('[server] BL TICK-R läuft auf Port ' + PORT);
  loadSubs();
  setTimeout(() => { poll(); setInterval(poll, 60_000); }, 10_000);
});
