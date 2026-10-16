/* Weitere Nachweise der Vorbemessung:
 *  – Grundbruch nach DIN 4017 und Setzung nach DIN 4019 (Steinbrenner, Kennpunkt, Grenztiefe 20 % der Überlagerung)
 *  – Böschungen von Erdhügel und Baugrube nach DIN 4084 (Gleitkreise, Bishop, Teilsicherheiten DIN 1054 BS-P)
 *  – Feuerwiderstand nach DIN EN 1992-1-2 (Tabellenverfahren 5.2 bis 5.7: Mindestmaße und Achsabstände)
 *  – Treppenlaufplatten (Einfeldplatte, Biegung, Querkraft ohne Bügel, Biegeschlankheit EC2 7.4.2 mit NA DE)
 *  – Aufzugsgruben (Wände gegen Erd- und Wasserdruck, Sohle gegen Auftrieb, Pufferlasten)
 *  – Betonierabschnitte und Arbeitsfugen (WU-Richtlinie)
 * Alle Werte sind Vorbemessung und vom Tragwerksplaner bzw. Baugrundgutachter zu prüfen. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const max = Math.max, min = Math.min, PI = Math.PI, ceil = Math.ceil;
  const rad = (d) => d * PI / 180;
  const GAMMA_W = 10;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const T_ = BP.i18n.T, I18 = BP.i18n;

  /* ---------- Grundbruch DIN 4017 ---------- */
  function bearingFactors(phi) {
    const t = Math.tan(rad(phi));
    const Nd = Math.pow(Math.tan(rad(45 + phi / 2)), 2) * Math.exp(PI * t);
    return { Nd, Nb: (Nd - 1) * t, Nc: t > 1e-6 ? (Nd - 1) / t : PI + 2 };
  }
  /* o: { a, b: Abmessungen der (Ersatz-)Rechteckfläche, d: Einbindetiefe, gamma1: Wichte über, gamma2: unter der Sohle,
   *      phi, c: charakteristisch; Vd: Bemessungswert der lotrechten Last; gammaRv: Teilsicherheit (BS-P 1,4) } */
  function grundbruch(o) {
    const b = min(o.a, o.b), a = max(o.a, o.b), F = bearingFactors(o.phi), sn = Math.sin(rad(o.phi));
    const nd = 1 + b / a * sn, nb = 1 - 0.3 * b / a, nc = o.phi > 0.1 ? (nd * F.Nd - 1) / (F.Nd - 1) : 1 + 0.2 * b / a;
    const tB = o.gamma2 * b * F.Nb * nb, tD = o.gamma1 * o.d * F.Nd * nd, tC = o.c * F.Nc * nc;
    const Rnk = a * b * (tB + tD + tC), Rnd = Rnk / (o.gammaRv || 1.4);
    return { a, b, d: o.d, phi: o.phi, c: o.c, gamma1: o.gamma1, gamma2: o.gamma2, Nd: F.Nd, Nb: F.Nb, Nc: F.Nc, nd, nb, nc, tB, tD, tC, Rnk, Rnd, Vd: o.Vd, eta: o.Vd / Rnd, sigRd: Rnd / (a * b), sigEd: o.Vd / (a * b) };
  }

  /* ---------- Setzung DIN 4019 ---------- */
  function cornerI(a, b, z) {
    if (a <= 1e-9 || b <= 1e-9) return 0;
    if (z < 1e-9) return 0.25;
    const R = Math.sqrt(a * a + b * b + z * z);
    return (Math.atan(a * b / (z * R)) + a * b * z / R * (1 / (a * a + z * z) + 1 / (b * b + z * z))) / (2 * PI);
  }
  /* Einflusswert unter einem Punkt (x, y) innerhalb der Rechteckfläche A × B (Mittelpunkt im Ursprung) */
  function influence(A, B, x, y, z) {
    let s = 0;
    for (const u of [A / 2 + x, A / 2 - x]) for (const v of [B / 2 + y, B / 2 - y]) s += cornerI(u, v, z);
    return s;
  }
  /* o: { A, B, D: Gründungstiefe unter Gelände, sigma: wirksame Sohlspannung (quasi-ständig), gamma, gammaB: Wichte unter Auftrieb,
   *      dw: Wasserstand unter Gelände (Infinity ohne Wasser), Es: Steifemodul MN/m² }
   * Wiederbelastung bis zur Aushubentlastung mit 3 Es, darüber mit Es; Grenztiefe, wo die setzungserzeugende Spannung 20 % der Überlagerung erreicht. */
  function settlement(o) {
    const sigOver = (zd) => (zd <= o.dw ? o.gamma * zd : o.gamma * max(0, o.dw) + o.gammaB * (zd - max(0, o.dw)));
    const sig0 = sigOver(o.D), reload = max(0, min(o.sigma, sig0)), add = max(0, o.sigma - sig0);
    const Es = max(1, o.Es) * 1000;
    // zusätzliche Flächenlasten an der Geländeoberfläche (z. B. Erdhügel neben dem Bauwerk), Rechtecke um den Mittelpunkt, Erstbelastung
    const ext = o.extra || [];
    const sigExt = (x, y, z) => ext.reduce((s2, e) => s2 + e.p * influence(e.A, e.B, x, y, z + o.D), 0);
    const zMax = min(80, 3 * max(o.A, o.B, ...ext.map((e) => max(e.A, e.B)))), dz = max(0.05, min(0.25, min(o.A, o.B) / 60));
    // Grenztiefe mit der vollen Sohlspannung (sichere Seite, auch bei überwiegender Wiederbelastung)
    let ts = 0;
    for (let z = dz / 2; z < zMax; z += dz) { if (o.sigma * influence(o.A, o.B, 0, 0, z) + max(0, sigExt(0, 0, z)) <= 0.2 * sigOver(o.D + z)) break; ts = z + dz / 2; }
    const at = (x, y) => { let s = 0, se = 0; for (let z = dz / 2; z < ts; z += dz) { s += influence(o.A, o.B, x, y, z) * dz; se += max(0, sigExt(x, y, z)) * dz; } return s * (add / Es + reload / (3 * Es)) + se / Es; };
    const sK = at(0.37 * o.A, 0.37 * o.B), sM = at(0, 0), sE = at(0.5 * o.A - 1e-6, 0.5 * o.B - 1e-6);
    const diag = Math.hypot(o.A, o.B) / 2;
    return { s: sK, sCenter: sM, sCorner: sE, ts, sigma: o.sigma, sig0, add, reload, Es: o.Es, tilt: (sM - sE) / max(diag, 1e-6), extra: ext.length > 0 };
  }

  /* ---------- Böschungen: Gleitkreise nach Bishop ---------- */
  /* o: { ground: [[x, y], …] von links nach rechts, Böschung steigt nach rechts (Rutschung nach links),
   *      upper, lower: Boden {gamma, phi, c} über bzw. unter yL; yL: Schichtgrenze,
   *      loads: [{ x0, x1, q }] veränderliche Flächenlasten, block: { x0, y1 } undurchdringlich (Bauwerk), toe, crest: {x, y} }
   * Bemessung nach DIN 4084 / DIN 1054 BS-P: tan φd = tan φk / 1,25, c′d = c′k / 1,25, Eigengewicht 1,0, veränderliche Lasten 1,3.
   * Ergebnis: kleinster Ausnutzungsgrad μ = 1 / F mit F aus Bemessungswerten (F ≥ 1 erfüllt). */
  function slope(o) {
    const g = o.ground, yL = fin(o.yL) ? o.yL : -1e9;
    const yAt = (x) => {
      if (x <= g[0][0]) return g[0][1];
      for (let i = 1; i < g.length; i++) if (x <= g[i][0]) { const [x0, y0] = g[i - 1], [x1, y1] = g[i]; return x1 - x0 < 1e-12 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
      return g[g.length - 1][1];
    };
    const colW = (yb, yg) => o.upper.gamma * max(0, yg - max(yb, yL)) + o.lower.gamma * max(0, min(yg, yL) - yb);
    const qAt = (x) => (o.loads || []).reduce((s, l) => s + (x >= l.x0 && x <= l.x1 ? l.q : 0), 0);
    // Teilsicherheiten nach Norm (o.gPhi, o.gc auf tan φ und c, o.gQ auf veränderliche Lasten); Standard DIN 1054 BS-P
    const gPhi = o.gPhi || 1.25, gCoh = o.gc || 1.25, gQ = o.gQ || 1.3;
    const des = (s) => ({ t: Math.tan(rad(s.phi)) / gPhi, c: (s.c || 0) / gCoh });
    const dU = des(o.upper), dL = des(o.lower);
    const H = max(0.5, o.crest.y - o.toe.y), Lh = max(0.5, o.crest.x - o.toe.x);
    function bishop(xc, yc, r) {
      // gleitende Masse: zusammenhängender Bereich, in dem der Kreis unter dem Gelände liegt (Abtastung)
      const n0 = 160, x0 = xc - r, step = 2 * r / n0;
      let best = null, cur = null;
      for (let i = 0; i <= n0; i++) {
        const x = x0 + i * step, dx = x - xc, yb = yc - Math.sqrt(max(0, r * r - dx * dx));
        if (yb < yAt(x) - 1e-6) { if (!cur) cur = [x, x]; cur[1] = x; } else if (cur) { if (!best || cur[1] - cur[0] > best[1] - best[0]) best = cur; cur = null; }
      }
      if (cur && (!best || cur[1] - cur[0] > best[1] - best[0])) best = cur;
      if (!best) return null;
      const xa = max(xc - r, best[0] - step), xb = min(xc + r, best[1] + step);
      if (xb - xa < 0.2 || xb < o.toe.x - 0.05 || xa > o.crest.x + 0.05) return null;
      const n = 40, bw = (xb - xa) / n, sl = [];
      let Dsum = 0, hMax = 0;
      for (let i = 0; i < n; i++) {
        const x = xa + (i + 0.5) * bw, dx = x - xc;
        if (Math.abs(dx) >= r) continue;
        const yb = yc - Math.sqrt(r * r - dx * dx), yg = yAt(x), h = yg - yb;
        if (h <= 0) continue;
        if (o.block && x >= o.block.x0 - 1e-9 && yb < o.block.y1) return null;
        const W = colW(yb, yg) * bw + gQ * qAt(x) * bw, sa = dx / r, ca = Math.sqrt(1 - sa * sa), d = yb >= yL ? dU : dL;
        sl.push({ W, sa, ca, d });
        Dsum += W * sa; hMax = max(hMax, h);
      }
      if (Dsum <= 1e-6 || hMax < 0.15) return null;
      let F = 1.5;
      for (let it = 0; it < 40; it++) {
        let R = 0;
        for (const s of sl) R += (s.d.c * bw + s.W * s.d.t) / max(0.2, s.ca + s.sa * s.d.t / F);
        const Fn = R / Dsum;
        if (Math.abs(Fn - F) < 1e-4) { F = Fn; break; }
        F = Fn;
      }
      return { F, xc, yc, r, xa, xb, hMax };
    }
    let best = null;
    const tryC = (xc, yc) => {
      const radii = [Math.hypot(xc - o.toe.x, yc - o.toe.y)];
      for (const f of [1 / 3, 2 / 3]) { const x = o.toe.x + f * Lh; radii.push(Math.hypot(xc - x, yc - yAt(x))); }
      for (const k of [0.15, 0.35, 0.6, 1.0]) radii.push(yc - (o.toe.y - k * H));
      for (const r of radii) { if (!(r > 0.3)) continue; const c = bishop(xc, yc, r); if (c && (!best || c.F < best.F)) best = c; }
    };
    const xs0 = o.toe.x - 0.6 * Lh - 0.5 * H, xs1 = o.crest.x + 0.6 * H, ys0 = o.toe.y + 0.3 * H, ys1 = o.toe.y + 2.5 * H + 0.5 * Lh;
    const N = 12;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) tryC(xs0 + (xs1 - xs0) * i / N, ys0 + (ys1 - ys0) * j / N);
    if (best) {
      const sx = (xs1 - xs0) / N, sy = (ys1 - ys0) / N, b0 = best;
      for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
        const xc = b0.xc + i * sx / 4, yc = b0.yc + j * sy / 4;
        tryC(xc, yc);
        for (const f of [0.9, 0.95, 1.05, 1.1]) { const c = bishop(xc, yc, b0.r * f); if (c && c.F < best.F) best = c; }
      }
    }
    // nichtbindige Schüttung: flache Gleitflächen parallel zur Böschung (unendliche Böschung) maßgebend, F = tan φd / tan β
    if (best && !(o.upper.c > 0) && o.crest.x > o.toe.x) {
      const Finf = dU.t / ((o.crest.y - o.toe.y) / (o.crest.x - o.toe.x));
      if (Finf < best.F) { best.F = Finf; best.shallow = true; }
    }
    const geom = { ground: g, block: o.block || null, yL: fin(o.yL) ? o.yL : null, loads: o.loads || [], toe: o.toe, crest: o.crest };
    return best ? Object.assign(best, { mu: 1 / best.F, ok: best.F >= 1 - 1e-9, H, L: Lh, geom }) : { F: Infinity, mu: 0, ok: true, H, L: Lh, none: true, geom };
  }

  /* ---------- Feuerwiderstand DIN EN 1992-1-2, Tabellenverfahren ---------- */
  const FIRE = {
    // Stützen, Tab. 5.2a (Methode A, mehrseitig beansprucht): je μfi Paare [b_min, a] in mm
    col: {
      R30: { 0.2: [[200, 25]], 0.5: [[200, 25]], 0.7: [[200, 32], [300, 27]] },
      R60: { 0.2: [[200, 25]], 0.5: [[200, 36], [300, 31]], 0.7: [[250, 46], [350, 40]] },
      // dritter Wert 8: Eintrag nur mit mindestens 8 Längsstäben (Fußnote der Tabelle)
      R90: { 0.2: [[200, 31], [300, 25]], 0.5: [[300, 45], [400, 38, 8]], 0.7: [[350, 53], [450, 40, 8]] },
      R120: { 0.2: [[250, 40], [350, 35]], 0.5: [[350, 45, 8], [450, 40, 8]], 0.7: [[350, 57, 8], [450, 51, 8]] },
    },
    // tragende Wände, Tab. 5.4 (μfi = 0,7): [Dicke, a] einseitig / zweiseitig beansprucht
    wall: { R30: [[120, 10], [120, 10]], R60: [[130, 10], [140, 10]], R90: [[140, 25], [170, 25]], R120: [[160, 35], [220, 35]] },
    // Balken Tab. 5.5 (statisch bestimmt) und Tab. 5.6 (Durchlaufträger): Paare [b_min, a]
    beam: { R30: [[80, 25], [120, 20], [160, 15], [200, 15]], R60: [[120, 40], [160, 35], [200, 30], [300, 25]], R90: [[150, 55], [200, 45], [300, 40], [400, 35]], R120: [[200, 65], [240, 60], [300, 55], [500, 50]] },
    beamCont: { R30: [[80, 15], [160, 12]], R60: [[120, 25], [200, 12]], R90: [[150, 35], [250, 25]], R120: [[200, 45], [300, 35], [450, 35], [500, 30]] },
    // Platten Tab. 5.8 (einachsig gespannt, sichere Seite) und Flachdecken Tab. 5.9: [h_min, a]
    slab: { R30: [60, 10], R60: [80, 20], R90: [100, 30], R120: [120, 40] },
    flat: { R30: [150, 10], R60: [180, 15], R90: [200, 25], R120: [200, 35] },
  };
  /* erforderlicher Achsabstand für Breite b aus Paaren [b_min, a] (lineare Zwischenwerte nach 5.2(5)); null: b zu klein */
  function aFor(pairs0, b, nb) {
    const pairs = nb != null ? pairs0.filter((p) => !(p[2] && nb < p[2])) : pairs0;
    if (!pairs.length || b < pairs[0][0] - 1e-9) return null;
    for (let i = pairs.length - 1; i >= 0; i--) {
      if (b >= pairs[i][0] - 1e-9) {
        if (i === pairs.length - 1) return pairs[i][1];
        const [b0, a0] = pairs[i], [b1, a1] = pairs[i + 1];
        return a0 + (a1 - a0) * (b - b0) / (b1 - b0);
      }
    }
    return null;
  }
  function colReq(cls, mu, b, nb) {
    const T = FIRE.col[cls], rows = [0.2, 0.5, 0.7], m = min(0.7, max(0.2, mu)), i = m <= 0.5 ? 0 : 1;
    const r0 = rows[i], r1 = rows[i + 1], a0 = aFor(T[r0], b, nb), a1 = aFor(T[r1], b, nb), w = (m - r0) / (r1 - r0);
    if (w < 1e-9) return { a: a0, bMin: T[r0][0][0] };
    if (a0 == null || a1 == null) return { a: null, bMin: T[r1][0][0] };
    return { a: a0 + (a1 - a0) * w, bMin: T[r1][0][0] };
  }
  /* q: Ergebnis von calc.run; cls: 'R30' … 'R120'. Liefert Liste je Bauteil mit erforderlichen und vorhandenen Werten (mm). */
  /* ACI/TMS 216.1-14 (USA): Feuerwiderstandsdauer in Stunden statt R-Klasse (R30 und R60 → 1 h, R90 → 1,5 h, R120 → 2 h).
   * Platten und Wände: äquivalente Mindestdicke Tab. 4.2 (kieseliger Zuschlag, sichere Seite); Betondeckung der Platten Tab. 4.3.1.1
   * (nicht behinderte Verformung, sichere Seite), Balken Tab. 4.3.1.2 (nicht behindert, je Stegbreite), Stützen 4.5.1 (Mindestmaß)
   * und 4.5.3 (Deckung der Längsstäbe 25 mm je Stunde, höchstens 50 mm). Verglichen wird die Betondeckung c, nicht der Achsabstand. */
  const ACI216 = {
    hours: { R30: 1, R60: 1, R90: 1.5, R120: 2 },
    slabT: { 1: 89, 1.5: 109, 2: 127, 3: 157 }, slabC: { 1: 19, 1.5: 19, 2: 25, 3: 32 },
    colB: { 1: 203, 1.5: 229, 2: 254, 3: 305 },
    // Balken nicht behindert: [Stegbreite mm, Deckung je Stunde]; null = nicht zulässig
    beam: [[127, { 1: 19, 1.5: 25, 2: 32, 3: null }], [178, { 1: 19, 1.5: 19, 2: 25, 3: 44 }], [254, { 1: 19, 1.5: 19, 2: 19, 3: 25 }]],
  };
  function fireACI(q, cls) {
    const hrs = ACI216.hours[cls];
    if (!hrs) return { cls, items: [] };
    const st = q.struct, b = q.p.build, g = q.geo, cn = b.cnom * 1000, items = [], hTxt = I18.dec(String(hrs)) + ' h';
    const push = (it) => { it.ok = it.dimOk !== false && it.aOk !== false; items.push(it); };
    const tMin = ACI216.slabT[hrs], cSlab = ACI216.slabC[hrs];
    const slabs = [];
    if (st.roof) slabs.push({ el: T_('Decke'), h: b.tRoof });
    for (const m of st.mids || []) slabs.push({ el: m.name, h: g.L[m.level].tSlab });
    for (const s of slabs) push({ el: s.el, kind: T_('Platte {h} (Tab. 4.2, 4.3.1.1)', { h: hTxt }), dim: s.h * 1000, dimMin: tMin, dimOk: s.h * 1000 >= tMin - 1e-6, a: cn, aMin: cSlab, aOk: cn >= cSlab - 1e-6 });
    if (st.wall) push({ el: T_('Außenwände'), kind: T_('Wand {h} (Tab. 4.2)', { h: hTxt }), dim: b.tWall * 1000, dimMin: tMin, dimOk: b.tWall * 1000 >= tMin - 1e-6, a: cn, aMin: cSlab, aOk: cn >= cSlab - 1e-6 });
    const seenW = new Set();
    for (const iw of st.intWalls || []) {
      const key = iw.auto ? T_('Schachtwände {name}', { name: g.labels['v:' + iw.auto] || T_('Aufzug') }) : T_('Innenwände {t} cm', { t: (iw.t * 100).toFixed(0) });
      if (seenW.has(key)) continue;
      seenW.add(key);
      push({ el: key, kind: T_('Wand {h} (Tab. 4.2)', { h: hTxt }), dim: iw.t * 1000, dimMin: tMin, dimOk: iw.t * 1000 >= tMin - 1e-6, a: cn, aMin: cSlab, aOk: cn >= cSlab - 1e-6 });
    }
    const COL = q.mat.colCover || (BP.calc ? BP.calc.COL_COVER : 0.04);
    const bCol = ACI216.colB[hrs], cCol = min(25 * hrs, 50);
    for (const c of st.columns || []) {
      const d = c.design, bmm = min(c.bx, c.by) * 1000, cv = (COL + d.stirrup.phi / 1000) * 1000;
      push({ el: g.labels['c:' + c.id] || T_('Stütze'), kind: T_('Stütze {h} (4.5.1, 4.5.3)', { h: hTxt }), dim: bmm, dimMin: bCol, dimOk: bmm >= bCol - 1e-6, a: cv, aMin: cCol, aOk: cv >= cCol - 1e-6, colId: c.id,
        bFire: bmm < bCol - 1e-6 ? Math.ceil(bCol / 50) * 50 : null });
    }
    for (const bd of st.beams || []) {
      if (!bd.field) continue;
      const bmm = bd.bw * 1000, row = ACI216.beam.filter((r) => bmm >= r[0] - 1e-6).pop(), cReq = row ? row[1][hrs] : null;
      const cv = COL * 1000 + ((bd.shear && bd.shear.stirrups && bd.shear.stirrups.phi) || 10);
      push({ el: g.labels['b:' + bd.id] || T_('Unterzug'), kind: T_('Balken {h} (Tab. 4.3.1.2)', { h: hTxt }), dim: bmm, dimMin: ACI216.beam[0][0], dimOk: cReq != null, a: cv, aMin: cReq, aOk: cReq != null && cv >= cReq - 1e-6, beamId: bd.id });
    }
    for (const s of q.geo.vert.stairs || []) {
      const d = s.design;
      if (!d || !d.t) continue;
      const cv = (d.cnom || 0.025) * 1000;
      push({ el: q.geo.labels['v:' + s.id] || T_('Innentreppe'), kind: T_('Laufplatte {h} (Tab. 4.2, 4.3.1.1)', { h: hTxt }), dim: d.t * 1000, dimMin: tMin, dimOk: d.t * 1000 >= tMin - 1e-6, a: cv, aMin: cSlab, aOk: cv >= cSlab - 1e-6, stairId: s.id });
    }
    return { cls, hours: hrs, cover: true, items, ok: items.every((i) => i.ok) };
  }

  function fire(q, cls) {
    if (BP.normen && BP.normen.profile(q.p).fire === 'ACI216') return fireACI(q, cls);
    if (!FIRE.slab[cls]) return { cls, items: [] };
    const st = q.struct, b = q.p.build, g = q.geo, cn = b.cnom * 1000, items = [];
    const push = (it) => { it.ok = it.dimOk !== false && it.aOk !== false; items.push(it); };
    const outerPhi = (pl, face) => { const ls = (pl.layers || []).filter((l) => l.face === face).sort((a, c) => c.d - a.d); return ls.length ? ls[0].phi : 10; };
    // Decke (von unten), Zwischendecken (von unten): Flachdecke, wenn Stützen die Platte tragen
    const slabs = [];
    if (st.roof) slabs.push({ el: T_('Decke'), pl: st.roof, h: b.tRoof, flat: (g.L[0].columns || []).length > 0 });
    for (const m of st.mids || []) slabs.push({ el: m.name, pl: m, h: g.L[m.level].tSlab, flat: (g.L[m.level].columns || []).length > 0 });
    for (const s of slabs) {
      const [hMin, aMin] = (s.flat ? FIRE.flat : FIRE.slab)[cls], a = cn + outerPhi(s.pl, 'unten') / 2;
      push({ el: s.el, kind: s.flat ? T_('Flachdecke (Tab. 5.9)') : T_('Platte (Tab. 5.8, einachsig, sichere Seite)'), dim: s.h * 1000, dimMin: hMin, dimOk: s.h * 1000 >= hMin - 1e-6, a, aMin, aOk: a >= aMin - 1e-6 });
    }
    // Außenwände einseitig, Innenwände und Schachtwände zweiseitig beansprucht
    if (st.wall) {
      // Außenwand: Wand nach Tab. 5.4; die brandseitige Innenseite ist unter Erddruck Biegezugseite → Achsabstand mindestens wie Platte (Tab. 5.8)
      const [tMin, aW] = FIRE.wall[cls][0], aMin = max(aW, FIRE.slab[cls][1]), phi = st.wall.layers && st.wall.layers[0] ? st.wall.layers[0].phi : 12;
      const a = cn + phi / 2;
      push({ el: T_('Außenwände'), kind: T_('tragende Wand, einseitig (Tab. 5.4, μfi = 0,7; a wie Platte Tab. 5.8)'), dim: b.tWall * 1000, dimMin: tMin, dimOk: b.tWall * 1000 >= tMin - 1e-6, a, aMin, aOk: a >= aMin - 1e-6 });
    }
    const seenW = new Set();
    for (const iw of st.intWalls || []) {
      const key = iw.auto ? T_('Schachtwände {name}', { name: g.labels['v:' + iw.auto] || T_('Aufzug') }) : T_('Innenwände {t} cm', { t: (iw.t * 100).toFixed(0) });
      if (seenW.has(key)) continue;
      seenW.add(key);
      const [tMin, aMin] = FIRE.wall[cls][1], a = cn + (iw.layer ? iw.layer.phi : 10) / 2;
      push({ el: key, kind: T_('tragende Wand, zweiseitig (Tab. 5.4, μfi = 0,7)'), dim: iw.t * 1000, dimMin: tMin, dimOk: iw.t * 1000 >= tMin - 1e-6, a, aMin, aOk: a >= aMin - 1e-6 });
    }
    // Stützen: μfi ≈ 0,7 · Ausnutzung bei Normaltemperatur (ηfi ≈ 0,7), Methode A gilt bis l0,fi ≤ 3 m
    const COL = q.mat.colCover || (BP.calc ? BP.calc.COL_COVER : 0.03);
    for (const c of st.columns || []) {
      // μfi = 0,7 auf der sicheren Seite (DIN EN 1992-1-2, 5.3.2(3) Anm. 2): NRd mit Ausmitte und Theorie II. Ordnung ist kleiner als die Quetschlast
      const d = c.design, bmm = min(c.bx, c.by) * 1000, mu = 0.7, e1 = max(...d.dirs.map((x) => x.e0 + x.ei));
      const r = colReq(cls, mu, bmm, d.nb), a = (COL + d.stirrup.phi / 1000) * 1000 + d.phi / 2;
      // Methode A: l0,fi ≤ 3 m (oberstes Geschoss 0,7 l, sonst 0,5 l bei ausgesteiftem Bauwerk), e ≤ 0,15 b, As ≤ 4 % Ac
      const l0fi = (c.level === 0 ? 0.7 : 0.5) * c.H, methodA = l0fi <= 3 + 1e-9 && e1 <= 0.15 * min(c.bx, c.by) + 1e-9 && d.As * 1e-4 <= 0.04 * c.bx * c.by + 1e-12;
      // kleinste quadratische Stütze mit gleicher Bewehrung, die die Tabelle erfüllt
      let bFire = null;
      for (let bb = Math.ceil(bmm / 50) * 50; bb <= 1500; bb += 50) {
        const r2 = colReq(cls, mu, bb, d.nb);
        if (r2.a != null && a >= r2.a - 1e-6) { bFire = bb; break; }
      }
      push({ el: g.labels['c:' + c.id] || T_('Stütze'), kind: T_('Stütze (Tab. 5.2a, μfi = {mu})', { mu: I18.dec(mu.toFixed(2)) }), dim: bmm, dimMin: r.bMin, dimOk: r.a != null, a, aMin: r.a, aOk: r.a != null && a >= r.a - 1e-6, colId: c.id,
        mu, l0fi, methodA, bFire });
    }
    // Unterzüge
    for (const bd of st.beams || []) {
      if (!bd.field) continue;
      const cont = (bd.sups || []).length > 2, T = (cont ? FIRE.beamCont : FIRE.beam)[cls], bmm = bd.bw * 1000;
      // Eckstäbe einlagiger Bewehrung + 10 mm bis zur Breite der Spalte 4 (Tab. 5.5) bzw. Spalte 3 (Tab. 5.6)
      const aReq = aFor(T, bmm), wide = (cont ? T[1] : T[min(2, T.length - 1)])[0];
      const a = (COL + ((bd.shear && bd.shear.stirrups && bd.shear.stirrups.phi) || 8) / 1000) * 1000 + bd.field.phi / 2;
      const aSd = aReq != null && bmm < wide - 1e-6 ? aReq + 10 : aReq; // Eckstäbe einlagiger Bewehrung + 10 mm
      push({ el: g.labels['b:' + bd.id] || T_('Unterzug'), kind: cont ? T_('Durchlaufträger (Tab. 5.6)') : T_('Einfeldträger (Tab. 5.5)'), dim: bmm, dimMin: T[0][0], dimOk: aReq != null, a, aMin: aSd, aOk: aSd != null && a >= aSd - 1e-6, beamId: bd.id });
    }
    // Treppenlaufplatten (Rettungsweg): einachsig gespannte Platte nach Tab. 5.8
    for (const s of q.geo.vert.stairs || []) {
      const d = s.design;
      if (!d || !d.t) continue;
      const [hMin, aMin] = FIRE.slab[cls], a = (d.cnom || 0.025) * 1000 + d.phi / 2;
      push({ el: q.geo.labels['v:' + s.id] || T_('Innentreppe'), kind: T_('Laufplatte (Tab. 5.8, einachsig)'), dim: d.t * 1000, dimMin: hMin, dimOk: d.t * 1000 >= hMin - 1e-6, a, aMin, aOk: a >= aMin - 1e-6, stairId: s.id });
    }
    return { cls, items, ok: items.every((i) => i.ok) };
  }

  /* ---------- Treppenlaufplatte ---------- */
  /* o: { span (Grundrissstützweite), rise, tread, q (Nutzlast), fck, fctm, cnom, gAdd (Belag) } – Einfeldplatte, je m Breite */
  function stair(o) {
    // Norm des Projekts (aktives Profil, sonst Deutschland): Baustoffe, Teilsicherheiten, Mindestbewehrung, Querkraft, Schlankheit
    const N = BP.normen.active(), mat = N.material({ fck: o.fck, fctm: o.fctm }, {});
    const fcd = mat.fcd, fyd = mat.fyd, alpha = Math.atan(o.rise / o.tread), l = o.span;
    const LS = N.lf.sets;
    const bars = [], area = (phi) => (N.barArea ? N.barArea(phi) : PI * phi * phi / 400);
    for (const phi of N.stairPhi || [10, 12, 14, 16]) for (const s of [0.2, 0.15, 0.125, 0.1]) bars.push({ phi, s, as: area(phi) / s });
    bars.sort((a, c) => a.as - c.as);
    let last = null;
    for (let t = 0.16; t <= 0.40 + 1e-9; t = Math.round((t + 0.01) * 100) / 100) {
      const gk = 25 * t / Math.cos(alpha) + 25 * o.rise / 2 + (o.gAdd != null ? o.gAdd : 1.0), qk = o.q;
      const pEd = max(...LS.map((S) => S.G * gk + S.Q * qk)), mEd = pEd * l * l / 8, vEd = pEd * l / 2;
      const d = t - o.cnom - 0.008, mu = mEd / (d * d * fcd * 1000);
      if (mu > 0.25) { last = { t, mu, ok: false, why: 'Biegung' }; continue; }
      const omega = 1 - Math.sqrt(1 - 2 * mu), asReq = omega * d * fcd / fyd * 1e4;
      const asMin = N.asMin(t, d, mat);
      const bar = bars.find((x) => x.as >= max(asReq, asMin) - 1e-9);
      if (!bar) { last = { t, mu, ok: false, why: 'Bewehrung' }; continue; }
      const rho = bar.as / (d * 1e4), rho0 = Math.sqrt(o.fck) * 1e-3, sf = Math.sqrt(o.fck);
      let ld = rho <= rho0 ? 11 + 1.5 * sf * rho0 / rho + 3.2 * sf * Math.pow(rho0 / rho - 1, 1.5) : 11 + 1.5 * sf * rho0 / rho;
      ld *= min(1.5, bar.as / max(asReq, 1e-9)); // 310/σs ≈ As,prov/As,req
      const ldLim = N.ldCap(ld, l, 1);
      const vRd = N.vRdc(rho, d, mat);
      const ok = l / d <= ldLim + 1e-9 && vEd <= vRd + 1e-9;
      // Querbewehrung mindestens 20 % der Hauptbewehrung (EC2 9.3.1.1(2)); ACI 24.4.3.2: Schwindbewehrung 0,0018 Ag
      const aDist = N.code === 'ACI' ? max(0.2 * bar.as, asMin) : 0.2 * bar.as, dPh = N.linkPhi && N.us ? [10, 13] : [8, 10, 12];
      const distr = [[dPh[0], 0.25], [dPh[0], 0.2], [dPh[1], 0.25], [dPh[1], 0.2], [dPh[dPh.length - 1], 0.2], [dPh[dPh.length - 1], 0.15]].map(([ph, sd]) => ({ phi: ph, s: sd, as: area(ph) / sd })).find((x) => x.as >= aDist - 1e-9) || { phi: dPh[dPh.length - 1], s: 0.15, as: area(dPh[dPh.length - 1]) / 0.15 };
      last = { t, gk, qk, pEd, mEd, vEd, d, mu, asReq, asMin, phi: bar.phi, s: bar.s, asProv: bar.as, ld: l / d, ldLim, vRd, ok, alpha, span: l, cnom: o.cnom,
        distr, top: { phi: 10, s: 0.2, as: area(10) / 0.2 } };
      if (ok) return last;
    }
    return Object.assign(last || {}, { ok: false });
  }

  /* ---------- Aufzugsgrube ---------- */
  /* o: { wIn, dIn, pit, tF (Sohle), tw (Wand), soil, zTopPit (OK Grubensohle unter Gelände, positiv), dw (Wasser unter Gelände), fck, cnom, buffer, cwBuffer, sigRd } */
  function pit(o) {
    const N = BP.normen.active(), mat = N.material({ fck: o.fck, fctm: 2.9 }, {}), LS = N.lf.sets;
    const gH = max(...LS.map((S) => S.H)), gG = max(...LS.map((S) => S.G));
    const fcd = mat.fcd, fyd = mat.fyd, K0 = 1 - Math.sin(rad(o.soil.phi));
    const zb = o.zTopPit + o.tF; // Unterkante Grubensohle unter Gelände
    const sv = (z) => (z <= o.dw ? o.soil.gamma * z : o.soil.gamma * max(0, o.dw) + (o.soil.gammaSat - GAMMA_W) * (z - max(0, o.dw)));
    const pw = (z) => GAMMA_W * max(0, z - o.dw);
    const pBot = K0 * sv(o.zTopPit) + pw(o.zTopPit) + K0 * 10; // Erd- und Wasserdruck am Wandfuß, Auflast 10 kN/m²
    const hW = o.pit, lW = max(o.wIn, o.dIn), lShort = min(hW, lW);
    const mW = gH * pBot * lShort * lShort / 12, dW = o.tw - o.cnom - 0.01;
    const asW = mW / (dW * 0.9 * fyd * 1000) * 1e4; // cm²/m
    const u = GAMMA_W * max(0, zb - o.dw), gS = 25 * o.tF;
    const lx = min(o.wIn, o.dIn) + o.tw, ly = max(o.wIn, o.dIn) + o.tw;
    const pS = max(0, N.lf.U * u - N.upl.stb * gS), mS = pS * lx * lx / 8 * Math.pow(ly, 4) / (Math.pow(lx, 4) + Math.pow(ly, 4)), dS = o.tF - o.cnom - 0.01;
    const asS = mS / (dS * 0.9 * fyd * 1000) * 1e4;
    const uplift = u > 0 ? N.upl.dst * u / (N.upl.stb * gS) : 0; // örtlich, ohne Mitwirkung der Wände und des Bauwerks
    // Pufferlasten: Grubensohle auf dem Boden, Sohldruck unter der Grubensohle
    const sig = (gG * (o.buffer + o.cwBuffer) + gG * gS * (o.wIn * o.dIn)) / (o.wIn * o.dIn);
    const asOK = 7.54; // Ø12/15
    return { K0, pBot, mW, asW, dW, u, mS, asS, uplift, sig, sigRd: o.sigRd, okW: asW <= asOK + 1e-9 && mW / (dW * dW * fcd * 1000) <= 0.25, okS: asS <= asOK + 1e-9, okSig: sig <= o.sigRd + 1e-9 };
  }

  /* ---------- Betonierabschnitte und Arbeitsfugen ---------- */
  /* WU-Richtlinie: kurze Abschnitte bei Zwang über Fugen (Planungsgrundsatz b/c), längere bei rissbreitenbegrenzender Bewehrung.
   * Tagesleistung: Pumpe rund 30 m³/h, 8 h. */
  function pours(q) {
    const p = q.p, b = p.build, g = q.geo, lv = q.lv, v = q.vol, G = BP.geo;
    const restr = b.restraint === 'massnahmen';
    const LmaxSlab = restr ? 15 : 30, LmaxWall = restr ? 8 : 15, AmaxSlab = restr ? 200 : 500, Vday = 240;
    const bb = G.bbox(g.slab), Lx = bb.x1 - bb.x0, Ly = bb.y1 - bb.y0, Lmax = max(Lx, Ly), Lmin = min(Lx, Ly);
    const axis = G.perimeter(G.offsetPolygon(g.out, -b.tWall / 2));
    const sect = [];
    const slabSect = (el, A, V, L) => { const n = max(1, ceil(L / LmaxSlab - 1e-9), ceil(A / AmaxSlab - 1e-9), ceil(V / Vday - 1e-9)); sect.push({ el, n, V, A }); return n; };
    const nF = slabSect('Bodenplatte', g.Aslab, v.slab, Lmax);
    let jSlab = (nF - 1) * Lmin;
    const nR = slabSect('Decke', g.A, v.roof, Lmax);
    jSlab += (nR - 1) * Lmin;
    (g.mids || []).forEach((m, i) => { const n = slabSect('Zwischendecke über Ebene ' + (i + 2), g.A, m.V || 0, Lmax); jSlab += (n - 1) * Lmin; });
    let jVert = 0, jHor = 0;
    const innerStb = (Lg) => Lg.walls.filter((w) => w.info.bearing).reduce((s, w) => s + w.len, 0);
    lv.levels.forEach((L, i) => {
      const Lg = g.L[i], Vw = (v.outerWalls + v.intStb) * L.H / max(lv.Hint, 1e-6);
      const n = max(1, ceil(axis / LmaxWall - 1e-9), ceil(Vw / Vday - 1e-9));
      sect.push({ el: 'Wände' + (lv.levels.length > 1 ? ' Ebene ' + (i + 1) : ''), n, V: Vw, A: axis * L.H });
      jVert += (n > 1 ? n : 0) * L.H; // geschlossener Ring: n Fugen
      jHor += 2 * axis + 2 * innerStb(Lg); // Fuß- und Kopffuge je Ebene
    });
    const jAcc = g.access.reduce((s, a) => s + 2 * a.W, 0);
    const total = jSlab + jVert + jHor + jAcc;
    return { sect, LmaxSlab, LmaxWall, AmaxSlab, Vday, Lx, Ly, joints: { slab: jSlab, vert: jVert, hor: jHor, access: jAcc, total }, long: Lmax > 30 + 1e-9, Lmax };
  }

  /* Einmassenschwinger nach Biggs (Introduction to Structural Dynamics, 1964) bzw. UFC 3-340-02 Kap. 3: elastisch-ideal
   * plastischer Widerstand mit Ent- und Wiederbelastung, Last-Massen-Faktor KLM elastisch / plastisch, Druck-Zeit-Verlauf
   * dreieckig P0·(1 − t/td), td = ∞ ergibt den Rechteckstoß. Statische Last ps wirkt in Stoßrichtung und ist zu Beginn im
   * Gleichgewicht. Je m² Bauteilfläche: m in t/m², KE in kN/m²/m, Ru, P0, ps in kN/m², td in s.
   * Ergebnis: größte Verschiebung xm (erster Höchstwert), Duktilität μ = xm/xE, Eigenperiode T, Zeitpunkt tm, größter Widerstand. */
  function sdof(o) {
    const m = o.m, KE = o.KE, Ru = o.Ru, P0 = o.P0, td = o.td > 0 ? o.td : Infinity, ps = o.ps || 0;
    const KLMe = o.KLMe || 0.77, KLMp = o.KLMp || 0.66, xE = Ru / KE;
    const T = 2 * PI * Math.sqrt(KLMe * m / KE);
    if (ps >= Ru) return { collapse: true, xE, T, xm: Infinity, mu: Infinity, tm: 0, rMax: Ru };
    // ein KLM über den ganzen Verlauf (energietreu): elastisch KLMe, bei Fließen der Mittelwert aus elastisch und plastisch (UFC 3-340-02)
    const run = (klm) => {
      const Tk = 2 * PI * Math.sqrt(klm * m / KE), dt = min(Tk, isFinite(td) ? td : Tk) / 400, tEnd = (isFinite(td) ? td : 0) + 20 * Tk;
      let x = ps / KE, v = 0, xp = 0, t = 0, r = ps, xm = x, tm = 0, rMax = r, yielded = false, maxV = 0;
      const P = (tt) => (tt < td ? P0 * (1 - tt / td) : 0) + ps;
      while (t < tEnd) {
        const a = (P(t) - r) / (klm * m);
        v += a * dt; x += v * dt; t += dt;
        const rt = KE * (x - xp);
        if (rt > Ru) { xp = x - Ru / KE; r = Ru; yielded = true; } else if (rt < -Ru) { xp = x + Ru / KE; r = -Ru; yielded = true; } else r = rt;
        if (x > xm) { xm = x; tm = t; }
        rMax = max(rMax, r);
        maxV = max(maxV, 0.38 * r + 0.12 * P(t)); // dynamische Auflagerkraft je m² und m Stützweite (Biggs, beidseitig eingespannt; statisch 0,5·q)
        if (x < xm - 1e-12 && t > tm + 0.25 * Tk && t > (isFinite(td) ? min(td, tm + Tk) : 0)) break; // erster Höchstwert überschritten
        if (xm > 200 * xE) return { collapse: true, yielded: true, xm: Infinity, tm: t, rMax, maxV, T: Tk };
      }
      return { collapse: false, yielded, xm, tm, rMax, maxV, T: Tk };
    };
    let r = run(KLMe), klm = KLMe;
    if (r.yielded) { klm = (KLMe + KLMp) / 2; r = run(klm); }
    return { collapse: r.collapse, xE, T, Tklm: r.T, klm, xm: r.xm, mu: r.collapse ? Infinity : r.xm / xE, tm: r.tm, rMax: r.rMax, vFactor: r.maxV, yielded: r.yielded };
  }

  /* Erdbeben nach DIN EN 1998-1/NA:2011 und DIN EN 1998-5 für erdüberdeckte, steife Bauwerke.
   * Referenz-Spitzenbodenbeschleunigung agR je Erdbebenzone, Bedeutungsbeiwert γI, Untergrundparameter S, TB, TC, TD (NA Tab. NA.4).
   * Erddruckzuwachs auf starre (nicht nachgebende) Wände nach DIN EN 1998-5 Anhang E.9: ΔPd = α·S·γ·H², als Gleichlast
   * Δp = α·S·γ·H über die Wandhöhe. Trägheitskraft des Bauwerks mit dem Plateauwert des Bemessungsspektrums (q = 1,5).
   * Erdbebenkombination: G + ψ2·Q + AEd (γ = 1,0). */
  const EQ_AGR = [0, 0.4, 0.6, 0.8];
  const EQ_GI = { I: 0.8, II: 1.0, III: 1.2, IV: 1.4 };
  const EQ_SUB = { 'A-R': { S: 1.0, TB: 0.05, TC: 0.20, TD: 2.0 }, 'B-R': { S: 1.25, TB: 0.05, TC: 0.25, TD: 2.0 }, 'C-R': { S: 1.5, TB: 0.05, TC: 0.30, TD: 2.0 },
    'B-T': { S: 1.0, TB: 0.1, TC: 0.30, TD: 2.0 }, 'C-T': { S: 1.25, TB: 0.1, TC: 0.40, TD: 2.0 }, 'C-S': { S: 0.75, TB: 0.1, TC: 0.50, TD: 2.0 } };
  const EQ_MAP = { 'A-T': 'B-T', 'A-S': 'C-S', 'B-S': 'C-S' };
  function seismic(o) {
    if (!(o.zone > 0)) return null;
    const key0 = o.soilClass + '-' + o.ground, key = EQ_SUB[key0] ? key0 : EQ_MAP[key0] || 'C-S', P = EQ_SUB[key];
    const agR = EQ_AGR[min(3, o.zone)], gI = EQ_GI[o.importance] || 1.2, ag = gI * agR, alpha = ag / 9.81, q = o.q || 1.5;
    const Sd = ag * P.S * 2.5 / q; // m/s², Plateau des Bemessungsspektrums (sichere Seite für das steife Bauwerk)
    const dp = alpha * P.S * o.gamma * o.H; // kN/m², über die Wandhöhe
    return { zone: o.zone, agR, gI, ag, alpha, key, mapped: key !== key0, P, q, Sd, dp, dP: dp * o.H };
  }

  BP.verify = { bearingFactors, grundbruch, cornerI, influence, settlement, slope, FIRE, aFor, colReq, fire, stair, pit, pours, sdof, seismic, EQ_SUB };
})(typeof window !== 'undefined' ? window : globalThis);
