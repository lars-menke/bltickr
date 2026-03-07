import express from 'express';
import { adminAuth } from '../utils/adminAuth.js';

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BL TICK-R · Admin</title>
<style>
  :root {
    --bg: #08080e; --surface: #12121c; --border: #1e1e2e;
    --acc: #e4ff3c; --red: #ff4d6a; --text: #c9ccd6; --muted: #555570;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'DM Mono', monospace;
         font-size: 13px; padding: 24px; max-width: 860px; margin: 0 auto; }
  h1 { font-family: 'Bebas Neue', sans-serif; font-size: 2rem; color: var(--acc);
       letter-spacing: .05em; margin-bottom: 20px; }
  .row { display: flex; gap: 8px; margin-bottom: 20px; }
  input { flex: 1; background: var(--surface); border: 1px solid var(--border);
          color: var(--text); padding: 8px 12px; border-radius: 4px; font: inherit; }
  input:focus { outline: 1px solid var(--acc); }
  button { background: var(--acc); color: #08080e; border: none; padding: 8px 16px;
           border-radius: 4px; font: inherit; font-weight: 700; cursor: pointer; }
  button:hover { opacity: .85; }
  button.danger { background: var(--red); color: #fff; }
  #status { margin-bottom: 16px; color: var(--muted); min-height: 18px; }
  #status.err { color: var(--red); }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; color: var(--muted); padding: 6px 10px;
       border-bottom: 1px solid var(--border); font-weight: 400; }
  td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  td.key { font-size: 11px; color: var(--muted); word-break: break-all; max-width: 200px; }
  td.ep  { font-size: 11px; word-break: break-all; }
  td.fav { color: var(--acc); }
  .del { background: transparent; color: var(--red); padding: 2px 8px;
         border: 1px solid var(--red); border-radius: 3px; font-size: 11px; }
  .del:hover { background: var(--red); color: #fff; opacity: 1; }
  #count { margin-bottom: 12px; color: var(--muted); }
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>
<h1>BL TICK-R · Admin</h1>
<div class="row">
  <input id="secret" type="password" placeholder="ADMIN_SECRET eingeben …" />
  <button onclick="load()">Laden</button>
</div>
<div id="status"></div>
<div id="count"></div>
<table id="tbl" style="display:none">
  <thead><tr>
    <th>Key (SHA-256)</th>
    <th>Endpoint</th>
    <th>Favoriten</th>
    <th>Seit</th>
    <th></th>
  </tr></thead>
  <tbody id="tbody"></tbody>
</table>
<script>
  const secret = () => document.getElementById('secret').value.trim();
  const status = (msg, err) => {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.className = err ? 'err' : '';
  };

  async function load() {
    status('Lade …');
    try {
      const res = await fetch('/admin/subscriptions', {
        headers: { 'x-admin-secret': secret() }
      });
      if (!res.ok) { status(res.status === 401 ? 'Falsches Secret.' : 'Fehler ' + res.status, true); return; }
      const { count, subscriptions } = await res.json();
      render(count, subscriptions);
      status('');
    } catch (e) { status('Netzwerkfehler: ' + e.message, true); }
  }

  function render(count, subs) {
    document.getElementById('count').textContent = count + ' Subscriber';
    const tbody = document.getElementById('tbody');
    tbody.innerHTML = '';
    for (const s of subs) {
      const tr = document.createElement('tr');
      tr.id = 'row-' + s.key;
      tr.innerHTML =
        '<td class="key">' + s.key + '</td>' +
        '<td class="ep">' + s.endpoint + '</td>' +
        '<td class="fav">' + (s.favorites?.length ? s.favorites.join(', ') : '–') + '</td>' +
        '<td>' + new Date(s.createdAt).toLocaleDateString('de') + '</td>' +
        '<td><button class="del" onclick="del(\\''+s.key+'\\')">Del</button></td>';
      tbody.appendChild(tr);
    }
    document.getElementById('tbl').style.display = count ? '' : 'none';
  }

  async function del(key) {
    if (!confirm('Subscription löschen?')) return;
    try {
      const res = await fetch('/admin/subscriptions/' + key, {
        method: 'DELETE',
        headers: { 'x-admin-secret': secret() }
      });
      if (!res.ok) { status('Löschen fehlgeschlagen: ' + res.status, true); return; }
      document.getElementById('row-' + key)?.remove();
      const cur = parseInt(document.getElementById('count').textContent);
      document.getElementById('count').textContent = (cur - 1) + ' Subscriber';
    } catch (e) { status('Fehler: ' + e.message, true); }
  }

  document.getElementById('secret').addEventListener('keydown', e => {
    if (e.key === 'Enter') load();
    // Secret aus localStorage wiederherstellen
  });
  const saved = localStorage.getItem('bl_admin_secret');
  if (saved) { document.getElementById('secret').value = saved; }
  document.getElementById('secret').addEventListener('change', () => {
    localStorage.setItem('bl_admin_secret', document.getElementById('secret').value);
  });
</script>
</body>
</html>`;

export function createAdminRouter(store) {
  const router = express.Router();

  router.get('/admin', (req, res) => {
    res.type('html').send(ADMIN_HTML);
  });

  router.get('/admin/subscriptions', (req, res) => {
    if (!adminAuth(req, res)) return;

    res.json({
      count: store.count(),
      subscriptions: store.listForAdmin(),
    });
  });

  router.delete('/admin/subscriptions/:key', async (req, res) => {
    if (!adminAuth(req, res)) return;

    const { key } = req.params;

    if (!await store.remove(key)) {
      return res.status(404).json({ error: 'Nicht gefunden' });
    }

    console.log('[admin] Subscription gelöscht:', key);
    res.json({ ok: true, key });
  });

  return router;
}
