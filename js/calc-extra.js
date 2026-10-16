/*
 * Leitungen (räumlich) und Schutzaufbau.
 * Leitungspunkte: x, y im Grundriss, h = Achshöhe über OK Rohboden (m).
 */
(function (root) {
  const BP = root.BP = root.BP || {};
  const G = BP.geo, M = BP.model;
  const T_ = BP.i18n.T, I18 = BP.i18n;
  const min = Math.min, max = Math.max;
  const finite = (v) => typeof v === 'number' && isFinite(v);
  const fmt = (v, d = 2) => (finite(v) ? v.toLocaleString(I18.locale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');

  const s3 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const a3 = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const m3 = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
  const d3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const c3 = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  const l3 = (a) => Math.hypot(a.x, a.y, a.z);

  function routeDims(r) {
    const ext = 2 * (r.ins || 0);
    if (r.shape === 'rund') return { w: r.d + ext, h: r.d + ext, area: Math.PI * r.d * r.d / 4, label: 'DN ' + Math.round(r.d * 1000) };
    return { w: r.w + ext, h: r.hgt + ext, area: r.w * r.hgt, label: Math.round(r.w * 100) + ' × ' + Math.round(r.hgt * 100) + ' cm' };
  }

  /* Orientierter Quader um ein gerades Segment; die Breitenachse liegt waagerecht. */
  function obb(a, b, w, h, grow) {
    const d = s3(b, a), L = l3(d);
    if (L < 1e-6) return null;
    const u = m3(d, 1 / L), hor = Math.hypot(u.x, u.y);
    const wv = hor > 1e-8 ? { x: -u.y / hor, y: u.x / hor, z: 0 } : { x: 1, y: 0, z: 0 };
    const vv = c3(u, wv);
    return { c: m3(a3(a, b), 0.5), ax: [u, wv, vv], hf: [L / 2 + grow, w / 2 + grow, h / 2 + grow], a, b };
  }
  function boxVerts(B) {
    const v = [];
    for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) v.push(a3(B.c, a3(m3(B.ax[0], B.hf[0] * i), a3(m3(B.ax[1], B.hf[1] * j), m3(B.ax[2], B.hf[2] * k)))));
    return v;
  }
  /* Trennachsentest für zwei orientierte Quader; Berühren gilt nicht als Überschneidung. */
  function overlaps(A, B) {
    const axes = A.ax.concat(B.ax);
    for (const x of A.ax) for (const y of B.ax) axes.push(c3(x, y));
    const t = s3(B.c, A.c);
    for (const raw of axes) {
      const n = l3(raw);
      if (n < 1e-9) continue;
      const ax = m3(raw, 1 / n);
      const ra = A.ax.reduce((sm, v, i) => sm + Math.abs(d3(v, ax)) * A.hf[i], 0);
      const rb = B.ax.reduce((sm, v, i) => sm + Math.abs(d3(v, ax)) * B.hf[i], 0);
      if (Math.abs(d3(t, ax)) >= ra + rb - 1e-7) return false;
    }
    return true;
  }

  function routes(p, geo, lv, tech) {
    // Höhen der Leitungspunkte über OK Rohboden der obersten Ebene; negative Höhen führen in die Ebenen darunter
    const b = p.build, H = b.clearHeight, zF = lv.zEntry != null ? lv.zEntry : lv.zFloorTop;
    const hBot = lv.zFloorTop - zF; // OK Rohboden der untersten Ebene (0 bei einer Ebene)
    const levels = lv.levels || [{ idx: 0, zCeil: lv.zCeil, zFloorTop: lv.zFloorTop, tSlab: 0 }];
    const slabsMid = levels.filter((L) => L.idx > 0).map((L) => ({ idx: L.idx, lo: L.zCeil - zF, hi: L.zSlabTop - zF, name: T_('Zwischendecke über Ebene {n}', { n: L.idx + 1 }) }));
    const W = (pt) => ({ x: pt.x, y: pt.y, z: zF + pt.h });
    // Wandstücke als Quader (für „läuft in der Wand“ und Platzabstand)
    const wallBoxes = [];
    const pushPieces = (id, label, a, bq, t, ops, hb, ht) => {
      const L = G.dist(a, bq);
      if (L < 1e-4) return;
      const u = G.norm(G.sub(bq, a));
      hb = hb != null ? hb : 0; ht = ht != null ? ht : H;
      const piece = (t0, t1, h0, h1) => {
        if (t1 - t0 < 1e-4 || h1 - h0 < 1e-4) return;
        const pa = G.add(a, G.mul(u, t0)), pb = G.add(a, G.mul(u, t1)), zc = zF + (h0 + h1) / 2;
        const B = obb({ x: pa.x, y: pa.y, z: zc }, { x: pb.x, y: pb.y, z: zc }, t, h1 - h0, 0);
        if (B) wallBoxes.push({ id, label, box: B });
      };
      let t0 = 0;
      for (const o of ops.sort((x, y) => x.t0 - y.t0)) { piece(t0, o.t0, hb, ht); piece(o.t0, o.t1, hb + o.top, ht); piece(o.t0, o.t1, hb, hb + o.sill); t0 = max(t0, o.t1); }
      piece(t0, L, hb, ht);
    };
    if (geo.valid) {
      for (let i = 0; i < geo.n; i++) {
        const oa = geo.out[i], ob = geo.out[(i + 1) % geo.n];
        const a = G.lerp(oa, geo.inner[i], 0.5), bq = G.lerp(ob, geo.inner[(i + 1) % geo.n], 0.5);
        const off = G.dot(G.sub(a, oa), G.norm(G.sub(ob, oa)));
        const ops = geo.openings.filter((o) => !o.invalid && o.host === 'e:' + i).map((o) => ({ t0: o.pos - o.w / 2 - off, t1: o.pos + o.w / 2 - off, sill: o.sill, top: o.sill + o.h }));
        pushPieces('e:' + i, T_('Außenwand {n}', { n: i + 1 }), a, bq, b.tWall, ops, hBot, H);
      }
    }
    const LG = geo.L || [{ idx: 0, walls: geo.walls, openings: geo.openings }];
    const levelWalls = [];
    for (const Lg of LG) {
      const lz = levels[Lg.idx] || levels[0], hb = lz.zFloorTop - zF, ht = lz.zCeil - zF;
      for (const w of Lg.walls) {
        const u = G.norm(G.sub(w.b, w.a));
        levelWalls.push({ w, hb, ht, ops: Lg.openings });
        for (const sg of w.segs) {
          const ta = G.dot(G.sub(sg.a, w.a), u);
          const ops = Lg.openings.filter((o) => !o.invalid && o.host === 'w:' + w.id).map((o) => ({ t0: o.pos - o.w / 2 - ta, t1: o.pos + o.w / 2 - ta, sill: o.sill, top: o.sill + o.h }));
          pushPieces('w:' + w.id, w.auto ? T_('Aufzugsschacht') : geo.labels['w:' + w.id] || T_('Innenwand'), sg.a, sg.b, w.t, ops, hb, ht);
        }
      }
    }

    const list = [];
    for (const r of p.routes) {
      const kind = Object.hasOwn(M.ROUTE_KINDS, r.kind) ? M.ROUTE_KINDS[r.kind] : M.ROUTE_KINDS[r.type === 'kabel' ? 'strom' : 'zuluft'];
      const dims = routeDims(r);
      const pts = r.pts.map(W);
      const issues = [], pens = [];
      const add = (level, text) => { if (!issues.some((x) => x.text === text)) issues.push({ level, text }); };
      let L = 0, bends = 0;
      const segs = [];
      for (let i = 1; i < pts.length; i++) {
        const A = pts[i - 1], B = pts[i], len = l3(s3(B, A));
        if (len < 1e-4) { add('info', T_('Punkt {a} liegt auf Punkt {b}.', { a: i + 1, b: i })); continue; }
        L += len;
        segs.push({ i, A, B, len, box: obb(A, B, dims.w, dims.h, 0), boxC: obb(A, B, dims.w, dims.h, r.clr || 0) });
      }
      for (let i = 1; i + 1 < pts.length; i++) {
        const u1 = s3(pts[i], pts[i - 1]), u2 = s3(pts[i + 1], pts[i]);
        if (l3(u1) > 1e-4 && l3(u2) > 1e-4 && d3(u1, u2) / (l3(u1) * l3(u2)) < 0.985) bends++;
      }
      if (r.pts.length < 2) add('warn', T_('Weg braucht mindestens zwei Punkte.'));

      // Durchführungen durch Hülle und Innenwände
      for (const sg of segs) {
        const A2 = { x: sg.A.x, y: sg.A.y }, B2 = { x: sg.B.x, y: sg.B.y };
        const hAt = (t) => sg.A.z + (sg.B.z - sg.A.z) * t - zF;
        if (G.dist(A2, B2) > 1e-6) {
          for (let e = 0; e < geo.n; e++) {
            const ea = geo.out[e], eb = geo.out[(e + 1) % geo.n];
            const hit = G.segIntersect(A2, B2, ea, eb);
            if (!hit) continue;
            const hc = hAt(hit.t);
            if (hc < hBot - b.tFloor - dims.h / 2 || hc > H + b.tRoof + dims.h / 2) continue;
            const along = hit.u * G.dist(ea, eb);
            const op = geo.openings.find((o) => !o.invalid && o.host === 'e:' + e && along > o.pos - o.w / 2 && along < o.pos + o.w / 2 && hc > o.sill && hc < o.sill + o.h);
            if (op) { add('info', op.access ? T_('Führt durch die Öffnung von {name}.', { name: geo.labels['a:' + op.access] || T_('Zugang') }) : T_('Führt durch {name}.', { name: geo.labels['o:' + op.id] || T_('eine Öffnung') })); continue; }
            pens.push({ type: 'wand', where: T_('Außenwand {n}', { n: e + 1 }), x: ea.x + (eb.x - ea.x) * hit.u, y: ea.y + (eb.y - ea.y) * hit.u, h: hc, seg: sg.i, host: 'e:' + e });
          }
          for (const { w, hb, ht, ops } of levelWalls) for (const ws of w.segs) {
            const hit = G.segIntersect(A2, B2, ws.a, ws.b);
            if (!hit) continue;
            const hc = hAt(hit.t);
            if (hc < hb || hc > ht) continue;
            const along = G.dist(w.a, G.lerp(ws.a, ws.b, hit.u));
            const op = ops.find((o) => !o.invalid && o.host === 'w:' + w.id && along > o.pos - o.w / 2 && along < o.pos + o.w / 2 && hc - hb > o.sill && hc - hb < o.sill + o.h);
            if (op) continue;
            pens.push({ type: 'innenwand', kind: w.kind, where: w.auto ? T_('Aufzugsschacht') : geo.labels['w:' + w.id] || T_('Innenwand'), x: ws.a.x + (ws.b.x - ws.a.x) * hit.u, y: ws.a.y + (ws.b.y - ws.a.y) * hit.u, h: hc, seg: sg.i, host: 'w:' + w.id });
          }
        }
        for (const [type, hz, nm] of [['decke', H + b.tRoof / 2, T_('Decke')], ['boden', hBot - b.tFloor / 2, T_('Bodenplatte')]].concat(slabsMid.map((m) => ['zwischendecke', (m.lo + m.hi) / 2, m.name]))) {
          const h0 = sg.A.z - zF, h1 = sg.B.z - zF;
          if ((h0 - hz) * (h1 - hz) >= 0) continue;
          const t = (hz - h0) / (h1 - h0);
          const pt = { x: sg.A.x + (sg.B.x - sg.A.x) * t, y: sg.A.y + (sg.B.y - sg.A.y) * t };
          if (G.pointInPolygon(pt, geo.out)) pens.push({ type, where: nm, x: pt.x, y: pt.y, h: hz, seg: sg.i, host: type });
        }
      }
      // Lage zu Boden, Decke und Wänden
      for (const sg of segs) {
        if (!sg.box) continue;
        const inside = G.pointInPolygon({ x: (sg.A.x + sg.B.x) / 2, y: (sg.A.y + sg.B.y) / 2 }, geo.out);
        const zs = boxVerts(sg.box).map((v) => v.z - zF), zc = boxVerts(sg.boxC).map((v) => v.z - zF);
        const penHere = (type) => pens.some((pn) => pn.seg === sg.i && pn.type === type);
        if (inside && min(...zs) < hBot - 1e-6 && !penHere('boden')) add('warn', T_('Abschnitt {i} liegt unter dem Rohboden.', { i: sg.i }));
        else if (inside && min(...zc) < hBot - 1e-6 && !penHere('boden')) add('info', T_('Abschnitt {i}: Platzabstand zum Boden unterschritten.', { i: sg.i }));
        for (const m of slabsMid) {
          if (!inside || penHere('zwischendecke')) continue;
          if (min(...zs) < m.hi - 1e-6 && max(...zs) > m.lo + 1e-6) add('warn', T_('Abschnitt {i} läuft in der {name}.', { i: sg.i, name: m.name }));
          else if (min(...zc) < m.hi - 1e-6 && max(...zc) > m.lo + 1e-6) add('info', T_('Abschnitt {i}: Platzabstand zur {name} unterschritten.', { i: sg.i, name: m.name }));
        }
        if (inside && max(...zs) > H + 1e-6 && !penHere('decke')) add('warn', T_('Abschnitt {i} stößt an die Decke.', { i: sg.i }));
        else if (inside && max(...zc) > H + 1e-6 && !penHere('decke')) add('info', T_('Abschnitt {i}: Platzabstand zur Decke unterschritten.', { i: sg.i }));
        for (const wb of wallBoxes) {
          if (pens.some((pn) => pn.seg === sg.i && pn.host === wb.id)) continue;
          if (overlaps(sg.box, wb.box)) add('warn', T_('Abschnitt {i} läuft in {name}.', { i: sg.i, name: wb.label }));
          else if (sg.boxC && overlaps(sg.boxC, wb.box)) add('info', T_('Abschnitt {i}: Platzabstand zu {name} unterschritten.', { i: sg.i, name: wb.label }));
        }
      }
      // Luftgeschwindigkeit
      let airflow = null, airSrc = null, v = null;
      if (r.type === 'luft') {
        if (finite(r.airflow)) { airflow = r.airflow; airSrc = 'eingetragen'; }
        else if (r.kind === 'zuluft' || r.kind === 'abluft') { airflow = tech.qCo2; airSrc = 'aus Lüftungsbedarf'; }
        if (finite(airflow) && dims.area > 0) {
          v = airflow / 3600 / dims.area;
          if (v > 6) add('warn', T_('Luftgeschwindigkeit {v} m/s: Querschnitt vergrößern (Ziel höchstens 4 m/s).', { v: fmt(v, 1) }));
          else if (v > 4) add('info', T_('Luftgeschwindigkeit {v} m/s, ab 4 m/s wird es hörbar.', { v: fmt(v, 1) }));
        }
      }
      const hs = r.pts.map((pt) => pt.h);
      list.push({ id: r.id, src: r, kind, dims, pts, segs, L, Lres: r.type === 'kabel' ? L * (1 + (r.reserve || 0) / 100) : L, bends, pens, issues, airflow, airSrc, v,
        hMin: hs.length ? min(...hs) : 0, hMax: hs.length ? max(...hs) : 0 });
    }
    // Leitungen untereinander
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i], B = list[j];
      let hit = false, near = false;
      for (const sa of A.segs) for (const sb of B.segs) {
        if (!sa.box || !sb.box) continue;
        if (overlaps(sa.box, sb.box)) hit = true;
        else if (overlaps(sa.boxC, sb.boxC)) near = true;
      }
      if (hit) { A.issues.push({ level: 'warn', text: T_('Kollidiert mit „{name}“.', { name: B.src.name }) }); B.issues.push({ level: 'warn', text: T_('Kollidiert mit „{name}“.', { name: A.src.name }) }); }
      else if (near) { A.issues.push({ level: 'info', text: T_('Platzabstand zu „{name}“ unterschritten.', { name: B.src.name }) }); B.issues.push({ level: 'info', text: T_('Platzabstand zu „{name}“ unterschritten.', { name: A.src.name }) }); }
    }
    const pens = list.flatMap((r) => r.pens.map((pn) => Object.assign({ route: r.src.name, dims: r.dims, rtype: r.src.type, rkind: r.src.kind }, pn)));
    const groups = {};
    for (const r of list) {
      const key = r.src.type + '|' + r.dims.label;
      const gr = groups[key] || (groups[key] = { type: r.src.type, label: r.dims.label, L: 0, Lres: 0, bends: 0, n: 0, kinds: new Set(), cables: new Set() });
      gr.L += r.L; gr.Lres += r.Lres; gr.bends += r.bends; gr.n++; gr.kinds.add(T_(r.kind.name)); if (r.src.cable) gr.cables.add(r.src.cable);
    }
    return {
      list, byId: Object.fromEntries(list.map((r) => [r.id, r])), groups: Object.values(groups), pens, wallBoxes,
      hull: pens.filter((x) => x.type !== 'innenwand' && x.type !== 'zwischendecke').length, inner: pens.filter((x) => x.type === 'innenwand' || x.type === 'zwischendecke').length,
      Lair: list.filter((r) => r.src.type === 'luft').reduce((sm, r) => sm + r.L, 0), Lcable: list.filter((r) => r.src.type === 'kabel').reduce((sm, r) => sm + r.L, 0),
    };
  }

  /* ---------- Schutzaufbau: Anforderungen und Schichten dokumentieren, Dicken, Flächenmassen, Mengen ---------- */

  /* Änderungsfingerabdruck, keine Signatur. */
  function hash(str) {
    let a = 2166136261, b = 2246822507;
    for (let i = 0; i < str.length; i++) { a = Math.imul(a ^ str.charCodeAt(i), 16777619); b = Math.imul(b ^ str.charCodeAt(i), 3266489909); }
    return str.length + ':' + [a, b].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
  }

  function protection(p, q) {
    const pr = p.protection, th = pr.threat, g = q.geo, b = p.build;
    const LG = g.L || [{ walls: g.walls, H: b.clearHeight, Anet: g.Anet, footStb: g.footStb }], multi = LG.length > 1;
    const allWalls = LG.flatMap((L) => L.walls.map((w) => Object.assign({ H: L.H }, w)));
    const tMids = (g.mids || []).reduce((sm, m) => sm + m.t, 0);
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    const outline = () => g.out.map((pt) => [r4(pt.x), r4(pt.y)]);
    const geomOf = {
      aussenwand: () => ({ t: b.tWall, out: outline(), ops: g.openings.filter((o) => o.outer && !o.invalid).map((o) => [o.host, r4(o.pos), r4(o.w), r4(o.h), r4(o.sill)]), H: multi ? r4(q.lv.Hint) : b.clearHeight, c: b.concrete, cnom: b.cnom }),
      decke: () => Object.assign({ t: b.tRoof, cover: b.cover, out: outline(), c: b.concrete, cnom: b.cnom }, q.lv.mound.on ? { mound: [r4(q.lv.mound.h), r4(q.lv.mound.crest), r4(q.lv.mound.n)] } : {}),
      bodenplatte: () => ({ t: b.tFloor, ovh: b.overhang, out: outline(), c: b.concrete }),
      innenwand: () => allWalls.filter((w) => w.kind === 'stb').map((w) => [w.id, r4(w.a.x), r4(w.a.y), r4(w.b.x), r4(w.b.y), w.t].concat(multi ? [w.level] : [])),
      zugang: () => ({ acc: g.access.map((a) => [a.kind, a.edge, r4(a.pos), r4(a.w), a.src.cover || '', a.tw]), doors: g.openings.filter((o) => !o.invalid && (o.kind === 'schutztuer' || o.kind === 'luke')).map((o) => [o.host, r4(o.pos), r4(o.w), r4(o.h)]) }),
      durchfuehrungen: () => ({ pens: q.routes.pens.filter((x) => x.type !== 'innenwand').map((x) => [x.host, r4(x.x), r4(x.y), r4(x.h), x.dims.label]), extra: p.tech.penetrations }),
    };
    const exists = {
      aussenwand: g.valid, decke: true, bodenplatte: true,
      innenwand: allWalls.some((w) => w.kind === 'stb' && w.len > 0),
      zugang: g.access.length > 0 || g.openings.some((o) => o.kind === 'schutztuer' || o.kind === 'luke'),
      durchfuehrungen: q.routes.hull > 0 || p.tech.penetrations > 0,
    };
    const stbFace = allWalls.filter((w) => w.kind === 'stb').reduce((sm, w) => sm + w.len * w.H, 0);
    const areaOf = {
      aussenwand: { außen: g.P * q.env.hOuter, innen: g.Pin * (multi ? q.lv.Hint - tMids : b.clearHeight) },
      decke: { außen: g.A, innen: max(0, g.Ain - LG[0].footStb) },
      bodenplatte: { außen: g.Aslab, innen: LG[LG.length - 1].Anet },
      innenwand: { außen: stbFace, innen: stbFace },
    };
    const comps = {}, items = [];
    let extraHalvings = 0;
    for (const [key, def] of Object.entries(M.PROT_TARGETS)) {
      const c = pr.components[key] || M.protComponent();
      const layers = c.layers.map((l) => {
        const mat = Object.hasOwn(M.PROT_MATERIALS, l.material) ? M.PROT_MATERIALS[l.material] : M.PROT_MATERIALS.other;
        const rho = finite(l.density) && l.density >= 0 && l.density <= 25000 ? l.density : mat.rho;
        return Object.assign({}, l, { mat, rho, t: finite(l.thickness) && l.thickness > 0 ? l.thickness / 1000 : null });
      });
      const total = layers.length && layers.every((l) => l.t != null) ? layers.reduce((sm, l) => sm + l.t, 0) : null;
      const mass = layers.length && layers.every((l) => l.t != null && finite(l.rho)) ? layers.reduce((sm, l) => sm + l.t * l.rho, 0) : null;
      const concrete = layers.filter((l) => l.material === 'concrete' && l.t != null).reduce((sm, l) => sm + l.t, 0);
      const firstConcrete = layers.findIndex((l) => l.material === 'concrete');
      const buildT = def.build ? b[def.build] : null;
      const sig = hash(JSON.stringify({ th, layers: c.layers, rf: c.reinforcement, cn: c.connections, geom: geomOf[key]() }));
      const ev = c.evidence || {};
      const state = !exists[key] ? 'fehlt' : !ev.baseline ? 'offen' : ev.baseline !== sig ? 'veraltet' : 'zugeordnet';
      if (areaOf[key]) {
        layers.forEach((l, i) => {
          if (l.material === 'concrete' || l.material === 'gap' || (key === 'decke' && l.material === 'earth') || l.t == null || l.t <= 0) return;
          const side = firstConcrete >= 0 && i < firstConcrete ? 'außen' : 'innen';
          const area = areaOf[key][side];
          if (!(area > 0)) return;
          const lid = typeof l.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(l.id) ? l.id : i;
          const mk = () => T_('{target}, {side}: {mat}, {t} mm', { target: T_(def.name), side: side === 'außen' ? T_('außen') : T_('innen'), mat: T_(l.mat.name) + (l.grade ? ' ' + l.grade : ''), t: fmt(l.thickness, l.thickness < 10 ? 1 : 0) });
          items.push({ key: 'schutz_' + key + '_' + lid, target: key, name: mk(), de: I18.lang() === 'de' ? undefined : I18.withLang('de', mk),
            area, volume: area * l.t, mass: finite(l.rho) ? area * l.t * l.rho / 1000 : null, price: l.mat.rate * l.t });
          // Abschirmung über Flächenmasse: rund 144 kg/m² je Halbwertsschicht (6 cm Beton, 8 cm Erde)
          if (key === 'decke' && finite(l.rho)) extraHalvings += l.t * l.rho / 144;
        });
      }
      comps[key] = { key, def, c, layers, total, mass, concrete, buildT, deviates: !!def.build && firstConcrete >= 0 && Math.abs(concrete - buildT) > 1e-6, sig, state, exists: exists[key] };
    }
    const gaps = [];
    const used = th.family !== 'undefined' || Object.values(pr.components).some((c) => c.layers.length);
    if (used) {
      const txt = (v) => String(v || '').trim();
      if (th.family === 'undefined') gaps.push(T_('Schutzziel noch festzulegen.'));
      if (!txt(th.criterion)) gaps.push(T_('Geforderte Schutzwirkung und Akzeptanzkriterien fehlen.'));
      if (!txt(th.standard) && th.family !== 'fallout') gaps.push(T_('Prüf- bzw. Bemessungsgrundlage mit Ausgabe fehlt.'));
      if (M.PROT_PROJECTILE.includes(th.family) && (!txt(th.projectile) || !txt(th.core) || ![th.velocity, th.shots, th.spacing, th.distance, th.angle].every(finite) || !txt(th.pattern))) gaps.push(T_('Geschoss und Bedingungen des Mehrfachbeschusses unvollständig.'));
      if (th.family === 'fragments' && (!txt(th.projectile) || !finite(th.velocity) || !txt(th.pattern))) gaps.push(T_('Splitterform und -masse, Geschwindigkeit und Trefferbild fehlen.'));
      if ((th.family === 'blast' || th.family === 'combined') && !txt(th.notes)) gaps.push(T_('Druck-Zeit-Verlauf, Impuls und Belastungsrichtung festlegen.'));
      for (const key of Object.keys(M.PROT_TARGETS)) {
        const cp = comps[key];
        if (!cp.exists || (!['aussenwand', 'decke', 'zugang', 'durchfuehrungen'].includes(key) && !cp.c.layers.length)) continue;
        if (cp.state !== 'zugeordnet') gaps.push(cp.state === 'veraltet' ? T_('{name}: Prüfunterlage passt nicht mehr zum Plan, erneut prüfen.', { name: T_(cp.def.name) }) : T_('{name}: Prüfunterlage noch nicht zugeordnet.', { name: T_(cp.def.name) }));
      }
    }
    return { comps, items, gaps, used, extraHalvings };
  }

  /* Prüft, ob eine Unterlage zugeordnet werden darf; liefert Fehlermeldung oder null. */
  function canRecord(p, key) {
    const c = p.protection.components[key], th = p.protection.threat, ev = c.evidence;
    const txt = (v) => String(v || '').trim();
    if (![ev.reference, ev.authority, ev.date, ev.scope].every(txt)) return T_('Dokument, Fachstelle, Datum und Geltungsbereich eintragen.');
    if (th.family === 'undefined' || !txt(th.criterion)) return T_('Zuerst Schutzziel und Akzeptanzkriterien festlegen.');
    if (th.family !== 'fallout' && !txt(th.standard)) return T_('Prüf- bzw. Bemessungsgrundlage eintragen.');
    if (key !== 'durchfuehrungen' && key !== 'zugang' && (!c.layers.length || c.layers.some((l) => !(finite(l.thickness) && l.thickness > 0) || (l.material !== 'gap' && !txt(l.grade))))) return T_('Schichtdicken und Materialgüten vollständig eintragen.');
    if (M.PROT_PROJECTILE.includes(th.family) && (!txt(th.projectile) || !txt(th.core) || ![th.velocity, th.shots, th.spacing, th.distance, th.angle].every(finite) || !txt(th.pattern))) return T_('Beschussbedingungen vollständig festlegen.');
    if (th.family === 'fragments' && (!txt(th.projectile) || !finite(th.velocity) || !txt(th.pattern))) return T_('Splitterbedingungen vollständig festlegen.');
    if ((th.family === 'blast' || th.family === 'combined') && !txt(th.notes)) return T_('Druckbedingungen festlegen.');
    return null;
  }

  BP.calcExtra = { routes, protection, canRecord, routeDims, obb, boxVerts, overlaps, hash };
})(typeof window !== 'undefined' ? window : globalThis);
