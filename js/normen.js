/* Bemessungsnormen je Land (Normprofil). Die Rechnung (calc.js) holt Teilsicherheiten, Baustoffwerte und die Formeln, die
 * zwischen den Normen abweichen, aus dem aktiven Profil:
 *  – Eurocode mit den national festgelegten Parametern (NDP) des Landes; fehlt ein nationaler Wert, gilt der
 *    EN-Empfehlungswert (im Bericht gekennzeichnet). Deutschland: DIN EN 1992-1-1/NA, DIN 1054, wie bisher.
 *  – SIA 260–267 (Schweiz, Liechtenstein) und ACI 318-19 mit ASCE/SEI 7-22 (USA und Länder mit ACI-Bemessung) folgen in eigenen
 *    Profilen (siehe sia(), aci()).
 * Länder außerhalb dieser Familien rechnen mit dem Eurocode und den EN-Empfehlungswerten; die dort geltende Norm wird genannt. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const I18 = BP.i18n, T_ = I18.T, N_ = I18.N;
  const max = Math.max, min = Math.min, sqrt = Math.sqrt, pow = Math.pow;
  const D = () => BP.normenDaten;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* NDP-Satz eines Landes: EN-Empfehlung, überschrieben mit den nationalen Werten; st[k] = 'v' | 's' | 'e' (EN-Empfehlung) */
  function ndp(c) {
    const d = D(), na = d.na[c] || null, o = clone(d.EN), st = {};
    for (const k of Object.keys(o)) st[k] = 'e';
    if (na) for (const k of Object.keys(na)) if (k !== 'st') { o[k] = clone(na[k]); st[k] = (na.st && na.st[k]) || 'v'; }
    o.st = st;
    o.na = na ? c : 'EN';
    // Teilsicherheiten für Böschungen (tan φ, c, veränderliche Lasten): wie Kombination 2 bzw. DA3, sofern nicht national festgelegt
    const G0 = o.geo;
    if (!G0.sl) G0.sl = [G0.gPhi > 1 ? G0.gPhi : 1.25, G0.gc > 1 ? G0.gc : 1.25, G0.gQgeo || 1.3];
    return o;
  }

  /* Tabelle 7.2N (EN 1992-1-1): größter Stabdurchmesser φs* [mm] je Stahlspannung σs [MPa] für wk = 0,4 / 0,3 / 0,2 mm */
  const T72_S = [160, 200, 240, 280, 320, 360, 400, 450];
  const T72 = { 0.4: [40, 32, 20, 16, 12, 10, 8, 6], 0.3: [32, 25, 16, 12, 10, 8, 6, 5], 0.2: [25, 16, 12, 8, 6, 5, 4, 3.5] };
  /* zulässige Stahlspannung für wk und φs*: Tabelle 7.2N (logarithmisch zwischen den Durchmessern, linear zwischen den wk-Spalten);
   * außerhalb der Tabelle der zugrunde liegende geschlossene Ausdruck σs = √(wk · 3,48·10⁶ / φs*) */
  function sigmaT72(wk, phiStar) {
    const col = (w) => {
      const ph = T72[w];
      if (phiStar >= ph[0]) return T72_S[0];
      for (let i = 1; i < ph.length; i++) if (phiStar >= ph[i]) {
        const t = (Math.log(ph[i - 1]) - Math.log(phiStar)) / (Math.log(ph[i - 1]) - Math.log(ph[i]));
        return T72_S[i - 1] + t * (T72_S[i] - T72_S[i - 1]);
      }
      return T72_S[T72_S.length - 1];
    };
    if (wk < 0.2 - 1e-9 || wk > 0.4 + 1e-9) return min(500, sqrt(wk * 3.48e6 / phiStar));
    if (wk <= 0.3) { const t = (wk - 0.2) / 0.1; return col(0.2) + t * (col(0.3) - col(0.2)); }
    const t = (wk - 0.3) / 0.1; return col(0.3) + t * (col(0.4) - col(0.3));
  }

  const kOf = (d) => min(2, 1 + sqrt(200 / (d * 1000)));

  /* ---------- Eurocode ---------- */
  function ec(c) {
    const n = ndp(c), P = n.punch, docs = D().docs[c] || null;
    const DE = (k) => n[k] === 'DE';
    const gcP = n.gc;
    const vminOf = (d, fck, plate) => {
      const k = kOf(d), dmm = d * 1000, f = plate && n.crdcPlate ? n.crdcPlate : 1;
      if (n.vmin === 'DE') return (dmm <= 600 ? 0.0525 : dmm >= 800 ? 0.0375 : 0.0525 - (dmm - 600) / 200 * 0.015) / gcP * pow(k, 1.5) * sqrt(fck);
      if (n.vmin === 'FR') return plate ? 0.34 / gcP * sqrt(fck) : 0.053 / gcP * pow(k, 1.5) * sqrt(fck);
      if (n.vmin === 'DK') return 0.051 / gcP * pow(k, 1.5) * sqrt(fck);
      return f * 0.035 * pow(k, 1.5) * sqrt(fck);
    };
    const crdcOf = (plate) => (plate && n.crdcPlate ? n.crdcPlate : 1) * n.crdc / gcP;
    // Kombinationen im Grenzzustand der Tragfähigkeit (Faktoren für G, Q, E = Lager, H = Erd- und Wasserdruck)
    const g = n.gG, q = n.gQ, sets = [];
    if (n.eq === '6.10ab') {
      sets.push({ id: 'a', G: g, Q: q * n.psiA[0], E: q * n.psiE[0], H: g, tag: '6.10a' });
      sets.push({ id: 'b', G: n.xi * g, Q: q, E: q, H: n.xi * g, tag: '6.10b' });
    } else if (n.eq === '6.10ab0') {
      sets.push({ id: 'a', G: g, Q: 0, E: 0, H: g, tag: '6.10a' });
      sets.push({ id: 'b', G: n.xi * g, Q: q, E: q, H: n.xi * g, tag: '6.10b' });
    } else sets.push({ id: '', G: g, Q: q, E: q, H: g, tag: '6.10' });
    const P0 = {
      code: 'EC', country: c, na: n.na, n, docs,
      label: n.na === 'EN' ? T_('Eurocode (EN-Empfehlungswerte)') : T_('Eurocode mit nationalem Anhang {c}', { c }),
      // Lasten
      lf: { G: g, Ginf: n.gGinf, Q: q, E: q, H: g, U: g, sets, psiA: n.psiA, psiE: n.psiE, psi2Q: 0.6, psi2E: 0.8 },
      upl: n.upl,
      geo: n.geo,
      // Baustoffe
      gc: n.gc, gs: n.gs, acc: n.acc, fyk: 500, Es: 200000,
      material(conc, b) {
        const fcd = n.acc * conc.fck / n.gc, fyd = 500 / n.gs;
        const fctd = 0.7 * conc.fctm / n.gc; // Verbund (αct = 1,0, auch NA DE für fbd)
        const fctEffR = b.fctEff === 'halb' ? 0.5 * conc.fctm : DE('crack') ? max(conc.fctm, 3.0) : conc.fctm;
        const Ecm = 22000 * pow((conc.fck + 8) / 10, 0.3);
        const fc = b.fireClass || 'R90', colCover = fc === 'R120' ? 0.05 : fc === 'R90' ? 0.04 : 0.03;
        return { fck: conc.fck, fctm: conc.fctm, fcd, fyd, fctd, fctEffR, Ecm, colCover, fyk: 500 };
      },
      muLim: 0.296,
      asMin: (h, d, mat) => max(0.26 * mat.fctm / 500, 0.0013) * d * 1e4,
      asMinBeam: (bw, d, mat) => max(0.26 * mat.fctm / 500, 0.0013) * bw * d * 1e4,
      // Rissbreite: 'DE' (NA DE 7.3.2/7.3.4) oder 'EN' (Tab. 7.2N, sr,max nach Gl. 7.11)
      crack: DE('crack') ? 'DE' : 'EN',
      wkMax: n.wk, wkComb: n.wkComb,
      // Stahlspannung für die Mindest- bzw. Rissbewehrung: Biegung (kc = 0,4, hcr = h/2) oder zentrischer Zwang (je Seite)
      sigmaCrack(wk, phi, fct, h, d, tension) {
        if (DE('crack')) return min(500, sqrt(wk * 3.48e6 / (phi * 2.9 / fct)));
        // Gl. 7.6N (Biegung, kc = 0,4, hcr = h/2) bzw. 7.7N (zentrischer Zwang, hcr = h): φs* aus dem gewählten φs
        const hd = max(1e-3, h - d), phiStar = tension ? phi * 2.9 / fct * 8 * hd / h : phi * 2.9 / fct * 2 * hd / (0.4 * h / 2);
        return min(500, sigmaT72(wk, phiStar));
      },
      // Querkraft ohne Querkraftbewehrung (6.2.2): vRd,c [kN/m] und Längsbewehrungsgrad für vEd
      vRdc(rho, d, mat, plate) {
        const k = kOf(d);
        return max(crdcOf(plate !== false) * k * pow(100 * min(0.02, rho) * mat.fck, 1 / 3), vminOf(d, mat.fck, plate !== false)) * d * 1000;
      },
      vmin: (d, fck, plate) => vminOf(d, fck, plate !== false),
      rhoForShear(vEd, d, mat) {
        if (!(vEd > 0) || !(d > 0)) return 0;
        const k = kOf(d);
        if (vminOf(d, mat.fck, true) * d * 1000 >= vEd) return 0;
        const rho = pow(vEd / (crdcOf(true) * k * d * 1000), 3) / (100 * mat.fck);
        return rho <= 0.02 ? rho : Infinity;
      },
      crdc: crdcOf,
      // Querkraftbewehrung (6.2.3), σcd = 0: Druckstrebenneigung, Grenzwert und erforderliche Bewehrung je m Breite (bw = 1)
      links(vEd, d, mat, bw) {
        const b = bw || 1, z = 0.9 * d;
        let cot, nu1;
        if (DE('links')) {
          const vRdcc = 0.24 * pow(mat.fck, 1 / 3) * b * z * 1000;
          cot = min(max(1.2 / max(1e-6, 1 - vRdcc / max(vEd, 1e-6)), 1.0), 3.0);
          nu1 = 0.75 * min(1, 1.1 - mat.fck / 500);
        } else {
          nu1 = 0.6 * (1 - mat.fck / 250);
          const X = b * z * nu1 * mat.fcd * 1000 / max(vEd, 1e-6);
          cot = X >= 2.5 + 1 / 2.5 ? 2.5 : X > 2 ? (X + sqrt(X * X - 4)) / 2 : 1.0;
        }
        const vRdMax = b * z * nu1 * mat.fcd * 1000 / (cot + 1 / cot);
        const asw = vEd / (z * mat.fyd * 1000 * cot) * 1e4;
        return { z, cot, nu1, vRdMax, asw };
      },
      aswMinBeam: (bw, mat) => (DE('links') ? 0.16 * mat.fctm / 500 : n.na === 'DK' ? 0.063 * sqrt(mat.fck) / 500 : 0.08 * sqrt(mat.fck) / 500) * bw * 1e4,
      linkSpacing(vEd, vRdMax, h, d) {
        if (DE('links')) return vEd <= 0.3 * vRdMax ? min(0.7 * h, 0.30) : vEd <= 0.6 * vRdMax ? min(0.5 * h, 0.30) : min(0.25 * h, 0.20);
        return min(0.75 * d, 0.60);
      },
      // Biegeschlankheit (7.4.2, Gl. 7.16); NA DE zusätzlich l/d ≤ K·35 und ≤ K²·150/l
      defl(l, d, asReq, mat, K) {
        const rho = max(1e-6, asReq * 1e-4 / d), rho0 = sqrt(mat.fck) * 1e-3, sf = sqrt(mat.fck);
        let lim = rho <= rho0 ? 11 + 1.5 * sf * rho0 / rho + 3.2 * sf * pow(rho0 / rho - 1, 1.5) : 11 + 1.5 * sf * rho0 / rho;
        if (DE('defl')) lim = K ? min(K * lim, K * 35, K * K * 150 / max(l, 1e-6)) : min(lim, 35);
        else lim = (K || 1) * lim;
        return { ld: l / d, lim, eta: (l / d) / lim };
      },
      deflLimit: 250,
      // Obergrenze der Biegeschlankheit ohne Nachweis (NA DE: K·35 und K²·150/l)
      ldCap: (lim, l, K) => (DE('defl') ? min(lim, (K || 1) * 35, (K || 1) * (K || 1) * 150 / max(l, 1e-6)) : lim),
      // Übergreifungslänge (8.7.3) mit α6: NA DE Tab. 8.3DE (Stoßanteil > 33 %), EN α6 = 1,5 (alle Stäbe gestoßen)
      lap(phi, mat, poorBond) {
        const fbd = 2.25 * (poorBond ? 0.7 : 1) * mat.fctd;
        const a6 = DE('lap') ? (phi < 16 ? 1.4 : 2.0) : 1.5;
        return a6 * (phi / 4) * (mat.fyd / fbd) / 1000;
      },
      anchorage(phi, mat, poorBond, d) {
        const fbd = 2.25 * (poorBond ? 0.7 : 1) * mat.fctd;
        return d + (phi / 4) * (mat.fyd / fbd) / 1000;
      },
      // Stützen (5.8, 9.5)
      col: DE('col') ? { lamLim: (nn) => (nn >= 0.41 ? 25 : 16 / sqrt(max(nn, 1e-6))), asMin: (nEd, fyd, Ac) => max(0.15 * nEd / fyd * 1e4, 0.002 * Ac * 1e4), asMax: 0.045, sw: [12, 0.30], phiMin: n.colPhiMin }
        : { lamLim: (nn) => 20 * 0.7 * 1.1 * 0.7 / sqrt(max(nn, 1e-6)), asMin: n.na === 'AT' ? (nEd, fyd, Ac) => max(0.13 * nEd / fyd * 1e4, 0.0026 * Ac * 1e4) : (nEd, fyd, Ac) => max(0.10 * nEd / fyd * 1e4, 0.002 * Ac * 1e4), asMax: 0.04, sw: [20, 0.40], phiMin: n.colPhiMin },
      // Durchstanzen (6.4)
      punch: {
        beta: P.beta, crdc: (u0d) => P.crdc / gcP * (P.u0 && u0d < 4 ? 0.1 * u0d + 0.6 : 1), crdcF: () => (P.crdcF || P.crdc) / gcP,
        vmin: (d, fck) => vminOf(d, fck, true),
        vRdMax: (vRdc, d, nu, fcd) => (P.vmax === 'DE' ? 1.4 * vRdc : P.vmax === 'AT' ? min(0.4 * nu * fcd, (d <= 0.2 ? 1.4 : d >= 0.7 ? 1.65 : 1.4 + (d - 0.2) / 0.5 * 0.25) * vRdc) : P.kmax * vRdc),
        vMax0: (nu, fcd) => (P.vmax === 'GB' ? 0.5 : 0.4) * nu * fcd,
        rows: !!P.rows,
      },
      // Wände ohne Bewehrung in Rechnung (12.6.5.2)
      fcdPl: (fck) => n.accPl * fck / n.gc,
      cmin: n.cmin, dcdev: n.dcdev,
      seis: n.seis,
      seisParams: (sz) => seisEC(n, sz),
      seisComb: { H: 1.0, Q: null },
      ref: ecRefs(n),
      steel: 'B500B',
      // Regelböschung ohne Nachweis (DIN 4124: bis 5 m, nichtbindig 45°, steif bindig 60°, Fels 80°)
      exc: { ref: n.na === 'DE' ? 'DIN 4124' : T_('DIN 4124 sinngemäß'), dMax: 5, angle: (k, s) => s.slope },
    };
    return P0;
  }

  /* Fundstellen für Texte in Oberfläche, Meldungen und Bericht: Deutschland wie bisher (DIN, NA DE), sonst EN mit dem
   * nationalen Anhang des Landes bzw. die Landesnorm. Die Texte setzen sie als {ref} ein. */
  function ecRefs(n) {
    const de = n.na === 'DE', na = de ? 'NA DE' : n.na === 'EN' ? '' : 'NA ' + n.na, w = (s) => s + (na ? ', ' + na : '');
    return {
      bend: 'EC2 6.1', shear: w('EC2 6.2'), crack: 'EC2 7.3.4', crackMin: w('EC2 7.3.2'), links: 'EC2 6.2.3', col: 'EC2 5.8', punch: w('EC2 6.4'), punchOpen: 'EC2 6.4.2',
      wall: 'EC2 12.6.5.2', defl: w('EC2 7.4.2'), lap: w('EC2 8.7'), fire: de ? 'DIN EN 1992-1-2' : 'EN 1992-1-2', gb: de ? 'DIN 4017' : 'EN 1997-1 Anh. D', set: de ? 'DIN 4019' : 'Steinbrenner',
      slope: de ? 'DIN 4084' : 'EN 1997-1, Bishop', earth: de ? 'DIN 4085' : 'EN 1997-1', geo: de ? 'DIN 1054' : 'EN 1997-1 ' + n.geo.da, loads: de ? 'DIN EN 1991-1-1/NA' : w('EN 1991-1-1'),
      seis: de ? 'DIN EN 1998-1/NA' : w('EN 1998-1'), seis5: de ? 'DIN EN 1998-5' : 'EN 1998-5', liq: de ? 'DIN EN 1998-5, 4.1.4' : 'EN 1998-5, 4.1.4', bend2: de ? 'EC2 8.3, NA DE' : w('EC2 8.3'),
    };
  }

  /* ---------- Erdbeben je Norm ----------
   * Eingangswerte der vereinfachten Erdbebenberechnung des erdüberdeckten, steifen Bauwerks (calc.seismicCheck):
   * Bemessungs-Bodenbeschleunigung ag (Baugrund A), Bodenparameter S, TB, TC, TD, Plateau des Bemessungsspektrums
   * Sd = 2,5 · ag · S / q (q = 1,5) und α·S für den Erddruckzuwachs auf die starren Wände (EN 1998-5 Anhang E.9: Δp = α·S·γ·H).
   * Deutschland rechnet unverändert mit den Zonen der DIN EN 1998-1/NA (verify.seismic). */
  const GRAV = 9.81, CLS = ['A', 'B', 'C', 'D', 'E'];
  // Frankreich (Arrêté du 22 octobre 2010, Gebäude): Zonen 1–4 eigener Parametersatz, Zone 5 wie Typ 1
  const FR14 = { A: [1.0, 0.03, 0.2, 2.5], B: [1.35, 0.05, 0.25, 2.5], C: [1.5, 0.06, 0.4, 2.0], D: [1.6, 0.1, 0.6, 1.5], E: [1.8, 0.08, 0.45, 1.25] };
  // Italien (NTC 2018 Tab. 3.2.IV): Ss = a − b · F0 · ag/g in [min, max], F0 = 2,5 angenommen
  const IT_SS = { A: [1, 0, 1, 1], B: [1.4, 0.4, 1.0, 1.2], C: [1.7, 0.6, 1.0, 1.5], D: [2.4, 1.5, 0.9, 1.8], E: [2.0, 1.1, 1.0, 1.6] };
  // Spanien (NCSE-02 2.2): Bodenkoeffizient C für Boden I–IV (A → I, B → II, C → III, D/E → IV)
  const ES_C = { A: 1.0, B: 1.3, C: 1.6, D: 2.0, E: 2.0 };
  // Portugal (NP EN 1998-1/NA): Smax je Baugrund, S = Smax bis ag = 1 m/s², linear auf 1,0 bei 4 m/s²
  const PT_SMAX = { A: 1.0, B: 1.35, C: 1.6, D: 2.0, E: 1.8 };
  const FR_ZONE = (agR) => (agR <= 0.4 + 1e-9 ? 1 : agR <= 0.7 + 1e-9 ? 2 : agR <= 1.1 + 1e-9 ? 3 : agR <= 1.6 + 1e-9 ? 4 : 5);
  function soilEC(type, cls, ag, agR) {
    const sp = D().spectra, row = (t) => (sp[t] && sp[t][cls]) || sp['1'][cls];
    const r1 = row('1'), out = (S, r, note) => ({ S, TB: r[1], TC: r[2], TD: r[3], note: note || null });
    if (type === 'FR') return FR_ZONE(agR == null ? ag : agR) === 5 ? out(r1[0], r1) : out(FR14[cls][0], FR14[cls]);
    if (type === 'IT') { const c = IT_SS[cls]; return out(min(c[3], max(c[2], c[0] - c[1] * 2.5 * ag / GRAV)), r1, N_('NTC 2018 vereinfacht: F0 = 2,5, Perioden wie EN Typ 1')); }
    if (type === 'ES') { const C = ES_C[cls], x = ag / GRAV; return out(x <= 0.1 ? C / 1.25 : x >= 0.4 ? 1.0 : C / 1.25 + 3.33 * (x - 0.1) * (1 - C / 1.25), r1, N_('NCSE-02: S aus dem Bodenkoeffizienten C')); }
    if (type === 'PT') { const Sm = PT_SMAX[cls]; return out(ag <= 1 ? Sm : ag >= 4 ? 1.0 : Sm - (Sm - 1) * (ag - 1) / 3, r1, N_('NA PT: beide Einwirkungstypen prüfen, maßgebenden Wert eingeben')); }
    if (type === 'RO') return out(1.0, [1, 0.14, 0.7, 3.0], N_('P100-1/2013: Baugrund über TC, kein Faktor S'));
    if (type === 'BG') return out(row('BG')[0], row('BG'));
    if (type === 2 || type === '2') return out(row('2')[0], row('2'));
    return out(r1[0], r1);
  }
  /* Eurocode (ohne Deutschland): agR des Standorts (nationale Karte), Bedeutungsbeiwert γI, Baugrundklasse A–E. */
  function seisEC(n, sz) {
    const s = n.seis || {}, agR = sz && sz.agR;
    if (!(agR > 0)) return null;
    const imp = ['I', 'II', 'III', 'IV'].includes(sz.importance) ? sz.importance : 'II', gI0 = s.gI && s.gI[imp], gI = gI0 == null ? 1.0 : gI0;
    const cls = CLS.includes(sz.soilClass) ? sz.soilClass : 'B', ag = gI * agR, so = soilEC(s.type, cls, ag, agR);
    // nicht gefordert: sehr geringe Seismizität (EN 1998-1 3.2.1(5): ag·S ≤ 0,05 g), Frankreich Zone 1 bzw. Zone 2 für Kat. I/II,
    // Spanien Bedeutung gering, ab < 0,04 g bzw. normale Bedeutung und ab < 0,08 g (allseits ausgesteift), Bedeutung ohne Beiwert
    let why = null;
    if (!(gI > 0)) why = N_('Bauwerk geringer Bedeutung');
    else if (s.type === 'FR' && (FR_ZONE(agR) === 1 || (FR_ZONE(agR) === 2 && (imp === 'I' || imp === 'II')))) why = N_('Zone und Bedeutungskategorie ohne Erdbebenregeln (Arrêté du 22 octobre 2010)');
    else if (s.type === 'ES' && (agR < 0.04 * GRAV || (imp === 'II' && agR < 0.08 * GRAV))) why = N_('NCSE-02 1.2.3: ab unter der Anwendungsgrenze');
    else if (ag * so.S <= 0.05 * GRAV + 1e-9) why = N_('sehr geringe Seismizität (ag · S ≤ 0,05 g)');
    const g = max(gI, 1e-9);
    return { kind: 'EC', type: s.type, agR, gI: g, imp, ag: g * agR, key: cls, S: so.S, TB: so.TB, TC: so.TC, TD: so.TD, note: so.note, q: 1.5,
      Sd: g * agR * so.S * 2.5 / 1.5, alphaS: g * agR / GRAV * so.S, required: !why, why, applies: s.applies !== false, map: s.map || null };
  }
  /* SIA 261:2020: Zonen Z1a–Z3b (agd), Bauwerksklasse BWK I–III (γf), Baugrundklasse A–E; ganze Schweiz mindestens Z1a. */
  const SIA_Z = ['Z1a', 'Z1b', 'Z2', 'Z3a', 'Z3b'], SIA_AGD = [0.6, 0.8, 1.0, 1.3, 1.6];
  function seisSIA(sz) {
    const i = Math.round((sz && sz.zone) || 0), assumed = !(i >= 1 && i <= 5), k = assumed ? 0 : i - 1;
    const imp = sz && ['I', 'II', 'III'].includes(sz.importance) ? sz.importance : 'III', gf = { I: 1.0, II: 1.2, III: 1.5 }[imp];
    const cls = sz && CLS.includes(sz.soilClass) ? sz.soilClass : 'B', r = D().spectra.SIA[cls], agd = SIA_AGD[k], ag = gf * agd;
    return { kind: 'SIA', zone: SIA_Z[k], assumed, agR: agd, gI: gf, imp, ag, key: cls, S: r[0], TB: r[1], TC: r[2], TD: r[3], q: 1.5, Sd: ag * r[0] * 2.5 / 1.5, alphaS: ag / GRAV * r[0], required: true, applies: true,
      map: 'https://map.geo.admin.ch/?layers=ch.bafu.gefahren-gefaehrdungszonen' };
  }
  /* ASCE/SEI 7-22: SDS, SD1 (USGS), Risikokategorie I–IV (Ie). Trägheitskraft Cs = SDS · Ie / R mit R = 1,5 (steifes, erdüberdecktes
   * Bauwerk, wie q = 1,5); Erddruckzuwachs auf die nicht nachgebenden Wände mit kh = 0,4 · SDS (Bemessungsbeben, Wood bzw. EN 1998-5 E.9),
   * gefordert ab SDC D (IBC 1803.5.12). SDC nach Tab. 11.6-1 und 11.6-2, sonst Wert von USGS. */
  function sdcOf(SDS, SD1, rc) {
    const iv = rc === 'IV', a = SDS < 0.167 ? 0 : SDS < 0.33 ? (iv ? 2 : 1) : SDS < 0.5 ? (iv ? 3 : 2) : 3;
    const b = SD1 == null ? 0 : SD1 < 0.067 ? 0 : SD1 < 0.133 ? (iv ? 2 : 1) : SD1 < 0.2 ? (iv ? 3 : 2) : 3;
    return 'ABCD'[max(a, b)];
  }
  function seisASCE(sz) {
    const SDS = sz && sz.sds;
    if (!(SDS > 0)) return null;
    const SD1 = sz.sd1 > 0 ? sz.sd1 : null, imp = ['I', 'II', 'III', 'IV'].includes(sz.importance) ? sz.importance : 'II', Ie = { I: 1.0, II: 1.0, III: 1.25, IV: 1.5 }[imp], R = 1.5;
    const u = sz.usgs && sz.usgs.sds === SDS ? sz.usgs : null, sdc = (u && /^[A-F]$/.test(u.sdc || '') ? u.sdc : null) || sdcOf(SDS, SD1, imp);
    return { kind: 'ASCE7', sds: SDS, sd1: SD1, sdc, sdcSrc: u && u.sdc ? 'USGS' : null, agR: null, gI: Ie, imp, ag: 0.4 * SDS * GRAV, key: sz.siteClass || 'Default', S: 1,
      TB: SD1 ? 0.2 * SD1 / SDS : null, TC: SD1 ? SD1 / SDS : null, TD: u && u.tl ? u.tl : null, q: R, R, Sd: SDS * Ie / R * GRAV, alphaS: 0.4 * SDS,
      required: 'DEF'.includes(sdc), why: 'DEF'.includes(sdc) ? null : N_('IBC 1803.5.12 verlangt den Erddruck aus Erdbeben erst ab SDC D'), applies: true, map: 'https://www.seismicmaps.org' };
  }

  /* ---------- SIA 260–267 (Schweiz, Liechtenstein) ----------
   * Stand der Recherche (research/sia.json): Teilsicherheiten SIA 260, Baustoffe und Querkraft SIA 262 (Sekundärquellen),
   * Durchstanzen SIA 262 4.3.6 (Stufe 2), Rissbeschränkung über zulässige Stahlspannungen (Fig. 31, digitalisiert; Zuordnung
   * der Kurven zu den Anforderungen nicht bestätigt), SIA 267 (γφ = 1,2, γc = 1,5). Nicht belegte Teile (Stützen 2. Ordnung,
   * Biegeschlankheit, Übergreifung, Betondeckung, Brandschutz) nach EN 1992 sinngemäß – im Bericht gekennzeichnet. */
  const SIA_CURVE = { B: { s: [50, 100, 130, 150, 200, 250, 300], v: [435, 435, 435, 400, 340, 280, 260] }, C: { s: [50, 55, 100, 150, 200, 250, 300], v: [435, 435, 290, 230, 190, 160, 140] } };
  function linI(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + (x - xs[i - 1]) / (xs[i] - xs[i - 1]) * (ys[i] - ys[i - 1]);
    return ys[ys.length - 1];
  }
  /* zulässige Stahlspannung je Anforderung ('normal' = fsd, 'erhoeht' = Kurve B, 'hoch' = Kurve C) und Stababstand s [m] */
  const siaSigmaAdm = (level, s, fsd) => (level === 'hoch' ? min(fsd, linI(SIA_CURVE.C.s, SIA_CURVE.C.v, s * 1000)) : level === 'erhoeht' ? min(fsd, linI(SIA_CURVE.B.s, SIA_CURVE.B.v, s * 1000)) : fsd);
  function sia(c) {
    const EN = ec('EN'), gc = 1.5, gs = 1.15, Es = 205000, fsd = 500 / gs;
    const etaFc = (fck) => min(1, pow(30 / fck, 1 / 3)), tauCd = (fck) => 0.3 * sqrt(fck) / gc;
    const kg = (mat) => 48 / (16 + (mat.dmax || 32));
    const mRdOf = (rho, d, mat) => rho * d * d * mat.fyd * 1000 * (1 - rho * mat.fyd / (2 * mat.fcd));
    const kt = (h) => 1 / (1 + 0.5 * h);
    // Querkraft ohne Bügel (SIA 262 4.3.3.2): vRd = kd·τcd·dv, kd = 1/(1 + εv·d·kg), εv = fsd/Es · md/mRd (elastisch, ohne md: 1)
    const vRdOf = (rho, d, mat, m) => {
      const r = m > 0 && rho > 0 ? min(1.5, m / max(1e-9, mRdOf(rho, d, mat))) : 1;
      return tauCd(mat.fck) * d * 1000 / (1 + mat.fyd / Es * r * d * 1000 * kg(mat));
    };
    const sets = [{ id: 'q', G: 1.35, Q: 1.5, E: 1.0, H: 1.35, tag: 'Q leitend' }, { id: 'e', G: 1.35, Q: 0.7, E: 1.5, H: 1.35, tag: 'E leitend' }];
    const st = { lf: 's', mat: 's', shear: 's', crack: 's', punch: 's', geo: 's', upl: 's', col: 'e', defl: 'e', lap: 'e', cmin: 'e', fire: 'e' };
    return Object.assign({}, EN, {
      code: 'SIA', country: c, na: 'SIA', n: null, st,
      docs: ['SIA 260:2013', 'SIA 262:2013', 'SIA 267:2013', 'SIA 261:2020'],
      label: T_('SIA 260–267 (Schweiz)'),
      ref: { bend: 'SIA 262 4.3.2', shear: 'SIA 262 4.3.3', crack: 'SIA 262 4.4.2', crackMin: 'SIA 262 4.4.2', links: 'SIA 262 4.3.3.4', col: 'SIA 262 4.3.7', punch: 'SIA 262 4.3.6',
        punchOpen: 'SIA 262 4.3.6.2', wall: 'EN 1992-1-1 12.6.5.2', defl: 'SIA 262 4.4.3', lap: 'SIA 262 5.2', fire: 'EN 1992-1-2', gb: 'SIA 267, EN 1997-1 Anh. D', set: 'Steinbrenner',
        slope: 'SIA 267, Bishop', earth: 'SIA 267', geo: 'SIA 267', loads: 'SIA 261', seis: 'SIA 261', seis5: 'EN 1998-5', liq: 'SIA 267, EN 1998-5 4.1.4', bend2: 'SIA 262 5.2.4' },
      steel: 'B500B',
      lf: { G: 1.35, Ginf: 0.8, Q: 1.5, E: 1.5, H: 1.35, U: 1.35, sets, psiA: [0.7, 0.5, 0.3], psiE: [1.0, 0.9, 0.8], psi2Q: 0.6, psi2E: 0.8 },
      upl: { dst: 1.05, stb: 0.9, q: 1.5 },
      geo: { da: 'SIA 267', gRv: 1.0, gRh: 1.0, gPhi: 1.2, gc: 1.5, gQgeo: 1.3, sl: [1.2, 1.5, 1.3] },
      gc, gs, acc: null, fyk: 500, Es, ecu: 0.003,
      material(conc, b) {
        const fcd = etaFc(conc.fck) * conc.fck / gc;
        const fctEffR = (b.fctEff === 'halb' ? 0.5 : 1) * conc.fctm;
        const Ecm = 22000 * pow((conc.fck + 8) / 10, 0.3);
        const fc = b.fireClass || 'R90', colCover = fc === 'R120' ? 0.05 : fc === 'R90' ? 0.04 : 0.03;
        return { fck: conc.fck, fctm: conc.fctm, fcd, fyd: fsd, fctd: 1.4 * conc.fctm / gc / 2.25, fbd: 1.4 * conc.fctm / gc, fctEffR, Ecm, colCover, fyk: 500, dmax: b.dmax === 16 ? 16 : 32, tauCd: tauCd(conc.fck), etaFc: etaFc(conc.fck) };
      },
      muLim: 0.296,
      // Mindestbewehrung (SIA 262 4.4.2.3): As,min = fctd·W/(σs,adm·z), fctd = kt·fctm, kt = 1/(1 + 0,5 t), σs,adm = fsd
      asMin: (h, d, mat) => kt(h) * mat.fctm * h * h / 6 / (fsd * 0.9 * d) * 1e4,
      asMinBeam: (bw, d, mat) => { const h = d + 0.05; return kt(h) * mat.fctm * bw * h * h / 6 / (fsd * 0.9 * d) * 1e4; },
      crack: 'SIA',
      // Rissbeschränkung je Stababstand: WU → hohe, sonst erhöhte Anforderungen (außen), innen normal
      crackSpacing(ctx, phi, h, d, restr) {
        const level = ctx.noMin ? 'normal' : ctx.wu ? 'hoch' : 'erhoeht';
        return (s) => {
          const sa = siaSigmaAdm(level, s, fsd);
          if (level === 'normal') return { ok: true, asCrack: 0, asRestr: 0, sigmaAdm: null, level };
          return { ok: true, level, sigmaAdm: sa, asCrack: kt(h) * ctx.mat.fctm * h * h / 6 / (sa * 0.9 * d) * 1e4, asRestr: restr ? kt(h) * ctx.mat.fctEffR * (h / 2) / sa * 1e4 : 0 };
        };
      },
      sigmaAdm: siaSigmaAdm,
      vRdc: (rho, d, mat, plate, m) => vRdOf(rho, d, mat, m),
      vmin: () => 0,
      rhoForShear(vEd, d, mat, m) {
        if (!(vEd > 0) || !(d > 0)) return 0;
        // ohne Moment am Nachweisort: εv mit md/mRd = 1, Längsbewehrung hilft nicht
        if (!(m > 0)) return vRdOf(1, d, mat) >= vEd ? 0 : Infinity;
        const X = (tauCd(mat.fck) * d * 1000 / vEd - 1) / (mat.fyd / Es * d * 1000 * kg(mat));
        if (!(X > 0)) return Infinity;
        const mReq = m / min(1.5, X), A = d * d * mat.fyd * 1000, B = mat.fyd / (2 * mat.fcd), disc = A * A - 4 * A * B * mReq;
        return disc < 0 ? Infinity : (A - sqrt(disc)) / (2 * A * B);
      },
      crdc: () => null,
      // Querkraftbewehrung (SIA 262 4.3.3.4): VRd,s = Asw/s·z·fsd·cot α, 30° ≤ α ≤ 45°, Druckfeld kc = 0,55
      links(vEd, d, mat, bw) {
        const b = bw || 1, z = 0.9 * d, nu1 = 0.55, X = b * z * nu1 * mat.fcd * 1000 / max(vEd, 1e-6), cMax = sqrt(3);
        const cot = X >= cMax + 1 / cMax ? cMax : X > 2 ? (X + sqrt(X * X - 4)) / 2 : 1.0;
        return { z, cot, nu1, vRdMax: b * z * nu1 * mat.fcd * 1000 / (cot + 1 / cot), asw: vEd / (z * mat.fyd * 1000 * cot) * 1e4 };
      },
      aswMinBeam: (bw, mat) => 0.001 * sqrt(mat.fck / 30) * bw * 1e4,
      linkSpacing: (vEd, vRdMax, h, d) => min(0.75 * d, 0.60),
      deflLimit: 300,
      // Verankerung (SIA 262 5.2.5): lbd = Ø/4 · fsd/fbd ≥ 25 Ø, fbd = 1,4·fctm/γc; Übergreifung 1,5·lbd (sinngemäß EN, nicht belegt)
      lap: (phi, mat, poorBond) => 1.5 * max(phi / 4 * mat.fyd / ((poorBond ? 0.7 : 1) * (mat.fbd || 1.4 * mat.fctm / gc)), 25 * phi) / 1000,
      anchorage: (phi, mat, poorBond, d) => d + max(phi / 4 * mat.fyd / ((poorBond ? 0.7 : 1) * (mat.fbd || 1.4 * mat.fctm / gc)), 25 * phi) / 1000,
      // Durchstanzen (SIA 262 4.3.6, Stufe 2)
      punch: Object.assign({}, EN.punch, { method: 'SIA', beta: 1.0, ke: 0.9, ksys: 2.0 }),
      fcdPl: (fck) => 0.8 * fck / gc,
      cmin: EN.cmin, dcdev: EN.dcdev,
      // Normwerte für den Bericht: Bezeichnung (Schlüssel), Wert, Herkunft (v Normtext, s Sekundärquelle, e sinngemäß EN)
      params: () => [
        [N_('Teilsicherheiten Einwirkungen'), T_('γG = 1,35 (günstig 0,8), γQ = 1,5; Begleiteinwirkungen ψ₀ · Qk ohne γQ (SIA 260)'), 's'],
        [N_('Kombinationsbeiwerte'), 'Kat. A: ψ₀/ψ₁/ψ₂ = 0,7/0,5/0,3; Kat. E: 1,0/0,9/0,8', 's'],
        [N_('Beton'), T_('γc = 1,5, ηfc = (30/fck)^1/3 ≤ 1, ηt = 1,0; τcd = 0,3 · √fck / γc'), 's'],
        [N_('Betonstahl'), 'B500B: fsd = 435 MPa, Es = 205 GPa', 's'],
        [N_('Querkraft ohne Bewehrung'), 'vRd = kd · τcd · dv, kd = 1/(1 + εv · d · kg), εv = fsd/Es · md/mRd, kg = 48/(16 + Dmax)', 's'],
        [N_('Rissbeschränkung'), T_('normal: σs,adm = fsd; erhöht: Kurve B; hoch (WU): Kurve C nach Fig. 31 (digitalisiert, Zuordnung prüfen)'), 's'],
        [N_('Durchstanzen'), T_('Näherungsstufe 2: ke = 0,9, ksys = 2,0, rs = 0,22 L'), 's'],
        [N_('Geotechnik'), T_('SIA 267: tan φ / 1,2, c / 1,5, γR = 1,0; Böschungen (Typ 3) veränderliche Lasten × 1,3'), 's'],
        [N_('Auftrieb (UPL)'), T_('Typ 1: γ,dst = 1,05, γ,stb = 0,9'), 's'],
        [N_('Stützen, Biegeschlankheit, Übergreifung, Betondeckung, Brandschutz'), T_('sinngemäß EN 1992-1-1 / EN 1992-1-2 (Empfehlungswerte)'), 'e'],
      ],
      seis: { applies: true, type: 'SIA', gI: { I: 1.0, II: 1.2, III: 1.5 }, agR: { Z1a: 0.6, Z1b: 0.8, Z2: 1.0, Z3a: 1.3, Z3b: 1.6 }, map: 'https://map.geo.admin.ch/?layers=ch.bafu.gefahren-gefaehrdungszonen' },
      seisParams: seisSIA, seisComb: { H: 1.0, Q: null },
      tauCd, etaFc, kg,
    });
  }

  /* ---------- ACI 318-19 (SI) mit ASCE/SEI 7-22 (USA und Länder mit ACI-Bemessung) ----------
   * Quelle: research/us.json und us.md (Stand 16.10.2026). Biegung mit φ = 0,9 im Spannungsblock (fcd = φ·0,85·f′c, fyd = φ·fy,
   * zugbeherrscht εt ≥ εty + 0,003), Querkraft 22.5.5.1(c) mit Maßstabsfaktor λs, Bügel 22.5.8, Durchstanzen 22.6.5.2,
   * Mindestbewehrung 0,0018·Ag, Rissbeschränkung über Stababstände 24.3.2 (WU zusätzlich Rissbreite nach EN 1992-1-1 als
   * Hilfsnachweis), Mindestdicken 7.3.1.1/8.3.1.2, Übergreifung Klasse B, Stützen mit Momentenvergrößerung 6.6.4.5,
   * ASCE 7-22 2.3: 1,4 D bzw. 1,2 D + 1,6 L, Erd- und Wasserdruck H mit 1,6. Geotechnik als zulässige Spannungen (IBC Kap. 18). */
  const US_BARS = { 10: [0.71, 0.560, '#3'], 13: [1.29, 0.994, '#4'], 16: [1.99, 1.552, '#5'], 19: [2.84, 2.235, '#6'], 22: [3.87, 3.042, '#7'], 25: [5.10, 3.973, '#8'], 29: [6.45, 5.060, '#9'], 32: [8.19, 6.404, '#10'], 36: [10.06, 7.907, '#11'] };
  function aci(c) {
    const EN = ec('EN'), us = c === 'US' || c === 'PR', fy = 420, phiF = 0.9, phiV = 0.75, Es = 200000;
    const beta1 = (fc) => (fc <= 28 ? 0.85 : max(0.65, 0.85 - 0.05 * (fc - 28) / 7));
    const lamS = (d) => min(1, sqrt(2 / (1 + 0.004 * d * 1000)));
    const sq = (fc) => sqrt(min(fc, 69)); // √f′c ≤ 8,3 MPa
    const docsNat = D().nat[c] || null;
    const sets = [{ id: 'd', G: 1.4, Q: 0, E: 1.4, H: 1.6, tag: '1,4 D' }, { id: 'l', G: 1.2, Q: 1.6, E: 1.6, H: 1.6, tag: '1,2 D + 1,6 L' }];
    const P = {
      code: 'ACI', country: c, na: 'ACI', n: null, us,
      docs: us ? ['ASCE/SEI 7-22, IBC 2024', 'ACI 318-19', 'IBC 2024 Ch. 18', 'ASCE/SEI 7-22 Ch. 11–12'] : [docsNat || 'ACI 318-19', 'ACI 318-19', 'ACI 318-19 / IBC Ch. 18', docsNat || 'ASCE/SEI 7-22'],
      label: us ? T_('ACI 318-19 mit ASCE/SEI 7-22 (USA)') : T_('ACI 318-19 (Grundlage der Landesnorm)'),
      lf: { G: 1.2, Ginf: 0.9, Q: 1.6, E: 1.6, H: 1.6, U: 1.6, sets, psiA: [0.5, 0.5, 0.3], psiE: [1.0, 0.9, 0.8], psi2Q: 0.6, psi2E: 0.8 },
      upl: { dst: 1.0, stb: 0.9 / 1.2, q: 1.6 },
      geo: { da: 'ASD', gRv: 3.0, gRh: 1.5, gPhi: 1.0, gc: 1.0, gQgeo: 1.0, sl: [1.5, 1.5, 1.0] },
      gc: null, gs: null, acc: null, fyk: fy, Es, ecu: 0.003,
      dias: us ? [10, 13, 16, 19, 22, 25] : [8, 10, 12, 16, 20, 25], colPhi: us ? [16, 19, 22, 25, 29, 32] : [12, 16, 20, 25, 28, 32],
      linkPhi: us ? [10, 13] : [8, 10, 12], stairPhi: us ? [10, 13, 16] : [10, 12, 16], tiePhi: (phi) => (us ? (phi <= 32 ? 10 : 13) : (phi <= 20 ? 8 : 10)),
      barArea: us ? (phi) => (US_BARS[phi] ? US_BARS[phi][0] : Math.PI * phi * phi / 400) : null,
      barMass: us ? (phi) => (US_BARS[phi] ? US_BARS[phi][1] : 0.00617 * phi * phi) : null,
      barName: us ? (phi) => (US_BARS[phi] ? 'No. ' + phi + ' (' + US_BARS[phi][2] + ')' : 'Ø' + phi) : null,
      steelName: us ? 'ASTM A615 Grade 60' : 'fy = 420 MPa', steel: us ? 'A615 Gr. 60' : 'fy 420',
      ref: { bend: 'ACI 318-19 22.2', shear: 'ACI 318-19 22.5', crack: 'ACI 318-19 24.3', crackMin: 'ACI 318-19 24.4', links: 'ACI 318-19 22.5.8', col: 'ACI 318-19 6.6.4', punch: 'ACI 318-19 22.6',
        punchOpen: 'ACI 318-19 22.6.4.3', wall: 'ACI 318-19 11.5.3', defl: 'ACI 318-19 7.3.1, 9.3.1', lap: 'ACI 318-19 25.5', fire: 'ACI/TMS 216.1-14', gb: 'IBC 1806, Meyerhof', set: 'Steinbrenner',
        slope: 'Bishop', earth: 'ASCE/SEI 7-22 3.2', geo: us ? 'IBC 2024 Ch. 18' : 'ACI 318-19 / IBC', loads: 'ASCE/SEI 7-22', seis: 'ASCE/SEI 7-22 Ch. 11–12', seis5: 'IBC 2024 1803.5.12', liq: 'ASCE/SEI 7-22 11.8.3', bend2: 'ACI 318-19 25.3' },
      // Baugruben USA: OSHA 29 CFR 1926 Subpart P App. B bis 20 ft (6,1 m): Typ C (nichtbindig) 34°, Typ B (bindig, sichere Seite) 45°, Fels (verwittert, wie Typ A) 53°
      // Sohlpressung USA: zulässige Werte ohne Gutachten nach IBC 2024 Tab. 1806.2 (Gebrauchslasten): Klasse 3 Kies 3000 psf,
      // Klasse 4 Sand 2000 psf, Klasse 5 Schluff/Ton 1500 psf, Klasse 2 Sediment-/verwitterter Fels 4000 psf; eigene Werte
      // (Gutachten) als Bemessungswert σR,d eingegeben → zulässig σR,d / 1,4 / 1,4 (wie γR,v und mittlerer Lastfaktor)
      bearing: us ? { asd: true, ref: 'IBC 2024 Tab. 1806.2', qa: (k, s) => ({ kies: 144, sand: 96, schluff: 72, ton: 72, fels: 192 }[k] || s.sigmaRd / 1.96) } : null,
      exc: us ? { ref: 'OSHA 29 CFR 1926 Subpart P', dMax: 6.1, angle: (k, s) => (k === 'fels' ? 53 : (s.c || 0) > 0 ? 45 : 34) } : EN.exc,
      // Biegerollen 25.3.1/25.3.2: Längsstäbe 6 db bis No. 25, 8 db bis No. 36; Bügel 4 db bis No. 16
      mandrel: (phi, link) => (link && phi <= 16 ? 4 : phi <= 25 ? 6 : 8) * phi,
      material(conc, b) {
        const fc = conc.fck, b1 = beta1(fc);
        const fc0 = b.fireClass || 'R90', colCover = fc0 === 'R120' ? 0.05 : 0.04;
        // zugbeherrscht: c/dt ≤ 0,003/(0,003 + εty + 0,003) → ω = a/d = β1·c/d, μlim = ω(1 − ω/2), je Betonfestigkeit
        const w = b1 * 0.003 / (0.006 + fy / Es);
        this.muLim = w * (1 - w / 2);
        return { fck: fc, fc, fctm: conc.fctm, fcd: phiF * 0.85 * fc, fyd: phiF * fy, fy, fctd: 0.7 * conc.fctm / 1.5, fctEffR: (b.fctEff === 'halb' ? 0.5 : 1) * conc.fctm, Ecm: 4700 * sqrt(fc), colCover, fyk: fy, beta1: b1, fr: 0.62 * sqrt(fc) };
      },
      muLim: 0.2617,
      // Mindestbewehrung 0,0018·Ag nahe der Zugseite (7.6.1.1, 8.6.1.1); Balken 9.6.1.2
      asMin: (h) => 0.0018 * h * 1e4,
      asMinBeam: (bw, d, mat) => max(0.25 * sq(mat.fck) / fy, 1.4 / fy) * bw * d * 1e4,
      crack: 'ACI',
      // Rissbeschränkung 24.3.2: s ≤ 380·(280/fs) − 2,5·cc ≤ 300·(280/fs), fs = 2/3·fy; WU: Rissbreite als Hilfsnachweis (EN 1992-1-1)
      crackSpacing(ctx, phi, h, d, restr) {
        const fs = 2 / 3 * fy, cc = ctx.cnom * 1000, sLim = min(380 * 280 / fs - 2.5 * cc, 300 * 280 / fs);
        let aC = 0, aR = 0;
        if (ctx.wu) {
          const kC = h <= 0.3 ? 1.0 : h >= 0.8 ? 0.65 : 1.0 - (h - 0.3) / 0.5 * 0.35;
          aC = 0.4 * kC * ctx.mat.fctm * (h / 2) / EN.sigmaCrack(ctx.wk, phi, ctx.mat.fctm, h, d, false) * 1e4;
          if (restr) aR = kC * ctx.mat.fctEffR * (h / 2) / EN.sigmaCrack(ctx.wk, phi, ctx.mat.fctEffR, h, d, true) * 1e4;
        }
        return (s) => ({ ok: s * 1000 <= sLim + 1e-6, sLim, asCrack: aC, asRestr: aR, sigmaAdm: null, wkCheck: !!ctx.wu });
      },
      sigmaCrack: EN.sigmaCrack,
      wkMax: EN.wkMax, wkComb: 'qp',
      // Querkraft ohne Bügel 22.5.5.1(c): φ·0,66·λs·ρw^(1/3)·√f′c·d ≤ φ·0,42·√f′c·d [kN/m]
      vRdc: (rho, d, mat) => phiV * min(0.66 * lamS(d) * pow(min(0.02, max(rho, 1e-6)), 1 / 3), 0.42) * sq(mat.fck) * d * 1000,
      vmin: () => 0,
      rhoForShear(vEd, d, mat) {
        if (!(vEd > 0) || !(d > 0)) return 0;
        if (vEd > phiV * 0.42 * sq(mat.fck) * d * 1000) return Infinity;
        return pow(vEd / (phiV * 0.66 * lamS(d) * sq(mat.fck) * d * 1000), 3);
      },
      crdc: () => null,
      // Bügel 22.5.8 (Fachwerk 45°): φ(Vc + Vs) ≥ Vu, Vc = 0,17√f′c·bw·d (mit Mindestbügeln), Vs = Av·fyt·d/s ≤ 0,66√f′c·bw·d
      links(vEd, d, mat, bw) {
        const b = bw || 1, Vc = 0.17 * sq(mat.fck) * b * d * 1000, VsMax = 0.66 * sq(mat.fck) * b * d * 1000;
        return { z: d, cot: 1, nu1: null, vRdMax: phiV * (Vc + VsMax), asw: max(0, vEd / phiV - Vc) / (fy * 1000 * d) * 1e4, Vc };
      },
      aswMinBeam: (bw, mat) => max(0.062 * sq(mat.fck), 0.35) * bw / fy * 1e4,
      // Bügelabstand 9.7.6.2.2: d/2 ≤ 600 mm, bei Vs > 0,33 √f′c bw d halbiert (d/4 ≤ 300 mm); vRdMax = φ·0,83 √f′c bw d
      linkSpacing: (vEd, vRdMax, h, d) => (vEd > vRdMax * 0.5 / 0.83 ? min(d / 4, 0.30) : min(d / 2, 0.60)),
      // Durchbiegung ohne Nachweis über Mindestdicken: Platten auf Wänden 8.3.1.2 (αfm > 2): h ≥ ln (0,8 + fy/1400)/(36 + 9β),
      // Balken 9.3.1.1: l/16 (Einfeld), l/18,5 (Endfeld), l/21 (Innenfeld), je × (0,4 + fy/700)
      defl(l, d, asReq, mat, K) {
        const h = d + 0.045;
        const lim = K ? (K > 1.2 ? 18.5 : 16) / (0.4 + fy / 700) * h / d : (36 + 9 * 1) / (0.8 + fy / 1400) * h / d;
        return { ld: l / d, lim, eta: (l / d) / lim };
      },
      ldCap: (lim, l) => 20 / (0.4 + fy / 700) * 1.15,
      deflLimit: 240,
      // Verankerungslänge 25.4.2.3 (SI): ld = fy ψt ψe ψg/(2,1 λ √f′c) db (≤ No. 19) bzw. /(1,7 λ √f′c) (≥ No. 22) ≥ 300 mm;
      // Übergreifung Klasse B 1,3·ld (25.5.2), ψt = 1,3 bei mehr als 300 mm Frischbeton unter dem Stab
      ldev: (phi, mat, poorBond) => max(0.3, fy * (poorBond ? 1.3 : 1) / ((phi <= 19 ? 2.1 : 1.7) * sq(mat.fck)) * phi / 1000),
      lap(phi, mat, poorBond) { return max(0.3, 1.3 * this.ldev(phi, mat, poorBond)); },
      anchorage(phi, mat, poorBond, d) { return d + this.ldev(phi, mat, poorBond); },
      col: { aci: true, lamLim: () => 34, asMin: (nEd, fyd, Ac) => 0.01 * Ac * 1e4, asMax: 0.04, sw: [16, 0.45], phiMin: us ? 16 : 12 },
      punch: { method: 'ACI', beta: 1.0, alphaS: 40, phi: phiV },
      fcdPl: (fck) => 0.55 * 0.65 * fck, // 11.5.3: Pn = 0,55 f′c Ag [1 − (k lc/32h)²], φ = 0,65 (Formel siehe calc)
      cover: { earth: 75, exposed: 50, exposedSmall: 40, inside: 20 },
      cmin: null, dcdev: null,
      coverMin: () => ({ min: 50, ref: 'ACI 318-19 Tab. 20.5.1.3.1', note: N_('erdberührt; 75 mm gegen Erdreich betoniert') }),
      seis: { applies: true, type: 'ASCE7', gI: { I: 1.0, II: 1.0, III: 1.25, IV: 1.5 } },
      // Erdbebenkombination ASCE 7-22 2.3.6 (6): 1,2 D + Ev + Eh + 0,5 L, Erddruck H mit 1,6 wie in 2.3.1
      seisParams: seisASCE, seisComb: { H: 1.6, Q: 0.5 },
      fire: 'ACI216',
      beta1, lamS, sq, phiV, phiF, fyACI: fy,
      params: () => [
        [N_('Kombinationen (ASCE 7-22 2.3)'), T_('1,4 D; 1,2 D + 1,6 L; Erd- und Wasserdruck H mit 1,6, günstig 0,9 D'), 'v'],
        [N_('Beton'), T_('f′c = fck (Zylinder), Spannungsblock 0,85 f′c über β1·c, εcu = 0,003'), 'v'],
        [N_('Betonstahl'), (us ? 'ASTM A615 Grade 60' : 'fy = 420 MPa') + ', Es = 200 GPa', 'v'],
        [N_('Abminderungsbeiwerte φ'), T_('Biegung 0,90 (zugbeherrscht), Querkraft und Durchstanzen 0,75, Stützen 0,65 bis 0,90'), 'v'],
        [N_('Querkraft ohne Bewehrung'), 'φ · 0,66 · λs · ρw^1/3 · √f′c · bw · d, λs = √(2/(1 + 0,004 d)) ≤ 1', 'v'],
        [N_('Mindestbewehrung'), T_('0,0018 · Ag je Zugseite (Platten, Wände), Balken max(0,25 √f′c, 1,4)/fy · bw · d'), 's'],
        [N_('Rissbeschränkung'), T_('Stababstand s ≤ 380 (280/fs) − 2,5 cc ≤ 300 (280/fs), fs = 2/3 fy; WU: Rissbreite nach EN 1992-1-1 als Hilfsnachweis (ACI 350 nicht umgesetzt)'), 's'],
        [N_('Durchstanzen'), T_('vc = min(0,33; 0,17 (1 + 2/β); 0,083 (2 + αs d/b₀)) · λs · √f′c, αs = 40'), 'v'],
        [N_('Mindestdicken (Durchbiegung)'), T_('Platten auf Wänden h ≥ ln (0,8 + fy/1400)/(36 + 9β); Balken l/16 bis l/21 × (0,4 + fy/700)'), 's'],
        [N_('Verankerung und Stöße'), T_('ld nach 25.4.2.3, Übergreifung Klasse B = 1,3 ld'), 's'],
        [N_('Betondeckung'), T_('75 mm gegen Erdreich, 50 mm erdberührt (ab No. 19), 40 mm (bis No. 16), 20 mm innen'), 's'],
        [N_('Geotechnik'), T_('zulässige Spannungen: Grundbruch Sicherheit 3,0, Gleiten 1,5, Böschungen 1,5 (Gebrauchslasten)'), 's'],
        [N_('Auftrieb (UPL)'), T_('0,9 D gegen 1,2 F (Wasser wie Flüssigkeitslast F)'), 's'],
      ],
    };
    return Object.assign({}, EN, P);
  }

  /* ---------- Profil eines Projekts ---------- */
  const cache = new Map();
  function profile(p) {
    const L = BP.laender, c = L ? L.country(p) : 'DE', fam = L ? L.info(c).fam || 'EC' : 'EC';
    const key = c + '|' + fam + '|' + I18.lang();
    let r = cache.get(key);
    if (!r) {
      r = fam !== 'EC' && PROFILES[fam] ? PROFILES[fam](c) : ec(c);
      r.fam = fam;
      r.national = D().nat[c] || null;
      cache.set(key, r);
    }
    return r;
  }
  const PROFILES = { SIA: sia, ACI: aci };

  let active = null;
  const setActive = (np) => { active = np; };
  const DEFAULT = () => profile(null);

  /* Anzeige einer Kombination in der Oberflächensprache: Namen der Rechenaufgaben sind deutsch und aus den Faktoren gebildet
   * (calc.js combo()), terms/tail tragen die Bestandteile. Ältere Namen ohne Bestandteile werden übersetzt. */
  const fmtF = (v) => I18.dec(String(Math.round(v * 10000) / 10000));
  const WORDS = { Rahmenecke: N_('Rahmenecke@@Kombination'), Wasser: N_('Wasser@@Kombination'), 'feldweise (+)': N_('feldweise (+)'), 'feldweise (−)': N_('feldweise (−)'), 'Behälter leer': N_('Behälter leer'),
    'Q leitend': N_('Q leitend'), 'E leitend': N_('E leitend') };
  const word = (w) => { const m = /^\((.*)\)$/.exec(w); return m ? '(' + word(m[1]) + ')' : WORDS[w] ? T_(WORDS[w]) : w; };
  function comboLabel(c) {
    if (!c) return '';
    if (!c.terms) return I18.maybe(c.name);
    return c.terms.map(([f, sy, suf]) => (f === 1 ? word(sy) : fmtF(f) + ' ' + word(sy)) + (suf ? ' ' + word(suf) : '')).join(' + ') + (c.tail || []).map(([sep, w]) => sep + word(w)).join('');
  }

  BP.normen = { soilEC, seisEC, seisSIA, seisASCE, sdcOf, FR_ZONE, SIA_Z, SIA_AGD, ndp, ec, profile, setActive, active: () => active || DEFAULT(), sigmaT72, comboLabel, PROFILES, kOf };
  void N_;
})(typeof window !== 'undefined' ? window : globalThis);
