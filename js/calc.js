/*
 * Berechnungskern: Geometrie, Höhen, Lasten, Vorbemessung, Mengen, Kosten, Bauablauf, Prüfungen.
 * Einheiten: m, kN, kN/m², kNm/m, Bewehrung in cm²/m, Massen in kg.
 */
(function (root) {
  const BP = root.BP = root.BP || {};
  const G = BP.geo, M = BP.model;
  const T_ = BP.i18n.T, N_ = BP.i18n.N, I18 = BP.i18n;

  const GAMMA_C = 25, GAMMA_W = 10, STOCK = 12, FB = 0.15;
  /* Normprofil (Teilsicherheiten, Baustoffwerte, Formeln je Norm): wird in run() für das Projekt gesetzt, sonst Deutschland */
  let NC = BP.normen.profile(null);
  const DIAS = { [Symbol.iterator]: () => (NC.dias || DIAS0)[Symbol.iterator]() };
  const DIAS0 = [8, 10, 12, 14, 16, 20, 25];
  const SPACINGS = [0.10, 0.125, 0.15, 0.20, 0.25];
  // Stabdurchmesser, Querschnitt und Masse je Norm (USA: Stäbe nach ASTM A615M, sonst metrische Stäbe)
  const kgPerM = (phi) => (NC && NC.barMass ? NC.barMass(phi) : 0.00617 * phi * phi);
  const asBar = (phi) => (NC && NC.barArea ? NC.barArea(phi) : Math.PI * phi * phi / 400); // cm²
  const ceil = Math.ceil, max = Math.max, min = Math.min;
  const finite = (v) => typeof v === 'number' && isFinite(v);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function interp(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) {
      if (x <= xs[i]) { const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + t * (ys[i] - ys[i - 1]); }
    }
    return ys[ys.length - 1];
  }

  /* Rechteckplatte unter Gleichlast, ν = 0,3 (Timoshenko, Theory of Plates and Shells, Tab. 8 und 35). */
  const R_SS = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 3.0, 4.0, 5.0, 1e6];
  const BX_SS = [.0479, .0554, .0627, .0694, .0755, .0812, .0862, .0908, .0948, .0985, .1017, .1189, .1235, .1246, .1250];
  const BY_SS = [.0479, .0493, .0501, .0503, .0502, .0498, .0492, .0486, .0479, .0471, .0464, .0406, .0384, .0375, .0375];
  const R_CL = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 1e6];
  const BS_CL = [.0513, .0581, .0639, .0687, .0726, .0757, .0780, .0799, .0812, .0822, .0829, .0833];
  const betaX = (r) => interp(R_SS, BX_SS, r);
  const betaY = (r) => interp(R_SS, BY_SS, r);
  const betaS = (r) => interp(R_CL, BS_CL, r);
  /* Eingespannte Platte: Randmoment an der kurzen Seite (lange Richtung), Timoshenko Tab. 35. */
  const R_CLY = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1e6];
  const BSY_CL = [.0513, .0538, .0554, .0563, .0568, .0570, .0571];
  const betaSY = (r) => interp(R_CLY, BSY_CL, r);
  /* Auflagerkräfte und Durchlaufwirkung, eigene FE-Rechnung (Mindlin-Platte, dünn, ν = 0,2; Kontrolle: Timoshenko Tab. 8/35 auf < 1 %).
   * Größte Randkraft in Randmitte V = c·p·lx (lx = kurze Stützweite): Hüllkurve aus gelenkiger und eingespannter Lagerung,
   * lange (L) bzw. kurze (S) Seite. Für Ränder an tragenden Innenwänden (Durchlaufplatten) die Werte der Platte mit diesem Rand
   * eingespannt und den übrigen gelenkig: Moment am Rand m = β1·p·lx², Randkraft v = c1·p·lx (oberer Grenzwert). */
  const R_TB = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.5, 3.0, 4.0, 5.0, 1e6];
  const V_L = [.439, .462, .485, .500, .508, .514, .515, .516, .516, .516, .516, .512, .507, .503, .501, .500];
  const V_S = [.439, .452, .468, .479, .488, .496, .502, .506, .509, .511, .513, .517, .519, .519, .519, .519];
  const B1_L = [.0838, .0914, .0979, .1032, .1076, .1112, .1141, .1165, .1184, .1199, .1211, .1242, .1249, .1249, .1250, .1250];
  const V1_L = [.580, .599, .613, .622, .629, .633, .636, .637, .638, .638, .637, .633, .629, .626, .625, .625];
  const B1_S = [.0838, .0917, .0984, .1039, .1083, .1119, .1148, .1170, .1187, .1201, .1211, .1237, .1243, .1245, .1245, .1245];
  const V1_S = [.580, .613, .640, .662, .680, .693, .704, .712, .719, .724, .728, .737, .739, .739, .739, .739];
  const tb = (arr) => (r) => interp(R_TB, arr, r);
  const vL = tb(V_L), vS = tb(V_S), b1L = tb(B1_L), v1L = tb(V1_L), b1S = tb(B1_S), v1S = tb(V1_S);

  /* ---------- Grundlagen ---------- */

  function soilOf(site) {
    const s = M.SOILS[site.soil] || M.SOILS.sand;
    if (site.soil === 'eigen') return Object.assign({}, s, site.custom);
    return s;
  }

  function waterOf(site) {
    if (site.waterMode === 'tiefe' && finite(site.waterDepth)) return { z: -site.waterDepth, known: true, label: T_('Bemessungswasserstand {d} m unter Gelände', { d: I18.dec(site.waterDepth.toFixed(2)) }) };
    if (site.waterMode === 'gok') return { z: 0, known: true, label: T_('Stau-/Sickerwasser bis Geländeoberkante') };
    if (site.waterMode === 'keins') return { z: -Infinity, known: true, label: T_('Kein Grundwasser bis unter Gründungssohle') };
    return { z: -Infinity, known: false, label: T_('Wasserstand noch unbekannt') };
  }

  /* Erdhügel: Bunker ragt über das Gelände, Erde wird als Hügel aufgeschüttet.
   * h = Höhe OK Hügel über Urgelände; Krone um crest über die Außenkante, Böschung 1 : n bis zum Fuß.
   * Der Hügel liegt über der konvexen Hülle des Grundrisses: Einbuchtungen (L-Form) werden bis zur Krone aufgefüllt.
   * Damit gelten für jeden Grundriss dieselben Gehrungs-Offsets in Rechnung, Plan, Schnitt und 3D. */
  function moundOf(p) {
    const b = p.build, m = b.mound || {};
    const total = innerHeight(p) + b.tRoof + (b.insulation.roof || 0) + b.cover; // OK Rohboden (unterste Ebene) unter OK Erde
    const flat = (p0, d, s0, s1) => [[s0, 0], [s1, 0]];
    const off = { on: false, h: 0, crest: 0, n: 0, toe: 0, floorDepth: total, fill: 'aushub', total, hull: null, surfAt: () => 0, at: () => 0, profile: flat, reach: () => 0 };
    if (!m.on) return off;
    const fd = max(0, min(total, finite(m.floorDepth) ? m.floorDepth : 0));
    const h = total - fd;
    if (h < 1e-6) return Object.assign(off, { floorDepth: fd });
    const crest = max(0, finite(m.crest) ? m.crest : 1);
    const n = max(0.5, finite(m.slope) ? m.slope : 2);
    const toe = crest + n * h;
    const surfAt = (s) => (s <= crest ? h : max(0, h - (s - crest) / n));
    const outline = G.ensureCCW(p.geom.outline), ch = G.convexHull(outline);
    const hull = ch.length >= 3 ? ch : outline;
    const E = hull.map((a, i) => ({ a, nr: G.edgeNormal(a, hull[(i + 1) % hull.length]) }));
    // Abstand zur Hülle mit Gehrung: größter Abstand vor einer Hüllkante (≤ 0 innerhalb)
    const at = (pt) => surfAt(E.reduce((d, e) => max(d, G.dot(G.sub(pt, e.a), e.nr)), -Infinity));
    const lines = (p0, d) => E.map((e) => ({ c: G.dot(G.sub(p0, e.a), e.nr), m: G.dot(d, e.nr) }));
    // Hügeloberfläche entlang p0 + d·s (s0…s1) als exakter Polygonzug [s, z]: Knicke an Krone, Fuß und an Wechseln der maßgebenden Hüllkante
    const profile = (p0, d, s0, s1) => {
      const L = lines(p0, d), S = [s0, s1];
      for (const l of L) if (Math.abs(l.m) > 1e-12) S.push((crest - l.c) / l.m, (toe - l.c) / l.m);
      // außerhalb der Hülle wechselt die maßgebende Kante nur zwischen Nachbarkanten (innen ist die Fläche eben)
      for (let i = 0; i < L.length; i++) { const j = (i + 1) % L.length; if (Math.abs(L[i].m - L[j].m) > 1e-12) S.push((L[j].c - L[i].c) / (L[i].m - L[j].m)); }
      const pts = [];
      for (const s of S.filter((x) => x >= s0 && x <= s1).sort((x, y) => x - y)) {
        if (pts.length && s - pts[pts.length - 1][0] < 1e-9) continue;
        pts.push([s, surfAt(L.reduce((mx, l) => max(mx, l.c + l.m * s), -Infinity))]);
      }
      return simplifyProfile(pts);
    };
    // Länge ab p0 in Richtung d bis zum Hügelfuß
    const reach = (p0, d) => { const r = lines(p0, d).reduce((acc, l) => (l.m > 1e-12 ? min(acc, (toe - l.c) / l.m) : acc), Infinity); return finite(r) ? max(0, r) : 0; };
    return { on: true, h, crest, n, toe, floorDepth: fd, fill: m.fill === 'liefer' ? 'liefer' : 'aushub', total, hull, surfAt, at, profile, reach };
  }

  /* Polygonzug [s, z]: fast gleiche Stellen zusammenfassen, Zwischenpunkte auf der Sehne zum letzten behaltenen Punkt entfernen. */
  function simplifyProfile(pts) {
    const P = [];
    for (const pt of pts) if (!P.length || pt[0] - P[P.length - 1][0] > 1e-9) P.push(pt);
    if (P.length < 3) return P;
    const out = [P[0]];
    for (let i = 1; i < P.length - 1; i++) {
      const a = out[out.length - 1], b = P[i], c = P[i + 1], dx = c[0] - a[0], dz = c[1] - a[1];
      if (Math.abs((b[0] - a[0]) * dz - dx * (b[1] - a[1])) / (Math.hypot(dx, dz) || 1) > 1e-7) out.push(b);
    }
    out.push(P[P.length - 1]);
    return out;
  }

  /* Punktweises Maximum zweier Polygonzüge über demselben Bereich, mit Schnittpunkten. */
  function maxProfile(P1, P2) {
    const f = (P, s) => {
      for (let i = 1; i < P.length; i++) {
        if (s <= P[i][0] + 1e-12) { const a = P[i - 1], c = P[i]; return c[0] - a[0] < 1e-12 ? c[1] : a[1] + (c[1] - a[1]) * (s - a[0]) / (c[0] - a[0]); }
      }
      return P[P.length - 1][1];
    };
    const S = [], out = [];
    for (const s of P1.map((x) => x[0]).concat(P2.map((x) => x[0])).sort((x, y) => x - y)) if (!S.length || s - S[S.length - 1] > 1e-9) S.push(s);
    S.forEach((s, i) => {
      if (i) {
        const sp = S[i - 1], d0 = f(P1, sp) - f(P2, sp), d1 = f(P1, s) - f(P2, s);
        if (d0 * d1 < 0 && Math.abs(d0) > 1e-9 && Math.abs(d1) > 1e-9) { const sx = sp + (s - sp) * d0 / (d0 - d1); out.push([sx, f(P1, sx)]); }
      }
      out.push([s, max(f(P1, s), f(P2, s))]);
    });
    return simplifyProfile(out);
  }

  /* Lichte Höhe aller Ebenen plus Zwischendecken: UK Decke bis OK Rohboden der untersten Ebene. */
  function innerHeight(p) {
    return M.levelGeoms(p).reduce((s, L) => s + L.H + (L.idx ? L.tSlab : 0), 0);
  }

  function levels(p) {
    const b = p.build, ins = b.insulation;
    const mound = moundOf(p), hM = mound.h;
    const zRoofTop = hM - (b.cover + (ins.roof || 0));
    const zCeil = zRoofTop - b.tRoof;
    // Ebenen von oben nach unten: UK Decke bzw. Zwischendecke, OK Rohboden
    const lvl = [];
    let z = zCeil;
    for (const L of M.levelGeoms(p)) {
      const zc = L.idx ? z - L.tSlab : z;
      lvl.push({ idx: L.idx, name: L.name, H: L.H, tSlab: L.idx ? L.tSlab : 0, zCeil: zc, zFloorTop: zc - L.H, zSlabTop: L.idx ? z : zRoofTop });
      z = zc - L.H;
    }
    const zFloorTop = z, zEntry = lvl[0].zFloorTop;
    const zSlabBot = zFloorTop - b.tFloor;
    const zInsBot = zSlabBot - (ins.floor || 0);
    const zBlindBot = zInsBot - b.blinding;
    const zPit = zBlindBot - b.gravel;
    const water = waterOf(p.site);
    return { zRoofTop, zCeil, zFloorTop, zEntry, Hint: zCeil - zFloorTop, levels: lvl, zSlabBot, zInsBot, zBlindBot, zPit, zW: water.z, water, depth: -zPit, hM, mound };
  }

  /* ---------- Geometrie ---------- */

  function geometry(p, lv) {
    const b = p.build;
    const out = G.ensureCCW(p.geom.outline);
    const n = out.length, tW = b.tWall;
    const inner = G.offsetPolygon(out, -tW);
    let valid = G.signedArea(inner) > 0.01;
    for (let i = 0; i < n && valid; i++) {
      const e1 = G.sub(out[(i + 1) % n], out[i]), e2 = G.sub(inner[(i + 1) % n], inner[i]);
      if (G.dot(e1, e2) <= 1e-9) valid = false;
    }
    const A = G.area(out), P = G.perimeter(out);
    const Ain = valid ? G.area(inner) : 0, Pin = valid ? G.perimeter(inner) : 0;
    const slab = b.overhang > 0 ? G.offsetPolygon(out, b.overhang) : out.slice();
    const Aslab = G.area(slab), Pslab = G.perimeter(slab);
    let convex = 0;
    for (let i = 0; i < n; i++) {
      const e1 = G.sub(out[i], out[(i - 1 + n) % n]), e2 = G.sub(out[(i + 1) % n], out[i]);
      if (G.cross(e1, e2) > 0) convex++;
    }

    const base = { out, inner, valid, n, tW };
    const labels = labelsOf(p);
    const vert = vertGeoms(p, base, lv);
    const L = M.levelGeoms(p).map((Lg) => levelGeo(p, base, Lg, vert, labels));
    const L0 = L[0];
    const geo = Object.assign({ out, inner, valid, n, A, P, Ain, Pin, slab, Aslab, Pslab, convex, tW, labels, L, vert }, {
      walls: L0.walls, gridAll: L0.gridAll, gridBear: L0.gridBear, footAll: L0.footAll, footStb: L0.footStb, footMw: L0.footMw, footTb: L0.footTb, rooms: L0.rooms, Anet: L0.Anet,
    });
    L0.openings = geo.openings = L0.openings;
    geo.access = p.geom.access.map((a) => accessGeom(p, geo, lv, a)).filter(Boolean);
    geo.openings.push(...geo.access.map((a) => a.opening).filter(Boolean));
    // Summen über alle Ebenen
    geo.tot = {
      Anet: L.reduce((s, x) => s + x.Anet, 0), V: L.reduce((s, x) => s + x.Anet * x.H, 0),
      rooms: L.reduce((s, x) => s + x.rooms.filter((r) => !r.shaft).length, 0), levels: L.length,
    };
    return geo;
  }

  /* Grundriss einer Ebene: Wände (beschnitten), Raster, Räume, Öffnungen, Stützen. */
  function levelGeo(p, base, Lg, vert, labels) {
    const { inner, valid } = base, H = Lg.H;
    const own = Lg.walls.map((w) => Object.assign({}, w, { level: Lg.idx }));
    // Schachtwände der Aufzüge auf dieser Ebene (tragend, automatisch)
    for (const v of vert.lifts) if (Lg.idx >= v.wallTop && Lg.idx <= v.levelBot) own.push(...v.walls.map((w) => Object.assign({}, w, { level: Lg.idx, id: w.id + '_' + Lg.idx, auto: v.id })));
    const walls = own.map((w) => {
      const segs = valid ? G.clipSegment(w.a, w.b, inner) : [];
      const len = segs.reduce((s, q) => s + G.dist(q.a, q.b), 0);
      return Object.assign(w, { segs, len, info: M.WALL_KINDS[w.kind] || M.WALL_KINDS.mw });
    });
    const gw = (list) => list.flatMap((w) => w.segs.map((s) => ({ a: s.a, b: s.b, t: w.t })));
    const gridAll = valid ? G.cellGrid(inner, gw(walls)) : null;
    const stbWalls = walls.filter((w) => w.info.bearing);
    const gridBear = valid ? G.cellGrid(inner, gw(stbWalls)) : null;
    const footAll = gridAll ? gridAll.blockedArea : 0;
    const footStb = gridBear ? gridBear.blockedArea : 0;
    const nonStb = walls.filter((w) => !w.info.bearing);
    const nonStbSum = nonStb.reduce((s, w) => s + w.len * w.t, 0) || 1;
    const footNon = max(0, footAll - footStb);
    nonStb.forEach((w) => { w.foot = footNon * (w.len * w.t) / nonStbSum; });
    const footMw = nonStb.filter((w) => w.kind === 'mw').reduce((s, w) => s + w.foot, 0);
    const footTb = nonStb.filter((w) => w.kind === 'tb').reduce((s, w) => s + w.foot, 0);
    // Löcher in der Platte unter dieser Ebene (Treppenaugen) und Schächte, die durch die Ebene laufen
    const holesBelow = vert.stairs.filter((st) => st.upper === Lg.idx).map((st) => st.hole);
    const shaftHere = vert.lifts.filter((v) => Lg.idx >= v.wallTop && Lg.idx <= v.levelBot);
    // Räume
    let rooms = [];
    if (gridAll) {
      rooms = gridAll.comps.map((c, i) => ({ comp: i, area: c.area, name: null, id: null, label: G.compLabelPoint(gridAll, c), bbox: c }));
      for (const r of Lg.rooms) {
        const ci = G.compAt(gridAll, r);
        if (ci >= 0 && !rooms[ci].name) Object.assign(rooms[ci], { name: r.name, id: r.id, label: { x: r.x, y: r.y } });
      }
      for (const v of shaftHere) {
        const ci = G.compAt(gridAll, { x: v.x, y: v.y });
        if (ci >= 0 && !rooms[ci].name) Object.assign(rooms[ci], { name: T_('Aufzugsschacht'), shaft: v.id, label: { x: v.x, y: v.y } });
      }
      rooms = rooms.filter((r) => r.area >= 0.25 || r.name);
      let k = 1;
      rooms.forEach((r) => { if (!r.name) r.name = 'Raum ' + (k++); r.volume = r.area * H; r.level = Lg.idx; });
    }
    const holeA = holesBelow.reduce((s, h) => s + G.area(h), 0);
    const shaftA = shaftHere.reduce((s, v) => s + v.wIn * v.dIn, 0);
    const Anet = max(0, (gridAll ? gridAll.comps.reduce((s, c) => s + c.area, 0) : 0) - holeA - shaftA);
    const beams = (Lg.beams || []).map((u) => {
      const segs = valid ? G.clipSegment(u.a, u.b, inner) : [];
      return Object.assign({}, u, { level: Lg.idx, segs, len: segs.reduce((sm, q) => sm + G.dist(q.a, q.b), 0) });
    });
    const lg = { idx: Lg.idx, name: Lg.name, H, tSlab: Lg.tSlab, walls, gridAll, gridBear, footAll, footStb, footMw, footTb, rooms, Anet, holesBelow,
      columns: (Lg.columns || []).map((c) => Object.assign({}, c, { level: Lg.idx })), zones: Lg.zones || [], beams };
    const geoLike = { out: base.out, n: base.n, tW: base.tW, walls };
    lg.openings = Lg.openings.map((o) => Object.assign(placeOpening(geoLike, o, H), { level: Lg.idx }));
    // Schachttüren der Aufzüge
    for (const v of shaftHere) if (v.door && Lg.idx >= v.levelTop) lg.openings.push(Object.assign(placeOpening(geoLike, { id: v.id + ':tuer' + Lg.idx, host: 'w:' + v.door.wall + '_' + Lg.idx, pos: v.door.pos, w: v.src.door, h: min(2.1, H), sill: 0, kind: 'innen', lift: v.id }, H), { level: Lg.idx }));
    return lg;
  }

  /* Innentreppen und Aufzüge (über mehrere Ebenen). Grundriss je Element, Treppenauge in der Zwischendecke, Schachtwände. */
  function vertGeoms(p, base, lv) {
    const out = { stairs: [], lifts: [] };
    const lvl = lv.levels, nL = lvl.length;
    const rot = (dir) => ({ 0: { x: 1, y: 0 }, 90: { x: 0, y: 1 }, 180: { x: -1, y: 0 }, 270: { x: 0, y: -1 } }[dir] || { x: 1, y: 0 });
    for (const v of p.geom.verts || []) {
      const u = rot(v.dir), nrm = { x: -u.y, y: u.x };
      if (v.kind === 'treppe') {
        const up = v.upper, lo = up + 1;
        if (lo >= nL) continue;
        const dh = lvl[up].zFloorTop - lvl[lo].zFloorTop;
        const nr = max(2, ceil(dh / 0.18 - 1e-9)), rise = dh / nr, tread = clamp(0.63 - 2 * rise, 0.25, 0.32);
        const run = (nr - 1) * tread, w = v.w, P0 = { x: v.x, y: v.y };
        // Lauf beginnt an (x, y) auf der oberen Ebene, Antritt unten nach run; Austrittspodest oben vor dem Lauf
        const corner = (s, t) => G.add(G.add(P0, G.mul(u, s)), G.mul(nrm, t));
        const box = (s0, s1) => [corner(s0, -w / 2), corner(s1, -w / 2), corner(s1, w / 2), corner(s0, w / 2)];
        const foot = box(-v.landing, run + v.landing), footLower = box(0, run + v.landing);
        // Treppenauge: über dem Lauf, so lang, dass 2,0 m Kopfhöhe bleiben
        const tAbove = lvl[lo].tSlab, need = 2.0 + tAbove;
        const sFree = clamp(run - (dh - need) / rise * tread, 0, run);
        const hole = [corner(-0.05, -w / 2 - 0.05), corner(sFree + 0.6, -w / 2 - 0.05), corner(sFree + 0.6, w / 2 + 0.05), corner(-0.05, w / 2 + 0.05)];
        const footUpper = box(-v.landing, sFree + 0.6);
        // Laufplatte als Einfeldplatte zwischen Deckenrand (oben) und Fußboden (unten), Auflagertiefe je 10 cm; Dicke aus der Bemessung
        const Ls = Math.hypot(run, dh), span = run + 0.2;
        const conc = M.CONCRETE[p.build.concrete] || M.CONCRETE['C30/37'];
        const qT = max((p.use.people || 0) > 50 ? 5.0 : 3.0, p.use.interiorQ || 0); // DIN EN 1991-1-1/NA Kat. T1 bzw. T2
        // Betondeckung der Laufplatte: Verbund (c ≥ Ø + 10 mm) und Feuerwiderstand (R 90: 30 mm, R 120: 35 mm)
        const fcS = p.build.fireClass || 'R90', cS = fcS === 'R120' ? 0.035 : fcS === 'R90' ? 0.03 : 0.025;
        const design = BP.verify ? BP.verify.stair({ span, rise, tread, q: qT, fck: conc.fck, fctm: conc.fctm, cnom: cS }) : null;
        const tWaist = design && design.t ? design.t : 0.18;
        const line = (s0) => ({ a: corner(s0, -w / 2), b: corner(s0, w / 2) });
        out.stairs.push({ id: v.id, src: v, upper: up, lower: lo, u, nrm, w, nr, rise, tread, run, dh, foot, footLower, footUpper, hole, sFree, Ls, tWaist, landing: v.landing,
          V: w * Ls * tWaist + nr * tread * rise / 2 * w + 2 * v.landing * w * tWaist, span, design, qT,
          topLine: line(-0.1), footLine: line(run), reaction: design && design.gk ? { g: design.gk * span / 2, q: design.qk * span / 2 } : { g: 25 * tWaist * span / 2 + 3, q: qT * span / 2 } });
      } else if (v.kind === 'aufzug') {
        const top = v.top < 0 ? 0 : v.top, bot = Math.min(v.bottom, nL - 1);
        if (bot < top) continue;
        // Schacht innen: Kabine + Gegengewicht bzw. Zylinder und Führungsschienen + Türzone (Richtwerte EN 81-20)
        const sz = BP.lifts ? BP.lifts.shaftSize(v) : { wIn: v.w + 0.5, dIn: v.d + 0.3 };
        const wIn = sz.wIn, dIn = sz.dIn, t = v.tw;
        const c = (s, q) => G.add(G.add({ x: v.x, y: v.y }, G.mul(u, s)), G.mul(nrm, q));
        // Wandachsen um den Schacht (u: Tiefe zur Tür hin, nrm: Breite)
        const hx = dIn / 2 + t / 2, hy = wIn / 2 + t / 2;
        const pts = [c(-hx, -hy), c(hx, -hy), c(hx, hy), c(-hx, hy)];
        const walls = pts.map((a, i) => ({ id: v.id + 'w' + i, a, b: pts[(i + 1) % 4], t, kind: 'stb' }));
        // Tür in der Wand auf der +u-Seite (Wand 1: von c(hx,-hy) nach c(hx,hy))
        const door = { wall: v.id + 'w1', pos: hy };
        // Auslegung: Kabine, Grube, Schachtkopf, Antrieb; Schachtkopf über der obersten Haltestelle
        const toSurface = v.top < 0, zSurface = lv.mound && lv.mound.on ? lv.mound.at({ x: v.x, y: v.y }) : 0;
        const des = BP.lifts ? BP.lifts.design(v, { levels: lvl, top, bottom: bot, toSurface, zSurface }) : null;
        const Htop = lvl[top].H, headOver = des && !toSurface ? max(0, des.head - Htop) : 0;
        const wallTop = headOver > 1e-9 && top > 0 ? top - 1 : top; // Schachtkopf reicht in die Ebene darüber
        const roofBox = headOver > 1e-9 && top === 0; // Schachtkopf als Betonkasten über der Decke
        out.lifts.push({ id: v.id, src: v, x: v.x, y: v.y, u, nrm, wIn, dIn, t, walls, door, levelTop: top, levelBot: bot, wallTop, toSurface, roofBox, headOver, zSurface, design: des,
          outerPoly: [c(-hx - t / 2, -hy - t / 2), c(hx + t / 2, -hy - t / 2), c(hx + t / 2, hy + t / 2), c(-hx - t / 2, hy + t / 2)],
          innerPoly: [c(-dIn / 2, -wIn / 2), c(dIn / 2, -wIn / 2), c(dIn / 2, wIn / 2), c(-dIn / 2, wIn / 2)] });
      }
    }
    return out;
  }

  /* Lesbare Namen für Meldungen, Listen und Auswahl: fortlaufende Nummer in Eingabereihenfolge
   * (Treppen und Notausstiege nur nummeriert, wenn es mehrere gibt). */
  function labelsOf(p) {
    const L = {};
    const lvs = M.levelGeoms(p), multi = lvs.length > 1;
    for (const Lg of lvs) {
      const suf = multi ? ' ' + T_('(E{n})', { n: Lg.idx + 1 }) : '';
      Lg.walls.forEach((w, i) => { L['w:' + w.id] = T_('Innenwand {n}', { n: i + 1 }) + suf; });
      Lg.openings.forEach((o, i) => { L['o:' + o.id] = T_('Öffnung {n}', { n: i + 1 }) + suf; });
      (Lg.columns || []).forEach((c, i) => { L['c:' + c.id] = T_('Stütze {n}', { n: i + 1 }) + suf; });
      (Lg.beams || []).forEach((u, i) => { L['b:' + u.id] = T_('Unterzug {n}', { n: i + 1 }) + suf; });
    }
    (p.geom.verts || []).forEach((v, i) => { L['v:' + v.id] = T_(v.kind === 'treppe' ? 'Innentreppe {n}' : 'Aufzug {n}', { n: i + 1 }); });
    for (const [kind, name] of [['treppe', N_('Treppe')], ['schacht', N_('Notausstieg')]]) {
      const list = p.geom.access.filter((a) => a.kind === kind);
      list.forEach((a, i) => { L['a:' + a.id] = T_(name) + (list.length > 1 ? ' ' + (i + 1) : ''); });
    }
    return L;
  }
  const wallLabel = (geo, id) => geo.labels['w:' + id] || T_('Innenwand');
  const accessLabel = (geo, id) => geo.labels['a:' + id] || T_('Zugang');
  const openingLabel = (geo, o) => (o.access ? T_(o.kind === 'luke' ? 'Luke am {a}' : 'Tür an der {a}', { a: accessLabel(geo, o.access) }) : o.lift ? T_('Schachttür {lift} (E{n})', { lift: geo.labels['v:' + o.lift] || T_('Aufzug'), n: o.level + 1 }) : geo.labels['o:' + o.id] || T_('Öffnung'));
  /* Ebenenname für Meldungen: „Ebene 2 „Lager““ */
  const levelName = (geo, i) => { const L = geo.L[i]; return L && i > 0 && L.name && !/^Ebene \d+$/.test(L.name) ? T_('Ebene {n} „{name}“', { n: i + 1, name: L.name }) : T_('Ebene {n}', { n: i + 1 }); };
  /* Bauteilnamen sind Schlüssel (Stahlliste, Betonierabschnitte) und bleiben deutsch; übersetzt wird erst in der Meldung */
  const elName = (n) => { const m = /^(Zwischendecke über Ebene|Wände Ebene) (\d+)$/.exec(n || ''); return !m ? (n ? T_(n) : n) : m[1] === 'Wände Ebene' ? T_('Wände Ebene {n}', { n: m[2] }) : T_('Zwischendecke über Ebene {n}', { n: m[2] }); };
  /* Räume ohne Namen heißen „Raum 3“ (Schlüssel für die Prüfung unbenannter Räume, bleibt deutsch) */
  /* Texte, die zur Laufzeit als Schlüssel entstehen und erst bei der Anzeige übersetzt werden (hier für die Übersetzung
   * registriert): Lastfälle der FE-Rechnung, Lagen der Grundbewehrung, Lagerarten der Unterzüge, Eckausbildung der Wände. */
  void [N_('G'), N_('Q'), N_('Q±'), N_('W'), N_('E'), N_('G direkt'), N_('Q innen'), N_('Wasser'), N_('S0'), N_('SX'), N_('SY'),
    N_('Grundbewehrung oben, Richtung x'), N_('Grundbewehrung oben, Richtung y'), N_('Grundbewehrung unten, Richtung x'), N_('Grundbewehrung unten, Richtung y'),
    N_('aussen'), N_('stuetze'), N_('wand'), N_('eingespannt'), N_('gelenkig'), N_('Innentreppen'),
    N_('Erdarbeiten'), N_('Beton & Schalung'), N_('Bewehrung'), N_('Abdichtung & Dämmung'), N_('Ausbau & Zugänge'), N_('Technik'), N_('Schutztechnik'),
    N_('Schutzaufbau'), N_('Baustelle'), N_('Stk'), N_('Tag'), N_('psch'), N_('Einsatz'), N_('m³ lose'), N_('m/AT'), N_('m²/AT'), N_('m³/AT'), N_('t/AT')];
  /* Kostenkategorien (deutsche Schlüssel) für die Anzeige; „Technik“ ist dort Haustechnik, nicht der Raum */
  const catText = (k) => (k === 'Technik' ? T_('Technik@@Kategorie') : T_(k));
  /* Bezeichnungen der Bewehrungslagen (deutsche Schlüssel) für die Anzeige */
  const labelText = (s) => {
    const m = /^(Feld|Rand), Richtung (\w+)$/.exec(s || '');
    if (m) return m[1] === 'Feld' ? T_('Feld, Richtung {dir}', { dir: m[2] }) : T_('Rand, Richtung {dir}', { dir: m[2] });
    return I18.maybe(s);
  };
  const roomName = (n) => {
    const m = /^Raum (\d+)$/.exec(n || '');
    if (m) return T_('Raum {n}', { n: m[1] });
    if (I18.known(n)) return I18.maybe(n);
    // Vorschlagsnamen mit Kennung („Sanitär A1“, „Vorrat Technik“): Wortteil übersetzen, Kennung behalten
    const t = /^(.*\S) (\S+)$/.exec(n || '');
    return t && I18.known(t[1]) ? T_(t[1]) + ' ' + I18.maybe(t[2]) : n;
  };

  function hostLine(geo, host) {
    if (typeof host !== 'string') return null;
    if (host.startsWith('e:')) {
      const i = +host.slice(2);
      if (!(i >= 0 && i < geo.n)) return null;
      const a = geo.out[i], b = geo.out[(i + 1) % geo.n];
      return { type: 'outer', edge: i, a, b, len: G.dist(a, b), t: geo.tW, u: G.norm(G.sub(b, a)), nrm: G.edgeNormal(a, b), lo: geo.tW, hi: G.dist(a, b) - geo.tW };
    }
    if (host.startsWith('w:')) {
      const w = geo.walls.find((x) => x.id === host.slice(2));
      if (!w) return null;
      const u = G.norm(G.sub(w.b, w.a));
      return { type: 'wall', wall: w, a: w.a, b: w.b, len: G.dist(w.a, w.b), t: w.t, u, nrm: { x: u.y, y: -u.x }, lo: 0, hi: G.dist(w.a, w.b) };
    }
    return null;
  }

  function placeOpening(geo, o, H) {
    const hl = hostLine(geo, o.host);
    if (!hl) return Object.assign({}, o, { invalid: T_('Bezugswand fehlt') });
    const w = min(o.w, max(0.1, hl.hi - hl.lo));
    let pos = Math.max(hl.lo + w / 2, Math.min(hl.hi - w / 2, o.pos));
    const sill = max(0, o.sill || 0);
    const h = min(o.h, H - sill);
    const p0 = G.add(hl.a, G.mul(hl.u, pos - w / 2)), p1 = G.add(hl.a, G.mul(hl.u, pos + w / 2));
    return Object.assign({}, o, { w, h, sill, pos, p0, p1, hl, t: hl.t, outer: hl.type === 'outer', shifted: Math.abs(pos - o.pos) > 1e-6 });
  }

  /* Lage auf der Kante so begrenzen, dass Bauwerk und Tür bzw. Luke ganz auf der Wand liegen (Abstand m zu beiden Ecken). */
  const placeOnEdge = (len, m, pos) => (2 * m <= len ? Math.max(m, Math.min(len - m, pos)) : len / 2);

  /* Zugangsbauwerke außerhalb der Hülle: gerade Treppe oder Notausstiegsschacht. */
  function accessGeom(p, geo, lv, acc) {
    const n = geo.n;
    if (!(acc.edge >= 0 && acc.edge < n)) return null;
    const a = geo.out[acc.edge], b = geo.out[(acc.edge + 1) % n];
    const len = G.dist(a, b), u = G.norm(G.sub(b, a)), nn = G.edgeNormal(a, b);
    if (len < 1e-6) return null; // Kante ohne Länge (doppelter Eckpunkt)
    const tw = acc.tw || 0.25, tS = 0.25, H = p.build.clearHeight;
    const dh = max(0, -lv.zEntry);
    const mo = lv.mound;
    const r = { id: acc.id, kind: acc.kind, edge: acc.edge, src: acc, u, nn, tw, tS };
    if (acc.kind === 'treppe') {
      const w = acc.width, W = w + 2 * tw;
      const pos = placeOnEdge(len, max(W / 2, geo.tW + w / 2), acc.pos);
      const C = G.add(a, G.mul(u, pos));
      const nr = dh < 0.09 ? 0 : max(2, ceil(dh / 0.18 - 1e-9));
      const rise = nr ? dh / nr : 0;
      const tread = Math.max(0.25, Math.min(0.32, 0.63 - 2 * rise));
      const run = max(0, (nr - 1) * tread), landing = acc.landing || 1.2, L = landing + run;
      const zb = lv.zEntry - tS;
      // Erdhügel: Einschnitt mit Stützwänden bis zum Hügelfuß, Wandkronen folgen der Hügeloberfläche an der jeweiligen Wand
      const edgeL = G.add(C, G.mul(u, -W / 2)), edgeR = G.add(C, G.mul(u, W / 2));
      const Lcut = max(L, mo.reach(edgeL, nn), mo.reach(edgeR, nn));
      const profL = mo.profile(edgeL, nn, 0, Lcut), profR = mo.profile(edgeR, nn, 0, Lcut);
      const sideOf = (prof) => [{ x: 0, y: zb }, { x: landing, y: zb }, { x: L, y: -tS }].concat(Lcut > L + 1e-6 ? [{ x: Lcut, y: -tS }] : [], prof.slice().reverse().map(([s, z]) => ({ x: s, y: FB + z })))
        .filter((pt, i, arr) => !i || G.dist(pt, arr[i - 1]) > 1e-9);
      const sideL = sideOf(profL), sideR = sideOf(profR), side = sideOf(maxProfile(profL, profR));
      const sideArea = G.area(sideL) + G.area(sideR);
      const Ls = Math.hypot(run, dh);
      const vPass = W * (Lcut - L) * tS;
      const vSide = sideArea * tw, vLand = W * landing * tS + vPass, vWaist = w * Ls * tS, vSteps = nr * tread * rise / 2 * w;
      const gross = G.area([{ x: 0, y: zb }, { x: landing, y: zb }, { x: L, y: -tS }, { x: L, y: 0 }, { x: 0, y: 0 }]) * W;
      Object.assign(r, {
        pos, C, w, W, L, Lcut, landing, run, nr, rise, tread, Ls, side, sideL, sideR, profL, profR, zb,
        V: vSide + vLand + vWaist + vSteps, parts: { vSide, vLand, vWaist, vSteps },
        fw: 2 * sideArea + w * Ls + nr * rise * w + 2 * (W + landing + (Lcut - L)) * tS,
        gross,
        foot: [G.add(C, G.mul(u, -W / 2)), G.add(C, G.mul(u, W / 2)), G.add(G.add(C, G.mul(u, W / 2)), G.mul(nn, Lcut)), G.add(G.add(C, G.mul(u, -W / 2)), G.mul(nn, Lcut))],
        hatch: acc.cover === 'klappe' && nr > 0 ? W * L : 0,
        railing: acc.cover === 'klappe' && nr > 0 ? 2 * (Lcut - L) : 2 * Lcut + W,
        opening: placeOpening(geo, { id: acc.id + ':tuer', host: 'e:' + acc.edge, pos, w, h: min(2.0, H), sill: 0, kind: 'schutztuer', access: acc.id }, H),
      });
      r.excDepthAt = (s) => (s <= landing ? -zb : run <= 1e-9 ? tS : Math.max(0, -(zb + Math.min(1, (s - landing) / run) * (-tS - zb)))) + 0.1;
      return r;
    }
    // Notausstiegsschacht
    const wx = acc.width || 0.8, wy = acc.depth || 0.8, W = wx + 2 * tw, D = wy + tw;
    const pos = placeOnEdge(len, max(W / 2, geo.tW + min(acc.lw || 0.6, wx) / 2), acc.pos);
    const C = G.add(a, G.mul(u, pos));
    const zTopShaft = FB + mo.at(C); // Schachtkopf über OK Gelände bzw. Hügel
    const h = dh + zTopShaft;
    const vWalls = h * (W * D - wx * wy), vSlab = W * D * tS;
    Object.assign(r, {
      pos, C, w: wx, W, D, wy, h, zTop: zTopShaft,
      V: vWalls + vSlab, parts: { vWalls, vSlab },
      fw: h * (2 * wy + wx + 2 * D + W) + 2 * (W + D) * tS,
      gross: W * D * (dh + tS),
      foot: [G.add(C, G.mul(u, -W / 2)), G.add(C, G.mul(u, W / 2)), G.add(G.add(C, G.mul(u, W / 2)), G.mul(nn, D)), G.add(G.add(C, G.mul(u, -W / 2)), G.mul(nn, D))],
      lid: (wx + 0.2) * (wy + 0.2),
      rungs: max(0, Math.floor((h - 0.3) / 0.28) + 1),
      opening: placeOpening(geo, { id: acc.id + ':luke', host: 'e:' + acc.edge, pos, w: min(acc.lw || 0.6, wx), h: acc.lh || 0.8, sill: acc.sill || 0, kind: 'luke', access: acc.id }, H),
    });
    r.excDepthAt = () => dh + tS + 0.1;
    return r;
  }

  /* ---------- Bemessung ---------- */

  /* Baustoffkennwerte nach der Norm des Projekts (Eurocode: fcd = αcc·fck/γc, fyd = fyk/γs; Zwang früh 0,5·fctm, sonst fctm,
   * nach NA DE mindestens 3 MPa; Betondeckung der Stützenbügel nach Feuerwiderstand, DIN EN 1992-1-2 Tab. 5.2a) */
  function material(p) {
    const c = M.CONCRETE[p.build.concrete] || M.CONCRETE['C30/37'];
    return Object.assign({ name: p.build.concrete }, NC.material(c, p.build));
  }

  const lapLength = (phi, mat, poorBond) => NC.lap(phi, mat, poorBond);

  /* Rissbreite unter quasi-ständiger Last, direkte Berechnung nach EC2 7.3.4: gerissener Querschnitt (αe = 15 für Langzeit), kt = 0,4;
   * Rissabstand nach NA DE sr,max = φ/(3,6·ρeff) ≤ σs·φ/(3,6·fct,eff), sonst EN Gl. 7.11: 3,4·c + 0,425·k1·k2·φ/ρeff (k1 = 0,8, k2 = 0,5). */
  function crackWidth(mqp, h, d, phi, s, mat) {
    const As = asBar(phi) / s * 1e-4, Es = 200000, Ecm = 22000 * Math.pow((mat.fck + 8) / 10, 0.3);
    const rho = As / d, aL = 15, ae = Es / Ecm;
    const x = aL * rho * d * (Math.sqrt(1 + 2 / (aL * rho)) - 1);
    const sigma = mqp / (As * (d - x / 3)) / 1000; // MPa
    const hcef = min(2.5 * (h - d), (h - x) / 3, h / 2), rhoEff = As / hcef, fct = mat.fctm;
    const eps = max((sigma - 0.4 * fct / rhoEff * (1 + ae * rhoEff)) / Es, 0.6 * sigma / Es);
    const sr = NC.crack === 'DE' ? min(phi / (3.6 * rhoEff), sigma * phi / (3.6 * fct)) : 3.4 * max(0, (h - d) * 1000 - phi / 2) + 0.17 * phi / rhoEff;
    return { wk: sr * eps, sigma, sr };
  }

  /* extraMin: Zahl oder Funktion der Nutzhöhe d (z. B. Bewehrung aus dem Lastfall Luftstoß).
   * mqp: Moment unter quasi-ständiger Last für den Rissbreitennachweis (ctx.wkLoad = zulässige Rissbreite in mm). */
  function designLayer(m, h, ctx, offset, extraMin, restraint, extraLabel, mqp) {
    let best = null, cheapest = Infinity, crackBlocked = false, exBlocked = 0, tried = 0;
    const kCrack = interp([0.3, 0.8], [1.0, 0.65], h);
    for (const phi of DIAS) {
      if (phi < (ctx.minDia || 8) || phi > (ctx.maxDia || 25)) continue;
      const d = h - ctx.cnom - phi / 2000 - offset;
      if (d <= 0.04) continue;
      tried++;
      // extraMin(d) liefert eine Zahl oder { as, label } (z. B. Längsbewehrung für Querkraft)
      const exR = typeof extraMin === 'function' ? extraMin(d) : (extraMin || 0);
      const asExtra = exR && typeof exR === 'object' ? exR.as : exR;
      const exLabel = exR && typeof exR === 'object' ? exR.label : extraLabel;
      if (!isFinite(asExtra)) { exBlocked++; continue; }
      const mu = m / (d * d * ctx.mat.fcd * 1000);
      const omega = 1 - Math.sqrt(Math.max(0, 1 - 2 * min(mu, 0.5)));
      const asUls = omega * d * ctx.mat.fcd / ctx.mat.fyd * 1e4;
      const asMin = ctx.noMin ? 0 : NC.asMin(h, d, ctx.mat);
      let asCrack = 0, asRestr = 0;
      if (ctx.wu) {
        // Biegerisse (EC2 7.3.2): kc = 0,4, Act = h/2; Stahlspannung nach NA DE (geschlossen) bzw. EN Tab. 7.2N
        const sigma = NC.sigmaCrack(ctx.wk, phi, ctx.mat.fctm, h, d, false);
        asCrack = 0.4 * kCrack * ctx.mat.fctm * (h / 2) / sigma * 1e4;
        if (restraint && ctx.restraint) {
          const fct = ctx.mat.fctEffR, sR = NC.sigmaCrack(ctx.wk, phi, fct, h, d, true);
          // Zentrischer Zwang: NA DE 7.3.2 (NA.5) dicke Bauteile je Seite fct,eff·hef/σs ≥ k·fct,eff·(h/2)/fyk; EN kc = 1,0: k·fct,eff·(h/2)/σs
          if (NC.crack === 'DE') { const hef = min(2.5 * (ctx.cnom + phi / 2000), h / 2); asRestr = max(fct * hef / sR, kCrack * fct * (h / 2) / 500) * 1e4; }
          else asRestr = kCrack * fct * (h / 2) / sR * 1e4;
        }
      }
      const req0 = max(asUls, asMin, asCrack, asRestr, asExtra);
      // Normen mit Grenzen je Stababstand (SIA 262: zulässige Stahlspannung σs,adm(s); ACI 318: größter Stababstand)
      const bySp = NC.crackSpacing ? NC.crackSpacing(ctx, phi, h, d, !!(restraint && ctx.restraint)) : null;
      let found = false;
      for (const s of SPACINGS) {
        if (s > ctx.sMax + 1e-9) continue;
        const prov = asBar(phi) / s;
        const cs = bySp ? bySp(s) : null;
        if (cs && !cs.ok) continue;
        const aC = cs ? cs.asCrack : asCrack, aR = cs ? cs.asRestr : asRestr, req = cs ? max(asUls, asMin, aC, aR, asExtra) : req0;
        if (prov + 1e-9 < req) continue;
        cheapest = min(cheapest, prov);
        let cw = null;
        if (ctx.wkLoad && mqp > 0) {
          cw = crackWidth(mqp, h, d, phi, s, ctx.mat);
          const okQp = cs && cs.sigmaAdm ? cw.sigma <= cs.sigmaAdm + 1e-9 : cs ? true : cw.wk <= ctx.wkLoad + 1e-9;
          if (!okQp) { crackBlocked = true; continue; }
        }
        const governs = req === asUls ? T_('Biegung') : req === aR ? T_('Zwang (Rissbreite)') : req === aC ? T_('Rissbreite') : req === asMin ? T_('Mindestbewehrung') : (exLabel ? T_(exLabel) : T_('konstruktiv'));
        const cand = { phi, s, d, mu, muOk: mu <= NC.muLim, asUls, asMin, asCrack: aC, asRestr: aR, asExtra, req, prov, governs, m, mqp: mqp || 0, wkLoad: cw ? cw.wk : null, sigQp: cw ? cw.sigma : null, sigAdm: cs ? cs.sigmaAdm : null };
        found = true;
        if (!best || prov < best.prov - 1e-6 || (Math.abs(prov - best.prov) < 1e-6 && s > best.s)) best = cand;
      }
      // nicht verlegbar allein wegen der Zusatzanforderung (z. B. Luftstoß)
      if (!found && asExtra > max(asUls, asMin, asCrack, asRestr) && !bySp) exBlocked++;
    }
    if (!best) {
      const phi = ctx.maxDia || 25, s = SPACINGS[0], d = h - ctx.cnom - phi / 2000 - offset;
      const mu = m / (d * d * ctx.mat.fcd * 1000);
      const asUls = (1 - Math.sqrt(Math.max(0, 1 - 2 * min(mu, 0.5)))) * d * ctx.mat.fcd / ctx.mat.fyd * 1e4;
      const cw = ctx.wkLoad && mqp > 0 ? crackWidth(mqp, h, d, phi, s, ctx.mat) : null;
      best = { phi, s, d, mu, muOk: mu <= NC.muLim, asUls, asMin: 0, asCrack: 0, asRestr: 0, asExtra: 0, req: Infinity, prov: asBar(phi) / s, governs: crackBlocked ? T_('Rissbreite unter Last nicht einhaltbar') : T_('nicht bemessbar'), m, mqp: mqp || 0, wkLoad: cw ? cw.wk : null, sigQp: cw ? cw.sigma : null, fail: true, failReason: crackBlocked && isFinite(cheapest) ? 'crack' : tried > 0 && exBlocked === tried ? 'acc' : 'uls' };
    } else if (best.prov > cheapest + 1e-6) best.governs = T_('Rissbreite unter Last');
    return best;
  }

  /* Querkraft ohne Querkraftbewehrung je m (Eurocode 6.2.2 mit den nationalen Werten CRd,c und vmin) */
  function shearCheck(vEd, d, asProv, mat, m) {
    const vRd = NC.vRdc(asProv * 1e-4 / d, d, mat, true, m);
    return { vEd, vRd, eta: vEd / vRd };
  }

  /* Längsbewehrung, mit der vRd,c die Querkraft vEd aufnimmt (ρl ≤ 2 %); 0, wenn vRd,c,min reicht oder 2 % nicht genügen */
  function asForShear(vEd, d, mat, m) {
    const rho = NC.rhoForShear(vEd, d, mat, m);
    return rho > 0 && rho <= 0.02 ? rho * d * 1e4 * 1.0001 : 0;
  }

  /* Biegeschlankheit (Eurocode 7.4.2, Gl. 7.16; NA DE zusätzlich l/d ≤ K·35 und ≤ K²·150/l); asReq in cm² je m Breite.
   * Ohne K: Grundwert mit K = 1 (Platten, Tafelverfahren). */
  const deflectionCheck = (l, d, asReq, mat, K) => NC.defl(l, d, asReq, mat, K);

  /* Plattenfelder aus dem Raster der tragenden Wände. Je Feld Stützweiten (lichte Weite + 2·min(h/2, t/2)) und je Rand die Art:
   * Außenwand (Einspannung bzw. Rahmenecke) oder tragende Innenwand (Durchlaufplatte).
   * Feldmomente: gelenkig gelagerte Platte (sichere Seite). Stützmoment an Innenwänden nach Pieper/Martens aus den Feldern
   * beiderseits: m = ½(m1 + m2) ≥ 0,75·max(m1, m2), m1/m2 je Feld mit diesem Rand eingespannt, übrige gelenkig.
   * Randkraft an Innenwänden: v = v0 + (v1 − v0)·(ms − m_gegenüber)/m1 (zwischen gelenkig und einseitig eingespannt, darüber
   * wie beim Balken p·l/2 + ΔM/l). Schmale Streifen (lichte Weite ≤ 2h) zwischen Wänden gelten als massiv: Sie werden nicht als
   * Feld bemessen und spannen das Nachbarfeld voll ein.
   * Ergebnis: maßgebendes Feld (größtes Feldmoment) plus Hüllwerte aller Felder je globaler Achse; Momente als Beiwert·lx²,
   * Randkräfte als Beiwert·lx (mit p zu multiplizieren). */
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], OPP = [1, 0, 3, 2];
  const slabCache = new WeakMap();
  // Feldgeometrie hängt nur vom Wandraster ab, nicht von der Plattendicke: einmal je Raster ermitteln
  function slabCells(gb) {
    let c = slabCache.get(gb);
    if (c) return c;
    const ok = (x, y) => x >= 0 && y >= 0 && x < gb.nx && y < gb.ny;
    const memo = new Map(), all = [];
    const rec = (i, j) => {
      const cid = i * gb.ny + j;
      let r = memo.get(cid);
      if (r) return r;
      const sp = G.cellSpans(gb, i, j), shortX = sp.lx <= sp.ly;
      r = { id: all.length, sp, shortX, lxC: min(sp.lx, sp.ly), lyC: max(sp.lx, sp.ly), key: [sp.x0, sp.x1, sp.y0, sp.y1].map((v) => v.toFixed(4)).join('|') };
      r.edges = DIRS.map(([di, dj]) => {
        // Rand parallel zu y (di ≠ 0) ist für ein Feld mit kurzer Richtung x eine lange Seite
        const long = (di !== 0) === shortX, axis = di !== 0 ? 'x' : 'y', lPerp = max(di !== 0 ? sp.lx : sp.ly, 1e-3);
        let a = di > 0 ? sp.i1 + 1 : di < 0 ? sp.i0 - 1 : i, b = dj > 0 ? sp.j1 + 1 : dj < 0 ? sp.j0 - 1 : j;
        if (!ok(a, b) || !gb.inside[a][b]) return { di, dj, long, axis, lPerp, kind: 'out' };
        while (ok(a, b) && gb.inside[a][b] && !gb.free[a][b]) { a += di; b += dj; }
        return { di, dj, long, axis, lPerp, kind: 'int', nbCell: ok(a, b) && gb.free[a][b] ? [a, b] : null };
      });
      memo.set(cid, r);
      all.push(r);
      return r;
    };
    const list = [], seen = new Set();
    for (let i = 0; i < gb.nx; i++) for (let j = 0; j < gb.ny; j++) {
      if (!gb.free[i][j]) continue;
      const r = rec(i, j);
      for (const e of r.edges) if (e.nbCell && !e.nb) e.nb = rec(e.nbCell[0], e.nbCell[1]);
      const k = r.key + r.edges.map((e) => e.kind + (e.nb ? e.nb.key : '')).join(',');
      if (!seen.has(k)) { seen.add(k); list.push(r); }
    }
    for (let n = 0; n < all.length; n++) for (const e of all[n].edges) if (e.nbCell && !e.nb) e.nb = rec(e.nbCell[0], e.nbCell[1]);
    c = { list, all };
    slabCache.set(gb, c);
    return c;
  }

  function slabField(gb, h, tSupport) {
    if (!gb) return null;
    const cells = slabCells(gb), n = cells.all.length;
    if (!cells.list.length) return null;
    const aEach = min(h / 2, tSupport / 2), hSolid = 2 * h;
    // Werte je Feld für diese Dicke (Stützweite = lichte Weite + 2·aEach)
    const LX = new Float64Array(n), R = new Float64Array(n), NARROW = new Uint8Array(n);
    for (const rc of cells.all) {
      const lx = rc.lxC + 2 * aEach;
      LX[rc.id] = lx; R[rc.id] = (rc.lyC + 2 * aEach) / lx; NARROW[rc.id] = rc.lxC <= hSolid ? 1 : 0;
    }
    const m1 = (rc, e) => (e.long ? b1L(R[rc.id]) : b1S(R[rc.id])) * LX[rc.id] * LX[rc.id];
    // Stützmoment am Innenrand k des Feldes rc (Beiwert), 0 für Außenränder; je Aufruf zwischengespeichert
    const MS = new Float64Array(4 * n).fill(-1);
    const msOf = (rc, k) => {
      const ix = 4 * rc.id + k;
      if (MS[ix] >= 0) return MS[ix];
      const e = rc.edges[k];
      let m = 0;
      if (e.kind === 'int') {
        const mA = m1(rc, e);
        // massiver Streifen oder Wand ohne Feld dahinter: voll eingespannt
        if (!e.nb || NARROW[e.nb.id]) m = mA;
        else { const mB = m1(e.nb, e.nb.edges[OPP[k]]); m = max(0.5 * (mA + mB), 0.75 * max(mA, mB)); }
      }
      return (MS[ix] = m);
    };
    const vOf = (rc, k, ms) => {
      const e = rc.edges[k], lx = LX[rc.id], r = R[rc.id], mA = m1(rc, e);
      const v0 = (e.long ? vL(r) : vS(r)) * lx, v1 = (e.long ? v1L(r) : v1S(r)) * lx;
      // Momentenunterschied zum gegenüberliegenden Rand (Außenrand: 0, sichere Seite); über m1 hinaus wie beim Balken ΔM/l
      // mit der lichten Weite quer zum Rand
      // gegenüber nur echte Durchlaufwirkung abziehen (nicht die Volleinspannung an Wand ohne Feld / massivem Streifen)
      const eo = rc.edges[OPP[k]], mOpp = eo.kind === 'int' && eo.nb && !NARROW[eo.nb.id] ? msOf(rc, OPP[k]) : 0;
      const net = max(0, ms - mOpp);
      return v0 + (v1 - v0) * min(1, net / mA) + max(0, net - mA) / e.lPerp;
    };
    // Hüllwerte je globaler Achse (Bewehrung in x bzw. y), da Felder unterschiedlich orientiert sein können.
    // Außenränder je 5-cm-Klasse der Stützweite zusammengefasst (kleinstes l und Einspannmoment, größte Randkraft).
    const ax = () => ({ mf: 0, msIn: 0, msOut: 0, v: 0, outB: new Map() });
    const A = { x: ax(), y: ax() };
    let bestRc = null, bestMc = -1, sc = 0, lxMax = 0, lxMaxAxis = 'x', vWall = 0;
    const solidOnly = cells.list.every((rc) => NARROW[rc.id]);
    for (const rc of cells.list) {
      if (NARROW[rc.id] && !solidOnly) continue;
      const lx = LX[rc.id], r = R[rc.id], l2 = lx * lx, mc = betaX(r) * l2;
      if (mc > bestMc) { bestMc = mc; bestRc = rc; }
      const sA = rc.shortX ? 'x' : 'y', lA = rc.shortX ? 'y' : 'x';
      if (lx > lxMax) { lxMax = lx; lxMaxAxis = sA; }
      A[sA].mf = max(A[sA].mf, mc); A[lA].mf = max(A[lA].mf, betaY(r) * l2);
      // Außenwand: Festeinspannmoment (sichere Seite; für den Momentenausgleich mit der Wand)
      const bs = betaS(r);
      sc = max(sc, bs * l2);
      for (let k = 0; k < 4; k++) {
        const e = rc.edges[k], S = A[e.axis];
        if (e.kind === 'out') {
          const c = (e.long ? bs : betaSY(r)) * l2, v = (e.long ? vL(r) : vS(r)) * lx;
          S.msOut = max(S.msOut, c); S.v = max(S.v, v);
          const bk = Math.round(lx * 20), o = S.outB.get(bk);
          if (!o) S.outB.set(bk, { c, lx, v });
          else { o.c = min(o.c, c); o.lx = min(o.lx, lx); o.v = max(o.v, v); }
          continue;
        }
        const ms = msOf(rc, k), v = vOf(rc, k, ms);
        S.msIn = max(S.msIn, ms); S.v = max(S.v, v);
        // Wandlast aus beiden Seiten; ein massiver Streifen gibt seine ganze Last an die Wand
        const N = e.nb;
        vWall = max(vWall, v + (!N ? 0 : NARROW[N.id] ? (e.axis === 'x' ? N.sp.lx : N.sp.ly) : vOf(N, OPP[k], ms)));
      }
    }
    if (!bestRc) return null;
    const rB = R[bestRc.id], lB = LX[bestRc.id];
    const best = { lx: lB, ly: rB * lB, lxC: bestRc.lxC, lyC: bestRc.lyC, r: rB, bx: betaX(rB), by: betaY(rB), bs: betaS(rB), bsy: betaSY(rB), shortAxis: bestRc.shortX ? 'x' : 'y', rect: bestRc.sp, mc: bestMc };
    for (const a of ['x', 'y']) { A[a].outs = [...A[a].outB.values()]; delete A[a].outB; }
    Object.assign(best, { sc, lxMax, lxMaxAxis, vWall, aEach, ax: A });
    return best;
  }

  /* ---------- Außergewöhnlicher Lastfall Luftstoß (TWK 2017) ----------
   * Bemessungswerte dynamisch: fcd 44 MPa (ab C30/37) bzw. 38 MPa, fsd 600 MPa, τcd 1,7 bzw. 1,6 MPa.
   * Querkraft ohne Schubbewehrung nach SIA 262: vRd = kd·τcd·d, kd = 1/(1 + εv·d·kg), εv = fsd/Es·md/mRd. */
  const ES = 205000; // kg = 48/(16 + Dmax) steckt in dyn.kg
  const ACC_LABEL = N_('Luftstoß / TWK-Mindestwert');
  function asDyn(m, d, dyn) {
    const mu = m / (d * d * dyn.fcd * 1000);
    if (mu > 0.296) return Infinity;
    return (1 - Math.sqrt(1 - 2 * mu)) * d * dyn.fcd / dyn.fsd * 1e4;
  }
  function shearDyn(vEd, d, mRatio, dyn) {
    const ev = dyn.fsd / ES * min(1, max(0.2, finite(mRatio) ? mRatio : 1));
    const kd = 1 / (1 + ev * d * 1000 * (dyn.kg || 1));
    const vRd = kd * dyn.tau * 1000 * d;
    const vMax = 0.55 * dyn.fcd * 1000 * 0.9 * d * 0.5;
    let reinf = null, vRdS = null;
    if (vEd > vRd) {
      const asw = vEd / (0.9 * d * dyn.fsd * 1000) * 1e4; // cm² je m² Grundfläche
      outer: for (const phi of [10, 12, 14, 16]) for (const s of [0.25, 0.20, 0.15, 0.10]) {
        if (s > max(0.10, 0.75 * d) + 1e-9) continue;
        const prov = asBar(phi) / (s * s);
        if (prov >= asw) { reinf = { phi, s, asw, prov }; break outer; }
      }
      vRdS = reinf ? reinf.prov * 1e-4 * 0.9 * d * dyn.fsd * 1000 : 0;
    }
    const eta = vEd <= vRd ? vEd / vRd : max(vRdS > 0 ? vEd / vRdS : Infinity, vEd / vMax);
    return { vEd, vRd, kd, vMax, reinf, vRdS, eta, needs: vEd > vRd };
  }

  /* Bruchlinien (Johansen), Rechteckplatte ringsum eingespannt, isotrop: qRd = 24·(m + m')/(lx²·F²), F = √(3 + ρ²) − ρ, ρ = lx/ly. */
  const ylF2 = (lx, ly) => { const r = lx / ly; const F = Math.sqrt(3 + r * r) - r; return F * F; };
  const mRdDyn = (l, dyn) => { const F = l.prov * 1e-4 * dyn.fsd * 1000; return F * (l.d - F / (2 * dyn.fcd * 1000)); };

  /* opt.mJ: Moment der Rahmenecke an den Außenwänden (nach Momentenausgleich), opt.qp: Verhältnis quasi-ständige / Bemessungslast. */
  function designPlate(name, pEd, h, field, ctx, topIsField, acc, opt) {
    const f = field, o = opt || {}, mJ = o.mJ || 0, qp = o.qp || 0, X = f.ax.x, Y = f.ax.y;
    // Rahmenecke je Feld am Außenrand: m = mW + dfW·(c·p − mW), dfW = kW/(kW + h³/l) (Momentenausgleich mit der Wand)
    const dfW = (l) => (o.kW > 0 ? o.kW / (o.kW + h * h * h / l) : 1);
    const mW = finite(o.mW) ? o.mW : null;
    const jointMax = (S) => (mW === null ? mJ : S.outs.reduce((m, it) => max(m, mW + dfW(it.lx) * (it.c * pEd - mW)), 0));
    // Momente je Achse: Feld (gelenkig), Stütze an Innenwand (Durchlaufplatte), an Außenwand (Einspannung bzw. Rahmenecke)
    const mFx = X.mf * pEd, mFy = Y.mf * pEd;
    const mSxIn = X.msIn * pEd, mSyIn = Y.msIn * pEd, mSxOut = max(X.msOut * pEd, X.outs.length ? jointMax(X) : 0), mSyOut = max(Y.msOut * pEd, Y.outs.length ? jointMax(Y) : 0);
    const mSx = max(mSxIn, mSxOut), mSy = max(mSyIn, mSyOut);
    // Luftstoß: plastische Bemessung, Feld- und Randmoment gleich groß (i = 1)
    const F2 = ylF2(f.lxC, f.lyC);
    const mPl = acc ? acc.pM * f.lxC * f.lxC * F2 / 48 : 0;
    const ex = acc ? (d) => max(acc.minAs, asDyn(mPl, d, acc.dyn)) : 0;
    const lab = acc ? ACC_LABEL : undefined;
    // Außen liegende Lage (größere Nutzhöhe) in der Richtung mit dem größeren Moment
    const fP = mFx >= mFy ? 'x' : 'y', sP = mSx >= mSy ? 'x' : 'y';
    const mF = { x: mFx, y: mFy }, mSa = { x: mSx, y: mSy }, other = (a) => (a === 'x' ? 'y' : 'x');
    const fieldA = designLayer(mF[fP], h, ctx, 0, ex, true, lab, mF[fP] * qp);
    const fieldB = designLayer(mF[other(fP)], h, ctx, fieldA.phi / 1000, ex, true, lab, mF[other(fP)] * qp);
    // Querkraft im Abstand d vom Auflagerrand (Stützlinie liegt aEach hinter dem Rand), je Achse.
    // Reicht vRd,c,min nicht, wird die Randbewehrung so erhöht, dass vRd,c genügt (ρl ≤ 2 %).
    const aS = f.aEach || 0, vAt = (coef, d) => Math.max(0, coef * pEd - pEd * (aS + d));
    const exV = (coef, mS) => (d) => {
      const a0 = ex ? ex(d) : 0, aV = asForShear(vAt(coef, d), d, ctx.mat, mS);
      // nur, wenn es sich mit Stäben bis Ø max im kleinsten Abstand verlegen lässt; sonst meldet der Querkraftnachweis
      const aMax = asBar(ctx.maxDia || 25) / SPACINGS[0];
      return aV > a0 && aV <= aMax ? { as: aV, label: N_('Querkraft (Längsbewehrung)') } : a0;
    };
    // Außenrand: Rahmeneckmoment über dem Einspannmoment erhöht die Randkraft wie beim Balken um ΔM/l
    const vOut = (S) => S.outs.reduce((m, it) => max(m, it.v + (mW === null ? max(0, mJ - it.c * pEd) : (1 - dfW(it.lx)) * max(0, mW - it.c * pEd)) / pEd / it.lx), 0);
    const vC = { x: max(X.v, vOut(X)), y: max(Y.v, vOut(Y)) };
    const supA = designLayer(mSa[sP], h, ctx, 0, exV(vC[sP], mSa[sP]), true, lab, mSa[sP] * qp);
    const supB = designLayer(mSa[other(sP)], h, ctx, supA.phi / 1000, exV(vC[other(sP)], mSa[other(sP)]), true, lab, mSa[other(sP)] * qp);
    const supOf = { [sP]: supA, [other(sP)]: supB }, fieldOf = { [fP]: fieldA, [other(fP)]: fieldB };
    const shX = shearCheck(vAt(vC.x, supOf.x.d), supOf.x.d, supOf.x.prov, ctx.mat, supOf.x.m);
    const shY = shearCheck(vAt(vC.y, supOf.y.d), supOf.y.d, supOf.y.prov, ctx.mat, supOf.y.m);
    const shear = shY.eta > shX.eta ? Object.assign(shY, { edge: 'y' }) : Object.assign(shX, { edge: 'x' });
    const fl = fieldOf[f.lxMaxAxis];
    const defl = deflectionCheck(f.lxMax, fl.d, fl.asUls, ctx.mat);
    const all = [fieldA, fieldB, supA, supB];
    const muEta = max(...all.map((l) => l.mu)) / NC.muLim;
    let accR = null;
    if (acc) {
      const mField = min(mRdDyn(fieldA, acc.dyn), mRdDyn(fieldB, acc.dyn)), mSup = min(mRdDyn(supA, acc.dyn), mRdDyn(supB, acc.dyn));
      const qRd = 24 * (mField + mSup) / (f.lxC * f.lxC * F2);
      // Querkraft: Last mit Φ = 2,0, höchstens 1,6·qRd; Einzugsfläche aus dem Bruchlinienbild (lange Seite)
      const pV = min(acc.pV, 1.6 * qRd);
      const vEdA = pV * f.lxC / 2 * (1 - f.lxC / (2 * f.lyC));
      const sS = supOf[f.shortAxis];
      const sh = shearDyn(vEdA, sS.d, acc.pM / qRd, acc.dyn);
      if (sh.reinf) sh.strip = min(f.lxC / 2, max(1.0, Math.ceil(((vEdA - sh.vRd) / pV + sS.d) * 4) / 4));
      const dMin = min(fieldB.d, supB.d);
      const muA = mPl / (dMin * dMin * acc.dyn.fcd * 1000);
      accR = { pM: acc.pM, pV, pVfull: acc.pV, phiM: acc.phiM, mPl, qRd, shear: sh, muA, eta: max(muA / 0.296, acc.pM / qRd, sh.eta), fail: muA > 0.296 || acc.pM > qRd * 1.0001 || !(sh.eta <= 1) };
    }
    const fFace = topIsField ? 'oben' : 'unten', sFace = topIsField ? 'unten' : 'oben';
    return {
      name, pEd, h, field: f,
      layers: [
        { key: 'f' + fP, label: 'Feld, Richtung ' + fP, face: fFace, dir: fP, ...fieldA, poorBond: topIsField },
        { key: 'f' + other(fP), label: 'Feld, Richtung ' + other(fP), face: fFace, dir: other(fP), ...fieldB, poorBond: topIsField },
        { key: 's' + sP, label: 'Rand, Richtung ' + sP, face: sFace, dir: sP, ...supA, poorBond: !topIsField },
        { key: 's' + other(sP), label: 'Rand, Richtung ' + other(sP), face: sFace, dir: other(sP), ...supB, poorBond: !topIsField },
      ],
      moments: { mFx, mFy, mSx, mSy, mSxIn, mSyIn, mSxOut, mSyOut, mSin: max(mSxIn, mSyIn), mSout: max(mSxOut, mSyOut), mF: max(mFx, mFy), mS: max(mSx, mSy), mJ },
      shear, defl, acc: accR, qp,
      wkMax: max(...all.map((l) => l.wkLoad || 0)),
      etaS: max(muEta, shear.eta, defl.eta),
      eta: max(muEta, shear.eta, defl.eta, accR ? accR.eta : 0),
      fail: all.some((l) => (l.fail && l.failReason === 'uls') || !l.muOk),
      crackFail: all.some((l) => l.failReason === 'crack'),
      accLayerFail: all.some((l) => l.failReason === 'acc'),
    };
  }

  /* ---------- Außenwand als lotrechter Durchlaufträger ----------
   * Biegebalken (Euler-Bernoulli) von der Deckenmitte bis zur Bodenplattenmitte, Lager an allen Plattenmitten, Last p(z) trapezförmig
   * je Abschnitt (Erddruck stückweise linear). Zwei Randbedingungen als Hülle: Enden eingespannt (Rahmenecke, Stützmomente)
   * und Enden gelenkig (Feldmomente). Ergebnis: Feldmoment, Einspannmomente oben/unten, Stützmomente an Zwischendecken, Querkraft. */
  function wallBeam(zs, pAt) {
    const zTop = zs[0], zBot = zs[zs.length - 1];
    // Knoten: Lager plus Unterteilung ≤ 0,1 m
    const nodes = [];
    for (let i = 0; i + 1 < zs.length; i++) { const n = max(4, ceil((zs[i + 1] - zs[i]) / 0.1)); for (let k = 0; k < n; k++) nodes.push(zs[i] + (zs[i + 1] - zs[i]) * k / n); }
    nodes.push(zBot);
    const N = nodes.length, nd = 2 * N, EI = 1; // nur Verhältnisse (gleiche Steifigkeit über die Höhe)
    const solveCase = (clamped) => {
      const K = Array.from({ length: nd }, () => new Float64Array(nd)), F = new Float64Array(nd);
      for (let e = 0; e + 1 < N; e++) {
        const L = nodes[e + 1] - nodes[e], q1 = pAt(nodes[e]), q2 = pAt(nodes[e + 1]);
        const k = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]].map((r) => r.map((v) => v * EI / (L * L * L)));
        // Trapezlast: äquivalente Knotenlasten
        const f = [L * (21 * q1 + 9 * q2) / 60, L * L * (3 * q1 + 2 * q2) / 60, L * (9 * q1 + 21 * q2) / 60, -L * L * (2 * q1 + 3 * q2) / 60];
        const id = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
        for (let r = 0; r < 4; r++) { F[id[r]] += f[r]; for (let c = 0; c < 4; c++) K[id[r]][id[c]] += k[r][c]; }
      }
      const pen = 1e12;
      const supIdx = zs.map((z) => nodes.findIndex((x) => Math.abs(x - z) < 1e-9));
      for (const i of supIdx) K[2 * i][2 * i] += pen;
      if (clamped) { K[1][1] += pen; K[nd - 1][nd - 1] += pen; }
      const u = gauss(K, F);
      // Momente und Querkräfte an den Knoten aus den Elementkräften
      const M = new Float64Array(N), Vn = new Float64Array(N);
      for (let e = 0; e + 1 < N; e++) {
        const L = nodes[e + 1] - nodes[e], q1 = pAt(nodes[e]), q2 = pAt(nodes[e + 1]);
        const k = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]].map((r) => r.map((v) => v * EI / (L * L * L)));
        const f = [L * (21 * q1 + 9 * q2) / 60, L * L * (3 * q1 + 2 * q2) / 60, L * (9 * q1 + 21 * q2) / 60, -L * L * (2 * q1 + 3 * q2) / 60];
        const ue = [u[2 * e], u[2 * e + 1], u[2 * e + 2], u[2 * e + 3]];
        const fe = k.map((r, i) => r.reduce((s, v, j) => s + v * ue[j], 0) - f[i]);
        // Vorzeichen: positives Moment = Zug innen (Feld)
        M[e] = fe[1]; M[e + 1] = -fe[3];
        Vn[e] = max(Vn[e], Math.abs(fe[0])); Vn[e + 1] = max(Vn[e + 1], Math.abs(fe[2]));
      }
      return { M, V: Vn, supIdx };
    };
    const cl = solveCase(true), pin = solveCase(false);
    const spanMax = max(...pin.M, ...cl.M, 0);
    const supM = cl.supIdx.map((i) => max(0, -cl.M[i], -pin.M[i]));
    const midSup = supM.slice(1, -1);
    return { spanMax, mTop: supM[0], mBot: supM[supM.length - 1], mMid: midSup.length ? max(...midSup) : 0, vMax: max(...cl.V, ...pin.V),
      spans: zs.slice(1).map((z, i) => z - zs[i]), nodes, Mcl: cl.M, Mpin: pin.M };
  }
  function gauss(A, b) {
    // symmetrisch positiv definit: Elimination ohne Pivotsuche, Bandbreite 4 (Balkenelemente)
    const n = b.length, M = A.map((r) => Float64Array.from(r)), x = Float64Array.from(b);
    for (let c = 0; c < n; c++) {
      const d = M[c][c];
      for (let r = c + 1; r < Math.min(n, c + 4); r++) {
        const f = M[r][c] / d;
        if (!f) continue;
        for (let k = c; k < Math.min(n, c + 4); k++) M[r][k] -= f * M[c][k];
        x[r] -= f * x[c];
      }
    }
    for (let i = n - 1; i >= 0; i--) { let s2 = x[i]; for (let k = i + 1; k < Math.min(n, i + 4); k++) s2 -= M[i][k] * x[k]; x[i] = s2 / M[i][i]; }
    return x;
  }


  /* ---------- FE-Plattenmodelle (Aufbau der Aufgaben, Bemessung aus den Hüllkurven) ---------- */

  const feCache = new Map(); // synchroner Betrieb (Node, Bericht): zuletzt gerechnete Modelle
  /* fe: undefined = synchron rechnen, 'none' = nur Tafelverfahren, Objekt { get(key), want(key, job) } = asynchron (Oberfläche). */
  function feResult(job, fe) {
    if (!job || fe === 'none' || !BP.slabs) return null;
    const k = BP.slabs.key(job);
    if (fe && typeof fe === 'object') { const r = fe.get(k); if (r) return r; fe.want(k, job); return null; }
    let r = feCache.get(k);
    if (r) { feCache.delete(k); feCache.set(k, r); } // zuletzt benutzt ans Ende (LRU)
    else {
      r = BP.slabs.run(job);
      feCache.set(k, r);
      while (feCache.size > 64) feCache.delete(feCache.keys().next().value);
    }
    return r;
  }

  /* Felder (von tragenden Wänden umschlossene Bereiche) für die schachbrettartige Verkehrslast zweifarbig einfärben. */
  function fieldColors(gb) {
    if (!gb) return null;
    const nC = gb.comps.length, adj = Array.from({ length: nC }, () => new Set());
    const ok = (x, y) => x >= 0 && y >= 0 && x < gb.nx && y < gb.ny;
    for (let i = 0; i < gb.nx; i++) for (let j = 0; j < gb.ny; j++) {
      if (!gb.free[i][j]) continue;
      const c0 = gb.comp[i][j];
      for (const [di, dj] of [[1, 0], [0, 1]]) {
        let a = i + di, b = j + dj, steps = 0;
        while (ok(a, b) && gb.inside[a][b] && !gb.free[a][b]) { a += di; b += dj; steps++; }
        if (steps && ok(a, b) && gb.free[a][b] && gb.comp[a][b] !== c0) { adj[c0].add(gb.comp[a][b]); adj[gb.comp[a][b]].add(c0); }
      }
    }
    const col = new Int8Array(nC).fill(-1);
    for (let s = 0; s < nC; s++) {
      if (col[s] >= 0) continue;
      col[s] = 0;
      const st = [s];
      while (st.length) { const c = st.pop(); for (const d of adj[c]) if (col[d] < 0) { col[d] = 1 - col[c]; st.push(d); } }
    }
    return col;
  }

  /* Kombination im Grenzzustand der Tragfähigkeit: Name deutsch aus den Faktoren (Schlüssel der Rechenaufgabe, z. B.
   * „1,35 G + 1,5 Q feldweise (+) + 1,5 E“), Anzeige in der Oberfläche über BP.normen.comboLabel. terms: [[Faktor, Symbol, Zusatz]],
   * tail: [[Trenner, Text]]. Bei mehreren Kombinationsgleichungen (z. B. 6.10a/b) wird die Gleichung angehängt. */
  const decDE = (v) => String(Math.round(v * 10000) / 10000).replace('.', ',');
  function combo(set, terms, tail, c, extra) {
    const t = terms.filter((x) => x[0] !== 0), tl = (tail || []).concat(NC.lf.sets.length > 1 && set && set.tag ? [[' ', '(' + set.tag + ')']] : []);
    const name = t.map(([f, sy, suf]) => (f === 1 ? sy : decDE(f) + ' ' + sy) + (suf ? ' ' + suf : '')).join(' + ') + tl.map(([sep, w]) => sep + w).join('');
    return Object.assign({ name, c, terms: t, tail: tl }, extra || {});
  }
  const ulsSets = () => NC.lf.sets;

  /* Gemeinsame Netzgrundlage und Lager je Ebene. Die Platte über Ebene i liegt auf deren tragenden Wänden und Stützen. */
  function feSetup(p, geo, lv, mat, soil, L) {
    if (!geo.valid || !BP.slabs) return null;
    const b = p.build, tW = b.tWall, E = mat.Ecm * 1000;
    const out = geo.out, inner = geo.inner, axis = G.offsetPolygon(out, -tW / 2);
    const keyX = [], keyY = [];
    const addKeys = (poly) => poly.forEach((q) => { keyX.push(q.x); keyY.push(q.y); });
    addKeys(out); addKeys(inner); addKeys(axis);
    // Schlüsselkoordinaten aller Ebenen, damit alle Platten dasselbe Netz haben (Lasten von oben liegen auf Knotenlinien)
    for (const Lg of geo.L) {
      for (const w of Lg.walls) for (const sg of w.segs) {
        if (Math.abs(sg.a.x - sg.b.x) < 1e-6) { keyX.push(sg.a.x, sg.a.x - w.t / 2, sg.a.x + w.t / 2); keyY.push(sg.a.y, sg.b.y); }
        else if (Math.abs(sg.a.y - sg.b.y) < 1e-6) { keyY.push(sg.a.y, sg.a.y - w.t / 2, sg.a.y + w.t / 2); keyX.push(sg.a.x, sg.b.x); }
      }
      for (const c of Lg.columns) { keyX.push(c.x - c.bx / 2, c.x, c.x + c.bx / 2); keyY.push(c.y - c.by / 2, c.y, c.y + c.by / 2); }
      for (const u of Lg.beams) for (const sg of u.segs) {
        if (Math.abs(sg.a.x - sg.b.x) < 1e-6) { keyX.push(sg.a.x); keyY.push(sg.a.y, sg.b.y); }
        else if (Math.abs(sg.a.y - sg.b.y) < 1e-6) { keyY.push(sg.a.y); keyX.push(sg.a.x, sg.b.x); }
      }
      for (const h of Lg.holesBelow) addKeys(h);
    }
    for (const v of geo.vert.lifts) addKeys(v.innerPoly);
    // Einbauten: Blockränder als Netzlinien (Flächenlast genau auf der Aufstellfläche)
    const eqAll = L.equip || [];
    for (const e of eqAll) { keyX.push(e.rect.x0, e.rect.x1); keyY.push(e.rect.y0, e.rect.y1); }
    const eqRects = (lvl, f) => eqAll.filter((e) => e.level === lvl && e[f] > 0).map((e) => ({ x0: e.rect.x0, y0: e.rect.y0, x1: e.rect.x1, y1: e.rect.y1, q: e[f] }));
    const meshSize = clamp(max(Math.sqrt(geo.A) / 32, Math.sqrt(geo.A / 6000)), 0.2, 0.6);
    const supports = (Lg, kind) => {
      const lines = [], bands = [], areas = [], columns = [];
      for (const w of Lg.walls) {
        if (!w.info.bearing) continue;
        for (const sg of w.segs) { lines.push({ a: sg.a, b: sg.b, kind, id: w.id }); bands.push({ a: sg.a, b: sg.b, t: w.t }); }
      }
      for (const c of Lg.columns) {
        areas.push({ poly: G.polygonFromRect(c.x - c.bx / 2, c.y - c.by / 2, c.x + c.bx / 2, c.y + c.by / 2), kind, id: c.id });
        columns.push({ id: c.id, x: c.x, y: c.y, bx: c.bx, by: c.by });
      }
      // Unterzüge: starre Linienlager der Platte darüber (Steifigkeit wird in der Balkenbemessung geprüft)
      if (kind === 'fix') for (const u of Lg.beams || []) for (const sg of u.segs) { lines.push({ a: sg.a, b: sg.b, kind, id: u.id, beam: true }); bands.push({ a: sg.a, b: sg.b, t: u.bw }); }
      return { lines, bands, areas, columns };
    };
    const outerLines = (kind, kRot, mEdge) => axis.map((a, i) => {
      const bb = axis[(i + 1) % axis.length], n = G.edgeNormal(a, bb);
      return { a, b: bb, kind, outer: true, id: 'aussen' + (i + 1), kRot, nIn: { x: -n.x, y: -n.y }, mEdge };
    });
    const kRotOf = (Lw) => 3.5 * E * tW * tW * tW / 12 / Lw;
    const gridQOf = (gb, q) => { const col = fieldColors(gb); return gb && col ? { f: q / 2, xs: gb.xs, ys: gb.ys, ny: gb.ny, comp: gb.comp.flat(), val: Array.from(col, (c) => (c === 0 ? 1 : -1)) } : null; };
    const base = { outer: out, inner, regionPoly: axis, keyX, keyY, meshSize, E, nu: 0.2 };
    const nL = geo.L.length;
    const liftHoles = (pred) => geo.vert.lifts.filter(pred).map((v) => v.innerPoly);
    return {
      roof() {
        const sp = supports(geo.L[0], 'fix');
        return Object.assign({}, base, sp, {
          kind: 'roof', domain: out, h: b.tRoof, holes: liftHoles((v) => v.toSurface || v.roofBox),
          lines: outerLines('fix', kRotOf(L.LwTop), 1).concat(sp.lines),
          cases: [{ name: 'G', q: L.gkRoof }, { name: 'Q', q: L.q }, { name: 'Q±', q: 0, gridQ: gridQOf(geo.L[0].gridBear, L.q) }, { name: 'W', q: 0, mEdge: L.mWallTop }],
          combos: {
            uls: ulsSets().flatMap((S) => [combo(S, [[S.G, 'G'], [S.Q, 'Q']], [[' + ', 'Rahmenecke']], [S.G, S.Q, 0, 1]), combo(S, [[S.G, 'G'], [S.Q, 'Q']], [], [S.G, S.Q, 0, 0])]
              .concat(S.Q > 0 ? [combo(S, [[S.G, 'G'], [S.Q, 'Q', 'feldweise (+)']], [], [S.G, S.Q / 2, S.Q, 0]), combo(S, [[S.G, 'G'], [S.Q, 'Q', 'feldweise (−)']], [], [S.G, S.Q / 2, -S.Q, 0])] : [])),
            sls: [{ name: N_('G + ψ₂ Q (quasi-ständig)'), c: [1, L.psi2, 0, L.qpWall] }],
          },
        });
      },
      /* Zwischendecke über Ebene i (i ≥ 1): Lasten aus Ebene i − 1 (Ausbauwände, tragende Wände und Stützen mit ihren Auflagerkräften). */
      mid(i, above, beamPts) {
        const Lg = geo.L[i], Lu = geo.L[i - 1], sp = supports(Lg, 'fix');
        const gL = [], qL = [], gP = [], qP = [], eL = [], eP = [];
        // Auflagerkräfte der Unterzüge der Ebene darüber (auf Stützen und Wänden), charakteristisch
        for (const bp of beamPts || []) { gP.push({ x: bp.x, y: bp.y, P: bp.g }); if (bp.q) qP.push({ x: bp.x, y: bp.y, P: bp.q }); if (bp.e) eP.push({ x: bp.x, y: bp.y, P: bp.e }); }
        for (const w of Lu.walls) for (const sg of w.segs) {
          if (!w.info.bearing) gL.push({ a: sg.a, b: sg.b, q: w.kind === 'mw' ? 18 * w.t * Lu.H : 0.5 * Lu.H });
          else {
            const r = above && above.reactCase ? above.reactCase.lines.find((l) => l.id === w.id && G.dist(l.a, sg.a) < 1e-6 && G.dist(l.b, sg.b) < 1e-6) : null;
            gL.push({ a: sg.a, b: sg.b, q: GAMMA_C * w.t * Lu.H + (r ? r.g / max(r.len, 1e-6) : 0) });
            if (r && r.q) qL.push({ a: sg.a, b: sg.b, q: r.q / max(r.len, 1e-6) });
            if (r && r.e) eL.push({ a: sg.a, b: sg.b, q: r.e / max(r.len, 1e-6) });
          }
        }
        for (const c of Lu.columns) {
          const r = above && above.reactCase ? above.reactCase.areas.find((a) => a.id === c.id) : null;
          gP.push({ x: c.x, y: c.y, bx: c.bx, by: c.by, P: GAMMA_C * c.bx * c.by * Lu.H + (r ? r.g : 0) });
          if (r && r.q) qP.push({ x: c.x, y: c.y, bx: c.bx, by: c.by, P: r.q });
          if (r && r.e) eP.push({ x: c.x, y: c.y, bx: c.bx, by: c.by, P: r.e });
        }
        // Innentreppen: oberes Laufende am Deckenrand (Treppe von Ebene i − 1 nach unten), Antritt einer Treppe von Ebene i − 2 auf dem Fußboden der Ebene i − 1
        for (const s of geo.vert.stairs) {
          const ln = s.upper === i - 1 ? s.topLine : s.lower === i - 1 ? s.footLine : null;
          if (!ln) continue;
          gL.push({ a: ln.a, b: ln.b, q: s.reaction.g }); qL.push({ a: ln.a, b: ln.b, q: s.reaction.q });
        }
        const holes = Lu.holesBelow.concat(liftHoles((v) => i - 1 >= v.wallTop && i <= v.levelBot));
        const kR = 2 * kRotOf(L.spans[i] || L.LwTop);
        return Object.assign({}, base, sp, {
          kind: 'mid', level: i, domain: out, h: Lg.tSlab, holes,
          lines: outerLines('fix', kR, 0).concat(sp.lines),
          cases: [{ name: 'G', q: GAMMA_C * Lg.tSlab + L.gFinish, lineLoads: gL, points: gP, rects: eqRects(i - 1, 'gk') }, { name: 'Q', q: p.use.interiorQ, lineLoads: qL, points: qP },
            { name: 'Q±', q: 0, gridQ: gridQOf(Lg.gridBear, p.use.interiorQ) }, { name: 'E', q: 0, lineLoads: eL, points: eP, rects: eqRects(i - 1, 'ek') }],
          // Lagerlast E (Füllung von Tanks und Regalen) mit ψ0 = 1,0 in jeder Kombination; leere Behälter als eigene Kombination
          combos: {
            uls: ulsSets().flatMap((S) => [combo(S, [[S.G, 'G'], [S.Q, 'Q'], [S.E, 'E']], [], [S.G, S.Q, 0, S.E])]
              .concat(S.Q > 0 ? [combo(S, [[S.G, 'G'], [S.Q, 'Q', 'feldweise (+)'], [S.E, 'E']], [], [S.G, S.Q / 2, S.Q, S.E]), combo(S, [[S.G, 'G'], [S.Q, 'Q', 'feldweise (−)'], [S.E, 'E']], [], [S.G, S.Q / 2, -S.Q, S.E])] : [])
              .concat(S.Q > 0 && (eL.length || eP.length || eqRects(i - 1, 'ek').length) ? [combo(S, [[S.G, 'G'], [S.Q, 'Q', 'feldweise (+)']], [[', ', 'Behälter leer']], [S.G, S.Q / 2, S.Q, 0]), combo(S, [[S.G, 'G'], [S.Q, 'Q', 'feldweise (−)']], [[', ', 'Behälter leer']], [S.G, S.Q / 2, -S.Q, 0])] : [])),
            sls: [{ name: N_('G + ψ₂ Q + ψ₂ E (quasi-ständig)'), c: [1, NC.lf.psi2Q, 0, NC.lf.psi2E] }],
          },
        });
      },
      floor() {
        const Lb = geo.L[nL - 1], sp = supports(Lb, 'presc');
        const ks = max(500, (soil.Es || 40) * 1000 / Math.sqrt(geo.Aslab));
        const nonBear = [];
        for (const w of Lb.walls) if (!w.info.bearing) for (const sg of w.segs) nonBear.push({ a: sg.a, b: sg.b, q: w.kind === 'mw' ? 18 * w.t * Lb.H : 0.5 * Lb.H });
        const stairQ = [];
        for (const s of geo.vert.stairs) if (s.lower === nL - 1) { nonBear.push({ a: s.footLine.a, b: s.footLine.b, q: s.reaction.g }); stairQ.push({ a: s.footLine.a, b: s.footLine.b, q: s.reaction.q }); }
        const cg = centroid(out);
        const supE = L.supE || 0;
        const cases = [
          { name: 'G direkt', q: GAMMA_C * b.tFloor, lineLoads: nonBear, zones: L.qOvh > 0 ? [{ poly: out, q: L.qOvh, outside: true }] : [], rects: eqRects(nL - 1, 'gk') },
          { name: 'Q innen', q: 0, zones: [{ poly: inner, q: p.use.interiorQ }], lineLoads: stairQ },
          { name: 'Wasser', q: -L.uSlab },
          { name: 'W', q: 0, mEdge: -L.mWallBot },
          { name: 'E', q: 0, rects: eqRects(nL - 1, 'ek') },
          { name: 'S0', q: 0, presc: [1, 0, 0] }, { name: 'SX', q: 0, presc: [0, 1, 0] }, { name: 'SY', q: 0, presc: [0, 0, 1] },
        ];
        const uls = ulsSets().flatMap((S) => [combo(S, [[S.G, 'G'], [S.Q, 'Q'], [S.E, 'E']], [[' + ', 'Rahmenecke']], [S.G, S.Q, S.H, 1, S.E], { sup: S.G * L.supG + S.Q * L.supQ + S.E * supE }),
          combo(S, [[S.G, 'G'], [S.Q, 'Q'], [S.E, 'E']], [], [S.G, S.Q, S.H, 0, S.E], { sup: S.G * L.supG + S.Q * L.supQ + S.E * supE })]);
        if (L.uSlab > 0) uls.push(combo(null, [[NC.lf.Ginf, 'G'], [NC.lf.U, 'Wasser']], [], [NC.lf.Ginf, 0, NC.lf.U, 1, 0], { sup: NC.lf.Ginf * L.supG }));
        return Object.assign({}, base, sp, {
          kind: 'floor', domain: geo.slab, h: b.tFloor, xc: cg.x, yc: cg.y, holes: liftHoles((v) => v.levelBot === nL - 1),
          lines: outerLines('presc', kRotOf(L.LwBot), 1).concat(sp.lines), ksList: [0.5 * ks], ks,
          cases, combos: { uls, sls: [{ name: N_('G + ψ₂ Q + ψ₂ E (quasi-ständig)'), c: [1, NC.lf.psi2Q, 1, L.qpWallBot, NC.lf.psi2E], sup: L.supG + L.psi2 * L.supQ + NC.lf.psi2E * supE, isSls: true }] },
        });
      },
    };
  }

  function centroid(poly) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < poly.length; i++) {
      const p0 = poly[i], p1 = poly[(i + 1) % poly.length], c = p0.x * p1.y - p1.x * p0.y;
      a += c; cx += (p0.x + p1.x) * c; cy += (p0.y + p1.y) * c;
    }
    return Math.abs(a) < 1e-12 ? { x: poly[0].x, y: poly[0].y } : { x: cx / (3 * a), y: cy / (3 * a) };
  }

  /* Biegetragfähigkeit eines Querschnitts je m (Spannungsblock, EC2 3.1.7) und Rissbreite für beliebige Bewehrungsmenge. */
  function mRdOf(As, d, mat) {
    const w = As * 1e-4 * mat.fyd / (d * mat.fcd);
    return As * 1e-4 * mat.fyd * 1000 * d * (1 - 0.5 * min(w, 0.5));
  }
  function crackWidthAs(mqp, h, d, As, phi, mat) {
    if (!(mqp > 0)) return 0;
    const s = asBar(phi) / max(As, 1e-6);
    return crackWidth(mqp, h, d, phi, s, mat).wk;
  }
  function quantile(arr, qv) {
    if (!arr.length) return 0;
    const a = Float64Array.from(arr).sort();
    return a[Math.min(a.length - 1, Math.floor(qv * (a.length - 1) + 0.5))];
  }
  const vRdc = (rho, d, mat) => NC.vRdc(rho, d, mat);
  const anchorage = (phi, mat, poorBond, d) => NC.anchorage(phi, mat, poorBond, d);

  /* Bemessung aus FE-Hüllkurven: Grundbewehrung je Lage (Mindest-, Riss-, Zwangbewehrung, ¾ der Knoten abgedeckt) plus Zulagen
   * in Bereichen, wo Biegung, Rissbreite oder Querkraft mehr verlangen. Reicht auch ρl = 2 % für die Querkraft nicht,
   * wird Querkraftbewehrung bemessen (EC2 6.2.3, NA DE). */
  function designFE(name, res, h, ctx, ex, opt) {
    const o = opt || {}, mat = ctx.mat, mesh = res.mesh, n = mesh.nNodes, inSup = res.inSup;
    const NX = mesh.nx + 1, NY = mesh.ny + 1;
    const xs = mesh.xs, ys = mesh.ys;
    const faces = [
      { face: 'unten', key: 'b', dem: { x: res.uls.bx, y: res.uls.by }, qp: res.sls ? { x: res.sls.bx, y: res.sls.by } : null, poorBond: false },
      { face: 'oben', key: 't', dem: { x: res.uls.tx, y: res.uls.ty }, qp: res.sls ? { x: res.sls.tx, y: res.sls.ty } : null, poorBond: true },
    ];
    const design = [];
    for (let k = 0; k < n; k++) if (!inSup[k]) design.push(k);
    const nodeAt = new Int32Array(NX * NY).fill(-1);
    for (let k = 0; k < n; k++) nodeAt[mesh.nodeIJ[2 * k] * NY + mesh.nodeIJ[2 * k + 1]] = k;
    const layers = [], zul = [];
    let fail = false, crackFail = false, accLayerFail = false, muMax = 0;
    const nodeAs = {}; // erforderliche Biegebewehrung je Knoten [cm²/m] für die Darstellung
    const lab = ex ? ACC_LABEL : undefined;
    for (const F of faces) {
      const maxOf = (arr) => design.reduce((m, k) => max(m, arr[k]), 0);
      const prim = maxOf(F.dem.x) >= maxOf(F.dem.y) ? 'x' : 'y', sec = prim === 'x' ? 'y' : 'x';
      let offset = 0;
      for (const dir of [prim, sec]) {
        const dem = F.dem[dir], qp = F.qp ? F.qp[dir] : null;
        const vals = design.map((k) => dem[k]), mBase = quantile(vals, 0.75), mq = qp ? quantile(design.map((k) => qp[k]), 0.75) : 0;
        const L0 = designLayer(mBase, h, ctx, offset, ex, true, lab, mq);
        if (L0.fail) { if (L0.failReason === 'crack') crackFail = true; else if (L0.failReason === 'acc') accLayerFail = true; else fail = true; }
        const layer = Object.assign({}, L0, { key: F.key + dir, label: 'Grundbewehrung ' + F.face + ', Richtung ' + dir, face: F.face, dir, poorBond: F.poorBond, m: maxOf(dem), mBase });
        layers.push(layer);
        offset += L0.phi / 1000;
        // Defizitknoten
        const As0 = layer.prov, d = layer.d, mRd0 = mRdOf(As0, d, mat);
        const req = new Float64Array(n);
        for (let k = 0; k < n; k++) { const mu = dem[k] / (d * d * mat.fcd * 1000); req[k] = mu >= 0.5 ? NaN : (1 - Math.sqrt(1 - 2 * mu)) * d * mat.fcd / mat.fyd * 1e4; }
        nodeAs[F.key + dir] = req;
        const bad = new Uint8Array(n);
        let any = false;
        for (const k of design) {
          muMax = max(muMax, dem[k] / (d * d * mat.fcd * 1000));
          const w = qp && ctx.wkLoad ? crackWidthAs(qp[k], h, d, As0, layer.phi, mat) : 0;
          if (dem[k] > mRd0 * 1.0001 || w > ctx.wkLoad + 1e-9) { bad[k] = 1; any = true; }
        }
        if (!any) continue;
        // Zusammenhängende Bereiche
        const seen = new Uint8Array(n);
        for (const k0 of design) {
          if (!bad[k0] || seen[k0]) continue;
          const stack = [k0], reg = [];
          seen[k0] = 1;
          while (stack.length) {
            const k = stack.pop(); reg.push(k);
            const I = mesh.nodeIJ[2 * k], J = mesh.nodeIJ[2 * k + 1];
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
              const a = I + di, b2 = J + dj;
              if (a < 0 || b2 < 0 || a >= NX || b2 >= NY) continue;
              const kk = nodeAt[a * NY + b2];
              if (kk >= 0 && bad[kk] && !seen[kk]) { seen[kk] = 1; stack.push(kk); }
            }
          }
          let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, mMax = 0, mqMax = 0;
          for (const k of reg) {
            x0 = min(x0, mesh.nodeX[k]); x1 = max(x1, mesh.nodeX[k]); y0 = min(y0, mesh.nodeY[k]); y1 = max(y1, mesh.nodeY[k]);
            mMax = max(mMax, dem[k]); if (qp) mqMax = max(mqMax, qp[k]);
          }
          zul.push({ face: F.face, dir, layer, x0, x1, y0, y1, mMax, mqMax, nodes: reg.length });
        }
      }
    }
    // Zulagen wählen, überlappende Bereiche gleicher Lage zusammenfassen
    const bx = { x0: xs[0], x1: xs[xs.length - 1], y0: ys[0], y1: ys[ys.length - 1] };
    const pick = (z, extraAs) => {
      const L = z.layer;
      for (const sz of [L.s, L.s / 2]) for (const phi of DIAS) {
        if (phi < 8 || phi > (ctx.maxDia || 25)) continue;
        const As = L.prov + asBar(phi) / sz;
        if (extraAs && As < extraAs) continue;
        if (mRdOf(As, L.d, mat) < z.mMax * 1.0001) continue;
        const phiEq = (L.phi * L.phi / L.s + phi * phi / sz) / (L.phi / L.s + phi / sz);
        if (z.mqMax > 0 && ctx.wkLoad && crackWidthAs(z.mqMax, h, L.d, As, phiEq, mat) > ctx.wkLoad + 1e-9) continue;
        return { phi, s: sz, As };
      }
      return null;
    };
    const finalize = (z) => {
      const L = z.layer, bar = pick(z, z.asReq || 0);
      if (!bar) { z.fail = true; if (z.mMax > mRdOf(L.prov + asBar(25) / (L.s / 2), L.d, mat)) fail = true; else crackFail = true; return z; }
      const lb = anchorage(bar.phi, mat, L.poorBond, L.d);
      Object.assign(z, bar, {
        rx0: max(bx.x0, z.dir === 'x' ? z.x0 - lb : z.x0 - L.s), rx1: min(bx.x1, z.dir === 'x' ? z.x1 + lb : z.x1 + L.s),
        ry0: max(bx.y0, z.dir === 'y' ? z.y0 - lb : z.y0 - L.s), ry1: min(bx.y1, z.dir === 'y' ? z.y1 + lb : z.y1 + L.s),
        governs: z.shear ? T_('Querkraft (Längsbewehrung)') : z.mqMax > 0 && bar.As > (L.prov + 1e-9) && mRdOf(L.prov, L.d, mat) >= z.mMax ? T_('Rissbreite unter Last') : T_('Biegung'),
      });
      return z;
    };
    let list = zul.map(finalize);
    for (let pass = 0; pass < 6; pass++) {
      let merged = false;
      for (let i = 0; i < list.length && !merged; i++) for (let j = i + 1; j < list.length && !merged; j++) {
        const a = list[i], c = list[j];
        if (a.face !== c.face || a.dir !== c.dir || a.fail || c.fail) continue;
        if (a.rx0 <= c.rx1 && c.rx0 <= a.rx1 && a.ry0 <= c.ry1 && c.ry0 <= a.ry1) {
          const u = { face: a.face, dir: a.dir, layer: a.layer, x0: min(a.x0, c.x0), x1: max(a.x1, c.x1), y0: min(a.y0, c.y0), y1: max(a.y1, c.y1), mMax: max(a.mMax, c.mMax), mqMax: max(a.mqMax, c.mqMax), nodes: a.nodes + c.nodes, asReq: max(a.asReq || 0, c.asReq || 0), shear: a.shear || c.shear };
          list.splice(j, 1); list.splice(i, 1, finalize(u)); merged = true;
        }
      }
      if (!merged) break;
    }
    // Querkraft je Element außerhalb der Auflagerzone (Abstand d vom Auflagerrand)
    const elemN = mesh.elemN, eIJ = mesh.elemIJ, ne = eIJ.length / 2;
    const layerOf = (face, dir) => layers.find((l) => l.face === face && l.dir === dir);
    const asAt = (face, dir, x, y) => {
      const L = layerOf(face, dir);
      let As = L.prov;
      for (const z of list) if (!z.fail && z.face === face && z.dir === dir && x >= z.rx0 - 1e-9 && x <= z.rx1 + 1e-9 && y >= z.ry0 - 1e-9 && y <= z.ry1 + 1e-9) As += asBar(z.phi) / z.s;
      return { As, d: L.d };
    };
    const elemEta = new Float64Array(ne);
    const shearPass = () => {
      const badE = [];
      let worst = { eta: 0 };
      for (let i = 0; i < ne; i++) {
        const v = res.shear.v[i];
        const dAvg = layers.reduce((s, l) => s + l.d, 0) / layers.length;
        if (!(v > 0) || res.faceDist[i] < dAvg - 1e-9) continue;
        const I = eIJ[2 * i], J = eIJ[2 * i + 1], cx = (xs[I] + xs[I + 1]) / 2, cy = (ys[J] + ys[J + 1]) / 2;
        const face = res.shear.hog[i] ? 'oben' : 'unten';
        const ax = asAt(face, 'x', cx, cy), ay = asAt(face, 'y', cx, cy);
        const d = (ax.d + ay.d) / 2, rho = Math.sqrt(ax.As * ay.As) * 1e-4 / d;
        // Moment am Element (Zugseite der Querkraft, größerer Wert der vier Knoten) für Normen mit md/mRd (SIA 262)
        const dirV = res.shear.vx[i] >= res.shear.vy[i] ? 'x' : 'y', arrM = face === 'oben' ? (dirV === 'x' ? res.uls.tx : res.uls.ty) : (dirV === 'x' ? res.uls.bx : res.uls.by);
        let mEl = 0;
        if (elemN) for (let q4 = 0; q4 < 4; q4++) mEl = max(mEl, arrM[elemN[4 * i + q4]] || 0);
        const vr = NC.vRdc(rho, d, mat, true, mEl), eta = v / vr;
        elemEta[i] = eta;
        if (eta > worst.eta) worst = { eta, vEd: v, vRd: vr, i, x: cx, y: cy, d, face, dir: res.shear.vx[i] >= res.shear.vy[i] ? 'x' : 'y', m: mEl, rho };
        if (eta > 1.0001) badE.push({ i, I, J, x0: xs[I], x1: xs[I + 1], y0: ys[J], y1: ys[J + 1], v, d, face, m: mEl });
      }
      return { worst, badE };
    };
    let sh = shearPass();
    if (sh.badE.length) {
      // Längsbewehrung erhöhen (ρl ≤ 2 %), Bereiche je Zugseite
      const groups = groupRects(sh.badE);
      for (const g of groups) {
        const need = asForShear(g.v, g.d, mat, g.m);
        if (!(need > 0)) continue;
        for (const dir of ['x', 'y']) {
          const L = layerOf(g.face, dir);
          const z = finalize({ face: g.face, dir, layer: L, x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1, mMax: 0, mqMax: 0, nodes: 0, asReq: need * L.d / g.d, shear: true });
          if (!z.fail) list.push(z);
        }
      }
      sh = shearPass();
    }
    // Querkraftbewehrung, wo ρl nicht reicht (Eurocode 6.2.3 mit den nationalen Werten, σcd = 0)
    let links = null;
    if (sh.badE.length) {
      const zones = groupRects(sh.badE).map((g) => {
        const lk = NC.links(g.v, g.d, mat); // asw in cm²/m²
        return { x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1, vEd: g.v, asw: lk.asw, cot: lk.cot, vRdMax: lk.vRdMax, ok: g.v <= lk.vRdMax, area: (g.x1 - g.x0) * (g.y1 - g.y0) };
      });
      links = { zones, ok: zones.every((z) => z.ok) && h >= 0.2 - 1e-9 };
    }
    const w = sh.worst;
    const shear = w.vEd ? { vEd: w.vEd, vRd: w.vRd, eta: links && links.ok ? max(...links.zones.map((z) => z.vEd / z.vRdMax)) : w.eta, edge: w.dir, at: { x: w.x, y: w.y }, links, etaC: w.eta, m: w.m, rho: w.rho, d: w.d } : { vEd: 0, vRd: 0, eta: 0, edge: 'x', links: null, etaC: 0 };
    list = list.filter((z) => !z.fail || (fail = fail || z.mMax > 0, false));
    const mom = (face, dir) => design.reduce((m, k) => max(m, (face === 'b' ? (dir === 'x' ? res.uls.bx : res.uls.by) : (dir === 'x' ? res.uls.tx : res.uls.ty))[k]), 0);
    let defl = o.defl || { ld: 0, lim: 35, eta: 0 };
    // Durchbiegung aus der FE-Rechnung (quasi-ständig, elastisch) mit Kriechen (φ = 2,5) und Rissbildung (ζ-Verfahren, EC2 7.4.3),
    // Grenze l/250 mit l = kürzere Stützweite am Ort der größten Durchbiegung
    if (res.wqp && o.spanAt) {
      let km = -1, wm = 0;
      for (const k of design) if (res.wqp[k] > wm) { wm = res.wqp[k]; km = k; }
      if (km >= 0) {
        const sp = o.spanAt(mesh.nodeX[km], mesh.nodeY[km]), l = min(sp.lx, sp.ly);
        const bot = layers.filter((L) => L.face === 'unten'), Lb = bot.reduce((a, L) => (L.d > a.d ? L : a), bot[0]);
        const phiC = 2.5, ae = 200000 / (mat.Ecm / (1 + phiC)), As = Lb.prov * 1e-4, dB = Lb.d, rho = As / dB;
        const x = ae * rho * dB * (Math.sqrt(1 + 2 / (ae * rho)) - 1), I2 = x * x * x / 3 + ae * As * (dB - x) * (dB - x), I1 = h * h * h / 12;
        const mq = res.sls ? max(res.sls.bx[km], res.sls.by[km]) : 0, mcr = mat.fctm * 1000 * h * h / 6;
        const zeta = mq > mcr ? 1 - 0.5 * (mcr / mq) * (mcr / mq) : 0;
        const kap = zeta * I1 / I2 + (1 - zeta), w = wm * (1 + phiC) * kap;
        const lw = l / NC.deflLimit;
        defl = { method: 'FE', w, wEl: wm, l, lim: lw, eta: w / lw, ld: l / dB, zeta, phi: phiC, at: { x: mesh.nodeX[km], y: mesh.nodeY[km] }, limDiv: NC.deflLimit };
      }
    }
    if (o.noDefl) defl = { ld: 0, lim: 35, eta: 0, method: 'gebettet' };
    const muEta = muMax / NC.muLim;
    const wkMax = max(...layers.map((l) => l.wkLoad || 0));
    return {
      name, h, method: 'FE', fe: res, layers, nodeAs, elemEta, zulagen: list.map((z) => ({ face: z.face, dir: z.dir, phi: z.phi, s: z.s, x0: z.rx0, x1: z.rx1, y0: z.ry0, y1: z.ry1, mMax: z.mMax, governs: z.governs, poorBond: z.layer.poorBond, d: z.layer.d, basePhi: z.layer.phi, baseS: z.layer.s })),
      moments: { mFx: mom('b', 'x'), mFy: mom('b', 'y'), mSx: mom('t', 'x'), mSy: mom('t', 'y'), mJ: res.mJ },
      shear, defl, acc: o.acc || null, qp: 0, wkMax,
      etaS: max(muEta, shear.eta, defl.eta), eta: max(muEta, shear.eta, defl.eta, o.acc ? o.acc.eta : 0),
      fail: fail || muEta > 1, crackFail, accLayerFail, shearFail: !!(links && !links.ok),
    };
  }

  /* Benachbarte Elemente mit Querkraftdefizit zu Rechtecken zusammenfassen (je Zugseite). */
  function groupRects(els) {
    const byFace = {};
    for (const e of els) (byFace[e.face] = byFace[e.face] || []).push(e);
    const out = [];
    for (const [face, arr] of Object.entries(byFace)) {
      const key = (e) => e.I + ':' + e.J, map = new Map(arr.map((e) => [key(e), e])), seen = new Set();
      for (const e0 of arr) {
        if (seen.has(key(e0))) continue;
        const st = [e0], g = { face, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, v: 0, d: e0.d };
        seen.add(key(e0));
        while (st.length) {
          const e = st.pop();
          g.x0 = min(g.x0, e.x0); g.x1 = max(g.x1, e.x1); g.y0 = min(g.y0, e.y0); g.y1 = max(g.y1, e.y1);
          if (e.v > g.v) { g.v = e.v; g.d = e.d; g.m = e.m; }
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const kk = (e.I + di) + ':' + (e.J + dj), nb = map.get(kk);
            if (nb && !seen.has(kk)) { seen.add(kk); st.push(nb); }
          }
        }
        out.push(g);
      }
    }
    return out;
  }

  /* ---------- Stützen: Bemessung nach EC2 5.8 (Nennkrümmung), Durchstanzen nach EC2 6.4 mit NA DE ---------- */

  const COL_COVER = 0.03;         // Betondeckung der Bügel, Innenbauteil (XC1) mit Reserve
  const COL_PHI0 = [12, 14, 16, 20, 25, 28];
  const COL_PHI = { [Symbol.iterator]: () => (NC.colPhi || COL_PHI0)[Symbol.iterator]() };
  const PHI_EF = 1.6;             // wirksame Kriechzahl (φ∞ ≈ 2,3 × quasi-ständiger Anteil ≈ 0,7)

  /* Biegetragfähigkeit eines symmetrisch bewehrten Rechteckquerschnitts bei Normalkraft N (Druck positiv, kN).
   * b: Breite, h: Höhe in Momentenrichtung [m], As: Gesamtbewehrung [cm²] je Hälfte an den Rändern, d1: Randabstand der Bewehrung. */
  /* Querschnitt mit je frac · As in den beiden gezogenen bzw. gedrückten Randlagen (Seitenstäbe nahe der Nulllinie vernachlässigt) */
  function colSection(b, h, As, d1, mat, frac) {
    // Beton Parabel-Rechteck (εc2 = 2 ‰, εcu2 = 3,5 ‰): bis x = h geschlossen (αR = 17/21, ka = 99/238), darüber Drehpunkt
    // bei εc2 in 3/7 h (EC2 Bild 6.1) mit Streifenintegration; Stahl bilinear. Der Spannungsblock 0,8x liefert bei großer
    // Druckzone zu große Momente (bis +5 % bei NEd ≈ 0,7 NRd, siehe Referenzbeispiele).
    const fcd = mat.fcd * 1000, fyd = mat.fyd * 1000, Es = 200e6, ec2 = 0.002, ecu = NC.ecu || 0.0035, a2 = As * (frac != null ? frac : 0.5) * 1e-4, d = h - d1;
    const sig = (e) => clamp(Es * e, -fyd, fyd);
    const sc = (e) => (e <= 0 ? 0 : e < ec2 ? fcd * (1 - (1 - e / ec2) * (1 - e / ec2)) : fcd);
    const eps = (x, z) => (x <= h ? ecu * (x - z) / x : ec2 * (x - z) / (x - 3 * h / 7));
    const at = (x) => {
      let Fc = 0, Mc = 0;
      if (x <= h) { Fc = 17 / 21 * x * b * fcd; Mc = Fc * (h / 2 - 99 / 238 * x); }
      else for (let i = 0, n = 60; i < n; i++) { const z = (i + 0.5) * h / n, f = sc(eps(x, z)) * b * h / n; Fc += f; Mc += f * (h / 2 - z); }
      const F2 = a2 * sig(eps(x, d1)), F1 = a2 * sig(eps(x, d));
      return { N: Fc + F2 + F1, M: Mc + F2 * (h / 2 - d1) - F1 * (d - h / 2) };
    };
    const N0 = b * h * fcd + As * 1e-4 * min(fyd, 400e3); // zentrischer Druck, εc2 = 2 ‰
    const Nt = -As * 1e-4 * fyd;
    return {
      N0, Nt,
      mRd(N) {
        if (N >= N0 || N <= Nt) return 0;
        let lo = 1e-5, hi = 1000 * h;
        for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (at(m).N < N) lo = m; else hi = m; }
        return max(0, at((lo + hi) / 2).M);
      },
    };
  }

  /* ACI 318-19: Querschnitt mit Spannungsblock 0,85 f′c über β1·c (εcu = 0,003), Stahl bilinear, φ nach Dehnung εt
   * (0,65 druckbeherrscht bis 0,90 zugbeherrscht, Tab. 21.2.2), φPn,max = 0,65 · 0,80 · Po (Bügelstützen, 22.4.2.1). */
  function colSectionACI(b, h, As, d1, mat, frac) {
    const fc = mat.fck * 1000, fy = (NC.fyACI || 420) * 1000, Es = 200e6, ecu = 0.003, b1 = mat.beta1 || 0.85, ety = fy / Es;
    const a2 = As * (frac != null ? frac : 0.5) * 1e-4, d = h - d1;
    const sig = (e) => clamp(Es * e, -fy, fy);
    const at = (c) => {
      const a = min(b1 * c, h), Cc = 0.85 * fc * a * b;
      const e2 = ecu * (c - d1) / c, e1 = ecu * (c - d) / c; // Druck positiv
      const F2 = a2 * (sig(e2) - (a > d1 ? 0.85 * fc : 0)), F1 = a2 * (sig(e1) - (a > d ? 0.85 * fc : 0));
      const et = -e1, phi = et <= ety ? 0.65 : et >= ety + 0.003 ? 0.9 : 0.65 + 0.25 * (et - ety) / 0.003;
      return { P: Cc + F2 + F1, M: Cc * (h / 2 - a / 2) + F2 * (h / 2 - d1) - F1 * (d - h / 2), phi };
    };
    const Po = 0.85 * fc * (b * h - As * 1e-4) + fy * As * 1e-4, N0 = 0.65 * 0.8 * Po;
    return {
      N0, Nt: -0.9 * As * 1e-4 * fy,
      mRd(N) {
        if (N >= N0 || N <= -0.9 * As * 1e-4 * fy) return 0;
        let lo = 1e-4, hi = 50 * h;
        for (let k = 0; k < 90; k++) { const m = (lo + hi) / 2, r = at(m); if (r.phi * r.P < N) lo = m; else hi = m; }
        const r = at((lo + hi) / 2);
        return max(0, r.phi * r.M);
      },
    };
  }

  /* Stütze nach ACI 318-19: Mindestmoment Pu·(15 + 0,03 h) mm (6.6.4.5.4), Schlankheit kl/r ≤ 22 (ausgesteift, Cm = 1,0
   * auf der sicheren Seite), sonst Momentenvergrößerung δ = Cm/(1 − Pu/(0,75 Pc)) ≥ 1 mit (EI)eff = 0,4 Ec Ig/(1 + βdns),
   * βdns = 0,6; zweiachsig wie EN 1992-1-1 5.8.9 (Exponentenformel); Längsbewehrung 1 % bis 4 % Ag, Bügel 25.7.2. */
  function columnDesignACI(c, nEd, l0, mat) {
    const Ac = c.bx * c.by, CL = NC.col, Ec = mat.Ecm * 1000;
    const asMin = 0.01 * Ac * 1e4, asMax = CL.asMax * Ac * 1e4, cc = mat.colCover || COL_COVER;
    const evalAs = (As, phi, nb) => {
      const d1 = cc + 0.01 + phi / 2000;
      const per = max(0, ((nb || 4) - 4) / 2), nx = Math.round(per * c.bx / (c.bx + c.by)), ny = per - nx, nbT = 4 + 2 * per;
      const dirs = [{ k: 'x', h: c.bx, b: c.by, nFace: ny + 2 }, { k: 'y', h: c.by, b: c.bx, nFace: nx + 2 }].map((D) => {
        const r = 0.3 * D.h, lam = l0 / r, e0 = 0.015 + 0.03 * D.h;
        let delta = 1;
        if (lam > 22) {
          const EI = 0.4 * Ec * D.b * D.h * D.h * D.h / 12 / 1.6, Pc = Math.PI * Math.PI * EI / (l0 * l0);
          delta = nEd >= 0.75 * Pc ? Infinity : max(1, 1 / (1 - nEd / (0.75 * Pc)));
        }
        const sec = colSectionACI(D.b, D.h, As, d1, mat, D.nFace / nbT), mRd = sec.mRd(nEd);
        return Object.assign(D, { lam, e0, ei: 0, e2: (delta - 1) * e0, delta, mRd, N0: sec.N0, mFull: nEd * e0 * delta, mSec: nEd * e0 * (delta - 1) });
      });
      const r = nEd / dirs[0].N0, a = r <= 0.1 ? 1 : r >= 1 ? 2 : r <= 0.7 ? 1 + (r - 0.1) / 0.6 * 0.5 : 1.5 + (r - 0.7) / 0.3 * 0.5;
      const u = (m, mr) => (mr > 1e-9 ? m / mr : Infinity);
      const eta = max(u(dirs[0].mFull, dirs[0].mRd), u(dirs[1].mFull, dirs[1].mRd), nEd / dirs[0].N0,
        Math.pow(Math.pow(u(dirs[0].mFull, dirs[0].mRd), a) + Math.pow(u(dirs[1].mSec, dirs[1].mRd), a), 1 / a),
        Math.pow(Math.pow(u(dirs[1].mFull, dirs[1].mRd), a) + Math.pow(u(dirs[0].mSec, dirs[0].mRd), a), 1 / a));
      return { dirs, eta, d1 };
    };
    let best = null;
    for (const phi of COL_PHI) {
      const cover = cc + 0.01 + phi / 2000, per = (L) => max(0, Math.ceil((L - 2 * cover) / 0.30 - 1e-9) - 1);
      const nMin = 4 + 2 * per(c.bx) + 2 * per(c.by);
      for (let nb = nMin; nb <= nMin + 24; nb += 2) {
        const As = nb * asBar(phi);
        if (As < asMin - 1e-9) continue;
        if (As > asMax + 1e-9) break;
        const ev = evalAs(As, phi, nb);
        if (ev.eta <= 1 + 1e-9) { if (!best || As < best.As - 1e-9) best = Object.assign({ phi, nb, As }, ev); break; }
      }
    }
    const fail = !best, phiMax = [...COL_PHI].pop();
    if (!best) { const nb = 2 * Math.ceil(asMax / asBar(phiMax) / 2), As = nb * asBar(phiMax); best = Object.assign({ phi: phiMax, nb, As }, evalAs(As, phiMax, nb)); }
    const phiW = NC.tiePhi ? NC.tiePhi(best.phi) : 10;
    const sw = Math.floor(min(16 * best.phi / 1000, 48 * phiW / 1000, min(c.bx, c.by)) * 100) / 100;
    const D = best.dirs;
    return {
      nEd, l0, n: nEd / (Ac * mat.fcd * 1000), lamLim: 22, lam: max(D[0].lam, D[1].lam), second: D.some((x) => x.lam > 22), asMin, asMax,
      As: best.As, phi: best.phi, nb: best.nb, stirrup: { phi: phiW, s: sw, sEnd: sw },
      dirs: D.map((x) => ({ k: x.k, lam: x.lam, e0: x.e0, ei: 0, e2: x.e2, mEd: x.mFull, mRd: x.mRd, delta: x.delta })), eta: best.eta, fail, aci: true,
    };
  }

  /* Stütze: NEd in kN, l0 Knicklänge. Imperfektion l0/400 und Mindestausmitte max(h/30, 20 mm) in der ungünstigeren Richtung,
   * Theorie II. Ordnung über Nennkrümmung, wenn λ > λlim (NA DE). Liefert gewählte Längs- und Bügelbewehrung. */
  function columnDesign(c, nEd, l0, mat) {
    if (NC.col && NC.col.aci) return columnDesignACI(c, nEd, l0, mat);
    const Ac = c.bx * c.by, fcd = mat.fcd * 1000, fyd = mat.fyd * 1000;
    const n = nEd / (Ac * fcd), CL = NC.col;
    // λlim: NA DE 25 bzw. 16/√n, EN 20·A·B·C/√n mit A = 0,7, B = 1,1, C = 0,7
    const lamLim = CL.lamLim(n);
    // As,max: NA DE 0,09 Ac auch im Stoß, EN 0,08 Ac im Stoß; alle Stäbe in einem Querschnitt gestoßen → halber Wert
    const asMin = CL.asMin(nEd, fyd, Ac), asMax = CL.asMax * Ac * 1e4;
    const cc = mat.colCover || COL_COVER;
    const evalAs = (As, phi, nb) => {
      const d1 = cc + 0.01 + phi / 2000;
      // Stabanordnung wie im Plan: Ecken, Zwischenstäbe nach Seitenlänge verteilt
      const per = max(0, ((nb || 4) - 4) / 2), nx = Math.round(per * c.bx / (c.bx + c.by)), ny = per - nx, nbT = 4 + 2 * per;
      const dirs = [{ k: 'x', h: c.bx, b: c.by, nFace: ny + 2, nSide: nx }, { k: 'y', h: c.by, b: c.bx, nFace: nx + 2, nSide: ny }].map((D) => {
        const zf = D.h / 2 - d1;
        let s2 = 2 * D.nFace * zf * zf;
        for (let j = 1; j <= D.nSide; j++) { const z = zf * (2 * j / (D.nSide + 1) - 1); s2 += 2 * z * z; }
        const iS = Math.sqrt(s2 / nbT); // Trägheitsradius der Bewehrung (EC2 5.8.8.3(2): d = h/2 + iS)
        const i = D.h / Math.sqrt(12), lam = l0 / i, d = D.h / 2 + iS;
        let e2 = 0;
        if (lam > lamLim) {
          const om = As * 1e-4 * fyd / (Ac * fcd), nu = 1 + om, Kr = min(1, max(0, (nu - n) / (nu - 0.4)));
          const beta = 0.35 + mat.fck / 200 - lam / 150, Kphi = max(1, 1 + beta * PHI_EF);
          e2 = Kr * Kphi * (mat.fyd / 200000) / (0.45 * d) * l0 * l0 / 10;
        }
        const e0 = max(D.h / 30, 0.02), ei = l0 / 400;
        const sec = colSection(D.b, D.h, As, d1, mat, D.nFace / nbT), mRd = sec.mRd(nEd);
        return Object.assign(D, { lam, e0, ei, e2, mRd, N0: sec.N0, mFull: nEd * (e0 + ei + e2), mSec: nEd * e2 });
      });
      // je Richtung einachsig mit Imperfektion, dazu zweiachsig: Imperfektion nur in einer Richtung (EC2 5.8.9)
      const r = nEd / dirs[0].N0, a = r <= 0.1 ? 1 : r >= 1 ? 2 : r <= 0.7 ? 1 + (r - 0.1) / 0.6 * 0.5 : 1.5 + (r - 0.7) / 0.3 * 0.5;
      const u = (m, mr) => (mr > 1e-9 ? m / mr : Infinity);
      const eta = max(u(dirs[0].mFull, dirs[0].mRd), u(dirs[1].mFull, dirs[1].mRd),
        Math.pow(Math.pow(u(dirs[0].mFull, dirs[0].mRd), a) + Math.pow(u(dirs[1].mSec, dirs[1].mRd), a), 1 / a),
        Math.pow(Math.pow(u(dirs[1].mFull, dirs[1].mRd), a) + Math.pow(u(dirs[0].mSec, dirs[0].mRd), a), 1 / a), nEd / dirs[0].N0);
      return { dirs, eta, d1 };
    };
    // Bewehrung: Ecken plus Zwischenstäbe, lichter Abstand ≤ 30 cm, Ø ≥ 12 mm (NA DE); leichteste Lösung, die η ≤ 1 einhält
    let best = null;
    for (const phi of COL_PHI) {
      const cover = cc + 0.01 + phi / 2000;
      // Zwischenstäbe je Seite: Achsabstand ≤ 30 cm; bis 40 × 40 cm genügt je ein Stab in den Ecken (NA DE 9.5.2(4))
      const per = (L) => max(0, Math.ceil((L - 2 * cover) / 0.30 - 1e-9) - 1);
      const nMin = c.bx <= 0.4 + 1e-9 && c.by <= 0.4 + 1e-9 ? 4 : 4 + 2 * per(c.bx) + 2 * per(c.by);
      for (let nb = nMin; nb <= nMin + 24; nb += 2) {
        const As = nb * asBar(phi);
        if (As < asMin - 1e-9) continue;
        if (As > asMax + 1e-9) break;
        const ev = evalAs(As, phi, nb);
        if (ev.eta <= 1 + 1e-9) { if (!best || As < best.As - 1e-9) best = Object.assign({ phi, nb, As }, ev); break; }
      }
    }
    const fail = !best;
    if (!best) { const phi = 28, nb = 2 * Math.ceil(asMax / asBar(phi) / 2), As = nb * asBar(phi); best = Object.assign({ phi, nb, As }, evalAs(As, phi, nb)); }
    const phiW = NC.tiePhi ? NC.tiePhi(best.phi) : best.phi <= 20 ? 8 : 10;
    const sw = Math.floor(min(CL.sw[0] * best.phi / 1000, min(c.bx, c.by), CL.sw[1]) * 100) / 100;
    const D = best.dirs;
    return {
      nEd, l0, n, lamLim, lam: max(D[0].lam, D[1].lam), second: D.some((x) => x.lam > lamLim), asMin, asMax,
      As: best.As, phi: best.phi, nb: best.nb, stirrup: { phi: phiW, s: sw, sEnd: Math.floor(0.6 * sw * 100) / 100 },
      dirs: D.map((x) => ({ k: x.k, lam: x.lam, e0: x.e0, ei: x.ei, e2: x.e2, mEd: x.mFull, mRd: x.mRd })), eta: best.eta, fail,
    };
  }

  /* Mindestgröße einer quadratischen Stütze für NEd (5-cm-Schritte), Startwert für die automatische Anordnung. */
  function columnSizeFor(nEd, l0, mat, fireCls) {
    for (let b = 0.30; b <= 1.5 + 1e-9; b = Math.round((b + 0.05) * 100) / 100) {
      const r = columnDesign({ bx: b, by: b }, nEd, l0, mat);
      if (r.fail || r.As > 0.03 * b * b * 1e4) continue;
      // Feuerwiderstand (DIN EN 1992-1-2, Tab. 5.2a): Mindestbreite und Achsabstand bei μfi ≈ 0,7 NEd / NRd
      if (fireCls && fireCls !== 'keine' && BP.verify) {
        const fr = BP.verify.colReq(fireCls, 0.7, b * 1000, r.nb);
        if (fr.a == null || ((mat.colCover || COL_COVER) + r.stirrup.phi / 1000) * 1000 + r.phi / 2 < fr.a - 1e-6) continue;
      }
      return b;
    }
    return 1.5;
  }

  /* Bewehrung einer Plattenlage am Punkt (Grundbewehrung plus Zulagen, die den Punkt überdecken) [cm²/m] und Nutzhöhe. */
  function slabAsAt(pl, face, dir, x, y) {
    const L = pl.layers.find((l) => l.face === face && (l.dir === dir || (!l.dir && face === 'oben')));
    if (!L) return null;
    let As = L.prov;
    for (const z of pl.zulagen || []) if (z.face === face && z.dir === dir && x >= z.x0 - 1e-9 && x <= z.x1 + 1e-9 && y >= z.y0 - 1e-9 && y <= z.y1 + 1e-9) As += asBar(z.phi) / z.s;
    return { As, d: L.d };
  }

  /* Durchstanzen (EC2 6.4, NA DE). VEd in kN. face: Zugseite der Platte ('oben' über Stützen, 'unten' bei Lasten von oben).
   * soil: Bodenpressung [kN/m²] bei Fundamentplatten (Abzug innerhalb des Rundschnitts, iterativ a = 0,3d … 2d). */
  /* Öffnungen im Abstand ≤ 6 d vom Stützenrand: der Teil des Rundschnitts zwischen den Tangenten vom Stützenmittelpunkt
   * an die Öffnung ist unwirksam (EC2 6.4.2(3), Bild 6.14). Ergebnis: unwirksamer Anteil des Umfangs (Winkelanteil). */
  function openingLoss(c, holes, d) {
    if (!holes || !holes.length) return { f: 0, n: 0 };
    const rect = G.polygonFromRect(c.x - c.bx / 2, c.y - c.by / 2, c.x + c.bx / 2, c.y + c.by / 2);
    const blocked = new Uint8Array(360);
    let n = 0;
    for (const h of holes) {
      if (!h || h.length < 3 || G.pointInPolygon({ x: c.x, y: c.y }, h)) continue;
      let dist = Infinity;
      for (let i = 0; i < h.length; i++) {
        const a = h[i], b2 = h[(i + 1) % h.length];
        for (const r of rect) dist = min(dist, G.distPointSeg(r, a, b2).d);
        for (let j = 0; j < 4; j++) dist = min(dist, G.distPointSeg(a, rect[j], rect[(j + 1) % 4]).d);
      }
      if (dist > 6 * d) continue;
      n++;
      const ang = h.map((pt) => (Math.atan2(pt.y - c.y, pt.x - c.x) * 180 / Math.PI + 360) % 360).sort((x, y) => x - y);
      let gap = 0, gi = 0;
      for (let i = 0; i < ang.length; i++) { const g2 = (i + 1 < ang.length ? ang[i + 1] : ang[0] + 360) - ang[i]; if (g2 > gap) { gap = g2; gi = i; } }
      const start = ang[(gi + 1) % ang.length], span = 360 - gap;
      for (let k2 = 0; k2 < Math.ceil(span); k2++) blocked[Math.floor(start + k2) % 360] = 1;
    }
    const f = blocked.reduce((s2, x) => s2 + x, 0) / 360;
    return { f: min(0.9, f), n };
  }

  /* Durchstanzen nach SIA 262 4.3.6 (Näherungsstufe 2): VRd,c = kr·τcd·dv·u, kr = 1/(0,45 + 0,18·ψ·d·kg) ≤ 2,
   * ψ = 1,5·rs/d·fsd/Es·(msd/mRd)^1,5 mit rs = 0,22·L und msd = Vd/8 (Innenstütze), Nachweisschnitt im Abstand dv/2,
   * u reduziert mit ke = 0,9; Bodenplatten mit Abzug der Bodenpressung innerhalb des Nachweisschnitts.
   * Durchstanzbewehrung: Vd,s = Vd − VRd,c ≥ Vd/2, Asw = Vd,s/(ke·σsd), σsd = Es·ψ/6·(1 + fbd/fsd·d/Øsw) ≤ fsd;
   * VRd,max = ksys·kr·τcd·dv·u ≤ 3,5·τcd·dv·u (ksys = 2,0); außerhalb der Bewehrung Nachweis mit u im Abstand dv/2. */
  function punchingSIA(pl, c, VEd, mat, opt) {
    const face = opt.face || 'oben', PU = NC.punch, ke = PU.ke || 0.9;
    const ax = slabAsAt(pl, face, 'x', c.x, c.y), ay = slabAsAt(pl, face, 'y', c.x, c.y);
    if (!ax || !ay) return null;
    const d = (ax.d + ay.d) / 2, dmm = d * 1000, As = Math.sqrt(ax.As * ay.As) * 1e-4, rho = min(0.02, As / d);
    const mRd = As * mat.fyd * 1000 * (d - As * mat.fyd / (2 * mat.fcd));
    const ol = openingLoss(c, opt.holes, d), fu = 1 - ol.f, u00 = 2 * (c.bx + c.by);
    const Ain = (a) => c.bx * c.by + 2 * a * (c.bx + c.by) + Math.PI * a * a;
    const uAt = (a) => (u00 + 2 * Math.PI * a) * fu * ke;
    const L = opt.L > 0 ? opt.L : max(2, 4 * d / 0.22), rs = 0.22 * L, kg = NC.kg(mat), tau = mat.tauCd;
    const Vd = (a) => max(0, VEd - (opt.soil != null ? opt.soil * Ain(a) : 0));
    const V1 = Vd(d / 2), msd = V1 / 8;
    const psi = 1.5 * rs / d * mat.fyd / NC.Es * Math.pow(min(1, msd / max(mRd, 1e-9)), 1.5);
    const kr = min(2, 1 / (0.45 + 0.18 * psi * dmm * kg)), vRdc = kr * tau;
    const u1 = uAt(d / 2), vEd = V1 / (u1 * d) / 1000, vRdMax = min(PU.ksys * kr * tau, 3.5 * tau);
    const res = { method: 'SIA', VEd, d, rho, k: kr, kr, psi, rs, mRd, msd, u0: u00 * fu, u1, vEd, vRdc, vRdMax, vEd0: 0, vRdMax0: Infinity, face, openings: ol.n, uLoss: ol.f, beta: 1, foundation: opt.soil != null, soil: opt.soil };
    res.etaC = vEd / vRdc; res.needs = res.etaC > 1 + 1e-9; res.fail = vEd > vRdMax + 1e-9;
    res.eta = res.needs ? vEd / vRdMax : res.etaC;
    if (res.needs && !res.fail) {
      const phiSw = 10, sr = 0.75 * d, sigSd = min(mat.fyd, NC.Es * psi / 6 * (1 + (mat.fbd || 2) / mat.fyd * dmm / phiSw));
      const Vds = max(V1 - vRdc * u1 * d * 1000, V1 / 2), asw = Vds / (ke * sigSd * 1000) * 1e4; // cm² im Bereich bis dv vom Stützenrand
      // Reihen bis der Schnitt dv/2 außerhalb der letzten Reihe ohne Bewehrung genügt
      const rowR = [0.35 * d, 0.35 * d + sr];
      for (let i = 0; i < 20; i++) { const rU = rowR[rowR.length - 1] + d / 2, uO = uAt(rU); if (Vd(rU) / (uO * d) / 1000 <= vRdc + 1e-9) break; rowR.push(rowR[rowR.length - 1] + sr); }
      const rOut = rowR[rowR.length - 1] + d / 2, aswMin = 0.001 * sr * 1.5 * d * 1e4;
      res.links = { method: 'SIA', sr, fyw: sigSd, sigSd, asw: max(aswMin, asw / 4), rows: rowR.length, rowR, rOut, uOut: uAt(rOut), row1: asw / 2, row2: asw / 2, aswMin, Vds };
    }
    return res;
  }

  /* Durchstanzen nach ACI 318-19 22.6: kritischer Schnitt d/2 vor den Stützenseiten (b₀ = 2(bx + by) + 4d), φ = 0,75,
   * vc = min(0,33; 0,17 (1 + 2/β); 0,083 (2 + αs·d/b₀)) · λs · √f′c (αs = 40), Bodenplatten λs = 1,0 (13.2.6.2) mit Abzug der
   * Bodenpressung innerhalb b₀. Mit Bügeln (22.6.6): vc ≤ 0,17 λs √f′c, vu ≤ φ · 0,5 √f′c, Reihen im Abstand ≤ d/2 bis zum
   * Schnitt d/2 außerhalb der letzten Reihe mit φ · 0,17 λs √f′c. */
  function punchingACI(pl, c, VEd, mat, opt) {
    const face = opt.face || 'oben', PU = NC.punch;
    const ax = slabAsAt(pl, face, 'x', c.x, c.y), ay = slabAsAt(pl, face, 'y', c.x, c.y);
    if (!ax || !ay) return null;
    const d = (ax.d + ay.d) / 2, rho = min(0.02, Math.sqrt((ax.As * 1e-4 / ax.d) * (ay.As * 1e-4 / ay.d)));
    const ol = openingLoss(c, opt.holes, d), fu = 1 - ol.f, u00 = 2 * (c.bx + c.by);
    const found = opt.soil != null, lam = found ? 1 : NC.lamS(d), sq = NC.sq(mat.fck), beta = max(c.bx, c.by) / max(1e-6, min(c.bx, c.by));
    const b0 = (u00 + 4 * d) * fu, Ain = (c.bx + d) * (c.by + d);
    const vc = min(0.33, 0.17 * (1 + 2 / beta), 0.083 * (2 + PU.alphaS * d / b0)) * lam * sq;
    const Vu = max(0, VEd - (found ? opt.soil * Ain : 0)), vu = Vu / (b0 * d) / 1000;
    const vRdc = PU.phi * vc, vRdMax = PU.phi * 0.5 * sq;
    const res = { method: 'ACI', VEd, d, rho, k: lam, lam, beta, u0: u00 * fu, u1: b0, vEd: vu, vRdc, vRdMax, vEd0: 0, vRdMax0: Infinity, face, openings: ol.n, uLoss: ol.f, foundation: found, soil: opt.soil };
    res.etaC = vu / vRdc; res.needs = res.etaC > 1 + 1e-9; res.fail = vu > vRdMax + 1e-9;
    res.eta = res.needs ? vu / vRdMax : res.etaC;
    if (res.needs && !res.fail) {
      const fyt = NC.fyACI || 420, sr = d / 2, vs = max(0, vu / PU.phi - 0.17 * lam * sq);
      const av = max(vs, 0.17 * sq) * b0 * sr / fyt * 1e4; // cm² je Reihe (22.6.6.1, Mindestwert 22.6.8.3)
      const vcOut = PU.phi * 0.17 * lam * sq, rowR = [0.4 * d];
      for (let i = 0; i < 24; i++) {
        const rO = rowR[rowR.length - 1] + d / 2, uO = (u00 + 2 * Math.PI * rO) * fu, VO = max(0, VEd - (found ? opt.soil * (c.bx * c.by + 2 * rO * (c.bx + c.by) + Math.PI * rO * rO) : 0));
        if (VO / (uO * d) / 1000 <= vcOut + 1e-9 && rowR.length >= 2) break;
        rowR.push(rowR[rowR.length - 1] + sr);
      }
      const rOut = rowR[rowR.length - 1] + d / 2;
      res.links = { method: 'ACI', sr, fyw: fyt, asw: av, rows: rowR.length, rowR, rOut, uOut: (u00 + 2 * Math.PI * rOut) * fu, row1: av, row2: av, aswMin: 0 };
    }
    return res;
  }

  function punching(pl, c, VEd, mat, opt) {
    opt = opt || {};
    if (NC.punch.method === 'SIA') return punchingSIA(pl, c, VEd, mat, opt);
    if (NC.punch.method === 'ACI') return punchingACI(pl, c, VEd, mat, opt);
    const PU = NC.punch, face = opt.face || 'oben', beta = opt.beta || PU.beta;
    const ax = slabAsAt(pl, face, 'x', c.x, c.y), ay = slabAsAt(pl, face, 'y', c.x, c.y);
    if (!ax || !ay) return null;
    const d = (ax.d + ay.d) / 2, dmm = d * 1000;
    const rho = min(Math.sqrt((ax.As * 1e-4 / ax.d) * (ay.As * 1e-4 / ay.d)), 0.02, 0.5 * mat.fcd / mat.fyd);
    const k = min(2, 1 + Math.sqrt(200 / dmm));
    const ol = openingLoss(c, opt.holes, d), fu = 1 - ol.f;
    const u0 = 2 * (c.bx + c.by) * fu, uAt = (a) => (2 * (c.bx + c.by) + 2 * Math.PI * a) * fu;
    const vmin = PU.vmin(d, mat.fck);
    const nu = 0.6 * (1 - mat.fck / 250), vRdMax0 = PU.vMax0(nu, mat.fcd);
    const vEd0 = beta * VEd / (u0 * d) / 1000;
    let res;
    if (opt.soil != null) {
      // Fundamentplatte: kritischer Rundschnitt im Abstand a ≤ 2d, Bodenpressung innerhalb abziehen, vRd,c·2d/a (CRd,c = 0,15/γc)
      let worst = null;
      for (let a = 0.3 * d; a <= 2 * d + 1e-9; a += 0.05 * d) {
        const u = uAt(a), Acrit = c.bx * c.by + 2 * a * (c.bx + c.by) + Math.PI * a * a;
        const Vred = max(0, VEd - opt.soil * Acrit), v = beta * Vred / (u * d) / 1000;
        const vr = max(PU.crdcF() * k * Math.pow(100 * rho * mat.fck, 1 / 3), vmin) * 2 * d / a;
        if (!worst || v / vr > worst.eta) worst = { a, u, v, vr, eta: v / vr, Vred };
      }
      res = { foundation: true, a: worst.a, u1: worst.u, vEd: worst.v, vRdc: worst.vr, VEdRed: worst.Vred, soil: opt.soil };
    } else {
      const u1 = uAt(2 * d);
      const u00 = 2 * (c.bx + c.by), CRd = PU.crdc(u00 / d);
      const vRdc = max(CRd * k * Math.pow(100 * rho * mat.fck, 1 / 3), vmin);
      res = { u1, vEd: beta * VEd / (u1 * d) / 1000, vRdc };
    }
    Object.assign(res, { VEd, beta, d, rho, k, u0, vEd0, vRdMax0, face, openings: ol.n, uLoss: ol.f });
    res.etaC = res.vEd / res.vRdc;
    res.needs = res.etaC > 1 + 1e-9;
    const vRdMaxL = PU.vRdMax(res.vRdc, d, nu, mat.fcd);
    res.vRdMax = vRdMaxL;
    res.fail = res.vEd > vRdMaxL + 1e-9 || vEd0 > vRdMax0 + 1e-9;
    res.eta = max(res.vEd / (res.needs ? vRdMaxL : res.vRdc), vEd0 / vRdMax0);
    if (res.needs && !res.fail && res.foundation && NC.punch.rows) {
      // Fundamente und Bodenplatten (NA DE NCI zu 6.4.5(1)): Reihen bei 0,3 d und 0,8 d nehmen β·VEd,red ohne Betontraganteil auf,
      // weitere Reihen im Abstand ≤ 0,75 d je 33 % der Querkraft abzüglich Bodenpressung innerhalb der Reihe; Nachweis bei 1,5 d außen
      const fyw = min(250 + 0.25 * dmm, mat.fyd), sr = 0.75 * d, u00 = 2 * (c.bx + c.by);
      const Ain = (r) => c.bx * c.by + 2 * r * (c.bx + c.by) + Math.PI * r * r;
      const asw12 = beta * res.VEdRed / (fyw * 1000) * 1e4; // cm² für beide Reihen
      const vOut = max(PU.crdcF() * k * Math.pow(100 * rho * mat.fck, 1 / 3), vmin);
      const rowR = [0.3 * d, 0.8 * d], extra = [];
      for (let i = 0; i < 20; i++) {
        const rLast = rowR[rowR.length - 1], rU = rLast + 1.5 * d, uO = (u00 + 2 * Math.PI * rU) * fu;
        const vO = beta * max(0, VEd - opt.soil * Ain(rU)) / (uO * d) / 1000;
        if (vO <= vOut + 1e-9) break;
        const rN = rLast + sr;
        rowR.push(rN);
        extra.push(0.33 * beta * max(0, VEd - opt.soil * Ain(rN)) / (fyw * 1000) * 1e4);
      }
      const aswMin = 0.08 * Math.sqrt(mat.fck) / 500 * sr * 1.5 * d / 1.5 * 1e4;
      const rOut = rowR[rowR.length - 1] + 1.5 * d;
      res.links = { sr, fyw, asw: extra.length ? max(...extra) : 0, rows: rowR.length, rowR, rOut, uOut: (u00 + 2 * Math.PI * rOut) * fu, row1: asw12 / 2, row2: asw12 / 2, aswMin, foundation: true };
    } else if (res.needs && !res.fail) {
      // Bügel als Durchstanzbewehrung, sr = 0,75 d; NA DE: Reihe 1 ×2,5 und Reihe 2 ×1,4
      const sr = 0.75 * d, fyw = min(250 + 0.25 * dmm, mat.fyd);
      const asw = max(0, (res.vEd - 0.75 * res.vRdc) * res.u1 * d / (1.5 * (d / sr) * fyw)) * 1e4; // cm² je Reihe
      const vOut = max(PU.crdcF() * k * Math.pow(100 * rho * mat.fck, 1 / 3), vmin);
      const uOut = beta * VEd / (vOut * 1000 * d), rOut = max(0, (uOut / fu - 2 * (c.bx + c.by)) / (2 * Math.PI));
      const rows = max(2, Math.ceil((rOut - 1.5 * d - 0.5 * d) / sr + 1e-9) + 1);
      const aswMin = 0.08 * Math.sqrt(mat.fck) / 500 * sr * 1.5 * d / 1.5 * 1e4; // je Bügelschenkel (st ≤ 1,5 d)
      res.links = { sr, fyw, asw, rows, rowR: Array.from({ length: rows }, (_, i) => 0.5 * d + i * sr), rOut, uOut, row1: PU.rows ? 2.5 * asw : asw, row2: PU.rows ? 1.4 * asw : asw, aswMin };
    }
    return res;
  }

  /* Größte Rasterweite einer Flachdecke (Stützen im Raster s × s) für Dicke h und Bemessungslast pEd:
   * Stützmoment im Gurtstreifen ≈ 0,122·pEd·s² (Heft 240), μ ≤ 0,20; Durchstanzen ohne Bewehrung (ρ ≈ 0,8 %, β = 1,10); l/d ≤ 23 (K = 1,2). */
  function flatSlabSpan(h, pEd, cnom, mat, nAbove) {
    const d = h - cnom - 0.02, fcd = mat.fcd * 1000;
    for (let s = 9; s >= 2.0; s = Math.round((s - 0.05) * 100) / 100) {
      if (0.122 * pEd * s * s / (d * d * fcd) > 0.20) continue;
      if (s / d > 23) continue;
      const V = pEd * s * s, nEd = V * (1 + (nAbove || 0)), c = columnSizeFor(nEd + 25 * max(...NC.lf.sets.map((S) => S.G)) * 0.09 * 3, 3, mat);
      const pu = punching({ layers: [{ face: 'oben', dir: 'x', d, prov: 0.008 * d * 1e4 }, { face: 'oben', dir: 'y', d, prov: 0.008 * d * 1e4 }] }, { x: 0, y: 0, bx: c, by: c }, V, mat);
      if (pu && !pu.needs) return { s, c };
    }
    return { s: 2.0, c: 0.3 };
  }

  /* ---------- Unterzüge ---------- */

  /* Auflager eines Unterzugs: tragende Wände (Kreuzung oder Ende an der Wand), Stützen auf der Achse, Außenwände an den Enden.
   * Ergebnis: Lage s entlang der (beschnittenen) Achse, Auflagerbreite und Bezug. */
  function beamSupports(geo, Lg, u) {
    const sg0 = u.segs[0], sgN = u.segs[u.segs.length - 1];
    if (!sg0) return { a: u.a, b: u.b, L: 0, sups: [] };
    const A0 = sg0.a, B0 = sgN.b, L = G.dist(A0, B0), e = G.norm(G.sub(B0, A0)), sups = [];
    const at = (pt) => G.dot(G.sub(pt, A0), e), lat = (pt) => Math.abs(G.cross(e, G.sub(pt, A0)));
    // Enden an der Außenwand (Innenkante)
    for (const [pt, s0] of [[A0, 0], [B0, L]]) if (geo.inner.some((c, i) => G.distPointSeg(pt, c, geo.inner[(i + 1) % geo.inner.length]).d < 0.02)) sups.push({ s: s0, w: geo.tW, kind: 'aussen', id: null });
    for (const w of Lg.walls) {
      if (!w.info.bearing) continue;
      for (const sg of w.segs) {
        const h = G.segIntersect(A0, B0, sg.a, sg.b);
        if (h) { sups.push({ s: h.t * L, w: w.t, kind: 'wand', id: w.id, x: A0.x + e.x * h.t * L, y: A0.y + e.y * h.t * L }); continue; }
        for (const [pt, s0] of [[A0, 0], [B0, L]]) if (G.distPointSeg(pt, sg.a, sg.b).d < w.t / 2 + 0.02) sups.push({ s: s0, w: w.t, kind: 'wand', id: w.id, x: pt.x, y: pt.y });
      }
    }
    for (const c of Lg.columns) {
      const pc = { x: c.x, y: c.y }, s0 = at(pc);
      if (s0 < -0.05 || s0 > L + 0.05 || lat(pc) > min(c.bx, c.by) / 2 + 0.02) continue;
      sups.push({ s: clamp(s0, 0, L), w: Math.abs(e.x) > 0.5 ? c.bx : c.by, kind: 'stuetze', id: c.id, x: c.x, y: c.y });
    }
    sups.sort((a, b) => a.s - b.s);
    const merged = [];
    for (const sp of sups) { const last = merged[merged.length - 1]; if (last && sp.s - last.s < 0.05) { if (last.kind === 'aussen' && sp.kind !== 'aussen') merged[merged.length - 1] = sp; } else merged.push(sp); }
    return { a: A0, b: B0, L, e, sups: merged };
  }

  /* Durchlaufträger mit gelenkigen Auflagern bei s_i und Kragarmen bis 0 bzw. L; Lasten je Feld (Gleichlast).
   * Liefert Momente (Feld positiv) und Querkräfte an den Knoten sowie die Auflagerkräfte. */
  function contBeam(sups, L, qOf) {
    const xs = [0, L].concat(sups);
    const base = [...new Set(xs.map((x) => Math.round(x * 1e6) / 1e6))].sort((a, b) => a - b);
    const nodes = [];
    for (let i = 0; i + 1 < base.length; i++) { const n = max(4, ceil((base[i + 1] - base[i]) / 0.1)); for (let k = 0; k < n; k++) nodes.push(base[i] + (base[i + 1] - base[i]) * k / n); }
    nodes.push(base[base.length - 1]);
    const N = nodes.length, nd = 2 * N, K = Array.from({ length: nd }, () => new Float64Array(nd)), F = new Float64Array(nd);
    const kE = (l) => [[12, 6 * l, -12, 6 * l], [6 * l, 4 * l * l, -6 * l, 2 * l * l], [-12, -6 * l, 12, -6 * l], [6 * l, 2 * l * l, -6 * l, 4 * l * l]].map((r) => r.map((v) => v / (l * l * l)));
    const fE = (l, q) => [q * l / 2, q * l * l / 12, q * l / 2, -q * l * l / 12];
    for (let e2 = 0; e2 + 1 < N; e2++) {
      const l = nodes[e2 + 1] - nodes[e2], q = qOf((nodes[e2] + nodes[e2 + 1]) / 2), k = kE(l), f = fE(l, q), id = [2 * e2, 2 * e2 + 1, 2 * e2 + 2, 2 * e2 + 3];
      for (let r = 0; r < 4; r++) { F[id[r]] += f[r]; for (let c = 0; c < 4; c++) K[id[r]][id[c]] += k[r][c]; }
    }
    const pen = 1e10, supIdx = sups.map((x) => nodes.reduce((bi, v, i) => (Math.abs(v - x) < Math.abs(nodes[bi] - x) ? i : bi), 0));
    for (const i of supIdx) K[2 * i][2 * i] += pen;
    const u = gauss(K, F);
    const Mn = new Float64Array(N), Vn = new Float64Array(N);
    for (let e2 = 0; e2 + 1 < N; e2++) {
      const l = nodes[e2 + 1] - nodes[e2], q = qOf((nodes[e2] + nodes[e2 + 1]) / 2), k = kE(l), f = fE(l, q);
      const ue = [u[2 * e2], u[2 * e2 + 1], u[2 * e2 + 2], u[2 * e2 + 3]];
      const fe = k.map((r, i) => r.reduce((sm, v, j) => sm + v * ue[j], 0) - f[i]);
      Mn[e2] = fe[1]; Mn[e2 + 1] = -fe[3];
      Vn[e2] = max(Vn[e2], Math.abs(fe[0])); Vn[e2 + 1] = max(Vn[e2 + 1], Math.abs(fe[2]));
    }
    const R = supIdx.map((i) => pen * u[2 * i]);
    return { nodes, M: Mn, V: Vn, R, supIdx };
  }

  /* Unterzug: Rechteckquerschnitt bw × (hb + Plattendicke), Biegung mit Feldern und Stützen, Querkraft mit Bügeln (EC2 6.2.3, NA DE),
   * Mindestbewehrung, Durchbiegung über die Biegeschlankheit und Steifigkeitsprüfung der starren Lagerung im Plattenmodell. */
  function beamDesign(geo, Lg, u, slabRes, tSlab, mat, ctxN) {
    const B = beamSupports(geo, Lg, u), L = B.L, sups = B.sups, h = u.hb + tSlab, bw = u.bw;
    const out = { id: u.id, level: Lg.idx, L, bw, hb: u.hb, h, sups, a: B.a, b: B.b };
    if (L < 0.3 || sups.length < 2 || sups[0].s > 0.3 * L || sups[sups.length - 1].s < 0.7 * L) return Object.assign(out, { fail: true, unsupported: true, eta: Infinity, etaS: Infinity });
    // Lasten: Auflagerkräfte der Platte (charakteristisch G und Q), Ungleichverteilung über den 1-m-Spitzenwert
    const rc = slabRes && slabRes.reactCase ? slabRes.reactCase.lines.filter((l) => l.id === u.id) : [];
    const ru = slabRes && slabRes.react ? slabRes.react.lines.filter((l) => l.id === u.id) : [];
    const lenR = rc.reduce((sm, l) => sm + l.len, 0) || L;
    const gk = rc.reduce((sm, l) => sm + l.g, 0) / lenR + GAMMA_C * bw * u.hb, qk = rc.reduce((sm, l) => sm + l.q, 0) / lenR, ek = rc.reduce((sm, l) => sm + (l.e || 0), 0) / lenR;
    // Lastverlauf längs des Unterzugs aus der FE-Rechnung (Auflagerkräfte der Platte je Lastfall, über 0,5 m geglättet);
    // ohne Verlauf Gleichlast mit dem Verhältnis Spitzenwert / Mittelwert als Zuschlag
    const prof = (key, self) => {
      if (!rc.length || !rc.every((l) => Array.isArray(l[key]))) return null;
      const st = 0.05, N = max(1, ceil(L / st - 1e-9)), bin = new Float64Array(N);
      for (const l of rc) {
        const ua = G.norm(G.sub(l.b, l.a));
        for (const [lo, hi, f] of l[key]) {
          const xa = G.dot(G.sub(G.add(l.a, G.mul(ua, lo)), B.a), B.e), xb = G.dot(G.sub(G.add(l.a, G.mul(ua, hi)), B.a), B.e);
          const x0 = clamp(min(xa, xb), 0, L), x1 = clamp(max(xa, xb), 0, L);
          if (x1 - x0 < 1e-9) { bin[min(N - 1, Math.floor(x0 / st))] += f; continue; }
          for (let i = Math.floor(x0 / st); i < N && i * st < x1; i++) { const ov = min(x1, (i + 1) * st) - max(x0, i * st); if (ov > 0) bin[i] += f * ov / (x1 - x0); }
        }
      }
      const hw = 5, sm2 = new Float64Array(N);
      for (let i = 0; i < N; i++) { let s2 = 0, c = 0; for (let j = max(0, i - hw); j <= min(N - 1, i + hw); j++) { s2 += bin[j]; c++; } sm2[i] = s2 / c / st + (self || 0); }
      return (x) => sm2[clamp(Math.floor(x / st), 0, N - 1)];
    };
    const fG = prof('pg', GAMMA_C * bw * u.hb), fQ = prof('pq'), fE = rc.some((l) => l.pe) ? prof('pe') : () => 0;
    const useProf = !!(fG && fQ && fE);
    const meanU = ru.reduce((sm, l) => sm + l.sum, 0) / max(lenR, 1e-6), peak = useProf ? 1 : ru.length && meanU > 0 ? clamp(max(...ru.map((l) => l.win)) / meanU, 1, 1.5) : 1.2;
    const gOf = useProf ? fG : () => gk, qOf = useProf ? fQ : () => qk, eOf = useProf ? fE : () => ek;
    const ss = sups.map((x) => x.s), spans = ss.slice(1).map((x, i) => [ss[i], x]);
    // Verkehrslast: voll, feldweise (gerade/ungerade Felder) und je Innenstütze in beiden Nachbarfeldern (größtes Stützmoment, EC2 5.1.3)
    const spanOf = (x) => spans.findIndex(([a, b2]) => x >= a && x <= b2);
    const pats = [() => 1].concat(spans.length > 1 ? [(x) => (spanOf(x) % 2 === 0 ? 1 : 0), (x) => (spanOf(x) % 2 === 1 ? 1 : 0)] : [],
      spans.slice(1).map((_, i) => (x) => (spanOf(x) === i || spanOf(x) === i + 1 ? 1 : 0)));
    let mF = 0, mS = 0, vMax = 0;
    const Rmax = sups.map(() => 0);
    // Lagerlast E (Füllungen) voll und, falls vorhanden, Behälter leer (wirkt wie eine feldweise Entlastung)
    const hasE = useProf ? rc.some((l) => l.pe) : ek > 0;
    for (const S of ulsSets()) for (const ef of hasE ? [1, 0] : [1]) for (const pq of pats) {
      const r = contBeam(ss, L, (x) => peak * (S.G * gOf(x) + S.E * ef * eOf(x) + S.Q * qOf(x) * pq(x)));
      mF = max(mF, ...r.M); mS = max(mS, ...Array.from(r.M).map((m) => -m)); vMax = max(vMax, ...r.V);
      r.R.forEach((x, i) => { Rmax[i] = max(Rmax[i], x); });
    }
    // charakteristische Auflagerkräfte (Lasten für die Ebene darunter)
    const rG = contBeam(ss, L, gOf), rQ = contBeam(ss, L, qOf), rE = contBeam(ss, L, eOf);
    sups.forEach((sp, i) => { sp.Rd = Rmax[i]; sp.Rg = rG.R[i]; sp.Rq = rQ.R[i]; sp.Re = rE.R[i]; });
    // Biegung
    const cnom = 0.03, phiW = 10, d = h - cnom - phiW / 1000 - 0.01, fcd = mat.fcd * 1000, fyd = mat.fyd * 1000;
    const bars = (m, label) => {
      const mu = m / (bw * d * d * fcd), om = 1 - Math.sqrt(max(0, 1 - 2 * min(mu, 0.5)));
      const req = max(om * bw * d * fcd / fyd * 1e4, NC.asMinBeam(bw, d, mat));
      let best = null;
      for (const phi of COL_PHI) {
        const nMax = max(2, Math.floor((bw - 2 * (cnom + phiW / 1000) + max(phi / 1000, 0.037)) / (phi / 1000 + max(phi / 1000, 0.037))));
        const n = max(2, ceil(req / asBar(phi) - 1e-9));
        const layers = ceil(n / nMax);
        if (layers > 2) continue;
        const As = n * asBar(phi);
        if (!best || As < best.As - 1e-9) best = { phi, n, As, layers };
      }
      return Object.assign({ m, mu, req, label, ok: mu <= NC.muLim && !!best }, best || { phi: 28, n: 0, As: 0, layers: 3 });
    };
    const field = bars(mF, T_('Feld unten')), support = bars(max(mS, 0.25 * mF), T_('Stütze oben'));
    // Querkraft am Auflagerrand + d (sichere Seite: Größtwert), Bügel nach der Norm des Projekts (Eurocode 6.2.3)
    const rho = min(0.02, field.As * 1e-4 / (bw * d));
    const vRdc = NC.vRdc(rho, d, mat, false) * bw;
    const vEd = max(0, vMax - peak * max(...ulsSets().map((S) => S.G * gk + S.E * ek + S.Q * qk)) * (min(...sups.map((x) => x.w)) / 2 + d));
    const lk = NC.links(vEd, d, mat, bw), cot = lk.cot, vRdMax = lk.vRdMax;
    const aswReq = max(lk.asw, NC.aswMinBeam(bw, mat)); // cm²/m (zweischnittig)
    const sMax = NC.linkSpacing(vEd, vRdMax, h, d);
    let st = null;
    for (const phi of NC.linkPhi || [8, 10, 12]) for (const s0 of [0.30, 0.25, 0.20, 0.15, 0.125, 0.10, 0.075]) {
      if (s0 > sMax + 1e-9) continue;
      const a = 2 * asBar(phi) / s0;
      if (a >= aswReq - 1e-9) { if (!st || a < st.a) st = { phi, s: s0, a }; break; }
    }
    // Durchbiegung (Biegeschlankheit, K = 1,3 Endfeld) und Steifigkeit gegenüber der starren Lagerung im Plattenmodell
    // Endfeld K = 1,3, Einfeldträger K = 1,0; Bewehrungsgrad auf die Stegbreite bezogen
    const lMax = max(...spans.map(([a, b2]) => b2 - a)), dfl = deflectionCheck(lMax, d, field.req / bw, mat, spans.length > 1 ? 1.3 : 1.0);
    const lim = dfl.lim;
    const Ec = mat.Ecm * 1000, I = bw * h * h * h / 12, wEl = 5 * (gk + NC.lf.psi2Q * qk + NC.lf.psi2E * ek) * Math.pow(lMax, 4) / (384 * Ec / 3.5 * I);
    const stiff = { w: wEl, lim: lMax / 500, ok: wEl <= lMax / 500 };
    const eta = max(field.mu / NC.muLim, support.mu / NC.muLim, vEd / vRdMax, (lMax / d) / lim);
    return Object.assign(out, {
      gk, qk, ek, peak, profile: useProf, spans, mF, mS, vMax, vEd, d, field, support, shear: { vEd, vRdc, vRdMax, cot, aswReq, stirrups: st, needs: vEd > vRdc, sMax },
      defl: { ld: lMax / d, lim, eta: (lMax / d) / lim, lMax }, stiff, eta, etaS: eta,
      fail: !field.ok || !support.ok || vEd > vRdMax || !st,
    });
  }

  function structure(p, geo, lv, mat, soil, opts, equip) {
    opts = opts || {};
    const eq = equip || [];
    const b = p.build, u = p.use, hz = p.hazard || {};
    const H = b.clearHeight, tF = b.tFloor, tR = b.tRoof, tW = b.tWall;
    const q = u.surface === 'eigen' ? u.surfaceQ : (M.SURFACE_LOADS[u.surface] || M.SURFACE_LOADS.garten).q;
    const zW = lv.zW, hM = lv.hM, dw = hM - zW; // Tiefen ab OK Erde über dem Bunker (Gelände oder Hügel)
    const wu = b.waterproofing === 'wu' || b.waterproofing === 'wu_fbv';
    const restr = wu && b.restraint !== 'massnahmen';
    // Rissbreite unter quasi-ständiger Last: WU-Vorgabe, sonst 0,3 mm (EC2 Tab. 7.1DE, XC2–XC4)
    const wkLoad = wu ? b.wk : 0.3;
    const ctxPlate = { mat, cnom: b.cnom, wu, wk: b.wk, wkLoad, sMax: 0.20, minDia: 10, maxDia: 25, restraint: restr };

    // Außergewöhnliche Bemessungssituation Luftstoß (TWK 2017)
    const blast = hz.blast === 'twk' || hz.blast === 'eigen';
    const qk = blast ? (hz.blast === 'eigen' && finite(hz.qk) ? max(0, hz.qk) : 100) : 0;
    const sl = u.surface === 'eigen' ? null : M.SURFACE_LOADS[u.surface] || M.SURFACE_LOADS.garten;
    const PSI2 = sl && finite(sl.psi2) ? sl.psi2 : 0.6; // quasi-ständiger Anteil der Geländelast (Rissbreite)
    const PSI2A = 0.3; // Begleitlast im Lastfall Luftstoß nach TWK 2017
    const dmax = b.dmax === 16 ? 16 : 32;
    const dyn = { fcd: mat.fck >= 30 ? 44 : 38, fsd: 600, tau: mat.fck >= 30 ? 1.7 : 1.6, kg: 48 / (16 + dmax), dmax };
    const twkMin = (h) => 0.0018 * h * 1e4; // 0,18 % in der Zugzone
    const phiM = (l, h) => (l / h < 4 ? 2.0 : 1.2); // gedrungen: Φ = 2,0
    const wetAt = (z) => finite(zW) && zW > z;

    // Decke
    const coverWet = finite(zW) ? max(0, min(b.cover, zW - (hM - b.cover))) : 0;
    const gCover = soil.gamma * (b.cover - coverWet) + soil.gammaSat * coverWet;
    const roofLoads = [
      { name: T_('Eigengewicht Decke'), g: GAMMA_C * tR },
      { name: T_('Abdichtung, Dämmung, Schutzlage'), g: b.roofLayersG },
      { name: 'Erdüberdeckung ' + fmt(b.cover) + ' m', g: gCover },
      { name: T_('Zusätzliche ständige Auflast'), g: u.extraG || 0 },
    ];
    const gkRoof = roofLoads.reduce((s, l) => s + l.g, 0);
    // Kombinationen des Normprofils (eine oder mehrere Gleichungen, z. B. 6.10a/b): Bemessungslasten als Größtwert
    const LS = ulsSets(), env = (fn) => max(...LS.map(fn)), gMax = env((S) => S.G), qMax = env((S) => S.Q);
    const pRoof = env((S) => S.G * gkRoof + S.Q * q);

    // Wände: Erdruhedruck bzw. Verdichtungserddruck (DIN 4085) + Wasserdruck
    const K0 = 1 - Math.sin(soil.phi * Math.PI / 180);
    const evh = u.compaction ? max(0, finite(u.compactionP) ? u.compactionP : 25) : 0;
    const sigV = (z) => soil.gamma * min(z, dw) + (soil.gammaSat - GAMMA_W) * max(0, z - dw);
    const uw = (z) => GAMMA_W * max(0, z - dw);
    const eSoil = (z) => max(K0 * sigV(z), evh);
    const ek = (z) => eSoil(z) + uw(z);
    const ed = (z) => env((S) => S.H * ek(z) + S.Q * K0 * q);
    const zTopD = b.cover + (b.insulation.roof || 0) + tR / 2, zBotD = hM - lv.zFloorTop + tF / 2;
    const Lw = zBotD - zTopD;
    const p1 = ed(zTopD), p2 = ed(zBotD);
    // Lotrechter Durchlaufträger über Decke, Zwischendecken und Bodenplatte
    const zsW = [zTopD].concat(lv.levels.slice(1).map((L) => hM - (L.zSlabTop - L.tSlab / 2)), [zBotD]);
    const wb = wallBeam(zsW, ed);
    const mWallF = wb.spanMax, mWallTop = wb.mTop, mWallBot = wb.mBot, mWallMid = wb.mMid;
    const LwTop = wb.spans[0], LwBot = wb.spans[wb.spans.length - 1], LwMax = max(...wb.spans);
    const ctxWall = { mat, cnom: b.cnom, wu, wk: b.wk, wkLoad, sMax: 0.20, minDia: 10, maxDia: 25, restraint: restr };
    // quasi-ständig: Erd- und Wasserdruck voll, Geländelast mit ψ2
    const qpWall = max((ek(zTopD) + PSI2 * K0 * q) / p1, (ek(zBotD) + PSI2 * K0 * q) / p2);
    // Tiefe, ab der der Erdruhedruck den Verdichtungserddruck übersteigt
    let zEvh = null;
    if (evh > 0) { let lo = 0, hi = 30; if (eSoil(hi) <= evh + 1e-9) zEvh = Infinity; else { for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (K0 * sigV(m) < evh) lo = m; else hi = m; } zEvh = hi; } }

    // Lastsummen
    const V = geo.vol;
    const Groof = gkRoof * geo.A;
    // Ständige Lasten unter der Decke: Wände, Stützen, Zwischendecken mit Fußbodenaufbau, Innentreppen
    const gFinish = 1.0;
    const Amids = (geo.mids || []).reduce((sm, m) => sm + m.A, 0);
    const Gwalls = GAMMA_C * (V.outerWalls + V.intStb + (V.cols || 0) + (V.beams || 0) + (V.mids || 0) + (V.stairs || 0) + (V.lifts || 0)) + 18 * V.intMw + 0.5 * (V.tbArea || 0) + gFinish * Amids;
    const Gslab = GAMMA_C * V.slab;
    const depthSlabTop = hM - lv.zFloorTop;
    const ovhArea = geo.Aslab - geo.A;
    // Erdhügel: mittlere Geländehöhe über dem Sporn (Böschung beginnt ggf. schon über dem Sporn)
    const mo = lv.mound, ow = b.overhang;
    const surfOvh = mo.on && ow > 0 ? Array.from({ length: 20 }, (_, i) => mo.surfAt((i + 0.5) / 20 * ow)).reduce((s, v) => s + v, 0) / 20 : hM;
    const depthOvh = surfOvh - lv.zFloorTop;
    const ovhWet = finite(zW) ? max(0, min(depthOvh, zW - lv.zFloorTop)) : 0;
    const Govh = ovhArea * (soil.gamma * (depthOvh - ovhWet) + soil.gammaSat * ovhWet);
    const nLv = geo.L.length, Lbot = geo.L[nLv - 1];
    const Qroof = q * geo.A, Qint = u.interiorQ * geo.tot.Anet, QupInt = u.interiorQ * (geo.tot.Anet - Lbot.Anet);
    // Einbauten und Vorräte: Eigengewicht (G) und Füllung (Lagerlast E, ψ0 = 1,0, ψ2 = 0,8); „Up“ = auf Zwischendecken
    const sumEq = (f, up) => eq.filter((e) => !up || e.level < nLv - 1).reduce((s2, e) => s2 + e[f], 0);
    const Geq = sumEq('G'), Eeq = sumEq('E'), GeqUp = sumEq('G', true), EeqUp = sumEq('E', true);

    // Bodenplatte: Sohldruck als Gleichlast, Wasserdruck als Hüllfall
    const uSlab = finite(zW) ? GAMMA_W * max(0, zW - lv.zInsBot) : 0;
    const pFloorLoads = env((S) => S.G * (Groof + Gwalls + GeqUp) + S.Q * (Qroof + QupInt) + S.E * EeqUp) / geo.Aslab;
    const pFloorWater = NC.lf.U * uSlab - NC.lf.Ginf * GAMMA_C * tF;
    const pFloor = max(pFloorLoads, pFloorWater);
    const qpRoof = (gkRoof + PSI2 * q) / pRoof;
    const qpFloor = pFloor > 0 ? max((Groof + Gwalls + GeqUp + PSI2 * Qroof + NC.lf.psi2Q * QupInt + NC.lf.psi2E * EeqUp) / geo.Aslab, uSlab - GAMMA_C * tF) / pFloor : 0;

    // Auflagertiefe für die Stützweite: dickste Wand (sichere Seite, größere Stützweite)
    const tSup = max(tW, ...geo.L.flatMap((Lg) => Lg.walls.filter((w) => w.info.bearing).map((w) => w.t)));
    const gbTop = geo.L[0].gridBear, gbBot = Lbot.gridBear;

    // Luftstoß: Decke q = gk + Φ·qk + ψ2·q; Bodenplatte q = δ·(gk ohne Platte + Φ·qk + ψ2·q), Grundwasser ×1,1
    const fwRoof = wetAt(lv.zRoofTop) ? 1.1 : 1, fwFloor = wetAt(lv.zInsBot) ? 1.1 : 1, fwWall = wetAt(lv.zFloorTop) ? 1.1 : 1;
    const delta = !blast ? 0 : p.site.soil === 'fels' ? 0 : (fwFloor > 1 || !M.SOILS[p.site.soil] || !M.SOILS[p.site.soil].permeable || p.site.soil === 'eigen') ? 1.0 : 0.5;
    const gkAbove = (Groof + Gwalls) / geo.Aslab;
    const accRoof = (h, fld) => (blast && fld ? (() => {
      const gk = gkRoof + GAMMA_C * (h - tR), pm = phiM(fld.lx, h);
      return { pM: gk + fwRoof * pm * qk + PSI2A * q, pV: gk + fwRoof * 2.0 * qk + PSI2A * q, phiM: pm, dyn, minAs: twkMin(h) };
    })() : null);
    const accFloor = (h, fld) => (blast && fld && delta > 0 ? (() => {
      const pm = phiM(fld.lx, h);
      return { pM: delta * (gkAbove + fwFloor * pm * qk + PSI2A * q), pV: delta * (gkAbove + fwFloor * 2.0 * qk + PSI2A * q), phiM: pm, dyn, minAs: twkMin(h), delta };
    })() : null);

    const fieldRoof = slabField(gbTop, tR, tSup);
    const fieldFloor = slabField(gbBot, tF, tSup);
    // Rahmenecken Platte–Wand: Momentenausgleich zwischen den Festeinspannmomenten nach Steifigkeit (t³/l)
    const kWTop = tW * tW * tW / LwTop, kWBot = tW * tW * tW / LwBot;
    const joint = (fld, mW, t, mPlate, kW) => {
      if (!fld) return mW;
      const kP = t * t * t / fld.lx, dfW = kW / (kW + kP);
      return mW + dfW * (mPlate - mW);
    };
    const mJTop = joint(fieldRoof, mWallTop, tR, fieldRoof && fieldRoof.sc * pRoof, kWTop), mJBot = joint(fieldFloor, mWallBot, tF, fieldFloor && fieldFloor.sc * pFloor, kWBot);
    const jTop = { mJ: mJTop, mW: mWallTop, kW: kWTop }, jBot = { mJ: mJBot, mW: mWallBot, kW: kWBot };
    const roof = fieldRoof ? designPlate('Decke', pRoof, tR, fieldRoof, ctxPlate, false, accRoof(tR, fieldRoof), Object.assign({ qp: qpRoof }, jTop)) : null;
    const floor = fieldFloor ? designPlate('Bodenplatte', pFloor, tF, fieldFloor, ctxPlate, true, accFloor(tF, fieldFloor), Object.assign({ qp: qpFloor }, jBot)) : null;
    if (roof) roof.loads = roofLoads.concat([{ name: T_('Verkehrslast Gelände'), q }]), roof.gk = gkRoof, roof.qk = q;
    if (floor) floor.loads = { pFloorLoads, pFloorWater, uSlab };
    // Reicht eine Platte nicht (Biegung, Querkraft, Rissbreite), Dicke suchen, ab der sie rechnerisch genügt (5-cm-Schritte)
    // (Rahmenecke mit den Werten der gewählten Dicke; Lastfall Luftstoß wird mitgeprüft)
    const plateFits = (pl) => pl && !pl.fail && !pl.crackFail && !pl.accLayerFail && pl.shear.eta <= 1 && !(pl.acc && pl.acc.fail);
    const needH = (pl, t0, pAt, qpAt, accFn, jt, topField) => {
      if (!pl || (!pl.fail && !pl.crackFail && pl.shear.eta <= 1 && !pl.accLayerFail && !(pl.acc && pl.acc.muA > 0.296))) return null;
      const gbN = topField ? gbBot : gbTop;
      for (let h = Math.ceil((t0 + 1e-6) * 20) / 20; h <= 1.5 + 1e-9; h = Math.round((h + 0.05) * 20) / 20) {
        const fld = slabField(gbN, h, tSup);
        if (fld && plateFits(designPlate('', pAt(h), h, fld, ctxPlate, topField, accFn(h, fld), Object.assign({ qp: qpAt(h) }, jt)))) return h;
      }
      return Infinity;
    };
    if (roof) roof.hReq = needH(roof, tR, (h) => pRoof + gMax * GAMMA_C * (h - tR), (h) => (gkRoof + GAMMA_C * (h - tR) + PSI2 * q) / (pRoof + gMax * GAMMA_C * (h - tR)), accRoof, jTop, false);
    if (floor) floor.hReq = needH(floor, tF, (h) => max(pFloorLoads, NC.lf.U * uSlab - NC.lf.Ginf * GAMMA_C * h), () => qpFloor, accFloor, jBot, true);

    // FE-Berechnung der Platten (Decke mit Rahmenecken, Zwischendecken, Bodenplatte gebettet); Tafelverfahren als Kontrolle und Rückfall.
    // Zwischendecken brauchen die Auflagerkräfte der Platte darüber: Kette Decke → Zwischendecke 1 → …
    const feS = feSetup(p, geo, lv, mat, soil, {
      gkRoof, q, psi2: PSI2, mWallTop, mWallBot, qpWall, qpWallBot: qpWall, LwTop, LwBot, spans: wb.spans, uSlab, gFinish,
      // über Wände und Stützen in die Bodenplatte; Ausbauwände der untersten Ebene stehen direkt auf ihr (Linienlasten im Modell)
      supG: Groof + Gwalls + GeqUp - 18 * Lbot.footMw * Lbot.H - 0.5 * Lbot.walls.filter((w) => w.kind === 'tb').reduce((sm, w) => sm + w.len, 0) * Lbot.H,
      supQ: Qroof + QupInt, supE: EeqUp, qOvh: ovhArea > 1e-6 ? Govh / ovhArea : 0, equip: eq,
    });
    const feJ = { roof: feS ? feS.roof() : null, mids: [], floor: feS ? feS.floor() : null };
    const feR = roof ? feResult(feJ.roof, opts.fe) : null, feF = floor ? feResult(feJ.floor, opts.fe) : null;
    const exOf = (pl, accFn, h, fld) => { const a = pl && pl.acc ? accFn(h, fld) : null; return a ? (d) => max(a.minAs, asDyn(pl.acc.mPl, d, dyn)) : 0; };
    // Stützweiten am Punkt: Abstand zu den Auflagern (Innenkante Außenwand, tragende Wände, Stützen) in x und y
    const spanAtOf = (Lg) => {
      const segs = [];
      for (let i = 0; i < geo.inner.length; i++) segs.push([geo.inner[i], geo.inner[(i + 1) % geo.inner.length]]);
      for (const w of Lg.walls) if (w.info.bearing) for (const sg of w.segs) segs.push([sg.a, sg.b]);
      for (const o of Lg.columns) segs.push([{ x: o.x - o.bx / 2, y: o.y }, { x: o.x + o.bx / 2, y: o.y }], [{ x: o.x, y: o.y - o.by / 2 }, { x: o.x, y: o.y + o.by / 2 }]);
      for (const bu of Lg.beams || []) for (const sg of bu.segs) segs.push([sg.a, sg.b]);
      return (x, y) => {
        const ray = (dx, dy) => segs.reduce((m, [a, b2]) => { const h = G.segIntersect({ x, y }, { x: x + dx * 100, y: y + dy * 100 }, a, b2); return h && h.t * 100 > 1e-6 ? min(m, h.t * 100) : m; }, 100);
        return { lx: ray(1, 0) + ray(-1, 0), ly: ray(0, 1) + ray(0, -1) };
      };
    };
    let roofD = roof, floorD = floor;
    if (feR) {
      roofD = designFE('Decke', feR, tR, ctxPlate, exOf(roof, accRoof, tR, fieldRoof), { defl: roof.defl, acc: roof.acc, spanAt: spanAtOf(geo.L[0]) });
      Object.assign(roofD, { table: roof, field: roof.field, pEd: roof.pEd, loads: roof.loads, gk: roof.gk, qk: roof.qk, hReq: roofD.fail || roofD.crackFail ? roof.hReq || null : null });
    }
    if (feF) {
      floorD = designFE('Bodenplatte', feF, tF, ctxPlate, exOf(floor, accFloor, tF, fieldFloor), { defl: floor.defl, acc: floor.acc, noDefl: true });
      Object.assign(floorD, { table: floor, field: floor.field, pEd: floor.pEd, loads: floor.loads, soil: feF.soil, ks: feJ.floor.ks, hReq: floorD.fail || floorD.crackFail ? floor.hReq || null : null });
    }
    // Unterzüge je Ebene: Lasten aus der Platte darüber (FE-Auflagerkräfte, sonst Einzugsbreite)
    const beams = [];
    const beamsOf = (li, res, slabD, gArea, qArea) => {
      const Lg = geo.L[li], tS = li === 0 ? tR : Lg.tSlab, out = [];
      for (const u of Lg.beams) {
        let r = res && res.reactCase ? res : null;
        if (!r) {
          // ohne FE: Einzugsbreite senkrecht zur Achse
          const B = beamSupports(geo, Lg, u), sp = spanAtOf(Lg), mid = B.e ? G.lerp(B.a, B.b, 0.5) : u.a, s2 = sp(mid.x, mid.y);
          const wTrib = B.e && Math.abs(B.e.x) > 0.5 ? s2.ly / 2 : s2.lx / 2;
          const pA = env((S) => S.G * gArea + S.Q * qArea);
          r = { reactCase: { lines: [{ id: u.id, len: B.L || 1, g: gArea * wTrib * (B.L || 1), q: qArea * wTrib * (B.L || 1) }] }, react: { lines: [{ id: u.id, sum: pA * wTrib * (B.L || 1), win: pA * wTrib }] } };
        }
        const bd = beamDesign(geo, Lg, u, r, tS, mat);
        if ((bd.fail || bd.eta > 1) && !bd.unsupported) {
          for (let hb = Math.ceil((u.hb + 1e-6) * 20) / 20; hb <= 2.0 + 1e-9; hb = Math.round((hb + 0.05) * 20) / 20) {
            const t2 = beamDesign(geo, Lg, Object.assign({}, u, { hb }), r, tS, mat);
            if (!t2.fail && t2.eta <= 1) { bd.hbReq = hb; break; }
          }
          if (!bd.hbReq) bd.hbReq = Infinity;
        }
        out.push(bd); beams.push(bd);
      }
      return out;
    };
    const beamPtsOf = (list) => list.flatMap((bd) => (bd.sups || []).filter((sp) => sp.kind !== 'aussen' && sp.Rg != null).map((sp) => ({ x: sp.x, y: sp.y, g: sp.Rg, q: sp.Rq, e: sp.Re || 0 })));
    let beamsAbove = beamsOf(0, feR, roofD, gkRoof, q);
    // Zwischendecken
    const mids = [];
    let above = feR, abovePEd = pRoof;
    for (let i = 1; i < nLv; i++) {
      const Lg = geo.L[i], t = Lg.tSlab;
      const fld = slabField(Lg.gridBear, t, tSup);
      // Tafelverfahren (Rückfall ohne FE): Einbauten je Plattenfeld (zwischen tragenden Wänden) zusammengefasst und als
      // gleichwertige Gleichlast angesetzt: höchstens die mittlere Pressung der Einbauten, sonst gleiches Feldmoment wie die
      // Einzellast in Feldmitte eines Streifens der Breite lx (q = 2 F / lx²)
      const eqHere = eq.filter((e) => e.level === i - 1), lxF = fld ? max(fld.lx || 1, 1) : 3, gB = Lg.gridBear;
      const fieldOf = (e) => {
        const cx = (e.rect.x0 + e.rect.x1) / 2, cy = (e.rect.y0 + e.rect.y1) / 2;
        if (gB) for (let a = 0; a < gB.nx; a++) if (cx >= gB.xs[a] && cx <= gB.xs[a + 1]) for (let b2 = 0; b2 < gB.ny; b2++) if (cy >= gB.ys[b2] && cy <= gB.ys[b2 + 1] && gB.comp[a][b2] != null && gB.comp[a][b2] >= 0) return 'f' + gB.comp[a][b2];
        return 'r' + e.roomId;
      };
      const grp = new Map();
      for (const e of eqHere) { const k = fieldOf(e), g0 = grp.get(k) || { Fd: 0, Fqp: 0, A: 0 }; g0.Fd += env((S) => S.G * e.G + S.E * e.E); g0.Fqp += e.G + NC.lf.psi2E * e.E; g0.A += e.area; grp.set(k, g0); }
      let eqAdd = 0, eqQp = 0;
      for (const g0 of grp.values()) { const r = min(1 / max(g0.A, 1e-6), 2 / (lxF * lxF)); if (r * g0.Fd > eqAdd) { eqAdd = r * g0.Fd; eqQp = r * g0.Fqp; } }
      const pMid = env((S) => S.G * (GAMMA_C * t + gFinish) + S.Q * u.interiorQ) + eqAdd;
      const tab = fld ? designPlate('Zwischendecke über Ebene ' + (i + 1), pMid, t, fld, ctxPlate, false, null, { qp: (GAMMA_C * t + gFinish + NC.lf.psi2Q * u.interiorQ + eqQp) / pMid }) : null;
      let d = tab;
      const job = feS && above ? feS.mid(i, above, beamPtsOf(beamsAbove)) : null;
      if (job) feJ.mids.push(job);
      const res = job ? feResult(job, opts.fe) : null;
      if (res && tab) {
        d = designFE(tab.name, res, t, ctxPlate, 0, { defl: tab.defl, spanAt: spanAtOf(Lg) });
        Object.assign(d, { table: tab, field: tab.field, pEd: pMid });
      }
      if (d) mids.push(Object.assign(d, { level: i, mid: true, pEdAbove: abovePEd, fe: res || null }));
      above = res; abovePEd = pMid;
      beamsAbove = beamsOf(i, res, d, GAMMA_C * t + gFinish, u.interiorQ);
    }
    const midPending = opts.fe !== 'none' && mids.some((m) => !m.fe);
    // Rahmenecken für die Wandbemessung: aus der FE-Rechnung, sonst Momentenausgleich
    const mJTopW = feR ? feR.mJ : mJTop, mJBotW = feF ? feF.mJ : mJBot;

    // Außenwände als FE-Platten je Kante (Achsmaße): unten/oben an den Platten mit Drehfeder aus deren Steifigkeit, an
    // Zwischendecken und tragenden Innenwänden gestützt, Öffnungen ausgespart. Wandecken einmal eingespannt, einmal gelenkig
    // (Grenzwertbetrachtung, Hülle beider Fälle). Erd- und Wasserdruck mit dem Verlauf über die Höhe, Geländelast als K0·q.
    const wallJobs = feS ? wallJobsOf() : [];
    feJ.walls = wallJobs;
    const wallRes = wallJobs.map((j) => ({ job: j, res: feResult(j, opts.fe) }));
    const wallPending = opts.fe !== 'none' && wallRes.some((r) => !r.res);
    const fePending = (roof && !feR && opts.fe !== 'none') || (floor && !feF && opts.fe !== 'none') || midPending || wallPending;
    function wallJobsOf() {
      if (!geo.valid) return [];
      const axis = G.offsetPolygon(geo.out, -tW / 2), nA = axis.length, E = mat.Ecm * 1000;
      const zAxBot = lv.zFloorTop - tF / 2, LwF = (lv.zCeil + tR / 2) - zAxBot, vOf = (z) => z - zAxBot, depth = (v) => zBotD - v;
      const vs = [];
      for (let v = 0; v < LwF - 1e-9; v += 0.1) vs.push(v);
      vs.push(LwF);
      if (finite(dw) && zBotD - dw > 0 && zBotD - dw < LwF) vs.push(zBotD - dw);
      if (finite(zEvh) && zBotD - zEvh > 0 && zBotD - zEvh < LwF) vs.push(zBotD - zEvh);
      vs.sort((a, c) => a - c);
      const profE = vs.map((v) => [v, eSoil(depth(v))]), profW = vs.map((v) => [v, uw(depth(v))]);
      const kSlab = (t, Ls) => 3.5 * E * t * t * t / 12 / max(Ls, 1);
      const nLv2 = geo.L.length;
      const vAbove = (k) => (k === 0 ? LwF : vOf(lv.levels[k].zSlabTop - lv.levels[k].tSlab / 2));
      const vBelow = (k) => (k === nLv2 - 1 ? 0 : vOf(lv.levels[k + 1].zSlabTop - lv.levels[k + 1].tSlab / 2));
      const out = [];
      for (let i = 0; i < nA; i++) {
        const A0 = axis[i], A1 = axis[(i + 1) % nA], Le = G.dist(A0, A1);
        if (Le < 0.6) continue;
        const e = G.norm(G.sub(A1, A0)), uOf = (pt) => G.dot(G.sub(pt, A0), e), offOf = (pt) => G.cross(e, G.sub(pt, A0));
        const nOut = G.edgeNormal(A0, A1), nIn = { x: -nOut.x, y: -nOut.y };
        const P = G.add(G.lerp(A0, A1, 0.5), G.mul(nIn, tW / 2 + 0.1));
        const spanPerp = (Lg) => { const s2 = spanAtOf(Lg)(P.x, P.y); return Math.abs(e.x) > 0.7 ? s2.ly : Math.abs(e.y) > 0.7 ? s2.lx : min(s2.lx, s2.ly); };
        const lines = [], bands = [], keyX = [tW / 2, Le - tW / 2], keyY = [tF / 2, LwF - tR / 2], holes = [];
        const hl = (v, t, id, kRot, up) => { lines.push(Object.assign({ a: { x: 0, y: v }, b: { x: Le, y: v }, kind: 'fix', id }, kRot ? { kRot, nIn: { x: 0, y: up } } : {})); bands.push({ a: { x: 0, y: v }, b: { x: Le, y: v }, t }); };
        hl(0, tF, 'bodenplatte', kSlab(tF, spanPerp(geo.L[nLv2 - 1])), 1);
        hl(LwF, tR, 'decke', kSlab(tR, spanPerp(geo.L[0])), -1);
        lv.levels.slice(1).forEach((Lk) => { const v = vOf(Lk.zSlabTop - Lk.tSlab / 2); hl(v, Lk.tSlab, 'zd' + Lk.idx, 0, 0); keyY.push(v, v - Lk.tSlab / 2, v + Lk.tSlab / 2); });
        // Wandecken: nur, wo die Nachbarkante abknickt
        const ePrev = G.norm(G.sub(A0, axis[(i - 1 + nA) % nA])), eNext = G.norm(G.sub(axis[(i + 2) % nA], A1));
        const corners = [[0, Math.abs(G.cross(ePrev, e)) > 0.15, 1], [Le, Math.abs(G.cross(e, eNext)) > 0.15, -1]].filter((c) => c[1]);
        // tragende Innenwände, die auf die Außenwand stoßen
        geo.L.forEach((Lg2, k) => {
          for (const w of Lg2.walls) {
            if (!w.info.bearing) continue;
            const uw2 = G.norm(G.sub(w.b, w.a));
            if (Math.abs(G.dot(uw2, e)) > 0.9) continue;
            for (const sg of w.segs) for (const pt of [sg.a, sg.b]) {
              const u0 = uOf(pt);
              if (Math.abs(offOf(pt)) > tW / 2 + 0.05 || u0 < 0.1 || u0 > Le - 0.1) continue;
              const v0 = vBelow(k), v1 = vAbove(k);
              lines.push({ a: { x: u0, y: v0 }, b: { x: u0, y: v1 }, kind: 'fix', id: 'iw:' + w.id });
              bands.push({ a: { x: u0, y: v0 }, b: { x: u0, y: v1 }, t: w.t });
              keyX.push(u0, u0 - w.t / 2, u0 + w.t / 2);
            }
          }
        });
        // Öffnungen der Kante (Türen, Luken, Durchbrüche der obersten Ebene)
        for (const o of geo.L[0].openings || []) {
          if (!o.outer || !o.hl || o.hl.edge !== i || o.invalid) continue;
          const uC = uOf(G.lerp(o.p0, o.p1, 0.5)), v0 = vOf(lv.levels[0].zFloorTop + (o.sill || 0)), v1 = v0 + o.h;
          const x0 = clamp(uC - o.w / 2, 0, Le), x1 = clamp(uC + o.w / 2, 0, Le), y0 = clamp(v0, 0, LwF), y1 = clamp(v1, 0, LwF);
          if (x1 - x0 > 0.05 && y1 - y0 > 0.05) { holes.push(G.polygonFromRect(x0, y0, x1, y1)); keyX.push(x0, x1); keyY.push(y0, y1); }
        }
        const meshSize = clamp(LwF / 14, 0.12, 0.3);
        for (const variant of ['eingespannt', 'gelenkig']) {
          const L2 = lines.slice(), B2 = bands.slice();
          for (const [u0, , dir] of corners) {
            L2.push(Object.assign({ a: { x: u0, y: 0 }, b: { x: u0, y: LwF }, kind: 'fix', id: 'ecke' }, variant === 'eingespannt' ? { kRot: 1e3 * kSlab(tW, 1), nIn: { x: dir, y: 0 } } : {}));
            B2.push({ a: { x: u0, y: 0 }, b: { x: u0, y: LwF }, t: tW });
          }
          out.push({
            kind: 'wall', edge: i, variant, Le, Lw: LwF, a: A0, b: A1, domain: G.polygonFromRect(0, 0, Le, LwF), holes, lines: L2, bands: B2, keyX, keyY, meshSize, E, nu: 0.2, h: tW,
            cases: [{ name: 'E', q: 0, profileY: profE }, { name: 'W', q: 0, profileY: profW }, { name: 'Q', q: K0 * q }],
            combos: { uls: ulsSets().map((S) => combo(S, [[S.H, 'E'], [S.H, 'W'], [S.Q, 'Q']], [], [S.H, S.H, S.Q])), sls: [{ name: N_('E + W + ψ₂ Q (quasi-ständig)'), c: [1, 1, PSI2] }] },
          });
        }
      }
      return out;
    }
    // Größtwerte der gemittelten Bemessungsmomente je Lage (innen = unten, außen = oben; x waagerecht, y lotrecht)
    const dWq = tW - b.cnom - 0.015;
    const wallFE = wallRes.length && wallRes.every((r) => r.res) ? (() => {
      const o = { vi: 0, vo: 0, h: 0, viQ: 0, voQ: 0, hQ: 0, v: 0, edges: [] };
      for (const { job, res } of wallRes) {
        const n2 = res.mesh.nNodes, r2 = { edge: job.edge, variant: job.variant, Le: job.Le, vi: 0, vo: 0, h: 0, v: 0 };
        for (let k = 0; k < n2; k++) {
          if (res.inSup[k]) continue;
          r2.vi = max(r2.vi, res.uls.by[k]); r2.vo = max(r2.vo, res.uls.ty[k]); r2.h = max(r2.h, res.uls.bx[k], res.uls.tx[k]);
          if (res.sls) { o.viQ = max(o.viQ, res.sls.by[k]); o.voQ = max(o.voQ, res.sls.ty[k]); o.hQ = max(o.hQ, res.sls.bx[k], res.sls.tx[k]); }
        }
        for (let ie = 0; ie < res.faceDist.length; ie++) if (res.faceDist[ie] >= dWq) r2.v = max(r2.v, res.shear.v[ie]);
        o.vi = max(o.vi, r2.vi); o.vo = max(o.vo, r2.vo); o.h = max(o.h, r2.h); o.v = max(o.v, r2.v);
        o.edges.push(r2);
      }
      return o;
    })() : null;

    // Außenwand mit Rahmenecken: FE-Wandplatten, sonst lotrechter Durchlaufträger mit Momentenausgleich
    const mWallS = wallFE ? max(wallFE.vo, mJTopW, mJBotW) : max(mWallTop, mWallBot, mWallMid, mJTopW, mJBotW);
    const vWall = wallFE ? wallFE.v : wb.vMax + (wb.spans.length === 1 ? Math.abs(mJBotW - mJTopW) - Math.abs(mWallBot - mWallTop) : 0) / Lw;

    // Außenwand im Lastfall Luftstoß: qd = e0k + wk + Φ·qk + ψ2·q (TWK 6.5.1, a/l = 0: qk = 100 + 340·a/l → 100 % des Luftstoßes)
    // Plastisch einachsig, m = m' = qd·l²/16; Rahmenecke außen mindestens so stark wie der Plattenrand.
    let wallAcc = null;
    if (blast) {
      const pmW = phiM(LwMax, tW), qW = fwWall * qk;
      const a1 = ek(zTopD) + pmW * qW + PSI2A * K0 * q, a2 = ek(zBotD) + pmW * qW + PSI2A * K0 * q;
      const vq = max(ek(zTopD), ek(zBotD)) + 2.0 * qW + PSI2A * K0 * q;
      const aM = max(a1, a2), mPl = aM * LwMax * LwMax / 16;
      const mCorner = max(mPl, roof && roof.acc ? roof.acc.mPl : 0, floor && floor.acc ? floor.acc.mPl : 0);
      wallAcc = { p1: a1, p2: a2, pM: aM, pVfull: vq, phiM: pmW, qk: qW, mPl, mCorner, minAs: twkMin(tW) };
    }
    const exW = (m) => (wallAcc ? (d) => max(wallAcc.minAs, asDyn(m, d, dyn)) : 0);
    const labW = wallAcc ? ACC_LABEL : undefined;
    const mWallFd = wallFE ? wallFE.vi : mWallF;
    const wallIn = designLayer(mWallFd, tW, ctxWall, 0.012, exW(wallAcc && wallAcc.mPl), false, labW, wallFE ? wallFE.viQ : mWallF * qpWall);
    // Rahmenecke: quasi-ständiger Anteil der ungünstigere von Wand und Platten
    const wallOut = designLayer(mWallS, tW, ctxWall, 0.012, exW(wallAcc && wallAcc.mCorner), false, labW, wallFE ? max(wallFE.voQ, max(mJTopW, mJBotW) * max(qpRoof, qpFloor)) : mWallS * max(qpWall, qpRoof, qpFloor));
    // Horizontal: aus den FE-Wandplatten (Hülle Ecke eingespannt/gelenkig); ohne FE zweiachsig, oben/unten gelenkig
    // angenommen (sichere Seite): Randmoment bis 0,125·p·l² (langes Wandfeld), l = Wandhöhe.
    const mWallH = wallFE ? wallFE.h : 0.125 * max(p1, p2) * LwMax * LwMax;
    const wallH = designLayer(mWallH, tW, ctxWall, 0, max(0.2 * max(wallIn.prov, wallOut.prov), wallAcc ? 0.001 * tW * 1e4 : 0), true, undefined, wallFE ? wallFE.hQ : mWallH * qpWall);
    const wallShear = shearCheck(vWall, wallOut.d, wallOut.prov, mat, wallOut.m);
    if (wallAcc) {
      const qRd = 8 * (mRdDyn(wallIn, dyn) + mRdDyn(wallOut, dyn)) / (LwMax * LwMax);
      const pV = min(wallAcc.pVfull, 1.6 * qRd), vEd = pV * LwMax / 2;
      const sh = shearDyn(vEd, wallOut.d, wallAcc.pM / qRd, dyn);
      if (sh.reinf) sh.strip = min(LwMax / 2, max(0.75, Math.ceil(((vEd - sh.vRd) / pV + wallOut.d) * 4) / 4));
      const muA = max(wallAcc.mPl / (wallIn.d * wallIn.d * dyn.fcd * 1000), wallAcc.mCorner / (wallOut.d * wallOut.d * dyn.fcd * 1000));
      Object.assign(wallAcc, { qRd, pV, vEd, shear: sh, muA, eta: max(muA / 0.296, wallAcc.pM / qRd, sh.eta), fail: muA > 0.296 || wallAcc.pM > qRd * 1.0001 || !(sh.eta <= 1) });
    }
    const wall = {
      name: 'Außenwand', h: tW, L: Lw, spans: wb.spans, K0, p1, p2, q, evh, zEvh,
      pressures: { top: { k: ek(zTopD), d: p1, z: zTopD }, bot: { k: ek(zBotD), d: p2, z: zBotD }, waterAtBot: uw(zBotD) },
      layers: [
        { key: 'vi', label: N_('Vertikal innen (Feld)'), face: 'innen', dir: 'v', ...wallIn },
        { key: 'vo', label: N_('Vertikal außen (Rahmenecke)'), face: 'außen', dir: 'v', ...wallOut },
        { key: 'h', label: N_('Horizontal je Seite'), face: 'beidseitig', dir: 'h', ...wallH },
      ],
      moments: { mF: mWallFd, mS: mWallS, mJTop: mJTopW, mJBot: mJBotW, mMid: mWallMid, mH: mWallH, beam: { mF: mWallF, mTop: mWallTop, mBot: mWallBot } }, shear: wallShear, acc: wallAcc,
      method: wallFE ? 'FE' : 'Stab', fe: wallFE,
      etaS: max(wallIn.mu / NC.muLim, wallOut.mu / NC.muLim, wallH.mu / NC.muLim, wallShear.eta),
      eta: max(wallIn.mu / NC.muLim, wallOut.mu / NC.muLim, wallH.mu / NC.muLim, wallShear.eta, wallAcc ? wallAcc.eta : 0),
      fail: [wallIn, wallOut, wallH].some((l) => (l.fail && l.failReason === 'uls') || !l.muOk),
      crackFail: [wallIn, wallOut, wallH].some((l) => l.failReason === 'crack'),
      accLayerFail: [wallIn, wallOut, wallH].some((l) => l.failReason === 'acc'),
    };

    // Innenwände (Stahlbeton): Mindestbewehrung, Drucknachweis überschlägig
    const ctxInt = { mat, cnom: 0.03, wu: false, wk: 0.3, sMax: 0.25, minDia: 8, maxDia: 12, noMin: true };
    const intWalls = [];
    geo.L.forEach((Lg, li) => {
      const mA = li === 0 ? null : mids.find((m) => m.level === li);
      const slabAbove = li === 0 ? { fe: feR, pEd: pRoof, field: fieldRoof, acc: roof && roof.acc } : { fe: mA && mA.fe, pEd: mA ? mA.pEd : pRoof, field: mA && mA.field };
      for (const w of Lg.walls) {
        if (!(w.info.bearing && w.len > 0)) continue;
        const lay = designLayer(0, w.t, ctxInt, 0, max(0.00075, blast ? 0.0018 : 0) * w.t * 1e4);
        // Wandlast aus den Randkräften der Felder beiderseits (Durchlaufwirkung), mindestens eine Stützweite
        const fld = slabAbove.field;
        const trib = fld ? max(fld.vWall || 0, fld.lx) : 3;
        // FE: größte Auflagerkraft je m auf der Wandachse (alle Bemessungskombinationen); enthält Lasten aus den Ebenen darüber
        const rl = slabAbove.fe && slabAbove.fe.react ? slabAbove.fe.react.lines.filter((l) => l.id === w.id) : [];
        // Unterzüge, die auf der Wand aufliegen: Last auf bw + H verteilt (Ausbreitung in der Wand)
        const nBeam = beams.filter((bd) => bd.level === li).reduce((m, bd) => max(m, ...(bd.sups || []).filter((sp) => sp.kind === 'wand' && sp.id === w.id).map((sp) => (sp.Rd || 0) / (bd.bw + Lg.H))), 0);
        const nEd = (rl.length ? max(...rl.map((l) => (l.win != null ? l.win : l.max))) : slabAbove.pEd * trib * (li + 1)) + nBeam + gMax * GAMMA_C * w.t * Lg.H;
        // Tragfähigkeit als schlanke Wand auf der sicheren Seite nach EC2 12.6.5.2: Φ = 1,14 (1 − 2 etot/t) − 0,02 l0/t ≤ 1 − 2 etot/t,
        // etot = max(t/30; 20 mm) + l0/400, fcd,pl = αcc,pl·fck/γc (NA DE 0,7), l0 = lichte Höhe (zweiseitig gehalten)
        const l0w = Lg.H, etot = max(w.t / 30, 0.02) + l0w / 400;
        // ACI 318-19 11.5.3: φPn = 0,65 · 0,55 f′c Ag [1 − (k lc / 32 h)²], k = 1,0 (auf der sicheren Seite)
        const Phi = NC.code === 'ACI' ? max(0, 1 - Math.pow(l0w / (32 * w.t), 2)) : max(0, min(1.14 * (1 - 2 * etot / w.t) - 0.02 * l0w / w.t, 1 - 2 * etot / w.t));
        const nRd = Phi * NC.fcdPl(mat.fck) * w.t * 1000;
        const r = { id: w.id, level: li, auto: w.auto || null, t: w.t, len: w.len, layer: lay, nEd, nRd, Phi, l0: l0w, etot, eta: nEd / nRd, etaS: nEd / nRd };
        if (blast && li === 0 && roof && roof.acc) {
          const nA = roof.acc.pM * trib + GAMMA_C * w.t * Lg.H, nRA = nRd * dyn.fcd / NC.fcdPl(mat.fck);
          r.acc = { nEd: nA, nRd: nRA, eta: nA / nRA };
          r.eta = max(r.eta, r.acc.eta);
        }
        intWalls.push(r);
      }
    });

    // Stützen je Ebene: Normalkraft aus den FE-Lagerkräften der Platte darüber (größter Wert aller Bemessungskombinationen,
    // enthält die Lasten der Ebenen darüber) plus Eigengewicht; ohne FE aus der Einzugsfläche bis zu den Nachbarauflagern.
    const slabAboveOf = (li) => (li === 0 ? roofD : mids.find((m) => m.level === li) || null);
    const columns = [];
    const tribOf = (Lg, c) => {
      const segs = [];
      for (let i = 0; i < geo.inner.length; i++) segs.push([geo.inner[i], geo.inner[(i + 1) % geo.inner.length]]);
      for (const w of Lg.walls) if (w.info.bearing) for (const sg of w.segs) segs.push([sg.a, sg.b]);
      for (const o of Lg.columns) if (o.id !== c.id) { segs.push([{ x: o.x - o.bx / 2, y: o.y }, { x: o.x + o.bx / 2, y: o.y }], [{ x: o.x, y: o.y - o.by / 2 }, { x: o.x, y: o.y + o.by / 2 }]); }
      const ray = (dx, dy) => segs.reduce((m, [a, b2]) => { const h = G.segIntersect({ x: c.x, y: c.y }, { x: c.x + dx * 100, y: c.y + dy * 100 }, a, b2); return h && h.t * 100 > 1e-6 ? min(m, h.t * 100) : m; }, 100);
      return (ray(1, 0) + ray(-1, 0)) / 2 * (ray(0, 1) + ray(0, -1)) / 2;
    };
    // Aussparungen je Platte (k = 0 Decke, 1 … n − 1 Zwischendecken, n Bodenplatte) für das Durchstanzen
    const holesOfSlab = (k) => (k === 0 ? geo.vert.lifts.filter((v) => v.toSurface || v.roofBox).map((v) => v.innerPoly)
      : k >= nLv ? geo.vert.lifts.filter((v) => v.levelBot === nLv - 1).map((v) => v.innerPoly)
        : geo.L[k - 1].holesBelow.concat(geo.vert.lifts.filter((v) => k - 1 >= v.wallTop && k <= v.levelBot).map((v) => v.innerPoly)));
    geo.L.forEach((Lg, li) => {
      const slab = slabAboveOf(li), tAbove = li === 0 ? tR : Lg.tSlab, tBelow = li === nLv - 1 ? tF : geo.L[li + 1].tSlab;
      const l0 = Lg.H + tAbove / 2 + tBelow / 2;
      for (const c of Lg.columns) {
        const fr = slab && slab.method === 'FE' && slab.fe && slab.fe.react ? slab.fe.react.areas.find((a) => a.id === c.id) : null;
        const fromBeams = beams.filter((bd) => bd.level === li).reduce((sm, bd) => sm + (bd.sups || []).filter((sp) => sp.kind === 'stuetze' && sp.id === c.id).reduce((s2, sp) => s2 + (sp.Rd || 0), 0), 0);
        const VEd = (fr ? fr.sum : (slab ? slab.pEd : pRoof) * tribOf(Lg, c) * (li + 1)) + fromBeams;
        const nEd = VEd + gMax * GAMMA_C * c.bx * c.by * Lg.H;
        const design = columnDesign(c, nEd, l0, mat);
        // Durchstanzen nur mit dem Plattenanteil: Unterzüge und darüberstehende Stützen leiten direkt in die Stütze ein (EC2 6.4.3)
        const jobA = li === 0 ? feJ.roof : (feJ.mids || []).find((j) => j.level === li);
        // (Lasten je Fall mit den Faktoren der ungünstigsten Kombination, d. h. dem kleinsten abgezogenen Anteil)
        let through = 0;
        if (jobA && li > 0) {
          const sum = { G: 0, Q: 0, E: 0 };
          for (const cs of jobA.cases || []) if (sum[cs.name] != null) for (const pt of cs.points || []) if (Math.abs(pt.x - c.x) <= c.bx / 2 + 1e-6 && Math.abs(pt.y - c.y) <= c.by / 2 + 1e-6) sum[cs.name] += pt.P;
          through = min(...LS.map((S) => S.G * sum.G + S.Q * sum.Q + S.E * sum.E));
        }
        const vPunch = fr ? max(0, VEd - fromBeams - through) : (slab ? slab.pEd : pRoof) * tribOf(Lg, c);
        // Stützweite für den Durchstanznachweis nach SIA 262 (rs = 0,22·L): Wurzel der Einzugsfläche
        const Lsp = Math.sqrt(tribOf(Lg, c));
        const pu = slab && vPunch > 0 ? punching(slab, c, vPunch, mat, { face: 'oben', holes: holesOfSlab(li), L: Lsp }) : null;
        columns.push({ id: c.id, level: li, x: c.x, y: c.y, bx: c.bx, by: c.by, auto: !!c.auto, H: Lg.H, l0, VEd, nEd, fromFE: !!fr, fromBeams, through, vPunch, design, punch: pu, Lsp, slabName: li === 0 ? 'Decke' : slab ? slab.name : '' });
      }
    });
    // Durchstanzen unten: Stützen der untersten Ebene in die Bodenplatte (Bodenpressung abziehen),
    // Stützen ohne Stütze oder tragende Wand darunter in die Zwischendecke (Last von oben)
    for (const r of columns) {
      if (r.level === nLv - 1) {
        if (floorD) r.punchBelow = punching(floorD, r, r.nEd, mat, { face: 'unten', soil: max(0, (floorD.soil ? floorD.soil.pMean : pFloor) - gMax * GAMMA_C * tF - qMax * u.interiorQ), holes: holesOfSlab(nLv), L: r.Lsp });
      } else {
        const below = geo.L[r.level + 1];
        const onCol = below.columns.some((d) => Math.abs(d.x - r.x) < (d.bx + r.bx) / 4 && Math.abs(d.y - r.y) < (d.by + r.by) / 4);
        const onWall = below.walls.some((w) => w.info.bearing && w.segs.some((sg) => G.distPointSeg({ x: r.x, y: r.y }, sg.a, sg.b).d < w.t / 2));
        const m = mids.find((x) => x.level === r.level + 1);
        if (!onCol && !onWall && m) r.punchBelow = punching(m, r, r.nEd, mat, { face: 'unten', holes: holesOfSlab(r.level + 1), L: r.Lsp });
      }
      r.eta = max(r.design.eta, r.punch ? r.punch.eta : 0, r.punchBelow ? r.punchBelow.eta : 0);
      r.etaS = r.eta;
      // Abhilfe: Mindestquerschnitt (quadratisch) für die Stütze selbst und für das Durchstanzen
      if (r.design.fail) r.bReq = columnSizeFor(r.nEd, r.l0, mat, p.build.fireClass);
      for (const [pu, pl, VEd, o] of [[r.punch, slabAboveOf(r.level), r.vPunch, { face: 'oben', holes: holesOfSlab(r.level), L: r.Lsp }], [r.punchBelow, r.level === nLv - 1 ? floorD : mids.find((x) => x.level === r.level + 1), r.nEd, r.level === nLv - 1 ? { face: 'unten', soil: max(0, (floorD && floorD.soil ? floorD.soil.pMean : pFloor) - gMax * GAMMA_C * tF - qMax * u.interiorQ), holes: holesOfSlab(nLv), L: r.Lsp } : { face: 'unten', holes: holesOfSlab(r.level + 1), L: r.Lsp }]]) {
        if (!pu || !pu.fail || !pl) continue;
        for (let bb = Math.ceil((max(r.bx, r.by) + 1e-6) * 20) / 20; bb <= 1.5 + 1e-9; bb = Math.round((bb + 0.05) * 20) / 20) {
          const t2 = punching(pl, { x: r.x, y: r.y, bx: bb, by: bb }, VEd, mat, o);
          if (t2 && !t2.fail) { pu.bReq = bb; break; }
        }
        if (!pu.bReq) pu.bReq = Infinity;
        // örtliche Plattenverstärkung (Stützenkopf bzw. Fundamentverstärkung): Dicke bei gleichem Bewehrungsgrad
        const hPl = pl.h;
        for (let hh = Math.ceil((hPl + 0.05 - 1e-6) * 20) / 20; hh <= 2.0 + 1e-9; hh = Math.round((hh + 0.05) * 20) / 20) {
          const dd = hh - hPl, pl2 = { layers: pl.layers.map((L) => Object.assign({}, L, { d: L.d + dd, prov: L.prov * (L.d + dd) / L.d })), zulagen: (pl.zulagen || []).map((z) => Object.assign({}, z, { s: z.s * z.d / (z.d + dd) })) };
          const t2 = punching(pl2, r, VEd, mat, o);
          if (t2 && !t2.fail) { pu.hLocal = hh; pu.wLocal = max(r.bx, r.by) + 4 * t2.d; break; }
        }
      }
    }

    // Sohlpressung
    // Einbauten zählen für Sohldruck und Setzung, nicht als haltende Last gegen Auftrieb
    const Gtot = Groof + Gwalls + Gslab + Govh + Geq;
    // USA: zulässige Sohlpressung (IBC Tab. 1806.2) gegen Gebrauchslasten; sonst Bemessungswert gegen Tabellenwert σR,d
    const ASD = NC.bearing && NC.bearing.asd;
    const sigEd = ASD ? (Gtot + Qroof + Qint + Eeq) / geo.Aslab : env((S) => S.G * Gtot + S.Q * (Qroof + Qint) + S.E * Eeq) / geo.Aslab;
    const sigRd = ASD ? NC.bearing.qa(p.site.soil, soil) : soil.sigmaRd;
    const bearing = { sigEd, sigRd, eta: sigEd / sigRd, Gtot, Qtot: Qroof + Qint + Eeq, Geq, Eeq, asd: !!ASD, ref: ASD ? NC.bearing.ref : null };

    // Auftrieb (UPL): γG,dst und γG,stb nach Norm (DIN 1054: 1,05 / 0,95; EN 1997-1: 1,00 / 0,90)
    const UP = NC.upl;
    const conc = GAMMA_C * (V.slab + V.outerWalls + V.roof + V.intStb + (V.mids || 0) + (V.cols || 0) + (V.beams || 0) + (V.stairs || 0) + (V.lifts || 0));
    const uplift = (cover) => {
      if (!finite(zW)) return { U: 0, G: 0, eta: 0 };
      const dz = cover - b.cover;
      const zIns = lv.zInsBot - dz;
      const U = GAMMA_W * max(0, zW - zIns) * geo.Aslab;
      const wet = max(0, min(cover, zW - (hM - cover)));
      const gC = soil.gamma * (cover - wet) + soil.gammaSat * wet;
      const Gs = conc + (gC + b.roofLayersG + (u.extraG || 0)) * geo.A + Govh * (depthSlabTop + dz) / Math.max(depthSlabTop, 1e-6);
      return { U, G: Gs, eta: U > 0 ? UP.dst * U / (UP.stb * Gs) : 0 };
    };
    const upFinal = uplift(b.cover);
    const Ubau = finite(zW) ? GAMMA_W * max(0, zW - lv.zInsBot) * geo.Aslab : 0;
    const upBau = { U: Ubau, G: conc, eta: Ubau > 0 ? UP.dst * Ubau / (UP.stb * conc) : 0 };
    let coverMin = null;
    if (upFinal.eta > 1) {
      let lo = b.cover, hi = b.cover + 8;
      if (uplift(hi).eta > 1) coverMin = Infinity;
      else { for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (uplift(mid).eta > 1) lo = mid; else hi = mid; } coverMin = hi; }
    }
    const buoyancy = { relevant: upFinal.U > 0, final: upFinal, bau: upBau, coverMin };

    // Strahlenschutz über Decke (Halbwertsdicken: Beton 6 cm, Erde 8 cm, FM 3-05.70); Betonäquivalent nach TWK (Erde 1.600 kg/m³)
    const halvings = tR / 0.06 + b.cover / 0.08;
    const shield = { halvings, pf: Math.pow(2, halvings), heq: tR + b.cover * 1600 / 2400 };

    // Luftstoß: Dicke, ab der keine Schubbewehrung nötig ist (Suche in 1-cm-Schritten)
    let blastInfo = null;
    if (blast) {
      const search = (from, ok) => { for (let h = Math.max(0.2, Math.round(from * 100) / 100); h <= 1.5 + 1e-9; h = Math.round((h + 0.01) * 100) / 100) if (ok(h)) return h; return null; };
      const plateOk = (pl0, tSelf, fieldFn, accFn, topField) => (h) => {
        const fld = fieldFn(h);
        if (!fld) return false;
        const pl = designPlate('', pl0 + gMax * GAMMA_C * (h - tSelf), h, fld, ctxPlate, topField, accFn(h, fld), topField ? jBot : jTop);
        return pl.acc ? !pl.acc.shear.needs && !pl.acc.fail : true;
      };
      const roofNoStir = roof && roof.acc && roof.acc.shear.needs ? search(tR, plateOk(pRoof, tR, (h) => slabField(gbTop, h, tSup), accRoof, false)) : null;
      const floorNoStir = floor && floor.acc && floor.acc.shear.needs ? search(tF, plateOk(pFloor, tF, (h) => slabField(gbBot, h, tSup), accFloor, true)) : null;
      let wallNoStir = null;
      if (wallAcc && wallAcc.shear.needs) {
        wallNoStir = search(tW, (h) => {
          const d = h - b.cnom - 0.012 - 0.008;
          const lay = { prov: max(wallOut.prov, max(wallAcc.minAs * h / tW, asDyn(wallAcc.mCorner, d, dyn))), d };
          const qRd = 8 * 2 * mRdDyn(lay, dyn) / (Lw * Lw);
          const vEd = min(wallAcc.pVfull, 1.6 * qRd) * Lw / 2;
          return shearDyn(vEd, d, wallAcc.pM / qRd, dyn).vRd >= vEd;
        });
      }
      blastInfo = { qk, dyn, delta, fw: { roof: fwRoof, floor: fwFloor, wall: fwWall }, psi2: PSI2A, noStir: { roof: roofNoStir, floor: floorNoStir, wall: wallNoStir },
        minT: { roof: 0.30, wall: 0.30, floor: p.site.soil === 'fels' ? 0.20 : 0.25, inner: 0.20 } };
    }

    const loads = { roofLoads, gkRoof, q, pRoof, qpRoof, PSI2, K0, evh, dw, zTopD, zBotD, p1, p2, uSlab, pFloor, pFloorLoads, pFloorWater, qpFloor,
      Groof, Gwalls, Gslab, Govh, Qroof, Qint, QupInt, Geq, Eeq, GeqUp, EeqUp, equip: eq, gFinish, wkLoad, wu, restr, interiorQ: u.interiorQ, zEvh };
    return { q, roof: roofD, floor: floorD, mids, wall, intWalls, columns, beams, bearing, buoyancy, shield, K0, mat, evh, blast: blastInfo, loads, fe: { jobs: feJ, pending: fePending, roof: feR, floor: feF } };
  }

  /* ---------- Bewehrungsauszug ---------- */

  function laps(L, l0) { return L <= STOCK ? 0 : ceil((L - STOCK) / (STOCK - l0)) * l0; }

  function plateBars(poly, c, layer, mat) {
    const inset = G.offsetPolygon(poly, -c);
    const bb = G.bbox(inset);
    const along = layer.dir; // Stäbe parallel zu dieser Achse
    const lo = along === 'x' ? bb.y0 : bb.x0, hi = along === 'x' ? bb.y1 : bb.x1;
    const l0 = lapLength(layer.phi, mat, layer.poorBond);
    const nLines = Math.floor((hi - lo) / layer.s + 1e-9) + 1;
    const start = lo + ((hi - lo) - (nLines - 1) * layer.s) / 2;
    let length = 0, count = 0;
    const lines = [];
    for (let k = 0; k < nLines; k++) {
      const v = start + k * layer.s;
      for (const seg of G.scanline(inset, along, v + 1e-7)) {
        const L = seg[1] - seg[0];
        if (L < 0.05) continue;
        length += L + laps(L, l0);
        count++;
        lines.push(along === 'x' ? [{ x: seg[0], y: v }, { x: seg[1], y: v }] : [{ x: v, y: seg[0] }, { x: v, y: seg[1] }]);
      }
    }
    return { count, length, l0, lines };
  }

  /* Zulagen eines Rechteckbereichs: Stäbe in Lagenrichtung im Abstand s, auf die Platte (abzüglich Deckung) beschnitten. */
  function zulageBars(poly, c, z, mat) {
    const inset = G.offsetPolygon(poly, -c), along = z.dir;
    const lo = along === 'x' ? z.y0 : z.x0, hi = along === 'x' ? z.y1 : z.x1;
    const a0 = along === 'x' ? z.x0 : z.y0, a1 = along === 'x' ? z.x1 : z.y1;
    const l0 = lapLength(z.phi, mat, z.poorBond);
    const nLines = Math.max(1, Math.floor((hi - lo) / z.s + 1e-9) + 1);
    const start = lo + ((hi - lo) - (nLines - 1) * z.s) / 2;
    let length = 0, count = 0;
    const lines = [];
    for (let k = 0; k < nLines; k++) {
      const v = start + k * z.s;
      const A = along === 'x' ? { x: a0, y: v } : { x: v, y: a0 }, B = along === 'x' ? { x: a1, y: v } : { x: v, y: a1 };
      for (const sg of G.clipSegment(A, B, inset)) {
        const L = G.dist(sg.a, sg.b);
        if (L < 0.2) continue;
        length += L + laps(L, l0); count++;
        lines.push([sg.a, sg.b]);
      }
    }
    return { count, length, lines };
  }

  function rebarTakeoff(p, geo, lv, st, mat) {
    const b = p.build, H = b.clearHeight, c = b.cnom;
    const items = [];
    const add = (element, label, phi, length, count, extra) => items.push(Object.assign({ element, label, phi, length, count, kg: length * kgPerM(phi) }, extra || {}));

    const plates = [];
    if (st.floor) plates.push({ el: 'Bodenplatte', poly: geo.slab, d: st.floor, h: b.tFloor });
    if (st.roof) plates.push({ el: 'Decke', poly: geo.out, d: st.roof, h: b.tRoof });
    for (const m of st.mids || []) plates.push({ el: m.name, poly: geo.out, d: m, h: geo.L[m.level].tSlab, mid: m.level });
    const lines3d = [];
    for (const pl of plates) {
      for (const lay of pl.d.layers) {
        const r = plateBars(pl.poly, c, lay, mat);
        add(pl.el, labelText(lay.label) + ' (' + T_(lay.face) + ')', lay.phi, r.length, r.count, { s: lay.s });
        lines3d.push({ el: pl.el, face: lay.face, dir: lay.dir, phi: lay.phi, lines: r.lines });
      }
      // FE: Zulagen und Querkraftbewehrung
      (pl.d.zulagen || []).forEach((z, i) => {
        const r = zulageBars(pl.poly, c, z, mat);
        add(pl.el, T_('Zulage Z{i} {face}, Richtung {dir} ({a} × {b} m)', { i: i + 1, face: T_(z.face), dir: z.dir, a: fmt(z.x1 - z.x0, 1), b: fmt(z.y1 - z.y0, 1) }), z.phi, r.length, r.count, { s: z.s, zul: true });
        lines3d.push({ el: pl.el, face: z.face, dir: z.dir, phi: z.phi, lines: r.lines, zul: true });
      });
      const lk = pl.d.shear && pl.d.shear.links;
      if (lk) lk.zones.forEach((zn, i) => {
        const phiL = 10, n = ceil(zn.asw * zn.area / asBar(phiL));
        add(pl.el, T_('Querkraftbewehrung Q{i} (Bügel Ø10, {asw} cm²/m² auf {a} m²)', { i: i + 1, asw: fmt(zn.asw, 1), a: fmt(zn.area, 1) }), phiL, n * (pl.h - 2 * c + 0.2), n);
      });
      const P = G.perimeter(pl.poly), phiE = pl.h > 0.4 ? 12 : 10;
      const nU = ceil(P / 0.2);
      add(pl.el, T_('Randeinfassung (Steckbügel)'), phiE, nU * (pl.h - 2 * c + 2 * 0.6), nU, { s: 0.2 });
      // Schubbewehrung aus Luftstoß in Randstreifen an allen tragenden Wänden
      const sh = pl.d.acc && pl.d.acc.shear.reinf ? pl.d.acc.shear : null;
      if (sh) {
        const supLen = geo.Pin + 2 * geo.walls.filter((w) => w.info.bearing).reduce((s, w) => s + w.len, 0);
        const n = ceil(sh.strip * supLen / (sh.reinf.s * sh.reinf.s));
        add(pl.el, T_('Schubbewehrung Luftstoß, Randstreifen {b} m', { b: fmt(sh.strip) }), sh.reinf.phi, n * (pl.h - 2 * c + 0.2), n, { s: sh.reinf.s });
      }
    }

    // Außenwände
    const w = st.wall;
    const Pout = G.perimeter(G.offsetPolygon(geo.out, -c)), Pin = geo.valid ? G.perimeter(G.offsetPolygon(geo.inner, c)) : 0;
    const Hint = lv.Hint, vLen = Hint + b.tFloor + b.tRoof - 2 * c + 2 * 0.25;
    const [vi, vo, hz] = w.layers;
    const lvi = lapLength(vi.phi, mat), lvo = lapLength(vo.phi, mat), lh = lapLength(hz.phi, mat);
    const outerOps = geo.openings.filter((o) => o.outer && !o.invalid);
    let dedV_i = 0, dedV_o = 0, dedH = 0, zul = 0;
    for (const o of outerOps) {
      dedV_i += Math.floor(o.w / vi.s) * o.h;
      dedV_o += Math.floor(o.w / vo.s) * o.h;
      dedH += 2 * Math.floor(o.h / hz.s) * o.w;
      zul += 2 * (2 * (o.h + 1.6) + 2 * (o.w + 1.6) + 2 * 1.2);
    }
    const nVi = ceil(Pin / vi.s), nVo = ceil(Pout / vo.s);
    add('Außenwände', T_(vi.label), vi.phi, nVi * (vLen + lvi) - dedV_i, nVi, { s: vi.s });
    add('Außenwände', T_(vo.label), vo.phi, nVo * (vLen + lvo) - dedV_o, nVo, { s: vo.s });
    const rows = Math.floor(Hint / hz.s) + 1;
    const ringLen = (Pf) => Pf + geo.n * lh + laps(Pf, lh);
    add('Außenwände', T_('Horizontal außen'), hz.phi, rows * ringLen(Pout) - dedH / 2, rows, { s: hz.s });
    add('Außenwände', T_('Horizontal innen'), hz.phi, rows * ringLen(Pin) - dedH / 2, rows, { s: hz.s });
    if (zul > 0) add('Außenwände', T_('Zulagen an Öffnungen'), 16, zul, outerOps.length * 2 * 8);
    if (w.acc && w.acc.shear.reinf) {
      const sh = w.acc.shear, n = ceil(2 * sh.strip * (Pout + Pin) / 2 / (sh.reinf.s * sh.reinf.s));
      add('Außenwände', T_('Schubbewehrung Luftstoß, oben und unten je {b} m', { b: fmt(sh.strip) }), sh.reinf.phi, n * (b.tWall - 2 * c + 0.2), n, { s: sh.reinf.s });
    }

    // Innenwände Stahlbeton
    for (const iw of st.intWalls) {
      const Lg = geo.L[iw.level || 0], Hl = Lg.H, tAbove = (iw.level || 0) === 0 ? b.tRoof : Lg.tSlab;
      const lay = iw.layer, l0 = lapLength(lay.phi, mat);
      const nV = 2 * (ceil(iw.len / lay.s) + 1);
      const rowsI = 2 * (Math.floor(Hl / lay.s) + 1);
      const ops = Lg.openings.filter((o) => o.host === 'w:' + iw.id && !o.invalid);
      const ded = ops.reduce((s, o) => s + 2 * (Math.floor(o.w / lay.s) * o.h + Math.floor(o.h / lay.s) * o.w), 0);
      const nm = iw.auto ? T_('Aufzugsschacht, Wand') : wallLabel(geo, iw.id);
      add('Innenwände', T_('{nm} beidseitig', { nm }), lay.phi, nV * (Hl + tAbove + l0) + rowsI * (iw.len + 0.8) - ded, nV + rowsI, { s: lay.s });
    }

    // Stützen: Längsstäbe über die Geschosshöhe mit Übergreifung, Bügel mit Verdichtung an den Enden; Durchstanzbügel
    const multiL = geo.L.length > 1;
    for (const c of st.columns || []) {
      const d = c.design, Lg = geo.L[c.level], tAbove = c.level === 0 ? b.tRoof : Lg.tSlab;
      const nm = (geo.labels['c:' + c.id] || T_('Stütze'));
      add('Stützen', T_('{nm}: Längsstäbe {n} Ø{phi}', { nm, n: d.nb, phi: d.phi }), d.phi, d.nb * (Lg.H + tAbove + lapLength(d.phi, mat)), d.nb);
      const per = 2 * (c.bx + c.by) - 8 * COL_COVER + 0.2, hmax = max(c.bx, c.by);
      const nS = 2 * ceil(hmax / d.stirrup.sEnd) + ceil(max(0, Lg.H - 2 * hmax) / d.stirrup.s) + 1;
      add('Stützen', T_('{nm}: Bügel Ø{phi}', { nm, phi: d.stirrup.phi }), d.stirrup.phi, nS * per, nS, { s: d.stirrup.s });
      const below = c.level === geo.L.length - 1 ? 'Bodenplatte' : 'Zwischendecke über Ebene ' + (c.level + 2);
      for (const [pu, el, hh] of [[c.punch, c.level === 0 ? 'Decke' : 'Zwischendecke über Ebene ' + (c.level + 1), tAbove], [c.punchBelow, below, c.level === geo.L.length - 1 ? b.tFloor : geo.L[c.level + 1].tSlab]]) {
        if (!pu || !pu.links) continue;
        const lk = pu.links, phiL = 10;
        let n = 0;
        for (let r = 0; r < lk.rows; r++) {
          const rad = 0.5 * pu.d + r * lk.sr, u = pu.u0 + 2 * Math.PI * rad;
          const asRow = r === 0 ? lk.row1 : r === 1 ? lk.row2 : lk.asw;
          n += max(ceil(u / (1.5 * pu.d)), ceil(max(asRow, ceil(u / (1.5 * pu.d)) * lk.aswMin) / asBar(phiL)));
        }
        add(el, T_('Durchstanzbewehrung an {nm} ({rows} Reihen Bügel Ø{phi})', { nm, rows: lk.rows, phi: phiL }), phiL, n * (hh - 2 * b.cnom + 0.2), n);
      }
    }

    // Unterzüge: untere Feldbewehrung durchgehend mit Verankerung, obere Bewehrung über Innenstützen (je ¼ der Nachbarfelder) und Montagestäbe, Bügel
    for (const bd of st.beams || []) {
      if (!bd.field || bd.unsupported) continue;
      const nm = geo.labels['b:' + bd.id] || T_('Unterzug'), el = bd.level === 0 ? 'Decke' : 'Zwischendecke über Ebene ' + (bd.level + 1);
      const lb = lapLength(bd.field.phi, mat);
      add(el, T_('{nm}: unten {n} Ø{phi}', { nm, n: bd.field.n, phi: bd.field.phi }), bd.field.phi, bd.field.n * (bd.L + 2 * min(lb, 0.5) + laps(bd.L, lb)), bd.field.n);
      const inner = bd.sups.slice(1, -1);
      const lt = inner.reduce((sm, sp, i) => sm + 0.25 * ((sp.s - bd.sups[i].s) + (bd.sups[i + 2].s - sp.s)) + 2 * lapLength(bd.support.phi, mat, true), 0);
      if (lt > 0) add(el, T_('{nm}: oben über Stützen {n} Ø{phi}', { nm, n: bd.support.n, phi: bd.support.phi }), bd.support.phi, bd.support.n * lt, bd.support.n * inner.length);
      add(el, T_('{nm}: Montage- und Randstäbe oben 2 Ø12', { nm }), 12, 2 * (bd.L + 0.6), 2);
      const stp = bd.shear.stirrups;
      if (stp) { const n = ceil(bd.L / stp.s) + 1; add(el, T_('{nm}: Bügel Ø{phi}/{s}', { nm, phi: stp.phi, s: fmt(stp.s * 100, 1) }), stp.phi, n * (2 * (bd.bw + bd.h) - 8 * 0.03 + 0.2), n, { s: stp.s }); }
    }

    const wallKg = items.filter((i) => i.element === 'Außenwände').reduce((s, i) => s + i.kg, 0);
    const rhoWall = geo.vol.outerWalls > 0 ? wallKg / geo.vol.outerWalls : 90;
    const phiA = [...DIAS].find((x) => x >= 12) || 12; // Ansatzdurchmesser (USA: No. 13)
    if (geo.vol.lifts > 0) items.push({ element: 'Aufzugsschächte', label: T_('Grube und Schachtkopf, Ansatz über Bewehrungsgrad Außenwand'), phi: phiA, length: geo.vol.lifts * rhoWall / kgPerM(phiA), count: 0, kg: geo.vol.lifts * rhoWall });
    if (geo.vol.access > 0) items.push({ element: 'Zugänge', label: T_('Ansatz über Bewehrungsgrad Außenwand'), phi: phiA, length: geo.vol.access * rhoWall / kgPerM(phiA), count: 0, kg: geo.vol.access * rhoWall });

    const byDia = {};
    let total = 0;
    for (const it of items) { byDia[it.phi] = (byDia[it.phi] || 0) + it.kg; total += it.kg; }
    const waste = 0.03;
    const concreteRC = geo.vol.rc;
    return { items, byDia, net: total, waste, total: total * (1 + waste), perM3: total * (1 + waste) / concreteRC, lines3d, rhoWall };
  }

  /* ---------- Volumen, Flächen ---------- */

  function volumes(p, geo, lv) {
    const b = p.build, Hint = lv.Hint;
    const outerOps = geo.openings.filter((o) => o.outer && !o.invalid);
    const opVol = outerOps.reduce((s, o) => s + o.w * o.h * o.t, 0);
    const accessV = geo.access.reduce((s, a) => s + a.V, 0);
    // Je Ebene: Innenwände, Öffnungen, Stützen; Zwischendecken (Innenfläche abzüglich Treppenaugen und Schächte)
    let intStb = 0, intMw = 0, tbArea = 0, fwInt = 0, mwArea = 0, cols = 0, fwCols = 0, beamsV = 0, fwBeams = 0;
    const mids = [];
    for (const L of geo.L) {
      const H = L.H, ops = L.openings.filter((o) => !o.invalid && !o.outer && o.hl && o.hl.wall);
      const on = (kind) => ops.filter((o) => o.hl.wall.kind === kind);
      intStb += max(0, L.footStb * H - on('stb').reduce((s, o) => s + o.w * o.h * o.t, 0));
      intMw += max(0, L.footMw * H - on('mw').reduce((s, o) => s + o.w * o.h * o.t, 0));
      const area = (kind) => max(0, L.walls.filter((w) => w.kind === kind).reduce((s, w) => s + w.len * H, 0) - on(kind).reduce((s, o) => s + o.w * o.h, 0));
      tbArea += area('tb'); mwArea += area('mw');
      fwInt += max(0, L.walls.filter((w) => w.kind === 'stb').reduce((s, w) => s + 2 * w.len * H, 0) - on('stb').reduce((s, o) => s + 2 * o.w * o.h - (2 * o.h + o.w) * o.t, 0));
      for (const c of L.columns) { cols += c.bx * c.by * H; fwCols += 2 * (c.bx + c.by) * H; }
      for (const bu of L.beams) { beamsV += bu.bw * bu.hb * bu.len; fwBeams += (2 * bu.hb + bu.bw) * bu.len; }
      if (L.idx > 0) {
        // Zwischendecke über dieser Ebene: Innenfläche, Treppenaugen der Ebene darüber und durchlaufende Schächte ausgespart
        const holes = geo.L[L.idx - 1].holesBelow.reduce((s, h) => s + G.area(h), 0) +
          geo.vert.lifts.filter((v) => L.idx - 1 >= v.wallTop && L.idx <= v.levelBot).reduce((s, v) => s + v.wIn * v.dIn, 0);
        const A = max(0, geo.Ain - holes);
        mids.push({ idx: L.idx, A, t: L.tSlab, V: A * L.tSlab, soffit: max(0, A - L.footStb), holes });
      }
    }
    const stairsV = geo.vert.stairs.reduce((s, st) => s + st.V, 0);
    // Aufzüge: Schachtgrube unter der untersten Haltestelle, Schachtkopf als Betonkasten über der Decke bzw. Schacht bis zum Gelände mit Aufzugshaus
    let liftV = 0, liftFw = 0, liftExc = 0;
    for (const v of geo.vert.lifts) {
      const d = v.design;
      if (!d) continue;
      const Ao = G.area(v.outerPoly), Ai = G.area(v.innerPoly), Po = G.perimeter(v.outerPoly), Pi = G.perimeter(v.innerPoly);
      const ring = Ao - Ai, w = { pit: d.pit, box: 0, shaft: 0, house: 0 };
      liftV += ring * d.pit; liftFw += (Po + Pi) * d.pit;
      liftExc += (Math.sqrt(Ao) + 1.0) * (Math.sqrt(Ao) + 1.0) * d.pit;
      if (v.roofBox) { w.box = max(0, v.headOver - b.tRoof); liftV += ring * w.box + Ao * 0.3; liftFw += (Po + Pi) * w.box + Ai; }
      if (v.toSurface) {
        w.shaft = max(0, v.zSurface - lv.zRoofTop); w.house = d.head + 0.3;
        liftV += ring * (w.shaft + w.house) + Ao * 0.25; liftFw += (Po + Pi) * (w.shaft + w.house) + Ai;
      }
      v.works = w;
    }
    const v = {
      slab: geo.Aslab * b.tFloor,
      outerWalls: max(0, (geo.A - geo.Ain) * Hint - opVol),
      roof: geo.A * b.tRoof,
      mids: mids.reduce((s, m) => s + m.V, 0),
      intStb, intMw, tbArea, cols, beams: beamsV, stairs: stairsV, lifts: liftV, liftExc,
      access: accessV,
      blinding: b.blinding > 0 ? G.area(G.offsetPolygon(geo.out, b.overhang + 0.1)) * b.blinding : 0,
    };
    v.rc = v.slab + v.outerWalls + v.roof + v.mids + v.intStb + v.cols + v.beams + v.stairs + v.lifts + v.access;
    // Schalung
    const reveal = outerOps.reduce((s, o) => s + (2 * o.h + o.w) * o.t, 0);
    const fw = {
      walls: max(0, geo.P * Hint + geo.Pin * (Hint - mids.reduce((s, m) => s + m.t, 0)) - 2 * outerOps.reduce((s, o) => s + o.w * o.h, 0) + reveal),
      intWalls: fwInt + fwCols,
      roof: max(0, geo.Ain - geo.L[0].footStb) + mids.reduce((s, m) => s + m.soffit, 0) + fwBeams,
      edges: geo.Pslab * b.tFloor + geo.P * b.tRoof,
      access: geo.access.reduce((s, a) => s + a.fw, 0) + geo.vert.stairs.reduce((s, st) => s + st.w * st.Ls + 2 * st.Ls * st.tWaist, 0) + liftFw,
    };
    fw.wallsTotal = fw.walls + fw.intWalls;
    const finish = { mw: mwArea, tb: tbArea };
    return { vol: v, fw, finish, mids };
  }

  function envelope(p, geo, lv) {
    const b = p.build, ins = b.insulation;
    const hOuter = lv.Hint + b.tRoof + b.tFloor;
    const wallsOut = geo.P * hOuter;
    const roof = geo.A, floor = geo.Aslab;
    const tWi = ins.walls || 0, tRi = ins.roof || 0, tFi = ins.floor || 0;
    const outIns = tWi > 0 ? G.offsetPolygon(geo.out, tWi) : geo.out;
    const insWallsV = tWi > 0 ? (G.area(outIns) - geo.A) * hOuter : 0;
    const insRoofV = tRi > 0 ? G.area(outIns) * tRi : 0;
    const insFloorV = tFi > 0 ? floor * tFi : 0;
    const sys = b.waterproofing;
    const membrane = sys === 'wu' ? 0 : wallsOut + roof + (sys === 'pmbc' ? 0 : floor);
    const membraneFloor = sys === 'pmbc' ? floor : 0; // unter der Sohle Bahn statt PMBC
    const wu = sys === 'wu' || sys === 'wu_fbv';
    const axis = G.perimeter(G.offsetPolygon(geo.out, -b.tWall / 2));
    const joints = wu ? 2 * axis + geo.access.reduce((s, a) => s + 2 * a.W, 0) : 0;
    const protect = G.perimeter(outIns) * hOuter + G.area(outIns);
    const drainLen = b.drainage ? G.perimeter(G.offsetPolygon(geo.out, max(b.overhang, tWi) + 0.3)) : 0;
    return {
      hOuter, wallsOut, roof, floor, membrane, membraneFloor, joints,
      ins: { walls: insWallsV, roof: insRoofV, floor: insFloorV, total: insWallsV + insRoofV + insFloorV, outIns },
      protect, drainLen, shafts: b.drainage ? geo.convex : 0,
    };
  }

  function excRule(key, soil) {
    const X = NC.exc;
    return X ? { ref: X.ref, dMax: X.dMax, angle: X.angle(key, soil) } : { ref: NC.ref.slopeRule || 'DIN 4124', dMax: 5, angle: soil.slope };
  }

  function earthworks(p, geo, lv, env, soil) {
    const b = p.build, ex = b.excavation;
    const tWi = b.insulation.walls || 0;
    const off = max(tWi + ex.workspace, b.overhang + 0.3);
    const bottom = G.offsetPolygon(geo.out, off);
    const d = -lv.zPit;
    // Regelböschung ohne rechnerischen Nachweis: DIN 4124 (Deutschland, sonst sinngemäß), USA OSHA 29 CFR 1926 Subpart P
    const rule = excRule(p.site.soil, soil);
    const angle = finite(ex.angle) ? ex.angle : rule.angle;
    const k = ex.mode === 'verbau' ? 0 : 1 / Math.tan(angle * Math.PI / 180);
    const Ab = G.area(bottom), Pb = G.perimeter(bottom);
    const Vpit = Ab * d + Pb * k * d * d / 2 + 4 * k * k * d * d * d / 3;
    const top = G.offsetPolygon(geo.out, off + k * d);
    const Atop = G.area(top);
    // Zugänge außerhalb der Grube
    let Vacc = 0;
    for (const a of geo.access) {
      if (a.kind === 'treppe') {
        const s0 = off, s1 = a.L + 0.5;
        if (s1 > s0) Vacc += (a.W + 1.0) * (s1 - s0) * (a.excDepthAt(s0) + a.excDepthAt(min(a.L, s1))) / 2;
      } else {
        const s1 = a.D + 0.5;
        if (s1 > off) Vacc += (a.W + 1.0) * (s1 - off) * a.excDepthAt(0);
      }
    }
    const Vlift = geo.vol.liftExc || 0;
    const Vexc = Vpit + Vacc + Vlift;
    const mo = lv.mound, hM = lv.hM;
    // Erdhügel: Krone und Fuß über der konvexen Hülle; Volumen über Gelände abzüglich Bauwerk, Treppeneinschnitte und Schachtköpfe.
    // Die Fläche des Gehrungs-Offsets einer konvexen Fläche wächst quadratisch mit dem Abstand, die Simpsonregel ist daher exakt.
    let Vmound = 0, crestPoly = null, toePoly = null, Atoe = 0;
    if (mo.on) {
      const Aoff = (r) => G.area(G.offsetPolygon(mo.hull, r));
      crestPoly = G.offsetPolygon(mo.hull, mo.crest);
      toePoly = G.offsetPolygon(mo.hull, mo.toe);
      Atoe = G.area(toePoly);
      const Vhill = hM / 6 * (Aoff(mo.crest) + 4 * Aoff(mo.crest + mo.n * hM / 2) + Atoe);
      const structAbove = geo.A * max(0, hM - b.cover);
      const integral = (P) => P.reduce((s, pt, i) => (i ? s + (pt[0] - P[i - 1][0]) * (pt[1] + P[i - 1][1]) / 2 : 0), 0);
      let Vcut = 0;
      for (const a of geo.access) {
        if (a.kind === 'treppe') Vcut += a.W * (integral(a.profL) + integral(a.profR)) / 2;
        else Vcut += a.W * integral(mo.profile(a.C, a.nn, 0, a.D));
      }
      Vmound = max(0, Vhill - structAbove - Vcut);
    }
    const Astrip = max(Atop, Atoe);
    const Vtopsoil = min(Atop * ex.topsoil, Vexc); // Oberboden unter dem Hügel wird abgetragen, gelagert und auf dem Hügel wieder angedeckt
    const gravelV = Ab * b.gravel;
    const hStruct = lv.Hint + b.tRoof;
    const below = max(0, min(hStruct, min(0, lv.zRoofTop) - lv.zFloorTop)); // Bauwerk unter Gelände
    const displaced = gravelV + geo.vol.blinding + env.ins.floor + geo.vol.slab + geo.A * below + env.ins.walls * below / hStruct + (lv.zRoofTop < 0 ? env.ins.roof : 0) +
      geo.access.reduce((s, a) => s + a.gross, 0);
    const Vback = max(0, Vexc - displaced);
    const tcPit = max(0, min(b.cover, b.cover - hM)); // Erdüberdeckung unter Geländeniveau
    const aRoofLvl = G.area(G.offsetPolygon(geo.out, off + k * max(0, d - tcPit))); // Grube auf Höhe OK Deckenaufbau
    const Vcover = min(Vback, (aRoofLvl + Atop) / 2 * tcPit);
    const reuse = ex.backfill === 'aushub';
    const spare = reuse ? max(0, Vexc - Vback) : Vexc;
    const moundFromSite = mo.on && mo.fill === 'aushub' ? min(Vmound, spare) : 0;
    const Vimport = Vmound - moundFromSite;
    const Vremove = spare - moundFromSite;
    const waterInPit = finite(lv.zW) && lv.zW > lv.zPit;
    return {
      off, bottom, top, depth: d, k, angle, rule, Ab, Atop, Astrip, Vpit, Vacc, Vlift, Vexc, Vtopsoil, gravelV, displaced, Vback, Vcover, Vside: Vback - Vcover,
      Vmound, Vimport, moundFromSite, crestPoly, toePoly, Atoe,
      Vremove, Vloose: Vremove * ex.loose, trucks: ceil(Vremove * ex.loose / 12), reuse,
      shoring: ex.mode === 'verbau' ? Pb * d : 0, waterInPit, waterHead: waterInPit ? lv.zW - lv.zPit : 0,
    };
  }

  /* ---------- Weitere Nachweise: Baugrund, Böschungen, Brandschutz, Aufzugsgruben, Betonierabschnitte ---------- */
  /* Erdbeben: Erddruckzuwachs auf die Außenwände und Trägheitskraft gegen Gleiten (Erdbebenkombination, γ = 1,0). */
  function seismicCheck(p, q) {
    const V = BP.verify, sz = (p.site && p.site.seismic) || {};
    if (!V || !V.seismic || !q.geo.valid) return null;
    const st = q.struct, L = st.loads || {}, soil = q.soil, lv = q.lv, w = st.wall, mat = q.mat;
    const H = max(0.5, L.zBotD || (lv.hM - lv.zSlabBot));
    // Deutschland: Zonen nach DIN EN 1998-1/NA (wie bisher); sonst Kennwerte der Norm des Landes (EN 1998-1 mit NA, SIA 261, ASCE 7)
    const DEn = NC.code === 'EC' && NC.na === 'DE';
    let e;
    if (DEn) {
      if (!(sz.zone > 0)) return null;
      e = V.seismic({ zone: sz.zone, ground: sz.ground, soilClass: sz.soilClass, importance: sz.importance, gamma: soil.gamma, H });
      if (!e) return null;
      Object.assign(e, { kind: 'DE', required: true, label: T_('Zone {z}', { z: e.zone }) });
    } else {
      const sp = NC.seisParams ? NC.seisParams(sz) : null;
      if (!sp) return null;
      const dp = sp.alphaS * soil.gamma * H;
      e = Object.assign({}, sp, { zone: sp.zone || null, alpha: sp.alphaS / sp.S, mapped: false, P: { S: sp.S, TB: sp.TB, TC: sp.TC, TD: sp.TD }, dp, dP: dp * H,
        label: sp.kind === 'SIA' ? sp.zone : sp.kind === 'ASCE7' ? 'SDS ' + fmt(sp.sds, 2) + ' g' : 'agR ' + fmt(sp.agR, 2) + ' m/s²' });
    }
    // Wand: Verhältnis Erdbebenkombination / Grundkombination über die Tiefe (Erd- und Wasserdruck, Geländelast)
    const ekOf = (z) => { const top = w.pressures.top, bot = w.pressures.bot; return top.k + (bot.k - top.k) * clamp((z - top.z) / max(1e-6, bot.z - top.z), 0, 1); };
    // ψ₂ der Geländelast wie bei der Rissbreite (Nutzung der Oberfläche), Innenlasten 0,6, Füllungen von Tanks und Vorräten 0,8
    const psi = finite(L.PSI2) ? L.PSI2 : 0.6;
    // Beiwerte der Erdbebenkombination: EN/SIA G + AEd + ψ₂ Q (Erddruck 1,0); ASCE 7 1,2 D + E + 0,5 L, Erddruck H mit 1,6
    const SC = NC.seisComb || { H: 1, Q: null }, cH = DEn ? 1 : SC.H, cQ = DEn || SC.Q == null ? psi : SC.Q;
    let ratio = 0;
    const K0q = (L.K0 || 0.5) * (L.q || 0);
    for (let i = 0; i <= 20; i++) { const z = w.pressures.top.z + (w.pressures.bot.z - w.pressures.top.z) * i / 20, ek = ekOf(z); ratio = max(ratio, (cH * ek + e.dp + cQ * K0q) / max(1e-6, max(...NC.lf.sets.map((S) => S.H * ek + S.Q * K0q)))); }
    // Biegetragfähigkeit der Wandlagen gegen das hochgerechnete Moment
    const mRd = (l) => { const As = l.prov * 1e-4, x = As * mat.fyd / (mat.fcd * 0.8095); return As * mat.fyd * 1000 * (l.d - 0.416 * x); };
    const wallRows = (w.layers || []).map((l) => ({ label: l.label, mE: ratio * (l.m || 0), mRd: mRd(l), eta: ratio * (l.m || 0) / max(1e-9, mRd(l)) }));
    const wallEta = max(0, ...wallRows.map((r) => r.eta));
    // Gleiten: Trägheitskraft des Bauwerks mit Erdauflast gegen Reibung in der Sohlfuge (Erddruck beiderseits im Gleichgewicht)
    const U = st.buoyancy && st.buoyancy.final ? st.buoyancy.final.U || 0 : 0;
    const Eeq = st.bearing.Eeq || 0, Qint = max(0, st.bearing.Qtot - (L.Qroof || 0) - Eeq);
    const W = st.bearing.Gtot + psi * (L.Qroof || 0) + NC.lf.psi2Q * Qint + NC.lf.psi2E * Eeq;
    // Sohlreibung mit dem Bemessungswert tan φ′ / γφ′ (DIN 1054: γφ′ = 1,25), nur ständige Lasten abzüglich Auftrieb
    const F = e.Sd / 9.81 * W, Rf = max(0, st.bearing.Gtot - U) * Math.tan(soil.phi * Math.PI / 180) / NC.geo.sl[0];
    const liq = (p.site.soil === 'sand' || p.site.soil === 'schluff') && finite(lv.zW) && lv.zW > lv.zSlabBot;
    return Object.assign(e, { H, psi, cH, cQ, ratio, wallRows, wallEta, W, F, Rf, slideEta: F / max(1e-9, Rf), liq, eta: max(wallEta, F / max(1e-9, Rf)) });
  }

  function moreChecks(p, q) {
    const V = BP.verify;
    if (!V) return null;
    const b = p.build, lv = q.lv, geo = q.geo, st = q.struct, soil = q.soil, out = {};
    if (!geo.valid) return out;
    out.eq = seismicCheck(p, q);
    const dw = finite(lv.zW) ? max(0, -lv.zW) : Infinity; // Wasserstand unter Gelände
    const gB = soil.gammaSat - GAMMA_W;
    // Grundbruch DIN 4017: Ersatzrechteck gleicher Fläche und Seitenverhältnis, Einbindung bis UK Sohle, Auftrieb entlastet
    const bb = G.bbox(geo.slab), Lx = bb.x1 - bb.x0, Ly = bb.y1 - bb.y0, ratio = max(Lx, Ly) / max(1e-6, min(Lx, Ly));
    const B = Math.sqrt(geo.Aslab / ratio), A = geo.Aslab / B, D = max(0, -lv.zInsBot);
    const g1 = D > 1e-6 ? (soil.gamma * min(D, dw) + gB * max(0, D - dw)) / D : soil.gamma, g2 = dw <= D + B ? gB : soil.gamma;
    const U = st.buoyancy && st.buoyancy.final ? st.buoyancy.final.U || 0 : 0;
    // Nachweisverfahren nach Norm: DA2/DA2* (Lasten mit Teilsicherheit, Widerstand / γR,v), DA1 (Kombination 1 und 2), DA3
    // (Bodenkennwerte abgemindert), CTE/NTC (Teilsicherheit auf den Widerstand)
    const GEO = NC.geo, Eq0 = st.bearing.Eeq || 0, Gt = st.bearing.Gtot, Qt = st.bearing.Qtot - Eq0;
    const VdA1 = max(0, max(...NC.lf.sets.map((S) => S.G * Gt + S.Q * Qt + S.E * Eq0)) - U);
    const gbRun = (Vd, gPhi, gc, gR, tag) => Object.assign(V.grundbruch({ a: A, b: B, d: D, gamma1: g1, gamma2: g2, phi: Math.atan(Math.tan(soil.phi * Math.PI / 180) / gPhi) * 180 / Math.PI, c: (soil.c || 0) / gc, Vd, gammaRv: gR }), { approach: tag, phiK: soil.phi, cK: soil.c || 0 });
    if (GEO.da === 'DA1') {
      const c1 = gbRun(VdA1, 1, 1, GEO.gRv, 'DA1-1'), c2 = gbRun(max(0, Gt + GEO.gQgeo * (Qt + Eq0) - U), GEO.gPhi, GEO.gc, GEO.gRv, 'DA1-2');
      out.gb = c2.eta > c1.eta ? c2 : c1;
    } else if (GEO.da === 'DA3' || GEO.da === 'SIA 267') out.gb = gbRun(VdA1, GEO.gPhi, GEO.gc, GEO.gRv, GEO.da);
    else if (GEO.da === 'CTE' || GEO.da === 'ASD') out.gb = gbRun(max(0, Gt + Qt + Eq0 - U), 1, 1, GEO.gRv, GEO.da);
    else out.gb = gbRun(VdA1, 1, 1, GEO.gRv, GEO.da);
    // Setzung DIN 4019: quasi-ständige Last (ψ₂ ≈ 0,5), Wiederbelastung bis zur Aushubentlastung
    // quasi-ständig: Geländelast mit ψ₂ der gewählten Nutzung, Innenlasten mit 0,6
    const L0 = st.loads || {}, psiS = finite(L0.PSI2) ? L0.PSI2 : 0.5;
    const Qqp = psiS * (L0.Qroof || 0) + 0.6 * max(0, st.bearing.Qtot - (L0.Qroof || 0));
    const sig = max(0, (st.bearing.Gtot + Qqp - U) / geo.Aslab);
    // Erdhügel neben dem Bauwerk als Ringlasten an der Geländeoberfläche (Krone voll, Böschung gemittelt)
    const extra = [];
    const mo0 = lv.mound;
    if (mo0.on && mo0.h > 0.05) {
      const gF = mo0.fill === 'liefer' ? 19 : soil.gamma, pc = gF * mo0.h, ps = gF * mo0.h / 2;
      const A1 = A + 2 * mo0.crest, B1 = B + 2 * mo0.crest, A2 = A1 + 2 * mo0.n * mo0.h, B2 = B1 + 2 * mo0.n * mo0.h;
      extra.push({ A: A1, B: B1, p: pc }, { A, B, p: -pc }, { A: A2, B: B2, p: ps }, { A: A1, B: B1, p: -ps });
    }
    out.set = V.settlement({ A, B, D, sigma: sig, gamma: soil.gamma, gammaB: gB, dw, Es: soil.Es || 40, extra });
    out.set.limit = 0.03;
    // Böschungen
    const mo = lv.mound;
    if (mo.on && mo.h > 0.3) {
      const fill = mo.fill === 'liefer' ? { name: T_('Liefermaterial, verdichtet'), gamma: 19, phi: 32.5, c: 0 } : { name: T_('{soil} (umgelagert, ohne Kohäsion)', { soil: T_(soil.name) }), gamma: soil.gamma, phi: soil.phi, c: 0 };
      const qS = p.use.surface === 'eigen' ? p.use.surfaceQ : (M.SURFACE_LOADS[p.use.surface] || M.SURFACE_LOADS.garten).q;
      const run = (n) => {
        const xT = n * mo.h, xW = xT + mo.crest;
        return V.slope({ gPhi: NC.geo.sl[0], gc: NC.geo.sl[1], gQ: NC.geo.sl[2], ground: [[-3 * mo.h - 8, 0], [0, 0], [xT, mo.h], [xW + 40, mo.h]], upper: fill, lower: soil, yL: 0,
          loads: [{ x0: xT, x1: xW + 40, q: qS }], block: { x0: xW, y1: mo.h - b.cover }, toe: { x: 0, y: 0 }, crest: { x: xT, y: mo.h } });
      };
      const r = run(mo.n);
      r.fill = fill; r.n = mo.n; r.h = mo.h; r.q = qS;
      if (!r.ok) {
        // flachste nötige Neigung 1 : n (Halbierung, auf 0,25 aufgerundet)
        let lo = mo.n, hi = 6;
        if (run(hi).ok) { for (let k2 = 0; k2 < 6 && hi - lo > 0.1; k2++) { const m = (lo + hi) / 2; if (run(m).ok) hi = m; else lo = m; } r.nMin = Math.ceil(hi * 4 - 1e-9) / 4; } else r.nMin = Infinity;
      }
      out.mound = r;
    }
    const e = q.earth;
    if (b.excavation.mode !== 'verbau' && e.k > 0 && e.depth > 0.5) {
      const run = (angle) => {
        const k = 1 / Math.tan(angle * Math.PI / 180), Dp = e.depth;
        return V.slope({ gPhi: NC.geo.sl[0], gc: NC.geo.sl[1], gQ: NC.geo.sl[2], ground: [[-3 * Dp - 8, 0], [0, 0], [Dp * k, Dp], [Dp * k + 40, Dp]], upper: soil, lower: soil, loads: [{ x0: Dp * k + 0.6, x1: Dp * k + 40, q: 10 }], toe: { x: 0, y: 0 }, crest: { x: Dp * k, y: Dp } });
      };
      const r = run(e.angle);
      const R = e.rule || excRule(p.site.soil, soil);
      r.angle = e.angle; r.depth = e.depth; r.rule = R; r.din4124 = e.depth <= R.dMax + 1e-9 && e.angle <= R.angle + 1e-6;
      // größter rechnerisch zulässiger Winkel nur, wenn DIN 4124 einen Nachweis verlangt (Halbierung auf 0,5°)
      if (!r.ok && !r.din4124) {
        let lo = 10, hi = e.angle;
        if (!run(lo).ok) r.angleMax = null; // auch 10° reichen nicht: Verbau
        else { for (let k2 = 0; k2 < 7 && hi - lo > 0.5; k2++) { const m = (lo + hi) / 2; if (run(m).ok) lo = m; else hi = m; } r.angleMax = Math.floor(lo); }
      }
      out.exc = r;
    }
    // Feuerwiderstand
    const cls = b.fireClass || 'R90';
    out.fire = cls === 'keine' ? null : V.fire(q, cls);
    // Aufzugsgruben
    out.pits = geo.vert.lifts.filter((v) => v.design).map((v) => {
      const d = v.design, zTop = -(lv.levels[v.levelBot].zFloorTop - d.pit);
      return Object.assign(V.pit({ wIn: v.wIn, dIn: v.dIn, pit: d.pit, tF: b.tFloor, tw: v.t, soil, zTopPit: zTop, dw, fck: q.mat.fck, cnom: b.cnom, buffer: d.buffer, cwBuffer: d.cwBuffer, sigRd: soil.sigmaRd }), { id: v.id });
    });
    // Betonierabschnitte und Fugen
    out.pours = V.pours(q);
    return out;
  }

  /* ---------- Technik & Vorräte ---------- */

  const VENT_SIZES = [75, 150, 300, 600, 1200];
  function technik(p, geo, lv, env) {
    const t = p.tech, u = p.use, n = max(0, u.people), days = max(0, u.days);
    const V = geo.tot.V;
    const Gco2 = n * t.co2PerPerson / 1000; // m³/h
    const dC = (t.co2Target - t.co2Out) * 1e-6;
    const qCo2 = dC > 0 ? Gco2 / dC : NaN;
    const tLimit = Gco2 > 0 ? V * (t.co2Limit - t.co2Out) * 1e-6 / Gco2 : Infinity;
    const vMax = VENT_SIZES[VENT_SIZES.length - 1];
    const ventN = isFinite(qCo2) && qCo2 > vMax ? ceil(qCo2 / vMax) : 1; // große Schutzräume: mehrere Geräte parallel
    const ventSize = VENT_SIZES.find((s) => s * ventN >= qCo2) || vMax;
    const ventPrice = 3500 + 20 * ventSize;
    const consumers = t.consumers.map((c) => {
      let w = c.w;
      if (c.auto === 'lueftung') w = Math.round(ventSize * 0.45 * ventN);
      if (c.auto === 'licht') w = Math.round(t.lightWm2 * geo.tot.Anet);
      return Object.assign({}, c, { w, wh: w * c.h });
    });
    // Aufzüge: Fahrleistung und Anlaufspitze für das Notstromaggregat (je eine Anlage läuft an, die übrigen fahren)
    const lifts = geo.vert.lifts.filter((v) => v.design).map((v) => ({ id: v.id, P: v.design.P, kVAstart: v.design.kVAstart, kVArun: v.design.kVArun, wh: v.design.P * 1000 * 0.25 }));
    const whLift = lifts.reduce((s, l) => s + l.wh, 0);
    // Haustechnik: Abwasser, Wärmebilanz und Kühlung; berechnete Verbraucher (Hebeanlage, Kühlgerät) gehen in Energie und Spitzenlast ein
    const HT = BP.haustechnik, whBase = consumers.reduce((s, c) => s + c.wh, 0) + whLift;
    const sew = HT && lv ? HT.sewage(p, lv, n) : null;
    const hb = HT && env ? HT.heat(p, { env, n, whDayBase: whBase, ventSize, ventN, qCo2 }) : null;
    const extra = [];
    if (sew && sew.mode === 'hebeanlage') extra.push({ id: 'auto-hebe', name: T_(sew.double ? 'Hebeanlage (2 × {p} kW)' : 'Hebeanlage ({p} kW)', { p: fmt(sew.motor, 2) }), w: sew.motor * 1000, h: Math.round(sew.runH * 100) / 100, auto: 'hebeanlage' });
    if (hb && hb.elec > 0) extra.push({ id: 'auto-kuehl', name: T_('Kühlgerät {p} kW Kälte (COP {cop})', { p: fmt(hb.kW, 1), cop: fmt(hb.cop, 1) }), w: Math.round(hb.elec), h: 16.8, auto: 'kuehlung' });
    extra.forEach((c) => { c.wh = c.w * c.h; });
    const whDay = whBase + extra.reduce((s, c) => s + c.wh, 0);
    const peakBase = consumers.reduce((s, c) => s + c.w, 0) + extra.reduce((s, c) => s + c.w, 0);
    const peak = peakBase + lifts.reduce((s, l) => s + l.P * 1000, 0);
    const heat = n * t.heatPerPerson + whBase / 24;
    const qHeat = t.deltaT > 0 ? 3600 * heat / (1200 * t.deltaT) : NaN;
    const batDays = min(days, t.batteryDays);
    // Aufzüge und Kühlgerät laufen am Netz bzw. Aggregat, nicht an der Batterie
    const whCool = extra.filter((c) => c.auto === 'kuehlung').reduce((s, c) => s + c.wh, 0);
    const battery = (whDay - whLift - whCool) / 1000 * batDays / t.dod;
    const inverter = max(1, ceil((peakBase - extra.filter((c) => c.auto === 'kuehlung').reduce((s, c) => s + c.w, 0)) * 1.25 / 500) / 2);
    const genDays = max(0, days - t.batteryDays);
    const liftStart = lifts.length ? max(...lifts.map((l) => l.kVAstart - l.kVArun)) + lifts.reduce((s, l) => s + l.kVArun, 0) : 0;
    const genReq = max(peakBase * 1.5 / 800, peakBase * 1.25 / 800 + liftStart);
    const generator = genDays > 0 || lifts.length || whCool > 0 ? max(2, ceil(genReq)) : 0;
    // Kraftstoff nach Verbrauchskennlinie: 0,08 L/h je kW Nennleistung (Leerlauf) + spezifischer Verbrauch × mittlere Last.
    // Läuft ein Kühlgerät, muss das Aggregat auch in den Batterietagen laufen.
    const kWr = 0.8 * generator, lphOf = (avgW) => (generator ? 0.08 * kWr + t.fuelPerKWh * avgW / 1000 : 0);
    const fuelGen = genDays * 24 * lphOf(whDay / 24);
    const fuelBat = whCool > 0 ? batDays * 24 * lphOf((whCool + whLift) / 24) : batDays * whLift / 1000 * t.fuelPerKWh;
    const fuel = fuelGen + fuelBat;
    // Spültoiletten nur am Kanal; im Schutzbetrieb Trockentoiletten. Bei reinem Sammeltank Spülwasser 5 × 6 L je Person und Tag
    const flush = (t.sewer || 'hebeanlage') === 'tank' ? n * days * 30 : 0;
    const drink = n * days * t.waterDrink, hyg = n * days * t.waterHygiene + flush;
    const waste = hyg + n * days * 1.0;
    const food = n * days * t.foodKg;
    const gen = HT ? HT.genset(p, { generator, whDay, fuel, genDays, batDays: whCool > 0 ? batDays : 0 }) : null;
    const pv = HT ? HT.protVent(p, geo, { qCo2, ventSize, ventN }) : null;
    const svc = HT ? { sew, heat: hb, prot: pv, gen, valves: HT.valves(p, { ventSize, ventN }, gen, sew) } : null;
    const equip = HT && HT.equipment && geo.valid ? placeEquip(p, geo, HT.equipment(p, { gen, battery, ventSize, ventN, drink, hyg, food, waste, sew })) : [];
    const products = HT && HT.products ? HT.products(p, { ventSize, ventN, svc, persons: n }) : [];
    return {
      V, Gco2, qCo2, perPerson: n > 0 ? qCo2 / n : 0, ach: V > 0 ? qCo2 / V : 0, tLimit, ventSize, ventN, ventPrice,
      consumers, extraConsumers: extra, svc, equip, products, whDay, peak, peakBase, lifts, liftStart, heat, qHeat, battery, inverter, generator, genDays, fuel,
      drink, hyg, flush, water: drink + hyg, waste, food, kcal: n * days * 2200, personDays: n * days, fuelGen, fuelBat,
    };
  }

  /* Aufstellung der Einbauten: Raum nach Vorgabe (p.tech.place), sonst nach Raumname, sonst größter Raum der untersten Ebene.
   * Die Einheiten werden als kompakter Block möglichst nahe der Raummitte aufgestellt (Feldmitte, ungünstig für die Platte);
   * Geräte im selben Raum überlappen sich nicht. Lasten: gk und ek in kN/m² über die Blockfläche. */
  // Raumnamen in Deutsch, Englisch und Spanisch (Namen gibt der Nutzer in seiner Sprache ein)
  const EQUIP_ROOMS = {
    technik: /maschin|aggregat|notstrom|diesel|technik|plant|machine|generator|mechanical|técnic|tecnic|máquinas|maquinas|grupo electr/i,
    batterie: /batter|bater|elektro|electric|eléctric|technik|plant|técnic|tecnic|maschin|machine/i,
    lueftung: /lüft|luft(?!schleuse)|filter|filtr|ventilat|ventilac|technik|plant|técnic|tecnic|maschin|machine/i,
    wasser: /wasser|water|agua|lager|storage|store|almac|vorrat|supplies|provision|technik|plant|técnic|tecnic/i,
    vorrat: /vorrat|supplies|provision|lager|storage|store|almac|despensa|pantry|küche|kitchen|cocina|speise|proviant|food|víveres|viveres/i,
    abwasser: /abwasser|sewage|wastewater|aguas resid|wc|toilet|toilette|aseo|baño|bano|sanit|dusch|shower|ducha|wash|technik|plant|técnic|tecnic/i,
  };
  const AIRLOCK = /schleuse|airlock|esclusa/i;
  function placeEquip(p, geo, items) {
    const nL = geo.L.length, place = (p.tech && p.tech.place) || {};
    const rooms = geo.L.flatMap((Lg) => (Lg.gridAll ? Lg.rooms.filter((r) => !r.shaft).map((r) => ({ r, Lg, g: Lg.gridAll })) : []));
    if (!rooms.length) return [];
    const bottom = rooms.filter((x) => x.Lg.idx === nL - 1);
    const occ = new Map(); // gestellte Blöcke je Ebene
    // Zellbereich eines Rechtecks im Raster (binäre Suche statt Lauf über alle Zellen)
    const lo = (arr, v) => { let a = 0, b = arr.length - 2; while (a < b) { const m = (a + b) >> 1; if (arr[m + 1] <= v + 1e-6) a = m + 1; else b = m; } return a; };
    const hitOcc = (x, rc) => (occ.get(x.Lg.idx) || []).some((o) => rc.x0 < o.x1 - 1e-6 && rc.x1 > o.x0 + 1e-6 && rc.y0 < o.y1 - 1e-6 && rc.y1 > o.y0 + 1e-6);
    const freeCells = (x, rc) => {
      const g = x.g;
      for (let i = lo(g.xs, rc.x0); i < g.nx && g.xs[i] < rc.x1 - 1e-6; i++) {
        if (g.xs[i + 1] <= rc.x0 + 1e-6) continue;
        for (let j = lo(g.ys, rc.y0); j < g.ny && g.ys[j] < rc.y1 - 1e-6; j++) {
          if (g.ys[j + 1] <= rc.y0 + 1e-6) continue;
          if (!g.free[i][j] || g.comp[i][j] !== x.r.comp) return false;
        }
      }
      return true;
    };
    const center = (x) => {
      let a = 0, cx = 0, cy = 0;
      for (const [i, j] of x.r.bbox.cells) { const w = (x.g.xs[i + 1] - x.g.xs[i]) * (x.g.ys[j + 1] - x.g.ys[j]); a += w; cx += w * (x.g.xs[i] + x.g.xs[i + 1]) / 2; cy += w * (x.g.ys[j] + x.g.ys[j + 1]) / 2; }
      return a > 0 ? { x: cx / a, y: cy / a } : x.r.label;
    };
    /* Freie Lage für einen Block W × D im Raum, nächste zur Raummitte. Kandidaten: Raster (höchstens rund 4000 Lagen), Raumränder,
     * Wandflächen des Rasters und bündig an bereits gestellte Blöcke. strict = false prüft nur Raumgrenzen und andere Blöcke. */
    const fitBlock = (x, W, D, strict) => {
      const bb = x.r.bbox, c = center(x), g = x.g;
      const spX = bb.x1 - bb.x0 - W, spY = bb.y1 - bb.y0 - D;
      if (spX < -1e-6 || spY < -1e-6) return null;
      const st = Math.max(0.1, Math.sqrt((spX + 0.1) * (spY + 0.1) / 4000));
      const axis = (a0, sp, gl, w, cc, oLo, oHi) => {
        const v = new Set(), add = (t) => { if (t >= a0 - 1e-6 && t <= a0 + sp + 1e-6) v.add(Math.round(clamp(t, a0, a0 + sp) * 1e4) / 1e4); };
        for (let t = 0; t <= sp + 1e-6; t += st) add(a0 + t);
        add(a0 + sp); add(cc - w / 2);
        for (const t of gl) { add(t); add(t - w); }
        for (const o of occ.get(x.Lg.idx) || []) { add(o[oHi]); add(o[oLo] - w); }
        return [...v];
      };
      const X = axis(bb.x0, spX, g.xs, W, c.x, 'x0', 'x1'), Y = axis(bb.y0, spY, g.ys, D, c.y, 'y0', 'y1');
      const cand = [];
      for (const x0 of X) for (const y0 of Y) cand.push([Math.hypot(x0 + W / 2 - c.x, y0 + D / 2 - c.y), x0, y0]);
      cand.sort((a, b) => a[0] - b[0]);
      for (const [, x0, y0] of cand) {
        const rc = { x0, y0, x1: x0 + W, y1: y0 + D };
        if (!hitOcc(x, rc) && (!strict || freeCells(x, rc))) return rc;
      }
      return null;
    };
    const out = [];
    const order = items.slice().sort((a, b) => b.n * (b.mg * b.dyn + b.me) - a.n * (a.mg * a.dyn + a.me));
    for (const it of order) {
      const ref = place[it.id];
      const fixed = ref && ref !== 'auto' ? rooms.find((y) => y.r.id === ref) : null;
      const manual = !!fixed;
      // Kandidaten: vorgegebener Raum, sonst passende Räume (größter zuerst), dann die unterste Ebene, dann alle Räume
      const byArea = (list) => list.slice().sort((a, b) => b.r.area - a.r.area);
      const re = EQUIP_ROOMS[it.kind];
      const cands = fixed ? [fixed] : [...new Set(byArea(rooms.filter((y) => re && re.test(y.r.name || ''))).concat(byArea(bottom), byArea(rooms)))];
      // Anordnungen der Einheiten: Spalten × Reihen in beiden Lagen, kompakteste zuerst
      const arr = [];
      for (const [l, b] of [[it.L, it.B], [it.B, it.L]]) for (let cols = 1; cols <= it.n; cols++) { const rows = ceil(it.n / cols); if (cols > 1 && (cols - 1) * rows >= it.n) continue; arr.push({ W: cols * l, D: rows * b }); }
      arr.sort((a, b) => max(a.W, a.D) - max(b.W, b.D));
      let rc = null, x = cands[0];
      for (const c of cands.slice(0, 8)) {
        for (const a of arr.slice(0, 12)) { rc = fitBlock(c, a.W, a.D, true); if (rc) break; }
        if (rc) { x = c; break; }
      }
      const fits = !!rc;
      let overlap = false;
      if (!rc) { // passt nicht: im ersten Raum ohne Rücksicht auf Raumzuschnitt, aber ohne Überdeckung anderer Blöcke
        for (const a of arr.slice(0, 12)) { rc = fitBlock(x, a.W, a.D, false); if (rc) break; }
      }
      if (!rc) { // auch das nicht: Block über die Raummitte, auf die Raumgrenzen beschränkt (Last bleibt gleich, Fläche kleiner → höhere Pressung)
        const a = arr[0], c = center(x), bb = x.r.bbox;
        const W = min(a.W, bb.x1 - bb.x0), D = min(a.D, bb.y1 - bb.y0);
        const x0 = clamp(c.x - W / 2, bb.x0, bb.x1 - W), y0 = clamp(c.y - D / 2, bb.y0, bb.y1 - D);
        rc = { x0, y0, x1: x0 + W, y1: y0 + D };
        overlap = hitOcc(x, rc);
      }
      if (!occ.has(x.Lg.idx)) occ.set(x.Lg.idx, []);
      occ.get(x.Lg.idx).push(rc);
      const A = (rc.x1 - rc.x0) * (rc.y1 - rc.y0), Gk = it.n * it.mg * it.dyn * 9.81 / 1000, Ek = it.n * it.me * 9.81 / 1000;
      const lvl = x.Lg.idx;
      out.push(Object.assign({}, it, {
        level: lvl, roomId: x.r.id, room: x.r.name, manual, fits, overlap, rect: rc, area: A, G: Gk, E: Ek, gk: A > 0 ? Gk / A : 0, ek: A > 0 ? Ek / A : 0,
        slab: lvl === nL - 1 ? T_('Bodenplatte') : T_('Zwischendecke über Ebene {n}', { n: lvl + 2 }),
      }));
    }
    return out.sort((a, b) => items.indexOf(items.find((i) => i.id === a.id)) - items.indexOf(items.find((i) => i.id === b.id)));
  }

  /* ---------- Luftstoß dynamisch: Einmassenschwinger ----------
   * Je Bauteil ein Ersatzbalken in Richtung der kurzen Stützweite, beidseitig eingespannt (Biggs: KE = 307 EI/l⁴, KLM 0,77
   * elastisch / 0,66 plastisch; Decke mit KLM der eingespannten Rechteckplatte, siehe KLM2), Widerstand Ru aus der Bruchlinien- bzw. Fließgelenktraglast der Bemessung mit dynamischen
   * Festigkeiten, Steifigkeit mit Ia = (Ig + Icr)/2 (UFC 3-340-02). Statische Last in Stoßrichtung (Erdauflast, Erddruck) zu
   * Beginn im Gleichgewicht. Lasten: TWK-Luftstoß als Rechteckstoß langer Dauer; Szenarien mit Druck und Impuls als Dreieck
   * (td = 2 I / P). Grenzwerte: Duktilität μ ≤ 3 (entspricht beim Rechteckstoß Φ = 1,2 der TWK), Auflagerdrehwinkel θ ≤ 2°
   * (UFC 3-340-02, Schutzkategorie 1). Örtliche Wirkungen (Abplatzen, Durchschlag, Splitter) sind nicht enthalten. */
  function blastDynamics(p, q) {
    const st = q.struct, bl = st.blast, V = BP.verify, L = st.loads || {};
    if (!V || !V.sdof) return null;
    const loads = [];
    if (bl) loads.push({ key: 'twk', name: T_('TWK 2017, {qk} kN/m², lange Dauer (Rechteckstoß)', { qk: fmt(bl.qk, 0) }), P0: (el) => bl.fw[el] * bl.qk, td: Infinity, twk: true });
    for (const t of (q.planning && q.planning.threats) || []) {
      const ld = t.load;
      if (!ld || !(ld.pressure > 0) || !(ld.impulse > 0)) continue;
      loads.push({ key: 'sz:' + t.s.id, name: T_(ld.source === 'external' ? '{name} (Fachunterlage)' : '{name} (Modellwert Kingery–Bulmash)', { name: t.catalog ? T_(t.catalog.name) : T_('Szenario') }), P0: () => ld.pressure, td: 2 * ld.impulse * 1e-3 / ld.pressure, I: ld.impulse * 1e-3 });
    }
    if (!loads.length) return null;
    const mat = st.mat, Ec = mat.Ecm * 1000, dmax = p.build && p.build.dmax === 16 ? 16 : 32;
    const dyn = bl ? bl.dyn : { fcd: mat.fck >= 30 ? 44 : 38, fsd: 600, tau: mat.fck >= 30 ? 1.7 : 1.6, kg: 48 / (16 + dmax), dmax };
    const EIa = (h, As, d) => {
      const n = 200000 / mat.Ecm, a = As * 1e-4, x = -n * a + Math.sqrt(n * n * a * a + 2 * n * a * d);
      return Ec * (h * h * h / 12 + x * x * x / 3 + n * a * (d - x) * (d - x)) / 2;
    };
    const minLayer = (layers, face) => { const ls = (layers || []).filter((l) => l.face === face); return ls.length ? ls.reduce((a, l) => (mRdDyn(l, dyn) < mRdDyn(a, dyn) ? l : a)) : null; };
    const els = [];
    const rf = st.roof;
    if (rf && rf.layers) {
      const lb = minLayer(rf.layers, 'unten'), lt = minLayer(rf.layers, 'oben'), Lx = rf.field ? (rf.field.lxC || rf.field.lx) : null;
      const Ly = rf.field ? (rf.field.lyC || rf.field.ly || Lx) : Lx;
      if (lb && lt && Lx) els.push({ el: T_('Decke'), key: 'roof', h: rf.h, L: Lx, Ly: max(Lx, Ly), twoWay: true, Mn: mRdDyn(lb, dyn), Mp: mRdDyn(lt, dyn), As: lb.prov, d: lb.d, Ru: rf.acc ? rf.acc.qRd : null, ps: (L.gkRoof || 0) + 0.3 * (L.q || 0), acc: rf.acc });
    }
    const w = st.wall;
    if (w && w.layers) {
      const li = w.layers.find((l) => l.key === 'vi'), lo = w.layers.find((l) => l.key === 'vo');
      const Lw = max(...(w.spans || [w.L]).map((x) => (Array.isArray(x) ? x[1] - x[0] : x)));
      if (li && lo) els.push({ el: T_('Außenwand'), key: 'wall', h: w.h, L: Lw, Mn: mRdDyn(li, dyn), Mp: mRdDyn(lo, dyn), As: li.prov, d: li.d, Ru: w.acc ? w.acc.qRd : null, ps: (w.pressures.top.k + w.pressures.bot.k) / 2 + 0.3 * (L.K0 || 0.5) * (L.q || 0), acc: w.acc });
    }
    // Zweiachsige, eingespannte Rechteckplatte: Steifigkeit gegenüber dem Streifen nach Timoshenko Tab. 35 (wmax = α q lx⁴/D)
    const ALPHA = [[1.0, 0.00126], [1.1, 0.00150], [1.2, 0.00172], [1.3, 0.00191], [1.4, 0.00207], [1.5, 0.00220], [1.6, 0.00230], [1.7, 0.00238], [1.8, 0.00245], [1.9, 0.00249], [2.0, 0.00254], [1e9, 0.00260]];
    const kappa = (rho) => { for (let i = 1; i < ALPHA.length; i++) if (rho <= ALPHA[i][0]) { const [r0, a0] = ALPHA[i - 1], [r1, a1] = ALPHA[i]; return 0.00260 / (r1 > 100 ? a1 : a0 + (a1 - a0) * (rho - r0) / (r1 - r0)); } return 1; };
    /* Lastmassenfaktor KLM = KM/KL der allseits eingespannten Rechteckplatte je Seitenverhältnis ly/lx: elastisch aus der
     * statischen Biegefläche (FE, 30 Elemente je kurze Seite), plastisch aus dem Bruchlinienmechanismus mit 45°-Linien
     * (Walmdach). Grenzwert für lange Platten: Balken 0,77 / 0,66 (Biggs). Biggs Tab. 5.5 mit Näherungsformen liegt etwas höher. */
    const KLM2 = [[1.0, 0.593, 0.500], [1.2, 0.595, 0.538], [1.4, 0.599, 0.562], [1.6, 0.606, 0.579], [1.8, 0.614, 0.591], [2.0, 0.624, 0.600], [2.5, 0.650, 0.615], [3.0, 0.673, 0.625], [5.0, 0.714, 0.643], [1e9, 0.77, 0.66]];
    const klm2 = (rho) => { for (let i = 1; i < KLM2.length; i++) if (rho <= KLM2[i][0]) { const a = KLM2[i - 1], b = KLM2[i], t = b[0] > 100 ? 0 : (rho - a[0]) / (b[0] - a[0]); return { e: a[1] + t * (b[1] - a[1]), p: a[2] + t * (b[2] - a[2]) }; } return { e: 0.77, p: 0.66 }; };
    const rows = [];
    for (const e of els) {
      const rho = e.twoWay ? e.Ly / e.L : Infinity, kap = e.twoWay ? kappa(rho) : 1, vF = e.twoWay ? 1 - e.L / (2 * e.Ly) : 1, K = e.twoWay ? klm2(rho) : { e: 0.77, p: 0.66 };
      const Ru = e.Ru || 8 * (e.Mn + e.Mp) / (e.L * e.L), KE = kap * 307 * EIa(e.h, e.As, e.d) / Math.pow(e.L, 4), m = 2.5 * e.h;
      for (const ld of loads) {
        const P0 = ld.P0(e.key), r = V.sdof({ m, KE, Ru, P0, td: ld.td, ps: e.ps, KLMe: K.e, KLMp: K.p });
        const theta = r.collapse ? Infinity : Math.atan(r.xm / (e.L / 2)) * 180 / Math.PI;
        const vEd = r.collapse ? Infinity : r.vFactor * e.L * vF; // zweiachsig: Lastanteil der langen Seite (Bruchlinienbild)
        const sh = shearDyn(vEd, e.d, min(1, (r.rMax || Ru) / Ru), dyn);
        const vCap = e.acc && e.acc.shear && e.acc.shear.reinf ? min(sh.vMax, max(sh.vRd, e.acc.shear.reinf.prov * 1e-4 * 0.9 * e.d * dyn.fsd * 1000)) : sh.vRd;
        const okMu = r.mu <= 3 + 1e-9, okTheta = theta <= 2 + 1e-9, okV = vEd <= vCap + 1e-9;
        rows.push({ el: e.el, key: e.key, load: ld.name, loadKey: ld.key, twk: !!ld.twk, P0, td: ld.td, I: ld.I || null, L: e.L, Ly: e.Ly || null, kappa: kap, KLMe: K.e, KLMp: K.p, klm: r.klm, h: e.h, m, KE, Ru, ps: e.ps, T: r.T, xE: r.xE, xm: r.xm, mu: r.mu, theta, tm: r.tm, vEd, vCap,
          collapse: r.collapse, okMu, okTheta, okV, ok: !r.collapse && okMu && okTheta && okV, eta: r.collapse ? Infinity : max(r.mu / 3, theta / 2, vEd / vCap) });
      }
    }
    return { rows, dyn, criteria: { mu: 3, theta: 2 } };
  }

  /* ---------- Bauablauf ---------- */

  /* Wartezeiten nach dem Betonieren als wirksames Alter bei 20 °C (Reifegrad nach Nurse-Saul), Richtwerte für Normalzement:
   * nächster Arbeitsgang auf dem Bauteil (Schalung stellen) 1,5 d, Decke ausschalen 10 d (Eigengewicht und Bauzustand),
   * Erdauflast auf die Decke 21 d (rund 95 % der 28-Tage-Festigkeit nach EC2 3.1.2, Zement N). Bei 10 °C entspricht 1 d bei 20 °C rund 1,5 Kalendertagen. */
  const CURE = { next: 1.5, strip: 10, load: 21 };

  function schedule(p, q) {
    const R = (k) => (p.rates[k] != null ? p.rates[k] : M.RATES[k].v);
    const dur = (v) => max(1, ceil(v - 1e-9));
    const e = q.earth, v = q.vol, fw = q.fw, st = q.steel, env = q.env, hz = p.hazard || {};
    const kgOf = (el) => st.items.filter((i) => i.element === el).reduce((s, i) => s + i.kg, 0) / 1000;
    // Betonierabschnitte (WU-Richtlinie): jeder Abschnitt ist ein eigener Betoniertag
    const po = q.verify && q.verify.pours;
    const secOf = (el) => (po ? (po.sect.find((x) => x.el === el) || { n: 1 }).n : 1);
    const pourD = (V, el) => max(dur(V / R('beton')), secOf(el));
    // Wände und Zwischendecken Ebene für Ebene von unten nach oben (Anteile nach Höhe)
    const L = q.geo.L, nL = L.length, Hint = q.lv.Hint, mids = q.geo.mids || [], lifts = q.geo.vert.lifts, stairs = q.geo.vert.stairs;
    const fwRoofOnly = max(0, q.geo.Ain - L[0].footStb);
    const topWalls = nL > 1 ? 'w0' : 'w';
    // Unterzüge werden mit der Platte darüber geschalt, bewehrt und betoniert
    const beamKg = (lvl) => (q.struct.beams || []).filter((bd) => bd.level === lvl).reduce((s2, bd) => s2 + (st.schedule ? st.schedule.positions.filter((r) => r.el === 'Unterzüge' && r.label.startsWith((q.geo.labels['b:' + bd.id] || '') + ':')).reduce((a, r) => a + r.kg, 0) : 0), 0) / 1000;
    const beamFw = (lvl) => (q.struct.beams || []).filter((bd) => bd.level === lvl).reduce((s2, bd) => s2 + bd.L * (bd.bw + 2 * max(0, bd.h - (lvl === 0 ? p.build.tRoof : L[lvl].tSlab))), 0);
    const stairTasks = [];
    const levelTasks = () => {
      const out = [];
      let prev = 'bp_b';
      for (let k = nL - 1; k >= 0; k--) {
        const share = (L[k].H + (k ? L[k].tSlab : 0)) / Hint, id = k === nL - 1 ? 'w' : 'w' + k;
        const sfx = nL > 1 ? ' ' + T_('(Ebene {n})', { n: k + 1 }) : '';
        if (k < nL - 1) {
          const m = mids.find((x) => x.idx === k + 1), el = 'Zwischendecke über Ebene ' + (k + 2);
          out.push({ id: 'zd' + (k + 1), name: T_('Zwischendecke über Ebene {n} schalen und bewehren', { n: k + 2 }) + ((q.struct.beams || []).some((bd) => bd.level === k + 1) ? T_(', mit Unterzügen') : '') + (stairs.some((s2) => s2.lower === k + 1) ? T_(', Treppenauge aussparen') : ''),
            d: dur(((m ? m.soffit : 0) + beamFw(k + 1)) / R('schalungDecke') + (kgOf(el) + beamKg(k + 1)) / R('bewehrung')), deps: [prev], cure: CURE.next, res: 'rohbau' });
          out.push({ id: 'zd' + (k + 1) + '_b', name: T_('Zwischendecke über Ebene {n} betonieren', { n: k + 2 }) + (secOf(el) > 1 ? ' ' + T_('({n} Abschnitte)', { n: secOf(el) }) : ''), d: pourD(m ? m.V : 0, el), deps: ['zd' + (k + 1)], pour: true, res: 'rohbau' });
          prev = 'zd' + (k + 1) + '_b';
          // Innentreppen dieser Decke: Lauf hängt am Deckenrand, Antritt auf dem Fußboden darunter
          for (const s2 of stairs.filter((x) => x.lower === k + 1)) {
            const nm = q.geo.labels['v:' + s2.id] || T_('Innentreppe');
            stairTasks.push({ id: 'tr_' + s2.id, name: T_('{nm} schalen, bewehren, betonieren', { nm }), d: dur(1.5 + s2.w * s2.Ls / R('schalungDecke') * 3), deps: ['zd' + (k + 1) + '_b'], cure: CURE.next, pour: true, res: 'rohbau' });
          }
        }
        const elW = nL > 1 ? 'Wände Ebene ' + (k + 1) : 'Wände';
        const liftV = (v.lifts || 0) * share;
        out.push({ id, name: T_('{what} schalen und bewehren, Türzargen und Futterrohre einbauen', { what: (L[k].columns.length ? T_('Wände und Stützen') : T_('Wände')) + (lifts.some((x) => k >= x.wallTop && k <= x.levelBot) ? T_(', Aufzugsschacht') : '') }) + sfx,
          d: dur(fw.wallsTotal * share / R('schalungWand') + (kgOf('Außenwände') + kgOf('Innenwände') + kgOf('Aufzugsschacht') + kgOf('Stützen')) * share / R('bewehrung')), deps: [prev], cure: CURE.next, res: 'rohbau' });
        out.push({ id: id + '_b', name: T_('Wände betonieren') + sfx + (secOf(elW) > 1 ? ' ' + T_('({n} Abschnitte)', { n: secOf(elW) }) : ''), d: pourD((v.outerWalls + v.intStb + (v.cols || 0)) * share + liftV, elW), deps: [id], pour: true, res: 'rohbau' });
        prev = id + '_b';
      }
      return out;
    };
    const pitLifts = lifts.filter((x) => x.levelBot === nL - 1 && x.design);
    const roofBoxes = lifts.filter((x) => x.roofBox || x.toSurface);
    const tasks = [
      { id: 'be', name: T_('Baustelle einrichten, Absteckung, Leitungs- und Kampfmittelauskunft'), d: 2, deps: [], res: 'rohbau' },
      { id: 'ober', name: T_('Oberboden abtragen und lagern'), d: e.Vtopsoil > 0 ? dur(e.Astrip / R('oberboden')) : 0, deps: ['be'], res: 'erdbau' },
      { id: 'aushub', name: T_(e.shoring > 0 ? 'Aushub mit Verbau' : 'Aushub der Baugrube'), d: dur(e.Vexc / R('aushub') + e.shoring / R('verbau')), deps: ['ober'], res: 'erdbau' },
      { id: 'sohle', name: T_('Planum, Abnahme der Gründungssohle, Schotter, Sauberkeitsschicht'), d: dur(1 + e.gravelV / R('kies')), deps: ['aushub'], res: 'erdbau' },
      { id: 'grube', name: T_('Aufzugsgrube: Sohle und Wände'), d: pitLifts.length ? dur(3 * pitLifts.length) : 0, deps: ['sohle'], pour: pitLifts.length > 0, res: 'rohbau' },
      { id: 'bp', name: T_('Bodenplatte bewehren, Fugenblech, Anschlussbewehrung, Erdung'), d: dur(kgOf('Bodenplatte') / R('bewehrung') + 0.5 + (env.ins.floor > 0 ? env.floor / R('abdichtung') : 0)), deps: ['sohle', 'grube'], res: 'rohbau' },
      { id: 'bp_b', name: T_('Bodenplatte betonieren') + (secOf('Bodenplatte') > 1 ? ' ' + T_('({n} Abschnitte)', { n: secOf('Bodenplatte') }) : ''), d: pourD(v.slab, 'Bodenplatte'), deps: ['bp'], pour: true, res: 'rohbau' },
      ...levelTasks(),
      ...stairTasks,
      { id: 'zug', name: T_('Zugänge herstellen'), d: q.geo.access.length ? dur(2 + fw.access / R('schalungWand')) : 0, deps: ['bp_b'], cure: CURE.next, res: 'rohbau', pour: q.geo.access.length > 0 },
      { id: 'd', name: T_('Decke schalen und bewehren') + ((q.struct.beams || []).some((bd) => bd.level === 0) ? T_(', mit Unterzügen') : '') + T_(', Einbauteile für Lüftung und Notausstieg'), d: dur((fwRoofOnly + beamFw(0)) / R('schalungDecke') + (kgOf('Decke') + beamKg(0)) / R('bewehrung')), deps: [topWalls + '_b'], cure: CURE.next, res: 'rohbau' },
      { id: 'd_b', name: T_('Decke betonieren') + (secOf('Decke') > 1 ? ' ' + T_('({n} Abschnitte)', { n: secOf('Decke') }) : ''), d: pourD(v.roof, 'Decke'), deps: ['d'], pour: true, res: 'rohbau' },
      { id: 'kopf', name: T_('Aufzug: Schachtkopf bzw. Aufzugshaus über der Decke'), d: roofBoxes.length ? dur(3 * roofBoxes.length) : 0, deps: ['d_b'], cure: CURE.next, pour: roofBoxes.length > 0, res: 'rohbau' },
      { id: 'aus', name: T_('Decke ausschalen'), d: 1, deps: ['d_b'], cure: CURE.strip, res: 'rohbau' },
      { id: 'abd', name: T_(env.membrane > 0 || env.ins.total > 0 ? 'Abdichtung und Dämmung außen' : 'Fugen prüfen, Dichtheitskontrolle vor dem Verfüllen'), d: dur(env.membrane > 0 || env.ins.total > 0 ? (env.wallsOut + env.roof) / R('abdichtung') : 1), deps: ['aus', 'zug', 'kopf'], res: 'abdichtung', weather: env.membrane > 0 },
      { id: 'drn', name: T_(env.drainLen > 0 ? 'Dränage und Schutzlage' : 'Schutzlage verlegen'), d: dur(env.drainLen > 0 ? env.drainLen / R('drainage') + 1 : 1), deps: ['abd'], res: 'abdichtung' },
      { id: 'verf', name: T_('Arbeitsraum lagenweise verfüllen und verdichten'), d: dur(e.Vside / R('verfuellung')), deps: ['drn'], res: 'erdbau' },
      { id: 'ueber', name: T_(e.Vmound > 0 ? 'Erdhügel aufschütten' : 'Erdüberdeckung aufbringen'), d: dur((e.Vcover + e.Vmound) / R('verfuellung')), deps: ['verf', 'd_b'], cureMap: { d_b: CURE.load }, res: 'erdbau' },
      { id: 'oberA', name: T_('Oberboden andecken') + (e.Vmound > 0 ? T_(', Böschung begrünen') : ''), d: e.Vtopsoil > 0 ? dur(e.Vtopsoil / R('verfuellung') + 0.5) : 0, deps: ['ueber'], res: 'erdbau' },
      { id: 'tech', name: T_(hz.cb ? 'Haustechnik: Lüftung mit Filtern und Überdruckventilen, Elektro, Notstrom, Wasser, Abwasser' : 'Haustechnik: Lüftung, Elektro, Notstrom, Wasser, Abwasser'), d: dur(6 + q.geo.tot.Anet / 10 + (q.routes.Lair + q.routes.Lcable) / 25), deps: ['aus'], res: 'technik' },
      { id: 'lift', name: T_('Aufzug montieren und prüfen (ZÜS)'), d: lifts.length ? dur(lifts.reduce((s2, x) => s2 + 8 + 2 * (x.levelBot - x.levelTop + 1), 0)) : 0, deps: ['aus', 'kopf'], res: 'aufzug' },
      { id: 'ausbau', name: T_('Innenausbau, Schutztüren und Einrichtung'), d: dur(3 + (q.finish.mw + q.finish.tb) / R('ausbau')), deps: ['tech'], res: 'ausbau' },
      { id: 'dpr', name: T_('Dichtheitsprüfung der Hülle mit Überdruck'), d: hz.cb ? 1 : 0, deps: ['ausbau'] },
      { id: 'abn', name: T_('Probebetrieb im Inselbetrieb und Abnahme'), d: 3, deps: ['ausbau', 'oberA', 'lift', 'dpr'] },
    ];
    const ov = p.schedule.overrides || {};
    tasks.forEach((t) => { t.auto = t.d; if (ov[t.id] != null && isFinite(ov[t.id])) t.d = max(0, Math.round(ov[t.id])); });
    const byId = {};
    tasks.forEach((t) => { byId[t.id] = t; });
    // Terminplanung im Baukalender: Arbeitstage (AT) ohne Wochenenden, Feiertage und Winterpause; Wartezeiten nach dem Betonieren
    // in Kalendertagen aus dem Reifegrad (wirksames Alter bei 20 °C); je Gewerk so viele gleichzeitige Vorgänge wie Kolonnen
    const sc = p.schedule || {}, LD = BP.laender, cl = LD ? LD.climate(p) : null;
    const cal = BP.kalender.make({ start: sc.start, country: LD ? LD.country(p) : 'DE', region: p.site.region, state: sc.state, winter: sc.winter, temps: cl ? cl.temps : null, tempOffset: sc.tempOffset });
    const crews = Object.assign({ erdbau: 1, rohbau: 1, abdichtung: 1, technik: 1, aufzug: 1, ausbau: 1 }, sc.crews || {});
    const usage = {};
    // Reihenfolge der Einplanung: von den freigegebenen Vorgängen zuerst den mit dem längsten Restweg bis zum Ende
    // (Prioritätsregel des seriellen Verfahrens); Restweg aus einer Vorwärtsrechnung ohne Kolonnen
    const esOf = (t) => { let es = 0; for (const dId of t.deps) { const dep = byId[dId]; let c = dep.d > 0 ? cal.calAfter(dep.end) : cal.calOfWork(dep.start); const cure = t.cureMap && t.cureMap[dId] != null ? t.cureMap[dId] : dep.pour && dep.d > 0 ? (t.cure || 0) : 0; if (cure > 0) c += cal.cureDays(c, cure); es = max(es, cal.workAtOrAfter(c)); } return es; };
    for (const t of tasks) { t.start = esOf(t); t.end = t.start + t.d; }
    const succ = {};
    for (const t of tasks) for (const dId of t.deps) (succ[dId] || (succ[dId] = [])).push(t);
    const tail = {};
    // Abstand je Abhängigkeit nur aus deren eigener Wartezeit (Aushärten), nicht aus Puffer
    const lagAT = (t, u) => { let c = t.d > 0 ? cal.calAfter(t.end) : cal.calOfWork(t.start); const cure = u.cureMap && u.cureMap[t.id] != null ? u.cureMap[t.id] : t.pour && t.d > 0 ? (u.cure || 0) : 0; if (cure > 0) c += cal.cureDays(c, cure); return max(0, cal.workAtOrAfter(c) - t.end); };
    for (let i = tasks.length - 1; i >= 0; i--) { const t = tasks[i]; tail[t.id] = t.d + (succ[t.id] || []).reduce((m, u) => max(m, lagAT(t, u) + tail[u.id]), 0); }
    const order = [], done = new Set(), rest = tasks.slice();
    while (rest.length) {
      const ready = rest.filter((t) => t.deps.every((dId) => done.has(dId)));
      const pick = ready.reduce((a, t) => (!a || tail[t.id] > tail[a.id] + 1e-9 ? t : a), null) || rest[0];
      order.push(pick); done.add(pick.id); rest.splice(rest.indexOf(pick), 1);
    }
    for (const t of order) {
      let es = 0, why = null, wait = 0;
      for (const dId of t.deps) {
        const dep = byId[dId];
        let c = dep.d > 0 ? cal.calAfter(dep.end) : cal.calOfWork(dep.start);
        const cure = t.cureMap && t.cureMap[dId] != null ? t.cureMap[dId] : dep.pour && dep.d > 0 ? (t.cure || 0) : 0;
        const wc = cure > 0 ? cal.cureDays(c, cure) : 0;
        c += wc;
        const k = cal.workAtOrAfter(c);
        if (k > es || why === null) { es = max(es, k); if (k >= es) { why = dId; wait = wc; } }
      }
      let st = es;
      if (t.res && t.d > 0) {
        const cap = max(1, Math.round(crews[t.res] || 1)), u = usage[t.res] || (usage[t.res] = []);
        for (let ok = false; !ok;) { ok = true; for (let i = st; i < st + t.d; i++) if ((u[i] || 0) >= cap) { ok = false; st = i + 1; break; } }
        for (let i = st; i < st + t.d; i++) u[i] = (u[i] || 0) + 1;
      }
      Object.assign(t, { start: st, end: st + t.d, esDep: es, why, cureWait: wait, resWait: st - es });
      t.dateStart = cal.dateOfWork(st); t.dateEnd = t.d > 0 ? cal.dateOfWork(st + t.d - 1) : t.dateStart;
      // Temperatur am Ausführungstag (Monatsmittel); Betonieren und Abdichten unter +5 °C nur mit Winterbaumaßnahmen
      t.Tmin = Infinity;
      for (let i = st; i < st + max(1, t.d); i++) t.Tmin = min(t.Tmin, cal.tempAt(cal.calOfWork(i)));
    }
    if (byId.aus) byId.aus.name = T_('Decke ausschalen (nach {n} Kalendertagen, Reifegrad)', { n: byId.aus.cureWait });
    if (byId.ueber && byId.d_b) byId.ueber.name += ' ' + T_('(Decke ≥ {n} Tage alt)', { n: cal.calOfWork(byId.ueber.start) - cal.calAfter(byId.d_b.end) + 1 });
    const total = max(...tasks.map((t) => t.end));
    // Wasserhaltung
    let wh = null;
    if (e.waterInPit) {
      const until = q.struct.buoyancy.bau.eta > 1 ? byId.ueber.end : byId.verf.end;
      // Pumpen laufen an allen Kalendertagen, auch über Feiertage und Winterpause
      wh = { start: byId.aushub.start, end: until, d: until - byId.aushub.start, cal: until > byId.aushub.start ? cal.calOfWork(until - 1) - cal.calOfWork(byId.aushub.start) + 1 : 0, reason: T_(q.struct.buoyancy.bau.eta > 1 ? 'bis Erdüberdeckung liegt (Rohbau allein nicht auftriebssicher)' : 'bis Arbeitsraum verfüllt') };
    }
    // kritischer Pfad (rückwärts): maßgebende Abhängigkeit bzw. bei Wartezeit auf die Kolonne der Vorgänger im selben Gewerk
    const crit = new Set();
    let cur = tasks.reduce((a, t) => (t.end > a.end ? t : a));
    while (cur && !crit.has(cur.id)) {
      crit.add(cur.id);
      let nx = null;
      if (cur.resWait > 0) nx = tasks.filter((t) => t !== cur && t.res === cur.res && t.d > 0 && t.end <= cur.start).reduce((a, t) => (!a || t.end > a.end ? t : a), null);
      if (!nx && cur.why) nx = byId[cur.why];
      cur = nx;
    }
    tasks.forEach((t) => { t.critical = crit.has(t.id); });
    // Kalender: Datum je Arbeitstag, Unterbrechungen (Feiertage, Winterpause) für die Darstellung
    const dates = [], breaks = [];
    for (let k = 0; k <= total; k++) dates.push(cal.dateOfWork(k));
    for (let k = 1; k <= total; k++) { const gap = cal.calOfWork(k) - cal.calOfWork(k - 1) - 1; if (gap >= 3) { const c0 = cal.calOfWork(k - 1) + 1; breaks.push({ at: k, days: gap, winter: cal.days.slice(c0, c0 + gap).some((d) => d.winter), from: cal.days[c0].iso }); } }
    const calDays = total > 0 ? cal.calOfWork(total - 1) + 1 : 0;
    const cold = tasks.filter((t) => t.d > 0 && (t.pour || t.weather) && t.Tmin < 5);
    const machine = {
      bagger: byId.aushub.d + byId.verf.d + byId.ueber.d + byId.ober.d,
      ruettler: byId.verf.d + byId.ueber.d + byId.sohle.d,
      pours: tasks.filter((t) => t.pour && t.d > 0).reduce((s2, t) => s2 + t.d, 0) + (q.geo.access.length ? 1 : 0),
    };
    return { tasks, byId, total, weeks: calDays / 7, calDays, wh, machine, dates, breaks, cold, crews, state: cal.state, country: cal.country, region: cal.region, noHolidays: cal.noHolidays(), end: total > 0 ? dates[total - 1] : dates[0],
      cure: { strip: byId.aus ? byId.aus.cureWait : null, load: byId.ueber ? cal.calOfWork(byId.ueber.start) - cal.calAfter(byId.d_b.end) + 1 : null, base: CURE } };
  }

  function addWorkdays(date, days) {
    const d = new Date(date.getTime());
    let left = Math.round(days);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    while (left > 0) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) left--;
    }
    return d;
  }

  /* ---------- Stückliste & Kosten ---------- */

  /* Kostenmodell: Firma (Richtpreis inkl. Einbau) oder Eigenleistung (Material + eigene Stunden).
   * Geänderte Materialquellen (Selbstkosten, eigener Beton) wirken auch bei Firmenausführung als Differenz zum Standardmaterial. */
  const CAT_TRADE = { 'Erdarbeiten': 'erde', 'Beton & Schalung': 'schalung', 'Bewehrung': 'bewehrung', 'Abdichtung & Dämmung': 'abdichtung', 'Ausbau & Zugänge': 'ausbau', 'Technik': 'technik', 'Schutztechnik': 'schutz', 'Baustelle': 'baustelle' };
  const MIX_H = 2.5; // Stunden je m³ Baustellenbeton (Beschicken, Mischen, Transport zur Einbaustelle)
  function costModel(p, q) {
    const S = p.self || {}, tr = S.trades || {}, cc = S.concrete || {}, fwc = S.formwork || {}, eq = S.equip || {}, matO = S.mat || {};
    const wage = finite(S.wage) ? max(0, S.wage) : 0;
    // Richtwerte des Programms (Deutschland) auf das Preisniveau des Landes; Projektwerte (Eigenleistung) gelten schon dort
    const PL = BP.laender ? BP.laender.pli(p).value : 1;
    const mixMat = (cc.cementKg || 0) / 1000 * (cc.cementT || 0) + (cc.aggPerM3 || 0) * (cc.aggT || 0) + 2 * PL;
    const concPrice = (cls) => (cc.mode === 'werk' ? cc.werk : cc.mode === 'baustelle' ? mixMat : cls === 'c12' ? cc.c12 : cc.c30);
    const fwMat = (kind) => (fwc.mode === 'holz' ? fwc.board / max(1, fwc.uses) + fwc.extra : fwc.mode === 'vorhanden' ? fwc.extra * 0.5 : fwc.rent) + (kind === 'decke' ? fwc.propsRent : 0);
    const tradeOf = (k, cat) => (M.SPLIT[k] && M.SPLIT[k].t) || CAT_TRADE[cat] || 'baustelle';
    const own = (k, cat) => tr[tradeOf(k, cat)] === 'eigen';
    function unit(k, cat, firm) {
      const s = M.SPLIT[k];
      const m0 = s ? (s.rel ? s.m * firm : s.m * PL) : 0.6 * firm;
      let m = m0;
      if (s && s.conc) m = concPrice(s.conc);
      if (matO[k] != null && finite(matO[k])) m = matO[k];
      if (own(k, cat)) {
        if (s && s.fw && !(matO[k] != null && finite(matO[k]))) m = fwMat(s.fw);
        const h = s ? s.h : 0.4 * firm / (55 * PL);
        return { mode: 'eigen', buy: max(0, m), h, price: max(0, m) + h * wage };
      }
      const buy = max(0, firm + (m - m0));
      return { mode: 'firma', buy, h: 0, price: buy };
    }
    // Baustellenbeton: Tagesleistung gegen Betonierabschnitte
    const capDay = (cc.mixers || 0) * (cc.batchL || 0) / 1000 * (cc.batchesH || 0) * (cc.hoursDay || 0);
    const v = q.vol;
    const pours = [[T_('Bodenplatte'), v.slab], [T_('Wände'), v.outerWalls + v.intStb], [T_('Decke'), v.roof], [T_('Zugänge'), v.access]].filter((x) => x[1] > 1e-6);
    const mix = cc.mode === 'baustelle' ? {
      capDay, pours: pours.map(([n, V]) => ({ name: n, V, days: capDay > 0 ? ceil(V / capDay - 1e-9) : Infinity })),
      mat: mixMat, cementBags: (v.rc + v.blinding) * cc.cementKg / 25, aggT: (v.rc + v.blinding) * cc.aggPerM3,
    } : null;
    if (mix) { mix.over = mix.pours.filter((x) => x.days > 1); mix.days = mix.pours.reduce((s, x) => s + (isFinite(x.days) ? x.days : 0), 0) + (v.blinding > 0 ? 1 : 0); }
    return { S, tr, wage, unit, own, tradeOf, mix, capDay, concPrice, fwMat, eq, cc, PL };
  }

  function bom(p, q) {
    const CM = costModel(p, q), PL = CM.PL;
    // Einzelpreise des Nutzers gelten wie eingegeben, Richtpreise mit dem Preisniveau des Landes
    const price = (k) => (p.prices[k] != null ? p.prices[k] : (M.PRICES[k] ? M.PRICES[k].p * PL : 0));
    const items = [];
    /* Bezeichnung: name bleibt deutsch (Schlüssel der Einkaufsliste, darf sich mit der Sprache nicht ändern), label in der
     * Anzeigesprache. Zusammengesetzte Namen kommen als Funktion und werden einmal deutsch und einmal übersetzt erzeugt. */
    const nameOf = (n) => (typeof n === 'function' ? { name: I18.withLang('de', n), label: n() } : { name: n, label: T_(n) });
    const deOr = (cur, de) => (I18.lang() === 'de' ? de : cur);
    const labelsDe = I18.lang() === 'de' ? q.geo.labels : I18.withLang('de', () => labelsOf(p));
    // Einheiten bleiben deutsch (Schlüssel) und werden bei der Anzeige übersetzt
    const push = (cat, key, name, qty, unit, buyU, hU, note, mode) => {
      if (!(qty > 1e-9)) return;
      const pr = buyU + hU * CM.wage;
      items.push(Object.assign({ cat, key }, nameOf(name), { qty, unit, price: pr, cost: qty * pr, note: note || '', mode, buy: qty * buyU, hours: qty * hU, ownCost: qty * hU * CM.wage, fixed: true }));
    };
    const add = (cat, key, name, qty, unit, note, opt) => {
      if (!(qty > 1e-9)) return;
      const firm = key === 'lueftung' && p.prices.lueftung == null ? q.tech.ventPrice * PL : opt && opt.price != null && p.prices[key] == null ? opt.price * PL : price(key);
      const u = opt && opt.firm ? { mode: 'firma', buy: firm, h: 0, price: firm } : CM.unit(key, cat, firm);
      items.push(Object.assign({ cat, key }, nameOf(name), { qty, unit, price: u.price, cost: qty * u.price, note: note || '', mode: u.mode, buy: qty * u.buy, hours: qty * u.h, ownCost: qty * u.h * CM.wage }));
    };
    const e = q.earth, v = q.vol, fw = q.fw, env = q.env, st = q.steel, t = q.tech, b = p.build, sch = q.schedule;

    add('Erdarbeiten', 'oberboden', N_('Oberboden abtragen und lagern'), e.Vtopsoil > 0 ? e.Astrip : 0, 'm²', T_('{d} m dick', { d: fmt(b.excavation.topsoil) }) + (e.Atoe > e.Atop ? T_(', inkl. Hügelaufstandsfläche, später auf dem Hügel andecken') : ''));
    add('Erdarbeiten', 'aushub', N_('Aushub Baugrube (ohne Oberboden)'), e.Vexc - e.Vtopsoil, 'm³', T_('Tiefe {d} m', { d: fmt(e.depth) }) + (e.k > 0 ? T_(', Böschung {a}°', { a: fmt(e.angle, 0) }) : '') + (e.Vacc > 0 ? T_(', inkl. {v} m³ Zugänge', { v: fmt(e.Vacc, 1) }) : ''));
    add('Erdarbeiten', 'verbau', N_('Baugrubenverbau'), e.shoring, 'm²');
    add('Erdarbeiten', 'abfuhr', N_('Bodenabfuhr'), e.Vloose, 'm³ lose', T_('{n} LKW-Fuhren à 12 m³, Auflockerung {f}', { n: e.trucks, f: fmt(b.excavation.loose) }));
    add('Erdarbeiten', 'kies', N_('Kapillarbrechende Schotterschicht'), e.gravelV, 'm³', fmt(b.gravel * 100, 0) + ' cm');
    add('Erdarbeiten', e.reuse ? 'verfuellung' : 'kies', e.reuse ? N_('Verfüllen mit Aushub, verdichten') : N_('Verfüllen mit Kies, verdichten'), e.Vback, 'm³', e.Vcover > 0 ? T_('davon {v} m³ Erdüberdeckung', { v: fmt(e.Vcover, 1) }) : T_('Arbeitsraum bis Gelände'));
    if (e.Vmound > 0) {
      const mo = q.lv.mound;
      add('Erdarbeiten', 'verfuellung', N_('Erdhügel aufschütten, lagenweise verdichten'), e.Vmound, 'm³', T_('Höhe {h} m über Gelände, Böschung 1 : {n}', { h: fmt(mo.h), n: fmt(mo.n, 1) }) + (e.moundFromSite > 0 ? T_(', {v} m³ aus Aushub', { v: fmt(e.moundFromSite, 1) }) : ''));
      add('Erdarbeiten', 'boden', N_('Boden für Erdhügel liefern'), e.Vimport, 'm³', T_('verdichtungsfähiger Boden, Z0'));
    }
    add('Erdarbeiten', 'drainage', N_('Dränleitung'), env.drainLen, 'm');
    add('Erdarbeiten', 'spuelschacht', N_('Spülschächte'), env.shafts, 'Stk');
    if (sch.wh) add('Erdarbeiten', 'wasserhaltung', N_('Wasserhaltung'), sch.wh.cal != null ? sch.wh.cal : sch.wh.d * 7 / 5, 'Tag', T_('{reason} (Kalendertage)', { reason: sch.wh.reason }));

    const truck = (V) => T_('{n} Fahrmischer', { n: ceil(V / 8) });
    add('Beton & Schalung', 'sauberkeit', N_('Sauberkeitsschicht C12/15'), v.blinding, 'm³');
    add('Beton & Schalung', 'beton', () => T_('Bodenplatte {c}, {t} cm', { c: b.concrete, t: fmt(b.tFloor * 100, 0) }), v.slab, 'm³', truck(v.slab));
    add('Beton & Schalung', 'beton', () => T_('Außenwände {c}, {t} cm', { c: b.concrete, t: fmt(b.tWall * 100, 0) }), v.outerWalls, 'm³', T_('{t} mit Innenwänden', { t: truck(v.outerWalls + v.intStb) }));
    add('Beton & Schalung', 'beton', N_('Innenwände Stahlbeton'), v.intStb, 'm³');
    add('Beton & Schalung', 'beton', () => T_('Decke {c}, {t} cm', { c: b.concrete, t: fmt(b.tRoof * 100, 0) }), v.roof, 'm³', truck(v.roof));
    for (const m of q.geo.mids || []) add('Beton & Schalung', 'beton', () => T_('Zwischendecke über Ebene {n}, {c}, {t} cm', { n: m.idx + 1, c: b.concrete, t: fmt(m.t * 100, 0) }), m.V, 'm³', truck(m.V) + (m.holes > 0 ? T_(', abzüglich {a} m² Treppenaugen und Schächte', { a: fmt(m.holes, 1) }) : ''));
    add('Beton & Schalung', 'beton', () => T_('Stützen {c}', { c: b.concrete }), v.cols, 'm³');
    add('Beton & Schalung', 'beton', () => T_('Unterzüge {c}', { c: b.concrete }), v.beams, 'm³', T_('mit der Platte darüber betoniert'));
    add('Beton & Schalung', 'beton', q.geo.vert.lifts.some((x) => x.toSurface) ? N_('Aufzugsschächte: Grube, Schachtkopf, Schacht zum Gelände und Aufzugshaus') : N_('Aufzugsschächte: Grube, Schachtkopf'), v.lifts, 'm³');
    add('Beton & Schalung', 'beton', N_('Innentreppen Ortbeton'), v.stairs, 'm³', T_(q.geo.vert.stairs.length === 1 ? '{n} Lauf mit Podesten' : '{n} Laufe mit Podesten', { n: q.geo.vert.stairs.length }));
    add('Beton & Schalung', 'beton', N_('Zugangsbauwerke'), v.access, 'm³');
    const pumpMode = CM.eq.pump || 'pumpe';
    if (pumpMode === 'pumpe') add('Beton & Schalung', 'pumpe', N_('Betonpumpe'), sch.machine.pours, 'Einsatz', '', { firm: true });
    if (CM.mix) {
      push('Beton & Schalung', 'mischen', N_('Beton auf der Baustelle mischen'), v.rc + v.blinding, 'm³', 0, MIX_H, T_('Eigenleistung; {bags} Sack Zement à 25 kg, {agg} t Gesteinskörnung', { bags: fmt(CM.mix.cementBags, 0), agg: fmt(CM.mix.aggT, 0) }), 'eigen');
      const rentM = max(0, (CM.cc.mixers || 0) - (CM.cc.ownMixers || 0));
      push('Baustelle', 'mischer', N_('Betonmischer Miete'), rentM * CM.mix.days, 'Tag', CM.cc.mixerRent || 0, 0, T_('{n} Mischer × {d} Betoniertage', { n: rentM, d: CM.mix.days }), 'eigen');
    }
    if (CM.own('beton', 'Beton & Schalung')) push('Baustelle', 'innenruettler', N_('Innenrüttler (Rüttelflasche) Miete'), sch.machine.pours, 'Tag', CM.eq.vibratorRent || 0, 0, T_('je Betoniertag'), 'eigen');
    if (pumpMode === 'kuebel') push('Beton & Schalung', 'kuebel', N_('Betonkübel am Bagger: Einbau'), v.rc, 'm³', 0, 0.3, T_('Bagger mit Kübel statt Pumpe'), 'eigen');
    add('Beton & Schalung', 'schalungWand', N_('Wandschalung'), fw.wallsTotal + fw.access, 'm²');
    add('Beton & Schalung', 'schalungDecke', N_('Deckenschalung'), fw.roof, 'm²');
    add('Beton & Schalung', 'schalungRand', N_('Randschalung Platten'), fw.edges, 'm²');
    const jp = q.verify && q.verify.pours;
    add('Beton & Schalung', 'fugenblech', N_('Fugenblech Arbeitsfugen'), env.joints > 0 && jp ? jp.joints.total : env.joints, 'm', jp && env.joints > 0 ? T_('Sohle–Wand und Wand–Decke je Ebene, {list}', { list: jp.sect.filter((x) => x.n > 1).map((x) => T_('{el} in {n} Abschnitten', { el: elName(x.el), n: x.n })).concat([T_('Zugänge')]).join(', ') }) : '');
    add('Beton & Schalung', 'futterrohr', N_('Futterrohre mit Dichtflansch'), q.routes.hull + p.tech.penetrations, 'Stk', [q.routes.hull ? T_('{n} aus Leitungen', { n: q.routes.hull }) : '', p.tech.penetrations ? T_('{n} weitere', { n: p.tech.penetrations }) : ''].filter(Boolean).join(', '));
    add('Beton & Schalung', 'aussparung', N_('Aussparungen in Innenwänden'), q.routes.inner, 'Stk', T_('aus Leitungen'));

    const dias = Object.keys(st.byDia).map(Number).sort((a, b2) => a - b2);
    const stN = NC.steelName || 'B500B', barN = NC.barName || ((d) => 'Ø' + d);
    for (const d of dias) add('Bewehrung', 'stahl', () => T_('Betonstahl {steel} {bar}', { steel: stN, bar: barN(d) }), st.byDia[d] * (1 + st.waste) / 1000, 't', T_('{kg} kg inkl. 3 % Verschnitt', { kg: fmt(st.byDia[d] * (1 + st.waste), 0) }));
    add('Bewehrung', 'abstandhalter', N_('Abstandhalter, Unterstützungskörbe'), geo2area(q), 'm²');

    const sys = M.WATERPROOFING[b.waterproofing] || M.WATERPROOFING.wu;
    const abdKey = { wu_fbv: 'abd_fbv', pmbc: 'abd_pmbc', bahn: 'abd_bahn' }[b.waterproofing];
    if (abdKey) add('Abdichtung & Dämmung', abdKey, sys.name, env.membrane, 'm²', T_(b.waterproofing === 'pmbc' ? 'Wände, Decke' : 'Wände, Decke, Sohle'));
    if (env.membraneFloor > 0) add('Abdichtung & Dämmung', 'abd_bahn', N_('Abdichtungsbahn unter Sohle'), env.membraneFloor, 'm²');
    add('Abdichtung & Dämmung', 'daemmung', N_('Perimeterdämmung Wände'), env.ins.walls, 'm³', b.insulation.walls ? T_('{a} m² à {t} cm', { a: fmt(env.ins.walls / b.insulation.walls, 1), t: fmt(b.insulation.walls * 100, 0) }) : '');
    add('Abdichtung & Dämmung', 'daemmung', N_('Perimeterdämmung Decke'), env.ins.roof, 'm³', b.insulation.roof ? fmt(env.ins.roof / b.insulation.roof, 1) + ' m²' : '');
    add('Abdichtung & Dämmung', 'daemmung', N_('Perimeterdämmung unter Sohle'), env.ins.floor, 'm³', b.insulation.floor ? fmt(env.ins.floor / b.insulation.floor, 1) + ' m²' : '');
    add('Abdichtung & Dämmung', 'noppenbahn', N_('Noppenbahn / Schutzlage'), env.protect, 'm²');

    const ops = q.geo.L.flatMap((L) => L.openings).filter((o) => !o.invalid && !o.lift);
    add('Ausbau & Zugänge', 'schutztuer', N_('Schutztüren druck-/gasdicht'), ops.filter((o) => o.kind === 'schutztuer').length, 'Stk');
    add('Ausbau & Zugänge', 'innentuer', N_('Innentüren'), ops.filter((o) => o.kind === 'innen').length, 'Stk');
    add('Ausbau & Zugänge', 'luke', N_('Notausstiegsluken'), ops.filter((o) => o.kind === 'luke').length, 'Stk');
    add('Ausbau & Zugänge', 'klappe', N_('Abdeckungen Treppe / Schacht'), q.geo.access.reduce((s, a) => s + (a.hatch || 0) + (a.lid || 0), 0), 'm²');
    add('Ausbau & Zugänge', 'steigeisen', N_('Steigeisen Notausstieg'), q.geo.access.reduce((s, a) => s + (a.rungs || 0), 0), 'Stk');
    add('Ausbau & Zugänge', 'gelaender', N_('Geländer Treppenabgang'), q.geo.access.reduce((s, a) => s + (a.railing || 0), 0), 'm');
    add('Ausbau & Zugänge', 'mauerwerk', N_('Mauerwerk KS nichttragend'), q.finish.mw, 'm²');
    // Aufzüge: Anlage durch Fachfirma (Richtpreis nach Art, Nennlast, Antrieb und Haltestellen), Abnahme durch ZÜS, Schutzabschlüsse
    for (const lf of q.geo.vert.lifts) {
      const v = lf.src, stops = lf.levelBot - lf.levelTop + 1 + (lf.toSurface ? 1 : 0), pr0 = BP.lifts ? BP.lifts.price(v, stops) : { unit: 50000, perStop: 7000 }, pr = { unit: pr0.unit * PL, perStop: pr0.perStop * PL };
      const nm = q.geo.labels['v:' + v.id] || T_('Aufzug'), nmDe = labelsDe['v:' + v.id] || 'Aufzug';
      const liftName = () => {
        const o = { nm: deOr(nm, nmDe), kg: v.payload, n: stops };
        if (v.type === 'personen') return v.drive === 'hydraulik' ? T_('{nm}: Personenaufzug {kg} kg, hydraulisch, {n} Haltestellen', o) : T_('{nm}: Personenaufzug {kg} kg, Seil, maschinenraumlos, {n} Haltestellen', o);
        return v.drive === 'hydraulik' ? T_('{nm}: Lastenaufzug {kg} kg, hydraulisch, {n} Haltestellen', o) : T_('{nm}: Lastenaufzug {kg} kg, Seil, maschinenraumlos, {n} Haltestellen', o);
      };
      items.push(Object.assign({ cat: 'Technik', key: 'aufzug' }, nameOf(liftName), { qty: 1, unit: 'Stk',
        price: pr.unit + pr.perStop * Math.max(0, stops - 2), cost: pr.unit + pr.perStop * Math.max(0, stops - 2), note: T_('Kabine {w} × {d} m, {v} m/s, Richtpreis inkl. Montage und Schachttüren', { w: fmt(v.w), d: fmt(v.d), v: fmt(v.speed, 2) }), mode: 'firma' }));
      items.push(Object.assign({ cat: 'Technik', key: 'aufzug_pruef' }, nameOf(() => T_('{nm}: Prüfung vor Inbetriebnahme (ZÜS)', { nm: deOr(nm, nmDe) })), { qty: 1, unit: 'psch', price: 1500 * PL, cost: 1500 * PL, note: 'BetrSichV', mode: 'firma' }));
      if (lf.toSurface) add('Ausbau & Zugänge', 'schutztuer', () => T_('{nm}: Schutztür vor der Schachttür je Haltestelle im Bunker', { nm: deOr(nm, nmDe) }), lf.levelBot - lf.levelTop + 1, 'Stk', T_('Schacht führt zum Gelände: Schutzhülle an jeder Haltestelle schließen'));
    }
    add('Ausbau & Zugänge', 'trockenbau', N_('Trockenbauwände'), q.finish.tb, 'm²');

    add('Technik', 'lueftung', () => T_('ABC-Lüftungsgerät {s} m³/h mit Handbetrieb', { s: t.ventSize }), t.ventN, 'Stk', T_('Bedarf {q} m³/h', { q: fmt(t.qCo2, 0) }) + (t.ventN > 1 ? T_(', {n} Geräte parallel', { n: t.ventN }) : ''));
    // Luftdurchführungen der Hülle: Explosionsschutzventile bei Luftstoß, Überdruckventile bei ABC-Schutz, sonst Absperrklappen
    const sv = t.svc || {}, HT = BP.haustechnik, vv = sv.valves, hzz = p.hazard || {};
    if (vv && vv.blast) for (const x of vv.list) add('Schutztechnik', x.kind === 'abgas' ? 'esv_abgas' : 'esv', () => T_('Explosionsschutzventil {s} m³/h: {n}', { s: x.size, n: deOr(x.name, x.de) }), x.n, 'Stk', T_('bemessen für {qk} kN/m², Luftmenge {f} m³/h', { qk: fmt(vv.qk, 0), f: fmt(x.flow, 0) }), { price: HT.priceEsv(x.size, x.kind) });
    if (hzz.cb && sv.prot) add('Schutztechnik', 'uev', () => T_('Überdruckventil {s} m³/h, Ansprechdruck {p} Pa', { s: t.ventSize, p: fmt(sv.prot.dp, 0) }), t.ventN, 'Stk', T_('Fortluft im Filterbetrieb'), { price: HT.priceUev(t.ventSize) });
    if (!(vv && vv.blast) && !hzz.cb) add('Technik', 'ventil', N_('Absperrklappen Zu- und Abluft'), 2 * t.ventN, 'Stk', T_('Lüftungsdurchführungen der Hülle'));
    const air = q.routes.groups.filter((gr) => gr.type === 'luft'), cab = q.routes.groups.filter((gr) => gr.type === 'kabel');
    if (air.length) {
      for (const gr of air) add('Technik', 'kanal', () => T_('Lüftungsleitung {l}', { l: gr.label }), Math.round(gr.L * 10) / 10, 'm', [...gr.kinds].join(', '));
      add('Technik', 'formteil', N_('Bögen / Formteile Lüftung'), air.reduce((sm, gr) => sm + gr.bends + 2 * gr.n, 0), 'Stk', T_('inkl. Anschlussstücke'));
    } else add('Technik', 'kanal', N_('Lüftungsleitungen (Schätzung)'), ceil(Math.sqrt(q.geo.A) * 2 + 2 * (q.lv.hM - q.lv.zCeil)), 'm', T_('Leitungswege im Schritt Technik zeichnen'));
    for (const gr of cab) {
      add('Technik', 'trasse', () => T_('Kabeltrasse {l}', { l: gr.label }), Math.round(gr.L * 10) / 10, 'm', [...gr.kinds].join(', '));
      add('Technik', 'kabel', () => ([...gr.cables].length ? T_('Kabel {c}', { c: [...gr.cables].join(', ') }) : T_('Kabel lt. Planung')), Math.round(gr.Lres * 10) / 10, 'm', T_('inkl. Längenreserve'));
    }
    for (const it of q.prot.items) {
      const pr = p.prices[it.key] != null ? p.prices[it.key] : it.price * PL;
      items.push({ cat: 'Schutzaufbau', key: it.key, name: it.de || it.name, label: it.name, qty: it.area, unit: 'm²', price: pr, cost: it.area * pr, note: fmt(it.volume, 2) + ' m³' + (it.mass != null ? ', ' + fmt(it.mass, 2) + ' t' : '') });
    }
    // Schutztechnik nach gewähltem Schutzgrad
    const hz = p.hazard || {}, HZ = 'Schutztechnik';
    const hullPens = q.routes.pens.filter((x) => x.type !== 'innenwand');
    const nDoors = ops.filter((o) => o.kind === 'schutztuer' || o.kind === 'luke').length;
    const nPeople = max(1, p.use.people);
    if (hz.cb) {
      add(HZ, 'abc_filter', N_('ABC-Gasfilter, Ersatzpatrone'), 1, 'Stk', T_('Wechsel nach Einsatz oder Lagerzeit'));
      add(HZ, 'druckmesser', N_('Überdruckmessgerät'), 1, 'Stk', T_('Kontrolle Überdruck gegen Außenluft'));
    }
    if (hz.cb || (p.tech.sewer || 'hebeanlage') !== 'tank') add(HZ, 'klosett', N_('Trockenklosett'), ceil(nPeople / 30), 'Stk', T_('Schutzbetrieb ohne Spülwasser, Richtwert 1 je 30 Personen'));
    if (hz.radiation) add(HZ, 'dosimeter', N_('Dosisleistungsmessgerät'), 1, 'Stk');
    if (hz.fire) {
      add(HZ, 'co_melder', N_('CO- und CO₂-Warnmelder'), 2, 'Stk', T_('Aufenthalt und Technik'));
      add(HZ, 'loescher', N_('Feuerlöscher'), max(2, ceil(q.geo.tot.Anet / 50)), 'Stk');
    }
    if (hz.shock) add(HZ, 'schock', N_('Schocksichere Befestigung der Einbauten'), 1, 'psch', T_('±2 g horizontal, ±4 g vertikal (TWK 2017)'));
    if (hz.emp) {
      add(HZ, 'emp_schirm', N_('EMP-Schirmung Innenflächen'), q.geo.Pin * q.lv.Hint + 2 * q.geo.Ain, 'm²', T_('Wände, Decke, Boden, durchgehend verbunden'));
      add(HZ, 'emp_wabe', N_('Wabenkamin-Filter Lüftungsdurchführungen'), max(2, hullPens.filter((x) => x.rtype === 'luft').length), 'Stk');
      add(HZ, 'emp_netz', N_('EMP-Netzfilter Stromzuführungen'), max(1, hullPens.filter((x) => x.rtype === 'kabel' && x.rkind === 'strom').length), 'Stk');
      add(HZ, 'emp_tuer', N_('Mehrpreis HF-dichte Schutztüren / Luken'), nDoors, 'Stk');
      add(HZ, 'ueberspannung', N_('Blitzstrom- und Überspannungsschutz'), 1, 'Stk');
      add(HZ, 'lwl', N_('Datenanbindung über Lichtwellenleiter'), 1, 'psch', T_('keine metallischen Datenleitungen durch die Hülle'));
      add(HZ, 'erder', N_('Ringerder und Potentialausgleich'), q.geo.P + 4, 'm');
    }
    add('Technik', 'elektro', N_('Elektroinstallation, Beleuchtung'), q.geo.tot.Anet, 'm²');
    add('Technik', 'batterie', N_('Batteriespeicher'), Math.round(t.battery * 10) / 10, 'kWh', T_('{n} Tage Autarkie', { n: fmt(p.tech.batteryDays, 0) }));
    add('Technik', 'wechselrichter', N_('Wechselrichter / Ladegerät'), t.inverter, 'kW');
    add('Technik', 'generator', N_('Notstromaggregat mit Abgasführung'), t.generator, 'kVA');
    add('Technik', 'dieseltank', N_('Kraftstoffvorrat'), Math.round(t.fuel * 1.1), 'L');
    add('Technik', 'tank', N_('Wassertank'), Math.round(t.water), 'L', T_('{n} L Trinkwasser', { n: fmt(t.drink, 0) }));
    add('Technik', 'abwassertank', N_('Abwasser-/Fäkalientank'), Math.round(t.waste), 'L', T_('Schutzbetrieb ohne Kanalanschluss'));
    if (sv.sew && sv.sew.mode === 'hebeanlage') {
      const sw = sv.sew;
      add('Technik', 'hebeanlage', () => T_(sw.double ? 'Doppel-Fäkalienhebeanlage DN {dn}, {q} l/s, Förderhöhe {h} m, 2 × {p} kW' : 'Fäkalienhebeanlage DN {dn}, {q} l/s, Förderhöhe {h} m, {p} kW', { dn: sw.dn, q: fmt(sw.Qp, 1), h: fmt(sw.H, 1), p: fmt(sw.motor, 2) }), 1, 'Stk', T_('DIN EN 12056-4, Rückstauschleife über Gelände'), { price: sw.double ? 7500 : 4000 });
      add('Technik', 'absperr', N_('Absperrschieber Abwasser, gasdicht'), 1, 'Stk', T_('Abwasserleitung durch die Hülle im Schutzbetrieb schließen'));
    }
    if (sv.heat && sv.heat.mode === 'auto' && sv.heat.kW > 0) add('Technik', 'klima', N_('Kühlgerät mit Kältetechnik'), sv.heat.kW, 'kW', T_('Kühllast {c} kW bei {to} °C außen, {ti} °C innen', { c: fmt(sv.heat.cool / 1000, 1), to: fmt(sv.heat.tOut, 0), ti: fmt(sv.heat.tIn, 0) }));
    if (sv.gen) {
      add('Technik', 'abgas', () => T_('Abgasleitung DN {dn} doppelwandig, gedämmt, mit Durchführung', { dn: sv.gen.dnExh }), Math.round((max(0, -q.lv.zFloorTop) + 3 + 6) * 10) / 10, 'm', T_('Mündung mindestens 3 m über Gelände, abseits der Zuluft'));
      if (sv.gen.fuel > 0) add('Technik', 'leckanzeige', N_('Kraftstofftank doppelwandig mit Leckanzeige (Mehrpreis)'), sv.gen.nTanks, 'Stk', T_('AwSV Gefährdungsstufe {s}', { s: sv.gen.stufe }));
    }

    add('Baustelle', 'be', N_('Baustelleneinrichtung'), 1, 'psch');
    const bagDays = sch.machine.bagger + (pumpMode === 'kuebel' ? sch.machine.pours : 0);
    if (!CM.own('aushub', 'Erdarbeiten')) {
      // Firma: Bagger und Rüttelplatte sind in Oberboden-, Aushub- und Verfüllpreisen enthalten; nur der Kübelbetrieb kommt dazu
      if (pumpMode === 'kuebel') add('Baustelle', 'bagger', N_('Bagger mit Fahrer (Betonkübel)'), sch.machine.pours, 'Tag', '', { firm: true });
    } else {
      if (CM.eq.bagger === 'eigen') push('Baustelle', 'bagger_eigen', N_('Eigener Bagger: Diesel, Verschleiß'), bagDays, 'Tag', CM.eq.baggerOwn || 0, 8, T_('Fahrer in Eigenleistung, 8 h/Tag'), 'eigen');
      else push('Baustelle', 'bagger_miete', N_('Bagger ohne Fahrer (Miete)'), bagDays, 'Tag', CM.eq.baggerRent || 0, 8, T_('Fahrer in Eigenleistung, 8 h/Tag'), 'eigen');
      push('Baustelle', CM.eq.ruettler === 'eigen' ? 'ruettler_eigen' : 'ruettler_miete', CM.eq.ruettler === 'eigen' ? N_('Eigene Rüttelplatte: Betrieb') : N_('Rüttelplatte Miete'), sch.machine.ruettler, 'Tag', CM.eq.ruettler === 'eigen' ? (CM.eq.ruettlerOwn || 0) : (CM.eq.ruettlerRent || 0), 0, '', 'eigen');
    }

    const cats = {};
    for (const it of items) cats[it.cat] = (cats[it.cat] || 0) + it.cost;
    const net = items.reduce((s, i) => s + i.cost, 0);
    const buy = items.reduce((s, i) => s + (i.buy != null ? i.buy : i.cost), 0);
    const ownH = items.reduce((s, i) => s + (i.hours || 0), 0), ownCost = items.reduce((s, i) => s + (i.ownCost || 0), 0);
    const c = p.costs;
    const services = servicesOf(p, q);
    const planning = c.planningMode === 'prozent' ? net * c.planning / 100 : services.reduce((s, x) => s + (x.on ? x.amount : 0), 0);
    const reserve = (net + planning) * c.reserve / 100;
    const sumNet = net + planning + reserve;
    const vat = max(0, sumNet - ownCost * (1 + c.reserve / 100)) * c.vat / 100; // keine MwSt. auf Eigenleistung
    const byMode = { firma: items.filter((i) => i.mode !== 'eigen').reduce((s, i) => s + i.cost, 0), eigen: items.filter((i) => i.mode === 'eigen').reduce((s, i) => s + i.cost, 0) };
    return { items, cats, net, buy, ownH, ownCost, byMode, services, planning, reserve, sumNet, vat, gross: sumNet + vat, cm: { mix: CM.mix, capDay: CM.capDay, mixMat: CM.mix ? CM.mix.mat : null } };
  }
  function geo2area(q) { return q.geo.Aslab + q.geo.A + q.fw.wallsTotal; }

  /* Planungsleistungen: leerer Betrag = Richtwert nach Bauwerksgröße. */
  function servicesOf(p, q) {
    const list = Array.isArray(p.costs.services) ? p.costs.services : [];
    const Vrc = q.vol.rc, A = q.geo.A;
    const auto = {
      baugrund: A > 300 ? 3500 : 1800,
      statik: Math.round(max(4000, 70 * Vrc) / 100) * 100,
      pruef: Math.round(0.4 * max(4000, 70 * Vrc) / 100) * 100,
      vermessung: A > 300 ? 1800 : 900,
      bauantrag: Math.round(max(1500, 15 * A) / 100) * 100,
      elektro: A > 300 ? 1500 : 600,
    };
    const PL = BP.laender ? BP.laender.pli(p).value : 1;
    return list.map((s) => ({ id: s.id, name: s.name, on: !!s.on, auto: auto[s.id] != null ? auto[s.id] * PL : 0, amount: finite(s.amount) ? max(0, s.amount) : (auto[s.id] || 0) * PL, manual: finite(s.amount) }));
  }

  /* ---------- Prüfungen ---------- */

  /* Meldungen der weiteren Nachweise (Baugrund, Böschungen, Brandschutz, Treppen, Aufzugsgruben, Fugen) */
  function moreCheckMsgs(q, add) {
    const vf = q.verify, p = q.p, b = p.build, g = q.geo, st = q.struct;
    if (!vf) return;
    // Verfahren bzw. Normen in den Meldungen: Deutschland DIN, sonst die zugrunde liegenden Verfahren
    const REF = NC.ref;
    const pct = (x) => fmt(x * 100, 0) + ' %';
    if (vf.gb && vf.gb.eta > 1) add('err', 'statik', T_('Grundbruch ({ref}): Bemessungslast {vd} kN über Widerstand {rd} kN (μ = {mu}). Sohlfläche vergrößern (Sporn) und Baugrundgutachten einholen.', { ref: REF.gb, vd: fmt(vf.gb.Vd, 0), rd: fmt(vf.gb.Rnd, 0), mu: fmt(vf.gb.eta) }));
    if (vf.set && vf.set.s > vf.set.limit) add('warn', 'statik', T_('Setzung rund {s} cm ({ref}, kennzeichnender Punkt) über 3 cm: Zugänge, Leitungen und Anschlüsse setzungsverträglich ausbilden, Baugrundgutachten.', { ref: REF.set, s: fmt(vf.set.s * 100, 1) }));
    const mo = vf.mound;
    if (mo && !mo.ok) add('err', 'konstruktion', T_('Böschung des Erdhügels 1 : {n} nicht standsicher ({ref}, Gleitkreis, μ = {mu}, {fill}).', { ref: REF.slope, n: fmt(mo.n, 1), mu: fmt(mo.mu), fill: mo.fill.name }) + ' ' + (isFinite(mo.nMin) ? T_('Mindestens 1 : {n} böschen oder besseres Schüttmaterial.', { n: fmt(mo.nMin, 2) }) : T_('Stützbauwerk oder bewehrte Erde nötig.')));
    const ex = vf.exc;
    if (ex && !ex.din4124) {
      if (ex.ok) add('info', 'konstruktion', T_('Baugrubenböschung {a}° bei {d} m Tiefe rechnerisch standsicher ({ref}, μ = {mu}, Auflast 10 kN/m² ab 0,6 m).', { ref: REF.slope, a: fmt(ex.angle, 0), d: fmt(ex.depth), mu: fmt(ex.mu) }));
      else add('err', 'konstruktion', T_('Baugrubenböschung {a}° bei {d} m Tiefe nicht standsicher ({ref}, μ = {mu}; {rule} ohne Nachweis nur bis {dmax} m und {s}°).', { ref: REF.slope, rule: ex.rule.ref, dmax: fmt(ex.rule.dMax, ex.rule.dMax % 1 ? 1 : 0), a: fmt(ex.angle, 0), d: fmt(ex.depth), mu: fmt(ex.mu), s: fmt(ex.rule.angle, 0) }) + ' ' + (ex.angleMax ? T_('Höchstens {a}° böschen oder Verbau.', { a: ex.angleMax }) : T_('Verbau planen.')));
    }
    if (vf.fire) for (const it of vf.fire.items) {
      const ref = it.colId ? { type: 'column', id: it.colId } : it.beamId ? { type: 'beam', id: it.beamId } : undefined;
      const fix = it.bFire ? ' ' + T_('Stütze mindestens {b} × {b} cm.', { b: fmt(it.bFire / 10, 0) }) : '';
      if (!it.dimOk) add('err', 'statik', T_('Feuerwiderstand {cls} ({ref}): {el} – {kind} verlangt mindestens {min} cm, vorhanden {dim} cm.', { ref: REF.fire, cls: vf.fire.cls, el: it.el, kind: it.kind, min: fmt(it.dimMin / 10, 0), dim: fmt(it.dim / 10, 0) }) + fix, ref);
      else if (!it.aOk) add('err', 'statik', T_(vf.fire.cover ? 'Feuerwiderstand {cls}: {el} – Betondeckung der Bewehrung {a} mm, nötig {min} mm.' : 'Feuerwiderstand {cls}: {el} – Achsabstand der Bewehrung {a} mm, nötig {min} mm.', { cls: vf.fire.cls, el: it.el, a: fmt(it.a, 0), min: it.aMin != null ? fmt(it.aMin, 0) : '–' }) + (fix || ' ' + T_('Betondeckung erhöhen oder Querschnitt vergrößern.')), ref);
      if (it.methodA === false) add('warn', 'statik', T_('{el}: Tabellenverfahren für Stützen (Methode A) nicht anwendbar (l0,fi > 3 m, Ausmitte > 0,15 b oder mehr als 4 % Bewehrung) – Heißbemessung durch den Tragwerksplaner.', { el: it.el }), ref);
    }
    for (const s of g.vert.stairs) {
      const d = s.design;
      if (d && !d.ok) add('err', 'statik', T_('{nm}: Laufplatte bis 40 cm nicht nachweisbar (Stützweite {l} m). Zwischenpodest oder Auflager einplanen.', { nm: g.labels['v:' + s.id] || T_('Innentreppe'), l: fmt(s.span) }), { type: 'vert', id: s.id });
    }
    for (const pt of vf.pits || []) {
      const nm = g.labels['v:' + pt.id] || T_('Aufzug'), ref = { type: 'vert', id: pt.id };
      if (!pt.okW) add('warn', 'statik', T_('{nm}: Grubenwände brauchen {as} cm²/m gegen Erd- und Wasserdruck (mehr als Ø12/15). Wand verstärken.', { nm, as: fmt(pt.asW, 1) }), ref);
      if (!pt.okS) add('warn', 'statik', T_('{nm}: Grubensohle braucht {as} cm²/m gegen Wasserdruck (mehr als Ø12/15).', { nm, as: fmt(pt.asS, 1) }), ref);
      if (pt.uplift > 1) add('info', 'statik', T_('{nm}: Grubensohle allein nicht auftriebssicher (η = {eta}); sie wird über die Schachtwände an das Bauwerk angeschlossen, Bewehrung durchführen.', { nm, eta: fmt(pt.uplift) }), ref);
      if (!pt.okSig) add('warn', 'statik', T_('{nm}: Sohldruck unter der Grube aus Pufferkräften {sig} kN/m² über {rd} kN/m².', { nm, sig: fmt(pt.sig, 0), rd: fmt(pt.sigRd, 0) }), ref);
    }
    const po = vf.pours;
    if (po && po.long) add('warn', 'konstruktion', T_('Bauwerk {l} m lang: Zwang über die ganze Länge mit Bewehrung aufnehmen oder druckstoßfeste Bewegungsfuge planen (Fugen im Schutzbau nur mit Nachweis).', { l: fmt(po.Lmax, 1) }));
    if (po && b.restraint === 'massnahmen') add('info', 'konstruktion', T_('Zwang über Fugen: {list} (Wände ≤ {w} m, Platten ≤ {s} m). Betonierfolge und Nachbehandlung mit dem Fachplaner festlegen.', { list: po.sect.map((x) => T_(x.n === 1 ? '{el} {n} Abschnitt' : '{el} {n} Abschnitte', { el: elName(x.el), n: x.n })).join(', '), w: po.LmaxWall, s: po.LmaxSlab }));
    for (const c of st.columns || []) for (const pu of [c.punch, c.punchBelow]) if (pu && pu.openings > 0) add('info', 'statik', T_('{nm}: Aussparung im Durchstanzbereich – wirksamer Rundschnitt um {p} gemindert ({ref}).', { nm: g.labels['c:' + c.id] || T_('Stütze'), p: pct(pu.uLoss), ref: NC.ref.punchOpen }), { type: 'column', id: c.id });
  }

  function checks(p, q) {
    const out = [];
    const add = (level, step, text, ref) => out.push(ref ? { level, step, text, ref } : { level, step, text });
    const g = q.geo, st = q.struct, b = p.build;
    const zeroEdges = g.out.map((pt, i) => (G.dist(pt, g.out[(i + 1) % g.n]) < 1e-6 ? i + 1 : 0)).filter(Boolean);
    if (zeroEdges.length) add('err', 'grundriss', T_('Außenkante {e} hat keine Länge: zwei Eckpunkte liegen aufeinander. Unter „Eckpunkte einzeln bearbeiten“ korrigieren oder eine Grundform neu wählen.', { e: zeroEdges.join(', ') }));
    else if (!g.valid) add('err', 'grundriss', T_('Die Außenwanddicke ist größer als der Grundriss erlaubt. Kontur vergrößern oder Wand dünner machen.'));
    if (!q.lv.water.known) add('warn', 'standort', T_('Bemessungswasserstand fehlt. Rechnung läuft ohne Grundwasser – Auftrieb und Wasserdruck sind damit nicht abgedeckt.'));
    // Betondeckung gegen den Mindestwert der Norm (erdberührte Außenbauteile, XC4; ACI: 50 mm erdberührt)
    if (NC.coverMin) {
      const cv = NC.coverMin();
      if (b.cnom * 1000 < cv.min - 1e-6) add('warn', 'material', T_('Betondeckung {c} mm unter dem Mindestwert {min} mm nach {doc} ({note}).', { c: fmt(b.cnom * 1000, 0), min: cv.min, doc: cv.ref, note: T_(cv.note) }));
    } else if (NC.cmin && NC.dcdev != null) {
      const cMin = NC.cmin.XC4 + NC.dcdev;
      if (b.cnom * 1000 < cMin - 1e-6) add('warn', 'material', T_('Betondeckung {c} mm unter dem Mindestwert nach {doc}: cnom = cmin,dur + Δcdev = {min} mm (XC4, erdberührt).', { c: fmt(b.cnom * 1000, 0), doc: NC.docs ? NC.docs[1] : 'EN 1992-1-1', min: cMin }));
    }
    if (!p.site.lat) add('info', 'standort', T_('Kein Standort gesetzt. Für Grundwasser-Referenzwerte Adresse suchen.'));
    if (!g.access.length) add('err', 'grundriss', T_('Kein Zugang geplant. Treppe oder Schacht an eine Außenwand setzen.'));
    const exits = g.access.length;
    if (exits === 1) add('warn', 'grundriss', T_('Nur ein Zugang. Ein Notausstieg als zweiter Rettungsweg fehlt.'));
    const refOf = (o) => (o.access ? { type: 'access', id: o.access } : o.lift ? { type: 'vert', id: o.lift } : { type: 'opening', id: o.id });
    const allOps = g.L.flatMap((L) => L.openings);
    allOps.filter((o) => o.invalid).forEach((o) => add('err', 'grundriss', openingLabel(g, o) + ': ' + o.invalid + '.', refOf(o)));
    allOps.filter((o) => o.shifted && !o.invalid && !o.access && !o.lift).forEach((o) => add('info', 'grundriss', T_('{o} wurde in den gültigen Wandbereich verschoben.', { o: openingLabel(g, o) }), refOf(o)));
    const okOps = allOps.filter((o) => !o.invalid);
    okOps.forEach((o, i) => okOps.slice(i + 1).forEach((o2) => {
      if (o.access && o2.access) return; // zwei Zugänge: Meldung kommt bei den Zugangsbauwerken
      if (o2.host !== o.host || Math.min(o.pos + o.w / 2, o2.pos + o2.w / 2) - Math.max(o.pos - o.w / 2, o2.pos - o2.w / 2) < 0.01) return;
      if (Math.min(o.sill + o.h, o2.sill + o2.h) - Math.max(o.sill, o2.sill) < 0.01) return;
      add('err', 'grundriss', T_('{a} und {b} überschneiden sich.', { a: openingLabel(g, o), b: openingLabel(g, o2) }), refOf(o2.access ? o : o2));
    }));
    g.L.flatMap((L) => L.walls).filter((w) => !w.auto && w.len < 0.05).forEach((w) => add('warn', 'grundriss', T_('{w} liegt außerhalb des Innenraums.', { w: wallLabel(g, w.id) }), { type: 'wall', id: w.id }));
    g.access.filter((a) => a.kind === 'treppe' && a.w < 0.8).forEach(() => add('warn', 'grundriss', T_('Treppe schmaler als 80 cm.')));
    g.access.filter((a) => a.kind === 'treppe' && a.opening.w < a.w - 1e-6).forEach((a) => add('err', 'grundriss', T_('{a}: Außenwandkante zu kurz, Tür nur {w} cm breit.', { a: accessLabel(g, a.id), w: fmt(a.opening.w * 100, 0) }), { type: 'access', id: a.id }));
    // Zugangsbauwerke (bei Hügel samt Einschnitt bis zum Fuß) dürfen weder das Bauwerk noch einander schneiden
    p.geom.access.filter((a) => !g.access.some((x) => x.id === a.id)).forEach((a) => add('err', 'grundriss', T_('{a} liegt auf keiner gültigen Außenkante und wird nicht berücksichtigt, bis die Kontur korrigiert ist.', { a: accessLabel(g, a.id) })));
    const footOf = (a, len) => { const m = 0.01, at = (du, dn) => G.add(G.add(a.C, G.mul(a.u, du)), G.mul(a.nn, dn)); return [at(-a.W / 2 + m, m), at(a.W / 2 - m, m), at(a.W / 2 - m, len - m), at(-a.W / 2 + m, len - m)]; };
    const feet = g.access.map((a) => ({ a, poly: footOf(a, a.kind === 'treppe' ? a.Lcut : a.D) }));
    feet.filter((f) => G.polygonsOverlap(f.poly, g.out)).forEach(({ a }) => {
      const cutOnly = a.kind === 'treppe' && a.Lcut > a.L + 1e-6 && !G.polygonsOverlap(footOf(a, a.L), g.out);
      add('err', 'grundriss', T_(cutOnly ? '{a}: Der Einschnitt durch den Erdhügel bis zum Hügelfuß führt durch das Bauwerk.' : '{a} ragt in das Bauwerk.', { a: accessLabel(g, a.id) }) + ' ' + T_('An eine freie Außenkante setzen.'), { type: 'access', id: a.id });
    });
    feet.forEach((f, i) => feet.slice(i + 1).filter((f2) => G.polygonsOverlap(f.poly, f2.poly)).forEach((f2) => add('err', 'grundriss', T_(q.lv.mound.on ? '{a} und {b} überschneiden sich (einschließlich Einschnitt durch den Erdhügel).' : '{a} und {b} überschneiden sich.', { a: accessLabel(g, f.a.id), b: accessLabel(g, f2.a.id) }), { type: 'access', id: f2.a.id })));
    g.access.filter((a) => a.kind === 'schacht' && (a.opening.w < 0.6 || a.opening.h < 0.8)).forEach((a) => add('warn', 'grundriss', T_('{a}: Luke kleiner als 60 × 80 cm.', { a: accessLabel(g, a.id) }), { type: 'access', id: a.id }));
    // Entferntester Punkt im Innenraum zum nächsten Zugang (Luftlinie, untere Schranke des Laufwegs)
    const exitPts = g.access.filter((a) => a.opening && !a.opening.invalid).map((a) => G.lerp(a.opening.p0, a.opening.p1, 0.5));
    if (g.valid && exitPts.length) {
      const bi = G.bbox(g.inner), sp = max(0.5, Math.sqrt(g.Ain / 4000));
      let far = 0;
      for (let x = bi.x0 + sp / 2; x < bi.x1; x += sp) {
        for (let y = bi.y0 + sp / 2; y < bi.y1; y += sp) {
          const pt = { x, y };
          if (G.pointInPolygon(pt, g.inner)) far = max(far, exitPts.reduce((m, e) => min(m, G.dist(pt, e)), Infinity));
        }
      }
      g.exitFar = far;
      if (far > 35) add('warn', 'grundriss', T_('Der entfernteste Punkt im Schutzraum liegt {d} m Luftlinie vom nächsten Zugang. Für Räumung und Rettung einen weiteren Zugang oder Notausstieg vorsehen (Orientierung: Rettungswege in Arbeitsstätten höchstens 35 m).', { d: fmt(far, 0) }));
    }
    // Abhilfe: rechnerisch nötige Dicke oder kürzere Spannweite
    const fix = (d, what) => d && d.hReq ? (isFinite(d.hReq) ? ' ' + T_('Abhilfe: {what} ≥ {h} cm oder Spannweite mit tragender Innenwand verkürzen.', { what, h: fmt(d.hReq * 100, 0) }) : ' ' + T_('Abhilfe: Spannweite mit tragender Innenwand verkürzen.')) : '';
    if (st.fe && st.fe.pending) add('info', 'statik', T_('Finite-Elemente-Berechnung der Platten läuft; bis dahin vorläufige Werte aus dem Tafelverfahren.'));
    if (st.roof && st.roof.fail) add('err', 'statik', T_('Decke: Querschnitt reicht nicht (Druckzone überlastet).') + (fix(st.roof, T_('Decke')) || ' ' + T_('Decke dicker machen oder tragende Innenwand einziehen.')));
    if (st.floor && st.floor.fail) add('err', 'statik', T_('Bodenplatte: Querschnitt reicht nicht.') + (fix(st.floor, T_('Bodenplatte')) || ' ' + T_('Platte dicker machen oder Spannweite verkürzen.')));
    const midFix = ' ' + T_('Abhilfe: Zwischendecke dicker, tragende Wand oder Stützen darunter, oder Wände darüber über tragende Wände der Ebene darunter stellen.');
    for (const m of st.mids || []) if (m.fail) add('err', 'statik', T_('{n}: Querschnitt reicht nicht (Druckzone überlastet).', { n: elName(m.name) }) + midFix);
    if (st.wall.fail) add('err', 'statik', T_('Außenwand: Querschnitt reicht nicht für den Erddruck. Wand dicker machen.'));
    else if (st.wall.crackFail) add('err', 'statik', T_('Außenwand: Rissbreite unter Gebrauchslast mit Stäben bis Ø25/10 cm nicht einzuhalten. Wand dicker machen.'));
    [[T_('Decke'), st.roof], [T_('Bodenplatte'), st.floor]].concat((st.mids || []).map((m) => [elName(m.name), m])).forEach(([n, d]) => {
      if (!d) return;
      if (d.crackFail && !d.fail) add('err', 'statik', T_('{n}: Rissbreite unter Gebrauchslast mit Stäben bis Ø25/10 cm nicht einzuhalten.', { n }) + (d.mid ? midFix : fix(d, n)));
      if (d.method === 'FE') {
        const lk = d.shear.links;
        if (d.shearFail) add('err', 'statik', T_('{n}: Querkraft auch mit Querkraftbewehrung nicht aufnehmbar (Druckstrebe, η = {eta}).', { n, eta: fmt(d.shear.links && d.shear.links.zones.length ? max(...d.shear.links.zones.map((z) => z.vEd / z.vRdMax)) : d.shear.eta) }) + (fix(d, n) || ' ' + T_('Platte dicker machen oder Spannweite verkürzen.')));
        else if (lk) add('warn', 'statik', T_(lk.zones.length === 1 ? '{n}: Querkraftbewehrung nötig in {k} Bereich (bis {a} cm²/m²). Aufwendig im Einbau – eine dickere Platte oder eine zusätzliche tragende Wand vermeidet sie.' : '{n}: Querkraftbewehrung nötig in {k} Bereichen (bis {a} cm²/m²). Aufwendig im Einbau – eine dickere Platte oder eine zusätzliche tragende Wand vermeidet sie.', { n, k: lk.zones.length, a: fmt(Math.max(...lk.zones.map((z) => z.asw)), 1) }));
      } else if (d.shear.eta > 1) add('err', 'statik', T_('{n}: Querkraft ohne Schubbewehrung überschritten (η = {eta}), auch mit erhöhter Längsbewehrung.', { n, eta: fmt(d.shear.eta) }) + (d.fail || d.crackFail ? '' : fix(d, n)));
      if (d.defl.eta > 1) add('warn', 'statik', d.defl.method === 'FE' ? T_('{n}: Durchbiegung (Langzeit, gerissen) etwa {w} mm, mehr als l/250 = {lim} mm. Platte dicker, Spannweite verkürzen oder genaueren Nachweis führen.', { n, w: fmt(d.defl.w * 1000, 0), lim: fmt(d.defl.lim * 1000, 0) })
        : T_('{n}: Biegeschlankheit l/d = {ld} über {lim}. Durchbiegung genauer nachweisen oder Platte dicker.', { n, ld: fmt(d.defl.ld, 1), lim: fmt(d.defl.lim, 1) }));
    });
    if (st.wall.shear.eta > 1) add('err', 'statik', T_('Außenwand: Querkraft am Wandfuß überschritten (η = {eta}).', { eta: fmt(st.wall.shear.eta) }));
    st.intWalls.filter((w) => w.etaS > 1).forEach((w) => add('err', 'statik', T_('{w}: Normalkraft zu hoch.', { w: w.auto ? T_('Schachtwand {lift} (E{n})', { lift: g.labels['v:' + w.auto] || T_('Aufzug'), n: w.level + 1 }) : wallLabel(g, w.id) }), w.auto ? { type: 'vert', id: w.auto } : { type: 'wall', id: w.id }));
    levelChecks(p, q, add);
    columnChecks(p, q, add);
    liftChecks(p, q, add);
    if (st.bearing.eta > 1) add('err', 'statik', T_('Sohldruck {e} kN/m² über Sohlwiderstand {r} kN/m².', { e: fmt(st.bearing.sigEd, 0), r: fmt(st.bearing.sigRd, 0) }));
    if (st.buoyancy.relevant) {
      if (st.buoyancy.final.eta > 1) add('err', 'statik', T_('Auftrieb im Endzustand nicht gesichert (η = {eta}).', { eta: fmt(st.buoyancy.final.eta) }) + ' ' + (isFinite(st.buoyancy.coverMin) ? T_('Erdüberdeckung ≥ {c} m oder Sporn an der Bodenplatte.', { c: fmt(st.buoyancy.coverMin) }) : T_('Sporn oder Auftriebsanker nötig.')));
      if (st.buoyancy.bau.eta > 1) add('warn', 'ablauf', T_('Rohbau ohne Überdeckung schwimmt auf (η = {eta}). Wasserhaltung bis zur Erdüberdeckung betreiben.', { eta: fmt(st.buoyancy.bau.eta) }));
    }
    const wuSys = b.waterproofing === 'wu' || b.waterproofing === 'wu_fbv';
    const pressing = st.buoyancy.relevant || p.site.waterMode === 'gok';
    if (wuSys && b.tWall < 0.24) add('warn', 'konstruktion', T_('Außenwand unter 24 cm – unter der Mindestdicke der WU-Richtlinie für drückendes Wasser.'));
    if (wuSys && b.tFloor < 0.25) add('warn', 'konstruktion', T_('Bodenplatte unter 25 cm – unter der Mindestdicke der WU-Richtlinie für drückendes Wasser.'));
    if (b.waterproofing === 'pmbc' && pressing) {
      const imm = finite(q.lv.zW) ? q.lv.zW - q.lv.zInsBot : 0;
      const deW = p.site.country === 'DE';
      add(imm > 3 ? 'err' : 'warn', 'konstruktion', deW ? T_(imm > 3 ? 'PMBC ist bei mehr als 3 m Eintauchtiefe nicht zulässig (DIN 18533, W2.2-E).' : 'PMBC bei drückendem Wasser nur bis 3 m Eintauchtiefe (W2.1-E).')
        : T_(imm > 3 ? 'PMBC bei mehr als 3 m Eintauchtiefe nicht verwenden (Anhalt: DIN 18533, W2.2-E); Regeln des Landes prüfen.' : 'PMBC bei drückendem Wasser nur bis 3 m Eintauchtiefe (Anhalt: DIN 18533, W2.1-E).'));
    }
    if (b.drainage && pressing) add('warn', 'konstruktion', T_('Dränage ersetzt keine Grund-/Druckwasserabdichtung. Zulässige Ableitung und Rückstau prüfen.'));
    if (!M.SOILS[p.site.soil] || !M.SOILS[p.site.soil].permeable) {
      if (p.site.waterMode === 'keins' || p.site.waterMode === 'unbekannt') add('warn', 'standort', T_('Bindiger Boden: Sickerwasser kann sich im Arbeitsraum aufstauen. Wasserstand „bis Gelände“ prüfen oder Dränage planen.'));
    }
    moreCheckMsgs(q, add);
    if (b.cover < 0.5) add('warn', 'konstruktion', T_('Erdüberdeckung unter 50 cm: wenig Schutz gegen Frost, Hitze und Strahlung.'));
    // Kosten / Eigenleistung
    const S = p.self || {}, cc = S.concrete || {}, bm = q.bom;
    const own = (t) => S.trades && S.trades[t] === 'eigen';
    if (cc.mode === 'baustelle') {
      const mx = bm.cm.mix;
      const uek2 = (M.CONCRETE[b.concrete] || M.CONCRETE['C30/37']).fck >= 30 || wuSys;
      add(uek2 ? 'err' : 'warn', 'material', T_(wuSys ? 'Baustellenbeton für {c} als WU-Beton' : 'Baustellenbeton für {c}', { c: b.concrete }) + T_(uek2 ? ': fällt in Überwachungsklasse 2 und braucht die Überwachung durch eine anerkannte Stelle (DIN 1045-3).' : ': Überwachungsklasse 1, Eigenüberwachung nach DIN 1045-3.') + ' ' + T_('Mit Freifallmischern ist w/z-Wert und Gleichmäßigkeit nicht verlässlich einzuhalten – für Bodenplatte, Wände und Decke Transportbeton verwenden.'));
      for (const x of mx.over) add('err', 'material', T_(isFinite(x.days) ? '{name}: {v} m³ in einem Zug, Mischleistung nur {cap} m³/Tag – {d} Tage, also ungeplante Arbeitsfugen.' : '{name}: {v} m³ in einem Zug, Mischleistung nur {cap} m³/Tag – keine Mischer angesetzt.', { name: x.name, v: fmt(x.V, 1), cap: fmt(mx.capDay, 1), d: x.days }));
    }
    if (cc.mode === 'werk') add('info', 'material', p.site.country === 'DE' ? T_('Eigenes Betonwerk: Konformitätsnachweis und werkseigene Produktionskontrolle (DIN EN 206 / DIN 1045-2) für {c} nötig, Lieferscheine je Betonage.', { c: b.concrete })
      : T_('Eigenes Betonwerk: Konformitätsnachweis und werkseigene Produktionskontrolle ({std}) für {c} nötig, Lieferscheine je Betonage.', { c: b.concrete, std: NC.code === 'ACI' ? 'ACI 301 / ASTM C94' : NC.code === 'SIA' ? 'SN EN 206' : T_('EN 206 mit nationaler Anwendungsnorm') }));
    if (S.equip && S.equip.pump === 'rutsche') add('warn', 'material', T_('Ohne Pumpe: Fahrmischer-Rutsche reicht nur etwa {r} m. Jede Betonierstelle, besonders die Decke, muss so erreichbar sein – sonst Kübel am Bagger oder Pumpe.', { r: fmt(S.equip.chuteReach || 6, 0) }));
    if (S.equip && S.equip.pump === 'kuebel') add('info', 'material', T_('Betonieren mit Kübel am Bagger: langsam (ca. 5–10 m³/h). Fahrmischer-Standzeiten und Einbau in Lagen planen.'));
    if (own('technik')) add('warn', 'material', T_('Elektro in Eigenleistung: Anschluss, Prüfung und Inbetriebnahme nach VDE 0100 nur durch eine eingetragene Elektrofachkraft.'));
    if (own('bewehrung')) add('info', 'material', T_('Bewehrung in Eigenleistung: Abnahme durch den Tragwerksplaner vor jeder Betonage einplanen.'));
    if (bm.ownH > 0) add('info', 'material', T_('Eigenleistung: {h} Stunden (≈ {d} Personentage)', { h: fmt(bm.ownH, 0), d: fmt(bm.ownH / 8, 0) }) + (S.wage > 0 ? T_(', bewertet mit {w} {cur}/h.', { w: fmt(S.wage * (BP.laender ? BP.laender.fx() : 1), 0), cur: BP.laender ? BP.laender.sym() : '€' }) : T_(', mit 0 {cur}/h bewertet.', { cur: BP.laender ? BP.laender.sym() : '€' })));
    if (p.costs.planningMode !== 'prozent' && !bm.services.some((s) => s.on && s.id === 'statik')) add('warn', 'material', T_('Keine Tragwerksplanung angesetzt. Das Tool liefert nur eine Vorbemessung – Statik mit Bewehrungsplänen ist für Bau und Bauantrag nötig.'));
    const mo = q.lv.mound;
    if (mo.on) {
      if (mo.n < 1.5 - 1e-9) add('warn', 'nutzung', T_('Hügelböschung 1 : {n} steiler als 1 : 1,5 – Standsicherheit der Schüttung nachweisen ({ref}). Für Begrünung und Mähen besser 1 : 2 oder flacher.', { n: fmt(mo.n, 1), ref: NC.ref.slope }));
      if (mo.crest < b.cover - 1e-9) add('warn', 'nutzung', T_('Kronenüberstand {c} m kleiner als die Erdüberdeckung {d} m – seitlich an der Deckenkante liegt weniger Erde als oben.', { c: fmt(mo.crest), d: fmt(b.cover) }));
      if (-q.lv.zPit < 0.8) add('warn', 'konstruktion', T_('Gründungssohle nur {d} m unter Gelände – frostfreie Gründung (meist ≥ 0,80 m) mit Frostschürze oder tieferer Lage sicherstellen.', { d: fmt(-q.lv.zPit) }));
      add('info', 'nutzung', T_('Erdhügel {h} m hoch, Fuß {t} m vor der Außenwand. Aufschüttungen sind je nach Landesbauordnung ab bestimmter Höhe bzw. Fläche genehmigungspflichtig – mit dem Bauamt klären.', { h: fmt(mo.h), t: fmt(mo.toe, 1) }));
      if (mo.fill === 'aushub' && q.earth.Vimport > 0.5) add('info', 'nutzung', T_('Aushub reicht nicht für den Hügel: {v} m³ Boden müssen geliefert werden.', { v: fmt(q.earth.Vimport, 0) }));
    }
    if (q.earth.waterInPit) add('info', 'ablauf', T_('Baugrubensohle liegt {h} m unter dem Wasserstand – Wasserhaltung eingeplant.', { h: fmt(q.earth.waterHead) }));
    if (!finite(q.tech.qCo2)) add('err', 'technik', T_('CO₂-Zielwert innen muss über dem CO₂-Wert außen liegen – Luftbedarf nicht bestimmbar.'));
    if (q.tech.tLimit < 4) add('warn', 'technik', T_('Ohne Lüftung ist die CO₂-Grenze nach {t} h erreicht. Handbetrieb der Lüftung vorsehen.', { t: fmt(q.tech.tLimit, 1) }));
    const sv = q.tech.svc;
    if (sv) {
      const hb = sv.heat, gn = sv.gen;
      if (hb && hb.cool > 50 && hb.mode === 'keine') add('warn', 'technik', T_('Wärmelast {l} kW übersteigt die Abgabe an Erdreich und Lüftung um {c} kW – der Raum wird wärmer als {t} °C. Kühlgerät einplanen oder Belegung verringern.', { l: fmt(hb.load / 1000, 1), c: fmt(hb.cool / 1000, 1), t: fmt(hb.tIn, 0) }));
      if (hb && hb.mode === 'auto' && hb.kW > 0) add('info', 'technik', T_('Kühlgerät {k} kW eingeplant ({e} kW elektrisch, am Aggregat). Rückkühler außen mit gasdichten, druckstoßfesten Durchführungen oder Kühlung über Wasser/Erdreich.', { k: fmt(hb.kW, 1), e: fmt(hb.elec / 1000, 1) }));
      if (gn && gn.loc === 'innen') add('info', 'technik', T_('Notstromaggregat im Maschinenraum: {q} m³/h Verbrennungs- und Kühlluft über eigene Durchführungen, getrennt von der Schutzlüftung; Abgas DN {dn} mit Mündung mindestens 3 m über Gelände.', { q: fmt(gn.intake, 0), dn: gn.dnExh }));
      if (gn && gn.stufe !== 'A') add('warn', 'technik', T_('Kraftstoffvorrat {f} L: Gefährdungsstufe {s} nach AwSV – Anzeige bei der Unteren Wasserbehörde und Prüfung durch Sachverständige klären; doppelwandiger Tank mit Leckanzeige.', { f: fmt(gn.fuel, 0), s: gn.stufe }));
      if (sv.prot && !sv.prot.hand) add('info', 'technik', T_('Filterbetrieb {q} m³/h: Handbetrieb reicht nur für einen Teil der Luftmenge – Lüftung im Schutzbetrieb über Notstrom versorgen.', { q: fmt(sv.prot.qF, 0) }));
      if (sv.sew && sv.sew.mode === 'tank') add('info', 'technik', T_('Abwasser nur in den Sammeltank: {l} L je Tag, Abfuhr im Normalbetrieb regeln.', { l: fmt(sv.sew.perDay, 0) }));
      const eqv = q.verify && q.verify.eq;
      if (eqv) {
        if (eqv.mapped) add('info', 'standort', T_('Erdbeben: Kombination aus Baugrundklasse und Untergrund ist in DIN EN 1998-1/NA nicht vorgesehen – gerechnet mit {k}.', { k: eqv.key }));
        if (!eqv.required) add('info', 'standort', T_('Erdbeben ({z}): nach {ref} nicht gefordert ({why}) – Ergebnisse nur zur Information.', { z: eqv.label, ref: NC.ref.seis, why: (eqv.why ? T_(eqv.why) : '') }));
        if (eqv.assumed) add('warn', 'standort', T_('Erdbebenzone nach SIA 261 nicht gewählt – gerechnet mit Z1a (ganze Schweiz mindestens Z1a). Zone am Standort prüfen.'));
        if (eqv.applies === false) add('info', 'standort', T_('Im Land ist EN 1998-1 für übliche Hochbauten nicht vorgeschrieben; gerechnet mit den EN-Empfehlungswerten und dem eingegebenen agR.'));
        if (eqv.kind === 'ASCE7' && eqv.sd1 == null) add('info', 'standort', T_('SD1 fehlt: Seismic Design Category nur aus SDS bestimmt ({sdc}).', { sdc: eqv.sdc }));
        if (eqv.wallEta > 1) add(eqv.required ? 'err' : 'info', 'statik', T_('Erdbeben ({z}): Außenwände reichen in der Erdbebenkombination nicht (η = {eta}) – Wandbewehrung oder Wanddicke erhöhen.', { z: eqv.label, eta: fmt(eqv.wallEta, 2) }));
        if (eqv.slideEta > 1) add(eqv.required ? 'warn' : 'info', 'statik', T_('Erdbeben: Trägheitskraft {f} kN übersteigt die Reibung in der Sohlfuge ({r} kN). Erdwiderstand der Seitenwände ansetzen bzw. nachweisen.', { f: fmt(eqv.F, 0), r: fmt(eqv.Rf, 0) }));
        if (eqv.liq) add('info', 'standort', T_('Erdbeben mit Grundwasser in Sand/Schluff: Verflüssigung nach {ref} im Baugrundgutachten prüfen lassen.', { ref: NC.ref.liq }));
      }
      for (const r of (q.blastDyn && q.blastDyn.rows) || []) if (!r.ok) add(r.twk ? 'warn' : 'info', r.twk ? 'statik' : 'schutz', T_('{el}, {load}: dynamisch {what} (Einmassenschwinger).', { el: r.el, load: r.load, what: r.collapse ? T_('kein Gleichgewicht (Widerstand reicht nicht)') : [r.okMu ? '' : T_('Duktilität μ = {mu} > 3', { mu: fmt(r.mu, 1) }), r.okTheta ? '' : T_('Auflagerdrehwinkel θ = {t}° > 2°', { t: fmt(r.theta, 1) }), r.okV ? '' : T_('Querkraft {v} > {c} kN/m', { v: fmt(r.vEd, 0), c: fmt(r.vCap, 0) })].filter(Boolean).join(', ') }));
      for (const e of q.tech.equip || []) if (!e.fits) add('warn', 'technik', T_(e.overlap ? '{name} ({n} × {l} × {b} m) passt nicht in „{room}“. Größeren Raum wählen oder den Raum vergrößern – die Last ist auf der verfügbaren Fläche angesetzt und überdeckt dort andere Einbauten (Lasten addiert).' : '{name} ({n} × {l} × {b} m) passt nicht in „{room}“. Größeren Raum wählen oder den Raum vergrößern – die Last ist auf der verfügbaren Fläche angesetzt.', { name: e.name, n: fmt(e.n > 1 ? e.n : 1, 0), l: fmt(e.L, 2), b: fmt(e.B, 2), room: roomName(e.room) }));
      const eqUp = (q.tech.equip || []).filter((e) => e.level < q.geo.L.length - 1);
      if (eqUp.length) add('info', 'statik', T_('Auf Zwischendecken stehen {list} – im Plattenmodell als Flächenlasten berücksichtigt. Schwere Tanks und Aggregate möglichst auf die Bodenplatte stellen.', { list: eqUp.map((e) => e.name + ' (' + fmt(e.gk + e.ek, 1) + ' kN/m²)').join(', ') }));
    }
    const allRooms = g.L.flatMap((L) => L.rooms).filter((r) => !r.shaft);
    const named = allRooms.filter((r) => !/^Raum \d+$/.test(r.name)).length;
    if (allRooms.length > named) add('info', 'grundriss', T_(allRooms.length - named === 1 ? '{n} Raum ohne Namen.' : '{n} Räume ohne Namen.', { n: allRooms.length - named }));
    for (const r of q.routes.list) for (const is of r.issues) add(is.level, 'technik', T_('„{name}“: {text}', { name: r.src.name, text: is.text }));
    for (const gp of q.prot.gaps) add('warn', 'schutz', gp);
    for (const cp of Object.values(q.prot.comps)) {
      if (cp.deviates) add('info', 'schutz', T_('{name}: Betonschichten {c} cm, Konstruktion {b} cm.', { name: T_(cp.def.name), c: fmt(cp.concrete * 100, 1), b: fmt(cp.buildT * 100, 1) }));
      if (cp.key === 'decke' && cp.c.layers.some((l) => l.material === 'earth')) add('info', 'schutz', T_('Decke: Erdschicht im Schutzaufbau wird nicht zusätzlich gerechnet. Erde über der Decke zählt über die Erdüberdeckung (Schritt Nutzung & Lasten).'));
      if (!cp.exists && cp.c.layers.length) add('info', 'schutz', T_('{name}: Schichten geplant, Bauteil fehlt im Grundriss.', { name: T_(cp.def.name) }));
    }
    const minPerPerson = g.tot.Anet / max(1, p.use.people);
    if (minPerPerson < 1) add('warn', 'nutzung', T_('Weniger als 1 m² Nettofläche je Person (Schweizer Schutzraum-Mindestwert).'));
    else if (q.tech.V / max(1, p.use.people) < 2.5) add('warn', 'nutzung', T_('Weniger als 2,5 m³ Raumvolumen je Person (Schweizer Schutzraum-Mindestwert).'));

    // Schutzgrad
    const hz = p.hazard || {}, bl = st.blast;
    if (bl) {
      const mt = bl.minT;
      if (b.tRoof < mt.roof - 1e-9) add('err', 'schutzgrad', T_('Decke {t} cm: TWK 2017 verlangt mindestens {m} cm.', { t: fmt(b.tRoof * 100, 0), m: fmt(mt.roof * 100, 0) }));
      if (b.tWall < mt.wall - 1e-9) add('err', 'schutzgrad', T_('Außenwand {t} cm: TWK 2017 verlangt mindestens {m} cm.', { t: fmt(b.tWall * 100, 0), m: fmt(mt.wall * 100, 0) }));
      if (b.tFloor < mt.floor - 1e-9) add('err', 'schutzgrad', T_('Bodenplatte {t} cm: TWK 2017 verlangt mindestens {m} cm.', { t: fmt(b.tFloor * 100, 0), m: fmt(mt.floor * 100, 0) }));
      g.L.flatMap((L) => L.walls).filter((w) => w.info.bearing && w.len > 0 && w.t < mt.inner - 1e-9).forEach((w) => add('err', 'schutzgrad', T_('{w} {t} cm: TWK 2017 verlangt mindestens 20 cm.', { w: w.auto ? T_('Schachtwand {lift}', { lift: g.labels['v:' + w.auto] || T_('Aufzug') }) : wallLabel(g, w.id), t: fmt(w.t * 100, 0) }), w.auto ? { type: 'vert', id: w.auto } : { type: 'wall', id: w.id }));
      const nm = { roof: T_('Decke'), floor: T_('Bodenplatte') };
      for (const k of ['roof', 'floor']) {
        const a = st[k] && st[k].acc;
        if (!a) continue;
        if (a.muA > 0.296 || st[k].accLayerFail) add('err', 'statik', T_('{n}: Druckzone im Lastfall Luftstoß überlastet.', { n: nm[k] }) + ' ' + (st[k].hReq && isFinite(st[k].hReq) ? T_('Abhilfe: {n} ≥ {h} cm oder Spannweite verkürzen.', { n: nm[k], h: fmt(st[k].hReq * 100, 0) }) : T_('{n} dicker oder Spannweite verkürzen.', { n: nm[k] })));
        else if (a.shear.needs && !a.shear.reinf) add('err', 'statik', T_('{n}: Querkraft im Lastfall Luftstoß nicht abdeckbar. {n} dicker oder tragende Innenwand.', { n: nm[k] }));
        else if (a.shear.reinf) add('info', 'statik', T_(bl.noStir[k] ? '{n}: Luftstoß braucht Schubbewehrung Ø{phi}/{s} in {b} m breiten Randstreifen (ohne ab {t} cm Dicke).' : '{n}: Luftstoß braucht Schubbewehrung Ø{phi}/{s} in {b} m breiten Randstreifen.', { n: nm[k], phi: a.shear.reinf.phi, s: fmt(a.shear.reinf.s * 100, 0), b: fmt(a.shear.strip), t: fmt(bl.noStir[k] * 100, 0) }));
      }
      const wa = st.wall.acc;
      if (wa) {
        if (wa.muA > 0.296 || st.wall.accLayerFail) add('err', 'statik', T_('Außenwand: Druckzone im Lastfall Luftstoß überlastet. Wand dicker machen.'));
        else if (wa.shear.needs && !wa.shear.reinf) add('err', 'statik', T_('Außenwand: Querkraft im Lastfall Luftstoß nicht abdeckbar. Wand dicker machen.'));
        else if (wa.shear.reinf) add('info', 'statik', T_(bl.noStir.wall ? 'Außenwand: Luftstoß braucht Schubbewehrung oben und unten (ohne ab {t} cm Dicke).' : 'Außenwand: Luftstoß braucht Schubbewehrung oben und unten.', { t: fmt(bl.noStir.wall * 100, 0) }));
      }
      st.intWalls.filter((w) => w.acc && w.acc.eta > 1).forEach((w) => add('err', 'statik', T_('{w}: Normalkraft im Lastfall Luftstoß zu hoch.', { w: wallLabel(g, w.id) }), { type: 'wall', id: w.id }));
      if (p.use.storeys > 8) add('warn', 'schutzgrad', T_('Mehr als 8 Geschosse über dem Schutzraum: Nach TWK 2017 wird die Trümmerlast maßgebend. Fachplaner muss sie ansetzen.'));
      if (g.L.some((L) => L.walls.some((w) => w.kind === 'tb'))) add('info', 'schutzgrad', T_('Trockenbauwände im Schutzraum gegen Erschütterung befestigen oder durch Mauerwerk ersetzen.'));
      if (p.use.people > 50 && !allRooms.some((r) => AIRLOCK.test(r.name))) add('warn', 'schutzgrad', T_('Ab 51 Schutzplätzen sieht die TWK eine Schleuse vor. Einen Raum „Schleuse“ einplanen.'));
    }
    if (hz.radiation && st.shield.heq < 0.65 - 1e-9) add('warn', 'schutzgrad', T_('Betonäquivalent über der Decke {h} cm, TWK verlangt im Freien 65 cm. Erdüberdeckung oder Decke erhöhen.', { h: fmt(st.shield.heq * 100, 0) }));
    if (hz.cb && !allOps.some((o) => o.kind === 'schutztuer')) add('warn', 'schutzgrad', T_('ABC-Schutz braucht einen gasdichten Abschluss: Schutztür einplanen.'));
    const spec = Object.entries(hz.scenarios || {}).filter(([k, s]) => s && s.on && !(q.planning && q.planning.threats.some((v) => v.documented && v.s.covers === k)));
    if (spec.length) {
      const ex = hz.expert || {};
      const done = [ex.reference, ex.authority, ex.date].every((v) => String(v || '').trim());
      add('warn', 'schutz', T_(done ? '{list}: Unterlagentitel „{ref}“ eingetragen, aber noch keinem nachgewiesenen Beschussszenario zugeordnet. Im Szenario „Deckt geforderte Sonderanforderung ab“ wählen und die Fachunterlage dem Plan zuordnen.' : '{list}: Fachbemessung Schutzbau erforderlich. Beschussszenario mit Randbedingungen anlegen, „Deckt geforderte Sonderanforderung ab“ wählen und nachweisen.', { list: spec.map(([k]) => T_((M.SPECIAL_SCENARIOS[k] || { name: k }).name)).join(', '), ref: ex.reference }));
    }
    return out;
  }

  /* Mehrere Ebenen: Erreichbarkeit, Rettungswege, Innentreppen, Abfangungen. */
  function levelChecks(p, q, add) {
    const g = q.geo, nL = g.L.length;
    if (!g.valid) return;
    const wallPoly = (sg, t) => { const u = G.norm(G.sub(sg.b, sg.a)), n = { x: -u.y * t / 2, y: u.x * t / 2 }; return [G.add(sg.a, n), G.add(sg.b, n), G.sub(sg.b, n), G.sub(sg.a, n)]; };
    const shrink = (poly, d) => G.offsetPolygon(G.ensureCCW(poly), -d);
    const insideInner = (poly) => poly.every((pt) => G.pointInPolygon(pt, g.inner)) &&
      !poly.some((a, j) => g.inner.some((c, i) => { const h = G.segIntersect(a, poly[(j + 1) % poly.length], c, g.inner[(i + 1) % g.inner.length]); return h && h.t > 1e-6 && h.t < 1 - 1e-6 && h.u > 1e-6 && h.u < 1 - 1e-6; }));
    // Innentreppen
    for (const s of g.vert.stairs) {
      const ref = { type: 'vert', id: s.id }, nm = g.labels['v:' + s.id] || T_('Innentreppe');
      if (!insideInner(shrink(s.foot, 0.005))) add('err', 'grundriss', T_('{nm} liegt nicht vollständig im Innenraum.', { nm }), ref);
      const core = shrink(s.footLower, 0.02), hole = shrink(s.footUpper, 0.02);
      const hit = new Set();
      for (const [li, poly, what] of [[s.lower, core, T_('im Treppenlauf')], [s.upper, hole, T_('im Austritt oder über dem Treppenauge')]]) {
        for (const w of g.L[li].walls) for (const sg of w.segs) {
          if (hit.has(w.id) || !G.polygonsOverlap(wallPoly(sg, w.t), poly)) continue;
          hit.add(w.id);
          add('err', 'grundriss', T_('{nm}: {w} steht {what} ({lvl}).', { nm, w: w.auto ? T_('Aufzugsschacht') : wallLabel(g, w.id), what, lvl: levelName(g, li) }), ref);
        }
        for (const c of g.L[li].columns) if (G.polygonsOverlap(G.polygonFromRect(c.x - c.bx / 2, c.y - c.by / 2, c.x + c.bx / 2, c.y + c.by / 2), poly)) add('err', 'grundriss', T_('{nm}: {c} steht {what}.', { nm, c: g.labels['c:' + c.id] || T_('Stütze'), what }), ref);
      }
      const deS = p.site.country === 'DE';
      if (s.w < 0.8 - 1e-9) add('warn', 'grundriss', deS ? T_('{nm}: nutzbare Laufbreite {w} cm unter 80 cm (DIN 18065).', { nm, w: fmt(s.w * 100, 0) }) : T_('{nm}: nutzbare Laufbreite {w} cm unter 80 cm (Anhalt: DIN 18065); Bauvorschrift des Landes prüfen.', { nm, w: fmt(s.w * 100, 0) }), ref);
      else if (s.w < 1.0 - 1e-9 && p.use.people > 20) add('info', 'grundriss', deS ? T_('{nm}: Für mehr als 20 Personen ist eine Laufbreite von mindestens 1,00 m sinnvoll (DIN 18065, Gebäude allgemein).', { nm }) : T_('{nm}: Für mehr als 20 Personen ist eine Laufbreite von mindestens 1,00 m sinnvoll (Anhalt: DIN 18065, Gebäude allgemein).', { nm }), ref);
    }
    // Erreichbarkeit der unteren Ebenen und zweiter Rettungsweg
    for (let i = 1; i < nL; i++) {
      const n = g.vert.stairs.filter((s) => s.lower === i).length;
      if (!n) add('err', 'grundriss', T_('{lvl} ist über keine Innentreppe erreichbar. Mit „Innentreppe“ eine Treppe von Ebene {a} nach Ebene {b} setzen.', { lvl: levelName(g, i), a: i, b: i + 1 }));
      else if (n === 1) add(p.use.people > 50 ? 'warn' : 'info', 'grundriss', T_(p.use.people > 50 ? '{lvl} hat nur eine Treppe. Einen zweiten Rettungsweg (zweite Treppe in einem anderen Bereich) prüfen – bei mehr als 50 Personen in der Regel nötig.' : '{lvl} hat nur eine Treppe. Einen zweiten Rettungsweg (zweite Treppe in einem anderen Bereich) prüfen.', { lvl: levelName(g, i) }));
    }
    // Laufweg zum Ausgang über die Innentreppen (Luftlinie je Ebene plus Treppenlauf)
    const exits = g.access.filter((a) => a.opening && !a.opening.invalid).map((a) => G.lerp(a.opening.p0, a.opening.p1, 0.5));
    if (nL > 1 && exits.length) {
      const top = (s) => G.add({ x: s.src.x, y: s.src.y }, G.mul(s.u, -s.src.landing / 2));
      const bot = (s) => G.add({ x: s.src.x, y: s.src.y }, G.mul(s.u, s.run + s.src.landing / 2));
      const memo = new Map();
      const toExit = (i, pt, depth) => {
        if (i === 0) return exits.reduce((m, e) => min(m, G.dist(pt, e)), Infinity);
        if (depth > nL) return Infinity;
        return g.vert.stairs.filter((s) => s.lower === i).reduce((m, s) => {
          const k = s.id;
          if (!memo.has(k)) memo.set(k, toExit(i - 1, top(s), depth + 1));
          return min(m, G.dist(pt, bot(s)) + s.Ls + memo.get(k));
        }, Infinity);
      };
      const bi = G.bbox(g.inner), sp = max(0.5, Math.sqrt(g.Ain / 2500));
      for (let i = 1; i < nL; i++) {
        let far = 0;
        for (let x = bi.x0 + sp / 2; x < bi.x1; x += sp) for (let y = bi.y0 + sp / 2; y < bi.y1; y += sp) {
          const pt = { x, y };
          if (G.pointInPolygon(pt, g.inner)) far = max(far, toExit(i, pt, 0));
        }
        if (isFinite(far)) {
          g.exitFar = max(g.exitFar || 0, far);
          if (far > 35) add('warn', 'grundriss', T_('{lvl}: Laufweg bis zum Ausgang bis {d} m (Luftlinie und Treppen). Weitere Treppe näher am Ausgang oder zusätzlichen Notausstieg vorsehen (Orientierung: höchstens 35 m).', { lvl: levelName(g, i), d: fmt(far, 0) }));
        }
      }
    }
    // Tragende Wände und Stützen, die nicht über tragenden Bauteilen der Ebene darunter stehen: Abfangung durch die Zwischendecke
    for (let i = 0; i + 1 < nL; i++) {
      const below = g.L[i + 1];
      const bear = below.walls.filter((w) => w.info.bearing).flatMap((w) => w.segs.map((sg) => ({ sg, t: w.t })));
      const covered = (sg, t) => {
        const u = G.norm(G.sub(sg.b, sg.a)), L = G.dist(sg.a, sg.b), iv = [];
        for (const o of bear) {
          const v = G.sub(o.sg.b, o.sg.a);
          if (Math.abs(G.cross(u, G.norm(v))) > 1e-3) continue;
          if (Math.abs(G.cross(u, G.sub(o.sg.a, sg.a))) > max(t, o.t) / 2 + 1e-6) continue;
          const t0 = G.dot(G.sub(o.sg.a, sg.a), u), t1 = G.dot(G.sub(o.sg.b, sg.a), u);
          const lo = max(0, min(t0, t1)), hi = min(L, max(t0, t1));
          if (hi > lo) iv.push([lo, hi]);
        }
        iv.sort((a, b) => a[0] - b[0]);
        let sum = 0, end = 0;
        for (const [lo, hi] of iv) { if (hi > end) { sum += hi - max(lo, end); end = hi; } }
        return sum;
      };
      for (const w of g.L[i].walls) {
        if (!w.info.bearing || w.auto || !(w.len > 0)) continue;
        const cov = w.segs.reduce((sm, sg) => sm + covered(sg, w.t), 0);
        if (cov < 0.9 * w.len) add('info', 'statik', T_(cov > 0.05 ? '{w} steht nur auf {p} % ihrer Länge über einer tragenden Wand von {lvl}. Die Zwischendecke fängt die Wandlast ab (im FE-Modell als Linienlast) – das macht sie dicker oder stärker bewehrt.' : '{w} steht nicht über einer tragenden Wand von {lvl}. Die Zwischendecke fängt die Wandlast ab (im FE-Modell als Linienlast) – das macht sie dicker oder stärker bewehrt.', { w: wallLabel(g, w.id), p: fmt(100 * cov / w.len, 0), lvl: levelName(g, i + 1) }), { type: 'wall', id: w.id });
      }
      for (const c of g.L[i].columns) {
        const onCol = below.columns.some((d) => Math.abs(d.x - c.x) < (d.bx + c.bx) / 4 && Math.abs(d.y - c.y) < (d.by + c.by) / 4);
        const onWall = bear.some((o) => G.distPointSeg({ x: c.x, y: c.y }, o.sg.a, o.sg.b).d < o.t / 2);
        if (!onCol && !onWall) add('info', 'statik', T_('{c} steht nicht über einer Stütze oder tragenden Wand von {lvl}. Die Zwischendecke fängt die Stützenlast ab.', { c: g.labels['c:' + c.id] || T_('Stütze'), lvl: levelName(g, i + 1) }), { type: 'column', id: c.id });
      }
    }
  }

  /* Aufzüge: Lage, Kabine nach EN 81-20, Türen, Haltestellen, Schachtgrube und Schachtkopf, Schutzhülle, Strom. */
  function liftChecks(p, q, add) {
    const g = q.geo, lv = q.lv, b = p.build;
    const wallPoly = (sg, t) => { const u = G.norm(G.sub(sg.b, sg.a)), n = { x: -u.y * t / 2, y: u.x * t / 2 }; return [G.add(sg.a, n), G.add(sg.b, n), G.sub(sg.b, n), G.sub(sg.a, n)]; };
    const shrink = (poly, d) => G.offsetPolygon(G.ensureCCW(poly), -d);
    for (const src of (p.geom.verts || []).filter((v) => v.kind === 'aufzug')) {
      const ref = { type: 'vert', id: src.id }, nm = g.labels['v:' + src.id] || T_('Aufzug');
      const v = g.vert.lifts.find((x) => x.id === src.id);
      if (!v) { add('err', 'grundriss', T_('{nm}: unterste Haltestelle liegt über der obersten. Haltestellen prüfen.', { nm }), ref); continue; }
      const d = v.design;
      if (!v.toSurface && v.levelTop === v.levelBot) add('err', 'grundriss', T_('{nm} hat nur eine Haltestelle. Oberste Haltestelle „Gelände“ oder eine weitere Ebene wählen.', { nm }), ref);
      if (!g.valid || !v.outerPoly.every((pt) => G.pointInPolygon(pt, g.inner))) add('err', 'grundriss', T_('{nm}: Schacht liegt nicht vollständig im Innenraum.', { nm }), ref);
      for (let li = v.wallTop; li <= v.levelBot; li++) {
        const L = g.L[li], core = shrink(v.outerPoly, 0.02);
        for (const w of L.walls) if (!w.auto && w.segs.some((sg) => G.polygonsOverlap(wallPoly(sg, w.t), core))) add('err', 'grundriss', T_('{nm}: {w} schneidet den Schacht.', { nm, w: wallLabel(g, w.id) }), ref);
        for (const st of g.vert.stairs) if ((st.lower === li && G.polygonsOverlap(st.footLower, core)) || (st.upper === li && G.polygonsOverlap(st.footUpper, core))) add('err', 'grundriss', T_('{nm}: Schacht und {s} überschneiden sich.', { nm, s: g.labels['v:' + st.id] || T_('Innentreppe') }), ref);
        // Fläche vor der Schachttür: Türbreite + 0,6 m, 1,5 m tief frei (Warten, Rollstuhl, Laden)
        if (li >= v.levelTop) {
          const C0 = G.add({ x: v.x, y: v.y }, G.mul(v.u, v.dIn / 2 + v.t)), hw = src.door / 2 + 0.3;
          const front = [G.add(G.add(C0, G.mul(v.nrm, -hw)), G.mul(v.u, 0.02)), G.add(G.add(C0, G.mul(v.nrm, hw)), G.mul(v.u, 0.02)), G.add(G.add(C0, G.mul(v.nrm, hw)), G.mul(v.u, 1.5)), G.add(G.add(C0, G.mul(v.nrm, -hw)), G.mul(v.u, 1.5))];
          const blocked = !front.every((pt) => G.pointInPolygon(pt, g.inner)) || L.walls.some((w) => !w.auto && w.segs.some((sg) => G.polygonsOverlap(wallPoly(sg, w.t), front))) || L.columns.some((c) => G.polygonsOverlap(G.polygonFromRect(c.x - c.bx / 2, c.y - c.by / 2, c.x + c.bx / 2, c.y + c.by / 2), front));
          if (blocked) add('warn', 'grundriss', T_('{nm}: vor der Schachttür in {lvl} fehlen 1,5 m freie Tiefe (Warten, Ein- und Ausladen). Aufzug drehen oder verschieben.', { nm, lvl: levelName(g, li) }), ref);
          if (d && d.doorH + 0.25 > L.H + 1e-9) add('err', 'grundriss', T_('{nm}: Schachttür {h} m plus Sturz passt nicht unter die lichte Höhe {H} m von {lvl}.', { nm, h: fmt(d.doorH), H: fmt(L.H), lvl: levelName(g, li) }), ref);
        }
      }
      if (src.door > src.w + 1e-9) add('err', 'grundriss', T_('{nm}: Tür breiter als die Kabine.', { nm }), ref);
      if (!d) continue;
      if (!d.areaOk) add('err', 'grundriss', T_('{nm}: Kabine {a} m² ist für {q} kg zu groß (EN 81-20 Tab. 6: höchstens {max} m²). Nennlast auf mindestens {qmin} kg erhöhen oder Kabine verkleinern.', { nm, a: fmt(d.area), q: d.Q, max: fmt(d.aMax), qmin: d.qMin }), ref);
      if (src.type === 'personen' && !d.accessible) add('info', 'grundriss', T_('{nm}: für Rollstuhlnutzung Kabine mindestens 1,10 × 1,40 m und Tür 90 cm (EN 81-70 Typ 2).', { nm }), ref);
      add('info', 'grundriss', T_('{nm}: Schachtgrube {pit} m unter OK Rohboden {lvl} (verkürzt nach EN 81-21 bis etwa {red} m mit Zusatzmaßnahmen), Schachtkopf {head} m über der obersten Haltestelle.', { nm, pit: fmt(d.pit), lvl: levelName(g, v.levelBot), red: fmt(d.pitRed), head: fmt(d.head) }), ref);
      if (v.roofBox) {
        const above = v.headOver - b.tRoof + 0.3, coverLeft = b.cover - above;
        if (coverLeft < 0.3) add('err', 'konstruktion', T_('{nm}: Schachtkopf ragt {a} m über die Decke und durchstößt die Erdüberdeckung ({c} m). Verkürzten Schachtkopf nach EN 81-21 vereinbaren oder lichte Höhe von Ebene 1 erhöhen.', { nm, a: fmt(above), c: fmt(b.cover) }), ref);
        else add('info', 'konstruktion', T_('{nm}: Schachtkopf als Betonkasten {a} m über der Decke (in der Erdüberdeckung, Deckenaussparung im FE-Modell).', { nm, a: fmt(above) }), ref);
      } else if (v.headOver > 1e-9) add('info', 'grundriss', T_('{nm}: Schachtkopf reicht {h} m in {lvl} hinein (Schachtwände dort mitgeführt).', { nm, h: fmt(v.headOver), lvl: levelName(g, v.wallTop) }), ref);
      if (v.toSurface) {
        add('warn', 'schutz', T_('{nm} führt bis zum Gelände und durchstößt die Schutzhülle. An jeder Haltestelle im Bunker eine gasdichte, druckfeste Schutztür vor der Schachttür vorsehen (eingeplant) oder den Schacht oben druckfest verschließen; Schutzwirkung mit dem Fachplaner Schutzbau nachweisen.', { nm }), ref);
        add('info', 'konstruktion', T_('{nm}: Schacht {s} m von der Decke bis zum Gelände, Aufzugshaus {h} m hoch über Gelände.', { nm, s: fmt(v.works ? v.works.shaft : 0), h: fmt(v.works ? v.works.house : 0) }), ref);
      }
      if (finite(lv.zW) && lv.zW > lv.levels[v.levelBot].zFloorTop - d.pit - b.tFloor) add('info', 'konstruktion', T_('{nm}: Schachtgrube liegt im Grundwasser – Grube als Teil der WU-Wanne ausbilden, Auftrieb der Grube berücksichtigt.', { nm }), ref);
      add('info', 'technik', T_(d.cwBuffer ? '{nm}: Antrieb {drive}, etwa {p} kW, Anlauf {s} kVA – im Notstromaggregat berücksichtigt. Lasten zur Abstimmung mit dem Hersteller: Kabinenpuffer {b} kN, Gegengewichtspuffer {cw} kN, Aufhängung Schachtdecke {hook} kN.' : '{nm}: Antrieb {drive}, etwa {p} kW, Anlauf {s} kVA – im Notstromaggregat berücksichtigt. Lasten zur Abstimmung mit dem Hersteller: Kabinenpuffer {b} kN, Zylinderfuß {pf} kN.', { nm, drive: T_(d.rope ? 'Seil mit Gegengewicht' : 'Hydraulik'), p: fmt(d.P, 1), s: fmt(d.kVAstart, 0), b: fmt(d.buffer, 0), cw: fmt(d.cwBuffer, 0), hook: fmt(d.hook, 0), pf: fmt(d.piston, 0) }), ref);
    }
  }

  /* Stützen: Lage, stützenfreie Bereiche, Tragfähigkeit, Durchstanzen. */
  function columnChecks(p, q, add) {
    const g = q.geo, st = q.struct;
    const rect = (c, m) => G.polygonFromRect(c.x - c.bx / 2 - m, c.y - c.by / 2 - m, c.x + c.bx / 2 + m, c.y + c.by / 2 + m);
    const wallPoly = (sg, t) => { const u = G.norm(G.sub(sg.b, sg.a)), n = { x: -u.y * t / 2, y: u.x * t / 2 }; return [G.add(sg.a, n), G.add(sg.b, n), G.sub(sg.b, n), G.sub(sg.a, n)]; };
    g.L.forEach((L, li) => {
      for (const c of L.columns) {
        const ref = { type: 'column', id: c.id }, nm = g.labels['c:' + c.id] || T_('Stütze');
        if (!g.valid || !rect(c, 0).every((pt) => G.pointInPolygon(pt, g.inner))) { add('err', 'grundriss', T_('{nm} liegt nicht vollständig im Innenraum.', { nm }), ref); continue; }
        if (L.walls.some((w) => w.segs.some((sg) => G.polygonsOverlap(wallPoly(sg, w.t), rect(c, -0.01))))) add('warn', 'grundriss', T_('{nm} steht in einer Wand. Stütze entfernen oder verschieben.', { nm }), ref);
        if (g.vert.lifts.some((v) => li >= v.wallTop && li <= v.levelBot && G.polygonsOverlap(v.outerPoly, rect(c, -0.01)))) add('err', 'grundriss', T_('{nm} steht im Aufzugsschacht.', { nm }), ref);
        if (!c.auto && (L.zones || []).some((z) => c.x > z.x0 && c.x < z.x1 && c.y > z.y0 && c.y < z.y1)) add('warn', 'grundriss', T_('{nm} steht in einem Bereich ohne Stützen.', { nm }), ref);
        // Öffnungen in der Platte darüber näher als 6d: kritischer Rundschnitt verkürzt (EC2 6.4.2(3))
        const r = (st.columns || []).find((x) => x.id === c.id);
        const holes = (li > 0 ? g.L[li - 1].holesBelow : []).concat(g.vert.lifts.filter((v) => (li === 0 ? v.toSurface || v.roofBox : li - 1 >= v.wallTop && li <= v.levelBot)).map((v) => v.innerPoly));
        if (r && r.punch && holes.some((h) => G.polygonsOverlap(h, rect(c, 6 * r.punch.d)))) add('info', 'statik', T_('{nm}: Öffnung in der Platte darüber näher als 6 d an der Stütze. Der kritische Rundschnitt wird verkürzt ({ref}) – Durchstanznachweis vom Tragwerksplaner mit reduziertem Umfang führen.', { nm, ref: NC.ref.punchOpen }), ref);
      }
    });
    for (const bd of st.beams || []) {
      const ref = { type: 'beam', id: bd.id }, nm = g.labels['b:' + bd.id] || T_('Unterzug'), L = g.L[bd.level];
      if (bd.L < 0.05) { add('warn', 'grundriss', T_('{w} liegt außerhalb des Innenraums.', { w: nm }), ref); continue; }
      if (bd.unsupported) { add('err', 'grundriss', T_('{nm} braucht an beiden Enden ein Auflager: tragende Wand, Stütze oder Außenwand.', { nm }), ref); continue; }
      const fix = bd.hbReq ? (isFinite(bd.hbReq) ? ' ' + T_('Abhilfe: Unterzughöhe ≥ {h} cm oder Stütze in Feldmitte.', { h: fmt(bd.hbReq * 100, 0) }) : ' ' + T_('Abhilfe: Stütze in Feldmitte oder breiterer Unterzug.')) : '';
      if (bd.fail) add('err', 'statik', T_('{nm}: Querschnitt {b}/{h} cm reicht nicht (Feldmoment {m} kNm, Querkraft {v} kN).', { nm, b: fmt(bd.bw * 100, 0), h: fmt(bd.h * 100, 0), m: fmt(bd.mF, 0), v: fmt(bd.vEd, 0) }) + fix, ref);
      else if (bd.defl.eta > 1) add('warn', 'statik', T_('{nm}: Biegeschlankheit l/d = {ld} über {lim}.', { nm, ld: fmt(bd.defl.ld, 1), lim: fmt(bd.defl.lim, 1) }) + fix, ref);
      if (!bd.fail && !bd.stiff.ok) add('warn', 'statik', T_('{nm} verformt sich rechnerisch um etwa {w} mm (Grenze für die starre Lagerung im Plattenmodell l/500 = {lim} mm). Unterzug höher machen, sonst sind die Plattenmomente zu günstig.', { nm, w: fmt(bd.stiff.w * 1000, 0), lim: fmt(bd.stiff.lim * 1000, 0) }), ref);
      if (L && L.H - bd.hb < 2.0) add('warn', 'grundriss', T_('{nm}: lichte Höhe darunter nur {h} m.', { nm, h: fmt(L.H - bd.hb) }), ref);
    }
    for (const r of st.columns || []) {
      const ref = { type: 'column', id: r.id }, nm = g.labels['c:' + r.id] || T_('Stütze'), d = r.design;
      if (d.fail || d.eta > 1 + 1e-9) add('err', 'statik', T_('{nm}: Querschnitt {bx} × {by} cm reicht nicht für NEd = {n} kN (η = {eta}).', { nm, bx: fmt(r.bx * 100, 0), by: fmt(r.by * 100, 0), n: fmt(r.nEd, 0), eta: fmt(d.eta) }) + (r.bReq ? ' ' + T_('Abhilfe: Stütze mindestens {b} × {b} cm.', { b: fmt(r.bReq * 100, 0) }) : ''), ref);
      for (const [pu, where, floor] of [[r.punch, T_('{slab} über', { slab: elName(r.level === 0 ? 'Decke' : r.slabName) }), false], [r.punchBelow, r.level === g.L.length - 1 ? T_('Bodenplatte unter') : T_('Zwischendecke unter'), r.level === g.L.length - 1]]) {
        if (!pu) continue;
        if (pu.fail) add('err', 'statik', T_('Durchstanzen: {where} {nm} nicht nachweisbar (vEd = {v} MPa, Grenze {g} MPa).', { where, nm, v: fmt(pu.vEd, 2), g: fmt(pu.vRdMax || 1.4 * pu.vRdc, 2) }) + ' ' + T_('Abhilfe: {a}, {b}', { a: pu.bReq && isFinite(pu.bReq) ? T_('Stütze mindestens {b} × {b} cm', { b: fmt(pu.bReq * 100, 0) }) : T_('Stütze größer'), b: pu.hLocal ? T_(floor ? 'Bodenplatte unter der Stütze auf {h} cm verstärken (Fläche etwa {w} × {w} m) oder ganze Platte dicker.' : 'Platte an der Stütze auf {h} cm verstärken (Fläche etwa {w} × {w} m) oder ganze Platte dicker.', { h: fmt(pu.hLocal * 100, 0), w: fmt(pu.wLocal, 1) }) : T_(floor ? 'Bodenplatte dicker oder Plattenverstärkung unter der Stütze.' : 'Platte dicker oder Stützenkopfverstärkung.') }), ref);
        else if (pu.needs) add('warn', 'statik', T_(pu.links.rows > 2 ? 'Durchstanzbewehrung {where} {nm}: {n} Bügelreihen, Reihe 1 {r1} cm², Reihe 2 {r2} cm², weitere je {a} cm² (mindestens {amin} cm² je Bügelschenkel). Eine größere Stütze oder dickere Platte vermeidet sie.' : 'Durchstanzbewehrung {where} {nm}: {n} Bügelreihen, Reihe 1 {r1} cm², Reihe 2 {r2} cm². Eine größere Stütze oder dickere Platte vermeidet sie.', { where, nm, n: pu.links.rows, r1: fmt(pu.links.row1, 1), r2: fmt(pu.links.row2, 1), a: fmt(pu.links.asw, 1), amin: fmt(pu.links.aswMin, 2) }), ref);
      }
    }
  }

  /* Stützen automatisch: für jede Ebene die Platte darüber prüfen; Felder (von tragenden Wänden umschlossen), deren kürzere
   * lichte Weite die Rasterweite einer Flachdecke überschreitet, bekommen ein Stützenraster. Stützen der Ebene darüber werden
   * nach unten fortgesetzt (Lastweg), außer eine tragende Wand oder Stütze steht schon dort. Bereiche ohne Stützen bleiben frei:
   * Rasterpunkte darin rücken an den Bereichsrand. Von Hand gesetzte Stützen bleiben unverändert. */
  function autoColumns(p, q) {
    const g = q.geo, st = q.struct, mat = q.mat, b = p.build, nL = g.L.length;
    if (!g.valid) return { levels: g.L.map(() => []), report: [] };
    const out = [], report = [];
    let above = []; // Stützen der Ebene darüber { x, y, bx, by, nEd }
    for (let li = 0; li < nL; li++) {
      const L = g.L[li], src = li === 0 ? p.geom : p.levels[li - 1];
      const slab = li === 0 ? st.roof : st.mids.find((m) => m.level === li);
      const h = li === 0 ? b.tRoof : L.tSlab, pEd = slab ? slab.pEd : 0;
      const fs = flatSlabSpan(h, pEd, b.cnom, mat, 0);
      const sLine = fs.s * 1.1;
      const manual = (src.columns || []).filter((c) => !c.auto);
      const holes = L.holesBelow.concat(li > 0 ? g.L[li - 1].holesBelow : []).concat(g.vert.lifts.filter((v) => li >= v.wallTop && li <= v.levelBot).map((v) => v.outerPoly));
      const stairs = g.vert.stairs.filter((sv) => sv.lower === li || sv.upper === li).map((sv) => (sv.lower === li ? sv.footLower : sv.footUpper));
      const zones = src.zones || [];
      const bearing = L.walls.filter((w) => w.info.bearing).flatMap((w) => w.segs.map((sg) => ({ sg, t: w.t })));
      const nearWall = (pt, m) => bearing.some((o) => G.distPointSeg(pt, o.sg.a, o.sg.b).d < o.t / 2 + m) ||
        g.inner.some((a, i) => G.distPointSeg(pt, a, g.inner[(i + 1) % g.inner.length]).d < m);
      const blocked = (pt, c) => {
        const r = G.polygonFromRect(pt.x - c / 2 - 0.3, pt.y - c / 2 - 0.3, pt.x + c / 2 + 0.3, pt.y + c / 2 + 0.3);
        return !G.pointInPolygon(pt, g.inner) || holes.concat(stairs).some((hp) => G.polygonsOverlap(hp, r)) || nearWall(pt, c / 2 + 0.3);
      };
      const inZone = (pt) => zones.find((z) => pt.x > z.x0 - 1e-9 && pt.x < z.x1 + 1e-9 && pt.y > z.y0 - 1e-9 && pt.y < z.y1 + 1e-9);
      const cand = [];
      // 1. Stützen von oben fortsetzen, wenn darunter nichts trägt
      for (const c of above) {
        const onWall = bearing.some((o) => G.distPointSeg(c, o.sg.a, o.sg.b).d < o.t / 2);
        const onCol = manual.some((m) => Math.abs(m.x - c.x) < 0.3 && Math.abs(m.y - c.y) < 0.3);
        if (!onWall && !onCol) cand.push({ x: c.x, y: c.y, nAbove: c.nEd, stack: true });
      }
      // 2. Raster in zu weit gespannten Feldern
      const gb = L.gridBear;
      let fieldsDone = 0;
      for (const comp of gb ? gb.comps : []) {
        const wx = comp.x1 - comp.x0, wy = comp.y1 - comp.y0;
        if (min(wx, wy) <= sLine) continue;
        const nx = Math.ceil(wx / fs.s - 1e-9), ny = Math.ceil(wy / fs.s - 1e-9);
        fieldsDone++;
        for (let i = 1; i < nx; i++) for (let j = 1; j < ny; j++) {
          let pt = { x: G.round(comp.x0 + i * wx / nx, 3), y: G.round(comp.y0 + j * wy / ny, 3) };
          if (G.compAt(gb, pt) !== comp.id) continue;
          const z = inZone(pt);
          if (z) {
            // an den nächsten Bereichsrand rücken (außerhalb)
            const off = fs.c / 2 + 0.05;
            const opts = [{ x: z.x0 - off, y: pt.y }, { x: z.x1 + off, y: pt.y }, { x: pt.x, y: z.y0 - off }, { x: pt.x, y: z.y1 + off }]
              .sort((a, c2) => G.dist(a, pt) - G.dist(c2, pt));
            pt = opts.find((o) => !inZone(o) && G.compAt(gb, o) === comp.id) || null;
            if (!pt) { report.push({ level: li, dropped: true }); continue; }
            pt = { x: G.round(pt.x, 3), y: G.round(pt.y, 3) };
          }
          cand.push({ x: pt.x, y: pt.y, nAbove: 0 });
        }
      }
      // zusammenlegen (näher als die halbe Rasterweite), von Hand gesetzte Stützen haben Vorrang
      const placed = [];
      for (const c of cand.sort((a, c2) => (c2.stack ? 1 : 0) - (a.stack ? 1 : 0))) {
        if (manual.some((m) => G.dist(m, c) < fs.s / 2) || placed.some((o) => G.dist(o, c) < fs.s / 2)) continue;
        if (!c.stack && blocked(c, fs.c)) { report.push({ level: li, dropped: true }); continue; }
        placed.push(c);
      }
      // Größe aus der Normalkraft: Plattenlast im Raster plus Stütze darüber
      const res = placed.map((c) => {
        const nEd = pEd * fs.s * fs.s + c.nAbove + max(...NC.lf.sets.map((S) => S.G)) * GAMMA_C * 0.16 * L.H;
        const tB = li === nL - 1 ? b.tFloor : g.L[li + 1].tSlab;
        const size = max(fs.c, columnSizeFor(nEd, L.H + h / 2 + tB / 2, mat, b.fireClass));
        return { id: M.uid('c'), x: c.x, y: c.y, bx: size, by: size, auto: true, nEd };
      });
      out.push(res.map(({ nEd, ...c }) => c));
      report.push({ level: li, s: fs.s, c: fs.c, fields: fieldsDone, n: res.length });
      above = res.concat(manual.map((m) => ({ x: m.x, y: m.y, bx: m.bx, by: m.by, nEd: ((st.columns || []).find((r) => r.id === m.id) || { nEd: pEd * fs.s * fs.s }).nEd })));
    }
    return { levels: out, report };
  }

  /* ---------- Gesamt ---------- */

  function fmt(v, d = 2) {
    if (!finite(v)) return '–';
    // −0,00 vermeiden (Rundungsrest kleiner als die letzte Stelle)
    const r = Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v;
    return r.toLocaleString(I18.locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function run(p, opts) {
    opts = opts || {};
    // Land: Währung und Wechselkurs für die Anzeige, Preisniveau, Klima
    NC = BP.normen.profile(p); BP.normen.setActive(NC);
    const LD = BP.laender, cur = LD ? LD.currency(p) : 'EUR', fxI = LD ? LD.fxInfo(cur, p) : { rate: 1, src: 'EUR' };
    if (LD) LD.setActive(cur, fxI.rate || 1);
    const lv = levels(p);
    const geo = geometry(p, lv);
    const vf = volumes(p, geo, lv);
    geo.vol = vf.vol; geo.mids = vf.mids;
    const env = envelope(p, geo, lv);
    const soil = soilOf(p.site);
    const earth = earthworks(p, geo, lv, env, soil);
    const mat = material(p);
    const tech = technik(p, geo, lv, env);
    const struct = structure(p, geo, lv, mat, soil, opts, tech.equip);
    const steel = rebarTakeoff(p, geo, lv, struct, mat);
    const q = { p, lv, geo, vol: vf.vol, fw: vf.fw, finish: vf.finish, env, earth, soil, mat, struct, steel, tech,
      country: LD ? { code: LD.country(p), region: p.site.region || '', cur, fx: fxI, pli: LD.pli(p), factor: LD.factor(p), climate: LD.climate(p), family: LD.family(p) } : null,
      norm: { code: NC.code, na: NC.na, fam: NC.fam, label: NC.label, docs: NC.docs, national: NC.national } };
    // Mengen aus der Biegeliste (jeder Stab mit Einzellänge, Stößen, Anschluss- und Eckstäben); Zugänge und Aufzugsgruben nach Ansatz
    if (BP.rebar) {
      const sch = BP.rebar.schedule(q);
      const items = sch.positions.map((r) => ({ element: r.el, label: r.pos + ' ' + r.label, phi: r.phi, length: r.n * r.L, count: r.n, kg: r.kg, s: r.s, pos: r.pos }))
        .concat(steel.items.filter((i) => i.element === 'Zugänge' || i.element === 'Aufzugsschächte'));
      const byDia = {};
      let net = 0;
      for (const it of items) { byDia[it.phi] = (byDia[it.phi] || 0) + it.kg; net += it.kg; }
      Object.assign(steel, { items, byDia, net, total: net * (1 + steel.waste), perM3: net * (1 + steel.waste) / vf.vol.rc, schedule: sch, takeoffNet: steel.net });
    }
    q.verify = moreChecks(p, q);
    q.routes = BP.calcExtra.routes(p, geo, lv, tech);
    q.prot = BP.calcExtra.protection(p, q);
    if (q.prot.extraHalvings > 0) {
      struct.shield.halvings += q.prot.extraHalvings; struct.shield.pf = Math.pow(2, struct.shield.halvings);
      struct.shield.heq += q.prot.extraHalvings * 144 / 2400;
    }
    q.schedule = schedule(p, q);
    q.bom = bom(p, q);
    q.planning = BP.planning.evaluate(p, q);
    q.blastDyn = blastDynamics(p, q);
    q.radon = BP.radon ? BP.radon.evaluate(p, q) : null;
    q.checks = checks(p, q);
    q.checks.push(...q.planning.moisture.checks);
    if (q.radon) q.checks.push(...q.radon.checks);
    q.planning.threats.forEach(v => { if (!v.documented) q.checks.push({ level:'warn', step:'schutz', text:T_('{name}: {state}. Keine belegte Schutzwirkung / Trefferkapazität.', { name: T_(v.catalog.name), state: v.state }) }); });
    if (!q.planning.procurement.complete) q.checks.push({ level:'info', step:'material', text:T_('Einkauf unvollständig: konkrete Produkte, Mengenprüfung und standortbezogene Lieferangebote ergänzen. Richtkosten sind kein Händlerangebot.') });
    const etas = [struct.roof && struct.roof.eta, struct.floor && struct.floor.eta, ...struct.mids.map((m) => m.eta), struct.wall.eta, struct.bearing.eta, struct.buoyancy.final.eta, ...struct.intWalls.map((w) => w.eta), ...struct.columns.map((c) => c.eta), ...struct.beams.map((x) => x.eta)]
      .filter((e) => e != null).map((e) => (finite(e) ? e : Infinity));
    q.summary = {
      concrete: vf.vol.rc, blinding: vf.vol.blinding, steel: steel.total, cost: q.bom.gross, costNet: q.bom.sumNet,
      weeks: q.schedule.weeks, days: q.schedule.total, etaMax: max(...etas), buoyancy: struct.buoyancy.final.eta,
      excavation: earth.Vexc, Anet: geo.tot.Anet, A: geo.A,
      errors: q.checks.filter((c) => c.level === 'err').length, warnings: q.checks.filter((c) => c.level === 'warn').length,
    };
    return q;
  }

  /* Rechnung mit einem anderen Normprofil (z. B. Referenzbeispiele mit NA DE), danach wieder das vorherige */
  function withNorm(np, fn) { const old = NC; NC = np; try { return fn(); } finally { NC = old; } }

  BP.calc = { run, withNorm, fmt, roomName, elName, labelText, catText, levels, servicesOf, autoColumns, columnDesign, punching, colSection, flatSlabSpan, plateBars, zulageBars, laps, COL_COVER, contBeam, addWorkdays, kgPerM, asBar, betaX, betaY, betaS, lapLength, designLayer, interp, crackWidth, shearCheck, asForShear };
})(typeof window !== 'undefined' ? window : globalThis);
