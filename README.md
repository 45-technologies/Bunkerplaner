# Bunkerplaner

Lokales Planungswerkzeug für Schutzräume aus Stahlbeton: vom Grundstück über Grundriss, Tragwerks-Vorbemessung und Mengen bis zu Kosten, Einkauf und Bauablauf, mit Schnitt und 3D-Modell. Die Planung läuft im Browser, die Projektdaten bleiben auf dem eigenen Rechner.

> **Wichtiger Hinweis:** Der Bunkerplaner liefert eine **Vorbemessung und vorläufige Mengen für die Vorplanung**. Er ersetzt weder Baugrundgutachten noch Tragwerksplanung mit Prüfstatik, Abdichtungsplanung, Fachplanung Schutzbau oder die Prüfung durch Behörden. Ergebnisse vor jeder Verwendung fachlich prüfen lassen. Die Software wird ohne Gewährleistung bereitgestellt (siehe [LICENSE](LICENSE)).

> **Beta:** Die Normprofile außerhalb Deutschlands (Eurocode-Anhänge anderer Länder, SIA, ACI/ASCE) und die Register für Bauantrag, Radon und Wartung sind Beta-Stand: an Beispielen und Quellen geprüft, aber noch ohne unabhängige Prüfung. Jeder Registereintrag nennt Stand und Bewertung der Quelle. Für Deutschland gilt der geprüfte Stand der Version 2.2.

## Funktionen

- **Sprachen und Länder:** Oberfläche, Berichte und Pläne auf Deutsch, Englisch und Spanisch. Länder weltweit mit Regionen, Feiertagen, Klima am Standort, Währung mit Wechselkurs, MwSt. und Baupreisniveau.
- **Bemessung je Land:** Eurocode mit dem nationalen Anhang des Landes (Deutschland unverändert nach EC2 mit NA DE), Schweiz und Liechtenstein nach SIA 260–267, USA nach ACI 318-19 und ASCE 7-22; Erdbeben je Norm (EN 1998-1 mit nationalen Bodenparametern, SIA 261, ASCE 7-22 mit Abruf der USGS-Bemessungswerte).
- **Geführter Ablauf in 14 Schritten** vom Standort über Varianten und Bauantrag bis zu Betrieb und Wartung, mit Kennwerten (Beton, Stahl, Aushub, Kosten, Bauzeit, Ausnutzung, Auftrieb) in der unteren Leiste.
- **Grundriss-Editor** mit Außenkontur (Rechteck, L-Form, frei), Innenwänden, Türen, Treppenabgängen, Notausstiegen, Räumen und Leitungswegen.
- **Layout-Vorschläge** in sechs Grundformen, jeweils komplett durchgerechnet, darunter ein **Großschutzraum** mit Abschnitten, Schlafkabinen, Zwischenschleusen und mehreren Zugängen bis 500 Personen.
- **Erdhügel:** Bunker ganz oder teilweise über Gelände, Erde als Hügel aufgeschüttet, mit Massenbilanz.
- **Mehrere Ebenen** mit Zwischendecken, Innentreppen, Aufzügen und Lastenaufzügen (EN 81-20), Stützen, Unterzügen und stützenfreien Bereichen; Ebenenwechsel in Grundriss, Schnitt und 3D.
- **Tragwerks-Vorbemessung** nach EC2 mit NA DE: FE-Plattenberechnung für Decke, Zwischendecken und gebettete Bodenplatte mit Momentenbildern, Außenwände, Innen- und Schachtwände, Stützen (Theorie II. Ordnung), Durchstanzen, Unterzüge, Treppen, Aufzugsgruben, Sohldruck, Auftrieb, WU-Rissbreite und Zwang; Außenwände als FE-Platten je Kante; Lasten der Einbauten (Aggregat, Tank, Batterien, Wasser, Vorräte, Hebeanlage) an ihrem Aufstellort; Lastfall Luftstoß nach den Schweizer TWK 2017, zusätzlich dynamisch mit dem Einmassenschwinger; Erdbeben nach DIN EN 1998-1/NA und DIN EN 1998-5.
- **Weitere Nachweise:** Grundbruch (DIN 4017), Setzung (DIN 4019), Standsicherheit von Erdhügel und Baugrube mit Gleitkreisen (DIN 4084), Feuerwiderstand R 30 bis R 120 (DIN EN 1992-1-2), Betonierabschnitte und Arbeitsfugen (WU-Richtlinie).
- **Statische Berechnung** als gegliedertes Dokument mit Positionsplan, Positionen, Zusammenstellung der Nachweise und offenen Punkten zum Drucken bzw. als PDF; Anhang mit Verifikation des Rechenprogramms an Referenzbeispielen und Netzstudie.
- **Vergleichspaket** für eine unabhängige Kontrollrechnung (Eingaben, statische Systeme, Lastfälle, Kombinationen und Ergebnisse je Position, als CSV) und DXF der Systemlinien.
- **Bewehrungspläne, Biegeliste und BVBS-Datei** aus der Bemessung: Platten je Lage, Außenwand-Abwicklung, Stützen, Unterzüge, Innenwände und Treppen; Stablängen ≤ 12 m mit Stößen; Detailblätter für Rahmenecken, Wandfuß, Durchführungen, Wandöffnungen sowie Unterstützungen und Abstandhalter.
- **Schutz- und Haustechnik:** Lüftung nach CO₂-Bilanz, Filterbetrieb und Überdruck, Explosionsschutzventile je Luftdurchführung, Wärmebilanz und Kühlung, Abwasser mit Hebeanlage, Notstrom mit Kraftstofftank (AwSV), Verbrennungsluft und Abgas; Produktbeispiele mit Quelle und Abrufdatum (Belüftung nach BABS TPH-11, Hebeanlage, Tank).
- **Leitungen in 3D** mit Kollisionsprüfung und automatischer Erkennung der Durchführungen.
- **Schnitt** durch jede Treppe, jeden Notausstieg, längs und quer; **3D-Modell** mit Baugrube, Bewehrung, Schnittebene und Bauphasen.
- **Stückliste und Kosten** mit Richtpreisen, je Gewerk wahlweise Firma oder **Eigenleistung** (eigene Geräte, Material zu Selbstkosten, Stunden), Planungsleistungen als Einzelposten.
- **Bauablauf** im Kalender: Feiertage je Bundesland, Winterpause, Betonreife nach Monatstemperatur (Nurse-Saul), Kolonnen je Gewerk, kritischer Pfad, Wasserhaltung in Kalendertagen; Gantt-Diagramm mit Daten.
- **Bauantrag:** Register mit Verfahren, amtlichen Formularen, Bauvorlagen, Unterschriftsregel und Prüfpflicht der Statik für alle deutschen Länder und weitere Staaten (Stand und Quelle je Eintrag); Verfahren je Lage des Grundstücks, Flächen und Rauminhalt (DIN 277), Kosten (DIN 276), Baubeschreibung, Angaben für die Baustatistik, Ausfüllhilfe und Bauzeichnungen als Entwurf; ausfüllbare PDF-Formulare der Behörde lassen sich lokal vorbefüllen.
- **Radonschutz:** Referenzwert, Rechtsgrundlage und Neubaupflichten je Land, Bodenluft und ausgewiesene Gebiete am Standort, Abschätzung des Radoneintrags (Diffusion durch den Beton, zulässiger Bodenluftzustrom mit und ohne Lüftung), Maßnahmen (in Deutschland nach § 154 StrlSchV) und Messempfehlung.
- **Varianten:** Planungsstände speichern, mit Mengen, Kosten, Bauzeit, Ausnutzung und Schutzwerten nebeneinander vergleichen, wieder übernehmen; Vergleich als CSV oder Druck.
- **Betrieb & Wartung:** Wartungsplan aus der geplanten Ausstattung und den Regeln des Landes (Lüftung, Filter, Türen, Hebeanlage, Notstrom, Kraftstoff, Batterien, Vorräte, Elektro, Melder, Feuerlöscher), Termine ab Inbetriebnahme, Kalenderdatei (ICS), CSV und Druck.
- **IFC-Export (BIM):** Rohbau, Öffnungen mit Türen, Räume, Treppen, Aufzüge, Zugänge, Leitungen und Einbauten als IFC4 mit Baustoffen, Eigenschaften und Mengen, für Architektur-, Tragwerks- und Koordinationssoftware.
- **Einkauf** mit konkreten Produkten, Gebinden, Preisbelegen und standortbezogenen Lieferangeboten.
- **Ausgaben:** Projektdatei (`.bunker.json`), Stückliste und Einkaufsliste als CSV, Planungsbericht, statische Berechnung, Bewehrungspläne mit Biegeliste (Druck bzw. PDF), Biegeliste als CSV und BVBS-Datei (BF2D) für Biegemaschinen.

## Schnellstart

Voraussetzungen: Python 3.9 oder neuer (nur Standardbibliothek) und ein aktueller Browser (Chrome, Edge, Firefox, Safari).

- **Windows:** Doppelklick auf `Bunkerplaner starten.bat`.
- **Linux / macOS:** im Projektordner `python3 server.py` ausführen.

Der Browser öffnet `http://127.0.0.1:8874/`. Anderer Port: `python3 server.py 8890`, ohne automatischen Browserstart: `python3 server.py --no-browser`. Beenden mit Strg+C.

Der Server lauscht nur auf `127.0.0.1` und wird für die Abrufe aus dem Netz gebraucht (Ortssuche, Grundwasser-Referenzwerte, Klima, Wechselkurse, Erdbebenwerte USA, Händlerpreise, amtliche Formulare). Ohne Server (`index.html` direkt geöffnet) funktioniert die Planung, diese Abrufe aber nicht.

## Planungsschritte

| Schritt | Eingaben | Ergebnisse |
|---|---|---|
| 1 Standort & Baugrund | Adresse oder Kartenpunkt, Geländehöhe, Bodenart, Wasserstand | Wasser über Sohle, BGR-Referenzmessstellen in der Nähe |
| 2 Nutzung & Lasten | Personen, Aufenthaltsdauer, Erdüberdeckung, Höhenlage / Erdhügel, Nutzung oben, Verdichtung, Geschosse darüber | Lasten auf Decke und Wände, Übersicht der Einwirkungen |
| 3 Schutzgrad | Luftstoß, Strahlung, ABC, Brand, Erschütterung, EMP, Sonderanforderungen | Lastfall Luftstoß, TWK-Mindestwerte, Betonäquivalent, Schutztechnik in der Stückliste |
| 4 Grundriss | Layout-Vorschlag oder eigene Kontur, Ebenen, Wände, Türen, Zugänge, Räume, Stützen, Unterzüge, stützenfreie Bereiche, Innentreppen, Aufzüge | Flächen, Raumliste, Treppen- und Aufzugsgeometrie, Rettungsweg-Prüfung, automatisches Stützenraster |
| 5 Konstruktion | Dicken, Beton, Rissbreite, Zwang, Feuerwiderstand, Abdichtung, Dämmung, Sohlaufbau, Baugrube | Höhenkoten (auch in m NHN), Aushub, Verfüllung, Erdmassen |
| 6 Tragwerk | – | FE-Platten mit Momentenbildern, Wände, Stützen, Durchstanzen, Unterzüge, Treppen, Aufzugsgruben; Sohldruck, Grundbruch, Setzung, Auftrieb, Böschungen, Feuerwiderstand, Fugen; Lastfall Luftstoß; statische Berechnung, Bewehrungspläne, Biegeliste, BVBS |
| 7 Schutznachweise | Szenarien, Schichten je Bauteil, Prüfunterlagen | Zuordnung der Unterlagen zum Planstand, offene Punkte |
| 8 Technik & Vorräte | Lüftung, Überdruck, Leitungswege, Verbraucher, Aufstellung des Aggregats, Kühlung, Entwässerung, Wasser, Lebensmittel | Lüftungsgeräte, Filterbetrieb, Explosionsschutzventile, Kollisionen, Durchführungen, Wärmebilanz, Batterie, Aggregat mit Tank und Abgas, Hebeanlage, Tanks |
| 9 Material & Kosten | Ausführung je Gewerk, Geräte, Beton, Schalung, Preise, Planungsposten | Stückliste, Kosten nach Kategorie, Eigenleistungsstunden, CSV |
| 10 Bauablauf | Baubeginn, Leistungswerte, Dauern | Gantt mit kritischem Pfad, Wasserhaltung, Bauphasen im 3D-Modell |
| 11 Varianten | Name des Planungsstands | Vergleich mit dem aktuellen Stand: Bauteile, Mengen, Kosten, Bauzeit, Ausnutzung, Schutzfaktor, Radon; Übernehmen mit Rückgängig |
| 12 Bauantrag | Zuständigkeit, Lage des Grundstücks, Bauherrschaft, Grundstück, Entwurfsverfasser | Verfahren, Formulare mit Aktualitätsprüfung, Unterlagenliste, Bauvorlagen (Baubeschreibung, DIN 277, DIN 276, Statistik, Zeichnungen), vorbefülltes PDF-Formular |
| 13 Freigaben | Checkliste von der Vorklärung bis zur Abnahme | Offene Punkte, Planungsbericht, statische Berechnung, Bewehrungspläne, Biegeliste, IFC-Modell |
| 14 Betrieb & Wartung | Inbetriebnahme | Wartungsplan mit Zuständigkeit, Grundlage und Terminen, Kalenderdatei (ICS), CSV, Druck |

Meldungen erscheinen im jeweiligen Schritt; Meldungen zu einem Bauteil (z. B. „Innenwand 2 …“) lassen sich anklicken und markieren das Bauteil im Grundriss.

### Grundriss bedienen

| Taste | Funktion |
|---|---|
| V | Auswählen und Ziehen: Außenkanten, Wände, Türen, Zugänge |
| W | Innenwand: zwei Punkte klicken, fängt an Wandflächen und am 5-cm-Raster, Shift für schräge Wände |
| T | Tür auf eine Wand setzen |
| R | Raum benennen (oder Doppelklick in einen Raum) |
| L | Leitungsweg zeichnen, Enter beendet |
| S, U | Stütze setzen, Unterzug zeichnen |
| D | Innentreppe bzw. Aufzug beim Setzen oder in der Auswahl um 90° drehen |
| Bild ↑, Bild ↓ | Ebene wechseln |
| F, +, − | Einpassen, Zoom (auch Mausrad) |
| Entf, Esc | Löschen, Abbrechen |
| Strg+Z, Strg+Y | Rückgängig, Wiederholen |
| Strg+S | Projektdatei speichern |

Verschieben mit rechter Maustaste oder Leertaste + Ziehen. Treppenabgang und Notausstieg werden über die Werkzeugleiste auf eine Außenwand gesetzt; die Treppe ergibt sich aus der Tiefe nach der Schrittmaßregel. Zugänge, die in das Bauwerk ragen oder sich überschneiden, und überlappende Öffnungen werden gemeldet.

### Layout-Vorschläge

Im Schritt Grundriss werden aus Personenzahl und Aufenthaltsfläche je Person Grundformen erzeugt und mit Schutzgrad, Bauteildicken und Preisen komplett durchgerechnet (Außenmaß, Fläche je Person, Beton, Spannweite, Kosten). Mit einer Baufeldgröße wird markiert, was passt, bei Bedarf gedreht.

| Grundform | Personen | Kennzeichen |
|---|---|---|
| Kompakt | bis 15 | fast quadratisch, tragende Querwand |
| Röhre | bis 100 | schmal und lang, kurze Spannweite |
| L-Form | bis 100 | Technik und Sanitär im kurzen Schenkel |
| Zweiraum | bis 40 | tragende Längswand halbiert die Spannweite |
| Mittelflur | bis 150 | Räume beidseitig am Flur |
| Großschutzraum | ab 20 | Abschnitte für je bis 50 Personen mit Schlafkabinen (4 bzw. 6 Betten), Aufenthalt und Sanitär; Zwischenschleusen mit Schutztüren; Eingang mit Schleuse, Dekontamination und Sanitätsraum; über 100 Personen zwei Flügel mit zweitem Zugang; zusätzliche Notausstiege, wo Wege zu lang würden |

Wäre ein Punkt im Bauwerk mehr als 30 m Luftlinie vom nächsten Zugang entfernt, werden Notausstiege an freien Stellen der Außenwand ergänzt. Röhre, L-Form und Mittelflur werden bis 100 m Länge angeboten; Grundformen, deren Vorbemessung mit den aktuellen Bauteildicken nicht aufgeht, werden ausgeblendet. **Übernehmen** ersetzt Grundriss und Leitungen, Strg+Z holt den alten Stand zurück.

### Erdhügel

Unter Nutzung & Lasten → Höhenlage lässt sich der Fußboden ebenerdig oder nur wenig unter das Gelände legen; das Bauwerk ragt dann über das Gelände und die Erde wird als Hügel aufgeschüttet. Eingaben: Fußboden unter Gelände, Kronenüberstand, Böschung 1 : n, Schüttmaterial. Der Hügel liegt über der konvexen Hülle des Grundrisses (Einbuchtungen werden bis zur Krone aufgefüllt). Lasten werden ab Oberkante Hügel gerechnet, die Baugrube nur bis zur Gründung. Das Hügelvolumen wird abzüglich Bauwerk, Treppeneinschnitten und Schachtköpfen bilanziert (Aushub → Hügel → Lieferung bzw. Abfuhr). Treppen werden als Einschnitt mit Stützwänden bis zum Hügelfuß ausgebildet, Notausstiege bis über die Hügeloberfläche geführt.

### Ausführung: Firma oder Eigenleistung

Jedes Gewerk (Erdarbeiten, Beton, Schalung, Bewehrung, Abdichtung, Ausbau, Haustechnik, Schutztechnik, Baustelle) lässt sich auf *Firma* (Richtpreis inkl. Einbau) oder *Eigenleistung* (Material, Mietgeräte und Betriebskosten plus Stunden) stellen. Wählbar sind eigener oder gemieteter Bagger, Rüttelplatte, Betonförderung (Pumpe, Rutsche, Kübel am Bagger), Transportbeton, eigenes Werk zu Selbstkosten oder Baustellenbeton sowie Miet-, Kauf- oder vorhandene Schalung. Materialpreise sind je Position änderbar. Auf Eigenleistung wird keine Mehrwertsteuer angesetzt. Baustellenbeton wird gegen die Mischleistung je Betonierabschnitt geprüft; für WU- und C30-Beton weist das Tool auf Überwachungsklasse 2 hin.

Planungs- und Prüfleistungen (Baugrundgutachten, Statik mit Bewehrungsplänen, Prüfstatik, Vermessung, Bauantrag, Elektro-Abnahme) stehen als Einzelposten mit Richtwerten nach Bauwerksgröße; alternativ ein Prozentansatz.

### Schutzgrad, Luftstoß und Szenarien

- **Luftstoß** 100 kN/m² (oder eigener Wert) als außergewöhnliche Bemessungssituation nach TWK 2017: Decke gₖ + Φ·qₖ + ψ₂·q, erdberührte Außenwände e₀ + w + Φ·qₖ, Bodenplatte je nach Baugrund, im Grundwasser ×1,1. Φ = 1,2 für Biegung, 2,0 für Querkraft und gedrungene Bauteile. Plastische Bemessung über Bruchlinien mit dynamischen Festigkeiten (fcd 44 bzw. 38 MPa, fsd 600 MPa), Querkraft nach SIA 262. Reicht der Beton nicht, wird Schubbewehrung in Randstreifen eingerechnet und die Dicke genannt, ab der keine nötig ist. Das Deckenbeispiel der TWK 2017 (5,9 × 8,9 m, qd = 129,7 kN/m²) ergibt 133,7 kNm/m, die TWK nennt 134,9 kNm/m.
- **Mindestwerte TWK:** Decke und Außenwand 30 cm, Bodenplatte 25 cm (Fels 20 cm), tragende Innenwände 20 cm, Bewehrung 0,18 % je Zugseite.
- **Strahlung:** Betonäquivalent über dem Raum mindestens 65 cm (Erde mit 1.600 kg/m³).
- **ABC, Brand, Erschütterung, EMP:** Maßnahmen als Hinweise und als Positionen mit Richtpreis in der Stückliste.
- **Szenarien und Schichten (Schritt Schutznachweise):** Treffer- und Explosionsszenarien mit Bedingungen, Schichtaufbauten je Bauteil und Prüfunterlagen. Für eine ausdrücklich definierte ideale freie Luftdetonation mit belegter TNT-Modellladung werden reflektierter Spitzendruck und Impuls nach Kingery–Bulmash (UN IATG 01.80, Tabellen 12/13) im Bereich 0,05 ≤ Z ≤ 40 berechnet. Waffen-Gesamtmassen werden nie als TNT übernommen. Das Tool berechnet **keine Schutzwirkung und keine überlebbare Trefferzahl**; es prüft nur Vollständigkeit, Dicken und Planstand der eingetragenen Fachunterlagen. Jede relevante Planänderung macht eine Zuordnung ungültig.

### Abdichtung

Unter Konstruktion werden die Wassereinwirkungsklassen nach DIN 18533 getrennt für Wände, erdüberdeckte Decke und Bodenplatte festgelegt und Detailpunkte dokumentiert (Rissklasse, Nutzung, Fugen, Durchführungen, Deckenanschlüsse, Dränage, Radon, Tauwasser, Prüfung vor Verfüllung). Ein unbekannter Wasserstand wird nicht zu null gesetzt. PMBC bei hohem Druckwasser und ungeeignete Klassen werden als Fehler gemeldet.

### Einkauf und Händlerpreise

Jede Planposition kann ein konkretes Produkt mit Artikelnummer, Händler, Quelle, Preisstand, Gebinde, Verbrauch und Bruttopreis erhalten; die Bestellmenge wird auf ganze Gebinde aufgerundet, Beträge werden in Cent summiert. Lieferkosten werden je Händler für den aktuellen Warenkorb und Standort bestätigt; Änderungen an Adresse, Mengen oder Angeboten entwerten die Bestätigung. Angebote mit abgelaufener Gültigkeit oder einem Preisstand älter als 12 Monate zählen nicht. **Händlerpreis live abrufen** unterstützt beispielhaft Produktseiten von bausep.de (nur eindeutige Produktdaten, keine Variantenparameter, keine Projektadresse). Richtkosten, erfasste Warenpreise und vollständig bestätigter Einkauf bleiben getrennte Ergebnisse.

## Rechengrundlagen

- **Normprofil je Land:** Teilsicherheits- und Kombinationsbeiwerte, Baustoffkennwerte, Querkraft, Durchstanzen, Rissbreite und Mindestbewehrung, Feuerwiderstand, Geotechnik und Erdbeben nach dem Profil des Landes (`js/normen.js`, `js/normen-daten.js`): Eurocode mit nationalen Parametern (ohne eigenen Anhang die EN-Empfehlungswerte, im Bericht genannt), SIA 260–267, ACI 318-19 mit ASCE 7-22 (Lasten, Erdbeben) und IBC 1806.2 (Sohldruck als zulässige Spannung). Fundstellen stehen je Nachweis in Oberfläche und Bericht. Die folgenden Angaben beschreiben das deutsche Profil.
- **Lasten:** Teilsicherheiten γG = 1,35, γQ = 1,5, quasi-ständig mit ψ₂ der Nutzung. Erdüberdeckung unterhalb des Wasserspiegels mit gesättigter Wichte. Treppen nach DIN EN 1991-1-1/NA Kat. T.
- **Platten (FE):** schubweiche Plattenelemente (MITC4) auf einem Rechteckraster, Rechnung im Web Worker. Tragende Wände und Unterzüge als Linienlager, Stützen als Flächenlager, Außenwände als Rahmenecke mit Drehfeder; Bodenplatte elastisch gebettet (Bettungsmodul aus dem Steifemodul) mit abhebenden Bereichen je Kombinationsgruppe. Verkehrslast zusätzlich feldweise, Lagerlast E (Füllungen) voll und leer. Bemessungsmomente bis 1,5·d vor Auflagern, Stützen, Aussparungen und unter Einzellasten über 2·d gemittelt (Singularitäten), im Feld ungemittelt; Unterzüge mit dem Lastverlauf aus den FE-Auflagerkräften. Zwischendecken tragen die Wände, Stützen, Unterzüge und Treppen der Ebene darüber mit deren Auflagerkräften. Bemessung je Knoten für Biegung, Querkraft (mit Querkraftbewehrung, wo nötig), Rissbreite und Zwang; Grundbewehrung je Lage plus Zulagen. Durchbiegung mit Kriechen (φ = 2,5) und Rissbildung, Grenze l/250. Ohne FE: Tafelverfahren (Timoshenko-Tafeln, Pieper/Martens).
- **Außenwände:** Erdruhedruck K₀ = 1 − sin φ, mindestens Verdichtungserddruck (DIN 4085), plus Wasserdruck; je Kante als FE-Platte mit Drehfedern an den Platten, an Zwischendecken und tragenden Innenwänden gestützt, Öffnungen ausgespart, Wandecken eingespannt und gelenkig (Hülle); ohne FE Durchlaufträger mit Momentenausgleich.
- **Einbauten:** Gewicht aus Leistung, Vorrat und Personenzahl, Aufstellung im passenden Raum (sonst unterste Ebene), Last als Flächenlast auf der Platte; Füllungen als eigene Lagerlast E (γ = 1,5, ψ₂ = 0,8, Behälter leer als eigene Kombination).
- **Luftstoß dynamisch:** Einmassenschwinger je Bauteil (Biggs, UFC 3-340-02), Widerstand aus der Bemessung mit dynamischen Festigkeiten, Decke mit Steifigkeit und Lastmassenfaktor der eingespannten Rechteckplatte; Grenzwerte μ ≤ 3 und θ ≤ 2°.
- **Erdbeben:** agR je Zone, γI, Untergrundparameter nach DIN EN 1998-1/NA; Erddruckzuwachs auf starre Wände nach DIN EN 1998-5 Anhang E.9; Gleiten mit der Masse aus G + ψ₂·Q + 0,8·E gegen tan φ′/1,25.
- **Innen- und Schachtwände:** Normalkraft aus den Auflagerkräften (größter Mittelwert über 1 m), Tragfähigkeit auf der sicheren Seite nach EC2 12.6.5.2 mit Schlankheit und Ausmitte.
- **Stützen:** EC2 5.8.8 Nennkrümmung mit λlim nach NA DE, e₀ = max(h/30; 20 mm), eᵢ = l₀/400, zweiachsig nach 5.8.9, Stabanordnung wie im Plan; As,max = 0,09 Ac auch im Stoßbereich. Durchstanzen nach EC2 6.4 mit NA DE (Decken u₁ bei 2 d, Bodenplatte mit iteriertem Rundschnitt und Bewehrung nach NCI zu 6.4.5, Öffnungen bis 6 d); Lasten darüberstehender Stützen gehen direkt durch.
- **Unterzüge:** Durchlaufträger mit feldweiser und benachbarter Verkehrslast, Bügel nach EC2 6.2.3, Biegeschlankheit mit K je System.
- **Treppen und Aufzüge:** Laufplatte als Einfeldplatte (Biegung, Querkraft, Schlankheit, Dicke daraus); Aufzüge nach EN 81-20 Tab. 6 mit Schacht, Grube, Schachtkopf, Antrieb, Pufferlasten und Grubennachweis.
- **Rissbreite und WU:** unter quasi-ständiger Last nach EC2 7.3.4, Zwang nach EC2 7.3.2 (hef = 2,5·d₁) oder über Fugen; Betonierabschnitte und Arbeitsfugen nach WU-Richtlinie.
- **Gründung:** Sohldruck (Tabellenwert), Grundbruch nach DIN 4017 (Ersatzrechteck, γR,v = 1,4), Setzung nach DIN 4019 (Steinbrenner, kennzeichnender Punkt, Grenztiefe 20 %, Wiederbelastung mit 3 Es, Erdhügel als Ringlast), Auftrieb 1,05·U ≤ 0,95·G im Endzustand und im Rohbau.
- **Böschungen:** Gleitkreise nach Bishop mit tan φ/1,25, c/1,25 und veränderlichen Lasten × 1,3 (DIN 4084, BS-P), dazu die flache Gleitfläche bei nichtbindiger Schüttung; Baugruben bis 5 m mit Regelneigung nach DIN 4124 ohne Nachweis.
- **Feuerwiderstand:** Tabellenverfahren DIN EN 1992-1-2 für Platten, Flachdecken, Wände, Stützen (Methode A, μfi = 0,7, Fußnote 8 Stäbe), Balken und Treppen; Betondeckung der Stützen und Treppen nach Feuerwiderstandsklasse.
- **Bewehrung:** Biegeliste mit Positionen, Biegeformen, Stablängen ≤ 12 m mit Übergreifungsstoß (EC2 8.7, NA DE), Rahmenecken mit Schenkeln in Stoßlänge und Biegerolle 15 Ø, Randbewehrung an Aussparungen, Durchstanz- und Querkraftbügel; BVBS 2.0 (BF2D) mit Prüfsumme.
- **Mengen:** exakte Geometrie (Raumflächen über ein Zellraster), Baugrube mit Böschung, Stahlmengen aus der Biegeliste (Zugänge und Aufzugsgruben nach Ansatz), 3 % Verschnitt.
- **Lüftung und Schutztechnik:** CO₂-Bilanz Q = n·g / (C_innen − C_außen), Gerätestufen 75 bis 1.200 m³/h; Filterbetrieb mit Überdruck und zulässiger Leckage der Hülle; Explosionsschutzventile je Luftdurchführung nach Luftmenge.
- **Haustechnik:** Wärmebilanz aus Personen und Geräten gegen Erdreich und Sommer-Außenluft, Kühlgerät bei Bedarf; Schmutzwasser nach DIN EN 12056-2, Hebeanlage nach DIN EN 12056-4; Aggregat nach Spitzenlast und Aufzugsanlauf, Kraftstoff nach Verbrauchskennlinie (Leerlaufanteil), Tank mit AwSV-Gefährdungsstufe, Verbrennungsluft, Abgasleitung, Kühlluft des Maschinenraums.
- **Abschirmung:** Halbwertsdicken Beton 6 cm, Erde 8 cm; Betonäquivalent nach TWK 2017.
- **Platzbedarf:** Schweizer Schutzraum-Mindestwerte 1 m² und 2,5 m³ je Person als Warngrenze; Rettungsweg als Luftlinie zum nächsten Zugang (Hinweis ab 35 m).
- **Vorräte:** 2 L Trinkwasser je Person und Tag (BBK-Empfehlung), rund 1,5 kg Lebensmittel.
- **Bauablauf:** Arbeitstage ohne Wochenenden, Feiertage und Winterpause (höchstens 120 Tage); Wartezeiten nach dem Betonieren als wirksames Alter bei 20 °C (Nurse-Saul, Monatsmittel DWD 1991–2020); Ressourcen-Zeitplanung mit Kolonnen je Gewerk.
- **Verifikation:** FE-Platten gegen Navier und Timoshenko, Durchlaufträger, EC2-Querschnitte gegen Faserverfahren, Durchstanzen, Einmassenschwinger gegen Biggs, DIN 4017 und Steinbrenner; Netzstudie mit halber Netzweite im Bericht.

Bodenkennwerte, Preise und Leistungswerte sind Startwerte für die Vorplanung und lassen sich überall überschreiben.

## Grenzen

- Vorbemessung, keine Ausführungsstatik. Die statische Berechnung ist zur Prüfung gegliedert, ersetzt aber nicht den von einem Tragwerksplaner aufgestellten und unterschriebenen Standsicherheitsnachweis und nicht dessen Prüfung. Für Bauantrag und Ausführung sind Baugrundgutachten, Tragwerksplanung mit Prüfstatik und ein Abdichtungskonzept nötig.
- Der Luftstoß-Lastfall folgt den Schweizer TWK 2017; ob und wie er für ein Projekt in Deutschland angesetzt wird, entscheidet die Fachplanung.
- Bewehrungspläne und Biegeliste sind Vorplanungsunterlagen: Verlegepläne mit Abstandhaltern, Stoßversatz und Detailpunkten (Öffnungen, Einbauteile, Fugenbänder) erstellt die Ausführungsplanung.
- Vereinfachungen: Innenwände wie unbewehrte Wände (sichere Seite), Stützenquerschnitt ohne Seitenstäbe, FE-Bodenplatte mit Winkler-Bettung, Setzung stationär im Ersatzrechteck, Böschungen ohne Strömungsdruck (Wasserhaltung), Wärmebilanz stationär, Aufzugs- und Haustechnikwerte als Richtwerte bis zur Herstellerplanung.
- Nicht nachgewiesen: Schutzwirkung bei Direkt- und Mehrfachtreffern, Penetration und Splittern, Bodenstoß, Trümmerlast (Hinweis ab 8 Geschossen), Heißbemessung über das Tabellenverfahren hinaus. Erdbeben nur vereinfacht für das steife, erdüberdeckte Bauwerk (Plateauwert, Anhang E.9), Verflüssigung als Hinweis an das Gutachten. Der Einmassenschwinger ist eine Vorbemessung.
- Produktbeispiele und Herstellerangaben sind Beispiele mit Abrufdatum; Maße, Gewichte und Zulassungen vor der Bestellung beim Hersteller prüfen.
- Die Programmverifikation zeigt, dass die Rechenverfahren richtig umgesetzt sind; eine unabhängige Kontrollrechnung durch den Tragwerksplaner bzw. Prüfingenieur ersetzt sie nicht (dafür das Vergleichspaket).
- Baugrube und Hügel werden mit Gehrungs-Offsets der Außenkontur bzw. ihrer konvexen Hülle gerechnet; der Schnitt zeigt die Baugrube senkrecht zur geschnittenen Wand.
- Richtpreise sind Startwerte (Stand 2026); außerhalb Deutschlands mit dem Baupreisniveau des Landes umgerechnet, nicht regional angepasst.
- Normprofile außerhalb Deutschlands sind an Referenzbeispielen geprüft, aber weniger erprobt als das deutsche Profil. Nationale Besonderheiten, die nicht abgebildet sind, nennt der Bericht als Annahme; maßgebend ist die Fassung der Norm, die die Tragwerksplanung anwendet.
- Erdbeben: Gleiten ohne Erdwiderstand an den Seitenwänden (sichere Seite).
- Radon: Die Abschätzung zeigt die Größenordnung; der Haupteintrag über Fugen, Risse und Durchführungen lässt sich nicht vorausberechnen. Nur eine Messung nach Fertigstellung zeigt den tatsächlichen Wert.
- Wartungsplan: Intervalle aus Behörden-, Norm- und Herstellerangaben mit Bewertung je Aufgabe; Herstellerangaben und Auflagen der Behörde haben Vorrang.
- IFC: Geometrie wie im 3D-Modell (Extrusionen); Bewehrung, Abdichtung, Dämmung und Baugrube sind nicht als Bauteile enthalten, Einbauten sind Platzhalter.
- Bauantrag: Das Register gibt den recherchierten Stand mit Datum und Bewertung (amtlich belegt, Sekundärquelle, ungeprüft) wieder; Bauordnungen und Formulare ändern sich. Verfahren und Formulare vor der Einreichung bei der Behörde bestätigen. Unterschreiben und einreichen müssen Bauherrschaft und bauvorlageberechtigte Person; der amtliche Lageplan und der Standsicherheitsnachweis kommen nicht aus dem Bunkerplaner.

## Externe Dienste und Datenschutz

Es gibt keine Konten, keine Analyse und keine Übertragung von Projektdaten an Dritte. Externe Abrufe finden nur statt, wenn die jeweilige Funktion genutzt wird:

| Funktion | Dienst | Was übertragen wird |
|---|---|---|
| Ortssuche | OpenStreetMap Nominatim (über den lokalen Server) | der eingegebene Suchtext |
| Karte / Luftbild | Kacheln von OpenStreetMap bzw. Esri (direkt aus dem Browser) | der angezeigte Kartenausschnitt; erst nach „Karte / Luftbild laden“ oder Ortswahl |
| Grundwasser-Referenzwerte | BGR GRUVO (über den lokalen Server) | nichts Standortbezogenes: der Datensatz wird geladen, die nächsten Messstellen werden lokal bestimmt |
| Händlerpreis live abrufen | bausep.de (über den lokalen Server) | nur die eingetragene Produkt-URL |
| Klima am Standort | NASA POWER (über den lokalen Server) | Koordinaten des Standorts |
| Wechselkurse | EZB, ergänzend currency-api (über den lokalen Server) | nichts Projektbezogenes |
| Erdbebenwerte USA (SDS, SD1) | USGS Seismic Design Web Services, ASCE/SEI 7-22 (über den lokalen Server) | Koordinaten, Risikokategorie und Site Class |
| Amtliche Formulare (Aktualität prüfen, ausfüllen) | Server der zuständigen Behörde, nur Adressen aus dem Formularregister (über den lokalen Server) | nur die Formularadresse; das Ausfüllen geschieht lokal im Browser |
| Händler suchen | Google-Suche (neuer Tab, erst bei Klick) | Positionsname und Standort |

Es gelten die Nutzungsbedingungen der Anbieter, insbesondere die [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) und [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) der OpenStreetMap Foundation sowie die Bedingungen von Esri für die Luftbilder. Die Kartenquellen stehen gesammelt in `MAP_LAYERS` in `js/panels.js`; wer eine eigene Kachelquelle nutzt, trägt sie dort und in der Content Security Policy in `server.py` ein. Für Nominatim sendet der Server eine eigene Kennung, die sich über die Umgebungsvariable `BUNKERPLANER_UA` setzen lässt (z. B. mit Projekt-URL). Die Schrift Archivo wird lokal ausgeliefert.

## Speicherung und Projektdateien

- Das aktuelle Projekt wird automatisch im Browser gespeichert (localStorage). **Speichern** legt eine `.bunker.json` ab, **Öffnen** lädt sie wieder.
- Beim Öffnen wird jede Datei typgerecht auf das aktuelle Modell abgebildet: unbekannte Felder fallen weg, Zahlen werden auf die zulässigen Bereiche begrenzt, IDs und Kataloge geprüft. Ungültige Dateien werden abgelehnt, ohne das offene Projekt zu verändern.
- Lässt sich ein im Browser gespeichertes Projekt nicht laden, wird es nicht überschrieben, sondern aufgehoben und kann als Datei gesichert werden.
- Projektdateien aus der Vorversion (`bunker-outline`) werden übernommen: Kontur, Wände, Höhen, Zugänge, Leitungen und Schutzprofil.
- Projektdateien enthalten Adresse und Koordinaten. `.gitignore` schließt `*.bunker.json` und den Laufzeitordner `.runtime/` aus.

## Tests

```
node tests/planning.test.cjs                              # fachliche Regressionstests (oder: npm test)
python3 -m unittest discover -s tests -p "test_*.py"      # Preisadapter und Serverdaten (Formularregister, USGS)
```

Browsertest (Playwright, separater Browserkontext, verändert keine geöffneten Projekte):

```
npm install
npx playwright install chromium     # oder einen installierten Browser über BP_BROWSER_CHANNEL nutzen
python3 server.py --no-browser      # in einem zweiten Terminal
npm run test:browser
```

Umgebungsvariablen: `BP_BASE_URL` (Standard `http://127.0.0.1:8874/`), `BP_BROWSER_CHANNEL` (z. B. `msedge`, `chrome`) oder `BP_BROWSER` (Pfad zur Browserdatei), `PLAYWRIGHT_MODULE` (Pfad zu Playwright), `BP_LIVE_PRICE=1` für einen echten Preisabruf statt der Testantwort, `BP_ARTIFACTS` für Screenshots und Downloads (Standard `.runtime/planning-qa`).

## Projektstruktur

| Pfad | Inhalt |
|---|---|
| `index.html`, `css/app.css` | Oberfläche |
| `js/i18n.js`, `js/i18n-en.js`, `js/i18n-es.js` | Sprachen: Übersetzungsfunktion, Zahlen- und Datumsformat, Wörterbücher Englisch und Spanisch (siehe `docs/I18N.md`) |
| `js/laender.js`, `js/laender-daten.js`, `js/feiertage-daten.js` | Länder und Regionen: Währung, MwSt., Baupreisniveau, Klima, Höhenbezug, Feiertage |
| `js/normen.js`, `js/normen-daten.js` | Normprofile: Eurocode mit nationalen Parametern, SIA, ACI/ASCE, Erdbeben je Norm |
| `js/geo.js` | Geometrie (Polygone, Offsets, Hülle, Raster) |
| `js/model.js` | Datenmodell, Kataloge, Richtpreise, Import und Prüfung von Projektdateien |
| `js/calc.js` | Höhen, Geometrie, Statik inkl. Luftstoß, Stützen, Durchstanzen, Unterzüge, Mengen, Erdarbeiten, Kosten, Bauablauf, Prüfungen |
| `js/fe.js`, `js/slabs.js`, `js/fe-worker.js` | FE-Platten, Bettung, Auflagerkräfte, Rechnung im Web Worker |
| `js/lifts.js` | Aufzüge nach EN 81-20 |
| `js/verify.js` | Grundbruch, Setzung, Böschungen, Feuerwiderstand, Treppen, Aufzugsgruben, Betonierabschnitte, Einmassenschwinger, Erdbeben |
| `js/haustechnik.js` | Abwasser, Wärmebilanz und Kühlung, Schutzlüftung, Notstrom, Explosionsschutzventile, Einbauten, Produktbeispiele |
| `js/kalender.js` | Baukalender: Feiertage je Bundesland, Winterpause, Monatstemperaturen, Betonreife |
| `js/benchmarks.js` | Referenzbeispiele zur Verifikation des Rechenprogramms |
| `js/vergleich.js` | Vergleichspaket für die Kontrollrechnung und DXF der Systemlinien |
| `js/rebarplans.js` | Biegeliste, BVBS-Datei, Bewehrungspläne |
| `js/statikreport.js` | statische Berechnung (Gliederung, Seiten, Inhaltsverzeichnis) |
| `js/calc-extra.js` | Leitungen (Kollisionen, Durchführungen) und Schutzaufbau |
| `js/layouts.js` | Layout-Vorschläge |
| `js/planning.js`, `js/planning-ui.js` | Szenarien, Abdichtungsdetails, Produkt- und Lieferangebote |
| `js/plan2d.js`, `js/section.js`, `js/view3d.js` | Grundriss, Schnitt, 3D-Modell |
| `js/radon.js`, `js/radon-daten.js` | Radonschutz: Referenzwerte je Land, Abschätzung, Maßnahmen |
| `js/wartung.js`, `js/wartung-daten.js` | Betrieb und Wartung: Aufgaben je Ausstattung und Land, Termine, Kalenderdatei |
| `js/varianten.js` | Variantenvergleich |
| `js/ifc.js` | IFC4-Export (STEP) |
| `js/bauantrag.js`, `js/bauantrag-daten.js` | Bauantrag: Register der Zuständigkeiten, Verfahren, Flächen/Kosten, Ausfüllhilfe, Bauvorlagen |
| `js/panels.js`, `js/app.js`, `js/export.js` | Schritte, Bedienung, Export und Bericht |
| `server.py`, `supplier_prices.py` | lokaler Server, Ortssuche, BGR-Grundwasser, Händlerpreis |
| `vendor/` | three.js, Leaflet, pdf-lib, Schrift Archivo (siehe Drittanbieter) |
| `tests/` | Regressions-, Adapter- und Browsertests |

## Quellen

- TWK 2017 – Technische Weisungen für die Konstruktion und Bemessung von Schutzbauten, Bundesamt für Bevölkerungsschutz BABS (Schweiz)
- DIN EN 1990, DIN EN 1991-1-1, DIN EN 1992-1-1 und DIN EN 1992-1-2 jeweils mit NA DE; DIN EN 1997-1 mit NA und DIN 1054; DIN 4017, DIN 4019, DIN 4084, DIN 4085, DIN 4124, DIN 18533, DIN 1045-2/-3
- DAfStb-Richtlinie Wasserundurchlässige Bauwerke aus Beton (WU-Richtlinie)
- DIN EN 81-20 (Aufzüge), DIN EN 12056-2/-4 (Schwerkraftentwässerung, Abwasserhebeanlagen), AwSV (Anlagen mit wassergefährdenden Stoffen)
- Richtlinie für den elektronischen Datenaustausch von Bewehrungsdaten, BVBS 2.0 (BF2D)
- Halfen: Durchstanzen von Fundamenten nach NA(D) zu Eurocode 2 (2012) – Erläuterung der NCI zu 6.4.5
- DIN EN 1998-1 mit NA DE (2011) und DIN EN 1998-5 (Erdbeben)
- J. M. Biggs: Introduction to Structural Dynamics (1964); UFC 3-340-02 Structures to Resist the Effects of Accidental Explosions (2008) – Einmassenschwinger, Grenzwerte
- S. Timoshenko, S. Woinowsky-Krieger: Theory of Plates and Shells (1959) – Plattenbeiwerte
- G. A. Rombach: Anwendung der Finite-Elemente-Methode im Betonbau (Ernst & Sohn) – Mittelung von Bemessungsmomenten
- Reifegrad nach Nurse-Saul; Monatsmittel der Lufttemperatur in Deutschland, DWD 1991–2020
- [BABS / LABOR SPIEZ: Technisches Pflichtenheft TPH-11, Belüftungsgeräte für Schutzräume](https://www.babs.admin.ch/dam/de/sd-web/vmP0i9O4DOJe/tph11-de.pdf)
- [UN IATG 01.80 (2015/2016)](https://s3.amazonaws.com/unoda-web/wp-content/uploads/2019/05/IATG-01.80-Formulae-for-Ammunition-Management-V.2.01.pdf), Tabellen 12/13 – begrenztes Freiluftmodell
- [NIST SP 811, Anhang B.8](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8) – Energieeinheiten
- Szenario-Katalog: Angaben der GUR zu den Varianten [Geran-2](https://war-sanctions.gur.gov.ua/ru/components/part/4798), [Geran-3](https://war-sanctions.gur.gov.ua/en/page-geran-3), [Geran-4](https://gur.gov.ua/en/content/warsanctions-hur-rozkryvaie-budovu-novoho-rosiiskoho-reaktyvnoho-udarnoho-bpla-yeran4), [Geran-5](https://war-sanctions.gur.gov.ua/en/page-geran-5) (Angaben einer Konfliktpartei zu untersuchten Ausführungen) sowie [OTR-21 Tochka](https://en.wikipedia.org/wiki/OTR-21_Tochka) als Systembeschreibung. Daraus werden keine Wirkungswerte abgeleitet.
- [BGR GRUVO](https://gruvo.bgr.de/) – Grundwasser-Kurzfristvorhersage an Referenzmessstellen, [Datenlizenz Deutschland – Namensnennung – 2.0](https://www.govdata.de/dl-de/by-2-0)
- [Sopro: Bauwerksabdichtung, Übersicht 2025](https://www.sopro.com/fileadmin/customer/productdata/de_DE/BAU_2025/epaper_kellerdicht_abdichtung/epaper/ausgabe.pdf) – Beispiel für Verbrauchswerte einer Dickbeschichtung

## Lizenz

[MIT](LICENSE). Mitgelieferte Bibliotheken, Schrift und Datendienste: siehe [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Änderungen: [CHANGELOG.md](CHANGELOG.md).
