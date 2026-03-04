# BL TICK-R — CLAUDE.md

Bundesliga Live-Ticker als PWA im "Lambdark" Design.

## Projektstruktur

```
bltickr/
├── index (1).html      # Frontend — komplette SPA (inline CSS + JS, ~64KB)
├── manifest.json       # PWA-Manifest
├── sw.js               # Service Worker (Push-Notifications)
├── icon-192.svg        # App-Icon
├── apple-touch-icon.png
└── server/
    ├── server.js       # Node.js Backend (Express + web-push)
    ├── package.json    # ESM, Node >=18
    ├── Dockerfile      # node:20-alpine
    ├── fly.toml        # Fly.io Deployment (Region: fra, 256MB)
    └── data/
        └── subscriptions.json  # Persistierte Push-Subscriptions (gitignore!)
```

## Architektur

**Frontend** (`index (1).html`)
- Reines HTML/CSS/JS, keine Build-Tools, kein Framework
- Ruft direkt die OpenLigaDB-API ab: `https://api.openligadb.de`
- Zeigt BL1 + BL2 Spieltage, Tabellen, Tore
- Push-Subscription über eigenen Backend-Server

**Backend** (`server/server.js`)
- Express-Server, ESM (`"type": "module"`)
- Pollt alle 60s die OpenLigaDB wenn Spielfenster aktiv
- Sendet Web-Push bei Anpfiff, Toren, Abpfiff
- Favoriten-Filter: Push nur für ausgewählte Teams
- Subscriptions werden in `server/data/subscriptions.json` gespeichert

**Deployment**
- Backend: Fly.io (`bltickr`, Region Frankfurt)
- Frontend: GitHub Pages (VAPID Public Key als Meta-Tag eingebettet)

## API-Endpoints (Backend)

| Endpoint | Methode | Funktion |
|---|---|---|
| `/` | GET | Health-Check |
| `/health` | GET | Status + Subscriber-Anzahl + Spielfenster |
| `/subscribe` | POST | Push-Subscription registrieren |
| `/push-test` | GET/POST | Test-Push an alle Subscriber |

## Umgebungsvariablen (Fly.io Secrets)

```
VAPID_PUBLIC_KEY    # VAPID Public Key (auch im Frontend als Meta-Tag)
VAPID_PRIVATE_KEY   # VAPID Private Key
VAPID_SUBJECT       # mailto: oder https: URL
PORT                # (optional, default: 3000)
```

## Spielfenster (UTC)

Polling nur in diesen Zeitfenstern aktiv:
- Freitag 13–23 Uhr
- Samstag 13–23 Uhr
- Sonntag 13–22 Uhr
- Montag 16–23 Uhr (BL2)

## Design-System ("Lambdark")

```css
--bg: #08080e       /* Hintergrund */
--acc: #e4ff3c      /* Akzent Gelb */
--acc2: #3cffe0     /* Akzent Cyan */
--green: #3cff8f
--orange: #ffb03c
--red: #ff4d6a
--purple: #c084fc
```
Fonts: Bebas Neue (Headlines), DM Mono (Zahlen/Code), DM Sans (Text)

## Versionierung

Die Versionsnummer wird in `server/package.json` gepflegt und bei jeder Änderung am Backend hochgezogen:
- **Patch** (z.B. `1.2.6 → 1.2.7`): Bugfixes, kleine Anpassungen
- **Minor** (z.B. `1.2.x → 1.3.0`): Neue Features, Optimierungen
- **Major** (z.B. `1.x.x → 2.0.0`): Breaking Changes, Architekturwechsel

Aktuelle Version: `1.3.0`

## Hinweise

- Das Frontend liegt als `index (1).html` — Leerzeichen im Dateinamen beachten
- Keine Tests vorhanden
- Keine Build-Pipeline — Änderungen direkt in den Dateien
- Subscriptions-Datei darf nicht ins Git (enthält Endpoint-URLs)
