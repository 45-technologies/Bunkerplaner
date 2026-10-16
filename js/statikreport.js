/* Statische Berechnung (Vorbemessung) als prüffähig gegliedertes Dokument:
 * Deckblatt, Inhaltsverzeichnis, Grundlagen, Baustoffe, Baugrund, Lasten und Kombinationen, Positionsplan,
 * je Position System, Belastung, Schnittgrößen, Bemessung und Ergebnis, Zusammenstellung, Bewehrung, offene Punkte.
 * build() erzeugt eine Liste von Blöcken (rein rechnerisch, ohne DOM); render() verteilt sie im Browser auf A4-Seiten
 * mit Kopf- und Fußzeile und trägt die Seitenzahlen ins Inhaltsverzeichnis ein. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const G = BP.geo;
  const max = Math.max, min = Math.min;
  const T_ = BP.i18n.T, N_ = BP.i18n.N, I18 = BP.i18n;
  const f = (v, d = 2) => (typeof v === 'number' && isFinite(v) ? BP.calc.fmt(v, d) : '–');
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ok = (eta) => (eta <= 1 + 1e-9 ? '<span class="ok">' + T_('erfüllt') + '</span>' : '<span class="bad">' + T_('nicht erfüllt') + '</span>');
  /* Bauteilnamen, die zugleich Logikschlüssel sind (Betonierabschnitte, Biegeliste): bleiben deutsch, Übersetzung erst hier */
  const elName = (el) => { const m = /^(Zwischendecke über Ebene|Wände Ebene) (\d+)$/.exec(el || ''); return m ? (m[1] === 'Wände Ebene' ? T_('Wände Ebene {n}', { n: m[2] }) : T_('Zwischendecke über Ebene {n}', { n: m[2] })) : T_(el); };
  const etaTxt = (eta) => (isFinite(eta) ? f(eta) : '–');

  /* ---------- Zeichnungen ---------- */
  const n2 = (v) => (Math.round(v * 100) / 100).toString();
  const svgWrap = (w, h, body, cls) => '<svg class="' + (cls || 'fig') + '" viewBox="0 0 ' + n2(w) + ' ' + n2(h) + '" xmlns="http://www.w3.org/2000/svg" font-family="Archivo, Arial, sans-serif">' + body + '</svg>';
  const pathOf = (pts) => 'M' + pts.map((p) => n2(p.x) + ' ' + n2(p.y)).join('L') + 'Z';
  const txt = (x, y, t, o = {}) => '<text x="' + n2(x) + '" y="' + n2(y) + '" font-size="' + (o.size || 3) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.weight ? ' font-weight="' + o.weight + '"' : '') + ' fill="' + (o.fill || '#111') + '"' + (o.rot ? ' transform="rotate(' + o.rot + ' ' + n2(x) + ' ' + n2(y) + ')"' : '') + '>' + esc(t) + '</text>';
  const ln = (a, b, o = {}) => '<line x1="' + n2(a.x) + '" y1="' + n2(a.y) + '" x2="' + n2(b.x) + '" y2="' + n2(b.y) + '" stroke="' + (o.stroke || '#111') + '" stroke-width="' + (o.w || 0.3) + '"' + (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + '/>';
  /* Abbildung in einen Rahmen W × H (mm) einpassen, y nach oben */
  function fitter(bb, W, H, pad) {
    const k = min((W - 2 * pad) / max(bb.x1 - bb.x0, 1e-6), (H - 2 * pad) / max(bb.y1 - bb.y0, 1e-6));
    const ox = (W - (bb.x1 - bb.x0) * k) / 2, oy = (H - (bb.y1 - bb.y0) * k) / 2;
    return { k, P: (p) => ({ x: ox + (p.x - bb.x0) * k, y: H - oy - (p.y - bb.y0) * k }) };
  }
  const bubble = (p, t) => '<circle cx="' + n2(p.x) + '" cy="' + n2(p.y) + '" r="' + n2(1.6 + 0.55 * t.length) + '" fill="#fff" stroke="#8a1c1c" stroke-width="0.35"/>' + txt(p.x, p.y + 1.05, t, { size: 2.8, anchor: 'middle', weight: 700, fill: '#8a1c1c' });

  /* Positionsplan einer Ebene */
  function posPlan(q, li, pos) {
    const g = q.geo, Lg = g.L[li], bb = G.bbox(g.out), W = 170, H = Math.min(120, 170 * (bb.y1 - bb.y0) / max(bb.x1 - bb.x0, 1) + 16);
    const T = fitter(bb, W, H, 8), P = T.P, o = [];
    o.push('<path d="' + pathOf(g.out.map(P)) + ' ' + pathOf(g.inner.map(P)) + '" fill="#cfd3d0" fill-rule="evenodd" stroke="#111" stroke-width="0.4"/>');
    for (const w of Lg.walls) for (const sg of w.segs || []) {
      const u = G.norm(G.sub(sg.b, sg.a)), nn = { x: -u.y * w.t / 2, y: u.x * w.t / 2 };
      o.push('<path d="' + pathOf([G.add(sg.a, nn), G.add(sg.b, nn), G.sub(sg.b, nn), G.sub(sg.a, nn)].map(P)) + '" fill="' + (w.info && w.info.bearing ? '#8f9692' : '#e4e7e5') + '" stroke="#111" stroke-width="0.2"/>');
    }
    for (const bu of Lg.beams || []) for (const sg of bu.segs || []) {
      const u = G.norm(G.sub(sg.b, sg.a)), nn = { x: -u.y * bu.bw / 2, y: u.x * bu.bw / 2 };
      o.push('<path d="' + pathOf([G.add(sg.a, nn), G.add(sg.b, nn), G.sub(sg.b, nn), G.sub(sg.a, nn)].map(P)) + '" fill="none" stroke="#111" stroke-width="0.25" stroke-dasharray="1.6 0.8"/>');
    }
    for (const c of Lg.columns) o.push('<path d="' + pathOf(G.polygonFromRect(c.x - c.bx / 2, c.y - c.by / 2, c.x + c.bx / 2, c.y + c.by / 2).map(P)) + '" fill="#111"/>');
    for (const s of g.vert.stairs.filter((s2) => s2.upper === li || s2.lower === li)) o.push('<path d="' + pathOf((s.upper === li ? s.footUpper : s.footLower).map(P)) + '" fill="none" stroke="#1c5cab" stroke-width="0.3"/>');
    for (const v of g.vert.lifts.filter((v2) => li >= v2.levelTop && li <= v2.levelBot)) { const ip = v.innerPoly.map(P); o.push('<path d="' + pathOf(ip) + '" fill="none" stroke="#1c5cab" stroke-width="0.3"/>', ln(ip[0], ip[2], { w: 0.2, stroke: '#1c5cab' }), ln(ip[1], ip[3], { w: 0.2, stroke: '#1c5cab' })); }
    // Positionsnummern
    const e0 = g.out[0], e1 = g.out[1 % g.n];
    o.push(bubble(P(G.add(G.mul(G.add(e0, e1), 0.5), G.mul(G.edgeNormal(e0, e1), -g.tW / 2))), pos.wall));
    for (const w of Lg.walls) if (w.info && w.info.bearing && w.segs && w.segs.length && pos.walls[w.id]) { const sg = w.segs[0]; o.push(bubble(P(G.mul(G.add(sg.a, sg.b), 0.5)), pos.walls[w.id])); }
    for (const c of Lg.columns) if (pos.cols[c.id]) o.push(bubble(G.add(P(c), { x: 4, y: -4 }), pos.cols[c.id]));
    for (const bu of Lg.beams || []) if (pos.beams[bu.id] && bu.segs && bu.segs.length) o.push(bubble(G.add(P(G.mul(G.add(bu.segs[0].a, bu.segs[0].b), 0.5)), { x: 0, y: -3.5 }), pos.beams[bu.id]));
    for (const s of g.vert.stairs.filter((s2) => s2.upper === li)) if (pos.stairs[s.id]) o.push(bubble(P({ x: s.footUpper.reduce((a, pt) => a + pt.x, 0) / s.footUpper.length, y: s.footUpper.reduce((a, pt) => a + pt.y, 0) / s.footUpper.length }), pos.stairs[s.id]));
    for (const v of g.vert.lifts.filter((v2) => li === v2.levelTop)) if (pos.lifts[v.id]) o.push(bubble(P({ x: v.x, y: v.y }), pos.lifts[v.id]));
    return svgWrap(W, H, o.join(''));
  }

  /* Momentenbild einer FE-Platte: Hülle der Biegemomente m_x bzw. m_y (rot Feld, blau Stütze) */
  function feMap(pl, job, comp, outline) {
    const fe = pl.fe;
    if (!fe || !fe.mesh || !fe.raw) return '';
    const mesh = fe.mesh, mx = comp === 'x' ? fe.raw.mxMax : fe.raw.myMax, mn = comp === 'x' ? fe.raw.mxMin : fe.raw.myMin;
    const nodeV = (k) => (Math.abs(mn[k]) > Math.abs(mx[k]) ? mn[k] : mx[k]);
    const bb = G.bbox(outline), W = 84, H = Math.min(70, 84 * (bb.y1 - bb.y0) / max(bb.x1 - bb.x0, 1) + 14);
    const T = fitter(bb, W, H - 9, 3), P = T.P, o = [];
    let vMax = 0, vMin = 0;
    for (let k = 0; k < mesh.nNodes; k++) { const v = nodeV(k); vMax = max(vMax, v); vMin = min(vMin, v); }
    const col = (v) => {
      const t = v >= 0 ? min(1, v / max(vMax, 1e-6)) : min(1, -v / max(-vMin, 1e-6));
      const c0 = [247, 247, 245], c1 = v >= 0 ? [178, 34, 34] : [28, 92, 171];
      return 'rgb(' + c0.map((c, i) => Math.round(c + (c1[i] - c) * t)).join(',') + ')';
    };
    const holes = (job && job.holes) || [];
    const nE = mesh.elemN.length / 4;
    for (let e = 0; e < nE; e++) {
      const ns = [mesh.elemN[4 * e], mesh.elemN[4 * e + 1], mesh.elemN[4 * e + 2], mesh.elemN[4 * e + 3]];
      const pts = ns.map((k) => ({ x: mesh.nodeX[k], y: mesh.nodeY[k] }));
      const c = { x: pts.reduce((s, p) => s + p.x, 0) / 4, y: pts.reduce((s, p) => s + p.y, 0) / 4 };
      if (holes.some((h) => G.pointInPolygon(c, h))) continue;
      const v = ns.reduce((s, k) => s + nodeV(k), 0) / 4;
      const a = P({ x: min(...pts.map((p) => p.x)), y: max(...pts.map((p) => p.y)) }), b = P({ x: max(...pts.map((p) => p.x)), y: min(...pts.map((p) => p.y)) });
      o.push('<rect x="' + n2(a.x) + '" y="' + n2(a.y) + '" width="' + n2(b.x - a.x + 0.05) + '" height="' + n2(b.y - a.y + 0.05) + '" fill="' + col(v) + '"/>');
    }
    o.push('<path d="' + pathOf(outline.map(P)) + '" fill="none" stroke="#111" stroke-width="0.3"/>');
    for (const h of holes) o.push('<path d="' + pathOf(h.map(P)) + '" fill="#fff" stroke="#111" stroke-width="0.25"/>');
    for (const l of (job && job.lines) || []) if (!l.outer) o.push(ln(P(l.a), P(l.b), { w: 0.5, stroke: '#111' }));
    for (const a of (job && job.areas) || []) o.push('<path d="' + pathOf(a.poly.map(P)) + '" fill="#111"/>');
    // Legende
    const y0 = H - 6, x0 = 4, wL = W - 8;
    for (let i = 0; i < 40; i++) { const v = vMin + (vMax - vMin) * (i + 0.5) / 40; o.push('<rect x="' + n2(x0 + wL * i / 40) + '" y="' + n2(y0) + '" width="' + n2(wL / 40 + 0.05) + '" height="2" fill="' + col(v) + '"/>'); }
    o.push(txt(x0, y0 + 5, f(vMin, 1), { size: 2.4 }), txt(x0 + wL, y0 + 5, f(vMax, 1), { size: 2.4, anchor: 'end' }), txt(x0 + wL / 2, y0 + 5, 'm' + comp + ' [kNm/m]', { size: 2.4, anchor: 'middle' }));
    return svgWrap(W, H, o.join(''), 'fig half');
  }

  /* Wand als lotrechter Durchlaufträger mit Erd- und Wasserdruck */
  function wallFig(q) {
    const w = q.struct.wall, L = q.struct.loads, lv = q.lv, W = 80, H = 70, o = [];
    const zs = [L.zTopD].concat(lv.levels.slice(1).map((Lv) => lv.hM - (Lv.zSlabTop - Lv.tSlab / 2)), [L.zBotD]);
    const z0 = zs[0], z1 = zs[zs.length - 1], k = (H - 16) / max(z1 - z0, 0.1), X = 22, Y = (z) => 8 + (z - z0) * k;
    o.push(ln({ x: X, y: Y(z0) }, { x: X, y: Y(z1) }, { w: 0.8 }));
    for (const z of zs) o.push('<path d="M' + n2(X) + ' ' + n2(Y(z)) + 'l-3 -1.6v3.2z" fill="#111"/>');
    const pk = 30 / max(L.p2, L.p1, 1);
    o.push('<path d="M' + n2(X) + ' ' + n2(Y(z0)) + 'L' + n2(X + L.p1 * pk) + ' ' + n2(Y(z0)) + 'L' + n2(X + L.p2 * pk) + ' ' + n2(Y(z1)) + 'L' + n2(X) + ' ' + n2(Y(z1)) + 'Z" fill="#f3d9d2" stroke="#b3261e" stroke-width="0.3"/>');
    o.push(txt(X + L.p1 * pk + 1.5, Y(z0) + 3, 'eEd = ' + f(L.p1, 1) + ' kN/m²', { size: 2.6 }), txt(X + L.p2 * pk + 1.5, Y(z1) - 1, 'eEd = ' + f(L.p2, 1) + ' kN/m²', { size: 2.6 }));
    o.push(txt(4, Y(z0) + 1, T_('Decke'), { size: 2.4 }), txt(4, Y(z1) + 1, T_('Sohle'), { size: 2.4 }));
    for (let i = 0; i < zs.length - 1; i++) o.push(txt(X - 9, (Y(zs[i]) + Y(zs[i + 1])) / 2, 'l = ' + f(w.spans[i] != null ? (Array.isArray(w.spans[i]) ? w.spans[i][1] - w.spans[i][0] : w.spans[i]) : zs[i + 1] - zs[i]), { size: 2.4, rot: -90, anchor: 'middle' }));
    return svgWrap(W, H, o.join(''), 'fig half');
  }

  /* Durchlaufträger (Unterzug) */
  function beamFig(bd) {
    const W = 170, H = 26, o = [], k = (W - 20) / max(bd.L, 0.1), X = (s) => 10 + s * k, y = 12;
    o.push('<rect x="' + n2(X(0)) + '" y="' + n2(y - 6) + '" width="' + n2(bd.L * k) + '" height="2.2" fill="#f3d9d2" stroke="#b3261e" stroke-width="0.2"/>');
    o.push(txt(X(bd.L / 2), y - 7, 'gk = ' + f(bd.gk, 1) + ' kN/m, qk = ' + f(bd.qk, 1) + ' kN/m', { size: 2.6, anchor: 'middle' }));
    o.push(ln({ x: X(0), y }, { x: X(bd.L), y }, { w: 0.9 }));
    for (const sp of bd.sups || []) o.push('<path d="M' + n2(X(sp.s)) + ' ' + n2(y) + 'l-2 3.4h4z" fill="#111"/>');
    const sp = bd.sups || [];
    for (let i = 0; i + 1 < sp.length; i++) o.push(txt((X(sp[i].s) + X(sp[i + 1].s)) / 2, y + 8, 'l = ' + f(sp[i + 1].s - sp[i].s), { size: 2.6, anchor: 'middle' }));
    return svgWrap(W, H, o.join(''));
  }

  /* Gleitkreis einer Böschung */
  function slopeFig(r, title) {
    const gm = r.geom;
    if (!gm) return '';
    const Hs = max(0.5, gm.crest.y - gm.toe.y);
    const x0 = min(gm.toe.x - 0.3 * (gm.crest.x - gm.toe.x) - 1.5, r.r ? r.xa - 1 : Infinity);
    const x1 = max(gm.crest.x + 3, r.r ? r.xb + 2 : -Infinity, gm.block ? gm.block.x0 + 3 : -Infinity);
    const yBot = r.r ? min(gm.toe.y - 0.8, r.yc - r.r - 0.5) : gm.toe.y - 1;
    const bb = { x0, x1, y0: yBot, y1: gm.crest.y + max(1.2, 0.35 * Hs) };
    const W = 170, H = Math.min(80, 170 * (bb.y1 - bb.y0) / (bb.x1 - bb.x0) + 6), T = fitter(bb, W, H, 3), P = T.P, o = [];
    const yAt = (x) => { const g = gm.ground; if (x <= g[0][0]) return g[0][1]; for (let i = 1; i < g.length; i++) if (x <= g[i][0]) { const [a0, b0] = g[i - 1], [a1, b1] = g[i]; return b0 + (b1 - b0) * (x - a0) / max(a1 - a0, 1e-9); } return g[g.length - 1][1]; };
    const surf = [];
    for (let i = 0; i <= 120; i++) { const x = x0 + (x1 - x0) * i / 120; surf.push({ x, y: yAt(x) }); }
    o.push('<path d="' + pathOf(surf.concat([{ x: x1, y: bb.y0 }, { x: x0, y: bb.y0 }]).map(P)) + '" fill="#efe6d4" stroke="#6b5a3a" stroke-width="0.4"/>');
    if (gm.yL != null) o.push(ln(P({ x: x0, y: gm.yL }), P({ x: x1, y: gm.yL }), { w: 0.2, dash: '1.2 0.8', stroke: '#6b5a3a' }));
    if (gm.block) { const a = P({ x: gm.block.x0, y: gm.block.y1 }), b = P({ x: x1, y: bb.y0 }); o.push('<rect x="' + n2(a.x) + '" y="' + n2(a.y) + '" width="' + n2(b.x - a.x) + '" height="' + n2(b.y - a.y) + '" fill="#b9bfbb" stroke="#111" stroke-width="0.3"/>'); }
    for (const l of gm.loads || []) { const a = P({ x: max(l.x0, x0), y: yAt(max(l.x0, x0)) }), b = P({ x: min(l.x1, x1), y: yAt(min(l.x1, x1)) }); o.push('<rect x="' + n2(a.x) + '" y="' + n2(a.y - 2.2) + '" width="' + n2(max(0, b.x - a.x)) + '" height="2" fill="#f3d9d2" stroke="#b3261e" stroke-width="0.2"/>'); }
    if (r.r) {
      const arc = [];
      for (let i = 0; i <= 60; i++) { const x = r.xa + (r.xb - r.xa) * i / 60, dx = x - r.xc; if (Math.abs(dx) < r.r) arc.push({ x, y: r.yc - Math.sqrt(r.r * r.r - dx * dx) }); }
      o.push('<path d="M' + arc.map(P).map((p) => n2(p.x) + ' ' + n2(p.y)).join('L') + '" fill="none" stroke="#b3261e" stroke-width="0.6"/>');
      const c = P({ x: r.xc, y: r.yc });
      const lab = P(arc[Math.floor(arc.length * 0.35)] || { x: r.xc, y: r.yc - r.r });
      if (c.y > 0 && c.y < H) o.push('<circle cx="' + n2(c.x) + '" cy="' + n2(c.y) + '" r="0.8" fill="#b3261e"/>');
      o.push(txt(lab.x + 2, lab.y + 4, T_('Gleitkreis M ({x} | {y}), r = {r} m, F = {F}', { x: f(r.xc, 1), y: f(r.yc, 1), r: f(r.r, 1), F: f(r.F) }), { size: 2.6, fill: '#b3261e' }));
    }
    o.push(txt(3, 4, title, { size: 2.8, weight: 600 }));
    return svgWrap(W, H, o.join(''));
  }

  /* Treppenlauf als Einfeldplatte */
  function stairFig(s) {
    const W = 84, H = 40, o = [], k = 60 / max(s.span, s.dh, 0.5), x0 = 12, yb = 32;
    const A = { x: x0, y: yb - s.dh * k }, B = { x: x0 + s.run * k, y: yb };
    o.push(ln(A, B, { w: 0.9 }), ln({ x: A.x - 8, y: A.y }, A, { w: 0.9 }), ln(B, { x: B.x + 8, y: B.y }, { w: 0.9 }));
    o.push('<path d="M' + n2(A.x) + ' ' + n2(A.y) + 'l-2 3.4h4z" fill="#111"/>', '<path d="M' + n2(B.x) + ' ' + n2(B.y) + 'l-2 3.4h4z" fill="#111"/>');
    o.push(txt((A.x + B.x) / 2, yb + 6, T_('l = {l} m (Grundriss)', { l: f(s.span) }), { size: 2.6, anchor: 'middle' }), txt(A.x - 2, (A.y + yb) / 2, 'Δh = ' + f(s.dh), { size: 2.4, rot: -90, anchor: 'middle' }));
    return svgWrap(W, H, o.join(''), 'fig half');
  }

  /* ---------- Positionsnummern ---------- */
  function positions(q) {
    const g = q.geo, st = q.struct, pos = { roof: '1', mids: {}, wall: '3', walls: {}, cols: {}, beams: {}, floor: '7', stairs: {}, lifts: {} };
    (st.mids || []).forEach((m, i) => { pos.mids[m.level] = '2.' + (i + 1); });
    let nw = 0;
    for (const iw of st.intWalls || []) if (!iw.auto && !pos.walls[iw.id]) pos.walls[iw.id] = '4.' + (++nw);
    (st.columns || []).forEach((c, i) => { pos.cols[c.id] = '5.' + (i + 1); });
    (st.beams || []).forEach((b, i) => { pos.beams[b.id] = '6.' + (i + 1); });
    g.vert.stairs.forEach((s, i) => { pos.stairs[s.id] = '8.' + (i + 1); });
    g.vert.lifts.forEach((v, i) => { pos.lifts[v.id] = '9.' + (i + 1); });
    return pos;
  }

  /* ---------- Blöcke ---------- */
  function build(q, meta) {
    const p = q.p, b = p.build, g = q.geo, st = q.struct, L = st.loads || {}, mat = st.mat, vf = q.verify || {}, soil = q.soil, lv = q.lv;
    const B = [], pos = positions(q), summary = [];
    // WU-Richtlinie: Beanspruchungsklasse 1 bei drückendem, zeitweise aufstauendem oder unbekanntem Wasser, sonst 2
    const bk = st.buoyancy.relevant || p.site.waterMode === 'gok' || !lv.water.known || !(BP.model.SOILS[p.site.soil] || {}).permeable ? 1 : 2;
    const H = (lvl, num, text, extra) => B.push(Object.assign({ t: 'h', lvl, num, text }, extra || {}));
    const P_ = (html) => B.push({ t: 'p', html });
    const KV = (rows) => B.push({ t: 'kv', rows: rows.filter(Boolean) });
    const TB = (head, rows, align, cls) => B.push({ t: 'table', head, rows, align, cls });
    const FIG = (svg, cap) => { if (svg) B.push({ t: 'fig', svg, cap }); };
    const FIG2 = (a, b2, cap) => { if (a || b2) B.push({ t: 'fig2', svgs: [a, b2].filter(Boolean), cap }); };
    const RES = (items) => B.push({ t: 'res', items });
    const NOTE = (html) => B.push({ t: 'note', html });
    const sumAdd = (posNo, el, what, eta) => summary.push({ pos: posNo, el, what, eta });
    const multi = g.L.length > 1;
    // Norm des Projekts: Deutschland wie bisher (DIN EN …/NA, DIN 1054), sonst Dokumente und Parameter des Landes bzw. EN-Empfehlung
    const NP = BP.normen.profile(q.p), NDE = NP.code === 'EC' && NP.na === 'DE', DOC = NP.docs || ['EN 1990', 'EN 1992-1-1', 'EN 1997-1', 'EN 1998-1'];
    const dF = (v) => { const t = String(Math.round(v * 10000) / 10000); return I18.dec(t.includes('.') ? t : t + '.0'); };
    const naTag = NDE ? T_('mit NA DE') : NP.na === 'EN' ? T_('mit EN-Empfehlungswerten') : T_('mit nationalem Anhang {c}', { c: NP.na });
    const LSs = NP.lf.sets, gov = (fn) => LSs.reduce((a, S) => (fn(S) > fn(a) ? S : a), LSs[0]);
    const setTag = (S) => (LSs.length > 1 ? ' (' + I18.maybe(S.tag) + ')' : '');
    const EC = NP.code === 'EC', SIA = NP.code === 'SIA', ACI = NP.code === 'ACI';
    // Abschnitte der Betonnorm für Texte außerhalb des Eurocodes
    const RF = ACI ? NP.ref : SIA ? { bend: 'SIA 262 4.3.2', shear: 'SIA 262 4.3.3', crack: 'SIA 262 4.4.2', links: 'SIA 262 4.3.3.4', col: 'SIA 262 4.3.7', punch: 'SIA 262 4.3.6', wall: 'SIA 262 4.3.7', defl: 'SIA 262 4.4.3', lap: 'SIA 262 5.2', fire: 'SIA 262 / EN 1992-1-2' }
      : { bend: 'EC2 6.1', shear: 'EC2 6.2', crack: 'EC2 7.3', links: 'EC2 6.2.3', col: 'EC2 5.8', punch: 'EC2 6.4', wall: 'EC2 12.6.5.2', defl: 'EC2 7.4.2', lap: 'EC2 8.7', fire: 'EN 1992-1-2' };
    const nameOfLine = (id) => (/^aussen(\d+)$/.test(id) ? T_('Außenwand, Kante {n}', { n: id.slice(6) }) : g.labels['w:' + id] || g.labels['b:' + id] || (g.vert.lifts.find((v) => id.startsWith(v.id + 'w')) ? T_('Schachtwand {name}', { name: g.labels['v:' + g.vert.lifts.find((v) => id.startsWith(v.id + 'w')).id] || '' }) : id));

    // Deckblatt
    B.push({ t: 'title', meta });
    B.push({ t: 'toc' });

    // 1 Allgemeines
    H(1, '1', T_('Allgemeines'));
    H(2, '1.1', T_('Bauaufgabe'));
    P_(T_(lv.mound.on ? 'Unterirdisches Schutzbauwerk („{name}“) aus Stahlbeton, teilweise über Gelände mit Erdhügel.' : 'Unterirdisches Schutzbauwerk („{name}“) aus Stahlbeton.', { name: esc(p.name || T_('Bunker')) }) + ' ' +
      T_(multi ? '{n} Ebenen, Bruttogrundfläche {a} m², Nutzfläche {an} m², Belegung {p} Personen.' : 'Eine Ebene, Bruttogrundfläche {a} m², Nutzfläche {an} m², Belegung {p} Personen.', { n: g.L.length, a: f(g.A), an: f(g.tot.Anet), p: esc(p.use.people) }) +
      (p.site.label ? ' ' + T_('Standort: {s}.', { s: esc(p.site.label) }) : ''));
    H(2, '1.2', T_('Tragwerk und Lastabtrag'));
    P_(T_(multi ? 'Geschlossener Stahlbetonkasten: Decke {r} cm, Außenwände {w} cm, Bodenplatte {f} cm, Zwischendecken {m}.' : 'Geschlossener Stahlbetonkasten: Decke {r} cm, Außenwände {w} cm, Bodenplatte {f} cm.', { r: f(b.tRoof * 100, 0), w: f(b.tWall * 100, 0), f: f(b.tFloor * 100, 0),
      m: multi ? g.L.slice(1).map((Lg) => f(Lg.tSlab * 100, 0) + ' cm').join(' / ') : '' }) + ' ' + T_('Die Decke trägt Erdüberdeckung und Geländelast über {sup} in die Bodenplatte; diese gibt die Lasten als elastisch gebettete Platte an den Baugrund ab.', {
      sup: T_((st.columns || []).length ? ((st.beams || []).length ? 'tragende Wände, Stützen und Unterzüge' : 'tragende Wände, Stützen') : (st.beams || []).length ? 'tragende Wände und Unterzüge' : 'tragende Wände') }) + ' ' +
      T_('Die Außenwände tragen Erd- und Wasserdruck lotrecht zwischen den Platten und waagerecht zu den Wandecken. Die Aussteifung übernimmt der geschlossene Kasten; horizontale Lasten aus Erddruck heben sich auf.'));
    H(2, '1.3', T_('Positionsplan'));
    g.L.forEach((Lg, li) => FIG(posPlan(q, li, pos), (multi ? T_('Ebene {n} „{name}“', { n: li + 1, name: esc(Lg.name) }) + ': ' : '') + T_('Platte darüber Pos. {a}, darunter Pos. {b}. Positionen in Kreisen; tragende Wände dunkel, Stützen schwarz, Unterzüge gestrichelt, Treppen und Aufzüge blau', { a: li === 0 ? pos.roof : pos.mids[li], b: li === g.L.length - 1 ? pos.floor : pos.mids[li + 1] })));
    TB([T_('Pos.'), T_('Bauteil')], [[pos.roof, T_('Decke')]].concat((st.mids || []).map((m) => [pos.mids[m.level], esc(m.name)]), [[pos.wall, T_('Außenwände')]],
      Object.entries(pos.walls).map(([id, n]) => [n, esc(g.labels['w:' + id] || T_('Innenwand'))]), Object.entries(pos.cols).map(([id, n]) => [n, esc(g.labels['c:' + id] || T_('Stütze'))]),
      Object.entries(pos.beams).map(([id, n]) => [n, esc(g.labels['b:' + id] || T_('Unterzug'))]), [[pos.floor, T_('Bodenplatte')]], Object.entries(pos.stairs).map(([id, n]) => [n, esc(g.labels['v:' + id] || T_('Innentreppe'))]),
      Object.entries(pos.lifts).map(([id, n]) => [n, T_('{name}: Schacht und Grube', { name: esc(g.labels['v:' + id] || T_('Aufzug')) })]), [['10', T_('Gründung: Sohldruck, Grundbruch, Setzung, Auftrieb')], ['11', T_('Böschungen')], ['12', T_('Feuerwiderstand')]],
      st.blast || q.blastDyn ? [['13', T_('Außergewöhnliche Einwirkung Luftstoß')]] : [], [['14', T_('Betonierabschnitte, Fugen, WU-Konzept')]], vf.eq ? [['15', T_('Erdbeben')]] : []), ['l', 'l']);

    // 2 Grundlagen
    H(1, '2', T_('Grundlagen'));
    H(2, '2.1', T_('Normen und Richtlinien'));
    B.push({ t: 'list', items: (ACI ? [
      T_('{doc}: Mindestlasten und Lastkombinationen', { doc: NP.us ? 'ASCE/SEI 7-22' : esc(DOC[0]) + ', ASCE/SEI 7-22' }),
      T_('{doc}: Bemessung von Stahlbetontragwerken (SI-Einheiten)', { doc: 'ACI 318-19' }),
      T_('{doc}: Feuerwiderstand von Betonbauteilen (Tabellen)', { doc: 'ACI/TMS 216.1-14' }),
      T_('{doc}: Baugrund und Gründungen (zulässige Spannungen); Grundbruch mit Tragfähigkeitsbeiwerten wie EN 1997-1 Anhang D, Setzungen nach Steinbrenner, Geländebruch nach Bishop', { doc: NP.us ? 'IBC 2024 Ch. 18' : esc(DOC[2]) }),
    ].concat(NP.us ? [T_('{doc}: Baugruben und Böschungen', { doc: 'OSHA 29 CFR 1926 Subpart P' })] : [], [
      T_('Wasserundurchlässiger Beton: Rissbreite als Hilfsnachweis nach EN 1992-1-1 7.3 (ACI 350 nicht umgesetzt); Abdichtung nach IBC 1805 bzw. den Regeln des Landes'),
    ]) : SIA ? [
      T_('{doc}: Grundlagen der Projektierung von Tragwerken', { doc: 'SIA 260:2013' }),
      T_('{doc}: Einwirkungen auf Tragwerke', { doc: 'SIA 261:2020' }),
      T_('{doc}: Betonbau', { doc: 'SIA 262:2013' }),
      T_('{doc}: Geotechnik', { doc: 'SIA 267:2013' }),
      T_('EN 1992-1-2 sinngemäß für den Brandfall (Tabellenverfahren)'),
      T_('Wasserundurchlässiger Beton: Rissbeschränkung nach SIA 262 4.4.2 (hohe Anforderungen); Abdichtung nach SIA 272'),
    ] : NDE ? [
      T_('DIN EN 1990 mit NA: Grundlagen der Tragwerksplanung'),
      T_('DIN EN 1991-1-1 mit NA: Wichten, Eigengewicht, Nutzlasten'),
      T_('DIN EN 1992-1-1 mit NA: Bemessung von Stahlbetontragwerken'),
      T_('DIN EN 1992-1-2 mit NA: Tragwerksbemessung für den Brandfall (Tabellenverfahren)'),
      T_('DIN EN 1997-1 mit NA und DIN 1054: Geotechnik; DIN 4017 (Grundbruch), DIN 4019 (Setzungen), DIN 4084 (Geländebruch), DIN 4085 (Erddruck), DIN 4124 (Baugruben)'),
      T_('DAfStb-Richtlinie Wasserundurchlässige Bauwerke aus Beton (WU-Richtlinie); DIN 18533 (Abdichtung erdberührter Bauteile)'),
    ] : [
      T_('{doc}: Grundlagen der Tragwerksplanung', { doc: esc(DOC[0]) }),
      T_('EN 1991-1-1 mit nationalem Anhang: Wichten, Eigengewicht, Nutzlasten'),
      T_('{doc}: Bemessung von Stahlbetontragwerken', { doc: esc(DOC[1]) }),
      T_('EN 1992-1-2: Tragwerksbemessung für den Brandfall (Tabellenverfahren)'),
      T_('{doc}: Geotechnik, Nachweisverfahren {da}; Grundbruch nach EN 1997-1 Anhang D (Verfahren wie DIN 4017), Setzungen nach Steinbrenner, Geländebruch nach Bishop, Erdruhedruck K₀ = 1 − sin φ′', { doc: esc(DOC[2]), da: esc(NP.geo.da) }),
      T_('Wasserundurchlässiger Beton: Rissbreitenbegrenzung nach EN 1992-1-1 7.3 (bei Bedarf EN 1992-3); Abdichtung nach den Regeln des Landes'),
    ]).concat(st.blast ? [T_('Technische Weisung Schutzbau (TWK 2017) für den Lastfall Luftstoß')] : [], g.vert.lifts.length ? [T_('DIN EN 81-20 (Personen- und Lastenaufzüge), Lastangaben des Herstellers')] : []) });
    H(2, '2.2', T_('Unterlagen und Annahmen'));
    B.push({ t: 'list', items: [
      T_('Baugrund: {soil} nach Tabellen- und Erfahrungswerten – ein Baugrundgutachten liegt nicht vor und ist vor der Ausführung einzuholen.', { soil: esc(T_(soil.name)) }),
      T_('Bemessungswasserstand: {w}.', { w: esc(lv.water.label) }),
      T_('Geometrie aus dem Bunkerplaner (Grundriss, Ebenen, Öffnungen, Stützen, Unterzüge, Treppen, Aufzüge).'),
      T_('Diese Berechnung ist eine Vorbemessung. Sie ist vom verantwortlichen Tragwerksplaner zu prüfen, zu ergänzen und zu unterschreiben und gegebenenfalls durch einen Prüfingenieur zu prüfen.'),
    ].concat(NP.national ? [T_('Im Land gilt: {nat}. Diese Berechnung folgt {label}; Abweichungen sind vom Tragwerksplaner nach der geltenden Norm zu prüfen.', { nat: esc(NP.national), label: esc(NP.label) })] : [],
      !NDE && NP.code === 'EC' ? [T_('Nationale Parameter siehe Abschnitt 2.4. Werte ohne nationalen Beleg sind EN-Empfehlungswerte und vor der Ausführung mit dem nationalen Anhang abzugleichen.')] : [],
      ACI ? [T_('Normwerte siehe Abschnitt 2.4. Bemessung in SI-Einheiten (ACI 318-19, Ausgabe in SI); Betonstahl {steel}. Nicht umgesetzt bzw. sinngemäß: ACI 350 (WU-Rissbreite nach EN 1992-1-1), zweiachsige Stützeninteraktion wie EN 1992-1-1 5.8.9. Die Ergebnisse sind vom verantwortlichen Tragwerksplaner (Engineer of Record) zu prüfen.', { steel: esc(NP.steelName) })] : [],
      SIA ? [T_('Normwerte siehe Abschnitt 2.4. Teile ohne Beleg in den zugänglichen Quellen (Theorie II. Ordnung der Stützen, Biegeschlankheit, Übergreifung, Betondeckung, Brandschutz, Zuordnung der Rissbeschränkungskurven) sind sinngemäß nach EN 1992-1-1 bzw. vorsichtig angesetzt und mit SIA 262 abzugleichen.')] : []) });
    H(2, '2.3', T_('Rechenverfahren'));
    B.push({ t: 'list', items: [
      T_('Platten: Finite Elemente (schubweiche Plattenelemente, Netz ≈ {h} m); tragende Innenwände und Unterzüge als starre Linienlager, Stützen als Flächenlager, Außenwände als Rahmenecke mit Drehfeder; Bodenplatte elastisch gebettet (Bettungsmodul aus dem Steifemodul), abhebende Bereiche iterativ ausgeschaltet. Verkehrslasten zusätzlich feldweise.', { h: f((st.fe.jobs.roof && st.fe.jobs.roof.meshSize) || 0.33) }),
      T_('Bemessungsmomente der Platten bis 1,5·d vor Auflagern, Stützen, Aussparungsrändern und unter Einzellasten über eine Breite von 2·d gemittelt (Quadrat ±d um jeden Knoten): Spitzen dort sind Singularitäten der Plattentheorie und hängen sonst von der Netzweite ab. Die Mittelungsbreite entspricht etwa c + d (Rombach, Anwendung der FEM im Betonbau). Im Feld werden die Knotenwerte ungemittelt bemessen. Unterzüge erhalten den Lastverlauf aus den FE-Auflagerkräften (über 0,5 m geglättet).'),
      EC ? T_('Bemessung der Platten je Knoten für Biegung (EC2 6.1), Querkraft (6.2), Rissbreite unter quasi-ständiger Last (7.3.4) und Zwang (7.3.2); Grundbewehrung je Lage, Zulagen in Bereichen höherer Beanspruchung.')
        : T_('Bemessung der Platten je Knoten für Biegung ({b}), Querkraft ({s}) und Rissbeschränkung ({c}); Grundbewehrung je Lage, Zulagen in Bereichen höherer Beanspruchung.', { b: RF.bend, s: RF.shear, c: RF.crack }),
      st.wall && st.wall.method === 'FE' ? T_('Außenwände als FE-Platten je Wandseite (Achsmaße): an Decke und Bodenplatte gelenkig mit Drehfeder aus der Plattensteifigkeit (3,5 EI/l), an Zwischendecken und tragenden Innenwänden linienförmig gestützt, Öffnungen ausgespart; Wandecken als Grenzfälle eingespannt und gelenkig (Hülle). Rahmenecke außen mindestens mit dem Eckmoment der Plattenrechnung.') : T_('Außenwände als lotrechter Durchlaufträger zwischen den Platten mit Momentenausgleich an den Rahmenecken, waagerecht als Platte zu den Wandecken.'),
      NDE ? T_('Stützen nach EC2 5.8 mit Nennkrümmung, Imperfektion l₀/400 und Mindestausmitte; Durchstanzen nach EC2 6.4 mit NA DE.') : EC ? T_('Stützen nach EC2 5.8 mit Nennkrümmung, Imperfektion l₀/400 und Mindestausmitte; Durchstanzen nach EC2 6.4 {na}.', { na: naTag })
        : ACI ? T_('Stützen nach {col} (Momentenvergrößerung im unverschieblichen Tragwerk, Mindestmoment Pu · (15 mm + 0,03 h), Schlankheit vernachlässigbar bis k lu/r = 22); Durchstanzen nach {punch}.', { col: RF.col, punch: RF.punch })
        : T_('Stützen nach {col} (Theorie II. Ordnung mit Nennkrümmung wie EN 1992-1-1 5.8, Imperfektion l₀/400, Mindestausmitte); Durchstanzen nach {punch}.', { col: RF.col, punch: RF.punch }),
      EC ? T_('Unterzüge als Durchlaufträger mit feldweiser Verkehrslast; Schub mit Fachwerkmodell (EC2 6.2.3).') : T_('Unterzüge als Durchlaufträger mit feldweiser Verkehrslast; Schub mit Fachwerkmodell ({links}).', { links: RF.links }),
      T_('Baugrund, Böschungen und Brandschutz siehe Pos. 10 bis 12.'),
    ] });
    if (NP.params) {
      const SRC = { v: T_('Normtext'), s: T_('Sekundärquelle, prüfen'), e: T_('sinngemäß EN 1992, prüfen') };
      H(2, '2.4', T_('Normwerte ({c})', { c: esc(NP.label) }));
      TB([T_('Parameter'), T_('Wert'), T_('Herkunft')], NP.params().map(([k, v, st0]) => [esc(T_(k)), esc(v), SRC[st0] || '']), ['l', 'l', 'l'], 'small');
    }
    if (NP.code === 'EC' && NP.n) {
      const n = NP.n, st0 = n.st || {}, SRC = { v: T_('nationaler Anhang'), s: T_('Sekundärquelle, prüfen'), e: T_('EN-Empfehlung, NA prüfen') };
      const src = (k) => SRC[st0[k] || 'e'];
      H(2, '2.4', T_('Nationale Parameter ({na})', { na: n.na === 'EN' ? T_('EN-Empfehlungswerte') : n.na }));
      TB([T_('Parameter'), T_('Wert'), T_('Herkunft')], [
        [T_('Teilsicherheiten Einwirkungen'), 'γG = ' + dF(n.gG) + ', γG,inf = ' + dF(n.gGinf) + ', γQ = ' + dF(n.gQ) + (n.eq !== '6.10' ? ', ξ = ' + dF(n.xi) + ' (' + esc(n.eq.replace('ab0', 'a/b').replace('ab', 'a/b')) + ')' : ' (6.10)'), src('gG')],
        [T_('Kombinationsbeiwerte'), 'Kat. A: ψ₀/ψ₁/ψ₂ = ' + n.psiA.map(dF).join('/') + '; Kat. E: ' + n.psiE.map(dF).join('/'), src('psiA')],
        [T_('Beton und Betonstahl'), 'γc = ' + dF(n.gc) + ', γs = ' + dF(n.gs) + ', αcc = ' + dF(n.acc), src('gc')],
        [T_('Querkraft ohne Bewehrung'), 'CRd,c = ' + dF(n.crdc) + '/γc' + (n.crdcPlate ? ' (' + T_('Platten ×{f}', { f: dF(n.crdcPlate) }) + ')' : '') + ', vmin ' + esc({ DE: 'NA DE (d-abhängig)', FR: 'NA FR', DK: '0,051/γc · k^1,5 · √fck' }[n.vmin] || '0,035 · k^1,5 · √fck'), src('crdc')],
        [T_('Rissbreite wmax (XC2–XC4)'), dF(n.wk.XC) + ' mm' + (n.wkComb === 'freq' ? ' ' + T_('(NB: häufige Kombination; gerechnet quasi-ständig, prüfen)') : ''), src('wk')],
        [T_('Betondeckung'), 'cmin,dur XC4 = ' + n.cmin.XC4 + ' mm, Δcdev = ' + n.dcdev + ' mm', src('cmin')],
        [T_('Durchstanzen'), 'β = ' + dF(n.punch.beta) + ', CRd,c = ' + dF(n.punch.crdc) + '/γc', src('punch')],
        [T_('Geotechnik'), esc(n.geo.da) + ': γR,v = ' + dF(n.geo.gRv) + ', γR,h = ' + dF(n.geo.gRh) + '; ' + T_('Böschungen tan φ / {a}, c / {b}', { a: dF(n.geo.sl[0]), b: dF(n.geo.sl[1]) }), src('geo')],
        [T_('Auftrieb (UPL)'), 'γG,dst = ' + dF(n.upl.dst) + ', γG,stb = ' + dF(n.upl.stb), src('upl')],
      ], ['l', 'l', 'l'], 'small');
    }

    // 3 Baustoffe
    H(1, '3', T_('Baustoffe'));
    const psi = (fc) => String(Math.round(fc * 145.038 / 10) * 10);
    const sLimACI = ACI ? Math.min(380 - 2.5 * b.cnom * 1000, 300) : 0;
    KV([[T_('Beton'), ACI ? T_('{name}: f′c = {fc} MPa ({psi} psi), Spannungsblock 0,85 f′c über β1 · c mit β1 = {b1}, fr = 0,62 √f′c = {fr} MPa, Ec = 4700 √f′c = {ec} MPa', { name: esc(mat.name), fc: f(mat.fck, 0), psi: psi(mat.fck), b1: f(mat.beta1, 2), fr: f(mat.fr, 2), ec: f(mat.Ecm, 0) })
      : SIA ? T_('{name}: fck = {fck} MPa, fcd = ηfc · fck / γc = {eta} · fck / {gc} = {fcd} MPa, τcd = 0,3 · √fck / γc = {tau} MPa, fctm = {fctm} MPa, Ecm = {ecm} MPa', { name: esc(mat.name), fck: f(mat.fck, 0), eta: f(mat.etaFc, 3), gc: dF(NP.gc), fcd: f(mat.fcd, 1), tau: f(mat.tauCd, 2), fctm: f(mat.fctm, 1), ecm: f(mat.Ecm, 0) })
      : T_('{name}: fck = {fck} MPa, fcd = {acc} · fck / {gc} = {fcd} MPa, fctm = {fctm} MPa, Ecm = {ecm} MPa', { name: esc(mat.name), fck: f(mat.fck, 0), acc: dF(NP.acc), gc: dF(NP.gc), fcd: f(mat.fcd, 1), fctm: f(mat.fctm, 1), ecm: f(mat.Ecm, 0) })],
      ACI ? [T_('Expositionsklassen'), T_(L.wu ? 'F1, S0, W2, C1 außen erdberührt (ACI 318-19 Tab. 19.3.1.1, WU: W2); C0 innen' : 'F1, S0, W1, C1 außen erdberührt (ACI 318-19 Tab. 19.3.1.1); C0 innen')] :
      [T_('Expositionsklassen'), T_(L.wu ? 'XC4, XF1 außen erdberührt, WU-Beton ({wp}, Beanspruchungsklasse {bk}); XC1 innen' : 'XC4, XF1 außen erdberührt; XC1 innen', { wp: L.wu ? esc(T_((BP.model.WATERPROOFING[b.waterproofing] || {}).name) || '') : '', bk })],
      [T_('Betondeckung'), T_('cnom = {a} mm (Platten und Wände), {b} mm (Stützen, Feuerwiderstand), 30 mm (Unterzüge), {c} mm (Treppen)', { a: f(b.cnom * 1000, 0), b: f((mat.colCover || 0.03) * 1000, 0), c: f(((g.vert.stairs[0] && g.vert.stairs[0].design && g.vert.stairs[0].design.cnom) || 0.03) * 1000, 0) })],
      NP.coverMin ? [T_('Mindestbetondeckung'), T_('{min} mm ({note}, {doc})', { min: NP.coverMin().min, note: T_(NP.coverMin().note), doc: esc(NP.coverMin().ref) })] : NP.cmin ? [T_('Mindestbetondeckung'), T_('cnom ≥ cmin,dur + Δcdev = {a} + {b} = {c} mm (XC4, {doc})', { a: NP.cmin.XC4, b: NP.dcdev, c: NP.cmin.XC4 + NP.dcdev, doc: esc(DOC[1]) })] : null,
      [T_('Betonstahl'), ACI ? esc(NP.steelName) + ': fy = ' + f(NP.fyk, 0) + ' MPa, φ fy = ' + f(mat.fyd, 0) + ' MPa (φ = 0,90), Es = 200 GPa' : 'B500B: fyk = ' + f(NP.fyk || 500, 0) + ' MPa, fyd = ' + f(mat.fyd, 0) + ' MPa'],
      [T_('Größtkorn'), f(b.dmax, 0) + ' mm'],
      ACI ? [T_('Rissbeschränkung'), T_('Stababstand s ≤ {s} mm (24.3.2: fs = 2/3 fy, cc = {cc} mm)', { s: f(sLimACI, 0), cc: f(b.cnom * 1000, 0) }) + (L.wu ? '; ' + T_('WU: Rissbreite wk ≤ {w} mm als Hilfsnachweis nach EN 1992-1-1', { w: f(L.wkLoad || 0.3, 2) }) : '')] :
      SIA ? [T_('Rissbeschränkung'), T_(L.wu ? 'hohe Anforderungen (WU): σs ≤ σs,adm je Stababstand, auch unter quasi-ständiger Last' : 'erhöhte Anforderungen: Mindestbewehrung mit σs,adm je Stababstand')] : [T_('Rissbreite'), 'wk ≤ ' + f(L.wkLoad || 0.3, 2) + ' mm' + (L.wu ? ' ' + T_('(WU-Richtlinie, Beanspruchungsklasse {bk})', { bk }) : '') + (L.restr ? '; ' + T_('Zwang mit Mindestbewehrung begrenzt (fct,eff = {f} MPa)', { f: f(mat.fctEffR, 1) }) : '')],
      [T_('Wichten'), T_('Stahlbeton 25 kN/m³, Boden γ = {g} / γ′ = {g2} kN/m³, Wasser 10 kN/m³', { g: f(soil.gamma, 0), g2: f(soil.gammaSat - 10, 0) })]]);

    // 4 Baugrund und Wasser
    H(1, '4', T_('Baugrund und Grundwasser'));
    KV([[T_('Bodenart'), esc(T_(soil.name))], [T_('Reibungswinkel / Kohäsion'), 'φ′k = ' + f(soil.phi, 1) + '°, c′k = ' + f(soil.c || 0, 0) + ' kN/m²'], [T_('Steifemodul'), 'Es = ' + f(soil.Es, 0) + ' MN/m²'],
      [T_('Sohlwiderstand (Tabelle)'), 'σR,d = ' + f(soil.sigmaRd, 0) + ' kN/m²'], [T_('Erdruhedruck'), 'K₀ = 1 − sin φ′ = ' + f(st.K0, 3) + (st.evh > 0 ? ', ' + T_('Verdichtungserddruck {e} kN/m² bis {z} m Tiefe', { e: f(st.evh, 0), z: f(L.zEvh, 2) }) : '')],
      [T_('Bemessungswasserstand'), esc(lv.water.label)], [T_('Gründungssohle'), T_('{z} m unter Gelände', { z: f(-lv.zInsBot) })]]);

    // 5 Lasten
    H(1, '5', T_('Einwirkungen und Kombinationen'));
    H(2, '5.1', T_('Decke'));
    TB([T_('Einwirkung'), 'gk [kN/m²]', 'qk [kN/m²]'], (L.roofLoads || []).map((l) => [esc(l.name), f(l.g, 2), '']).concat([[T_('Geländelast ({name})', { name: esc(T_((BP.model.SURFACE_LOADS[p.use.surface] || { name: N_('eigener Wert') }).name)) }), '', f(L.q, 2)], ['<b>' + T_('Summe') + '</b>', '<b>' + f(L.gkRoof, 2) + '</b>', '<b>' + f(L.q, 2) + '</b>']]), ['l', 'r', 'r']);
    { const S = gov((x) => x.G * (L.gkRoof || 0) + x.Q * (L.q || 0)); P_(T_('Bemessungswert pEd = {fg} · {g} + {fq} · {q} = <b>{p} kN/m²</b>.', { fg: dF(S.G), fq: dF(S.Q), g: f(L.gkRoof, 2), q: f(L.q, 2), p: f(L.pRoof, 2) }) + setTag(S)); }
    H(2, '5.2', T_('Innenräume und Zwischendecken'));
    P_(ACI ? T_('Nutzlast innen qk = {q} kN/m²; Fußbodenaufbau 1,0 kN/m²; leichte Trennwände als Linienlast (Mauerwerk 18 kN/m³); tragende Wände und Stützen der Ebene darüber mit ihren Auflagerkräften. Nutzlasten und Treppen nach ASCE/SEI 7-22 Tab. 4.3-1.', { q: f(L.interiorQ, 1) })
      : NDE ? T_('Nutzlast innen qk = {q} kN/m²; Fußbodenaufbau 1,0 kN/m²; leichte Trennwände als Linienlast (Mauerwerk 18 kN/m³); tragende Wände und Stützen der Ebene darüber mit ihren Auflagerkräften. Treppen nach DIN EN 1991-1-1/NA Kat. T.', { q: f(L.interiorQ, 1) })
      : T_('Nutzlast innen qk = {q} kN/m²; Fußbodenaufbau 1,0 kN/m²; leichte Trennwände als Linienlast (Mauerwerk 18 kN/m³); tragende Wände und Stützen der Ebene darüber mit ihren Auflagerkräften. Treppen nach EN 1991-1-1 mit nationalem Anhang.', { q: f(L.interiorQ, 1) }));
    const eqL = L.equip || [];
    if (eqL.length) {
      H(3, '', T_('Einbauten und Vorräte'));
      P_(ACI ? T_('Schwere Einbauten als Flächenlasten auf ihrer Aufstellfläche: Eigengewicht als ständige Last G (D), Füllung von Tanks und Regalen als Lagerlast E, auf der sicheren Seite mit dem größeren Beiwert von Flüssigkeitslast F (wie D) und Nutzlast L; Dauerlastanteil {p2}. Für das Aggregat Schwingbeiwert 1,2. Massen sind Richtwerte der Vorplanung und durch Herstellerangaben zu ersetzen.', { p2: dF(NP.lf.psi2E) })
        : NDE ? T_('Schwere Einbauten als Flächenlasten auf ihrer Aufstellfläche: Eigengewicht als ständige Last G, Füllung von Tanks und Regalen als Lagerlast E (DIN EN 1991-1-1/NA Kat. E: ψ₀ = 1,0, ψ₂ = 0,8). Für das Aggregat Schwingbeiwert 1,2. Massen sind Richtwerte der Vorplanung und durch Herstellerangaben zu ersetzen.')
        : T_('Schwere Einbauten als Flächenlasten auf ihrer Aufstellfläche: Eigengewicht als ständige Last G, Füllung von Tanks und Regalen als Lagerlast E (Kat. E: ψ₀ = {p0}, ψ₂ = {p2}). Für das Aggregat Schwingbeiwert 1,2. Massen sind Richtwerte der Vorplanung und durch Herstellerangaben zu ersetzen.', { p0: dF(NP.lf.psiE[0]), p2: dF(NP.lf.psi2E) }));
      const nLv = g.L.length;
      TB([T_('Einbau'), T_('Raum'), T_('Platte'), T_('Fläche m²'), 'Gk kN', 'Ek kN', 'gk + ek kN/m²', T_('Ansatz')], eqL.map((e) => [esc(e.name), esc((nLv > 1 ? T_('Ebene {n}', { n: e.level + 1 }) + ', ' : '') + BP.calc.roomName(e.room)) + (e.fits ? '' : ' ' + T_('(passt nicht)')), esc(e.slab), f(e.area, 2), f(e.G, 1), f(e.E, 1), f(e.gk + e.ek, 1), esc(e.src)])
        .concat([['<b>' + T_('Summe') + '</b>', '', '', '', '<b>' + f(L.Geq, 1) + '</b>', '<b>' + f(L.Eeq, 1) + '</b>', '', '']]), ['l', 'l', 'l', 'r', 'r', 'r', 'r', 'l'], 'small');
    }
    H(2, '5.3', T_('Erd- und Wasserdruck'));
    P_(T_('Erdruhedruck e = K₀ · σv′ (mindestens Verdichtungserddruck), Wasserdruck γw · (z − zw), Geländelast K₀ · q. Bemessungswerte an der Außenwand: oben {p1} kN/m², unten {p2} kN/m² ({g} ständig, {q} veränderlich). Wasserdruck auf die Sohle uk = {u} kN/m².', { p1: f(L.p1, 1), p2: f(L.p2, 1), u: f(L.uSlab, 1), g: dF(gov((x) => x.H).H), q: dF(gov((x) => x.Q).Q) }));
    if (st.blast) { H(2, '5.4', T_('Außergewöhnliche Einwirkung')); P_(T_('Luftstoß nach TWK 2017: qk = {qk} kN/m² mit dynamischen Faktoren Φ (Biegung 1,2, Querkraft und gedrungene Bauteile 2,0), Begleitlast ψ₂ = 0,3, im Grundwasser ×1,1; Bodenplatte δ = {d}. Bemessung mit dynamischen Festigkeiten (fcd = {fcd} MPa, fsd = {fsd} MPa), siehe Pos. 13.', { qk: f(st.blast.qk, 0), d: f(st.blast.delta, 1), fcd: f(st.blast.dyn.fcd, 0), fsd: f(st.blast.dyn.fsd, 0) })); }
    H(2, st.blast ? '5.5' : '5.4', T_('Teilsicherheitsbeiwerte und Kombinationen'));
    const ulsTxt = LSs.map((S) => T_((L.equip || []).length ? '{g} G + {q} Q (Verkehr auch feldweise) + {e} E (Lagerlast, ψ₀ = {p0}; leere Behälter als eigene Kombination); Rahmenecke Wand–Platte als eigener Lastfall' : '{g} G + {q} Q (Verkehr auch feldweise); Rahmenecke Wand–Platte als eigener Lastfall',
      { g: dF(S.G), q: dF(S.Q), e: dF(S.E), p0: dF(NP.lf.psiE[0]) }) + setTag(S)).join('<br>');
    const G0 = NP.geo, geoRow = ACI ? [T_('Geotechnik (zulässige Spannungen)'), T_('Gebrauchslasten G + Q − U; Grundbruch mit Sicherheit {rv}; Böschungen tan φ / {a}, c / {b}', { rv: dF(G0.gRv), a: dF(G0.sl[0]), b: dF(G0.sl[1]) })] : NDE ? [T_('Geotechnik (DIN 1054, BS-P)'), T_('γR,v = 1,4 (Grundbruch), tan φ / 1,25 und c / 1,25 (Böschungen)')]
      : [T_('Geotechnik ({da})', { da: esc(G0.da) }), T_('γR,v = {rv} (Grundbruch){m}; Böschungen tan φ / {a}, c / {b}', { rv: dF(G0.gRv), m: G0.da === 'DA1' || G0.da === 'DA3' || G0.da === 'SIA 267' ? T_(' mit Bodenkennwerten tan φ / {p} und c / {c}', { p: dF(G0.gPhi), c: dF(G0.gc) }) : '', a: dF(G0.sl[0]), b: dF(G0.sl[1]) })];
    TB([T_('Situation'), T_('Kombination')], [[T_('Grenzzustand der Tragfähigkeit (ständig/vorübergehend)'), ulsTxt],
      ACI ? [T_('Gebrauchstauglichkeit'), T_('Rissbeschränkung über Stababstände (fs = 2/3 fy), Durchbiegung über Mindestdicken; WU-Rissbreite unter G + {psi} Q (Dauerlastanteil)', { psi: f(L.PSI2, 1) })]
        : [T_('Gebrauchstauglichkeit (Rissbreite, Verformung)'), T_('G + ψ₂ Q (quasi-ständig), ψ₂ = {psi} für die Geländelast', { psi: f(L.PSI2, 1) })], [T_('Auftrieb (UPL)'), T_('{d} U ≤ {s} G', { d: dF(NP.upl.dst), s: dF(NP.upl.stb) })], geoRow]
      .concat(st.blast ? [[T_('Außergewöhnlich'), 'G + Φ · A + ψ₂ Q']] : []), ['l', 'l']);
    if (ACI) NOTE(T_('Bezeichnungen wie ASCE/SEI 7-22: G = D (ständige Last), Q = L (Nutzlast), E = Lagerlast, H = Erd- und Wasserdruck, U = Auftrieb.'));

    // 6 Positionen
    H(1, '6', T_('Positionen'));
    // mEd,Grund: Bemessungsmoment der Grundbewehrung (FE: 75-%-Wert der Lage), mEd,max: Größtwert, gedeckt durch Zulagen
    const layerRows = (pl) => (pl.layers || []).map((l) => [esc(BP.calc.labelText(l.label)), f(l.m, 1), f(l.mBase != null ? l.mBase : l.m, 1), f(l.d * 100, 1), f(l.asUls, 2), f(l.asMin, 2), f(max(l.asCrack || 0, l.asRestr || 0), 2), f(l.req, 2), 'Ø' + l.phi + '/' + f(l.s * 100, 1) + ' = ' + f(l.prov, 2), esc(l.governs || '')]);
    const layerHead = [T_('Lage'), 'mEd,max kNm/m', T_('mEd,Grund kNm/m'), 'd cm', 'as,ULS', 'as,min', T_('as,Riss/Zwang'), T_('as,erf'), T_('gewählt cm²/m'), T_('maßgebend')];
    const plateSec = (posNo, title, pl, job, outline, extra, short) => {
      H(2, posNo, title, { pos: true });
      H(3, '', T_('System'));
      P_(pl.method === 'FE' ? T_('Stahlbetonplatte h = {h} cm, FE-Berechnung ({mesh}). Lagerung: {sup}{holes}.', { h: f(pl.h * 100, 0), mesh: pl.fe && pl.fe.mesh ? T_('{n} Knoten', { n: pl.fe.mesh.nNodes.toLocaleString(I18.locale()) }) : T_('Netz'), sup: job ? [(job.lines || []).some((l) => l.outer) ? T_('Außenwände als Rahmenecke') : '', (job.lines || []).some((l) => !l.outer && !l.beam) ? T_('tragende Innenwände als Linienlager') : '', (job.lines || []).some((l) => l.beam) ? T_('Unterzüge als Linienlager') : '', (job.areas || []).length ? T_(job.areas.length > 1 ? '{n} Stützen als Flächenlager' : '{n} Stütze als Flächenlager', { n: job.areas.length }) : '', job.ksList ? T_('elastische Bettung ks = {ks} MN/m³', { ks: f(job.ksList[0] / 1000, 1) }) : ''].filter(Boolean).join(', ') : '', holes: job && job.holes && job.holes.length ? '; ' + T_(job.holes.length > 1 ? '{n} Aussparungen im Modell' : '{n} Aussparung im Modell', { n: job.holes.length }) : '' })
        : T_(pl.field ? 'Stahlbetonplatte h = {h} cm, Tafelverfahren (zweiachsig gespannte Platte, größtes Feld {lx} × {ly} m).' : 'Stahlbetonplatte h = {h} cm, Tafelverfahren (zweiachsig gespannte Platte).', { h: f(pl.h * 100, 0), lx: pl.field ? f(pl.field.lx) : '', ly: pl.field ? f(pl.field.ly) : '' }));
      if (extra && extra.loads) { H(3, '', T_('Belastung')); extra.loads(); }
      if (job && job.combos) P_(T_('Kombinationen: {uls}; Gebrauch: {sls}.', { uls: job.combos.uls.map((c) => esc(BP.normen.comboLabel(c))).join('; '), sls: job.combos.sls.map((c) => esc(BP.normen.comboLabel(c))).join('; ') }));
      H(3, '', T_('Schnittgrößen'));
      if (pl.moments) KV([[T_('Feldmomente mEd,x / mEd,y'), f(pl.moments.mFx, 1) + ' / ' + f(pl.moments.mFy, 1) + ' kNm/m'], [T_('Stützmomente mEd,x / mEd,y'), f(pl.moments.mSx, 1) + ' / ' + f(pl.moments.mSy, 1) + ' kNm/m'], pl.moments.mJ ? [T_('Rahmenecke Wand–Platte'), f(pl.moments.mJ, 1) + ' kNm/m'] : null]);
      if (pl.method === 'FE' && pl.fe) FIG2(feMap(pl, job, 'x', outline), feMap(pl, job, 'y', outline), T_('Hüllkurven der Biegemomente m_x und m_y (Bemessung): rot Feld (Zug unten), blau Stütze (Zug oben)'));
      H(3, '', T_('Bemessung Biegung und Rissbreite (Bewehrung in cm²/m)'));
      TB(layerHead, layerRows(pl), ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'l'], 'small');
      NOTE(T_('as-Werte in cm²/m für mEd,Grund; Spitzen bis mEd,max sind durch die Zulagen abgedeckt.'));
      if ((pl.zulagen || []).length) TB([T_('Zulage'), T_('Lage'), T_('Bereich x / y [m]'), 'mEd kNm/m', T_('Stäbe'), T_('maßgebend')], pl.zulagen.map((z, i) => ['Z' + (i + 1), T_(z.face) + ', ' + z.dir, f(z.x0, 2) + '–' + f(z.x1, 2) + ' / ' + f(z.y0, 2) + '–' + f(z.y1, 2), f(z.mMax, 1), 'Ø' + z.phi + '/' + f(z.s * 100, 1), esc(z.governs || '')]), ['l', 'l', 'l', 'r', 'l', 'l'], 'small');
      if (pl.wkMax != null) P_(T_('Größte rechnerische Rissbreite unter quasi-ständiger Last wk = {wk} mm ≤ {lim} mm.', { wk: f(pl.wkMax, 3), lim: f(L.wkLoad || 0.3, 2) }));
      H(3, '', T_('Querkraft'));
      const sh = pl.shear || {};
      P_('vEd = ' + f(sh.vEd, 1) + ' kN/m, vRd,c = ' + f(sh.vRd, 1) + ' kN/m' + (sh.links ? '; ' + T_('Bereiche mit Querkraftbewehrung: {z}', { z: sh.links.zones.map((z) => f(z.x0, 2) + '–' + f(z.x1, 2) + ' / ' + f(z.y0, 2) + '–' + f(z.y1, 2) + ' m, asw = ' + f(z.asw, 1) + ' cm²/m², vRd,max = ' + f(z.vRdMax, 0) + ' kN/m').join('; ') }) : '') + '.');
      if (pl.defl && pl.defl.lim && isFinite(pl.defl.w)) { H(3, '', T_('Verformung')); P_(T_('Durchbiegung mit Kriechen (φ = {phi}) und Rissbildung: w = {w} mm ≤ l/250 = {lim} mm (l = {l} m).', { phi: f(pl.defl.phi, 1), w: f(pl.defl.w * 1000, 1), lim: f(pl.defl.lim * 1000, 1), l: f(pl.defl.l) })); }
      if (pl.fe && pl.fe.react && pl.fe.react.lines.length) {
        H(3, '', T_('Auflagerkräfte (Bemessung)'));
        TB([T_('Lager@@Auflager'), T_('Länge m'), T_('Summe kN'), T_('größter Wert (1 m) kN/m')], pl.fe.react.lines.map((l) => [esc(nameOfLine(l.id)), f(l.len, 2), f(l.sum, 0), f(l.win, 1)]).concat((pl.fe.react.areas || []).map((a) => [esc(g.labels['c:' + a.id] || a.id), '', f(a.sum, 0), ''])), ['l', 'r', 'r', 'r'], 'small');
      }
      if (extra && extra.after) extra.after();
      if (pl.acc) { H(3, '', T_('Luftstoß')); P_(T_('pM = {pm} kN/m² gegen Traglast qRd = {q} kN/m² (Bruchlinien); Schub: {s}; η = {eta}.', { pm: f(pl.acc.pM, 1), q: f(pl.acc.qRd, 1), s: pl.acc.shear.reinf ? T_('Bügel Ø{phi}/{s} im Randstreifen {w} m', { phi: pl.acc.shear.reinf.phi, s: f(pl.acc.shear.reinf.s * 100, 0), w: f(pl.acc.shear.strip) }) : pl.acc.shear.needs ? T_('nicht nachgewiesen') : T_('ohne Bügel'), eta: f(pl.acc.eta) })); }
      RES([{ text: T_('{title}: größte Ausnutzung η = {eta}', { title, eta: etaTxt(pl.etaS) }), eta: pl.etaS }]);
      sumAdd(posNo, short || title, T_(pl.defl && pl.defl.lim && isFinite(pl.defl.w) ? 'Biegung, Querkraft, Rissbreite, Verformung' : 'Biegung, Querkraft, Rissbreite'), pl.etaS);
    };
    const jobs = st.fe.jobs || {};
    if (st.roof) plateSec(pos.roof, T_('Pos. {no} – {name}', { no: pos.roof, name: T_('Decke') }), st.roof, jobs.roof, g.out, { loads: () => P_(T_('ständig gk = {g} kN/m², veränderlich qk = {q} kN/m² (siehe 5.1), dazu Rahmenecke aus Erddruck.', { g: f(L.gkRoof, 2), q: f(L.q, 2) })) }, T_('Decke'));
    for (const m of st.mids || []) {
      const job = (jobs.mids || []).find((j) => j.level === m.level);
      plateSec(pos.mids[m.level], T_('Pos. {no} – {name}', { no: pos.mids[m.level], name: m.name }), m, job, g.out, { loads: () => {
        const cs = job ? job.cases : [];
        const cG = cs.find((c) => c.name === 'G'), cQ = cs.find((c) => c.name === 'Q');
        const eqM = (L.equip || []).filter((e) => e.level === m.level - 1);
        P_(T_('Flächenlast gk = {g} kN/m² (Eigengewicht und Fußboden), qk = {q} kN/m²; {loads} aus der Ebene darüber (Wände, Stützen, Treppen){eq}.', { g: f(cG ? cG.q : 25 * m.h + 1, 2), q: f(cQ ? cQ.q : L.interiorQ, 2), loads: cG ? T_('{nl} Linienlasten und {np} Einzellasten', { nl: (cG.lineLoads || []).length, np: (cG.points || []).length }) : T_('Lasten'),
          eq: eqM.length ? '; ' + T_('Einbauten als Flächenlasten: {list}', { list: eqM.map((e) => T_('{name} {q} kN/m² auf {a} m²', { name: esc(e.name), q: f(e.gk + e.ek, 1), a: f(e.area, 2) })).join(', ') }) : '' }));
      } }, m.name);
    }
    // Außenwände
    const w = st.wall;
    if (w) {
      const t = T_('Pos. {no} – {name}', { no: pos.wall, name: T_('Außenwände') });
      H(2, pos.wall, t, { pos: true });
      H(3, '', T_('System und Belastung'));
      FIG2(wallFig(q), null, T_('Lotrechter Durchlaufträger zwischen den Platten (Achsmaße), Bemessungswerte des Erd- und Wasserdrucks'));
      KV([[T_('Wanddicke'), f(w.h * 100, 0) + ' cm'], [T_('Stützweiten lotrecht'), (w.spans || []).map((x) => f(Array.isArray(x) ? x[1] - x[0] : x)).join(' / ') + ' m'], [T_('Erddruck charakteristisch oben / unten'), f(w.pressures.top.k, 1) + ' / ' + f(w.pressures.bot.k, 1) + ' kN/m²'],
        [T_('Bemessungswert oben / unten'), f(w.p1, 1) + ' / ' + f(w.p2, 1) + ' kN/m²'], w.pressures.waterAtBot ? [T_('Wasserdruck am Fuß'), f(w.pressures.waterAtBot, 1) + ' kN/m²'] : null]);
      H(3, '', T_('Schnittgrößen'));
      if (w.method === 'FE' && w.fe) {
        P_(T_('FE-Platten je Wandseite mit dem Verlauf des Erd- und Wasserdrucks über die Höhe (Bemessungswerte {h} E + {h} W + {q} Q, Momente an Auflagern über 2·d gemittelt). Größtwerte je Seite und Eckausbildung:', { h: dF(gov((x) => x.H).H), q: dF(gov((x) => x.Q).Q) }));
        TB([T_('Wandseite'), T_('Länge m'), T_('Ecken'), T_('m lotrecht innen'), T_('m lotrecht außen'), T_('m waagerecht'), 'vEd kN/m'], w.fe.edges.map((e) => [T_('Kante {n}', { n: e.edge + 1 }), f(e.Le, 2), T_(e.variant), f(e.vi, 1), f(e.vo, 1), f(e.h, 1), f(e.v, 1)]), ['l', 'r', 'l', 'r', 'r', 'r', 'r'], 'small');
        NOTE(T_('Zum Vergleich lotrechter Durchlaufträger: Feldmoment {mf} kNm/m, Einspannmomente oben / unten {mt} / {mb} kNm/m.', { mf: f(w.moments.beam.mF, 1), mt: f(w.moments.beam.mTop, 1), mb: f(w.moments.beam.mBot, 1) }));
      }
      KV([[T_('Feldmoment'), f(w.moments.mF, 1) + ' kNm/m'], [T_('Rahmenecke oben / unten'), f(w.moments.mJTop, 1) + ' / ' + f(w.moments.mJBot, 1) + ' kNm/m'], [T_(w.method === 'FE' ? 'Waagerecht (Ecken, Innenwände)' : 'Waagerecht an den Wandecken'), f(w.moments.mH, 1) + ' kNm/m'], [T_('Querkraft vEd / vRd,c'), f(w.shear.vEd, 1) + ' / ' + f(w.shear.vRd, 1) + ' kN/m']]);
      H(3, '', T_('Bemessung'));
      TB(layerHead, layerRows(w), ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'l'], 'small');
      if (w.acc) P_(T_('Luftstoß: pM = {pm} kN/m², qRd = {q} kN/m², η = {eta}.', { pm: f(w.acc.pM, 1), q: f(w.acc.qRd, 1), eta: f(w.acc.eta) }));
      RES([{ text: T_('Außenwände: η = {eta}', { eta: etaTxt(w.etaS) }), eta: w.etaS }]);
      sumAdd(pos.wall, T_('Außenwände'), T_('Biegung, Querkraft, Rissbreite'), w.etaS);
    }
    // Innenwände
    const iws = st.intWalls || [];
    if (iws.length) {
      H(2, '4', T_('Pos. {no} – {name}', { no: 4, name: T_('Tragende Innenwände und Schachtwände') }), { pos: true });
      P_(ACI ? T_('Stahlbetonwände als Auflager der Platten; Normalkraft aus den Auflagerkräften der Platte darüber (größter Mittelwert über 1 m Wandlänge). Tragfähigkeit nach dem vereinfachten Verfahren ACI 318-19 11.5.3: φPn = 0,65 · 0,55 f′c · t · [1 − (k lc / 32 t)²] mit k = 1,0 (sichere Seite) und lc = lichte Höhe; in der Tabelle Φ = 1 − (lc / 32 t)² und nRd = Φ · {fpl} MPa · t.', { fpl: f(NP.fcdPl(mat.fck), 2) })
        : NDE ? T_('Stahlbetonwände als Auflager der Platten; Normalkraft aus den Auflagerkräften der Platte darüber (größter Mittelwert über 1 m Wandlänge). Tragfähigkeit auf der sicheren Seite wie eine unbewehrte Wand nach EC2 12.6.5.2: nRd = Φ · fcd,pl · t mit fcd,pl = 0,7 · fck / 1,5, Φ = 1,14 (1 − 2 etot/t) − 0,02 l₀/t ≤ 1 − 2 etot/t, etot = max(t/30; 20 mm) + l₀/400, l₀ = lichte Höhe.')
        : T_('Stahlbetonwände als Auflager der Platten; Normalkraft aus den Auflagerkräften der Platte darüber (größter Mittelwert über 1 m Wandlänge). Tragfähigkeit auf der sicheren Seite wie eine unbewehrte Wand nach EN 1992-1-1 12.6.5.2: nRd = Φ · fcd,pl · t mit fcd,pl = {fpl} MPa, Φ = 1,14 (1 − 2 etot/t) − 0,02 l₀/t ≤ 1 − 2 etot/t, etot = max(t/30; 20 mm) + l₀/400, l₀ = lichte Höhe.', { fpl: f(NP.fcdPl(mat.fck), 2) }));
      TB([T_('Pos.'), T_('Wand'), T_('Ebene'), 't cm', 'l m', 'l₀ m', 'Φ', 'nEd kN/m', 'nRd kN/m', T_('Bewehrung je Seite'), 'η'], iws.map((x) => [x.auto ? pos.lifts[x.auto] || '9' : pos.walls[x.id] || '4', esc(x.auto ? T_('Schachtwand {name}', { name: g.labels['v:' + x.auto] || T_('Aufzug') }) : g.labels['w:' + x.id] || T_('Innenwand')), String((x.level || 0) + 1), f(x.t * 100, 0), f(x.len, 2), f(x.l0, 2), f(x.Phi, 2), f(x.nEd, 0), f(x.nRd, 0), 'Ø' + x.layer.phi + '/' + f(x.layer.s * 100, 1), etaTxt(x.etaS)]), ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'l', 'r'], 'small');
      const e = max(...iws.map((x) => x.etaS));
      RES([{ text: T_('Innen- und Schachtwände: größte Ausnutzung η = {eta}', { eta: etaTxt(e) }), eta: e }]);
      sumAdd('4', T_('Innen- und Schachtwände'), EC ? T_('Normalkraft (EC2 12.6.5.2)') : T_('Normalkraft ({ref})', { ref: ACI ? RF.wall : 'EN 1992-1-1 12.6.5.2' }), e);
    }
    // Stützen
    if ((st.columns || []).length) {
      H(2, '5', T_('Pos. {no} – {name}', { no: 5, name: T_('Stützen') }), { pos: true });
      P_(ACI ? T_('Stahlbetonstützen, Knicklänge l₀ = Geschosshöhe bis Plattenmitte (ausgesteiftes Tragwerk, k = 1,0). Normalkraft aus den Auflagerkräften der FE-Platte und den Unterzügen. Querschnitt nach ACI 318-19 22.2 (Spannungsblock 0,85 f′c, εcu = 0,003, φ = 0,65 bis 0,90 nach der Stahldehnung), Mindestmoment Pu · (15 mm + 0,03 h) je Richtung, Momentenvergrößerung nach 6.6.4.5 für k lu/r > 22 (EI = 0,4 Ec Ig / (1 + βdns), βdns = 0,6, Cm = 1,0), Längsbewehrung 1 % bis 4 % Ag, Bügel nach 25.7.2. Durchstanzen nach 22.6: kritischer Schnitt b₀ im Abstand d/2, vc = min(0,33; 0,17 (1 + 2/β); 0,083 (2 + αs d/b₀)) · λs · √f′c, φ = 0,75, Bodenplatte mit Abzug der Bodenpressung (λs = 1,0); Bügelreihen im Abstand d/2 bis vu ≤ φ · 0,17 √f′c außerhalb. Lasten darüberstehender Stützen gehen direkt durch und werden beim Durchstanzen nicht angesetzt.')
        : SIA ? T_('Stahlbetonstützen, Knicklänge l₀ = Geschosshöhe bis Plattenmitte (ausgesteiftes Tragwerk). Normalkraft aus den Auflagerkräften der FE-Platte und den Unterzügen. Querschnitt mit Parabel-Rechteck-Diagramm (εcu = 3 ‰) nach SIA 262, Theorie II. Ordnung mit Nennkrümmung wie EN 1992-1-1 5.8.8, e₀ = max(h/30; 20 mm), eᵢ = l₀/400. Durchstanzen nach SIA 262 4.3.6, Näherungsstufe 2: kr = 1/(0,45 + 0,18 ψ d kg), ψ = 1,5 rs/d · fsd/Es · (msd/mRd)^1,5 mit rs = 0,22 L und msd = Vd/8, Nachweisschnitt im Abstand dv/2, ke = 0,9; Bodenplatte mit Abzug der Bodenpressung. Lasten darüberstehender Stützen gehen direkt durch und werden beim Durchstanzen nicht angesetzt.') : NDE ? T_('Stahlbetonstützen, Knicklänge l₀ = Geschosshöhe bis Plattenmitte (ausgesteiftes Tragwerk). Normalkraft aus den Auflagerkräften der FE-Platte und den Unterzügen. Bemessung nach EC2 5.8.8 (Nennkrümmung) mit e₀ = max(h/30; 20 mm) und eᵢ = l₀/400, zweiachsig nach 5.8.9. Durchstanzen nach EC2 6.4 mit NA DE (β = 1,10; Decken: u₁ im Abstand 2 d; Bodenplatte: kritischer Rundschnitt iterativ a ≤ 2 d mit Abzug der Bodenpressung, Bewehrung nach NCI zu 6.4.5 in Reihen bei 0,3 d und 0,8 d; Öffnungen bis 6 d berücksichtigt). Lasten darüberstehender Stützen gehen direkt durch und werden beim Durchstanzen nicht angesetzt.')
        : T_('Stahlbetonstützen, Knicklänge l₀ = Geschosshöhe bis Plattenmitte (ausgesteiftes Tragwerk). Normalkraft aus den Auflagerkräften der FE-Platte und den Unterzügen. Bemessung nach EC2 5.8.8 (Nennkrümmung) mit e₀ = max(h/30; 20 mm) und eᵢ = l₀/400, zweiachsig nach 5.8.9. Durchstanzen nach EC2 6.4 {na} (β = {beta}; Decken: u₁ im Abstand 2 d; Bodenplatte: kritischer Rundschnitt iterativ a ≤ 2 d mit Abzug der Bodenpressung; Öffnungen bis 6 d berücksichtigt). Lasten darüberstehender Stützen gehen direkt durch und werden beim Durchstanzen nicht angesetzt.', { na: naTag, beta: dF(NP.punch.beta) }));
      TB([T_('Pos.'), T_('Stütze'), 'b × h cm', 'l₀ m', 'NEd kN', 'λ / λlim', 'MEd/MRd y', 'MEd/MRd z', T_('Längsbew.'), T_('Bügel'), 'η'], st.columns.map((c) => {
        const d = c.design, dy = d.dirs[0], dz = d.dirs[1];
        return [pos.cols[c.id], esc(g.labels['c:' + c.id] || T_('Stütze')), f(c.bx * 100, 0) + ' × ' + f(c.by * 100, 0), f(c.l0, 2), f(c.nEd, 0), f(d.lam, 0) + ' / ' + f(d.lamLim, 0), f(dy.mEd, 1) + ' / ' + f(dy.mRd, 1), f(dz.mEd, 1) + ' / ' + f(dz.mRd, 1), d.nb + ' Ø' + d.phi, 'Ø' + d.stirrup.phi + '/' + f(d.stirrup.s * 100, 0), etaTxt(d.eta)];
      }), ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'l', 'l', 'r'], 'small');
      H(3, '', T_('Durchstanzen'));
      const puRows = [];
      for (const c of st.columns) for (const [pu, where] of [[c.punch, T_('oben: {slab}', { slab: c.slabName || T_('Platte') })], [c.punchBelow, T_('unten')]]) {
        if (!pu) continue;
        puRows.push([pos.cols[c.id], esc(where), f(pu.d * 100, 1), f(pu.rho * 100, 2), f(pu.u0, 2), f(pu.u1, 2) + (pu.uLoss > 0 ? ' (−' + f(pu.uLoss * 100, 0) + ' %)' : ''), f(pu.vEd, 3), f(pu.vRdc, 3), pu.links ? T_('{n} Reihen Ø10, sr = {sr} cm', { n: pu.links.rows, sr: f(pu.links.sr * 100, 0) }) : pu.needs ? '–' : T_('ohne'), etaTxt(pu.eta)]);
      }
      TB([T_('Pos.'), T_('Platte'), 'd cm', 'ρl %', 'u₀ m', 'u₁ m', 'vEd MPa', 'vRd,c MPa', T_('Durchstanzbewehrung'), 'η'], puRows, ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'l', 'r'], 'small');
      const e = max(...st.columns.map((c) => c.etaS));
      RES([{ text: T_('Stützen und Durchstanzen: größte Ausnutzung η = {eta}', { eta: etaTxt(e) }), eta: e }]);
      sumAdd('5', T_('Stützen, Durchstanzen'), T_('Tragfähigkeit, Durchstanzen'), e);
    }
    // Unterzüge
    for (const bd of st.beams || []) {
      const nm = g.labels['b:' + bd.id] || T_('Unterzug'), no = pos.beams[bd.id];
      H(2, no, T_('Pos. {no} – {name}', { no, name: nm }), { pos: true });
      if (bd.unsupported || !bd.field) { P_(T_('Ohne ausreichende Auflager nicht tragfähig.')); RES([{ text: T_('{name}: nicht nachgewiesen', { name: nm }), eta: Infinity }]); sumAdd(no, nm, T_('Auflager'), Infinity); continue; }
      FIG(beamFig(bd), T_('Durchlaufträger mit Auflagern auf Wänden und Stützen, Linienlast aus der Platte'));
      KV([[T_('Querschnitt'), T_('bw/h = {bw}/{h} cm (Rechteck, Plattenanteil mitgerechnet), d = {d} cm', { bw: f(bd.bw * 100, 0), h: f(bd.h * 100, 0), d: f(bd.d * 100, 0) })], [T_('Belastung'), T_('gk = {gk} kN/m, qk = {qk} kN/m, Spitzenfaktor {p}', { gk: f(bd.gk, 1), qk: f(bd.qk, 1), p: f(bd.peak, 2) })],
        [T_('Feldmoment / Stützmoment'), f(bd.mF, 1) + ' / ' + f(bd.mS, 1) + ' kNm'], [T_('Bewehrung Feld'), bd.field.n + ' Ø' + bd.field.phi + ' (' + f(bd.field.As, 2) + ' ≥ ' + f(bd.field.req, 2) + ' cm²)'], [T_('Bewehrung Stütze'), bd.support ? bd.support.n + ' Ø' + bd.support.phi + ' (' + f(bd.support.As, 2) + ' ≥ ' + f(bd.support.req, 2) + ' cm²)' : '–'],
        [T_('Querkraft'), 'VEd = ' + f(bd.shear.vEd, 1) + ' kN, VRd,c = ' + f(bd.shear.vRdc, 1) + ' kN, VRd,max = ' + f(bd.shear.vRdMax, 0) + ' kN' + (bd.shear.stirrups ? ', ' + T_('Bügel Ø{phi}/{s} (asw,erf = {a} cm²/m, cot θ = {cot})', { phi: bd.shear.stirrups.phi, s: f(bd.shear.stirrups.s * 100, 0), a: f(bd.shear.aswReq, 2), cot: f(bd.shear.cot, 2) }) : '')],
        [T_('Verformung'), 'l/d = ' + f(bd.defl.ld, 1) + ' ≤ ' + f(bd.defl.lim, 1) + '; ' + T_('Steifigkeit als Plattenlager w = {w} ≤ {lim} mm', { w: f(bd.stiff.w * 1000, 1), lim: f(bd.stiff.lim * 1000, 1) })]]);
      RES([{ text: T_('{name}: η = {eta}', { name: nm, eta: etaTxt(bd.etaS) }), eta: bd.etaS }]);
      sumAdd(no, nm, T_('Biegung, Querkraft, Verformung'), bd.etaS);
    }
    // Bodenplatte
    if (st.floor) {
      const fl = st.floor;
      plateSec(pos.floor, T_('Pos. {no} – {name}', { no: pos.floor, name: T_('Bodenplatte') }), fl, jobs.floor, g.slab, {
        loads: () => { const eqF = (L.equip || []).filter((e) => e.level === g.L.length - 1); P_(T_(eqF.length ? 'Lasten aus dem Bauwerk (Wände, Stützen, Decke mit Erdüberdeckung), Eigengewicht, Nutzlast, Einbauten als Flächenlasten ({eq}); Wasserdruck von unten uk = {u} kN/m² als eigener Hüllfall. Mittlerer Bemessungssohldruck {p} kN/m².' : 'Lasten aus dem Bauwerk (Wände, Stützen, Decke mit Erdüberdeckung), Eigengewicht, Nutzlast; Wasserdruck von unten uk = {u} kN/m² als eigener Hüllfall. Mittlerer Bemessungssohldruck {p} kN/m².', { eq: eqF.map((e) => esc(e.name)).join(', '), u: f(L.uSlab, 1), p: f(L.pFloorLoads, 1) })); },
        after: () => { if (fl.soil) P_(fl.soil.liftArea >= 0.95 * g.Aslab ? T_('In den Bemessungskombinationen mit Wasserdruck überwiegt der Auftrieb die Bodenpressung: Die Platte trägt rechnerisch zwischen den Wänden (keine Bettung).') : T_(fl.soil.liftArea > 0.01 ? 'Bodenpressung (Bemessung) aus der Bettung: größter Wert {pmax} kN/m², Mittelwert {pmean} kN/m², abhebende Fläche {a} m².' : 'Bodenpressung (Bemessung) aus der Bettung: größter Wert {pmax} kN/m², Mittelwert {pmean} kN/m², keine abhebenden Bereiche.', { pmax: f(fl.soil.pMax, 0), pmean: f(fl.soil.pMean, 0), a: f(fl.soil.liftArea, 1) })); },
      }, T_('Bodenplatte'));
    }
    // Treppen
    for (const s of g.vert.stairs) {
      const d = s.design, no = pos.stairs[s.id], nm = g.labels['v:' + s.id] || T_('Innentreppe');
      H(2, no, T_('Pos. {no} – {name}', { no, name: nm }), { pos: true });
      if (!d || !d.mEd) { P_(T_('Keine Bemessung möglich.')); sumAdd(no, nm, T_('Laufplatte'), Infinity); continue; }
      FIG2(stairFig(s), null, T_('Laufplatte als Einfeldplatte zwischen Deckenrand und Fußboden'));
      KV([[T_('Geometrie'), T_('{n} Steigungen {r}/{t} cm, Laufbreite {w} m, Stützweite (Grundriss) {l} m', { n: s.nr, r: f(s.rise * 100, 1), t: f(s.tread * 100, 1), w: f(s.w), l: f(s.span) })], [T_('Laufplatte'), 'h = ' + f(d.t * 100, 0) + ' cm, d = ' + f(d.d * 100, 1) + ' cm'],
        [T_('Belastung (Grundriss)'), T_('gk = {gk} kN/m² (Laufplatte / cos α, Stufen, Belag 1,0), qk = {qk} kN/m²', { gk: f(d.gk, 2), qk: f(d.qk, 1) })], [T_('Schnittgrößen'), 'mEd = ' + f(d.mEd, 1) + ' kNm/m, vEd = ' + f(d.vEd, 1) + ' kN/m'],
        [T_('Biegung'), T_('μ = {mu}, as,erf = {as} cm²/m, gewählt Ø{phi}/{s} = {prov} cm²/m, quer Ø{p2}/{s2}, oben an den Auflagern Ø10/20', { mu: f(d.mu, 3), as: f(max(d.asReq, d.asMin), 2), phi: d.phi, s: f(d.s * 100, 1), prov: f(d.asProv, 2), p2: d.distr ? d.distr.phi : 8, s2: f((d.distr ? d.distr.s : 0.25) * 100, 0) })],
        [T_('Querkraft'), 'vEd = ' + f(d.vEd, 1) + ' ≤ vRd,c = ' + f(d.vRd, 1) + ' kN/m'], [T_('Biegeschlankheit'), 'l/d = ' + f(d.ld, 1) + ' ≤ ' + f(d.ldLim, 1) + ' (' + (EC ? 'EC2 7.4.2' + (NDE ? ', NA DE' : '') : ACI ? RF.defl : RF.defl + ' / EN 1992-1-1 7.4.2') + ')'],
        [T_('Auflagerkräfte (charakteristisch)'), T_('g = {g} kN/m, q = {q} kN/m je Auflager, als Linienlast in den Platten angesetzt', { g: f(s.reaction.g, 1), q: f(s.reaction.q, 1) })]]);
      const e = max(d.ld / d.ldLim, d.vEd / d.vRd, d.asReq / d.asProv);
      RES([{ text: T_('{name}: η = {eta}', { name: nm, eta: etaTxt(e) }), eta: e }]);
      sumAdd(no, nm, T_('Biegung, Querkraft, Schlankheit'), e);
    }
    // Aufzüge
    for (const v of g.vert.lifts) {
      const d = v.design, no = pos.lifts[v.id], nm = g.labels['v:' + v.id] || T_('Aufzug');
      if (!d) { H(2, no, T_('Pos. {no} – {name}: Schacht und Grube', { no, name: nm }), { pos: true }); P_(T_('Keine Auslegung möglich (Haltestellen prüfen).')); sumAdd(no, nm, T_('Auslegung'), Infinity); continue; }
      H(2, no, T_('Pos. {no} – {name}: Schacht und Grube', { no, name: nm }), { pos: true });
      const pt = (vf.pits || []).find((x) => x.id === v.id);
      KV([[T_('Aufzug'), T_('{type}, Nennlast {q} kg, {drive}, {v} m/s', { type: v.src.type === 'personen' ? T_('Personenaufzug') : T_('Lastenaufzug'), q: f(d.Q, 0), drive: d.rope ? T_('Seilantrieb mit Gegengewicht') : T_('Hydraulik'), v: f(v.src.speed, 2) })], [T_('Schacht lichte Maße'), T_('{w} × {d} m, Wände {t} cm', { w: f(v.wIn), d: f(v.dIn), t: f(v.t * 100, 0) })],
        [T_('Schachtgrube / Schachtkopf'), f(d.pit) + ' m / ' + f(d.head) + ' m'], [T_('Lasten auf das Bauwerk (Richtwerte)'), T_('Puffer Kabine {v} kN', { v: f(d.buffer, 0) }) + (d.cwBuffer ? ', ' + T_('Gegengewicht {v} kN', { v: f(d.cwBuffer, 0) }) : '') + (d.piston ? ', ' + T_('Zylinderfuß {v} kN', { v: f(d.piston, 0) }) : '') + (d.hook ? ', ' + T_('Montagehaken {v} kN', { v: f(d.hook, 0) }) : '') + ', ' + T_('Führungsschiene waagerecht {v} kN', { v: f(d.rail, 1) })],
        pt ? [T_('Grubenwände'), T_('Erd- und Wasserdruck am Fuß {p} kN/m², mEd = {m} kNm/m, as,erf = {as} cm²/m', { p: f(pt.pBot, 1), m: f(pt.mW, 1), as: f(pt.asW, 2) })] : null,
        pt ? [T_('Grubensohle'), T_('Wasserdruck {u} kN/m², mEd = {m} kNm/m, as,erf = {as} cm²/m; Sohldruck aus Puffern {s} / {sr} kN/m²', { u: f(pt.u, 1), m: f(pt.mS, 1), as: f(pt.asS, 2), s: f(pt.sig, 0), sr: f(pt.sigRd, 0) })] : null]);
      NOTE(T_('Die Lastangaben des Aufzugherstellers sind maßgebend und vor der Ausführung abzugleichen.'));
      const e = pt ? max(pt.asW / 7.54, pt.asS / 7.54, pt.sig / pt.sigRd) : 0;
      RES([{ text: T_('{name}: Grube η = {eta} (gegen Ø12/15)', { name: nm, eta: etaTxt(e) }), eta: e }]);
      sumAdd(no, T_('{name} Grube', { name: nm }), T_('Erd-/Wasserdruck, Puffer'), e);
    }
    // Pos. 10 Gründung
    H(2, '10', T_('Pos. {no} – {name}', { no: 10, name: T_('Gründung') }), { pos: true });
    const bg = st.bearing;
    H(3, '', T_('Sohldruck (vereinfachter Nachweis)'));
    if (bg.asd) P_(T_('σ = (G + Q) / A = ({g} + {q}) / {a} = {s} kN/m² ≤ qa = {r} kN/m² (zulässige Sohlpressung nach {ref}, Gebrauchslasten) → η = {eta}.', { g: f(bg.Gtot, 0), q: f(bg.Qtot, 0), a: f(g.Aslab, 2), s: f(bg.sigEd, 1), r: f(bg.sigRd, 0), ref: esc(bg.ref), eta: f(bg.eta) }));
    else { const S = gov((x) => x.G * bg.Gtot + x.Q * bg.Qtot); P_(T_('σE,d = ({fg} · G + {fq} · Q) / A = ({fg} · {g} + {fq} · {q}) / {a} = {s} kN/m² ≤ σR,d = {r} kN/m² → η = {eta}.', { fg: dF(S.G), fq: dF(S.Q), g: f(bg.Gtot, 0), q: f(bg.Qtot, 0), a: f(g.Aslab, 2), s: f(bg.sigEd, 1), r: f(bg.sigRd, 0), eta: f(bg.eta) })); }
    sumAdd('10', T_('Sohldruck'), bg.asd ? 'σ ≤ qa' : 'σE,d ≤ σR,d', bg.eta);
    const gb = vf.gb;
    if (gb) {
      H(3, '', NDE ? T_('Grundbruch nach DIN 4017') : ACI ? T_('Grundbruch mit zulässigen Spannungen (Sicherheit {fs}, Beiwerte wie EN 1997-1 Anhang D)', { fs: dF(NP.geo.gRv) }) : T_('Grundbruch nach EN 1997-1 Anhang D ({da})', { da: esc(gb.approach || NP.geo.da) }));
      KV([[T_('Ersatzfläche'), T_('b′ × a′ = {b} × {a} m, Einbindetiefe d = {d} m', { b: f(gb.b), a: f(gb.a), d: f(gb.d) })], [T_('Tragfähigkeitsbeiwerte'), 'Nd = ' + f(gb.Nd, 2) + ', Nb = ' + f(gb.Nb, 2) + ', Nc = ' + f(gb.Nc, 2) + ' (φ′ = ' + f(gb.phi, 1) + '°)'], [T_('Formbeiwerte'), 'νd = ' + f(gb.nd, 3) + ', νb = ' + f(gb.nb, 3) + ', νc = ' + f(gb.nc, 3)],
        [T_('Wichten'), T_('γ₁ = {g1} kN/m³ (über der Sohle), γ₂ = {g2} kN/m³ (darunter)', { g1: f(gb.gamma1, 1), g2: f(gb.gamma2, 1) })], [T_('Widerstand'), T_('Rn,k = a′ b′ (γ₂ b′ Nb νb + γ₁ d Nd νd + c Nc νc) = {rk} kN, Rn,d = Rn,k / {rv} = {rd} kN', { rk: f(gb.Rnk, 0), rd: f(gb.Rnd, 0), rv: dF(gb.Rnk / max(gb.Rnd, 1e-9)) })],
        gb.phiK != null && Math.abs(gb.phiK - gb.phi) > 1e-6 ? [T_('Bodenkennwerte (Bemessung)'), 'tan φ′d = tan ' + f(gb.phiK, 1) + '° / ' + dF(Math.tan(gb.phiK * Math.PI / 180) / Math.tan(gb.phi * Math.PI / 180)) + ' → φ′d = ' + f(gb.phi, 1) + '°'] : null,
        [T_('Einwirkung'), gb.approach === 'DA1-2' ? T_('Vd = G + {q} Q − U = {v} kN', { q: dF(NP.geo.gQgeo), v: f(gb.Vd, 0) }) : gb.approach === 'CTE' || gb.approach === 'ASD' ? T_('Vd = G + Q − U = {v} kN', { v: f(gb.Vd, 0) })
          : (() => { const S = gov((x) => x.G * st.bearing.Gtot + x.Q * st.bearing.Qtot); return T_('Vd = {fg} G + {fq} Q − U = {v} kN', { fg: dF(S.G), fq: dF(S.Q), v: f(gb.Vd, 0) }); })()]]);
      RES([{ text: T_('Grundbruch: Vd / Rn,d = {eta}', { eta: etaTxt(gb.eta) }), eta: gb.eta }]);
      sumAdd('10', T_('Grundbruch'), NDE ? 'DIN 4017' : ACI ? NP.ref.gb : 'EN 1997-1', gb.eta);
    }
    const se = vf.set;
    if (se) {
      H(3, '', NDE ? T_('Setzung nach DIN 4019') : T_('Setzung (Steinbrenner, kennzeichnender Punkt)'));
      KV([[T_('Sohlspannung quasi-ständig'), T_('σ = {s} kN/m² (G + 0,5 Q − U)', { s: f(se.sigma, 1) })], [T_('Aushubentlastung'), T_('σ′ü = {s0} kN/m²; Wiederbelastung {r} kN/m² mit 3 Es, Mehrbelastung {a} kN/m² mit Es', { s0: f(se.sig0, 1), r: f(se.reload, 1), a: f(se.add, 1) })], [T_('Grenztiefe'), T_('{t} m unter der Sohle (20 % der Überlagerung)', { t: f(se.ts, 1) })],
        [T_('Setzung'), T_('kennzeichnender Punkt s = {s} mm; biegeweich Mitte {c} mm, Ecke {e} mm', { s: f(se.s * 1000, 1), c: f(se.sCenter * 1000, 1), e: f(se.sCorner * 1000, 1) })]]);
      RES([{ text: T_('Setzung s = {s} mm ≤ 30 mm', { s: f(se.s * 1000, 1) }), eta: se.s / se.limit }]);
      sumAdd('10', T_('Setzung'), NDE ? T_('DIN 4019, Richtwert 30 mm') : T_('Richtwert 30 mm'), se.s / se.limit);
    }
    const bu = st.buoyancy;
    H(3, '', T_('Auftrieb (UPL)'));
    if (bu.relevant) {
      P_(T_('Endzustand: {d} · U = {d} · {u} kN ≤ {s} · G = {s} · {g} kN → η = {eta}.', { d: dF(NP.upl.dst), s: dF(NP.upl.stb), u: f(bu.final.U, 0), g: f(bu.final.G, 0), eta: f(bu.final.eta) }) + ' ' + T_(bu.bau.eta > 1 ? 'Rohbau ohne Überdeckung: η = {eta} – Wasserhaltung bis zum Aufbringen der Erdüberdeckung.' : 'Rohbau ohne Überdeckung: η = {eta}.', { eta: f(bu.bau.eta) }));
      sumAdd('10', T_('Auftrieb Endzustand'), T_('{d} U ≤ {s} G', { d: dF(NP.upl.dst), s: dF(NP.upl.stb) }), bu.final.eta);
    } else P_(T_('Kein Grundwasser über der Gründungssohle angesetzt – Auftrieb nicht maßgebend.'));
    // Pos. 11 Böschungen
    H(2, '11', T_('Pos. {no} – {name}', { no: 11, name: T_('Böschungen') }), { pos: true });
    if (vf.mound) {
      const mo = vf.mound;
      H(3, '', T_('Erdhügel'));
      FIG(slopeFig(mo, T_('Erdhügel 1 : {n}, ungünstigster Gleitkreis', { n: f(mo.n, 1) })), T_('Gleitkreise nach Bishop durch Schüttung ({fill}) und Untergrund; das Bauwerk wird nicht durchschnitten; Auflast {q} kN/m² auf der Krone', { fill: esc(mo.fill.name), q: f(mo.q, 1) }));
      P_(T_(mo.ok ? 'Bemessungswerte tan φ′d = tan φ′k / {a}, c′d = c′k / {b}, veränderliche Lasten × {c}. Sicherheit F = {F} ≥ 1,0 erforderlich → μ = 1/F = {mu}.' : 'Bemessungswerte tan φ′d = tan φ′k / {a}, c′d = c′k / {b}, veränderliche Lasten × {c}. Sicherheit F = {F} ≥ 1,0 erforderlich → μ = 1/F = {mu}; erforderlich 1 : {n}.', { a: dF(NP.geo.sl[0]), b: dF(NP.geo.sl[1]), c: dF(NP.geo.sl[2]), F: f(mo.F), mu: f(mo.mu), n: f(mo.nMin, 2) }));
      sumAdd('11', T_('Böschung Erdhügel'), NDE ? 'DIN 4084' : T_('Bishop'), mo.mu);
    }
    if (vf.exc) {
      const ex = vf.exc;
      H(3, '', T_('Baugrube'));
      if (ex.din4124) P_(T_('Böschungswinkel {a}° bei {d} m Tiefe in {soil}: nach {rule} ohne rechnerischen Nachweis zulässig (Tiefe ≤ {dmax} m, Regelneigung {s}°). Lastfreier Streifen 0,6 m am Böschungsrand einhalten.', { a: f(ex.angle, 0), d: f(ex.depth), soil: esc(T_(soil.name)), s: f(ex.rule.angle, 0), rule: esc(ex.rule.ref), dmax: f(ex.rule.dMax, ex.rule.dMax % 1 ? 1 : 0) }));
      else {
        FIG(slopeFig(ex, T_('Baugrube {a}°, ungünstigster Gleitkreis', { a: f(ex.angle, 0) })), T_('Baugrubenböschung mit Auflast 10 kN/m² ab 0,6 m vom Rand, Grundwasser abgesenkt'));
        P_(T_(ex.ok ? 'Sicherheit F = {F} → μ = {mu}.' : 'Sicherheit F = {F} → μ = {mu}; zulässig höchstens {a}° oder Verbau.', { F: f(ex.F), mu: f(ex.mu), a: String(ex.angleMax) }));
        sumAdd('11', T_('Baugrubenböschung'), NDE ? 'DIN 4084' : T_('Bishop'), ex.mu);
      }
    } else P_(T_('Baugrube mit Verbau – Bemessung des Verbaus durch den Fachplaner.'));
    // Pos. 12 Feuerwiderstand
    H(2, '12', T_('Pos. {no} – {name}', { no: 12, name: T_('Feuerwiderstand') }), { pos: true });
    if (vf.fire && vf.fire.items.length) {
      P_(ACI ? T_('Anforderung {cls}, angesetzt als Feuerwiderstandsdauer {h} h. Nachweis mit den Tabellen nach ACI/TMS 216.1-14: äquivalente Mindestdicke der Platten und Wände (Tab. 4.2, kieseliger Zuschlag), Betondeckung der Platten (Tab. 4.3.1.1) und Balken (Tab. 4.3.1.2) ohne Ansatz behinderter Verformung, Stützen Mindestmaß (4.5.1) und Deckung 25 mm je Stunde, höchstens 50 mm (4.5.3). Verglichen wird die Betondeckung c. Brandbeanspruchung von innen.', { cls: vf.fire.cls, h: I18.dec(String(vf.fire.hours)) })
        : SIA ? T_('Anforderung {cls} für tragende Bauteile. Nachweis sinngemäß mit dem Tabellenverfahren nach EN 1992-1-2 (Abschnitt 5): Mindestabmessungen und Achsabstand a der Längsbewehrung (a = c + Ø/2, bei Stützen und Balken zuzüglich Bügel); Brandschutz in der Schweiz nach VKF-Brandschutzvorschriften. Brandbeanspruchung von innen.', { cls: vf.fire.cls }) : NDE ? T_('Anforderung {cls} für tragende Bauteile. Nachweis mit dem Tabellenverfahren nach DIN EN 1992-1-2 (Abschnitt 5): Mindestabmessungen und Achsabstand a der Längsbewehrung (a = c + Ø/2, bei Stützen und Balken zuzüglich Bügel). Brandbeanspruchung von innen.', { cls: vf.fire.cls })
        : T_('Anforderung {cls} für tragende Bauteile. Nachweis mit dem Tabellenverfahren nach EN 1992-1-2 (Abschnitt 5): Mindestabmessungen und Achsabstand a der Längsbewehrung (a = c + Ø/2, bei Stützen und Balken zuzüglich Bügel). Brandbeanspruchung von innen.', { cls: vf.fire.cls }));
      TB([T_('Bauteil'), T_('Tabelle / Annahme'), T_('Maß vorh./erf. mm'), vf.fire.cover ? T_('c vorh./erf. mm') : T_('a vorh./erf. mm'), T_('Ergebnis')], vf.fire.items.map((i) => [esc(i.el), esc(i.kind), f(i.dim, 0) + ' / ' + f(i.dimMin, 0), f(i.a, 0) + ' / ' + (i.aMin != null ? f(i.aMin, 0) : '–'), i.ok ? '<span class="ok">' + T_('erfüllt') + '</span>' : '<span class="bad">' + T_('nicht erfüllt') + '</span>' + (i.bFire ? ' (b ≥ ' + f(i.bFire / 10, 0) + ' cm)' : '')]), ['l', 'l', 'r', 'r', 'l'], 'small');
      const e = max(...vf.fire.items.map((i) => (i.ok ? max(i.dimMin / i.dim, i.aMin != null ? i.aMin / i.a : 0) : 1.5)));
      sumAdd('12', T_('Feuerwiderstand {cls}', { cls: vf.fire.cls }), NDE ? 'DIN EN 1992-1-2' : ACI ? 'ACI/TMS 216.1' : 'EN 1992-1-2', e);
    } else P_(T_('Keine Anforderung an den Feuerwiderstand angesetzt.'));
    // Pos. 13 Luftstoß
    if (st.blast || q.blastDyn) {
      H(2, '13', T_('Pos. {no} – {name}', { no: 13, name: T_('Luftstoß (außergewöhnlich)') }), { pos: true });
      if (st.blast) {
        H(3, '', T_('Statisch äquivalent nach TWK 2017'));
        const accRow = (n, a) => (a ? [n, f(a.pM, 1), f(a.qRd, 1), a.shear.reinf ? T_('Ø{phi}/{s}, Streifen {w} m', { phi: a.shear.reinf.phi, s: f(a.shear.reinf.s * 100, 0), w: f(a.shear.strip) }) : a.shear.needs ? T_('nicht nachgewiesen') : T_('nicht nötig'), etaTxt(a.eta)] : null);
        TB([T_('Bauteil'), 'pM kN/m²', 'qRd kN/m²', T_('Schubbewehrung'), 'η'], [accRow(T_('Decke'), st.roof && st.roof.acc), accRow(T_('Außenwand'), st.wall && st.wall.acc), accRow(T_('Bodenplatte'), st.floor && st.floor.acc)].filter(Boolean), ['l', 'r', 'r', 'l', 'r']);
        const e = max(...[st.roof, st.wall, st.floor].filter((x) => x && x.acc).map((x) => x.acc.eta), 0);
        sumAdd('13', T_('Luftstoß'), 'TWK 2017', e);
      }
      const bd = q.blastDyn;
      if (bd && bd.rows.length) {
        H(3, '', T_('Dynamische Antwort (Einmassenschwinger)'));
        P_(T_('Ersatzbalken je Bauteil in Richtung der kurzen Stützweite, beidseitig eingespannt (Biggs: KE = 307·EIa/l⁴, bei der Decke mit dem Steifigkeitsverhältnis der eingespannten Rechteckplatte nach Timoshenko Tab. 35). Lastmassenfaktor der Wand KLM = 0,77 elastisch, 0,66 plastisch (Biggs); Decke als allseits eingespannte Rechteckplatte mit KLM aus der statischen Biegefläche (elastisch) bzw. dem Bruchlinienmechanismus (plastisch) je Seitenverhältnis. Bei Fließen gilt über den ganzen Verlauf der Mittelwert aus elastisch und plastisch (Spalte KLM). Widerstand Ru aus der Bruchlinien- bzw. Fließgelenktraglast mit dynamischen Festigkeiten, Steifigkeit mit Ia = (Ig + Icr)/2 (UFC 3-340-02). Ständige Last in Stoßrichtung zu Beginn im Gleichgewicht. Lastverlauf: TWK als Rechteckstoß langer Dauer, Szenarien als Dreieck mit td = 2·I/P. Dynamische Auflagerkraft V = 0,38·R + 0,12·P (Biggs), bei der Decke mit dem Anteil der langen Seite. Grenzwerte: μ ≤ 3 (entspricht beim Rechteckstoß Φ = 1,2 der TWK), Auflagerdrehwinkel θ ≤ 2° (UFC 3-340-02, Schutzkategorie 1).'));
        const dg = (v, d) => (isFinite(v) ? f(v, d) : '∞');
        TB([T_('Bauteil'), T_('Last'), 'P0 kN/m²', 'td ms', 'T ms', 'KLM', 'Ru kN/m²', 'ps kN/m²', 'xm mm', 'μ', 'θ °', 'V / VRd kN/m', ''], bd.rows.map((r) => [esc(r.el), esc(r.load), f(r.P0, 0), isFinite(r.td) ? f(r.td * 1000, 2) : '∞', f(r.T * 1000, 1), r.klm != null ? f(r.klm, 2) : '–', f(r.Ru, 0), f(r.ps, 1), dg(r.xm * 1000, 2), dg(r.mu, 2), dg(r.theta, 2), dg(r.vEd, 0) + ' / ' + f(r.vCap, 0), r.ok ? '<span class="ok">✔</span>' : '<span class="bad">✘</span>']), ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'l'], 'small');
        NOTE(T_('Abplatzen, Durchschlag, Splitter und Bodenstoß sind nicht enthalten. Für Szenarien ist der Einmassenschwinger eine Vorbemessung; die Fachbemessung bleibt erforderlich.'));
        const tw = bd.rows.filter((r) => r.twk);
        if (tw.length) sumAdd('13', T_('Luftstoß dynamisch'), T_('Einmassenschwinger TWK'), max(...tw.map((r) => r.eta)));
        for (const key of [...new Set(bd.rows.filter((r) => !r.twk).map((r) => r.loadKey))]) {
          const rs = bd.rows.filter((r) => r.loadKey === key);
          sumAdd('13', T_('Szenario: {name}', { name: rs[0].load }), T_('Einmassenschwinger (Vorbemessung)'), max(...rs.map((r) => r.eta)));
        }
      }
    }
    // Pos. 14 Fugen und WU
    H(2, '14', T_('Pos. {no} – {name}', { no: 14, name: T_('Betonierabschnitte, Fugen, WU-Konzept') }), { pos: true });
    const po = vf.pours;
    P_((L.wu ? (NDE ? T_('Weiße Wanne nach WU-Richtlinie, Beanspruchungsklasse {bk}, Nutzungsklasse A.', { bk }) : T_('Wasserundurchlässige Konstruktion (Weiße Wanne), Anforderungen wie DAfStb-WU-Richtlinie Beanspruchungsklasse {bk}, Nutzungsklasse A.', { bk })) + ' ' : T_('Abdichtung: {wp}.', { wp: esc(T_((BP.model.WATERPROOFING[b.waterproofing] || {}).name) || b.waterproofing) }) + ' ') +
      (L.restr ? T_('Zwang aus abfließender Hydratationswärme und Schwinden wird mit rissbreitenbegrenzender Mindestbewehrung aufgenommen (Planungsgrundsatz a).') : T_('Zwang wird über Fugenabstände und betontechnologische Maßnahmen begrenzt (Planungsgrundsatz b/c, Fachplaner).')));
    if (po) {
      TB([T_('Bauteil'), T_('Abschnitte'), T_('Beton m³')], po.sect.map((x) => [esc(elName(x.el)), String(x.n), f(x.V, 1)]), ['l', 'r', 'r']);
      KV([[T_('Arbeitsfugen waagerecht'), f(po.joints.hor, 1) + ' m'], [T_('Arbeitsfugen senkrecht'), f(po.joints.vert, 1) + ' m'], [T_('Fugen in Platten'), f(po.joints.slab, 1) + ' m'], [T_('Anschlüsse Zugänge'), f(po.joints.access, 1) + ' m'], [T_(L.wu ? 'Summe (Fugenblech)' : 'Summe'), f(po.joints.total, 1) + ' m']]);
    }

    // Pos. 15 Erdbeben
    const eqv = vf.eq;
    if (eqv && eqv.kind === 'DE') {
        H(2, '15', T_('Pos. {no} – {name}', { no: 15, name: T_('Erdbeben (DIN EN 1998-1/NA, DIN EN 1998-5)') }), { pos: true });
        KV([[T_('Erdbebenzone / agR'), T_('Zone {z} / {a} m/s²', { z: String(eqv.zone), a: f(eqv.agR, 1) })], [T_('Bedeutungsbeiwert γI'), f(eqv.gI, 1)], [T_('Untergrund'), eqv.key + ': S = ' + f(eqv.P.S, 2) + ', TB = ' + f(eqv.P.TB, 2) + ' s, TC = ' + f(eqv.P.TC, 2) + ' s, TD = ' + f(eqv.P.TD, 1) + ' s'],
          [T_('Bemessungsbeschleunigung'), 'ag = γI · agR = ' + f(eqv.ag, 2) + ' m/s², α = ag / g = ' + f(eqv.alpha, 3)]]);
        P_(T_('Erddruckzuwachs auf die starren Außenwände nach DIN EN 1998-5 Anhang E.9: ΔPd = α · S · γ · H² = {dP} kN/m, als Gleichlast Δp = α · S · γ · H = {dp} kN/m² über H = {H} m. Erdbebenkombination G + ψ₂·Q + AEd (γ = 1,0, Geländelast ψ₂ = {psi}); Verhältnis zur Grundkombination höchstens {r}.', { dP: f(eqv.dP, 1), dp: f(eqv.dp, 1), H: f(eqv.H), psi: f(eqv.psi, 1), r: f(eqv.ratio, 3) }));
        TB([T_('Wandlage'), 'mEd,E kNm/m', 'mRd kNm/m', 'η'], eqv.wallRows.map((r) => [esc(BP.calc.labelText(r.label)), f(r.mE, 1), f(r.mRd, 1), etaTxt(r.eta)]), ['l', 'r', 'r', 'r']);
        P_(T_('Trägheitskraft mit dem Plateauwert des Bemessungsspektrums Sd = ag · S · 2,5 / q = {sd} m/s² (q = 1,5) auf die Masse aus G + ψ₂·Q + 0,8·E (Füllungen) = {w} kN: F = {F} kN; Reibung in der Sohlfuge (G − U) · tan φ′ / 1,25 = {rf} kN (Erdwiderstand der Seitenwände nicht angesetzt).', { sd: f(eqv.Sd, 2), w: f(eqv.W, 0), F: f(eqv.F, 0), rf: f(eqv.Rf, 0) }) + (eqv.liq ? ' ' + T_('Verflüssigung des wassergesättigten Baugrunds im Gutachten prüfen (DIN EN 1998-5, 4.1.4).') : ''));
        RES([{ text: T_('Erdbeben: η = {eta}', { eta: etaTxt(eqv.eta) }), eta: eqv.eta }]);
        sumAdd('15', T_('Erdbeben'), 'DIN EN 1998', eqv.eta);
    } else if (eqv) {
      const us = eqv.kind === 'ASCE7', sia = eqv.kind === 'SIA', R5 = NP.ref.seis5;
      H(2, '15', T_('Pos. {no} – {name}', { no: 15, name: T_('Erdbeben ({ref})', { ref: us ? 'ASCE/SEI 7-22, IBC 2024 1803.5.12' : sia ? 'SIA 261, ' + R5 + ' ' + T_('sinngemäß') : NP.ref.seis + ', ' + R5 }) }), { pos: true });
      if (!eqv.required) NOTE(T_('Nach {ref} nicht gefordert ({why}); die Werte sind nur zur Information angegeben.', { ref: esc(NP.ref.seis), why: esc((eqv.why ? T_(eqv.why) : '')) }));
      KV(us ? [[T_('Bemessungswerte'), 'SDS = ' + f(eqv.sds, 3) + ' g, SD1 = ' + (eqv.sd1 != null ? f(eqv.sd1, 3) + ' g' : '–') + (eqv.TB != null ? ', T0 = ' + f(eqv.TB, 2) + ' s, TS = ' + f(eqv.TC, 2) + ' s' : '')],
        [T_('Site Class / Risikokategorie'), esc(eqv.key === 'Default' ? T_('Standard (Baugrund unbekannt)') : eqv.key) + ' / ' + esc(eqv.imp) + ', Ie = ' + f(eqv.gI, 2)],
        [T_('Seismic Design Category'), esc(eqv.sdc) + (eqv.sdcSrc ? ' (USGS)' : ' ' + T_('(Tab. 11.6-1 und 11.6-2)'))]]
        : [[sia ? T_('Erdbebenzone / agd') : T_('Referenz-Bodenbeschleunigung agR'), (sia ? esc(eqv.zone) + (eqv.assumed ? ' ' + T_('(angenommen)') : '') + ' / ' : '') + f(eqv.agR, 2) + ' m/s²'],
          [sia ? T_('Bauwerksklasse, Bedeutungsfaktor γf') : T_('Bedeutungskategorie, Bedeutungsbeiwert γI'), esc(eqv.imp) + ', ' + f(eqv.gI, 2)],
          [T_('Baugrundklasse'), eqv.key + ': S = ' + f(eqv.P.S, 2) + ', TB = ' + f(eqv.P.TB, 2) + ' s, TC = ' + f(eqv.P.TC, 2) + ' s, TD = ' + f(eqv.P.TD, 1) + ' s' + (eqv.note ? ' (' + esc(T_(eqv.note)) + ')' : '')],
          [T_('Bemessungsbeschleunigung'), 'ag = ' + (sia ? 'γf · agd' : 'γI · agR') + ' = ' + f(eqv.ag, 2) + ' m/s², α = ag / g = ' + f(eqv.alpha, 3)]]);
      P_(us ? T_('Erddruckzuwachs auf die nicht nachgebenden Außenwände für das Bemessungsbeben (IBC 1803.5.12) mit kh = 0,4 · SDS = {kh} (Wood, wie EN 1998-5 Anhang E.9): Δp = kh · γ · H = {dp} kN/m² über H = {H} m. Erdbebenkombination 1,2 D + E + 0,5 L mit Erddruck H × 1,6 (ASCE 7-22 2.3.6); Verhältnis zur Grundkombination höchstens {r}.', { kh: f(eqv.alphaS, 3), dp: f(eqv.dp, 1), H: f(eqv.H), r: f(eqv.ratio, 3) })
        : T_('Erddruckzuwachs auf die starren Außenwände nach {ref} Anhang E.9: ΔPd = α · S · γ · H² = {dP} kN/m, als Gleichlast Δp = α · S · γ · H = {dp} kN/m² über H = {H} m. Erdbebenkombination G + ψ₂·Q + AEd (γ = 1,0, Geländelast ψ₂ = {psi}); Verhältnis zur Grundkombination höchstens {r}.', { ref: R5, dP: f(eqv.dP, 1), dp: f(eqv.dp, 1), H: f(eqv.H), psi: f(eqv.psi, 1), r: f(eqv.ratio, 3) }));
      TB([T_('Wandlage'), 'mEd,E kNm/m', 'mRd kNm/m', 'η'], eqv.wallRows.map((r) => [esc(BP.calc.labelText(r.label)), f(r.mE, 1), f(r.mRd, 1), etaTxt(r.eta)]), ['l', 'r', 'r', 'r']);
      P_((us ? T_('Trägheitskraft mit Cs = SDS · Ie / R = {cs} (R = 1,5, steifes erdüberdecktes Bauwerk) auf die Masse aus G + ψ₂·Q + 0,8·E (Füllungen) = {w} kN: F = {F} kN; Reibung in der Sohlfuge (G − U) · tan φ′ / {gp} = {rf} kN (Erdwiderstand der Seitenwände nicht angesetzt).', { cs: f(eqv.Sd / 9.81, 3), w: f(eqv.W, 0), F: f(eqv.F, 0), gp: dF(NP.geo.sl[0]), rf: f(eqv.Rf, 0) })
        : T_('Trägheitskraft mit dem Plateauwert des Bemessungsspektrums Sd = ag · S · 2,5 / q = {sd} m/s² (q = 1,5) auf die Masse aus G + ψ₂·Q + 0,8·E (Füllungen) = {w} kN: F = {F} kN; Reibung in der Sohlfuge (G − U) · tan φ′ / {gp} = {rf} kN (Erdwiderstand der Seitenwände nicht angesetzt).', { sd: f(eqv.Sd, 2), w: f(eqv.W, 0), F: f(eqv.F, 0), gp: dF(NP.geo.sl[0]), rf: f(eqv.Rf, 0) }))
        + (eqv.liq ? ' ' + T_('Verflüssigung des wassergesättigten Baugrunds im Gutachten prüfen ({ref}).', { ref: NP.ref.liq }) : ''));
      RES([{ text: T_('Erdbeben: η = {eta}', { eta: etaTxt(eqv.eta) }), eta: eqv.eta }]);
      if (eqv.required) sumAdd('15', T_('Erdbeben'), us ? 'ASCE/SEI 7-22' : sia ? 'SIA 261' : NP.ref.seis, eqv.eta);
    }
    // 7 Zusammenstellung
    H(1, '7', T_('Zusammenstellung der Nachweise'));
    TB([T_('Pos.'), T_('Bauteil'), T_('Nachweis'), 'η', T_('Ergebnis')], summary.map((s) => [s.pos, esc(s.el), esc(s.what), etaTxt(s.eta), ok(s.eta)]), ['l', 'l', 'l', 'r', 'l']);
    const allOk = summary.every((s) => s.eta <= 1 + 1e-9);
    const nBad = summary.filter((s) => !(s.eta <= 1 + 1e-9)).length;
    RES([{ text: allOk ? T_('Alle aufgeführten Nachweise sind erfüllt.') : T_(nBad === 1 ? '{n} Nachweis ist nicht erfüllt.' : '{n} Nachweise sind nicht erfüllt.', { n: nBad }), eta: allOk ? 0 : 2, plain: true }]);

    // 8 Bewehrung
    H(1, '8', T_('Bewehrung'));
    const sch = q.steel.schedule;
    if (sch) {
      P_(ACI ? T_('Bewehrung nach Biegeliste mit {n} Positionen (Stablängen ≤ 12 m, Übergreifungsstöße Klasse B = 1,3 ld nach ACI 318-19 25.5, Biegerollen 6 db bis No. 25, 8 db darüber, Bügel 4 db (25.3)). Bewehrungspläne BWP-01 ff. und BVBS-Datei als Anlage.', { n: sch.positions.length })
        : SIA ? T_('Bewehrung nach Biegeliste mit {n} Positionen (Stablängen ≤ 12 m, Übergreifungsstöße 1,5 · lbd nach SIA 262 5.2 (lbd = Ø/4 · fsd/fbd ≥ 25 Ø), Biegerollen 4 Ø bis Ø16, 7 Ø darüber). Bewehrungspläne BWP-01 ff. und BVBS-Datei als Anlage.', { n: sch.positions.length }) : NDE ? T_('Bewehrung nach Biegeliste mit {n} Positionen (Stablängen ≤ 12 m, Übergreifungsstöße nach EC2 8.7 mit NA DE, Biegerollen 4 Ø bis Ø16, 7 Ø darüber). Bewehrungspläne BWP-01 ff. und BVBS-Datei als Anlage.', { n: sch.positions.length })
        : T_('Bewehrung nach Biegeliste mit {n} Positionen (Stablängen ≤ 12 m, Übergreifungsstöße nach EC2 8.7 {na}, Biegerollen 4 Ø bis Ø16, 7 Ø darüber). Bewehrungspläne BWP-01 ff. und BVBS-Datei als Anlage.', { n: sch.positions.length, na: naTag }));
      TB([T_('Bauteil'), T_('Stäbe'), T_('Masse kg')], sch.byEl.map((e) => [esc(elName(e.el)), String(e.n), f(e.kg, 0)]).concat(sch.approx.map((a) => [T_('{el} (Ansatz)', { el: esc(elName(a.el)) }), '', f(a.kg, 0)]), [['<b>' + T_('Summe ohne Verschnitt') + '</b>', '', '<b>' + f(q.steel.net, 0) + '</b>']]), ['l', 'r', 'r']);
    }

    // 9 Offene Punkte
    H(1, '9', T_('Hinweise und offene Punkte'));
    const open = q.checks.filter((c) => c.level === 'err' || c.level === 'warn');
    B.push({ t: 'list', items: [
      T_('Baugrundgutachten mit Bodenkennwerten, Bemessungswasserstand und Angaben zur Baugrube einholen; Annahmen dieser Berechnung danach überprüfen.'),
      T_('Ausführungsplanung (Schal- und Bewehrungspläne) auf Grundlage dieser Berechnung durch den Tragwerksplaner; Lastangaben von Aufzug, Lüftung und Türen der Hersteller einarbeiten.'),
      T_('Prüfung der Standsicherheit nach Landesbauordnung (Prüfingenieur bzw. Prüfamt), soweit gefordert.'),
    ].concat(open.map((c) => (c.level === 'err' ? '<b>' + T_('Nicht erfüllt:') + '</b> ' : T_('Warnung:') + ' ') + esc(c.text))) });
    B.push({ t: 'sign', meta });

    // Anhang: Verifikation des Rechenprogramms
    H(1, 'A', T_('Anhang: Verifikation des Rechenprogramms'));
    P_(T_('Die Rechenkerne werden bei jeder Ausgabe gegen Referenzlösungen nachgerechnet: geschlossene Lösungen und Tafelwerte aus der Literatur sowie unabhängige Handrechnungen nach den Normformeln. Die Platten dieses Projekts werden zusätzlich mit halber Netzweite nachgerechnet.'));
    const bm = BP.benchmarks ? BP.benchmarks.run() : [];
    if (bm.length) {
      const fx = (v) => (Math.abs(v) >= 100 ? f(v, 1) : Math.abs(v) >= 1 ? f(v, 3) : f(v, 4));
      TB([T_('Beispiel'), T_('Referenz'), T_('Sollwert'), T_('Programm'), T_('Abw.'), ''], bm.map((x) => [esc(x.group) + ': ' + esc(x.name), esc(x.src), fx(x.ref) + ' ' + esc(x.unit), fx(x.val) + ' ' + esc(x.unit), f(x.dev * 100, 2) + ' %', x.ok ? '<span class="ok">✔</span>' : '<span class="bad">✘</span>']), ['l', 'l', 'r', 'r', 'r', 'l'], 'small');
      const nOk = bm.filter((x) => x.ok).length;
      RES([{ text: T_('{ok} von {n} Referenzbeispielen innerhalb der Toleranz (Platten 3–6 %, Querschnitte und Baugrund 0,5–5 %).', { ok: nOk, n: bm.length }), eta: nOk === bm.length ? 0 : 2, plain: true }]);
    }
    const mesh = meshStudy(st);
    if (mesh) {
      H(2, 'A.2', T_('Netzstudie {name}', { name: mesh.name }));
      TB([T_('Größe'), T_('Netz {h} m', { h: f(mesh.h, 2) }), T_('Netz {h} m', { h: f(mesh.h / 2, 2) }), T_('Abweichung')], mesh.rows.map((r) => [esc(r[0]), f(r[1], 1), f(r[2], 1), f((r[2] - r[1]) / Math.max(Math.abs(r[1]), 1e-9) * 100, 1) + ' %']), ['l', 'r', 'r', 'r'], 'small');
      NOTE(T_('Bemessungsmomente an Auflagern über 2·d gemittelt, im Feld ungemittelt (Abschnitt 2.3). Stützmomente an Singularitäten konvergieren langsamer; Abweichungen bis rund 10 % sind bei halbierter Netzweite üblich.'));
    }
    return { blocks: B, summary, positions: pos };
  }

  /* Netzstudie: Decke (bzw. Bodenplatte) mit halber Netzweite; Größtwerte der gemittelten Bemessungsmomente je Lage. */
  function meshStudy(st) {
    if (!BP.slabs || !st.fe || !st.fe.jobs) return null;
    const pick = st.fe.jobs.roof && st.fe.roof ? [T_('Decke'), st.fe.jobs.roof, st.fe.roof] : st.fe.jobs.floor && st.fe.floor ? [T_('Bodenplatte'), st.fe.jobs.floor, st.fe.floor] : null;
    if (!pick) return null;
    const [name, job, res1] = pick;
    let res2;
    try { res2 = BP.slabs.run(Object.assign({}, job, { meshSize: job.meshSize / 2 })); } catch (e) { return null; }
    const mx = (res, key) => { let m = 0; for (let k = 0; k < res.mesh.nNodes; k++) if (!res.inSup[k]) m = Math.max(m, res.uls[key][k]); return m; };
    const rows = [[T_('mEd unten, x [kNm/m]'), 'bx'], [T_('mEd unten, y [kNm/m]'), 'by'], [T_('mEd oben, x [kNm/m]'), 'tx'], [T_('mEd oben, y [kNm/m]'), 'ty']].map(([t, k]) => [t, mx(res1, k), mx(res2, k)]);
    const sumR = (res) => (res.react ? res.react.lines.reduce((s2, l) => s2 + l.sum, 0) + res.react.areas.reduce((s2, a) => s2 + a.sum, 0) : 0);
    if (res1.react) rows.push([T_('Summe der Auflagerkräfte [kN]'), sumR(res1), sumR(res2)]);
    return { name, h: job.meshSize, rows };
  }

  /* ---------- HTML ---------- */
  const CSS = '.sr{font:9.5pt/1.42 Archivo,Arial,sans-serif;color:#1d2220}.sr h1{font-size:14pt;margin:4mm 0 2mm;border-bottom:0.4mm solid #1d2220;padding-bottom:1mm}.sr h2{font-size:11.5pt;margin:4mm 0 1.5mm}.sr h3{font-size:9.5pt;margin:2.5mm 0 1mm;color:#3a413d}' +
    '.sr p{margin:0 0 1.6mm}.sr table{width:100%;border-collapse:collapse;margin:0 0 2mm;font-size:8.8pt}.sr table.small{font-size:7.8pt}.sr th,.sr td{border-bottom:0.2mm solid #cfd5d1;padding:0.7mm 1.2mm;text-align:left;vertical-align:top}.sr th{background:#f1f3f2;font-weight:600}' +
    '.sr td.r,.sr th.r{text-align:right}.sr table.kv th{width:38%;background:none;font-weight:500;color:#3a413d}.sr .fig{display:block;width:100%;height:auto;margin:1mm 0}.sr .figrow{display:flex;gap:4mm}.sr .figrow svg{width:50%;height:auto}.sr .cap{font-size:8pt;color:#57605b;margin:0 0 2.5mm}' +
    '.sr .res{border:0.3mm solid #1d2220;padding:1.2mm 2mm;margin:1mm 0 3mm;font-weight:600}.sr .res.bad{border-color:#b3261e;color:#b3261e}.sr .ok{color:#1e6b3a;font-weight:600}.sr .bad{color:#b3261e;font-weight:600}.sr ul{margin:0 0 2mm;padding-left:5mm}.sr li{margin:0 0 0.8mm}.sr .note{font-size:8.3pt;color:#57605b}' +
    '.sr .toc td{border:0;padding:0.5mm 1mm}.sr .toc td.n{width:14mm}.sr .toc tr.l1 td{font-weight:600;padding-top:1.6mm}.sr .toc td.pg{text-align:right;width:12mm}' +
    '.sr .title{display:flex;flex-direction:column;height:100%}.sr .title h1{font-size:22pt;border:0;margin:30mm 0 4mm}.sr .title .sub{font-size:12pt;margin:0 0 14mm}.sr .title table th{width:40%}.sr .title .stamp{margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:6mm}.sr .title .stamp div{border:0.3mm solid #1d2220;height:42mm;padding:2mm;font-size:8.5pt}' +
    '.sr .sign{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin-top:10mm}.sr .sign div{border-top:0.3mm solid #1d2220;padding-top:1mm;font-size:8.5pt;height:20mm}';

  function titleHTML(meta) {
    return '<div class="title"><h1>' + T_('Statische Berechnung') + '</h1><div class="sub">' + T_('Vorbemessung – zur Prüfung aufbereitet') + '</div><table class="kv">' +
      [[T_('Bauvorhaben'), esc(meta.project)], [T_('Standort'), esc(meta.site || '–')], [T_('Bauherr'), esc(meta.client || '')], [T_('Aufsteller (Tragwerksplaner)'), esc(meta.author || '')], [T_('Erstellt mit'), T_('Bunkerplaner (Vorbemessung, Rechenkern {v})', { v: esc(meta.version || '') })], [T_('Datum / Index'), esc(meta.date) + ' / ' + esc(meta.index || 'a')], [T_('Umfang'), T_('siehe Inhaltsverzeichnis')]]
        .map(([k, v]) => '<tr><th>' + k + '</th><td>' + v + '</td></tr>').join('') + '</table>' +
      '<p class="note" style="margin-top:6mm">' + T_('Diese Unterlage ist eine rechnergestützte Vorbemessung. Sie ersetzt nicht den von einem bauvorlageberechtigten Tragwerksplaner aufgestellten und unterschriebenen Standsicherheitsnachweis und nicht dessen Prüfung. Annahmen zu Baugrund und Wasser sind durch ein Gutachten zu bestätigen.') + '</p>' +
      '<div class="stamp"><div>' + T_('Aufgestellt:') + '<br><br><br>' + T_('Ort, Datum, Unterschrift') + '</div><div>' + T_('Prüfvermerk:') + '</div></div></div>';
  }
  const alignCls = (a, i) => (a && a[i] === 'r' ? ' class="r"' : '');
  function tableHead(b) { return '<table class="' + (b.cls || '') + '"><thead><tr>' + b.head.map((h, i) => '<th' + alignCls(b.align, i) + '>' + h + '</th>').join('') + '</tr></thead><tbody>'; }
  function rowHTML(b, r) { return '<tr>' + r.map((c, i) => '<td' + alignCls(b.align, i) + '>' + (c == null ? '' : c) + '</td>').join('') + '</tr>'; }
  function blockHTML(b) {
    switch (b.t) {
      case 'title': return titleHTML(b.meta);
      case 'h': return '<h' + b.lvl + (b.id ? ' id="' + b.id + '"' : '') + '>' + (b.num && !b.pos ? b.num + '&nbsp;&nbsp;' : '') + esc(b.text) + '</h' + b.lvl + '>';
      case 'p': return '<p>' + b.html + '</p>';
      case 'note': return '<p class="note">' + b.html + '</p>';
      case 'list': return '<ul>' + b.items.map((i) => '<li>' + i + '</li>').join('') + '</ul>';
      case 'kv': return '<table class="kv">' + b.rows.map(([k, v]) => '<tr><th>' + k + '</th><td>' + v + '</td></tr>').join('') + '</table>';
      case 'table': return tableHead(b) + b.rows.map((r) => rowHTML(b, r)).join('') + '</tbody></table>';
      case 'fig': return b.svg + (b.cap ? '<p class="cap">' + b.cap + '</p>' : '');
      case 'fig2': return '<div class="figrow">' + b.svgs.join('') + '</div>' + (b.cap ? '<p class="cap">' + b.cap + '</p>' : '');
      case 'res': return b.items.map((i) => '<div class="res' + (i.eta > 1 + 1e-9 ? ' bad' : '') + '">' + i.text + (i.plain ? '' : ' – ' + (i.eta > 1 + 1e-9 ? T_('nicht erfüllt') : T_('erfüllt'))) + '</div>').join('');
      case 'sign': return '<div class="sign"><div>' + T_('Aufgestellt: Ort, Datum, Unterschrift') + '</div><div>' + T_('Geprüft: Ort, Datum, Unterschrift') + '</div></div>';
      case 'toc': return '';
      default: return '';
    }
  }
  /* fließendes HTML ohne Seitenumbruch (Tests, Vorschau) */
  function toHTML(rep) { return '<style>' + CSS + '</style><div class="sr">' + rep.blocks.map(blockHTML).join('') + '</div>'; }

  /* ---------- Seiten (Browser) ---------- */
  function render(container, rep, meta) {
    const doc = container.ownerDocument, PAGE = { w: 210, h: 297, ml: 20, mr: 13, mt: 12, mb: 11, head: 10, foot: 8 };
    const cw = PAGE.w - PAGE.ml - PAGE.mr, ch = PAGE.h - PAGE.mt - PAGE.mb - PAGE.head - PAGE.foot;
    container.innerHTML = '<style>' + CSS + '</style>'; // Stile schon beim Messen
    const box = doc.createElement('div');
    box.className = 'sr';
    box.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;width:' + cw + 'mm';
    container.appendChild(box);
    const probe = doc.createElement('div'); probe.style.height = '100mm'; box.appendChild(probe);
    const pxmm = probe.getBoundingClientRect().height / 100 || 3.78; box.removeChild(probe);
    const hOf = (html) => { box.innerHTML = html; return box.getBoundingClientRect().height / pxmm; };
    // Inhaltsverzeichnis: Überschriften Ebene 1 und 2
    const heads = rep.blocks.filter((x) => x.t === 'h' && x.lvl <= 2);
    heads.forEach((hd, i) => { hd.id = 'sr-h' + i; });
    const tocRows = heads.map((hd) => '<tr class="l' + hd.lvl + '"><td class="n">' + (hd.pos ? '' : esc(hd.num)) + '</td><td>' + esc(hd.text) + '</td><td class="pg" data-ref="' + hd.id + '">000</td></tr>');
    // Elemente: [html, Höhe, keepWithNext, ref]
    const items = [];
    for (const blk of rep.blocks) {
      if (blk.t === 'title') { items.push({ html: blockHTML(blk), h: ch, page: true }); continue; }
      if (blk.t === 'toc') {
        const head = '<h1>' + T_('Inhalt') + '</h1><table class="toc">', foot = '</table>', h0 = hOf('<table class="toc"></table>');
        let chunk = [], hh = hOf(head + foot);
        for (const r of tocRows) {
          const rh = hOf('<table class="toc">' + r + '</table>') - h0;
          if (hh + rh > ch && chunk.length) { items.push({ html: head + chunk.join('') + foot, h: hh, newPage: true }); chunk = []; hh = hOf(head + foot); }
          chunk.push(r); hh += rh;
        }
        items.push({ html: head + chunk.join('') + foot, h: hh, newPage: true, breakAfter: true });
        continue;
      }
      if (blk.t === 'table' && blk.rows.length > 4) {
        const head = tableHead(blk), tail = '</tbody></table>', hHead = hOf(head + tail);
        let chunk = [], hh = hHead;
        for (const r of blk.rows) {
          const html = rowHTML(blk, r), rh = hOf(head + html + tail) - hHead;
          if (hh + rh > ch && chunk.length) { items.push({ html: head + chunk.join('') + tail, h: hh }); chunk = []; hh = hHead; }
          chunk.push(html); hh += rh;
        }
        if (chunk.length) items.push({ html: head + chunk.join('') + tail, h: hh });
        continue;
      }
      const html = blockHTML(blk);
      items.push({ html, h: hOf(html), keep: blk.t === 'h', ref: blk.t === 'h' && blk.id ? blk.id : null, posTitle: blk.t === 'h' && blk.lvl <= 2 ? blk.text : null, lvl1: blk.t === 'h' && blk.lvl === 1 });
    }
    container.removeChild(box);
    // Seiten füllen (Überschriften mit dem folgenden Element zusammenhalten, Kapitel auf neuer Seite)
    const pages = [{ items: [], h: 0, title: '' }];
    let cur = pages[0], lastTitle = '';
    const newPage = () => { cur = { items: [], h: 0, title: lastTitle }; pages.push(cur); };
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.page) { if (cur.items.length) newPage(); cur.items.push(it); cur.h = ch; cur.isTitle = true; newPage(); continue; }
      if (it.newPage && cur.items.length) newPage();
      if (it.lvl1 && cur.items.length && cur.h > ch * 0.7) newPage();
      // Überschriften bleiben mit den folgenden Überschriften und dem Anfang des nächsten Elements zusammen
      let need = it.h;
      if (it.keep) { let j = i + 1; while (j < items.length && items[j].keep) { need += items[j].h; j++; } if (j < items.length) need += min(items[j].h, 40); }
      if (cur.h + need > ch * 0.985 && cur.items.length) newPage();
      if (it.posTitle) { lastTitle = it.posTitle; if (!cur.title || cur.items.length === 0) cur.title = it.posTitle; }
      cur.items.push(it); cur.h += it.h;
      if (it.breakAfter) newPage();
    }
    if (!pages[pages.length - 1].items.length) pages.pop();
    const N = pages.length, refPage = {};
    pages.forEach((pg, k) => pg.items.forEach((it) => { if (it.ref) refPage[it.ref] = k + 1; }));
    let html = '<style>' + CSS + '@page{size:A4;margin:0}#report .srp{width:210mm;height:297mm;box-sizing:border-box;padding:' + PAGE.mt + 'mm ' + PAGE.mr + 'mm ' + PAGE.mb + 'mm ' + PAGE.ml + 'mm;break-after:page;page-break-after:always;position:relative;overflow:hidden;background:#fff}' +
      '#report .srp .hd{height:' + PAGE.head + 'mm;border-bottom:0.3mm solid #1d2220;display:flex;justify-content:space-between;align-items:flex-end;font:8pt Archivo,Arial,sans-serif;color:#3a413d;padding-bottom:1mm;box-sizing:border-box}' +
      '#report .srp .bd{height:' + ch + 'mm;overflow:hidden;padding-top:1.5mm;box-sizing:border-box}#report .srp .ft{height:' + PAGE.foot + 'mm;border-top:0.3mm solid #1d2220;display:flex;justify-content:space-between;align-items:flex-start;font:7.5pt Archivo,Arial,sans-serif;color:#57605b;padding-top:1mm;box-sizing:border-box}</style>';
    pages.forEach((pg, k) => {
      html += '<div class="srp"><div class="hd"><span><b>' + esc(meta.project) + '</b> · ' + T_('Statische Berechnung (Vorbemessung)') + '</span><span>' + (pg.isTitle ? '' : esc(pg.title || '')) + '</span></div>' +
        '<div class="bd sr">' + pg.items.map((it) => it.html).join('') + '</div>' +
        '<div class="ft"><span>Bunkerplaner · ' + T_('Index {i}', { i: esc(meta.index || 'a') }) + ' · ' + esc(meta.date) + '</span><span>' + T_('Seite {k} von {n}', { k: k + 1, n: N }) + '</span></div></div>';
    });
    container.innerHTML = html;
    container.querySelectorAll('td.pg[data-ref]').forEach((td) => { td.textContent = refPage[td.getAttribute('data-ref')] || ''; });
    return { pages: N, fill: pages.map((pg) => Math.round(pg.h)), items: items.map((it) => Math.round(it.h)) };
  }

  BP.statikReport = { build, toHTML, render, positions, posPlan, feMap, slopeFig, CSS };
})(typeof window !== 'undefined' ? window : globalThis);
