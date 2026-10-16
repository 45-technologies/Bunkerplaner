/* Finite-Elemente-Plattenberechnung (Reissner-Mindlin, MITC4-Rechteckelemente nach Bathe/Dvorkin).
 * Reine Funktionen auf einfachen Daten, damit sie im Browser, im Web Worker und in Node gleich laufen.
 * Einheiten: m, kN, kN/m², kNm/m. w positiv nach unten, Lasten positiv nach unten, Momente positiv = Zug unten.
 * Freiheitsgrade je Knoten: w, βx = ∂w/∂x, βy = ∂w/∂y (Kirchhoff-Grenzfall).
 * Gleichungslöser: symmetrische Bandmatrix, LDLᵀ-Zerlegung; Lager und vorgeschriebene Verschiebungen über Strafsteifigkeiten. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const G = BP.geo;

  /* ---------- Netz ----------
   * Achsparalleles Rechtecknetz. Rasterlinien liegen auf allen Schlüsselkoordinaten (Kontur, Wandachsen und -flächen,
   * Stützen, Öffnungen) und werden bis zur Zielgröße unterteilt. Sehr nahe Linien werden zusammengefasst. */
  function axisLines(keys, lo, hi, hMax, hMin) {
    const v = keys.filter((x) => x >= lo - 1e-9 && x <= hi + 1e-9).concat([lo, hi]).sort((a, b) => a - b);
    const merged = [];
    for (const x of v) {
      if (!merged.length || x - merged[merged.length - 1] > hMin) merged.push(x);
      else if (x === hi) merged[merged.length - 1] = hi; // Rand behalten
    }
    const out = [merged[0]];
    for (let i = 1; i < merged.length; i++) {
      const a = merged[i - 1], b = merged[i], n = Math.max(1, Math.ceil((b - a) / hMax - 1e-9));
      for (let k = 1; k <= n; k++) out.push(a + (b - a) * k / n);
    }
    return out;
  }

  function buildMesh(spec) {
    const dom = spec.domain, bb = G.bbox(dom);
    const hMax = spec.meshSize || 0.3, hMin = Math.min(0.06, hMax / 4);
    const kx = (spec.keyX || []).concat(dom.map((p) => p.x)), ky = (spec.keyY || []).concat(dom.map((p) => p.y));
    for (const hole of spec.holes || []) for (const p of hole) { kx.push(p.x); ky.push(p.y); }
    const xs = axisLines(kx, bb.x0, bb.x1, hMax, hMin), ys = axisLines(ky, bb.y0, bb.y1, hMax, hMin);
    const nx = xs.length - 1, ny = ys.length - 1;
    const act = new Uint8Array(nx * ny);
    const holes = spec.holes || [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 };
      if (!G.pointInPolygon(c, dom)) continue;
      if (holes.some((h) => G.pointInPolygon(c, h))) continue;
      act[i * ny + j] = 1;
    }
    // Knoten aktiver Elemente; Nummerierung entlang der kürzeren Richtung (kleine Bandbreite)
    const NX = nx + 1, NY = ny + 1, nodeOf = new Int32Array(NX * NY).fill(-1);
    const used = new Uint8Array(NX * NY);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (act[i * ny + j]) {
      used[i * NY + j] = used[(i + 1) * NY + j] = used[(i + 1) * NY + j + 1] = used[i * NY + j + 1] = 1;
    }
    const nodeX = [], nodeY = [], nodeIJ = [];
    const alongY = nx >= ny; // äußere Schleife über die längere Richtung
    let n = 0;
    if (alongY) { for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) if (used[i * NY + j]) { nodeOf[i * NY + j] = n++; nodeX.push(xs[i]); nodeY.push(ys[j]); nodeIJ.push(i, j); } }
    else { for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (used[i * NY + j]) { nodeOf[i * NY + j] = n++; nodeX.push(xs[i]); nodeY.push(ys[j]); nodeIJ.push(i, j); } }
    const elems = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (act[i * ny + j]) {
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      // Bereich: innerhalb der Lagerachsen der Außenwände (1) oder außerhalb (0). Über Linien mit Drehfedern springt das Moment.
      const reg = spec.regionPoly ? (G.pointInPolygon({ x: cx, y: cy }, spec.regionPoly) ? 1 : 0) : 1;
      elems.push({ i, j, a: xs[i + 1] - xs[i], b: ys[j + 1] - ys[j], cx, cy, reg,
        n: [nodeOf[i * NY + j], nodeOf[(i + 1) * NY + j], nodeOf[(i + 1) * NY + j + 1], nodeOf[i * NY + j + 1]] });
    }
    // Einzugsfläche je Knoten
    const area = new Float64Array(n);
    for (const e of elems) for (const k of e.n) area[k] += e.a * e.b / 4;
    return { xs, ys, nx, ny, act, nodeOf, nodeX: Float64Array.from(nodeX), nodeY: Float64Array.from(nodeY), nodeIJ: Int32Array.from(nodeIJ), nNodes: n, elems, area, elemAt: (i, j) => (act[i * ny + j] ? 1 : 0) };
  }

  /* ---------- Element ---------- */
  const GP = [-1 / Math.sqrt(3), 1 / Math.sqrt(3)];
  const XI = [-1, 1, 1, -1], ETA = [-1, -1, 1, 1];

  /* Biege- und Schubsteifigkeit eines Rechteckelements a × b (MITC4). Rückgabe 12×12 als Float64Array. */
  function elemStiffness(a, b, Db, Ds) {
    const K = new Float64Array(144);
    const ja = 2 / a, jb = 2 / b, detJ = a * b / 4;
    const dN = (xi, eta) => {
      const dx = [], dy = [], N = [];
      for (let k = 0; k < 4; k++) {
        N.push(0.25 * (1 + XI[k] * xi) * (1 + ETA[k] * eta));
        dx.push(0.25 * XI[k] * (1 + ETA[k] * eta) * ja);
        dy.push(0.25 * ETA[k] * (1 + XI[k] * xi) * jb);
      }
      return { N, dx, dy };
    };
    // Schubverzerrungen an den Mitwirkungspunkten: γx = ∂w/∂x − βx an A(0,−1), C(0,1); γy = ∂w/∂y − βy an D(−1,0), B(1,0)
    const gxRow = (xi, eta) => { const s = dN(xi, eta), r = new Float64Array(12); for (let k = 0; k < 4; k++) { r[3 * k] = s.dx[k]; r[3 * k + 1] = -s.N[k]; } return r; };
    const gyRow = (xi, eta) => { const s = dN(xi, eta), r = new Float64Array(12); for (let k = 0; k < 4; k++) { r[3 * k] = s.dy[k]; r[3 * k + 2] = -s.N[k]; } return r; };
    const gA = gxRow(0, -1), gC = gxRow(0, 1), gD = gyRow(-1, 0), gB = gyRow(1, 0);
    for (const xi of GP) for (const eta of GP) {
      const s = dN(xi, eta);
      // Biegung: κ = [∂βx/∂x, ∂βy/∂y, ∂βx/∂y + ∂βy/∂x]
      const B = [new Float64Array(12), new Float64Array(12), new Float64Array(12)];
      for (let k = 0; k < 4; k++) { B[0][3 * k + 1] = s.dx[k]; B[1][3 * k + 2] = s.dy[k]; B[2][3 * k + 1] = s.dy[k]; B[2][3 * k + 2] = s.dx[k]; }
      const Sx = new Float64Array(12), Sy = new Float64Array(12);
      for (let c = 0; c < 12; c++) { Sx[c] = 0.5 * (1 - eta) * gA[c] + 0.5 * (1 + eta) * gC[c]; Sy[c] = 0.5 * (1 - xi) * gD[c] + 0.5 * (1 + xi) * gB[c]; }
      for (let r = 0; r < 12; r++) {
        const b0 = B[0][r], b1 = B[1][r], b2 = B[2][r], sx = Sx[r], sy = Sy[r];
        const t0 = Db[0] * b0 + Db[1] * b1, t1 = Db[1] * b0 + Db[0] * b1, t2 = Db[2] * b2;
        if (!(t0 || t1 || t2 || sx || sy)) continue;
        for (let c = 0; c < 12; c++) K[r * 12 + c] += (t0 * B[0][c] + t1 * B[1][c] + t2 * B[2][c] + Ds * (sx * Sx[c] + sy * Sy[c])) * detJ;
      }
    }
    return { K, gA, gC, gD, gB };
  }

  /* ---------- Bandmatrix ---------- */
  function Banded(n, bw) {
    this.n = n; this.bw = bw; this.w = bw + 1; this.a = new Float64Array(n * (bw + 1));
  }
  Banded.prototype.add = function (i, j, v) { if (j < i) { const t = i; i = j; j = t; } this.a[i * this.w + (j - i)] += v; };
  Banded.prototype.factor = function () { // LDLᵀ: a[i,0] = d_i, a[i,k] = L_{i+k,i}
    const { n, bw, w, a } = this;
    for (let i = 0; i < n; i++) {
      const ri = i * w, di = a[ri];
      if (!(di > 0)) throw new Error('FE: Steifigkeitsmatrix nicht positiv definit (kinematisch verschieblich?)');
      const jmax = i + bw < n - 1 ? i + bw : n - 1, rI = ri - i;
      for (let j = i + 1; j <= jmax; j++) {
        const lij = a[rI + j];
        if (lij === 0) continue;
        const f = lij / di, rJ = j * w - j;
        for (let k = j; k <= jmax; k++) a[rJ + k] -= f * a[rI + k];
      }
      const inv = 1 / di;
      for (let j = i + 1; j <= jmax; j++) a[rI + j] *= inv;
    }
  };
  Banded.prototype.solve = function (b) {
    const { n, bw, w, a } = this, x = Float64Array.from(b);
    for (let i = 0; i < n; i++) { const xi = x[i]; if (xi === 0) continue; const jmax = Math.min(n - 1, i + bw); for (let j = i + 1; j <= jmax; j++) x[j] -= a[i * w + (j - i)] * xi; }
    for (let i = 0; i < n; i++) x[i] /= a[i * w];
    for (let i = n - 1; i >= 0; i--) { let s = x[i]; const jmax = Math.min(n - 1, i + bw); for (let j = i + 1; j <= jmax; j++) s -= a[i * w + (j - i)] * x[j]; x[i] = s; }
    return x;
  };

  /* ---------- Lager auf Linien und Flächen ---------- */
  function nodesOnSegment(mesh, s, tol) {
    const out = [];
    const minX = Math.min(s.a.x, s.b.x) - tol, maxX = Math.max(s.a.x, s.b.x) + tol, minY = Math.min(s.a.y, s.b.y) - tol, maxY = Math.max(s.a.y, s.b.y) + tol;
    for (let k = 0; k < mesh.nNodes; k++) {
      const x = mesh.nodeX[k], y = mesh.nodeY[k];
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (G.distPointSeg({ x, y }, s.a, s.b).d <= tol) out.push(k);
    }
    return out;
  }
  /* Länge des Segments, die auf jeden Knoten entfällt (für Federn und Linienmomente). */
  function tributary(mesh, s, nodes) {
    const u = G.norm(G.sub(s.b, s.a)), L = G.dist(s.a, s.b);
    const ts = nodes.map((k) => ({ k, t: Math.max(0, Math.min(L, (mesh.nodeX[k] - s.a.x) * u.x + (mesh.nodeY[k] - s.a.y) * u.y)) })).sort((p, q) => p.t - q.t);
    const out = new Map();
    for (let i = 0; i < ts.length; i++) {
      const lo = i === 0 ? 0 : (ts[i - 1].t + ts[i].t) / 2, hi = i === ts.length - 1 ? L : (ts[i].t + ts[i + 1].t) / 2;
      out.set(ts[i].k, (out.get(ts[i].k) || 0) + Math.max(0, hi - lo));
    }
    return out;
  }

  /* ---------- Berechnung ----------
   * spec: domain, holes, keyX/keyY, meshSize, E, nu, h,
   *   lines: [{ a, b, kind: 'fix' | 'presc', kRot?, nIn?: Einwärtsnormale, mEdge?: Momentenfaktor je Lastfall }]
   *   areas: [{ poly, kind: 'fix' | 'presc' }]           (Stützen, Wandköpfe)
   *   ks: Bettungsmodul [kN/m³] (0 = ohne), springOff?: Uint8Array je Knoten (abgehobene Knoten)
   *   cases: [{ q, rects: [{x0,y0,x1,y1,q}], lineLoads: [{a,b,q}], presc: [c0, cx, cy], mEdge: Faktor }]
   * Ergebnis je Lastfall: Knotenverschiebungen, Elementschnittgrößen, Lagerkräfte. */
  function solve(spec, meshIn) {
    const mesh = meshIn || buildMesh(spec);
    const n = mesh.nNodes, ndof = 3 * n;
    const E = spec.E, nu = spec.nu == null ? 0.2 : spec.nu, h = spec.h;
    const D = E * h * h * h / (12 * (1 - nu * nu)), Db = [D, D * nu, D * (1 - nu) / 2], Ds = 5 / 6 * E / (2 * (1 + nu)) * h;
    // Bandbreite
    let bw = 0;
    for (const e of mesh.elems) { const mn = Math.min(...e.n), mx = Math.max(...e.n); bw = Math.max(bw, 3 * (mx - mn) + 2); }
    const K = new Banded(ndof, bw);
    const cache = new Map();
    for (const e of mesh.elems) {
      const key = e.a.toFixed(6) + 'x' + e.b.toFixed(6);
      let st = cache.get(key);
      if (!st) { st = elemStiffness(e.a, e.b, Db, Ds); cache.set(key, st); }
      e.st = st;
      const dofs = [];
      for (const k of e.n) dofs.push(3 * k, 3 * k + 1, 3 * k + 2);
      for (let r = 0; r < 12; r++) for (let c = r; c < 12; c++) { const v = st.K[r * 12 + c]; if (v) K.add(dofs[r], dofs[c], v); }
    }
    let maxDiag = 0;
    for (let i = 0; i < ndof; i++) maxDiag = Math.max(maxDiag, K.a[i * K.w]);
    const pen = maxDiag * 1e7;

    // Lagerknoten
    const tolOf = () => Math.max(0.02, 0.51 * Math.min(...mesh.xs.slice(1).map((x, i) => x - mesh.xs[i]), ...mesh.ys.slice(1).map((y, i) => y - mesh.ys[i])));
    const tol = Math.min(0.06, tolOf());
    const sup = new Map(); // Knoten -> 'fix' | 'presc'
    const rot = []; // { k, nx, ny, kr }
    const edgeM = []; // { k, nx, ny, m } m je Fall mit Faktor
    for (const L of spec.lines || []) {
      const nodes = nodesOnSegment(mesh, L, Math.max(tol, L.tol || 0));
      for (const k of nodes) if (sup.get(k) !== 'presc') sup.set(k, L.kind);
      if (L.kRot || L.mEdge) {
        const tr = tributary(mesh, L, nodes), nIn = L.nIn || { x: 0, y: 0 };
        for (const [k, len] of tr) {
          if (L.kRot) rot.push({ k, nx: nIn.x, ny: nIn.y, kr: L.kRot * len });
          if (L.mEdge) edgeM.push({ k, nx: nIn.x, ny: nIn.y, m: L.mEdge * len });
        }
      }
    }
    for (const Ar of spec.areas || []) {
      const b = G.bbox(Ar.poly);
      for (let k = 0; k < n; k++) {
        const x = mesh.nodeX[k], y = mesh.nodeY[k];
        if (x < b.x0 - 1e-6 || x > b.x1 + 1e-6 || y < b.y0 - 1e-6 || y > b.y1 + 1e-6) continue;
        if (G.pointInPolygon({ x, y }, Ar.poly) || onPolyBoundary({ x, y }, Ar.poly)) sup.set(k, Ar.kind === 'presc' ? 'presc' : (sup.get(k) || 'fix'));
      }
    }
    // Drehfedern (Wand als Rahmen) und Bettung
    for (const r of rot) {
      const i1 = 3 * r.k + 1, i2 = 3 * r.k + 2;
      K.add(i1, i1, r.kr * r.nx * r.nx); K.add(i2, i2, r.kr * r.ny * r.ny); K.add(i1, i2, r.kr * r.nx * r.ny);
    }
    const ks = spec.ks || 0, off = spec.springOff;
    if (ks > 0) for (let k = 0; k < n; k++) if (!(off && off[k])) K.add(3 * k, 3 * k, ks * mesh.area[k]);
    const supNodes = [...sup.keys()];
    for (const k of supNodes) K.add(3 * k, 3 * k, pen);
    K.factor();

    const xc = spec.xc || 0, yc = spec.yc || 0;
    const results = (spec.cases || []).map((cs) => {
      const F = new Float64Array(ndof);
      // Flächenlast (Knotenlasten = q · Einzugsfläche; für bilineare Ansätze konsistent)
      for (let ie = 0; ie < mesh.elems.length; ie++) {
        const e = mesh.elems[ie];
        let q = cs.q || 0;
        if (cs.rects) for (const r of cs.rects) if (e.cx > r.x0 && e.cx < r.x1 && e.cy > r.y0 && e.cy < r.y1) q += r.q;
        if (cs.elemQ) q += cs.elemQ[ie] || 0;
        if (cs.gridQ) {
          const gq = cs.gridQ, ci = bsearch(gq.xs, e.cx), cj = bsearch(gq.ys, e.cy);
          if (ci >= 0 && cj >= 0) { const c = gq.comp[ci * gq.ny + cj]; if (c >= 0) q += gq.f * gq.val[c]; }
        }
        if (cs.zones) for (const z of cs.zones) if (G.pointInPolygon({ x: e.cx, y: e.cy }, z.poly) === !z.outside) q += z.q;
        if (cs.profileY) q += profileAt(cs.profileY, e.cy); // linear veränderlich mit y (Erd- und Wasserdruck auf Wände)
        if (!q) continue;
        const f = q * e.a * e.b / 4;
        for (const k of e.n) F[3 * k] += f;
      }
      for (const ll of cs.lineLoads || []) {
        const nodes = nodesOnSegment(mesh, ll, Math.max(tol, 0.5 * (mesh.xs[1] - mesh.xs[0])));
        if (!nodes.length) continue;
        const tr = tributary(mesh, ll, nodes);
        let sum = 0; for (const v of tr.values()) sum += v;
        const L = G.dist(ll.a, ll.b), scale = sum > 0 ? L / sum : 0;
        for (const [k, len] of tr) F[3 * k] += ll.q * len * scale;
      }
      for (const pl of cs.points || []) {
        let best = -1, bd = Infinity;
        for (let k = 0; k < n; k++) { const d = Math.hypot(mesh.nodeX[k] - pl.x, mesh.nodeY[k] - pl.y); if (d < bd) { bd = d; best = k; } }
        if (best >= 0) F[3 * best] += pl.P;
      }
      const mf = cs.mEdge || 0;
      if (mf) for (const em of edgeM) { F[3 * em.k + 1] -= mf * em.m * em.nx; F[3 * em.k + 2] -= mf * em.m * em.ny; }
      const pr = cs.presc || [0, 0, 0];
      for (const k of supNodes) {
        const u0 = sup.get(k) === 'presc' ? pr[0] + pr[1] * (mesh.nodeX[k] - xc) + pr[2] * (mesh.nodeY[k] - yc) : 0;
        if (u0) F[3 * k] += pen * u0;
      }
      const U = K.solve(F);
      // Lagerkräfte (positiv = nach oben auf die Platte)
      const R = new Float64Array(n);
      for (const k of supNodes) {
        const u0 = sup.get(k) === 'presc' ? pr[0] + pr[1] * (mesh.nodeX[k] - xc) + pr[2] * (mesh.nodeY[k] - yc) : 0;
        R[k] = pen * (U[3 * k] - u0);
      }
      return { U, R, F };
    });
    return { mesh, results, sup, supNodes, D, Db, Ds, ks, h, E, nu };
  }

  /* Stückweise linearer Verlauf [[y, q], …] (aufsteigend nach y), außerhalb konstant fortgesetzt. */
  function profileAt(pr, y) {
    if (!pr.length) return 0;
    if (y <= pr[0][0]) return pr[0][1];
    for (let i = 1; i < pr.length; i++) if (y <= pr[i][0]) { const [y0, q0] = pr[i - 1], [y1, q1] = pr[i]; return y1 - y0 > 1e-12 ? q0 + (q1 - q0) * (y - y0) / (y1 - y0) : q1; }
    return pr[pr.length - 1][1];
  }

  /* Index des Intervalls [xs[i], xs[i+1]], das v enthält, sonst −1. */
  function bsearch(xs, v) {
    let lo = 0, hi = xs.length - 1;
    if (v < xs[0] || v > xs[hi]) return -1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= v) lo = m; else hi = m; }
    return lo;
  }

  function onPolyBoundary(p, poly) {
    for (let i = 0; i < poly.length; i++) if (G.distPointSeg(p, poly[i], poly[(i + 1) % poly.length]).d < 1e-6) return true;
    return false;
  }

  /* Schnittgrößen je Element (Mitte): mx, my, mxy [kNm/m], qx, qy [kN/m] für Verschiebungsvektor U. */
  function elemForces(sol, U) {
    const { mesh, Db, Ds } = sol, ne = mesh.elems.length;
    const mx = new Float64Array(ne), my = new Float64Array(ne), mxy = new Float64Array(ne), qx = new Float64Array(ne), qy = new Float64Array(ne);
    for (let i = 0; i < ne; i++) {
      const e = mesh.elems[i], st = e.st, u = new Float64Array(12);
      for (let k = 0; k < 4; k++) { u[3 * k] = U[3 * e.n[k]]; u[3 * k + 1] = U[3 * e.n[k] + 1]; u[3 * k + 2] = U[3 * e.n[k] + 2]; }
      // Krümmungen in der Mitte: dN/dx = ±1/(2a)… (ξ = η = 0)
      let kx = 0, ky = 0, kxy = 0;
      for (let k = 0; k < 4; k++) {
        const dx = 0.25 * XI[k] * 2 / e.a, dy = 0.25 * ETA[k] * 2 / e.b;
        kx += dx * u[3 * k + 1]; ky += dy * u[3 * k + 2]; kxy += dy * u[3 * k + 1] + dx * u[3 * k + 2];
      }
      mx[i] = -(Db[0] * kx + Db[1] * ky); my[i] = -(Db[1] * kx + Db[0] * ky); mxy[i] = -Db[2] * kxy;
      let gx = 0, gy = 0;
      for (let c = 0; c < 12; c++) { gx += 0.5 * (st.gA[c] + st.gC[c]) * u[c]; gy += 0.5 * (st.gD[c] + st.gB[c]) * u[c]; }
      qx[i] = Ds * gx; qy[i] = Ds * gy;
    }
    return { mx, my, mxy, qx, qy };
  }

  /* Elementwerte auf Knoten mitteln (für Darstellung und Bemessung an Linien). */
  function toNodes(mesh, vals) {
    const s = new Float64Array(mesh.nNodes), c = new Float64Array(mesh.nNodes);
    mesh.elems.forEach((e, i) => { for (const k of e.n) { s[k] += vals[i]; c[k] += 1; } });
    for (let k = 0; k < mesh.nNodes; k++) if (c[k]) s[k] /= c[k];
    return s;
  }

  /* Knotenwerte aus Elementmitten: im Inneren Mittel der vier Nachbarelemente, an Rändern lineare Ausgleichsebene über
   * zwei Elementringe (extrapoliert z. B. das Einspannmoment an den Rand). Einmal je Netz als dünne Gewichtsmatrix. */
  function recovery(mesh) {
    if (mesh._rec) return mesh._rec;
    const { nx, ny, xs, ys, act } = mesh;
    const idx = new Int32Array(nx * ny).fill(-1);
    mesh.elems.forEach((e, i) => { idx[e.i * ny + e.j] = i; });
    const rows = [];
    for (let k = 0; k < mesh.nNodes; k++) {
      const I = mesh.nodeIJ[2 * k], J = mesh.nodeIJ[2 * k + 1], x0 = xs[I], y0 = ys[J];
      let ring1 = [];
      for (let i = I - 1; i <= I; i++) for (let j = J - 1; j <= J; j++) if (i >= 0 && j >= 0 && i < nx && j < ny && act[i * ny + j]) ring1.push(idx[i * ny + j]);
      // Knoten auf einer Bereichsgrenze: nur Elemente des inneren Bereichs
      const reg = ring1.some((e) => mesh.elems[e].reg === 1) ? 1 : 0;
      const mixed = ring1.some((e) => mesh.elems[e].reg !== reg);
      ring1 = ring1.filter((e) => mesh.elems[e].reg === reg);
      if (ring1.length === 4 && !mixed) { rows.push(ring1.map((e) => [e, 0.25])); continue; }
      // Ausgleichsfläche zweiten Grades über drei Elementringe (gekrümmter Momentenverlauf zum Rand hin)
      const pts = [];
      let hl = 0;
      for (let i = I - 3; i <= I + 2; i++) for (let j = J - 3; j <= J + 2; j++) if (i >= 0 && j >= 0 && i < nx && j < ny && act[i * ny + j]) {
        const e = mesh.elems[idx[i * ny + j]];
        if (e.reg !== reg) continue;
        pts.push({ e: idx[i * ny + j], dx: e.cx - x0, dy: e.cy - y0 });
        hl = Math.max(hl, e.a, e.b);
      }
      const row = fitRow(pts, hl, true) || fitRow(pts, hl, false);
      rows.push(row || ring1.map((e) => [e, 1 / ring1.length]));
    }
    mesh._rec = rows;
    return rows;
  }
  /* Gewichte für den Funktionswert im Ursprung aus einer Ausgleichsfläche (linear oder quadratisch). */
  function fitRow(pts, hl, quad) {
    const nb = quad ? 6 : 3;
    if (pts.length < nb + 1) return null;
    const basis = (dx, dy) => { const u = dx / hl, v = dy / hl; return quad ? [1, u, v, u * u, v * v, u * v] : [1, u, v]; };
    const M = Array.from({ length: nb }, () => new Array(nb).fill(0));
    for (const q of pts) { const r = basis(q.dx, q.dy); for (let a = 0; a < nb; a++) for (let b = 0; b < nb; b++) M[a][b] += r[a] * r[b]; }
    const inv = invN(M);
    if (!inv) return null;
    return pts.map((q) => { const r = basis(q.dx, q.dy); let w = 0; for (let b = 0; b < nb; b++) w += inv[0][b] * r[b]; return [q.e, w]; });
  }
  function invN(m) {
    const n = m.length, a = m.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
      if (Math.abs(a[piv][c]) < 1e-9) return null;
      [a[c], a[piv]] = [a[piv], a[c]];
      const d = a[c][c];
      for (let k = 0; k < 2 * n; k++) a[c][k] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; if (f) for (let k = 0; k < 2 * n; k++) a[r][k] -= f * a[c][k]; }
    }
    return a.map((r) => r.slice(n));
  }
  function inv3(m) {
    const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12 * Math.max(1, Math.abs(a * e * i))) return null;
    return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
  }
  function recover(mesh, vals) {
    const rows = recovery(mesh), out = new Float64Array(mesh.nNodes);
    for (let k = 0; k < rows.length; k++) { let s = 0; for (const [e, w] of rows[k]) s += w * vals[e]; out[k] = s; }
    return out;
  }

  /* Linearkombination von Verschiebungsvektoren. */
  function combine(list, coeffs) {
    const out = new Float64Array(list[0].length);
    list.forEach((v, j) => { const c = coeffs[j]; if (c) for (let i = 0; i < out.length; i++) out[i] += c * v[i]; });
    return out;
  }

  /* Bemessungsmomente nach Wood/Armer aus mx, my, mxy: unten (Feld, Zug unten) und oben (Zug oben), je ≥ 0. */
  function woodArmer(mx, my, mxy) {
    const a = Math.abs(mxy);
    let bx = mx + a, by = my + a;
    if (bx < 0) { bx = 0; by = mx !== 0 ? my + Math.abs(mxy * mxy / mx) : my; }
    else if (by < 0) { by = 0; bx = my !== 0 ? mx + Math.abs(mxy * mxy / my) : mx; }
    if (bx < 0) bx = 0; if (by < 0) by = 0;
    let tx = -mx + a, ty = -my + a;
    if (tx < 0) { tx = 0; ty = mx !== 0 ? -my + Math.abs(mxy * mxy / mx) : -my; }
    else if (ty < 0) { ty = 0; tx = my !== 0 ? -mx + Math.abs(mxy * mxy / my) : -mx; }
    if (tx < 0) tx = 0; if (ty < 0) ty = 0;
    return { bx, by, tx, ty };
  }

  BP.fe = { buildMesh, solve, elemForces, toNodes, recover, recovery, combine, woodArmer, elemStiffness, Banded };
})(typeof window !== 'undefined' ? window : globalThis);
