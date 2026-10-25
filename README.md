# Mediathek MRSS – Cloudflare Worker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dbiesecke/cf-mediathek-rss)

> **Hinweis:** Der One-Click-Deploy-Button benötigt ein öffentlich zugängliches Repository. Solange dieses Repository privat ist, kann Cloudflare die Vorlage darüber nicht importieren. Für private Repositories `npx wrangler deploy` verwenden.

Version **1.3.0**. Aggregiert öffentliche MediathekViewWeb-RSS-Suchfeeds für **Emby** und **MediaStationX**.

- 12 Provider, frei kombinierbar; kanonische Duplikatprüfung über Serien-/Episodenmetadaten, normalisierte Titel und Medien-URLs.
- Filter für ausdrücklich gekennzeichnete OV/OmU-, Hörfassungs-, AD-, UT-/SDH- und Gebärdensprachversionen.
- Bevorzugung regulärer Quellen mit abspielbarer URL und verfügbaren Metadaten bei Dubletten.
- MRSS (`media:content` bei direkter Medienadresse, `media:thumbnail` wenn vorhanden).
- Emby-Metadaten mit `SxxExx`, Staffel/Episode **nur wenn erkennbar**.
- STRM-Dateinamenvorschläge mit bereinigten Dateinamen und Season-Verzeichnissen.
- Sprach-Metadaten inklusive Herkunft (`source`/`assumed`); **keine Überprüfung deutscher Audiospuren**.
- Bestehende andere Worker werden nicht verändert.

## Lokal und Deployment

```bash
npx wrangler dev
npx wrangler deploy
```

Beispiel-URLs **nach Deployment**:

```bash
curl 'https://cf-mediathek-mrss.bcgd1.workers.dev/mrss/arte?naming=emby&limit=50'
curl 'https://cf-mediathek-mrss.bcgd1.workers.dev/mrss?providers=arte,3sat,ndr&limit=100'
```

Duplikate werden **vor** dem `limit` entfernt. Zur Diagnose liefern Antworten die Header
`x-filtered-variants`, `x-removed-duplicates` und `x-feed-items`.

Beispiel: `Film (Audiodeskription)` wird entfernt, `Film` bleibt. Neue Ausgaben
von regelmäßig erscheinenden Nachrichtensendungen bleiben anhand ihrer Sendezeit getrennt.
Der Filter ist bewusst konservativ und erkennt nur gekennzeichnete Versionen;
fehlende Quellenmetadaten können zu nicht erkannten Varianten führen.

Weitere Details und Beispiele: [docs/usage.md](docs/usage.md). API: [openapi.yaml](openapi.yaml) (OpenAPI 3.1.1).
## Suche und Filter

- `/`: HTML-Suchformular.
- `/search`: JSON-Resultate oder `?format=html` für HTML.
- `/mrss`: Filter und Volltextsuche direkt als MRSS.

Beispiel: `/mrss?providers=arte,ndr&q=Geschichte&minDuration=1200&sort=date&limit=100`.

Weitere Details in [docs/usage.md](docs/usage.md).
