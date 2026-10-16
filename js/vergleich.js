/* Vergleichspaket für den Tragwerksplaner: alle Eingangswerte, Systeme, Lastfälle, Kombinationen und Ergebnisse als
 * Tabelle (Abschnitt, Bauteil, Größe, Wert, Einheit, Hinweis) sowie die Systemlinien als DXF (R12, Meter) zum Import in
 * ein FE-Programm. Damit lässt sich die Vorbemessung mit einer eigenen Rechnung Position für Position vergleichen.
 * Reine Funktionen auf dem Rechenergebnis q; Ausgabe als Datei in export.js. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const max = Math.max;
  const T_ = BP.i18n.T, N_ = BP.i18n.N, I18 = BP.i18n;

  function rows(q) {
    const p = q.p, b = p.build, g = q.geo, st = q.struct, L = st.loads || {}, mat = st.mat, lv = q.lv, soil = q.soil, vf = q.verify || {};
    const pos = BP.statikReport ? BP.statikReport.positions(q) : { mids: {}, cols: {}, beams: {}, walls: {} };
    const out = [], R = (sec, el, what, v, unit, note) => out.push([sec, el, what, v, unit || '', note || '']);
    const lab = (k, d) => g.labels[k] || d;
    const lineName = (id) => {
      if (/^aussen(\d+)$/.test(id)) return T_('Außenwand, Kante {n}', { n: id.slice(6) });
      if (id === 'bodenplatte') return T_('Bodenplatte');
      if (id === 'decke') return T_('Decke');
      if (id === 'ecke') return T_('Wandecke');
      const zd = /^zd(\d+)$/.exec(id || '');
      if (zd) return T_('Zwischendecke über Ebene {n}', { n: +zd[1] + 1 });
      return g.labels['w:' + id] || g.labels['b:' + id] || id;
    };
    const nL = g.L.length;

    // 0 Hinweise
    R(T_('0 Allgemeines'), T_('Projekt'), T_('Bezeichnung'), p.name, '', '');
    const NP = BP.normen.profile(p), RF = NP.ref, dT = (v) => I18.dec(String(Math.round(v * 1000) / 1000));
    R(T_('0 Allgemeines'), T_('Normen'), T_('Grundlage'), NP.code === 'EC' && NP.na === 'DE' ? T_('DIN EN 1990/1991/1992-1-1/1997-1 mit NA DE; DIN 1054, 4017, 4019, 4084') : NP.label + ' (' + (NP.docs || []).join(', ') + ')', '', '');
    R(T_('0 Allgemeines'), T_('Vergleich'), T_('Empfehlung'), T_('Platten: Bemessungsmomente (an Auflagern über 2·d gemittelt) und Auflagerkräfte vergleichen, nicht Knotenspitzen an Stützen und Wandenden'), '', '');

    // 1 Baustoffe und Baugrund
    R(T_('1 Baustoffe'), T_('Beton'), T_('Festigkeitsklasse'), mat.name || '', '', '');
    R(T_('1 Baustoffe'), T_('Beton'), 'fck', mat.fck, 'MPa'); R(T_('1 Baustoffe'), T_('Beton'), T_('fcd = 0,85 fck / 1,5'), mat.fcd, 'MPa'); R(T_('1 Baustoffe'), T_('Beton'), 'fctm', mat.fctm, 'MPa'); R(T_('1 Baustoffe'), T_('Beton'), 'Ecm', mat.Ecm, 'MPa');
    R(T_('1 Baustoffe'), T_('Betonstahl'), (BP.normen.profile(q.p).steel || 'B500B') + (BP.normen.profile(q.p).code === 'ACI' ? ' φ fy' : ' fyd'), mat.fyd, 'MPa');
    R(T_('1 Baustoffe'), T_('Betondeckung'), T_('cnom Platten/Wände'), b.cnom, 'm'); R(T_('1 Baustoffe'), T_('Betondeckung'), T_('cnom Stützen'), mat.colCover || 0.03, 'm');
    R(T_('1 Baugrund'), T_(soil.name || N_('Boden')), T_('Wichte γ / γ′'), soil.gamma + ' / ' + (soil.gammaSat - 10), 'kN/m³');
    R(T_('1 Baugrund'), T_(soil.name || N_('Boden')), T_('Reibungswinkel φ′'), soil.phi, '°'); R(T_('1 Baugrund'), T_(soil.name || N_('Boden')), T_('Kohäsion c′'), soil.c || 0, 'kN/m²');
    R(T_('1 Baugrund'), T_(soil.name || N_('Boden')), T_('Steifemodul Es'), soil.Es || 40, 'MN/m²'); R(T_('1 Baugrund'), T_(soil.name || N_('Boden')), T_('Erdruhedruckbeiwert K0'), st.K0, '');
    R(T_('1 Baugrund'), T_('Wasser'), T_('Bemessungswasserstand'), lv.water.label, '', '');
    if (st.fe.jobs.floor) R(T_('1 Baugrund'), T_('Bodenplatte'), T_('Bettungsmodul ks (Rechenwert)'), st.fe.jobs.floor.ksList[0] / 1000, 'MN/m³', T_('aus Es / √A, halber Wert als Rechenwert'));

    // 2 Geometrie
    R(T_('2 Geometrie'), T_('Höhen'), T_('OK Decke (Rohbau) unter Gelände'), -lv.zRoofTop, 'm'); R(T_('2 Geometrie'), T_('Höhen'), T_('UK Bodenplatte unter Gelände'), -lv.zSlabBot, 'm');
    R(T_('2 Geometrie'), T_('Dicken'), T_('Decke / Außenwand / Bodenplatte'), b.tRoof + ' / ' + b.tWall + ' / ' + b.tFloor, 'm');
    lv.levels.forEach((l) => R(T_('2 Geometrie'), T_('Ebene {n}', { n: l.idx + 1 }), T_('lichte Höhe / Plattendicke darüber'), l.H + ' / ' + (l.idx ? l.tSlab : b.tRoof), 'm'));
    g.out.forEach((pt, i) => R(T_('2 Geometrie'), T_('Außenkontur'), T_('Punkt {n} x / y', { n: i + 1 }), pt.x.toFixed(3) + ' / ' + pt.y.toFixed(3), 'm', T_('Außenkante')));
    g.L.forEach((Lg) => {
      for (const w of Lg.walls) for (const sg of w.segs) R(T_('2 Geometrie'), T_('Ebene {n}: {name}', { n: Lg.idx + 1, name: lab('w:' + w.id, T_('Wand')) }), T_(w.info.bearing ? 'tragend, t = {t} m, Achse von / bis' : 'nicht tragend, t = {t} m, Achse von / bis', { t: w.t }), sg.a.x.toFixed(3) + ' / ' + sg.a.y.toFixed(3) + ' → ' + sg.b.x.toFixed(3) + ' / ' + sg.b.y.toFixed(3), 'm');
      for (const c of Lg.columns) R(T_('2 Geometrie'), T_('Ebene {n}: {name}', { n: Lg.idx + 1, name: lab('c:' + c.id, T_('Stütze')) }), T_('Mitte x / y, bx × by'), c.x.toFixed(3) + ' / ' + c.y.toFixed(3) + ', ' + c.bx + ' × ' + c.by, 'm');
      for (const u of Lg.beams) for (const sg of u.segs) R(T_('2 Geometrie'), T_('Ebene {n}: {name}', { n: Lg.idx + 1, name: lab('b:' + u.id, T_('Unterzug')) }), T_('Achse, bw × hb (unter Platte)'), sg.a.x.toFixed(3) + ' / ' + sg.a.y.toFixed(3) + ' → ' + sg.b.x.toFixed(3) + ' / ' + sg.b.y.toFixed(3) + ', ' + u.bw + ' × ' + u.hb, 'm');
      for (const o of Lg.openings || []) R(T_('2 Geometrie'), T_('Ebene {n}: {name}', { n: Lg.idx + 1, name: T_('Öffnung') }), T_('Breite × Höhe, Brüstung'), o.w + ' × ' + o.h + ', ' + (o.sill || 0), 'm', o.host || '');
    });

    // 3 Systeme und Lastfälle (FE)
    const jobOut = (name, job) => {
      if (!job) return;
      const S = T_('3 Systeme {name}', { name });
      R(S, name, T_('Plattendicke h / Netzweite / E / ν'), job.h + ' / ' + job.meshSize.toFixed(3) + ' / ' + job.E + ' / ' + (job.nu || 0.2), 'm, kN/m²');
      for (const l of job.lines || []) R(S, lineName(l.id), l.outer ? T_('Linienlager mit Drehfeder (Rahmenecke)') : l.beam ? T_('Linienlager (Unterzug, starr)') : T_('Linienlager (Wand)'), l.kRot ? 'kφ = ' + Math.round(l.kRot) + ' kNm/m/rad' : T_('starr'), '', l.a.x.toFixed(3) + ' / ' + l.a.y.toFixed(3) + ' → ' + l.b.x.toFixed(3) + ' / ' + l.b.y.toFixed(3) + (l.kind === 'presc' ? ', ' + T_('Wand als starrer Kasten') : ''));
      for (const a of job.columns || []) R(S, lab('c:' + a.id, T_('Stütze')), T_('Flächenlager'), a.bx + ' × ' + a.by, 'm', a.x.toFixed(3) + ' / ' + a.y.toFixed(3));
      (job.holes || []).forEach((h, i) => R(S, T_('Aussparung {n}', { n: i + 1 }), T_('Eckpunkte'), h.map((pt) => pt.x.toFixed(2) + '/' + pt.y.toFixed(2)).join('; '), 'm'));
      job.cases.forEach((c) => {
        if (c.presc) return;
        const el = T_('Lastfall {name}', { name: T_(c.name) });
        if (c.q) R(S, el, T_('Flächenlast'), c.q, 'kN/m²', c.name === 'Wasser' ? T_('nach oben') : '');
        if (c.profileY) R(S, el, T_('Verlauf über y (y: q)'), c.profileY.filter((_, i, a) => i % 5 === 0 || i === a.length - 1).map((x) => x[0].toFixed(2) + ': ' + x[1].toFixed(2)).join('; '), 'm: kN/m²', T_('linear zwischen den Stützstellen'));
        for (const z of c.zones || []) R(S, el, z.outside ? T_('Flächenlast außerhalb der Kontur') : T_('Flächenlast im Innenraum'), z.q, 'kN/m²');
        for (const ll of c.lineLoads || []) R(S, el, T_('Linienlast'), ll.q, 'kN/m', ll.a.x.toFixed(3) + ' / ' + ll.a.y.toFixed(3) + ' → ' + ll.b.x.toFixed(3) + ' / ' + ll.b.y.toFixed(3));
        for (const pt of c.points || []) R(S, el, T_('Einzellast'), pt.P, 'kN', pt.x.toFixed(3) + ' / ' + pt.y.toFixed(3));
        for (const r of c.rects || []) R(S, el, T_('Teilflächenlast'), r.q, 'kN/m²', r.x0.toFixed(3) + '–' + r.x1.toFixed(3) + ' / ' + r.y0.toFixed(3) + '–' + r.y1.toFixed(3));
        if (c.gridQ) R(S, el, T_('feldweise ±'), c.gridQ.f, 'kN/m²', T_('schachbrettartig je Feld zwischen tragenden Wänden'));
        if (c.mEdge) R(S, el, T_('Randmoment Außenwand je m (Faktor)'), c.mEdge, '', T_('Einspannmoment der Wand aus Erddruck'));
      });
      for (const c of job.combos.uls) R(S, T_('Kombination GZT'), BP.normen.comboLabel(c), c.c.map((v) => I18.dec(String(v))).join(' | '), '', T_('Faktoren je Lastfall in obiger Reihenfolge'));
      for (const c of job.combos.sls) R(S, T_('Kombination GZG'), BP.normen.comboLabel(c), c.c.map((v) => I18.dec(String(v))).join(' | '), '');
    };
    jobOut(T_('Decke'), st.fe.jobs.roof);
    (st.fe.jobs.mids || []).forEach((j) => jobOut(T_('Zwischendecke über Ebene {n}', { n: j.level + 1 }), j));
    jobOut(T_('Bodenplatte'), st.fe.jobs.floor);
    (st.fe.jobs.walls || []).filter((j) => j.variant === 'eingespannt').forEach((j) => jobOut(T_('Außenwand Kante {n} (lokal: x längs, y lotrecht ab Achse Bodenplatte)', { n: j.edge + 1 }), j));
    R(T_('3 Systeme {name}', { name: T_('Außenwand') }), T_('Außenwand'), T_('Erddruck charakteristisch oben / unten'), st.wall.pressures.top.k.toFixed(2) + ' / ' + st.wall.pressures.bot.k.toFixed(2), 'kN/m²', 'z = ' + st.wall.pressures.top.z.toFixed(2) + ' / ' + st.wall.pressures.bot.z.toFixed(2) + ' m');
    R(T_('3 Systeme {name}', { name: T_('Außenwand') }), T_('Außenwand'), T_('Bemessungswert oben / unten'), st.wall.p1.toFixed(2) + ' / ' + st.wall.p2.toFixed(2), 'kN/m²', T_('{g} ständig, {q} veränderlich', { g: dT(Math.max(...NP.lf.sets.map((S) => S.H))), q: dT(Math.max(...NP.lf.sets.map((S) => S.Q))) }));
    R(T_('3 Systeme {name}', { name: T_('Außenwand') }), T_('Außenwand'), T_('Stützweiten lotrecht'), (st.wall.spans || []).map((x) => (Array.isArray(x) ? x[1] - x[0] : x).toFixed(3)).join(' / '), 'm');
    for (const e of q.tech.equip || []) R(T_('3 Einbauten'), e.name, T_('G / E auf {slab}', { slab: e.slab }), e.G.toFixed(2) + ' / ' + e.E.toFixed(2), 'kN', e.rect.x0.toFixed(2) + '–' + e.rect.x1.toFixed(2) + ' / ' + e.rect.y0.toFixed(2) + '–' + e.rect.y1.toFixed(2) + ' m');

    // 4 Ergebnisse
    const plateRes = (no, name, pl) => {
      if (!pl) return;
      const S = T_('4 Ergebnisse Pos. {no}', { no });
      R(S, name, T_('Verfahren'), pl.method === 'FE' ? T_('FE (Momente an Auflagern über 2·d gemittelt)') : T_('Tafelverfahren'), '');
      for (const l of pl.layers || []) {
        R(S, name + ': ' + BP.calc.labelText(l.label), T_('mEd,max / mEd,Grund'), (l.m || 0).toFixed(2) + ' / ' + (l.mBase != null ? l.mBase : l.m || 0).toFixed(2), 'kNm/m');
        R(S, name + ': ' + BP.calc.labelText(l.label), T_('as,erf / as,vorh'), (l.req || 0).toFixed(2) + ' / ' + (l.prov || 0).toFixed(2), 'cm²/m', 'Ø' + l.phi + '/' + Math.round(l.s * 1000) / 10 + ', d = ' + (l.d * 100).toFixed(1) + ' cm');
      }
      for (const z of pl.zulagen || []) R(S, T_('{name}: Zulage', { name }), T_(z.face) + ' ' + z.dir + ', mEd', z.mMax, 'kNm/m', T_('{bar} in {area} m', { bar: 'Ø' + z.phi + '/' + Math.round(z.s * 1000) / 10, area: z.x0.toFixed(2) + '–' + z.x1.toFixed(2) + ' / ' + z.y0.toFixed(2) + '–' + z.y1.toFixed(2) }));
      if (pl.shear) R(S, name, T_('Querkraft vEd / vRd,c'), (pl.shear.vEd || 0).toFixed(1) + ' / ' + (pl.shear.vRd || 0).toFixed(1), 'kN/m');
      if (pl.defl && isFinite(pl.defl.w)) R(S, name, T_('Durchbiegung w / l/250'), (pl.defl.w * 1000).toFixed(1) + ' / ' + (pl.defl.lim * 1000).toFixed(1), 'mm');
      if (pl.wkMax != null) R(S, name, T_('Rissbreite wk'), pl.wkMax, 'mm');
      if (pl.fe && pl.fe.react) {
        for (const l of pl.fe.react.lines) R(S, T_('{name}: Lager {line}', { name, line: lineName(l.id) }), T_('Summe / größter Wert je m (1 m gemittelt)'), l.sum.toFixed(1) + ' / ' + l.win.toFixed(1), 'kN / kN/m', T_('Bemessungswerte, Größtwert der Kombinationen'));
        for (const a of pl.fe.react.areas) R(S, T_('{name}: Lager {line}', { name, line: lab('c:' + a.id, T_('Stütze')) }), T_('Summe'), a.sum, 'kN', T_('Bemessungswert'));
      }
      if (pl.soil) R(S, name, T_('Bodenpressung größter Wert / Mittel'), pl.soil.pMax.toFixed(1) + ' / ' + pl.soil.pMean.toFixed(1), 'kN/m²', T_('Bemessungswert aus der Bettung'));
      R(S, name, T_('Ausnutzung η'), pl.etaS, '');
    };
    plateRes(pos.roof, T_('Decke'), st.roof);
    for (const m of st.mids || []) plateRes(pos.mids[m.level], BP.calc.elName(m.name), m);
    plateRes(pos.floor, T_('Bodenplatte'), st.floor);
    const w = st.wall;
    if (w) {
      const S = T_('4 Ergebnisse Pos. {no}', { no: pos.wall });
      R(S, T_('Außenwand'), T_('Feldmoment / Rahmenecke oben / unten'), w.moments.mF.toFixed(2) + ' / ' + w.moments.mJTop.toFixed(2) + ' / ' + w.moments.mJBot.toFixed(2), 'kNm/m');
      R(S, T_('Außenwand'), T_('waagerecht an den Wandecken'), w.moments.mH, 'kNm/m');
      R(S, T_('Außenwand'), T_('Querkraft vEd / vRd,c'), w.shear.vEd.toFixed(1) + ' / ' + w.shear.vRd.toFixed(1), 'kN/m');
      for (const l of w.layers) R(S, T_('Außenwand: {label}', { label: BP.calc.labelText(l.label) }), T_('as,erf / as,vorh'), (l.req || 0).toFixed(2) + ' / ' + (l.prov || 0).toFixed(2), 'cm²/m', 'Ø' + l.phi + '/' + Math.round(l.s * 1000) / 10);
      if (w.fe) for (const e of w.fe.edges) R(S, T_('Außenwand (FE) Kante {n}, Ecken {variant}', { n: e.edge + 1, variant: T_(e.variant) }), T_('m lotrecht innen / außen / waagerecht; vEd'), e.vi.toFixed(2) + ' / ' + e.vo.toFixed(2) + ' / ' + e.h.toFixed(2) + '; ' + e.v.toFixed(1), 'kNm/m; kN/m', T_('Größtwerte, an Auflagern über 2·d gemittelt'));
      R(S, T_('Außenwand'), T_('Ausnutzung η'), w.etaS, '');
    }
    for (const iw of st.intWalls || []) R(T_('4 Ergebnisse Pos. {no}', { no: 4 }), T_('{name} (Ebene {n})', { name: lab('w:' + iw.id, T_('Wand')), n: iw.level + 1 }), 'nEd / nRd (Φ = ' + iw.Phi.toFixed(3) + ')', iw.nEd.toFixed(1) + ' / ' + iw.nRd.toFixed(1), 'kN/m');
    for (const c of st.columns || []) {
      const S = T_('4 Ergebnisse Pos. {no}', { no: pos.cols[c.id] || '5' }), nm = T_('{name} (Ebene {n})', { name: lab('c:' + c.id, T_('Stütze')), n: c.level + 1 });
      R(S, nm, 'NEd / l0', c.nEd.toFixed(1) + ' / ' + c.l0.toFixed(3), 'kN / m', T_('NEd aus FE-Auflagerkraft und Unterzügen'));
      if (c.design && c.design.dirs) c.design.dirs.forEach((d2) => R(S, T_('{name} Richtung {k}', { name: nm, k: d2.k }), 'λ, e0 + ei + e2, MEd / MRd', d2.lam.toFixed(1) + '; ' + (d2.e0 * 1000).toFixed(0) + ' + ' + (d2.ei * 1000).toFixed(0) + ' + ' + (d2.e2 * 1000).toFixed(1) + ' mm; ' + d2.mEd.toFixed(1) + ' / ' + d2.mRd.toFixed(1), 'kNm'));
      if (c.design) R(S, nm, T_('Längsbewehrung'), (c.design.nb || '') + ' Ø' + (c.design.phi || '') + ' = ' + (c.design.As || 0).toFixed(2), 'cm²');
      for (const pu of [c.punch, c.punchBelow]) if (pu) R(S, T_('{name} Durchstanzen {face}', { name: nm, face: T_(pu.face) }), 'vEd / vRd,c (β = ' + pu.beta + ', d = ' + pu.d.toFixed(3) + ' m, u1 = ' + pu.u1.toFixed(3) + ' m)', pu.vEd.toFixed(3) + ' / ' + pu.vRdc.toFixed(3), 'MPa', pu.needs ? T_('mit Durchstanzbewehrung') : '');
      R(S, nm, T_('Ausnutzung η'), c.etaS != null ? c.etaS : c.eta, '');
    }
    for (const bd of st.beams || []) {
      const S = T_('4 Ergebnisse Pos. {no}', { no: pos.beams[bd.id] || '6' }), nm = lab('b:' + bd.id, T_('Unterzug'));
      R(S, nm, T_('Länge, bw × h'), bd.L.toFixed(3) + ', ' + bd.bw + ' × ' + bd.h.toFixed(2), 'm');
      R(S, nm, T_('Lasten gk / qk / ek (Mittel)'), bd.gk.toFixed(2) + ' / ' + bd.qk.toFixed(2) + ' / ' + (bd.ek || 0).toFixed(2), 'kN/m', bd.profile ? T_('Verlauf aus FE-Auflagerkräften') : T_('Gleichlast'));
      if (bd.mF != null) R(S, nm, T_('MEd Feld / Stütze'), bd.mF.toFixed(1) + ' / ' + bd.mS.toFixed(1), 'kNm');
      if (bd.vEd != null) R(S, nm, T_('VEd (Auflagerrand + d)'), bd.vEd, 'kN');
      for (const sp of bd.sups || []) R(S, nm, T_('Auflager {kind} bei s = {s} m: Rd / Rk,g / Rk,q / Rk,e', { kind: T_(sp.kind), s: sp.s.toFixed(2) }), (sp.Rd || 0).toFixed(1) + ' / ' + (sp.Rg || 0).toFixed(1) + ' / ' + (sp.Rq || 0).toFixed(1) + ' / ' + (sp.Re || 0).toFixed(1), 'kN', T_('e: Einbauten (Füllung von Tanks und Vorräten)'));
      R(S, nm, T_('Ausnutzung η'), bd.etaS != null ? bd.etaS : bd.eta, '');
    }
    for (const r of (q.blastDyn && q.blastDyn.rows) || []) R(T_('4 Ergebnisse Pos. {no}', { no: 13 }), r.el + ': ' + r.load, 'P0 / td / T / KLM / Ru / ps / xm / μ / θ / V / VRd', [r.P0.toFixed(1), isFinite(r.td) ? (r.td * 1000).toFixed(2) + ' ms' : '∞', (r.T * 1000).toFixed(1) + ' ms', r.klm != null ? r.klm.toFixed(3) : '–', r.Ru.toFixed(1), r.ps.toFixed(1), isFinite(r.xm) ? (r.xm * 1000).toFixed(2) + ' mm' : '∞', isFinite(r.mu) ? r.mu.toFixed(2) : '∞', isFinite(r.theta) ? r.theta.toFixed(2) + '°' : '∞', isFinite(r.vEd) ? r.vEd.toFixed(0) : '∞', r.vCap.toFixed(0)].join(' / '), 'kN/m², s, m', T_('Einmassenschwinger, KE = {ke} kN/m²/m, m = {m} t/m², L = {L} m', { ke: r.KE.toFixed(0), m: r.m.toFixed(3), L: r.L.toFixed(2) }));
    const eqv = vf.eq;
    if (eqv) {
      if (eqv.kind === 'ASCE7') R(T_('4 Ergebnisse Pos. {no}', { no: 15 }), T_('Erdbeben'), 'SDS / SD1 / SDC / Ie', eqv.sds + ' / ' + (eqv.sd1 != null ? eqv.sd1 : '–') + ' / ' + eqv.sdc + ' / ' + eqv.gI, 'g', 'ASCE/SEI 7-22');
      else R(T_('4 Ergebnisse Pos. {no}', { no: 15 }), T_('Erdbeben'), T_('Zone / ag / Untergrund / S'), (eqv.kind === 'DE' ? eqv.zone : eqv.label) + ' / ' + eqv.ag.toFixed(3) + ' / ' + eqv.key + ' / ' + eqv.P.S, 'm/s²', eqv.kind === 'DE' ? 'DIN EN 1998-1/NA' : RF.seis);
      R(T_('4 Ergebnisse Pos. {no}', { no: 15 }), T_('Erdbeben'), T_('Erddruckzuwachs Δp über H'), T_('{dp} über {H} m', { dp: eqv.dp.toFixed(2), H: eqv.H.toFixed(2) }), 'kN/m²', eqv.kind === 'DE' ? 'DIN EN 1998-5 E.9' : eqv.kind === 'ASCE7' ? I18.decAll('kh = 0.4 SDS') + ' (IBC 1803.5.12)' : RF.seis5 + ' E.9');
      for (const r of eqv.wallRows) R(T_('4 Ergebnisse Pos. {no}', { no: 15 }), T_('Außenwand: {label}', { label: BP.calc.labelText(r.label) }), 'mEd,E / mRd', r.mE.toFixed(2) + ' / ' + r.mRd.toFixed(2), 'kNm/m');
      R(T_('4 Ergebnisse Pos. {no}', { no: 15 }), T_('Gleiten'), T_('Masse W / F / Reibung'), eqv.W.toFixed(0) + ' / ' + eqv.F.toFixed(0) + ' / ' + eqv.Rf.toFixed(0), 'kN', T_('W = G + ψ₂·Q + 0,8·E; Reibung (G − U)·tan φ′/{f}', { f: dT(NP.geo.sl[0]) }));
    }
    const bg = st.bearing;
    R(T_('4 Ergebnisse Gründung'), T_('Sohlpressung'), bg.asd ? T_('σ / qa (Gebrauchslasten, {ref})', { ref: bg.ref }) : T_('σEd / σRd (Tabellenwert)'), bg.sigEd.toFixed(1) + ' / ' + bg.sigRd.toFixed(0), 'kN/m²');
    if (vf.gb) R(T_('4 Ergebnisse Gründung'), T_('Grundbruch {ref}', { ref: RF.gb }), 'Vd / Rn,d', vf.gb.Vd.toFixed(0) + ' / ' + vf.gb.Rnd.toFixed(0), 'kN', T_('Ersatzrechteck {a} × {b} m, d = {d} m', { a: vf.gb.a.toFixed(2), b: vf.gb.b.toFixed(2), d: vf.gb.d.toFixed(2) }));
    if (vf.set) R(T_('4 Ergebnisse Gründung'), T_('Setzung {ref}', { ref: RF.set }), T_('s (kennzeichnender Punkt) / Mitte / Ecke'), (vf.set.s * 1000).toFixed(1) + ' / ' + (vf.set.sCenter * 1000).toFixed(1) + ' / ' + (vf.set.sCorner * 1000).toFixed(1), 'mm');
    if (st.buoyancy.relevant) R(T_('4 Ergebnisse Gründung'), T_('Auftrieb'), T_('{d} U / {s} G', { d: dT(NP.upl.dst), s: dT(NP.upl.stb) }), st.buoyancy.final.eta, '', 'U = ' + st.buoyancy.final.U.toFixed(0) + ' kN, G = ' + st.buoyancy.final.G.toFixed(0) + ' kN');
    return out;
  }

  /* DXF (R12, ASCII, Meter): Systemlinien je Ebene auf eigenen Layern. Wandachsen als Linien, Stützen und Einbauten als
   * Rechtecke, Texte mit Bezeichnung und Dicke. Liest jedes CAD- und FE-Programm (Systemlinien für das eigene Modell). */
  function dxf(q) {
    const g = q.geo, st = q.struct, o = [];
    const layers = new Set();
    const n = (v) => (Math.round(v * 1e4) / 1e4).toString();
    const line = (ly, a, b2) => { layers.add(ly); o.push('0', 'LINE', '8', ly, '10', n(a.x), '20', n(a.y), '30', '0', '11', n(b2.x), '21', n(b2.y), '31', '0'); };
    const poly = (ly, pts) => pts.forEach((pt, i) => line(ly, pt, pts[(i + 1) % pts.length]));
    const text = (ly, at, s, hgt) => { layers.add(ly); o.push('0', 'TEXT', '8', ly, '10', n(at.x), '20', n(at.y), '30', '0', '40', n(hgt || 0.15), '1', String(s).replace(/[^\x20-\x7e]/g, (c) => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss', '×': 'x', '–': '-' }[c] || '?'))); };
    const rect = (ly, x0, y0, x1, y1) => poly(ly, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]);
    poly('AUSSENKANTE', g.out);
    if (g.valid) poly('INNENKANTE', g.inner);
    const axis = BP.geo.offsetPolygon(g.out, -q.p.build.tWall / 2);
    poly('AUSSENWAND_ACHSE', axis);
    text('TEXT', axis[0], T_('Außenwand t = {tw} m, Decke {tr} m, Bodenplatte {tf} m', { tw: q.p.build.tWall, tr: q.p.build.tRoof, tf: q.p.build.tFloor }), 0.2);
    for (const Lg of g.L) {
      const E = 'E' + (Lg.idx + 1) + '_';
      for (const w of Lg.walls) for (const sg of w.segs) {
        const ly = E + (w.info.bearing ? 'WAND_TRAGEND' : 'WAND_NICHTTRAGEND');
        line(ly, sg.a, sg.b);
        text(E + 'TEXT', BP.geo.lerp(sg.a, sg.b, 0.5), (g.labels['w:' + w.id] || T_('Wand')) + ' t=' + w.t, 0.12);
      }
      for (const c of Lg.columns) { rect(E + 'STUETZE', c.x - c.bx / 2, c.y - c.by / 2, c.x + c.bx / 2, c.y + c.by / 2); text(E + 'TEXT', { x: c.x + c.bx / 2 + 0.05, y: c.y }, (g.labels['c:' + c.id] || T_('Stütze')) + ' ' + c.bx + 'x' + c.by, 0.12); }
      for (const u of Lg.beams) for (const sg of u.segs) { line(E + 'UNTERZUG', sg.a, sg.b); text(E + 'TEXT', BP.geo.lerp(sg.a, sg.b, 0.5), (g.labels['b:' + u.id] || T_('Unterzug')) + ' ' + u.bw + 'x' + u.hb, 0.12); }
      for (const h of Lg.holesBelow || []) poly(E + 'AUSSPARUNG', h);
      for (const e of (q.tech.equip || []).filter((x) => x.level === Lg.idx)) { rect(E + 'EINBAU', e.rect.x0, e.rect.y0, e.rect.x1, e.rect.y1); text(E + 'TEXT', { x: e.rect.x0, y: e.rect.y1 + 0.05 }, e.name.split(' ')[0] + ' ' + (e.gk + e.ek).toFixed(1) + ' kN/m2', 0.1); }
    }
    for (const v of g.vert.lifts) poly('AUFZUG_SCHACHT', v.innerPoly);
    const head = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(layers.size)];
    let ci = 1;
    for (const ly of layers) head.push('0', 'LAYER', '2', ly, '70', '0', '62', String((ci++ % 7) + 1), '6', 'CONTINUOUS');
    head.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
    return head.concat(o, ['0', 'ENDSEC', '0', 'EOF']).join('\r\n') + '\r\n';
  }

  BP.vergleich = { rows, dxf };
})(typeof window !== 'undefined' ? window : globalThis);
