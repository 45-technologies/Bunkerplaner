/* Geometrie-Grundfunktionen. Plan-Koordinaten in Metern, x nach rechts, y nach oben. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const EPS = 1e-9;

  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const len = (a) => Math.hypot(a.x, a.y);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  function signedArea(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      s += a.x * b.y - b.x * a.y;
    }
    return s / 2;
  }
  const area = (poly) => Math.abs(signedArea(poly));

  function perimeter(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) s += dist(poly[i], poly[(i + 1) % poly.length]);
    return s;
  }

  function ensureCCW(poly) {
    return signedArea(poly) < 0 ? poly.slice().reverse() : poly.slice();
  }

  /* Außennormale einer Kante (Polygon gegen den Uhrzeigersinn). */
  function edgeNormal(a, b) {
    const d = norm(sub(b, a));
    return { x: d.y, y: -d.x };
  }

  /* Parallelverschiebung mit Gehrung. d > 0: nach außen. */
  function offsetPolygon(poly, d) {
    const n = poly.length, out = [];
    for (let i = 0; i < n; i++) {
      const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
      const n1 = edgeNormal(p0, p1), n2 = edgeNormal(p1, p2);
      const k = 1 + dot(n1, n2);
      const m = k < 1e-6 ? n1 : mul(add(n1, n2), 1 / k);
      out.push(add(p1, mul(m, d)));
    }
    return out;
  }

  /* Konvexe Hülle (Andrew), gegen den Uhrzeigersinn, ohne kollineare Punkte. */
  function convexHull(pts) {
    const P = pts.map((p) => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y);
    if (P.length < 3) return P;
    const turn = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const half = (list) => {
      const h = [];
      for (const p of list) {
        while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], p) <= EPS) h.pop();
        h.push(p);
      }
      h.pop();
      return h;
    };
    return half(P).concat(half(P.slice().reverse()));
  }

  function pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function distPointSeg(p, a, b) {
    const ab = sub(b, a), l2 = dot(ab, ab);
    let t = l2 < EPS ? 0 : dot(sub(p, a), ab) / l2;
    t = Math.max(0, Math.min(1, t));
    const q = lerp(a, b, t);
    return { d: dist(p, q), t, q };
  }

  /* Schnitt zweier Strecken: Parameter t (auf a-b) und u (auf c-d) oder null. */
  function segIntersect(a, b, c, d) {
    const r = sub(b, a), s = sub(d, c), den = cross(r, s);
    if (Math.abs(den) < EPS) return null;
    const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den;
    if (!Number.isFinite(t) || !Number.isFinite(u)) return null;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return { t, u };
  }

  /* Überlappen sich zwei einfache Polygone (Kantenschnitt oder ein Polygon im anderen)? */
  function polygonsOverlap(P, Q) {
    for (let i = 0; i < P.length; i++) {
      for (let j = 0; j < Q.length; j++) if (segIntersect(P[i], P[(i + 1) % P.length], Q[j], Q[(j + 1) % Q.length])) return true;
    }
    return P.some((pt) => pointInPolygon(pt, Q)) || Q.some((pt) => pointInPolygon(pt, P));
  }

  /* Strecke auf das Innere eines Polygons beschneiden -> Liste von Teilstrecken. */
  function clipSegment(a, b, poly) {
    const ts = [0, 1];
    for (let i = 0; i < poly.length; i++) {
      const hit = segIntersect(a, b, poly[i], poly[(i + 1) % poly.length]);
      if (hit) ts.push(Math.max(0, Math.min(1, hit.t)));
    }
    ts.sort((x, y) => x - y);
    const out = [];
    for (let i = 0; i < ts.length - 1; i++) {
      const t0 = ts[i], t1 = ts[i + 1];
      if (t1 - t0 < 1e-7) continue;
      const mid = lerp(a, b, (t0 + t1) / 2);
      if (pointInPolygon(mid, poly)) {
        const last = out[out.length - 1];
        if (last && Math.abs(last.t1 - t0) < 1e-7) last.t1 = t1; else out.push({ t0, t1 });
      }
    }
    return out.map((s) => ({ a: lerp(a, b, s.t0), b: lerp(a, b, s.t1) }));
  }

  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  /* Schnitt einer horizontalen bzw. vertikalen Linie mit Polygon -> Innenabschnitte. */
  function scanline(poly, axis, v) {
    const xs = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const av = axis === 'x' ? a.y : a.x, bv = axis === 'x' ? b.y : b.x;
      if ((av > v) !== (bv > v)) {
        const t = (v - av) / (bv - av);
        xs.push(axis === 'x' ? a.x + (b.x - a.x) * t : a.y + (b.y - a.y) * t);
      }
    }
    xs.sort((p, q) => p - q);
    const segs = [];
    for (let i = 0; i + 1 < xs.length; i += 2) segs.push([xs[i], xs[i + 1]]);
    return segs;
  }

  const isAxisAligned = (a, b) => Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6;

  /* Rechteck-Fußabdruck einer achsparallelen Wand. */
  function wallRect(a, b, t) {
    if (Math.abs(a.y - b.y) < 1e-6) return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: a.y - t / 2, y1: a.y + t / 2 };
    return { x0: a.x - t / 2, x1: a.x + t / 2, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
  }

  /*
   * Exaktes Zellraster für orthogonale Grundrisse: Rasterlinien liegen auf allen Kanten,
   * damit jede Zelle vollständig frei oder vollständig belegt ist. Schräge Wände werden
   * mit 5-cm-Unterteilung angenähert.
   */
  function cellGrid(poly, walls) {
    const xsSet = new Set(), ysSet = new Set();
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    poly.forEach((p) => { xsSet.add(r6(p.x)); ysSet.add(r6(p.y)); });
    const rects = [], diag = [];
    for (const w of walls) {
      if (isAxisAligned(w.a, w.b)) {
        const r = wallRect(w.a, w.b, w.t);
        rects.push(r);
        [r.x0, r.x1].forEach((v) => xsSet.add(r6(v)));
        [r.y0, r.y1].forEach((v) => ysSet.add(r6(v)));
      } else {
        diag.push(w);
        const bb = bbox([w.a, w.b]);
        for (let v = bb.x0 - w.t; v <= bb.x1 + w.t; v += 0.05) xsSet.add(r6(v));
        for (let v = bb.y0 - w.t; v <= bb.y1 + w.t; v += 0.05) ysSet.add(r6(v));
      }
    }
    const bb = bbox(poly);
    const xs = [...xsSet].filter((v) => v >= bb.x0 - 1e-9 && v <= bb.x1 + 1e-9).sort((a, b) => a - b);
    const ys = [...ysSet].filter((v) => v >= bb.y0 - 1e-9 && v <= bb.y1 + 1e-9).sort((a, b) => a - b);
    const nx = xs.length - 1, ny = ys.length - 1;
    const free = [], inside = [];
    for (let i = 0; i < nx; i++) {
      free.push(new Array(ny).fill(false));
      inside.push(new Array(ny).fill(false));
      for (let j = 0; j < ny; j++) {
        const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 };
        if (!pointInPolygon(c, poly)) continue;
        inside[i][j] = true;
        let blocked = rects.some((r) => c.x > r.x0 && c.x < r.x1 && c.y > r.y0 && c.y < r.y1);
        if (!blocked) blocked = diag.some((w) => distPointSeg(c, w.a, w.b).d < w.t / 2);
        free[i][j] = !blocked;
      }
    }
    // Zusammenhangskomponenten
    const comp = free.map((col) => col.map(() => -1));
    const comps = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      if (!free[i][j] || comp[i][j] >= 0) continue;
      const id = comps.length, stack = [[i, j]];
      const c = { id, area: 0, cells: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      comp[i][j] = id;
      while (stack.length) {
        const [a, b] = stack.pop();
        c.cells.push([a, b]);
        c.area += (xs[a + 1] - xs[a]) * (ys[b + 1] - ys[b]);
        c.x0 = Math.min(c.x0, xs[a]); c.x1 = Math.max(c.x1, xs[a + 1]);
        c.y0 = Math.min(c.y0, ys[b]); c.y1 = Math.max(c.y1, ys[b + 1]);
        for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const p = a + da, q = b + db;
          if (p >= 0 && q >= 0 && p < nx && q < ny && free[p][q] && comp[p][q] < 0) { comp[p][q] = id; stack.push([p, q]); }
        }
      }
      comps.push(c);
    }
    let blockedArea = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (inside[i][j] && !free[i][j]) blockedArea += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    return { xs, ys, nx, ny, free, inside, comp, comps, blockedArea };
  }

  /* Lichte Spannweiten durch eine Zelle (zusammenhängende freie Zellen in Zeile/Spalte). */
  function cellSpans(g, i, j) {
    let a = i, b = i;
    while (a - 1 >= 0 && g.free[a - 1][j]) a--;
    while (b + 1 < g.nx && g.free[b + 1][j]) b++;
    let c = j, d = j;
    while (c - 1 >= 0 && g.free[i][c - 1]) c--;
    while (d + 1 < g.ny && g.free[i][d + 1]) d++;
    return { lx: g.xs[b + 1] - g.xs[a], ly: g.ys[d + 1] - g.ys[c], x0: g.xs[a], x1: g.xs[b + 1], y0: g.ys[c], y1: g.ys[d + 1], i0: a, i1: b, j0: c, j1: d };
  }

  function compAt(g, p) {
    for (let i = 0; i < g.nx; i++) {
      if (p.x < g.xs[i] || p.x > g.xs[i + 1]) continue;
      for (let j = 0; j < g.ny; j++) {
        if (p.y >= g.ys[j] && p.y <= g.ys[j + 1] && g.free[i][j]) return g.comp[i][j];
      }
    }
    return -1;
  }

  /* Ein Punkt in der Komponente (Zentrum der größten Zelle) für Beschriftungen. */
  function compLabelPoint(g, c) {
    let best = null, ba = -1;
    for (const [i, j] of c.cells) {
      const w = g.xs[i + 1] - g.xs[i], h = g.ys[j + 1] - g.ys[j];
      const s = Math.min(w, h) * 1000 + w * h;
      if (s > ba) { ba = s; best = { x: (g.xs[i] + g.xs[i + 1]) / 2, y: (g.ys[j] + g.ys[j + 1]) / 2 }; }
    }
    return best;
  }

  function polygonFromRect(x0, y0, x1, y1) {
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  }

  const round = (v, d = 2) => { const k = Math.pow(10, d); return Math.round(v * k) / k; };
  const snap = (v, g) => (g > 0 ? Math.round(v / g) * g : v);

  BP.geo = {
    EPS, sub, add, mul, dot, cross, len, dist, norm, lerp,
    signedArea, area, perimeter, ensureCCW, edgeNormal, offsetPolygon, convexHull, pointInPolygon,
    distPointSeg, segIntersect, polygonsOverlap, clipSegment, bbox, scanline, isAxisAligned, wallRect,
    cellGrid, cellSpans, compAt, compLabelPoint, polygonFromRect, round, snap,
  };
})(typeof window !== 'undefined' ? window : globalThis);
