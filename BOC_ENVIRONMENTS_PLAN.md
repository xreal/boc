# BOC: Entwicklungsumgebungen für Worktree- und Rift-Sessions

Stand: 2026-09-06. Status: Schritt A abgeschlossen und Builder-Scope festgelegt; gezielte Korrektheits- und Plattformprüfungen begleiten beziehungsweise folgen der Umsetzung.

Dieses Dokument ist ein eigenständiger, versionierter Arbeitsplan. Es implementiert keine Funktion und erteilt keine Freigabe, bestehende Umgebungen zu verändern. Statische Befunde sind von historischen Messwerten, noch offenen Laufzeitprüfungen und Produktvorschlägen getrennt.

## 1. Ziel und Entscheidungsstand

Aus einer Session in einem isolierten Checkout soll sich mit einer klaren Aktion die zugehörige Entwicklungsumgebung einrichten lassen: Dependencies bereitstellen, benötigte App-Container starten und die eigene Host-URL öffnen. Große Datenbanken dürfen gemeinsam genutzt werden. Einrichtung und Bedienung müssen schnell sein und sich selbstverständlich in BOC einfügen.

| Festlegung                                                                                   | Status                                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Worktrees und Rift-Checkouts unterstützen; Setup nur dort anbieten beziehungsweise freigeben | Anforderung                                            |
| Erstklassige UI/UX, Performance und minimaler Upstream-Diff                                  | Anforderung                                            |
| Bestehendes devenv und Emdash/Bergdev als Wissensquelle nutzen                               | Anforderung                                            |
| Local-Environments-Dashboard ausklammern                                                     | Anforderung                                            |
| Offene Fragen ausdrücklich dokumentieren; Prüfung auf vollständigem Setup fortsetzen         | Anforderung                                            |
| Umgebung gehört zum Checkout, mehrere Sessions teilen ihre Bedienung                         | Architekturvorschlag                                   |
| Ein Hauptbutton mit Aktionsmenü rechts oben, ergänzend Session-Kontextmenü                   | UX-Vorschlag                                           |
| Zunächst manuelle Aktionen auf einem lokalen BOC-Backend                                     | MVP-Vorschlag; Plattformumfang noch prüfen             |
| BOC steuert Ausführung und Darstellung; devenv besitzt Docker-/Installationslogik            | Architekturvorschlag                                   |
| Key-adressierte, private Dependency-Snapshots mit Copy-on-write, wo verfügbar                | Begründete Empfehlung aus Schritt A; nicht beschlossen |
| MVP verwendet den festen devenv-Vertrag statt beliebiger Projekt-Scripts                     | Bestätigte Entscheidung 2026-09-06                     |
| MVP bietet Setup, Start, Stop, URL und validiertes Stack-Entfernen                           | Bestätigte Entscheidung 2026-09-06                     |
| Datenbanken, Redis/PHP-Sessions und RabbitMQ dürfen im MVP geteilt bleiben                   | Bestätigte Entscheidung 2026-09-06; klar kennzeichnen  |
| MVP unterstützt macOS und Linux; Windows/WSL bleibt außerhalb                                | Bestätigte Entscheidung 2026-09-06                     |
| Lokale Cache-Löschung ist zulässig; Korrektheit geht vor einem vermiedenen Rebuild           | Bestätigte Entscheidung 2026-09-06                     |

Nicht Teil des ersten Schritts: Dashboard, eigener Paketmanager, pnpm-Migration, Remote-/SSH-Ausführung, allgemeines Plugin-System, automatische Datenbankkopien, neue Session-Core-Domäne oder unbedingtes automatisches Setup/Teardown.

## 2. Gesicherte Recherche

Die ursprüngliche BOC-/Emdash-Recherche wurde in Schritt A gegen die aktuellen lokalen Quellen geprüft. BOC stand bei `5ca616b9361a` auf `boc-beta`, Emdash bei `ca2d1c1737a4` und devenv bei `c3575c0d2cff` auf dessen Worktree-PoC-Zweig. Eine vorhandene, sachfremde Emdash-Arbeitsänderung blieb unangetastet. Das aktive `devenv`-Kommando löst auf `devenv.sh` dieses devenv-Checkouts auf.

Die erste Quellenprüfung führte keine Setup-, Installations-, Start-, Stop-, Migrations-, Prune- oder Cache-Clear-Kommandos aus. Sie umfasste Quellen, Shell-Syntax, anonymisierte generierte Metadaten, historische Benchmark-Dateien sowie rein lesende Docker-/Runtime-Abfragen. Anschließend wurde lokale Cache-Löschung ausdrücklich freigegeben und das dafür vorgesehene Disposable-Benchmark-Script verwendet; dessen aktuelle Ergebnisse stehen in Abschnitt 6.

Alle Quellen sind repository-relativ: BOC-Pfade beziehen sich auf dieses Repository, `devenv:` auf den devenv-Checkout und `emdash:` auf den Emdash-Checkout; `D/` steht weiterhin für `apps/emdash-desktop/`. Alte lokale BOC-Unterlagen liegen unter `tmp/` und werden nicht automatisch auf einen anderen Rechner übertragen. Wenn vorhanden: zuerst `tmp/BOC_HANDOVER.md`, dann `tmp/BOC_EXTENSIONS_JIRA_PLAN.md` und den Rift-Plan lesen. Fehlen sie, für diese neue Funktion den aktuellen Code und dieses Dokument verwenden; die abgeschlossenen Jira-Arbeitspakete nicht erneut ausführen.

### BOC: vorhandene Grundlagen und Grenzen

| Quelle                                                                                                                                                                 | Befund und Konsequenz                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Session-Header](packages/app/src/session/header/session-header.tsx) und [rechter Slot](packages/app/src/shell/titlebar/right-slot.tsx)                                | Rechts oben existiert ein Mount. BOC-Aktionen in die bestehende Belegung einfügen; eine zweite konkurrierende `TitlebarRight`-Registrierung würde die bisherige verdrängen.                                                        |
| [Session-Tabs](packages/app/src/shell/titlebar/tab-nav.tsx)                                                                                                            | Kontextmenü für horizontale und vertikale Tabs vorhanden; keine allgemeine Environment-Menü-Registrierung. Ein kleiner additiver BOC-Mount genügt voraussichtlich.                                                                 |
| [Projekt-Dialog](packages/app/src/settings/workspaces/project-dialog.tsx)                                                                                              | Scripts-Tab und BOC-Worktree-Einstellungen vorhanden. `ProjectSettingsExtensions` zeigt MCPs/Plugins/Skills und ist kein beliebiger Settings-Slot.                                                                                 |
| [Worktree-Service](packages/core/src/worktree.ts)                                                                                                                      | Registry für Strategien, registrierte Verzeichnisse und Startup-Kommando vorhanden. Das Kommando läuft innerhalb von `create`, wartet auf Ende und verlangt Erfolg. Für nachträgliches manuelles Setup ungeeignet.                 |
| [Worktree-Schema](packages/schema/src/worktree.ts)                                                                                                                     | Registrierte Verzeichnisse enthalten optional die Strategie. Isolation anhand tatsächlicher Zuordnung prüfen, nicht anhand von Branch-Namen oder `.git`-Dateiform.                                                                 |
| [Rift-Backend](packages/boc/src/worktrees/server/backend.ts)                                                                                                           | Sauberes Git-Template, anschließend `git clean -fdx -e .rift`, dann Rift mit `--copy-all`. Ignorierte Dependencies im Template werden derzeit entfernt. Rift liefert daher nicht automatisch vorbereitete `node_modules`/`vendor`. |
| [PTY-Service](packages/core/src/pty.ts)                                                                                                                                | Ausführung mit Kommando, Argumenten, Arbeitsverzeichnis und Env sowie Ausgabe, Exit-Status und begrenzter Aufbewahrung vorhanden. Wiederverwendbar, aber Lebensdauer der Location und Wiederanbindung prüfen.                      |
| [Terminal-Kontext](packages/app/src/session/terminal/context.tsx)                                                                                                      | Beendete PTYs werden aus der normalen Terminal-Liste entfernt. Die Environment-Ausgabe braucht eine eigene, nach Ende erreichbare Darstellung.                                                                                     |
| [BOC-Server-Anbindung](packages/server/src/boc/worktree.ts), [Server-Komposition](packages/server/src/routes.ts), [Protocol-Komposition](packages/protocol/src/api.ts) | Muster für BOC-eigene Handler, Capability und additive Registrierung vorhanden.                                                                                                                                                    |
| [Worktree-Einstellungen](packages/boc/src/worktrees/desktop/store.ts)                                                                                                  | Eigenes BOC-Storage mit Server-/Projektzuordnung als Muster vorhanden. Desktop-Präferenzspeicherung entscheidet noch nicht über die Zuständigkeit für die neue serverseitige Ausführung.                                           |

### Emdash: übernehmen als Konzept

| Quelle im Emdash-Repository                                                                      | Relevanz                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `D/src/main/core/terminals/runLifecycleScript.ts`                                                | Manuelle Aktion löst effektive Workspace-Konfiguration auf und delegiert.                                                                                                                                                            |
| `D/src/main/core/terminals/lifecycle-script-coordinator.ts`                                      | Statusereignisse, Schutz gegen doppelte gleichzeitige Ausführung derselben Phase, Fehlerpolitik.                                                                                                                                     |
| `D/src/main/core/workspaces/workspace-lifecycle-service.ts`                                      | Eigene Lifecycle-Terminals, Exit-Status, Output-Tail und Wiederanbindung.                                                                                                                                                            |
| `D/src/main/core/workspaces/lifecycle-script-input.ts`                                           | Mehrzeilige Scripts lokal als Datei ausführen: Docker/andere interaktive Prozesse können sonst gepufferte Terminaleingaben verschlucken.                                                                                             |
| `D/src/main/core/workspaces/workspace-factory.ts`                                                | Automatisches Setup vor Run; Aktivierung und Teardown am Workspace. Nicht ungeprüft auf BOCs Session-Lebenszyklus übertragen.                                                                                                        |
| `D/src/main/core/workspaces/workspace-env.ts`                                                    | Explizite Kontextvariablen. Der Port-Hash ist kein Nachweis kollisionsfreier Portvergabe.                                                                                                                                            |
| `D/src/main/core/projects/settings/effective-task-settings.ts`                                   | Zusammenführung lokaler Projektkonfiguration mit `.emdash.json`; mögliche Inspiration, keine Pflicht zur Übernahme.                                                                                                                  |
| `D/src/renderer/features/tasks/components/task-environment-button.tsx` und `task-environment.ts` | Setup-, Ausgabe- und URL-Aktion nach Zustand. Nur für lokale isolierte Workspaces eingebunden.                                                                                                                                       |
| `D/src/main/core/local-environments/adapters/devenv-config-reader.ts` und `service.ts`           | Nur URL-Vertrag untersucht: `.devenv/worktrees/*.env`, Zuordnung über `DEVENV_SRC_PATH`, URL aus `STACK_HOST`. Vorhandene Konfiguration bestätigt keine laufende oder erreichbare Anwendung. Dashboard und Inventar nicht portieren. |

Nicht portieren: React-/MobX-Komponenten, Emdash-Workspace-Framework, komplette Terminalverwaltung, Dashboard-Inventar oder generische Provider-Hierarchien.

### Schritt A: bestätigter devenv-Vertrag

#### Setup-Ablauf

`devenv:scripts/worktree-setup.sh:1-10` ist nur der kompatible Einstieg und delegiert per `exec` an `devenv:scripts/rift-task-setup.sh`. Dessen `main` (`:497-668`) führt folgende Kette aus:

1. Checkout und Storefront-Domain validieren; ein `shop/`-Verzeichnis ist Pflicht.
2. Lokalen Artifact-Cache initialisieren, Clone-Verfahren prüfen und alte temporäre Restore-Verzeichnisse bereinigen.
3. `devenv stack set <checkout> <domain>` ausführen, dabei die Best-effort-Synchronisierung fehlender gemeinsamer Konfiguration, Assets und lokaler `.env` in den Checkout versuchen und die erzeugte Stack-Zuordnung laden.
4. Composer-, Node- und Frontend-Schlüssel berechnen; vorhandene Cache-Artefakte parallel vorladen.
5. `devenv composer-install shop`, `devenv frontend-install` und `devenv frontend-build` nur bei fehlendem brauchbarem Ziel beziehungsweise Cache-Miss ausführen.
6. Mit `devenv up shop` im vorbereiteten Normalfall `lb`, `shop`, `ssr`, `api-php81`, `api-php83` und `api-php84` starten. Fehlen gemeinsame Zertifikate, startet devenv zuvor zusätzlich den Generator und schreibt in das gemeinsame Zertifikatsverzeichnis.
7. `devenv clear-cache` ausführen.
8. Bis zu 90 Sekunden die Stack-URL prüfen, anschließend den Artifact-Cache aufräumen und URL sowie Log-Verzeichnis ausgeben.

Argumentfehler enden mit Exit-Code 2; Fehler der verpflichtenden Install-/Build-/Start-/Clear-/Readiness-Schritte werden als ungleich null weitergegeben. Config-Sync, Cache-Prefetch, Cache-Publish und abschließendes Cache-Prune sind dagegen Best-effort und können trotz Warnung beziehungsweise Fehler zu Setup-Exit 0 führen (`devenv:scripts/lib/devenv-worktree-stacks.sh:433-444`, `devenv:scripts/rift-task-setup.sh:296-299,336-346,661-663`). `INT`/`TERM` beendet mit 130, wartet auf Cache-Prefetches und gibt Locks frei, rollt aber bereits erzeugte Konfiguration oder Container nicht zurück (`devenv:scripts/rift-task-setup.sh:127-141,159-191,225-277`). Es gibt nur einen kurzen Stack-Zuordnungs-Lock und Locks pro Cache-Schlüssel, keinen Lock für den gesamten Setup-Lauf. Zwei Setups derselben Umgebung können daher nach `stack set` parallel weiterlaufen. BOC muss Warnungen im Log erreichbar halten und darf Exit 0 nicht als Beleg fehlerfreier Cache-Wartung darstellen.

Setup ist nur dann sicher nicht interaktiv, wenn die gemeinsame Umgebung vorbereitet ist. `devenv up` ruft bei fehlenden generierten Secrets `prepare-shop` auf; dessen Ansible-Vorbereitung kann ein Vault-Passwort abfragen (`devenv:devenv.sh:303-325,457-468,542-565`). Das Backend muss diese Vorbedingung prüfen und darf nicht auf einen unsichtbaren Prompt warten.

#### Dependencies, Mounts und Runtime

| Artefakt / Runtime     | Erzeugung und Ort                                                                                                                                                           | Konsument / bestätigte Version                                                                                                                   | Isolation                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Composer `vendor`      | `shop-composer-ci`, `composer install` in `/app/shop`; kompletter Checkout als Bind-Mount `/app`; Ziel `<checkout>/shop/vendor` (`devenv:docker-compose.yml:1-18,976-1003`) | Composer-Image 2.4 mit PHP 8.3 (`devenv:services/composer/Dockerfile:1-76`); Shop-Runtime im laufenden gemeinsamen Stack meldete PHP 8.3.32      | Checkout-lokal und beschreibbar; Host-UID/GID wird in den Container gereicht     |
| Node `node_modules`    | Node-One-shot, derzeit `npm i`; `<checkout>/shop/source` nach `/var/www/html`; Ziel dort `node_modules` (`devenv:devenv.sh:827-833`, `devenv:docker-compose.yml:797-811`)   | `node:22-slim`, `linux/amd64`; Manifest fordert Node `>=22.15.0` (`devenv:services/node/Dockerfile`, `devenv:src/shop/source/package.json:6-18`) | Checkout-lokal und beschreibbar; auf Apple Silicon emulierte amd64-Runtime       |
| Frontend-Dist          | Derselbe Node-One-shot, `npm run build`; Ziel `<checkout>/shop/source/out/bf/dist`                                                                                          | Webpack, TypeScript und Vite laut `devenv:src/shop/source/package.json:9-18`                                                                     | Checkout-lokal und beschreibbar                                                  |
| Shop                   | Checkout-Verzeichnisse `shop`, `jobs` und `common` als Bind-Mounts (`devenv:docker-compose.yml:813-845`)                                                                    | Ubuntu 22.04 / PHP 8.3; aktuell beobachtet PHP 8.3.32 (`devenv:services/shop/Dockerfile`)                                                        | Container pro Stack, Source und temporärer Shop-Cache pro Checkout               |
| SSR                    | Checkout-Source und `node_modules` read-only, SSR-Source beschreibbar (`devenv:docker-compose.yml:847-879`)                                                                 | `node:22-alpine`, `linux/amd64`; aktuell beobachtet Node 22.23.1 (`devenv:services/node-ssr/Dockerfile`)                                         | Container pro Stack; Dependencies aus demselben Checkout                         |
| Lokales Composer-Paket | Path-Repository `../common/bfnamespace` (`devenv:src/shop/composer.json:14-23`)                                                                                             | Symlink im Composer-Artefakt                                                                                                                     | Drei geprüfte Cache-Artefakte nutzten relative, damit checkout-portable Symlinks |

Es gibt für Composer und npm keinen dedizierten, persistent gemounteten Download-Cache: Composer verwendet `COMPOSER_HOME=/tmp`, und der Node-One-shot mountet nur den Quellbaum. Kalte Artifact-Misses bezahlen daher Downloads, Entpacken, Scripts und Build erneut. Das ist von der Wiederverwendung kompletter Artefakte zu unterscheiden.

#### Stack-ID, URL und Routing

`devenv:scripts/lib/devenv-worktree-stacks.sh:50-66` erzeugt die ID aus einem gekürzten, bereinigten Branch-/Ticket-Slug und den ersten vier Hex-Zeichen des Hashes des normalisierten absoluten Checkout-Pfads. `stack set` schreibt `.devenv/worktrees/<stack-id>.env` mit `STACK_ID`, Branch, Domain, Compose-Projekt, gemeinsamem Infrastrukturprojekt, `STACK_HOST`, Shop-Container und `DEVENV_SRC_PATH` (`:216-236,349-447`). Erneutes Setup desselben Pfads behält die ID; zwei gleich benannte Branches bekommen normalerweise verschiedene Pfad-Hashes. Die 16-Bit-Verkürzung ist nicht kollisionsfrei, ein bereits anders belegter Name wird jedoch abgewiesen.

Fünf anonymisiert geprüfte Zuordnungen erfüllten alle Datei-/ID-, Projekt-, Host-, Container- und Shared-Infrastructure-Invarianten; alle fünf Quellpfade existierten. Die Stichprobe enthielt keine zwei Checkouts desselben Branches. Ein später am exakt gleichen Pfad erstellter Checkout würde die alte Zuordnung übernehmen, weil weder Repository-Identität noch Erzeugungstoken gespeichert werden. Zwei Compose-Projekte mit Worktree-Präfix hatten bei der Prüfung keine aktuelle Zuordnungsdatei; der Orphan-Fall ist damit nicht nur theoretisch.

Der gemeinsame Load Balancer bindet Host-Port 80/443 auf Loopback. Sein Gateway erkennt `<stack-id>.<domain>.localhost`, setzt `X-Devenv-Worktree` und routet über das externe `worktree-ingress`-Netz an den Alias des Stack-LB (`devenv:docker-compose.yml:298-323`, `devenv:docker-compose.worktree.yml:1-15,62-68`, `devenv:services/lb/etc/nginx/vhosts.d/04-worktree-gateway.conf`). Der Stack-LB publiziert selbst keine Host-Ports und deaktiviert das Gateway, damit keine Schleife entsteht.

Es gibt keine Compose-Healthchecks. „Ready“ bedeutet im Setup ausschließlich: HTTPS liefert 200, 301, 302, 303, 307 oder 308 und der Response-Header `X-Devenv-Worktree` entspricht der Stack-ID. Die Prüfung verwendet `curl -k`, ein 2-Sekunden-Connect-Limit und standardmäßig 90 Sekunden Gesamtzeit (`devenv:scripts/rift-task-setup.sh:225-277`). Das belegt Route und HTTP-Antwort, aber nicht die Bereitschaft jeder API, von SSR, Datenbank, Redis oder RabbitMQ.

Emdash liest eine strenge Teilmenge dieses kleinen Vertrags als Daten aus `.devenv/worktrees/*.env` und ordnet über den kanonischen `DEVENV_SRC_PATH` zu (`emdash:apps/emdash-desktop/src/main/core/local-environments/adapters/devenv-config-reader.ts`). Seine URL-Abfrage gibt bei passendem Pfad nur `https://${STACK_HOST}` zurück und prüft weder Docker noch HTTP (`emdash:apps/emdash-desktop/src/main/core/local-environments/service.ts:155-177`). Gequotete oder escapete Werte lehnt der Parser ab; Pfade mit Leerzeichen sind daher trotz Shell-Quoting im devenv-Writer nicht interoperabel. Außerdem akzeptiert Emdash nur das feste Infrastrukturprojekt `devenv`, während devenv ein abweichendes lokales `COMPOSE_PROJECT_NAME` als Infrastrukturprojekt schreiben kann. BOC soll den Producer-Vertrag selbst validieren und darf weder diese Emdash-Einschränkung noch dessen „configured“ als eigenen Runtime-Vertrag übernehmen.

#### Stop, Cleanup und gemeinsame Zustände

| Operation             | Bestätigte Wirkung                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devenv start`        | Startet nur bereits vorhandene Container des erkannten Compose-Projekts; installiert oder prüft nichts.                                                  |
| `devenv stop`         | Stoppt nur Container dieses Compose-Projekts; Zuordnung, Container und Daten bleiben erhalten.                                                           |
| `devenv down`         | Führt `docker compose --profile all down --remove-orphans` für das validierte Worktree-Projekt aus. Es wird kein `-v` und kein globales Prune verwendet. |
| `devenv stack clear`  | Verweigert die Entfernung, solange auch nur gestoppte Container des Projekts existieren; entfernt danach nur die Zuordnungsdatei.                        |
| Setup-Abbruch/-Fehler | Kein Rollback. Dependencies, Zuordnung und teilweise gestartete Container können verbleiben.                                                             |

Die vorgesehene manuelle Entfernung ist `devenv down && devenv stack clear` (`devenv:README.md`, `devenv:devenv.sh:396-401,1097-1108`, `devenv:scripts/lib/devenv-worktree-stacks.sh:456-469`). `clean`, `reset` und `destroy` sind dafür ungeeignet, weil sie Checkout-Dateien beziehungsweise globale Docker-Ressourcen entfernen. Bei einem bereits gelöschten Checkout fehlt der sichere CWD-basierte Einstieg; BOC darf dann nicht aus einem Ersatzverzeichnis versehentlich den Default-Stack treffen.

Worktree-Stacks starten im vorbereiteten Normalfall nur sechs App-Container und verbinden sie mit externen Netzen sowie Images des gemeinsamen Infrastrukturprojekts. Bestätigt gemeinsam sind:

- Shop-, Catalog-, Merchandising- und Identity-Datenbanken samt persistenten Volumes (`devenv:docker-compose.yml:440-488,516-566`). Setup führt selbst keine Migration aus.
- Redis samt Volume. PHP-Sessions liegen in Redis (`devenv:src/shop/source/bergfreunde-env.php:11-35`). Worktree-`clear-cache` lässt Redis inzwischen ausdrücklich unangetastet.
- RabbitMQ samt Nachrichten und Volume; es gibt weder Stack-vHost noch Queue-Namensraum (`devenv:docker-compose.yml:881-905`). Ein Worktree kann daher Nachrichten für gemeinsame/default Worker erzeugen.
- Zertifikate, API-Integrationsverzeichnisse, Job-Exportdaten sowie Shop-/Job-Logs als gemeinsame Host-Bind-Mounts (`devenv:docker-compose.yml:171-190,298-310,833-840`). Logs verschiedener Stacks können sich mischen.
- Der Load-Balancer-Dateicache `volumes/cache`. Jeder Stack mountet dasselbe Verzeichnis, während Worktree-`clear-cache` `/tmp/cache/*` entfernt (`devenv:devenv.sh:817-825`). Die Meldung „nur dieser Worktree“ ist für diesen LB-Cache daher nicht korrekt.

Nicht belegt sind getrennte Uploads und Search-Indizes. Mail, Cron, Jobs und Worker werden nicht pro Worktree gestartet; ihre möglichen Nebenwirkungen über gemeinsame Infrastruktur müssen in einem kontrollierten Testfall geprüft werden.

## 3. UX-Spezifikation als Vorschlag

### Einstieg und Kontext

- Rechts oben eine kompakte Hauptaktion mit kleinem Menü. Bestehende BOC-Tokens, Icons, Tooltips, Menüs und Fokusdarstellung verwenden.
- Hauptcheckout: Environment-Aktionen ausblenden. Isolierter Checkout ohne Projektkonfiguration: „Setup konfigurieren“ öffnet direkt die passenden Projekteinstellungen.
- Fehlende Runtime/Verbindung: Grund nennen und eine passende Aktion anbieten, etwa Einstellungen oder erneute Prüfung; kein kommentarlos deaktiviertes Icon.
- Kontextmenü zeigt dieselben Aktionen für den angeklickten Tab, auch wenn eine andere Session aktiv ist. Kein versehentlicher Zugriff auf die aktive Session.
- Ein optionales Statuszeichen am Tab ist nachgelagert. Agent-Ausführungsstatus bleibt visuell getrennt. Kein Container-Polling pro Tab.
- Command-Palette kann dieselben Operationen für die aktive Session registrieren; keine zweite Ausführungslogik.

### Zustände und Aktionen

| Sichtbarer Zustand              | Hauptaktion                          | Menü und Verhalten                                                 |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| Noch nicht konfiguriert         | Setup konfigurieren                  | Projekteinstellungen                                               |
| Noch nicht eingerichtet         | Umgebung einrichten                  | Einstellungen                                                      |
| Einrichtung läuft               | Ausgabe anzeigen                     | Lauf abbrechen, sofern definierte Abbruchsemantik vorhanden        |
| Einrichtung fehlgeschlagen      | Fehler/Ausgabe anzeigen              | Erneut versuchen; Ursache bleibt erreichbar                        |
| Konfiguriert, Runtime unbekannt | URL öffnen, falls vorhanden          | Status prüfen; keine grüne „läuft“-Behauptung                      |
| Gestoppt                        | Umgebung starten, sofern unterstützt | Erneut einrichten, Ausgabe, URL kopieren                           |
| Läuft                           | Im Browser öffnen                    | Stoppen, Ausgabe, URL kopieren, erneut einrichten                  |
| Stoppen läuft                   | Ausgabe anzeigen                     | Weitere kollidierende Aktionen gesperrt                            |
| Backend nicht erreichbar        | Zustand nicht verfügbar              | Erneut verbinden/prüfen; letzte Information als veraltet markieren |

Diese Tabelle ist eine UI-Projektion, kein Auftrag zu einer großen Zustandsmaschine. Intern den letzten Script-Lauf und den beobachteten Umgebungszustand getrennt halten. „Setup erfolgreich“, „Stack konfiguriert“, „Container läuft“ und „Anwendung erreichbar“ sind unterschiedliche Aussagen. Nur tatsächlich geprüfte Zustände anzeigen.

### Ausgabe und Interaktion

- Klick startet genau einen Lauf und bestätigt ihn unmittelbar. Kein Modal vor jeder bereits konfigurierten manuellen Ausführung.
- Ein kompakter BOC-Ausgabebereich zeigt Aktion, echte Phase sofern verfügbar, Laufzeit, begrenzte Live-Ausgabe und Endergebnis. Wiederverwendung bestehender Terminal-Darstellung prüfen, nicht deren Session-Verwaltung kopieren.
- Keine erfundenen Prozentwerte oder Phasen aus beliebigen Logzeilen. Ohne strukturierten Fortschritt genügen Aktion, Laufzeit und Logs.
- Während der Ausführung bleibt die Session nutzbar. Automatisches Scrollen nur, solange die Ausgabe unten verfolgt wird; Lesen älterer Ausgabe darf nicht gestört werden.
- Fehler und der letzte Lauf bleiben nach Abschluss sowie Session-Wechsel erreichbar. Persistenzumfang über einen Backend-Neustart in Q07 festlegen.
- Kleine Screens: Icon mit zugänglichem Namen und Tooltip; Detailfläche als geeigneter Dialog. Breite Screens dürfen die Aktionsbeschriftung zeigen. Keine zusätzliche dauerhafte Sidebar nur für dieses Feature.
- Tastaturbedienung, Escape, Fokus-Rückgabe, Lade-/Fehleransagen und Reduced Motion prüfen. Status nie ausschließlich per Farbe vermitteln.
- Neue Produktionsstrings ausschließlich im BOC-eigenen englischen Wörterbuch. Deutsche Bezeichnungen hier beschreiben UX, keine zusätzliche Übersetzungsaufgabe.

### Lebenszyklus

Eine Umgebung gehört zum Checkout. Mehrere Sessions im selben Checkout sehen denselben Lauf und dieselbe URL. Tab schließen, Session-Wechsel und Archivierung einer einzelnen Session führen nicht automatisch zu Teardown.

„Lauf abbrechen“ beendet die Einrichtung; es ist nicht gleichbedeutend mit „Container stoppen“ oder „Umgebung entfernen“. Abgebrochene Einrichtung kann bereits Ressourcen erzeugt haben. Danach Zustand prüfen und eine nachvollziehbare nächste Aktion anbieten. Keine automatische Wiederholung eines unbekannt beendeten mutierenden Scripts.

Automatisches Teardown vor Checkout-Löschung benötigt einen wirksamen Einstieg vor der Entfernung. Ein späteres `worktree.updated`-Ereignis reicht nicht. Im manuellen MVP keinen vollständigen Cleanup versprechen: Start/Stop bleibt explizit; Verhalten bei extern gelöschten Checkouts ist Q08.

## 4. Architektur und Integrationsbudget

```text
Session-Button / Kontextmenü / Einstellungen
                    |
        dünne BOC-App-Anbindung
                    |
       BOC Environment API + Service
                    |
   vorhandene Prozess-/PTY-Infrastruktur
                    |
      devenv-Script im Ziel-Checkout
                    |
    Dependencies, App-Container, Stack-URL
           + gemeinsame Infrastruktur
```

### Zuständigkeit

- Servernahe Ausführung auf dem tatsächlichen Repository-Host bevorzugen. Für das MVP nur lokale unterstützte BOC-Backends freigeben. Nicht versehentlich ein lokales Script für einen Remote-Checkout starten.
- BOC koordiniert Aktionen, verhindert kollidierende Läufe pro Umgebung, stellt Status/Logs bereit und öffnet die gemeldete URL. Parallelität zwischen verschiedenen Checkouts bleibt möglich, solange devenv und gemeinsame Ressourcen sie unterstützen.
- devenv kennt Docker Compose, Dependency-Befehle, Routing und gemeinsame Infrastruktur. Seine intern unbekannten Schritte nicht bereits in BOC nachbauen.
- Vorhandene PTY-/Prozessdienste wiederverwenden. Vor Implementierung prüfen, welche Anbindung über UI-Unmounts weiterläuft, Endstatus zuverlässig erfasst und Ausgabe bereitstellt. Kein neuer Terminal-Daemon.
- Mutierende Operationen werden vom Backend verwaltet, nicht von der Lebensdauer des aufrufenden UI-Requests. Konkrete Scope-/Abbruchregeln in Q07 prüfen.

### Identität und API

Vorgeschlagene Zuordnung: Backend/Host, Projekt und kanonischer registrierter Checkout-Pfad. Die Session-ID ist Aufrufkontext, keine Environment-ID. Dafür keine neue Core-Workspace-ID oder Session-Event-Historie einführen.

Ein wiederverwendeter Pfad darf nicht blind eine alte Umgebung übernehmen. Vorhandene Rift-Metadaten und devenv-Stack-Zuordnung prüfen; Q03 entscheidet, ob zusätzliche kleine BOC-Metadaten nötig sind. Branch-Name und Tab-Titel sind keine stabile Identität.

Operationen bedarfsorientiert definieren: Konfiguration lesen/speichern, Zustand lesen, Setup ausführen, Ausgabe lesen/abonnieren; Start, Stop und Abbruch nach Klärung des Scripts ergänzen. Keine endgültige RPC-/Schema-Liste vor Q01/Q07. Backend löst den zugelassenen Checkout und die gespeicherte Konfiguration auf; Frontend-Sichtbarkeit ersetzt diese Prüfung nicht.

### Eigentum und erwartete Upstream-Stellen

Neue Logik unter `packages/boc/src/environments/`; App-Anbindungen unter `packages/app/src/boc/environments/`. Neue API-Definitionen folgen der bestehenden Richtung Schema → Core/Protocol → Server und liegen in deren BOC-Verzeichnissen. Desktop-Dateien nur bei nachgewiesenem Bedarf unter `packages/desktop/src/boc/`. Verzeichnisse sind Zuständigkeitsgrenzen, keine Pflicht, unbenötigte Dateien anzulegen.

| Oberfläche                   | Erwartete Änderung                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Session-Header               | Import plus BOC-Komponente innerhalb des bestehenden rechten Slots                                  |
| Session-Kontextmenü          | Import plus BOC-Menükomponente; Tab-Ziel explizit übergeben                                         |
| Projekt-Scripts-Tab          | Import plus eigenständig speichernder BOC-Settings-Baustein; vorhandenes Startup-Script unverändert |
| Allgemeine Settings          | Optional ein BOC-Mount für Host-Voreinstellungen, nur falls diese dort wirklich gebraucht werden    |
| Protocol-/Server-Komposition | Additive Gruppe, Handler und Service-/Layer-Registrierung wie beim Rift-Backend                     |
| Client                       | Bei neuer öffentlicher API ausschließlich generieren: `bun run generate` in `packages/client`       |
| Normale Terminal-UI          | Keine Verhaltensänderung einplanen; BOC-Ausgabefläche oder eng begrenzter additiver Mount           |

Zielbudget: drei UI-Mount-Stellen für den Kernablauf, optional eine vierte für Host-Settings, plus notwendige API-Komposition und generierte Clients. Dies ist ein Entwurfsziel, keine bereits gemessene Zeilenzahl. Pro tatsächlicher Upstream-Datei Grund und Diff erfassen und `packages/boc/fork-surface.json` prüfen/gezielt ergänzen. Kein Umbau von SessionRunner, Timeline, Worktree-Erstellung oder upstream-eigenen Settings-Schemas.

## 5. Konfiguration und Script-Vertrag

### Vorgeschlagene Settings

| Ebene    | Inhalt                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| Host     | devenv-Verzeichnis beziehungsweise ausführbares Setup; gegebenenfalls Shell und Cache-Ort                               |
| Projekt  | Feature aktivieren, Setup-Kommando, nur bei Bedarf Start-/Stop-Kommando, klare Anzeige der wirksamen Host-Einstellungen |
| Laufzeit | Letzter Lauf, Log-Verweis, Stack-ID/URL und beobachteter Zustand; keine manuell zu pflegenden Benutzereinstellungen     |

Einfach beginnen: manuelle Einrichtung, kein Automatismus als Default und keine leeren Pflichtfelder für Lifecycle-Phasen, die devenv nicht benötigt. Host-Pfade nicht in geteilte Repository-Konfiguration schreiben. Die Deployments-Einstellungen besitzen bereits ein hostlokales `devenvPath`, das dort allerdings ausschließlich `src/tools/bf-deploy` adressiert (`packages/boc/src/tools/deployments/main/store.ts`, `readiness.ts`). Vor Wiederverwendung oder Einführung eines zweiten Felds muss die Bedeutung sichtbar getrennt oder bewusst vereinheitlicht werden.

Ob lokale Projektsettings allein reichen oder eine versionierbare Projektdatei sinnvoll ist, bleibt Q06. Keine neue `.boc.json`-Spezifikation allein auf Basis des Screenshots. Wird eine geteilte Datei ergänzt, Vorrang lokaler Overrides, Zurücksetzen und sichtbare Herkunft ausdrücklich definieren.

### Bestätigter Adapter-Rahmen und offene Produktentscheidung

- Arbeitsverzeichnis und erstes Argument sind der kanonisch aufgelöste Checkout. Das aktuelle Script akzeptiert außerdem `TASK_PATH` und aus Kompatibilitätsgründen `EMDASH_TASK_PATH`; weitere `EMDASH_*`-Variablen werden nicht verwendet (`devenv:scripts/rift-task-setup.sh:15-28,427-495`). BOC braucht für diesen Vertrag keine zweite Pfadvariable.
- Den Einstieg als ausführbares Programm mit Argumentarray starten, nicht als mehrzeilige Terminaleingabe. Das Script besitzt selbst Logs pro Schritt und verlässliche Exit-Codes, aber noch keinen strukturierten Fortschrittskanal.
- URL und Stack-ID aus der strikt als Daten geparsten Zuordnungsdatei übernehmen. Branch oder Session-Titel sind keine Identität. Zusätzlich die registrierte BOC-Checkout-Zuordnung und vorhandene Compose-Projektbelegung validieren, damit ein wiederverwendeter Pfad keinen alten Stack übernimmt.
- Setup-Erfolg schließt bereits eine HTTP-/Stack-Header-Prüfung ein. Start und Status nach einem späteren Stop brauchen dieselbe oder eine gleichwertige gezielte Prüfung; Exit-Code 0 von `devenv start` genügt nicht.
- Stop ist `devenv stop`; Remove ist die getrennte, validierte Folge `devenv down` und danach `devenv stack clear`. Diese Aktionen dürfen nie auf `clean`, `reset`, `destroy` oder ein beliebiges Fallback-Arbeitsverzeichnis abgebildet werden.
- Vor Start prüft BOC mindestens ausführbares devenv, registrierten Checkout und vorhandene Shared Networks. Fehlende vorbereitete Konfiguration beziehungsweise ein unerwarteter interaktiver Prompt endet als nachvollziehbarer Setup-Fehler mit erreichbarem Log; BOC liest dafür keine Secrets.

## 6. Performance-Plan

Performance ist ein eigenes Abnahmekriterium. Messung getrennt für Checkout-Erstellung, Dependency-Bereitstellung, Container-Start und Anwendungsbereitschaft. Das Hinzufügen dieses Features darf die normale Worktree-/Session-Erstellung nicht mit Setup-Arbeit belasten.

### Dependency-Wiederverwendung

1. Tatsächlichen Speicherort und Laufzeit der Installation feststellen: Host, Bind-Mount oder Docker-Volume; Host-OS und Container-OS nicht verwechseln.
2. Vorhandene npm-/Composer-Download-Caches nutzen und prüfen, ob jeder Container sie erreicht. Das spart Downloads, aber nicht zwingend Entpacken, Dateianlage und Scripts.
3. Einen kompatiblen vollständigen Dependency-Stand wiederverwenden, falls Messungen den Nutzen zeigen. Jede Umgebung bekommt eigene beschreibbare Installationsverzeichnisse.
4. Kandidaten vergleichen: Copy-on-write-Kopie auf unterstütztem Dateisystem, Volume-Bereitstellung in Docker oder Dependency-Image/Build-Layer. Host-APFS beschleunigt nicht automatisch Kopien innerhalb eines Docker-Volumes.
5. Nur eine durch Messung begründete Strategie umsetzen. Bei fehlender Unterstützung normal installieren; keine umfangreiche Backend-Matrix bauen.

Ein gültiger Cache-Schlüssel umfasst die tatsächlichen Installations-Eingaben: Lockfiles, relevante Manifeste und Workspace-Pakete, Installationsflags/-Konfiguration, Runtime-/Paketmanager-Versionen, Betriebssystem/Architektur und erforderlichenfalls ABI/libc beziehungsweise Image-Digest. Welche Eingaben konkret relevant sind, muss Q02/Q04 belegen. Secrets gehören weder in Cache-Metadaten noch in Logs.

Cache erst nach erfolgreicher vollständiger Erstellung veröffentlichen. Gleichzeitige Anfragen nach demselben fehlenden Stand zusammenführen. Unabhängige Cache-Schlüssel nicht pauschal global serialisieren. Generierte, pfadabhängige Dateien, Composer-Autoloading, lokale Symlinks und Installationsscripts auf notwendige Nacharbeit im Ziel prüfen.

Kein gemeinsam beschreibbarer Symlink oder blindes Hardlink-Abbild des gesamten `node_modules`/`vendor`. Ein `npm ci` nach Wiederherstellung entfernt `node_modules` und würde den Vorteil aufheben. Installationsscripts nicht pauschal abschalten, um eine schnellere Zahl zu erzielen.

Rifts sauberes Git-Template bleibt im ersten Entwurf unverändert. Dependency-Wiederverwendung gehört zum optionalen Setup, damit Git und Rift denselben Ablauf nutzen. Eine spätere vorbereitete Rift-Vorlage wäre eine gesonderte, messungsgetriebene Entscheidung.

### Cache-Befund und Empfehlung

Das aktuelle devenv implementiert bereits einen hostlokalen, key-adressierten Artifact-Cache für `vendor`, `node_modules` und Frontend-Dist (`devenv:scripts/lib/rift-artifact-cache.sh`). Composer-Schlüssel enthalten Manifest, Lockfile, lokales `common/bfnamespace`, Patch-Baum sowie Composer-Dockerfile und Entrypoint. Node-Schlüssel enthalten Manifest, Lockfile, optionale `.npmrc` und Node-Dockerfile. Der Frontend-Schlüssel enthält den committed `shop/source`-Tree, beide Dependency-Schlüssel und einen Hash der lokalen `.env` (`:181-242`). Veröffentlichung erfolgt über temporäre Verzeichnisse erst nach Nutzbarkeitsprüfung und `COMPLETED`-Marker; Locks gelten pro Typ/Schlüssel (`:304-329,351-429,488-569`).

Auf dem geprüften Host lagen drei Composer-, zwei Node- und drei Frontend-Einträge vor. Alle acht Metadaten meldeten `apfs-clone`; drei Composer-Stichproben enthielten relative lokale Paket-Symlinks. Das bestätigt die technische Verfügbarkeit privater Copy-on-write-Bäume auf diesem Host, nicht die Korrektheit jedes Artefakts.

Ein bestätigter Korrektheitsfehler blockiert die unveränderte Übernahme: `rift_try_restore_or_wait` akzeptiert jedes bereits „brauchbar“ aussehende Ziel als `target-present`, bevor der berechnete Schlüssel verglichen wird (`devenv:scripts/lib/rift-artifact-cache.sh:572-603`). Nach Lockfile-, Runtime- oder Source-Änderung sowie nach Rift `--copy-all` können dadurch alte Dependencies oder Dist-Dateien als warm gelten. Zusätzlich bildet der Plattformschlüssel Docker-Server-OS/-Architektur ab, nicht zuverlässig die für Node/SSR erzwungene `linux/amd64`-Plattform; genaue Image-Digests, npm-/Composer-Patchversionen und libc/ABI fehlen.

**Empfehlung — Vorschlag, nicht bestätigte Produktentscheidung:** Den Cache in devenv besitzen lassen und das vorhandene Modell aus key-adressiertem vollständigem Artefakt plus privatem Copy-on-write-Restore weiterentwickeln. Auf APFS `cp -cR`, auf reflink-fähigem Linux `cp --reflink`, sonst normale Kopie beziehungsweise Installation verwenden. BOC soll diesen Cache nur auslösen und Status darstellen, nicht duplizieren.

Vor Freigabe sind folgende kleine Korrekturen im devenv-Vertrag erforderlich:

1. Ein vorhandenes Ziel nur mit einem atomar veröffentlichten, zielseitigen Schlüsselmarker als warm akzeptieren; unbekanntes oder abweichendes Ziel neu installieren beziehungsweise aus dem richtigen Key restaurieren.
2. Schlüssel an der tatsächlichen Service-Plattform ausrichten und immutable Image-Identität, Paketmanager-Version und relevante Installationsflags einbeziehen.
3. Composer-Plugin-/Script-Nebenwirkungen außerhalb von `vendor`, native Node-Module, Autoloading und Frontend-Ausführung in einer separaten Kopie prüfen.
4. Gleichzeitiges Setup derselben Umgebung zusätzlich als Gesamtoperation serialisieren; die Cache-Locks allein genügen nicht.
5. Einen gemeinsamen Composer-/npm-Download-Cache nur als zweiten, gemessenen Miss-Pfad ergänzen. Niemals `vendor` oder `node_modules` gemeinsam beschreibbar mounten.

Damit bleibt die schnellste bestätigte Technik erhalten, ohne BOC an APFS zu koppeln. Dependency-Images oder Docker-Volumes sind für den aktuellen Bind-Mount-Runtimepfad unnötig indirekt und würden den Restore in den Checkout nicht vermeiden. Diese Empfehlung wird erst nach den offenen Cache-Miss-, Lockfile-, Parallelitäts- und Anwendungsprüfungen zur Entscheidung.

### UI- und Hintergrundkosten

- Keine Docker-Starts, Dependency-Scans, rekursiven Verzeichnis-Hashes oder synchronen Dateizugriffe im Renderer.
- Ein geteilter Environment-Store pro Backend-/Checkout-Zuordnung. Zehn Tabs mit derselben Umgebung erzeugen keinen zehnfachen Statusabruf.
- Status gezielt bei Öffnen, Aktion und relevanter Wiederverbindung aktualisieren. Kein globales Dauer-Polling aller Checkouts. Falls Laufzeit-Polling nötig ist, Sichtbarkeit und aktiven Lauf berücksichtigen.
- Ausgabe begrenzen und gebündelt darstellen; nicht jede Zeile durch alle Session-Komponenten propagieren. Aufbewahrungsgrenze für Logs/Cache festlegen.
- Filesystem-Watcher und Indexer während großer Installationen messen; Ignorierverhalten prüfen, bevor upstream-nahe Watcher verändert werden.
- BOC-Detail-UI und schwere Module bedarfsgerecht laden. Normale Sessions und inaktive Projekte dürfen kein Docker-Inventar initialisieren.

### Messmatrix und vorläufige Ziele

| Szenario                                                         | Erfassung / Kriterium                                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Feature unkonfiguriert; Session öffnen und wechseln              | Produktionsbaseline gegen Änderung; keine zusätzlichen Environment-Subprozesse oder Poller                            |
| Setup-Klick mit vorbereiteter Capability                         | Sichtbare Rückmeldung als vorläufiges Ziel innerhalb 100 ms; unabhängig von Script-Abschluss                          |
| Kalte Dependencies                                               | Einzelzeiten für Download, Installation, Scripts, Container und Readiness; Cache-Aufbau transparent ausweisen         |
| Zweiter Checkout, identische Eingaben                            | Warm-/Kaltvergleich und Vergleich mit bisherigem devenv; kein unnötiger vollständiger Reinstall bei gültigem Snapshot |
| Erneutes Setup derselben Umgebung                                | Keine zweite Stack-Identität; nur notwendige Arbeit, gemäß tatsächlicher Idempotenz                                   |
| Geändertes Lockfile oder Runtime-Image                           | Richtiger Cache-Miss; kein falscher Warm-Erfolg                                                                       |
| Zwei gleichzeitige Checkouts / zwei Sessions desselben Checkouts | Unabhängige Arbeit möglich; gleiche Umgebung startet nur einen kollidierenden Lauf                                    |
| Große Logs und Dependency-Dateimengen                            | Session weiter bedienbar; Speicher und Renderarbeit bleiben begrenzt                                                  |

Mindestens drei vergleichbare Warm-Läufe, Median und Spannweite sowie Hardware, Dateisystem, Image-/Runtime-Versionen und Dependency-Größe dokumentieren. Kalte Läufe nur mit separatem Testcache herstellen, nicht durch Löschen des normalen Caches. Die konkreten Warm-Setup-Zeitbudgets werden erst nach Baseline festgelegt; bis dahin keine Sekundenversprechen oder erfundenen Beschleunigungsfaktoren.

### Vorhandene und aktuelle Messwerte

Unter `devenv:.devenv/benchmarks/results/` lagen zwölf historische Ergebnisdateien: elf erfolgreiche und ein fehlgeschlagener Lauf. Neun erfolgreiche Läufe meldeten für Composer, Node und Frontend keinen Miss, Disable- oder Dirty-Bypass-Status:

| Messgröße               |       Median |   Spannweite |
| ----------------------- | -----------: | -----------: |
| Git-Worktree erstellen  |          3 s |        2–3 s |
| Setup bis HTTP-ready    |         31 s |      24–40 s |
| Verifikation            |          1 s |        0–1 s |
| Cleanup                 |         10 s |      10–15 s |
| Gesamtlauf              |         49 s |      42–58 s |
| Logische Checkout-Größe | rund 1,64 GB | 1,64–1,67 GB |

Alle neun meldeten sechs App-Container und keine neue Image-ID. Zwei weitere erfolgreiche Läufe mit mindestens einem Artifact-Miss benötigten 139 beziehungsweise 159 Sekunden bis Readiness. Das deutet auf hohen Nutzen der Artefaktwiederverwendung hin, ist aber kein belastbarer Beschleunigungsfaktor: Die Ergebnisdateien enthalten weder Source-Commit noch CPU/RAM, Dateisystem, Docker-/Compose-Versionen, genaue Image-Digests oder Runtime-Patchversionen. Acht der neun Warm-Läufe melden `target-present`; deren Logs zeigen zuvor jeweils erfolgreiche Prefetches aller drei passenden Keys. Das Label belegt daher nicht, dass der Stale-Target-Fehler in diesen Läufen auftrat, kann aber frisch restaurierte und ungeprüft vorhandene Ziele nicht unterscheiden. Zusätzlich stammen acht der zwölf Ergebnisdateien aus dem älteren `.devenv/stacks`-Vertrag und nur vier aus dem aktuellen `.devenv/worktrees`-Vertrag; beide Miss-Läufe gehören zur älteren Gruppe. Die Kohorten sind deshalb nur historische Richtwerte.

Der aktuell geprüfte Host ist Apple Silicon/arm64 mit APFS, Bash 5.3.15, Docker Client/Engine 29.7.2 und Compose 5.5.0; der Docker-Server läuft als Linux/arm64. Diese aktuellen Systemwerte dürfen den älteren Ergebnisdateien nicht nachträglich als Benchmark-Metadaten zugeschrieben werden.

Nach ausdrücklicher Freigabe lokaler Cache-Löschung wurden mit `devenv:scripts/worktree-lifecycle-benchmark.sh` vier Disposable-Läufe gegen devenv `c3575c0d2cff` und Projekt-Source `f37d3e34d319` ausgeführt. Das Script erzeugte jeweils einen eigenen Branch, Checkout und Compose-Stack und entfernte diese wieder. Danach verblieben weder Benchmark-Container/-Projekte noch Benchmark-Worktrees oder -Branches.

Der erste aktuelle Lauf baute fehlende Composer- und Frontend-Artefakte auf; Node wurde passend prefetched. Die folgenden drei Läufe nutzten für alle drei Artefakte den passenden Prefetch und bilden die aktuelle Warm-Baseline:

| Messgröße               |  Median |   Spannweite |
| ----------------------- | ------: | -----------: |
| Git-Worktree erstellen  |     3 s |        3–3 s |
| Setup bis HTTP-ready    |    24 s |      22–26 s |
| Verifikation            |     1 s |        0–1 s |
| Cleanup                 |     9 s |       8–10 s |
| Gesamtlauf              |    41 s |      35–42 s |
| Logische Checkout-Größe | 1,91 GB | 1,91–1,91 GB |

Alle vier aktuellen Läufe endeten erfolgreich, meldeten sechs App-Container, verwendeten ausschließlich vorhandene Images und hinterließen laut Ergebnisdatei keine Cleanup-Warnung. Der Artifact-Aufbau benötigte 143 Sekunden bis HTTP-ready und 155 Sekunden insgesamt; darin entfielen 22 Sekunden auf Composer, 86 Sekunden auf den Frontend-Build und 12 Sekunden auf Readiness. Die warmen Setups benötigten 22, 24 und 26 Sekunden.

Diese Baseline belegt den aktuellen Happy Path und die sichere, stackeigene Cleanup-Kette. Sie belegt noch nicht Lockfile-/Image-Misses, ungeprüft kopierte `target-present`-Verzeichnisse, parallele Setups, Linux, CPU/I/O/Watcher oder Queue-/Worker-Isolation. Diese Prüfungen können mit der gebauten Integration gezielter und näher am echten Vertrag erfolgen.

## 7. Antworten auf Q01–Q12 und offene Restpunkte

Die Statusangabe „statisch beantwortet“ bestätigt den aktuellen Quellvertrag, nicht das Verhalten eines noch nicht ausgeführten BOC-Adapters. „Teilbeantwortet“ lässt eine konkret benannte Laufzeit- oder Produktentscheidung offen.

### Q01 — Setup und Lifecycle

**Statisch beantwortet.** Die reale Kette ist in Abschnitt 2 dokumentiert: `stack set` → Cache-Key/Restore → Composer → npm → Frontend-Build → `up shop` → `clear-cache` → HTTP-Readiness → Cache-Prune. Setup kann bei unvorbereiteter gemeinsamer Umgebung in `prepare-shop` interaktiv werden. Wiederholung behält die Pfadzuordnung; Abbruch liefert 130, aber ohne Rollback. Start, Stop, Remove und Assignment-Clear sind getrennte devenv-Operationen.

**Offen:** kontrollierter Erfolgs-, Fehler-, Retry- und Abbruchlauf; Verhalten zweier gleichzeitiger Setups desselben Checkouts; Capability-Prüfung für einen garantiert nichtinteraktiven Start.

### Q02 — Dependency-Ort und Runtime

**Statisch beantwortet.** `vendor`, `node_modules` und Frontend-Dist liegen in jedem Checkout und werden über Bind-Mounts von Composer-/Node-One-shots sowie Shop/SSR genutzt. Host-UID/GID vermeidet fremde Dateieigentümer. Node-One-shot und SSR sind `linux/amd64`; Composer und Shop sind auf dem aktuellen Host Linux/arm64-Images. Statisch gelten Composer 2.4, PHP 8.3 und Node 22; im laufenden gemeinsamen Stack wurden PHP 8.3.32 und Node 22.23.1 rein lesend bestätigt. Die genaue npm- und Composer-Patchversion des One-shots wurde nicht durch einen neuen Containerlauf bestimmt.

**Offen:** tatsächliche Native-Module/ABI-Kompatibilität und Linux-Fallbacks in einem freigegebenen Test-Checkout.

### Q03 — Stack-ID, URL und Pfadzuordnung

**Teilbeantwortet.** Writer, Invarianten, Wiederholungsverhalten und Routing sind in Abschnitt 2 belegt. Fünf aktuelle anonymisierte Zuordnungen waren konsistent. Derselbe Pfad behält seine ID; verschiedene Pfade unterscheiden sich normalerweise durch vier Hash-Hexzeichen. Exakt wiederverwendete Pfade können alte Zuordnungen übernehmen, und die Hashverkürzung bleibt kollisionsanfällig. Emdash konsumiert den Vertrag, erzeugt ihn aber nicht.

**Offen:** Laufprobe mit zwei Checkouts desselben Branches sowie verbindliche zusätzliche BOC-Eigentumsprüfung bei Pfadwiederverwendung und extern gelöschtem Checkout.

### Q04 — Wiederverwendbare Dependencies

**Teilbeantwortet.** Die aktuellen Cache-Eingaben und privaten Restore-Ziele sind belegt; APFS-Clones und relative Composer-Path-Symlinks wurden in vorhandenen Artefakten beobachtet. Der `target-present`-Pfad vergleicht jedoch keinen Key und ist ein bestätigter Korrektheitsblocker.

**Offen:** geändertes Lockfile/Image, Composer-Plugins und Installationsscripts außerhalb `vendor`, Autoloading, native Node-Module, Frontend-Ausführung und Rift-`--copy-all` in separaten Kopien. Bis dahin ist kein Warm-Cache korrektheitsseitig abgenommen.

### Q05 — Readiness und Routing

**Teilbeantwortet.** Route, URL-Schema und Setup-Prüfung sind belegt. Es gibt keine Compose-Healthchecks; HTTP-Status plus korrekter Stack-Header ist die vorhandene Readiness-Definition. Emdashs „configured“ bedeutet dagegen nur, dass eine passende Konfigurationsdatei existiert.

Vier aktuelle Disposable-Läufe bestätigten HTTP 200 mit korrektem Stack-Header. **Offen:** Kosten und Aussagekraft einer späteren Statusprüfung nach `start`, SSR/API-/DB-/Redis-/Rabbit-Ausfälle sowie TLS ohne `-k`. UI darf bis dahin nur „URL vorhanden“ beziehungsweise „vom Setup als HTTP-ready gemeldet“ anzeigen.

### Q06 — Konfiguration und Teilbarkeit

**Teilbeantwortet.** devenv hält Maschinenkonfiguration in `dev.env`, Zuordnungen in `.devenv/worktrees`, Cache in `.devenv/rift-cache` und Setup-Logs in `.devenv/rift-setup-logs`; diese Orte sind lokal und ignoriert. Storefront-Domains sind unter `devenv:config/storefront-domains.txt` versioniert. BOC-Projektmetadaten einschließlich `commands.start` liegen serverseitig in der Project-Tabelle (`packages/core/src/project.ts:211-233`); Worktree-Backend-Präferenzen und Deployments-`devenvPath` sind getrennte hostlokale Desktop-Stores.

Emdashs `.emdash.json` teilt `preservePatterns`, `shellSetup`, `scripts.setup/run/teardown` und Commands; lokale DB-Werte überschreiben die versionierten Nicht-Command-Felder (`emdash:apps/emdash-desktop/src/shared/core/project-settings/project-settings.ts`, `emdash:apps/emdash-desktop/src/main/core/projects/settings/effective-task-settings.ts`). Das ist eine Wissensquelle, kein BOC-Vertrag.

**Offen:** Ob BOC überhaupt versionierbare Environment-Felder braucht. Vorläufiger Vorschlag bleibt: Host-Devenv-Pfad und Cache-Capability lokal; Projekt-Aktivierung und optionaler Default-Domain projektbezogen; Stack-ID/URL ausschließlich generierte Laufzeitdaten.

### Q07 — Prozesse, Logs und Wiederanbindung

**Statisch teilweise beantwortet.** Der normale BOC-PTY ist Location-/Backend-intern. Er hält maximal 2 MiB Ausgabe und 25 beendete Sessions im Speicher; sein Layer-Finalizer beendet laufende Prozesse (`packages/core/src/pty.ts:13-16,91-131,216-237`). UI-Unmount schließt nur den Socket und speichert Rendererzustand, explizites Schließen entfernt den PTY; nach Exit entfernt die normale Terminal-UI den Eintrag (`packages/app/src/session/terminal/terminal.tsx:537-690`, `context.tsx:161-180,339-358`). Das genügt weder für Backend-Neustart noch für erreichbare abgeschlossene Environment-Logs.

Der Persistent-PTY-Daemon läuft detached und unterstützt einen Backend-Handoff (`packages/core/src/persistent-pty/daemon.ts:198-269,334-382`). Er meldet Output-Offsets und Replay-Truncation, aber seine Retentionsgrenze liegt im externen Binary (`packages/schema/src/persistent-pty.ts:9-15`, `packages/core/src/persistent-pty/daemon.ts:492-597`). Bei einem sichtbar angehängten Exit entfernt der aktuelle Service den Terminaleintrag automatisch (`packages/core/src/persistent-pty/index.ts:306-333`). `terminate` ist vorhanden, doch die Repository-Quellen beweisen keine Prozessgruppen-/Kindprozess-Semantik.

Emdash bestätigt nur ein Konzept: phasenstabile Lifecycle-PTYs, In-Memory-Deduplizierung, 16-KiB-Fehler-Tail und 64-KiB-Replay im Main Process. Status und Logs überleben keinen Main-Process-Neustart; sein POSIX-Prozessbaum-Terminator kann nicht ungeprüft portiert werden.

**Offen:** kontrollierte Tests für Fenster-/Backend-Handoff, Daemon-Ausfall, Log-Truncation und Prozessbaum-Abbruch. Architekturvorschlag für Schritt C: Persistent PTY als Prozesshalter prüfen, aber letzten Lauf, Endstatus und begrenztes Log Environment-eigen speichern; kein PTY allein erfüllt den Vertrag.

### Q08 — Stop und Cleanup

**Für zugeordnete Stacks beantwortet.** `stop` stoppt nur Projektcontainer. `down` entfernt Container und projektlokale Compose-Ressourcen ohne `-v`; `stack clear` entfernt anschließend nur die Zuordnung. Geteilte Infrastruktur und Dependency-/Log-/Cache-Dateien bleiben. Vier aktuelle Disposable-Läufe bestätigten diese Cleanup-Kette ohne verbleibende Benchmark-Projekte, Worktrees oder Branches. Bei fehlendem Checkout oder nicht beweisbarer Zuordnung ist automatisches Cleanup nicht sicher. Zwei zuvor beobachtete unzugeordnete Worktree-Compose-Projekte bestätigen den Orphan-Fall.

**Offen:** Fehlerfälle von `down`/`stack clear` und ein sicherer, expliziter Orphan-Cleanup-Einstieg. Automatisches Cleanup vor Checkout-Löschung bleibt außerhalb des manuellen MVP.

### Q09 — Gemeinsam genutzter Zustand

**Teilbeantwortet.** Datenbanken, Redis einschließlich PHP-Sessions, RabbitMQ, Zertifikate, mehrere Integrations-/Exportverzeichnisse, Logs und der LB-Dateicache werden geteilt. Es gibt keine Redis- oder RabbitMQ-Namensräume pro Stack. Worktree-Setup migriert die Datenbank nicht und startet keine eigenen Worker/Jobs. `clear-cache` lässt Redis in Worktree-Stacks unangetastet, löscht aber den gemeinsamen LB-Dateicache.

**Offen:** Uploads, Search-Indizes sowie konkrete Queue-/Worker-Nebenwirkungen zweier paralleler App-Versionen. Vor diesen Prüfungen keine Behauptung vollständiger Parallelisolation.

### Q10 — Laufzeit und Optimierungsreihenfolge

**Aktuelle Happy-Path-Baseline vorhanden.** Drei kontrollierte aktuelle Warm-Läufe erreichten HTTP-Readiness in 22, 24 und 26 Sekunden; Median 24 Sekunden. Ein aktueller Artifact-Aufbau benötigte 143 Sekunden. Die älteren gemischten Werte bleiben nur historische Richtwerte.

**Offen, aber nicht Builder-blockierend:** kontrollierter vollständiger Kaltcache, parallele Setups, Lockfile-/Image-Miss, CPU/I/O/Watcher und automatisierte Phasenwerte. Vorläufiges Regressionsbudget für denselben Host und identische Inputs: Warm-Median höchstens 30 Sekunden bis HTTP-ready; nach drei Vergleichsläufen neu bewerten statt als plattformübergreifendes SLA behandeln.

### Q11 — Plattformen und Speicherorte

**Teilbeantwortet.** Aktuell ist macOS auf Apple Silicon mit APFS praktisch belegt. Der Cache probiert dort `cp -cR`, auf Linux `cp -a --reflink=always` und fällt bei anderer oder getrennter Filesystem-Unterstützung auf eine normale Kopie zurück (`devenv:scripts/lib/rift-artifact-cache.sh:47-140`). Devenv verlangt Bash 4+, aktuell ist 5.3.15 installiert. Docker läuft als Linux/arm64; Node/SSR erzwingen amd64.

**Bestätigte Produktentscheidung:** Der MVP unterstützt macOS und Linux; Windows/WSL bleibt außerhalb. Linux-Reflink, Cross-Filesystem-Copy, Compose-`!reset`-Mindestversion und Performance ohne Copy-on-write werden nach dem Bau auf Linux abgenommen. Fehlt Reflink, muss der korrekte Copy-/Install-Fallback funktionieren, auch wenn er langsamer ist.

### Q12 — Vorhandenes Startup-Script

**Statisch beantwortet, Nutzung offen.** `Project.Commands.start` ist der vorhandene Startup-Hook (`packages/schema/src/project.ts:26-30`). `Worktree.create` führt ihn nach Erstellung und Registrierung für jede gewählte Strategie synchron im neuen Checkout aus, unter Unix via `bash -lc`, mit `OPENCODE_WORKTREE_BASE` und `OPENCODE_WORKTREE_PATH`; Fehler lassen die Erstellung fehlschlagen (`packages/core/src/worktree.ts:233-290`). Er besitzt keine Live-/Reconnect-/Log-Semantik und darf nicht als manueller Environment-Runner umgedeutet werden.

Eine rein lesende lokale Datenbankabfrage fand keine konfigurierten Startup-Kommandos, enthielt aber auch keinen Projektdatensatz für diesen Checkout und beweist daher nichts über die Zielprojekte. Emdash führt optional `scripts.setup` vor `scripts.run` aus, koordiniert dies aber nicht mit direkten devenv-Aktionen.

**Offen:** tatsächliche Zielprojektwerte vor Einführung prüfen. Ist `commands.start` bereits das devenv-Setup, darf BOC nicht ein zweites Mal ausführen; andernfalls bleibt der bestehende Hook unverändert und die manuelle Environment-Aktion erhält eine getrennte Konfiguration.

### Builder-fertiger Auftrag

Der nächste Builder-Agent kann ohne weitere Architektur-Recherche mit folgendem bestätigten Scope beginnen:

1. **Ziel und Plattform:** lokale registrierte Git-Worktrees und Rift-Checkouts auf macOS und Linux. Hauptcheckout, Remote-/SSH-Location und nicht registrierte Pfade bleiben ausgeschlossen. Windows/WSL und Dashboard bleiben außerhalb.
2. **Fester Adapter:** hostlokalen devenv-Root auflösen und ausschließlich den bestätigten `scripts/worktree-setup.sh`-/`devenv.sh`-Vertrag verwenden. Keine freien Shell-Scripts und keine Umdeutung von `commands.start`.
3. **Environment-Identität:** Backend, Projekt und kanonischen registrierten Checkout-Pfad verwenden. Generierte Zuordnung strikt als Daten lesen und zusätzlich Stack-ID, Compose-Projekt, Host, Quellpfad sowie BOC-Checkout-Eigentum validieren.
4. **Operationen:** Setup, Start, Stop, URL öffnen/kopieren und Stack entfernen. Entfernen verlangt eine klare Bestätigung und führt nur bei verifizierter Zuordnung `down` und danach `stack clear` aus. Unzugeordnete Orphans werden angezeigt, aber im MVP nicht automatisch entfernt.
5. **Runner:** genau eine kollidierende Operation pro Environment, unabhängig von der Session. UI-Unmount darf den Lauf nicht abbrechen. Prozesshalter/Reconnect auf Basis des Persistent PTY prüfen; Environment-eigener letzter Lauf, Endstatus und begrenztes Log bleiben unabhängig vom normalen Terminal sichtbar. Keine automatische Wiederholung nach unbekanntem Abbruch.
6. **Status:** Setup-Lauf, Stack-Konfiguration, Containerzustand und HTTP-Readiness getrennt darstellen. Nach Setup die vorhandene HTTP-/Header-Prüfung übernehmen; nach Start gezielt prüfen. Keine dauerhafte globale Docker-Abfrage und kein Polling pro Tab.
7. **Geteilte Infrastruktur:** Datenbanken, Redis/PHP-Sessions und RabbitMQ dürfen im MVP geteilt bleiben. Dies in Settings/Status klar, aber nicht alarmistisch kennzeichnen. Stop/Remove darf diese Dienste und ihre Volumes nicht treffen.
8. **Cache:** Cache bleibt devenv-eigen. Bei fehlendem oder abweichendem Ziel-Key lieber checkout-lokale Dependencies/Dist löschen und korrekt restaurieren beziehungsweise neu bauen als einen unsicheren Warm-Hit akzeptieren. APFS-Clone, Linux-Reflink und normale Copy/Installation sind die abgestufte Strategie.
9. **UI:** vorhandener rechter Session-Slot, Session-Kontextmenü und Projekt-Scripts-Tab als additive Einhängestellen; ein gemeinsamer Environment-Store je Backend/Checkout. Zustände, Fokus, Tastatur, kleine Fenster, Live-Ausgabe und Fehler/Retry mit Fixtures zuerst absichern.
10. **Upstream-Budget:** Produktlogik unter den BOC-Verzeichnissen; upstream-eigene Dateien nur für additive Mounts/Registrierung. Öffentliche API nur über Schema → Protocol → Server und generierten Client. `BOC_FORK.md` und `packages/boc/fork-surface.json` bei tatsächlichen Integrationsänderungen aktualisieren.

### Nach dem Bau gezielt prüfen

Diese Punkte sind keine weitere Vorab-Recherche, sondern Akzeptanz- und Härtungsprüfungen am gebauten Ablauf:

- Erfolgs-, Fehler-, Retry- und Prozessbaum-Abbruchlauf; Dialog/Fenster schließen, Backend-Handoff und wiedererreichbare Logs.
- Zwei Checkouts desselben Branches, zwei Sessions desselben Checkouts und zwei parallele unterschiedliche Environments.
- Lockfile-/Image-Miss, ein bereits kopiertes falsches `target-present`, Rift-`--copy-all`, native Module, Composer-Autoload und echte App-Ausführung.
- Gemeinsamer DB-/Redis-/RabbitMQ-Betrieb mit kontrollierter Queue-/Worker-Beobachtung; Uploads und Search-Indizes.
- Linux-Reflink und Copy-Fallback; macOS-Warm-Baseline gegen das vorläufige 30-Sekunden-Budget.
- Remove-Bestätigung, partieller `down`-Fehler, fehlender Checkout und unveränderte gemeinsame Infrastruktur.

Benchmarks weiterhin nur in Disposable-Test-Stacks. Lokale Cache-Löschung und Rebuilds sind ausdrücklich zulässig und sollen zugunsten der Korrektheit eher einmal zu viel erfolgen. Unverändert verboten bleiben Datenbankmigrationen, Volume-Löschungen, globale Prunes, Stops bestehender Stacks sowie Neustarts der laufenden App oder des Servers.

## 8. Umsetzung in überprüfbaren Schritten

| Schritt                    | Arbeit                                                                                                                                       | Abschlusskriterium                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A: devenv-Vertrag klären   | Q01–Q06 und Q08–Q12 untersuchen; aktuelle Baseline aufnehmen, Q07 anhand BOC prüfen                                                          | **Abgeschlossen 2026-09-06:** Evidenz, Produktentscheidungen, aktuelle Messwerte, Builder-Scope und spätere Härtungsprüfungen dokumentiert  |
| B: UI/UX mit Fixtures      | BOC-eigene Zustandsdarstellung, Hauptaktion/Menü, Settings und begrenzte Ausgabe mit realistischer Fixtures                                  | Alle UI-Zustände, schmale/breite Fenster, horizontale/vertikale Tabs, Tastatur und Fokus geprüft; keine echten Scripts nötig                |
| C: manueller Ablauf        | Runner und gespeicherte Konfiguration, registrierten Checkout prüfen, ein Lauf pro Umgebung, Endstatus und Logs, bestehendes devenv anbinden | Reales Setup im Test-Checkout; doppelte Sessions, Fehler, Wiederholung und UI-Wechsel korrekt; Capability verbirgt nicht unterstützte Ziele |
| D: Dependency-Optimierung  | Die gemessene Cache-Strategie im passenden devenv-/Adapter-Bereich umsetzen                                                                  | Warm/Kalt-Messung, Cache-Miss bei geänderten Inputs und tatsächliche Anwendung mit isolierten Dependency-Schreibzugriffen geprüft           |
| E: Integration abschließen | Status/URL, geklärtes Stop/Abbruch, Reconnect, Settings-Validierung, Kontextmenü und gezielte Performance-Prüfung                            | UX-Abnahme, keine relevante Session-Regression, Fork-Diff dokumentiert, unterstützte Plattformen benannt                                    |

B kann nach gesondertem Auftrag mit klar markierten Fixtures vorbereitet werden. Reale Docker-/Dependency-Implementierung hängt von den benannten Laufzeit- und Korrektheitsprüfungen ab. C ist ein Funktionsmeilenstein; die geforderte Performance ist erst nach D/E abgenommen. Kein pauschales Implementierungsmandat aus diesem Plan ableiten.

Automatisches Setup bei Checkout-Erstellung, zuverlässiges Teardown vor beliebiger Löschung und ein globales Dashboard bekommen bei Bedarf spätere, eigene Arbeitspakete.

## 9. Verifikation und Definition of Done

Vor Änderungen an Session-/Timeline-Code Produktionsbenchmark-Baseline gemäß `packages/app/AGENTS.md` erfassen. Keine laufende App und keinen laufenden Server neu starten. Bestehende Arbeit im Repository respektieren.

Gezielte Tests für Verhalten mit echtem Risiko: gleiche Umgebung aus zwei Sessions, falscher/nicht isolierter Zielpfad, Fehler/Abbruch, Cache-Verwechslung, nachträgliche Statusantwort für falschen Tab, Recovery nach unterbrochenem Lauf und Stop ohne Eingriff in gemeinsame Infrastruktur. Keine Tests nur für triviale JSX-Mounts oder als Kopie der Implementierung.

- `bun typecheck` in den tatsächlich betroffenen Paketen, nie `tsc` direkt oder Root-Typecheck.
- Passende vorhandene Tests aus Paketverzeichnissen ausführen; keine Root-Tests.
- Neue öffentliche API: in `packages/client` `bun run generate`, generierte Ergebnisse prüfen.
- Fork-Audit vom Root: `bun packages/boc/scripts/audit-fork-surface.ts`; neue Mount-Stellen nachvollziehbar dokumentieren.
- Build/Lazy-Loading prüfen, wenn neue Renderer-/Server-Exports oder Komposition betroffen sind.
- Reale Smoke-Tests mit freigegebenem Test-Stack: Git und Rift, zwei Checkouts, zwei Sessions eines Checkouts, Setup/Fehler/Retry/Stop, URL und geteilter DB-Betrieb.

Fertig ist das Feature erst, wenn:

1. Bedienung nur für zulässige Ziele erscheint und serverseitig derselbe Geltungsbereich gilt.
2. Eine Umgebung aus mehreren Sessions konsistent bedient wird; keine doppelten kollidierenden Läufe.
3. Der Zustand ehrlich zwischen Script-Ergebnis, Konfiguration und beobachteter Runtime unterscheidet.
4. Ausgabe und Fehler nach Ende erreichbar sind und der Nutzer einen klaren nächsten Schritt hat.
5. Setup und Stop den nachgewiesenen devenv-Vertrag einhalten; gemeinsame Infrastruktur bleibt außerhalb des Stack-Cleanups.
6. Dependencies zur tatsächlichen Laufzeit passen und jede Umgebung unabhängig schreiben kann.
7. Warm-Setup und Session-Performance gemessen und gegen die vereinbarten Ziele geprüft sind.
8. Upstream-Änderungen auf erklärte additive Einhängestellen begrenzt bleiben.
9. Unterstützte Plattformen, verbleibende Grenzen und offene Fragen dokumentiert sind. Nicht geprüfte Fälle gelten nicht als erledigt.

## 10. Fortsetzungsprompt nach Schritt A

```text
Wir planen BOC-Entwicklungsumgebungen für Git-Worktree- und Rift-Sessions.
Lies BOC_ENVIRONMENTS_PLAN.md und die gültigen AGENTS.md-Anweisungen. Schritt A
und die aktuelle Happy-Path-Baseline sind abgeschlossen. Behandle nur die unter
„Nach dem Bau gezielt prüfen“ genannten Härtungspunkte als offen. Dashboard
bleibt außerhalb des Auftrags.

Setze den Abschnitt „Builder-fertiger Auftrag“ in kleinen, überprüfbaren
Schritten um. Reale Setups und Benchmarks ausschließlich in Disposable-
Test-Stacks. Lokale Cache-Löschung ist zugunsten der Korrektheit erlaubt;
keine bestehenden Stacks stoppen, Datenbanken migrieren, Volumes löschen,
globale Prunes ausführen oder laufende App beziehungsweise Server neu starten.

Erhalte die Trennung zwischen Anforderungen, Vorschlägen und bestätigten
Entscheidungen. Erstklassige UI/UX, messbare Performance und wenige additive
Upstream-Eingriffe bleiben verbindlich. Cache-Korrektheit geht vor einer warmen
Benchmark-Zahl; `commands.start` bleibt ein unveränderter separater Hook. Die
offenen Punkte aus „Nach dem Bau gezielt prüfen“ sind Abnahmekriterien, keine
Einladung zu spekulativer Vorab-Architektur.

Nutze ausschließlich repository-relative Pfade und anonymisierte Beispiele
in Plänen und Handovers. Versionierte Änderungen gemäß Repository-Workflow
committen und nach origin/boc-beta pushen; lokale tmp-Unterlagen nicht committen.
```

## 11. Externe technische Referenzen

Diese Quellen wurden während der vorangegangenen Recherche geprüft. Sie erklären Möglichkeiten und Grenzen, ersetzen aber keine Messung der tatsächlich installierten Versionen.

- [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/): entfernt vorhandenes `node_modules` vor einer sauberen Installation.
- [Composer-Konfiguration](https://getcomposer.org/doc/06-config.md): Download-Cache und `vendor` sind unterschiedliche Speicherbereiche.
- [pnpm-Verzeichnisstruktur](https://pnpm.io/symlinked-node-modules-structure): eigener Store und Link-Struktur; kein Muster für einen pauschal geteilten beschreibbaren Dependency-Ordner.
- [Apple APFS](https://developer.apple.com/documentation/foundation/about-apple-file-system): Cloning als Grundlage für getrennt beschreibbare Kopien mit zunächst geteilten Datenblöcken.
- [Docker Build Cache](https://docs.docker.com/build/cache/optimize/): Installations-Layer und Cache-Mounts; Laufzeit-Mounts separat betrachten.
- [Docker Compose Networking](https://docs.docker.com/compose/how-tos/networking/): Verbindung separater App-Projekte mit gemeinsamer Infrastruktur über explizite Netzwerke.

## 12. Fortsetzungsprotokoll

Neue Befunde hier datiert ergänzen; die Fragen in Abschnitt 7 nur bei belegter Antwort schließen.

| Datum      | Schritt                        | Ergebnis                                                                                                                                                                                                  | Noch offen                                                                                                              |
| ---------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 2026-09-05 | Recherche / Plan               | BOC- und Emdash-Einhängestellen geprüft; Architektur, UI-Zustände, Messmatrix und Prüffragen festgehalten. Keine Feature-Implementierung oder Setup-Ausführung.                                           | Q01–Q12; nächster Schritt A auf vollständigem devenv-Rechner                                                            |
| 2026-09-06 | A: Quellenprüfung              | Aktuelles devenv, Projekt-Mounts/Runtime, Emdash und BOC-Prozesspfade statisch geprüft; zwölf historische Messdateien eingeordnet; Cache-Empfehlung formuliert. Keine Feature- oder Lifecycle-Ausführung. | Kontrollierter Test-Stack; Cache-Key-Korrektheit, Queue-/Worker-Isolation, Runner-Abbruch/Reconnect und neue Benchmarks |
| 2026-09-06 | A: Entscheidungen und Baseline | Fester devenv-Adapter, Setup/Start/Stop/URL/Remove, geteilte DB/Redis/RabbitMQ sowie macOS/Linux bestätigt. Vier Disposable-Läufe erfolgreich; aktuelle Warm-Baseline 24 s bis HTTP-ready.                | Builder-Auftrag in Abschnitt 7; Korrektheits-, Reconnect-, Parallelitäts- und Linux-Prüfungen nach dem Bau              |
