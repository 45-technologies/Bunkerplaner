/* Vertikalschnitt durch Bunker, Zugang und Baugrund (SVG). */
(function (root) {
  const BP = root.BP, G = BP.geo;
  const T_ = BP.i18n.T;
  const SEC = BP.section = {};
  let svg, A;
  const fmt = (v, d = 2) => BP.calc.fmt(v, d);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lvl = (z) => (z > 0.0005 ? '+' : z < -0.0005 ? '−' : '±') + fmt(Math.abs(z));

  SEC.init = function (app) {
    A = app;
    svg = document.getElementById('sectionSvg');
    new ResizeObserver(() => SEC.render()).observe(svg);
  };

  /* Schnittlinien: durch jede Treppe, jeden Notausstieg, längs (x) oder quer (y) durch die Mitte. */
  SEC.modes = function (g) {
    const m = [];
    const st = g.access.filter((a) => a.kind === 'treppe'), sh = g.access.filter((a) => a.kind === 'schacht');
    st.forEach((a, i) => m.push(['treppe:' + a.id, T_('Durch Treppe') + (st.length > 1 ? ' ' + (i + 1) : '')]));
    sh.forEach((a, i) => m.push(['schacht:' + a.id, T_('Durch Notausstieg') + (sh.length > 1 ? ' ' + (i + 1) : '')]));
    const vs = g.vert || { stairs: [], lifts: [] };
    vs.stairs.forEach((v, i) => m.push(['itreppe:' + v.id, T_('Durch Innentreppe') + (vs.stairs.length > 1 ? ' ' + (i + 1) : '')]));
    vs.lifts.forEach((v, i) => m.push(['aufzug:' + v.id, T_('Durch Aufzug') + (vs.lifts.length > 1 ? ' ' + (i + 1) : '')]));
    m.push(['x', T_('Längs')], ['y', T_('Quer')]);
    return m;
  };
  function cutLine(g, mode) {
    const acc = g.access.find((a) => mode === a.kind + ':' + a.id);
    if (acc) return { C: acc.C, d: G.mul(acc.nn, -1), acc, name: acc.kind === 'treppe' ? T_('Schnitt durch den Treppenabgang') : T_('Schnitt durch den Notausstieg') };
    const vs = g.vert || { stairs: [], lifts: [] };
    const st = vs.stairs.find((v) => mode === 'itreppe:' + v.id);
    if (st) return { C: { x: st.src.x, y: st.src.y }, d: st.u, name: g.labels['v:' + st.id] ? T_('Schnitt durch {name}', { name: g.labels['v:' + st.id] }) : T_('Schnitt durch die Innentreppe') };
    const lf = vs.lifts.find((v) => mode === 'aufzug:' + v.id);
    if (lf) return { C: { x: lf.x, y: lf.y }, d: lf.u, name: g.labels['v:' + lf.id] ? T_('Schnitt durch {name}', { name: g.labels['v:' + lf.id] }) : T_('Schnitt durch den Aufzug') };
    const bb = G.bbox(g.out), ax = mode === 'y' ? 'x' : 'y';
    let v = ax === 'x' ? (bb.x0 + bb.x1) / 2 : (bb.y0 + bb.y1) / 2;
    const inWall = (val) => (g.L || [g]).some((L) => L.walls.some((w) => w.segs.length && Math.abs(w.a[ax] - w.b[ax]) < 1e-6 && Math.abs(w.a[ax] - val) < w.t / 2 + 0.05));
    for (let i = 0; i < 20 && inWall(v); i++) v += 0.25;
    if (mode === 'y') return { C: { x: v, y: bb.y0 }, d: { x: 0, y: 1 }, name: T_('Querschnitt (y-Richtung)') };
    return { C: { x: bb.x0, y: v }, d: { x: 1, y: 0 }, name: T_('Längsschnitt (x-Richtung)') };
  }

  function intervals(poly, C, d) {
    const far = 500, a = G.add(C, G.mul(d, -far)), b = G.add(C, G.mul(d, far));
    return G.clipSegment(a, b, poly).map((s) => [G.dot(G.sub(s.a, C), d), G.dot(G.sub(s.b, C), d)].sort((x, y) => x - y));
  }

  SEC.render = function () {
    if (!svg || !A.q || !svg.clientWidth) return;
    const q = A.q, g = q.geo, lv = q.lv, b = A.p.build, st = q.struct, e = q.earth;
    const W = svg.clientWidth, H = svg.clientHeight;
    const modes = SEC.modes(g).map((x) => x[0]);
    const mode = modes.includes(A.ui.sectionMode) ? A.ui.sectionMode : modes[0];
    const cl = cutLine(g, mode);
    const outer = intervals(g.out, cl.C, cl.d);
    if (!outer.length) { svg.innerHTML = ''; return; }
    const inner = g.valid ? intervals(g.inner, cl.C, cl.d) : [];
    const sL = Math.min(...outer.map((i) => i[0])), sR = Math.max(...outer.map((i) => i[1]));
    const iw = b.insulation.walls || 0, ir = b.insulation.roof || 0, ov = b.overhang;
    const pL0 = sL - e.off, pR0 = sR + e.off, pL1 = pL0 - e.k * e.depth, pR1 = pR0 + e.k * e.depth;
    const showLoads = A.step === 'nutzung' || A.step === 'statik' || A.step === 'schutzgrad';
    const mo = lv.mound, hM = lv.hM;
    // Erdhügel entlang der Schnittlinie: dieselbe Fläche wie in Mengen, Plan und 3D (Gehrung über der konvexen Hülle)
    let mProf = null, mL0 = sL, mR0 = sR;
    if (mo.on) {
      const bbo = G.bbox(g.out), far = bbo.w + bbo.h + mo.toe + 10;
      const pr = mo.profile(cl.C, cl.d, -far, far);
      const i0 = pr.findIndex((x) => x[1] > 1e-9), i1 = pr.length - 1 - pr.slice().reverse().findIndex((x) => x[1] > 1e-9);
      if (i0 >= 0) { mProf = pr.slice(Math.max(0, i0 - 1), Math.min(pr.length, i1 + 2)); mL0 = mProf[0][0]; mR0 = mProf[mProf.length - 1][0]; }
    }
    // Zugangsbauwerke in Achsrichtung der Schnittlinie: Lage der Außenkante (s0) und Richtung nach außen (sg)
    const accs = g.access.map((a) => {
      const along = G.dot(a.nn, cl.d), lat = Math.abs(G.dot(G.sub(a.C, cl.C), { x: -cl.d.y, y: cl.d.x }));
      if (Math.abs(Math.abs(along) - 1) > 1e-6 || lat > a.W / 2 - 1e-6) return null;
      const s0 = G.dot(G.sub(a.C, cl.C), cl.d), sg = along > 0 ? 1 : -1, len = a.kind === 'treppe' ? a.Lcut : a.D;
      return { a, s0, sg, s1: s0 + sg * len };
    }).filter(Boolean);
    const accMin = Math.min(...accs.map((x) => Math.min(x.s0, x.s1)), Infinity), accMax = Math.max(...accs.map((x) => Math.max(x.s0, x.s1)), -Infinity);
    const left = Math.min(pL1, accMin, mProf ? mL0 : pL1) - 0.6;
    const right = Math.max(pR1, accMax, mProf ? mR0 : pR1) + 0.4;
    const zTop = (showLoads ? 1.9 : 0.9) + hM, zBot = lv.zPit - 0.7;
    // Höhenkoten; der rechte Rand richtet sich nach der längsten Beschriftung (Sprachen unterschiedlich lang)
    const marks = [[0, T_('Gelände')], [lv.zRoofTop, T_('OK Decke')], [lv.zCeil, T_('UK Decke')], [lv.zSlabBot, T_('UK Bodenplatte')], [lv.zPit, T_('Baugrubensohle')]]
      .concat((lv.levels || []).length > 1 ? lv.levels.map((L) => [L.zFloorTop, T_('OK Rohboden E{n}', { n: L.idx + 1 })]) : [[lv.zFloorTop, T_('OK Rohboden')]]);
    if (mo.on) marks.push([hM, T_('OK Erdhügel')]);
    const gutR = Math.max(205, 92 + 6.4 * Math.max(...marks.map((m) => m[1].length))), gutL = 24;
    const k = Math.max(4, Math.min((W - gutL - gutR) / (right - left), (H - 150) / (zTop - zBot)));
    const ox = gutL + Math.max(0, ((W - gutL - gutR) - (right - left) * k) / 2), oy = 62;
    const X = (s) => ox + (s - left) * k, Y = (z) => oy + (zTop - z) * k;
    const rect = (s0, s1, z0, z1, attrs) => '<rect x="' + X(Math.min(s0, s1)).toFixed(1) + '" y="' + Y(Math.max(z0, z1)).toFixed(1) + '" width="' + (Math.abs(s1 - s0) * k).toFixed(1) + '" height="' + (Math.abs(z1 - z0) * k).toFixed(1) + '" ' + attrs + '/>';
    const poly = (arr, attrs) => '<polygon points="' + arr.map(([s, z]) => X(s).toFixed(1) + ',' + Y(z).toFixed(1)).join(' ') + '" ' + attrs + '/>';
    const line = (s0, z0, s1, z1, attrs) => '<line x1="' + X(s0).toFixed(1) + '" y1="' + Y(z0).toFixed(1) + '" x2="' + X(s1).toFixed(1) + '" y2="' + Y(z1).toFixed(1) + '" ' + attrs + '/>';
    const textPx = (x, y, t, attrs = '') => '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="12" fill="#1d2220" ' + attrs + '>' + esc(t) + '</text>';
    const o = [], late = [];
    o.push('<defs>' +
      '<pattern id="sc" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#8a918e"/><line x1="0" y1="0" x2="0" y2="7" stroke="#5c6461" stroke-width="2"/></pattern>' +
      '<pattern id="se" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#eadfce"/><circle cx="3" cy="4" r=".9" fill="#c2ab8a"/><circle cx="10" cy="10" r=".9" fill="#c2ab8a"/></pattern>' +
      '<pattern id="sf" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#f4eee4"/><circle cx="5" cy="5" r=".7" fill="#d2c3ab"/></pattern>' +
      '<pattern id="sh" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#e3dcc4"/><circle cx="3" cy="3" r=".9" fill="#a8a07c"/><circle cx="9" cy="8" r=".8" fill="#a8a07c"/></pattern>' +
      '<pattern id="sg" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#ddd6c8"/><circle cx="2" cy="2" r="1.3" fill="none" stroke="#a99f8c" stroke-width=".7"/><circle cx="6" cy="6" r="1" fill="none" stroke="#a99f8c" stroke-width=".7"/></pattern>' +
      '<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1d2220"/></marker>' +
      '<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#b3261e"/></marker>' +
      '</defs>');
    o.push('<rect width="100%" height="100%" fill="#fbfcfb"/>');
    // Baugrund und verfüllte Baugrube
    o.push(rect(left, right, 0, zBot, 'fill="url(#se)"'));
    o.push(poly([[pL1, 0], [pL0, lv.zPit], [pR0, lv.zPit], [pR1, 0]], 'fill="url(#sf)" stroke="#b79d7a" stroke-dasharray="6 4"'));
    // Wasser
    if (isFinite(lv.zW) && lv.zW > zBot) {
      o.push(rect(left, right, Math.min(lv.zW, 0), zBot, 'fill="#2f78a8" fill-opacity=".14"'));
      o.push(line(left, lv.zW, right, lv.zW, 'stroke="#2f78a8" stroke-width="1.5" stroke-dasharray="8 4"'));
      const x = X(left) + 14, y = Y(lv.zW);
      late.push('<path d="M' + (x - 7) + ' ' + (y - 11) + 'h14l-7 10z" fill="#2f78a8"/>');
      late.push(textPx(x + 12, y - 5, lvl(lv.zW) + '  ' + (A.p.site.waterMode === 'gok' ? T_('Stauwasser') : T_('Bemessungswasserstand')), 'fill="#2f78a8" font-weight="600" style="paint-order:stroke" stroke="#fbfcfb" stroke-width="4"'));
    }
    // Erdhügel (im Treppenschnitt hinter der Schnittebene)
    if (mProf) o.push(poly(mProf, 'fill="url(#sh)" stroke="#8c8460" stroke-width=".8"' + (accs.length ? ' fill-opacity=".55"' : '')));
    // Sohlaufbau
    o.push(rect(pL0, pR0, lv.zPit, lv.zBlindBot, 'fill="url(#sg)" stroke="#a99f8c" stroke-width=".6"'));
    if (b.blinding > 0) o.push(rect(sL - ov - 0.1, sR + ov + 0.1, lv.zBlindBot, lv.zInsBot, 'fill="#c3c8c5" stroke="#8b938f" stroke-width=".6"'));
    if (b.insulation.floor > 0) o.push(rect(sL - ov, sR + ov, lv.zInsBot, lv.zSlabBot, 'fill="#f1dfb0" stroke="#c8a85a" stroke-width=".6"'));
    if (iw > 0) {
      o.push(rect(sL - iw, sL, lv.zSlabBot, lv.zRoofTop, 'fill="#f1dfb0" stroke="#c8a85a" stroke-width=".6"'));
      o.push(rect(sR, sR + iw, lv.zSlabBot, lv.zRoofTop, 'fill="#f1dfb0" stroke="#c8a85a" stroke-width=".6"'));
    }
    if (ir > 0) o.push(rect(sL - iw, sR + iw, lv.zRoofTop, lv.zRoofTop + ir, 'fill="#f1dfb0" stroke="#c8a85a" stroke-width=".6"'));
    // Zugangsbauwerke (Treppe bzw. Notausstieg), lokal x = Abstand von der Außenkante nach außen
    const zE = lv.zEntry != null ? lv.zEntry : lv.zFloorTop; // OK Rohboden der Zugangsebene
    for (const { a, s0, sg } of accs) {
      const S = (x) => s0 + sg * x, P = (arr) => arr.map(([x, z]) => [S(x), z]);
      const zf = zE;
      if (a.kind === 'treppe') {
        o.push(poly(P(a.side.map((pt) => [pt.x, pt.y])), 'fill="#e6e8e7" stroke="#8b938f" stroke-width=".8"'));
        o.push(poly(P([[0, a.zb], [a.landing, a.zb], [a.landing, zf], [0, zf]]), 'fill="url(#sc)" stroke="#1d2220" stroke-width="1"'));
        const prof = [[a.landing, zf - a.tS], [a.landing, zf]];
        for (let i = 1; i < a.nr; i++) { prof.push([a.landing + (i - 1) * a.tread, zf + i * a.rise]); prof.push([a.landing + i * a.tread, zf + i * a.rise]); }
        prof.push([a.L, 0], [a.L, -a.tS]);
        o.push(poly(P(prof), 'fill="url(#sc)" stroke="#1d2220" stroke-width="1"'));
        if (a.Lcut > a.L + 1e-6) o.push(poly(P([[a.L, -a.tS], [a.Lcut, -a.tS], [a.Lcut, 0], [a.L, 0]]), 'fill="url(#sc)" stroke="#1d2220" stroke-width="1"'));
        if (a.hatch > 0) o.push(poly(P([[0, 0.15], [a.L, 0.15], [a.L, 0.21], [0, 0.21]]), 'fill="#5f6763"'));
        const label = a.nr ? T_('{n} Steigungen {r} / {t} cm', { n: a.nr, r: fmt(a.rise * 100, 1), t: fmt(a.tread * 100, 1) }) : T_('ebenerdiger Zugang');
        if (a.nr && (a.run * k) > label.length * 6.2) {
          const ang = Math.atan2(-zf, a.run) * 180 / Math.PI * (sg < 0 ? 1 : -1);
          const tx = X(S(a.landing + a.run / 2)) + 10 * -sg, ty = Y(zf / 2) - 16;
          o.push('<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" font-size="12" text-anchor="middle" fill="#1d2220" transform="rotate(' + ang.toFixed(1) + ' ' + tx.toFixed(1) + ' ' + ty.toFixed(1) + ')">' + esc(label) + '</text>');
        } else if (!a.nr && (a.Lcut * k) > label.length * 6.2) o.push(textPx(X(S(a.Lcut / 2)), Y(zf) - 6, label, 'text-anchor="middle" fill="#57605b"'));
      } else {
        const zb = zf - a.tS, zt = a.zTop;
        o.push(poly(P([[0, zb], [a.D, zb], [a.D, zt], [0, zt]]), 'fill="#e6e8e7" stroke="#8b938f" stroke-width=".8"'));
        o.push(poly(P([[a.wy, zf], [a.D, zf], [a.D, zt], [a.wy, zt]]), 'fill="url(#sc)" stroke="#1d2220" stroke-width="1"'));
        o.push(poly(P([[0, zb], [a.D, zb], [a.D, zf], [0, zf]]), 'fill="url(#sc)" stroke="#1d2220" stroke-width="1"'));
        o.push(poly(P([[0, zt], [a.D, zt], [a.D, zt + 0.06], [0, zt + 0.06]]), 'fill="#5f6763"'));
        for (let i = 0; i < a.rungs; i++) { const z = zf + 0.3 + i * 0.28; o.push(line(S(a.wy - 0.12), z, S(a.wy), z, 'stroke="#1d2220" stroke-width="1.6"')); }
      }
    }
    // Bodenplatte, Decke, Zwischendecken (mit Treppenaugen und Schächten), Innenraum je Ebene
    const LV = lv.levels || [{ idx: 0, zCeil: lv.zCeil, zFloorTop: lv.zFloorTop, zSlabTop: lv.zRoofTop, H: b.clearHeight, tSlab: 0 }];
    const GL = g.L || [g], vs = g.vert || { stairs: [], lifts: [] };
    const minus = (ivs, cutsOut) => ivs.flatMap(([a0, a1]) => {
      let segs = [[a0, a1]];
      for (const c of cutsOut) segs = segs.flatMap(([x0, x1]) => (c[1] <= x0 || c[0] >= x1 ? [[x0, x1]] : [[x0, c[0]], [c[1], x1]].filter(([x, y]) => y - x > 0.005)));
      return segs;
    });
    const holesOf = (polys) => polys.flatMap((h) => intervals(h, cl.C, cl.d));
    for (const iv of outer) o.push(rect(iv[0] - ov, iv[1] + ov, lv.zSlabBot, lv.zFloorTop, 'fill="url(#sc)" stroke="#1d2220" stroke-width="1.2"'));
    const roofHoles = holesOf(vs.lifts.filter((v) => v.toSurface || v.roofBox).map((v) => v.innerPoly));
    for (const [a0, a1] of minus(outer, roofHoles)) o.push(rect(a0, a1, lv.zCeil, lv.zRoofTop, 'fill="url(#sc)" stroke="#1d2220" stroke-width="1.2"'));
    for (const L of LV) o.push(...inner.map((iv) => rect(iv[0], iv[1], L.zFloorTop, L.zCeil, 'fill="#ffffff"')));
    for (const L of LV) {
      if (!L.idx) continue;
      const above = GL[L.idx - 1];
      const hp = (above && above.holesBelow ? above.holesBelow : []).concat(vs.lifts.filter((v) => L.idx - 1 >= v.wallTop && L.idx <= v.levelBot).map((v) => v.innerPoly));
      const hs = holesOf(hp);
      for (const [a0, a1] of minus(inner, hs)) o.push(rect(a0, a1, L.zCeil, L.zSlabTop, 'fill="url(#sc)" stroke="#1d2220" stroke-width="1.2"'));
      for (const [a0, a1] of hs) o.push(rect(a0, a1, L.zCeil, L.zSlabTop, 'fill="#ffffff"'));
    }
    // Aufzüge: Schachtgrube unter der untersten Haltestelle, Schachtkopf über der Decke bzw. Schacht bis zum Gelände mit Aufzugshaus
    for (const v of vs.lifts) {
      const io = intervals(v.outerPoly, cl.C, cl.d), ii = intervals(v.innerPoly, cl.C, cl.d), d = v.design, w = v.works;
      if (!io.length || !d || !w) continue;
      const [a0, a1] = io[0], [i0, i1] = ii.length ? ii[0] : [a0, a1];
      const zf = LV[v.levelBot].zFloorTop, zp = zf - d.pit;
      const box = (zb, zt, top) => {
        o.push(rect(a0, i0, zb, zt, 'fill="url(#sc)" stroke="#1d2220" stroke-width="1.2"'), rect(i1, a1, zb, zt, 'fill="url(#sc)" stroke="#1d2220" stroke-width="1.2"'), rect(i0, i1, zb, zt, 'fill="#ffffff"'));
        if (top) o.push(rect(a0, a1, zt, zt + top, 'fill="url(#sc)" stroke="#1d2220" stroke-width="1.2"'));
      };
      box(zp, zf, 0);
      o.push(rect(a0, a1, zp - b.tFloor, zp, 'fill="url(#sc)" stroke="#1d2220" stroke-width="1.2"'));
      if (v.roofBox) { o.push(rect(i0, i1, lv.zCeil, lv.zRoofTop, 'fill="#ffffff"')); box(lv.zRoofTop, lv.zRoofTop + w.box, 0.3); }
      if (v.toSurface) { o.push(rect(i0, i1, lv.zCeil, lv.zRoofTop, 'fill="#ffffff"')); box(lv.zRoofTop, v.zSurface + w.house, 0.25); }
      // Kabine an der untersten Haltestelle
      o.push(rect(i0 + 0.1, i1 - 0.1, zf + 0.02, zf + d.carH, 'fill="none" stroke="#57605b" stroke-width="1" stroke-dasharray="4 3"'));
    }
    // geschnittene Wände
    const far = 500, la = G.add(cl.C, G.mul(cl.d, -far)), lb = G.add(cl.C, G.mul(cl.d, far));
    const hitS = (op) => { const h = G.segIntersect(la, lb, op.p0, op.p1); return h ? (h.t * 2 - 1) * far : null; };
    const cuts = [];
    const wallCut = (s0, s1, ops, fill, z0, z1, zOp) => {
      z0 = z0 != null ? z0 : lv.zFloorTop; z1 = z1 != null ? z1 : lv.zCeil; zOp = zOp != null ? zOp : z0;
      cuts.push([s0, s1, z0, z1]);
      o.push(rect(s0, s1, z0, z1, 'fill="' + fill + '" stroke="#1d2220" stroke-width="1.2"'));
      for (const op of ops) o.push(rect(s0 - 0.005, s1 + 0.005, zOp + op.sill, zOp + op.sill + op.h, 'fill="#ffffff" stroke="#1d2220" stroke-width=".8"'));
    };
    const outerOps = g.openings.filter((op) => op.outer && !op.invalid);
    for (const iv of outer) {
      const ins = inner.filter((x) => x[0] >= iv[0] - 1e-6 && x[1] <= iv[1] + 1e-6);
      const s0 = ins.length ? ins[0][0] : iv[1], s1 = ins.length ? ins[ins.length - 1][1] : iv[0];
      const at = (sa, sb) => outerOps.filter((op) => { const s = hitS(op); return s != null && s >= sa - 0.02 && s <= sb + 0.02; });
      wallCut(iv[0], s0, at(iv[0], s0), 'url(#sc)', lv.zFloorTop, lv.zCeil, zE);
      wallCut(s1, iv[1], at(s1, iv[1]), 'url(#sc)', lv.zFloorTop, lv.zCeil, zE);
    }
    GL.forEach((L, li) => {
      const z = LV[li] || LV[0];
      for (const w of L.walls) {
        for (const sg of w.segs) {
          const u = G.norm(G.sub(sg.b, sg.a)), n = { x: -u.y * w.t / 2, y: u.x * w.t / 2 };
          const iv = intervals([G.add(sg.a, n), G.add(sg.b, n), G.sub(sg.b, n), G.sub(sg.a, n)], cl.C, cl.d);
          if (!iv.length) continue;
          const ops = L.openings.filter((op) => !op.invalid && op.host === 'w:' + w.id && hitS(op) != null);
          wallCut(iv[0][0], iv[0][1], ops, w.kind === 'stb' ? 'url(#sc)' : w.kind === 'mw' ? '#d9c9b4' : '#e4e7e5', z.zFloorTop, z.zCeil);
        }
      }
      // Unterzüge (unter der Platte darüber)
      for (const bu of L.beams || []) for (const sg of bu.segs || []) {
        const u = G.norm(G.sub(sg.b, sg.a)), n = { x: -u.y * bu.bw / 2, y: u.x * bu.bw / 2 };
        const iv = intervals([G.add(sg.a, n), G.add(sg.b, n), G.sub(sg.b, n), G.sub(sg.a, n)], cl.C, cl.d);
        for (const [a0, a1] of iv) o.push(rect(a0, a1, z.zCeil - bu.hb, z.zCeil, 'fill="url(#sc)" stroke="#1d2220" stroke-width="1.2"'));
      }
      // Stützen
      for (const c of L.columns || []) {
        const iv = intervals(G.polygonFromRect(c.x - c.bx / 2, c.y - c.by / 2, c.x + c.bx / 2, c.y + c.by / 2), cl.C, cl.d);
        if (iv.length) wallCut(iv[0][0], iv[0][1], [], 'url(#sc)', z.zFloorTop, z.zCeil);
      }
    });
    // Innentreppen längs geschnitten: Stufenprofil vom Austritt oben bis zum Antritt unten
    for (const st of vs.stairs) {
      const along = G.dot(st.u, cl.d), lat = Math.abs(G.cross(cl.d, G.sub({ x: st.src.x, y: st.src.y }, cl.C)));
      if (Math.abs(Math.abs(along) - 1) > 1e-6 || lat > st.w / 2 - 1e-6) continue;
      const zU = LV[st.upper].zFloorTop, zL = LV[st.lower].zFloorTop, s0 = G.dot(G.sub({ x: st.src.x, y: st.src.y }, cl.C), cl.d), sgn = along > 0 ? 1 : -1;
      const S = (x) => s0 + sgn * x, prof = [[S(0), zU]];
      for (let i = 1; i < st.nr; i++) { prof.push([S((i - 1) * st.tread), zU - i * st.rise]); prof.push([S(i * st.tread), zU - i * st.rise]); }
      const slope = st.rise / st.tread, dv = (st.tWaist || 0.15) * Math.hypot(st.tread, st.rise) / st.tread; // Untersicht parallel zur Steigung
      prof.push([S(st.run), zL], [S(Math.max(0, st.run - dv / slope)), zL], [S(0), zU - st.rise - dv]);
      o.push(poly(prof, 'fill="url(#sc)" stroke="#1d2220" stroke-width="1"'));
      if (st.run * k > 120) {
        const t = T_('{n} Stg. {r}/{t} cm', { n: st.nr, r: fmt(st.rise * 100, 1), t: fmt(st.tread * 100, 1) });
        const ang = Math.atan2(st.dh, st.run) * 180 / Math.PI * (sgn > 0 ? 1 : -1), tx = X(S(st.run / 2)), ty = Y((zU + zL) / 2) - 12;
        o.push('<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" font-size="12" text-anchor="middle" fill="#1d2220" transform="rotate(' + ang.toFixed(1) + ' ' + tx.toFixed(1) + ' ' + ty.toFixed(1) + ')">' + esc(t) + '</text>');
      }
    }
    // Schutzschichten (Zusatzschichten aus dem Schutzaufbau)
    const prot = q.prot && q.prot.comps;
    const LCOL = { steel: '#4a5a6a', masonry: '#d9c9b4', liner: '#e3b04b', earth: '#c2ab8a', other: '#b9a3c9', concrete: '#9aa19e' };
    const stack = (cp) => {
      if (!cp || !cp.layers.length) return { out: [], inn: [] };
      const fc = cp.layers.findIndex((l) => l.material === 'concrete');
      const rest = cp.layers.map((l, i) => ({ l, i })).filter(({ l }) => l.material !== 'concrete' && l.material !== 'gap' && l.t > 0);
      return { out: rest.filter(({ i }) => fc >= 0 && i < fc).map(({ l }) => l).reverse(), inn: rest.filter(({ i }) => !(fc >= 0 && i < fc)).map(({ l }) => l) };
    };
    if (prot) {
      const sw = stack(prot.aussenwand), sr = stack(prot.decke), sf = stack(prot.bodenplatte);
      for (const iv of inner) {
        let off = 0;
        for (const l of sw.inn) { o.push(rect(iv[0] + off, iv[0] + off + l.t, lv.zFloorTop, lv.zCeil, 'fill="' + (LCOL[l.material] || '#ccc') + '" stroke="#1d2220" stroke-width=".5"')); o.push(rect(iv[1] - off - l.t, iv[1] - off, lv.zFloorTop, lv.zCeil, 'fill="' + (LCOL[l.material] || '#ccc') + '" stroke="#1d2220" stroke-width=".5"')); off += l.t; }
        let offR = 0;
        for (const l of sr.inn) { o.push(rect(iv[0], iv[1], lv.zCeil - offR - l.t, lv.zCeil - offR, 'fill="' + (LCOL[l.material] || '#ccc') + '" stroke="#1d2220" stroke-width=".5"')); offR += l.t; }
        let offF = 0;
        for (const l of sf.inn) { o.push(rect(iv[0], iv[1], lv.zFloorTop + offF, lv.zFloorTop + offF + l.t, 'fill="' + (LCOL[l.material] || '#ccc') + '" stroke="#1d2220" stroke-width=".5"')); offF += l.t; }
      }
      let offO = iw;
      for (const l of sw.out) { o.push(rect(sL - offO - l.t, sL - offO, lv.zSlabBot, lv.zRoofTop, 'fill="' + (LCOL[l.material] || '#ccc') + '" stroke="#1d2220" stroke-width=".5"')); o.push(rect(sR + offO, sR + offO + l.t, lv.zSlabBot, lv.zRoofTop, 'fill="' + (LCOL[l.material] || '#ccc') + '" stroke="#1d2220" stroke-width=".5"')); offO += l.t; }
      let offT = ir;
      for (const l of sr.out) { o.push(rect(sL, sR, lv.zRoofTop + offT, lv.zRoofTop + offT + l.t, 'fill="' + (LCOL[l.material] || '#ccc') + '" stroke="#1d2220" stroke-width=".5"')); offT += l.t; }
    }
    // Abdichtung (schwarze Linie)
    if (b.waterproofing !== 'wu') {
      const pts = [[sL - ov, lv.zSlabBot], [sL - ov, lv.zFloorTop], [sL, lv.zFloorTop], [sL, lv.zRoofTop], [sR, lv.zRoofTop], [sR, lv.zFloorTop], [sR + ov, lv.zFloorTop], [sR + ov, lv.zSlabBot]];
      o.push('<polyline points="' + pts.map(([s, z]) => X(s).toFixed(1) + ',' + Y(z).toFixed(1)).join(' ') + '" fill="none" stroke="#1d2220" stroke-width="3"/>');
      o.push(line(sL - ov, lv.zSlabBot, sR + ov, lv.zSlabBot, 'stroke="#1d2220" stroke-width="3"'));
    }
    // Gelände
    const gaps = accs.filter(({ a }) => a.kind === 'treppe' && !(a.hatch > 0)).map(({ a, s0, sg }) => [Math.min(s0, s0 + sg * a.Lcut), Math.max(s0, s0 + sg * a.Lcut)]);
    let gSegs = mProf ? [[left, mL0], [mR0, right]] : [[left, right]];
    for (const gap of gaps) gSegs = gSegs.flatMap(([a0, a1]) => (gap[1] <= a0 || gap[0] >= a1 ? [[a0, a1]] : [[a0, gap[0]], [gap[1], a1]].filter(([x, y]) => y - x > 0.01)));
    for (const [a0, a1] of gSegs) o.push(line(a0, 0, a1, 0, 'stroke="#3f6b3a" stroke-width="2.5"'));
    if (mProf) o.push('<polyline points="' + mProf.map(([s, z]) => X(s).toFixed(1) + ',' + Y(z).toFixed(1)).join(' ') + '" fill="none" stroke="#3f6b3a" stroke-width="2.5"' + (accs.length ? ' stroke-dasharray="7 4"' : '') + '/>');
    for (let px = X(left) + 6; px < X(right); px += 16) {
      const s = left + (px - X(left)) / k;
      if (!gSegs.some(([a0, a1]) => s >= a0 + 0.05 && s <= a1 - 0.05)) continue;
      o.push('<line x1="' + px.toFixed(1) + '" y1="' + Y(0) + '" x2="' + (px + 4).toFixed(1) + '" y2="' + (Y(0) - 5) + '" stroke="#3f6b3a"/>');
    }
    // Lichte Höhe im größten freien Abschnitt
    if (inner.length) for (const L of LV) {
      let free = [];
      for (const iv of inner) {
        let segs = [[iv[0], iv[1]]];
        for (const c of cuts) if (c[2] < L.zCeil - 1e-6 && c[3] > L.zFloorTop + 1e-6) segs = segs.flatMap(([a0, a1]) => (c[1] <= a0 || c[0] >= a1 ? [[a0, a1]] : [[a0, c[0]], [c[1], a1]].filter(([x, y]) => y - x > 0.05)));
        free = free.concat(segs);
      }
      const best = free.sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
      const H = L.H != null ? L.H : b.clearHeight;
      if (best && (best[1] - best[0]) * k > 90) o.push(textPx(X((best[0] + best[1]) / 2), Y((L.zFloorTop + L.zCeil) / 2) + 4, (LV.length > 1 ? T_('Ebene {n}', { n: L.idx + 1 }) + ', ' : '') + T_('lichte Höhe {h} m', { h: fmt(H) }), 'text-anchor="middle" fill="#57605b"'));
    }
    // Lasten und Erddruck
    if (showLoads) {
      const n = Math.max(4, Math.round((sR - sL) * k / 34));
      for (let i = 0; i <= n; i++) { const s = sL + (sR - sL) * i / n; o.push(line(s, hM + 1.25, s, hM + 0.08, 'stroke="#1d2220" stroke-width="1" marker-end="url(#ar)"')); }
      o.push(line(sL, hM + 1.25, sR, hM + 1.25, 'stroke="#1d2220" stroke-width="1"'));
      o.push(textPx(X((sL + sR) / 2), Y(hM + 1.25) - 8, T_('Decke: gₖ = {g} kN/m² inkl. Erde, qₖ = {q} kN/m²', { g: fmt(st.roof ? st.roof.gk : 0, 1), q: fmt(st.q, 1) }), 'text-anchor="middle" font-weight="600"'));
      const pw = st.wall, zt = hM - pw.pressures.top.z, zb = hM - pw.pressures.bot.z;
      const base = X(sR + iw) + 2, spx = Math.min(1.6, 95 / Math.max(pw.p2, 1));
      const P = (p, z) => (base + p * spx).toFixed(1) + ',' + Y(z).toFixed(1);
      o.push('<polygon points="' + [P(0, zt), P(pw.p1, zt), P(pw.p2, zb), P(0, zb)].join(' ') + '" fill="#b3261e" fill-opacity=".12" stroke="#b3261e"/>');
      for (let i = 0; i <= 5; i++) {
        const z = zt + (zb - zt) * i / 5, p = pw.p1 + (pw.p2 - pw.p1) * i / 5;
        o.push('<line x1="' + (base + p * spx) + '" y1="' + Y(z) + '" x2="' + (base + 2) + '" y2="' + Y(z) + '" stroke="#b3261e" stroke-width=".8" marker-end="url(#arr)"/>');
      }
      o.push(textPx(base + pw.p1 * spx + 5, Y(zt) + 4, fmt(pw.p1, 1) + ' kN/m²', 'fill="#b3261e"'));
      o.push(textPx(base + pw.p2 * spx + 5, Y(zb) + 4, fmt(pw.p2, 1) + ' kN/m²', 'fill="#b3261e"'));
    }
    // Maßkette rechts
    const dx = X(right) + 14;
    const zs = [hM, lv.zRoofTop + ir, lv.zRoofTop, lv.zCeil];
    for (const L of LV) { if (L.idx) zs.push(L.zSlabTop, L.zCeil); zs.push(L.zFloorTop); }
    zs.push(lv.zSlabBot, lv.zPit);
    const chain = zs.slice(1).map((z, i) => [zs[i], z]).filter(([a0, c]) => Math.abs(a0 - c) > 0.005);
    o.push('<line x1="' + dx + '" y1="' + Y(hM) + '" x2="' + dx + '" y2="' + Y(lv.zPit) + '" stroke="#57605b" stroke-width=".8"/>');
    for (const [z0, z1] of chain) {
      o.push('<line x1="' + (dx - 4) + '" y1="' + (Y(z0) + 4) + '" x2="' + (dx + 4) + '" y2="' + (Y(z0) - 4) + '" stroke="#1d2220" stroke-width="1.2"/>');
      const ty = (Y(z0) + Y(z1)) / 2;
      if (Math.abs(z0 - z1) * k > 26) o.push('<text x="' + (dx - 5) + '" y="' + ty + '" font-size="11.5" text-anchor="middle" transform="rotate(-90 ' + (dx - 5) + ' ' + ty + ')">' + fmt(Math.abs(z0 - z1)) + '</text>');
    }
    o.push('<line x1="' + (dx - 4) + '" y1="' + (Y(lv.zPit) + 4) + '" x2="' + (dx + 4) + '" y2="' + (Y(lv.zPit) - 4) + '" stroke="#1d2220" stroke-width="1.2"/>');
    // Höhenkoten
    marks.sort((m1, m2) => m2[0] - m1[0]);
    const mx = dx + 26;
    let lastY = -1e9;
    for (const [z, nm] of marks) {
      let y = Y(z);
      const ly = Math.max(y, lastY + 15);
      lastY = ly;
      o.push('<path d="M' + mx + ' ' + y + 'l-5 -7h10z" fill="none" stroke="#1d2220"/>');
      if (Math.abs(ly - y) > 1) o.push('<line x1="' + (mx + 6) + '" y1="' + y + '" x2="' + (mx + 12) + '" y2="' + ly + '" stroke="#8b938f" stroke-width=".7"/>');
      o.push(textPx(mx + 14, ly + 4, lvl(z) + '  ' + nm));
    }
    // Kopf und Legende
    o.push(textPx(16, 24, cl.name, 'font-size="14" font-weight="650"'));
    const nhn = A.p.site.groundNHN;
    const sub = [T_('Baugrube {d} m tief', { d: fmt(e.depth) }) + (e.k > 0 ? ', ' + T_('Böschung {a}°', { a: fmt(e.angle, 0) }) : ', ' + T_('mit Verbau')) + ', ' + T_('Arbeitsraum {w} m', { w: fmt(b.excavation.workspace) }) + (mo.on ? '; ' + T_('Erdhügel {h} m hoch, Krone {c} m, Böschung 1 : {n}', { h: fmt(hM), c: fmt(mo.crest), n: fmt(mo.n, 1) }) : '') + '.',
      T_('Höhen in m bezogen auf das Gelände') + (typeof nhn === 'number' && isFinite(nhn) ? ' (' + T_('±0,00 = {h} m NHN', { h: fmt(nhn) }) + ')' : '') + '.'];
    if ((sub[0].length + sub[1].length + 1) * 6.6 < W - 32) o.push(textPx(16, 42, sub.join(' '), 'fill="#57605b"'));
    else { o.push(textPx(16, 40, sub[0], 'fill="#57605b"')); o.push(textPx(16, 55, sub[1], 'fill="#57605b"')); }
    const legend = [['url(#sc)', T_('Stahlbeton')], ['url(#se)', T_('Gewachsener Boden')], ['url(#sf)', T_('Verfüllung')], ['url(#sg)', T_('Schotter')], ['#d9c9b4', T_('Mauerwerk')]];
    if (mo.on) legend.push(['url(#sh)', T_('Erdhügel')]);
    if (iw > 0 || ir > 0 || b.insulation.floor > 0) legend.push(['#f1dfb0', T_('Dämmung')]);
    if (isFinite(lv.zW)) legend.push(['rgba(47,120,168,.25)', T_('Wasser')]);
    if (q.prot && q.prot.items.length) legend.push(['#4a5a6a', T_('Schutzschichten')]);
    let lx = 16, ly = Math.min(H - 16, Y(zBot) + 30);
    for (const [f, t] of legend) {
      const wItem = 34 + t.length * 6.6;
      if (lx > 16 && lx + wItem > W - 8) { lx = 16; ly += 20; }
      o.push('<rect x="' + lx + '" y="' + (ly - 10) + '" width="14" height="14" fill="' + f + '" stroke="#8b938f" stroke-width=".6"/>');
      o.push(textPx(lx + 20, ly + 1, t, 'fill="#57605b"'));
      lx += wItem;
    }
    o.push(...late);
    svg.innerHTML = o.join('');
  };
})(typeof window !== 'undefined' ? window : globalThis);
