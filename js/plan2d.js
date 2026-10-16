/* Grundriss-Editor (SVG). Weltkoordinaten in m, y nach oben; Darstellung in Bildschirmpixeln. */
(function (root) {
  const BP = root.BP, G = BP.geo;
  const T_ = BP.i18n.T, N_ = BP.i18n.N;
  const P = BP.plan2d = {};
  let svg, hintEl, editorEl, A;
  const view = { cx: 5, cy: 3, k: 50, W: 800, H: 600, fitted: false };
  let hover = null, drag = null, draft = null, spaceDown = false;

  const fmt = (v, d = 2) => BP.calc.fmt(v, d);
  const S = (p) => ({ x: view.W / 2 + (p.x - view.cx) * view.k, y: view.H / 2 - (p.y - view.cy) * view.k });
  const Wd = (sx, sy) => ({ x: view.cx + (sx - view.W / 2) / view.k, y: view.cy - (sy - view.H / 2) / view.k });
  const pts = (arr) => arr.map((p) => { const s = S(p); return s.x.toFixed(1) + ',' + s.y.toFixed(1); }).join(' ');
  const pathOf = (arr) => 'M' + arr.map((p) => { const s = S(p); return s.x.toFixed(1) + ' ' + s.y.toFixed(1); }).join('L') + 'Z';
  const tol = () => 8 / view.k;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // aktive Ebene: berechnete Geometrie (LG) und Eingabedaten (SRC)
  const LV = () => A.lvl();
  const LG = () => { const L = A.q.geo.L; return L[Math.min(LV(), L.length - 1)]; };
  const SRC = (p) => A.levelSrc(p || A.p, LV());
  const colRect = (c) => G.polygonFromRect(c.x - c.bx / 2, c.y - c.by / 2, c.x + c.bx / 2, c.y + c.by / 2);
  /* Innentreppen und Aufzüge, die die aktive Ebene berühren */
  function vertsHere() {
    const g = A.q.geo, i = LV();
    return {
      stairsUp: g.vert.stairs.filter((st) => st.upper === i), stairsDown: g.vert.stairs.filter((st) => st.lower === i),
      lifts: g.vert.lifts.filter((v) => i >= v.wallTop && i <= v.levelBot),
    };
  }
  /* Leitung berührt die aktive Ebene (Höhenbereich OK Rohboden bis OK Platte darüber)? */
  function routeOnLevel(rr) {
    const lv = A.q.lv, L = lv.levels;
    if (!L || L.length < 2) return true;
    const i = LV(), z0 = L[i].zFloorTop - 0.01, z1 = (i ? L[i - 1].zFloorTop : lv.zRoofTop) + 0.01;
    if (!rr.pts.length) return i === 0;
    if (rr.pts.length === 1) return rr.pts[0].z >= z0 && rr.pts[0].z <= z1;
    return rr.segs.some((sg) => Math.max(sg.A.z, sg.B.z) >= z0 && Math.min(sg.A.z, sg.B.z) <= z1);
  }
  P.slabOf = function (k) {
    const st = A.q.struct;
    if (k === 'roof') return st.roof;
    if (k === 'floor') return st.floor;
    return st.mids.find((m) => 'mid' + m.level === k) || null;
  };

  P.init = function (app) {
    A = app;
    svg = document.getElementById('planSvg');
    hintEl = document.getElementById('planHint');
    editorEl = document.getElementById('planEditor');
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('pointerleave', () => { hover = null; if (!drag) P.render(); });
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !isTyping(e)) spaceDown = true; });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
    window.addEventListener('blur', () => { spaceDown = false; });
    new ResizeObserver(() => { if (svg.clientWidth) { measure(); if (!view.fitted) P.fit(); P.render(); } }).observe(svg);
  };

  function isTyping(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'); }
  function measure() { view.W = svg.clientWidth || 800; view.H = svg.clientHeight || 600; }

  P.fit = function () {
    measure();
    if (!A.q) return;
    const g = A.q.geo;
    const all = g.out.concat(...g.access.map((a) => a.foot), A.q.earth.toePoly || [], ...A.q.routes.list.map((r) => r.src.pts.map((pt) => ({ x: pt.x, y: pt.y }))));
    const bb = G.bbox(all);
    const pad = 2.2, hintH = 70; // Maßketten außen, unten Platz für die Hinweisleiste
    view.k = Math.min((view.W - 40) / (bb.w + 2 * pad), (view.H - 40 - hintH) / (bb.h + 2 * pad));
    view.k = Math.max(8, Math.min(view.k, 400));
    view.cx = (bb.x0 + bb.x1) / 2; view.cy = (bb.y0 + bb.y1) / 2 - hintH / 2 / view.k;
    view.fitted = true;
  };

  /* ---------- Fangen ---------- */

  function snapLines() {
    const g = A.q.geo, xs = [], ys = [];
    const inner = g.valid ? g.inner : g.out;
    for (let i = 0; i < inner.length; i++) {
      const a = inner[i], b = inner[(i + 1) % inner.length];
      if (Math.abs(a.y - b.y) < 1e-6) ys.push({ v: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
      if (Math.abs(a.x - b.x) < 1e-6) xs.push({ v: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
    }
    // Wände der aktiven Ebene; tragende Wände der Nachbarebenen zum Übereinanderstellen
    const others = [LV() - 1, LV() + 1].filter((i) => i >= 0 && i < A.q.geo.L.length)
      .flatMap((i) => A.q.geo.L[i].walls.filter((w) => w.info.bearing && !w.auto));
    for (const w of SRC().walls.concat(others)) {
      if (drag && drag.wallId === w.id) continue;
      if (Math.abs(w.a.y - w.b.y) < 1e-6) {
        const lo = Math.min(w.a.x, w.b.x), hi = Math.max(w.a.x, w.b.x);
        ys.push({ v: w.a.y - w.t / 2, lo, hi }, { v: w.a.y + w.t / 2, lo, hi }, { v: w.a.y, lo, hi });
      } else if (Math.abs(w.a.x - w.b.x) < 1e-6) {
        const lo = Math.min(w.a.y, w.b.y), hi = Math.max(w.a.y, w.b.y);
        xs.push({ v: w.a.x - w.t / 2, lo, hi }, { v: w.a.x + w.t / 2, lo, hi }, { v: w.a.x, lo, hi });
      }
    }
    // Stützenachsen dieser und der Nachbarebenen (Stützen in Reihe und übereinander)
    const bi = G.bbox(inner);
    for (const i of [LV() - 1, LV(), LV() + 1]) {
      const L = A.q.geo.L[i];
      if (!L) continue;
      for (const c of L.columns) {
        if (drag && drag.hit && drag.hit.type === 'column' && drag.hit.id === c.id) continue;
        xs.push({ v: c.x, lo: bi.y0, hi: bi.y1 }); ys.push({ v: c.y, lo: bi.x0, hi: bi.x1 });
      }
    }
    return { xs, ys };
  }

  function snapPoint(p, opts = {}) {
    const grid = A.ui.snap ? 0.05 : 0;
    const L = snapLines();
    const t = 10 / view.k;
    let x = p.x, y = p.y, sx = null, sy = null;
    if (!opts.lockX) {
      let best = t;
      for (const l of L.xs) { const d = Math.abs(p.x - l.v); if (d < best && p.y > l.lo - t && p.y < l.hi + t) { best = d; sx = l.v; } }
      x = sx != null ? sx : G.snap(p.x, grid);
    }
    if (!opts.lockY) {
      let best = t;
      for (const l of L.ys) { const d = Math.abs(p.y - l.v); if (d < best && p.x > l.lo - t && p.x < l.hi + t) { best = d; sy = l.v; } }
      y = sy != null ? sy : G.snap(p.y, grid);
    }
    return { x: G.round(x, 4), y: G.round(y, 4), sx, sy };
  }

  function orthoFrom(a, p, free) {
    if (free) return p;
    return Math.abs(p.x - a.x) >= Math.abs(p.y - a.y) ? { x: p.x, y: a.y } : { x: a.x, y: p.y };
  }

  /* ---------- Treffer ---------- */

  /* Raumbeschriftung nur, wenn sie in den Raum passt (gewählter Raum immer); gilt für Zeichnen und Anklicken. */
  function roomLabelShown(r) {
    if (A.sel && A.sel.type === 'room' && A.sel.id === r.id) return true;
    const bw = (r.bbox.x1 - r.bbox.x0) * view.k, bh = (r.bbox.y1 - r.bbox.y0) * view.k;
    return bw >= String(BP.calc.roomName(r.name)).length * 7.6 + 6 && bh >= 34;
  }

  function hitTest(w) {
    const q = A.q, g = q.geo, t = tol();
    // Leitungen: Punkte des gewählten Weges, dann Leitungsbänder
    if (A.sel && A.sel.type === 'route') {
      const r = A.p.routes.find((x) => x.id === A.sel.id);
      if (r) for (let i = r.pts.length - 1; i >= 0; i--) { const s = S(r.pts[i]), m = S(w); if (Math.hypot(s.x - m.x, s.y - m.y) < 8) return { type: 'route', id: r.id, pt: i }; }
    }
    for (const rr of q.routes.list) {
      if (!routeOnLevel(rr)) continue;
      for (let i = 1; i < rr.pts.length; i++) {
        const a = rr.pts[i - 1], b = rr.pts[i];
        const d2 = G.dist(a, b) < 1e-3 ? G.dist(w, a) : G.distPointSeg(w, a, b).d;
        if (d2 < Math.max(rr.dims.w / 2, 3 / view.k) + 3 / view.k) return { type: 'route', id: rr.id };
      }
    }
    const L = LG(), src = SRC(), vh = vertsHere();
    // Raumbeschriftungen
    for (const r of L.rooms) {
      if (!r.id || !r.label || !roomLabelShown(r)) continue;
      const s = S(r.label), m = S(w);
      if (Math.abs(s.x - m.x) < 48 && Math.abs(s.y - m.y) < 16) return { type: 'room', id: r.id };
    }
    for (const o of L.openings) {
      if (o.invalid) continue;
      const off = o.outer ? G.mul(o.hl.nrm, -o.t / 2) : { x: 0, y: 0 };
      const c0 = G.add(o.p0, off), u = G.norm(G.sub(o.p1, o.p0));
      const along = G.dot(G.sub(w, c0), u), across = Math.abs(G.cross(u, G.sub(w, c0)));
      if (along > -t * 0.3 && along < o.w + t * 0.3 && across < o.t / 2 + t * 0.6) {
        if (o.access) return { type: 'access', id: o.access };
        if (o.lift) return { type: 'vert', id: o.lift };
        return { type: 'opening', id: o.id };
      }
    }
    if (LV() === 0) for (const a of g.access) if (G.pointInPolygon(w, a.foot)) return { type: 'access', id: a.id };
    for (const c of src.columns || []) if (G.pointInPolygon(w, G.offsetPolygon(colRect(c), t * 0.5))) return { type: 'column', id: c.id };
    for (const v of vh.lifts) if (G.pointInPolygon(w, v.outerPoly)) return { type: 'vert', id: v.id };
    for (const wl of src.walls) {
      if (G.dist(w, wl.a) < t * 1.4) return { type: 'wall', id: wl.id, end: 'a' };
      if (G.dist(w, wl.b) < t * 1.4) return { type: 'wall', id: wl.id, end: 'b' };
    }
    for (const wl of src.walls) if (G.distPointSeg(w, wl.a, wl.b).d < wl.t / 2 + t * 0.6) return { type: 'wall', id: wl.id };
    for (const bu of src.beams || []) {
      if (G.dist(w, bu.a) < t * 1.4) return { type: 'beam', id: bu.id, end: 'a' };
      if (G.dist(w, bu.b) < t * 1.4) return { type: 'beam', id: bu.id, end: 'b' };
      if (G.distPointSeg(w, bu.a, bu.b).d < bu.bw / 2 + t * 0.6) return { type: 'beam', id: bu.id };
    }
    for (const st of vh.stairsDown) if (G.pointInPolygon(w, st.footLower)) return { type: 'vert', id: st.id };
    for (const st of vh.stairsUp) if (G.pointInPolygon(w, st.footUpper)) return { type: 'vert', id: st.id };
    // stützenfreie Bereiche: am Rand oder an der Beschriftung
    for (const z of src.zones || []) {
      const poly = G.polygonFromRect(z.x0, z.y0, z.x1, z.y1);
      let dmin = Infinity;
      for (let i = 0; i < 4; i++) dmin = Math.min(dmin, G.distPointSeg(w, poly[i], poly[(i + 1) % 4]).d);
      const lab = S({ x: z.x0, y: z.y1 }), m = S(w);
      if (dmin < Math.max(t, 0.12) || (m.x > lab.x && m.x < lab.x + 130 && m.y > lab.y && m.y < lab.y + 20)) return { type: 'zone', id: z.id };
    }
    const n = g.out.length;
    for (let i = 0; i < n; i++) {
      const a = g.out[i], b = g.out[(i + 1) % n];
      const r = G.distPointSeg(w, a, b);
      if (r.d < g.tW + t && r.t > 0.02 && r.t < 0.98) {
        const inside = G.pointInPolygon(w, g.out);
        if (inside || r.d < t) return { type: 'edge', index: i };
      }
    }
    return null;
  }

  function nearestHost(w, outerOnly) {
    const g = A.q.geo, t = Math.max(tol(), 0.25);
    let best = null;
    const n = g.out.length;
    for (let i = 0; i < n && LV() === 0; i++) {
      const a = g.out[i], b = g.out[(i + 1) % n], r = G.distPointSeg(w, a, b);
      if (r.d < g.tW + t && (!best || r.d < best.d)) best = { host: 'e:' + i, edge: i, d: r.d, pos: r.t * G.dist(a, b), len: G.dist(a, b) };
    }
    if (!outerOnly) {
      for (const wl of SRC().walls) {
        const r = G.distPointSeg(w, wl.a, wl.b);
        if (r.d < wl.t / 2 + t && (!best || r.d < best.d)) best = { host: 'w:' + wl.id, d: r.d, pos: r.t * G.dist(wl.a, wl.b), len: G.dist(wl.a, wl.b) };
      }
    }
    return best;
  }

  /* ---------- Ereignisse ---------- */

  function evW(e) { const r = svg.getBoundingClientRect(); return Wd(e.clientX - r.left, e.clientY - r.top); }

  function onWheel(e) {
    e.preventDefault();
    const r = svg.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    const before = Wd(sx, sy);
    const f = Math.exp(-e.deltaY * 0.0015);
    view.k = Math.max(6, Math.min(600, view.k * f));
    const after = Wd(sx, sy);
    view.cx += before.x - after.x; view.cy += before.y - after.y;
    P.render();
  }

  let lastDown = { t: 0, x: 0, y: 0 };
  function onDown(e) {
    svg.focus({ preventScroll: true });
    const w = evW(e);
    // eigener Doppelklick: das SVG wird zwischen den Klicks neu gezeichnet
    const now = performance.now();
    const dbl = e.button === 0 && now - lastDown.t < 380 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    if (dbl && A.tool === 'select') { onDbl(e); return; }
    if (e.button === 1 || e.button === 2 || spaceDown) { startPan(e); return; }
    if (e.button !== 0) return;
    const tool = A.tool;
    if (tool === 'wall' || tool === 'unterzug') {
      if (!draft) { const p0 = snapPoint(w); draft = { a: p0, b: p0 }; P.render(); return; }
      const bb = draft.b;
      if (G.dist(draft.a, bb) < 0.1) return;
      const a0 = { x: draft.a.x, y: draft.a.y };
      if (tool === 'unterzug') {
        const id = BP.model.uid('b');
        A.commit((p) => { const L = SRC(p); (L.beams = L.beams || []).push({ id, a: a0, b: { x: bb.x, y: bb.y }, bw: A.ui.beamB || 0.3, hb: A.ui.beamH || 0.5 }); });
        draft = null;
        A.select({ type: 'beam', id });
        return;
      }
      const id = BP.model.uid('w');
      const kind = A.ui.wallKind, t = A.ui.wallT;
      A.commit((p) => SRC(p).walls.push({ id, a: a0, b: { x: bb.x, y: bb.y }, t, kind }));
      draft = null;
      A.select({ type: 'wall', id });
      return;
    }
    if (tool === 'opening') {
      const h = nearestHost(w, false);
      if (!h) { A.toast(LV() ? T_('Auf eine Innenwand dieser Ebene klicken. Außenwände haben nur in Ebene 1 Öffnungen.') : T_('Auf eine Wand klicken, um dort eine Öffnung zu setzen.')); return; }
      const id = BP.model.uid('o');
      const outer = h.host.startsWith('e:');
      const kind = outer ? 'schutztuer' : A.ui.openingKind;
      const wdt = outer ? 1.0 : A.ui.openingW;
      A.commit((p) => SRC(p).openings.push({ id, host: h.host, pos: G.round(G.snap(h.pos, A.ui.snap ? 0.05 : 0), 3), w: wdt, h: kind === 'luke' ? 0.8 : Math.min(2.0, LG().H), sill: 0, kind }));
      A.select({ type: 'opening', id });
      return;
    }
    if (tool === 'treppe' || tool === 'schacht') {
      const h = nearestHost(w, true);
      if (!h) { A.toast(T_('Auf eine Außenwand klicken, um den Zugang anzusetzen.')); return; }
      const id = BP.model.uid('a');
      const acc = tool === 'treppe'
        ? { id, kind: 'treppe', edge: h.edge, pos: G.round(G.snap(h.pos, A.ui.snap ? 0.05 : 0), 3), width: 1.0, tw: 0.25, cover: 'klappe', landing: 1.2 }
        : { id, kind: 'schacht', edge: h.edge, pos: G.round(G.snap(h.pos, A.ui.snap ? 0.05 : 0), 3), width: 0.8, depth: 0.8, tw: 0.25, lw: 0.6, lh: 0.8 };
      A.commit((p) => p.geom.access.push(acc));
      A.setTool('select');
      A.select({ type: 'access', id });
      return;
    }
    if (tool === 'route') {
      const last = currentRouteLast();
      let pt = snapPoint(w);
      if (last && !e.shiftKey) { const o = orthoFrom(last, w, false); pt = snapPoint(o, Math.abs(o.y - last.y) < 1e-9 ? { lockY: true } : { lockX: true }); pt = orthoFrom(last, pt, false); }
      const h = G.round(A.ui.routeH, 3);
      if (!A.ui.drawingRoute) {
        const id = BP.model.uid('l');
        const luft = A.ui.routeType !== 'kabel';
        const n = A.p.routes.filter((x) => x.type === (luft ? 'luft' : 'kabel')).length + 1;
        A.commit((p) => p.routes.push({ id, type: luft ? 'luft' : 'kabel', kind: luft ? 'zuluft' : 'strom', name: T_(luft ? 'Lüftungsweg {n}' : 'Kabelweg {n}', { n }), shape: luft ? 'rund' : 'rechteck',
          d: 0.125, w: luft ? 0.2 : 0.1, hgt: luft ? 0.1 : 0.06, ins: 0, clr: luft ? 0.05 : 0.03, airflow: null, reserve: 15, cable: '', pts: [{ x: pt.x, y: pt.y, h }] }));
        A.ui.drawingRoute = id;
        A.sel = { type: 'route', id };
        A.render();
        return;
      }
      if (last && Math.abs(last.x - pt.x) < 1e-6 && Math.abs(last.y - pt.y) < 1e-6 && Math.abs(last.h - h) < 1e-6) return;
      A.commit((p) => { const r = p.routes.find((x) => x.id === A.ui.drawingRoute); if (r) r.pts.push({ x: pt.x, y: pt.y, h }); });
      return;
    }
    if (tool === 'room') {
      const L = LG(), ci = L.gridAll ? G.compAt(L.gridAll, w) : -1;
      if (ci < 0) { A.toast(T_('In einen Raum klicken.')); return; }
      const room = L.rooms.find((r) => r.comp === ci);
      const existing = room && room.id ? SRC().rooms.find((r) => r.id === room.id) : null;
      openNameEditor(existing || w, existing);
      return;
    }
    if (tool === 'stuetze') {
      const pt = snapPoint(w), g = A.q.geo;
      if (!g.valid || !G.pointInPolygon(pt, g.inner)) { A.toast(T_('Stützen innerhalb des Innenraums setzen.')); return; }
      const id = BP.model.uid('c'), b = A.ui.colB || 0.3;
      A.commit((p) => SRC(p).columns.push({ id, x: pt.x, y: pt.y, bx: b, by: b }));
      A.sel = { type: 'column', id };
      A.render();
      return;
    }
    if (tool === 'zone') {
      const p0 = snapPoint(w);
      drag = { mode: 'zoneDraw', a: p0, b: p0, pointerId: e.pointerId };
      svg.setPointerCapture(e.pointerId);
      P.render();
      return;
    }
    if (tool === 'itreppe' || tool === 'aufzug') {
      const pt = snapPoint(w), g = A.q.geo, nL = g.L.length;
      if (!g.valid || !G.pointInPolygon(pt, g.inner)) { A.toast(T_('Innerhalb des Innenraums setzen.')); return; }
      const id = BP.model.uid('v'), dir = A.ui.vertDir || 0;
      if (tool === 'itreppe' && LV() >= nL - 1) { A.toast(T_('Eine Innentreppe führt von dieser Ebene nach unten. Zuerst eine Ebene darunter anlegen.')); return; }
      const v = tool === 'itreppe'
        ? { id, kind: 'treppe', x: pt.x, y: pt.y, dir, w: 1.0, upper: LV(), landing: 1.0 }
        : { id, kind: 'aufzug', x: pt.x, y: pt.y, dir, type: 'lasten', payload: 1000, w: 1.1, d: 2.1, door: 1.0, drive: 'seil', speed: 0.5, top: nL === 1 ? -1 : Math.min(LV(), nL - 2), bottom: nL - 1, tw: 0.25 };
      A.commit((p) => { p.geom.verts = p.geom.verts || []; p.geom.verts.push(v); });
      A.setTool('select');
      A.select({ type: 'vert', id });
      return;
    }
    // Auswahl / Ziehen
    const hit = hitTest(w);
    if (!hit) { if (A.sel) A.select(null); startPan(e); return; }
    A.select(hit.type === 'edge' ? { type: 'edge', index: hit.index } : { type: hit.type, id: hit.id });
    if (hit.type === 'route' && hit.pt == null) return; // Leitung als Ganzes nicht verschieben
    startDrag(e, hit, w);
  }

  function startPan(e) {
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, cx: view.cx, cy: view.cy };
    svg.classList.add('panning');
    svg.setPointerCapture(e.pointerId);
  }

  function startDrag(e, hit, w) {
    const p = A.p;
    drag = { mode: hit.type, hit, start: w, moved: false, pointerId: e.pointerId };
    if (hit.type === 'edge') {
      const g = A.q.geo, i = hit.index, n = g.out.length;
      const a = g.out[i], b = g.out[(i + 1) % n];
      drag.normal = G.edgeNormal(a, b);
      drag.orig = p.geom.outline.map((q) => ({ ...q }));
      drag.idx = [i, (i + 1) % n];
      // Innenwand-Enden, die an dieser Innenfläche anliegen, mitführen
      const ia = g.inner[i], ib = g.inner[(i + 1) % n];
      drag.followers = [];
      for (let li = 0; li < A.nLevels(); li++) for (const wl of A.levelSrc(p, li).walls) for (const end of ['a', 'b']) {
        if (G.distPointSeg(wl[end], ia, ib).d < 0.02) drag.followers.push({ li, id: wl.id, end, orig: { ...wl[end] } });
      }
      const j = (i + 1) % n;
      drag.next = { j, u: G.norm(G.sub(g.out[(j + 1) % n], g.out[j])), ops: p.geom.openings.filter((o) => o.host === 'e:' + j).map((o) => ({ id: o.id, pos: o.pos })), acc: p.geom.access.filter((a) => a.edge === j).map((a) => ({ id: a.id, pos: a.pos })) };
    } else if (hit.type === 'wall' || hit.type === 'beam') {
      const wl = (hit.type === 'beam' ? SRC(p).beams : SRC(p).walls).find((x) => x.id === hit.id);
      drag.wallId = hit.id;
      drag.orig = { a: { ...wl.a }, b: { ...wl.b } };
    } else if (hit.type === 'room') {
      const r = SRC(p).rooms.find((x) => x.id === hit.id);
      drag.orig = { x: r.x, y: r.y };
    } else if (hit.type === 'column') {
      const c = SRC(p).columns.find((x) => x.id === hit.id);
      drag.orig = { x: c.x, y: c.y };
    } else if (hit.type === 'zone') {
      const z = SRC(p).zones.find((x) => x.id === hit.id);
      drag.orig = { x0: z.x0, y0: z.y0, x1: z.x1, y1: z.y1 };
    } else if (hit.type === 'vert') {
      const v = (p.geom.verts || []).find((x) => x.id === hit.id);
      drag.orig = { x: v.x, y: v.y };
    }
    svg.setPointerCapture(e.pointerId);
  }

  function currentRouteLast() {
    if (!A.ui.drawingRoute) return null;
    const r = A.p.routes.find((x) => x.id === A.ui.drawingRoute);
    return r && r.pts.length ? r.pts[r.pts.length - 1] : null;
  }

  function onMove(e) {
    const w = evW(e);
    if (drag && drag.mode === 'pan') {
      view.cx = drag.cx - (e.clientX - drag.sx) / view.k;
      view.cy = drag.cy + (e.clientY - drag.sy) / view.k;
      P.render();
      return;
    }
    if (drag && drag.mode === 'zoneDraw') { drag.b = snapPoint(w); P.render(); return; }
    if (drag) { doDrag(e, w); return; }
    if (A.tool === 'wall' || A.tool === 'unterzug') {
      if (draft) {
        const o = orthoFrom(draft.a, w, e.shiftKey);
        const lock = e.shiftKey ? {} : (Math.abs(o.y - draft.a.y) < 1e-9 ? { lockY: true } : { lockX: true });
        const s = snapPoint(o, lock);
        draft.b = e.shiftKey ? s : orthoFrom(draft.a, s, false);
      } else draft = null;
      hover = { type: 'cursor', p: snapPoint(w) };
      P.render();
      return;
    }
    if (A.tool === 'route') {
      const last = currentRouteLast();
      let pt = snapPoint(w);
      if (last && !e.shiftKey) { const o = orthoFrom(last, w, false); pt = snapPoint(o, Math.abs(o.y - last.y) < 1e-9 ? { lockY: true } : { lockX: true }); pt = orthoFrom(last, pt, false); }
      hover = { type: 'cursor', p: pt };
      P.render();
      return;
    }
    if (A.tool === 'opening' || A.tool === 'treppe' || A.tool === 'schacht') {
      hover = { type: 'host', h: nearestHost(w, A.tool !== 'opening') };
      P.render();
      return;
    }
    if (A.tool === 'stuetze' || A.tool === 'zone' || A.tool === 'itreppe' || A.tool === 'aufzug') {
      hover = { type: 'cursor', p: snapPoint(w) };
      P.render();
      return;
    }
    if (A.step === 'statik' && A.ui.feView && A.tool === 'select') {
      const v = P.feValueAt(w);
      hintEl.textContent = v || hint();
    }
    const h = A.tool === 'select' ? hitTest(w) : null;
    const key = h ? h.type + (h.id || h.index) + (h.end || '') : '';
    const old = hover ? hover.type + (hover.id || hover.index) + (hover.end || '') : '';
    hover = h;
    svg.style.cursor = h ? (h.type === 'edge' ? (Math.abs(A.q.geo.out[h.index].x - A.q.geo.out[(h.index + 1) % A.q.geo.out.length].x) < 1e-6 ? 'ew-resize' : 'ns-resize') : 'move') : (A.tool === 'room' ? 'cell' : 'default');
    if (key !== old) P.render();
  }

  function doDrag(e, w) {
    const d = G.sub(w, drag.start);
    if (!drag.moved && Math.hypot(d.x, d.y) * view.k < 3) return;
    if (!drag.moved) { drag.moved = true; A.beginLive(); }
    const p = A.p, grid = A.ui.snap ? 0.05 : 0.001;
    const hit = drag.hit;
    if (hit.type === 'edge') {
      const delta = G.snap(G.dot(d, drag.normal), grid);
      const [i0, i1] = drag.idx, n = drag.orig.length, mv = G.mul(drag.normal, delta);
      const cand = drag.orig.map((q, ix) => (ix === i0 || ix === i1 ? G.add(q, mv) : q));
      const keeps = (a, b) => G.dot(G.sub(cand[b], cand[a]), G.norm(G.sub(drag.orig[b], drag.orig[a]))) > 2 * A.p.build.tWall + 0.3;
      if (!keeps((i0 - 1 + n) % n, i0) || !keeps(i1, (i1 + 1) % n)) return;
      const shift = G.dot(mv, drag.next.u);
      A.live((pp) => {
        for (const o of drag.next.ops) { const x = pp.geom.openings.find((z) => z.id === o.id); if (x) x.pos = G.round(o.pos - shift, 4); }
        for (const a of drag.next.acc) { const x = pp.geom.access.find((z) => z.id === a.id); if (x) x.pos = G.round(a.pos - shift, 4); }
        drag.idx.forEach((ix) => { pp.geom.outline[ix] = { x: G.round(drag.orig[ix].x + drag.normal.x * delta, 4), y: G.round(drag.orig[ix].y + drag.normal.y * delta, 4) }; });
        for (const f of drag.followers) {
          const wl = A.levelSrc(pp, f.li).walls.find((x) => x.id === f.id);
          if (wl) wl[f.end] = { x: G.round(f.orig.x + drag.normal.x * delta, 4), y: G.round(f.orig.y + drag.normal.y * delta, 4) };
        }
      });
    } else if (hit.type === 'wall' || hit.type === 'beam') {
      const listOf = (pp) => (hit.type === 'beam' ? SRC(pp).beams : SRC(pp).walls);
      const wl = listOf(p).find((x) => x.id === hit.id);
      if (!wl) return;
      if (hit.end) {
        const other = hit.end === 'a' ? drag.orig.b : drag.orig.a;
        const horiz = Math.abs(drag.orig.a.y - drag.orig.b.y) < 1e-6, vert = Math.abs(drag.orig.a.x - drag.orig.b.x) < 1e-6;
        let q = w;
        if (!e.shiftKey && (horiz || vert)) q = horiz ? { x: w.x, y: other.y } : { x: other.x, y: w.y };
        const s = snapPoint(q, !e.shiftKey && horiz ? { lockY: true } : !e.shiftKey && vert ? { lockX: true } : {});
        if (G.dist(s, other) < 0.1) return; // Wand mit Länge 0 verhindern
        A.live((pp) => { const x = listOf(pp).find((z) => z.id === hit.id); x[hit.end] = { x: s.x, y: s.y }; });
      } else {
        const u = G.norm(G.sub(drag.orig.b, drag.orig.a)), n = { x: -u.y, y: u.x };
        let delta = G.dot(d, n);
        // auf Raster / Fanglinien
        const movedA = G.add(drag.orig.a, G.mul(n, delta));
        const s = snapPoint(movedA, Math.abs(n.x) > 0.5 ? { lockY: true } : { lockX: true });
        delta = Math.abs(n.x) > 0.5 ? (s.x - drag.orig.a.x) / n.x : (s.y - drag.orig.a.y) / n.y;
        A.live((pp) => {
          const x = listOf(pp).find((z) => z.id === hit.id);
          x.a = { x: G.round(drag.orig.a.x + n.x * delta, 4), y: G.round(drag.orig.a.y + n.y * delta, 4) };
          x.b = { x: G.round(drag.orig.b.x + n.x * delta, 4), y: G.round(drag.orig.b.y + n.y * delta, 4) };
        });
      }
    } else if (hit.type === 'opening') {
      const o = LG().openings.find((x) => x.id === hit.id);
      if (!o || !o.hl) return;
      const r = G.distPointSeg(w, o.hl.a, o.hl.b);
      const pos = G.round(G.snap(r.t * o.hl.len, grid), 4);
      A.live((pp) => { const x = SRC(pp).openings.find((z) => z.id === hit.id); x.pos = pos; });
    } else if (hit.type === 'access') {
      const acc = p.geom.access.find((x) => x.id === hit.id);
      const g = A.q.geo, n = g.out.length;
      // Kante wechseln, wenn nahe einer anderen Außenkante
      const hh = nearestHost(w, true);
      const edge = hh && hh.d < 1.0 ? hh.edge : acc.edge;
      const a = g.out[edge], b = g.out[(edge + 1) % n];
      const r = G.distPointSeg(w, a, b);
      const pos = G.round(G.snap(r.t * G.dist(a, b), grid), 4);
      A.live((pp) => { const x = pp.geom.access.find((z) => z.id === hit.id); x.edge = edge; x.pos = pos; });
    } else if (hit.type === 'route') {
      if (hit.pt == null) return;
      const s = snapPoint(w);
      A.live((pp) => { const r = pp.routes.find((z) => z.id === hit.id); if (r && r.pts[hit.pt]) { r.pts[hit.pt].x = s.x; r.pts[hit.pt].y = s.y; } });
    } else if (hit.type === 'room') {
      A.live((pp) => { const x = SRC(pp).rooms.find((z) => z.id === hit.id); x.x = G.round(drag.orig.x + d.x, 3); x.y = G.round(drag.orig.y + d.y, 3); });
    } else if (hit.type === 'column' || hit.type === 'vert') {
      const s2 = snapPoint({ x: drag.orig.x + d.x, y: drag.orig.y + d.y });
      A.live((pp) => {
        const x = hit.type === 'column' ? SRC(pp).columns.find((z) => z.id === hit.id) : pp.geom.verts.find((z) => z.id === hit.id);
        if (x) { x.x = s2.x; x.y = s2.y; }
      });
    } else if (hit.type === 'zone') {
      const o = drag.orig, s2 = snapPoint({ x: o.x0 + d.x, y: o.y0 + d.y });
      const dx = s2.x - o.x0, dy = s2.y - o.y0;
      A.live((pp) => { const z = SRC(pp).zones.find((q) => q.id === hit.id); if (z) Object.assign(z, { x0: G.round(o.x0 + dx, 4), y0: G.round(o.y0 + dy, 4), x1: G.round(o.x1 + dx, 4), y1: G.round(o.y1 + dy, 4) }); });
    }
  }

  function onUp(e) {
    if (!drag) return;
    const was = drag;
    drag = null;
    svg.classList.remove('panning');
    try { svg.releasePointerCapture(e.pointerId); } catch (err) { /* bereits freigegeben */ }
    if (was.mode === 'zoneDraw') {
      const x0 = Math.min(was.a.x, was.b.x), x1 = Math.max(was.a.x, was.b.x), y0 = Math.min(was.a.y, was.b.y), y1 = Math.max(was.a.y, was.b.y);
      if (x1 - x0 < 0.5 || y1 - y0 < 0.5) { A.toast(T_('Bereich aufziehen: mindestens 0,5 × 0,5 m.')); P.render(); return; }
      const id = BP.model.uid('z');
      A.commit((p) => SRC(p).zones.push({ id, x0, y0, x1, y1, name: '' }));
      A.setTool('select');
      A.select({ type: 'zone', id });
      return;
    }
    if (was.mode !== 'pan' && was.moved) A.endLive();
    else P.render();
  }

  function onDbl(e) {
    if (A.tool !== 'select') return;
    const w = evW(e);
    const hit = hitTest(w);
    if (hit && hit.type === 'room') { const r = SRC().rooms.find((x) => x.id === hit.id); openNameEditor(r, r); return; }
    const L = LG(), ci = L.gridAll ? G.compAt(L.gridAll, w) : -1;
    if (ci >= 0) {
      const room = L.rooms.find((r) => r.comp === ci);
      if (room && room.shaft) return;
      const existing = room && room.id ? SRC().rooms.find((r) => r.id === room.id) : null;
      openNameEditor(existing || w, existing);
    }
  }

  function openNameEditor(at, existing) {
    const s = S(at);
    editorEl.hidden = false;
    editorEl.style.left = Math.max(8, Math.min(view.W - 290, s.x - 100)) + 'px';
    editorEl.style.top = Math.max(8, s.y - 20) + 'px';
    editorEl.innerHTML = '<input placeholder="' + esc(T_('Raumname, z. B. Lager')) + '" value="' + esc(existing ? existing.name : '') + '"><button class="btn small">' + T_('Übernehmen') + '</button>';
    const inp = editorEl.querySelector('input');
    const done = (ok) => {
      if (editorEl.hidden) return;
      editorEl.hidden = true;
      const name = inp.value.trim();
      if (!ok || !name) return;
      if (existing) A.commit((p) => { SRC(p).rooms.find((r) => r.id === existing.id).name = name; });
      else {
        const id = BP.model.uid('r');
        A.commit((p) => SRC(p).rooms.push({ id, name, x: G.round(at.x, 3), y: G.round(at.y, 3) }));
      }
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); e.stopPropagation(); });
    editorEl.querySelector('button').onclick = () => done(true);
    inp.addEventListener('blur', () => setTimeout(() => done(true), 120));
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
  }

  P.cancel = function () { draft = null; editorEl.hidden = true; P.render(); };
  /* Für Bericht und Export: Mauszeiger-Vorschau, angefangene Wand und Namenseditor verwerfen. */
  P.clearTransient = function () { hover = null; draft = null; if (editorEl) editorEl.hidden = true; };

  /* ---------- Zeichnen ---------- */

  P.render = function () {
    if (!svg || !A.q || !svg.clientWidth) return;
    measure();
    const q = A.q, g = q.geo, p = A.p, o = [];
    const sel = A.sel || {};
    o.push(defs());
    o.push(grid());
    // Baugrube
    o.push('<polygon points="' + pts(q.earth.top) + '" fill="none" stroke="#b79d7a" stroke-dasharray="6 5" stroke-width="1"/>');
    o.push('<polygon points="' + pts(q.earth.bottom) + '" fill="none" stroke="#b79d7a" stroke-dasharray="2 4" stroke-width="1"/>');
    // Erdhügel: Krone und Böschungsfuß
    if (q.earth.toePoly) {
      o.push('<polygon points="' + pts(q.earth.toePoly) + '" fill="#8c9763" fill-opacity=".08" stroke="#5f6b3a" stroke-dasharray="9 5" stroke-width="1.2"/>');
      o.push('<polygon points="' + pts(q.earth.crestPoly) + '" fill="none" stroke="#5f6b3a" stroke-width="1"/>');
    }
    // Dämmung
    if (q.env.ins.walls > 0) o.push('<path d="' + pathOf(q.env.ins.outIns) + pathOf(g.out.slice().reverse()) + '" fill="#f1dfb0" stroke="#c8a85a" stroke-width=".8" fill-rule="evenodd"/>');
    if (p.build.overhang > 0) o.push('<polygon points="' + pts(g.slab) + '" fill="none" stroke="#7d8682" stroke-dasharray="4 3"/>');
    // Zugänge (Beschriftungen zuletzt, damit Maßketten sie nicht verdecken); nur auf der obersten Ebene
    const accLabels = [], L = LG(), vh = vertsHere(), multi = g.L.length > 1;
    if (LV() === 0) for (const a of g.access) o.push(drawAccess(a, sel.type === 'access' && sel.id === a.id, hover && hover.type === 'access' && hover.id === a.id, accLabels));
    // Außenwände
    o.push('<path d="' + pathOf(g.out) + (g.valid ? pathOf(g.inner.slice().reverse()) : '') + '" fill="url(#hc)" stroke="#1d2220" stroke-width="1.2" fill-rule="evenodd"/>');
    if (g.valid) o.push('<polygon points="' + pts(g.inner) + '" fill="#fff" stroke="none"/>');
    // FE-Ergebnis als Farbfläche, sonst maßgebendes Feld des Tafelverfahrens
    const feo = A.step === 'statik' ? feOverlay() : null;
    if (feo) o.push(feo.body);
    else if (A.step === 'statik' && q.struct.roof && q.struct.roof.field && LV() === 0) {
      const f = q.struct.roof.field.rect;
      const r = G.polygonFromRect(f.x0, f.y0, f.x1, f.y1);
      o.push('<polygon points="' + pts(r) + '" fill="rgba(242,183,5,.18)" stroke="#d29c00" stroke-dasharray="5 4"/>');
    }
    // Stützenfreie Bereiche
    for (const z of SRC().zones || []) o.push(drawZone(z, sel.type === 'zone' && sel.id === z.id, hover && hover.type === 'zone' && hover.id === z.id));
    // Einbauten und Vorräte (Aufstellfläche, Lasten auf der Platte) in den Schritten Technik und Tragwerk
    if (A.step === 'technik' || A.step === 'statik') for (const e of (q.tech.equip || []).filter((x) => x.level === LV())) {
      const a = S({ x: e.rect.x0, y: e.rect.y1 }), b = S({ x: e.rect.x1, y: e.rect.y0 }), w = b.x - a.x, hh = b.y - a.y;
      o.push('<g class="equip"><title>' + esc(e.name + ': ' + fmt(e.gk + e.ek, 1) + ' kN/m²') + '</title><rect x="' + a.x + '" y="' + a.y + '" width="' + w + '" height="' + hh + '" fill="rgba(47,120,168,.10)" stroke="' + (e.fits ? '#2f78a8' : '#b26a00') + '" stroke-dasharray="4 3"/>' +
        (w > 34 && hh > 12 && !L.rooms.some((r) => r.label && roomLabelShown(r) && Math.abs(S(r.label).x - (a.x + w / 2)) < w / 2 + 30 && Math.abs(S(r.label).y - (a.y + hh / 2)) < hh / 2 + 16) ? '<text x="' + (a.x + w / 2) + '" y="' + (a.y + hh / 2 + 4) + '" text-anchor="middle" font-size="10.5" fill="#2f78a8">' + esc(e.name.split(' ')[0].slice(0, Math.max(3, Math.floor(w / 6.5)))) + '</text>' : '') + '</g>');
    }
    // Tragende Wände und Stützen der Ebene darüber (Lastweg)
    if (LV() > 0) o.push(drawGhost(g.L[LV() - 1]));
    // Innentreppen: Lauf auf der unteren Ebene, Treppenauge und Austritt auf der oberen
    for (const st of vh.stairsDown) o.push(drawStair(st, 'lower', sel.type === 'vert' && sel.id === st.id));
    for (const st of vh.stairsUp) o.push(drawStair(st, 'upper', sel.type === 'vert' && sel.id === st.id));
    // Räume
    for (const r of L.rooms) {
      if (!r.label) continue;
      const s = S(r.label), on = sel.type === 'room' && sel.id === r.id;
      if (!roomLabelShown(r)) continue;
      o.push('<g class="room"><text x="' + s.x + '" y="' + (s.y - 3) + '" text-anchor="middle" font-size="13.5" font-weight="650" fill="' + (on ? '#8a6500' : '#1d2220') + '">' + esc(BP.calc.roomName(r.name)) + '</text>' +
        '<text x="' + s.x + '" y="' + (s.y + 13) + '" text-anchor="middle" font-size="12" fill="#57605b">' + fmt(r.area) + ' m²</text></g>');
    }
    // Innenwände (Schachtwände der Aufzüge gehören zum Aufzug)
    for (const wl of L.walls) {
      const on = (sel.type === 'wall' && sel.id === wl.id) || (wl.auto && sel.type === 'vert' && sel.id === wl.auto), hv = hover && ((hover.type === 'wall' && hover.id === wl.id) || (wl.auto && hover.type === 'vert' && hover.id === wl.auto));
      const fill = wl.kind === 'stb' ? 'url(#hc)' : wl.kind === 'mw' ? 'url(#hm)' : '#e4e7e5';
      for (const s of wl.segs.length ? wl.segs : [{ a: wl.a, b: wl.b }]) {
        const u = G.norm(G.sub(s.b, s.a)), n = { x: -u.y * wl.t / 2, y: u.x * wl.t / 2 };
        const poly = [G.add(s.a, n), G.add(s.b, n), G.sub(s.b, n), G.sub(s.a, n)];
        o.push('<polygon points="' + pts(poly) + '" fill="' + fill + '" stroke="' + (on ? '#f2b705' : hv ? '#d29c00' : '#1d2220') + '" stroke-width="' + (on ? 3 : 1) + '"/>');
      }
      if (!wl.segs.length) o.push('<line x1="' + S(wl.a).x + '" y1="' + S(wl.a).y + '" x2="' + S(wl.b).x + '" y2="' + S(wl.b).y + '" stroke="#b3261e" stroke-dasharray="4 3"/>');
      if (!wl.auto && (on || (A.tool === 'select' && hv))) for (const end of ['a', 'b']) {
        const s = S(wl[end]);
        o.push('<circle cx="' + s.x + '" cy="' + s.y + '" r="5" fill="#fff" stroke="' + (on ? '#f2b705' : '#57605b') + '" stroke-width="2"/>');
      }
    }
    // Unterzüge (über der Schnittebene: gestrichelt)
    for (const bu of L.beams || []) o.push(drawBeam(bu, sel.type === 'beam' && sel.id === bu.id, hover && hover.type === 'beam' && hover.id === bu.id));
    // Stützen und Aufzüge
    for (const c of L.columns) o.push(drawColumn(c, sel.type === 'column' && sel.id === c.id, hover && hover.type === 'column' && hover.id === c.id));
    for (const v of vh.lifts) o.push(drawLift(v, sel.type === 'vert' && sel.id === v.id));
    // Öffnungen
    for (const op of L.openings) if (!op.invalid) o.push(drawOpening(op, (sel.type === 'opening' && sel.id === op.id) || (op.access && sel.type === 'access' && sel.id === op.access) || (op.lift && sel.type === 'vert' && sel.id === op.lift)));
    o.push(drawRoutes(sel));
    // Kante gewählt / Hover
    const edgeSel = sel.type === 'edge' ? sel.index : hover && hover.type === 'edge' ? hover.index : null;
    if (edgeSel != null && g.out[edgeSel]) {
      const a = S(g.out[edgeSel]), b = S(g.out[(edgeSel + 1) % g.out.length]);
      o.push('<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="#f2b705" stroke-width="' + (sel.type === 'edge' ? 5 : 3) + '" stroke-linecap="round"/>');
    }
    o.push(dims());
    o.push(...accLabels);
    if (feo) o.push(feo.top);
    // Werkzeug-Vorschau
    if (A.tool === 'wall' || A.tool === 'unterzug') {
      if (draft) {
        const u = G.norm(G.sub(draft.b, draft.a)), t = A.tool === 'unterzug' ? (A.ui.beamB || 0.3) : A.ui.wallT, n = { x: -u.y * t / 2, y: u.x * t / 2 };
        if (G.dist(draft.a, draft.b) > 0.01) {
          const poly = [G.add(draft.a, n), G.add(draft.b, n), G.sub(draft.b, n), G.sub(draft.a, n)];
          o.push('<polygon points="' + pts(poly) + '" fill="rgba(242,183,5,.45)" stroke="#d29c00"/>');
          const m = S(G.lerp(draft.a, draft.b, 0.5));
          o.push(label(m.x, m.y - 14, fmt(G.dist(draft.a, draft.b)) + ' m', true));
        }
      }
      if (hover && hover.p) {
        const s = S(hover.p);
        o.push('<g stroke="#d29c00" stroke-width="1"><line x1="' + (s.x - 9) + '" y1="' + s.y + '" x2="' + (s.x + 9) + '" y2="' + s.y + '"/><line x1="' + s.x + '" y1="' + (s.y - 9) + '" x2="' + s.x + '" y2="' + (s.y + 9) + '"/></g>');
      }
    }
    if (A.tool === 'stuetze' && hover && hover.p) {
      const b = A.ui.colB || 0.3;
      o.push('<polygon points="' + pts(colRect({ x: hover.p.x, y: hover.p.y, bx: b, by: b })) + '" fill="rgba(242,183,5,.5)" stroke="#d29c00"/>');
    }
    if (drag && drag.mode === 'zoneDraw') {
      const r = G.polygonFromRect(Math.min(drag.a.x, drag.b.x), Math.min(drag.a.y, drag.b.y), Math.max(drag.a.x, drag.b.x), Math.max(drag.a.y, drag.b.y));
      o.push('<polygon points="' + pts(r) + '" fill="rgba(242,183,5,.15)" stroke="#d29c00" stroke-dasharray="6 4" stroke-width="1.5"/>');
      const m = S(G.lerp(drag.a, drag.b, 0.5));
      o.push(label(m.x, m.y, fmt(Math.abs(drag.b.x - drag.a.x)) + ' × ' + fmt(Math.abs(drag.b.y - drag.a.y)) + ' m', true));
    } else if (A.tool === 'zone' && hover && hover.p) {
      const s2 = S(hover.p);
      o.push('<g stroke="#d29c00" stroke-width="1"><line x1="' + (s2.x - 9) + '" y1="' + s2.y + '" x2="' + (s2.x + 9) + '" y2="' + s2.y + '"/><line x1="' + s2.x + '" y1="' + (s2.y - 9) + '" x2="' + s2.x + '" y2="' + (s2.y + 9) + '"/></g>');
    }
    if ((A.tool === 'itreppe' || A.tool === 'aufzug') && hover && hover.p) o.push(drawVertPreview(hover.p));
    if (multi) o.push(levelBadge());
    if ((A.tool === 'opening' || A.tool === 'treppe' || A.tool === 'schacht') && hover && hover.h) {
      const h = hover.h;
      const hl = h.host.startsWith('e:') ? { a: g.out[h.edge], b: g.out[(h.edge + 1) % g.out.length] } : (() => { const wl = SRC(p).walls.find((x) => 'w:' + x.id === h.host); return { a: wl.a, b: wl.b }; })();
      const u = G.norm(G.sub(hl.b, hl.a));
      const wdt = A.tool === 'opening' ? (h.host.startsWith('e:') ? 1.0 : A.ui.openingW) : A.tool === 'treppe' ? 1.5 : 1.3;
      const c = G.add(hl.a, G.mul(u, h.pos));
      const a0 = S(G.add(c, G.mul(u, -wdt / 2))), a1 = S(G.add(c, G.mul(u, wdt / 2)));
      o.push('<line x1="' + a0.x + '" y1="' + a0.y + '" x2="' + a1.x + '" y2="' + a1.y + '" stroke="#f2b705" stroke-width="8" stroke-linecap="butt" opacity=".9"/>');
    }
    o.push(scaleBar());
    svg.innerHTML = o.join('');
    svg.classList.toggle('tool-draw', A.tool !== 'select');
    svg.style.cursor = A.tool === 'select' ? svg.style.cursor : A.tool === 'room' ? 'cell' : 'crosshair';
    hintEl.textContent = hint();
  };

  /* ---------- FE-Ergebnisse als Farbfläche ---------- */
  const FEQTY = {
    mx: { name: N_('Biegemoment mx'), unit: 'kNm/m', div: true, note: N_('rot: Zug unten, blau: Zug oben') },
    my: { name: N_('Biegemoment my'), unit: 'kNm/m', div: true, note: N_('rot: Zug unten, blau: Zug oben') },
    mxy: { name: N_('Drillmoment |mxy|'), unit: 'kNm/m' },
    abx: { name: N_('Bewehrung unten x, erforderlich'), unit: 'cm²/m', as: 'bx' },
    aby: { name: N_('Bewehrung unten y, erforderlich'), unit: 'cm²/m', as: 'by' },
    atx: { name: N_('Bewehrung oben x, erforderlich'), unit: 'cm²/m', as: 'tx' },
    aty: { name: N_('Bewehrung oben y, erforderlich'), unit: 'cm²/m', as: 'ty' },
    v: { name: N_('Querkraft-Ausnutzung vEd/vRd,c'), unit: '', elem: true },
    p: { name: N_('Bodenpressung (Bemessung)'), unit: 'kN/m²', floor: true },
    w: { name: N_('Durchbiegung elastisch, quasi-ständig'), unit: 'mm' },
  };
  P.FEQTY = FEQTY;
  const lerpC = (c0, c1, t) => { const a = parseInt(c0.slice(1), 16), b = parseInt(c1.slice(1), 16); const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')'; };
  const SEQ = ['#f0efec', '#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'];
  const RED = ['#f0efec', '#f6cfc9', '#ec9a90', '#e34948', '#b3261e', '#7a1712'];
  const ramp = (stops, t) => { t = Math.max(0, Math.min(1, t)) * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(t)); return lerpC(stops[i], stops[i + 1], t - i); };
  function feData() {
    const v = A.ui.feView;
    if (!v) return null;
    const pl = P.slabOf(v.slab);
    if (!pl || pl.method !== 'FE') return null;
    const res = pl.fe, def = FEQTY[v.qty] || FEQTY.mx, m = res.mesh, n = m.nNodes;
    let node = null, elem = null;
    if (v.qty === 'mx' || v.qty === 'my') { const hi = res.raw[v.qty + 'Max'], lo = res.raw[v.qty + 'Min']; node = new Float64Array(n); for (let k = 0; k < n; k++) node[k] = Math.abs(hi[k]) >= Math.abs(lo[k]) ? hi[k] : lo[k]; }
    else if (v.qty === 'mxy') node = res.raw.mxyAbs;
    else if (def.as) node = pl.nodeAs[def.as];
    else if (v.qty === 'v') elem = pl.elemEta;
    else if (v.qty === 'p') node = res.soil ? res.soil.p : null;
    else if (v.qty === 'w') { node = new Float64Array(n); if (res.wqp) for (let k = 0; k < n; k++) node[k] = res.wqp[k] * 1000; }
    if (!node && !elem) return null;
    const ne = m.elemIJ.length / 2, ev = new Float64Array(ne);
    for (let i = 0; i < ne; i++) {
      if (elem) { ev[i] = elem[i]; continue; }
      let sm = 0, c = 0;
      for (let j = 0; j < 4; j++) { const val = node[m.elemN[4 * i + j]]; if (isFinite(val)) { sm += val; c++; } }
      ev[i] = c ? sm / c : NaN;
      if (res.inSup && [0, 1, 2, 3].every((j) => res.inSup[m.elemN[4 * i + j]]) && def.as) ev[i] = NaN; // in der Wand keine Bemessung
    }
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < ne; i++) if (isFinite(ev[i])) { lo = Math.min(lo, ev[i]); hi = Math.max(hi, ev[i]); }
    if (!isFinite(lo)) { lo = 0; hi = 0; }
    // Momente, Bewehrung und Ausnutzung ab null; Pressung, Durchbiegung und Drillmoment über ihren Wertebereich
    const span = def.div || def.as || v.qty === 'v' ? null : [lo, hi > lo ? hi : lo + 1e-9];
    if (!span) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
    return { pl, res, def, ev, lo, hi, span, m, slab: v.slab, qty: v.qty };
  }
  function feColor(d, val) {
    if (!isFinite(val)) return null;
    if (d.def.div) { const a = Math.max(Math.abs(d.lo), Math.abs(d.hi)) || 1; return val >= 0 ? ramp(RED, val / a) : ramp(SEQ, -val / a); }
    if (d.qty === 'v') return val > 1 ? '#b3261e' : ramp(SEQ, val);
    if (d.span) return ramp(SEQ, (val - d.span[0]) / (d.span[1] - d.span[0]));
    return ramp(SEQ, d.hi > 0 ? val / d.hi : 0);
  }
  function feOverlay() {
    const d = feData();
    if (!d) return null;
    const m = d.m, xs = m.xs, ys = m.ys, ne = d.ev.length, o = [];
    for (let i = 0; i < ne; i++) {
      const c = feColor(d, d.ev[i]);
      if (!c) continue;
      const I = m.elemIJ[2 * i], J = m.elemIJ[2 * i + 1];
      const a = S({ x: xs[I], y: ys[J + 1] }), b = S({ x: xs[I + 1], y: ys[J] });
      o.push('<rect x="' + a.x.toFixed(1) + '" y="' + a.y.toFixed(1) + '" width="' + (b.x - a.x + 0.6).toFixed(1) + '" height="' + (b.y - a.y + 0.6).toFixed(1) + '" fill="' + c + '"/>');
    }
    const body = '<g class="fe-map" opacity=".92">' + o.join('') + '</g>';
    // Zulagen der gezeigten Lage
    const z = [];
    const face = d.def.as ? (d.def.as[0] === 'b' ? 'unten' : 'oben') : null, dir = d.def.as ? d.def.as[1] : null;
    (d.pl.zulagen || []).forEach((zz, i) => {
      if (d.qty === 'v' || d.qty === 'p' || d.qty === 'w') return;
      if (face && (zz.face !== face || zz.dir !== dir)) return;
      const a = S({ x: zz.x0, y: zz.y1 }), b = S({ x: zz.x1, y: zz.y0 });
      z.push('<rect x="' + a.x.toFixed(1) + '" y="' + a.y.toFixed(1) + '" width="' + (b.x - a.x).toFixed(1) + '" height="' + (b.y - a.y).toFixed(1) + '" fill="none" stroke="#1d2220" stroke-width="1.4" stroke-dasharray="6 3"/>');
      const t = 'Z' + (i + 1) + ' ' + ({ oben: T_('oben'), unten: T_('unten') }[zz.face] || zz.face) + ' ' + zz.dir + ' Ø' + zz.phi + '/' + fmt(zz.s * 100, 1).replace(/[.,]0$/, '');
      z.push(label(a.x + (t.length * 6.6 + 10) / 2 + 3, a.y + 13, t));
    });
    // Durchstanzen: kritischer Rundschnitt u1 (2d) um die Stützen der gezeigten Platte
    const lvShown = d.slab === 'roof' ? 0 : d.slab === 'floor' ? A.q.geo.L.length - 1 : +String(d.slab).slice(3);
    for (const c of A.q.struct.columns || []) {
      const pu = d.slab === 'floor' ? (c.level === lvShown ? c.punchBelow : null) : c.level === lvShown ? c.punch : null;
      if (!pu) continue;
      const r = (pu.foundation ? pu.a : 2 * pu.d) * view.k, a = S({ x: c.x - c.bx / 2, y: c.y + c.by / 2 }), w = c.bx * view.k, h = c.by * view.k;
      const col = pu.fail ? '#b3261e' : pu.needs ? '#d29c00' : '#2f7d4f';
      z.push('<rect x="' + (a.x - r).toFixed(1) + '" y="' + (a.y - r).toFixed(1) + '" width="' + (w + 2 * r).toFixed(1) + '" height="' + (h + 2 * r).toFixed(1) + '" rx="' + r.toFixed(1) + '" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-dasharray="5 3"/>');
      z.push(label(a.x + w / 2, a.y - r - 10, 'vEd/vRd ' + fmt(pu.etaC, 2)));
    }
    // Querkraftbewehrung
    const lk = d.pl.shear && d.pl.shear.links;
    if (lk) lk.zones.forEach((zn) => { const a = S({ x: zn.x0, y: zn.y1 }), b = S({ x: zn.x1, y: zn.y0 }); z.push('<rect x="' + a.x + '" y="' + a.y + '" width="' + (b.x - a.x) + '" height="' + (b.y - a.y) + '" fill="none" stroke="#b3261e" stroke-width="2"/>'); });
    // Legende
    const L = 190, x0 = 14, y0 = 14, steps = 24, gs = [];
    for (let k = 0; k < steps; k++) {
      const t = k / (steps - 1), val = d.def.div ? (t * 2 - 1) * Math.max(Math.abs(d.lo), Math.abs(d.hi)) : d.qty === 'v' ? t * Math.max(1, d.hi) : d.span ? d.span[0] + t * (d.span[1] - d.span[0]) : t * d.hi;
      gs.push('<rect x="' + (x0 + k * L / steps).toFixed(1) + '" y="' + (y0 + 20) + '" width="' + (L / steps + 0.5).toFixed(1) + '" height="10" fill="' + feColor(d, val) + '"/>');
    }
    const lo = d.def.div ? -Math.max(Math.abs(d.lo), Math.abs(d.hi)) : d.span ? d.span[0] : 0, hi = d.def.div ? -lo : d.qty === 'v' ? Math.max(1, d.hi) : d.span ? d.span[1] : d.hi;
    const nm = (d.slab === 'roof' ? T_('Decke') : d.slab === 'floor' ? T_('Bodenplatte') : BP.rebar.elText(d.pl.name)) + ': ' + T_(d.def.name);
    const leg = '<g class="fe-legend"><rect x="' + (x0 - 6) + '" y="' + (y0 - 6) + '" width="' + (L + 12) + '" height="' + (d.def.note ? 66 : 54) + '" rx="4" fill="#fff" fill-opacity=".94" stroke="#c9cfcc"/>' +
      '<text x="' + x0 + '" y="' + (y0 + 10) + '" font-size="12" font-weight="650" fill="#1d2220">' + esc(nm) + '</text>' + gs.join('') +
      '<text x="' + x0 + '" y="' + (y0 + 44) + '" font-size="11" fill="#57605b">' + fmt(lo, 1) + '</text>' +
      '<text x="' + (x0 + L) + '" y="' + (y0 + 44) + '" font-size="11" fill="#57605b" text-anchor="end">' + fmt(hi, 1) + ' ' + esc(d.def.unit) + '</text>' +
      (d.def.note ? '<text x="' + x0 + '" y="' + (y0 + 56) + '" font-size="10.5" fill="#57605b">' + esc(T_(d.def.note)) + '</text>' : '') + '</g>';
    return { body, top: z.join('') + leg };
  }
  /* Wert unter dem Mauszeiger für die Hinweisleiste. */
  P.feValueAt = function (w) {
    const d = feData();
    if (!d) return '';
    const m = d.m, xs = m.xs, ys = m.ys;
    let I = -1, J = -1;
    for (let i = 0; i + 1 < xs.length; i++) if (w.x >= xs[i] && w.x <= xs[i + 1]) { I = i; break; }
    for (let j = 0; j + 1 < ys.length; j++) if (w.y >= ys[j] && w.y <= ys[j + 1]) { J = j; break; }
    if (I < 0 || J < 0) return '';
    for (let i = 0; i < d.ev.length; i++) if (m.elemIJ[2 * i] === I && m.elemIJ[2 * i + 1] === J) {
      const v = d.ev[i];
      return isFinite(v) ? T_('{name} bei x = {x} m, y = {y} m: {v}', { name: T_(d.def.name), x: fmt(w.x), y: fmt(w.y), v: fmt(v, d.qty === 'v' ? 2 : 1) }) + (d.def.unit ? ' ' + d.def.unit : '') : '';
    }
    return '';
  };

  function hint() {
    switch (A.tool) {
      case 'wall': return draft ? T_('Endpunkt klicken. Shift: beliebiger Winkel. Esc bricht ab.') : T_('Startpunkt der Innenwand klicken. Fängt an Wandflächen und am 5-cm-Raster.');
      case 'opening': return T_('Auf eine Wand klicken, um eine Tür zu setzen.');
      case 'treppe': return T_('Auf eine Außenwand klicken: Treppenabgang mit Schutztür.');
      case 'schacht': return T_('Auf eine Außenwand klicken: Notausstieg mit Luke und Steigeisen.');
      case 'room': return T_('In einen Raum klicken und benennen.');
      case 'unterzug': return draft ? T_('Endpunkt des Unterzugs klicken (auf Wand, Stütze oder Außenwand). Esc bricht ab.') : T_('Anfang des Unterzugs klicken. Er trägt die Platte über dieser Ebene und braucht an beiden Enden ein Auflager.');
      case 'stuetze': return T_('Stütze setzen ({b} × {b} cm). Fängt an Wandflächen, Stützenachsen und Wänden der Nachbarebenen.', { b: fmt((A.ui.colB || 0.3) * 100, 0) });
      case 'zone': return T_('Bereich ohne Stützen aufziehen: Ecke anklicken und ziehen. Dort setzt „Stützen automatisch“ keine Stützen.');
      case 'itreppe': return T_('Austritt der Innentreppe auf dieser Ebene anklicken; der Lauf führt in Pfeilrichtung nach unten. Taste D dreht.');
      case 'aufzug': return T_('Mitte des Aufzugsschachts anklicken; die Tür liegt in Pfeilrichtung. Taste D dreht.');
      case 'route': return A.ui.drawingRoute ? T_('Nächsten Punkt klicken, Höhe oben einstellen. Gleicher Punkt mit anderer Höhe: Steigleitung. Enter beendet, Shift: schräg.') : A.ui.routeType === 'kabel' ? T_('Startpunkt der Kabeltrasse klicken, auch außerhalb des Bunkers.') : T_('Startpunkt der Lüftungsleitung klicken, auch außerhalb des Bunkers.');
      default: return A.sel ? '' : T_('Außenkante ziehen ändert die Größe. Wände, Türen und Zugänge lassen sich ziehen. Doppelklick in einen Raum benennt ihn.') + (A.nLevels() > 1 ? ' ' + T_('Bild↑/Bild↓ wechselt die Ebene.') : '');
    }
  }

  function defs() {
    return '<defs>' +
      '<pattern id="hc" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#7a827e"/><line x1="0" y1="0" x2="0" y2="7" stroke="#545b58" stroke-width="2"/></pattern>' +
      '<pattern id="hm" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#d9c9b4"/><line x1="0" y1="0" x2="0" y2="6" stroke="#a88f70" stroke-width="1"/></pattern>' +
      '</defs>';
  }

  function drawRoutes(sel) {
    const q = A.q, o = [];
    for (const rr of q.routes.list) {
      const here = routeOnLevel(rr);
      if (!here) o.push('<g opacity=".18">');
      const on = here && sel.type === 'route' && sel.id === rr.id, col = rr.kind.color, clr = rr.src.clr || 0;
      const band = (a, b, wd) => {
        const u = G.norm(G.sub(b, a)), n = { x: -u.y * wd / 2, y: u.x * wd / 2 };
        return [G.add(a, n), G.add(b, n), G.sub(b, n), G.sub(a, n)];
      };
      for (let i = 1; i < rr.pts.length; i++) {
        const a = rr.pts[i - 1], b = rr.pts[i];
        if (G.dist(a, b) < 1e-3) continue;
        if (on && clr > 0) o.push('<polygon points="' + pts(band(a, b, rr.dims.w + 2 * clr)) + '" fill="none" stroke="#d29c00" stroke-dasharray="4 3" stroke-width="1"/>');
        o.push('<polygon points="' + pts(band(a, b, rr.dims.w)) + '" fill="' + col + '" fill-opacity="' + (on ? 0.7 : 0.45) + '" stroke="' + col + '" stroke-width="' + (on ? 1.6 : 0.8) + '"/>');
      }
      // Steigleitungen und Knicke
      const sp = rr.src.pts;
      for (let i = 0; i < sp.length; i++) {
        const a = sp[i], s = S(a), r = Math.max(3, rr.dims.w / 2 * view.k);
        const vertical = (i > 0 && G.dist(a, sp[i - 1]) < 1e-3 && Math.abs(a.h - sp[i - 1].h) > 1e-3) || (i + 1 < sp.length && G.dist(a, sp[i + 1]) < 1e-3 && Math.abs(a.h - sp[i + 1].h) > 1e-3);
        if (vertical) {
          o.push(rr.src.shape === 'rund' ? '<circle cx="' + s.x + '" cy="' + s.y + '" r="' + r + '" fill="#fff" stroke="' + col + '" stroke-width="1.6"/>' : '<rect x="' + (s.x - r) + '" y="' + (s.y - rr.dims.h / 2 * view.k) + '" width="' + 2 * r + '" height="' + Math.max(3, rr.dims.h * view.k) + '" fill="#fff" stroke="' + col + '" stroke-width="1.6"/>');
          o.push('<line x1="' + (s.x - r * 0.7) + '" y1="' + (s.y - r * 0.7) + '" x2="' + (s.x + r * 0.7) + '" y2="' + (s.y + r * 0.7) + '" stroke="' + col + '"/><line x1="' + (s.x - r * 0.7) + '" y1="' + (s.y + r * 0.7) + '" x2="' + (s.x + r * 0.7) + '" y2="' + (s.y - r * 0.7) + '" stroke="' + col + '"/>');
        }
        if (on) {
          o.push('<circle cx="' + s.x + '" cy="' + s.y + '" r="5" fill="#fff" stroke="#f2b705" stroke-width="2"/>');
          o.push('<text x="' + (s.x + 8) + '" y="' + (s.y - 7) + '" font-size="11" fill="#1d2220" style="paint-order:stroke" stroke="#fff" stroke-width="3">' + (i + 1) + ' · h ' + fmt(a.h) + '</text>');
        }
      }
      // Futterrohre an der Hülle
      for (const pn of rr.pens) {
        const s = S(pn), r = Math.max(4, (rr.dims.w / 2 + 0.03) * view.k);
        if (pn.type === 'innenwand') o.push('<rect x="' + (s.x - r) + '" y="' + (s.y - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" fill="none" stroke="#1d2220" stroke-dasharray="2 2"/>');
        else o.push('<circle cx="' + s.x + '" cy="' + s.y + '" r="' + r + '" fill="none" stroke="#1d2220" stroke-width="1.6"/>');
      }
      // Beschriftung am längsten Abschnitt
      let best = null, bl = 0;
      for (let i = 1; i < rr.pts.length; i++) { const l = G.dist(rr.pts[i - 1], rr.pts[i]); if (l > bl) { bl = l; best = [rr.pts[i - 1], rr.pts[i]]; } }
      if (here && best && (on || bl * view.k > 140)) {
        const m = S(G.lerp(best[0], best[1], 0.5));
        let ang = Math.atan2(S(best[1]).y - S(best[0]).y, S(best[1]).x - S(best[0]).x) * 180 / Math.PI;
        if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        const off = rr.dims.w / 2 * view.k + 9;
        o.push('<text x="' + m.x + '" y="' + (m.y - off) + '" font-size="11.5" text-anchor="middle" fill="' + col + '" font-weight="600" transform="rotate(' + ang.toFixed(1) + ' ' + m.x + ' ' + m.y + ')" style="paint-order:stroke" stroke="#fff" stroke-width="3">' + esc(T_(rr.kind.name) + ' ' + rr.dims.label) + '</text>');
      }
      if (!here) o.push('</g>');
    }
    // Vorschau beim Zeichnen
    if (A.tool === 'route' && hover && hover.p) {
      const last = currentRouteLast(), s = S(hover.p);
      if (last) { const a = S(last); o.push('<line x1="' + a.x + '" y1="' + a.y + '" x2="' + s.x + '" y2="' + s.y + '" stroke="#d29c00" stroke-width="2" stroke-dasharray="6 4"/>'); o.push(label((a.x + s.x) / 2, (a.y + s.y) / 2 - 14, fmt(G.dist(last, hover.p)) + ' m', true)); }
      o.push('<g stroke="#d29c00" stroke-width="1"><line x1="' + (s.x - 9) + '" y1="' + s.y + '" x2="' + (s.x + 9) + '" y2="' + s.y + '"/><line x1="' + s.x + '" y1="' + (s.y - 9) + '" x2="' + s.x + '" y2="' + (s.y + 9) + '"/></g>');
    }
    return o.join('');
  }

  function grid() {
    const a = Wd(0, view.H), b = Wd(view.W, 0);
    const step = view.k > 60 ? 0.5 : view.k > 18 ? 1 : 5;
    const o = ['<rect width="100%" height="100%" fill="#fbfcfb"/><g>'];
    for (let x = Math.floor(a.x / step) * step; x <= b.x; x += step) {
      const s = S({ x, y: 0 }).x, major = Math.abs(x / 5 - Math.round(x / 5)) < 1e-6;
      o.push('<line x1="' + s + '" y1="0" x2="' + s + '" y2="' + view.H + '" stroke="' + (major ? '#dfe3e0' : '#eef0ee') + '"/>');
    }
    for (let y = Math.floor(a.y / step) * step; y <= b.y; y += step) {
      const s = S({ x: 0, y }).y, major = Math.abs(y / 5 - Math.round(y / 5)) < 1e-6;
      o.push('<line x1="0" y1="' + s + '" x2="' + view.W + '" y2="' + s + '" stroke="' + (major ? '#dfe3e0' : '#eef0ee') + '"/>');
    }
    o.push('</g>');
    return o.join('');
  }

  function drawOpening(op, on) {
    const u = G.norm(G.sub(op.p1, op.p0));
    let inN, c0, c1;
    if (op.outer) { inN = G.mul(op.hl.nrm, -1); c0 = op.p0; c1 = op.p1; }
    else { inN = { x: -u.y, y: u.x }; c0 = G.add(op.p0, G.mul(inN, -op.t / 2)); c1 = G.add(op.p1, G.mul(inN, -op.t / 2)); }
    const d0 = G.add(c0, G.mul(inN, op.t)), d1 = G.add(c1, G.mul(inN, op.t));
    const o = [];
    const stroke = on ? '#f2b705' : '#1d2220', sw = on ? 2.5 : 1;
    o.push('<polygon points="' + pts([c0, c1, d1, d0]) + '" fill="#fff" stroke="none"/>');
    o.push('<line x1="' + S(c0).x + '" y1="' + S(c0).y + '" x2="' + S(d0).x + '" y2="' + S(d0).y + '" stroke="#1d2220"/>');
    o.push('<line x1="' + S(c1).x + '" y1="' + S(c1).y + '" x2="' + S(d1).x + '" y2="' + S(d1).y + '" stroke="#1d2220"/>');
    if (op.lift) {
      // Schiebetür: zwei Türblätter in der Wandachse
      const m0 = G.lerp(c0, d0, 0.5), m1 = G.lerp(c1, d1, 0.5), mm = G.lerp(m0, m1, 0.5);
      o.push('<line x1="' + S(m0).x + '" y1="' + S(m0).y + '" x2="' + S(mm).x + '" y2="' + S(mm).y + '" stroke="' + stroke + '" stroke-width="2.2"/>');
      o.push('<line x1="' + S(mm).x + '" y1="' + S(mm).y + '" x2="' + S(m1).x + '" y2="' + S(m1).y + '" stroke="' + stroke + '" stroke-width="2.2"/>');
    } else if (op.kind === 'luke') {
      o.push('<polygon points="' + pts([c0, c1, d1, d0]) + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-dasharray="4 3"/>');
    } else if (op.kind !== 'durchgang') {
      // Türblatt schlägt nach innen auf, Band an Seite 0
      const hinge = d0, tip = G.add(hinge, G.mul(inN, op.w));
      const hs = S(hinge), ts = S(tip), es = S(d1), r = op.w * view.k;
      const sweep = G.cross(G.sub(d1, d0), G.sub(tip, d0)) > 0 ? 0 : 1;
      o.push('<line x1="' + hs.x + '" y1="' + hs.y + '" x2="' + ts.x + '" y2="' + ts.y + '" stroke="' + stroke + '" stroke-width="' + (op.kind === 'schutztuer' ? 3 : 1.6) + '"/>');
      o.push('<path d="M' + ts.x + ' ' + ts.y + ' A' + r + ' ' + r + ' 0 0 ' + sweep + ' ' + es.x + ' ' + es.y + '" fill="none" stroke="' + stroke + '" stroke-width="' + (on ? 1.6 : 0.8) + '" stroke-dasharray="3 3"/>');
    }
    if (on) o.push('<polygon points="' + pts([c0, c1, d1, d0]) + '" fill="none" stroke="#f2b705" stroke-width="2.5"/>');
    return o.join('');
  }

  function drawBeam(bu, on, hv) {
    const st = on ? '#f2b705' : hv ? '#d29c00' : '#1d2220', o = [];
    const u = G.norm(G.sub(bu.b, bu.a)), n = { x: -u.y * bu.bw / 2, y: u.x * bu.bw / 2 };
    const poly = [G.add(bu.a, n), G.add(bu.b, n), G.sub(bu.b, n), G.sub(bu.a, n)];
    o.push('<polygon points="' + pts(poly) + '" fill="#d5d8d6" fill-opacity=".35" stroke="' + st + '" stroke-width="' + (on ? 2.5 : 1.2) + '" stroke-dasharray="7 4"/>');
    const a = S(bu.a), b = S(bu.b);
    o.push('<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="#57605b" stroke-width=".8" stroke-dasharray="12 3 2 3"/>');
    if (on || hv) for (const e of [a, b]) o.push('<circle cx="' + e.x + '" cy="' + e.y + '" r="5" fill="#fff" stroke="' + (on ? '#f2b705' : '#57605b') + '" stroke-width="2"/>');
    const m = S(G.lerp(bu.a, bu.b, 0.5)), t = T_('UZ {b}/{h}', { b: fmt(bu.bw * 100, 0), h: fmt(bu.hb * 100, 0) });
    if (G.dist(bu.a, bu.b) * view.k > t.length * 7 + 20) {
      let ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const off = bu.bw / 2 * view.k + 8;
      o.push('<text x="' + m.x + '" y="' + (m.y - off) + '" font-size="11" text-anchor="middle" fill="#1d2220" transform="rotate(' + ang.toFixed(1) + ' ' + m.x + ' ' + m.y + ')" style="paint-order:stroke" stroke="#fff" stroke-width="3">' + esc(t) + '</text>');
    }
    return o.join('');
  }
  function drawColumn(c, on, hv) {
    const poly = colRect(c), st = on ? '#f2b705' : hv ? '#d29c00' : '#1d2220';
    let h = '<polygon points="' + pts(poly) + '" fill="url(#hc)" stroke="' + st + '" stroke-width="' + (on ? 3 : 1.2) + '"/>';
    // Diagonalen kennzeichnen Stützen im Schnitt
    h += '<line x1="' + S(poly[0]).x + '" y1="' + S(poly[0]).y + '" x2="' + S(poly[2]).x + '" y2="' + S(poly[2]).y + '" stroke="#1d2220" stroke-width=".7"/>';
    if (c.auto) h += '<text x="' + S(poly[2]).x + '" y="' + (S(poly[2]).y - 3) + '" font-size="10" fill="#57605b">' + T_('auto') + '</text>';
    return h;
  }
  function drawZone(z, on, hv) {
    const poly = G.polygonFromRect(z.x0, z.y0, z.x1, z.y1), a = S({ x: z.x0, y: z.y1 });
    const st = on ? '#f2b705' : hv ? '#d29c00' : '#3d7a5a';
    return '<polygon points="' + pts(poly) + '" fill="#3d7a5a" fill-opacity=".06" stroke="' + st + '" stroke-dasharray="8 4" stroke-width="' + (on ? 2.5 : 1.4) + '"/>' +
      '<text x="' + (a.x + 6) + '" y="' + (a.y + 15) + '" font-size="11.5" fill="#2f5e45" font-weight="600">' + esc(z.name ? z.name + ' · ' + T_('stützenfrei') : T_('stützenfrei')) + '</text>';
  }
  function drawGhost(Lu) {
    const o = ['<g opacity=".55">'];
    for (const w of Lu.walls) {
      if (!w.info.bearing || w.auto) continue;
      for (const sg of w.segs) {
        const u = G.norm(G.sub(sg.b, sg.a)), n = { x: -u.y * w.t / 2, y: u.x * w.t / 2 };
        o.push('<polygon points="' + pts([G.add(sg.a, n), G.add(sg.b, n), G.sub(sg.b, n), G.sub(sg.a, n)]) + '" fill="none" stroke="#c27c0e" stroke-width="1.2" stroke-dasharray="5 3"/>');
      }
    }
    for (const c of Lu.columns) o.push('<polygon points="' + pts(colRect(c)) + '" fill="none" stroke="#c27c0e" stroke-width="1.2" stroke-dasharray="3 2"/>');
    o.push('</g>');
    return o.join('');
  }
  function drawStair(st, part, on) {
    const o = [], P0 = { x: st.src.x, y: st.src.y };
    const at = (s, t) => G.add(G.add(P0, G.mul(st.u, s)), G.mul(st.nrm, t));
    const stroke = on ? '#f2b705' : '#1d2220';
    if (part === 'lower') {
      o.push('<polygon points="' + pts(st.footLower) + '" fill="#f1f2f1" stroke="' + stroke + '" stroke-width="' + (on ? 2.5 : 1) + '"/>');
      for (let i = 1; i < st.nr; i++) { const sx = i * st.tread; const a = S(at(sx, -st.w / 2)), b = S(at(sx, st.w / 2)); o.push('<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="#8b938f" stroke-width=".8"/>'); }
      // Lauflinie: Kreis am Antritt (unten), Pfeil am Austritt (oben)
      const s0 = S(at(st.run - 0.1, 0)), s1 = S(at(0.15, 0));
      o.push('<circle cx="' + s0.x + '" cy="' + s0.y + '" r="4" fill="none" stroke="#1d2220"/><line x1="' + s0.x + '" y1="' + s0.y + '" x2="' + s1.x + '" y2="' + s1.y + '" stroke="#1d2220"/>');
      const al = S(at(0.4, -0.15)), ar = S(at(0.4, 0.15));
      o.push('<polyline points="' + al.x + ',' + al.y + ' ' + s1.x + ',' + s1.y + ' ' + ar.x + ',' + ar.y + '" fill="none" stroke="#1d2220"/>');
      const m = S(at(st.run / 2, 0));
      const full = (A.q.geo.labels['v:' + st.id] || T_('Innentreppe')) + ' · ' + T_('{n} Stg. {r}/{t}', { n: st.nr, r: fmt(st.rise * 100, 1), t: fmt(st.tread * 100, 1) });
      o.push(label(m.x, m.y, full.length * 6.6 + 10 < st.run * view.k || Math.abs(st.u.y) > 0.5 ? full : (A.q.geo.labels['v:' + st.id] || T_('Innentreppe'))));
    } else {
      // Austrittspodest und Treppenauge (Luftraum mit Diagonalen), Lauf darunter gestrichelt
      o.push('<polygon points="' + pts(st.footUpper) + '" fill="none" stroke="' + stroke + '" stroke-width="' + (on ? 2.5 : 1) + '"/>');
      o.push('<polygon points="' + pts(st.hole) + '" fill="#ffffff" stroke="#1d2220" stroke-width="1.2"/>');
      o.push('<line x1="' + S(st.hole[0]).x + '" y1="' + S(st.hole[0]).y + '" x2="' + S(st.hole[2]).x + '" y2="' + S(st.hole[2]).y + '" stroke="#8b938f" stroke-width=".8"/><line x1="' + S(st.hole[1]).x + '" y1="' + S(st.hole[1]).y + '" x2="' + S(st.hole[3]).x + '" y2="' + S(st.hole[3]).y + '" stroke="#8b938f" stroke-width=".8"/>');
      for (let i = 1; i < st.nr; i++) { const sx = i * st.tread; if (sx > st.sFree + 0.6) break; const a = S(at(sx, -st.w / 2)), b = S(at(sx, st.w / 2)); o.push('<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="#8b938f" stroke-width=".7" stroke-dasharray="3 3"/>'); }
      const s0 = S(at(-st.landing / 2, 0)), s1 = S(at(Math.min(st.run, st.sFree + 0.5), 0));
      o.push('<line x1="' + s0.x + '" y1="' + s0.y + '" x2="' + s1.x + '" y2="' + s1.y + '" stroke="#1d2220" stroke-dasharray="4 3"/>');
      const m = S(at(-st.landing / 2, 0));
      o.push(label(m.x, m.y, T_('nach unten')));
    }
    return o.join('');
  }
  function drawLift(v, on) {
    const o = [], st = on ? '#f2b705' : '#1d2220', ip = v.innerPoly;
    // Schacht: Kreuz; Kabine als Rechteck
    o.push('<polygon points="' + pts(ip) + '" fill="#f7f8f7" stroke="none"/>');
    o.push('<line x1="' + S(ip[0]).x + '" y1="' + S(ip[0]).y + '" x2="' + S(ip[2]).x + '" y2="' + S(ip[2]).y + '" stroke="#8b938f" stroke-width=".8"/><line x1="' + S(ip[1]).x + '" y1="' + S(ip[1]).y + '" x2="' + S(ip[3]).x + '" y2="' + S(ip[3]).y + '" stroke="#8b938f" stroke-width=".8"/>');
    const c = (s2, t2) => G.add(G.add({ x: v.x, y: v.y }, G.mul(v.u, s2)), G.mul(v.nrm, t2));
    const cw = v.src.w / 2, cd = v.src.d / 2, sh = (0.15 - 0.25) / 2;
    o.push('<polygon points="' + pts([c(-cd + sh, -cw), c(cd + sh, -cw), c(cd + sh, cw), c(-cd + sh, cw)]) + '" fill="none" stroke="' + st + '" stroke-width="' + (on ? 2.5 : 1.2) + '"/>');
    // Gegengewicht (Seil) bzw. Zylinder (Hydraulik) seitlich der Kabine
    const cwp = [c(-0.35 + sh, cw + 0.04), c(0.35 + sh, cw + 0.04), c(0.35 + sh, cw + 0.20), c(-0.35 + sh, cw + 0.20)];
    o.push(v.src.drive === 'hydraulik' ? '<circle cx="' + S(c(sh, cw + 0.12)).x + '" cy="' + S(c(sh, cw + 0.12)).y + '" r="' + Math.max(3, 0.08 * view.k) + '" fill="#8b938f"/>' : '<polygon points="' + pts(cwp) + '" fill="#8b938f"/>');
    const m = S({ x: v.x, y: v.y });
    o.push('<text x="' + m.x + '" y="' + (m.y + 4) + '" text-anchor="middle" font-size="11" fill="#1d2220" style="paint-order:stroke" stroke="#f7f8f7" stroke-width="3">' + esc(T_(v.src.type === 'personen' ? 'Personenaufzug {kg} kg' : 'Lastenaufzug {kg} kg', { kg: v.src.payload })) + '</text>');
    return o.join('');
  }
  function drawVertPreview(pt) {
    const dir = A.ui.vertDir || 0, u = { 0: { x: 1, y: 0 }, 90: { x: 0, y: 1 }, 180: { x: -1, y: 0 }, 270: { x: 0, y: -1 } }[dir], n = { x: -u.y, y: u.x };
    const at = (s2, t2) => G.add(G.add(pt, G.mul(u, s2)), G.mul(n, t2));
    let poly, tip;
    if (A.tool === 'itreppe') {
      const i = LV(), Lc = A.q.lv.levels[i], Ln = A.q.lv.levels[i + 1];
      const dh = Lc && Ln ? Lc.zFloorTop - Ln.zFloorTop : 3;
      const nr = Math.max(2, Math.ceil(dh / 0.18 - 1e-9)), rise = dh / nr, tread = Math.max(0.25, Math.min(0.32, 0.63 - 2 * rise)), run = (nr - 1) * tread;
      poly = [at(-1, -0.5), at(run + 1, -0.5), at(run + 1, 0.5), at(-1, 0.5)]; tip = at(run, 0);
    } else { poly = [at(-1.45, -1.05), at(1.45, -1.05), at(1.45, 1.05), at(-1.45, 1.05)]; tip = at(1.75, 0); }
    const a = S(pt), b = S(tip);
    return '<polygon points="' + pts(poly) + '" fill="rgba(242,183,5,.25)" stroke="#d29c00" stroke-dasharray="5 3"/><line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="#d29c00" stroke-width="2"/><circle cx="' + b.x + '" cy="' + b.y + '" r="4" fill="#d29c00"/>';
  }
  function levelBadge() {
    const i = LV(), L = LG(), lvz = A.q.lv.levels[i];
    const t = T_('Ebene {n}', { n: i + 1 }) + (i > 0 && L.name && !/^Ebene \d+$/.test(L.name) ? ' „' + L.name + '“' : '') + ' · ' + T_('lichte Höhe {h} m', { h: fmt(L.H) }) + ' · ' + T_('OK Rohboden {z} m', { z: (lvz.zFloorTop < 0 ? '−' : '+') + fmt(Math.abs(lvz.zFloorTop)) });
    const w = t.length * 6.6 + 16;
    return '<g><rect x="' + (view.W - w - 12) + '" y="12" width="' + w + '" height="24" rx="4" fill="#1d2220" fill-opacity=".86"/><text x="' + (view.W - 12 - w / 2) + '" y="28" text-anchor="middle" font-size="12.5" fill="#fff" font-weight="600">' + esc(t) + '</text></g>';
  }

  function drawAccess(a, on, hv, labels) {
    const o = [];
    const { u, nn, tw } = a;
    const st = on ? '#f2b705' : hv ? '#d29c00' : '#1d2220';
    o.push('<polygon points="' + pts(a.foot) + '" fill="#f1f2f1" stroke="' + st + '" stroke-width="' + (on ? 2.5 : 1) + '"/>');
    const C = a.C;
    const at = (du, dn) => G.add(G.add(C, G.mul(u, du)), G.mul(nn, dn));
    if (a.kind === 'treppe') {
      const W = a.W, L = a.L;
      const Lw = a.Lcut || L;
      for (const sgn of [-1, 1]) {
        const x0 = sgn * (a.w / 2), x1 = sgn * (W / 2);
        o.push('<polygon points="' + pts([at(x0, 0), at(x1, 0), at(x1, Lw), at(x0, Lw)]) + '" fill="url(#hc)" stroke="#1d2220" stroke-width=".8"/>');
      }
      for (let i = 0; i < a.nr; i++) {
        const s = a.landing + i * a.tread;
        if (s > L + 1e-6) break;
        const p0 = S(at(-a.w / 2, s)), p1 = S(at(a.w / 2, s));
        o.push('<line x1="' + p0.x + '" y1="' + p0.y + '" x2="' + p1.x + '" y2="' + p1.y + '" stroke="#8b938f" stroke-width=".8"/>');
      }
      const s0 = S(at(0, a.landing * 0.5)), s1 = S(at(0, L - 0.2));
      o.push('<line x1="' + s0.x + '" y1="' + s0.y + '" x2="' + s1.x + '" y2="' + s1.y + '" stroke="#1d2220" stroke-width="1"/>');
      const ah = S(at(0, L - 0.2)), al = S(at(-0.15, L - 0.45)), ar = S(at(0.15, L - 0.45));
      o.push('<polyline points="' + al.x + ',' + al.y + ' ' + ah.x + ',' + ah.y + ' ' + ar.x + ',' + ar.y + '" fill="none" stroke="#1d2220"/>');
      if (a.hatch > 0) o.push('<polygon points="' + pts([at(-W / 2, 0), at(W / 2, 0), at(W / 2, L), at(-W / 2, L)]) + '" fill="none" stroke="#57605b" stroke-dasharray="7 4" stroke-width="1"/>');
      const name = A.q.geo.labels['a:' + a.id] || T_('Treppe');
      labels.push(sideLabel(a, at, L, a.nr ? name + ' · ' + T_('{n} Stg. {r}/{t}', { n: a.nr, r: fmt(a.rise * 100, 1), t: fmt(a.tread * 100, 1) }) : name + ' · ' + T_('ebenerdig'), name));
    } else {
      const W = a.W, D = a.D, w = a.w, wy = a.wy;
      const outer = [at(-W / 2, 0), at(W / 2, 0), at(W / 2, D), at(-W / 2, D)];
      const inner = [at(-w / 2, 0), at(w / 2, 0), at(w / 2, wy), at(-w / 2, wy)];
      o.push('<path d="' + pathOf(outer) + pathOf(inner.slice().reverse()) + '" fill="url(#hc)" stroke="#1d2220" stroke-width=".8" fill-rule="evenodd"/>');
      for (let k = 1; k < 4; k++) {
        const p0 = S(at(-w / 2 + 0.12, wy * k / 4)), p1 = S(at(w / 2 - 0.12, wy * k / 4));
        o.push('<line x1="' + p0.x + '" y1="' + p0.y + '" x2="' + p1.x + '" y2="' + p1.y + '" stroke="#57605b" stroke-width="1.2"/>');
      }
      labels.push(sideLabel(a, at, D, A.q.geo.labels['a:' + a.id] || T_('Notausstieg')));
    }
    return o.join('');
  }

  /* Beschriftung neben dem Zugang; passt der volle Text nicht neben den Lauf, nur der Kurzname. */
  function sideLabel(a, at, L, full, short) {
    const s0 = S(at(0, 0)), su = S(at(1, 0));
    const ux = su.x - s0.x;
    let text = full;
    if (short && Math.abs(ux) <= Math.abs(su.y - s0.y) && full.length * 6.6 + 10 > L * view.k) text = short;
    const w = text.length * 6.6 + 10;
    let p, anchorDx;
    if (Math.abs(ux) > Math.abs(su.y - s0.y)) {
      // Zugang läuft auf dem Bildschirm senkrecht: Beschriftung seitlich
      const side = ux > 0 ? 1 : -1;
      p = S(at(side * (a.W / 2 + 0.15), L / 2));
      anchorDx = side * (w / 2 + 6);
    } else {
      // Zugang läuft auf dem Bildschirm waagerecht: Beschriftung über dem Lauf
      p = S(at(0, L / 2));
      anchorDx = 0;
      p.y -= Math.abs(su.y - s0.y) * a.W / 2 + 16;
    }
    return label(p.x + anchorDx, p.y, text, false);
  }

  function label(x, y, text, strong) {
    const w = text.length * 6.6 + 10;
    if (view.W > w + 8) x = Math.max(w / 2 + 4, Math.min(view.W - w / 2 - 4, x)); // im sichtbaren Bereich halten
    return '<g><rect x="' + (x - w / 2) + '" y="' + (y - 10) + '" width="' + w + '" height="19" rx="3" fill="' + (strong ? '#f2b705' : 'rgba(255,255,255,.92)') + '" stroke="' + (strong ? 'none' : '#d6dad7') + '"/>' +
      '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" font-size="12" fill="#1d2220">' + esc(text) + '</text></g>';
  }

  function dims() {
    const g = A.q.geo, n = g.out.length, o = ['<g font-size="12" fill="#1d2220">'];
    for (let i = 0; i < n; i++) {
      const a = g.out[i], b = g.out[(i + 1) % n], len = G.dist(a, b);
      if (len < 0.3) continue;
      const nn = G.edgeNormal(a, b);
      let off = 0.75;
      for (const ac of g.access) if (ac.edge === i) off = Math.max(off, (ac.Lcut || ac.L || ac.D) + 0.6);
      const a1 = G.add(a, G.mul(nn, off)), b1 = G.add(b, G.mul(nn, off));
      const sa = S(a1), sb = S(b1), sa0 = S(G.add(a, G.mul(nn, 0.15))), sb0 = S(G.add(b, G.mul(nn, 0.15)));
      o.push('<line x1="' + sa0.x + '" y1="' + sa0.y + '" x2="' + S(G.add(a1, G.mul(nn, 0.15))).x + '" y2="' + S(G.add(a1, G.mul(nn, 0.15))).y + '" stroke="#8b938f" stroke-width=".7"/>');
      o.push('<line x1="' + sb0.x + '" y1="' + sb0.y + '" x2="' + S(G.add(b1, G.mul(nn, 0.15))).x + '" y2="' + S(G.add(b1, G.mul(nn, 0.15))).y + '" stroke="#8b938f" stroke-width=".7"/>');
      o.push('<line x1="' + sa.x + '" y1="' + sa.y + '" x2="' + sb.x + '" y2="' + sb.y + '" stroke="#57605b" stroke-width=".8"/>');
      for (const s of [sa, sb]) o.push('<line x1="' + (s.x - 4) + '" y1="' + (s.y + 4) + '" x2="' + (s.x + 4) + '" y2="' + (s.y - 4) + '" stroke="#1d2220" stroke-width="1.2"/>');
      const m = S(G.add(G.lerp(a, b, 0.5), G.mul(nn, off + 0.02)));
      let ang = Math.atan2(sb.y - sa.y, sb.x - sa.x) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const up = S(G.add(G.lerp(a, b, 0.5), G.mul(nn, off + 0.3)));
      const dx = up.x - m.x, dy = up.y - m.y, dl = Math.hypot(dx, dy) || 1;
      const tx = m.x + dx / dl * 7, ty = m.y + dy / dl * 7;
      o.push('<text x="' + tx + '" y="' + ty + '" text-anchor="middle" dominant-baseline="middle" transform="rotate(' + ang + ' ' + tx + ' ' + ty + ')" style="paint-order:stroke" stroke="#fbfcfb" stroke-width="4">' + fmt(len) + '</text>');
    }
    o.push('</g>');
    return o.join('');
  }

  function scaleBar() {
    const nice = [0.5, 1, 2, 5, 10, 20];
    const m = nice.find((v) => v * view.k >= 70) || 20;
    const x = view.W - 24 - m * view.k, y = view.H - 22;
    return '<g><line x1="' + x + '" y1="' + y + '" x2="' + (x + m * view.k) + '" y2="' + y + '" stroke="#1d2220" stroke-width="2"/>' +
      '<line x1="' + x + '" y1="' + (y - 5) + '" x2="' + x + '" y2="' + (y + 3) + '" stroke="#1d2220"/><line x1="' + (x + m * view.k) + '" y1="' + (y - 5) + '" x2="' + (x + m * view.k) + '" y2="' + (y + 3) + '" stroke="#1d2220"/>' +
      '<text x="' + (x + m * view.k / 2) + '" y="' + (y - 7) + '" text-anchor="middle" font-size="12" fill="#1d2220">' + fmt(m, m < 1 ? 1 : 0) + ' m</text></g>';
  }

  P.zoom = function (f) { view.k = Math.max(6, Math.min(600, view.k * f)); P.render(); };
  P.view = view;
})(typeof window !== 'undefined' ? window : globalThis);
