/* Biegeliste, BVBS-Datei und Bewehrungspläne aus der Bemessung.
 * Jeder Stab wird mit Einzellänge und Biegeform erzeugt (Stablängen ≤ 12 m, längere mit Übergreifungsstoß),
 * gleiche Stäbe eines Bauteils werden zu Positionen zusammengefasst. Maße außen, Schnittlänge = Summe der Schenkel. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const G = BP.geo;
  const T_ = BP.i18n.T, N_ = BP.i18n.N, I18 = BP.i18n;
  const max = Math.max, min = Math.min, ceil = Math.ceil;
  const STOCK = 12;
  // Norm des Projekts (je Aufruf gesetzt): Stabmassen und -querschnitte (USA: ASTM A615M), Biegerollen, Stahlsorte
  let NP = null;
  const prof = () => NP || BP.normen.active();
  const kgPerM = (phi) => (prof().barMass ? prof().barMass(phi) : 0.00617 * phi * phi);
  const asBar = (phi) => (prof().barArea ? prof().barArea(phi) : Math.PI * phi * phi / 400);
  const r05 = (v) => Math.round(v * 20) / 20;
  const mandrel = (phi, link) => (prof().mandrel ? prof().mandrel(phi, link) : (phi < 20 ? 4 : 7) * phi); // NA DE Tab. 8.1DE Zeile 1

  /* Biegeformen: Schenkel in m, Winkel zwischen den Schenkeln in Grad */
  const F = {
    gerade: (L) => ({ code: 'gerade', legs: [L], angles: [] }),
    L: (a, b) => ({ code: 'L', legs: [a, b], angles: [90] }),
    U: (a, b, c) => ({ code: 'U', legs: [a, b, c], angles: [90, 90] }),
    buegel: (a, b, hook) => ({ code: 'Bügel', legs: [hook, a, b, a, b, hook], angles: [135, 90, 90, 90, 135] }),
  };
  const cutLen = (sh) => sh.legs.reduce((s, x) => s + x, 0);

  /* Stab der Länge L in Lagerlängen ≤ 12 m mit Übergreifung l0 teilen */
  function pieces(L, l0) {
    if (L <= STOCK + 1e-9) return [L];
    const n = ceil((L - l0) / (STOCK - l0) - 1e-9);
    return Array(n).fill((L + (n - 1) * l0) / n);
  }

  /* Abschnitte einer Strecke außerhalb der Löcher (Löcher um die Betondeckung vergrößert) */
  function holeSegs(a, b, holes, c) {
    let segs = [[0, 1]];
    const L = G.dist(a, b);
    if (L < 1e-9) return [];
    for (const h of holes) {
      const big = G.offsetPolygon(G.ensureCCW(h), c);
      for (const sg of G.clipSegment(a, b, big)) {
        const t0 = min(G.dist(a, sg.a), G.dist(a, sg.b)) / L, t1 = max(G.dist(a, sg.a), G.dist(a, sg.b)) / L;
        segs = segs.flatMap(([x0, x1]) => (t1 <= x0 || t0 >= x1 ? [[x0, x1]] : [[x0, t0], [t1, x1]].filter(([u, v]) => v - u > 1e-6)));
      }
    }
    return segs;
  }
  const cutByHoles = (a, b, holes, c) => holeSegs(a, b, holes, c).map(([t0, t1]) => (t1 - t0) * G.dist(a, b));

  function schedule(q) {
    NP = BP.normen.profile(q.p);
    const C = BP.calc, p = q.p, b = p.build, geo = q.geo, st = q.struct, mat = q.mat, c = b.cnom;
    const raw = [];
    const add = (el, code, label, phi, n, shape, extra) => { if (n > 0 && cutLen(shape) > 0.05) raw.push(Object.assign({ el, code, label, phi, n, shape }, extra || {})); };
    const lap = (phi, poor) => C.lapLength(phi, mat, poor);

    // ---------- Platten ----------
    const plates = [];
    const nL = geo.L.length;
    if (st.roof) plates.push({ el: 'Decke', code: 'D', poly: geo.out, d: st.roof, h: b.tRoof, holes: geo.vert.lifts.filter((v) => v.toSurface || v.roofBox).map((v) => v.innerPoly), level: 0 });
    for (const m of st.mids || []) plates.push({ el: m.name, code: 'Z' + m.level, poly: geo.out, d: m, h: geo.L[m.level].tSlab, level: m.level,
      holes: geo.L[m.level - 1].holesBelow.concat(geo.vert.lifts.filter((v) => m.level - 1 >= v.wallTop && m.level <= v.levelBot).map((v) => v.innerPoly)) });
    if (st.floor) plates.push({ el: 'Bodenplatte', code: 'B', poly: geo.slab, d: st.floor, h: b.tFloor, holes: geo.vert.lifts.filter((v) => v.levelBot === nL - 1).map((v) => v.innerPoly), level: nL });
    for (const pl of plates) {
      const barsOf = (lines, phi, poor, label, s) => {
        const l0 = lap(phi, poor);
        for (const [A, B] of lines) for (const L of cutByHoles(A, B, pl.holes, c)) {
          if (L < 0.3) continue;
          for (const Lp of pieces(L, l0)) add(pl.el, pl.code, label, phi, 1, F.gerade(r05(Lp)), { s, lap: l0, dir: Math.abs(A.x - B.x) > Math.abs(A.y - B.y) ? 'x' : 'y', face: label.includes('oben') ? 'oben' : 'unten' });
        }
      };
      for (const lay of pl.d.layers) {
        const r = C.plateBars(pl.poly, c, lay, mat);
        barsOf(r.lines, lay.phi, lay.poorBond, lay.label + ' (' + lay.face + ')', lay.s);
      }
      (pl.d.zulagen || []).forEach((z, i) => {
        const r = C.zulageBars(pl.poly, c, z, mat);
        barsOf(r.lines, z.phi, z.poorBond, 'Zulage Z' + (i + 1) + ' ' + z.face + ', Richtung ' + z.dir, z.s);
      });
      // Aussparungen: die FE-Bemessung enthält die Öffnungen (Umlagerung und Randmomente sind in Grund- und Zulagebewehrung erfasst).
      // Der Öffnungsrand ist ein freier Rand (EC2 9.3.1.4): Steckbügel, je Rand und Lage 2 Längsstäbe Ø12 um l0 über die Ecken, Eckzulagen diagonal.
      for (const h of pl.holes) {
        const hb = G.bbox(h), wx = hb.x1 - hb.x0, wy = hb.y1 - hb.y0;
        if (wx < 0.2 || wy < 0.2) continue;
        const l0 = lap(12, false), inset = G.offsetPolygon(pl.poly, -c), e = 0.08;
        // je Rand zwei Stäbe je Lage, 8 cm neben der Öffnung, um l0 über die Ecken, auf die Platte begrenzt
        const edges = [[{ x: hb.x0 - l0, y: hb.y0 - e }, { x: hb.x1 + l0, y: hb.y0 - e }, 'x'], [{ x: hb.x0 - l0, y: hb.y1 + e }, { x: hb.x1 + l0, y: hb.y1 + e }, 'x'],
          [{ x: hb.x0 - e, y: hb.y0 - l0 }, { x: hb.x0 - e, y: hb.y1 + l0 }, 'y'], [{ x: hb.x1 + e, y: hb.y0 - l0 }, { x: hb.x1 + e, y: hb.y1 + l0 }, 'y']];
        for (const face of ['unten', 'oben']) for (const [A, B2, dir] of edges) for (const sg of G.clipSegment(A, B2, inset)) {
          const Ls = G.dist(sg.a, sg.b);
          if (Ls < 0.3) continue;
          for (const Lp of pieces(Ls, l0)) add(pl.el, pl.code, 'Randstäbe Aussparung ' + face + ', Richtung ' + dir, 12, 2, F.gerade(r05(Lp)), { dir, face, trim: true, lap: l0 });
        }
        add(pl.el, pl.code, N_('Steckbügel Aussparung (freier Rand)'), pl.h > 0.4 ? 12 : 10, ceil(2 * (wx + wy) / 0.2), F.U(0.5, r05(pl.h - 2 * c), 0.5), { trimU: true });
        add(pl.el, pl.code, N_('Eckzulagen Aussparung diagonal'), 12, 8, F.gerade(1.2), { trimDiag: true });
      }
      const P = G.perimeter(pl.poly), phiE = pl.h > 0.4 ? 12 : 10;
      add(pl.el, pl.code, N_('Randeinfassung (Steckbügel)'), phiE, ceil(P / 0.2), F.U(0.6, r05(pl.h - 2 * c), 0.6));
      const lk = pl.d.shear && pl.d.shear.links;
      // Querkraftbügel: Menge aus asw, Abstände höchstens 0,75 d längs und 1,5 d quer (EC2 9.3.2)
      const dS = pl.h - c - 0.015;
      if (lk) lk.zones.forEach((zn, i) => add(pl.el, pl.code, 'Querkraftbewehrung Q' + (i + 1), 10, max(ceil(zn.asw * zn.area / asBar(10)), (ceil((zn.x1 - zn.x0) / (0.75 * dS)) + 1) * (ceil((zn.y1 - zn.y0) / (1.5 * dS)) + 1)), F.U(0.1, r05(pl.h - 2 * c), 0.1)));
      const sh = pl.d.acc && pl.d.acc.shear.reinf ? pl.d.acc.shear : null;
      if (sh) {
        const supLen = geo.Pin + 2 * geo.walls.filter((w) => w.info.bearing).reduce((s, w) => s + w.len, 0);
        add(pl.el, pl.code, N_('Schubbewehrung Luftstoß'), sh.reinf.phi, ceil(sh.strip * supLen / (sh.reinf.s * sh.reinf.s)), F.U(0.1, r05(pl.h - 2 * c), 0.1));
      }
    }
    // Durchstanzbewehrung (Bügelkörbe je Reihe)
    for (const col of st.columns || []) {
      const below = col.level === nL - 1 ? 'Bodenplatte' : (st.mids.find((m) => m.level === col.level + 1) || {}).name;
      const above = col.level === 0 ? 'Decke' : (st.mids.find((m) => m.level === col.level) || {}).name;
      for (const [pu, el, hh, code] of [[col.punch, above, col.level === 0 ? b.tRoof : geo.L[col.level].tSlab, col.level === 0 ? 'D' : 'Z' + col.level], [col.punchBelow, below, col.level === nL - 1 ? b.tFloor : geo.L[col.level + 1].tSlab, col.level === nL - 1 ? 'B' : 'Z' + (col.level + 1)]]) {
        if (!pu || !pu.links || !el) continue;
        const lk = pu.links;
        let n = 0;
        for (let r = 0; r < lk.rows; r++) {
          const rr = lk.rowR ? lk.rowR[r] : 0.5 * pu.d + r * lk.sr;
          const u = pu.u0 + 2 * Math.PI * rr, asRow = r === 0 ? lk.row1 : r === 1 ? lk.row2 : lk.asw;
          n += max(ceil(u / (1.5 * pu.d)), ceil(max(asRow, ceil(u / (1.5 * pu.d)) * lk.aswMin) / asBar(10)));
        }
        add(el, code, 'Durchstanzbewehrung an ' + (geo.labels['c:' + col.id] || T_('Stütze')), 10, n, F.U(0.1, r05(hh - 2 * c), 0.1), { colId: col.id, below: pu === col.punchBelow });
      }
    }

    // ---------- Außenwände ----------
    const w = st.wall;
    if (geo.valid && w) {
      const [vi, vo, hz] = w.layers, lv = q.lv, Hint = lv.Hint, zE = lv.zEntry != null ? lv.zEntry : lv.zFloorTop;
      const ops = geo.openings.filter((o) => o.outer && !o.invalid);
      for (const [lay, face, poly] of [[vo, 'außen', G.offsetPolygon(geo.out, -c)], [vi, 'innen', G.offsetPolygon(geo.inner, c)]]) {
        // Außenseite = Rahmenecke: Schenkel in die Platten mit Übergreifungslänge der Plattenbewehrung, Biegerolle 15 Ø (NA DE Tab. 8.1DE Zeile 2)
        const out = face === 'außen', l0 = lap(lay.phi), legTop = out ? max(0.25, r05(lap(lay.phi, true))) : 0.25, legBot = out ? max(0.25, r05(l0)) : 0.25;
        const Lv = Hint + b.tRoof - c, mF = out ? { mandrelF: 15 } : {};
        const shift = out ? c : b.tWall - c; // Lage des Kantenanfangs dieser Lage gegenüber der Außenecke
        const P = G.perimeter(poly), n = ceil(P / lay.s);
        // Stäbe im Bereich von Öffnungen: über dem Sturz bzw. unter der Brüstung
        let nOp = 0;
        for (const o of ops) {
          const k = Math.floor(o.w / lay.s);
          nOp += k;
          const top = (lv.zCeil - (zE + o.sill + o.h)) + b.tRoof - c;
          const edge = +String(o.host).slice(2);
          if (top > 0.2) add('Außenwände', 'W', 'Vertikal ' + face + ' über Öffnungen', lay.phi, k, F.L(r05(top), legTop), Object.assign({ edge, face }, mF));
          // unter der Brüstung: vom Fußboden (Stoß mit der Anschlussbewehrung) bis Brüstung − c
          const under = (zE - lv.zFloorTop) + o.sill;
          if (under - c > 0.3) add('Außenwände', 'W', 'Vertikal ' + face + ' unter Öffnungen', lay.phi, k, F.gerade(r05(under - c)), { edge, face });
        }
        // lotrecht: vom Fußboden (Stoß mit der Anschlussbewehrung) bis OK Decke − c, über 12 m gestoßen; oberes Stück mit Schenkel in die Decke
        const vp = pieces(Lv, l0);
        vp.forEach((Lp, k) => add('Außenwände', 'W', 'Vertikal ' + face + (vp.length > 1 ? ' Stück ' + (k + 1) : ''), lay.phi, n - nOp, k === vp.length - 1 ? F.L(r05(Lp), legTop) : F.gerade(r05(Lp)), Object.assign({ s: lay.s, face, vert: true }, k === vp.length - 1 ? mF : {})));
        add('Außenwände', 'W', 'Anschlussbewehrung Sohle, ' + face, lay.phi, n, F.L(legBot, r05(b.tFloor - 2 * c + l0)), Object.assign({ s: lay.s, face, vert: true }, mF));
        // Horizontal je Kante, an den Ecken Winkelstäbe
        const lh = lap(hz.phi), rows = Math.floor(Hint / hz.s) + 1;
        for (let i = 0; i < poly.length; i++) {
          const A = poly[i], B = poly[(i + 1) % poly.length], Le = G.dist(A, B);
          const edgeOps = ops.filter((o) => o.host === 'e:' + i);
          for (let r = 0; r < rows; r++) {
            const zr = lv.zFloorTop + 0.05 + r * hz.s;
            let segs = [[0, Le]];
            for (const o of edgeOps) if (zr > zE + o.sill - c && zr < zE + o.sill + o.h + c) {
              const t0 = o.pos - o.w / 2 - shift - c, t1 = o.pos + o.w / 2 - shift + c; // Laibung mit Betondeckung
              segs = segs.flatMap(([x0, x1]) => (t1 <= x0 || t0 >= x1 ? [[x0, x1]] : [[x0, t0], [t1, x1]].filter(([u, v]) => v - u > 0.3)));
            }
            for (const [x0, x1] of segs) for (const Lp of pieces(x1 - x0, lh)) add('Außenwände', 'W', 'Horizontal ' + face, hz.phi, 1, F.gerade(r05(Lp)), { s: hz.s, edge: i, face });
          }
          add('Außenwände', 'W', 'Eckstäbe horizontal ' + face, hz.phi, rows, F.L(r05(lh), r05(lh)), { s: hz.s, edge: i, face });
        }
      }
      // Zulagen an Öffnungen: je Seite 2 Ø16 längs, 2 Ø16 diagonal, beidseitig
      for (const o of ops) {
        const edge = +String(o.host).slice(2);
        add('Außenwände', 'W', N_('Zulage Öffnung seitlich'), 16, 2 * 2 * 2, F.gerade(r05(o.h + 1.6)), { edge });
        add('Außenwände', 'W', N_('Zulage Öffnung oben/unten'), 16, 2 * 2 * 2, F.gerade(r05(o.w + 1.6)), { edge });
        add('Außenwände', 'W', N_('Zulage Öffnung diagonal'), 16, 2 * 2, F.gerade(1.2), { edge });
      }
      if (w.acc && w.acc.shear.reinf) {
        const sh = w.acc.shear, Pm = (G.perimeter(G.offsetPolygon(geo.out, -c)) + G.perimeter(G.offsetPolygon(geo.inner, c))) / 2;
        add('Außenwände', 'W', N_('Schubbewehrung Luftstoß oben und unten'), sh.reinf.phi, ceil(2 * sh.strip * Pm / (sh.reinf.s * sh.reinf.s)), F.U(0.1, r05(b.tWall - 2 * c), 0.1));
      }
    }

    // ---------- Innenwände (auch Aufzugsschächte) ----------
    for (const iw of st.intWalls || []) {
      const Lg = geo.L[iw.level || 0], H = Lg.H, tAbove = (iw.level || 0) === 0 ? b.tRoof : Lg.tSlab, lay = iw.layer, l0 = lap(lay.phi);
      const el = iw.auto ? 'Aufzugsschacht' : 'Innenwände', nm = iw.auto ? (geo.labels['v:' + iw.auto] || T_('Aufzug')) : (geo.labels['w:' + iw.id] || T_('Innenwand'));
      const ops = Lg.openings.filter((o) => o.host === 'w:' + iw.id && !o.invalid);
      const nV = ceil(iw.len / lay.s) + 1;
      let nOp = 0;
      for (const o of ops) {
        const k = Math.floor(o.w / lay.s); nOp += k;
        const top = H - o.sill - o.h + tAbove + l0;
        if (top > 0.3) add(el, 'I', nm + ': ' + N_('vertikal über Türen, beidseitig'), lay.phi, 2 * k, F.gerade(r05(top)));
      }
      add(el, 'I', nm + ': ' + N_('vertikal beidseitig'), lay.phi, 2 * (nV - nOp), F.gerade(r05(H + tAbove + l0)), { s: lay.s });
      const rows = Math.floor(H / lay.s) + 1;
      for (let r = 0; r < rows; r++) {
        const zr = 0.05 + r * lay.s;
        let segs = [[0, iw.len + 0.8]];
        for (const o of ops) if (zr > o.sill && zr < o.sill + o.h) {
          const t0 = o.pos - o.w / 2 + 0.4, t1 = o.pos + o.w / 2 + 0.4;
          segs = segs.flatMap(([x0, x1]) => (t1 <= x0 || t0 >= x1 ? [[x0, x1]] : [[x0, t0], [t1, x1]].filter(([u, v]) => v - u > 0.3)));
        }
        for (const [x0, x1] of segs) for (const Lp of pieces(x1 - x0, l0)) add(el, 'I', nm + ': ' + N_('horizontal beidseitig'), lay.phi, 2, F.gerade(r05(Lp)), { s: lay.s });
      }
    }

    // ---------- Innentreppen (Laufplatte als Einfeldplatte) ----------
    for (const stp of geo.vert.stairs || []) {
      const d = stp.design;
      if (!d || !d.phi) continue;
      const nm = geo.labels['v:' + stp.id] || T_('Innentreppe'), cs = 0.025, w = stp.w, la = 0.35;
      const nMain = ceil((w - 2 * cs) / d.s) + 1;
      // untere Längsstäbe mit Knick am Antritt (Schenkel waagerecht in die Bodenplatte bzw. Decke) und Verankerung im oberen Deckenrand
      add('Innentreppen', 'T', nm + ': ' + N_('Laufplatte unten'), d.phi, nMain, F.L(r05(stp.Ls + la), r05(la)));
      add('Innentreppen', 'T', nm + ': ' + N_('Querbewehrung'), d.distr.phi, ceil(stp.Ls / d.distr.s) + 1, F.gerade(r05(w - 2 * cs)));
      // obere Stäbe an beiden Enden (Teileinspannung, EC2 9.3.1.2: 25 % des Feldquerschnitts über 0,2 l)
      const nTop = ceil((w - 2 * cs) / d.top.s) + 1;
      add('Innentreppen', 'T', nm + ': ' + N_('oben am Auflager'), d.top.phi, 2 * nTop, F.L(r05(0.25 * stp.span + la), r05(stp.tWaist - 2 * cs)));
      add('Innentreppen', 'T', nm + ': ' + N_('Stufenbügel'), 8, stp.nr, F.U(r05(stp.rise), r05(min(1.2, w - 2 * cs)), r05(stp.rise)));
    }

    // ---------- Stützen ----------
    for (const col of st.columns || []) {
      const d = col.design, Lg = geo.L[col.level], tAbove = col.level === 0 ? b.tRoof : Lg.tSlab, nm = geo.labels['c:' + col.id] || T_('Stütze');
      const l0 = C.lapLength(d.phi, mat), cS = 0.03;
      // Stütze darüber: Längsstäbe laufen um l0 in die obere Stütze, sonst enden sie in der Platte darüber (OK − c)
      const above = col.level > 0 && (st.columns || []).some((o) => o.level === col.level - 1 && Math.abs(o.x - col.x) < 0.05 && Math.abs(o.y - col.y) < 0.05);
      add('Stützen', 'S', nm + ': ' + N_('Längsstäbe'), d.phi, d.nb, F.gerade(r05(Lg.H + (above ? tAbove + l0 : tAbove - cS))));
      // Anschlussstäbe aus der Platte darunter (Bodenplatte bzw. Zwischendecke), Stoß über dem Fußboden
      const tBelow = col.level === nL - 1 ? b.tFloor : geo.L[col.level + 1].tSlab;
      add('Stützen', 'S', nm + ': ' + N_('Anschlussstäbe'), d.phi, d.nb, F.L(0.3, r05(tBelow - 2 * c + l0)));
      const hmax = max(col.bx, col.by), cc = mat.colCover || C.COL_COVER;
      // verdichtete Bügel an den Enden auf max(h) und bei Ø > 14 mm über die Stoßlänge (NA DE 9.5.3(4))
      const zEnd = hmax + (d.phi > 14 ? max(0, l0 - hmax) : 0);
      const nS = ceil(hmax / d.stirrup.sEnd) + ceil(zEnd / d.stirrup.sEnd) + ceil(max(0, Lg.H - hmax - zEnd) / d.stirrup.s) + 1;
      const cm = (v) => Math.floor(v * 100 + 1e-6) / 100;
      add('Stützen', 'S', nm + ': ' + N_('Bügel'), d.stirrup.phi, nS, F.buegel(cm(col.bx - 2 * cc), cm(col.by - 2 * cc), r05(max(0.07, 10 * d.stirrup.phi / 1000))));
    }

    // ---------- Unterzüge ----------
    for (const bd of st.beams || []) {
      if (!bd.field || bd.unsupported) continue;
      const nm = geo.labels['b:' + bd.id] || T_('Unterzug'), lb = C.lapLength(bd.field.phi, mat);
      // untere Stäbe bis in die Endauflager (Auflagertiefe − 3 cm, höchstens lb)
      const s0 = bd.sups[0], sN = bd.sups[bd.sups.length - 1], ext = (sp) => min(lb, max(0.1, (sp && sp.w ? sp.w : 0.25) - 0.03));
      for (const Lp of pieces(bd.L + ext(s0) + ext(sN), lb)) add('Unterzüge', 'U', nm + ': ' + N_('unten'), bd.field.phi, bd.field.n, F.gerade(r05(Lp)));
      bd.sups.slice(1, -1).forEach((sp, i) => {
        const L = 0.25 * ((sp.s - bd.sups[i].s) + (bd.sups[i + 2].s - sp.s)) + 2 * C.lapLength(bd.support.phi, mat, true);
        add('Unterzüge', 'U', nm + ': oben über Auflager ' + (i + 2), bd.support.phi, bd.support.n, F.gerade(r05(L)));
      });
      for (const Lp of pieces(bd.L + 0.6, C.lapLength(12, mat, true))) add('Unterzüge', 'U', nm + ': ' + N_('Montagestäbe oben'), 12, 2, F.gerade(r05(Lp)));
      const stp = bd.shear.stirrups;
      if (stp) add('Unterzüge', 'U', nm + ': ' + N_('Bügel'), stp.phi, ceil(bd.L / stp.s) + 1, F.buegel(Math.floor((bd.bw - 0.06) * 100 + 1e-6) / 100, Math.floor((bd.h - 0.06) * 100 + 1e-6) / 100, r05(max(0.07, 10 * stp.phi / 1000))));
    }

    // ---------- zusammenfassen ----------
    const keyOf = (r) => [r.el, r.phi, r.shape.code, r.shape.legs.map((x) => x.toFixed(2)).join('/'), r.label].join('|');
    const map = new Map();
    for (const r of raw) {
      const k = keyOf(r);
      const e = map.get(k);
      if (e) { e.n += r.n; if (r.edge != null && !e.edges.includes(r.edge)) e.edges.push(r.edge); } else map.set(k, Object.assign({}, r, { edges: r.edge != null ? [r.edge] : [] }));
    }
    const ORDER = ['Decke', 'Zwischendecke', 'Außenwände', 'Innenwände', 'Aufzugsschacht', 'Innentreppen', 'Stützen', 'Unterzüge', 'Bodenplatte'];
    const rank = (el) => { const i = ORDER.findIndex((o) => el.startsWith(o)); return i < 0 ? 99 : i; };
    const list = [...map.values()].sort((a, c2) => rank(a.el) - rank(c2.el) || a.el.localeCompare(c2.el) || a.label.localeCompare(c2.label) || c2.phi - a.phi || cutLen(c2.shape) - cutLen(a.shape));
    // Positionen je Bauteil fortlaufend: D01, D02, … (Planbezeichnung = Bauteil)
    const counters = {};
    for (const r of list) {
      counters[r.code] = (counters[r.code] || 0) + 1;
      r.pos = r.code + String(counters[r.code]).padStart(2, '0');
      r.L = cutLen(r.shape);
      r.kg = r.n * r.L * kgPerM(r.phi);
      r.mandrel = r.mandrelF ? r.mandrelF * r.phi : mandrel(r.phi, r.shape.code === 'Bügel');
    }
    const byEl = {};
    for (const r of list) { (byEl[r.el] = byEl[r.el] || { el: r.el, code: r.code, kg: 0, n: 0, positions: [] }); byEl[r.el].kg += r.kg; byEl[r.el].n += r.n; byEl[r.el].positions.push(r); }
    const byDia = {};
    for (const r of list) byDia[r.phi] = (byDia[r.phi] || 0) + r.kg;
    const total = list.reduce((s, r) => s + r.kg, 0);
    // nicht einzeln erfasst: Zugangsbauwerke, Aufzugsgrube und -schachtkopf (Ansatz aus dem Auszug)
    const approx = (q.steel.items || []).filter((i) => i.element === 'Zugänge' || i.element === 'Aufzugsschächte').map((i) => ({ el: i.element, kg: i.kg, label: i.label }));
    return { positions: list, byEl: Object.values(byEl), byDia, total, approx, takeoff: q.steel.net, grade: NP.steel || 'B500B' };
  }

  /* BVBS 2.0 (BF2D) je Position; Prüfsumme nach Richtlinie: IP = 96 − (Σ ASCII bis einschließlich „C“) mod 32 */
  function checksum(s) { let t = 0; for (const ch of s) t += ch.charCodeAt(0); return 96 - (t % 32); }
  const ascii = (s) => String(s || '').replace(/[äöüÄÖÜ]/g, (ch) => ({ ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue' }[ch])).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^\x20-\x7e]/g, '').replace(/@/g, '');
  function bvbs(sch, meta) {
    const out = [];
    for (const r of sch.positions) {
      const H = 'BF2D@Hj' + ascii(meta.project).slice(0, 30) + '@r' + ascii(r.code) + '@i' + ascii(meta.index || 'a') + '@p' + ascii(r.pos) + '@l' + Math.round(r.L * 1000) + '@n' + r.n +
        '@e' + (r.L * kgPerM(r.phi)).toFixed(3) + '@d' + r.phi + '@g' + ascii(sch.grade || 'B500B').replace(/\s+/g, '') + '@s' + r.mandrel + '@v@';
      let Gs = 'G';
      r.shape.legs.forEach((leg, i) => { Gs += 'l' + Math.round(leg * 1000) + '@w' + (r.shape.angles[i] || 0) + '@'; });
      const body = H + Gs + 'C';
      out.push(body + checksum(body) + '@');
    }
    return out.join('\r\n') + '\r\n';
  }

  const shapeText = (sh) => (sh.code === 'gerade' ? T_('gerade') : (sh.code === 'Bügel' ? T_('Bügel') : sh.code) + ' ' + sh.legs.map((x) => (x * 100).toFixed(0)).join('/') + ' cm');

  /* Anzeige der Positionen: Bauteil (el) und Bezeichnung (label) bleiben in der Biegeliste deutsch, weil Sortierung, Zuordnung
   * zu den Plänen und der Bauablauf sie als Schlüssel nutzen; übersetzt wird erst hier. Namen aus geo.labels sind schon übersetzt. */
  const faceT = (f) => ({ oben: T_('oben'), unten: T_('unten'), 'außen': T_('außen'), innen: T_('innen') }[f] || f);
  function elText(el) {
    const m = /^Zwischendecke über Ebene (\d+)$/.exec(el || '');
    return m ? T_('Zwischendecke über Ebene {n}', { n: m[1] }) : T_(el);
  }
  /* Teil hinter „Name: “ (Wände, Treppen, Stützen, Unterzüge) */
  function partText(s) {
    const m = /^oben über Auflager (\d+)$/.exec(s);
    return m ? T_('oben über Auflager {i}', { i: m[1] }) : T_(s);
  }
  function labelText(s) {
    s = String(s == null ? '' : s);
    let m;
    if ((m = / \((oben|unten)\)$/.exec(s))) return labelText(s.slice(0, m.index)) + ' (' + faceT(m[1]) + ')';
    if ((m = /^Grundbewehrung (oben|unten), Richtung (\w+)$/.exec(s))) return T_('Grundbewehrung {face}, Richtung {dir}', { face: faceT(m[1]), dir: m[2] });
    if ((m = /^Feld, Richtung (\w+)$/.exec(s))) return T_('Feld, Richtung {dir}', { dir: m[1] });
    if ((m = /^Rand, Richtung (\w+)$/.exec(s))) return T_('Rand, Richtung {dir}', { dir: m[1] });
    if ((m = /^Zulage Z(\d+) (oben|unten), Richtung (\w+)$/.exec(s))) return T_('Zulage Z{i} {face}, Richtung {dir}', { i: m[1], face: faceT(m[2]), dir: m[3] });
    if ((m = /^Randstäbe Aussparung (oben|unten), Richtung (\w+)$/.exec(s))) return T_('Randstäbe Aussparung {face}, Richtung {dir}', { face: faceT(m[1]), dir: m[2] });
    if ((m = /^Querkraftbewehrung Q(\d+)$/.exec(s))) return T_('Querkraftbewehrung Q{i}', { i: m[1] });
    if ((m = /^Durchstanzbewehrung an (.+)$/.exec(s))) return T_('Durchstanzbewehrung an {name}', { name: m[1] });
    if ((m = /^Vertikal (außen|innen) über Öffnungen$/.exec(s))) return T_('Vertikal {face} über Öffnungen', { face: faceT(m[1]) });
    if ((m = /^Vertikal (außen|innen) unter Öffnungen$/.exec(s))) return T_('Vertikal {face} unter Öffnungen', { face: faceT(m[1]) });
    if ((m = /^Vertikal (außen|innen) Stück (\d+)$/.exec(s))) return T_('Vertikal {face} Stück {k}', { face: faceT(m[1]), k: m[2] });
    if ((m = /^Vertikal (außen|innen)$/.exec(s))) return T_('Vertikal {face}', { face: faceT(m[1]) });
    if ((m = /^Anschlussbewehrung Sohle, (außen|innen)$/.exec(s))) return T_('Anschlussbewehrung Sohle, {face}', { face: faceT(m[1]) });
    if ((m = /^Horizontal (außen|innen)$/.exec(s))) return T_('Horizontal {face}', { face: faceT(m[1]) });
    if ((m = /^Eckstäbe horizontal (außen|innen)$/.exec(s))) return T_('Eckstäbe horizontal {face}', { face: faceT(m[1]) });
    if ((m = /^(.*): ([^:]+)$/.exec(s))) return m[1] + ': ' + partText(m[2]);
    return T_(s);
  }

  function csv(sch, cell) {
    const n = (v, d) => (isFinite(v) ? I18.dec(v.toFixed(d)) : '');
    const lines = [[T_('Position'), T_('Bauteil'), T_('Bezeichnung'), T_('Anzahl'), 'Ø mm', T_('Biegeform'), T_('Einzellänge m'), T_('Gesamtlänge m'), T_('Masse kg'), T_('Biegerolle mm')].map(cell).join(';')];
    for (const r of sch.positions) lines.push([cell(r.pos), cell(elText(r.el)), cell(labelText(r.label)), r.n, r.phi, cell(shapeText(r.shape)), n(r.L, 2), n(r.n * r.L, 1), n(r.kg, 1), r.mandrel].join(';'));
    lines.push('');
    for (const e of sch.byEl) lines.push([cell(T_('Summe')), cell(elText(e.el)), '', e.n, '', '', '', '', n(e.kg, 1), ''].join(';'));
    lines.push([cell(T_('Summe')), cell(T_('Biegeliste gesamt')), '', '', '', '', '', '', n(sch.total, 1), ''].join(';'));
    for (const a of sch.approx) lines.push([cell(T_('Ansatz')), cell(elText(a.el)), cell(a.label), '', '', '', '', '', n(a.kg, 1), ''].join(';'));
    return lines.join('\r\n');
  }

  /* ---------- Bewehrungspläne (SVG, Blatt A3 quer, Maße in mm Papier) ---------- */
  const SHEET = { W: 420, H: 297, m: 10 };
  const SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500];
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const f2 = (v, d = 2) => (isFinite(v) ? I18.dec(v.toFixed(d)) : '–');
  const txt = (x, y, t, o) => '<text x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" font-size="' + ((o && o.size) || 2.6) + '"' + (o && o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o && o.weight ? ' font-weight="' + o.weight + '"' : '') + (o && o.fill ? ' fill="' + o.fill + '"' : ' fill="#111"') + (o && o.rot ? ' transform="rotate(' + o.rot + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ')"' : '') + '>' + esc(t) + '</text>';
  const line = (a, b2, o) => '<line x1="' + a.x.toFixed(2) + '" y1="' + a.y.toFixed(2) + '" x2="' + b2.x.toFixed(2) + '" y2="' + b2.y.toFixed(2) + '" stroke="' + ((o && o.stroke) || '#111') + '" stroke-width="' + ((o && o.w) || 0.25) + '"' + (o && o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + '/>';
  const polyS = (pts, o) => '<polygon points="' + pts.map((p2) => p2.x.toFixed(2) + ',' + p2.y.toFixed(2)).join(' ') + '" fill="' + ((o && o.fill) || 'none') + '" stroke="' + ((o && o.stroke) || '#111') + '" stroke-width="' + ((o && o.w) || 0.35) + '"' + (o && o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + '/>';

  function titleBlock(meta, title, scale, no) {
    const x = SHEET.W - SHEET.m - 180, y = SHEET.H - SHEET.m - 42, w = 180, h = 42, o = [];
    o.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#fff" stroke="#111" stroke-width="0.5"/>');
    o.push(line({ x, y: y + 12 }, { x: x + w, y: y + 12 }), line({ x, y: y + 22 }, { x: x + w, y: y + 22 }), line({ x, y: y + 32 }, { x: x + w, y: y + 32 }), line({ x: x + 120, y: y + 22 }, { x: x + 120, y: y + h }));
    o.push(txt(x + 3, y + 5, T_('Projekt'), { size: 2 }), txt(x + 3, y + 10, meta.project, { size: 3.6, weight: 700 }));
    o.push(txt(x + 3, y + 15, T_('Planinhalt'), { size: 2 }), txt(x + 3, y + 20, title, { size: 3.2, weight: 600 }));
    o.push(txt(x + 3, y + 25, T_('Beton {concrete} · Betonstahl {steel} · cnom = {cnom} mm (Stützen {cc} mm, Unterzüge 30 mm)', { concrete: meta.concrete, steel: prof().steel || 'B500B', cnom: f2(meta.cnom * 1000, 0), cc: f2((meta.colCover || 0.03) * 1000, 0) }), { size: 2.2 }));
    o.push(txt(x + 3, y + 29.5, prof().code === 'EC' && prof().na === 'DE' ? T_('Maße in m, Stablängen Außenmaße; Übergreifungen nach EC2 mit NA DE') : T_('Maße in m, Stablängen Außenmaße; Übergreifungen nach {ref}', { ref: prof().ref.lap }), { size: 2.2 }));
    o.push(txt(x + 3, y + 36, T_('Vorplanung aus dem Bunkerplaner – vom Tragwerksplaner zu prüfen und freizugeben.'), { size: 2.2, fill: '#8a1c1c' }));
    o.push(txt(x + 3, y + 40, T_('Datum {date}', { date: meta.date }), { size: 2.2 }));
    o.push(txt(x + 123, y + 26, T_('Plan-Nr.'), { size: 2 }), txt(x + 123, y + 31, T_('BWP-{no} / Index {index}', { no: String(no).padStart(2, '0'), index: meta.index || 'a' }), { size: 3, weight: 700 }));
    o.push(txt(x + 123, y + 36, T_('Maßstab'), { size: 2 }), txt(x + 123, y + 40.5, scale ? '1 : ' + scale : T_('ohne'), { size: 3, weight: 700 }));
    return o.join('');
  }
  const frame = () => '<rect x="' + SHEET.m + '" y="' + SHEET.m + '" width="' + (SHEET.W - 2 * SHEET.m) + '" height="' + (SHEET.H - 2 * SHEET.m) + '" fill="none" stroke="#111" stroke-width="0.6"/>';
  const wrap = (body) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + SHEET.W + ' ' + SHEET.H + '" width="' + SHEET.W + 'mm" height="' + SHEET.H + 'mm" font-family="Archivo, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>' + body + '</svg>';

  /* Maßstab und Lage, damit bb in den Zeichenbereich passt */
  function fit(bb, area) {
    const sc = SCALES.find((s2) => bb.w * 1000 / s2 <= area.w && bb.h * 1000 / s2 <= area.h) || SCALES[SCALES.length - 1];
    const k = 1000 / sc, ox = area.x + (area.w - bb.w * k) / 2, oy = area.y + (area.h - bb.h * k) / 2;
    return { sc, k, P: (pt) => ({ x: ox + (pt.x - bb.x0) * k, y: oy + (bb.y1 - pt.y) * k }) };
  }

  const rowRad = (pu, k) => (pu.links.rowR ? pu.links.rowR[k] : 0.5 * pu.d + k * pu.links.sr);

  /* Plattenblatt: eine Lage (unten oder oben) mit Grundbewehrung, Zulagen, Durchstanz- und Schubbewehrung */
  function plateSheet(q, sch, pl, face, meta, no) {
    const g = q.geo, b = q.p.build, o = [frame()];
    const bb0 = G.bbox(pl.poly), pad = min(2.2, max(0.8, 0.12 * max(bb0.x1 - bb0.x0, bb0.y1 - bb0.y0))), bb = { x0: bb0.x0 - pad, x1: bb0.x1 + pad, y0: bb0.y0 - pad, y1: bb0.y1 + pad }; bb.w = bb.x1 - bb.x0; bb.h = bb.y1 - bb.y0;
    const area = { x: SHEET.m + 8, y: SHEET.m + 14, w: SHEET.W - 2 * SHEET.m - 16, h: SHEET.H - 2 * SHEET.m - 70 };
    const T = fit(bb, area), P = T.P;
    o.push(txt(SHEET.m + 6, SHEET.m + 9, T_(face === 'unten' ? '{el} – untere Lage, d = {d} cm' : '{el} – obere Lage, d = {d} cm', { el: elText(pl.el), d: f2(pl.h * 100, 0) }), { size: 5, weight: 700 }));
    // Bauteilkontur, Wände darunter, Löcher, Stützen
    o.push(polyS(pl.poly.map(P), { w: 0.6 }));
    if (pl.code !== 'B') o.push(polyS(g.inner.map(P), { w: 0.25, dash: '2 1.2' }));
    const Lsup = pl.code === 'B' ? g.L[g.L.length - 1] : g.L[pl.level];
    if (Lsup) {
      for (const w of Lsup.walls) if (w.info.bearing) for (const sg of w.segs) {
        const u = G.norm(G.sub(sg.b, sg.a)), n = { x: -u.y * w.t / 2, y: u.x * w.t / 2 };
        o.push(polyS([G.add(sg.a, n), G.add(sg.b, n), G.sub(sg.b, n), G.sub(sg.a, n)].map(P), { w: 0.2, dash: '1.5 1', fill: '#eee' }));
      }
      for (const c of Lsup.columns) o.push(polyS(G.polygonFromRect(c.x - c.bx / 2, c.y - c.by / 2, c.x + c.bx / 2, c.y + c.by / 2).map(P), { w: 0.3, fill: '#ccc' }));
      for (const bu of Lsup.beams || []) for (const sg of bu.segs || []) { const u = G.norm(G.sub(sg.b, sg.a)), n = { x: -u.y * bu.bw / 2, y: u.x * bu.bw / 2 }; o.push(polyS([G.add(sg.a, n), G.add(sg.b, n), G.sub(sg.b, n), G.sub(sg.a, n)].map(P), { w: 0.25, dash: '3 1.5' })); }
    }
    for (const h of pl.holes) { o.push(polyS(h.map(P), { w: 0.5, fill: '#fff' })); const hp = h.map(P); o.push(line(hp[0], hp[2], { w: 0.2 }), line(hp[1], hp[3], { w: 0.2 })); }
    // Auswechselbewehrung dieser Lage: je Richtung ein Stab beidseits der Aussparung, um l0 über die Ecken geführt
    const trims = sch.positions.filter((r) => r.el === pl.el && r.trim && r.face === face);
    const trimMarks = [], trimBoxes = [];
    for (const h of pl.holes) {
      const hb = G.bbox(h);
      if (hb.x1 - hb.x0 < 0.2 || hb.y1 - hb.y0 < 0.2 || !trims.length) continue;
      for (const dir of ['x', 'y']) {
        const tr = trims.find((r) => r.dir === dir);
        if (!tr) continue;
        const l0 = tr.lap || 0.6;
        for (const side of [-1, 1]) {
          const A = dir === 'x' ? { x: hb.x0 - l0, y: side < 0 ? hb.y0 - 0.08 : hb.y1 + 0.08 } : { x: side < 0 ? hb.x0 - 0.08 : hb.x1 + 0.08, y: hb.y0 - l0 };
          const B2 = dir === 'x' ? { x: hb.x1 + l0, y: A.y } : { x: A.x, y: hb.y1 + l0 };
          const PA = P(A), PB = P(B2);
          o.push(line(PA, PB, { w: 0.55, stroke: '#6b3fa0' }));
          trimBoxes.push({ x0: min(PA.x, PB.x) - 0.6, x1: max(PA.x, PB.x) + 0.6, y0: min(PA.y, PB.y) - 0.6, y1: max(PA.y, PB.y) + 0.6 });
        }
      }
      trimMarks.push(P({ x: hb.x1 + 0.1, y: hb.y1 + 0.1 }));
    }
    // Grundbewehrung: ein Stab je Richtung voll gezeichnet, Verlegebereich quer
    const pos = sch.positions.filter((r) => r.el === pl.el && r.face === face);
    const base = pos.filter((r) => /^Grundbewehrung/.test(r.label));
    const inset = G.offsetPolygon(pl.poly, -b.cnom), ib = G.bbox(inset);
    // Beschriftungen kollisionsfrei setzen: Kästen werden quer zur Leserichtung verschoben, bis sie frei sind
    const placed = trimBoxes.slice();
    const hit = (bx) => placed.some((o2) => bx.x0 < o2.x1 && bx.x1 > o2.x0 && bx.y0 < o2.y1 && bx.y1 > o2.y0);
    const OFFS = [];
    for (let i = -24; i <= 24; i++) for (let j = -24; j <= 24; j++) OFFS.push([i, j]);
    OFFS.sort((a, c2) => Math.hypot(a[0], a[1] * 1.6) - Math.hypot(c2[0], c2[1] * 1.6));
    const label = (anchors, lines, opt) => {
      const sz = opt.size || 2.3, lh = sz * 1.3, wTxt = max(...lines.map((t) => String(t).length)) * sz * 0.52 + 1.6, hTxt = lines.length * lh + 0.8;
      const rot = !!opt.rot, step = lh;
      // Kasten: waagerecht rechts oberhalb des Ankers, gedreht links oberhalb (Text von unten nach oben)
      const boxAt = (ax, ay, dx, dy) => (rot ? { x0: ax - hTxt + dx, x1: ax + dx, y0: ay - wTxt + dy, y1: ay + dy } : { x0: ax + dx, x1: ax + wTxt + dx, y0: ay - hTxt + dy, y1: ay + dy });
      const ok = (bx) => !hit(bx) && bx.x0 > SHEET.m + 1 && bx.x1 < SHEET.W - SHEET.m - 1 && bx.y0 > SHEET.m + 12 && bx.y1 < SHEET.H - SHEET.m - 56;
      let best = null;
      // erst kleine Verschiebungen an allen Ankerpunkten, dann größere (quer zur Leserichtung bevorzugt)
      for (const lim of [2.5, 12, 34]) {
        for (const [ax, ay] of anchors) {
          for (const [i, j] of OFFS) {
            if (Math.hypot(i, j * 1.6) > lim) break;
            const dx = (rot ? j : i) * step, dy = (rot ? i : j) * step, bx = boxAt(ax, ay, dx, dy);
            if (ok(bx)) { best = { bx, dx, dy, ax, ay }; break; }
          }
          if (best) break;
        }
        if (best) break;
      }
      if (!best) best = { bx: boxAt(anchors[0][0], anchors[0][1], 0, 0), dx: 0, dy: 0, ax: anchors[0][0], ay: anchors[0][1] };
      placed.push(best.bx);
      const bx = best.bx, col = opt.fill || '#111', ax = best.ax, ay = best.ay;
      if (Math.hypot(best.dx, best.dy) > 1e-6) {
        const nx = min(max(ax, bx.x0), bx.x1), ny = min(max(ay, bx.y0), bx.y1);
        o.push(line({ x: ax, y: ay }, { x: nx, y: ny }, { w: 0.15, stroke: col }), '<circle cx="' + ax.toFixed(2) + '" cy="' + ay.toFixed(2) + '" r="0.35" fill="' + col + '"/>');
      }
      o.push('<rect x="' + bx.x0.toFixed(2) + '" y="' + bx.y0.toFixed(2) + '" width="' + (bx.x1 - bx.x0).toFixed(2) + '" height="' + (bx.y1 - bx.y0).toFixed(2) + '" fill="#fff" fill-opacity="0.88" stroke="none"/>');
      const gx = rot ? bx.x1 : bx.x0, gy = bx.y1;
      o.push('<g transform="translate(' + gx.toFixed(2) + ' ' + gy.toFixed(2) + ')' + (rot ? ' rotate(-90)' : '') + '">');
      lines.forEach((t, i) => o.push(txt(0.8, -(lines.length - 1 - i) * lh - 0.9, t, { size: sz, fill: col, weight: i === 0 && opt.head ? 700 : opt.weight })));
      o.push('</g>');
    };
    const block = (A, B2, pad) => placed.push({ x0: min(A.x, B2.x) - pad, x1: max(A.x, B2.x) + pad, y0: min(A.y, B2.y) - pad, y1: max(A.y, B2.y) + pad });
    const sTxt = (s) => f2(s * 100, 1).replace(/[.,]0$/, '');
    // Hindernisse: Zulagenbereiche und Durchstanzbereiche dieser Lage
    for (const z of (pl.d.zulagen || []).filter((z2) => z2.face === face)) { const A = P({ x: z.x0, y: z.y1 }), B2 = P({ x: z.x1, y: z.y0 }); placed.push({ x0: A.x, x1: B2.x, y0: A.y, y1: B2.y }); }
    if ((pl.code === 'B') === (face === 'unten')) for (const r of sch.positions.filter((x2) => x2.el === pl.el && x2.colId)) {
      const col = (q.struct.columns || []).find((c2) => c2.id === r.colId), pu = col && (r.below ? col.punchBelow : col.punch);
      if (!pu || !pu.links) continue;
      const rr = rowRad(pu, pu.links.rows - 1), A = P({ x: col.x - col.bx / 2 - rr, y: col.y + col.by / 2 + rr }), B2 = P({ x: col.x + col.bx / 2 + rr, y: col.y - col.by / 2 - rr });
      placed.push({ x0: A.x, x1: B2.x, y0: A.y, y1: B2.y });
    }
    // Grundbewehrung: je Richtung ein Stab in voller Länge mit Stößen (Stäbe versetzt gezeichnet), an Aussparungen unterbrochen
    const pend = [];
    for (const dir of ['x', 'y']) {
      const ps = base.filter((r) => r.dir === dir).sort((a, c2) => c2.n * c2.L - a.n * a.L);
      if (!ps.length) continue;
      const v = dir === 'x' ? ib.y0 + (ib.y1 - ib.y0) * (face === 'unten' ? 0.38 : 0.62) : ib.x0 + (ib.x1 - ib.x0) * (face === 'unten' ? 0.38 : 0.62);
      const pt = (t) => (dir === 'x' ? { x: t, y: v } : { x: v, y: t });
      const l0 = ps[0].lap || 0, runs = [];
      for (const seg of G.scanline(inset, dir, v)) {
        const A = pt(seg[0]), B2 = pt(seg[1]), L = seg[1] - seg[0];
        for (const [t0, t1] of holeSegs(A, B2, pl.holes, b.cnom)) {
          const s0 = seg[0] + t0 * L, Ls = (t1 - t0) * L;
          if (Ls < 0.3) continue;
          runs.push([s0, s0 + Ls]);
          const pcs = pieces(Ls, l0);
          pcs.forEach((Lp, k) => {
            const a0 = s0 + k * (Lp - l0), a1 = a0 + Lp, off = pcs.length > 1 ? (k % 2 ? 0.45 : -0.45) : 0;
            const E0 = P(pt(a0)), E1 = P(pt(a1)), sh = dir === 'x' ? { x: 0, y: off } : { x: off, y: 0 };
            o.push(line(G.add(E0, sh), G.add(E1, sh), { w: 0.7 }));
            for (const E of [E0, E1]) o.push('<circle cx="' + (E.x + sh.x).toFixed(2) + '" cy="' + (E.y + sh.y).toFixed(2) + '" r="0.6" fill="#111"/>');
          });
          block(P(pt(s0)), P(pt(s0 + Ls)), 0.9);
        }
      }
      // Verlegebereich: quer über die ganze Platte
      // Lage der Verlegelinie: abseits von Stützen und Zulagen
      const lo = dir === 'x' ? ib.y0 : ib.x0, hi = dir === 'x' ? ib.y1 : ib.x1, a0 = dir === 'x' ? ib.x0 : ib.y0, a1 = dir === 'x' ? ib.x1 : ib.y1;
      const cols = Lsup ? Lsup.columns : [], zs = (pl.d.zulagen || []).filter((z) => z.face === face);
      const free = (t) => cols.every((c2) => Math.abs((dir === 'x' ? c2.x : c2.y) - t) > 1.2) && zs.every((z) => (dir === 'x' ? t < z.x0 - 0.3 || t > z.x1 + 0.3 : t < z.y0 - 0.3 || t > z.y1 + 0.3));
      const fr = (face === 'unten' ? [0.22, 0.12, 0.32, 0.42, 0.06] : [0.78, 0.88, 0.68, 0.58, 0.94]).map((f) => a0 + f * (a1 - a0));
      const at = fr.find(free) != null ? fr.find(free) : fr[0];
      const D0 = P(dir === 'x' ? { x: at, y: lo } : { x: lo, y: at }), D1 = P(dir === 'x' ? { x: at, y: hi } : { x: hi, y: at });
      o.push(line(D0, D1, { w: 0.3 }));
      for (const E of [D0, D1]) o.push(line({ x: E.x - 1.2, y: E.y - 1.2 }, { x: E.x + 1.2, y: E.y + 1.2 }, { w: 0.4 }));
      block(D0, D1, 0.5);
      // Positionen untereinander am längsten Stababschnitt: Kopfzeile mit Durchmesser, Abstand und Stoß, dann je Position Anzahl und Länge
      const r0 = ps[0], MAXL = 5;
      const lines = ['Ø' + r0.phi + '/' + sTxt(r0.s) + ' – ' + T_('Grundbewehrung {face}, Richtung {dir}', { face: faceT(face), dir }) + (runs.some(([a0, a1]) => a1 - a0 > STOCK) ? ', ' + T_('Stoß l0 = {l0} cm', { l0: f2(l0 * 100, 0) }) : '')];
      ps.slice(0, MAXL).forEach((r) => lines.push(r.pos + ':  ' + T_('{n} St.,  l = {l} m', { n: r.n, l: f2(r.L) })));
      if (ps.length > MAXL) lines.push(T_('+ {n} weitere Pos. (Stablängen an Aussparungen), siehe Liste', { n: ps.length - MAXL }));
      const longest = runs.reduce((a, sg) => (sg[1] - sg[0] > a[1] - a[0] ? sg : a), runs[0] || [0, 0]);
      const anchors = [0.04, 0.55, 0.3, 0.75].map((f) => { const e = P(pt(longest[0] + f * (longest[1] - longest[0]))); return dir === 'x' ? [e.x + 1, e.y - 1.2] : [e.x - 1.2, e.y - 1]; });
      pend.push({ anchors, lines, rot: dir === 'y' });
    }
    for (const lb of pend) label(lb.anchors, lb.lines, { size: 2.3, rot: lb.rot, head: true });
    // Zulagen
    const zuls = (pl.d.zulagen || []).map((z, i) => ({ z, i })).filter(({ z }) => z.face === face);
    for (const { z, i } of zuls) {
      const rp = pos.filter((r) => r.label.startsWith('Zulage Z' + (i + 1) + ' ')).sort((a, c2) => c2.n - a.n);
      const A = P({ x: z.x0, y: z.y1 }), B2 = P({ x: z.x1, y: z.y0 });
      o.push('<rect x="' + A.x.toFixed(2) + '" y="' + A.y.toFixed(2) + '" width="' + (B2.x - A.x).toFixed(2) + '" height="' + (B2.y - A.y).toFixed(2) + '" fill="none" stroke="#b3261e" stroke-width="0.35" stroke-dasharray="2 1"/>');
      const cy = (A.y + B2.y) / 2, cx = (A.x + B2.x) / 2;
      if (z.dir === 'x') o.push(line({ x: A.x + 0.6, y: cy }, { x: B2.x - 0.6, y: cy }, { w: 0.6, stroke: '#b3261e' }));
      else o.push(line({ x: cx, y: A.y + 0.6 }, { x: cx, y: B2.y - 0.6 }, { w: 0.6, stroke: '#b3261e' }));
      const lines = [T_('Zulage Z{i}: Ø{phi}/{s}, Richtung {dir}', { i: i + 1, phi: z.phi, s: sTxt(z.s), dir: z.dir })];
      rp.slice(0, 3).forEach((r) => lines.push(r.pos + ':  ' + T_('{n} St.,  l = {l} m', { n: r.n, l: f2(r.L) })));
      if (rp.length > 3) lines.push(T_('+ {n} weitere Pos.', { n: rp.length - 3 }));
      label([[A.x + 0.4, A.y - 0.4], [A.x + 0.4, B2.y + 0.4 + lines.length * 2.73 + 0.8]], lines, { size: 2.1, fill: '#b3261e', weight: 600 });
    }
    if (trimMarks.length) {
      const lines = [T_('Randbewehrung Aussparungen {face} (freier Rand)', { face: faceT(face) })].concat(trims.slice(0, 4).map((r) => r.pos + ':  ' + T_('{n} Ø{phi}, l = {l} m, Richtung {dir}', { n: r.n, phi: r.phi, l: f2(r.L), dir: r.dir })));
      for (const m of trimMarks) placed.push({ x0: m.x - 0.5, x1: m.x + 0.5, y0: m.y - 0.5, y1: m.y + 0.5 });
      label([[trimMarks[0].x + 0.8, trimMarks[0].y - 0.8]], lines, { size: 2.1, fill: '#6b3fa0', weight: 600 });
    }
    // Durchstanz- und Querkraftbewehrung (nur bei der oberen Lage der gestützten Platte bzw. unteren Lage der Bodenplatte)
    const showLinks = (pl.code === 'B') === (face === 'unten');
    if (showLinks) {
      for (const r of sch.positions.filter((x) => x.el === pl.el && x.colId)) {
        const col = (q.struct.columns || []).find((c) => c.id === r.colId);
        if (!col) continue;
        const pu = r.below ? col.punchBelow : col.punch;
        if (!pu || !pu.links) continue;
        for (let k = 0; k < pu.links.rows; k++) {
          const rr = rowRad(pu, k), A = P({ x: col.x - col.bx / 2 - rr, y: col.y + col.by / 2 + rr }), w2 = (col.bx + 2 * rr) * T.k, h2 = (col.by + 2 * rr) * T.k;
          o.push('<rect x="' + A.x.toFixed(2) + '" y="' + A.y.toFixed(2) + '" width="' + w2.toFixed(2) + '" height="' + h2.toFixed(2) + '" rx="' + (rr * T.k).toFixed(2) + '" fill="none" stroke="#1c5cab" stroke-width="0.3" stroke-dasharray="1 0.8"/>');
        }
        const A = P({ x: col.x + col.bx / 2 + rowRad(pu, pu.links.rows - 1), y: col.y + col.by / 2 + rowRad(pu, pu.links.rows - 1) });
        const t1 = r.pos + ': ' + T_('{n} Bügel Ø{phi}', { n: r.n, phi: r.phi }), t2 = T_('{n} Reihen, sr = {sr} cm', { n: pu.links.rows, sr: f2(pu.links.sr * 100, 0) }), wE = t2.length * 2.1 * 0.52 + 1.6, R0 = P({ x: col.x - col.bx / 2 - 0.5 * pu.d - (pu.links.rows - 1) * pu.links.sr, y: col.y - col.by / 2 - 0.5 * pu.d - (pu.links.rows - 1) * pu.links.sr });
        label([[A.x + 0.5, A.y - 0.5], [A.x + 0.5, R0.y + 6.6], [R0.x - wE - 0.5, A.y - 0.5], [R0.x - wE - 0.5, R0.y + 6.6]], [t1, t2], { size: 2.1, fill: '#1c5cab', weight: 600 });
      }
    }
    // Maßketten außen
    const pb = G.bbox(pl.poly), A0 = P({ x: pb.x0, y: pb.y0 }), A1 = P({ x: pb.x1, y: pb.y0 }), A2 = P({ x: pb.x1, y: pb.y1 });
    o.push(line({ x: A0.x, y: A0.y + 6 }, { x: A1.x, y: A1.y + 6 }, { w: 0.25 }), txt((A0.x + A1.x) / 2, A0.y + 5, f2(pb.x1 - pb.x0), { anchor: 'middle', size: 2.6 }));
    o.push(line({ x: A1.x + 6, y: A1.y }, { x: A2.x + 6, y: A2.y }, { w: 0.25 }), txt(A1.x + 5, (A1.y + A2.y) / 2, f2(pb.y1 - pb.y0), { anchor: 'middle', size: 2.6, rot: -90 }));
    // Positionsliste dieses Blatts
    const listed = pos.concat(face === 'oben' || pl.code === 'B' ? sch.positions.filter((r) => r.el === pl.el && !r.face) : []);
    let ly = SHEET.H - SHEET.m - 52;
    o.push(txt(SHEET.m + 6, ly, T_('Positionen auf diesem Plan'), { size: 2.8, weight: 700 }));
    const RW = 10, CAP = 2 * RW - 1;
    listed.slice(0, listed.length > 2 * RW ? CAP : 2 * RW).forEach((r, i) => o.push(txt(SHEET.m + 6 + Math.floor(i / RW) * 110, ly + 4.3 + (i % RW) * 3.5, r.pos + '  ' + r.n + ' Ø' + r.phi + '  l = ' + f2(r.L) + ' m  ' + shapeText(r.shape) + '  ' + labelText(r.label.replace(/ \((oben|unten)\)$/, '')), { size: 2.1 })));
    if (listed.length > 2 * RW) o.push(txt(SHEET.m + 6 + 110, ly + 4.3 + (RW - 1) * 3.5, T_('… weitere {n} Positionen in der Biegeliste', { n: listed.length - CAP }), { size: 2.1 }));
    o.push(titleBlock(meta, T_(face === 'unten' ? '{el}, untere Bewehrung' : '{el}, obere Bewehrung', { el: elText(pl.el) }), T.sc, no));
    return { title: elText(pl.el) + ' – ' + faceT(face), svg: wrap(o.join('')) };
  }

  /* Außenwände: Abwicklung je Außenkante mit Öffnungen; lotrechte Stäbe als Legende, waagerechte Stäbe und Öffnungszulagen je Kante in einer Tabelle */
  function wallSheet(q, sch, meta, no) {
    const g = q.geo, lv = q.lv, b = q.p.build, o = [frame()], w = q.struct.wall;
    const pos = sch.positions.filter((r) => r.el === 'Außenwände');
    const sTxt = (s) => f2(s * 100, 1).replace(/[.,]0$/, '');
    o.push(txt(SHEET.m + 6, SHEET.m + 9, T_('Außenwände – Abwicklung, Bewehrung innen und außen, d = {d} cm', { d: f2(b.tWall * 100, 0) }), { size: 5, weight: 700 }));
    const vOf = (face) => pos.filter((r) => r.vert && r.face === face);
    const leg = ['außen', 'innen'].map((fc) => { const vs = vOf(fc); return vs.length ? faceT(fc) + ': ' + vs.map((r) => r.pos + ' Ø' + r.phi + '/' + sTxt(r.s) + (/Anschluss/.test(r.label) ? ' (' + T_('Anschluss Sohle') + ')' : ' (' + T_('lotrecht') + ')')).join(', ') : ''; }).filter(Boolean).join('   ·   ');
    o.push(txt(SHEET.m + 6, SHEET.m + 15, T_('Lotrechte Stäbe (braun angedeutet) – {list}', { list: leg }), { size: 2.4, weight: 600 }));
    const Htot = lv.Hint + b.tRoof + b.tFloor, Ltot = g.P + g.n * 1.0;
    const area = { x: SHEET.m + 8, y: SHEET.m + 22, w: SHEET.W - 2 * SHEET.m - 16, h: 100 };
    const sc = SCALES.find((s2) => Ltot * 1000 / s2 <= area.w && Htot * 1000 / s2 <= area.h) || 500, k = 1000 / sc;
    let x = area.x;
    const zE = lv.zEntry != null ? lv.zEntry : lv.zFloorTop, yTop = area.y, Y = (z) => yTop + (lv.zRoofTop - z) * k;
    const sV = w.layers[1].s, sH = w.layers[2].s;
    for (let i = 0; i < g.n; i++) {
      const a = g.out[i], c2 = g.out[(i + 1) % g.n], L = G.dist(a, c2);
      // angedeutete Stäbe zuerst, Öffnungen deckend darüber
      for (let t = sV / 2; t < L; t += sV * Math.max(1, Math.round(0.5 / sV))) o.push(line({ x: x + t * k, y: Y(lv.zRoofTop - b.cnom) }, { x: x + t * k, y: Y(lv.zSlabBot + b.cnom) }, { w: 0.12, stroke: '#9c3d24' }));
      for (let z = lv.zFloorTop + 0.05; z < lv.zCeil; z += sH * Math.max(1, Math.round(0.5 / sH))) o.push(line({ x: x + 0.3, y: Y(z) }, { x: x + L * k - 0.3, y: Y(z) }, { w: 0.12, stroke: '#1c5cab' }));
      o.push('<rect x="' + x.toFixed(2) + '" y="' + Y(lv.zRoofTop).toFixed(2) + '" width="' + (L * k).toFixed(2) + '" height="' + (Htot * k).toFixed(2) + '" fill="none" stroke="#111" stroke-width="0.5"/>');
      o.push(line({ x, y: Y(lv.zCeil) }, { x: x + L * k, y: Y(lv.zCeil) }, { w: 0.2, dash: '1.5 1' }), line({ x, y: Y(lv.zFloorTop) }, { x: x + L * k, y: Y(lv.zFloorTop) }, { w: 0.2, dash: '1.5 1' }));
      for (const L2 of lv.levels.slice(1)) o.push(line({ x, y: Y(L2.zSlabTop) }, { x: x + L * k, y: Y(L2.zSlabTop) }, { w: 0.2, dash: '1.5 1' }), line({ x, y: Y(L2.zCeil) }, { x: x + L * k, y: Y(L2.zCeil) }, { w: 0.2, dash: '1.5 1' }));
      for (const op of g.openings.filter((o2) => o2.outer && !o2.invalid && o2.host === 'e:' + i)) {
        o.push('<rect x="' + (x + (op.pos - op.w / 2) * k).toFixed(2) + '" y="' + Y(zE + op.sill + op.h).toFixed(2) + '" width="' + (op.w * k).toFixed(2) + '" height="' + (op.h * k).toFixed(2) + '" fill="#fff" stroke="#111" stroke-width="0.4"/>');
        o.push(line({ x: x + (op.pos - op.w / 2) * k, y: Y(zE + op.sill + op.h) }, { x: x + (op.pos + op.w / 2) * k, y: Y(zE + op.sill) }, { w: 0.2 }));
        // Zulagen an der Öffnung (rot)
        const ox0 = x + (op.pos - op.w / 2) * k, ox1 = x + (op.pos + op.w / 2) * k, oy0 = Y(zE + op.sill + op.h), oy1 = Y(zE + op.sill), e2 = 1.2;
        o.push(line({ x: ox0 - e2, y: oy0 - 0.8 }, { x: ox1 + e2, y: oy0 - 0.8 }, { w: 0.35, stroke: '#b3261e' }), line({ x: ox0 - e2, y: oy1 + 0.8 }, { x: ox1 + e2, y: oy1 + 0.8 }, { w: 0.35, stroke: '#b3261e' }));
        o.push(line({ x: ox0 - 0.8, y: oy0 - e2 }, { x: ox0 - 0.8, y: oy1 + e2 }, { w: 0.35, stroke: '#b3261e' }), line({ x: ox1 + 0.8, y: oy0 - e2 }, { x: ox1 + 0.8, y: oy1 + e2 }, { w: 0.35, stroke: '#b3261e' }));
      }
      o.push(txt(x + L * k / 2, Y(lv.zSlabBot) + 4, T_('Kante {i}, {l}', { i: i + 1, l: f2(L) }), { anchor: 'middle', size: 2.4 }));
      x += L * k + 6;
    }
    // Tabelle je Kante
    const ty0 = area.y + Htot * k + 12, cols = [SHEET.m + 6, SHEET.m + 18, SHEET.m + 32, SHEET.m + 76, SHEET.m + 120, SHEET.m + 142];
    const heads = [T_('Kante'), T_('Länge m'), T_('waagerecht außen'), T_('waagerecht innen'), T_('Ecken a/i'), T_('Öffnungen')];
    o.push(txt(SHEET.m + 6, ty0, T_('Waagerechte Stäbe und Zulagen je Kante (blau angedeutet, Zulagen rot)'), { size: 2.8, weight: 700 }));
    heads.forEach((h, j) => o.push(txt(cols[j], ty0 + 5, h, { size: 2.2, weight: 700 })));
    o.push(line({ x: SHEET.m + 6, y: ty0 + 6.2 }, { x: SHEET.m + 196, y: ty0 + 6.2 }, { w: 0.2 }));
    const codes = (arr) => arr.map((r) => r.pos).join(', ') || '–';
    const maxRows = Math.floor((SHEET.H - SHEET.m - 8 - (ty0 + 10)) / 4.2);
    for (let i = 0; i < Math.min(g.n, maxRows); i++) {
      const on = pos.filter((r) => r.edges && r.edges.includes(i)), yy = ty0 + 10 + i * 4.2;
      const hz = (fc) => on.filter((r) => r.face === fc && /^Horizontal/.test(r.label));
      const hdr = (fc) => { const a = hz(fc); return a.length ? 'Ø' + a[0].phi + '/' + sTxt(a[0].s) + ': ' + codes(a) : '–'; };
      const cells = [String(i + 1), f2(G.dist(g.out[i], g.out[(i + 1) % g.n])), hdr('außen'), hdr('innen'),
        codes(on.filter((r) => /^Eckstäbe/.test(r.label))), codes(on.filter((r) => /Öffnung/.test(r.label)))];
      cells.forEach((t, j) => { const mx = j === 2 || j === 3 ? 38 : j === 5 ? 46 : 18; o.push(txt(cols[j], yy, t.length > mx ? t.slice(0, mx - 1) + '…' : t, { size: 2.1 })); });
    }
    if (g.n > maxRows) o.push(txt(SHEET.m + 6, ty0 + 10 + maxRows * 4.2, T_('… weitere Kanten in der Biegeliste'), { size: 2.1 }));
    // Positionsliste rechts neben der Tabelle, oberhalb des Schriftfelds
    const lx = SHEET.m + 202, ly0 = ty0, rowsPer = Math.floor((SHEET.H - SHEET.m - 46 - (ly0 + 4.5)) / 3.8), colW = 104;
    o.push(txt(lx, ly0, T_('Positionen Außenwände'), { size: 2.8, weight: 700 }));
    const cap = rowsPer * 2;
    pos.slice(0, cap).forEach((r, i) => o.push(txt(lx + Math.floor(i / rowsPer) * colW, ly0 + 4.5 + (i % rowsPer) * 3.8, r.pos + '  ' + r.n + ' Ø' + r.phi + '  l = ' + f2(r.L) + '  ' + (r.shape.code === 'gerade' ? '' : shapeText(r.shape) + '  ') + labelText(r.label), { size: 2.0 })));
    if (pos.length > cap) o.push(txt(lx, SHEET.H - SHEET.m - 44, T_('… weitere {n} Positionen in der Biegeliste', { n: pos.length - cap }), { size: 2.0 }));
    o.push(titleBlock(meta, T_('Außenwände, Abwicklung'), sc, no));
    return { title: T_('Außenwände'), svg: wrap(o.join('')) };
  }

  /* Stützen und Unterzüge: Querschnitte 1 : 20 und Ansichten; bei vielen Bauteilen auf Folgeblättern */
  function memberSheets(q, sch, meta, no0) {
    const g = q.geo, st = q.struct, out = [];
    const k = 1000 / 20, yMax = SHEET.H - SHEET.m - 48;
    const types = [];
    for (const c of st.columns || []) {
      const key = [c.bx, c.by, c.design.nb, c.design.phi, c.design.stirrup.phi, c.design.stirrup.s].join('|');
      const t = types.find((x) => x.key === key);
      if (t) t.same.push(c); else types.push({ key, c, same: [c] });
    }
    const beams = (st.beams || []).filter((bd) => bd.field && !bd.unsupported);
    let o = null, x = 0, y = 0, page = 0;
    const start = () => { o = [frame()]; page++; o.push(txt(SHEET.m + 6, SHEET.m + 9, T_('Stützen und Unterzüge') + (page > 1 ? ' (' + T_('Fortsetzung') + ')' : ''), { size: 5, weight: 700 })); x = SHEET.m + 10; y = SHEET.m + 18; };
    const finish = () => { o.push(titleBlock(meta, T_('Stützen und Unterzüge') + (page > 1 ? ', ' + T_('Blatt {n}', { n: page }) : ''), 20, no0 + out.length)); out.push({ title: T_('Stützen und Unterzüge') + (page > 1 ? ' (' + page + ')' : ''), svg: wrap(o.join('')) }); };
    start();
    const cc0 = (q.mat && q.mat.colCover) || BP.calc.COL_COVER;
    for (const { c, same } of types) {
      const W = c.bx * k, H = c.by * k, cc = cc0 * k, d = c.design;
      if (x + max(W, 60) > SHEET.W - SHEET.m - 4) { x = SHEET.m + 10; y += 70; }
      if (y + H + 14 > yMax) { finish(); start(); }
      o.push('<rect x="' + x + '" y="' + y + '" width="' + W + '" height="' + H + '" fill="#f4f4f4" stroke="#111" stroke-width="0.5"/>');
      o.push('<rect x="' + (x + cc) + '" y="' + (y + cc) + '" width="' + (W - 2 * cc) + '" height="' + (H - 2 * cc) + '" rx="1" fill="none" stroke="#9c3d24" stroke-width="' + (d.stirrup.phi / 1000 * k) + '"/>');
      const r0 = d.phi / 2000 * k, off = cc + d.stirrup.phi / 1000 * k + r0, pts = [];
      const per = Math.max(0, (d.nb - 4) / 2), nx = Math.round(per * c.bx / (c.bx + c.by)), ny = Math.round(per - nx);
      for (let i = 0; i <= nx + 1; i++) { const t = x + off + (W - 2 * off) * i / (nx + 1); pts.push([t, y + off], [t, y + H - off]); }
      for (let j = 1; j <= ny; j++) { const t = y + off + (H - 2 * off) * j / (ny + 1); pts.push([x + off, t], [x + W - off, t]); }
      for (const [px, py] of pts.slice(0, d.nb)) o.push('<circle cx="' + px.toFixed(2) + '" cy="' + py.toFixed(2) + '" r="' + r0.toFixed(2) + '" fill="#9c3d24"/>');
      const nm = same.map((x2) => g.labels['c:' + x2.id] || T_('Stütze')).join(', ');
      const lab = (what) => sch.positions.find((r) => r.el === 'Stützen' && r.label.startsWith((g.labels['c:' + c.id] || T_('Stütze')) + ': ' + what));
      const pL = lab('Längs'), pB = lab('Bügel'), pA = lab('Anschluss');
      o.push(txt(x, y + H + 4, nm.length > 46 ? nm.slice(0, 44) + '…' : nm, { size: 2.4, weight: 600 }));
      o.push(txt(x, y + H + 8, f2(c.bx * 100, 0) + ' × ' + f2(c.by * 100, 0) + ' cm, ' + d.nb + ' Ø' + d.phi + (pL ? ' (' + pL.pos + (pA ? ', ' + T_('Anschluss {pos}', { pos: pA.pos }) : '') + ')' : '') + ', ' + T_('Bügel Ø{phi}/{s}', { phi: d.stirrup.phi, s: f2(d.stirrup.s * 100, 0) }) + (pB ? ' (' + pB.pos + ')' : ''), { size: 2.2 }));
      o.push(txt(x, y + H + 12, T_('NEd = {n} kN, c = {c} mm, Enden Bügel /{s}', { n: f2(c.nEd, 0), c: f2(cc0 * 1000, 0), s: f2(d.stirrup.sEnd * 100, 0) }), { size: 2.2 }));
      x += max(W, 60) + 14;
    }
    if (types.length) { y += 75; x = SHEET.m + 10; }
    for (const bd of beams) {
      const sc = SCALES.find((s2) => bd.L * 1000 / s2 <= SHEET.W - 2 * SHEET.m - 30) || 200, kk = 1000 / sc, h = bd.h * kk;
      if (y + h + 30 > yMax) { finish(); start(); }
      const x0 = SHEET.m + 14;
      o.push('<rect x="' + x0 + '" y="' + y + '" width="' + (bd.L * kk).toFixed(2) + '" height="' + h.toFixed(2) + '" fill="#f4f4f4" stroke="#111" stroke-width="0.4"/>');
      for (const sp of bd.sups) o.push('<path d="M' + (x0 + sp.s * kk).toFixed(2) + ' ' + (y + h).toFixed(2) + 'l-2 3h4z" fill="#111"/>');
      o.push(line({ x: x0 + 1, y: y + h - 1.2 }, { x: x0 + bd.L * kk - 1, y: y + h - 1.2 }, { w: 0.6, stroke: '#9c3d24' }));
      bd.sups.slice(1, -1).forEach((sp, i) => { const L1 = 0.25 * (sp.s - bd.sups[i].s), L2 = 0.25 * (bd.sups[i + 2].s - sp.s); o.push(line({ x: x0 + (sp.s - L1) * kk, y: y + 1.2 }, { x: x0 + (sp.s + L2) * kk, y: y + 1.2 }, { w: 0.6, stroke: '#9c3d24' })); });
      const stp = bd.shear.stirrups;
      if (stp) for (let s2 = 0.05; s2 < bd.L; s2 += Math.max(stp.s, bd.L / 60)) o.push(line({ x: x0 + s2 * kk, y: y + 0.8 }, { x: x0 + s2 * kk, y: y + h - 0.8 }, { w: 0.12, stroke: '#9c3d24' }));
      const nm = g.labels['b:' + bd.id] || T_('Unterzug');
      const ps = sch.positions.filter((r) => r.el === 'Unterzüge' && r.label.startsWith(nm + ':'));
      o.push(txt(x0, y - 2, T_('{name} {b}/{h} cm, l = {l} m, M 1 : {sc}', { name: nm, b: f2(bd.bw * 100, 0), h: f2(bd.h * 100, 0), l: f2(bd.L), sc }), { size: 2.6, weight: 600 }));
      o.push(txt(x0, y + h + 7, ps.map((r) => r.pos + ': ' + r.n + ' Ø' + r.phi + ' ' + partText(r.label.replace(nm + ': ', ''))).join('   '), { size: 2.2 }));
      y += h + 20;
    }
    if (!types.length && !beams.length) o.push(txt(SHEET.m + 10, SHEET.m + 30, T_('Keine Stützen oder Unterzüge geplant.'), { size: 3 }));
    finish();
    return out;
  }

  /* Innenwände, Schachtwände und Treppen: Ansichten der Wände mit Öffnungen, Treppenschnitt, Positionen */
  function innerSheets(q, sch, meta, no0) {
    const g = q.geo, st = q.struct, out = [];
    const walls = (st.intWalls || []).map((iw) => ({ iw, Lg: g.L[iw.level || 0] }));
    const stairs = g.vert.stairs.filter((s2) => s2.design && s2.design.phi);
    if (!walls.length && !stairs.length) return out;
    const yMax = SHEET.H - SHEET.m - 50;
    let o = null, x = 0, y = 0, rowH = 0, page = 0;
    const start = () => { o = [frame()]; page++; o.push(txt(SHEET.m + 6, SHEET.m + 9, T_('Innenwände, Schachtwände und Treppen') + (page > 1 ? ' (' + T_('Fortsetzung') + ')' : ''), { size: 5, weight: 700 })); x = SHEET.m + 10; y = SHEET.m + 20; rowH = 0; };
    const finish = () => { o.push(titleBlock(meta, T_('Innenwände, Schachtwände, Treppen') + (page > 1 ? ', ' + T_('Blatt {n}', { n: page }) : ''), 50, no0 + out.length)); out.push({ title: T_('Innenwände und Treppen') + (page > 1 ? ' (' + page + ')' : ''), svg: wrap(o.join('')) }); };
    start();
    const k = 1000 / 50;
    const place = (w, h) => { if (x + w > SHEET.W - SHEET.m - 6) { x = SHEET.m + 10; y += rowH + 16; rowH = 0; } if (y + h + 12 > yMax) { finish(); start(); } const at = { x, y }; x += w + 12; rowH = max(rowH, h); return at; };
    for (const { iw, Lg } of walls) {
      const L = iw.len, H = Lg.H, W = L * k, Hh = H * k, at = place(max(W, 46), Hh);
      const nm = iw.auto ? T_('Schachtwand {name}', { name: g.labels['v:' + iw.auto] || T_('Aufzug') }) : (g.labels['w:' + iw.id] || T_('Innenwand'));
      o.push('<rect x="' + at.x.toFixed(2) + '" y="' + at.y.toFixed(2) + '" width="' + W.toFixed(2) + '" height="' + Hh.toFixed(2) + '" fill="#f4f4f4" stroke="#111" stroke-width="0.4"/>');
      const s2 = iw.layer.s;
      for (let t = s2 / 2; t < L; t += s2 * Math.max(1, Math.round(0.4 / s2))) o.push(line({ x: at.x + t * k, y: at.y + 0.6 }, { x: at.x + t * k, y: at.y + Hh - 0.6 }, { w: 0.12, stroke: '#9c3d24' }));
      for (let z = 0.05; z < H; z += s2 * Math.max(1, Math.round(0.4 / s2))) o.push(line({ x: at.x + 0.6, y: at.y + Hh - z * k }, { x: at.x + W - 0.6, y: at.y + Hh - z * k }, { w: 0.12, stroke: '#1c5cab' }));
      for (const op of Lg.openings.filter((o2) => o2.host === 'w:' + iw.id && !o2.invalid)) o.push('<rect x="' + (at.x + (op.pos - op.w / 2) * k).toFixed(2) + '" y="' + (at.y + Hh - (op.sill + op.h) * k).toFixed(2) + '" width="' + (op.w * k).toFixed(2) + '" height="' + (op.h * k).toFixed(2) + '" fill="#fff" stroke="#111" stroke-width="0.35"/>');
      const ps = sch.positions.filter((r) => (r.el === 'Innenwände' || r.el === 'Aufzugsschacht') && r.label.startsWith(nm + ':')).map((r) => r.pos);
      o.push(txt(at.x, at.y - 1.5, nm + ', d = ' + f2(iw.t * 100, 0) + ' cm, l = ' + f2(L), { size: 2.3, weight: 600 }));
      o.push(txt(at.x, at.y + Hh + 4, T_('Ø{phi}/{s} beidseitig: {list}', { phi: iw.layer.phi, s: f2(s2 * 100, 1).replace(/[.,]0$/, ''), list: ps.join(', ') || '–' }), { size: 2.1 }));
    }
    for (const s2 of stairs) {
      const d = s2.design, W = s2.span * k, Hh = s2.dh * k, at = place(max(W, 50), Hh + 6);
      const A = { x: at.x, y: at.y }, B2 = { x: at.x + s2.run * k, y: at.y + Hh };
      o.push(line(A, B2, { w: d.t * k, stroke: '#cfd3d0' }), line(A, B2, { w: 0.3 }));
      const nx = (B2.x - A.x), ny = (B2.y - A.y), ln = Math.hypot(nx, ny), off = { x: -ny / ln * (d.t * k / 2 - (d.cnom || 0.03) * k), y: nx / ln * (d.t * k / 2 - (d.cnom || 0.03) * k) };
      o.push(line(G.add(A, off), G.add(B2, off), { w: 0.5, stroke: '#9c3d24' }));
      const nm = g.labels['v:' + s2.id] || T_('Innentreppe');
      const ps = sch.positions.filter((r) => r.el === 'Innentreppen' && r.label.startsWith(nm + ':')).map((r) => r.pos);
      o.push(txt(at.x, at.y - 1.5, T_('{name}, Laufplatte {t} cm, l = {l}', { name: nm, t: f2(d.t * 100, 0), l: f2(s2.span) }), { size: 2.3, weight: 600 }));
      o.push(txt(at.x, at.y + Hh + 6, T_('unten Ø{phi}/{s}, quer Ø{phi2}/{s2}: {list}', { phi: d.phi, s: f2(d.s * 100, 1).replace(/[.,]0$/, ''), phi2: d.distr.phi, s2: f2(d.distr.s * 100, 0), list: ps.join(', ') || '–' }), { size: 2.1 }));
    }
    // Positionsliste
    const pos = sch.positions.filter((r) => ['Innenwände', 'Aufzugsschacht', 'Innentreppen'].includes(r.el));
    let ly = max(y + rowH + 16, SHEET.H - SHEET.m - 92);
    if (ly + 10 > yMax) { finish(); start(); ly = SHEET.m + 20; }
    o.push(txt(SHEET.m + 6, ly, T_('Positionen'), { size: 2.8, weight: 700 }));
    const RW = Math.max(4, Math.floor((SHEET.H - SHEET.m - 46 - ly - 4) / 3.6));
    pos.slice(0, 2 * RW).forEach((r, i) => o.push(txt(SHEET.m + 6 + Math.floor(i / RW) * 120, ly + 4.3 + (i % RW) * 3.6, r.pos + '  ' + r.n + ' Ø' + r.phi + '  l = ' + f2(r.L) + '  ' + (r.shape.code === 'gerade' ? '' : shapeText(r.shape) + '  ') + labelText(r.label), { size: 2.0 })));
    if (pos.length > 2 * RW) o.push(txt(SHEET.m + 246, ly + 4.3, T_('… weitere {n} Positionen in der Biegeliste', { n: pos.length - 2 * RW }), { size: 2.0 }));
    finish();
    return out;
  }

  /* kleine Skizze einer Biegeform für die Biegeliste (Breite ~ 34 mm) */
  function shapeSketch(sh) {
    const W = 34, H = 7, o = [];
    const l = (a, b2) => line(a, b2, { w: 0.5, stroke: '#111' });
    const lab = (x, y, t) => txt(x, y, t, { size: 1.9, anchor: 'middle' });
    const cm = (v) => (v * 100).toFixed(0);
    if (sh.code === 'gerade') { o.push(l({ x: 2, y: H / 2 }, { x: W - 2, y: H / 2 }), lab(W / 2, H / 2 - 1, cm(sh.legs[0]))); }
    else if (sh.code === 'L') { o.push(l({ x: 3, y: 1.5 }, { x: 3, y: H - 1.5 }), l({ x: 3, y: H - 1.5 }, { x: W - 3, y: H - 1.5 }), lab(7, H / 2, cm(sh.legs[0])), lab(W / 2, H - 2.3, cm(sh.legs[1]))); }
    else if (sh.code === 'U') { o.push(l({ x: 3, y: 1.5 }, { x: 3, y: H - 1.5 }), l({ x: 3, y: H - 1.5 }, { x: W - 3, y: H - 1.5 }), l({ x: W - 3, y: H - 1.5 }, { x: W - 3, y: 1.5 }), lab(W / 2, H - 2.3, cm(sh.legs[1])), lab(7, 3.5, cm(sh.legs[0]))); }
    else { o.push('<rect x="8" y="1" width="18" height="' + (H - 2) + '" fill="none" stroke="#111" stroke-width="0.5"/>', l({ x: 8, y: 1 }, { x: 11, y: 3.5 }), l({ x: 8.6, y: 1 }, { x: 11.6, y: 3.5 }), lab(17, H / 2 + 0.7, cm(sh.legs[1]) + '/' + cm(sh.legs[2]))); }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + 'mm" height="' + H + 'mm">' + o.join('') + '</svg>';
  }

  /* Alle Pläne: Platten (untere und obere Lage), Außenwände, Stützen und Unterzüge */
  /* ---------- Detailblätter: Rahmenecke mit Arbeitsfuge, Wand–Sohle mit Fugenblech, Durchführung, Türöffnung, Unterstützungen ----------
   * Parametrisch aus der Bemessung (Dicken, Betondeckung, Stabdurchmesser und -abstände, Übergreifungslängen), Maßstab 1 : 10
   * bzw. 1 : 20. Schematisch: maßgebend sind Biegeliste und Bewehrungspläne. */
  function detailSheets(q, sch, meta, no0) {
    const b = q.p.build, st = q.struct, mat = q.mat, c = b.cnom, C = BP.calc, wu = b.waterproofing === 'wu' || b.waterproofing === 'wu_fbv';
    const deP = prof().code === 'EC' && prof().na === 'DE';
    const lap = (phi, poor) => (C && C.lapLength ? C.lapLength(phi, mat, poor) : 50 * phi / 1000);
    const lay = (pl, face) => { const ls = ((pl && pl.layers) || []).filter((l) => l.face === face); return ls.length ? ls.reduce((a, l) => (l.phi > a.phi || (l.phi === a.phi && l.s < a.s) ? l : a)) : { phi: 12, s: 0.15 }; };
    const W = st.wall || {}, wl = (key) => (W.layers || []).find((l) => l.key === key) || { phi: 12, s: 0.15 };
    const vo = wl('vo'), vi = wl('vi'), hz = wl('h'), rT = lay(st.roof, 'oben'), rB = lay(st.roof, 'unten'), fT = lay(st.floor, 'oben'), fB = lay(st.floor, 'unten');
    const sT = (s2) => f2(s2 * 100, 1).replace(/[.,]0$/, '');
    const BAR = '#9c3d24', JOINT = '#1c5cab';
    const out = [];
    // Hilfen: Detailrahmen mit Ursprung (Meter → Papier), Beschriftung mit Hinweislinie, Maßkette
    const cell = (x0, y0, w, h, title, scale, ox, oy) => {
      const k = 1000 / scale, o = [];
      o.push('<rect x="' + x0 + '" y="' + y0 + '" width="' + w + '" height="' + h + '" fill="none" stroke="#111" stroke-width="0.3"/>');
      o.push(txt(x0 + 3, y0 + 6, title, { size: 3.4, weight: 700 }), txt(x0 + w - 3, y0 + 6, '1 : ' + scale, { size: 2.6, anchor: 'end' }));
      const P = (x, y) => ({ x: x0 + ox + x * k, y: y0 + oy - y * k });
      return { o, P, k };
    };
    const poly2 = (P, pts, o2) => polyS(pts.map(([x, y]) => P(x, y)), o2);
    const bar = (P, pts, w2) => '<polyline points="' + pts.map(([x, y]) => { const p2 = P(x, y); return p2.x.toFixed(2) + ',' + p2.y.toFixed(2); }).join(' ') + '" fill="none" stroke="' + BAR + '" stroke-width="' + (w2 || 0.6) + '" stroke-linejoin="round"/>';
    const dot = (P, x, y, phi, k) => { const p2 = P(x, y); return '<circle cx="' + p2.x.toFixed(2) + '" cy="' + p2.y.toFixed(2) + '" r="' + max(0.45, phi / 2000 * k).toFixed(2) + '" fill="' + BAR + '"/>'; };
    // Positionsnummer im Detail (Kreis mit Hinweislinie) und Legende unten in der Zelle
    let legend = [];
    const note = (P, x, y, tx, ty, t) => { const n = legend.length + 1, a = P(x, y), b2 = P(tx, ty); legend.push(t); return line(a, b2, { w: 0.15 }) + '<circle cx="' + b2.x.toFixed(2) + '" cy="' + b2.y.toFixed(2) + '" r="2.1" fill="#fff" stroke="#111" stroke-width="0.25"/>' + txt(b2.x, b2.y + 0.9, String(n), { size: 2.4, anchor: 'middle', weight: 700 }); };
    const legendOut = (x0, y0, w) => { const o2 = legend.map((t, i) => txt(x0 + 3, y0 + i * 3.7, (i + 1) + '  ' + (t.length > w ? t.slice(0, w - 1) + '…' : t), { size: 2.2 })); legend = []; return o2.join(''); };
    const dim = (P, x1, y1, x2, y2, t, off) => {
      const a = P(x1, y1), b2 = P(x2, y2), hor = Math.abs(a.y - b2.y) < 0.01, d2 = off || 4;
      const A2 = hor ? { x: a.x, y: a.y + d2 } : { x: a.x + d2, y: a.y }, B2 = hor ? { x: b2.x, y: b2.y + d2 } : { x: b2.x + d2, y: b2.y };
      const m = { x: (A2.x + B2.x) / 2, y: (A2.y + B2.y) / 2 };
      return line(A2, B2, { w: 0.15 }) + line({ x: A2.x - 0.8, y: A2.y + 0.8 }, { x: A2.x + 0.8, y: A2.y - 0.8 }, { w: 0.25 }) + line({ x: B2.x - 0.8, y: B2.y + 0.8 }, { x: B2.x + 0.8, y: B2.y - 0.8 }, { w: 0.25 }) +
        (hor ? txt(m.x, m.y - 0.8, t, { size: 2.1, anchor: 'middle' }) : txt(m.x + 1.2, m.y + 0.8, t, { size: 2.1, rot: -90, anchor: 'middle' }));
    };
    const fill = { fill: '#eef0ee', w: 0.45 };
    const tW = b.tWall, tR = b.tRoof, tF = b.tFloor, ovh = max(0, b.overhang || 0);
    // ---------- Blatt 1 ----------
    {
      const o = [frame(), txt(SHEET.m + 6, SHEET.m + 9, T_('Details: Rahmenecke, Wand–Bodenplatte, Durchführung'), { size: 5, weight: 700 })];
      // D1 Rahmenecke Außenwand – Decke mit Arbeitsfuge
      {
        const D = cell(SHEET.m + 6, SHEET.m + 14, 128, 150, T_('D1 Rahmenecke Außenwand – Decke'), 10, 14, 18), P = D.P, k = D.k;
        const xs = 1.0, yb = -0.85;
        D.o.push(poly2(P, [[0, 0], [xs, 0], [xs, -tR], [tW, -tR], [tW, yb], [0, yb]], fill));
        D.o.push(line(P(-0.12, 0.08), P(-0.12, yb), { w: 0.2, dash: '1 0.8' }), txt(P(-0.14, -0.35).x, P(-0.14, -0.35).y, T_('Abdichtung / Schutz nach Konzept'), { size: 2, rot: -90, anchor: 'middle' }));
        // Arbeitsfuge unter der Decke
        D.o.push(line(P(0, -tR), P(tW, -tR), { w: 0.25, dash: '2 1' }));
        if (wu) D.o.push(line(P(tW / 2, -tR - 0.15), P(tW / 2, -tR + 0.15), { w: 1.0, stroke: JOINT }));
        const xo = c + hz.phi / 1000 + vo.phi / 2000, xi = tW - c - hz.phi / 1000 - vi.phi / 2000, yT = -(c + rT.phi / 2000), yB = -(tR - c - rB.phi / 2000);
        const legTop = max(0.25, lap(vo.phi, true));
        D.o.push(bar(P, [[xo, yb], [xo, yT - 0.012], [xo + legTop, yT - 0.012]], 0.7));
        D.o.push(bar(P, [[xi, yb], [xi, yB + 0.012], [xi + 0.25, yB + 0.012]]));
        D.o.push(bar(P, [[c, yT], [xs, yT]]), bar(P, [[c + 0.02, yB], [xs, yB]]));
        for (let y = -tR - 0.1; y > yb + 0.05; y -= hz.s) D.o.push(dot(P, c + hz.phi / 2000, y, hz.phi, k), dot(P, tW - c - hz.phi / 2000, y, hz.phi, k));
        for (let x = tW + 0.05; x < xs - 0.02; x += max(rT.s, 0.1)) D.o.push(dot(P, x, yT - rT.phi / 1000, rT.phi, k), dot(P, x, yB + rB.phi / 1000, rB.phi, k));
        D.o.push(note(P, xo + legTop * 0.6, yT - 0.012, xo + legTop * 0.6 + 0.05, 0.1, T_('Wand außen Ø{phi}/{s}, Winkel in die Decke l = {l} (Biegerolle 15 Ø)', { phi: vo.phi, s: sT(vo.s), l: f2(legTop) })));
        D.o.push(note(P, 0.85, yT, 0.92, 0.1, T_('Decke oben Ø{phi}/{s}, Übergreifung l0 = {l0} (mäßiger Verbund)', { phi: rT.phi, s: sT(rT.s), l0: f2(lap(vo.phi, true)) })));
        D.o.push(note(P, 0.85, yB, 0.92, -tR - 0.1, T_('Decke unten Ø{phi}/{s}', { phi: rB.phi, s: sT(rB.s) })));
        D.o.push(note(P, xi, -0.7, 0.5, -0.65, T_('Wand innen Ø{phi}/{s}', { phi: vi.phi, s: sT(vi.s) })));
        D.o.push(note(P, tW - c - hz.phi / 2000, -0.8, 0.5, -0.8, T_('waagerecht je Seite Ø{phi}/{s}, außen liegend', { phi: hz.phi, s: sT(hz.s) })));
        D.o.push(note(P, tW / 2, -tR - (wu ? 0.1 : 0), 0.5, -tR - 0.12, wu ? T_('Fugenblech 300 × 1,5 mm mittig, je 15 cm einbinden') : T_('Arbeitsfuge aufgeraut, Abdichtung nach Konzept')));
        D.o.push(dim(P, 0, yb, tW, yb, f2(tW), 5), dim(P, xs, 0, xs, -tR, f2(tR), 4));
        D.o.push(legendOut(SHEET.m + 6, SHEET.m + 14 + 118, 100));
        o.push(...D.o);
      }
      // D2 Wand – Bodenplatte mit Anschlussbewehrung und Fugenblech
      {
        const D = cell(SHEET.m + 140, SHEET.m + 14, 128, 150, T_('D2 Außenwand – Bodenplatte'), 10, 22, 74), P = D.P, k = D.k;
        const xs = 0.95, yt = 0.58, xl = -max(ovh, 0.1);
        D.o.push(poly2(P, [[xl, 0], [0, 0], [0, yt], [tW, yt], [tW, 0], [xs, 0], [xs, -tF], [xl, -tF]], fill));
        D.o.push(line(P(xl - 0.02, -tF - 0.05), P(xs, -tF - 0.05), { w: 0.2 }), txt(P(xs, -tF - 0.1).x, P(xs, -tF - 0.1).y + 1, T_('Sauberkeitsschicht'), { size: 2, anchor: 'end' }));
        D.o.push(line(P(0, 0), P(tW, 0), { w: 0.25, dash: '2 1' }));
        if (wu) D.o.push(line(P(tW / 2, -0.15), P(tW / 2, 0.15), { w: 1.0, stroke: JOINT }));
        const yT = -(c + fT.phi / 2000), yB = -(tF - c - fB.phi / 2000), xo = c + hz.phi / 1000 + vo.phi / 2000, xi = tW - c - hz.phi / 1000 - vi.phi / 2000;
        D.o.push(bar(P, [[xl + c, yT], [xs, yT]]), bar(P, [[xl + c, yB], [xs, yB]]));
        D.o.push(bar(P, [[xl + c, yT - 0.012], [xl + c - 0.0, yB + 0.012]], 0.45));
        const l0o = lap(vo.phi), l0i = lap(vi.phi), legB = max(0.25, l0o);
        D.o.push(bar(P, [[xo + legB, yB + 0.014], [xo, yB + 0.014], [xo, min(yt - 0.02, l0o)]], 0.7));
        D.o.push(bar(P, [[xi + 0.25, yB + 0.014], [xi, yB + 0.014], [xi, min(yt - 0.02, l0i)]], 0.7));
        D.o.push(bar(P, [[xo + 0.006, 0.06], [xo + 0.006, yt]]), bar(P, [[xi - 0.006, 0.06], [xi - 0.006, yt]]));
        for (let y = 0.05; y < yt; y += hz.s) D.o.push(dot(P, c + hz.phi / 2000, y, hz.phi, k), dot(P, tW - c - hz.phi / 2000, y, hz.phi, k));
        D.o.push(note(P, xo, 0.45, -0.14, 0.5, T_('Anschlussbewehrung außen Ø{phi}/{s}, Winkel, Übergreifung l0 = {l0}', { phi: vo.phi, s: sT(vo.s), l0: f2(l0o) })));
        D.o.push(note(P, xi, 0.3, 0.55, 0.42, T_('Anschlussbewehrung innen Ø{phi}/{s}, l0 = {l0}', { phi: vi.phi, s: sT(vi.s), l0: f2(l0i) })));
        D.o.push(note(P, 0.8, yT, 1.04, yT + 0.02, T_('Sohle oben Ø{phi}/{s}', { phi: fT.phi, s: sT(fT.s) })));
        D.o.push(note(P, 0.8, yB, 1.04, yB, T_('Sohle unten Ø{phi}/{s}', { phi: fB.phi, s: sT(fB.s) })));
        D.o.push(note(P, xl + c, -tF / 2, xl - 0.12, -tF / 2, T_('Randeinfassung Steckbügel')));
        D.o.push(note(P, tW / 2, wu ? 0.1 : 0, 0.55, 0.24, wu ? T_('Fugenblech 300 × 1,5 mm mittig, je 15 cm einbinden') : T_('Arbeitsfuge aufgeraut')));
        const pe = P(xs - 0.25, yB + 0.06); D.o.push('<rect x="' + (pe.x - 0.9).toFixed(2) + '" y="' + (pe.y - 0.3).toFixed(2) + '" width="1.8" height="0.6" fill="#555"/>', note(P, xs - 0.25, yB + 0.06, 1.04, yB + 0.1, T_('Fundamenterder DIN 18014 (Bandstahl), Anschlussfahnen')));
        D.o.push(dim(P, 0, yt, tW, yt, f2(tW), -5), dim(P, xl, 0, xl, -tF, f2(tF), -9));
        D.o.push(legendOut(SHEET.m + 140, SHEET.m + 14 + 124, 100));
        o.push(...D.o);
      }
      // D3 Durchführung mit Futterrohr
      {
        const routes = (q.routes && q.routes.list) || [];
        const dMax = routes.reduce((m, r) => max(m, r.src && r.src.shape !== 'rechteck' ? r.src.d || 0 : 0), 0) || 0.125;
        const dF = dMax + 0.1, D = cell(SHEET.m + 274, SHEET.m + 14, 126, 150, T_('D3 Durchführung in der Außenwand'), 10, 46, 68), P = D.P, k = D.k;
        const yc = 0, hh = 0.48;
        D.o.push(poly2(P, [[0, hh], [tW, hh], [tW, -hh], [0, -hh]], fill));
        D.o.push('<rect x="' + P(-0.05, yc + dF / 2).x.toFixed(2) + '" y="' + P(-0.05, yc + dF / 2).y.toFixed(2) + '" width="' + ((tW + 0.1) * k).toFixed(2) + '" height="' + (dF * k).toFixed(2) + '" fill="#fff" stroke="#111" stroke-width="0.5"/>');
        D.o.push(line(P(tW / 2, yc + dF / 2 + 0.06), P(tW / 2, yc + dF / 2), { w: 1.2 }), line(P(tW / 2, yc - dF / 2 - 0.06), P(tW / 2, yc - dF / 2), { w: 1.2 }));
        D.o.push('<rect x="' + P(-0.05, yc + dMax / 2).x.toFixed(2) + '" y="' + P(-0.05, yc + dMax / 2).y.toFixed(2) + '" width="' + ((tW + 0.1) * k).toFixed(2) + '" height="' + (dMax * k).toFixed(2) + '" fill="#dfe6ef" stroke="#1c5cab" stroke-width="0.4"/>');
        const xo = c + hz.phi / 1000 + vo.phi / 2000, xi = tW - c - hz.phi / 1000 - vi.phi / 2000;
        for (const x of [xo, xi]) { D.o.push(bar(P, [[x, hh], [x, yc + dF / 2 + 0.04]]), bar(P, [[x, -hh], [x, yc - dF / 2 - 0.04]])); }
        for (const y of [yc + dF / 2 + 0.06, yc - dF / 2 - 0.06]) D.o.push(dot(P, c + 0.008, y, 12, k), dot(P, c + 0.03, y, 12, k), dot(P, tW - c - 0.008, y, 12, k), dot(P, tW - c - 0.03, y, 12, k));
        D.o.push(note(P, tW / 2, yc + dF / 2 + 0.06, tW + 0.15, 0.32, T_('Futterrohr DN {dn} mit Mauerkragen (Dichtflansch) mittig', { dn: Math.round(dF * 1000) })));
        D.o.push(note(P, tW, yc, tW + 0.15, yc, T_('Medienrohr Ø {d}, Ringraumdichtung gas- und druckwasserdicht', { d: Math.round(dMax * 1000) })));
        D.o.push(note(P, tW - c - 0.03, yc - dF / 2 - 0.06, tW + 0.15, -0.3, T_('Zulagen je Seite und Lage 2 Ø12, l = DN + 2 · l0')));
        D.o.push(note(P, xo, yc + 0.38, -0.15, 0.4, T_('durchtrennte Stäbe seitlich ersetzen, Abstand ≥ 2 Ø')));
        D.o.push(dim(P, 0, -hh, tW, -hh, f2(tW), 5));
        legend.push(T_('Luftleitungen mit Explosionsschutzventil bzw. Absperrklappe, Lage nach Leitungsplan'));
        D.o.push(legendOut(SHEET.m + 274, SHEET.m + 14 + 124, 100));
        o.push(...D.o);
      }
      // Hinweise unten links
      const steps = [deP ? T_('Sauberkeitsschicht, Fundamenterder (DIN 18014) mit Anschlussfahnen') : T_('Sauberkeitsschicht, Fundamenterder mit Anschlussfahnen'), T_('Bodenplatte untere Lage (Abstandhalter cnom), Zulagen unten, Randeinfassung'), T_('Durchstanz- und Querkraftbewehrung, Unterstützungen, obere Lage, Zulagen oben'),
        wu ? T_('Anschlussbewehrung Wände und Stützen, Fugenblech (WU)') : T_('Anschlussbewehrung Wände und Stützen, Fugenblech'), T_('Einbauteile, Futterrohre, Erdung prüfen – Bewehrungsabnahme – Betonage'),
        T_('Wände: Bewehrung, Öffnungszulagen, Türzargen, Futterrohre, Fugenblech oben – Abnahme – Betonage'), T_('Decke: wie Bodenplatte; Winkel der Wandbewehrung in die Decke übergreifen lassen')];
      o.push(txt(SHEET.m + 6, SHEET.m + 172, T_('Verlegereihenfolge'), { size: 3.2, weight: 700 }));
      steps.forEach((t, i) => o.push(txt(SHEET.m + 6, SHEET.m + 178 + i * 4.4, (i + 1) + '. ' + t, { size: 2.3 })));
      o.push(txt(SHEET.m + 6, SHEET.m + 214, T_('Hinweise'), { size: 3.2, weight: 700 }));
      [deP ? T_('Betondeckung cnom = {c} mm (Vorhaltemaß Δc = 15 mm enthalten); Abstandhalter nach DBV-Merkblatt, mindestens 4 Stück je m².', { c: f2(c * 1000, 0) }) : T_('Betondeckung cnom = {c} mm; Abstandhalter mindestens 4 Stück je m².', { c: f2(c * 1000, 0) }), deP ? T_('Stöße nicht in Rahmenecken und nicht im Bereich der größten Momente; Biegerollen nach EC2 8.3 mit NA DE.') : T_('Stöße nicht in Rahmenecken und nicht im Bereich der größten Momente; Biegerollen nach {ref}.', { ref: prof().ref.bend2 }),
        wu ? T_('WU-Konstruktion: Fugenbleche lückenlos, an Ecken und Stößen verschweißt bzw. werkseitig vorgefertigt; Sollrissfugen nach Fugenplan.') : deP ? T_('Fugen und Durchführungen nach Abdichtungskonzept (DIN 18533) ausbilden.') : T_('Fugen und Durchführungen nach Abdichtungskonzept ausbilden.'),
        T_('Schematische Darstellung; Lage und Anzahl der Stäbe nach Biegeliste und Bewehrungsplänen BWP.')].forEach((t, i) => o.push(txt(SHEET.m + 6, SHEET.m + 220 + i * 4.4, t, { size: 2.2 })));
      o.push(titleBlock(meta, T_('Details 1: Rahmenecke, Wand–Sohle, Durchführung'), 10, no0));
      out.push({ title: T_('Details 1'), svg: wrap(o.join('')) });
    }
    // ---------- Blatt 2 ----------
    {
      const o = [frame(), txt(SHEET.m + 6, SHEET.m + 9, T_('Details: Türöffnung, Unterstützungen und Abstandhalter'), { size: 5, weight: 700 })];
      const op = (q.geo.openings || []).find((x) => x.outer && !x.invalid) || { w: 1.0, h: 2.0, sill: 0 };
      // D4 Öffnung in der Außenwand (Ansicht)
      {
        const y0o = op.sill || 0, Hd = y0o + op.h + 1.2 + (y0o > 0.1 ? 0.3 : 0.1), Wd = op.w + 2.8;
        const scD = [20, 25, 50, 75, 100].find((s2) => Hd * 1000 / s2 <= 108 && Wd * 1000 / s2 <= 120) || 100, kD = 1000 / scD;
        const D = cell(SHEET.m + 6, SHEET.m + 14, 190, 160, T_('D4 Öffnung in der Außenwand (Ansicht, je Seite)'), scD, 95 - op.w / 2 * kD, 12 + (y0o + op.h + 1.2) * kD), P = D.P;
        const ex = 0.8, x0 = 0, x1 = op.w, y0 = y0o, y1 = y0 + op.h;
        D.o.push(poly2(P, [[x0 - 1.4, y0 > 0.1 ? -0.3 : 0], [x1 + 1.4, y0 > 0.1 ? -0.3 : 0], [x1 + 1.4, y1 + 1.2], [x0 - 1.4, y1 + 1.2]], { fill: '#eef0ee', w: 0.3 }));
        if (!(y0 > 0.1)) D.o.push(line(P(x0 - 1.6, 0), P(x1 + 1.6, 0), { w: 0.5 }), txt(P(x1 + 1.45, 0).x, P(x1 + 1.45, 0).y + 3, T_('OK Rohboden'), { size: 2, anchor: 'end' }));
        D.o.push(poly2(P, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], { fill: '#fff', w: 0.5 }));
        D.o.push(bar(P, [[x0 - ex, y1 + 0.06], [x1 + ex, y1 + 0.06]], 0.8), bar(P, [[x0 - ex, y1 + 0.12], [x1 + ex, y1 + 0.12]], 0.8));
        if (y0 > 0.1) D.o.push(bar(P, [[x0 - ex, y0 - 0.06], [x1 + ex, y0 - 0.06]], 0.8), bar(P, [[x0 - ex, y0 - 0.12], [x1 + ex, y0 - 0.12]], 0.8));
        for (const [x, sgn] of [[x0, -1], [x1, 1]]) D.o.push(bar(P, [[x + sgn * 0.06, max(y0 > 0.1 ? -0.25 : 0.05, y0 - ex)], [x + sgn * 0.06, y1 + ex]], 0.8), bar(P, [[x + sgn * 0.12, max(y0 > 0.1 ? -0.25 : 0.05, y0 - ex)], [x + sgn * 0.12, y1 + ex]], 0.8));
        const dg = 0.6;
        D.o.push(bar(P, [[x1 + 0.05, y1 + 0.05], [x1 + 0.05 + dg, y1 + 0.05 + dg]], 0.8), bar(P, [[x0 - 0.05, y1 + 0.05], [x0 - 0.05 - dg, y1 + 0.05 + dg]], 0.8));
        if (y0 > 0.1) D.o.push(bar(P, [[x1 + 0.05, y0 - 0.05], [x1 + 0.05 + dg, y0 - 0.05 - dg]], 0.8), bar(P, [[x0 - 0.05, y0 - 0.05], [x0 - 0.05 - dg, y0 - 0.05 - dg]], 0.8));
        for (let x = x0 + 0.1; x < x1 - 0.05; x += 0.2) D.o.push(bar(P, [[x, y1 + 0.02], [x, y1 + 0.2]], 0.4));
        D.o.push(note(P, x1 + ex * 0.7, y1 + 0.12, x1 + 1.1, y1 + 0.55, y0 > 0.1 ? T_('oben und unten je Seite 2 Ø16, l = Breite + 2 × 0,80') : T_('oben je Seite 2 Ø16, l = Breite + 2 × 0,80')));
        D.o.push(note(P, x1 + 0.12, (y0 + y1) / 2, x1 + 1.1, (y0 + y1) / 2, T_('seitlich je Seite 2 Ø16, l = Höhe + 2 × 0,80')));
        D.o.push(note(P, x1 + 0.05 + dg * 0.7, y1 + 0.05 + dg * 0.7, x1 + 1.1, y1 + 1.0, T_('Diagonalzulage 2 Ø16, l = 1,20 je Ecke')));
        D.o.push(note(P, (x0 + x1) / 2, y1 + 0.15, x0 - 1.2, y1 + 0.75, T_('Steckbügel am freien Rand Ø10/20')));
        D.o.push(dim(P, x0, y1, x1, y1, f2(op.w), -12), dim(P, x0 - 1.4, y0, x0 - 1.4, y1, f2(op.h), -6));
        legend.push(T_('Schutztür bzw. Luke: Zarge vor der Wandbetonage einbauen und verankern (Herstellerangaben); Zulagen beidseitig'));
        D.o.push(legendOut(SHEET.m + 6, SHEET.m + 14 + 136, 110));
        o.push(...D.o);
      }
      // D5 Unterstützungen und Abstandhalter je Platte
      {
        const x0 = SHEET.m + 202, y0 = SHEET.m + 14;
        o.push('<rect x="' + x0 + '" y="' + y0 + '" width="196" height="160" fill="none" stroke="#111" stroke-width="0.3"/>', txt(x0 + 3, y0 + 6, T_('D5 Unterstützungen und Abstandhalter'), { size: 3.4, weight: 700 }));
        const rows2 = [];
        const add2 = (name, pl, h) => { if (!pl) return; const T2 = lay(pl, 'oben'), B2 = lay(pl, 'unten'); const ls = (pl.layers || []); const sum = (face) => ls.filter((l) => l.face === face).reduce((a, l) => a + l.phi, 0) / 1000; const hs = h - 2 * c - sum('unten') - sum('oben'); rows2.push([name, f2(h * 100, 0) + ' cm', 'Ø' + B2.phi + ' / Ø' + T2.phi, f2(c * 1000, 0) + ' mm', f2(max(0, hs) * 100, 1) + ' cm']); };
        add2(T_('Decke'), st.roof, tR); for (const m of st.mids || []) add2(elText(m.name), m, m.h); add2(T_('Bodenplatte'), st.floor, tF);
        const heads = [T_('Platte'), T_('Dicke'), T_('Ø unten / oben'), T_('Abstandhalter'), T_('Höhe Unterstützung')], cx = [x0 + 4, x0 + 62, x0 + 82, x0 + 112, x0 + 142];
        heads.forEach((t, j) => o.push(txt(cx[j], y0 + 15, t, { size: 2.3, weight: 700 })));
        o.push(line({ x: x0 + 4, y: y0 + 16.5 }, { x: x0 + 192, y: y0 + 16.5 }, { w: 0.2 }));
        rows2.forEach((r, i) => r.forEach((t, j) => o.push(txt(cx[j], y0 + 21 + i * 4.6, t.length > 30 ? t.slice(0, 29) + '…' : t, { size: 2.2 }))));
        // Schnittskizze 1 : 10
        const k = 100, sx = x0 + 30, sy = y0 + 60 + rows2.length * 4.6, hS = Math.min(tF, 0.5);
        o.push('<rect x="' + sx + '" y="' + sy + '" width="' + (1.2 * k) + '" height="' + (hS * k) + '" fill="#eef0ee" stroke="#111" stroke-width="0.4"/>');
        const yb2 = sy + hS * k - c * k - 1, yt2 = sy + c * k + 1;
        o.push(line({ x: sx + 2, y: yb2 }, { x: sx + 1.2 * k - 2, y: yb2 }, { w: 0.7, stroke: BAR }), line({ x: sx + 2, y: yt2 }, { x: sx + 1.2 * k - 2, y: yt2 }, { w: 0.7, stroke: BAR }));
        for (let x = sx + 10; x < sx + 1.2 * k - 5; x += 15) o.push('<circle cx="' + x + '" cy="' + (yb2 - 1.4) + '" r="0.7" fill="' + BAR + '"/>', '<circle cx="' + x + '" cy="' + (yt2 + 1.4) + '" r="0.7" fill="' + BAR + '"/>');
        for (const x of [sx + 25, sx + 85]) o.push('<polygon points="' + (x - 3) + ',' + (sy + hS * k) + ' ' + (x + 3) + ',' + (sy + hS * k) + ' ' + x + ',' + (yb2 + 0.7) + '" fill="#888"/>');
        for (const x of [sx + 45, sx + 105]) o.push('<polyline points="' + (x - 6) + ',' + (yb2 - 0.7) + ' ' + (x - 3) + ',' + (yt2 + 2.1) + ' ' + (x + 3) + ',' + (yt2 + 2.1) + ' ' + (x + 6) + ',' + (yb2 - 0.7) + '" fill="none" stroke="#333" stroke-width="0.5"/>');
        o.push(txt(sx + 25, sy + hS * k + 5, T_('Abstandhalter'), { size: 2.1, anchor: 'middle' }), txt(sx + 45, sy - 2, T_('Unterstützungskorb'), { size: 2.1, anchor: 'middle' }));
        o.push(txt(x0 + 4, sy + hS * k + 14, T_('Abstandhalter: ≥ 4 Stück/m², Betondeckung nach Tabelle; Unterstützungen in Reihen ≤ 1,0 m bzw. ≤ 50 Ø der oberen Stäbe.'), { size: 2.1 }));
        o.push(txt(x0 + 4, sy + hS * k + 18.5, T_('Höhe Unterstützung = lichter Abstand der Lagen = h − 2 cnom − Ø der vier Lagen; bei Durchstanzbewehrung Bügelkörbe als Unterstützung nutzen.'), { size: 2.1 }));
      }
      o.push(titleBlock(meta, T_('Details 2: Öffnung, Unterstützungen'), null, no0 + 1));
      out.push({ title: T_('Details 2'), svg: wrap(o.join('')) });
    }
    return out;
  }

  function sheets(q, sch, meta0) {
    NP = BP.normen.profile(q.p);
    const g = q.geo, st = q.struct, b = q.p.build, nL = g.L.length, out = [], meta = Object.assign({}, meta0, { colCover: q.mat && q.mat.colCover });
    const plates = [];
    if (st.roof) plates.push({ el: 'Decke', code: 'D', poly: g.out, d: st.roof, h: b.tRoof, holes: g.vert.lifts.filter((v) => v.toSurface || v.roofBox).map((v) => v.innerPoly), level: 0 });
    for (const m of st.mids || []) plates.push({ el: m.name, code: 'Z' + m.level, poly: g.out, d: m, h: g.L[m.level].tSlab, level: m.level, holes: g.L[m.level - 1].holesBelow.concat(g.vert.lifts.filter((v) => m.level - 1 >= v.wallTop && m.level <= v.levelBot).map((v) => v.innerPoly)) });
    if (st.floor) plates.push({ el: 'Bodenplatte', code: 'B', poly: g.slab, d: st.floor, h: b.tFloor, holes: g.vert.lifts.filter((v) => v.levelBot === nL - 1).map((v) => v.innerPoly), level: nL });
    let no = 1;
    for (const pl of plates) for (const face of ['unten', 'oben']) out.push(plateSheet(q, sch, pl, face, meta, no++));
    if (st.wall && g.valid) out.push(wallSheet(q, sch, meta, no++));
    if ((st.columns || []).length || (st.beams || []).length) for (const sh of memberSheets(q, sch, meta, no)) { out.push(sh); no++; }
    for (const sh of innerSheets(q, sch, meta, no)) { out.push(sh); no++; }
    if (st.wall && g.valid) for (const sh of detailSheets(q, sch, meta, no)) { out.push(sh); no++; }
    return out;
  }

  BP.rebar = { schedule, bvbs, csv, checksum, shapeText, shapeSketch, sheets, pieces, F, cutLen, elText, labelText };
})(typeof window !== 'undefined' ? window : globalThis);
