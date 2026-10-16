/* Plattenmodelle für Decke und Bodenplatte als FE-Aufgaben (reine Daten) und deren Auswertung zu Hüllkurven.
 * Läuft im Hauptprogramm, in Node und im Web Worker (nur BP.geo und BP.fe nötig).
 *
 * Decke: Platte über die Außenkontur, Lager auf den Achsen der Außenwände (Drehfeder aus der Wandsteifigkeit, Rahmenecke)
 *   und der tragenden Innenwände bzw. Stützen. Lastfälle charakteristisch: G, Q, Q schachbrettartig (±Q/2 je Feld), W
 *   (Einspannmoment der Außenwand aus Erddruck, Bemessungswert). Kombinationen nach EC0.
 * Bodenplatte: elastisch gebettet (Bettungsmodul, zwei Grenzwerte), Wände und Stützen als steifer Kasten: ihre Achsen
 *   verschieben sich wie eine Ebene s0 + ax·x + ay·y, die aus dem Gleichgewicht mit den Lasten von oben folgt.
 *   Wasserdruck als Flächenlast von unten. Wo die Sohle rechnerisch klafft, wird die Bettung abgeschaltet und neu gerechnet. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const G = BP.geo, FE = BP.fe;

  /* Stabiler Schlüssel einer Aufgabe (für den Zwischenspeicher). */
  function key(job) {
    const s = JSON.stringify(job, (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));
    let h1 = 0x811c9dc5, h2 = 0;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (h2 * 31 + c) | 0; }
    return job.kind + ':' + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + ':' + s.length;
  }

  /* Knoten in Lagerbereichen (zwischen den Wandflächen bzw. in Stützen) und Abstand jedes Elements zum nächsten Auflagerrand. */
  function supportGeometry(job, mesh) {
    const inSup = new Uint8Array(mesh.nNodes), faceDist = new Float64Array(mesh.elems.length).fill(Infinity);
    const bands = job.bands || [];
    const inner = job.inner, out = job.outer;
    const distToBands = (pt) => {
      let d = Infinity, inside = false;
      for (const b of bands) {
        const r = G.distPointSeg(pt, b.a, b.b);
        const along = r.t > 1e-9 && r.t < 1 - 1e-9 ? r.d : r.d; // Enden wie Mitte
        if (along < b.t / 2 - 1e-6) inside = true;
        d = Math.min(d, Math.max(0, along - b.t / 2));
      }
      for (const c of job.columns || []) {
        const dx = Math.max(0, Math.abs(pt.x - c.x) - c.bx / 2), dy = Math.max(0, Math.abs(pt.y - c.y) - c.by / 2);
        if (dx === 0 && dy === 0) inside = true;
        d = Math.min(d, Math.hypot(dx, dy));
      }
      if (inner && out) {
        let dIn = Infinity;
        for (let i = 0; i < inner.length; i++) dIn = Math.min(dIn, G.distPointSeg(pt, inner[i], inner[(i + 1) % inner.length]).d);
        const onFace = dIn < 1e-6, inInner = onFace || G.pointInPolygon(pt, inner), inOut = G.pointInPolygon(pt, out);
        if (!inInner && inOut) inside = true;
        d = Math.min(d, inInner ? dIn : 0);
      }
      return { d, inside };
    };
    // Abstand jedes Knotens zum nächsten Auflager bzw. Aussparungsrand (Bereiche mit Singularitäten der Plattentheorie)
    const nodeDist = new Float64Array(mesh.nNodes);
    const holes = job.holes || [];
    for (let k = 0; k < mesh.nNodes; k++) {
      const pt = { x: mesh.nodeX[k], y: mesh.nodeY[k] };
      const r = distToBands(pt);
      // Knoten genau auf der Wandfläche gehören zur Platte (Bemessung am Auflagerrand)
      if (r.inside) inSup[k] = 1;
      let dh = Infinity;
      for (const h of holes) for (let i = 0; i < h.length; i++) dh = Math.min(dh, G.distPointSeg(pt, h[i], h[(i + 1) % h.length]).d);
      nodeDist[k] = r.inside ? 0 : Math.min(r.d, dh);
    }
    mesh.elems.forEach((e, i) => { const r = distToBands({ x: e.cx, y: e.cy }); faceDist[i] = r.inside ? -1 : r.d; });
    return { inSup, faceDist, nodeDist };
  }

  /* Hüllkurven der Bemessungsmomente (Wood/Armer) je Knoten über mehrere Kombinationen. */
  function nodal(mesh, f) { return { mx: FE.recover(mesh, f.mx), my: FE.recover(mesh, f.my), mxy: FE.recover(mesh, f.mxy) }; }

  /* Mittelung der Plattenmomente über ein Quadrat der Seitenlänge 2·a um jeden Knoten (flächengewichtet, nur Knoten der Platte).
   * An Stützen, Wandenden und einspringenden Ecken hat die Plattentheorie Singularitäten: die Knotenwerte wachsen mit
   * feinerem Netz über alle Grenzen. Bemessen wird mit dem Mittelwert über die mitwirkende Breite (a = d, Breite 2d ≈ c + d nach
   * Rombach, FEM im Betonbau); in glatten Feldern ändert die Mittelung praktisch nichts. Summen über Präfixsummen, O(n). */
  function smoother(mesh, a) {
    const NX = mesh.nx + 1, NY = mesh.ny + 1, xs = mesh.xs, ys = mesh.ys, n = mesh.nNodes;
    const lo = (arr, v) => { let l = 0, h = arr.length - 1; while (l < h) { const m = (l + h) >> 1; if (arr[m] < v - 1e-9) l = m + 1; else h = m; } return l; };
    const hi = (arr, v) => { let l = 0, h = arr.length - 1; while (l < h) { const m = (l + h + 1) >> 1; if (arr[m] > v + 1e-9) h = m - 1; else l = m; } return l; };
    const win = new Int32Array(4 * n);
    for (let k = 0; k < n; k++) {
      const x = mesh.nodeX[k], y = mesh.nodeY[k];
      win[4 * k] = lo(xs, x - a); win[4 * k + 1] = hi(xs, x + a); win[4 * k + 2] = lo(ys, y - a); win[4 * k + 3] = hi(ys, y + a);
    }
    const W = (NX + 1) * (NY + 1), PA = new Float64Array(W), PV = new Float64Array(W);
    const idx = (i, j) => i * (NY + 1) + j;
    const sum = (P, i0, i1, j0, j1) => P[idx(i1 + 1, j1 + 1)] - P[idx(i0, j1 + 1)] - P[idx(i1 + 1, j0)] + P[idx(i0, j0)];
    const prefix = (P, val) => {
      P.fill(0);
      for (let k = 0; k < n; k++) P[idx(mesh.nodeIJ[2 * k] + 1, mesh.nodeIJ[2 * k + 1] + 1)] = val(k);
      for (let i = 1; i <= NX; i++) for (let j = 1; j <= NY; j++) P[idx(i, j)] += P[idx(i - 1, j)] + P[idx(i, j - 1)] - P[idx(i - 1, j - 1)];
    };
    prefix(PA, (k) => mesh.area[k]);
    const area = new Float64Array(n);
    for (let k = 0; k < n; k++) area[k] = sum(PA, win[4 * k], win[4 * k + 1], win[4 * k + 2], win[4 * k + 3]);
    return (arr) => {
      prefix(PV, (k) => arr[k] * mesh.area[k]);
      const out = new Float64Array(n);
      for (let k = 0; k < n; k++) out[k] = area[k] > 0 ? sum(PV, win[4 * k], win[4 * k + 1], win[4 * k + 2], win[4 * k + 3]) / area[k] : arr[k];
      return out;
    };
  }
  function envelope(mesh, list) {
    const n = mesh.nNodes, env = { bx: new Float64Array(n), by: new Float64Array(n), tx: new Float64Array(n), ty: new Float64Array(n) };
    for (const f of list) {
      const { mx, my, mxy } = f;
      for (let k = 0; k < n; k++) {
        const wa = FE.woodArmer(mx[k], my[k], mxy[k]);
        if (wa.bx > env.bx[k]) env.bx[k] = wa.bx; if (wa.by > env.by[k]) env.by[k] = wa.by;
        if (wa.tx > env.tx[k]) env.tx[k] = wa.tx; if (wa.ty > env.ty[k]) env.ty[k] = wa.ty;
      }
    }
    return env;
  }

  /* Rohwerte für die Darstellung: Extremwerte je Knoten. */
  function rawEnvelope(mesh, list) {
    const n = mesh.nNodes, o = { mxMax: new Float64Array(n).fill(-Infinity), mxMin: new Float64Array(n).fill(Infinity), myMax: new Float64Array(n).fill(-Infinity), myMin: new Float64Array(n).fill(Infinity), mxyAbs: new Float64Array(n) };
    for (const f of list) {
      const { mx, my, mxy } = f;
      for (let k = 0; k < n; k++) {
        o.mxMax[k] = Math.max(o.mxMax[k], mx[k]); o.mxMin[k] = Math.min(o.mxMin[k], mx[k]);
        o.myMax[k] = Math.max(o.myMax[k], my[k]); o.myMin[k] = Math.min(o.myMin[k], my[k]);
        o.mxyAbs[k] = Math.max(o.mxyAbs[k], Math.abs(mxy[k]));
      }
    }
    return o;
  }

  /* Querkraft-Hülle je Element und Lage der Zugseite (1 = oben, Stützbereich). */
  function shearEnvelope(mesh, list) {
    const ne = mesh.elems.length, v = new Float64Array(ne), vx = new Float64Array(ne), vy = new Float64Array(ne), hog = new Uint8Array(ne);
    for (const f of list) {
      for (let i = 0; i < ne; i++) {
        const vv = Math.hypot(f.qx[i], f.qy[i]);
        if (vv > v[i]) { v[i] = vv; hog[i] = (f.mx[i] + f.my[i]) < 0 ? 1 : 0; }
        vx[i] = Math.max(vx[i], Math.abs(f.qx[i])); vy[i] = Math.max(vy[i], Math.abs(f.qy[i]));
      }
    }
    return { v, vx, vy, hog };
  }

  /* Lagerkräfte je Linie (Wand) und Fläche (Stütze): größter Wert je m und Summe. */
  function reactions(job, mesh, sol, R, fsign) {
    const out = { lines: [], areas: [] };
    const tol = 0.06;
    // Jeder Lagerknoten zählt genau einmal: Knoten in Stützen gehören der Stütze, Knoten an mehreren Linien (Ecken,
    // Kreuzungen) werden anteilig verteilt – sonst würden negative Eckkräfte doppelt gezählt.
    const inCol = (k) => (job.columns || []).some((c) => Math.abs(mesh.nodeX[k] - c.x) <= c.bx / 2 + 1e-6 && Math.abs(mesh.nodeY[k] - c.y) <= c.by / 2 + 1e-6);
    const share = new Map();
    for (const k of sol.supNodes) {
      if (inCol(k)) continue;
      let n = 0;
      for (const L of job.lines || []) if (G.distPointSeg({ x: mesh.nodeX[k], y: mesh.nodeY[k] }, L.a, L.b).d < tol) n++;
      if (n) share.set(k, 1 / n);
    }
    for (const L of job.lines || []) {
      const u = G.norm(G.sub(L.b, L.a)), len = G.dist(L.a, L.b);
      const pts = [];
      for (const k of sol.supNodes) {
        if (!share.has(k)) continue;
        const r = G.distPointSeg({ x: mesh.nodeX[k], y: mesh.nodeY[k] }, L.a, L.b);
        if (r.d < tol) pts.push({ k, t: r.t * len });
      }
      pts.sort((a, b) => a.t - b.t);
      let sum = 0, mx = 0;
      const iv = [];
      for (let i = 0; i < pts.length; i++) {
        const lo = i ? (pts[i - 1].t + pts[i].t) / 2 : 0, hi = i < pts.length - 1 ? (pts[i].t + pts[i + 1].t) / 2 : len;
        const f = fsign * R[pts[i].k] * share.get(pts[i].k);
        sum += f;
        if (hi - lo > 1e-6) { mx = Math.max(mx, f / (hi - lo)); iv.push([lo, hi, f]); }
      }
      // größter Mittelwert über 1 m Wandlänge (Lastausbreitung in der Wand; Spitzen an Wandenden sind Netzsingularitäten)
      const W = Math.min(1.0, len);
      let win = 0;
      // Fenster beginnend an jedem Intervallanfang und endend an jedem Intervallende
      const starts = iv.map(([lo]) => lo).concat(iv.map(([, hi]) => hi - W), [Math.max(0, len - W)]);
      for (const s0 of starts) {
        const a = Math.max(0, Math.min(s0, Math.max(0, len - W))), b = a + W;
        let sm = 0;
        for (const [lo, hi, f] of iv) { const ov = Math.min(hi, b) - Math.max(lo, a); if (ov > 0) sm += f * ov / (hi - lo); }
        win = Math.max(win, sm / W);
      }
      out.lines.push({ id: L.id, outer: !!L.outer, sum, max: mx, win, len, u, a: L.a, b: L.b, iv: L.beam ? iv.map(([lo, hi, f]) => [Math.round(lo * 1e4) / 1e4, Math.round(hi * 1e4) / 1e4, f]) : null });
    }
    for (const c of job.columns || []) {
      let sum = 0;
      for (const k of sol.supNodes) if (Math.abs(mesh.nodeX[k] - c.x) <= c.bx / 2 + 1e-6 && Math.abs(mesh.nodeY[k] - c.y) <= c.by / 2 + 1e-6) sum += fsign * R[k];
      out.areas.push({ id: c.id, sum });
    }
    return out;
  }

  function lin(results, coeffs, field) { return FE.combine(results.map((r) => r[field]), coeffs); }

  /* ---------- Decke ---------- */
  function runRoof(job) {
    const t0 = Date.now();
    const spec = Object.assign({}, job, { cases: job.cases });
    const sol = FE.solve(spec);
    const mesh = sol.mesh, U = sol.results.map((r) => r.U), Rr = sol.results.map((r) => r.R);
    const forces = (coeffs) => FE.elemForces(sol, FE.combine(U, coeffs));
    const uls = job.combos.uls.map((c) => ({ name: c.name, coeffs: c.c, f: forces(c.c) }));
    const sls = job.combos.sls.map((c) => ({ name: c.name, coeffs: c.c, f: forces(c.c), U: FE.combine(U, c.c) }));
    const res = finish(job, sol, uls, sls, (coeffs) => FE.combine(Rr, coeffs), 1, t0);
    // Charakteristische Auflagerkräfte aus G und Q je Wand und Stütze (Lasten für die Platte darunter)
    // Lagerlast E (Füllung von Behältern) als eigener Fall, damit sie mit ψ0 = 1,0 / ψ2 = 0,8 weitergegeben wird
    const iE = job.cases.findIndex((c) => c.name === 'E');
    const rg = reactions(job, sol.mesh, sol, Rr[0], 1), rq = reactions(job, sol.mesh, sol, Rr[1], 1), re = iE >= 0 ? reactions(job, sol.mesh, sol, Rr[iE], 1) : null;
    // Unterzüge: Verlauf der Auflagerkraft längs der Achse je Lastfall (Intervalle [von, bis, Kraft])
    res.reactCase = { lines: rg.lines.map((l, i) => ({ id: l.id, len: l.len, a: l.a, b: l.b, g: l.sum, q: rq.lines[i].sum, e: re ? re.lines[i].sum : 0,
      pg: l.iv, pq: rq.lines[i].iv, pe: re ? re.lines[i].iv : null })), areas: rg.areas.map((a, i) => ({ id: a.id, g: a.sum, q: rq.areas[i].sum, e: re ? re.areas[i].sum : 0 })) };
    return res;
  }

  /* ---------- Bodenplatte ---------- */
  function runFloor(job) {
    const t0 = Date.now();
    const variants = [];
    // Kontakt je Kombinationsgruppe: Kombinationen mit Wasserdruck von unten getrennt von den Schwerkraftkombinationen,
    // damit abhebende Bereiche des Auftriebsfalls nicht die Bettung der übrigen Kombinationen abschalten
    const iW = job.cases.findIndex((c) => c.name === 'Wasser');
    const allC = job.combos.uls.concat(job.combos.sls);
    const groups = [allC.filter((c) => !(iW >= 0 && c.c[iW])), allC.filter((c) => iW >= 0 && c.c[iW])].filter((g) => g.length);
    let meshRef = null;
    for (const ks of job.ksList) groups.forEach((grp, gi) => {
      let off = null, sol = null, combosOut = null;
      for (let it = 0; it < 5; it++) {
        sol = FE.solve(Object.assign({}, job, { ks, springOff: off }), sol ? sol.mesh : meshRef);
        meshRef = meshRef || sol.mesh;
        const mesh = sol.mesh, U = sol.results.map((r) => r.U), R = sol.results.map((r) => r.R);
        const nApp = job.cases.length - 3; // letzte drei Fälle: Einheitsverschiebungen S0, SX, SY
        // Kraft der Wände auf die Platte (nach unten) und Momente um (xc, yc) je Lastfall
        const sums = R.map((Rv) => {
          let F = 0, Mx = 0, My = 0;
          for (const k of sol.supNodes) { if (sol.sup.get(k) !== 'presc') continue; const f = -Rv[k]; F += f; Mx += f * (mesh.nodeX[k] - job.xc); My += f * (mesh.nodeY[k] - job.yc); }
          return [F, Mx, My];
        });
        const combos = grp.map((c) => {
          const base = c.c.slice(0, nApp);
          const rhs = [0, 1, 2].map((r) => (r === 0 ? c.sup : 0) - base.reduce((s, v, j) => s + v * sums[j][r], 0));
          const A = [0, 1, 2].map((r) => [0, 1, 2].map((j) => sums[nApp + j][r]));
          const x = solve3(A, rhs) || [0, 0, 0];
          const coeffs = base.concat(x);
          return { name: c.name, sls: !!c.isSls, coeffs, U: FE.combine(U, coeffs) };
        });
        // Klaffende Sohle: Bettung abschalten, wo der Bodendruck negativ wird (alle Kombinationen gemeinsam)
        let changed = false;
        const nextOff = off ? Uint8Array.from(off) : new Uint8Array(mesh.nNodes);
        if (ks > 0) for (const c of combos) for (let k = 0; k < mesh.nNodes; k++) if (!nextOff[k] && c.U[3 * k] < -1e-6) { nextOff[k] = 1; changed = true; }
        combosOut = { combos, R, sums };
        if (!changed) break;
        off = nextOff;
      }
      variants.push({ ks, sol, combos: combosOut.combos, R: combosOut.R, off, group: gi });
    });
    // Hülle über beide Bettungsmoduln
    const sol = variants[0].sol, mesh = sol.mesh;
    const uls = [], sls = [];
    for (const v of variants) for (const c of v.combos) {
      const f = FE.elemForces(v.sol, c.U);
      (c.sls ? sls : uls).push({ name: c.name + ' (ks ' + Math.round(v.ks / 1000) + ' MN/m³)', coeffs: c.coeffs, f, U: c.U, ks: v.ks, off: v.off });
    }
    const res = finish(job, sol, uls, sls, null, 1, t0);
    // Bodenpressung (Bemessung) je Knoten, größter Wert über die Varianten
    const n = mesh.nNodes, soil = new Float64Array(n);
    let pMax = 0, pMean = 0, aSum = 0, lift = 0;
    for (const c of uls) for (let k = 0; k < n; k++) {
      if (c.off && c.off[k]) continue;
      const p = c.ks * Math.max(0, c.U[3 * k]);
      if (p > soil[k]) soil[k] = p;
    }
    for (let k = 0; k < n; k++) { pMax = Math.max(pMax, soil[k]); pMean += soil[k] * mesh.area[k]; aSum += mesh.area[k]; }
    const vG = variants.filter((v) => v.group === 0);
    for (const v of vG) if (v.off) for (let k = 0; k < n; k++) if (v.off[k]) lift += mesh.area[k] / vG.length;
    res.soil = { p: soil, pMax, pMean: aSum ? pMean / aSum : 0, liftArea: lift };
    // Wandlasten aus der Kombination mit voller Last (erste ULS-Kombination, weicher Boden)
    const R0 = variants[0].sol.results.map((r) => r.R);
    res.react = reactions(job, mesh, sol, FE.combine(R0, uls[0].coeffs), -1);
    return res;
  }

  function solve3(A, b) {
    const M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < 3; c++) {
      let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
    }
    return [0, 1, 2].map((i) => M[i][3] / M[i][i]);
  }

  /* Gemeinsame Auswertung: Hüllkurven, Querkraft, Durchbiegung, Lagerkräfte. */
  function finish(job, sol, uls, sls, reactFn, fsign, t0) {
    const mesh = sol.mesh;
    const sg = supportGeometry(job, mesh);
    // Bemessungsmomente an Auflagern, Stützen, Aussparungsrändern und Einzellasten (Abstand ≤ 1,5·d) über 2·d gemittelt (d ≈ h − 5 cm),
    // im Feld die Knotenwerte selbst; Rohwerte für die Darstellung und die Rahmenecke bleiben ungemittelt
    const dEff = Math.max(0.1, job.h - 0.05), avg = smoother(mesh, dEff);
    // Einzellasten (z. B. abgefangene Stützen) erzeugen unter der Last ebenfalls Singularitäten: dort ebenso mitteln
    const pts = []; for (const c of job.cases || []) for (const pl of c.points || []) pts.push(pl);
    const near = (k) => {
      if (sg.nodeDist[k] <= 1.5 * dEff) return true;
      const x = mesh.nodeX[k], y = mesh.nodeY[k];
      return pts.some((pl) => Math.hypot(Math.max(0, Math.abs(x - pl.x) - (pl.bx || 0) / 2), Math.max(0, Math.abs(y - pl.y) - (pl.by || 0) / 2)) <= 1.5 * dEff);
    };
    const pickArr = (raw, av) => { const o = new Float64Array(raw.length); for (let k = 0; k < raw.length; k++) o[k] = near(k) ? av[k] : raw[k]; return o; };
    const sm = (f) => ({ mx: pickArr(f.mx, avg(f.mx)), my: pickArr(f.my, avg(f.my)), mxy: pickArr(f.mxy, avg(f.mxy)) });
    const nR = uls.map((c) => nodal(mesh, c.f)), nU = nR.map(sm), nS = sls.map((c) => sm(nodal(mesh, c.f)));
    const res = {
      kind: job.kind, key: key(job), ms: 0,
      mesh: { xs: Float64Array.from(mesh.xs), ys: Float64Array.from(mesh.ys), nx: mesh.nx, ny: mesh.ny, nNodes: mesh.nNodes, nodeIJ: mesh.nodeIJ, nodeX: mesh.nodeX, nodeY: mesh.nodeY,
        elemIJ: Int32Array.from(mesh.elems.flatMap((e) => [e.i, e.j])), elemN: Int32Array.from(mesh.elems.flatMap((e) => e.n)), area: mesh.area },
      inSup: sg.inSup, faceDist: sg.faceDist,
      uls: envelope(mesh, nU), raw: rawEnvelope(mesh, nR), avgWidth: 2 * dEff, avgZone: 1.5 * dEff, smoothed: Uint8Array.from({ length: mesh.nNodes }, (_, k) => (near(k) ? 1 : 0)),
      shear: shearEnvelope(mesh, uls.map((c) => c.f)),
      sls: sls.length ? envelope(mesh, nS) : null,
      combos: uls.map((c) => c.name).concat(sls.map((c) => c.name)),
    };
    // Durchbiegung (elastisch, quasi-ständig) und Bodendruck-Vorzeichen
    if (sls.length) {
      const w = new Float64Array(mesh.nNodes);
      for (const c of sls) for (let k = 0; k < mesh.nNodes; k++) w[k] = Math.max(w[k], Math.abs(c.U[3 * k]));
      res.wqp = w;
    }
    if (reactFn) {
      // Lagerkräfte: je Linie und Stütze das Maximum über alle Bemessungskombinationen
      const all = uls.map((c) => reactions(job, mesh, sol, reactFn(c.coeffs), fsign));
      res.react = all[0];
      all.slice(1).forEach((r) => {
        r.lines.forEach((l, i) => { const t = res.react.lines[i]; t.max = Math.max(t.max, l.max); t.win = Math.max(t.win, l.win); t.sum = Math.max(t.sum, l.sum); });
        r.areas.forEach((a, i) => { const t = res.react.areas[i]; t.sum = Math.max(t.sum, a.sum); });
      });
    }
    // Rahmenecke: Moment senkrecht zur Außenwandachse auf der Achse (Innenseite), ohne die Eckbereiche
    let mJ = 0;
    for (const L of job.lines || []) {
      if (!L.outer) continue;
      const len = G.dist(L.a, L.b), nn = L.nIn || { x: 0, y: 0 };
      for (let k = 0; k < mesh.nNodes; k++) {
        const r = G.distPointSeg({ x: mesh.nodeX[k], y: mesh.nodeY[k] }, L.a, L.b);
        if (r.d > 0.02 || r.t * len < 0.5 || (1 - r.t) * len < 0.5) continue;
        for (const f of nR) mJ = Math.max(mJ, Math.abs(f.mx[k] * nn.x * nn.x + f.my[k] * nn.y * nn.y + 2 * f.mxy[k] * nn.x * nn.y));
      }
    }
    res.mJ = mJ;
    res.ms = Date.now() - t0;
    return res;
  }

  /* ---------- Außenwand (Plattenstreifen je Kante) ---------- */
  function runWall(job) {
    const t0 = Date.now();
    const sol = FE.solve(job);
    const U = sol.results.map((r) => r.U);
    const forces = (coeffs) => FE.elemForces(sol, FE.combine(U, coeffs));
    const uls = job.combos.uls.map((c) => ({ name: c.name, coeffs: c.c, f: forces(c.c) }));
    const sls = job.combos.sls.map((c) => ({ name: c.name, coeffs: c.c, f: forces(c.c), U: FE.combine(U, c.c) }));
    return finish(job, sol, uls, sls, null, 1, t0);
  }

  function run(job) {
    if (job.kind === 'floor') return runFloor(job);
    if (job.kind === 'wall') return runWall(job);
    return runRoof(job);
  }

  /* Übertragbare Puffer eines Ergebnisses (für postMessage). */
  function transferables(res) {
    const out = [];
    const walk = (o) => { if (!o || typeof o !== 'object') return; if (ArrayBuffer.isView(o)) { if (!out.includes(o.buffer)) out.push(o.buffer); return; } for (const v of Object.values(o)) walk(v); };
    walk(res);
    return out;
  }

  BP.slabs = { key, run, transferables };
})(typeof window !== 'undefined' ? window : globalThis);
