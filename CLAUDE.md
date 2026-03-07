# BL TICK-R — CLAUDE.md

Bundesliga Live-Ticker als PWA im "BROADCAST" Design.

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

## Design-System ("BROADCAST")

Inspiriert von TV-Broadcast-Ästhetik (Sky Sports, OneFootball). Dark Theme, warme Kontraste.

```css
/* Hintergründe */
--bg:    #0a0a0f   /* fast schwarz, minimal warm */
--s1:    #111118   /* Cards */
--s2:    #1a1a26   /* Card-Header, Panel-Elemente */
--s3:    #222235   /* Tiefste Ebene */
--border:  #1e1e30
--border2: #2a2a45

/* Akzente */
--acc:    #f5c518   /* IMDb-Gold (Score, Positions-Highlights) */
--acc2:   #00d4ff   /* Blau-Cyan (CL-Zone, Links) */
--green:  #00e676   /* Gewonnen */
--orange: #ffb03c   /* EL-Zone, Relegation */
--red:    #ff1744   /* Niederlage, Abstieg */
--live:   #ff3d00   /* Echter Live-Orange (TV-Stil) */
--purple: #c084fc   /* Relegations-Play-off */
```

### Typografie

| Schrift | Verwendung |
|---|---|
| Bebas Neue | Scores, Positionen, Headlines |
| DM Mono | Spielzeiten, Minuten, Badges |
| DM Sans 600 | Teamnamen, UI-Text |

### Card-Layout (BROADCAST)

```
┌─────────────────────────────────┐
│ ⬤ LIVE  (volle rote Leiste)     │  ← nur bei Live-Spielen
├─────────────────────────────────┤
│ [STATUS-CHIP]  📍 Stadion       │  ← c-head
├──────────────┬──────────────────┤
│ 🔵 FC Bayern │  Borussia BVB 🟡 │  ← c-body (1fr 1fr)
│ FC Bayern    │    Dortmund      │    Logos 48px, Namen 1rem
├─────────────────────────────────┤
│         2 : 1                   │  ← c-score (volle Breite)
│         Endstand                │    Bebas Neue 2.8rem
└─────────────────────────────────┘
```

Live-Cards haben orangefarbene Border (`--live`) und Gradient-Overlay im Score-Bereich.

### Tabelle

- S/U/N (Siege/Unentschieden/Niederlagen) in Grün/Grau/Rot
- Punkte: Bebas Neue 1.15rem in `--acc`
- Zonen-Linien links: CL = `--acc2`, EL = `--orange`, Abstieg = `--red`

Fonts: Bebas Neue (Headlines), DM Mono (Zahlen/Code), DM Sans (Text)

## Versionierung

Die Versionsnummer wird in `server/package.json` gepflegt und bei jeder Änderung am Backend hochgezogen:
- **Patch** (z.B. `1.2.6 → 1.2.7`): Bugfixes, kleine Anpassungen
- **Minor** (z.B. `1.2.x → 1.3.0`): Neue Features, Optimierungen
- **Major** (z.B. `1.x.x → 2.0.0`): Breaking Changes, Architekturwechsel

Aktuelle Version: `1.6.2`

## Hinweise

- Das Frontend liegt als `index (1).html` — Leerzeichen im Dateinamen beachten
- Keine Tests vorhanden
- Keine Build-Pipeline — Änderungen direkt in den Dateien
- Subscriptions-Datei darf nicht ins Git (enthält Endpoint-URLs)
