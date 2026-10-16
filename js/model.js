/* Projektmodell, Kataloge, Standardwerte, Migration. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const G = BP.geo;
  const T_ = BP.i18n.T, N_ = BP.i18n.N;

  let idCounter = 0;
  const uid = (p) => p + Date.now().toString(36).slice(-4) + (idCounter++).toString(36);

  /* Bodenarten: Tabellen-/Erfahrungswerte für die Vorbemessung. */
  const SOILS = {
    // Es: Steifemodul [MN/m²] (Erfahrungswerte, z. B. Grundbau-Taschenbuch), c: Kohäsion [kN/m²] für den Grundbruch
    kies:  { name: N_('Kies / Sand, dicht'), gamma: 19, gammaSat: 21, phi: 35, sigmaRd: 400, permeable: true, slope: 45, Es: 100, c: 0 },
    sand:  { name: N_('Sand, mitteldicht'), gamma: 18, gammaSat: 20, phi: 32.5, sigmaRd: 280, permeable: true, slope: 45, Es: 50, c: 0 },
    schluff: { name: N_('Schluff / Lehm, steif'), gamma: 20, gammaSat: 21, phi: 27.5, sigmaRd: 200, permeable: false, slope: 60, Es: 12, c: 5 },
    ton:   { name: N_('Ton, steif'), gamma: 20, gammaSat: 20.5, phi: 22.5, sigmaRd: 150, permeable: false, slope: 60, Es: 8, c: 10 },
    fels:  { name: N_('Fels, verwittert'), gamma: 22, gammaSat: 23, phi: 35, sigmaRd: 600, permeable: false, slope: 80, Es: 500, c: 20 },
    eigen: { name: N_('Eigene Werte (Gutachten)'), gamma: 19, gammaSat: 21, phi: 30, sigmaRd: 250, permeable: true, slope: 45, Es: 40, c: 0 },
  };

  /* Ersatzflächenlasten auf dem Gelände über dem Bunker. */
  const SURFACE_LOADS = {
    // psi2: quasi-ständiger Anteil (DIN EN 1990/NA): begehbar 0,3, befahrbar auf der sicheren Seite 0,6
    garten: { name: N_('Garten, begehbar'), q: 5.0, psi2: 0.3 },
    pkw: { name: N_('PKW befahrbar'), q: 10.0, psi2: 0.6 },
    lkw: { name: N_('Feuerwehr / LKW (SLW 30)'), q: 16.7, psi2: 0.6 },
    eigen: { name: N_('Eigener Wert'), q: 5.0, psi2: 0.6 },
  };

  /* Betonfestigkeitsklassen nach EC2 Tab. 3.1. */
  const CONCRETE = {
    'C25/30': { fck: 25, fctm: 2.6 },
    'C30/37': { fck: 30, fctm: 2.9 },
    'C35/45': { fck: 35, fctm: 3.2 },
    'C40/50': { fck: 40, fctm: 3.5 },
  };

  const WATERPROOFING = {
    wu: { name: N_('WU-Beton (Weiße Wanne)'), pressing: true },
    wu_fbv: { name: N_('WU-Beton + Frischbetonverbundfolie'), pressing: true },
    pmbc: { name: N_('PMBC-Dickbeschichtung'), pressing: 'limited' },
    bahn: { name: N_('Bitumen-/Kunststoffbahnen (Schwarze Wanne)'), pressing: true },
  };

  const WALL_KINDS = {
    stb: { name: N_('Stahlbeton, tragend'), bearing: true, gamma: 25 },
    mw: { name: N_('Mauerwerk KS, nichttragend'), bearing: false, gamma: 18 },
    tb: { name: N_('Trockenbau, nichttragend'), bearing: false, gamma: 0.5 },
  };

  const OPENING_KINDS = {
    schutztuer: { name: N_('Schutztür (druck-/gasdicht)') },
    innen: { name: N_('Innentür') },
    durchgang: { name: N_('Durchgang ohne Tür') },
    luke: { name: N_('Notausstiegsluke') },
  };

  /* Leitungen */
  const ROUTE_KINDS = {
    zuluft: { name: N_('Zuluft'), type: 'luft', color: '#2f78a8' },
    abluft: { name: N_('Abluft'), type: 'luft', color: '#b26a00' },
    umluft: { name: N_('Umluft'), type: 'luft', color: '#2f7d4f' },
    strom: { name: N_('Strom'), type: 'kabel', color: '#7b3fa0' },
    daten: { name: N_('Daten / Funk'), type: 'kabel', color: '#4f5fb5' },
    reserve: { name: N_('Reserve / Leerrohr'), type: 'kabel', color: '#6f7773' },
  };

  /* Schutzaufbau: dokumentierte Anforderungen und Schichten. Keine Berechnung der Schutzwirkung. */
  const PROT_FAMILIES = {
    undefined: N_('Noch festzulegen'),
    fallout: N_('Strahlung / Fallout'),
    fragments: N_('Splitter'),
    projectile: N_('Beschuss – Geschossart noch festzulegen'),
    handgun: N_('Kurzwaffenbeschuss'),
    rifle: N_('Langwaffenbeschuss'),
    hardcore: N_('Hartkern / panzerbrechendes Geschoss'),
    heavy: N_('Schweres Geschoss – eigene Fachbemessung'),
    blast: N_('Druck / Explosion'),
    combined: N_('Kombinierte Beanspruchung'),
  };
  const PROT_PROJECTILE = ['projectile', 'handgun', 'rifle', 'hardcore', 'heavy', 'combined'];
  const PROT_MATERIALS = {
    concrete: { name: N_('Beton / Stahlbeton'), rho: 2400, rate: 300 },
    steel: { name: N_('Stahl'), rho: 7850, rate: 19600 },
    masonry: { name: N_('Mauerwerk'), rho: 1800, rate: 480 },
    liner: { name: N_('Innenauskleidung / Splitterfang'), rho: null, rate: 0 },
    earth: { name: N_('Erde / Schüttung'), rho: 1800, rate: 30 },
    gap: { name: N_('Zwischenraum'), rho: 0, rate: 0 },
    other: { name: N_('Anderes Material'), rho: null, rate: 0 },
  };
  const PROT_TARGETS = {
    aussenwand: { name: N_('Außenwände'), build: 'tWall' },
    decke: { name: N_('Decke'), build: 'tRoof' },
    bodenplatte: { name: N_('Bodenplatte'), build: 'tFloor' },
    innenwand: { name: N_('Innenwände Stahlbeton') },
    zugang: { name: N_('Zugänge: Türen, Klappen, Luken') },
    durchfuehrungen: { name: N_('Leitungsdurchführungen') },
  };
  /* Schutzgrad: Bemessungslastfälle und Schutztechnik.
   * Luftstoß, Erschütterung, Mindestwerte nach TWK 2017 (BABS, Technische Weisungen für die Konstruktion und Bemessung von Schutzbauten). */
  const HAZARD_PRESETS = {
    ohne: { name: N_('Ohne Schutzanforderung'), blast: 'keins', radiation: false, cb: false, fire: false, shock: false, emp: false },
    grund: { name: N_('Grundschutz: Strahlung, ABC, Brand'), blast: 'keins', radiation: true, cb: true, fire: true, shock: false, emp: false },
    twk: { name: N_('Schutzraum nach TWK 2017 (1 bar)'), blast: 'twk', radiation: true, cb: true, fire: true, shock: true, emp: false },
    twkemp: { name: N_('TWK 2017 + EMP-Härtung'), blast: 'twk', radiation: true, cb: true, fire: true, shock: true, emp: true },
  };
  /* Szenarien jenseits öffentlicher Schutzraumnormen: nur dokumentiert, nicht gerechnet. */
  const SPECIAL_SCENARIOS = {
    near: { name: N_('Nahtreffer (Einschlag in geringem Abstand)'), dist: true },
    artillery: { name: N_('Direkttreffer Artillerie / Mörser') },
    missile: { name: N_('Treffer ballistische Rakete / Marschflugkörper') },
    bomb: { name: N_('Fliegerbombe / Gleitbombe') },
  };
  const hazardDefaults = () => ({
    blast: 'keins', qk: 100, radiation: true, cb: true, fire: false, shock: false, emp: false,
    scenarios: Object.fromEntries(Object.keys(SPECIAL_SCENARIOS).map((k) => [k, { on: false, dist: k === 'near' ? 5 : null }])),
    assumption: '', expert: { reference: '', authority: '', date: '' },
  });

  const protComponent = () => ({ layers: [], reinforcement: '', connections: '', evidence: { reference: '', authority: '', date: '', scope: '', baseline: '' } });
  const protDefaults = () => ({
    threat: { family: 'undefined', projectile: '', core: '', velocity: null, shots: null, spacing: null, distance: null, angle: null, pattern: '', criterion: '', standard: '', classification: '', notes: '' },
    components: Object.fromEntries(Object.keys(PROT_TARGETS).map((k) => [k, protComponent()])),
  });

  /* Richtpreise netto (€) als Startwerte; im Projekt durch eigene Preise bzw. Angebote ersetzen. */
  const PRICES = {
    oberboden: { name: N_('Oberboden abtragen & lagern'), unit: 'm²', p: 4 },
    aushub: { name: N_('Aushub lösen & laden'), unit: 'm³', p: 12 },
    abfuhr: { name: N_('Abfuhr & Entsorgung Boden (Z0)'), unit: 'm³ lose', p: 28 },
    verbau: { name: N_('Baugrubenverbau'), unit: 'm²', p: 120 },
    wasserhaltung: { name: N_('Wasserhaltung'), unit: 'Tag', p: 180 },
    verfuellung: { name: N_('Verfüllen & lagenweise verdichten'), unit: 'm³', p: 15 },
    boden: { name: N_('Boden liefern (Hügelschüttung)'), unit: 'm³', p: 22 },
    kies: { name: N_('Kies-/Schotterschicht liefern & einbauen'), unit: 'm³', p: 45 },
    drainage: { name: N_('Dränleitung DN 100 inkl. Filterkies & Vlies'), unit: 'm', p: 35 },
    spuelschacht: { name: N_('Spül-/Kontrollschacht'), unit: 'Stk', p: 350 },
    sauberkeit: { name: N_('Sauberkeitsschicht C12/15'), unit: 'm³', p: 140 },
    beton: { name: N_('Beton (WU) liefern, pumpen, einbauen'), unit: 'm³', p: 230 },
    pumpe: { name: N_('Betonpumpe'), unit: 'Einsatz', p: 900 },
    stahl: { name: N_('Betonstahl B500B liefern, biegen, verlegen'), unit: 't', p: 1900 },
    abstandhalter: { name: N_('Abstandhalter & Unterstützungskörbe'), unit: 'm²', p: 2.5 },
    schalungWand: { name: N_('Wandschalung'), unit: 'm²', p: 45 },
    schalungDecke: { name: N_('Deckenschalung inkl. Rüstung'), unit: 'm²', p: 50 },
    schalungRand: { name: N_('Rand-/Stirnschalung, Aussparungen'), unit: 'm²', p: 35 },
    fugenblech: { name: N_('Fugenblech beschichtet'), unit: 'm', p: 25 },
    futterrohr: { name: N_('Futterrohr mit Dichtflansch'), unit: 'Stk', p: 180 },
    abd_fbv: { name: N_('Frischbetonverbundfolie'), unit: 'm²', p: 38 },
    abd_pmbc: { name: N_('PMBC-Dickbeschichtung inkl. Voranstrich'), unit: 'm²', p: 30 },
    abd_bahn: { name: N_('Abdichtungsbahn 2-lagig'), unit: 'm²', p: 45 },
    daemmung: { name: N_('Perimeterdämmung XPS'), unit: 'm³', p: 320 },
    noppenbahn: { name: N_('Noppenbahn / Schutzlage'), unit: 'm²', p: 8 },
    mauerwerk: { name: N_('Mauerwerk KS nichttragend'), unit: 'm²', p: 85 },
    trockenbau: { name: N_('Trockenbauwand'), unit: 'm²', p: 70 },
    schutztuer: { name: N_('Schutztür druck-/gasdicht'), unit: 'Stk', p: 4500 },
    innentuer: { name: N_('Innentür'), unit: 'Stk', p: 600 },
    luke: { name: N_('Notausstiegsluke'), unit: 'Stk', p: 2500 },
    klappe: { name: N_('Schachtabdeckung / Stahlklappe'), unit: 'm²', p: 650 },
    steigeisen: { name: N_('Steigeisen'), unit: 'Stk', p: 40 },
    gelaender: { name: N_('Geländer / Absturzsicherung'), unit: 'm', p: 150 },
    lueftung: { name: N_('ABC-Lüftungsgerät mit Filter'), unit: 'Stk', p: 0 },
    ventil: { name: N_('Überdruck-/Explosionsschutzventil'), unit: 'Stk', p: 800 },
    kanal: { name: N_('Lüftungsleitung'), unit: 'm', p: 60 },
    formteil: { name: N_('Bogen / Formteil Lüftung'), unit: 'Stk', p: 25 },
    trasse: { name: N_('Kabeltrasse / Kabelkanal'), unit: 'm', p: 35 },
    kabel: { name: N_('Kabel inkl. Verlegung'), unit: 'm', p: 9 },
    aussparung: { name: N_('Aussparung / Kernbohrung Innenwand'), unit: 'Stk', p: 80 },
    batterie: { name: N_('Batteriespeicher'), unit: 'kWh', p: 600 },
    wechselrichter: { name: N_('Wechselrichter / Ladegerät'), unit: 'kW', p: 300 },
    generator: { name: N_('Notstromaggregat'), unit: 'kVA', p: 400 },
    tank: { name: N_('Wassertank'), unit: 'L', p: 1.5 },
    abwassertank: { name: N_('Abwassertank / Fäkalientank'), unit: 'L', p: 1.8 },
    dieseltank: { name: N_('Kraftstofftank'), unit: 'L', p: 2.0 },
    elektro: { name: N_('Elektroinstallation inkl. Beleuchtung'), unit: 'm²', p: 90 },
    emp_schirm: { name: N_('EMP-Schirmung Hülle (Stahlblech verschweißt)'), unit: 'm²', p: 120 },
    emp_wabe: { name: N_('Wabenkamin-Filter für Lüftungsdurchführung'), unit: 'Stk', p: 1500 },
    emp_netz: { name: N_('EMP-Netzfilter je Stromzuführung'), unit: 'Stk', p: 2500 },
    emp_tuer: { name: N_('Mehrpreis HF-dichte Schutztür / Luke'), unit: 'Stk', p: 3000 },
    ueberspannung: { name: N_('Blitzstrom- und Überspannungsschutz Typ 1+2'), unit: 'Stk', p: 600 },
    lwl: { name: N_('Datenanbindung über Lichtwellenleiter'), unit: 'psch', p: 450 },
    erder: { name: N_('Ringerder und Potentialausgleich'), unit: 'm', p: 25 },
    schock: { name: N_('Schocksichere Befestigung der Einbauten'), unit: 'psch', p: 1500 },
    abc_filter: { name: N_('ABC-Gasfilter, Ersatzpatrone'), unit: 'Stk', p: 1200 },
    esv: { name: N_('Explosionsschutzventil (Luftstoß)'), unit: 'Stk', p: 1200 },
    esv_abgas: { name: N_('Explosionsschutzventil Abgas, hitzebeständig'), unit: 'Stk', p: 3000 },
    uev: { name: N_('Überdruckventil, gasdicht einstellbar'), unit: 'Stk', p: 550 },
    hebeanlage: { name: N_('Fäkalienhebeanlage'), unit: 'Stk', p: 4000 },
    absperr: { name: N_('Absperrschieber Abwasser, gasdicht'), unit: 'Stk', p: 900 },
    klima: { name: N_('Kühlgerät mit Kältetechnik'), unit: 'kW', p: 1200 },
    abgas: { name: N_('Abgasleitung doppelwandig mit Durchführung'), unit: 'm', p: 180 },
    leckanzeige: { name: N_('Doppelwandiger Tank mit Leckanzeige (Mehrpreis)'), unit: 'Stk', p: 800 },
    druckmesser: { name: N_('Überdruckmessgerät Schutzraum'), unit: 'Stk', p: 250 },
    klosett: { name: N_('Trockenklosett'), unit: 'Stk', p: 350 },
    co_melder: { name: N_('CO- und CO₂-Warnmelder'), unit: 'Stk', p: 120 },
    loescher: { name: N_('Feuerlöscher'), unit: 'Stk', p: 80 },
    dosimeter: { name: N_('Dosisleistungsmessgerät'), unit: 'Stk', p: 600 },
    be: { name: N_('Baustelleneinrichtung'), unit: 'psch', p: 3500 },
    bagger: { name: N_('Bagger mit Fahrer'), unit: 'Tag', p: 650 },
    ruettler: { name: N_('Rüttelplatte'), unit: 'Tag', p: 80 },
  };

  /* Aufteilung der Firmenpreise für Eigenleistung: m = Materialpreis netto je Einheit (ohne Einbau),
   * h = Arbeitsstunden je Einheit in Eigenleistung, t = Gewerk. Fehlt ein Eintrag: 60 % Material, Rest Lohn à 55 €/h. */
  const TRADES = {
    erde: N_('Erdarbeiten'), beton: N_('Betonarbeiten'), schalung: N_('Schalung & Einbauteile'), bewehrung: N_('Bewehrung'),
    abdichtung: N_('Abdichtung & Dämmung'), ausbau: N_('Ausbau & Zugänge'), technik: N_('Haustechnik'), schutz: N_('Schutztechnik'), baustelle: N_('Baustelleneinrichtung'),
  };
  const SPLIT = {
    oberboden: { m: 0, h: 0, t: 'erde' }, aushub: { m: 0, h: 0, t: 'erde' }, abfuhr: { m: 28, h: 0, t: 'erde' },
    verbau: { m: 60, h: 0.6, t: 'erde' }, wasserhaltung: { m: 120, h: 1, t: 'erde' }, verfuellung: { m: 0, h: 0.03, t: 'erde' },
    boden: { m: 22, h: 0, t: 'erde' }, kies: { m: 32, h: 0.1, t: 'erde' }, drainage: { m: 14, h: 0.25, t: 'erde' }, spuelschacht: { m: 220, h: 2, t: 'erde' },
    sauberkeit: { m: 115, h: 1.0, t: 'beton', conc: 'c12' }, beton: { m: 175, h: 0.8, t: 'beton', conc: 'c30' },
    stahl: { m: 1150, h: 22, t: 'bewehrung' }, abstandhalter: { m: 2.5, h: 0, t: 'bewehrung' },
    schalungWand: { m: 9, h: 0.8, t: 'schalung', fw: 'wand' }, schalungDecke: { m: 13, h: 0.7, t: 'schalung', fw: 'decke' }, schalungRand: { m: 6, h: 0.5, t: 'schalung' },
    fugenblech: { m: 14, h: 0.15, t: 'schalung' }, futterrohr: { m: 120, h: 1, t: 'schalung' }, aussparung: { m: 20, h: 1, t: 'schalung' },
    abd_fbv: { m: 24, h: 0.15, t: 'abdichtung' }, abd_pmbc: { m: 14, h: 0.25, t: 'abdichtung' }, abd_bahn: { m: 22, h: 0.35, t: 'abdichtung' },
    daemmung: { m: 220, h: 3, t: 'abdichtung' }, noppenbahn: { m: 4, h: 0.08, t: 'abdichtung' },
    mauerwerk: { m: 35, h: 0.9, t: 'ausbau' }, trockenbau: { m: 30, h: 0.7, t: 'ausbau' }, schutztuer: { m: 3800, h: 8, t: 'ausbau' }, innentuer: { m: 300, h: 3, t: 'ausbau' },
    luke: { m: 2100, h: 6, t: 'ausbau' }, klappe: { m: 500, h: 2, t: 'ausbau' }, steigeisen: { m: 25, h: 0.3, t: 'ausbau' }, gelaender: { m: 90, h: 1, t: 'ausbau' },
    lueftung: { m: 0.9, rel: true, h: 12, t: 'technik' }, ventil: { m: 650, h: 2, t: 'technik' }, kanal: { m: 35, h: 0.5, t: 'technik' }, formteil: { m: 15, h: 0.2, t: 'technik' },
    trasse: { m: 18, h: 0.35, t: 'technik' }, kabel: { m: 4, h: 0.1, t: 'technik' }, batterie: { m: 520, h: 0.3, t: 'technik' }, wechselrichter: { m: 260, h: 1.5, t: 'technik' },
    generator: { m: 340, h: 0.6, t: 'technik' }, tank: { m: 1.2, h: 0.003, t: 'technik' }, abwassertank: { m: 1.4, h: 0.004, t: 'technik' }, dieseltank: { m: 1.7, h: 0.002, t: 'technik' },
    elektro: { m: 40, h: 1.0, t: 'technik' },
    esv: { m: 950, h: 3, t: 'schutz' }, esv_abgas: { m: 2600, h: 4, t: 'schutz' }, uev: { m: 420, h: 2, t: 'schutz' },
    hebeanlage: { m: 3200, h: 10, t: 'technik' }, absperr: { m: 700, h: 2, t: 'technik' }, klima: { m: 850, h: 4, t: 'technik' }, abgas: { m: 120, h: 1, t: 'technik' }, leckanzeige: { m: 650, h: 1, t: 'technik' },
    emp_schirm: { m: 60, h: 1.2, t: 'schutz' }, emp_wabe: { m: 1300, h: 2, t: 'schutz' }, emp_netz: { m: 2200, h: 3, t: 'schutz' }, emp_tuer: { m: 2800, h: 2, t: 'schutz' },
    ueberspannung: { m: 450, h: 3, t: 'schutz' }, lwl: { m: 250, h: 4, t: 'schutz' }, erder: { m: 12, h: 0.4, t: 'schutz' }, schock: { m: 600, h: 16, t: 'schutz' },
    abc_filter: { m: 1200, h: 0.5, t: 'schutz' }, druckmesser: { m: 250, h: 0.5, t: 'schutz' }, klosett: { m: 350, h: 0.5, t: 'schutz' }, co_melder: { m: 120, h: 0.3, t: 'schutz' },
    loescher: { m: 80, h: 0, t: 'schutz' }, dosimeter: { m: 600, h: 0, t: 'schutz' },
    be: { m: 900, h: 16, t: 'baustelle' },
  };
  function selfDefaults() {
    return {
      wage: 0,
      trades: Object.fromEntries(Object.keys(TRADES).map((k) => [k, 'firma'])),
      equip: { bagger: 'miete', baggerRent: 280, baggerOwn: 90, ruettler: 'miete', ruettlerRent: 80, ruettlerOwn: 10, pump: 'pumpe', vibratorRent: 25, chuteReach: 6 },
      concrete: { mode: 'transport', c30: 175, c12: 115, werk: 95, cementT: 240, cementKg: 350, aggT: 25, aggPerM3: 1.85, mixers: 4, ownMixers: 1, batchL: 120, batchesH: 6, hoursDay: 8, mixerRent: 35 },
      formwork: { mode: 'miete', rent: 9, board: 22, uses: 4, extra: 6, propsRent: 4 },
      mat: {},
    };
  }
  /* Geldbeträge im Projekt (intern in Euro): bei einem Wechsel des Landes mit dem Verhältnis der Baupreisniveaus umrechnen.
   * Ausdrücklich eingegebene Einzelpreise (prices, self.mat) bleiben unverändert. */
  const MONEY_PATHS = ['self.wage', 'self.equip.baggerRent', 'self.equip.baggerOwn', 'self.equip.ruettlerRent', 'self.equip.ruettlerOwn', 'self.equip.vibratorRent',
    'self.concrete.c30', 'self.concrete.c12', 'self.concrete.werk', 'self.concrete.cementT', 'self.concrete.aggT', 'self.concrete.mixerRent',
    'self.formwork.rent', 'self.formwork.board', 'self.formwork.extra', 'self.formwork.propsRent'];
  function rescaleMoney(p, ratio) {
    if (!(ratio > 0) || Math.abs(ratio - 1) < 1e-9) return;
    const r2 = (v) => Math.round(v * ratio * 100) / 100;
    for (const path of MONEY_PATHS) {
      const ks = path.split('.'); let o = p;
      for (let i = 0; i < ks.length - 1 && o; i++) o = o[ks[i]];
      const k = ks[ks.length - 1];
      if (o && typeof o[k] === 'number' && isFinite(o[k])) o[k] = r2(o[k]);
    }
    for (const s of (p.costs && p.costs.services) || []) if (typeof s.amount === 'number') s.amount = r2(s.amount);
  }
  /* Land wechseln: Region, Währung und Kurs zurücksetzen, MwSt. des Landes, Geldbeträge der Eigenleistung und Planung mit dem
   * Verhältnis der Baupreisniveaus umrechnen, Klima-Startwerte der Haustechnik aus dem Klima des Landes. */
  function setCountry(p, c) {
    const L = BP.laender;
    if (!L || !L.valid(c) || p.site.country === c) return false;
    const old = L.pli(p).value, oldC = p.site.country;
    // Startwert der Betondeckung je Normfamilie (ACI 318: 50 mm erdberührt), nur wenn noch der Startwert des alten Landes gilt
    const cv = (cc) => ((L.info(cc) || {}).fam === 'ACI' ? 0.05 : 0.045);
    if (Math.abs(p.build.cnom - cv(oldC)) < 1e-9) p.build.cnom = cv(c);
    p.site.country = c; p.site.region = ''; p.site.climate = null;
    // Erdbebenangaben gelten je Land (Zonen, Karten, Kennwerte): zurücksetzen
    Object.assign(p.site.seismic, { zone: 0, agR: null, sds: null, sd1: null, usgs: null });
    if (p.permit) p.permit.jur = '';
    if (p.site.radon) p.site.radon.area = 'unbekannt'; // Gebiete sind je Land ausgewiesen
    p.costs.currency = null; p.costs.fx = null; p.costs.pli = null;
    const inf = L.info(c);
    p.costs.vat = typeof inf.vat === 'number' ? Math.min(30, inf.vat) : 0; // ohne landesweite MwSt. (USA: Umsatzsteuer je Bundesstaat) 0 %, von Hand anpassen
    rescaleMoney(p, L.pli(p).value / old);
    Object.assign(p.tech, L.techStart(p));
    if (c === 'DE') p.schedule.state = 'DE';
    return true;
  }
  /* Planungs- und Prüfleistungen als Einzelposten (netto, Richtwerte für einen privaten Schutzraum). */
  function servicesDefault() {
    return [
      { id: 'baugrund', name: N_('Baugrundgutachten'), on: true, amount: null },
      { id: 'statik', name: N_('Tragwerksplanung: Statik und Bewehrungspläne'), on: true, amount: null },
      { id: 'pruef', name: N_('Prüfstatik / Prüfingenieur (falls gefordert)'), on: false, amount: null },
      { id: 'vermessung', name: N_('Vermessung, Absteckung, Einmessung'), on: true, amount: null },
      { id: 'bauantrag', name: N_('Bauantrag / Bauvorlage (falls genehmigungspflichtig)'), on: false, amount: null },
      { id: 'elektro', name: N_('Elektro-Abnahme durch Fachbetrieb'), on: false, amount: null },
    ];
  }

  /* Leistungswerte für den Bauablauf (je Arbeitstag einer üblichen Kolonne). */
  const RATES = {
    oberboden: { name: N_('Oberboden abtragen'), unit: 'm²/AT', v: 500 },
    aushub: { name: N_('Aushub (Bagger 20 t)'), unit: 'm³/AT', v: 250 },
    verbau: { name: N_('Verbau einbringen'), unit: 'm²/AT', v: 40 },
    kies: { name: N_('Schotter einbauen'), unit: 'm³/AT', v: 60 },
    bewehrung: { name: N_('Bewehrung verlegen'), unit: 't/AT', v: 1.2 },
    schalungWand: { name: N_('Wandschalung stellen'), unit: 'm²/AT', v: 30 },
    schalungDecke: { name: N_('Deckenschalung'), unit: 'm²/AT', v: 40 },
    beton: { name: N_('Betonieren'), unit: 'm³/AT', v: 120 },
    abdichtung: { name: N_('Abdichtung & Dämmung'), unit: 'm²/AT', v: 80 },
    drainage: { name: N_('Dränage verlegen'), unit: 'm/AT', v: 60 },
    verfuellung: { name: N_('Verfüllen & verdichten'), unit: 'm³/AT', v: 150 },
    ausbau: { name: N_('Mauerwerk / Trockenbau'), unit: 'm²/AT', v: 25 },
  };

  /* Freigaben und Fachplanungen. auto: wird vom Modell beurteilt. */
  const CHECKLIST = [
    { id: 'baugrund', group: N_('Vor dem Entwurf'), text: N_('Baugrundgutachten mit Bodenkennwerten, Bemessungswasserstand und Sohlwiderstand') },
    { id: 'sparten', group: N_('Vor dem Entwurf'), text: N_('Leitungsauskunft (Strom, Gas, Wasser, Telekom) für das Grundstück') },
    { id: 'kampfmittel', group: N_('Vor dem Entwurf'), text: N_('Kampfmittelauskunft bzw. Freigabe der Aushubfläche') },
    { id: 'genehmigung', group: N_('Vor dem Entwurf'), text: N_('Genehmigungspflicht nach Landesbauordnung klären, ggf. Bauantrag'), textX: N_('Genehmigungspflicht nach dem örtlichen Baurecht klären, ggf. Bauantrag') },
    { id: 'abstand', group: N_('Vor dem Entwurf'), text: N_('Grenzabstände, Baulasten, Bäume und Nachbarbebauung prüfen') },
    { id: 'schutzgrad', group: N_('Fachplanung'), text: N_('Vorbemessung: gewählter Luftstoß-Lastfall und Mindestwerte im Rechenmodell eingehalten'), auto: 'hazard' },
    { id: 'sonderszenarien', group: N_('Fachplanung'), text: N_('Gewählte Treffer-Szenarien mit Fachunterlagen dem aktuellen Plan zugeordnet; Inhalt extern prüfen'), auto: 'special' },
    { id: 'rettungsweg', group: N_('Fachplanung'), text: N_('Zweiter Rettungsweg über Notausstieg'), auto: 'exits' },
    { id: 'statik', group: N_('Fachplanung'), text: N_('Tragwerksplanung: statische Berechnung und Bewehrungspläne vom Tragwerksplaner prüfen, ergänzen und unterschreiben lassen') },
    { id: 'pruefstatik', group: N_('Fachplanung'), text: N_('Prüfingenieur / Prüfstatik, sofern gefordert') },
    { id: 'abdichtung', group: N_('Fachplanung'), text: N_('Abdichtungs- bzw. WU-Konzept festlegen (DIN 18533 / DAfStb-WU-Richtlinie)'), textX: N_('Abdichtungs- bzw. WU-Konzept nach den Regeln des Landes festlegen') },
    { id: 'brandschutz', group: N_('Fachplanung'), text: N_('Brandschutz: Feuerwiderstand der Bauteile, Rettungswege und Rauchableitung mit Bauaufsicht bzw. Prüfsachverständigem abstimmen') },
    { id: 'schutznachweis', group: N_('Fachplanung'), text: N_('Schutzprofil und Bauteilunterlagen vollständig zugeordnet; Fachprüfung separat'), auto: 'protection' },
    { id: 'lueftung', group: N_('Fachplanung'), text: N_('Lüftungsplanung: Filter, Überdruck, Explosionsschutzventile, Notbetrieb mit Handkurbel') },
    { id: 'haustechnik', group: N_('Fachplanung'), text: N_('Haustechnik durch den Fachplaner TGA: Kühlung, Hebeanlage mit Rückstauschleife, Notstrom mit Verbrennungsluft und Abgasführung') },
    { id: 'awsv', group: N_('Fachplanung'), text: N_('Kraftstofftank: Anzeige und Prüfpflicht nach AwSV bei der unteren Wasserbehörde klären, sofern Notstromaggregat') },
    { id: 'elektro', group: N_('Fachplanung'), text: N_('Elektroplanung nach VDE, Erdung und Potentialausgleich') },
    { id: 'aufzug', group: N_('Fachplanung'), text: N_('Aufzug: Herstellerplanung (Schacht, Grube, Schachtkopf, Lasten) und Prüfung durch die ZÜS, sofern vorhanden') },
    { id: 'leitungen', group: N_('Fachplanung'), text: N_('Leitungswege ohne Kollision, Durchführungen mit Futterrohr geplant'), auto: 'routes' },
    { id: 'sige', group: N_('Bauausführung'), text: N_('Baugrubensicherung nach DIN 4124 und Baustellensicherheit') },
    { id: 'sohlabnahme', group: N_('Bauausführung'), text: N_('Gründungssohle vom Baugrundgutachter abnehmen lassen, bevor die Sauberkeitsschicht eingebaut wird') },
    { id: 'einbauteile', group: N_('Bauausführung'), text: N_('Einbauteile, Futterrohre, Fugenbleche und Erder vor jeder Betonage gegen die Pläne prüfen') },
    { id: 'bewehrungsabnahme', group: N_('Bauausführung'), text: N_('Bewehrungsabnahme vor jeder Betonage dokumentieren') },
    { id: 'betonprotokoll', group: N_('Bauausführung'), text: N_('Lieferscheine und Betonierprotokolle, Nachbehandlung WU-Beton') },
    { id: 'dichtheit', group: N_('Abnahme'), text: N_('Dichtheitskontrolle der Fugen und Durchführungen vor dem Verfüllen') },
    { id: 'elektroabnahme', group: N_('Abnahme'), text: N_('Erstprüfung der elektrischen Anlage nach DIN VDE 0100-600 mit Prüfprotokoll'), textX: N_('Erstprüfung der elektrischen Anlage nach den Vorschriften des Landes mit Prüfprotokoll') },
    { id: 'dichtheit_ue', group: N_('Abnahme'), text: N_('Dichtheitsprüfung der Hülle mit Überdruck im Filterbetrieb, sofern ABC-Schutz') },
    { id: 'probelauf', group: N_('Abnahme'), text: N_('Probebetrieb im Inselbetrieb: Lüftung, Notstrom unter Last, Wasser und Abwasser; Verbräuche messen und auf die Schutzdauer hochrechnen') },
    { id: 'wartung', group: N_('Abnahme'), text: N_('Wartungsplan für Filter, Batterien, Kraftstoff, Wasser und Vorräte') },
  ];

  /* Text eines Freigabepunkts: Deutschland mit DIN/Landesbauordnung, sonst die allgemeine Fassung (textX). */
  const checkText = (c, p) => T_(c.textX && p && p.site && p.site.country !== 'DE' ? c.textX : c.text);

  /* Einbauten mit Aufstellort (Lasten auf den Platten), siehe BP.haustechnik.equipment */
  const EQUIP_IDS = ['gen', 'fuel', 'bat', 'vent', 'water', 'food', 'sew', 'hebe'];

  const STEPS = [
    { id: 'standort', title: N_('Standort & Baugrund'), view: 'schnitt' },
    { id: 'nutzung', title: N_('Nutzung & Lasten'), view: 'schnitt' },
    { id: 'schutzgrad', title: N_('Schutzgrad'), view: 'schnitt' },
    { id: 'grundriss', title: N_('Grundriss'), view: 'plan' },
    { id: 'konstruktion', title: N_('Konstruktion'), view: 'schnitt' },
    { id: 'statik', title: N_('Tragwerk'), view: 'plan' },
    { id: 'schutz', title: N_('Schutznachweise'), view: 'schnitt' },
    { id: 'technik', title: N_('Technik & Vorräte'), view: 'plan' },
    { id: 'material', title: N_('Material & Kosten'), view: '3d' },
    { id: 'ablauf', title: N_('Bauablauf'), view: '3d' },
    { id: 'varianten', title: N_('Varianten'), view: '3d' },
    { id: 'bauantrag', title: N_('Bauantrag'), view: 'plan' },
    { id: 'freigabe', title: N_('Freigaben'), view: '3d' },
    { id: 'betrieb', title: N_('Betrieb & Wartung'), view: '3d' },
  ];

  /* Kennwerte einer Variante (beim Speichern aus der Rechnung übernommen) */
  const VARIANT_KEYS = ['people', 'days', 'Anet', 'A', 'concrete', 'steel', 'excavation', 'cost', 'costNet', 'weeks', 'etaMax', 'buoyancy', 'errors', 'warnings', 'selfHours', 'radonQ', 'pf'];
  const VARIANTS_MAX = 8;

  function defaultConsumers() {
    return [
      { id: uid('c'), name: N_('Lüftungsgerät'), w: 0, h: 24, auto: 'lueftung' },
      { id: uid('c'), name: N_('LED-Beleuchtung'), w: 0, h: 14, auto: 'licht' },
      { id: uid('c'), name: N_('Kühlschrank'), w: 45, h: 24 },
      { id: uid('c'), name: N_('Funk, Router, Laden'), w: 40, h: 24 },
      { id: uid('c'), name: N_('Pumpe / Hebeanlage'), w: 400, h: 0.5 },
      { id: uid('c'), name: N_('Kochplatte'), w: 1500, h: 1 },
    ];
  }

  function nextMonday(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function defaultRoutes() {
    return [
      { id: 'l1', type: 'luft', kind: 'zuluft', name: N_('Zuluft vom Ansaugbauwerk'), shape: 'rund', d: 0.125, w: 0.2, hgt: 0.1, ins: 0, clr: 0.05, airflow: null, reserve: 15, cable: '',
        pts: [{ x: 9.0, y: 7.6, h: 4.6 }, { x: 9.0, y: 7.6, h: 2.15 }, { x: 9.0, y: 5.85, h: 2.15 }, { x: 3.2, y: 5.85, h: 2.15 }] },
      { id: 'l2', type: 'luft', kind: 'abluft', name: N_('Abluft Sanitär'), shape: 'rund', d: 0.125, w: 0.2, hgt: 0.1, ins: 0, clr: 0.05, airflow: null, reserve: 15, cable: '',
        pts: [{ x: 7.6, y: 3.2, h: 2.15 }, { x: 10.7, y: 3.2, h: 2.15 }, { x: 10.7, y: 3.2, h: 4.6 }] },
      { id: 'l3', type: 'kabel', kind: 'strom', name: N_('Hausanschluss Strom'), shape: 'rechteck', d: 0.1, w: 0.1, hgt: 0.06, ins: 0, clr: 0.03, airflow: null, reserve: 15, cable: 'NYY-J 5×6',
        pts: [{ x: 10.9, y: 5.1, h: 1.6 }, { x: 9.35, y: 5.1, h: 1.6 }, { x: 9.35, y: 5.1, h: 1.0 }] },
    ];
  }

  function defaultProject() {
    return {
      format: 'bunkerplaner',
      version: 1,
      name: T_('Schutzraum 6 Personen'),
      site: {
        query: '', label: '', lat: null, lon: null, groundNHN: null,
        soil: 'sand', custom: { gamma: 19, gammaSat: 21, phi: 30, sigmaRd: 250, Es: 40, c: 0 },
        waterMode: 'unbekannt', waterDepth: null, waterSource: '',
        gw: null,
        // Erdbeben: Deutschland Zone 0–3 mit Untergrund und Baugrundklasse; Schweiz Zone 1–5 (Z1a–Z3b); übrige Eurocode-Länder agR [m/s²];
        // USA SDS/SD1 [g] mit Site Class und Werten von USGS
        seismic: { zone: 0, ground: 'R', soilClass: 'B', importance: 'III', agR: null, sds: null, sd1: null, siteClass: 'Default', usgs: null },
        country: 'DE', region: '', climate: null,
        // Radon: Bodenluftkonzentration [kBq/m³] (Karte bzw. Messung), Lage in einem ausgewiesenen Gebiet
        radon: { soil: null, area: 'unbekannt' },
      },
      use: {
        people: 6, days: 14,
        surface: 'garten', surfaceQ: 5.0, extraG: 0, interiorQ: 2.0,
        compaction: true, compactionP: 25, storeys: 0,
      },
      geom: {
        outline: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6.5 }, { x: 0, y: 6.5 }],
        walls: [
          { id: 'w1', a: { x: 6.5, y: 0.35 }, b: { x: 6.5, y: 6.15 }, t: 0.25, kind: 'stb' },
          { id: 'w2', a: { x: 6.625, y: 2.2 }, b: { x: 9.65, y: 2.2 }, t: 0.175, kind: 'mw' },
          { id: 'w3', a: { x: 6.625, y: 4.2 }, b: { x: 9.65, y: 4.2 }, t: 0.175, kind: 'mw' },
        ],
        openings: [
          { id: 'o1', host: 'w:w1', pos: 0.95, w: 0.9, h: 2.0, sill: 0, kind: 'schutztuer' },
          { id: 'o2', host: 'w:w1', pos: 2.85, w: 0.8, h: 2.0, sill: 0, kind: 'innen' },
          { id: 'o3', host: 'w:w1', pos: 4.85, w: 0.8, h: 2.0, sill: 0, kind: 'innen' },
        ],
        access: [
          { id: 'a1', kind: 'treppe', edge: 0, pos: 8.14, width: 1.0, tw: 0.25, cover: 'klappe', landing: 1.2 },
          { id: 'a2', kind: 'schacht', edge: 2, pos: 7.5, width: 0.8, depth: 0.8, tw: 0.25, lw: 0.6, lh: 0.8 },
        ],
        rooms: [
          { id: 'r1', name: N_('Aufenthalt'), x: 3.4, y: 3.25 },
          { id: 'r2', name: N_('Schleuse'), x: 8.14, y: 1.3 },
          { id: 'r3', name: N_('Sanitär'), x: 8.14, y: 3.2 },
          { id: 'r4', name: N_('Technik'), x: 8.14, y: 5.2 },
        ],
        columns: [], zones: [], beams: [],
        verts: [], // Innentreppen und Aufzüge über mehrere Ebenen
      },
      // Weitere Ebenen unter der obersten (p.geom); je Ebene lichte Höhe, Zwischendecke darüber und eigener Grundriss
      levels: [],
      build: {
        clearHeight: 2.4, tFloor: 0.40, tRoof: 0.40, tWall: 0.35,
        overhang: 0.0, cover: 1.0,
        mound: { on: false, floorDepth: 0, crest: 1.0, slope: 2.0, fill: 'aushub' },
        concrete: 'C30/37', dmax: 32, cnom: 0.045, wk: 0.2, fctEff: 'halb', restraint: 'riss', fireClass: 'R90',
        waterproofing: 'wu',
        insulation: { walls: 0, roof: 0, floor: 0 },
        drainage: false,
        // Radonschutz: Absaugung unter der Bodenplatte, Radonfolie bzw. konvektionsdichte Abdichtung, Messung nach Fertigstellung
        radon: { sump: false, membrane: false, measure: false },
        blinding: 0.05, gravel: 0.15,
        excavation: { mode: 'boeschung', angle: null, workspace: 0.8, loose: 1.25, topsoil: 0.3, backfill: 'aushub' },
        roofLayersG: 0.5,
      },
      tech: {
        co2Target: 1500, co2Out: 420, co2PerPerson: 18, co2Limit: 5000,
        heatPerPerson: 100, deltaT: 6,
        consumers: defaultConsumers(),
        lightWm2: 5, batteryDays: 3, dod: 0.9, generatorDays: 11, fuelPerKWh: 0.35,
        waterDrink: 2, waterHygiene: 3, foodKg: 1.5,
        penetrations: 3,
        sewer: 'hebeanlage', genLocation: 'innen', cooling: 'auto', tInMax: 28, tOutSummer: 32, tSoil: 10, overpressure: 50,
        place: {},
      },
      routes: defaultRoutes(),
      protection: protDefaults(),
      hazard: hazardDefaults(),
      planning: BP.planning.defaults(),
      prices: {},
      rates: {},
      costs: { planning: 12, planningMode: 'posten', services: servicesDefault(), reserve: 10, vat: 19, currency: null, fx: null, pli: null },
      self: selfDefaults(),
      schedule: { start: nextMonday(28), overrides: {}, state: 'DE', winter: { on: true, from: '12-20', to: '01-06' }, tempOffset: 0,
        crews: { erdbau: 1, rohbau: 1, abdichtung: 1, technik: 1, aufzug: 1, ausbau: 1 } },
      checklist: {},
      // Bauantrag: Zuständigkeit (Registerschlüssel, leer = aus dem Standort), Lage des Grundstücks, Beteiligte; bleibt in der Projektdatei
      permit: {
        jur: '', zone: '', annex: false, title: '',
        bauherr: { name: '', street: '', zip: '', city: '', phone: '', email: '' },
        plot: { street: '', zip: '', city: '', gemarkung: '', flur: '', flurstueck: '', area: null },
        author: { name: '', office: '', street: '', zip: '', city: '', phone: '', email: '', chamber: '', regNo: '' },
        engineer: { name: '', office: '', regNo: '' },
        formChecks: {}, // je Formularadresse der letzte Abruf: Fingerabdruck, Größe, Last-Modified, Datum
      },
      // Betrieb: Inbetriebnahme (leer = Ende des Bauablaufs) für die Wartungstermine
      ops: { start: '' },
      // gespeicherte Planungsstände zum Vergleich: { id, name, created, snap (Projekt ohne Varianten), m (Kennwerte beim Speichern) }
      variants: [],
    };
  }

  /* Formvorlagen für die Außenkontur. */
  function shapeRect(L, B) { return [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: B }, { x: 0, y: B }]; }
  function shapeL(L, B, a, b) {
    // Rechteck L×B, oben rechts ausgeschnitten (a in x, b in y)
    return [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: B - b }, { x: L - a, y: B - b }, { x: L - a, y: B }, { x: 0, y: B }];
  }

  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  /* ---------- Projektdateien prüfen ----------
   * Jede geladene Datei (Öffnen, Browserspeicher, Vorversion) wird typtreu auf das aktuelle Modell abgebildet:
   * unbekannte Felder fallen weg, Zahlen werden auf die Eingabegrenzen der Oberfläche begrenzt,
   * Kataloge und IDs werden geprüft. Damit kann eine präparierte Datei weder Code einschleusen noch die Rechnung sprengen. */
  const ID_RE = /^(?!__)[A-Za-z0-9_-]{1,80}$/;
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const str = (v, d = '', max = 4000) => (typeof v === 'string' ? v.slice(0, max) : d);
  const nr = (v, d, lo = -1e9, hi = 1e9) => (fin(v) ? clamp(v, lo, hi) : d);
  const nrN = (v, lo = -1e9, hi = 1e9) => (fin(v) ? clamp(v, lo, hi) : null);
  const oneOf = (v, list, d) => (list.includes(v) ? v : d);
  const ownKey = (cat, v, d) => (typeof v === 'string' && Object.hasOwn(cat, v) ? v : d);
  const bad = (what) => { throw new Error(T_('Ungültige Projektdatei: {what}.', { what })); };
  const list = (v, max, what) => { if (v == null) return []; if (!Array.isArray(v) || v.length > max) bad(T_(what)); return v; };
  const withIds = (arr, what) => { const seen = new Set(); arr.forEach((x) => { if (!isObj(x) || typeof x.id !== 'string' || !ID_RE.test(x.id) || seen.has(x.id)) bad(T_('{what} mit ungültiger oder doppelter ID', { what: T_(what) })); seen.add(x.id); }); return arr; };
  const point = (q, what) => (isObj(q) && fin(q.x) && fin(q.y) ? { x: clamp(q.x, -1e4, 1e4), y: clamp(q.y, -1e4, 1e4) } : bad(T_(what)));

  /* Grenzen der Zahlenfelder wie in den Eingabefeldern (gespeicherte Einheit). [min, max, ganzzahlig] */
  const RANGES = {
    'site.custom.gamma': [10, 25], 'site.custom.gammaSat': [15, 26], 'site.custom.phi': [10, 45], 'site.custom.sigmaRd': [50, 1500], 'site.custom.Es': [2, 5000], 'site.custom.c': [0, 200],
    'use.people': [1, 500, 1], 'use.days': [1, 365, 1], 'use.surfaceQ': [0, 100], 'use.extraG': [0, 200], 'use.interiorQ': [0, 50], 'use.compactionP': [0, 60], 'use.storeys': [0, 40, 1],
    'build.clearHeight': [1.8, 6], 'build.tFloor': [0.15, 2], 'build.tRoof': [0.15, 2], 'build.tWall': [0.15, 1.5], 'build.overhang': [0, 2], 'build.cover': [0, 6],
    'build.mound.floorDepth': [0, 20], 'build.mound.crest': [0, 10], 'build.mound.slope': [0.5, 6],
    'build.cnom': [0.02, 0.08], 'build.insulation.walls': [0, 0.4], 'build.insulation.roof': [0, 0.4], 'build.insulation.floor': [0, 0.4],
    'build.blinding': [0, 0.2], 'build.gravel': [0, 1], 'build.roofLayersG': [0, 50],
    'build.excavation.workspace': [0.5, 3], 'build.excavation.loose': [1, 1.6], 'build.excavation.topsoil': [0, 0.8],
    'tech.co2Target': [800, 10000], 'tech.co2Out': [300, 1000], 'tech.co2PerPerson': [5, 60], 'tech.co2Limit': [1000, 30000], 'tech.heatPerPerson': [50, 200], 'tech.deltaT': [1, 20],
    'tech.lightWm2': [0, 30], 'tech.batteryDays': [0, 60], 'tech.dod': [0.5, 1], 'tech.fuelPerKWh': [0.2, 1], 'tech.waterDrink': [1, 10], 'tech.waterHygiene': [0, 50], 'tech.foodKg': [0.3, 3], 'tech.penetrations': [0, 50, 1], 'tech.tInMax': [20, 35], 'tech.tOutSummer': [20, 45], 'tech.tSoil': [0, 25], 'tech.overpressure': [20, 300],
    'hazard.qk': [10, 2000], 'schedule.tempOffset': [-10, 10], 'site.seismic.zone': [0, 5, 1],
    'schedule.crews.erdbau': [1, 5, 1], 'schedule.crews.rohbau': [1, 5, 1], 'schedule.crews.abdichtung': [1, 5, 1], 'schedule.crews.technik': [1, 5, 1], 'schedule.crews.aufzug': [1, 5, 1], 'schedule.crews.ausbau': [1, 5, 1], 'costs.planning': [0, 40], 'costs.reserve': [0, 50], 'costs.vat': [0, 30],
    'self.wage': [0, 200], 'self.equip.baggerRent': [0, 2000], 'self.equip.baggerOwn': [0, 2000], 'self.equip.ruettlerRent': [0, 500], 'self.equip.ruettlerOwn': [0, 500], 'self.equip.vibratorRent': [0, 300], 'self.equip.chuteReach': [1, 15],
    'self.concrete.c30': [0, 600], 'self.concrete.c12': [0, 400], 'self.concrete.werk': [0, 600], 'self.concrete.cementT': [0, 1000], 'self.concrete.cementKg': [200, 500], 'self.concrete.aggT': [0, 200], 'self.concrete.aggPerM3': [1, 2.5],
    'self.concrete.mixers': [0, 40, 1], 'self.concrete.ownMixers': [0, 40, 1], 'self.concrete.batchL': [20, 3000], 'self.concrete.batchesH': [1, 20], 'self.concrete.hoursDay': [1, 24], 'self.concrete.mixerRent': [0, 500],
    'self.formwork.rent': [0, 100], 'self.formwork.board': [0, 100], 'self.formwork.uses': [1, 50, 1], 'self.formwork.extra': [0, 50], 'self.formwork.propsRent': [0, 50],
  };
  const ENUMS = {
    'site.waterMode': ['unbekannt', 'tiefe', 'gok', 'keins'], 'site.radon.area': ['unbekannt', 'ja', 'nein'], 'build.dmax': [32, 16], 'build.wk': [0.2, 0.15, 0.3], 'build.fctEff': ['halb', 'voll'], 'build.restraint': ['riss', 'massnahmen'], 'build.fireClass': ['R90', 'keine', 'R30', 'R60', 'R120'], 'tech.sewer': ['hebeanlage', 'tank', 'trocken'], 'tech.genLocation': ['innen', 'aussen'], 'tech.cooling': ['auto', 'keine'],
    'site.seismic.ground': ['R', 'T', 'S'], 'site.seismic.soilClass': ['B', 'A', 'C', 'D', 'E'], 'site.seismic.siteClass': ['Default', 'A', 'B', 'BC', 'C', 'CD', 'D', 'DE', 'E'], 'site.seismic.importance': ['III', 'I', 'II', 'IV'],
    'schedule.state': ['DE', 'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'],
    'build.excavation.mode': ['boeschung', 'verbau'], 'build.excavation.backfill': ['aushub', 'kies'], 'build.mound.fill': ['aushub', 'liefer'], 'hazard.blast': ['keins', 'twk', 'eigen'],
    'self.equip.bagger': ['miete', 'eigen'], 'self.equip.ruettler': ['miete', 'eigen'], 'self.equip.pump': ['pumpe', 'rutsche', 'kuebel'],
    'self.concrete.mode': ['transport', 'werk', 'baustelle'], 'self.formwork.mode': ['miete', 'holz', 'vorhanden'], 'costs.planningMode': ['posten', 'prozent'], 'permit.zone': ['', 'bplan', 'innen', 'aussen'],
  };
  const NULLABLE = {
    'site.lat': [-90, 90], 'site.lon': [-180, 180], 'site.radon.soil': [0, 10000], 'site.groundNHN': [-500, 9000], 'site.seismic.agR': [0, 6], 'site.seismic.sds': [0, 4], 'site.seismic.sd1': [0, 3], 'permit.plot.area': [0, 1e7], 'site.waterDepth': [0, 100], 'build.excavation.angle': [20, 80],
    'costs.fx': [1e-6, 1e9], 'costs.pli': [0.05, 10],
    'protection.threat.velocity': [0, 10000], 'protection.threat.shots': [1, 1e6], 'protection.threat.spacing': [0, 1e5], 'protection.threat.distance': [0, 1e5], 'protection.threat.angle': [0, 90],
  };
  const DYNAMIC = new Set(['site.gw', 'site.climate', 'site.seismic.usgs', 'permit.formChecks', 'planning', 'prices', 'rates', 'self.mat', 'schedule.overrides', 'checklist']);

  /* Werte nach Typ des Standardwerts übernehmen; Listen und frei belegte Bereiche werden danach einzeln geprüft. */
  function typed(v, d, path) {
    if (DYNAMIC.has(path)) return v;
    if (Array.isArray(d)) return v;
    if (d === null) return v;
    if (isObj(d)) {
      const src = isObj(v) ? v : {}, out = {};
      for (const k of Object.keys(d)) out[k] = typed(src[k], d[k], path ? path + '.' + k : k);
      return out;
    }
    if (typeof d === 'number') return fin(v) ? v : d;
    if (typeof d === 'string') return typeof v === 'string' ? v.slice(0, 4000) : d;
    if (typeof d === 'boolean') return typeof v === 'boolean' ? v : d;
    return d;
  }
  const at = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const put = (o, path, v) => { const ks = path.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
  const numMap = (v, ok) => { const out = {}; if (isObj(v)) for (const k of Object.keys(v)) if (ID_RE.test(k) && fin(v[k]) && ok(v[k])) out[k] = v[k]; return out; };

  const wallsOf = (arr) => withIds(list(arr, 1000, N_('Wände')), N_('Wand')).map((w) => ({ id: w.id, a: point(w.a, N_('Wand')), b: point(w.b, N_('Wand')), t: nr(w.t, 0.175, 0.05, 1), kind: ownKey(WALL_KINDS, w.kind, 'mw') }));
  const openingsOf = (arr, outerOk) => withIds(list(arr, 2000, N_('Öffnungen')), N_('Öffnung')).map((o) => {
    const re = outerOk ? /^(e:\d{1,4}|w:(?!__)[A-Za-z0-9_-]{1,80})$/ : /^w:(?!__)[A-Za-z0-9_-]{1,80}$/;
    if (typeof o.host !== 'string' || !re.test(o.host)) bad(T_('Öffnung ohne gültige Bezugswand'));
    return { id: o.id, host: o.host, pos: nr(o.pos, 0, 0, 1e4), w: nr(o.w, 0.9, 0.3, 6), h: nr(o.h, 2, 0.3, 4), sill: nr(o.sill, 0, 0, 3), kind: ownKey(OPENING_KINDS, o.kind, 'innen') };
  });
  const roomsOf = (arr) => withIds(list(arr, 2000, N_('Räume')), N_('Raum')).map((r) => { const q = point(r, N_('Raum')); return { id: r.id, name: str(r.name, N_('Raum'), 80) || N_('Raum'), x: q.x, y: q.y }; });
  const columnsOf = (arr) => withIds(list(arr, 500, N_('Stützen')), N_('Stütze')).map((c) => { const q = point(c, N_('Stütze')); return { id: c.id, x: q.x, y: q.y, bx: nr(c.bx, 0.3, 0.2, 1.5), by: nr(c.by, 0.3, 0.2, 1.5), auto: c.auto === true }; });
  const beamsOf = (arr) => withIds(list(arr, 500, N_('Unterzüge')), N_('Unterzug')).map((u) => ({ id: u.id, a: point(u.a, N_('Unterzug')), b: point(u.b, N_('Unterzug')), bw: nr(u.bw, 0.3, 0.2, 1.5), hb: nr(u.hb, 0.4, 0.15, 2.0) }));
  const zonesOf = (arr) => withIds(list(arr, 200, N_('Bereiche ohne Stützen')), N_('Bereich')).map((z) => {
    const a = point({ x: z.x0, y: z.y0 }, N_('Bereich')), b = point({ x: z.x1, y: z.y1 }, N_('Bereich'));
    return { id: z.id, x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y), name: str(z.name, '', 60) };
  });

  function sanitize(raw, depth = 0) {
    const d = defaultProject();
    const legacyCosts = !isObj(raw.costs) || raw.costs.planningMode === undefined;
    const p = typed(raw, d, '');
    p.format = 'bunkerplaner'; p.version = d.version;
    p.name = str(raw.name, d.name, 120) || d.name;
    if (typeof raw.uid === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(raw.uid)) p.uid = raw.uid; // Projektkennung für IFC-GUIDs
    for (const [path, [lo, hi, int]] of Object.entries(RANGES)) { let v = clamp(at(p, path), lo, hi); if (int) v = Math.round(v); put(p, path, v); }
    for (const [path, allowed] of Object.entries(ENUMS)) put(p, path, oneOf(at(p, path), allowed, at(d, path)));
    for (const [path, [lo, hi]] of Object.entries(NULLABLE)) put(p, path, nrN(at(p, path), lo, hi));
    p.site.soil = ownKey(SOILS, p.site.soil, d.site.soil); p.use.surface = ownKey(SURFACE_LOADS, p.use.surface, d.use.surface);
    p.build.concrete = ownKey(CONCRETE, p.build.concrete, d.build.concrete); p.build.waterproofing = ownKey(WATERPROOFING, p.build.waterproofing, d.build.waterproofing);
    p.protection.threat.family = ownKey(PROT_FAMILIES, p.protection.threat.family, 'undefined');
    if (p.protection.threat.shots != null) p.protection.threat.shots = Math.round(p.protection.threat.shots);
    for (const [k, def] of Object.entries(d.hazard.scenarios)) {
      const s = p.hazard.scenarios[k];
      s.dist = def.dist === null ? nrN(s.dist, 0, 1000) : nr(s.dist, def.dist, 0, 1000);
    }
    for (const k of Object.keys(TRADES)) p.self.trades[k] = oneOf(p.self.trades[k], ['firma', 'eigen'], 'firma');
    if (legacyCosts) p.costs.planningMode = 'prozent'; // ältere Projekte rechneten die Planung als Prozentsatz
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.schedule.start)) p.schedule.start = d.schedule.start;
    for (const k of ['from', 'to']) if (!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(p.schedule.winter[k])) p.schedule.winter[k] = d.schedule.winter[k];
    {
      // gültiges Datum (Schaltjahr erlaubt 02-29) und Winterpause höchstens 120 Kalendertage
      const W = p.schedule.winter, dayOf = (md) => { const m = +md.slice(0, 2), dd = +md.slice(3); const t = new Date(Date.UTC(2024, m - 1, dd)); return t.getUTCDate() === dd ? Math.round((t - Date.UTC(2024, 0, 1)) / 864e5) : null; };
      for (const k of ['from', 'to']) if (dayOf(W[k]) === null) W[k] = d.schedule.winter[k];
      const a = dayOf(W.from), b = dayOf(W.to);
      if ((b - a + 366) % 366 + 1 > 120) { const t = new Date(Date.UTC(2024, 0, 1) + ((a + 119) % 366) * 864e5); W.to = String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0'); }
    }

    // Land und Region (ältere Projekte: Deutschland, Bundesland aus dem Bauablauf), Währung, Klima am Standort
    const site = isObj(raw.site) ? raw.site : {};
    p.site.country = BP.laender && BP.laender.valid(site.country) ? site.country : 'DE';
    p.site.region = typeof site.region === 'string' && /^[A-Za-z0-9 ._-]{0,30}$/.test(site.region) ? site.region : '';
    if (p.site.country === 'DE') {
      if (!p.site.region && p.schedule.state && p.schedule.state !== 'DE') p.site.region = p.schedule.state;
      if (p.site.region && !(BP.kalender && BP.kalender.STATES[p.site.region])) p.site.region = '';
      p.schedule.state = p.site.region || 'DE';
    }
    p.costs.currency = typeof (raw.costs || {}).currency === 'string' && /^[A-Z]{3}$/.test(raw.costs.currency) ? raw.costs.currency : null;
    const cl = site.climate;
    const temps = isObj(cl) && Array.isArray(cl.temps) && cl.temps.length === 12 && cl.temps.every((x) => typeof x === 'number' && isFinite(x) && x > -60 && x < 60) ? cl.temps.map((x) => Math.round(x * 10) / 10) : null;
    p.site.climate = temps ? { temps, source: str(cl.source, '', 300), period: str(cl.period, '', 40), fetched: str(cl.fetched, '', 40), lat: nrN(cl.lat, -90, 90), lon: nrN(cl.lon, -180, 180) } : null;

    // Bauantrag: Registerschlüssel nur, wenn er bekannt ist; Texte begrenzt
    if (!(BP.bauantragDaten && BP.bauantragDaten.j[p.permit.jur])) p.permit.jur = '';
    for (const grp of ['bauherr', 'plot', 'author', 'engineer']) for (const [k, v] of Object.entries(p.permit[grp])) if (typeof v === 'string') p.permit[grp][k] = v.slice(0, 200);
    p.permit.title = p.permit.title.slice(0, 300);
    const fc = isObj(raw.permit) && isObj(raw.permit.formChecks) ? raw.permit.formChecks : {};
    p.permit.formChecks = {};
    for (const [u, c] of Object.entries(fc).slice(0, 300)) if (/^https:\/\/[^\s"<>]{1,600}$/.test(u) && isObj(c)) p.permit.formChecks[u] = { sha256: /^[0-9a-f]{64}$/.test(c.sha256) ? c.sha256 : '', size: nrN(c.size, 0, 1e9), lastModified: str(c.lastModified, '', 80), checked: str(c.checked, '', 20), pdf: c.pdf === true, changed: c.changed === true };
    // Erdbebenwerte von USGS (nur zur Herkunft; gerechnet wird mit sds/sd1)
    const us = isObj(site.seismic) ? site.seismic.usgs : null;
    p.site.seismic.usgs = isObj(us) ? { sds: nrN(us.sds, 0, 4), sd1: nrN(us.sd1, 0, 3), pgam: nrN(us.pgam, 0, 4), sms: nrN(us.sms, 0, 6), sm1: nrN(us.sm1, 0, 4), tl: nrN(us.tl, 0, 30),
      sdc: typeof us.sdc === 'string' && /^[A-F]$/.test(us.sdc) ? us.sdc : null, siteClass: oneOf(us.siteClass, ENUMS['site.seismic.siteClass'], null), riskCategory: oneOf(us.riskCategory, ['I', 'II', 'III', 'IV'], null),
      fetched: str(us.fetched, '', 40), lat: nrN(us.lat, -90, 90), lon: nrN(us.lon, -180, 180), source: str(us.source, '', 300) } : null;

    // Frei belegte Bereiche
    const gw = site.gw;
    p.site.gw = isObj(gw) ? {
      fetched: str(gw.fetched, '', 40), issued: str(gw.issued, '', 40), source: str(gw.source, '', 300), license: str(gw.license, '', 300), stale: gw.stale === true,
      lat: nrN(gw.lat, -90, 90), lon: nrN(gw.lon, -180, 180),
      results: list(gw.results, 50, N_('Grundwasserdaten')).filter(isObj).map((r) => ({ id: str(r.id, '', 40), name: str(r.name, '', 200), distanceKm: nrN(r.distanceKm, 0, 1e4), date: str(r.date, '', 40),
        value: nrN(r.value), low: nrN(r.low), high: nrN(r.high), groundNHN: nrN(r.groundNHN), link: str(r.link, '', 500) })),
    } : null;
    p.prices = numMap(raw.prices, (v) => v >= 0 && v <= 1e7);
    p.rates = numMap(raw.rates, (v) => v > 0 && v <= 1e6);
    p.self.mat = numMap(isObj(raw.self) ? raw.self.mat : null, (v) => v >= 0 && v <= 1e7);
    p.schedule.overrides = numMap(isObj(raw.schedule) ? raw.schedule.overrides : null, (v) => v >= 0 && v <= 1000);
    p.checklist = {};
    if (isObj(raw.checklist)) for (const c of CHECKLIST) { const e = raw.checklist[c.id]; if (isObj(e)) p.checklist[c.id] = { done: e.done === true, note: str(e.note, '', 500) }; }

    // Geometrie
    const g = isObj(raw.geom) ? raw.geom : {};
    const outline = list(g.outline, 200, N_('Außenkontur')).map((q) => point(q, N_('Außenkontur')));
    p.geom.outline = outline.length >= 3 ? G.ensureCCW(outline) : d.geom.outline;
    p.geom.walls = wallsOf(g.walls);
    p.geom.openings = openingsOf(g.openings, true);
    p.geom.access = withIds(list(g.access, 50, N_('Zugänge')), N_('Zugang')).map((a) => {
      const base = { id: a.id, kind: oneOf(a.kind, ['treppe', 'schacht'], null), edge: Math.round(nr(a.edge, 0, 0, 1000)), pos: nr(a.pos, 0, 0, 1e4), tw: nr(a.tw, 0.25, 0.15, 0.6) };
      if (!base.kind) bad(T_('Zugang mit unbekannter Art'));
      return base.kind === 'treppe'
        ? Object.assign(base, { width: nr(a.width, 1, 0.6, 3), landing: nr(a.landing, 1.2, 0.8, 4), cover: oneOf(a.cover, ['klappe', 'offen'], 'klappe') })
        : Object.assign(base, { width: nr(a.width, 0.8, 0.6, 2), depth: nr(a.depth, 0.8, 0.6, 2), lw: nr(a.lw, 0.6, 0.4, 1.5), lh: nr(a.lh, 0.8, 0.4, 2) }, fin(a.sill) ? { sill: clamp(a.sill, 0, 3) } : {});
    });
    p.geom.rooms = roomsOf(g.rooms);
    p.geom.columns = columnsOf(g.columns);
    p.geom.beams = beamsOf(g.beams);
    p.geom.zones = zonesOf(g.zones);
    // Weitere Ebenen
    p.levels = withIds(list(raw.levels, 9, N_('Ebenen')), N_('Ebene')).map((L, i) => ({
      id: L.id, name: str(L.name, 'Ebene ' + (i + 2), 60) || 'Ebene ' + (i + 2),
      clearHeight: nr(L.clearHeight, 2.4, 1.8, 6), tSlab: nr(L.tSlab, 0.3, 0.15, 1.5),
      walls: wallsOf(L.walls), openings: openingsOf(L.openings, false), rooms: roomsOf(L.rooms), columns: columnsOf(L.columns), zones: zonesOf(L.zones), beams: beamsOf(L.beams),
    }));
    const nLv = 1 + p.levels.length;
    p.geom.verts = withIds(list(g.verts, 100, N_('Treppen und Aufzüge')), N_('Treppe/Aufzug')).map((v) => {
      const kind = oneOf(v.kind, ['treppe', 'aufzug'], null);
      if (!kind) bad(T_('Treppe/Aufzug mit unbekannter Art'));
      const q = point(v, N_('Treppe/Aufzug'));
      const base = { id: v.id, kind, x: q.x, y: q.y, dir: oneOf(v.dir, [0, 90, 180, 270], 0) };
      if (kind === 'treppe') return Object.assign(base, { w: nr(v.w, 1.0, 0.8, 3), upper: Math.round(nr(v.upper, 0, 0, Math.max(0, nLv - 2))), landing: nr(v.landing, 1.0, 0.8, 3) });
      return Object.assign(base, {
        type: oneOf(v.type, ['personen', 'lasten'], 'lasten'), payload: Math.round(nr(v.payload, 1000, 225, 10000)),
        w: nr(v.w, 1.1, 0.8, 5), d: nr(v.d, 2.1, 0.8, 8), door: nr(v.door, 1.0, 0.7, 4), drive: oneOf(v.drive, ['seil', 'hydraulik'], 'seil'),
        speed: nr(v.speed, 0.5, 0.15, 2.5), top: Math.round(nr(v.top, -1, -1, nLv - 1)), bottom: Math.round(nr(v.bottom, nLv - 1, 0, nLv - 1)), tw: nr(v.tw, 0.25, 0.15, 0.6),
      });
    });
    // IDs müssen über alle Ebenen eindeutig sein (Auswahl, Meldungen, Öffnungen)
    const all = new Set();
    const uniq = (arr, what) => arr.forEach((x) => { if (all.has(x.id)) bad(T_('{what} mit doppelter ID', { what: T_(what) })); all.add(x.id); });
    for (const L of [p.geom].concat(p.levels)) { uniq(L.walls, N_('Wand')); uniq(L.openings, N_('Öffnung')); uniq(L.rooms, N_('Raum')); uniq(L.columns, N_('Stütze')); uniq(L.zones, N_('Bereich')); uniq(L.beams, N_('Unterzug')); }
    uniq(p.geom.access, N_('Zugang')); uniq(p.geom.verts, N_('Treppe/Aufzug')); uniq(p.levels, N_('Ebene'));
    p.routes = withIds(list(raw.routes, 500, N_('Leitungen')), N_('Leitung')).map((r) => {
      const type = oneOf(r.type, ['luft', 'kabel'], 'luft');
      return { id: r.id, type, kind: ownKey(ROUTE_KINDS, r.kind, type === 'kabel' ? 'strom' : 'zuluft'), name: str(r.name, N_('Leitung'), 120),
        shape: oneOf(r.shape, ['rund', 'rechteck'], type === 'luft' ? 'rund' : 'rechteck'), d: nr(r.d, 0.125, 0.05, 1), w: nr(r.w, 0.1, 0.02, 2), hgt: nr(r.hgt, 0.06, 0.01, 2),
        ins: nr(r.ins, 0, 0, 0.3), clr: nr(r.clr, 0.05, 0, 1), airflow: nrN(r.airflow, 0, 1e6), reserve: nr(r.reserve, 15, 0, 100), cable: str(r.cable, '', 120),
        pts: list(r.pts, 500, N_('Wegpunkte')).filter((q) => isObj(q) && fin(q.x) && fin(q.y) && fin(q.h)).map((q) => ({ x: clamp(q.x, -1e4, 1e4), y: clamp(q.y, -1e4, 1e4), h: clamp(q.h, -50, 50) })) };
    });
    p.tech.consumers = withIds(list(isObj(raw.tech) ? raw.tech.consumers : null, 200, N_('Verbraucher')), N_('Verbraucher')).map((c) => {
      const out = { id: c.id, name: str(c.name, N_('Verbraucher'), 80), w: nr(c.w, 0, 0, 1e6), h: nr(c.h, 0, 0, 24) };
      if (c.auto === 'lueftung' || c.auto === 'licht') out.auto = c.auto;
      return out;
    });
    // Aufstellort der Einbauten: Raum-ID oder „auto“ je Gerät
    p.tech.place = {};
    const plc = isObj(raw.tech) && isObj(raw.tech.place) ? raw.tech.place : {};
    for (const k of EQUIP_IDS) if (typeof plc[k] === 'string' && (plc[k] === 'auto' || ID_RE.test(plc[k]))) p.tech.place[k] = plc[k];
    const svc = isObj(raw.costs) && Array.isArray(raw.costs.services) ? raw.costs.services : [];
    p.costs.services = d.costs.services.map((s) => { const v = svc.find((x) => isObj(x) && x.id === s.id); return v ? { id: s.id, name: s.name, on: v.on === true, amount: nrN(v.amount, 0, 1e9) } : s; });
    const prot = isObj(raw.protection) && isObj(raw.protection.components) ? raw.protection.components : {};
    for (const key of Object.keys(PROT_TARGETS)) {
      const src = isObj(prot[key]) ? prot[key] : {};
      p.protection.components[key].layers = list(src.layers, 50, N_('Schutzschichten')).filter(isObj).map((l) => ({
        id: typeof l.id === 'string' && ID_RE.test(l.id) ? l.id : uid('s'), material: ownKey(PROT_MATERIALS, l.material, 'other'),
        grade: str(l.grade, '', 200), strength: str(l.strength, '', 200), thickness: nrN(l.thickness, 0.1, 5000), density: nrN(l.density, 0, 25000) }));
    }
    // Planungsdaten (Szenarien, Abdichtung, Einkauf): eigene Prüfung in planning.js
    const pl = isObj(raw.planning) ? raw.planning : {}, pd = d.planning;
    p.planning = {
      scenarios: list(pl.scenarios, 100, N_('Szenarien')),
      moisture: Object.assign({}, pd.moisture, isObj(pl.moisture) ? Object.fromEntries(Object.keys(pd.moisture).filter((k) => Object.hasOwn(pl.moisture, k)).map((k) => [k, pl.moisture[k]])) : {}),
      procurement: isObj(pl.procurement) ? { offers: pl.procurement.offers || {}, deliveries: pl.procurement.deliveries || {}, extras: list(pl.procurement.extras, 500, N_('Zusatzpositionen')) } : pd.procurement,
    };
    BP.planning.validate(p);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.ops.start)) p.ops.start = '';
    // Varianten: jeder Stand wird wie eine eigene Projektdatei geprüft; fehlerhafte Stände fallen weg
    p.variants = depth > 0 || !Array.isArray(raw.variants) ? [] : raw.variants.slice(0, 4 * VARIANTS_MAX).filter(isObj).map((v) => {
      if (!isObj(v.snap)) return null;
      let snap;
      try { snap = sanitize(Object.assign(JSON.parse(JSON.stringify(v.snap)), { variants: [] }), 1); } catch (e) { return null; }
      delete snap.variants; delete snap.uid;
      const m = {};
      if (isObj(v.m)) for (const k of VARIANT_KEYS) m[k] = fin(v.m[k]) ? v.m[k] : null;
      return { id: typeof v.id === 'string' && ID_RE.test(v.id) ? v.id : uid('v'), name: str(v.name, N_('Variante'), 80) || N_('Variante'),
        created: typeof v.created === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v.created) ? v.created : '', snap, m };
    }).filter(Boolean).slice(0, VARIANTS_MAX);
    return p;
  }

  /* Projekt laden: aktuelles Format oder Vorversion (Format „bunker-outline“). */
  function normalize(raw) {
    if (!isObj(raw)) throw new Error(T_('Keine gültige Projektdatei.'));
    if (raw.format === 'bunker-outline') { const p = sanitize(JSON.parse(JSON.stringify(migrateOld(raw)))); p._migrated = true; return p; }
    if (raw.format !== 'bunkerplaner') throw new Error(T_('Unbekanntes Dateiformat.'));
    return sanitize(JSON.parse(JSON.stringify(raw)));
  }

  function migrateOld(old) {
    const p = defaultProject();
    const pl = isObj(old.planning) ? old.planning : {};
    p.name = String(old.name || N_('Importiertes Projekt'));
    const pts = Array.isArray(old.points) ? old.points.filter((q) => isObj(q) && fin(q.x) && fin(q.y)) : [];
    if (pts.length >= 3) p.geom.outline = G.ensureCCW(pts.map((q) => ({ x: q.x, y: q.y })));
    const ccwFlipped = pts.length >= 3 && G.signedArea(pts) < 0;
    const nOut = p.geom.outline.length;
    const edgeMap = (i) => (ccwFlipped ? (nOut - 2 - i + nOut) % nOut : i);
    p.build.tWall = num(old.outerThickness, p.build.tWall);
    const okPt = (q) => isObj(q) && fin(q.x) && fin(q.y);
    p.geom.walls = (Array.isArray(old.walls) ? old.walls : []).filter((w) => isObj(w) && okPt(w.a) && okPt(w.b)).map((w, i) => ({
      id: 'w' + (i + 1), a: { x: w.a.x, y: w.a.y }, b: { x: w.b.x, y: w.b.y },
      t: num(w.thickness, 0.2), kind: w.type === 'exterior' ? 'stb' : 'mw',
    }));
    p.geom.openings = []; p.geom.access = []; p.geom.rooms = [];
    const s = isObj(pl.structure) ? pl.structure : null;
    if (s) {
      p.build.clearHeight = num(s.height, p.build.clearHeight);
      p.build.tFloor = num(s.floor, p.build.tFloor);
      p.build.tRoof = num(s.roof, p.build.tRoof);
      if (typeof s.cover === 'number' && s.cover > 0) p.build.cover = s.cover;
    }
    // Höhenbezug der Vorgängerversion
    let floorZ = null;
    const site = isObj(pl.environment) && isObj(pl.environment.site) ? pl.environment.site : null;
    if (site && s) {
      const total = num(s.height, 2.4) + num(s.floor, 0.3) + num(s.roof, 0.4);
      let roof = site.roofDepth, floor = site.floorDepth;
      if (site.depthMode === 'roof') floor = typeof roof === 'number' ? roof + total : null;
      if (site.depthMode === 'floor') roof = typeof floor === 'number' ? floor - total : null;
      if (typeof roof === 'number' && typeof floor === 'number') {
        floorZ = -(floor - num(s.floor, 0.3));
        const cover = roof + num(site.terrainChange, 0);
        if (cover >= 0) p.build.cover = cover;
      }
      if (typeof site.lat === 'number') { p.site.lat = site.lat; p.site.lon = site.lon; p.site.label = site.label || ''; }
      if (typeof site.groundNHN === 'number') p.site.groundNHN = site.groundNHN;
      if (typeof site.designWater === 'number' && site.waterUnit !== 'nhn') { p.site.waterMode = 'tiefe'; p.site.waterDepth = site.designWater; }
    }
    const r = isObj(pl.requirements) ? pl.requirements : null;
    if (r && typeof r.people === 'number') p.use.people = r.people;
    // Einbauten
    const objs = Array.isArray(pl.objects) ? pl.objects : [];
    p.routes = [];
    for (const o of objs) {
      if (!isObj(o)) continue;
      if (o.type === 'ventilation' || o.type === 'cable') {
        const sec = isObj(o.section) ? o.section : {};
        const H = p.build.clearHeight;
        const opts = (Array.isArray(o.points) ? o.points : []).filter(isObj);
        const zs = opts.map((q) => num(q.z, num(o.z, 2)));
        let toH = (z) => z;
        if (floorZ != null) { const hs = zs.map((z) => z - floorZ); if (hs.every((h) => h > -2 && h < H + 8)) toH = (z) => z - floorZ; }
        const kindMap = { supply: 'zuluft', exhaust: 'abluft', recirculation: 'umluft', power: 'strom', data: 'daten', reserve: 'reserve' };
        const isAir = o.type === 'ventilation';
        p.routes.push({
          id: uid('l'), type: isAir ? 'luft' : 'kabel', kind: kindMap[o.kind] || (isAir ? 'zuluft' : 'strom'), name: String(o.name || (isAir ? N_('Lüftungsweg') : N_('Kabelweg'))),
          shape: isAir && sec.shape !== 'rect' ? 'rund' : 'rechteck', d: num(o.diameter, num(sec.width, 0.125)), w: num(sec.width, 0.1), hgt: num(sec.height, 0.06),
          ins: num(sec.insulation, 0), clr: num(sec.clearance, 0.05), airflow: typeof o.airflow === 'number' ? o.airflow : null, reserve: num(o.reserve, 15), cable: String(o.circuit || ''),
          pts: opts.map((q, i) => ({ x: num(q.x, 0), y: num(q.y, 0), h: G.round(toH(zs[i]), 3) })),
        });
      } else if (o.type === 'entrance' && isObj(o.host)) {
        const width = num(o.width, 1);
        if (o.host.kind === 'outline' && Number.isInteger(o.host.index) && o.host.index >= 0 && o.host.index < nOut) {
          const e = edgeMap(o.host.index);
          const a = p.geom.outline[e], b = p.geom.outline[(e + 1) % nOut];
          const len = a && b ? G.dist(a, b) : 0;
          let t = typeof o.host.t === 'number' ? o.host.t : (num(o.from, 0) + num(o.to, 1)) / 2;
          if (ccwFlipped) t = 1 - t;
          const pos = t * len;
          if (o.closure === 'hatch') p.geom.access.push({ id: uid('a'), kind: 'treppe', edge: e, pos, width: Math.min(width, 2.5), tw: num(o.access && o.access.wallThickness, 0.25), cover: 'klappe', landing: 1.2 });
          else if (o.role === 'emergency') p.geom.access.push({ id: uid('a'), kind: 'schacht', edge: e, pos, width: 0.8, depth: 0.8, tw: 0.25, lw: Math.min(width, 0.8), lh: Math.min(num(o.height, 0.8), 1.2) });
          else p.geom.openings.push({ id: uid('o'), host: 'e:' + e, pos, w: width, h: num(o.height, 2), sill: 0, kind: 'schutztuer' });
        } else if (o.host.kind === 'wall' && p.geom.walls[o.host.index]) {
          const w = p.geom.walls[o.host.index];
          const t = typeof o.host.t === 'number' ? o.host.t : (num(o.from, 0) + num(o.to, 1)) / 2;
          p.geom.openings.push({ id: uid('o'), host: 'w:' + w.id, pos: t * G.dist(w.a, w.b), w: width, h: num(o.height, 2), sill: 0, kind: o.role === 'internal' ? 'innen' : 'schutztuer' });
        }
      }
    }
    // Schutzprofil
    if (isObj(pl.protection) && isObj(pl.protection.threat)) {
      const th = pl.protection.threat;
      Object.keys(p.protection.threat).forEach((k) => { if (th[k] !== undefined && (k !== 'family' || PROT_FAMILIES[th[k]])) p.protection.threat[k] = th[k]; });
      const tmap = { outer: 'aussenwand', exterior: 'aussenwand', roof: 'decke', floor: 'bodenplatte', interior: 'innenwand', penetrations: 'durchfuehrungen' };
      for (const c of Array.isArray(pl.protection.components) ? pl.protection.components : []) {
        if (!isObj(c)) continue;
        const key = tmap[c.target] || (/^(closure|shaft):/.test(String(c.target)) ? 'zugang' : null);
        if (!key) continue;
        const dst = p.protection.components[key];
        if (dst.layers.length) continue;
        dst.layers = (Array.isArray(c.layers) ? c.layers : []).filter(isObj).map((l) => ({ material: PROT_MATERIALS[l.material] ? l.material : 'other', grade: String(l.grade || ''), strength: String(l.strength || ''), thickness: typeof l.thickness === 'number' ? l.thickness : null, density: typeof l.density === 'number' ? l.density : null }));
        dst.reinforcement = String(c.reinforcement || ''); dst.connections = String(c.connections || '');
        if (isObj(c.evidence)) dst.evidence = { reference: String(c.evidence.reference || ''), authority: String(c.evidence.authority || ''), date: String(c.evidence.date || ''), scope: String(c.evidence.scope || ''), baseline: '' };
      }
    }
    p._migrated = true;
    return p;
  }

  /* Alle Ebenen einheitlich: Index 0 ist die oberste Ebene (p.geom, p.build.clearHeight), darunter p.levels. */
  function levelGeoms(p) {
    const top = { idx: 0, id: 'L0', name: T_('Ebene 1 (oben)'), H: p.build.clearHeight, tSlab: 0, walls: p.geom.walls, openings: p.geom.openings, rooms: p.geom.rooms, columns: p.geom.columns || [], zones: p.geom.zones || [], beams: p.geom.beams || [], src: p.geom };
    return [top].concat((p.levels || []).map((L, i) => ({ idx: i + 1, id: L.id, name: L.name, H: L.clearHeight, tSlab: L.tSlab, walls: L.walls, openings: L.openings, rooms: L.rooms, columns: L.columns || [], zones: L.zones || [], beams: L.beams || [], src: L })));
  }

  BP.model = {
    levelGeoms,
    uid, SOILS, SURFACE_LOADS, CONCRETE, WATERPROOFING, WALL_KINDS, OPENING_KINDS, PRICES, RATES, CHECKLIST, checkText, STEPS, VARIANT_KEYS, VARIANTS_MAX, EQUIP_IDS,
    ROUTE_KINDS, PROT_FAMILIES, PROT_PROJECTILE, PROT_MATERIALS, PROT_TARGETS, protComponent, protDefaults,
    HAZARD_PRESETS, SPECIAL_SCENARIOS, hazardDefaults,
    TRADES, SPLIT, selfDefaults, servicesDefault, MONEY_PATHS, rescaleMoney, setCountry,
    defaultProject, defaultConsumers, defaultRoutes, shapeRect, shapeL, normalize,
  };
})(typeof window !== 'undefined' ? window : globalThis);
