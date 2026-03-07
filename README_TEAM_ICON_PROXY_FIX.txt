BLTICKR TEAM ICON PROXY FIX

Diese ZIP enthaelt:
- server/routes/teamIconProxy.js   -> neu anlegen
- server/server.js                 -> ersetzen
- src/teamIcons.js                 -> ersetzen

Ziel:
Team-Logos nicht mehr direkt im Browser vom Fremdhost laden,
sondern ueber den eigenen Backend-Proxy unter /team-icon/:league/:season/:teamInfoId.

Warum das hilft:
- kein CORB fuer direkte Fremdantworten im Browser
- Backend prueft, ob die Upstream-Antwort wirklich ein Bild ist
- Frontend nutzt fuer bekannte Teams nur noch die eigene Proxy-URL

Nach dem Upload:
1) committen
2) pushen
3) Fly-Deploy abwarten
4) Seite hart neu laden
