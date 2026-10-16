/* 3D-Modell mit three.js: Baugrube, Rohbau, Zugänge, Bewehrung, Bauphasen, Schnitt. */
(function (root) {
  const BP = root.BP, G = BP.geo;
  const V = BP.view3d = {};
  let A, renderer, scene, camera, controls, host, groups = {}, clipPlane, built = false, dirty = true;
  const opts = { earth: 'aus', roof: true, rebar: false, cut: false, cutPos: 0.5, day: null };
  const FB = 0.15;

  const COL = {
    concrete: 0xb9bdbb, slabTop: 0xd5d8d6, mw: 0xd8c6ad, gravel: 0xcfc6b5, blinding: 0xa9aeab,
    ins: 0xeed49a, earth: 0xa58a68, earthTop: 0x6b7d55, mound: 0x8c9763, fill: 0xc6b294, water: 0x3d86ba, rebar: 0x9c3d24, steel: 0x5f6763, active: 0xf2b705,
  };

  V.init = function (app) {
    A = app;
    if (!root.THREE) return;
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    renderer.localClippingEnabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xf3f5f4);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
    camera.position.set(18, 14, 18);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.screenSpacePanning = true;
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8f9692, 0.7);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(14, 26, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -25; sc.right = 25; sc.top = 25; sc.bottom = -25; sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    scene.add(sun.target);
    V.sun = sun;
    clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    V.mount(document.getElementById('three'));
    new ResizeObserver(() => resize()).observe(document.getElementById('three'));
    new ResizeObserver(() => resize()).observe(document.getElementById('ganttTop'));
    loop();
  };

  V.available = () => !!renderer;
  V.opts = opts;

  V.mount = function (el) {
    if (!renderer) return;
    host = el;
    el.appendChild(renderer.domElement);
    resize();
  };

  function resize() {
    if (!renderer || !host) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function loop() {
    requestAnimationFrame(loop);
    if (!host || !host.offsetParent) return;
    if (dirty) { build(); dirty = false; }
    controls.update();
    renderer.render(scene, camera);
  }

  V.invalidate = function () { dirty = true; };

  /* ---------- Hilfsfunktionen ---------- */

  function prism(poly, z0, z1, holes) {
    const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));
    if (holes) for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.y))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, z1 - z0), bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, z0, 0);
    return geo;
  }
  function flat(poly, z, holes) {
    const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));
    if (holes) for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.y))));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, z, 0);
    return geo;
  }
  const matCache = {};
  function mat(color, extra) {
    const key = color + JSON.stringify(extra || {});
    if (!matCache[key]) {
      matCache[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, clippingPlanes: [clipPlane], clipShadows: true }, extra || {}));
    }
    return matCache[key];
  }
  function mesh(geo, color, phase, extra, opt) {
    const m = new THREE.Mesh(geo, mat(color, extra));
    m.castShadow = !(opt && opt.noShadow);
    m.receiveShadow = true;
    m.userData.phase = phase;
    m.userData.color = color;
    m.userData.baseExtra = extra || {};
    return m;
  }
  function edgesOf(m) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), new THREE.LineBasicMaterial({ color: 0x4a504d, transparent: true, opacity: 0.35, clippingPlanes: [clipPlane] }));
    e.userData.phase = m.userData.phase;
    e.userData.isEdge = true;
    return e;
  }

  function clearGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      c.traverse((x) => { if (x.geometry) x.geometry.dispose(); });
    }
  }

  /* Wand entlang einer Kante mit Öffnungen in Teilstücke zerlegen. */
  function wallPieces(len, ops, footAt, z0, z1, phase, color, group) {
    const cuts = ops.map((o) => ({ t0: Math.max(0, o.t0), t1: Math.min(len, o.t1), zb: z0 + o.sill, zt: Math.min(z1, z0 + o.sill + o.h) })).sort((a, b) => a.t0 - b.t0);
    let t = 0;
    const add = (ta, tb, za, zb) => {
      if (tb - ta < 1e-4 || zb - za < 1e-4) return;
      const m = mesh(prism(footAt(ta, tb), za, zb), color, phase);
      if (/^w\d*_b$/.test(phase)) m.userData.prep = phase.slice(0, -2);
      group.add(m); group.add(edgesOf(m));
    };
    for (const c of cuts) {
      const t0 = Math.max(c.t0, t); // überlappende Öffnungen nicht doppelt ausbilden
      if (c.t1 <= t0) continue;
      add(t, t0, z0, z1);
      add(t0, c.t1, z0, c.zb);
      add(t0, c.t1, c.zt, z1);
      t = c.t1;
    }
    add(t, len, z0, z1);
  }

  /* ---------- Aufbau ---------- */

  function build() {
    if (!A.q) return;
    const q = A.q, g = q.geo, lv = q.lv, b = A.p.build, e = q.earth;
    const zE = lv.zEntry != null ? lv.zEntry : lv.zFloorTop; // OK Rohboden der Zugangsebene
    const LV = lv.levels || [{ idx: 0, zCeil: lv.zCeil, zFloorTop: lv.zFloorTop, zSlabTop: lv.zRoofTop, tSlab: 0 }], GL = g.L || [g], nL = GL.length;
    const vs = g.vert || { stairs: [], lifts: [] };
    const phW = (i) => (i === nL - 1 ? 'w' : 'w' + i) + '_b'; // Wände je Ebene, wie im Bauablauf
    for (const k of Object.keys(groups)) { clearGroup(groups[k]); scene.remove(groups[k]); }
    groups = {};
    const grp = (name) => { const x = new THREE.Group(); x.name = name; scene.add(x); groups[name] = x; return x; };
    const site = grp('site'), struct = grp('struct'), extra = grp('extra'), rebar = grp('rebar');

    // Gelände
    const bb = G.bbox(e.top.concat(e.toePoly || [], ...g.access.map((a) => a.foot)));
    const m = 6;
    const ground = G.polygonFromRect(bb.x0 - m, bb.y0 - m, bb.x1 + m, bb.y1 + m);
    // Aussparungen in Geländefläche bzw. Wasserspiegel auf Höhe z: Zugangsbauwerke und, wo es diese Höhe erreicht, das Bauwerk selbst
    const outIns = q.env.ins.outIns, tWi = b.insulation.walls || 0;
    const holesAt = (z) => {
      const body = z > lv.zInsBot - 1e-3 && z < lv.hM - b.cover + 1e-3;
      const feet = g.access.filter((a) => z > zE - a.tS - 1e-3).map((a) => {
        if (!body) return a.foot;
        const d = tWi + 0.01; // nicht mit der Bauwerksaussparung überlappen
        return [G.add(a.foot[0], G.mul(a.nn, d)), G.add(a.foot[1], G.mul(a.nn, d)), a.foot[2], a.foot[3]];
      });
      return (body ? [outIns] : []).concat(feet);
    };
    const terrainFull = mesh(flat(ground, 0, holesAt(0)), COL.earthTop, 'terrainFull', { transparent: true, opacity: 1 }, { noShadow: true });
    terrainFull.castShadow = false;
    site.add(terrainFull);
    // Erdblock (Endzustand)
    const bw = bb.w + 2 * m, bh = bb.h + 2 * m, bd = -lv.zPit + 1.2;
    const blockGeo = new THREE.BoxGeometry(bw, bd, bh);
    blockGeo.translate((bb.x0 + bb.x1) / 2, -bd / 2 - 0.005, -(bb.y0 + bb.y1) / 2);
    const block = mesh(blockGeo, COL.earth, 'earthBlock', { transparent: true, opacity: 0.12, depthWrite: false }, { noShadow: true });
    block.castShadow = false; block.receiveShadow = false;
    site.add(block);
    const blockEdges = new THREE.LineSegments(new THREE.EdgesGeometry(blockGeo), new THREE.LineBasicMaterial({ color: 0x8a6f4e, transparent: true, opacity: 0.6, clippingPlanes: [clipPlane] }));
    blockEdges.userData.phase = 'earthBlock'; blockEdges.userData.isEdge = true;
    site.add(blockEdges);
    // Geländelinie, wenn das Erdreich ausgeblendet ist
    const gl = ground.concat([ground[0]]).map((p) => new THREE.Vector3(p.x, 0, -p.y));
    const groundLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(gl), new THREE.LineBasicMaterial({ color: 0x3f6b3a }));
    groundLine.userData.phase = 'groundLine'; groundLine.userData.isEdge = true;
    site.add(groundLine);
    const gridPos = [];
    const outside = (a, bq) => {
      const ins = G.clipSegment(a, bq, e.top);
      const L = G.dist(a, bq), ts = [];
      for (const s of ins) ts.push([G.dist(a, s.a) / L, G.dist(a, s.b) / L].sort((x, y) => x - y));
      ts.sort((x, y) => x[0] - y[0]);
      let t = 0; const out = [];
      for (const [t0, t1] of ts) { if (t0 > t) out.push([t, t0]); t = Math.max(t, t1); }
      if (t < 1) out.push([t, 1]);
      for (const [t0, t1] of out) { const p0 = G.lerp(a, bq, t0), p1 = G.lerp(a, bq, t1); gridPos.push(p0.x, 0, -p0.y, p1.x, 0, -p1.y); }
    };
    for (let x = Math.ceil(ground[0].x); x <= ground[2].x; x += 1) outside({ x, y: ground[0].y }, { x, y: ground[2].y });
    for (let y = Math.ceil(ground[0].y); y <= ground[2].y; y += 1) outside({ x: ground[0].x, y }, { x: ground[2].x, y });
    const rim = e.top.concat([e.top[0]]).map((p) => new THREE.Vector3(p.x, 0, -p.y));
    const rimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rim), new THREE.LineDashedMaterial({ color: 0x8a6f4e, dashSize: 0.4, gapSize: 0.25 }));
    rimLine.computeLineDistances();
    rimLine.userData.phase = 'groundLine'; rimLine.userData.isEdge = true;
    site.add(rimLine);
    const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPos, 3));
    const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x8c9a78, transparent: true, opacity: 0.45 }));
    grid.userData.phase = 'groundLine'; grid.userData.isEdge = true;
    site.add(grid);
    const pitTop = e.top;
    const terrainHole = mesh(flat(ground, 0, [pitTop]), COL.earthTop, 'terrainHole', { transparent: true, opacity: 1 }, { noShadow: true });
    site.add(terrainHole);
    // Baugrube: Böschungen bis Sohle und ab OK Decke (nach Verfüllen)
    const pitAt = (z) => G.offsetPolygon(g.out, e.off + e.k * (z - lv.zPit));
    const pitFaces = (zA, phase) => {
      const lo = pitAt(zA), hi = pitAt(0), pos = [];
      for (let i = 0; i < lo.length; i++) {
        const j = (i + 1) % lo.length;
        const quad = [[lo[i], zA], [lo[j], zA], [hi[j], 0], [hi[i], 0]];
        const v = quad.map(([p, z]) => [p.x, z, -p.y]);
        pos.push(...v[0], ...v[1], ...v[2], ...v[0], ...v[2], ...v[3]);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      return mesh(geo, COL.earth, phase, { transparent: true, opacity: 1 });
    };
    site.add(pitFaces(lv.zPit, 'pitOpen'));
    site.add(mesh(flat(pitAt(lv.zPit), lv.zPit), COL.earth, 'pitOpen', { transparent: true, opacity: 1 }));
    const zFillTop = Math.min(lv.zRoofTop, 0);
    if (zFillTop < -1e-3) site.add(pitFaces(zFillTop, 'pitUpper'));
    const ghost = pitFaces(lv.zPit, 'pitGhost');
    ghost.userData.color = COL.earth; ghost.userData.baseExtra = { transparent: true, opacity: 0.16, depthWrite: false };
    ghost.castShadow = false;
    site.add(ghost);
    site.add(mesh(flat(pitAt(zFillTop + 0.001), zFillTop + 0.001, [outIns]), COL.fill, 'pitUpper', { transparent: true, opacity: 1 }));
    // Erdhügel: ebene Krone und Böschungen bis zum Fuß
    if (lv.mound.on && e.crestPoly && e.toePoly) {
      const hM = lv.hM, mo = lv.mound, lo = e.toePoly, hi = e.crestPoly, pos = [];
      // Höhenraster aus derselben Hügelfläche wie Mengen, Plan und Schnitt (Gehrung über der konvexen Hülle), Zugänge ausgespart
      const zAt = (x, y) => mo.at({ x, y });
      const holes = g.access.map((a) => a.foot);
      const tb = G.bbox(lo), st = Math.max(0.2, Math.min(0.5, Math.max(tb.w, tb.h) / 120));
      const nx = Math.ceil(tb.w / st), ny = Math.ceil(tb.h / st), Z = [];
      for (let j = 0; j <= ny; j++) { const row = []; for (let i = 0; i <= nx; i++) row.push(zAt(tb.x0 + i * st, tb.y0 + j * st)); Z.push(row); }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const z00 = Z[j][i], z10 = Z[j][i + 1], z01 = Z[j + 1][i], z11 = Z[j + 1][i + 1];
        if (Math.max(z00, z10, z01, z11) < 0.005) continue;
        const cx2 = tb.x0 + (i + 0.5) * st, cy2 = tb.y0 + (j + 0.5) * st;
        if (holes.some((h) => G.pointInPolygon({ x: cx2, y: cy2 }, h))) continue;
        const P = (ii, jj, z) => [tb.x0 + ii * st, z + 0.01, -(tb.y0 + jj * st)];
        const a0 = P(i, j, z00), a1 = P(i + 1, j, z10), a2 = P(i + 1, j + 1, z11), a3 = P(i, j + 1, z01);
        pos.push(...a0, ...a1, ...a2, ...a0, ...a2, ...a3);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      sg.computeVertexNormals();
      site.add(mesh(sg, COL.mound, 'mound', { transparent: true, opacity: 0.25, depthWrite: false }, { noShadow: true }));
      const lp = [];
      const ring = (poly, z) => poly.forEach((p, i) => { const q2 = poly[(i + 1) % poly.length]; lp.push(p.x, z, -p.y, q2.x, z, -q2.y); });
      ring(hi, hM + 0.02); ring(lo, 0.02);
      lo.forEach((p, i) => lp.push(p.x, 0.02, -p.y, hi[i].x, hM + 0.02, -hi[i].y));
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      const ml = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x4f5a35, transparent: true, opacity: 0.7, clippingPlanes: [clipPlane] }));
      ml.userData.phase = 'moundEdge'; ml.userData.isEdge = true;
      site.add(ml);
    }
    // Wasser
    if (isFinite(lv.zW) && lv.zW > lv.zPit - 2) {
      const zw = Math.min(-0.02, lv.zW);
      const wm = mesh(flat(ground, zw, holesAt(zw)), COL.water, 'water', { transparent: true, opacity: 0.22, depthWrite: false }, { noShadow: true });
      wm.castShadow = false;
      site.add(wm);
    }

    // Sohlaufbau
    if (b.gravel > 0) struct.add(mesh(prism(e.bottom, lv.zPit, lv.zBlindBot), COL.gravel, 'sohle'));
    if (b.blinding > 0) struct.add(mesh(prism(G.offsetPolygon(g.out, b.overhang + 0.1), lv.zBlindBot, lv.zInsBot), COL.blinding, 'sohle'));
    if (b.insulation.floor > 0) struct.add(mesh(prism(g.slab, lv.zInsBot, lv.zSlabBot), COL.ins, 'bp'));
    const pitHoles = (g.vert ? g.vert.lifts : []).filter((v) => v.design && v.levelBot === (g.L ? g.L.length - 1 : 0)).map((v) => G.ensureCCW(v.innerPoly));
    const slab = mesh(prism(g.slab, lv.zSlabBot, lv.zFloorTop, pitHoles.length ? pitHoles : undefined), COL.slabTop, 'bp_b');
    slab.userData.prep = 'bp';
    struct.add(slab); struct.add(edgesOf(slab));

    // Außenwände mit Öffnungen
    if (g.valid) {
      for (let i = 0; i < g.n; i++) {
        const a = g.out[i], bq = g.out[(i + 1) % g.n], ia = g.inner[i], ib = g.inner[(i + 1) % g.n];
        const len = G.dist(a, bq), u = G.norm(G.sub(bq, a)), nn = G.edgeNormal(a, bq);
        const P = (t) => G.add(a, G.mul(u, t));
        const Q = (t) => (t <= 1e-6 ? ia : t >= len - 1e-6 ? ib : G.sub(P(t), G.mul(nn, b.tWall)));
        const footAt = (t0, t1) => [P(t0), P(t1), Q(t1), Q(t0)];
        const ops = g.openings.filter((o) => !o.invalid && o.host === 'e:' + i).map((o) => ({ t0: o.pos - o.w / 2, t1: o.pos + o.w / 2, sill: o.sill, h: o.h }));
        // je Ebene ein Abschnitt (Betonierfolge); Öffnungen nur in der Zugangsebene
        LV.forEach((L, li) => wallPieces(len, li === 0 ? ops : [], footAt, L.zFloorTop, li === 0 ? lv.zCeil : LV[li - 1].zFloorTop, phW(li), COL.concrete, struct));
      }
    }
    // Innenwände, Stützen und Zwischendecken je Ebene
    GL.forEach((L, li) => {
      const z = LV[li] || LV[0];
      for (const w of L.walls) {
        const len = G.dist(w.a, w.b);
        if (len < 1e-3) continue;
        const u = G.norm(G.sub(w.b, w.a)), n = { x: -u.y * w.t / 2, y: u.x * w.t / 2 };
        const ops = L.openings.filter((o) => !o.invalid && o.host === 'w:' + w.id).map((o) => ({ t0: o.pos - o.w / 2, t1: o.pos + o.w / 2, sill: o.sill, h: o.h }));
        for (const sg of w.segs) {
          const ta = G.dot(G.sub(sg.a, w.a), u), tb = G.dot(G.sub(sg.b, w.a), u);
          const P = (t) => G.add(w.a, G.mul(u, t));
          const footAt = (t0, t1) => [G.add(P(ta + t0), n), G.add(P(ta + t1), n), G.sub(P(ta + t1), n), G.sub(P(ta + t0), n)];
          const local = ops.map((o) => ({ ...o, t0: o.t0 - ta, t1: o.t1 - ta })).filter((o) => o.t1 > 0 && o.t0 < tb - ta);
          const phase = w.kind === 'stb' ? phW(li) : 'ausbau';
          wallPieces(tb - ta, local, footAt, z.zFloorTop, z.zCeil, phase, w.kind === 'stb' ? COL.concrete : w.kind === 'mw' ? COL.mw : 0xe9ebea, struct);
        }
      }
      for (const bu of L.beams || []) for (const sg of bu.segs || []) {
        const u = G.norm(G.sub(sg.b, sg.a)), n = { x: -u.y * bu.bw / 2, y: u.x * bu.bw / 2 }, ph = li === 0 ? 'd_b' : 'zd' + li + '_b';
        const m = mesh(prism([G.add(sg.a, n), G.add(sg.b, n), G.sub(sg.b, n), G.sub(sg.a, n)], z.zCeil - bu.hb, z.zCeil), COL.concrete, ph);
        m.userData.prep = ph.slice(0, -2);
        if (li === 0) m.userData.roof = false;
        struct.add(m); struct.add(edgesOf(m));
      }
      for (const c of L.columns || []) {
        const m = mesh(prism(G.polygonFromRect(c.x - c.bx / 2, c.y - c.by / 2, c.x + c.bx / 2, c.y + c.by / 2), z.zFloorTop, z.zCeil), COL.concrete, phW(li));
        m.userData.prep = phW(li).slice(0, -2);
        struct.add(m); struct.add(edgesOf(m));
      }
      if (li > 0 && g.valid) {
        const holes = (GL[li - 1].holesBelow || []).concat(vs.lifts.filter((v) => li - 1 >= v.wallTop && li <= v.levelBot).map((v) => v.innerPoly)).map((h) => G.ensureCCW(h));
        const m = mesh(prism(g.inner, z.zCeil, z.zSlabTop, holes), COL.slabTop, 'zd' + li + '_b');
        m.userData.prep = 'zd' + li;
        struct.add(m); struct.add(edgesOf(m));
      }
    });
    // Innentreppen: Stufenprofil quer extrudiert
    for (const st of vs.stairs) {
      const zU = LV[st.upper].zFloorTop, zL = LV[st.lower].zFloorTop, prof = [new THREE.Vector2(0, zU)];
      for (let i = 1; i < st.nr; i++) { prof.push(new THREE.Vector2((i - 1) * st.tread, zU - i * st.rise)); prof.push(new THREE.Vector2(i * st.tread, zU - i * st.rise)); }
      // Untersicht parallel zur Steigung im Abstand der Laufplattendicke (wie IFC-Export)
      const slope = st.rise / st.tread, dv = (st.tWaist || 0.15) * Math.hypot(st.tread, st.rise) / st.tread;
      prof.push(new THREE.Vector2(st.run, zL), new THREE.Vector2(Math.max(0, st.run - dv / slope), zL), new THREE.Vector2(0, zU - st.rise - dv));
      const geoS = new THREE.ExtrudeGeometry(new THREE.Shape(prof), { depth: st.w, bevelEnabled: false });
      const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(st.u.x, 0, -st.u.y), new THREE.Vector3(0, 1, 0), new THREE.Vector3(st.nrm.x, 0, -st.nrm.y));
      const o0 = G.add({ x: st.src.x, y: st.src.y }, G.mul(st.nrm, -st.w / 2));
      basis.setPosition(o0.x, 0, -o0.y);
      geoS.applyMatrix4(basis);
      const m = mesh(geoS, COL.slabTop, 'zd' + st.lower + '_b');
      struct.add(m); struct.add(edgesOf(m));
    }
    // Aufzüge: Grube, Schachtkopf über der Decke, Schacht zum Gelände mit Aufzugshaus
    for (const v of vs.lifts) {
      const d = v.design, w = v.works;
      if (!d || !w) continue;
      const zf = LV[v.levelBot].zFloorTop, zp = zf - d.pit, ring = (z0, z1, ph) => { const m = mesh(prism(v.outerPoly, z0, z1, [G.ensureCCW(v.innerPoly)]), COL.concrete, ph); struct.add(m); struct.add(edgesOf(m)); };
      ring(zp, zf, 'bp_b');
      const ps = mesh(prism(v.outerPoly, zp - b.tFloor, zp), COL.slabTop, 'bp_b'); struct.add(ps); struct.add(edgesOf(ps));
      const topBox = (z0, z1, t) => { ring(z0, z1, 'd_b'); const m = mesh(prism(v.outerPoly, z1, z1 + t), COL.slabTop, 'd_b'); m.userData.roof = true; struct.add(m); struct.add(edgesOf(m)); };
      if (v.roofBox && w.box > 0) topBox(lv.zRoofTop, lv.zRoofTop + w.box, 0.3);
      if (v.toSurface) topBox(lv.zRoofTop, v.zSurface + w.house, 0.25);
    }
    // Aufzugskabine in der untersten Haltestelle
    for (const v of vs.lifts) {
      const zb = LV[v.levelBot].zFloorTop, c = (s2, t2) => G.add(G.add({ x: v.x, y: v.y }, G.mul(v.u, s2)), G.mul(v.nrm, t2));
      const cw = v.src.w / 2, cd = v.src.d / 2, sh = -0.05;
      extra.add(mesh(prism([c(-cd + sh, -cw), c(cd + sh, -cw), c(cd + sh, cw), c(-cd + sh, cw)], zb + 0.02, zb + 2.3), COL.steel, 'tech', { metalness: 0.4, roughness: 0.5, transparent: true, opacity: 0.6 }));
    }
    // Decke (Aufzugsschächte zum Gelände ausgespart)
    const roofHoles = vs.lifts.filter((v) => v.toSurface || v.roofBox).map((v) => G.ensureCCW(v.innerPoly));
    const roof = mesh(prism(g.out, lv.zCeil, lv.zRoofTop, roofHoles.length ? roofHoles : undefined), COL.slabTop, 'd_b');
    roof.userData.roof = true; roof.userData.prep = 'd';
    struct.add(roof);
    const roofEdges = edgesOf(roof); roofEdges.userData.roof = true; struct.add(roofEdges);
    // Dämmung
    if (tWi > 0 && g.valid) {
      // Perimeterdämmung je Außenkante (Gehrung an den Ecken), an Zugängen und Außenöffnungen ausgespart
      for (let i = 0; i < g.n; i++) {
        const a = g.out[i], bq = g.out[(i + 1) % g.n], len = G.dist(a, bq), u = G.norm(G.sub(bq, a)), nn = G.edgeNormal(a, bq);
        const P = (t) => G.add(a, G.mul(u, t));
        const R = (t) => (t <= 1e-6 ? outIns[i] : t >= len - 1e-6 ? outIns[(i + 1) % g.n] : G.add(P(t), G.mul(nn, tWi)));
        const lift = zE - lv.zSlabBot;
        const ops = g.openings.filter((o) => !o.invalid && !o.access && o.host === 'e:' + i).map((o) => ({ t0: o.pos - o.w / 2, t1: o.pos + o.w / 2, sill: o.sill + lift, h: o.h }))
          .concat(g.access.filter((ac) => ac.edge === i).map((ac) => ({ t0: ac.pos - ac.W / 2, t1: ac.pos + ac.W / 2, sill: lift - ac.tS, h: 1e3 })));
        wallPieces(len, ops, (t0, t1) => [P(t0), P(t1), R(t1), R(t0)], lv.zSlabBot, lv.zRoofTop, 'abd', COL.ins, extra);
      }
    }
    if (b.insulation.roof > 0) { const r = mesh(prism(outIns, lv.zRoofTop, lv.zRoofTop + b.insulation.roof), COL.ins, 'abd'); r.userData.roof = true; extra.add(r); }

    // Zugänge
    for (const a of g.access) buildAccess(a, Object.assign({}, lv, { zFloorTop: zE }), struct);

    // Leitungen
    const T = (pt) => new THREE.Vector3(pt.x, pt.z, -pt.y);
    const selRoute = A.sel && A.sel.type === 'route' ? A.sel.id : null;
    for (const rr of q.routes.list) {
      const col = new THREE.Color(rr.kind.color).getHex();
      const round = rr.src.shape === 'rund';
      for (const sg of rr.segs) {
        const a = T(sg.A), b = T(sg.B), dir = b.clone().sub(a), L = dir.length();
        if (L < 1e-4) continue;
        const u = dir.clone().normalize();
        let geo3;
        if (round) {
          geo3 = new THREE.CylinderGeometry(rr.dims.w / 2, rr.dims.w / 2, L, 16, 1);
          geo3.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), u));
        } else {
          geo3 = new THREE.BoxGeometry(rr.dims.w, L, rr.dims.h);
          const hor = Math.hypot(u.x, u.z);
          const wv = hor > 1e-6 ? new THREE.Vector3(-u.z / hor, 0, u.x / hor) : new THREE.Vector3(1, 0, 0);
          const vv = new THREE.Vector3().crossVectors(wv, u);
          geo3.applyMatrix4(new THREE.Matrix4().makeBasis(wv, u, vv));
        }
        geo3.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        const m = mesh(geo3, col, 'tech', { roughness: 0.55, metalness: round ? 0.35 : 0.1 });
        extra.add(m);
        if (selRoute === rr.id && rr.src.clr > 0) {
          const hb = BP.calcExtra.boxVerts(sg.boxC);
          const idx = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
          const pos = [];
          for (const [i, j] of idx) pos.push(hb[i].x, hb[i].z, -hb[i].y, hb[j].x, hb[j].z, -hb[j].y);
          const gl = new THREE.BufferGeometry(); gl.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          const ls = new THREE.LineSegments(gl, new THREE.LineDashedMaterial({ color: 0xd29c00, dashSize: 0.08, gapSize: 0.06, clippingPlanes: [clipPlane] }));
          ls.computeLineDistances(); ls.userData.phase = 'tech'; ls.userData.isEdge = true;
          extra.add(ls);
        }
      }
      for (let i = 1; i + 1 < rr.pts.length; i++) {
        const geoJ = round ? new THREE.SphereGeometry(rr.dims.w / 2, 16, 10) : new THREE.BoxGeometry(rr.dims.w, rr.dims.w, rr.dims.h);
        const pj = T(rr.pts[i]);
        geoJ.translate(pj.x, pj.y, pj.z);
        extra.add(mesh(geoJ, col, 'tech', { roughness: 0.55, metalness: round ? 0.35 : 0.1 }));
      }
      // Futterrohre in der Hülle
      for (const pn of rr.pens) {
        if (pn.type === 'innenwand' || pn.type === 'zwischendecke') continue;
        const sg = rr.segs.find((s) => s.i === pn.seg);
        if (!sg) continue;
        const u = T(sg.B).sub(T(sg.A)).normalize();
        const len = (pn.type === 'wand' ? b.tWall : pn.type === 'decke' ? b.tRoof : b.tFloor) + 0.1;
        const gf = new THREE.CylinderGeometry(rr.dims.w / 2 + 0.03, rr.dims.w / 2 + 0.03, len / Math.max(0.2, Math.abs(pn.type === 'wand' ? Math.hypot(u.x, u.z) : u.y)), 16, 1, true);
        gf.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), u));
        const c3 = T({ x: pn.x, y: pn.y, z: zE + pn.h });
        if (pn.type === 'wand') { const nn = G.edgeNormal(g.out[+pn.host.slice(2)], g.out[(+pn.host.slice(2) + 1) % g.n]); c3.x -= nn.x * b.tWall / 2; c3.z += nn.y * b.tWall / 2; }
        gf.translate(c3.x, c3.y, c3.z);
        extra.add(mesh(gf, 0x3a403d, 'w_b', { roughness: 0.4, metalness: 0.6 }));
      }
    }

    // Bewehrung
    const midZ = {};
    for (const m of q.struct.mids || []) { const L = LV[m.level]; if (L) midZ[m.name] = { bot: L.zCeil, top: L.zSlabTop, ph: 'zd' + m.level }; }
    const zOf = (el, face) => {
      const c = b.cnom;
      if (el === 'Bodenplatte') return face === 'unten' ? lv.zSlabBot + c : lv.zFloorTop - c;
      if (midZ[el]) return face === 'unten' ? midZ[el].bot + c : midZ[el].top - c;
      return face === 'unten' ? lv.zCeil + c : lv.zRoofTop - c;
    };
    for (const set of q.steel.lines3d) {
      const pos = [];
      const z = zOf(set.el, set.face) + ((set.dir === 'y' ? 0.012 : 0) + (set.zul ? 0.03 : 0)) * (set.face === 'unten' ? 1 : -1);
      for (const [p0, p1] of set.lines) pos.push(p0.x, z, -p0.y, p1.x, z, -p1.y);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: set.zul ? 0xd29c00 : COL.rebar, transparent: true, opacity: set.zul ? 0.85 : 0.55, clippingPlanes: [clipPlane] }));
      ls.userData.phase = set.el === 'Bodenplatte' ? 'bp' : midZ[set.el] ? midZ[set.el].ph : 'd';
      ls.userData.rebarOf = set.el;
      if (set.el === 'Decke') ls.userData.roof = true;
      rebar.add(ls);
    }

    // Wandbewehrung (Außenwände)
    if (g.valid) {
      const wl = q.struct.wall.layers, c = b.cnom;
      const faces = [
        { poly: G.offsetPolygon(g.out, -(c + wl[1].phi / 2000)), vert: wl[1], hor: wl[2] },
        { poly: G.offsetPolygon(g.inner, c + wl[0].phi / 2000), vert: wl[0], hor: wl[2] },
      ];
      const z0 = lv.zSlabBot + c, z1 = lv.zRoofTop - c;
      const pos = [];
      for (const f of faces) {
        for (let i = 0; i < f.poly.length; i++) {
          const a = f.poly[i], bq = f.poly[(i + 1) % f.poly.length], len = G.dist(a, bq), u = G.norm(G.sub(bq, a));
          const s0 = G.dot(G.sub(a, g.out[i]), u); // Lage der Flächenecke entlang der Außenkante
          const ops = g.openings.filter((o) => !o.invalid && o.host === 'e:' + i).map((o) => ({ t0: o.pos - o.w / 2 - s0, t1: o.pos + o.w / 2 - s0, zb: zE + o.sill, zt: zE + o.sill + o.h }));
          for (let t = f.vert.s / 2; t < len; t += f.vert.s) {
            const p = G.add(a, G.mul(u, t));
            const op = ops.find((o) => t > o.t0 && t < o.t1);
            const segs = op ? [[z0, op.zb], [op.zt, z1]] : [[z0, z1]];
            for (const [za, zb] of segs) if (zb > za) pos.push(p.x, za, -p.y, p.x, zb, -p.y);
          }
          for (let z = lv.zFloorTop + 0.05; z < lv.zCeil; z += f.hor.s) {
            let segs = [[0, len]];
            for (const o of ops) if (z > o.zb && z < o.zt) segs = segs.flatMap(([s0, s1]) => (o.t1 <= s0 || o.t0 >= s1 ? [[s0, s1]] : [[s0, o.t0], [o.t1, s1]].filter(([x, y]) => y > x)));
            for (const [s0, s1] of segs) { const p0 = G.add(a, G.mul(u, s0)), p1 = G.add(a, G.mul(u, s1)); pos.push(p0.x, z, -p0.y, p1.x, z, -p1.y); }
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COL.rebar, transparent: true, opacity: 0.55, clippingPlanes: [clipPlane] }));
      ls.userData.phase = 'w'; ls.userData.rebarOf = 'Außenwände';
      rebar.add(ls);
    }

    // Kamera beim ersten Mal und wenn sich das Modell stark ändert (Layout übernommen, Projekt geöffnet)
    const cb = G.bbox(g.out.concat(e.toePoly || [], ...g.access.map((x) => x.foot)));
    const cx = (cb.x0 + cb.x1) / 2, cy = -(cb.y0 + cb.y1) / 2;
    V.center = { x: cx, z: cy, span: Math.max(cb.w, cb.h, (lv.hM - lv.zPit) * 1.6), y: (lv.zFloorTop + lv.hM) / 2 };
    const fc = V.fitted;
    if (!built || !fc || Math.abs(V.center.span - fc.span) > 0.35 * fc.span || Math.hypot(cx - fc.x, cy - fc.z) > 0.35 * fc.span) V.resetCamera();
    // Schattenkamera auf die ganze Geländefläche ziehen (große Schutzräume, Hügel)
    const half = Math.max(25, 0.6 * Math.hypot(bb.w + 2 * m, bb.h + 2 * m)), dist = Math.max(33, 1.4 * half);
    const dir = new THREE.Vector3(14, 26, 10).normalize();
    V.sun.target.position.set(cx, lv.zFloorTop, cy);
    V.sun.position.set(cx + dir.x * dist, lv.zFloorTop + dir.y * dist, cy + dir.z * dist);
    const sc = V.sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = dist + 2 * half;
    sc.updateProjectionMatrix();
    built = true;
    applyOptions();
  }

  function buildAccess(a, lv, group) {
    const C = a.C, u = a.u, nn = a.nn;
    const at = (du, dn) => G.add(G.add(C, G.mul(u, du)), G.mul(nn, dn));
    if (a.kind === 'treppe') {
      // Seitenwände: Profil in (s, z), extrudiert quer
      for (const [off, side] of [[a.w / 2, a.sideR], [-a.w / 2 - a.tw, a.sideL]]) {
        const shape = new THREE.Shape(side.map((p) => new THREE.Vector2(p.x, p.y)));
        const geo = new THREE.ExtrudeGeometry(shape, { depth: a.tw, bevelEnabled: false });
        const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(nn.x, 0, -nn.y), new THREE.Vector3(0, 1, 0), new THREE.Vector3(u.x, 0, -u.y));
        const o = at(off, 0);
        basis.setPosition(o.x, 0, -o.y);
        geo.applyMatrix4(basis);
        const m = mesh(geo, COL.concrete, 'zug');
        group.add(m); group.add(edgesOf(m));
      }
      const land = mesh(prism([at(-a.W / 2, 0), at(a.W / 2, 0), at(a.W / 2, a.landing), at(-a.W / 2, a.landing)], a.zb, lv.zFloorTop), COL.slabTop, 'zug');
      group.add(land);
      const zf = lv.zFloorTop, prof = [new THREE.Vector2(a.landing, zf - a.tS), new THREE.Vector2(a.landing, zf)];
      for (let i = 1; i < a.nr; i++) { prof.push(new THREE.Vector2(a.landing + (i - 1) * a.tread, zf + i * a.rise)); prof.push(new THREE.Vector2(a.landing + i * a.tread, zf + i * a.rise)); }
      prof.push(new THREE.Vector2(a.L, 0), new THREE.Vector2(a.L, -a.tS));
      const sgeo = new THREE.ExtrudeGeometry(new THREE.Shape(prof), { depth: a.w, bevelEnabled: false });
      const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(nn.x, 0, -nn.y), new THREE.Vector3(0, 1, 0), new THREE.Vector3(u.x, 0, -u.y));
      const o = at(-a.w / 2, 0);
      basis.setPosition(o.x, 0, -o.y);
      sgeo.applyMatrix4(basis);
      const st = mesh(sgeo, COL.slabTop, 'zug');
      group.add(st); group.add(edgesOf(st));
      if (a.hatch > 0) {
        const k = mesh(prism([at(-a.W / 2, 0), at(a.W / 2, 0), at(a.W / 2, a.L), at(-a.W / 2, a.L)], FB, FB + 0.06), COL.steel, 'zug', { metalness: 0.3, roughness: 0.5, transparent: true, opacity: 0.45 });
        k.userData.roof = true;
        group.add(k);
      }
    } else {
      const outer = [at(-a.W / 2, 0), at(a.W / 2, 0), at(a.W / 2, a.D), at(-a.W / 2, a.D)];
      const inner = [at(-a.w / 2, 0), at(a.w / 2, 0), at(a.w / 2, a.wy), at(-a.w / 2, a.wy)];
      const zTopS = a.zTop != null ? a.zTop : FB;
      const walls = mesh(prism(outer, lv.zFloorTop, zTopS, [inner]), COL.concrete, 'zug');
      group.add(walls); group.add(edgesOf(walls));
      group.add(mesh(prism(outer, lv.zFloorTop - a.tS, lv.zFloorTop), COL.slabTop, 'zug'));
      const lid = mesh(prism(outer, zTopS, zTopS + 0.06), COL.steel, 'zug', { metalness: 0.4, roughness: 0.5, transparent: true, opacity: 0.85 });
      lid.userData.roof = true;
      group.add(lid);
      for (let i = 0; i < a.rungs; i++) {
        const z = lv.zFloorTop + 0.3 + i * 0.28;
        const r0 = at(-0.2, a.wy - 0.04), r1 = at(0.2, a.wy - 0.04), r2 = at(0.2, a.wy - 0.16), r3 = at(-0.2, a.wy - 0.16);
        group.add(mesh(prism([r0, r1, r2, r3], z, z + 0.025), COL.steel, 'zug', { metalness: 0.5, roughness: 0.4 }));
      }
    }
  }

  /* ---------- Sichtbarkeit / Phasen ---------- */

  function stateOf(phase, day, sch, prep) {
    if (day == null) return 'done';
    const t = sch.byId[phase];
    if (!t) return 'done';
    const p = prep && sch.byId[prep];
    const start = p && p.d > 0 ? Math.min(p.start, t.start) : t.start;
    if (t.d === 0 && !p) return day >= t.start ? 'done' : 'future';
    if (day >= t.end) return 'done';
    if (day >= start) return 'active';
    return 'future';
  }

  function applyOptions() {
    if (!built || !A.q) return;
    const sch = A.q.schedule, day = opts.day;
    const after = (id) => day == null || day >= sch.byId[id].end;
    const before = (id) => day != null && day < sch.byId[id].start;
    const pitOpen = day != null && !before('aushub') && !after('verf');
    const pitUpper = day != null && after('verf') && !after('ueber');
    const terrainFullVis = day == null || before('aushub') || after('ueber');
    const earthOpacity = opts.earth === 'voll' ? 1 : opts.earth === 'transparent' ? 0.16 : 0;
    scene.traverse((o) => {
      const ud = o.userData;
      if (!ud || ud.phase == null) return;
      let vis = true, active = false;
      switch (ud.phase) {
        case 'terrainFull': vis = terrainFullVis && earthOpacity > 0; break;
        case 'groundLine': vis = opts.earth === 'aus' && terrainFullVis; break;
        case 'pitGhost': vis = opts.earth === 'aus' && terrainFullVis; if (o.isMesh) o.material = mat(COL.earth, { transparent: true, opacity: 0.14, depthWrite: false }); return void (o.visible = vis);
        case 'earthBlock': vis = terrainFullVis && opts.earth !== 'aus'; if (o.isMesh) { o.visible = vis && opts.earth === 'voll'; o.material = mat(COL.earth, { transparent: true, opacity: 0.92, depthWrite: true }); return; } return void (o.visible = vis);
        case 'terrainHole': vis = !terrainFullVis; break;
        case 'pitOpen': vis = pitOpen; break;
        case 'pitUpper': vis = pitUpper; break;
        case 'water': vis = opts.earth !== 'aus' || day != null; break;
        case 'moundEdge': vis = stateOf('ueber', day, sch) !== 'future'; break;
        case 'mound': {
          vis = stateOf('ueber', day, sch) !== 'future';
          const op = opts.earth === 'voll' ? 1 : opts.earth === 'transparent' ? 0.35 : 0.22;
          o.visible = vis && !(ud.roof && !opts.roof);
          if (o.isMesh) { o.material = mat(stateOf('ueber', day, sch) === 'active' ? COL.active : ud.color, { transparent: op < 1, opacity: op, depthWrite: op >= 1 }); o.castShadow = false; }
          return;
        }
        default: {
          const s = stateOf(ud.phase, day, sch, ud.prep);
          vis = s !== 'future'; active = s === 'active';
          if (ud.rebarOf) { vis = opts.rebar || (day != null && s === 'active'); if (day != null && s === 'future') vis = false; }
        }
      }
      if (ud.roof && !opts.roof) vis = false;
      o.visible = vis;
      if (o.isMesh && !ud.isEdge) {
        if (ud.phase === 'terrainFull' || ud.phase === 'terrainHole') {
          const op = ud.phase === 'terrainHole' ? Math.max(earthOpacity, 0.9) : earthOpacity;
          o.material = mat(ud.color, { transparent: op < 1, opacity: op, depthWrite: op >= 1 });
          o.castShadow = false;
        } else if (active) o.material = mat(COL.active, { transparent: true, opacity: ud.prep ? 0.35 : 0.72, depthWrite: !ud.prep });
        else if (opts.rebar && ['bp_b', 'w_b', 'd_b'].includes(ud.phase)) o.material = mat(ud.color, { transparent: true, opacity: 0.28, depthWrite: false });
        else o.material = mat(ud.color, ud.baseExtra);
      }
    });
    // Schnitt
    if (opts.cut && V.center) {
      const bb = G.bbox(A.q.geo.out);
      const x = bb.x0 - 0.5 + (bb.w + 1) * opts.cutPos;
      clipPlane.normal.set(-1, 0, 0); clipPlane.constant = x;
    } else { clipPlane.normal.set(-1, 0, 0); clipPlane.constant = 1e6; }
  }

  V.setOption = function (k, v) { opts[k] = v; applyOptions(); };
  V.setDay = function (d) { opts.day = d; applyOptions(); };

  V.resetCamera = function (mode) {
    if (!V.center || !camera) return;
    const c = V.center, r = Math.max(8, c.span * 1.05 + 3);
    V.fitted = { x: c.x, z: c.z, span: c.span };
    controls.target.set(c.x, c.y, c.z);
    if (mode === 'top') camera.position.set(c.x, r * 2.2, c.z + 0.01);
    else if (mode === 'front') camera.position.set(c.x, c.y + 1.5, c.z + r * 1.6);
    else camera.position.set(c.x + r * 1.0, r * 0.62, c.z + r * 1.3);
    controls.update();
  };

  V.snapshot = function () {
    if (!renderer) return null;
    if (dirty) { build(); dirty = false; }
    const keep = Object.assign({}, opts), pos = camera.position.clone(), tgt = controls.target.clone();
    Object.assign(opts, { earth: 'aus', roof: false, cut: false, rebar: false, day: null });
    applyOptions();
    V.resetCamera();
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    Object.assign(opts, keep);
    camera.position.copy(pos); controls.target.copy(tgt); controls.update();
    applyOptions();
    return url;
  };
})(typeof window !== 'undefined' ? window : globalThis);
