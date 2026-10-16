# Drittanbieter

## Mitgelieferte Bibliotheken und Schrift

| Komponente | Version | Lizenz | Dateien |
|---|---|---|---|
| [three.js](https://threejs.org/) inkl. OrbitControls | r147 | MIT, © 2010–2022 three.js authors | `vendor/three.min.js`, `vendor/OrbitControls.js`, Lizenztext `vendor/three-LICENSE.txt` |
| [Leaflet](https://leafletjs.com/) | 1.9.4 | BSD-2-Clause, © 2010–2023 Volodymyr Agafonkin, © 2010–2011 CloudMade | `vendor/leaflet.js`, `vendor/leaflet.css`, Lizenztext `vendor/leaflet-LICENSE.txt` |
| [pdf-lib](https://pdf-lib.js.org/) inkl. pako, tslib, @pdf-lib/upng, @pdf-lib/standard-fonts | 1.17.1 | MIT, © 2019 Andrew Dillon; pako MIT/Zlib, tslib Apache-2.0 bzw. 0BSD, upng und standard-fonts MIT | `vendor/pdf-lib.min.js` (wird erst beim Ausfüllen eines Formulars geladen), Lizenztexte `vendor/pdf-lib-LICENSE.md`, `vendor/pdf-lib-THIRD-PARTY.txt` |
| [Archivo](https://github.com/Omnibus-Type/Archivo) (über @fontsource-variable/archivo 5.3.0) | 2020 | SIL Open Font License 1.1, © 2020 The Archivo Project Authors | `vendor/fonts/*.woff2`, `vendor/fonts/archivo.css`, Lizenztext `vendor/fonts/OFL.txt` |

## Mitgelieferte Daten

| Daten | Stand | Herkunft und Lizenz | Dateien |
|---|---|---|---|
| Bauantrag-Register: Verfahren, Formulare, Bauvorlagen und Zuständigkeiten für 16 Bundesländer und 50 weitere Zuständigkeiten | Recherche 16.10.2026 | eigene Zusammenstellung aus amtlichen Quellen (Gesetzesportale, Ministerien, Behörden; je Eintrag verlinkt und als amtlich, Sekundärquelle oder ungeprüft gekennzeichnet); Formulare werden nicht mitgeliefert, sondern bei der Behörde verlinkt | `js/bauantrag-daten.js` |
| Radon-Register: Referenzwerte, Rechtsgrundlagen, Neubaupflichten, Karten und Messempfehlungen für 39 Länder sowie Euratom und WHO | Recherche 16.10.2026 | eigene Zusammenstellung aus amtlichen Quellen (Strahlenschutzgesetze und -behörden, Richtlinie 2013/59/Euratom, WHO; je Eintrag verlinkt und bewertet); Diffusionsansatz nach der spanischen DB HS 6 | `js/radon-daten.js` |
| Wartungsregister: Aufgaben, Intervalle und Grundlagen für Schutzraum und Haustechnik (u. a. BABS, BBK, AwSV, DIN EN 12056-4, DIN 14406-4, NFPA, CDC, FEMA) | Recherche 16.10.2026 | eigene Zusammenstellung; Normtexte teils nur über Sekundärquellen (je Aufgabe bewertet und verlinkt); Herstellerangaben haben Vorrang | `js/wartung-daten.js` |
| Gesetzliche Feiertage 2026–2040 je Land und Region (außer Deutschland, dort eigene Regeln im Baukalender) | python-holidays 0.106 | erzeugt mit [python-holidays](https://github.com/vacanza/holidays), MIT, © Vacanza Team and individual contributors, © dr-prodigy 2017–2023, © ryanss 2014–2017 | `js/feiertage-daten.js`, Lizenztext `vendor/python-holidays-LICENSE.txt`, Mitwirkende `vendor/python-holidays-CONTRIBUTORS.txt` |
| Baupreisniveau je Land (Preisniveauindex Bauwerke) | Eurostat 2024, sonst Weltbank ICP 2021 | [Eurostat prc_ppp_ind](https://ec.europa.eu/eurostat/databrowser/view/prc_ppp_ind/default/table) (Wiederverwendung mit Quellenangabe, © Europäische Union); [World Bank ICP 2021](https://www.worldbank.org/en/programs/icp) (CC BY 4.0) | `js/laender-daten.js` |
| Wechselkurse als Startwerte | 15.10.2026 | Euro-Referenzkurse der [Europäischen Zentralbank](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html) (Quelle: EZB); übrige Währungen aus [currency-api](https://github.com/fawazahmed0/exchange-api) (CC0 1.0) | `js/laender-daten.js` |
| MwSt.-Regelsätze, Währungen, Höhenbezug, Klimamittel der Hauptstädte | Recherche 16.10.2026 | Steuerverwaltungen der Länder, PwC Worldwide Tax Summaries, Tax Foundation, ISO 4217, EPSG, Unicode CLDR; Klimamittel aus den Klimatabellen nationaler Wetterdienste, NOAA bzw. WMO (Monatsmittel, gerundet) | `js/laender-daten.js` |

Die Länderwerte sind Startwerte. MwSt., Wechselkurs und Preisniveau lassen sich im Projekt überschreiben; wo die Recherche unsicher war, ist das in den Daten vermerkt (z. B. `datumUnsure`).

Bibliotheken und Schriftdateien sind unverändert übernommen; `vendor/fonts/archivo.css` ist ein angepasstes Stylesheet (lokale Pfade, nur die verwendeten Schriftschnitte). Die Lizenztexte liegen jeweils daneben.

## Daten und Dienste

Diese Dienste werden nur auf Nutzeraktion abgerufen und sind nicht Teil des Repositorys. Es gelten die Bedingungen der Anbieter.

| Dienst | Verwendung | Nachweis / Bedingungen |
|---|---|---|
| OpenStreetMap | Kartenkacheln, Ortssuche über Nominatim | Daten © OpenStreetMap-Mitwirkende, [ODbL](https://www.openstreetmap.org/copyright); [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/), [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) |
| Esri World Imagery und World Boundaries and Places | Luftbild mit Beschriftung in der Standortkarte | Luftbild: Esri, Vantor, Earthstar Geographics, and the GIS User Community; Beschriftung: Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community; Nutzung nach den Bedingungen von Esri |
| Bundesanstalt für Geowissenschaften und Rohstoffe (BGR), GRUVO | Grundwasser-Referenzmessstellen (Kurzfristvorhersage) | [Datenlizenz Deutschland – Namensnennung – 2.0](https://www.govdata.de/dl-de/by-2-0) |
| NASA POWER (Langley Research Center) | Monatsmittel der Lufttemperatur am Standort (Klimatologie 2001–2020) | ohne Nutzungsbeschränkung (im AWS Open Data Registry als CC BY 4.0 geführt); Quellenangabe: „The data was obtained from the National Aeronautics and Space Administration (NASA) Langley Research Center (LaRC) Prediction of Worldwide Energy Resource (POWER) Project funded through the NASA Earth Science/Applied Science Program.“ |
| Europäische Zentralbank | aktuelle Euro-Referenzkurse | Quelle: EZB; [Nutzungsbedingungen](https://www.ecb.europa.eu/services/disclaimer/html/index.en.html) |
| currency-api (jsDelivr) | Kurse für Währungen ohne EZB-Referenzkurs | [CC0 1.0](https://github.com/fawazahmed0/exchange-api) |
| U.S. Geological Survey (USGS), Seismic Design Web Services | Bemessungswerte SDS, SD1, PGAM und SDC nach ASCE/SEI 7-22 für Standorte in den USA | Daten der US-Bundesregierung, gemeinfrei (USGS-Informationspolitik); Quellenangabe „U.S. Geological Survey“ |
| bausep.de | optionaler Abruf eines öffentlichen Produktpreises | Nutzungsbedingungen des Händlers; nur einzelne, vom Nutzer eingetragene Produktseiten |
