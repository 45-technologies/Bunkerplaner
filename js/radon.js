/* Radonschutz: Referenzwert und Rechtsgrundlage je Land (js/radon-daten.js), Abschätzung des Radoneintrags und Maßnahmen.
 *
 * Rechenansatz (Vorplanung, keine Prognose der Innenraumkonzentration):
 *  - Diffusion durch erdberührten Beton wie in der spanischen DB HS 6: E = c_Boden · λ · l / sinh(d / l), l = √(D / λ),
 *    mit D = 1·10⁻⁸ m²/s für dichten, rissbeschränkten Beton (Literatur: 9·10⁻¹⁰ … 7·10⁻⁹ dicht, gealtert bis 5·10⁻⁷).
 *  - Raumbilanz: c = S / (V · (n + λ)), S Radoneintrag in Bq/h, V Luftvolumen, n Luftwechsel, λ = 7,554·10⁻³ h⁻¹.
 *  - Der Haupteintrag erfolgt konvektiv über Fugen, Risse und Durchführungen und lässt sich nicht vorausberechnen. Ausgewiesen
 *    wird deshalb, wie viel Bodenluft je Stunde höchstens eindringen darf, damit der Referenzwert eingehalten bleibt. */
(function (root) {
  const BP = root.BP, T_ = BP.i18n.T, N_ = BP.i18n.N;
  const R = BP.radon = {};
  const LAMBDA = 7.554e-3;   // 1/h, Rn-222 (T½ = 3,8232 d)
  const D_CONCRETE = 1e-8;   // m²/s, dichter Beton (Annahme)
  const SOIL_DEFAULT = 100;  // kBq/m³ ohne Angabe
  const EU = new Set(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK']);
  R.LAMBDA = LAMBDA; R.D_CONCRETE = D_CONCRETE; R.SOIL_DEFAULT = SOIL_DEFAULT;
  const data = () => BP.radonDaten || { entries: {}, facts: [] };

  /* Eintrag für ein Land; ohne nationalen Wert der Euratom-Höchstwert (EU) bzw. die WHO-Empfehlung */
  R.entry = function (cc) {
    const E = data().entries, e = E[cc];
    if (e && e.ref != null) return { cc, e, kind: 'national' };
    const fb = EU.has(cc) ? 'EU' : 'WHO';
    return { cc, e: e || null, fb: E[fb], kind: fb };
  };
  /* Referenzwert für die Prüfung: national; sonst 300 Bq/m³ (Euratom-Höchstwert bzw. WHO-Obergrenze) */
  R.refOf = function (cc) {
    const x = R.entry(cc);
    if (x.kind === 'national') return { value: x.e.ref, valueNew: x.e.refNew || null, x };
    return { value: 300, valueNew: null, x };
  };

  /* Diffusionsflussdichte durch eine Betonschicht der Dicke d [m] bei Bodenluft c [Bq/m³] in Bq/(m²·h) */
  R.flux = function (c, d, D) {
    const l = Math.sqrt((D || D_CONCRETE) * 3600 / LAMBDA);
    return c * LAMBDA * l / Math.sinh(Math.max(1e-3, d) / l);
  };

  R.evaluate = function (p, q) {
    const cc = (BP.laender && BP.laender.country(p)) || p.site.country || 'DE';
    const rn = p.site.radon || {}, b = p.build, meas = b.radon || {}, env = q.env, t = q.tech || {};
    const ref = R.refOf(cc), soilKBq = rn.soil != null && isFinite(rn.soil) ? rn.soil : SOIL_DEFAULT, c = soilKBq * 1000;
    // erdberührte Flächen: Bodenplatte, Außenwände, Decke unter der Erdüberdeckung (bis 1 m Überdeckung anteilig)
    const fRoof = Math.max(0, Math.min(1, (b.cover || 0) / 1.0));
    const parts = [
      { id: 'floor', name: N_('Bodenplatte'), A: env.floor, d: b.tFloor },
      { id: 'walls', name: N_('Außenwände'), A: env.wallsOut, d: b.tWall },
      { id: 'roof', name: N_('Decke'), A: env.roof * fRoof, d: b.tRoof },
    ].map((x) => Object.assign(x, { E: R.flux(c, x.d) }));
    parts.forEach((x) => { x.S = x.E * x.A; });
    const Sdiff = parts.reduce((s, x) => s + x.S, 0), V = t.V || q.geo.tot.Anet * 2.4;
    const ref0 = ref.valueNew || ref.value;
    const state = (id, name, n) => {
      const k = n + LAMBDA, Smax = ref0 * V * k, Cdiff = Sdiff / (V * k);
      return { id, name, n, Cdiff, Smax, Qmax: Math.max(0, (Smax - Sdiff) / c) * 1000, t95: n > 0 ? 3 / k : null };
    };
    const vent = t.ventN > 0 && t.qCo2 > 0;
    const nVent = vent ? (t.ach > 0 ? t.ach : (t.ventSize || 0) * (t.ventN || 1) / V) : 0; // Mindestluftwechsel nach CO₂ (sichere Seite)
    const states = [state('closed', N_('Geschlossen, Lüftung aus'), 0)];
    if (vent) states.push(state('vent', N_('Lüftung in Betrieb'), nVent));
    const over = vent && (p.tech.overpressure == null || p.tech.overpressure > 0);
    // Maßnahmen (Deutschland: § 154 StrlSchV, mindestens eine in Radonvorsorgegebieten)
    const wu = b.waterproofing === 'wu' || b.waterproofing === 'wu_fbv';
    const crackLimited = wu && b.wk <= 0.2 + 1e-9;
    const measures = [
      { id: 'sump', nr: '1, 4', on: !!meas.sump, text: N_('Absaugung unter der Bodenplatte bzw. an den Randfugen (Radonbrunnen, Flächendrän mit Anschluss)') },
      { id: 'over', nr: '2', on: over, auto: true, text: N_('Überdruck im Schutzraum durch die Schutzlüftung (wirkt nur bei laufender Lüftung)') },
      { id: 'crack', nr: '3', on: crackLimited, auto: true, text: N_('Rissbeschränkter, diffusionshemmender Beton ausreichender Dicke (WU-Konstruktion, wk ≤ 0,2 mm)') },
      { id: 'membrane', nr: '5', on: !!meas.membrane || b.waterproofing === 'wu_fbv' || b.waterproofing === 'bahn', text: N_('Konvektionsdichte, diffusionshemmende Abdichtung bzw. Radonfolie (Nachweis der Radondichtheit vom Hersteller)') },
    ];
    const de = cc === 'DE', inArea = rn.area === 'ja';
    const checks = [];
    const closed = states[0];
    checks.push({ level: 'info', step: 'konstruktion', text: T_('Radon: Referenzwert {ref} Bq/m³. Im geschlossenen Schutzraum ohne Lüftung genügen etwa {q} l/h Bodenluft ({c} kBq/m³), um ihn zu erreichen. Fugen und Durchführungen radondicht ausführen und nach Fertigstellung messen.', { ref: Math.round(ref0), q: BP.calc.fmt(closed.Qmax, closed.Qmax < 10 ? 1 : 0), c: BP.calc.fmt(soilKBq, 0) }) });
    if (closed.Cdiff > ref0) checks.push({ level: 'warn', step: 'konstruktion', text: T_('Radon: Schon die Diffusion durch den Beton ergibt ohne Lüftung etwa {c} Bq/m³ (Referenzwert {ref} Bq/m³). Bauteile dicker oder Radonfolie vorsehen und vor dem Aufenthalt lüften.', { c: Math.round(closed.Cdiff), ref: Math.round(ref0) }) });
    if (de && inArea && !measures.some((m) => m.on && m.id !== 'over')) checks.push({ level: 'warn', step: 'konstruktion', text: T_('Radonvorsorgegebiet: § 154 StrlSchV verlangt neben dem Feuchteschutz mindestens eine weitere Maßnahme (Absaugung unter der Bodenplatte, rissbeschränkter WU-Beton, konvektionsdichte Abdichtung). Der Überdruck der Schutzlüftung zählt nur bei Dauerbetrieb.') });
    if (rn.soil != null && soilKBq > 100 && !vent) checks.push({ level: 'warn', step: 'technik', text: T_('Radon: hohe Bodenluftkonzentration ({c} kBq/m³) und keine Lüftung geplant. Ohne Luftaustausch reichert sich Radon an.', { c: BP.calc.fmt(soilKBq, 0) }) });
    return { cc, ref, ref0, soil: soilKBq, soilAssumed: rn.soil == null, parts, Sdiff, V, states, over, measures, de, inArea, area: rn.area || 'unbekannt', checks };
  };
})(typeof window !== 'undefined' ? window : globalThis);
