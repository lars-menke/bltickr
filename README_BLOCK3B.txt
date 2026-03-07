BLTICKR PR 3 BLOCK 1B

Diese ZIP enthält:
- src/state.js  (ersetzen)
- src/bridge.js (neu)

Zusätzliche manuelle Änderungen in index.html:

1) Vor dem bestehenden großen <script> einfügen:
<script type="module" src="./src/bridge.js"></script>

2) Diese Konstanten ersetzen:
const API = window.BLTICKR.APP_CONFIG.openLigaApi;
const SEASON = window.BLTICKR.APP_CONFIG.season;
const SERVER_URL = window.BLTICKR.APP_CONFIG.serverUrl;
let curLeague = window.BLTICKR.loadLeague();

3) Favoriten initialisieren mit:
let favorites = new Set(window.BLTICKR.loadFavorites());

4) Re-Subscribe-Block ersetzen:
window.BLTICKR.subscribePush(existingSub.toJSON(), [...favorites])
  .then(d => { if (d?.key) localStorage.setItem('bl_push_key', d.key); })
  .catch(() => {});

Wichtig:
NICHT das große Hauptscript auf type="module" umstellen.
Die Seite nutzt weiterhin Inline-Handler im HTML.
