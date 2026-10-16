/* IFC-Export (BIM): Rohbau, Räume, Zugänge, Aufzüge, Leitungen und Einbauten als IFC4 (STEP, ISO 10303-21).
 * Geometrie als Extrusionen (IfcExtrudedAreaSolid) in Metern, Öffnungen als IfcOpeningElement mit Türen,
 * Räume als IfcSpace, Baustoffe, Eigenschaften (Pset_*Common, Pset_ConcreteElementGeneral) und Mengen (Qto_*).
 * Die Geometrie entspricht dem 3D-Modell (js/view3d.js). Kennungen (GlobalId) werden aus der Projektkennung und
 * dem Bauteilschlüssel abgeleitet, damit wiederholte Exporte dieselben Kennungen behalten. */
(function (root) {
  const BP = root.BP, G = BP.geo, T_ = BP.i18n.T;
  const IFC = BP.ifc = {};

  /* ---------- Kennungen ---------- */
  function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }
  const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  /* 128 Bit → 22 Zeichen (2 + 21 × 6 Bit), Zeichensatz nach IFC */
  function guidOf(seed) {
    let n = 0n;
    for (const x of cyrb128(seed)) n = (n << 32n) | BigInt(x);
    let s = B64[Number(n >> 126n)];
    for (let i = 20; i >= 0; i--) s += B64[Number((n >> BigInt(i * 6)) & 63n)];
    return s;
  }
  IFC.guidOf = guidOf;

  /* ---------- STEP-Schreiber ---------- */
  const STAR = { star: true };
  const S = (v) => ({ t: 's', v: String(v) });
  const E = (v) => ({ t: 'e', v });
  const B = (v) => ({ t: 'b', v: !!v });
  const I = (v) => ({ t: 'i', v: Math.round(v) });
  const TY = (type, v) => ({ t: 'ty', type, v });
  function enc(s) {
    let out = '';
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (ch === "'") out += "''";
      else if (ch === '\\') out += '\\\\';
      else if (c >= 32 && c <= 126) out += ch;
      else if (c <= 0xffff) out += '\\X2\\' + c.toString(16).toUpperCase().padStart(4, '0') + '\\X0\\';
      else out += '\\X4\\' + c.toString(16).toUpperCase().padStart(8, '0') + '\\X0\\';
    }
    return "'" + out + "'";
  }
  function real(x) {
    let r = Math.round((isFinite(x) ? x : 0) * 1e6) / 1e6;
    if (Object.is(r, -0)) r = 0;
    let s = String(r);
    if (/e/i.test(s)) s = r.toExponential().toUpperCase();
    if (!/[.E]/.test(s)) s += '.';
    else if (!s.includes('.')) s = s.replace('E', '.E');
    return s;
  }
  function fmt(v) {
    if (v == null) return '$';
    if (v === STAR) return '*';
    if (v.ref) return v.ref;
    if (Array.isArray(v)) return '(' + v.map(fmt).join(',') + ')';
    if (typeof v === 'number') return real(v);
    if (v.t === 's') return enc(v.v);
    if (v.t === 'e') return '.' + v.v + '.';
    if (v.t === 'b') return v.v ? '.T.' : '.F.';
    if (v.t === 'i') return String(v.v);
    if (v.t === 'ty') return v.type + '(' + fmt(v.v) + ')';
    throw new Error('IFC: unbekannter Wert');
  }
  function writer() {
    const lines = [], cache = new Map();
    const w = {
      lines,
      add(type, ...args) { lines.push(type + '(' + args.map(fmt).join(',') + ');'); return { ref: '#' + lines.length }; },
      // gleiche Punkte, Richtungen und Stile nur einmal schreiben
      once(key, make) { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); },
    };
    return w;
  }

  /* ---------- Hilfen ---------- */
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  function cleanPoly(poly) {
    const out = [];
    for (const p of poly) {
      if (!p || !isFinite(p.x) || !isFinite(p.y)) return null;
      if (out.length && G.dist(out[out.length - 1], p) < 1e-6) continue;
      out.push(p);
    }
    if (out.length > 1 && G.dist(out[0], out[out.length - 1]) < 1e-6) out.pop();
    // Punkte auf einer Geraden und Rückläufer („Spitzen“ ohne Fläche) entfernen, sonst entstehen ungültige Profile
    for (let changed = true; changed && out.length >= 3;) {
      changed = false;
      for (let i = 0; i < out.length && out.length >= 3; i++) {
        const a = out[(i - 1 + out.length) % out.length], p = out[i], c = out[(i + 1) % out.length];
        const cr = (p.x - a.x) * (c.y - p.y) - (p.y - a.y) * (c.x - p.x);
        if (Math.abs(cr) < 1e-10 * Math.max(1, G.dist(a, p) * G.dist(p, c)) || G.dist(a, c) < 1e-6) { out.splice(i, 1); changed = true; i--; }
      }
    }
    return out.length >= 3 && Math.abs(G.signedArea(out)) > 1e-8 ? out : null;
  }
  const ccw = (poly) => (G.signedArea(poly) < 0 ? poly.slice().reverse() : poly);
  const cw = (poly) => (G.signedArea(poly) > 0 ? poly.slice().reverse() : poly);

  /* Umriss einer Rasterkomponente (Raum) als Ringe: äußerer Ring gegen, Löcher im Uhrzeigersinn */
  function compLoops(gr, c) {
    const inC = new Set(c.cells.map(([i, j]) => i + ',' + j));
    const has = (i, j) => inC.has(i + ',' + j);
    const edges = new Map();
    const addE = (a, b) => { const k = a[0] + ',' + a[1]; if (!edges.has(k)) edges.set(k, []); edges.get(k).push(b); };
    for (const [i, j] of c.cells) {
      if (!has(i, j - 1)) addE([i, j], [i + 1, j]);
      if (!has(i + 1, j)) addE([i + 1, j], [i + 1, j + 1]);
      if (!has(i, j + 1)) addE([i + 1, j + 1], [i, j + 1]);
      if (!has(i - 1, j)) addE([i, j + 1], [i, j]);
    }
    const loops = [];
    while (edges.size) {
      const start = edges.keys().next().value;
      let k = start;
      const ring = [];
      for (let guard = 0; guard < 100000; guard++) {
        const list = edges.get(k);
        if (!list) break;
        const nx = list.pop();
        if (!list.length) edges.delete(k);
        const [i, j] = k.split(',').map(Number);
        ring.push({ x: gr.xs[i], y: gr.ys[j] });
        k = nx[0] + ',' + nx[1];
        if (k === start) break;
      }
      // Punkte auf geraden Kanten entfernen
      const s = ring.filter((p, i) => {
        const a = ring[(i - 1 + ring.length) % ring.length], b = ring[(i + 1) % ring.length];
        return !((Math.abs(a.x - p.x) < 1e-9 && Math.abs(b.x - p.x) < 1e-9) || (Math.abs(a.y - p.y) < 1e-9 && Math.abs(b.y - p.y) < 1e-9));
      });
      if (s.length >= 3) loops.push(s);
    }
    const outer = loops.filter((l) => G.signedArea(l) > 0).sort((a, b) => G.signedArea(b) - G.signedArea(a))[0];
    return outer ? { outer, holes: loops.filter((l) => G.signedArea(l) < 0) } : null;
  }
  IFC.compLoops = compLoops;

  /* Breiten- und Längengrad als IfcCompoundPlaneAngleMeasure (Grad, Minuten, Sekunden, Millionstel) */
  function dms(v) {
    const sg = v < 0 ? -1 : 1, a = Math.abs(v), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), sf = (mf - m) * 60, s = Math.floor(sf);
    const mic = Math.min(999999, Math.round((sf - s) * 1e6));
    return [I(sg * d), I(sg * m), I(sg * s), I(sg * mic)];
  }

  /* ---------- Modell ---------- */
  IFC.build = function (p, q, opt) {
    opt = opt || {};
    const w = writer(), g = q.geo, lv = q.lv, b = p.build, NC = BP.normen.profile(p);
    const seed = (p.uid || p.name || 'bunker') + '|';
    const used = new Set();
    const gid = (key) => { let s = guidOf(seed + key), n = 1; while (used.has(s)) s = guidOf(seed + key + '#' + n++); used.add(s); return S(s); };
    const stats = { byClass: {}, concrete: 0 };

    // Grundlagen
    const pt3 = (x, y, z) => w.once('p3' + r6(x) + ',' + r6(y) + ',' + r6(z), () => w.add('IFCCARTESIANPOINT', [r6(x), r6(y), r6(z)]));
    const pt2 = (x, y) => w.once('p2' + r6(x) + ',' + r6(y), () => w.add('IFCCARTESIANPOINT', [r6(x), r6(y)]));
    const dir3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l; return w.once('d3' + r6(x) + ',' + r6(y) + ',' + r6(z), () => w.add('IFCDIRECTION', [r6(x), r6(y), r6(z)])); };
    const dir2 = (x, y) => w.once('d2' + r6(x) + ',' + r6(y), () => w.add('IFCDIRECTION', [r6(x), r6(y)]));
    const origin = pt3(0, 0, 0), zUp = dir3(0, 0, 1), xDir = dir3(1, 0, 0);
    const wcs = w.add('IFCAXIS2PLACEMENT3D', origin, zUp, xDir);
    const ctx = w.add('IFCGEOMETRICREPRESENTATIONCONTEXT', null, S('Model'), I(3), 1e-5, wcs, dir2(0, 1));
    const body = w.add('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', S('Body'), S('Model'), STAR, STAR, STAR, STAR, ctx, null, E('MODEL_VIEW'), null);
    const units = w.add('IFCUNITASSIGNMENT', [
      w.add('IFCSIUNIT', STAR, E('LENGTHUNIT'), null, E('METRE')),
      w.add('IFCSIUNIT', STAR, E('AREAUNIT'), null, E('SQUARE_METRE')),
      w.add('IFCSIUNIT', STAR, E('VOLUMEUNIT'), null, E('CUBIC_METRE')),
      w.add('IFCSIUNIT', STAR, E('PLANEANGLEUNIT'), null, E('RADIAN')),
      w.add('IFCSIUNIT', STAR, E('MASSUNIT'), E('KILO'), E('GRAM')),
    ]);
    const project = w.add('IFCPROJECT', gid('project'), null, S(p.name || 'Bunker'), S(T_('Vorplanung aus dem Bunkerplaner')), null, null, null, [ctx], units);

    // Stile
    const style = (rgb, tr) => w.once('st' + rgb.join(',') + '|' + (tr || 0), () => {
      const col = w.add('IFCCOLOURRGB', null, rgb[0], rgb[1], rgb[2]);
      return w.add('IFCSURFACESTYLE', null, E('BOTH'), [w.add('IFCSURFACESTYLESHADING', col, tr || 0)]);
    });
    const COL = { concrete: [0.73, 0.74, 0.73], slab: [0.84, 0.85, 0.84], mw: [0.85, 0.78, 0.68], tb: [0.92, 0.92, 0.92], steel: [0.37, 0.4, 0.39],
      space: [0.55, 0.75, 0.95], tech: [0.95, 0.75, 0.2] };

    // Räumliche Struktur
    const sitePl = w.add('IFCLOCALPLACEMENT', null, w.add('IFCAXIS2PLACEMENT3D', origin, null, null));
    const lat = p.site.lat, lon = p.site.lon, hN = isFinite(p.site.groundNHN) && p.site.groundNHN != null ? p.site.groundNHN : null;
    const site = w.add('IFCSITE', gid('site'), null, S(p.site.label || T_('Grundstück')), null, null, sitePl, null, null, E('ELEMENT'),
      isFinite(lat) && lat != null ? dms(lat) : null, isFinite(lon) && lon != null ? dms(lon) : null, hN, null, null);
    const bldPl = w.add('IFCLOCALPLACEMENT', sitePl, w.add('IFCAXIS2PLACEMENT3D', origin, null, null));
    const building = w.add('IFCBUILDING', gid('building'), null, S(p.name || T_('Schutzraum')), null, S(T_('Schutzraum')), bldPl, null, null, E('ELEMENT'), hN, hN, null);
    w.add('IFCRELAGGREGATES', gid('rel-project'), null, null, null, project, [site]);
    w.add('IFCRELAGGREGATES', gid('rel-site'), null, null, null, site, [building]);
    const LV = lv.levels && lv.levels.length ? lv.levels : [{ idx: 0, name: T_('Ebene 1'), zCeil: lv.zCeil, zFloorTop: lv.zFloorTop, zSlabTop: lv.zRoofTop, tSlab: 0 }];
    const GL = g.L || [g], nL = LV.length;
    const st = LV.map((L, li) => {
      const pl = w.add('IFCLOCALPLACEMENT', bldPl, w.add('IFCAXIS2PLACEMENT3D', pt3(0, 0, L.zFloorTop), null, null));
      const ref = w.add('IFCBUILDINGSTOREY', gid('storey' + li), null, S(L.name || T_('Ebene {n}', { n: li + 1 })), null, null, pl, null, null, E('ELEMENT'), L.zFloorTop);
      return { pl, ref, E: L.zFloorTop, items: [], spaces: [] };
    });
    w.add('IFCRELAGGREGATES', gid('rel-building'), null, null, null, building, st.map((s) => s.ref));
    const zEntry = lv.zEntry != null ? lv.zEntry : lv.zFloorTop;
    const liEntry = Math.max(0, LV.findIndex((L) => Math.abs(L.zFloorTop - zEntry) < 1e-6));

    // Geometrie (z relativ zur Ebene)
    function profile(poly, holes) {
      const o = cleanPoly(poly);
      if (!o) return null;
      const line = (pts) => w.add('IFCPOLYLINE', pts.concat([pts[0]]).map((pt) => pt2(pt.x, pt.y)));
      const hs = (holes || []).map(cleanPoly).filter(Boolean);
      return hs.length ? w.add('IFCARBITRARYPROFILEDEFWITHVOIDS', E('AREA'), null, line(ccw(o)), hs.map((h) => line(cw(h))))
        : w.add('IFCARBITRARYCLOSEDPROFILEDEF', E('AREA'), null, line(ccw(o)));
    }
    function extZ(poly, z0, z1, Eo, holes) {
      if (!(z1 - z0 > 1e-4)) return null;
      const pr = profile(poly, holes);
      return pr && w.add('IFCEXTRUDEDAREASOLID', pr, w.add('IFCAXIS2PLACEMENT3D', pt3(0, 0, z0 - Eo), null, null), zUp, z1 - z0);
    }
    /* Profil in einer lotrechten Ebene: x längs X (waagrecht), y = absolute Höhe; extrudiert waagrecht in Richtung d um depth */
    function extV(pts, o, X, d, depth, Eo) {
      if (!(depth > 1e-4)) return null;
      const Z = { x: X.y, y: -X.x }, sgn = Z.x * d.x + Z.y * d.y >= 0 ? 1 : -1;
      const pr = profile(pts);
      return pr && w.add('IFCEXTRUDEDAREASOLID', pr, w.add('IFCAXIS2PLACEMENT3D', pt3(o.x, o.y, -Eo), dir3(Z.x, Z.y, 0), dir3(X.x, X.y, 0)), dir3(0, 0, sgn), depth);
    }
    /* Rohr bzw. Kanal von A nach B (absolute Koordinaten) */
    function extLine(A, Bp, round, dims, Eo) {
      const dx = Bp.x - A.x, dy = Bp.y - A.y, dz = Bp.z - A.z, L = Math.hypot(dx, dy, dz);
      if (L < 1e-4) return null;
      const hor = Math.hypot(dx, dy);
      const ref = hor > 1e-6 ? { x: -dy / hor, y: dx / hor, z: 0 } : { x: 1, y: 0, z: 0 };
      const pr = round ? w.add('IFCCIRCLEPROFILEDEF', E('AREA'), null, null, Math.max(0.005, dims.w / 2))
        : w.add('IFCRECTANGLEPROFILEDEF', E('AREA'), null, null, Math.max(0.01, dims.w), Math.max(0.01, dims.h));
      return w.add('IFCEXTRUDEDAREASOLID', pr, w.add('IFCAXIS2PLACEMENT3D', pt3(A.x, A.y, A.z - Eo), dir3(dx, dy, dz), dir3(ref.x, ref.y, ref.z)), zUp, L);
    }
    const styled = (solids, col, tr) => { const sty = style(col, tr); for (const s of solids) w.add('IFCSTYLEDITEM', s, [sty], null); return solids; };
    const shape = (solids) => w.add('IFCPRODUCTDEFINITIONSHAPE', null, null, [w.add('IFCSHAPEREPRESENTATION', body, S('Body'), S('SweptSolid'), solids)]);

    // Baustoffe, Eigenschaften, Mengen
    const mats = {}, matOf = {};
    const material = (key, name, cat) => mats[key] || (mats[key] = { ref: w.add('IFCMATERIAL', S(name), null, S(cat)), objs: [] });
    const concrete = () => material('c', b.concrete + (NC.code === 'ACI' ? ' (f′c ' + Math.round((BP.model.CONCRETE[b.concrete] || {}).fck || 30) + ' MPa)' : ''), 'Concrete');
    const psets = new Map();
    const pset = (name, props) => {
      const key = name + JSON.stringify(props);
      if (!psets.has(key)) {
        const list = props.filter((x) => x[1] != null).map(([n, v]) => w.add('IFCPROPERTYSINGLEVALUE', S(n), null, v, null));
        psets.set(key, { ref: w.add('IFCPROPERTYSET', gid('pset-' + key), null, S(name), null, list), objs: [] });
      }
      return psets.get(key);
    };
    const qto = (el, key, name, qs) => {
      const list = qs.filter((x) => isFinite(x[2]) && x[2] > 0).map(([kind, n, v]) => w.add('IFCQUANTITY' + kind, S(n), null, null, v, null));
      if (!list.length) return;
      const qref = w.add('IFCELEMENTQUANTITY', gid('qto-' + key), null, S(name), null, null, list);
      w.add('IFCRELDEFINESBYPROPERTIES', gid('relq-' + key), null, null, null, [el], qref);
    };
    const fire = TY('IFCLABEL', S(b.fireClass || ''));
    const concreteProps = () => pset('Pset_ConcreteElementGeneral', [['StrengthClass', TY('IFCLABEL', S(b.concrete))], ['ConcreteCover', TY('IFCPOSITIVELENGTHMEASURE', b.cnom)],
      ['ReinforcementStrengthClass', TY('IFCLABEL', S(NC.steel || 'B500B'))]]);
    const common = (cls, ext, bearing) => {
      const n = { IFCWALL: 'Pset_WallCommon', IFCSLAB: 'Pset_SlabCommon', IFCCOLUMN: 'Pset_ColumnCommon', IFCBEAM: 'Pset_BeamCommon', IFCSTAIR: 'Pset_StairCommon' }[cls];
      if (!n) return null;
      const props = [['IsExternal', TY('IFCBOOLEAN', B(ext))]];
      if (cls !== 'IFCSTAIR') props.push(['LoadBearing', TY('IFCBOOLEAN', B(bearing))]);
      if (bearing) props.push(['FireRating', fire]);
      return pset(n, props);
    };

    /* Bauteil anlegen. o: { key, name, li, solids, col, mat ('c'|'mw'|'tb'|'st'), ext, bearing, pre (PredefinedType), extra (Zusatzattribute), tag, vol } */
    function element(cls, o) {
      const solids = (o.solids || []).filter(Boolean);
      if (!solids.length) return null;
      styled(solids, o.col || COL.concrete, o.tr);
      const s = st[o.li] || st[0];
      const pl = w.add('IFCLOCALPLACEMENT', s.pl, w.add('IFCAXIS2PLACEMENT3D', origin, null, null));
      const args = [gid(o.key), null, S(o.name), o.desc ? S(o.desc) : null, o.objType ? S(o.objType) : null, pl, shape(solids), o.tag ? S(o.tag) : null];
      const el = w.add(cls, ...args.concat(o.extra || [o.pre ? E(o.pre) : E('NOTDEFINED')]));
      el.pl = pl;
      s.items.push(el);
      stats.byClass[cls] = (stats.byClass[cls] || 0) + 1;
      if (o.mat) { const m = o.mat === 'c' ? concrete() : o.mat === 'mw' ? material('mw', T_('Kalksandstein-Mauerwerk'), 'Masonry') : o.mat === 'tb' ? material('tb', T_('Trockenbau (Gipskarton)'), 'Gypsum') : material('st', T_('Stahl'), 'Steel'); m.objs.push(el); }
      const cp = common(cls, !!o.ext, !!o.bearing);
      if (cp) cp.objs.push(el);
      if (o.mat === 'c') { concreteProps().objs.push(el); if (isFinite(o.vol)) stats.concrete += o.vol; }
      return el;
    }
    /* Öffnung in einem Bauteil, ggf. mit Tür */
    function opening(host, key, foot, z0, z1, li, kind, width) {
      if (!host) return;
      const s = st[li] || st[0];
      const sol = extZ(foot, z0, z1, s.E);
      if (!sol) return;
      const pl = w.add('IFCLOCALPLACEMENT', host.pl, w.add('IFCAXIS2PLACEMENT3D', origin, null, null));
      const op = w.add('IFCOPENINGELEMENT', gid('open-' + key), null, S(T_('Öffnung')), null, null, pl, shape([sol]), null, E('OPENING'));
      w.add('IFCRELVOIDSELEMENT', gid('void-' + key), null, null, null, host, op);
      stats.byClass.IFCOPENINGELEMENT = (stats.byClass.IFCOPENINGELEMENT || 0) + 1;
      if (kind === 'durchgang' || !kind) return;
      // Türblatt als dünne Platte in Wandmitte
      const [a, bq, c, d] = foot, m0 = G.lerp(a, d, 0.5), m1 = G.lerp(bq, c, 0.5), nn = G.norm(G.sub(d, a)), half = kind === 'schutztuer' ? 0.04 : 0.02;
      const leaf = [G.add(m0, G.mul(nn, -half)), G.add(m1, G.mul(nn, -half)), G.add(m1, G.mul(nn, half)), G.add(m0, G.mul(nn, half))];
      const name = T_((BP.model.OPENING_KINDS[kind] || { name: 'Tür' }).name);
      const door = element('IFCDOOR', { key: 'door-' + key, name, li, solids: [extZ(leaf, z0, z1, s.E)], col: kind === 'innen' ? COL.tb : COL.steel, mat: kind === 'innen' ? null : 'st',
        extra: [z1 - z0, width, E('DOOR'), E(kind === 'innen' ? 'SINGLE_SWING_LEFT' : 'NOTDEFINED'), null] });
      if (door) w.add('IFCRELFILLSELEMENT', gid('fill-' + key), null, null, null, op, door);
    }
    const qWall = (el, key, len, t, h, vol) => qto(el, key, 'Qto_WallBaseQuantities', [['LENGTH', 'Length', len], ['LENGTH', 'Width', t], ['LENGTH', 'Height', h], ['VOLUME', 'NetVolume', vol]]);
    const qSlab = (el, key, t, area, vol) => qto(el, key, 'Qto_SlabBaseQuantities', [['LENGTH', 'Width', t], ['AREA', 'NetArea', area], ['VOLUME', 'NetVolume', vol]]);
    const areaOf = (poly, holes) => G.area(poly) - (holes || []).reduce((s, h) => s + G.area(h), 0);

    const bottom = nL - 1;
    // Bodenplatte (Aufzugsgruben ausgespart)
    const vs = g.vert || { stairs: [], lifts: [] };
    const pitHoles = (vs.lifts || []).filter((v) => v.design && v.levelBot === bottom).map((v) => v.innerPoly);
    {
      const t = lv.zFloorTop - lv.zSlabBot, A = areaOf(g.slab, pitHoles);
      const el = element('IFCSLAB', { key: 'slab', name: T_('Bodenplatte'), li: bottom, solids: [extZ(g.slab, lv.zSlabBot, lv.zFloorTop, st[bottom].E, pitHoles)], col: COL.slab, mat: 'c', ext: true, bearing: true, pre: 'BASESLAB', vol: A * t });
      if (el) qSlab(el, 'slab', t, A, A * t);
    }
    // Außenwände je Kante und Ebene, Öffnungen in der Zugangsebene
    if (g.valid) {
      for (let i = 0; i < g.n; i++) {
        const a = g.out[i], bq = g.out[(i + 1) % g.n], ia = g.inner[i], ib = g.inner[(i + 1) % g.n];
        const len = G.dist(a, bq), u = G.norm(G.sub(bq, a)), nn = G.edgeNormal(a, bq), foot = [a, bq, ib, ia];
        const ops = g.openings.filter((o) => !o.invalid && o.host === 'e:' + i);
        LV.forEach((L, li) => {
          const z0 = L.zFloorTop, z1 = li === 0 ? lv.zCeil : LV[li - 1].zFloorTop, key = 'ow' + i + '-' + li;
          const myOps = li === liEntry ? ops : [];
          const A = G.area(foot), vol = A * (z1 - z0) - myOps.reduce((s, o) => s + o.w * Math.min(o.h, z1 - z0 - o.sill) * b.tWall, 0);
          const el = element('IFCWALL', { key, name: T_('Außenwand {n}', { n: i + 1 }) + (nL > 1 ? ' · ' + (L.name || '') : ''), li, solids: [extZ(foot, z0, z1, st[li].E)],
            mat: 'c', ext: true, bearing: true, pre: 'SOLIDWALL', vol });
          if (!el) return;
          qWall(el, key, len, b.tWall, z1 - z0, vol);
          for (const o of myOps) {
            const t0 = o.pos - o.w / 2, t1 = o.pos + o.w / 2, P = (t) => G.add(a, G.mul(u, t)), eps = 0.02;
            const f = [G.add(P(t0), G.mul(nn, eps)), G.add(P(t1), G.mul(nn, eps)), G.sub(P(t1), G.mul(nn, b.tWall + eps)), G.sub(P(t0), G.mul(nn, b.tWall + eps))];
            opening(el, 'ow' + o.id, f, z0 + o.sill, Math.min(z1, z0 + o.sill + o.h), li, o.kind, o.w);
          }
        });
      }
    }
    // Innenwände, Stützen, Unterzüge je Ebene
    GL.forEach((Lg, li) => {
      const L = LV[li] || LV[0], Eo = st[li].E;
      for (const wl of Lg.walls || []) {
        const len = G.dist(wl.a, wl.b);
        if (len < 1e-3) continue;
        const u = G.norm(G.sub(wl.b, wl.a)), n = { x: -u.y * wl.t / 2, y: u.x * wl.t / 2 };
        const kind = wl.kind || 'stb', H = L.zCeil - L.zFloorTop;
        const solids = (wl.segs || [{ a: wl.a, b: wl.b }]).map((sg) => extZ([G.add(sg.a, n), G.add(sg.b, n), G.sub(sg.b, n), G.sub(sg.a, n)], L.zFloorTop, L.zCeil, Eo));
        const segLen = (wl.segs || [{ a: wl.a, b: wl.b }]).reduce((s, sg) => s + G.dist(sg.a, sg.b), 0);
        const ops = (Lg.openings || []).filter((o) => !o.invalid && o.host === 'w:' + wl.id);
        const vol = segLen * wl.t * H - ops.reduce((s, o) => s + o.w * Math.min(o.h, H - o.sill) * wl.t, 0);
        const name = wl.auto ? T_('Aufzugsschacht') : g.labels['w:' + wl.id] || T_('Innenwand');
        const el = element('IFCWALL', { key: 'w' + li + '-' + wl.id, name, li, solids, mat: kind === 'stb' ? 'c' : kind, col: kind === 'stb' ? COL.concrete : kind === 'mw' ? COL.mw : COL.tb,
          ext: false, bearing: kind === 'stb', pre: kind === 'stb' ? 'SOLIDWALL' : 'PARTITIONING', vol: kind === 'stb' ? vol : NaN });
        if (!el) continue;
        qWall(el, 'w' + li + '-' + wl.id, segLen, wl.t, H, vol);
        for (const o of ops) {
          const P = (t) => G.add(wl.a, G.mul(u, t)), t0 = o.pos - o.w / 2, t1 = o.pos + o.w / 2, nE = G.mul(G.norm(n), wl.t / 2 + 0.02);
          opening(el, 'w' + li + '-' + o.id, [G.add(P(t0), nE), G.add(P(t1), nE), G.sub(P(t1), nE), G.sub(P(t0), nE)], L.zFloorTop + o.sill, Math.min(L.zCeil, L.zFloorTop + o.sill + o.h), li, o.kind, o.w);
        }
      }
      (Lg.columns || []).forEach((c, k) => {
        const H = L.zCeil - L.zFloorTop, key = 'c' + li + '-' + (c.id || k);
        const el = element('IFCCOLUMN', { key, name: g.labels['c:' + c.id] || T_('Stütze') + ' ' + (k + 1), li, mat: 'c', bearing: true, pre: 'COLUMN', vol: c.bx * c.by * H,
          solids: [extZ(G.polygonFromRect(c.x - c.bx / 2, c.y - c.by / 2, c.x + c.bx / 2, c.y + c.by / 2), L.zFloorTop, L.zCeil, Eo)] });
        if (el) qto(el, key, 'Qto_ColumnBaseQuantities', [['LENGTH', 'Length', H], ['AREA', 'CrossSectionArea', c.bx * c.by], ['VOLUME', 'NetVolume', c.bx * c.by * H]]);
      });
      (Lg.beams || []).forEach((bu, k) => {
        const segs = bu.segs || [], key = 'b' + li + '-' + (bu.id || k);
        const solids = segs.map((sg) => { const u = G.norm(G.sub(sg.b, sg.a)), n = { x: -u.y * bu.bw / 2, y: u.x * bu.bw / 2 }; return extZ([G.add(sg.a, n), G.add(sg.b, n), G.sub(sg.b, n), G.sub(sg.a, n)], L.zCeil - bu.hb, L.zCeil, Eo); });
        const len = segs.reduce((s, sg) => s + G.dist(sg.a, sg.b), 0);
        const el = element('IFCBEAM', { key, name: g.labels['b:' + bu.id] || T_('Unterzug') + ' ' + (k + 1), li, solids, mat: 'c', bearing: true, pre: 'BEAM', vol: len * bu.bw * bu.hb });
        if (el) qto(el, key, 'Qto_BeamBaseQuantities', [['LENGTH', 'Length', len], ['VOLUME', 'NetVolume', len * bu.bw * bu.hb]]);
      });
      // Zwischendecke über dieser Ebene gehört als Fußboden zur Ebene darüber
      if (li > 0 && g.valid) {
        const holes = (GL[li - 1].holesBelow || []).concat((vs.lifts || []).filter((v) => li - 1 >= v.wallTop && li <= v.levelBot).map((v) => v.innerPoly));
        const t = L.zSlabTop - L.zCeil, A = areaOf(g.inner, holes);
        const el = element('IFCSLAB', { key: 'zd' + li, name: T_('Zwischendecke über Ebene {n}', { n: li + 1 }), li: li - 1, solids: [extZ(g.inner, L.zCeil, L.zSlabTop, st[li - 1].E, holes)],
          col: COL.slab, mat: 'c', bearing: true, pre: 'FLOOR', vol: A * t });
        if (el) qSlab(el, 'zd' + li, t, A, A * t);
      }
      // Räume
      if (Lg.gridAll) {
        for (const r of Lg.rooms || []) {
          if (r.shaft) continue;
          const c = Lg.gridAll.comps[r.comp];
          const loops = c && compLoops(Lg.gridAll, c);
          const sol = loops && extZ(loops.outer, L.zFloorTop, L.zCeil, Eo, loops.holes);
          if (!sol) continue;
          styled([sol], COL.space, 0.75);
          const pl = w.add('IFCLOCALPLACEMENT', st[li].pl, w.add('IFCAXIS2PLACEMENT3D', origin, null, null));
          const key = 'r' + li + '-' + (r.id || r.comp), H = L.zCeil - L.zFloorTop;
          const sp = w.add('IFCSPACE', gid(key), null, S(r.name || T_('Raum')), null, null, pl, shape([sol]), S(r.name || ''), E('ELEMENT'), E('INTERNAL'), null);
          st[li].spaces.push(sp);
          stats.byClass.IFCSPACE = (stats.byClass.IFCSPACE || 0) + 1;
          pset('Pset_SpaceCommon', [['IsExternal', TY('IFCBOOLEAN', B(false))]]).objs.push(sp);
          qto(sp, key, 'Qto_SpaceBaseQuantities', [['LENGTH', 'Height', H], ['AREA', 'NetFloorArea', r.area], ['VOLUME', 'NetVolume', r.area * H]]);
        }
      }
    });
    // Decke (Aufzugsschächte zum Gelände ausgespart)
    {
      const holes = (vs.lifts || []).filter((v) => v.toSurface || v.roofBox).map((v) => v.innerPoly), t = lv.zRoofTop - lv.zCeil, A = areaOf(g.out, holes);
      const el = element('IFCSLAB', { key: 'roof', name: T_('Decke'), li: 0, solids: [extZ(g.out, lv.zCeil, lv.zRoofTop, st[0].E, holes)], col: COL.slab, mat: 'c', ext: true, bearing: true, pre: 'ROOF', vol: A * t });
      if (el) qSlab(el, 'roof', t, A, A * t);
    }
    // Innentreppen
    (vs.stairs || []).forEach((s, k) => {
      const lo = LV[s.lower], up = LV[s.upper];
      if (!lo || !up) return;
      const zU = up.zFloorTop, zL = lo.zFloorTop, prof = [{ x: 0, y: zU }];
      for (let i = 1; i < s.nr; i++) { prof.push({ x: (i - 1) * s.tread, y: zU - i * s.rise }); prof.push({ x: i * s.tread, y: zU - i * s.rise }); }
      // Untersicht parallel zur Steigung im Abstand der Laufplattendicke
      const slope = s.rise / s.tread, dv = (s.tWaist || 0.15) * Math.hypot(s.tread, s.rise) / s.tread;
      prof.push({ x: s.run, y: zL }, { x: Math.max(0, s.run - dv / slope), y: zL }, { x: 0, y: zU - s.rise - dv });
      const o0 = G.add({ x: s.src.x, y: s.src.y }, G.mul(s.nrm, -s.w / 2));
      element('IFCSTAIR', { key: 'stair' + k, name: T_('Innentreppe') + ' ' + (k + 1), li: s.lower, solids: [extV(prof, o0, s.u, s.nrm, s.w, st[s.lower].E)], col: COL.slab, mat: 'c', pre: 'STRAIGHT_RUN_STAIR' });
    });
    // Aufzüge: Grube, Schachtkopf, Schacht zum Gelände, Kabine
    (vs.lifts || []).forEach((v, k) => {
      const d = v.design, wk = v.works;
      if (!d || !wk) return;
      const lb = v.levelBot, zf = LV[lb].zFloorTop, zp = zf - d.pit, name = T_('Aufzug') + ' ' + (k + 1);
      const ring = (key, z0, z1, li, nm) => element('IFCWALL', { key, name: nm, li, solids: [extZ(v.outerPoly, z0, z1, st[li].E, [v.innerPoly])], mat: 'c', bearing: true, pre: 'SOLIDWALL', vol: areaOf(v.outerPoly, [v.innerPoly]) * (z1 - z0) });
      ring('lift' + k + '-pit', zp, zf, lb, name + ' · ' + T_('Grube'));
      element('IFCSLAB', { key: 'lift' + k + '-pitslab', name: name + ' · ' + T_('Grubensohle'), li: lb, solids: [extZ(v.outerPoly, zp - b.tFloor, zp, st[lb].E)], col: COL.slab, mat: 'c', ext: true, bearing: true, pre: 'BASESLAB', vol: G.area(v.outerPoly) * b.tFloor });
      const top = (key, z1, t, nm) => {
        ring(key, lv.zRoofTop, z1, 0, nm);
        element('IFCSLAB', { key: key + '-lid', name: nm, li: 0, solids: [extZ(v.outerPoly, z1, z1 + t, st[0].E)], col: COL.slab, mat: 'c', ext: true, bearing: true, pre: 'ROOF', vol: G.area(v.outerPoly) * t });
      };
      if (v.roofBox && wk.box > 0) top('lift' + k + '-box', lv.zRoofTop + wk.box, 0.3, name + ' · ' + T_('Schachtkopf'));
      if (v.toSurface) top('lift' + k + '-house', v.zSurface + wk.house, 0.25, name + ' · ' + T_('Schacht zum Gelände'));
      const c = (s2, t2) => G.add(G.add({ x: v.x, y: v.y }, G.mul(v.u, s2)), G.mul(v.nrm, t2)), cw2 = v.src.w / 2, cd = v.src.d / 2;
      element('IFCTRANSPORTELEMENT', { key: 'lift' + k + '-car', name, li: lb, col: COL.steel, mat: 'st', pre: 'ELEVATOR',
        solids: [extZ([c(-cd - 0.05, -cw2), c(cd - 0.05, -cw2), c(cd - 0.05, cw2), c(-cd - 0.05, cw2)], zf + 0.02, zf + 2.3, st[lb].E)] });
    });
    // Zugänge: Treppenabgang (Seitenwände, Podest, Lauf, Luke) bzw. Ausstiegsschacht
    const FB = 0.15;
    for (const a of g.access || []) {
      const C = a.C, u = a.u, nn = a.nn, li = liEntry, Eo = st[li].E, zf = zEntry, name = g.labels['a:' + a.id] || T_('Zugang');
      const at = (du, dn) => G.add(G.add(C, G.mul(u, du)), G.mul(nn, dn));
      if (a.kind === 'treppe') {
        [[a.w / 2, a.sideR, 'r'], [-a.w / 2 - a.tw, a.sideL, 'l']].forEach(([off, side, s]) => {
          element('IFCWALL', { key: 'acc' + a.id + '-side' + s, name: name + ' · ' + T_('Seitenwand'), li, solids: [extV(side, at(off, 0), nn, u, a.tw, Eo)], mat: 'c', ext: true, bearing: true, pre: 'SOLIDWALL' });
        });
        element('IFCSLAB', { key: 'acc' + a.id + '-landing', name: name + ' · ' + T_('Podest'), li, col: COL.slab, mat: 'c', ext: true, bearing: true, pre: 'LANDING',
          solids: [extZ([at(-a.W / 2, 0), at(a.W / 2, 0), at(a.W / 2, a.landing), at(-a.W / 2, a.landing)], a.zb, zf, Eo)] });
        const prof = [{ x: a.landing, y: zf - a.tS }, { x: a.landing, y: zf }];
        for (let i = 1; i < a.nr; i++) { prof.push({ x: a.landing + (i - 1) * a.tread, y: zf + i * a.rise }); prof.push({ x: a.landing + i * a.tread, y: zf + i * a.rise }); }
        prof.push({ x: a.L, y: 0 }, { x: a.L, y: -a.tS });
        element('IFCSTAIR', { key: 'acc' + a.id + '-flight', name, li, solids: [extV(prof, at(-a.w / 2, 0), nn, u, a.w, Eo)], col: COL.slab, mat: 'c', pre: 'STRAIGHT_RUN_STAIR' });
        if (a.hatch > 0) element('IFCDOOR', { key: 'acc' + a.id + '-hatch', name: name + ' · ' + T_('Abdeckung'), li, col: COL.steel, mat: 'st',
          solids: [extZ([at(-a.W / 2, 0), at(a.W / 2, 0), at(a.W / 2, a.L), at(-a.W / 2, a.L)], FB, FB + 0.06, Eo)], extra: [a.L, a.W, E('TRAPDOOR'), E('NOTDEFINED'), null] });
      } else {
        const outer = [at(-a.W / 2, 0), at(a.W / 2, 0), at(a.W / 2, a.D), at(-a.W / 2, a.D)], inner = [at(-a.w / 2, 0), at(a.w / 2, 0), at(a.w / 2, a.wy), at(-a.w / 2, a.wy)];
        const zTop = a.zTop != null ? a.zTop : FB;
        element('IFCWALL', { key: 'acc' + a.id + '-shaft', name, li, solids: [extZ(outer, zf, zTop, Eo, [inner])], mat: 'c', ext: true, bearing: true, pre: 'SOLIDWALL', vol: areaOf(outer, [inner]) * (zTop - zf) });
        element('IFCSLAB', { key: 'acc' + a.id + '-base', name: name + ' · ' + T_('Sohle'), li, solids: [extZ(outer, zf - a.tS, zf, Eo)], col: COL.slab, mat: 'c', ext: true, bearing: true, pre: 'BASESLAB', vol: G.area(outer) * a.tS });
        element('IFCDOOR', { key: 'acc' + a.id + '-lid', name: name + ' · ' + T_('Abdeckung'), li, col: COL.steel, mat: 'st', solids: [extZ(outer, zTop, zTop + 0.06, Eo)],
          extra: [a.D, a.W, E('TRAPDOOR'), E('NOTDEFINED'), null] });
      }
    }
    // Leitungen
    for (const rr of (q.routes && q.routes.list) || []) {
      if (!rr.segs || !rr.segs.length) continue;
      const zMid = (rr.segs[0].A.z + rr.segs[0].B.z) / 2;
      let li = LV.findIndex((L) => zMid >= L.zFloorTop - 1e-6 && zMid <= (L.zSlabTop != null ? L.zSlabTop : L.zCeil) + 1e-6);
      if (li < 0) li = liEntry;
      const round = rr.src.shape === 'rund', luft = rr.kind.type === 'luft';
      const col = (rr.kind.color || '#888888').match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16) / 255);
      element(luft ? 'IFCDUCTSEGMENT' : 'IFCCABLECARRIERSEGMENT', { key: 'route' + rr.id, name: (rr.src.name || T_(rr.kind.name)) + (rr.dims.label ? ' · ' + rr.dims.label : ''), li, col,
        solids: rr.segs.map((sg) => extLine(sg.A, sg.B, round, rr.dims, st[li].E)), pre: luft ? 'RIGIDSEGMENT' : 'CONDUITSEGMENT' });
    }
    // Einbauten (Höhen als Richtwerte)
    const EQ = { gen: ['IFCELECTRICGENERATOR', 'ENGINEGENERATOR', 1.0], fuel: ['IFCTANK', 'STORAGE', 1.3], bat: ['IFCELECTRICFLOWSTORAGEDEVICE', 'BATTERY', 1.0],
      vent: ['IFCUNITARYEQUIPMENT', 'AIRHANDLER', 1.2], water: ['IFCTANK', 'STORAGE', 1.5], food: ['IFCFURNITURE', 'SHELF', 1.8], sew: ['IFCTANK', 'STORAGE', 1.2], hebe: ['IFCPUMP', 'SUMPPUMP', 0.8] };
    const eqList = (q.tech && q.tech.equip) || [];
    eqList.forEach((e, k) => {
      if (!e.rect || !(e.n > 0)) return;
      const d = EQ[e.id] || ['IFCBUILDINGELEMENTPROXY', 'NOTDEFINED', 1.0], li = Math.min(nL - 1, Math.max(0, e.level || 0)), z = LV[li].zFloorTop;
      const el = element(d[0], { key: 'eq' + e.id + k, name: e.name, li, col: COL.tech, pre: d[1],
        solids: [extZ(G.polygonFromRect(e.rect.x0, e.rect.y0, e.rect.x1, e.rect.y1), z, z + d[2], st[li].E)] });
      if (el) pset('Bunkerplaner', [[T_('Hinweis'), TY('IFCTEXT', S(T_('Platzhalter; Maße nach Herstellerangaben prüfen')))], [T_('Anzahl'), TY('IFCINTEGER', I(e.n))]]).objs.push(el);
    });

    // Beziehungen: Enthaltensein, Räume, Baustoffe, Eigenschaften
    st.forEach((s, li) => {
      if (s.items.length) w.add('IFCRELCONTAINEDINSPATIALSTRUCTURE', gid('contain' + li), null, null, null, s.items, s.ref);
      if (s.spaces.length) w.add('IFCRELAGGREGATES', gid('spaces' + li), null, null, null, s.ref, s.spaces);
    });
    for (const [k, m] of Object.entries(mats)) if (m.objs.length) w.add('IFCRELASSOCIATESMATERIAL', gid('mat-' + k), null, null, null, m.objs, m.ref);
    for (const [k, ps] of psets) if (ps.objs.length) w.add('IFCRELDEFINESBYPROPERTIES', gid('rel-' + k), null, null, null, ps.objs, ps.ref);
    // Projektangaben am Gebäude
    const info = [
      [T_('Hinweis'), TY('IFCTEXT', S(T_('Vorplanung aus dem Bunkerplaner – keine Ausführungsplanung. Tragwerk, Abdichtung und Haustechnik von Fachplanern prüfen lassen.')))],
      [T_('Personen'), TY('IFCINTEGER', I(p.use.people || 0))],
      [T_('Bemessungsgrundlage'), TY('IFCLABEL', S(NC.label || ''))],
      [T_('Beton'), TY('IFCLABEL', S(b.concrete))],
      [T_('Betonstahl'), TY('IFCLABEL', S(NC.steel || 'B500B'))],
      [T_('Stahlbetonvolumen'), TY('IFCVOLUMEMEASURE', q.vol ? q.vol.rc : 0)],
      [T_('Betonstahlmasse'), TY('IFCMASSMEASURE', q.steel ? q.steel.total : 0)],
      [T_('Feuerwiderstand'), fire],
    ];
    w.add('IFCRELDEFINESBYPROPERTIES', gid('rel-info'), null, null, null, [building], w.add('IFCPROPERTYSET', gid('pset-info'), null, S('Bunkerplaner'), null,
      info.map(([n, v]) => w.add('IFCPROPERTYSINGLEVALUE', S(n), null, v, null))));

    // Datei
    const now = opt.now || new Date();
    const stamp = now.toISOString().slice(0, 19);
    const head = ['ISO-10303-21;', 'HEADER;',
      "FILE_DESCRIPTION(('ViewDefinition [DesignTransferView_V1]'),'2;1');",
      'FILE_NAME(' + enc((opt.fileName || 'bunker.ifc')) + ",'" + stamp + "',(''),(''),'Bunkerplaner','Bunkerplaner','');",
      "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;'];
    const text = head.concat(w.lines.map((l, i) => '#' + (i + 1) + '=' + l), ['ENDSEC;', 'END-ISO-10303-21;']).join('\n') + '\n';
    return { text, stats };
  };
})(typeof window !== 'undefined' ? window : globalThis);
