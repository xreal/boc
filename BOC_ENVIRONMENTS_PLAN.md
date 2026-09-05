# BOC: Entwicklungsumgebungen für Worktree- und Rift-Sessions

Stand: 2026-09-05. Status: Recherche abgeschlossen, Umsetzung vorgeschlagen, devenv-Prüfung ausstehend.

Dieses Dokument ist ein eigenständiger, versionierter Arbeitsplan für die Fortsetzung auf einem Rechner mit vollständig installiertem devenv. Es implementiert keine Funktion und erteilt keine Freigabe, bestehende Umgebungen zu verändern. Offene Fragen bleiben offen, bis die jeweils genannte Evidenz vorliegt.

## 1. Ziel und Entscheidungsstand

Aus einer Session in einem isolierten Checkout soll sich mit einer klaren Aktion die zugehörige Entwicklungsumgebung einrichten lassen: Dependencies bereitstellen, benötigte App-Container starten und die eigene Host-URL öffnen. Große Datenbanken dürfen gemeinsam genutzt werden. Einrichtung und Bedienung müssen schnell sein und sich selbstverständlich in BOC einfügen.

| Festlegung                                                                                          | Status                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Worktrees und Rift-Checkouts unterstützen; Setup nur dort anbieten beziehungsweise freigeben        | Anforderung                                       |
| Erstklassige UI/UX, Performance und minimaler Upstream-Diff                                         | Anforderung                                       |
| Bestehendes devenv und Emdash/Bergdev als Wissensquelle nutzen                                      | Anforderung                                       |
| Local-Environments-Dashboard ausklammern                                                            | Anforderung                                       |
| Offene Fragen ausdrücklich dokumentieren; Prüfung auf vollständigem Setup fortsetzen                | Anforderung                                       |
| Umgebung gehört zum Checkout, mehrere Sessions teilen ihre Bedienung                                | Architekturvorschlag                              |
| Ein Hauptbutton mit Aktionsmenü rechts oben, ergänzend Session-Kontextmenü                          | UX-Vorschlag                                      |
| Zunächst manuelle Aktionen auf einem lokalen BOC-Backend                                            | MVP-Vorschlag; Plattformumfang noch prüfen        |
| BOC steuert Ausführung und Darstellung; devenv besitzt Docker-/Installationslogik                   | Architekturvorschlag                              |
| Separate, kompatible Dependency-Snapshots statt gemeinsam beschreibbarer Installationsverzeichnisse | Performance-Vorschlag; Speichertechnik noch offen |

Nicht Teil des ersten Schritts: Dashboard, eigener Paketmanager, pnpm-Migration, Remote-/SSH-Ausführung, allgemeines Plugin-System, automatische Datenbankkopien, neue Session-Core-Domäne oder unbedingtes automatisches Setup/Teardown.

## 2. Gesicherte Recherche

BOC-Quellen wurden zuletzt bei `57345c1d8b` auf `boc-beta` nachgeprüft. Der untersuchte Emdash-Checkout meldete HEAD `ca2d1c173`; die Befunde beziehen sich auf die lokal vorhandenen Dateien, einschließlich möglicher Fork-Arbeitsänderungen, nicht pauschal auf diesen Commit oder Upstream-Emdash. Das eigentliche devenv-Script lag nicht vor. Es wurden keine Docker-, Setup- oder Installationskommandos ausgeführt und keine Performance-Werte gemessen.

Alle BOC-Pfade sind relativ zu diesem Repository. Emdash-Pfade beziehen sich auf dessen Repository; `D/` steht dort für `apps/emdash-desktop/`. Alte lokale BOC-Unterlagen liegen unter `tmp/` und werden nicht automatisch auf einen anderen Rechner übertragen. Wenn vorhanden: zuerst `tmp/BOC_HANDOVER.md`, dann `tmp/BOC_EXTENSIONS_JIRA_PLAN.md` und den Rift-Plan lesen. Fehlen sie, für diese neue Funktion den aktuellen Code und dieses Dokument verwenden; die abgeschlossenen Jira-Arbeitspakete nicht erneut ausführen.

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

Einfach beginnen: manuelle Einrichtung, kein Automatismus als Default und keine leeren Pflichtfelder für Lifecycle-Phasen, die devenv nicht benötigt. Host-Pfade nicht in geteilte Repository-Konfiguration schreiben. Bereits vorhandene devenv-Einstellungen, etwa aus anderen BOC-Tools, vor Einführung eines zweiten Felds auf gleiche Bedeutung prüfen.

Ob lokale Projektsettings allein reichen oder eine versionierbare Projektdatei sinnvoll ist, bleibt Q06. Keine neue `.boc.json`-Spezifikation allein auf Basis des Screenshots. Wird eine geteilte Datei ergänzt, Vorrang lokaler Overrides, Zurücksetzen und sichtbare Herkunft ausdrücklich definieren.

### Vertrag erst nach devenv-Prüfung abschließen

- Arbeitsverzeichnis ist der aufgelöste Checkout. Vorgeschlagene BOC-Variablen: `BOC_WORKTREE_PATH`, `BOC_PROJECT_PATH`; weitere nur bei tatsächlichem Bedarf.
- Bestehende `EMDASH_*`-Abhängigkeiten feststellen. Falls nötig eine enge, dokumentierte Kompatibilität im Adapter; keine unbemerkte zweite Variablenspezifikation.
- Script als korrekt gequotete Datei beziehungsweise ausführbares Programm starten; keine mehrzeilige Eingabefolge in eine interaktive Shell tippen. Exit-Code und Abbruch verlässlich erfassen.
- URL und Stack-ID von devenv übernehmen. Bevorzugt bestehenden kleinen Metadatenvertrag lesen; neuen strukturierten Output nur einführen, wenn dieser nicht genügt. Konfigurationsdateien als Daten lesen, nicht zur URL-Ermittlung als Shell sourcen.
- Hostname muss über erneutes Setup stabil bleiben und unterschiedliche Checkouts desselben Branches unterscheiden. Generierung möglichst an einer Stelle in devenv belassen.
- Neue Container nicht allein wegen Exit-Code 0 als erreichbar melden. Health-Semantik und Prüfungskosten sind Q05.
- Stop/Teardown darf nur Ressourcen des Ziel-Stacks betreffen. Keine automatische Entfernung geteilter Datenbank-Volumes, kein globales Docker-Prune.

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

## 7. Offene Fragen für den vollständig eingerichteten Rechner

Alle Zeilen beginnen als **offen**. Antworten mit Datei/Funktion, beobachtetem Verhalten und gegebenenfalls Messung belegen. Vermutungen als solche markieren.

| ID  | Frage                                                                       | Konkret untersuchen / Ergebnis                                                                                                                                                                     | Blockiert                                                  |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Q01 | Was macht Setup tatsächlich; welche Lifecycle-Phasen existieren?            | `scripts/worktree-setup.sh`, aufgerufene Teile von `devenv.sh`; Reihenfolge, Parameter, Exit-Codes, interaktive Prompts, Wiederholung, Abbruch, Start/Stop. Kommandokette aufschreiben.            | Reale Ausführung und abschließende Aktionsliste            |
| Q02 | Wo werden Node-/PHP-Dependencies installiert und ausgeführt?                | Compose-Dateien, Dockerfiles, Mounts, Volumes, Benutzerrechte, Node/npm/PHP/Composer-Versionen, Host-/Containerplattform. Speicher- und Laufzeitkarte erstellen.                                   | Cache-Technik und Installationskommandos                   |
| Q03 | Wie entstehen und überleben Stack-ID, Hostname und Pfadzuordnung?           | Anonymisierte `.devenv/worktrees/*.env`, Writer-Code, gleiche Branches in zwei Checkouts, erneutes Setup, gelöschter/erneut verwendeter Pfad.                                                      | URL-Vertrag und Wiederzuordnung                            |
| Q04 | Welche Dependency-Dateien sind wiederverwendbar?                            | Lockfiles, Manifeste, Workspaces, lokale Pakete, native Module, Composer-Plugins/-Scripts, Autoload-/Build-Artefakte und pfadabhängige Symlinks. In einer Kopie tatsächlich importieren/ausführen. | Cache-Schlüssel und Warm-Pfad                              |
| Q05 | Was bedeutet „bereit“ und wie funktioniert Routing?                         | Reverse Proxy, DNS/TLS, Ports, `STACK_HOST`, Compose-/HTTP-Health; Dauer und Kosten vorhandener Prüfungen.                                                                                         | Verlässliche Laufzeit-/Readiness-Anzeige                   |
| Q06 | Wo liegt heute Konfiguration und was soll geteilt werden?                   | Bestehende BOC-/devenv-Pfadeinstellungen, projektlokale Overrides, `.emdash.json`-Nutzung; benötigte lokale und versionierbare Felder.                                                             | Endgültiges Settings-Schema und Persistenzort              |
| Q07 | Wie laufen Prozesse, Logs und Wiederanbindung über UI-/Backend-Lebensdauer? | BOC-PTY-Scope und Aufbewahrung; Tab-Wechsel, Dialog schließen, Fenster neu öffnen, Backend-Unterbrechung, Prozessgruppen-Abbruch. In Testumgebung prüfen, laufende App nicht neu starten.          | Zuverlässiger Runner, Abbruch und Log-Persistenz           |
| Q08 | Was stoppt/entfernt Teardown genau?                                         | `down`, `stack clear`, getrennte Stop-/Remove-Funktionen, Verhalten bei fehlendem Checkout; vorzeitige Löschung und teilweise fertiges Setup.                                                      | Stop/Cleanup; automatische Löschintegration bleibt separat |
| Q09 | Was wird außer der Datenbank geteilt?                                       | Redis, Sessions, Queues/Worker, Search-Indizes, Uploads, Mail, Cron und Migrationen; Stack-Namensräume und globale Nebenwirkungen dokumentieren.                                                   | Korrektheit paralleler Umgebungen                          |
| Q10 | Wo liegt die tatsächliche Laufzeit?                                         | Vorhandenes Setup in Schritte zerlegen; kalt/warm, identischer/neuer Checkout, parallele Einrichtung, CPU/I/O/Watcher. Messergebnisse gemäß Abschnitt 6.                                           | Performance-Ziel und Optimierungsreihenfolge               |
| Q11 | Welche Plattformen und Speicherorte müssen anfangs funktionieren?           | Zielrechner, Dateisystem, Docker-Runtime, Volumes, lokale Backend-Fähigkeiten; verfügbare Clone-/Reflink-Verfahren prüfen.                                                                         | Verbindliche Support-Matrix und Fallback                   |
| Q12 | Wie greifen bestehendes Startup-Script und neues Setup zusammen?            | Projekt-`commands.start` und tatsächliche Nutzung prüfen; doppelte devenv-Ausführung verhindern, ohne bestehenden Hook umzudeuten.                                                                 | Einführung in vorhandene Projekte                          |

### Sammelpaket für die Fortsetzung

- Setup-Script und nur die tatsächlich aufgerufenen devenv-Funktionen.
- Relevante Compose-/Dockerfile-Ausschnitte mit Dependency-Mounts, Routing und gemeinsamer Infrastruktur.
- Eine anonymisierte generierte Stack-Konfiguration; keine Zugangsdaten oder personenbezogenen Host-Pfade.
- Exakte Installationsbefehle, Versionen, relevante Manifest-/Lockfile-Struktur und aktuelle Cache-Einstellungen.
- Eine Ablaufskizze und Messwerttabelle. Auch fehlende Messungen und nicht reproduzierte Fälle ausdrücklich nennen.

Zunächst read-only untersuchen. Ausführung und Benchmarks nur in einem ausdrücklich als Test vorgesehenen Checkout/Stack. Falls das Script gemeinsame Datenbanken migriert, globale Services stoppt oder produktive Daten verändert, diese Schritte vor einem Testlauf abgrenzen. Keine Live-DB-Kopien, kein globales Prune oder Cache-Löschen für diese Recherche.

## 8. Umsetzung in überprüfbaren Schritten

| Schritt                    | Arbeit                                                                                                                                       | Abschlusskriterium                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A: devenv-Vertrag klären   | Q01–Q06 und Q08–Q12 untersuchen; Baseline aufnehmen, Q07 anhand BOC prüfen                                                                   | Evidenz und offene Restpunkte hier eintragen; keine erfundene API oder Cache-Entscheidung                                                   |
| B: UI/UX mit Fixtures      | BOC-eigene Zustandsdarstellung, Hauptaktion/Menü, Settings und begrenzte Ausgabe mit realistischer Fixtures                                  | Alle UI-Zustände, schmale/breite Fenster, horizontale/vertikale Tabs, Tastatur und Fokus geprüft; keine echten Scripts nötig                |
| C: manueller Ablauf        | Runner und gespeicherte Konfiguration, registrierten Checkout prüfen, ein Lauf pro Umgebung, Endstatus und Logs, bestehendes devenv anbinden | Reales Setup im Test-Checkout; doppelte Sessions, Fehler, Wiederholung und UI-Wechsel korrekt; Capability verbirgt nicht unterstützte Ziele |
| D: Dependency-Optimierung  | Die gemessene Cache-Strategie im passenden devenv-/Adapter-Bereich umsetzen                                                                  | Warm/Kalt-Messung, Cache-Miss bei geänderten Inputs und tatsächliche Anwendung mit isolierten Dependency-Schreibzugriffen geprüft           |
| E: Integration abschließen | Status/URL, geklärtes Stop/Abbruch, Reconnect, Settings-Validierung, Kontextmenü und gezielte Performance-Prüfung                            | UX-Abnahme, keine relevante Session-Regression, Fork-Diff dokumentiert, unterstützte Plattformen benannt                                    |

B kann vor vollständigem Abschluss von A mit klar markierten Fixtures vorbereitet werden. Reale Docker-/Dependency-Implementierung hängt von den jeweiligen offenen Fragen ab. C ist ein Funktionsmeilenstein; die geforderte Performance ist erst nach D/E abgenommen. Kein pauschales Implementierungsmandat aus diesem Plan ableiten.

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

## 10. Startprompt für den anderen Rechner

```text
Wir planen BOC-Entwicklungsumgebungen für Git-Worktree- und Rift-Sessions.
Lies BOC_ENVIRONMENTS_PLAN.md und die gültigen AGENTS.md-Anweisungen.
Auf diesem Rechner ist das vollständige devenv verfügbar. Die abgeschlossene
Recherche in Abschnitt 2 ist Ausgangspunkt, kein Beweis für das aktuelle Script.

Führe zunächst Schritt A aus: Ermittle die relevanten devenv-/Projekt- und
Emdash-Quellen und beantworte Q01–Q12 mit konkreter Evidenz. Priorität haben
Setup-Ablauf, Dependency-Mounts und Runtime, Stack-ID/URL, Stop/Cleanup sowie
gemeinsame DB/Queues/Caches. Dashboard bleibt außerhalb des Auftrags.

Beginne read-only. Keine bestehenden Container stoppen, keine Datenbanken
migrieren, keine Caches/Volumes löschen und keine laufende App oder Server
neu starten. Benchmarks nur in einem ausdrücklich vorgesehenen Test-Stack;
ohne solchen die Messungen als offen dokumentieren.

Aktualisiere den Plan mit Befunden, Messwerten, noch offenen Fragen und einer
begründeten Empfehlung zur Cache-Technik. Erhalte die Trennung zwischen
Anforderungen, Vorschlägen und bestätigten Entscheidungen. Keine Feature-
Implementierung ohne anschließenden Auftrag. Erstklassige UI/UX, messbare
Performance und wenige additive Upstream-Eingriffe bleiben verbindlich.

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

| Datum      | Schritt          | Ergebnis                                                                                                                                                        | Noch offen                                                   |
| ---------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 2026-09-05 | Recherche / Plan | BOC- und Emdash-Einhängestellen geprüft; Architektur, UI-Zustände, Messmatrix und Prüffragen festgehalten. Keine Feature-Implementierung oder Setup-Ausführung. | Q01–Q12; nächster Schritt A auf vollständigem devenv-Rechner |
