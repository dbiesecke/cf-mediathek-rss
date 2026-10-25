# Nutzung: cf-mediathek-mrss

Version **1.2.0** – Emby-/MediaStationX-MRSS aus öffentlichen MediathekViewWeb-RSS-Suchfeeds.

## Routen

| Route | Funktion |
|---|---|
| `GET /health` | Status, Version, Providerzahl |
| `GET /providers` | Namen und Quellfilter der 12 Provider |
| `GET /mrss` | Alle Provider zusammenführen, Duplikate entfernen |
| `GET /mrss/arte` | Nur ARTE |
| `GET /mrss?providers=arte,3sat,ndr&limit=100` | Auswahl, begrenzt auf 100 Einträge |
| `GET /mrss/arte?naming=original` | Originaltitel statt umbenannter Emby-Titel |

## Filter für Original- und barrierefreie Sonderfassungen

**Standardmäßig und fest aktiviert:** Diese Fassungen werden **nicht** in MRSS exportiert:

| Version | Erkennungsbeispiele |
|---|---|
| Originalfassung | `(OV)`, `- OV`, `(OmU)`, `Originalfassung`, `Originalversion`, `Originalton` als Editionszusatz |
| Audiodeskription | `(AD)`, `Audiodeskription`, `Audiodescription`, `Hörfassung`, `Hörfilm` |
| Hörgeschädigte / Untertitel | `(UT)`, `(SDH)`, `mit Untertiteln`, `Untertitel für Hörgeschädigte` |
| Gebärdensprache | `(DGS)`, `Gebärdensprache`, Metadatum `signlanguage=true` |

Bei booleschen Quellfeldern wie `audioversion=true` und `signlanguage=true` wird
auch ohne Titelzusatz gefiltert. Nicht jeder Text über Audiodeskription oder
Originalton ist selbst eine Sonderfassung; die Prüfung konzentriert sich auf
**Editionskennzeichnungen** im Titel und auf Quellmetadaten. Sie wertet **keine
Audiospur** aus und kann unmarkierte Varianten nicht erkennen.

### Mehrstufige Duplikatprüfung

- Explizit erkannte `Serienname + Staffel + Episode` bilden eine Identität.
- Ansonsten werden Titel normalisiert; optionale Zusätze wie `(HD)` werden ignoriert.
- Zusätzlich werden identische Medien-/Beitragslinks verglichen; Trackingparameter werden ignoriert.
- Bei Dubletten gewinnt bevorzugt der Eintrag mit direkter Medienadresse,
  Thumbnail und aussagekräftigerer Beschreibung.
- Wiederkehrende Formate wie `Tagesschau` werden nach Datum **und Stunde**
  unterschieden, damit neue Sendungen nicht versehentlich verschwinden.
- Die Bereinigung erfolgt **vor** Anwendung von `limit`.

Diagnose ohne Änderung des Feeds:

```bash
curl -sD - -o /dev/null 'https://cf-mediathek-mrss.bcgd1.workers.dev/mrss?providers=arte,3sat&limit=100'
```

Dabei zeigen `x-filtered-variants` und `x-removed-duplicates` die getrennten
Filterzahlen und `x-feed-items` die tatsächlich ausgegebenen Einträge an.

Die vollständige API-Beschreibung liegt unter **[openapi.yaml](../openapi.yaml)** (OpenAPI 3.1.1). Die darin angegebene Worker-Adresse ist **geplant und noch nicht als Deployment verifiziert**.

## Episodenerkennung

1. Bevorzugt explizite Quellfelder wie `seasonNumber`, `episodeNumber`, `itunes:season`, `itunes:episode`, `tv:season`, `tv:episode`.
2. Erkennt `S02E03`, `Staffel 2 Folge 3` und `2x03` im Titel beziehungsweise am Beginn der Beschreibung.
3. Erkennt auch `Folge 3`, **ohne dabei eine Staffel zu erfinden**.
4. Verwendet Seriennamen aus expliziten `series`/`seriesName`-Feldern. Bei Episoden kann die RSS-Kategorie (`Thema`) genutzt werden, sofern nicht generisch.
5. Gibt den Format-Titel nur dann als `SxxExx` aus, wenn Staffel **und** Episode bekannt sind. Nicht erkannte Angaben bleiben unbekannt.

### Beispiel: vollständige Nummerierung

Originaltitel: `Beispielserie - S02E03 - Die Suche`, Quellkategorie: `Beispielserie`.

- MRSS-`<title>`: `Beispielserie - S02E03 - Die Suche`
- `emby:filename`: `Beispielserie - S02E03 - Die Suche.strm`
- `emby:relativePath`: `Beispielserie/Season 02/Beispielserie - S02E03 - Die Suche.strm`
- `emby:series`: `Beispielserie`; `emby:season`: `2`; `emby:episode`: `3`

### Beispiel: Folge ohne Staffel

Originaltitel: `Folge 7: Unterwegs`, RSS-Kategorie: `Expeditionen`.

- MRSS-`<title>`: `Expeditionen - Folge 7 - Folge 7: Unterwegs`
- **Kein** `S01E07`, da eine Staffelnummer nicht belegt ist.
- Kein Verzeichnis `Season 01`.

### Beispiel: Dokumentation ohne Episodennummer

Originaltitel: `Wälder der Zukunft`

- `emby:filename`: `Wälder der Zukunft.strm`
- Keine Serien-/Staffel-/Episodenangaben werden erfunden.

## Sprachkennzeichnung

`dc:language` ist bevorzugt die im RSS gelieferte Sprache, andernfalls wird bei diesen deutschsprachig ausgerichteten Suchfeeds **`de` angenommen**. Mit `emby:languageSource` (`source` oder `assumed`) ist die Herkunft transparent. `emby:audioVerified` bleibt `false`: **Die Sprache der tatsächlichen Audiospur wird nicht überprüft.** Für einen echten `German/Ger`-Audiofilter sind streamseitige Track-Metadaten erforderlich.

## Abspielbarkeit und Export

`media:content` und `enclosure` entstehen nur für verfügbare direkte MP4-/WebM-/HLS-/DASH-Adressen. Die Felder `emby:filename` und `emby:relativePath` sind Vorschläge für einen externen `.strm`-Export; sie erzeugen **keine Dateien**. Wenn keine Mediendatei bereitgestellt wird, bleibt ein Item als Metadateneintrag im Feed. `x-failed-sources` benennt Quellen, deren RSS-Abruf gescheitert ist. Keine DRM-Umgehung und kein Stream-Proxy.

## Deployment

```bash
npx wrangler deploy
curl https://cf-mediathek-mrss.bcgd1.workers.dev/health
curl 'https://cf-mediathek-mrss.bcgd1.workers.dev/mrss?providers=arte,3sat,ndr&limit=100&naming=emby'
```

Diese Adressen erst **nach dem Deployment** verwenden. Beim Export `.strm`-Datei mit dem Inhalt der tatsächlichen `media:content`-URL erstellen; Webseiten-Links nicht als Media-Streams deklarieren.