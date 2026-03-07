BLTICKR PROXY HOTFIX

Diese ZIP enthaelt genau die zwei Ersatzdateien, die noch gefehlt haben:

- src/bridge.js     -> ersetzen
- server/server.js  -> ersetzen

Warum:
- bridge.js exportiert die Team-Icon-Funktionen bisher nicht sauber nach window.BLTICKR
- server.js bindet die Proxy-Route /team-icon/... bisher nicht ein

Nach dem Upload:
1) committen
2) pushen
3) Fly-Deploy abwarten
4) Hard Reload im Browser
5) testweise aufrufen:
   https://bltickr.fly.dev/team-icon/bl2/2025/DEINE_TEAMINFOID
