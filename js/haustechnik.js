/* Schutz- und Haustechnik der Vorplanung:
 *  – Abwasser: Schmutzwasserabfluss nach DIN EN 12056-2 (Qww = K·√ΣDU), Fäkalienhebeanlage nach DIN EN 12056-4 / EN 12050-1
 *    (Druckleitung DN 80, v ≥ 0,7 m/s, Rückstauschleife über die Rückstauebene), Sammeltank für den Schutzbetrieb
 *  – Wärmebilanz und Kühlung: Personen und Geräte gegen Erdreich (stationär, Langzeitfaktor) und Außenluft im Sommer
 *  – Schutzlüftung: Filterbetrieb, Überdruck, zulässige Leckage der Hülle, Schleusenspülung
 *  – Notstrom: Kraftstofftank (AwSV), Verbrennungsluft, Abgasmenge und Abgasleitung, Kühlluft des Maschinenraums
 *  – Explosionsschutzventile für alle Luftdurchführungen der Hülle bei Luftstoß
 * Richtwerte der Vorplanung; Auslegung und Produkte durch den Fachplaner TGA und die Hersteller. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const max = Math.max, min = Math.min, ceil = Math.ceil, PI = Math.PI;
  const T_ = BP.i18n.T, N_ = BP.i18n.N, I18 = BP.i18n;
  const ESV_SIZES = [75, 150, 300, 600, 1200, 2400, 4800];
  const TANKS = [200, 400, 600, 1000, 1500, 2000, 3000, 5000, 7500, 10000];
  const DN = [40, 50, 65, 80, 100, 125, 150, 200, 250, 300];
  const MOTORS = [0.55, 0.75, 1.1, 1.5, 2.2, 3.0, 4.0, 5.5, 7.5];
  const pick = (arr, v) => arr.find((x) => x >= v - 1e-9) || arr[arr.length - 1];

  /* Abwasser: Anschlusswerte DU in l/s (DIN EN 12056-2, System I) */
  function sewage(p, lv, n) {
    const t = p.tech, mode = t.sewer || 'hebeanlage';
    const nWC = mode === 'trocken' ? 0 : max(1, ceil(n / 25)), nBasin = max(1, nWC), nShower = n > 12 ? ceil(n / 50) : 0, nSink = 1;
    const sumDU = 2.0 * nWC + 0.5 * nBasin + 0.6 * nShower + 0.8 * nSink, K = n > 50 ? 1.0 : 0.7; // häufige bzw. sehr häufige Benutzung
    const Qww = max(K * Math.sqrt(sumDU), nWC ? 2.0 : 0.8);
    const perDay = n * ((t.waterHygiene || 0) + 1.0); // l/d
    const out = { mode, nWC, nBasin, nShower, nSink, sumDU, K, Qww, perDay };
    if (mode === 'hebeanlage') {
      const dn = nWC ? 80 : 50, A = PI * Math.pow(dn / 1000, 2) / 4;
      const Qp = max(Qww, 0.7 * A * 1000); // l/s, Mindestgeschwindigkeit 0,7 m/s
      const Hgeo = max(0, -lv.zFloorTop) + 1.0 + 0.2; // Pumpensumpf 1 m unter dem Fußboden bis über die Rückstauebene (Gelände)
      const Lp = Hgeo + 15, v = Qp / 1000 / A;
      const hf = 0.02 / (dn / 1000) * v * v / 19.62 * Lp + 6 * v * v / 19.62; // Reibung (λ ≈ 0,02) und Einzelverluste
      const H = Hgeo + hf, Phyd = 9.81 * Qp / 1000 * H; // kW
      const motor = pick(MOTORS, Phyd / 0.35);
      const double = n >= 20;
      Object.assign(out, { dn, Qp, v, Hgeo, H, Lp, motor, double, runH: perDay / (Qp * 3600) });
    }
    return out;
  }

  /* Wärmebilanz: Last aus Personen und Geräten, Abgabe ins Erdreich und über die Außenluft (Sommer) */
  function heat(p, ctx) {
    const t = p.tech, b = p.build, env = ctx.env, n = ctx.n;
    const tIn = t.tInMax != null ? t.tInMax : 28, tOut = t.tOutSummer != null ? t.tOutSummer : 32, tSoil = t.tSoil != null ? t.tSoil : 10;
    const persons = n * t.heatPerPerson, equip = ctx.whDayBase / 24, load = persons + equip;
    // Erdreich: Wand/Decke/Sohle mit Beton, Dämmung und rund 1 m Boden; Langzeitfaktor 0,5 (das Erdreich erwärmt sich)
    const ins = b.insulation || {};
    const R = (tc, ti) => 0.13 + tc / 2.3 + (ti || 0) / 0.035 + 1.0 / 1.5;
    const Aw = env.wallsOut || 0, Ar = env.roof || 0, Af = env.floor || 0;
    const UA = Aw / R(b.tWall, ins.walls) + Ar / R(b.tRoof, ins.roof) + Af / R(b.tFloor, ins.floor);
    const ground = 0.5 * UA * max(0, tIn - tSoil);
    const flowN = ctx.ventSize * ctx.ventN, flowF = isFinite(ctx.qCo2) ? ctx.qCo2 : flowN;
    const vent = (qf) => 1200 / 3600 * qf * (tIn - tOut); // W; negativ, wenn die Außenluft wärmer ist
    const coolN = max(0, load - ground - vent(flowN)), coolF = max(0, load - ground - vent(flowF));
    const cool = max(coolN, coolF), mode = t.cooling || 'auto';
    const kW = cool > 50 ? Math.ceil(cool / 500) * 0.5 : 0, cop = 3.0;
    return { tIn, tOut, tSoil, persons, equip, load, UA, ground, flowN, flowF, ventN: vent(flowN), ventF: vent(flowF), coolN, coolF, cool, kW, cop, mode,
      latent: n * 45, elec: mode === 'auto' && kW > 0 ? kW * 1000 / cop : 0 };
  }

  /* Schutzlüftung: Filterbetrieb, Überdruck, Leckage, Schleuse */
  function protVent(p, geo, ctx) {
    const t = p.tech, hz = p.hazard || {};
    if (!hz.cb) return null;
    const qF = isFinite(ctx.qCo2) ? ctx.qCo2 : ctx.ventSize * ctx.ventN;
    const dp = t.overpressure != null ? t.overpressure : 50;
    const leakMax = 0.5 * qF; // Leckage der Hülle bei Prüfdruck: höchstens die Hälfte der Filterluft, der Rest regelt das Überdruckventil
    const sch = geo.L.flatMap((L) => L.rooms || []).filter((r) => /schleuse/i.test(r.name || ''));
    const Vs = sch.reduce((s, r) => s + (r.volume || 0), 0);
    const purge = Vs > 0 ? 5 * Vs / max(qF / 3, 1) * 60 : 0; // fünffacher Luftwechsel mit einem Drittel der Filterluft, Minuten
    const dpFilter = 800, dpDuct = 250, fan = qF / 3600 * (dpFilter + dpDuct + dp) / 0.4;
    return { qF, dp, leakMax, Vs, purge, dpFilter, fan, hand: qF / max(ctx.ventN, 1) <= 150 + 1e-9 };
  }

  /* Notstrom: Kraftstoff, Verbrennungsluft, Abgas, Maschinenraum */
  function genset(p, ctx) {
    const t = p.tech, kVA = ctx.generator;
    if (!(kVA > 0)) return null;
    const kW = 0.8 * kVA, loc = t.genLocation || 'innen';
    const avgkW = ctx.whDay / 24 / 1000, lph = 0.08 * kW + t.fuelPerKWh * avgkW; // Verbrauchskennlinie mit Leerlaufanteil
    const fuel = ctx.fuel * 1.1;
    const tankSize = fuel > 0 ? pick(TANKS, fuel) : 0, nTanks = fuel > 10000 ? ceil(fuel / 10000) : fuel > 0 ? 1 : 0;
    const stufe = fuel <= 1000 ? 'A' : fuel <= 10000 ? 'B' : fuel <= 100000 ? 'C' : 'D';
    // Verbrennungsluft ≈ 5,5 m³ je kWh bei Volllast; Abgas ≈ 14 m³/h je kW (500 °C)
    const air = 5.5 * kW, exh = 14.3 * kW, exhCold = exh / 2.64;
    const dExh = Math.sqrt(4 * exh / 3600 / (PI * 25)) * 1000, dnExh = pick(DN, dExh);
    // Maschinenraum innen: Wärme ≈ 1,1 · Nennleistung (Kühler und Abstrahlung), Lufterwärmung 15 K
    const roomHeat = loc === 'innen' ? 1.1 * kW : 0, coolAir = loc === 'innen' ? roomHeat * 3600 / (1.2 * 15) : 0;
    return { kVA, kW, loc, avgkW, lph, fuel, tankSize, nTanks, stufe, air, exh, exhCold, dExh, dnExh, roomHeat, coolAir, intake: air + coolAir, hours: (ctx.genDays + (ctx.batDays || 0)) * 24 };
  }

  /* Explosionsschutzventile je Luftdurchführung (nur bei Luftstoß) */
  function valves(p, ctx, gen, sew) {
    const hz = p.hazard || {}, blast = hz.blast === 'twk' || hz.blast === 'eigen';
    const list = [];
    const add = (de, flow, kind, n) => list.push({ name: T_(de), de, flow, size: pick(ESV_SIZES, flow / max(n, 1)), n: n || 1, kind }); // de: Schlüssel der Einkaufsliste
    if (blast) {
      add(N_('Zuluft Schutzlüftung'), ctx.ventSize * ctx.ventN, 'esv', ctx.ventN);
      add(N_('Fortluft mit Überdruckventil'), ctx.ventSize * ctx.ventN, 'esv', ctx.ventN);
      if (gen && gen.loc === 'innen') { add(N_('Maschinenraum: Verbrennungs- und Kühlluft'), gen.intake, 'esv', 1); add(N_('Maschinenraum: Fortluft'), gen.coolAir, 'esv', 1); add(N_('Abgas Notstromaggregat (hitzebeständig, Heißgasmenge)'), gen.exh, 'abgas', 1); }
      if (sew && sew.mode === 'hebeanlage') add(N_('Entlüftung Hebeanlage'), 30, 'esv', 1);
    }
    return { blast, list, qk: blast ? (hz.blast === 'eigen' && isFinite(hz.qk) ? hz.qk : 100) : 0 };
  }

  const priceEsv = (size, kind) => (kind === 'abgas' ? 2500 + 3.0 * size : 800 + 2.8 * size);
  const priceUev = (size) => 400 + 1.0 * size;

  /* Schwere Einbauten und Vorräte als Lasten für die Platten: je Gerät Grundfläche einer Einheit (L × B in m), Anzahl,
   * Eigengewicht mg und Füllung me in kg je Einheit. Eigengewicht ist ständige Last (G), Füllung (Wasser, Kraftstoff,
   * Vorräte, Abwasser) veränderliche Lagerlast (DIN EN 1991-1-1/NA Kat. E: ψ0 = 1,0, ψ2 = 0,8).
   * Massen und Maße sind Richtwerte üblicher Geräte; Herstellerangaben ersetzen sie in der Ausführungsplanung. */
  const IBC = { L: 1.2, B: 1.0 };
  function tankDims(V) { const A = max(0.4, V / 1000 / 1.3), B = min(1.5, Math.sqrt(A)); return { L: A / B, B }; }
  function equipment(p, c) {
    const hz = p.hazard || {}, out = [];
    const add = (o) => { if (o.n > 0) out.push(Object.assign({ me: 0, dyn: 1, src: '' }, o)); };
    const gen = c.gen;
    if (gen && gen.loc === 'innen') {
      const kVA = gen.kVA;
      add({ id: 'gen', kind: 'technik', name: T_('Notstromaggregat {kva} kVA', { kva: kVA }), n: 1, L: 1.5 + 0.0075 * kVA, B: 0.75 + 0.0018 * kVA, mg: 450 + 10 * kVA, dyn: 1.2,
        src: T_('Masse ≈ 450 kg + 10 kg/kVA, Schwingbeiwert 1,2 (Aufstellung auf Schwingungsdämpfern)') });
      if (gen.tankSize > 0 && gen.nTanks > 0) {
        const V = gen.tankSize, per = min(V, gen.fuel / gen.nTanks);
        add(Object.assign({ id: 'fuel', kind: 'technik', name: gen.nTanks > 1 ? T_('Kraftstofftank {v} L ({n} Stück)', { v: V, n: gen.nTanks }) : T_('Kraftstofftank {v} L', { v: V }), n: gen.nTanks, mg: 0.15 * V, me: 0.84 * per,
          src: T_('doppelwandiger Stahltank, Höhe ≈ 1,3 m, 0,15 kg/L leer; Diesel 0,84 kg/L') }, tankDims(V)));
      }
    }
    if (c.battery > 0) {
      const kWh = c.battery, n = ceil(kWh / 40 - 1e-9);
      add({ id: 'bat', kind: 'batterie', name: T_('Batteriespeicher {e} kWh', { e: Math.round(kWh) }), n, L: 0.6, B: 0.6, mg: 40 + 10 * kWh / n, src: T_('LiFePO₄ im Schrank 0,6 × 0,6 m bis 40 kWh, 10 kg/kWh') });
    }
    if (c.ventN > 0) {
      const s = c.ventSize, cb = !!hz.cb;
      add({ id: 'vent', kind: 'lueftung', name: cb ? T_('Lüftungsgerät {s} m³/h mit ABC-Filter', { s }) : T_('Lüftungsgerät {s} m³/h', { s }), n: c.ventN, L: 0.8 + 0.0005 * s, B: 0.6, mg: 60 + 0.4 * s + (cb ? 0.3 * s : 0),
        src: cb ? T_('Gerät 60 kg + 0,4 kg je m³/h, Filter 0,3 kg je m³/h') : T_('Gerät 60 kg + 0,4 kg je m³/h') });
    }
    const Vw = (c.drink || 0) + (c.hyg || 0);
    if (Vw > 0) {
      const n = ceil(Vw / 1000 - 1e-9), f = n === 1 ? Math.sqrt(max(0.3, Vw / 1000)) : 1;
      add({ id: 'water', kind: 'wasser', name: T_('Wasservorrat {v} L', { v: Math.round(Vw) }), n, L: IBC.L * f, B: IBC.B * f, mg: 60 * f * f, me: Vw / n, src: T_('Behälter wie IBC 1.000 L (1,2 × 1,0 m), 60 kg leer') });
    }
    if (c.food > 0) {
      const m = 1.1 * c.food, n = ceil(m / 200 - 1e-9);
      add({ id: 'food', kind: 'vorrat', name: T_('Lebensmittel {m} kg', { m: Math.round(c.food) }), n, L: 1.0, B: 0.5, mg: 15, me: m / n, src: T_('Regal 1,0 × 0,5 m mit bis zu 200 kg (4 kN/m²), Verpackung 10 %') });
    }
    const sew = c.sew;
    if (sew && sew.mode === 'tank' && c.waste > 0) {
      const n = ceil(c.waste / 1000 - 1e-9);
      add({ id: 'sew', kind: 'abwasser', name: T_('Abwassertank {v} L', { v: Math.round(c.waste) }), n, L: IBC.L, B: IBC.B, mg: 50, me: c.waste / n, src: T_('Sammelbehälter 1.000 L, 50 kg leer') });
    } else if (sew && sew.mode === 'hebeanlage') {
      add({ id: 'hebe', kind: 'abwasser', name: sew.double ? T_('Fäkalienhebeanlage (Doppelanlage)') : T_('Fäkalienhebeanlage'), n: 1, L: 1.0, B: 0.8, mg: sew.double ? 250 : 150, me: 100, src: T_('Sammelbehälter mit Pumpe, Füllung 100 L') });
    }
    return out;
  }

  /* Produktbeispiele mit belegten Kenndaten (Quelle und Abrufdatum je Eintrag). Sie zeigen, welche marktüblichen Baureihen zur
   * Auslegung passen; Auswahl, Kennlinien und Zulassung bestätigt der Fachplaner bzw. Hersteller. */
  const SRC = {
    tph11: { title: N_('BABS / LABOR SPIEZ: Technisches Pflichtenheft TPH-11, Belüftungsgeräte für Schutzräume'), url: 'https://www.babs.admin.ch/dam/de/sd-web/vmP0i9O4DOJe/tph11-de.pdf', date: '2026-10-16' },
    gf150: { title: N_('Bunker BSSD: Gasfilter GF-150 (Produktseite)'), url: 'https://www.bunker-bssd.de/shop/schutzraumtechnik/filteranlagen/gasfilter-gf-150/', date: '2026-10-16' },
    andair: { title: N_('Andair AG: Schutzraum-Produkte'), url: 'https://www.andair.ch/schutzraum-produkte.html', date: '2026-10-16' },
    compli400: { title: N_('Jung Pumpen: compli 400'), url: 'https://www.jung-pumpen.de/en/products/lifting-stations/compli-400/compli-400', date: '2026-10-16' },
    compli1000: { title: N_('Jung Pumpen: compli 1000 / 1000 HL'), url: 'https://www.jung-pumpen.de/en/products/lifting-stations/compli-1000-1000-hl', date: '2026-10-16' },
    roth: { title: N_('Roth Werke: Doppelwand-Tank Plus 3, Datenblatt (tankundlager.com)'), url: 'https://tankundlager.com/Datasheet/pdf/id/1910', date: '2026-10-16' },
  };
  const CATALOG = {
    // Typenbezeichnung = Nennluftmenge im Filterbetrieb (FIL); Frischluftbetrieb (FRL) doppelt; statischer Mindestdruck im FIL
    va: [{ name: 'VA 40', fil: 40, frl: 80, pStat: 1100, gf: 'GF 40' }, { name: 'VA 75', fil: 75, frl: 150, pStat: 1100, gf: 'GF 75' },
      { name: 'VA 150', fil: 150, frl: 300, pStat: 1100, gf: 'GF 150' }, { name: 'VA 300', fil: 300, frl: 600, pStat: 1050, gf: 'GF 300', nl: 200 }],
    gf150: { name: N_('Gasfilter GF 150'), flow: 150, kg: 65, dims: N_('0,60 × 0,60 × 1,50 m'), dp: 600 },
    hebe: [{ name: 'Jung Pumpen compli 400', dn: 80, hMax: 6, qMax: 48, p1: N_('1,25'), tank: 70, kg: 67, src: 'compli400' },
      { name: 'Jung Pumpen compli 1000', dn: 80, hMax: 20, qMax: 85, p1: N_('1,25–4,8 (je nach Typ)'), tank: 117, kg: null, src: 'compli1000' }],
    tank: [[750, 1.10, 0.70, 1.28, 82], [1000, 1.10, 0.70, 1.60, 97], [1500, 1.63, 0.76, 1.86, 160]],
    esv: [N_('ESV 4'), N_('ESV/VF 4 (mit Vorfilter, Zuluft)'), N_('FC'), N_('KC-T'), N_('ESV San-100 (Entlüftung Sanitär/Hebeanlage)'), N_('EGV (Abgas)')],
  };
  function products(p, t) {
    const out = [], sv = t.svc || {}, hz = p.hazard || {};
    // Schutzbelüftung
    const per = t.ventSize, va = CATALOG.va.find((x) => x.fil >= per - 1e-9);
    const dpNeed = sv.prot ? sv.prot.dpFilter + 250 + sv.prot.dp : 1050;
    if (va) out.push({ item: T_('Schutzbelüftung'), need: (t.ventN > 1 ? t.ventN + ' × ' : '') + T_('{q} m³/h im Filterbetrieb, {p} Pa', { q: fmt0(per), p: fmt0(dpNeed) }), product: (t.ventN > 1 ? t.ventN + ' × ' : '') + (hz.cb ? T_('{va} mit {gf}', { va: va.name, gf: va.gf }) : va.name),
      data: T_('FIL {fil} m³/h, FRL {frl} m³/h, statisch ≥ {p} Pa im Filterbetrieb', { fil: va.fil, frl: va.frl, p: va.pStat }) + ', ' + (va.nl ? T_('Notbetrieb {nl} m³/h', { nl: va.nl }) : T_('Handkurbel')), ok: dpNeed <= va.pStat + 1e-9,
      note: dpNeed > va.pStat ? T_('Druckverlust höher als der Mindestdruck des Typs – Leitungen kürzen oder Gerät mit mehr Druck wählen.') : T_('Typen nach BABS TPH-11 (Schweizer Schutzraumbau); Zulassung für Deutschland beim Hersteller erfragen.'), src: SRC.tph11 });
    else out.push({ item: T_('Schutzbelüftung'), need: T_('{q} m³/h je Gerät', { q: fmt0(per) }), product: T_('{n} × VA 300 oder Großanlage', { n: Math.ceil(per / 300) * Math.max(1, t.ventN) }), data: 'VA 300: FIL 300 m³/h, FRL 600 m³/h', ok: false, note: T_('Über 300 m³/h je Gerät: Großanlage nach Fachplanung.'), src: SRC.tph11 });
    // Vergleich mit dem Schweizer Schutzraumbau: 3 m³/h je Person im Filterbetrieb (TPH-11, Notbetrieb VA 300: 200 m³/h = 3 m³/h je Person)
    if (t.persons > 0) {
      const ch = 3 * t.persons, vaCh = CATALOG.va.find((x) => x.fil >= ch - 1e-9);
      out.push({ item: T_('Vergleich Schutzraumbau Schweiz'), need: T_('3 m³/h je Person → {q} m³/h', { q: fmt0(ch) }), product: vaCh ? vaCh.name : Math.ceil(ch / 300) + ' × VA 300', data: T_('hier ausgelegt: {q} m³/h für CO₂ ≤ {c} ppm', { q: fmt0(t.ventSize * t.ventN), c: fmt0(p.tech.co2Target) }), ok: null,
        note: T_('Die Mindestluftmenge der Schweizer Schutzräume liegt deutlich unter der CO₂-Auslegung; die CO₂-Grenze im Schritt Technik bestimmt Gerätegröße und Energiebedarf.'), src: SRC.tph11 });
    }
    if (hz.cb && per >= 150 && per <= 150) out.push({ item: T_('Gasfilter'), need: '150 m³/h', product: T_(CATALOG.gf150.name), data: T_('{kg} kg, {dims}, Druckverlust bis {dp} Pa', { kg: CATALOG.gf150.kg, dims: T_(CATALOG.gf150.dims), dp: CATALOG.gf150.dp }), ok: true, note: T_('Im Rechenmodell 800 Pa Filterwiderstand angesetzt (sichere Seite).'), src: SRC.gf150 });
    // Explosionsschutzventile
    const vv = sv.valves;
    if (vv && vv.blast && vv.list.length) out.push({ item: T_('Explosionsschutzventile'), need: T_('{n} Durchführungen, {q} kN/m²', { n: vv.list.length, q: fmt0(vv.qk) }), product: T_('Baureihen Andair: {list}', { list: CATALOG.esv.map((x) => T_(x)).join(', ') }), data: T_('Luftmengen und Bemessungsdruck je Typ beim Hersteller'), ok: null, note: T_('Zuluft ESV mit Vorfilter, Fortluft kombiniertes Überdruck-/Explosionsschutzventil, Abgas hitzebeständig (EGV).'), src: SRC.andair });
    // Hebeanlage
    const sw = sv.sew;
    if (sw && sw.mode === 'hebeanlage') {
      const qh = sw.Qp * 3.6, h = CATALOG.hebe.find((x) => sw.H <= 0.7 * x.hMax && qh <= x.qMax);
      out.push({ item: T_('Fäkalienhebeanlage'), need: T_('DN {dn}, {q} m³/h bei {h} m', { dn: sw.dn, q: fmt0(qh), h: I18.dec(sw.H.toFixed(1)) }), product: h ? (sw.double ? T_('Doppelanlage {name}', { name: h.name }) : h.name) : T_('Baureihe mit höherer Förderhöhe (Hersteller)'),
        data: h ? T_('DN {dn}, Hmax {hmax} m, Qmax {qmax} m³/h, P1 {p1} kW, Behälter {tank} l', { dn: h.dn, hmax: h.hMax, qmax: h.qMax, p1: T_(h.p1), tank: h.tank }) + (h.kg ? ', ' + h.kg + ' kg' : '') : '', ok: !!h,
        note: T_('Betriebspunkt auf der Kennlinie prüfen (Auswahl hier bis 70 % der größten Förderhöhe).'), src: h ? SRC[h.src] : SRC.compli1000 });
    }
    // Kraftstofftank
    const g = sv.gen;
    if (g && g.fuel > 0) {
      let best = null;
      for (const [V, L, B, H, kg] of CATALOG.tank) { const n = Math.ceil(g.fuel / V - 1e-9); if (!best || n < best.n || (n === best.n && V < best.V)) best = { V, L, B, H, kg, n }; }
      out.push({ item: T_('Kraftstofftank'), need: T_('{v} L (mit 10 % Reserve)', { v: fmt0(g.fuel) }), product: best.n + ' × Roth Doppelwand-Tank Plus 3, ' + best.V + ' L', data: T_('{dims} m, ca. {kg} kg je Tank, Leckagesonde', { dims: I18.decAll(best.L.toFixed(2) + ' × ' + best.B.toFixed(2) + ' × ' + best.H.toFixed(2)), kg: best.kg }),
        ok: null, note: T_('Zugelassen für Heizöl EL und FAME; Eignung für Diesel bzw. HVO und die AwSV-Aufstellung beim Hersteller bestätigen lassen.'), src: SRC.roth });
    }
    return out;
  }
  const fmt0 = (v) => Math.round(v).toLocaleString(I18.locale());

  BP.haustechnik = { sewage, heat, protVent, genset, valves, equipment, products, CATALOG, SRC, priceEsv, priceUev, ESV_SIZES, TANKS, DN, MOTORS };
})(typeof window !== 'undefined' ? window : globalThis);
