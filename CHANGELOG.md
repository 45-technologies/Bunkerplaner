# Änderungen

## 3.0.0 – 2026-10-16

Beta: Normprofile außerhalb Deutschlands sowie die Register für Bauantrag, Radon und Wartung (noch ohne unabhängige Prüfung).

- Sprachen: Oberfläche, Meldungen, Berichte, statische Berechnung, Pläne und Exporte auf Deutsch, Englisch und Spanisch; Zahlen-, Datums- und Währungsformat je Sprache; Sprachauswahl in der Kopfzeile.
- Länder weltweit mit Regionen: Feiertage im Baukalender, Klima am Standort (NASA POWER), Währung mit Wechselkurs (EZB), MwSt., Baupreisniveau (Eurostat, Weltbank ICP), Höhenbezug; Länderwechsel rechnet Geldbeträge um.
- Bemessung je Land: Eurocode mit nationalen Parametern, SIA 260–267 für Schweiz und Liechtenstein, ACI 318-19 und ASCE 7-22 für die USA (φ-Faktoren, US-Stäbe, Durchstanzen, Stützen, Brandschutz nach ACI/TMS 216.1, Sohldruck nach IBC, Baugruben nach OSHA); Fundstellen je Nachweis.
- Erdbeben je Norm: EN 1998-1 mit nationalen Bodenparametern (u. a. FR, IT, ES, PT, RO, BG), SIA 261 mit Zonen und Bauwerksklassen, ASCE 7-22 mit SDS/SD1 und Abruf der USGS-Bemessungswerte über den lokalen Server.
- Bauantrag: Register mit 66 Zuständigkeiten (alle Bundesländer, österreichische Länder, Schweizer Kantone, weitere Staaten), Verfahren nach Lage des Grundstücks, amtliche Formulare mit Aktualitätsprüfung und lokalem Ausfüllen, Bauvorlagen als Entwurf (Baubeschreibung, DIN 277, DIN 276, Baustatistik, Zeichnungen).
- Radonschutz: Referenzwerte und Rechtslage je Land, Bodenluft und Gebiet am Standort, Abschätzung des Radoneintrags mit und ohne Lüftung, Maßnahmen nach § 154 StrlSchV.
- Varianten: Planungsstände speichern, vergleichen und wieder übernehmen.
- Betrieb & Wartung: Wartungsplan aus Ausstattung und Regeln des Landes, Termine ab Inbetriebnahme, Kalenderdatei (ICS).
- IFC-Export (IFC4) mit Bauteilen, Öffnungen, Räumen, Baustoffen, Eigenschaften und Mengen.
- Nach eigener Prüfung: Meldungen zu DIN 18533, DIN 18065 und DIN EN 206 außerhalb Deutschlands allgemein formuliert, Hinweis zu den Wassereinwirkungsklassen im Abdichtungsplan, Betonklassen in den USA mit f′c, Innentreppe in Schnitt und 3D mit Laufplatte parallel zur Steigung, IFC-Export nur mit gültiger Kontur.

## 2.2.0 – 2026-10-16

- Einbauten mit Gewicht und Aufstellort: Notstromaggregat, Tank, Batterien, Lüftung, Wasser, Vorräte und Hebeanlage im passenden Raum, Lasten auf Bodenplatte bzw. Zwischendecke, Füllungen als Lagerlast E (voll und leer); Raum je Gerät wählbar.
- Außenwände als FE-Platten je Kante mit Erd- und Wasserdruckverlauf, Drehfedern an den Platten, Zwischendecken als Lager, Öffnungen ausgespart, beide Eckausbildungen.
- Luftstoß dynamisch mit dem Einmassenschwinger (Biggs, UFC 3-340-02): Duktilität, Auflagerdrehwinkel und dynamische Querkraft für TWK-Last und Szenarien.
- Erdbeben nach DIN EN 1998-1/NA und DIN EN 1998-5: Erddruckzuwachs, Erdbebenkombination der Wände, Gleiten.
- Bauablauf im Kalender: Feiertage je Bundesland, Winterpause, Betonreife nach Temperatur, Kolonnen je Gewerk, Daten im Gantt-Diagramm.
- Verifikation des Rechenprogramms an Referenzbeispielen und Netzstudie im Bericht; Vergleichspaket für die Kontrollrechnung und DXF der Systemlinien.
- Detailblätter zu den Bewehrungsplänen (Rahmenecke, Wandfuß, Durchführung, Wandöffnung, Unterstützungen); Produktbeispiele mit Quellen.
- FE-Bemessung: Momente nur an Auflagern, Stützen, Aussparungen und unter Einzellasten über 2·d gemittelt, Feldmomente ungemittelt; Unterzüge mit dem Lastverlauf aus der FE-Rechnung; Stützenquerschnitt mit Parabel-Rechteck-Diagramm.
- Korrekturen nach unabhängiger Prüfung: Einbauten ohne Überdeckung und schnellere Platzsuche, Wasserhaltung nach Kalendertagen, Winterpause höchstens 120 Tage, Lastmassenfaktor der eingespannten Platte, statischer Anteil der dynamischen Auflagerkraft, Erdbebenmasse mit Füllungen und Sohlreibung mit tan φ′/1,25, Einbauten je Plattenfeld im Tafelverfahren, Speicher des FE-Zwischenspeichers begrenzt.

## 2.1.0 – 2026-10-15

- FE-Plattenberechnung für Decke, Zwischendecken und gebettete Bodenplatte mit Momentenbildern, Zulagen, Querkraftbewehrung und Durchbiegung; Rechnung im Web Worker.
- Mehrere Ebenen mit Zwischendecken, Innentreppen (Laufplatte bemessen), Aufzügen und Lastenaufzügen nach EN 81-20, Ebenenwechsel in Grundriss, Schnitt und 3D.
- Stützen (Theorie II. Ordnung), Durchstanzen mit Bewehrung und Öffnungen, Unterzüge, stützenfreie Bereiche und automatisches Stützenraster.
- Weitere Nachweise: Grundbruch, Setzung, Böschungen von Erdhügel und Baugrube, Feuerwiderstand R 30 bis R 120, Aufzugsgruben, Betonierabschnitte und Fugen.
- Statische Berechnung als gegliedertes Dokument mit Positionsplan, Positionen, Zusammenstellung und offenen Punkten.
- Bewehrungspläne, Biegeliste (CSV) und BVBS-Datei; Stahlmengen der Kalkulation aus der Biegeliste.
- Schutz- und Haustechnik: Filterbetrieb und Überdruck, Explosionsschutzventile, Wärmebilanz und Kühlung, Abwasser mit Hebeanlage, Notstrom mit Tank, Verbrennungsluft und Abgas.
- Bauablauf in Ausführungsreihenfolge: Leitungs- und Kampfmittelauskunft, Sohlabnahme, Aufzugsgrube vor der Bodenplatte, Betonierabschnitte als eigene Betoniertage, Unterzüge mit der Platte darüber, Innentreppen nach ihrer Decke, Schachtkopf, Aufzugsmontage mit ZÜS-Prüfung, Oberboden andecken, Dichtheitsprüfung mit Überdruck vor Probebetrieb und Abnahme; Gantt und Bericht nach Beginn sortiert.
- Freigaben neu geordnet und ergänzt (Kampfmittel, Brandschutz, Haustechnik, AwSV, Aufzug, Sohlabnahme, Einbauteile, Elektro-Erstprüfung, Dichtheitsprüfung mit Überdruck); alle Unterlagen im letzten Schritt abrufbar.
- Korrekturen nach unabhängiger Prüfung: Kraftstoff mit Leerlaufanteil, Durchstanzlast ohne durchlaufende Stützenlasten, Fundament-Durchstanzbewehrung nach NCI zu 6.4.5, Wandtragfähigkeit mit Schlankheit, Stützenquerschnitt mit tatsächlicher Stabanordnung, Feuerwiderstand der Stützen mit μfi = 0,7, Wandbewehrung ohne doppelte Stoßlänge, Rahmenecken, Öffnungslaibungen.

## 2.0.0 – 2026-10-14

Erste öffentliche Version.

- Geführter Planungsablauf in 11 Schritten mit Kennwertleiste, Meldungen je Schritt und Verweis auf das betroffene Bauteil.
- Grundriss-Editor mit Außenkontur, Innenwänden, Türen, Treppen, Notausstiegen, Räumen und Leitungswegen; Prüfung auf Kollisionen von Zugängen und Öffnungen sowie auf lange Rettungswege.
- Layout-Vorschläge in sechs Grundformen, darunter der Großschutzraum mit Abschnitten, Schlafkabinen und Zwischenschleusen (20 bis 500 Personen); Notausstiege werden ergänzt, bis kein Punkt weiter als 30 m vom nächsten Zugang liegt; nicht aufgehende Grundformen werden ausgeblendet.
- Erdhügel über der konvexen Hülle des Grundrisses mit exakter Hügelfläche in Mengen, Grundriss, Schnitt und 3D sowie Massenbilanz.
- Tragwerks-Vorbemessung nach EC2: Durchlaufplatten nach Pieper/Martens mit FE-gestützten Auflagerkräften, Querkraft am Auflagerrand (bei Bedarf mit erhöhter Längsbewehrung), Rissbreite unter Dauerlast, Rahmenecken und Wandecken; bei Überlastung wird die nötige Dicke genannt. Lastfall Luftstoß nach TWK 2017; Schnitt durch jeden Zugang; 3D-Modell mit Baugrube, Dämmung, Bewehrung, Schnittebene und Bauphasen.
- Stückliste und Kosten mit Firma oder Eigenleistung je Gewerk, eigenen Geräten, Material zu Selbstkosten, Baustellen- oder Werkbeton und Planungsleistungen als Einzelposten.
- Einkauf mit konkreten Produkten, Gebinden, Preisbelegen, Gültigkeit und standortbezogenen Lieferangeboten; optionaler Händlerpreisabruf.
- Szenarien, Schichtaufbauten und Prüfunterlagen im Schritt Schutznachweise; Abdichtungsplanung nach DIN 18533.
- Ausgaben: Projektdatei, Stückliste und Einkaufsliste als CSV (gegen Tabellenformeln abgesichert), Planungsbericht.
- Projektdateien werden beim Öffnen vollständig geprüft; Dateien der Vorversion werden übernommen.
- Lokaler Server nur auf 127.0.0.1 mit Dateiliste, Host-Prüfung, Content Security Policy und begrenzten Weiterleitungen; Schrift lokal ausgeliefert.
