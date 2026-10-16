/* Seitenpanel je Planungsschritt, Stückliste und Bauablauf-Tabelle. */
(function (root) {
  const BP = root.BP, G = BP.geo, M = BP.model;
  const PN = BP.panels = {};
  let A, panel, map = null;
  const fmt = (v, d = 2) => BP.calc.fmt(v, d);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Beträge der Rechnung sind intern Euro; Anzeige in der Projektwährung
  const eur = (v) => BP.laender.show(v, 0);
  const T_ = BP.i18n.T, N_ = BP.i18n.N, I18 = BP.i18n;
  // Norm des Projekts für Fundstellen und Beiwerte in den Erläuterungen
  const np = () => BP.normen.profile(BP.app && BP.app.p);
  const isDE = () => np().code === 'EC' && np().na === 'DE';
  const dT = (v) => I18.dec(String(Math.round(v * 1000) / 1000));
  let fid = 0;

  /* ---------- Pfadzugriff: "geom.walls#w1.t" ---------- */
  function resolve(obj, path, create) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const [k, id] = parts[i].split('#');
      if (o[k] == null && create && id == null) o[k] = {};
      o = o[k];
      if (id != null) o = Array.isArray(o) ? o.find((x) => x.id === id) : null;
      if (o == null) return null;
    }
    return { o, k: parts[parts.length - 1] };
  }
  PN.get = (obj, path) => { const r = resolve(obj, path); return r ? r.o[r.k] : undefined; };
  PN.set = (obj, path, v) => { const r = resolve(obj, path, true); if (r) r.o[r.k] = v; };

  /* ---------- Feld-Bausteine ---------- */
  function num(path, label, unit, o = {}) {
    const id = 'f' + (fid++);
    const raw = o.value !== undefined ? o.value : PN.get(A.p, path);
    // Geldbeträge (Einheit mit €): Anzeige und Eingabe in der Projektwährung, gespeichert in Euro
    if (unit && unit.includes('€')) {
      const fx = BP.laender.fx();
      o = Object.assign({}, o, { scale: (o.scale || 1) * fx, min: o.min != null ? o.min * fx : null, max: o.max != null ? o.max * fx : null, dec: o.dec != null ? o.dec : 2 });
      unit = unit.split('€').join(BP.laender.sym());
    }
    const sc = o.scale || 1;
    const val = raw == null || raw === '' || !isFinite(raw) ? '' : +(raw * sc).toFixed(o.dec != null ? o.dec : 4);
    return '<label for="' + id + '">' + label + (o.hint ? '<small>' + o.hint + '</small>' : '') + '</label>' +
      '<div class="inp"><input id="' + id + '" type="number" step="' + (o.step || 'any') + '" data-path="' + esc(path) + '" data-scale="' + sc + '"' +
      (o.min != null ? ' data-min="' + o.min + '" min="' + o.min + '"' : '') + (o.max != null ? ' data-max="' + o.max + '" max="' + o.max + '"' : '') +
      (o.ui ? ' data-ui="1"' : '') + (o.step === 1 ? ' data-int="1"' : '') + (o.nullable ? ' data-null="1"' : '') + (o.disabled ? ' disabled' : '') +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + ' value="' + val + '"><span class="u">' + (unit || '') + '</span></div>';
  }
  function sel(path, label, options, o = {}) {
    const id = 'f' + (fid++);
    const cur = o.value !== undefined ? o.value : PN.get(A.p, path);
    const longest = Math.max(...options.map(([, t]) => String(t).length));
    const stack = o.full || longest > 15;
    return (label ? '<label for="' + id + '"' + (stack ? ' class="stack"' : '') + '>' + label + (o.hint ? '<small>' + o.hint + '</small>' : '') + '</label>' : '') +
      '<div class="inp' + (stack ? ' stack' : '') + '"><select id="' + id + '" data-path="' + esc(path) + '"' + (o.numeric ? ' data-num="1"' : '') + (o.ui ? ' data-ui="1"' : '') + '>' +
      options.map(([v, t]) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></div>';
  }
  function chk(path, label, o = {}) {
    const cur = o.value !== undefined ? o.value : PN.get(A.p, path);
    return '<label class="chkrow"><input type="checkbox" data-path="' + esc(path) + '" data-bool="1"' + (o.ui ? ' data-ui="1"' : '') + (cur ? ' checked' : '') + '>' + label + '</label>';
  }
  function txt(path, label, o = {}) {
    const id = 'f' + (fid++);
    const cur = o.value !== undefined ? o.value : PN.get(A.p, path);
    return '<label for="' + id + '" class="full" style="grid-column:1/-1;margin-bottom:-2px">' + label + '</label>' +
      '<input id="' + id + '" type="text" class="wide-inp" style="grid-column:1/-1" data-path="' + esc(path) + '"' + (o.ui ? ' data-ui="1"' : '') + ' value="' + esc(cur || '') + '" placeholder="' + esc(o.placeholder || '') + '">';
  }
  function area(path, label, o = {}) {
    const id = 'f' + (fid++);
    const cur = PN.get(A.p, path);
    return '<label for="' + id + '" class="stack">' + label + '</label><textarea id="' + id + '" class="wide-inp ta" style="grid-column:1/-1" rows="' + (o.rows || 2) + '" data-path="' + esc(path) + '" placeholder="' + esc(o.placeholder || '') + '">' + esc(cur || '') + '</textarea>';
  }
  function dateField(path, label) {
    const id = 'f' + (fid++);
    return '<label for="' + id + '">' + label + '</label><div class="inp"><input id="' + id + '" type="date" data-path="' + esc(path) + '" value="' + esc(PN.get(A.p, path) || '') + '"></div>';
  }
  PN.autoDone = function (q) {
    return {
      exits: q.geo.access.length >= 2,
      protection: q.prot.used && q.prot.gaps.length === 0,
      routes: q.routes.list.length > 0 && !q.routes.list.some((r) => r.issues.some((i) => i.level === 'warn')),
      hazard: hazardState(q).ok,
      special: specialState(q).ok && q.planning.threats.every(v => v.documented),
    };
  };
  function hazardState(q) {
    const p = q.p, hz = p.hazard, st = q.struct, bl = st.blast, b = p.build;
    const chosen = hz.blast !== 'keins' || hz.radiation || hz.cb || hz.fire || hz.shock || hz.emp;
    const accFail = !!bl && [st.roof && st.roof.acc, st.floor && st.floor.acc, st.wall.acc].some((a) => a && a.fail);
    const minFail = !!bl && (b.tRoof < bl.minT.roof - 1e-9 || b.tWall < bl.minT.wall - 1e-9 || b.tFloor < bl.minT.floor - 1e-9 || q.geo.L.some((L) => L.walls.some((w) => w.info.bearing && w.len > 0 && w.t < bl.minT.inner - 1e-9)));
    const heqFail = hz.radiation && st.shield.heq < 0.65 - 1e-9;
    return { chosen, accFail, minFail, heqFail, ok: chosen && !accFail && !minFail && !heqFail };
  }
  function specialState(q) {
    const hz = q.p.hazard, on = Object.entries(hz.scenarios || {}).filter(([, v]) => v && v.on).map(([k]) => k);
    const ex = hz.expert || {}, doc = [ex.reference, ex.authority, ex.date].every((v) => String(v || '').trim());
    return { on, doc, ok: on.every((k) => q.planning.threats.some((t) => t.documented && t.s.covers === k)) };
  }
  function seg(path, options, o = {}) {
    const cur = o.value !== undefined ? o.value : PN.get(A.p, path);
    return '<div class="seg" role="group">' + options.map(([v, t]) => '<button type="button" data-seg="' + esc(path) + '" data-value="' + esc(v) + '"' + (o.ui ? ' data-ui="1"' : '') + ' aria-pressed="' + (String(v) === String(cur)) + '">' + esc(t) + '</button>').join('') + '</div>';
  }
  const fields = (inner) => '<div class="fields">' + inner + '</div>';
  const row = (k, v, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th>' + k + '</th><td>' + v + '</td></tr>';
  const table = (rows) => '<table class="res">' + rows.join('') + '</table>';
  const kpi = (v, l) => '<div class="kpi"><b>' + v + '</b><span>' + l + '</span></div>';
  const kpis = (arr) => '<div class="kpis">' + arr.join('') + '</div>';

  /* Meldungen eines Schritts (oder alle). Meldungen zu einem Bauteil wählen es per Klick im Grundriss aus. */
  function msgs(step, noInfo) {
    const list = A.q.checks.filter((c) => (!step || c.step === step) && !(noInfo && c.level === 'info'));
    if (!list.length) return '';
    return '<ul class="msgs">' + list.map((c) => '<li class="' + c.level + '">' +
      (c.ref ? '<a data-selitem="' + esc(c.ref.type + ':' + c.ref.id) + '" title="' + T_('Im Grundriss zeigen') + '">' + esc(c.text) + '</a>' : step ? esc(c.text) : '<a data-goto="' + c.step + '">' + esc(c.text) + '</a>') + '</li>').join('') + '</ul>';
  }
  const nameOf = (key, fallback) => A.q.geo.labels[key] || fallback;

  function stepNav(id) {
    const i = M.STEPS.findIndex((s) => s.id === id);
    const prev = M.STEPS[i - 1], next = M.STEPS[i + 1];
    return '<div class="stepnav">' + (prev ? '<button class="btn ghost" data-goto="' + prev.id + '">' + T_('Zurück: {t}', { t: T_(prev.title) }) + '</button>' : '<span></span>') +
      (next ? '<button class="btn" data-goto="' + next.id + '">' + T_('Weiter: {t}', { t: T_(next.title) }) + '</button>' : '') + '</div>';
  }

  function etaClass(e) { return e > 1 ? 'err' : e > 0.9 ? 'warn' : ''; }
  function utilRow(name, sub, eta, body, open) {
    const w = Math.min(100, Math.max(2, eta * 100));
    return '<details class="el"' + (open ? ' open' : '') + '><summary><div class="util-row"><div class="nm">' + name + (sub ? '<small>' + sub + '</small>' : '') + '</div>' +
      '<div class="bar"><i class="' + etaClass(eta) + '" style="width:' + w + '%"></i></div><div class="eta ' + (eta > 1 ? 'err' : '') + '">' + (isFinite(eta) ? fmt(eta) : '–') + '</div></div></summary><div class="body">' + body + '</div></details>';
  }

  /* ---------- Init / Ereignisse ---------- */
  PN.init = function (app) {
    A = app;
    panel = document.getElementById('panel');
    panel.addEventListener('change', onChange);
    panel.addEventListener('click', onClick);
    panel.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'siteQuery') { e.preventDefault(); geocode(); } });
    const liste = document.getElementById('view-liste');
    liste.addEventListener('change', onChange);
    liste.addEventListener('click', onClick);
    const gantt = document.getElementById('gantt');
    gantt.addEventListener('change', onChange);
    gantt.addEventListener('click', onClick);
  };

  function parseNum(el) {
    const s = String(el.value).replace(',', '.').trim();
    if (s === '') return el.dataset.null ? null : NaN;
    const v = parseFloat(s) / (+el.dataset.scale || 1);
    if (!isFinite(v)) return NaN;
    if (el.dataset.min != null && v * (+el.dataset.scale || 1) < +el.dataset.min) return NaN;
    if (el.dataset.max != null && v * (+el.dataset.scale || 1) > +el.dataset.max) return NaN;
    if (el.dataset.int && !Number.isInteger(v * (+el.dataset.scale || 1))) return NaN;
    return v;
  }

  function onChange(e) {
    const el = e.target;
    const path = el.dataset.path;
    if (el.dataset.price) {
      const k = el.dataset.price, v = parseFloat(String(el.value).replace(',', '.')) / BP.laender.fx() - (+el.dataset.delta || 0);
      if (el.value !== '' && !(v >= 0)) { A.toast(T_('Preis darf nicht negativ sein.'), true); A.render(); return; }
      A.commit((p) => { if (el.value === '' || !isFinite(v)) delete p.prices[k]; else p.prices[k] = v; }, { later: true });
      return;
    }
    if (el.dataset.mat) {
      const k = el.dataset.mat, v = parseFloat(String(el.value).replace(',', '.')) / BP.laender.fx();
      if (el.value !== '' && !(v >= 0)) { A.toast(T_('Preis darf nicht negativ sein.'), true); A.render(); return; }
      A.commit((p) => { if (el.value === '' || !isFinite(v)) delete p.self.mat[k]; else p.self.mat[k] = v; }, { later: true });
      return;
    }
    if (el.dataset.override) {
      const k = el.dataset.override, v = parseFloat(el.value);
      A.commit((p) => { if (el.value === '' || !isFinite(v)) delete p.schedule.overrides[k]; else p.schedule.overrides[k] = Math.max(0, Math.round(v)); });
      return;
    }
    if (el.dataset.rate) {
      const k = el.dataset.rate, v = parseFloat(String(el.value).replace(',', '.'));
      A.commit((p) => { if (el.value === '' || !(v > 0)) delete p.rates[k]; else p.rates[k] = v; });
      return;
    }
    if (el.dataset.check) {
      const k = el.dataset.check, field = el.dataset.field;
      A.commit((p) => { p.checklist[k] = Object.assign({}, p.checklist[k], { [field]: field === 'done' ? el.checked : el.value }); }, { skipPanel: field !== 'done' });
      return;
    }
    if (!path) return;
    let v;
    if (el.dataset.bool) v = el.checked;
    else if (el.type === 'number') {
      v = parseNum(el);
      if (Number.isNaN(v)) {
        const lo = el.dataset.min, hi = el.dataset.max, de = (x) => I18.dec(x);
        const range = lo != null && hi != null ? ' (' + T_('{lo} bis {hi}', { lo: de(lo), hi: de(hi) }) + ')' : lo != null ? ' (' + T_('mindestens {lo}', { lo: de(lo) }) + ')' : hi != null ? ' (' + T_('höchstens {hi}', { hi: de(hi) }) + ')' : '';
        A.toast((String(el.value).trim() === '' ? T_('Bitte einen Wert eingeben') : el.dataset.int ? T_('Bitte eine ganze Zahl im zulässigen Bereich eingeben') : T_('Wert außerhalb des zulässigen Bereichs')) + range + '.', true);
        A.render(); return;
      }
    } else if (el.dataset.num) v = +el.value;
    else v = el.value;
    if (el.dataset.ui) { PN.set(A.ui, path, v); A.render(); return; }
    if (path === 'site.country') { A.commit((p) => M.setCountry(p, v)); A.toast(T_('Land geändert: Feiertage, Währung, MwSt., Preisniveau und Klima-Startwerte angepasst.')); return; }
    if (path === 'site.region') { A.commit((p) => { p.site.region = v; if (p.site.country === 'DE') p.schedule.state = v || 'DE'; }); return; }
    if (path === 'costs.currency') { A.commit((p) => { p.costs.currency = v || null; p.costs.fx = null; }); return; }
    A.commit((p) => {
      PN.set(p, path, v);
      const m = /^protection\.components\.(\w+)\.evidence\.(?!baseline)/.exec(path);
      if (m) p.protection.components[m[1]].evidence.baseline = '';
    }, { coalesce: path, later: true });
  }

  function onClick(e) {
    const t = e.target.closest('[data-goto],[data-act],[data-seg],[data-selitem]');
    if (!t) return;
    if (t.dataset.goto) { A.setStep(t.dataset.goto); return; }
    if (t.dataset.seg) {
      const path = t.dataset.seg, v = t.dataset.value;
      if (t.dataset.ui) { PN.set(A.ui, path, v); A.render(); return; }
      A.commit((p) => PN.set(p, path, v));
      return;
    }
    if (t.dataset.selitem) { const [type, id] = t.dataset.selitem.split(':'); A.select({ type, id }); return; }
    const act = t.dataset.act;
    const fn = ACTIONS[act];
    if (fn) fn(t);
  }

  const ACTIONS = {
    geocode: () => geocode(),
    pickGeo: (t) => {
      const r = A.ui.geoResults[+t.dataset.i];
      A.ui.geoResults = null; A.ui.mapView = null; A.ui.mapOn = true;
      A.commit((p) => { Object.assign(p.site, { lat: +r.lat.toFixed(6), lon: +r.lon.toFixed(6), label: r.label }); });
    },
    showMap: () => { A.ui.mapOn = true; A.render(); },
    groundwater: () => groundwater(),
    climate: () => fetchClimate(),
    usgs: () => fetchUsgs(),
    bauantragPrint: () => BP.exporter.bauantrag(),
    bauantragCsv: () => BP.exporter.bauantragCsv(),
    formCheck: (t) => BP.exporter.formCheck(t.dataset.url),
    formFill: (t) => BP.exporter.formFill(t.dataset.url, t.dataset.title),
    formFillSave: () => BP.exporter.formFillSave(),
    formFillClose: () => { A.ui.ff = null; A.render(); },
    climateReset: () => A.commit((p) => { p.site.climate = null; Object.assign(p.tech, BP.laender.techStart(p)); }),
    fx: () => fetchFx(),
    useGw: (t) => {
      const r = A.p.site.gw.results[+t.dataset.i];
      const depth = Math.max(0, +(r.groundNHN - r.high - 0.5).toFixed(2));
      A.commit((p) => { p.site.waterMode = 'tiefe'; p.site.waterDepth = depth; p.site.waterSource = T_('Startwert aus BGR-Referenzmessstelle {name} ({d} km), oberes Extrem minus 0,5 m – durch Gutachten ersetzen', { name: r.name, d: fmt(r.distanceKm, 1) }); });
    },
    shapeRect: () => { const s = A.ui.shape; if (!(s.L > 1 && s.B > 1)) return; A.commit((p) => { p.geom.outline = M.shapeRect(s.L, s.B); fixRefs(p); }); BP.plan2d.fit(); A.render(); },
    shapeL: () => {
      const s = A.ui.shape;
      if (!(s.L > 2 && s.B > 2 && s.a > 0.5 && s.b > 0.5 && s.a < s.L - 1 && s.b < s.B - 1)) { A.toast(T_('Ausschnitt muss kleiner als die Außenmaße sein.'), true); return; }
      A.commit((p) => { p.geom.outline = M.shapeL(s.L, s.B, s.a, s.b); fixRefs(p); }); BP.plan2d.fit(); A.render();
    },
    delSel: () => A.deleteSelection(),
    setLevel: (t) => A.setLevel(+t.dataset.i),
    autoColumns: () => {
      const r = BP.calc.autoColumns(A.p, A.q);
      const n = r.levels.reduce((sm, l) => sm + l.length, 0), dropped = r.report.filter((x) => x.dropped).length;
      A.commit((p) => { r.levels.forEach((cols, i) => { const L = A.levelSrc(p, i); L.columns = (L.columns || []).filter((c) => !c.auto).concat(cols); }); });
      const sp = r.report.filter((x) => x.s).map((x) => (r.levels.length > 1 ? T_('Ebene {n}', { n: x.level + 1 }) + ': ' : '') + T_('Raster bis {s} m', { s: fmt(x.s, 2) })).join(', ');
      A.toast(n ? T_('{n} Stützen gesetzt ({sp})', { n, sp }) + (dropped ? ', ' + T_('{d} Rasterpunkte wegen Öffnungen, Wänden oder stützenfreier Bereiche ausgelassen', { d: dropped }) : '') + '. ' + T_('Nachweise unter „Tragwerk“.') : T_('Keine Stützen nötig: alle Felder liegen unter der Rasterweite ({sp}).', { sp }));
    },
    clearAutoColumns: () => { A.commit((p) => { for (let i = 0; i < A.nLevels(); i++) { const L = A.levelSrc(p, i); L.columns = (L.columns || []).filter((c) => !c.auto); } }); A.toast(T_('Automatische Stützen entfernt.')); },
    addLevel: () => {
      const n = A.nLevels(), id = M.uid('lv'), above = A.levelSrc(A.p, n - 1);
      // tragende Wände und Stützen der Ebene darüber übernehmen: durchgehender Lastweg
      const walls = above.walls.filter((w) => w.kind === 'stb').map((w) => ({ id: M.uid('w'), a: { ...w.a }, b: { ...w.b }, t: w.t, kind: 'stb' }));
      const columns = (above.columns || []).map((c) => ({ id: M.uid('c'), x: c.x, y: c.y, bx: c.bx, by: c.by, auto: !!c.auto }));
      A.commit((p) => { p.levels.push({ id, name: T_('Ebene {n}', { n: n + 1 }), clearHeight: 2.4, tSlab: 0.3, walls, openings: [], rooms: [], columns, zones: [], beams: [] }); });
      A.ui.level = n; A.sel = null; A.render();
      A.toast(T_('Ebene {n} angelegt', { n: n + 1 }) + (walls.length || columns.length ? ', ' + T_('tragende Wände und Stützen von oben übernommen') : '') + '. ' + T_('Mit „Innentreppe“ auf Ebene {n} den Abgang setzen.', { n }));
    },
    copyBearing: () => {
      const li = A.lvl();
      if (li < 1) return;
      const above = A.levelSrc(A.p, li - 1), here = A.levelSrc(A.p, li);
      const same = (w, x) => Math.abs(w.a.x - x.a.x) + Math.abs(w.a.y - x.a.y) + Math.abs(w.b.x - x.b.x) + Math.abs(w.b.y - x.b.y) < 1e-3;
      const walls = above.walls.filter((w) => w.kind === 'stb' && !here.walls.some((x) => same(w, x))).map((w) => ({ id: M.uid('w'), a: { ...w.a }, b: { ...w.b }, t: w.t, kind: 'stb' }));
      const columns = (above.columns || []).filter((c) => !(here.columns || []).some((x) => Math.abs(x.x - c.x) < 1e-3 && Math.abs(x.y - c.y) < 1e-3)).map((c) => ({ id: M.uid('c'), x: c.x, y: c.y, bx: c.bx, by: c.by, auto: !!c.auto }));
      if (!walls.length && !columns.length) { A.toast(T_('Alle tragenden Wände und Stützen von oben sind schon da.')); return; }
      A.commit((p) => { const L = A.levelSrc(p, li); L.walls.push(...walls); L.columns.push(...columns); });
      A.toast(T_('{w} Wände und {c} Stützen übernommen.', { w: walls.length, c: columns.length }));
    },
    delLevel: () => {
      const li = A.lvl();
      if (li < 1) return;
      const nm = A.p.levels[li - 1].name;
      A.commit((p) => {
        p.levels.splice(li - 1, 1);
        // Treppen an der gelöschten Ebene entfallen, darunter rücken die Indizes nach
        p.geom.verts = (p.geom.verts || []).filter((v) => !(v.kind === 'treppe' && (v.upper === li || v.upper === li - 1))).map((v) => {
          if (v.kind === 'treppe') return Object.assign({}, v, { upper: v.upper > li ? v.upper - 1 : v.upper });
          const top = v.top > li ? v.top - 1 : v.top, bottom = v.bottom >= li ? Math.max(0, v.bottom - 1) : v.bottom;
          return Object.assign({}, v, { top, bottom });
        }).filter((v) => v.kind === 'treppe' || Math.max(0, v.top) <= v.bottom);
      });
      A.ui.level = li - 1; A.sel = null; A.render();
      A.toast(T_('„{nm}“ gelöscht. „Rückgängig“ holt sie zurück.', { nm }));
    },
    addConsumer: () => A.commit((p) => p.tech.consumers.push({ id: M.uid('c'), name: T_('Verbraucher'), w: 50, h: 4 })),
    delConsumer: (t) => A.commit((p) => { p.tech.consumers = p.tech.consumers.filter((c) => c.id !== t.dataset.id); }),
    resetPrices: () => A.commit((p) => { p.prices = {}; }),
    resetSelf: () => A.commit((p) => { p.self = M.selfDefaults(); }),
    saveRejected: () => A.saveRejected(),
    dropRejected: () => A.dropRejected(),
    selfAllFirm: () => A.commit((p) => { for (const k of Object.keys(M.TRADES)) p.self.trades[k] = 'firma'; }),
    selfAllOwn: () => A.commit((p) => { for (const k of ['erde', 'beton', 'schalung', 'bewehrung', 'abdichtung', 'ausbau', 'baustelle']) p.self.trades[k] = 'eigen'; }),
    resetRates: () => A.commit((p) => { p.rates = {}; p.schedule.overrides = {}; }),
    exportCsv: () => BP.exporter.csv(),
    plans: () => BP.exporter.plans(),
    statik: () => BP.exporter.statik(),
    vergleich: () => BP.exporter.vergleich(),
    dxf: () => BP.exporter.dxf(),
    ifc: () => BP.exporter.ifc(),
    varSave: () => BP.varianten.save((document.getElementById('varName') || {}).value || ''),
    varLoad: (el) => BP.varianten.load(+el.dataset.i),
    varUpdate: (el) => BP.varianten.update(+el.dataset.i),
    varDel: (el) => BP.varianten.remove(+el.dataset.i),
    varPrint: () => BP.exporter.variantPrint(),
    varCsv: () => BP.exporter.variantCsv(),
    wartungIcs: () => BP.exporter.wartungIcs(),
    wartungCsv: () => BP.exporter.wartungCsv(),
    wartungPrint: () => BP.exporter.wartungPrint(),
    biegeliste: () => BP.exporter.biegeliste(),
    bvbs: () => BP.exporter.bvbs(),
    report: () => BP.exporter.report(),
    tool: (t) => A.setTool(t.dataset.tool),
    resetProject: () => A.newProject(),
    newRoute: (t) => A.startRoute(t.dataset.type),
    continueRoute: (t) => A.continueRoute(t.dataset.id),
    routeAppend: (t) => A.commit((p) => {
      const r = p.routes.find((x) => x.id === t.dataset.id);
      const last = r.pts[r.pts.length - 1] || { x: 0, y: 0, h: A.ui.routeH };
      r.pts.push({ x: G.round(last.x + 0.5, 3), y: last.y, h: last.h });
    }),
    routeDelPt: (t) => A.commit((p) => { const r = p.routes.find((x) => x.id === t.dataset.id); r.pts.splice(+t.dataset.i, 1); }),
    routeInsPt: (t) => A.commit((p) => {
      const r = p.routes.find((x) => x.id === t.dataset.id), i = +t.dataset.i, a = r.pts[i], b = r.pts[i + 1] || a;
      r.pts.splice(i + 1, 0, { x: G.round((a.x + b.x) / 2, 3), y: G.round((a.y + b.y) / 2, 3), h: G.round((a.h + b.h) / 2, 3) });
    }),
    protTarget: (t) => { A.ui.protTarget = t.dataset.k; A.render(); },
    hazardPreset: (t) => {
      const pr = M.HAZARD_PRESETS[t.dataset.k];
      if (!pr) return;
      A.commit((p) => { ['blast', 'radiation', 'cb', 'fire', 'shock', 'emp'].forEach((k) => { p.hazard[k] = pr[k]; }); });
      A.toast(T_('{name}: Lastfälle, Mindestwerte und Schutztechnik sind neu gerechnet.', { name: T_(pr.name) }));
    },
    feShow: (t) => A.showFe(t.dataset.slab, t.dataset.qty),
    setThickness: (t) => {
      const k = t.dataset.k, v = +t.dataset.v;
      if (!['tRoof', 'tWall', 'tFloor'].includes(k) || !(v > 0)) return;
      A.commit((p) => { p.build[k] = v; });
      A.toast(T_('Dicke {d} cm übernommen.', { d: fmt(v * 100, 0) }));
    },
    toggleLayouts: () => { A.ui.layout.open = !A.ui.layout.open; A.render(); },
    applyLayout: (t) => {
      const r = layoutList()[+t.dataset.i]; // aktueller Stand, auch wenn das Neuzeichnen noch aussteht
      if (!r) return;
      A.sel = null;
      A.commit((p) => { const keep = { verts: p.geom.verts || [] }; p.geom = Object.assign({ columns: [], zones: [] }, JSON.parse(JSON.stringify(r.lay.geom)), keep); p.routes = JSON.parse(JSON.stringify(r.lay.routes)); });
      A.syncShape(); BP.plan2d.fit(); A.render();
      A.toast(T_('{name} übernommen. Strg+Z macht es rückgängig.', { name: r.lay.name + (r.lay.rotated ? ' ' + T_('(gedreht)') : '') }));
    },
    protAdd: () => A.commit((p) => p.protection.components[A.ui.protTarget].layers.push({ id: M.uid('s'), material: 'steel', grade: '', strength: '', thickness: null, density: null })),
    protSeed: () => {
      const key = A.ui.protTarget, def = M.PROT_TARGETS[key];
      if (!def.build) return;
      A.commit((p) => p.protection.components[key].layers.push({ id: M.uid('s'), material: 'concrete', grade: p.build.concrete, strength: '', thickness: Math.round(p.build[def.build] * 1000), density: null }));
    },
    protApply: () => {
      const key = A.ui.protTarget, cp = A.q.prot.comps[key];
      if (!cp.def.build || !(cp.concrete > 0.05)) { A.toast(T_('Keine Betonschicht mit Dicke vorhanden.'), true); return; }
      A.commit((p) => { p.build[cp.def.build] = Math.round(cp.concrete * 1000) / 1000; });
      A.toast(T_('{name}: Betondicke {d} cm übernommen. Statik und Mengen sind neu gerechnet.', { name: T_(cp.def.name), d: fmt(cp.concrete * 100, 1) }));
    },
    protMove: (t) => A.commit((p) => {
      const L = p.protection.components[A.ui.protTarget].layers, i = +t.dataset.i, j = i + (+t.dataset.dir);
      if (j < 0 || j >= L.length) return;
      [L[i], L[j]] = [L[j], L[i]];
    }),
    protDel: (t) => A.commit((p) => { p.protection.components[A.ui.protTarget].layers.splice(+t.dataset.i, 1); }),
    protRecord: () => {
      const key = A.ui.protTarget, err = BP.calcExtra.canRecord(A.p, key);
      if (err) { A.toast(err, true); return; }
      const sig = A.q.prot.comps[key].sig;
      A.commit((p) => { p.protection.components[key].evidence.baseline = sig; });
      A.toast(T_('Unterlage dem aktuellen Planstand zugeordnet. Ändert sich der Plan, wird sie als veraltet markiert.'));
    },
  };

  function fixRefs(p) {
    const n = p.geom.outline.length;
    p.geom.access = p.geom.access.filter((a) => a.edge < n);
    p.geom.openings = p.geom.openings.filter((o) => !o.host.startsWith('e:') || +o.host.slice(2) < n);
  }

  async function geocode() {
    const el = document.getElementById('siteQuery');
    const qv = el ? el.value.trim() : '';
    A.ui.siteQuery = qv;
    if (qv.length < 2) { A.toast(T_('PLZ, Ort oder Adresse eingeben.'), true); return; }
    try {
      const r = await fetch('api/geocode?q=' + encodeURIComponent(qv) + '&cc=' + encodeURIComponent(BP.laender.country(A.p)));
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ? T_(data.error) : T_('Suche fehlgeschlagen'));
      A.ui.geoResults = data.results;
      if (!data.results.length) A.toast(T_('Kein Treffer in {land}.', { land: BP.laender.name(BP.laender.country(A.p)) }));
      A.render();
    } catch (err) {
      A.toast(location.protocol === 'file:' ? T_('Ortssuche braucht den lokalen Server: python server.py starten.') : String(err.message || err), true);
    }
  }

  /* Land, Region, Klima: Feiertage, Klima-Startwerte, Währung und Preisniveau */
  const FAM_TXT = { EC: N_('Eurocode'), ACI: N_('ACI 318 / ASCE 7'), SIA: N_('SIA 260–267') };
  /* Hinweis zur Bemessungsnorm: Profil, im Land geltende Norm, Herkunft der nationalen Parameter */
  /* Erdbeben am Standort je Norm: Deutschland Zonen der DIN EN 1998-1/NA, Schweiz Zonen SIA 261, übrige Eurocode-Länder agR aus der
   * nationalen Karte, USA SDS/SD1 (Abruf bei USGS über den lokalen Server). */
  /* Radon: Eingaben am Standort (Bodenluft, ausgewiesenes Gebiet) */
  function radonSite(q) {
    const r = q.radon;
    if (!r) return '';
    const tx = BP.bauantrag.tx, e = r.ref.x.e, ar = e && e.areas;
    let h = '<h3>' + T_('Radon') + '</h3>';
    h += fields(num('site.radon.soil', T_('Radon in der Bodenluft'), 'kBq/m³', { nullable: true, min: 0, max: 10000, placeholder: String(BP.radon.SOIL_DEFAULT),
      hint: T_('aus Karte, Gutachten oder Messung; leer = {v} kBq/m³ angenommen', { v: BP.radon.SOIL_DEFAULT }) }) +
      (ar ? sel('site.radon.area', T_('Grundstück liegt in: {name}', { name: esc(ar.name) }), [['unbekannt', T_('Noch nicht geprüft')], ['ja', T_('ja')], ['nein', T_('nein')]], { full: true }) : ''));
    if (ar) h += '<p class="note">' + esc(tx(ar.note)) + (ar.map ? ' <a href="' + esc(ar.map) + '" target="_blank" rel="noopener">' + T_('Karte öffnen') + '</a>' : '') + '</p>';
    h += '<p class="note">' + T_('Referenzwert für die Raumluft: <b>{v} Bq/m³</b> (Jahresmittel). Radon kommt aus dem Baugrund; erdberührte Räume sind besonders betroffen. Bewertung und Maßnahmen im Schritt Konstruktion.', { v: Math.round(r.ref0) }) + '</p>';
    return h;
  }
  /* Radonschutz: Abschätzung, Maßnahmen, Rechtsgrundlage */
  function radonSection(q) {
    const r = q.radon;
    if (!r) return '';
    const tx = BP.bauantrag.tx, x = r.ref.x, e = x.e || x.fb, ST = BP.bauantrag.STATUS;
    let h = '<h3>' + T_('Radonschutz') + '</h3>';
    h += '<p class="note">' + (x.kind === 'national' ? esc(tx(e.refNote)) : x.kind === 'EU' ? T_('Kein nationaler Wert im Register: Richtlinie 2013/59/Euratom, höchstens 300 Bq/m³.') : T_('Kein nationaler Wert im Register: WHO empfiehlt 100 Bq/m³, höchstens 300 Bq/m³.')) +
      (r.ref.valueNew ? ' ' + T_('Für Neubauten gilt {v} Bq/m³.', { v: r.ref.valueNew }) : '') + '</p>';
    const closed = r.states.find((s) => s.id === 'closed'), vent = r.states.find((s) => s.id === 'vent');
    const rows = [row(T_('Radon in der Bodenluft'), fmt(r.soil, 0) + ' kBq/m³' + (r.soilAssumed ? ' (' + T_('Annahme') + ')' : '')),
      row(T_('Eintrag durch Diffusion (dichter Beton)'), fmt(r.Sdiff, 0) + ' Bq/h'),
      row(T_('Geschlossen, Lüftung aus'), T_('nur Diffusion ≈ {c} Bq/m³; Referenzwert erreicht ab ≈ {q} l/h Bodenluft', { c: fmt(closed.Cdiff, 0), q: fmt(closed.Qmax, closed.Qmax < 10 ? 1 : 0) }), closed.Cdiff > r.ref0 ? 'warn' : '')];
    if (vent) rows.push(row(T_('Lüftung in Betrieb ({n}/h)', { n: fmt(vent.n, 2) }), T_('nur Diffusion ≈ {c} Bq/m³; Referenzwert erreicht ab ≈ {q} l/h Bodenluft', { c: fmt(vent.Cdiff, 1), q: fmt(vent.Qmax, 0) })),
      row(T_('Vor dem Aufenthalt lüften'), T_('{h} h, dann ist die Konzentration auf 5 % gesunken', { h: fmt(vent.t95, 1) })));
    h += '<table class="res txt">' + rows.join('') + '</table>';
    h += '<p class="note">' + T_('Abschätzung: Diffusion nach dem Ansatz der spanischen DB HS 6 mit D = 1·10⁻⁸ m²/s für dichten, rissbeschränkten Beton; Raumluftbilanz mit Zerfall. Der Haupteintrag läuft über Fugen, Risse und Durchführungen und lässt sich nicht vorausberechnen – deshalb zählt die Ausführung, und nur eine Messung zeigt den tatsächlichen Wert.') + '</p>';
    h += '<p><b>' + T_('Maßnahmen') + '</b>' + (r.de ? ' <small>' + T_('(Nummern nach § 154 StrlSchV)') + '</small>' : '') + '</p><ul class="checklist">';
    for (const m of r.measures) {
      const lab = (r.de ? '<b>' + esc(m.nr) + '</b> ' : '') + esc(T_(m.text));
      h += '<li>' + (m.auto ? '<label><input type="checkbox" disabled' + (m.on ? ' checked' : '') + '><span>' + lab + ' <small>' + T_(m.on ? '(aus der Planung erfüllt)' : '(laut Planung nicht erfüllt)') + '</small></span></label>'
        : '<label><input type="checkbox" data-path="build.radon.' + m.id + '" data-bool="1"' + (m.on ? ' checked' : '') + '><span>' + lab + (m.id === 'membrane' && (A.p.build.waterproofing === 'wu_fbv' || A.p.build.waterproofing === 'bahn') ? ' <small>' + T_('(gewähltes Abdichtungssystem)') + '</small>' : '') + '</span></label>') + '</li>';
    }
    h += '<li><label><input type="checkbox" data-path="build.radon.measure" data-bool="1"' + (A.p.build.radon && A.p.build.radon.measure ? ' checked' : '') + '><span>' + T_('Messung nach Fertigstellung eingeplant') + '</span></label></li></ul>';
    if (r.de && r.inArea) h += '<p class="note">' + T_('Radonvorsorgegebiet: Neben dem Feuchteschutz ist mindestens eine Maßnahme nach § 154 StrlSchV nötig.') + '</p>';
    if (x.e) {
      const law = (x.e.law || []).map((l) => (l.url ? '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.name) + '</a>' : esc(l.name))).join('; ');
      h += '<details><summary>' + T_('Rechtsgrundlage, Regeln und Messung') + '</summary><table class="res txt">' +
        (law ? row(T_('Rechtsgrundlage'), law) : '') + (x.e.newBuild ? row(T_('Neubau'), esc(tx(x.e.newBuild))) : '') +
        ((x.e.standards || []).length ? row(T_('Regeln der Technik'), esc(x.e.standards.join(', '))) : '') + (x.e.measure ? row(T_('Messung'), esc(tx(x.e.measure))) : '') +
        row(T_('Stand der Angaben'), esc(I18.date(x.e.checked)) + ' · ' + T_(ST[x.e.status] || x.e.status)) + '</table></details>';
    }
    return h;
  }

  function seismicSection(q) {
    const s = A.p.site, NP = np(), eqr = q.verify && q.verify.eq;
    let h = '';
    if (NP.code === 'EC' && NP.na === 'DE') {
      h += '<h3>' + T_('Erdbeben') + '</h3>' + fields(sel('site.seismic.zone', T_('Erdbebenzone'), [[0, T_('Zone 0 bzw. außerhalb')], [1, T_('Zone 1 (agR 0,4 m/s²)')], [2, T_('Zone 2 (agR 0,6 m/s²)')], [3, T_('Zone 3 (agR 0,8 m/s²)')]], { numeric: true, hint: T_('Karte DIN EN 1998-1/NA') }) +
        (s.seismic.zone > 0 ? sel('site.seismic.ground', T_('Geologischer Untergrund'), [['R', T_('R – Festgestein')], ['T', T_('T – Übergang')], ['S', T_('S – tiefe Sedimentbecken')]]) +
          sel('site.seismic.soilClass', T_('Baugrundklasse'), [['A', T_('A – fester Fels')], ['B', T_('B – fest bis mitteldicht')], ['C', T_('C – locker bis weich')]]) +
          sel('site.seismic.importance', T_('Bedeutungskategorie'), [['I', T_('I (γI = 0,8)')], ['II', T_('II (γI = 1,0)')], ['III', T_('III (γI = 1,2), Schutzbau')], ['IV', T_('IV (γI = 1,4), Katastrophenschutz')]]) : ''));
      const eqr = q.verify && q.verify.eq;
      if (eqr) h += table([row(T_('Bemessungsbeschleunigung ag = γI · agR'), fmt(eqr.ag, 2) + ' m/s² (' + eqr.key + ', S = ' + fmt(eqr.P.S, 2) + ')'), row(T_('Erddruckzuwachs Δp = α·S·γ·H'), fmt(eqr.dp, 1) + ' kN/m²'),
        row(T_('Außenwände (Erdbeben / Bemessung)'), 'η = ' + fmt(eqr.wallEta, 2)), row(T_('Gleiten Trägheitskraft / Reibung'), fmt(eqr.F, 0) + ' / ' + fmt(eqr.Rf, 0) + ' kN')]);
      else h += '<p class="note">' + T_('Die Erdbebenzone zeigt die Karte zu DIN EN 1998-1/NA bzw. die Erdbebenzonenabfrage des GFZ Potsdam. Zone 0: kein Nachweis nötig.') + '</p>';
      return h;
    }
    const sz = s.seismic, S = NP.seis || {}, link = (url) => (url ? ' ' + T_('Karte: <a href="{url}" target="_blank" rel="noopener">{host}</a>.', { url: esc(url), host: esc(url.replace(/^https?:\/\//, '').split('/')[0]) }) : '');
    const CLS = [['A', T_('A – Fels')], ['B', T_('B – sehr dichter Sand/Kies, sehr steifer Ton')], ['C', T_('C – mitteldichter Sand/Kies, steifer Ton')], ['D', T_('D – lockerer Boden, weicher Ton')], ['E', T_('E – weiche Deckschicht auf festem Grund')]];
    h += '<h3>' + T_('Erdbeben') + '</h3>';
    if (NP.code === 'SIA') {
      h += fields(sel('site.seismic.zone', T_('Erdbebenzone (SIA 261)'), [[0, T_('nicht gewählt (Z1a angenommen)')]].concat(BP.normen.SIA_Z.map((z, i) => [i + 1, z + ' (agd ' + dT(BP.normen.SIA_AGD[i]) + ' m/s²)'])), { numeric: true }) +
        sel('site.seismic.soilClass', T_('Baugrundklasse'), CLS) +
        sel('site.seismic.importance', T_('Bauwerksklasse'), [['I', T_('BWK I (γf = 1,0)')], ['II', T_('BWK II (γf = 1,2)')], ['III', T_('BWK III (γf = 1,5), lebenswichtige Infrastruktur')]]));
    } else if (NP.code === 'ACI') {
      h += fields(num('site.seismic.sds', 'SDS', 'g', { min: 0, max: 4, nullable: true, placeholder: T_('kein Nachweis'), hint: T_('Bemessungswert bei 0,2 s') }) +
        num('site.seismic.sd1', 'SD1', 'g', { min: 0, max: 3, nullable: true, hint: T_('Bemessungswert bei 1 s') }) +
        sel('site.seismic.siteClass', T_('Site Class'), [['Default', T_('Standard (Baugrund unbekannt)')], ['A', 'A'], ['B', 'B'], ['BC', 'BC'], ['C', 'C'], ['CD', 'CD'], ['D', 'D'], ['DE', 'DE'], ['E', 'E']]) +
        sel('site.seismic.importance', T_('Risikokategorie'), [['I', 'I (Ie = 1.0)'], ['II', 'II (Ie = 1.0)'], ['III', T_('III (Ie = 1,25), Schutzbau')], ['IV', T_('IV (Ie = 1,5), wichtige Einrichtungen')]].map(([k, t]) => [k, I18.decAll(t)])));
      h += '<div class="rowbtns"><button class="btn ghost" data-act="usgs"' + (s.lat != null && s.lon != null ? '' : ' disabled') + '>' + (A.ui.usgsLoading ? T_('Lädt …') : T_('Werte bei USGS abrufen')) + '</button></div>';
      const u = sz.usgs;
      if (u) h += '<p class="note">' + T_('USGS ({date}, Site Class {sc}, Risikokategorie {rc}): SDS = {sds} g, SD1 = {sd1} g, PGAM = {pgam} g, SDC {sdc}.', { date: esc(u.fetched), sc: esc(u.siteClass || '–'), rc: esc(u.riskCategory || '–'), sds: fmt(u.sds, 3), sd1: u.sd1 != null ? fmt(u.sd1, 3) : '–', pgam: u.pgam != null ? fmt(u.pgam, 3) : '–', sdc: esc(u.sdc || '–') }) + '</p>';
    } else {
      const gI = S.gI || { I: 0.8, II: 1.0, III: 1.2, IV: 1.4 };
      const zones = S.agR ? Object.entries(S.agR).filter(([, a]) => a != null).map(([z, a]) => z + ': ' + dT(a)).join(', ') : '';
      h += fields(num('site.seismic.agR', T_('Referenz-Bodenbeschleunigung agR'), 'm/s²', { min: 0, max: 6, nullable: true, placeholder: T_('kein Nachweis'), hint: zones ? T_('Zonen {list} m/s²', { list: zones }) : T_('aus der nationalen Gefährdungskarte') }) +
        (sz.agR > 0 ? sel('site.seismic.soilClass', T_('Baugrundklasse'), CLS) +
          sel('site.seismic.importance', T_('Bedeutungskategorie'), ['I', 'II', 'III', 'IV'].map((k) => [k, gI[k] > 0 ? k + ' (γI = ' + dT(gI[k]) + ')' + (k === 'III' ? ', ' + T_('Schutzbau') : '') : T_('{k} – ohne Nachweis', { k })])) : ''));
    }
    if (eqr) {
      const us = eqr.kind === 'ASCE7';
      h += table((us ? [row('SDS / SD1', fmt(eqr.sds, 3) + ' / ' + (eqr.sd1 != null ? fmt(eqr.sd1, 3) : '–') + ' g'), row(T_('Seismic Design Category'), esc(eqr.sdc) + (eqr.sdcSrc ? ' (USGS)' : '')),
        row(T_('Erddruckzuwachs Δp = kh·γ·H, kh = 0,4 SDS'), fmt(eqr.dp, 1) + ' kN/m²')]
        : [row(eqr.kind === 'SIA' ? T_('Bemessungsbeschleunigung ag = γf · agd') : T_('Bemessungsbeschleunigung ag = γI · agR'), fmt(eqr.ag, 2) + ' m/s² (' + eqr.key + ', S = ' + fmt(eqr.P.S, 2) + ')'), row(T_('Erddruckzuwachs Δp = α·S·γ·H'), fmt(eqr.dp, 1) + ' kN/m²')])
        .concat([row(T_('Außenwände (Erdbeben / Bemessung)'), 'η = ' + fmt(eqr.wallEta, 2)), row(T_('Gleiten Trägheitskraft / Reibung'), fmt(eqr.F, 0) + ' / ' + fmt(eqr.Rf, 0) + ' kN')]));
      if (!eqr.required) h += '<p class="note">' + T_('Nach {ref} nicht gefordert ({why}); Werte nur zur Information.', { ref: esc(NP.ref.seis), why: esc((eqr.why ? T_(eqr.why) : '')) }) + '</p>';
      if (eqr.note) h += '<p class="note">' + esc(T_(eqr.note)) + '</p>';
    }
    h += '<p class="note">' + (NP.code === 'SIA' ? T_('In der ganzen Schweiz gilt mindestens Zone Z1a; Zone und Baugrundklasse zeigen die Karten des Bundes.') + link(S.map)
      : NP.code === 'ACI' ? T_('SDS und SD1 liefert USGS für Standorte in den USA (ASCE/SEI 7-22); ohne Werte kein Erdbebennachweis.') + link('https://earthquake.usgs.gov/designmaps/')
      : T_('agR für die Wiederkehrperiode 475 Jahre aus der Gefährdungskarte des Landes eingeben; leer: kein Erdbebennachweis.') + link(S.map)) + '</p>';
    return h;
  }

  function normNote(p) {
    const NP = BP.normen.profile(p), n = NP.n;
    let t = T_('Bemessung: {label}.', { label: esc(NP.label) });
    if (NP.national) t += ' ' + T_('Im Land gilt {nat}; Ergebnisse danach prüfen.', { nat: esc(NP.national) });
    if (NP.code === 'ACI') t += ' ' + T_('Rechnung in SI-Einheiten, Betonstahl {steel}.', { steel: esc(NP.steelName) });
    if (NP.code === 'EC' && n && n.na !== 'DE') {
      const cnt = { v: 0, s: 0, e: 0 };
      for (const k of ['gG', 'gQ', 'psiA', 'gc', 'gs', 'acc', 'crdc', 'vmin', 'wk', 'cmin', 'dcdev', 'punch', 'geo', 'upl']) cnt[(n.st && n.st[k]) || 'e']++;
      t += ' ' + T_('Nationale Parameter: {v} belegt, {s} aus Sekundärquellen, {e} als EN-Empfehlung (im Bericht gekennzeichnet).', cnt);
    }
    return t;
  }
  function countrySection() {
    const L = BP.laender, p = A.p, c = L.country(p), inf = L.info(c), regs = L.regions(c), q = A.q, cl = L.climate(p);
    let h = '<h3>' + T_('Land und Region') + '</h3>';
    h += fields(sel('site.country', T_('Land'), L.list(), { full: true }) + (regs.length ? sel('site.region', c === 'DE' ? T_('Bundesland') : T_('Region'), [['', T_('keine Angabe')]].concat(regs), { full: regs.some((r) => r[1].length > 15) }) : ''));
    const pl = L.pli(p), fx = L.fxInfo(L.currency(p), p);
    h += '<p class="note">' + T_('Normenfamilie des Landes: {fam}. Währung {cur}, Baupreisniveau {pli} × Deutschland{src}. Feiertage nach Land und Region.', {
      fam: T_(FAM_TXT[inf.fam] || FAM_TXT.EC), cur: L.currency(p), pli: fmt(pl.value, 2), src: pl.src === 'none' ? ' ' + T_('(kein Tabellenwert, bitte unter Material & Kosten eintragen)') : '' }) +
      ' ' + normNote(p) + (c !== 'DE' ? ' <b>' + T_('Beta:') + '</b> ' + T_('Normprofil und Register für dieses Land sind an Beispielen und Quellen geprüft, aber noch ohne unabhängige Prüfung.') : '') + (fx.rate == null ? ' <b>' + T_('Kein Wechselkurs vorhanden: unter Material & Kosten eintragen oder abrufen.') + '</b>' : '') + '</p>';
    const ms = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2027, i, 1)).toLocaleDateString(I18.locale(), { month: 'short', timeZone: 'UTC' }));
    h += '<h3>' + T_('Klima') + '</h3><p class="note">' + T_('Monatsmittel der Lufttemperatur für Bauablauf (Betonreife) und Haustechnik: {src}.', {
      src: cl.src === 'site' ? esc(cl.station) + (p.site.climate.period ? ', ' + esc(p.site.climate.period) : '') : cl.src === 'country' ? T_('Richtwerte {st}', { st: esc(String(cl.station).replace(/\.$/, '')) }) : T_('deutsche Mittelwerte (DWD 1991–2020)') }) + '</p>' +
      '<div class="climate">' + cl.temps.map((t, i) => '<span><small>' + esc(ms[i]) + '</small>' + fmt(t, 1) + '</span>').join('') + '</div>' +
      '<div class="rowbtns"><button class="btn ghost" data-act="climate"' + (p.site.lat != null && p.site.lon != null ? '' : ' disabled') + '>' + (A.ui.climLoading ? T_('Lädt …') : T_('Klima am Standort abrufen')) + '</button>' +
      (p.site.climate ? '<button class="btn ghost" data-act="climateReset">' + T_('Richtwerte des Landes') + '</button>' : '') + '</div>';
    void q;
    return h;
  }
  async function fetchClimate() {
    const s = A.p.site;
    if (!(s.lat != null && s.lon != null)) { A.toast(T_('Erst den Standort setzen.'), true); return; }
    A.ui.climLoading = true; A.render();
    try {
      const r = await fetch('api/climate?lat=' + s.lat + '&lon=' + s.lon);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ? T_(data.error) : T_('Abruf fehlgeschlagen'));
      A.commit((p) => { p.site.climate = { temps: data.temps, source: data.source, period: data.period, fetched: data.fetched, lat: data.lat, lon: data.lon }; Object.assign(p.tech, BP.laender.techFromClimate(data.temps)); });
      A.toast(T_('Klima übernommen; Erdreich- und Sommertemperatur der Haustechnik angepasst.'));
    } catch (err) {
      A.toast(location.protocol === 'file:' ? T_('Klimaabruf braucht den lokalen Server: python server.py starten.') : String(err.message || err), true);
    } finally { A.ui.climLoading = false; A.render(); }
  }
  async function fetchUsgs() {
    const s = A.p.site, sz = s.seismic;
    if (!(s.lat != null && s.lon != null)) { A.toast(T_('Erst den Standort setzen.'), true); return; }
    A.ui.usgsLoading = true; A.render();
    try {
      const r = await fetch('api/seismic-us?lat=' + s.lat + '&lon=' + s.lon + '&rc=' + encodeURIComponent(sz.importance) + '&sc=' + encodeURIComponent(sz.siteClass));
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ? T_(data.error) : T_('Abruf fehlgeschlagen'));
      A.commit((p) => { Object.assign(p.site.seismic, { sds: data.sds, sd1: data.sd1, usgs: { sds: data.sds, sd1: data.sd1, pgam: data.pgam, sms: data.sms, sm1: data.sm1, tl: data.tl, sdc: data.sdc, siteClass: data.siteClass, riskCategory: data.riskCategory, fetched: data.fetched, lat: data.lat, lon: data.lon, source: data.source } }); });
      A.toast(T_('Erdbebenwerte von USGS übernommen: SDS = {sds} g, SD1 = {sd1} g.', { sds: fmt(data.sds, 3), sd1: data.sd1 != null ? fmt(data.sd1, 3) : '–' }));
    } catch (err) {
      A.toast(location.protocol === 'file:' ? T_('Der USGS-Abruf braucht den lokalen Server: python server.py starten.') : String(err.message || err), true);
    } finally { A.ui.usgsLoading = false; A.render(); }
  }
  async function fetchFx() {
    try {
      const r = await fetch('api/fx');
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ? T_(data.error) : T_('Abruf fehlgeschlagen'));
      BP.laender.setLive(data);
      A.recompute(); A.render();
      A.toast(T_('Wechselkurse vom {d} übernommen ({src}).', { d: I18.date(data.date), src: data.src }));
    } catch (err) {
      A.toast(location.protocol === 'file:' ? T_('Kursabruf braucht den lokalen Server: python server.py starten.') : String(err.message || err), true);
    }
  }

  async function groundwater() {
    const s = A.p.site, lat = s.lat, lon = s.lon;
    if (!(lat && lon)) { A.toast(T_('Erst den Standort setzen.'), true); return; }
    A.ui.gwLoading = true; A.render();
    try {
      const r = await fetch('api/groundwater?lat=' + lat + '&lon=' + lon);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ? T_(data.error) : T_('Abruf fehlgeschlagen'));
      const gw = {
        fetched: data.fetched, issued: data.issued, source: data.source, license: data.license, stale: data.stale, lat, lon,
        results: data.results.map((x) => ({ id: x.id, name: x.name, distanceKm: x.distanceKm, date: x.date, value: x.value, low: x.low, high: x.high, groundNHN: x.groundNHN, link: x.link })),
      };
      A.commit((p) => { p.site.gw = gw; });
    } catch (err) {
      A.toast(location.protocol === 'file:' ? T_('Grundwasserabfrage braucht den lokalen Server: python server.py starten.') : String(err.message || err), true);
    }
    A.ui.gwLoading = false; A.render();
  }

  /* Kartenquellen an einer Stelle. Kacheln kommen direkt vom Anbieter; es gelten dessen Nutzungsbedingungen.
   * Wer eine eigene Kachelquelle nutzt, trägt sie hier ein und ergänzt sie in server.py (CSP img-src). */
  const MAP_LAYERS = {
    karte: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opts: { maxZoom: 19, attribution: N_('&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende') } },
    luftbild: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', opts: { maxNativeZoom: 19, maxZoom: 21, attribution: N_('Powered by <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> | Luftbild: Esri, Vantor, Earthstar Geographics, and the GIS User Community') } },
    beschriftung: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', opts: { maxNativeZoom: 19, maxZoom: 21, attribution: N_('Beschriftung: Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community') } },
  };

  function setSite(ll) {
    A.commit((p) => { p.site.lat = +ll.lat.toFixed(6); p.site.lon = +ll.lng.toFixed(6); if (!p.site.label || p.site.label === T_('Kartenpunkt')) p.site.label = T_('Kartenpunkt'); });
  }
  function initMap() {
    const el = document.getElementById('map');
    if (!el || !root.L) return;
    if (map) { map.remove(); map = null; }
    const s = A.p.site;
    const tile = (k) => L.tileLayer(MAP_LAYERS[k].url, Object.assign({}, MAP_LAYERS[k].opts, { attribution: T_(MAP_LAYERS[k].opts.attribution) }));
    const osm = tile('karte'), sat = tile('luftbild'), labels = tile('beschriftung');
    const luftbild = L.layerGroup([sat, labels]);
    const v = A.ui.mapView;
    const center = v ? [v.lat, v.lon] : s.lat ? [s.lat, s.lon] : [51.16, 10.45];
    const zoom = v ? v.zoom : s.lat ? 18 : 6;
    map = L.map(el, { zoomControl: true, attributionControl: true, layers: [A.ui.mapLayer === 'karte' ? osm : luftbild] }).setView(center, zoom);
    L.control.layers({ [T_('Luftbild')]: luftbild, [T_('Karte')]: osm }, null, { collapsed: false }).addTo(map);
    map.on('baselayerchange', (e) => { A.ui.mapLayer = e.name === T_('Karte') ? 'karte' : 'sat'; });
    map.on('moveend', () => { const c = map.getCenter(); A.ui.mapView = { lat: +c.lat.toFixed(6), lon: +c.lng.toFixed(6), zoom: map.getZoom() }; });
    map.on('click', (e) => setSite(e.latlng));
    placeMarker();
  }
  function placeMarker() {
    if (!map) return;
    if (map._bp) map.removeLayer(map._bp);
    const s = A.p.site;
    if (!s.lat) return;
    const icon = L.divIcon({ className: 'site-pin', html: '<span></span>', iconSize: [16, 16], iconAnchor: [8, 8] });
    map._bp = L.marker([s.lat, s.lon], { draggable: true, icon, autoPan: true, keyboard: false, title: T_('Ziehen zum genauen Platzieren') }).addTo(map);
    map._bp.on('dragend', (e) => setSite(e.target.getLatLng()));
  }

  /* ---------- Rendern ---------- */
  PN.render = function () {
    if (!panel) return;
    fid = 0;
    const st = panel.scrollTop;
    const ae = document.activeElement && panel.contains(document.activeElement) ? document.activeElement : null;
    const active = ae ? (ae.id ? '#' + CSS.escape(ae.id) : ['path', 'rate', 'check', 'field'].filter((k) => ae.dataset[k] != null).map((k) => '[data-' + k + '="' + CSS.escape(ae.dataset[k]) + '"]').join('')) : null;
    const fn = STEP[A.step] || STEP.standort;
    const rj = A.ui.rejected ? '<div class="rejected"><p>' + T_('<b>Gespeichertes Projekt nicht geladen</b> ({msg}). Es wurde nicht überschrieben, sondern im Browser aufgehoben.', { msg: esc(A.ui.rejected.msg) }) + '</p><div class="rowbtns"><button class="btn small" data-act="saveRejected">' + T_('Als Datei sichern') + '</button><button class="btn small ghost" data-act="dropRejected">' + T_('Verwerfen') + '</button></div></div>' : '';
    panel.innerHTML = rj + fn();
    panel.scrollTop = st;
    if (active) { const el = panel.querySelector(active); if (el && el.focus) el.focus(); }
    if (A.step === 'standort' && A.ui.mapOn) initMap(); else if (map) { map.remove(); map = null; }
  };

  const STEP = {};

  STEP.standort = function () {
    const s = A.p.site, q = A.q, lv = q.lv;
    const soil = q.soil;
    let h = '<h2>' + T_('Standort & Baugrund') + '</h2><p class="lead">' + T_('Wo gebaut wird und was im Boden steckt. Daraus folgen Wasserdruck, Auftrieb und Erddruck.') + '</p>';
    h += countrySection();
    h += '<h3>' + T_('Grundstück') + '</h3>';
    h += '<div style="display:flex;gap:6px"><input id="siteQuery" class="wide-inp" placeholder="' + T_('PLZ, Ort oder Adresse') + '" value="' + esc(A.ui.siteQuery || s.query || '') + '"><button class="btn" data-act="geocode">' + T_('Suchen') + '</button></div>';
    if (A.ui.geoResults && A.ui.geoResults.length) h += '<ul class="geo-results">' + A.ui.geoResults.map((r, i) => '<li><button data-act="pickGeo" data-i="' + i + '">' + esc(r.label) + '</button></li>').join('') + '</ul>' +
      '<p class="note">' + T_('Ortssuche über Nominatim, Daten © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende (ODbL).') + '</p>';
    if (s.label) h += '<p class="note">' + T_('Gewählt: {label}', { label: esc(s.label) }) + '</p>';
    h += A.ui.mapOn ? '<div id="map" class="map map-lg"></div><p class="note">' + T_('Oben rechts zwischen <b>Luftbild</b> und Karte umschalten. In die Karte klicken setzt den Punkt, den gelben Marker ziehen platziert ihn genau auf dem Grundstück. Quellen stehen unten rechts in der Karte.') + '</p>' : '<div class="map map-empty"><button class="btn ghost" data-act="showMap">' + T_('Karte / Luftbild laden') + '</button></div>';
    h += fields(num('site.lat', T_('Breite@@Geo'), '°', { nullable: true, dec: 6 }) + num('site.lon', T_('Länge@@Geo'), '°', { nullable: true, dec: 6 }) + num('site.groundNHN', T_('Geländehöhe'), BP.laender.datum(A.p), { nullable: true, hint: T_('optional, aus Vermessung') }));

    h += '<h3>' + T_('Grundwasser') + '</h3>';
    h += fields(sel('site.waterMode', T_('Wasserstand'), [['unbekannt', T_('Noch unbekannt')], ['keins', T_('Kein Grundwasser bis Sohle')], ['tiefe', T_('Bemessungswasserstand')], ['gok', T_('Stauwasser bis Gelände')]]) +
      (s.waterMode === 'tiefe' ? num('site.waterDepth', T_('Tiefe unter Gelände'), 'm', { min: 0, nullable: true, hint: T_('höchster zu erwartender Stand') }) : '') +
      txt('site.waterSource', T_('Quelle des Wertes'), { placeholder: T_('z. B. Baugrundgutachten vom …') }));
    if (BP.laender.country(A.p) === 'DE') h += '<div class="rowbtns"><button class="btn ghost" data-act="groundwater"' + (s.lat ? '' : ' disabled') + '>' + (A.ui.gwLoading ? T_('Lädt …') : T_('BGR-Referenzmessstellen abrufen')) + '</button></div>';
    else h += '<p class="note">' + T_('Grundwasserstände außerhalb Deutschlands: Messstellen der zuständigen Landes- bzw. Wasserbehörde oder Baugrundgutachten.') + '</p>';
    if (s.gw && s.gw.results) {
      const moved = Math.abs((s.gw.lat || 0) - (s.lat || 0)) > 1e-4 || Math.abs((s.gw.lon || 0) - (s.lon || 0)) > 1e-4;
      h += '<table class="res"><thead><tr><th>' + T_('Messstelle') + '</th><th>' + T_('Entf.') + '</th><th>' + T_('Flurabst.') + '</th><th></th></tr></thead>' + s.gw.results.map((r, i) =>
        '<tr><td class="l"><a href="' + esc(BP.planning.url(r.link) || '#') + '" target="_blank" rel="noopener">' + esc(r.name) + '</a></td><td>' + fmt(r.distanceKm, 1) + ' km</td><td>' + fmt(r.groundNHN - r.high) + ' m</td><td><button class="btn small ghost" data-act="useGw" data-i="' + i + '">' + T_('Startwert') + '</button></td></tr>').join('') + '</table>';
      h += '<p class="note">' + T_('{src}, Modellwerte an Referenzmessstellen, Stand {date}', { src: esc(s.gw.source), date: esc(s.gw.issued || s.gw.fetched) }) + (s.gw.stale ? ' ' + T_('(gespeicherter älterer Stand)') : '') + '. ' + (/Datenlizenz Deutschland/.test(s.gw.license) ? '<a href="https://www.govdata.de/dl-de/by-2-0" target="_blank" rel="noopener">' + esc(s.gw.license) + '</a>' : esc(s.gw.license)) + '. ' + T_('Flurabstand mit oberem Extremwert. Gilt für die Messstelle, nicht fürs Grundstück.') + (moved ? ' <b>' + T_('Standort seitdem geändert.') + '</b>' : '') + '</p>';
    }

    h += '<h3>' + T_('Baugrund') + '</h3>';
    h += fields(sel('site.soil', T_('Bodenart'), Object.entries(M.SOILS).map(([k, v]) => [k, T_(v.name)])));
    if (s.soil === 'eigen') {
      h += fields(num('site.custom.gamma', T_('Wichte feucht γ'), 'kN/m³', { min: 10, max: 25 }) + num('site.custom.gammaSat', T_('Wichte gesättigt γr'), 'kN/m³', { min: 15, max: 26 }) +
        num('site.custom.phi', T_('Reibungswinkel φ'), '°', { min: 10, max: 45 }) + num('site.custom.sigmaRd', T_('Sohlwiderstand σR,d'), 'kN/m²', { min: 50, max: 1500 }) +
        num('site.custom.Es', T_('Steifemodul Es'), 'MN/m²', { min: 2, max: 5000, hint: T_('für Bettung und Setzung') }) + num('site.custom.c', T_('Kohäsion c′'), 'kN/m²', { min: 0, max: 200 }));
    } else {
      h += table([row(T_('Wichte feucht / gesättigt'), fmt(soil.gamma, 1) + ' / ' + fmt(soil.gammaSat, 1) + ' kN/m³'), row(T_('Reibungswinkel'), fmt(soil.phi, 1) + '°'), row(T_('Sohlwiderstand σR,d'), fmt(soil.sigmaRd, 0) + ' kN/m²'), row(T_('Steifemodul Es'), fmt(soil.Es, 0) + ' MN/m²'), row(T_('Kohäsion c′'), fmt(soil.c || 0, 0) + ' kN/m²'), row(T_('Wasserdurchlässig'), soil.permeable ? T_('ja') : T_('nein'))]);
      h += '<p class="note">' + T_('Erfahrungswerte für die Vorbemessung. Mit Gutachten die Bodenart „Eigene Werte“ wählen.') + '</p>';
    }
    h += seismicSection(q);
    h += radonSite(q);
    const head = isFinite(lv.zW) ? lv.zW - lv.zInsBot : 0;
    h += '<h3>' + T_('Was das für den Bau heißt') + '</h3>';
    h += kpis([kpi(fmt(-lv.zSlabBot) + ' m', T_('Unterkante Bodenplatte')), kpi(fmt(q.earth.depth) + ' m', T_('Baugrubentiefe')),
      kpi(head > 0 ? fmt(head) + ' m' : T_('keins'), T_('Wasser über Sohle')), kpi(q.struct.buoyancy.relevant ? fmt(q.struct.buoyancy.final.eta) : '–', T_('Auftrieb η'))]);
    h += msgs('standort') + stepNav('standort');
    return h;
  };

  STEP.nutzung = function () {
    const q = A.q, st = q.struct, u = A.p.use;
    let h = '<h2>' + T_('Nutzung & Lasten') + '</h2><p class="lead">' + T_('Wer den Bunker wie lange nutzt und was oben draufliegt. Die Decke trägt Erde, Verkehr und Eigengewicht.') + '</p>';
    h += '<h3>' + T_('Belegung') + '</h3>' + fields(num('use.people', T_('Personen'), '', { min: 1, max: 500, step: 1 }) + num('use.days', T_('Schutzdauer'), T_('Tage'), { min: 1, max: 365, step: 1 }));
    h += '<h3>' + T_('Über dem Bunker') + '</h3>' + fields(
      num('build.cover', T_('Erdüberdeckung'), 'm', { min: 0, max: 6, hint: T_('Erde über der Decke') }) +
      sel('use.surface', T_('Nutzung der Fläche'), Object.entries(M.SURFACE_LOADS).map(([k, v]) => [k, T_(v.name) + (k === 'eigen' ? '' : ' (' + fmt(v.q, 1) + ' kN/m²)')])) +
      (u.surface === 'eigen' ? num('use.surfaceQ', T_('Verkehrslast'), 'kN/m²', { min: 0, max: 100 }) : '') +
      num('use.extraG', T_('Zusätzliche ständige Last'), 'kN/m²', { min: 0, max: 200, hint: T_('Pflaster, Gartenhaus, Aufschüttung') }));
    h += fields(num('use.storeys', T_('Geschosse darüber'), '', { min: 0, max: 40, step: 1, hint: T_('0 = im Garten; Gebäudelast oben eintragen') }));
    const mo = q.lv.mound, bm = A.p.build.mound || {};
    h += '<h3>' + T_('Höhenlage') + '</h3>' + fields(chk('build.mound.on', T_('Erdhügel: Bunker ragt über das Gelände, Erde wird als Hügel aufgeschüttet')) +
      (bm.on ? num('build.mound.floorDepth', T_('Fußboden unter Gelände'), 'm', { min: 0, max: +mo.total.toFixed(2), hint: T_('0 = ebenerdig, {t} = ganz unterirdisch', { t: fmt(mo.total) }) }) +
        num('build.mound.crest', T_('Kronenüberstand'), 'm', { min: 0, max: 10, hint: T_('ebene Hügelkrone ab Außenwand') }) +
        num('build.mound.slope', T_('Böschung 1 :'), '', { min: 0.5, max: 6, hint: T_('2 = 1 m Höhe auf 2 m Länge') }) +
        sel('build.mound.fill', T_('Schüttmaterial'), [['aushub', T_('Aushub verwenden, Rest liefern')], ['liefer', T_('komplett liefern')]]) : ''));
    if (mo.on) {
      h += kpis([kpi(fmt(mo.h) + ' m', T_('Hügel über Gelände')), kpi(fmt(mo.toe, 1) + ' m', T_('Hügelfuß ab Außenwand')), kpi(fmt(q.earth.Vmound, 0) + ' m³', T_('Hügelvolumen')), kpi(q.earth.Vimport > 0.5 ? fmt(q.earth.Vimport, 0) + ' m³' : T_('keine'), T_('Bodenlieferung'))]);
      h += '<p class="note">' + T_('Erddruck auf die Außenwände wird auf der sicheren Seite mit voller Hügelhöhe angesetzt. Zugänge werden als Einschnitt mit Stützwänden bis zum Hügelfuß geführt, der Notausstieg bis über die Hügeloberfläche.') + '</p>';
    } else if (bm.on) h += '<p class="note">' + T_('Bei dieser Tiefe liegt der Bunker komplett unter Gelände – es entsteht kein Hügel.') + '</p>';
    h += '<h3>' + T_('Im Bunker') + '</h3>' + fields(num('use.interiorQ', T_('Nutzlast Boden'), 'kN/m²', { min: 0, max: 50, hint: T_('Regale, Tanks, Technik') }));
    h += '<h3>' + T_('Seitlich') + '</h3>' + fields(chk('use.compaction', T_('Verdichtungserddruck beim Verfüllen ansetzen ({ref})', { ref: np().ref.earth })) +
      (u.compaction ? num('use.compactionP', T_('Verdichtungserddruck'), 'kN/m²', { min: 0, max: 60, hint: T_('unnachgiebige Wand: 25–40') }) : ''));
    if (st.roof) {
      h += '<h3>' + T_('Lasten auf der Decke') + '</h3>';
      h += table(st.roof.loads.filter((l) => l.g != null).map((l) => row(l.name, fmt(l.g) + ' kN/m²')).concat([
        row(T_('Ständig gₖ'), fmt(st.roof.gk) + ' kN/m²', 'sum'), row(T_('Veränderlich qₖ'), fmt(st.q) + ' kN/m²'), row(T_('Bemessung 1,35 g + 1,5 q'), fmt(st.roof.pEd) + ' kN/m²', 'sum')]));
    }
    h += '<h3>' + T_('Druck auf die Außenwände') + '</h3>' + table([row(T_('Erdruhedruckbeiwert K₀ = 1 − sin φ'), fmt(st.K0, 3))].concat(st.evh > 0 ? [row(T_('Verdichtungserddruck'), T_('{p} kN/m² bis {z}', { p: fmt(st.evh, 0), z: isFinite(st.wall.zEvh) ? T_('{z} m Tiefe', { z: fmt(st.wall.zEvh, 1) }) : T_('Sohle') }))] : [])
      .concat([row(T_('Oben (Deckenmitte)'), fmt(st.wall.p1, 1) + ' kN/m²'), row(T_('Unten (Plattenmitte)'), fmt(st.wall.p2, 1) + ' kN/m²'), row(T_('davon Wasserdruck unten'), fmt(st.wall.pressures.waterAtBot * 1.35, 1) + ' kN/m²')]));
    h += '<p class="note">' + T_('Bemessungswerte inkl. Teilsicherheiten. Die Verteilung siehst du im Schnitt.') + '</p>';
    h += loadOverview();
    const pf = st.shield.pf;
    h += '<h3>' + T_('Schutz und Platz') + '</h3>' + kpis([
      kpi(fmt(q.geo.tot.Anet / Math.max(1, u.people), 1) + ' m²', T_('Nettofläche je Person')),
      kpi(fmt(q.tech.V / Math.max(1, u.people), 1) + ' m³', T_('Luftvolumen je Person')),
      kpi(fmt(st.shield.halvings, 1), T_('Halbwertsschichten über Kopf')),
      kpi(pf > 1e5 ? '> ' + I18.num(1e5, 0) : Math.round(pf).toLocaleString(I18.locale()), T_('Abschirmfaktor Decke')),
    ]);
    h += '<p class="note">' + T_('Abschirmung gegen Fallout-Gammastrahlung über Decke und Erde (Halbwertsdicke Beton 6 cm, Erde 8 cm, US Army FM 3-05.70). Schwachstelle ist meist der Zugang.') + '</p>';
    h += msgs('nutzung') + stepNav('nutzung');
    return h;
  };

  /* ---------- Alle Einwirkungen auf den Bunker ---------- */
  const LOAD_ST = { ok: ['ok', N_('gerechnet')], acc: ['acc', N_('außergewöhnlich')], off: ['off', N_('nicht angesetzt')], fach: ['fach', N_('Fachplanung')] };
  function loadOverview() {
    const q = A.q, st = q.struct, p = A.p, u = p.use, hz = p.hazard, bl = st.blast, lv = q.lv;
    const water = lv.water.known && isFinite(lv.zW);
    const spec = Object.entries(hz.scenarios || {}).filter(([, v]) => v && v.on);
    const gCover = st.roof ? st.roof.loads.find((l) => /^Erdüberdeckung/.test(l.name)) : null;
    const rows = [
      [T_('Eigengewicht Stahlbeton'), '25 kN/m³', 'ok'],
      [T_('Erde auf der Decke'), gCover ? fmt(gCover.g, 1) + ' kN/m²' : '–', 'ok'],
      [T_('Verkehr auf dem Gelände'), fmt(st.q, 1) + ' kN/m²', 'ok'],
      [T_('Gebäude, Aufbauten'), u.extraG ? fmt(u.extraG, 1) + ' kN/m²' : T_('keine'), u.extraG ? 'ok' : 'off'],
      [T_('Erdruhedruck seitlich'), 'K₀ = ' + fmt(st.K0, 2), 'ok'],
      [T_('Verdichtungserddruck'), u.compaction ? fmt(st.evh, 0) + ' kN/m²' : T_('aus'), u.compaction ? 'ok' : 'off'],
      [T_('Wasserdruck, Auftrieb'), water ? T_('Wasser ab {z} m', { z: fmt(-lv.zW) }) : lv.water.known ? T_('kein Grundwasser') : T_('Wasserstand fehlt'), water || lv.water.known ? 'ok' : 'off'],
      [T_('Nutzlast innen'), fmt(u.interiorQ, 1) + ' kN/m²', 'ok'],
      [T_('Luftstoß auf Decke'), bl ? T_('{q} kN/m² · Φ 1,2 / 2,0', { q: fmt(bl.qk, 0) }) : T_('kein Schutzgrad'), bl ? 'acc' : 'off'],
      [T_('Erdstoß auf Außenwände'), bl ? fmt(bl.qk * bl.fw.wall, 0) + ' kN/m²' : '–', bl ? 'acc' : 'off'],
      [T_('Luftstoß auf Bodenplatte'), bl ? (bl.delta > 0 ? 'δ = ' + fmt(bl.delta, 1) : T_('Fels: keine')) : '–', bl ? 'acc' : 'off'],
      [T_('Erschütterung Einbauten'), hz.shock ? '±2 g / ±4 g' : '–', hz.shock ? 'acc' : 'off'],
      [T_('Trümmerlast'), u.storeys > 8 ? T_('{n} Geschosse', { n: u.storeys }) : u.storeys > 0 ? T_('bis 8 Geschosse nicht maßgebend') : T_('kein Gebäude darüber'), u.storeys > 8 && bl ? 'fach' : 'off'],
      [T_('Erdbeben'), q.verify && q.verify.eq ? T_('{z}, Δp = {dp} kN/m²', { z: q.verify.eq.label, dp: fmt(q.verify.eq.dp, 1) }) : isDE() ? T_('Zone 0 bzw. außerhalb') : T_('kein Erdbebennachweis'), q.verify && q.verify.eq ? 'acc' : 'off'],
      [T_('Treffer, Nahtreffer'), spec.length ? T_(spec.length > 1 ? '{n} Szenarien' : '{n} Szenario', { n: spec.length }) : T_('nicht gefordert'), spec.length ? 'fach' : 'off'],
    ];
    let h = '<h3>' + T_('Alle Einwirkungen') + '</h3><table class="res loads"><tbody>' + rows.map(([n, v, k]) => '<tr><th>' + n + '</th><td>' + v + '</td><td><span class="st ' + LOAD_ST[k][0] + '">' + T_(LOAD_ST[k][1]) + '</span></td></tr>').join('') + '</tbody></table>';
    h += '<p class="note">' + T_('Außergewöhnliche Lastfälle stellst du unter Schutzgrad ein, die Erdbebenzone unter Standort & Baugrund. Frost spielt ab rund 80 cm Erdüberdeckung keine Rolle.') + '</p>';
    return h;
  }

  /* ---------- Layout-Vorschläge ---------- */
  let layCache = { key: null, list: null };
  function layoutList() {
    const p = A.p, o = A.ui.layout;
    const key = JSON.stringify([Object.assign({}, p, { geom: null, routes: null, name: null, checklist: null }), o.per, o.maxL, o.maxB]);
    if (layCache.key === key) return layCache.list;
    const evalLay = (lay) => {
      const p2 = JSON.parse(JSON.stringify(p));
      p2.geom = JSON.parse(JSON.stringify(lay.geom)); p2.routes = JSON.parse(JSON.stringify(lay.routes));
      const q = BP.calc.run(p2, { fe: 'none' }); // Vorschau: Tafelverfahren genügt
      const ext = (pts) => { const xs = pts.map((v) => v.x), ys = pts.map((v) => v.y); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; };
      const [X, Y] = ext(q.geo.out), [bx, by] = ext(q.geo.out.concat(...q.geo.access.map((a) => a.foot)));
      return { lay, q, X, Y, bx, by, fit: null };
    };
    const list = BP.layouts.generate(p, { per: o.per }).map((lay) => {
      let r = evalLay(lay);
      if (o.maxL > 0 && o.maxB > 0) {
        const fits = (e) => e.bx <= o.maxL + 1e-6 && e.by <= o.maxB + 1e-6;
        if (fits(r)) r.fit = 'ja';
        else {
          const r2 = evalLay(BP.layouts.rotate(lay));
          if (fits(r2)) { r = r2; r.fit = 'gedreht'; } else r.fit = 'nein';
        }
      }
      return r;
    });
    // Grundformen, deren Vorbemessung mit den aktuellen Bauteildicken nicht aufgeht, ausblenden (es sei denn, keine geht auf)
    const ok = list.filter((r) => !r.q.checks.some((c) => c.level === 'err' && c.step === 'statik'));
    const shown = ok.length ? ok : list;
    shown.hidden = ok.length ? list.filter((r) => !ok.includes(r)).map((r) => r.lay.name) : [];
    layCache = { key, list: shown };
    return shown;
  }

  function miniPlan(q) {
    // Ausschnitt: Bunker plus höchstens 1,8 m der Zugänge, damit der Grundriss groß bleibt
    const g = q.geo, xs0 = g.out.map((v) => v.x), ys0 = g.out.map((v) => v.y), m = 1.8;
    const ax = g.access.flatMap((a) => a.foot.map((v) => v.x)), ay = g.access.flatMap((a) => a.foot.map((v) => v.y));
    const x0 = Math.max(Math.min(...xs0, ...ax), Math.min(...xs0) - m), x1 = Math.min(Math.max(...xs0, ...ax), Math.max(...xs0) + m);
    const y0 = Math.max(Math.min(...ys0, ...ay), Math.min(...ys0) - m), y1 = Math.min(Math.max(...ys0, ...ay), Math.max(...ys0) + m), pad = 0.3;
    const P = (poly) => 'M' + poly.map((v) => v.x.toFixed(3) + ' ' + (-v.y).toFixed(3)).join('L') + 'Z';
    let s = '<svg viewBox="' + [x0 - pad, -y1 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad].map((v) => v.toFixed(2)).join(' ') + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">';
    s += g.access.map((a) => '<path d="' + P(a.foot) + '" class="mp-acc"/>').join('');
    s += '<path d="' + P(g.out) + (g.valid ? P(g.inner) : '') + '" class="mp-wall" fill-rule="evenodd"/>';
    s += g.walls.flatMap((w) => w.segs.map((sg) => '<line x1="' + sg.a.x.toFixed(3) + '" y1="' + (-sg.a.y).toFixed(3) + '" x2="' + sg.b.x.toFixed(3) + '" y2="' + (-sg.b.y).toFixed(3) + '" stroke-width="' + w.t + '" class="' + (w.info.bearing ? 'mp-stb' : 'mp-mw') + '"/>')).join('');
    s += g.openings.filter((o) => !o.invalid).map((o) => '<line x1="' + o.p0.x.toFixed(3) + '" y1="' + (-o.p0.y).toFixed(3) + '" x2="' + o.p1.x.toFixed(3) + '" y2="' + (-o.p1.y).toFixed(3) + '" stroke-width="' + (o.t + 0.04) + '" class="mp-door"/>').join('');
    return s + '</svg>';
  }

  function layoutCard(r, i) {
    const q = r.q, g = q.geo, n = Math.max(1, A.p.use.people), errs = q.summary.errors;
    const span = q.struct.roof ? q.struct.roof.field.lxC : null;
    const fitTxt = { ja: T_('passt ins Baufeld'), gedreht: T_('passt gedreht'), nein: T_('zu groß') }[r.fit];
    return '<div class="lay' + (r.fit === 'nein' ? ' off' : '') + '"><div class="lay-svg">' + miniPlan(q) + '</div><div class="lay-body">' +
      '<div class="lay-head"><b>' + esc(r.lay.name) + '</b>' + (fitTxt ? '<span class="tag ' + (r.fit === 'nein' ? 'err' : 'ok') + '">' + fitTxt + '</span>' : '') + '</div>' +
      '<div class="lay-kv">' + [[fmt(r.X, 1) + ' × ' + fmt(r.Y, 1) + ' m', T_('außen')], [fmt(g.Anet, 0) + ' m²', T_('{a} m²/P', { a: fmt(g.Anet / n, 1) })], [fmt(q.vol.rc, 0) + ' m³', T_('Beton')], [span ? fmt(span, 1) + ' m' : '–', T_('Spannweite')], [eur(q.bom.gross), T_('brutto')]]
        .map(([v, l]) => '<span><b>' + v + '</b> ' + l + '</span>').join('') + '</div>' +
      '<p class="note">' + esc(r.lay.desc) + (errs ? ' <b style="color:var(--err)">' + T_('{n} Fehler im Nachweis.', { n: errs }) + '</b>' : '') + '</p>' +
      '<button class="btn small" data-act="applyLayout" data-i="' + i + '">' + T_('Übernehmen') + '</button></div></div>';
  }

  function layoutSection() {
    const ui = A.ui, p = A.p;
    let h = '<h3 class="row-h">' + T_('Layout-Vorschläge') + ' <button class="btn small ghost" data-act="toggleLayouts">' + (ui.layout.open ? T_('Ausblenden') : T_('Zeigen')) + '</button></h3>';
    if (!ui.layout.open) return h;
    const lays = layoutList(), nTypes = lays.length, withGross = lays.some((r) => r.lay.key === 'gross');
    const intro = nTypes === 1 && withGross ? T_('Für {n} Personen passt nur noch der Großschutzraum mit Abschnitten und Schlafkabinen', { n: esc(p.use.people) })
      : T_('{forms} für {n} Personen', { forms: ({ 1: T_('Eine Grundform'), 2: T_('Zwei Grundformen'), 3: T_('Drei Grundformen'), 4: T_('Vier Grundformen'), 5: T_('Fünf Grundformen'), 6: T_('Sechs Grundformen') }[nTypes] || T_('{n} Grundformen', { n: nTypes })), n: esc(p.use.people) }) + (withGross ? ' ' + T_('(darunter der Großschutzraum mit Abschnitten und Schlafkabinen)') : '');
    h += '<p class="note">' + T_('{intro}, mit aktuellem Schutzgrad und Bauteildicken komplett durchgerechnet. Übernehmen ersetzt Grundriss und Leitungen, Strg+Z holt den alten zurück.', { intro }) + '</p>';
    h += fields(num('use.people', T_('Personen'), '', { min: 1, max: 500, step: 1 }) +
      num('layout.per', T_('Aufenthaltsfläche je Person'), 'm²', { ui: true, value: ui.layout.per, min: 1, max: 20, hint: T_('ohne Nebenräume; CH-Minimum 1 m²') }) +
      num('layout.maxL', T_('Baufeld Länge (x)'), 'm', { ui: true, value: ui.layout.maxL, nullable: true, min: 2, max: 300, placeholder: T_('offen'), hint: T_('mit Treppe und Schacht') }) +
      num('layout.maxB', T_('Baufeld Breite (y)'), 'm', { ui: true, value: ui.layout.maxB, nullable: true, min: 2, max: 300, placeholder: T_('offen') }));
    if (lays.hidden.length) h += '<p class="note">' + T_(lays.hidden.length === 1 ? 'Ausgeblendet, weil die Vorbemessung mit den aktuellen Bauteildicken nicht aufgeht: {list}. Mit dickerer Decke oder weniger Fläche je Person erscheint sie wieder.' : 'Ausgeblendet, weil die Vorbemessung mit den aktuellen Bauteildicken nicht aufgeht: {list}. Mit dickerer Decke oder weniger Fläche je Person erscheinen sie wieder.', { list: esc(lays.hidden.map((x) => T_(x)).join(', ')) }) + '</p>';
    h += '<div class="lays">' + lays.map(layoutCard).join('') + '</div>';
    return h;
  }

  STEP.grundriss = function () {
    const q = A.q, g = q.geo, p = A.p, ui = A.ui, li = A.lvl(), L = g.L[li], src = A.levelSrc(p, li), multi = g.L.length > 1;
    let h = '<h2>' + T_('Grundriss') + '</h2><p class="lead">' + T_('Außenkontur, Ebenen, Innenwände, Türen, Stützen, Treppen und Aufzüge. Alles im Plan ziehbar, Werte hier exakt eintragen.') + '</p>';
    h += selectionCard();
    if (A.tool === 'wall') {
      h += '<h3>' + T_('Neue Innenwand') + '</h3>' + fields(sel('wallKind', T_('Wandart'), Object.entries(M.WALL_KINDS).map(([k, v]) => [k, T_(v.name)]), { ui: true, value: ui.wallKind }) +
        num('wallT', T_('Dicke'), 'cm', { ui: true, value: ui.wallT, scale: 100, min: 5, max: 100 }));
    }
    if (A.tool === 'opening') {
      h += '<h3>' + T_('Neue Tür in Innenwand') + '</h3>' + fields(sel('openingKind', T_('Art'), Object.entries(M.OPENING_KINDS).map(([k, v]) => [k, T_(v.name)]), { ui: true, value: ui.openingKind }) +
        num('openingW', T_('Breite'), 'm', { ui: true, value: ui.openingW, min: 0.5, max: 3 }));
      h += '<p class="note">' + (li ? T_('Auf unteren Ebenen nur Türen in Innenwänden.') : T_('In Außenwänden wird eine Schutztür mit 1,00 m gesetzt.')) + '</p>';
    }
    if (A.tool === 'unterzug') h += '<h3>' + T_('Neuer Unterzug') + '</h3>' + fields(num('beamB', T_('Breite'), 'cm', { ui: true, value: ui.beamB || 0.3, scale: 100, min: 20, max: 150 }) + num('beamH', T_('Höhe unter der Platte'), 'cm', { ui: true, value: ui.beamH || 0.5, scale: 100, min: 15, max: 200 })) + '<p class="note">' + T_('Der Unterzug trägt die Platte über dieser Ebene und leitet die Last an Wände oder Stützen an seinen Enden.') + '</p>';
    if (A.tool === 'stuetze') h += '<h3>' + T_('Neue Stütze') + '</h3>' + fields(num('colB', T_('Querschnitt quadratisch'), 'cm', { ui: true, value: ui.colB || 0.3, scale: 100, min: 20, max: 150 })) + '<p class="note">' + T_('Stützen tragen die Platte über dieser Ebene. Größe und Bewehrung werden in „Tragwerk“ nachgewiesen.') + '</p>';
    if (A.tool === 'itreppe' || A.tool === 'aufzug') h += '<h3>' + (A.tool === 'itreppe' ? T_('Neue Innentreppe') : T_('Neuer Aufzug')) + '</h3>' + fields(sel('vertDir', A.tool === 'itreppe' ? T_('Laufrichtung nach unten') : T_('Tür zeigt nach'), DIRS.map(([v, t]) => [v, T_(t)]), { ui: true, value: ui.vertDir || 0, numeric: true })) + '<p class="note">' + T_('Taste D dreht um 90°.') + '</p>';
    if (A.tool === 'zone') h += '<p class="note">' + T_('Bereich ohne Stützen aufziehen, z. B. für Fahrwege, Lagerflächen oder einen großen Aufenthaltsraum.') + '</p>';
    h += levelsSection();
    if (li === 0) h += layoutSection();
    h += '<h3>' + T_('Außenkontur') + '</h3>';
    h += kpis([kpi(fmt(g.A) + ' m²', T_('Brutto-Grundfläche')), kpi(fmt(L.Anet) + ' m²', multi ? T_('Netto-Raumfläche Ebene {n}', { n: li + 1 }) : T_('Netto-Raumfläche')), kpi(multi ? fmt(g.tot.Anet) + ' m²' : fmt(g.P) + ' m', multi ? T_('Netto alle Ebenen') : T_('Umfang außen')), kpi(fmt(g.tot.V, 1) + ' m³', T_('Raumvolumen'))]);
    const isL = ui.shape.kind === 'L';
    h += '<h4>' + T_('Form neu setzen') + '</h4>' + fields(seg('shape.kind', [['rect', T_('Rechteck')], ['L', T_('L-Form')]], { ui: true, value: isL ? 'L' : 'rect' }) +
      num('shape.L', T_('Länge außen'), 'm', { ui: true, value: ui.shape.L, min: 2, max: 100 }) + num('shape.B', T_('Breite außen'), 'm', { ui: true, value: ui.shape.B, min: 2, max: 100 }) +
      (isL ? num('shape.a', T_('Ausschnitt oben rechts, Länge'), 'm', { ui: true, value: ui.shape.a, min: 0.5, max: 99 }) + num('shape.b', T_('Ausschnitt oben rechts, Breite'), 'm', { ui: true, value: ui.shape.b, min: 0.5, max: 99 }) : ''));
    h += '<div class="rowbtns"><button class="btn ghost" data-act="' + (isL ? 'shapeL' : 'shapeRect') + '">' + T_('Außenkontur ersetzen') + '</button></div><p class="note">' + T_('Gilt für alle Ebenen. Innenwände, Türen und Zugänge bleiben erhalten. Einzelne Kanten lassen sich auch direkt im Plan ziehen.') + '</p>';
    h += '<details style="margin-top:10px"><summary class="note" style="cursor:pointer">' + T_('Eckpunkte einzeln bearbeiten') + '</summary><div class="fields" style="grid-template-columns:28px 1fr 1fr;margin-top:6px">' +
      p.geom.outline.map((pt, i) => '<span class="note">' + (i + 1) + '</span>' + '<div class="inp"><input type="number" step="any" data-path="geom.outline.' + i + '.x" data-scale="1" value="' + pt.x + '"><span class="u">x</span></div><div class="inp"><input type="number" step="any" data-path="geom.outline.' + i + '.y" data-scale="1" value="' + pt.y + '"><span class="u">y</span></div>').join('') + '</div></details>';

    h += '<h3>' + (multi ? T_('Räume in Ebene {n}', { n: li + 1 }) : T_('Räume')) + '</h3>';
    const rooms = L.rooms.filter((r) => !r.shaft);
    h += rooms.length ? '<ul class="list">' + rooms.map((r) => '<li' + (r.id ? ' data-selitem="room:' + esc(r.id) + '"' : '') + (A.sel && A.sel.id === r.id ? ' class="sel"' : '') + '><span>' + esc(BP.calc.roomName(r.name)) + '</span><span>' + fmt(r.area) + ' m²</span></li>').join('') + '</ul>' : '<p class="note">' + T_('Noch keine Räume.') + '</p>';
    h += '<p class="note">' + T_('Doppelklick in einen Raum oder Werkzeug „Raum benennen“.') + '</p>';
    const li_ = (type, id, name, val) => '<li data-selitem="' + type + ':' + esc(id) + '"' + (A.sel && A.sel.id === id ? ' class="sel"' : '') + '><span>' + name + '</span><span>' + val + '</span></li>';
    const vh = g.vert;
    h += '<h3>' + (multi ? T_('Bauteile in Ebene {n}', { n: li + 1 }) : T_('Bauteile')) + '</h3><ul class="list">' +
      L.walls.filter((w) => !w.auto).map((w) => li_('wall', w.id, esc(nameOf('w:' + w.id, T_('Innenwand'))) + ' · ' + esc(T_(w.info.name)) + ', ' + fmt(w.t * 100, 1) + ' cm', fmt(w.len) + ' m')).join('') +
      src.openings.map((o) => li_('opening', o.id, esc(nameOf('o:' + o.id, T_('Öffnung'))) + ' · ' + esc(T_((M.OPENING_KINDS[o.kind] || { name: o.kind }).name)), fmt(o.w) + ' × ' + fmt(o.h) + ' m')).join('') +
      (L.beams || []).map((bu) => li_('beam', bu.id, esc(nameOf('b:' + bu.id, T_('Unterzug'))) + ' · ' + fmt(bu.bw * 100, 0) + '/' + fmt(bu.hb * 100, 0) + ' cm', fmt(bu.len) + ' m')).join('') +
      L.columns.map((c) => li_('column', c.id, esc(nameOf('c:' + c.id, T_('Stütze'))) + (c.auto ? ' · ' + T_('automatisch') : ''), fmt(c.bx * 100, 0) + ' × ' + fmt(c.by * 100, 0) + ' cm')).join('') +
      (src.zones || []).map((z) => li_('zone', z.id, T_('Stützenfrei') + (z.name ? ' · ' + esc(z.name) : ''), fmt(z.x1 - z.x0, 1) + ' × ' + fmt(z.y1 - z.y0, 1) + ' m')).join('') +
      vh.stairs.filter((st) => st.upper === li || st.lower === li).map((st) => li_('vert', st.id, esc(nameOf('v:' + st.id, T_('Innentreppe'))) + ' · ' + T_('Ebene {a} → {b}', { a: st.upper + 1, b: st.lower + 1 }), T_('{n} Stg.', { n: st.nr }))).join('') +
      vh.lifts.filter((v) => li >= v.wallTop && li <= v.levelBot).map((v) => li_('vert', v.id, esc(nameOf('v:' + v.id, T_('Aufzug'))) + ' · ' + (v.src.type === 'personen' ? T_('Personen@@Aufzug') : T_('Lasten@@Aufzug')), v.src.payload + ' kg')).join('') +
      (li === 0 ? g.access.map((a) => li_('access', a.id, esc(nameOf('a:' + a.id, a.kind === 'treppe' ? T_('Treppe') : T_('Notausstieg'))) + (a.kind === 'treppe' ? ' · ' + T_('Treppenabgang') : ''), a.kind === 'treppe' ? T_('{l} m lang', { l: fmt(a.L) }) : T_('{h} m tief', { h: fmt(a.h) }))).join('') : '') + '</ul>';
    h += msgs('grundriss') + stepNav('grundriss');
    return h;
  };

  const DIRS = [[0, N_('Osten (+x)')], [90, N_('Norden (+y)')], [180, N_('Westen (−x)')], [270, N_('Süden (−y)')]];

  function levelsSection() {
    const g = A.q.geo, li = A.lvl(), lv = A.q.lv;
    let h = '<h3>' + T_('Ebenen') + '</h3>';
    h += '<ul class="list">' + g.L.map((L, i) => '<li data-act="setLevel" data-i="' + i + '"' + (i === li ? ' class="sel"' : '') + '><span>' + (i + 1) + ' · ' + esc(i ? L.name : T_('oben, mit Zugang')) + '</span><span>' + fmt(L.H) + ' m · ' + fmt(L.Anet, 1) + ' m² · ' + T_('OK {z}', { z: (lv.levels[i].zFloorTop < 0 ? '−' : '+') + fmt(Math.abs(lv.levels[i].zFloorTop)) }) + '</span></li>').join('') + '</ul>';
    if (li > 0) {
      const pth = 'levels#' + A.p.levels[li - 1].id;
      h += fields(txt(pth + '.name', T_('Name der Ebene {n}', { n: li + 1 })) + num(pth + '.clearHeight', T_('Lichte Höhe'), 'm', { min: 1.8, max: 6 }) + num(pth + '.tSlab', T_('Zwischendecke darüber'), 'cm', { scale: 100, min: 15, max: 150 }));
    } else h += fields(num('build.clearHeight', T_('Lichte Höhe Ebene 1'), 'm', { min: 1.8, max: 6 }));
    h += '<div class="rowbtns"><button class="btn small" data-act="addLevel">' + T_('Ebene darunter anlegen') + '</button>' +
      (li > 0 ? '<button class="btn small ghost" data-act="copyBearing">' + T_('Tragende Wände von oben übernehmen') + '</button><button class="btn small danger" data-act="delLevel">' + T_('Ebene {n} löschen', { n: li + 1 }) + '</button>' : '') + '</div>';
    const nAuto = g.L.reduce((sm, L) => sm + L.columns.filter((c) => c.auto).length, 0);
    h += '<h4>' + T_('Stützen') + '</h4><div class="rowbtns"><button class="btn small" data-act="autoColumns">' + T_('Stützen automatisch setzen') + '</button>' + (nAuto ? '<button class="btn small ghost" data-act="clearAutoColumns">' + T_('{n} automatische entfernen', { n: nAuto }) + '</button>' : '') + '</div>' +
      '<p class="note">' + T_('Setzt in zu weit gespannten Feldern ein Stützenraster und führt Stützen nach unten durch. Bereiche ohne Stützen („Stützenfrei“ im Plan) bleiben frei.') + '</p>';
    if (g.L.length > 1) h += '<p class="note">' + T_('Jede Ebene hat eigene Wände, Türen, Räume und Stützen. Wände der Ebene darüber erscheinen gestrichelt; tragende Wände möglichst übereinander stellen, sonst muss die Zwischendecke die Last abfangen.') + '</p>';
    else h += '<p class="note">' + T_('Eine weitere Ebene liegt unter der jetzigen. Die Baugrube wird entsprechend tiefer, Außenwände und Erddruck werden über alle Ebenen gerechnet.') + '</p>';
    return h;
  }

  function selectionCard() {
    const s = A.sel;
    if (!s) return '';
    const p = A.p, g = A.q.geo;
    const del = '<button class="btn small danger" data-act="delSel">' + T_('Löschen') + '</button>';
    const li = A.LISTS[s.type] ? A.levelOf(s.type, s.id) : -1;
    const lp = li >= 0 ? A.levelPath(li) : 'geom', src = li >= 0 ? A.levelSrc(p, li) : p.geom, L = li >= 0 ? g.L[li] : g.L[0];
    const lvTag = g.L.length > 1 && li >= 0 ? ' <small class="note">' + T_('Ebene {n}', { n: li + 1 }) + '</small>' : '';
    if (s.type === 'wall') {
      const w = src.walls.find((x) => x.id === s.id);
      if (!w) return '';
      const gw = L.walls.find((x) => x.id === s.id);
      const pth = lp + '.walls#' + w.id;
      return '<div class="sel-card"><h4>' + esc(nameOf('w:' + w.id, T_('Innenwand'))) + lvTag + ' ' + del + '</h4>' + fields(
        sel(pth + '.kind', T_('Wandart'), Object.entries(M.WALL_KINDS).map(([k, v]) => [k, T_(v.name)])) +
        num(pth + '.t', T_('Dicke'), 'cm', { scale: 100, min: 5, max: 100 }) +
        num(pth + '.a.x', T_('Anfang x'), 'm') + num(pth + '.a.y', T_('Anfang y'), 'm') + num(pth + '.b.x', T_('Ende x'), 'm') + num(pth + '.b.y', T_('Ende y'), 'm')) +
        '<p class="note">' + T_(w.kind === 'stb' ? 'Länge im Innenraum {l} m, trägt die Platte darüber.' : 'Länge im Innenraum {l} m, nicht tragend.', { l: fmt(gw ? gw.len : 0) }) + '</p></div>';
    }
    if (s.type === 'opening') {
      const o = src.openings.find((x) => x.id === s.id);
      if (!o) return '';
      const pth = lp + '.openings#' + o.id;
      return '<div class="sel-card"><h4>' + esc(nameOf('o:' + o.id, T_('Öffnung'))) + lvTag + ' ' + del + '</h4>' + fields(
        sel(pth + '.kind', T_('Art'), Object.entries(M.OPENING_KINDS).map(([k, v]) => [k, T_(v.name)])) +
        num(pth + '.w', T_('Breite'), 'm', { min: 0.3, max: 6 }) + num(pth + '.h', T_('Höhe'), 'm', { min: 0.3, max: 4 }) +
        num(pth + '.sill', T_('Brüstung'), 'm', { min: 0, max: 3 }) + num(pth + '.pos', T_('Mitte ab Wandanfang'), 'm', { min: 0 })) + '</div>';
    }
    if (s.type === 'column') {
      const c = src.columns.find((x) => x.id === s.id);
      if (!c) return '';
      const pth = lp + '.columns#' + c.id;
      const res = (A.q.struct.columns || []).find((x) => x.id === c.id);
      return '<div class="sel-card"><h4>' + esc(nameOf('c:' + c.id, T_('Stütze'))) + lvTag + ' ' + del + '</h4>' + fields(
        num(pth + '.bx', T_('Breite x'), 'cm', { scale: 100, min: 20, max: 150 }) + num(pth + '.by', T_('Breite y'), 'cm', { scale: 100, min: 20, max: 150 }) +
        num(pth + '.x', T_('Mitte x'), 'm') + num(pth + '.y', T_('Mitte y'), 'm')) +
        (res ? table(columnRows(res)) : '<p class="note">' + T_('Trägt die Platte über dieser Ebene.') + '</p>') + '</div>';
    }
    if (s.type === 'beam') {
      const bu = (src.beams || []).find((x) => x.id === s.id);
      if (!bu) return '';
      const pth = lp + '.beams#' + bu.id, res = (A.q.struct.beams || []).find((x) => x.id === bu.id);
      return '<div class="sel-card"><h4>' + esc(nameOf('b:' + bu.id, T_('Unterzug'))) + lvTag + ' ' + del + '</h4>' + fields(
        num(pth + '.bw', T_('Breite'), 'cm', { scale: 100, min: 20, max: 150 }) + num(pth + '.hb', T_('Höhe unter der Platte'), 'cm', { scale: 100, min: 15, max: 200 }) +
        num(pth + '.a.x', T_('Anfang x'), 'm') + num(pth + '.a.y', T_('Anfang y'), 'm') + num(pth + '.b.x', T_('Ende x'), 'm') + num(pth + '.b.y', T_('Ende y'), 'm')) +
        (res ? table(beamRows(res)) : '') + '</div>';
    }
    if (s.type === 'zone') {
      const z = (src.zones || []).find((x) => x.id === s.id);
      if (!z) return '';
      const pth = lp + '.zones#' + z.id;
      return '<div class="sel-card"><h4>' + T_('Bereich ohne Stützen') + lvTag + ' ' + del + '</h4>' + fields(txt(pth + '.name', T_('Bezeichnung'), { placeholder: T_('z. B. Fahrweg, Lager') }) +
        num(pth + '.x0', T_('von x'), 'm') + num(pth + '.x1', T_('bis x'), 'm') + num(pth + '.y0', T_('von y'), 'm') + num(pth + '.y1', T_('bis y'), 'm')) +
        '<p class="note">' + T_('„Stützen automatisch“ setzt hier keine Stützen. Von Hand gesetzte Stützen in diesem Bereich werden gemeldet.') + '</p></div>';
    }
    if (s.type === 'vert') {
      const v = (p.geom.verts || []).find((x) => x.id === s.id);
      if (!v) return '';
      const pth = 'geom.verts#' + v.id, nL = g.L.length;
      if (v.kind === 'treppe') {
        const st = g.vert.stairs.find((x) => x.id === v.id);
        return '<div class="sel-card"><h4>' + esc(nameOf('v:' + v.id, T_('Innentreppe'))) + ' ' + del + '</h4>' + fields(
          sel(pth + '.upper', T_('Verbindet'), Array.from({ length: Math.max(1, nL - 1) }, (_, i) => [i, T_('Ebene {a} → Ebene {b}', { a: i + 1, b: i + 2 })]), { numeric: true }) +
          sel(pth + '.dir', T_('Laufrichtung nach unten'), DIRS.map(([d, t]) => [d, T_(t)]), { numeric: true }) +
          num(pth + '.w', T_('Laufbreite'), 'm', { min: 0.8, max: 3 }) + num(pth + '.landing', T_('Podeste oben und unten'), 'm', { min: 0.8, max: 3 }) +
          num(pth + '.x', T_('Austritt Mitte x'), 'm') + num(pth + '.y', T_('Austritt Mitte y'), 'm')) +
          (st ? table([row(T_('Steigungen'), st.nr + ' × ' + fmt(st.rise * 100, 1) + ' cm'), row(T_('Auftritt'), fmt(st.tread * 100, 1) + ' cm (2s + a = ' + fmt((2 * st.rise + st.tread) * 100, 1) + ' cm)'),
            row(T_('Lauflänge im Grundriss'), T_('{run} m + Podeste {l} m', { run: fmt(st.run), l: fmt(2 * st.landing) })), row(T_('Treppenauge in der Zwischendecke'), fmt(st.sFree + 0.65) + ' × ' + fmt(st.w + 0.1) + ' m'), row(T_('Beton'), fmt(st.V) + ' m³')]) : '<p class="note">' + T_('Treppe braucht eine Ebene darunter.') + '</p>') +
          '<p class="note">' + T_('Steigung aus der Geschosshöhe, Auftritt nach Schrittmaßregel. Das Treppenauge ist so lang, dass über dem Lauf 2,0 m Kopfhöhe bleiben.') + '</p></div>';
      }
      const lift = g.vert.lifts.find((x) => x.id === v.id);
      const lvOpts = Array.from({ length: nL }, (_, i) => [i, T_('Ebene {n}', { n: i + 1 })]);
      return '<div class="sel-card"><h4>' + esc(nameOf('v:' + v.id, T_('Aufzug'))) + ' ' + del + '</h4>' + fields(
        sel(pth + '.type', T_('Art'), [['lasten', T_('Lastenaufzug')], ['personen', T_('Personenaufzug')]]) + num(pth + '.payload', T_('Nennlast'), 'kg', { min: 225, max: 10000, step: 1 }) +
        num(pth + '.w', T_('Kabine Breite'), 'm', { min: 0.8, max: 5 }) + num(pth + '.d', T_('Kabine Tiefe'), 'm', { min: 0.8, max: 8 }) + num(pth + '.door', T_('Türbreite'), 'm', { min: 0.7, max: 4 }) +
        sel(pth + '.drive', T_('Antrieb'), [['seil', T_('Seil, Treibscheibe')], ['hydraulik', T_('Hydraulik')]]) + num(pth + '.speed', T_('Geschwindigkeit'), 'm/s', { min: 0.15, max: 2.5 }) +
        sel(pth + '.top', T_('Oberste Haltestelle'), [[-1, T_('Gelände (Schachtkopf außen)')]].concat(lvOpts), { numeric: true }) + sel(pth + '.bottom', T_('Unterste Haltestelle'), lvOpts, { numeric: true }) +
        sel(pth + '.dir', T_('Tür zeigt nach'), DIRS.map(([d, t]) => [d, T_(t)]), { numeric: true }) + num(pth + '.tw', T_('Schachtwand'), 'cm', { scale: 100, min: 15, max: 60 }) +
        num(pth + '.x', T_('Mitte x'), 'm') + num(pth + '.y', T_('Mitte y'), 'm')) +
        (lift ? table(liftRows(lift)) : '<p class="note">' + T_('Unterste Haltestelle muss unter der obersten liegen.') + '</p>') + '</div>';
    }
    if (s.type === 'access') {
      const a = p.geom.access.find((x) => x.id === s.id);
      const ga = g.access.find((x) => x.id === s.id);
      if (!a || !ga) return '';
      const pth = 'geom.access#' + a.id;
      if (a.kind === 'treppe') {
        return '<div class="sel-card"><h4>' + esc(nameOf('a:' + a.id, T_('Treppe'))) + ' ' + del + '</h4>' + fields(
          num(pth + '.width', T_('Laufbreite'), 'm', { min: 0.6, max: 3 }) + num(pth + '.landing', T_('Podest vor der Tür'), 'm', { min: 0.8, max: 4 }) +
          num(pth + '.tw', T_('Wanddicke'), 'cm', { scale: 100, min: 15, max: 60 }) +
          sel(pth + '.cover', T_('Abdeckung'), [['klappe', T_('Stahlklappe')], ['offen', T_('Offen mit Geländer')]]) +
          num(pth + '.pos', T_('Mitte ab Ecke'), 'm', { min: 0 })) +
          table([row(T_('Steigungen'), ga.nr + ' × ' + fmt(ga.rise * 100, 1) + ' cm'), row(T_('Auftritt'), fmt(ga.tread * 100, 1) + ' cm'), row(T_('Lauflänge + Podest'), fmt(ga.run) + ' + ' + fmt(ga.landing) + ' m'), row(T_('Beton'), fmt(ga.V) + ' m³')]) +
          '<p class="note">' + T_('Steigung aus der Tiefe, Auftritt nach Schrittmaßregel 2s + a = 63 cm.') + '</p></div>';
      }
      return '<div class="sel-card"><h4>' + esc(nameOf('a:' + a.id, T_('Notausstieg'))) + ' ' + del + '</h4>' + fields(
        num(pth + '.width', T_('Schacht lichte Breite'), 'm', { min: 0.6, max: 2 }) + num(pth + '.depth', T_('Schacht lichte Tiefe'), 'm', { min: 0.6, max: 2 }) +
        num(pth + '.lw', T_('Luke Breite'), 'm', { min: 0.4, max: 1.5 }) + num(pth + '.lh', T_('Luke Höhe'), 'm', { min: 0.4, max: 2 }) +
        num(pth + '.tw', T_('Wanddicke'), 'cm', { scale: 100, min: 15, max: 60 }) + num(pth + '.pos', T_('Mitte ab Ecke'), 'm', { min: 0 })) +
        table([row(T_('Schachthöhe'), fmt(ga.h) + ' m'), row(T_('Steigeisen'), T_('{n} Stk', { n: ga.rungs })), row(T_('Beton'), fmt(ga.V) + ' m³')]) + '</div>';
    }
    if (s.type === 'room') {
      const r = src.rooms.find((x) => x.id === s.id);
      if (!r) return '';
      const gr = L.rooms.find((x) => x.id === s.id);
      return '<div class="sel-card"><h4>' + T_('Raum') + lvTag + ' ' + del + '</h4>' + fields(txt(lp + '.rooms#' + r.id + '.name', T_('Name'))) +
        (gr ? table([row(T_('Fläche'), fmt(gr.area) + ' m²'), row(T_('Volumen'), fmt(gr.volume, 1) + ' m³')]) : '') + '</div>';
    }
    if (s.type === 'edge') {
      const a = g.out[s.index], b = g.out[(s.index + 1) % g.n];
      if (!a) return '';
      return '<div class="sel-card"><h4>' + T_('Außenkante {n}', { n: s.index + 1 }) + '</h4>' + table([row(T_('Länge außen'), fmt(G.dist(a, b)) + ' m'), row(T_('Länge innen'), g.valid ? fmt(G.dist(g.inner[s.index], g.inner[(s.index + 1) % g.n])) + ' m' : '–')]) +
        '<p class="note">' + T_('Kante im Plan ziehen, um den Bunker zu vergrößern. Anliegende Innenwände aller Ebenen wachsen mit.') + '</p></div>';
    }
    return '';
  }
  /* Ergebniszeilen Stütze und Aufzug (ausführlich in „Tragwerk“ bzw. „Technik“) */
  function columnRows(c) {
    const d = c.design, rows = [row(T_('Normalkraft NEd'), fmt(c.nEd, 0) + ' kN' + (c.fromFE ? '' : ' <span class="note">' + T_('(Einzugsfläche)') + '</span>')),
      row(T_('Knicklänge, Schlankheit'), fmt(c.l0) + ' m, λ = ' + fmt(d.lam, 0) + (d.second ? ' > λlim = ' + fmt(d.lamLim, 0) + ' ' + T_('(Theorie II. Ordnung)') : ' ≤ λlim = ' + fmt(d.lamLim, 0))),
      row(T_('Längsbewehrung'), d.nb + ' Ø' + d.phi + ' = ' + fmt(d.As, 1) + ' cm²'), row(T_('Bügel'), T_('Ø{phi}/{s}, an den Enden /{se} cm', { phi: d.stirrup.phi, s: fmt(d.stirrup.s * 100, 0), se: fmt(d.stirrup.sEnd * 100, 0) })),
      row(T_('Ausnutzung Stütze'), fmt(d.eta))];
    const pr = (pu, nm) => (pu ? row(T_('Durchstanzen {where}', { where: nm }), fmt(pu.vEd, 2) + ' / ' + fmt(pu.vRdc, 2) + ' MPa' + (pu.fail ? ' <b style="color:var(--err)">' + T_('nicht nachweisbar') + '</b>' : pu.needs ? ' – ' + T_('{n} Bügelreihen', { n: pu.links.rows }) : ' – ' + T_('ohne Bewehrung'))) : '');
    return rows.concat([pr(c.punch, T_('oben')), pr(c.punchBelow, T_('unten'))].filter(Boolean));
  }
  function beamRows(bd) {
    if (bd.unsupported) return [row(T_('Auflager'), T_('<b style="color:var(--err)">fehlen</b> – Enden auf Wand, Stütze oder Außenwand legen'))];
    const sh = bd.shear, st = sh.stirrups;
    return [row(T_('Auflager'), bd.sups.map((x) => ({ aussen: T_('Außenwand'), wand: T_('Wand'), stuetze: T_('Stütze') }[x.kind]) + ' ' + fmt(x.s, 2)).join(', ') + ' m'),
      row(T_('Lasten gₖ / qₖ'), fmt(bd.gk, 1) + ' / ' + fmt(bd.qk, 1) + ' kN/m <span class="note">' + T_('(× {f} Ungleichverteilung)', { f: fmt(bd.peak, 2) }) + '</span>'),
      row(T_('Moment Feld / Stütze'), fmt(bd.mF, 0) + ' / ' + fmt(bd.mS, 0) + ' kNm'),
      row(T_('Bewehrung unten / oben'), bd.field.n + ' Ø' + bd.field.phi + ' / ' + bd.support.n + ' Ø' + bd.support.phi),
      row(T_('Querkraft VEd / VRd,max'), fmt(sh.vEd, 0) + ' / ' + fmt(sh.vRdMax, 0) + ' kN'),
      row(T_('Bügel'), st ? T_('Ø{phi}/{s} zweischnittig (erf. {a} cm²/m)', { phi: st.phi, s: fmt(st.s * 100, 1), a: fmt(sh.aswReq, 1) }) : T_('nicht verlegbar')),
      row(T_('Schlankheit l/d'), fmt(bd.defl.ld, 1) + ' ≤ ' + fmt(bd.defl.lim, 1)), row(T_('Ausnutzung'), fmt(bd.eta))];
  }
  function liftRows(v) {
    const d = v.design, rows = [row(T_('Haltestellen'), v.toSurface ? T_('Gelände bis Ebene {b}', { b: v.levelBot + 1 }) : T_('Ebene {a} bis {b}', { a: v.levelTop + 1, b: v.levelBot + 1 })), row(T_('Schacht innen'), T_('{w} × {d} m, Wand {t} cm', { w: fmt(v.wIn), d: fmt(v.dIn), t: fmt(v.t * 100, 0) }))];
    if (!d) return rows;
    return rows.concat([
      row(T_('Kabine'), T_('{a} m², höchstens {max} m² für {q} kg', { a: fmt(d.area), max: fmt(d.aMax), q: d.Q }) + (d.areaOk ? '' : ' <b style="color:var(--err)">' + T_('zu groß') + '</b>') + (v.src.type === 'personen' ? ', ' + T_('{n} Personen', { n: d.persons }) : '')),
      row(T_('Förderhöhe, Fahrzeit'), T_('{h} m, etwa {t} s', { h: fmt(d.travel), t: fmt(d.tTrip, 0) })),
      row(T_('Schachtgrube / Schachtkopf'), fmt(d.pit) + ' / ' + fmt(d.head) + ' m' + (v.roofBox ? ' <span class="note">' + T_('(Kasten über der Decke)') + '</span>' : v.headOver > 0 && !v.toSurface ? ' <span class="note">' + T_('(reicht in Ebene {n})', { n: v.wallTop + 1 }) + '</span>' : '')),
      row(T_('Antrieb'), (d.rope ? T_('Seil, Gegengewicht') : T_('Hydraulik')) + ', ' + T_('{p} kW, Anlauf {s} kVA', { p: fmt(d.P, 1), s: fmt(d.kVAstart, 0) })),
      row(T_('Lasten Grube'), T_('Puffer Kabine {b} kN', { b: fmt(d.buffer, 0) }) + (d.rope ? ', ' + T_('Gegengewicht {b} kN', { b: fmt(d.cwBuffer, 0) }) : ', ' + T_('Zylinder {b} kN', { b: fmt(d.piston, 0) }))),
    ]);
  }

  STEP.konstruktion = function () {
    const q = A.q, lv = q.lv, b = A.p.build, e = q.earth;
    let h = '<h2>' + T_('Konstruktion') + '</h2><p class="lead">' + T_('Dicken, Beton, Abdichtung und Baugrube. Änderungen wirken sofort auf Statik, Mengen und Kosten.') + '</p>';
    h += '<h3>' + T_('Bauteildicken') + '</h3>' + fields(
      num('build.tWall', T_('Außenwand'), 'cm', { scale: 100, min: 15, max: 150 }) + num('build.tRoof', T_('Decke'), 'cm', { scale: 100, min: 15, max: 200 }) +
      num('build.tFloor', T_('Bodenplatte'), 'cm', { scale: 100, min: 15, max: 200 }) + num('build.clearHeight', q.geo.L.length > 1 ? T_('Lichte Höhe Ebene 1') : T_('Lichte Raumhöhe'), 'm', { min: 1.8, max: 6 }) +
      num('build.overhang', T_('Sporn Bodenplatte'), 'cm', { scale: 100, min: 0, max: 200, hint: T_('Überstand außen, hilft gegen Auftrieb') }));
    h += '<h3>' + T_('Beton & Bewehrung') + '</h3>' + fields(
      sel('build.concrete', T_('Betonfestigkeit'), Object.keys(M.CONCRETE).map((k) => [k, np().code === 'ACI' ? T_('{c} · f′c = {f} MPa ({psi} psi)', { c: k, f: M.CONCRETE[k].fck, psi: Math.round(M.CONCRETE[k].fck * 145.038 / 50) * 50 }) : k])) +
      sel('build.dmax', T_('Größtkorn'), [[32, '32 mm'], [16, '16 mm']], { numeric: true }) +
      num('build.cnom', T_('Betondeckung'), 'mm', { scale: 1000, min: 20, max: 80 }) +
      sel('build.wk', T_('Rissbreite (WU)'), [[0.15, I18.num(0.15, 2) + ' mm'], [0.2, I18.num(0.2, 2) + ' mm'], [0.3, I18.num(0.3, 2) + ' mm']], { numeric: true }) +
      sel('build.restraint', T_('Zwang aus Hydratation und Schwinden'), [['riss', T_('mit Bewehrung begrenzen')], ['massnahmen', T_('über Fugen und Betontechnik (Fachplaner)')]]) +
      sel('build.fireClass', T_('Feuerwiderstand tragender Bauteile'), [['R90', T_('R 90 (feuerbeständig)')], ['R120', 'R 120'], ['R60', T_('R 60 (hochfeuerhemmend)')], ['R30', T_('R 30 (feuerhemmend)')], ['keine', T_('ohne Anforderung')]]) +
      (b.restraint !== 'massnahmen' ? sel('build.fctEff', T_('Zeitpunkt der Zwangrisse'), [['halb', T_('früh, 0,5 fctm (Abfließen der Hydratationswärme)')], ['voll', T_('spät, fctm ≥ 3 MPa')]]) : ''));
    h += '<h3>' + T_('Abdichtung') + '</h3>' + fields(sel('build.waterproofing', T_('System'), Object.entries(M.WATERPROOFING).map(([k, v]) => [k, T_(v.name)])) + chk('build.drainage', T_('Dränage um den Bunker (nur ohne drückendes Wasser)')));
    h += BP.planning.moistureHTML(A.p, q);
    h += radonSection(q);
    h += '<h3>' + T_('Dämmung') + '</h3>' + fields(num('build.insulation.walls', T_('Wände außen'), 'cm', { scale: 100, min: 0, max: 40, hint: T_('0 = keine') }) + num('build.insulation.roof', T_('Auf der Decke'), 'cm', { scale: 100, min: 0, max: 40 }) + num('build.insulation.floor', T_('Unter der Bodenplatte'), 'cm', { scale: 100, min: 0, max: 40 }));
    h += '<h3>' + T_('Sohlaufbau') + '</h3>' + fields(num('build.gravel', T_('Schotterschicht'), 'cm', { scale: 100, min: 0, max: 100 }) + num('build.blinding', T_('Sauberkeitsschicht'), 'cm', { scale: 100, min: 0, max: 20 }));
    h += '<h3>' + T_('Baugrube') + '</h3>' + fields(seg('build.excavation.mode', [['boeschung', T_('Geböscht')], ['verbau', T_('Mit Verbau')]]) +
      (b.excavation.mode === 'boeschung' ? num('build.excavation.angle', T_('Böschungswinkel'), '°', { min: 20, max: 80, nullable: true, placeholder: T_('auto {a}°', { a: q.earth.rule ? q.earth.rule.angle : q.soil.slope }), hint: T_('leer: {rule} nach Bodenart', { rule: q.earth.rule ? q.earth.rule.ref : 'DIN 4124' }) }) : '') +
      num('build.excavation.workspace', T_('Arbeitsraum'), 'm', { min: 0.5, max: 3, hint: T_('ab Außenkante Wand') }) +
      num('build.excavation.topsoil', T_('Oberboden'), 'cm', { scale: 100, min: 0, max: 80 }) +
      num('build.excavation.loose', T_('Auflockerungsfaktor'), '', { min: 1, max: 1.6 }) +
      sel('build.excavation.backfill', T_('Verfüllung'), [['aushub', T_('mit Aushub')], ['kies', T_('mit Kies (Fremdmaterial)')]]));
    const gN = A.p.site.groundNHN, hasN = typeof gN === 'number' && isFinite(gN);
    const zr = (k, z) => row(k, (z > 0.0005 ? '+' : z < -0.0005 ? '−' : '±') + fmt(Math.abs(z)) + ' m' + (hasN ? ' <span class="note">(' + fmt(gN + z) + ' m NHN)</span>' : ''));
    const multi = lv.levels.length > 1;
    if (multi) h += '<p class="note">' + T_('Lichte Höhen und Zwischendecken der unteren Ebenen im Schritt Grundriss unter „Ebenen“.') + '</p>';
    h += '<h3>' + T_('Höhen bezogen auf das Gelände') + '</h3>' + table((lv.mound.on ? [zr(T_('Oberkante Erdhügel'), lv.hM)] : []).concat([zr(T_('Gelände'), 0),
      zr(T_('Oberkante Decke'), lv.zRoofTop), zr(T_('Unterkante Decke'), lv.zCeil)],
      multi ? lv.levels.flatMap((L) => (L.idx ? [zr(T_('Oberkante Zwischendecke über Ebene {n}', { n: L.idx + 1 }), L.zSlabTop), zr(T_('Unterkante Zwischendecke'), L.zCeil)] : []).concat([zr(T_('Oberkante Rohboden Ebene {n}', { n: L.idx + 1 }), L.zFloorTop)])) : [zr(T_('Oberkante Rohboden'), lv.zFloorTop)],
      [zr(T_('Unterkante Bodenplatte'), lv.zSlabBot), zr(T_('Baugrubensohle'), lv.zPit)]));
    h += '<h3>' + T_('Erdmassen') + '</h3>' + table([
      row(T_('Tiefe'), fmt(e.depth) + ' m'), row(T_('Sohle'), fmt(e.Ab, 1) + ' m²'), row(T_('Oberkante'), fmt(e.Atop, 1) + ' m²'),
      row(T_('Aushub'), fmt(e.Vexc, 1) + ' m³'), row(T_('Wiederverfüllung'), fmt(e.Vback, 1) + ' m³')].concat(e.Vmound > 0 ? [row(T_('Erdhügel'), fmt(e.Vmound, 1) + ' m³'), row(T_('davon aus Aushub'), fmt(e.moundFromSite, 1) + ' m³'), row(T_('Bodenlieferung'), fmt(e.Vimport, 1) + ' m³')] : [], [row(T_('Abfuhr'), T_('{v} m³ lose ({n} LKW)', { v: fmt(e.Vloose, 1), n: e.trucks }))]));
    h += msgs('konstruktion') + stepNav('konstruktion');
    return h;
  };

  function layerTable(layers) {
    return '<table class="res cols"><thead><tr><th>' + T_('Lage') + '</th><th>' + T_('gewählt') + '</th><th>' + T_('erf.') + '</th><th>' + T_('vorh.') + '</th></tr></thead>' +
      layers.map((l) => '<tr><td class="l">' + esc(BP.calc.labelText(l.label)) + '<br><span class="note">' + esc(l.governs) + (l.m ? ', m = ' + fmt(l.m, 1) + ' kNm/m' : '') +
        (Number.isFinite(l.wkLoad) ? ', w = ' + fmt(l.wkLoad, 2) + ' mm' : '') + '</span></td><td>Ø' + l.phi + '/' + fmt(l.s * 100, 1) + '</td><td>' + (isFinite(l.req) ? fmt(l.req) : '–') + '</td><td>' + fmt(l.prov) + '</td></tr>').join('') +
      '</table><p class="note">' + T_('Bewehrung in cm²/m. w = rechnerische Rissbreite unter quasi-ständiger Last ({ref}).', { ref: np().code === 'EC' ? np().ref.crack : 'EN 1992-1-1 7.3.4' }) + '</p>';
  }

  /* FE-Platten: Kennwerte, Zulagen, Vergleich mit dem Tafelverfahren */
  function feRows(r) {
    const m = r.moments, sh = r.shear, rows = [];
    rows.push(row(T_('Biegemoment Zug unten x / y'), fmt(m.mFx, 1) + ' / ' + fmt(m.mFy, 1) + ' kNm/m'));
    rows.push(row(T_('Biegemoment Zug oben x / y'), fmt(m.mSx, 1) + ' / ' + fmt(m.mSy, 1) + ' kNm/m'));
    rows.push(row(T_('Rahmenecke an den Außenwänden'), fmt(m.mJ, 1) + ' kNm/m'));
    rows.push(row(T_('Querkraft vEd / vRd,c'), fmt(sh.vEd, 0) + ' / ' + fmt(sh.vRd, 0) + ' kN/m' + (sh.at ? ' <span class="note">' + T_('(bei x = {x}, y = {y} m)', { x: fmt(sh.at.x, 1), y: fmt(sh.at.y, 1) }) + '</span>' : '')));
    if (sh.links) rows.push(row(T_('Querkraftbewehrung'), T_(sh.links.zones.length === 1 ? '{n} Bereich' : '{n} Bereiche', { n: sh.links.zones.length }) + ', ' + T_('bis {a} cm²/m²', { a: fmt(Math.max(...sh.links.zones.map((z) => z.asw)), 1) }) + (sh.links.ok ? '' : ' <b style="color:var(--err)">' + T_('reicht nicht') + '</b>')));
    if (r.wkMax > 0) rows.push(row(T_('Größte Rissbreite Grundbewehrung'), fmt(r.wkMax, 2) + ' mm'));
    rows.push(row(T_('Netz'), T_('{n} Knoten, Rechenzeit {t} s', { n: r.fe.mesh.nNodes.toLocaleString(I18.locale()), t: fmt(r.fe.ms / 1000, 1) })));
    return rows;
  }
  function deflRow(r) {
    const d = r.defl;
    if (d.method === 'FE') return row(T_('Durchbiegung Langzeit (gerissen, φ = {phi})', { phi: fmt(d.phi, 1) }), fmt(d.w * 1000, 0) + ' mm ≤ l/250 = ' + fmt(d.lim * 1000, 0) + ' mm <span class="note">' + T_('(elastisch {w} mm)', { w: fmt(d.wEl * 1000, 1) }) + '</span>');
    return row(T_('Schlankheit l/d'), fmt(d.ld, 1) + ' ≤ ' + fmt(d.lim, 1));
  }
  function feButton(slab) {
    return '<div class="rowbtns"><button class="btn small" data-act="feShow" data-slab="' + slab + '" data-qty="mx">' + T_('Biegemomente im Grundriss') + '</button><button class="btn small ghost" data-act="feShow" data-slab="' + slab + '" data-qty="' + (slab === 'floor' ? 'p' : 'v') + '">' + (slab === 'floor' ? T_('Bodenpressung') : T_('Querkraft')) + '</button><button class="btn small ghost" data-act="feShow" data-slab="' + slab + '" data-qty="atx">' + T_('Bewehrung') + '</button></div>';
  }
  function zulTable(r) {
    const z = r.zulagen || [];
    if (!z.length) return '<p class="note">' + T_('Keine Zulagen nötig: die Grundbewehrung deckt Biegung, Rissbreite und Querkraft überall ab.') + '</p>';
    return '<table class="res cols"><thead><tr><th>' + T_('Zulage') + '</th><th>Ø/s</th><th>' + T_('Bereich x / y [m]') + '</th></tr></thead>' +
      z.map((zz, i) => '<tr><td class="l">Z' + (i + 1) + ' ' + esc(T_(zz.face)) + ', ' + T_('Richtung {d}', { d: zz.dir }) + '<br><span class="note">' + esc(zz.governs) + ', ' + T_('m bis {m} kNm/m', { m: fmt(zz.mMax, 1) }) + '</span></td><td>Ø' + zz.phi + '/' + fmt(zz.s * 100, 1) + '</td><td>' + fmt(zz.x0, 2) + '–' + fmt(zz.x1, 2) + '<br>' + fmt(zz.y0, 2) + '–' + fmt(zz.y1, 2) + '</td></tr>').join('') +
      '</table><p class="note">' + T_('Zulagen liegen zusätzlich zur Grundbewehrung derselben Lage; Bereich einschließlich Verankerung.') + '</p>';
  }
  function tableCompare(r) {
    const t = r.table;
    if (!t) return '';
    return '<details class="cmp"><summary class="note">' + T_('Kontrolle mit dem Tafelverfahren') + '</summary>' + table([
      row(T_('Feldmoment (gelenkig, Hüllwert)'), fmt(t.moments.mF, 1) + ' kNm/m'), row(T_('Stützmoment Innenwand (Pieper/Martens)'), fmt(t.moments.mSin, 1) + ' kNm/m'),
      row(T_('Randmoment Außenwand'), fmt(t.moments.mSout, 1) + ' kNm/m'), row(T_('Querkraft vEd'), fmt(t.shear.vEd, 0) + ' kN/m'), row(T_('Ausnutzung Tafelverfahren'), fmt(t.etaS))]) +
      '<p class="note">' + T_('Das Tafelverfahren rechnet jedes Feld für sich mit Hüllwerten und liegt meist deutlich auf der sicheren Seite. Bemessen wird mit der FE-Rechnung.') + '</p></details>';
  }

  // Stützmomente getrennt nach Innenwand (Durchlaufplatte) und Außenwand (Rahmenecke), Querkraft mit maßgebendem Rand
  function plateRows(r) {
    const m = r.moments, rows = [];
    const xy = (a, b) => (a > 0 ? fmt(a, 1) : '–') + ' / ' + (b > 0 ? fmt(b, 1) : '–') + ' kNm/m';
    rows.push(row(T_('Feldmoment x / y'), xy(m.mFx, m.mFy)));
    if (m.mSin > 0) rows.push(row(T_('Stützmoment an Innenwand x / y'), xy(m.mSxIn, m.mSyIn)));
    rows.push(row(T_('Randmoment an Außenwand x / y'), xy(m.mSxOut, m.mSyOut)));
    rows.push(row(T_('Querkraft vEd / vRd,c'), fmt(r.shear.vEd, 0) + ' / ' + fmt(r.shear.vRd, 0) + ' kN/m (' + T_('Lastabtrag in {edge}', { edge: r.shear.edge }) + ')'));
    if (r.wkMax > 0) rows.push(row(T_('Größte Rissbreite unter Dauerlast'), fmt(r.wkMax, 2) + ' mm'));
    if (r.hReq) rows.push(row(T_('Rechnerisch nötige Dicke'), isFinite(r.hReq) ? fmt(r.hReq * 100, 0) + ' cm' : T_('über 150 cm – Spannweite verkürzen')));
    return rows;
  }

  /* Weitere Nachweise: Baugrund, Böschungen, Feuerwiderstand, Treppen, Aufzugsgruben */
  function moreSection(q) {
    const vf = q.verify, g = q.geo;
    if (!vf) return '';
    const pct = (e) => Math.round(e * 100) + ' %';
    const verdict = (e) => e > 1 ? T_('Nicht erfüllt ({p}).', { p: pct(e) }) : e > 0.9 ? T_('Knapp erfüllt ({p}).', { p: pct(e) }) : T_('Erfüllt mit {p} Auslastung.', { p: pct(e) });
    const plain = (t) => '<p class="plain">' + t + '</p>';
    let h = '';
    const gb = vf.gb;
    const NP = np();
    if (gb) h += utilRow(T_('Grundbruch'), T_('{ref}, ganze Sohle', { ref: NP.ref.gb }), gb.eta,
      plain(T_(gb.approach === 'ASD' ? 'Ersatzfläche {b} × {a} m, {d} m eingebunden. Der Boden könnte {r} kN tragen (Sicherheit {rv}), die Gebrauchslast abzüglich Auftrieb ist {v} kN.' : 'Ersatzfläche {b} × {a} m, {d} m eingebunden. Der Boden könnte {r} kN tragen (mit γR,v = {rv}), die Bemessungslast abzüglich Auftrieb ist {v} kN.', { b: fmt(gb.b), a: fmt(gb.a), d: fmt(gb.d), r: fmt(gb.Rnd, 0), v: fmt(gb.Vd, 0), rv: fmt(gb.Rnk / Math.max(gb.Rnd, 1e-9), 1) }) + ' ' + verdict(gb.eta)) +
      table([row(T_('Tragfähigkeitsbeiwerte Nd / Nb / Nc'), fmt(gb.Nd, 1) + ' / ' + fmt(gb.Nb, 1) + ' / ' + fmt(gb.Nc, 1)), row(T_('Formbeiwerte νd / νb / νc'), fmt(gb.nd) + ' / ' + fmt(gb.nb) + ' / ' + fmt(gb.nc)),
        row(T_('Wichte über / unter der Sohle'), fmt(gb.gamma1, 1) + ' / ' + fmt(gb.gamma2, 1) + ' kN/m³'), row(T_('Widerstand Rn,k / Rn,d'), fmt(gb.Rnk, 0) + ' / ' + fmt(gb.Rnd, 0) + ' kN'), row(T_('Sohldruck σE,d / σR,d'), fmt(gb.sigEd, 0) + ' / ' + fmt(gb.sigRd, 0) + ' kN/m²')]));
    const se = vf.set;
    if (se) h += utilRow(T_('Setzung'), T_('{ref}, Kennpunkt', { ref: NP.ref.set }), se.s / se.limit,
      plain((se.add > 0 ? T_('Der Bunker belastet den Boden um {p} kN/m² mehr, als der Aushub entlastet.', { p: fmt(se.add, 0) }) : T_('Der Bunker ist leichter als der ausgehobene Boden – der Boden wird nur wiederbelastet (Steifemodul ×3).')) +
        ' ' + T_('Rechnerische Setzung rund {s} mm (Richtwert 30 mm).', { s: fmt(se.s * 1000, 0) })) +
      table([row(T_('Sohlspannung quasi-ständig'), fmt(se.sigma, 0) + ' kN/m²'), row(T_('Aushubentlastung'), fmt(se.sig0, 0) + ' kN/m²'), row(T_('Grenztiefe unter der Sohle'), fmt(se.ts, 1) + ' m'),
        row(T_('Setzung Kennpunkt / Mitte / Ecke'), fmt(se.s * 1000, 1) + ' / ' + fmt(se.sCenter * 1000, 1) + ' / ' + fmt(se.sCorner * 1000, 1) + ' mm'), row(T_('Verkantung (biegeweich, obere Grenze)'), '1 : ' + (se.tilt > 1e-7 ? fmt(1 / se.tilt, 0) : '∞'))]));
    const mo = vf.mound;
    if (mo) h += utilRow(T_('Böschung Erdhügel'), T_('1 : {n}, Gleitkreis', { n: fmt(mo.n, 1) }), mo.mu,
      plain(T_('Gleitkreise nach Bishop durch Hügel und Untergrund, Teilsicherheiten {ref} (tan φ / {a}, c / {b}, Auflast ×{c}). Schüttung: {fill}. Kein Kreis darf durch das Bauwerk laufen.', { ref: NP.ref.geo, a: dT(NP.geo.sl[0]), b: dT(NP.geo.sl[1]), c: dT(NP.geo.sl[2]), fill: esc(mo.fill.name) }) + ' ' + verdict(mo.mu) + (mo.ok ? '' : isFinite(mo.nMin) ? ' ' + T_('Mindestens 1 : {n} nötig.', { n: fmt(mo.nMin, 2) }) : '')) +
      table([row(T_('Höhe / Neigung'), fmt(mo.h) + ' m / 1 : ' + fmt(mo.n, 1)), row(T_('Auflast auf der Krone'), fmt(mo.q, 1) + ' kN/m²'), row(T_('Ungünstigster Kreis (ab Böschungsfuß)'), 'x = ' + fmt(mo.xc, 1) + ' m, y = ' + fmt(mo.yc, 1) + ' m, r = ' + fmt(mo.r, 1) + ' m'), row(T_('Sicherheit F (Bemessungswerte)'), fmt(mo.F))]));
    const ex = vf.exc;
    if (ex && !ex.din4124) h += utilRow(T_('Baugrubenböschung'), T_('{a}°, {d} m tief', { a: fmt(ex.angle, 0), d: fmt(ex.depth) }), ex.mu,
      plain(T_('Tiefer als {dmax} m oder steiler als {s}°: {rule} verlangt einen rechnerischen Nachweis. Gleitkreise nach Bishop, Auflast 10 kN/m² ab 0,6 m vom Rand, Wasser abgesenkt.', { s: fmt(ex.rule.angle, 0), rule: ex.rule.ref, dmax: fmt(ex.rule.dMax, ex.rule.dMax % 1 ? 1 : 0) }) + ' ' + verdict(ex.mu) + (ex.ok ? '' : ex.angleMax ? ' ' + T_('Höchstens {a}° oder Verbau.', { a: ex.angleMax }) : ' ' + T_('Verbau planen.'))) +
      table([row(T_('Sicherheit F (Bemessungswerte)'), fmt(ex.F)), row(T_('Ungünstigster Kreis'), 'r = ' + fmt(ex.r, 1) + ' m')]));
    else if (ex) h += '<p class="note">' + T_('Baugrubenböschung {a}° bei {d} m Tiefe: nach {rule} ohne rechnerischen Nachweis zulässig (bis {dmax} m, {soil} bis {s}°).', { a: fmt(ex.angle, 0), d: fmt(ex.depth), soil: esc(T_(q.soil.name)), s: fmt(ex.rule.angle, 0), rule: ex.rule.ref, dmax: fmt(ex.rule.dMax, ex.rule.dMax % 1 ? 1 : 0) }) + '</p>';
    const fi = vf.fire;
    if (fi && fi.items.length) {
      const eta = Math.max(...fi.items.map((i) => Math.max(i.dimOk ? i.dimMin / i.dim : 1.5, i.aMin != null ? i.aMin / i.a : 1.5)));
      h += utilRow(T_('Feuerwiderstand {cls}', { cls: fi.cls }), T_('{ref}, Tabellen', { ref: NP.ref.fire }), eta,
        plain((fi.cover ? T_('Mindestdicken, Mindestmaße und Betondeckungen nach den Tabellen für {h} h Feuerwiderstand. Brand von innen.', { h: I18.dec(String(fi.hours)) }) : T_('Mindestmaße und Achsabstände der Bewehrung nach dem Tabellenverfahren. Brand von innen: Decken von unten, Außenwände einseitig, Innenwände zweiseitig, Stützen allseitig.')) + ' ' + (fi.ok ? T_('Alle Bauteile erfüllen {cls}.', { cls: fi.cls }) : T_('Nicht alle Bauteile erfüllen {cls} – siehe Meldungen.', { cls: fi.cls }))) +
        '<table class="res cols"><tr><th>' + T_('Bauteil') + '</th><th>' + T_('Maß / nötig') + '</th><th>' + (fi.cover ? T_('c / nötig') : T_('a / nötig')) + '</th></tr>' + fi.items.map((i) => '<tr' + (i.ok ? '' : ' class="bad"') + '><td class="l">' + esc(i.el) + '<br><small>' + esc(i.kind) + '</small></td><td>' + fmt(i.dim, 0) + ' / ' + fmt(i.dimMin, 0) + ' mm</td><td>' + fmt(i.a, 0) + ' / ' + (i.aMin != null ? fmt(i.aMin, 0) : '–') + ' mm</td></tr>').join('') + '</table>');
    }
    for (const s of g.vert.stairs) {
      const d = s.design;
      if (!d || !d.mEd) continue;
      const eta = Math.max(d.ld / d.ldLim, d.vEd / d.vRd, d.asReq / d.asProv);
      h += utilRow(esc(g.labels['v:' + s.id] || T_('Innentreppe')), T_('Laufplatte {t} cm, l = {l}', { t: fmt(d.t * 100, 0), l: fmt(s.span) }), eta,
        plain(T_('Laufplatte als Einfeldplatte vom Deckenrand bis zum Fußboden darunter, Nutzlast {q} kN/m² ({loads}). Dicke so gewählt, dass Biegung, Querkraft ohne Bügel und Biegeschlankheit ({defl}) eingehalten sind.', { q: fmt(s.qT, 1), loads: isDE() ? 'DIN EN 1991-1-1/NA, Kat. T' : NP.ref.loads, defl: NP.ref.defl }) + ' ' + verdict(eta)) +
        table([row(T_('Lasten gk / qk'), T_('{g} / {q} kN/m² (Grundriss)', { g: fmt(d.gk, 1), q: fmt(d.qk, 1) })), row('mEd / vEd', fmt(d.mEd, 1) + ' kNm/m / ' + fmt(d.vEd, 1) + ' kN/m'),
          row(T_('Bewehrung unten'), T_('Ø{phi}/{s} ({a} ≥ {r} cm²/m), quer Ø{p2}/{s2}', { phi: d.phi, s: fmt(d.s * 100, 1), a: fmt(d.asProv, 2), r: fmt(Math.max(d.asReq, d.asMin), 2), p2: d.distr ? d.distr.phi : 8, s2: fmt((d.distr ? d.distr.s : 0.25) * 100, 0) })), row(T_('Schlankheit l/d'), fmt(d.ld, 1) + ' ≤ ' + fmt(d.ldLim, 1)), row(T_('Querkraft vEd / vRd,c'), fmt(d.vEd, 1) + ' / ' + fmt(d.vRd, 1) + ' kN/m')]));
    }
    for (const pt of vf.pits || []) {
      const eta = Math.max(pt.asW / 7.54, pt.asS / 7.54, pt.sig / pt.sigRd);
      h += utilRow(T_('Grube {name}', { name: esc(g.labels['v:' + pt.id] || T_('Aufzug')) }), T_('Wände, Sohle, Pufferlasten'), eta,
        plain(T_('Die Grubenwände halten Erd- und Wasserdruck unter der Bodenplatte, die Grubensohle den Wasserdruck von unten; die Pufferkräfte gehen in den Baugrund.') + ' ' + verdict(eta)) +
        table([row(T_('Erd- und Wasserdruck am Fuß'), fmt(pt.pBot, 1) + ' kN/m²'), row(T_('Wand: Moment / Bewehrung'), fmt(pt.mW, 1) + ' kNm/m / ' + fmt(pt.asW, 2) + ' cm²/m'),
          row(T_('Sohle: Wasserdruck / Bewehrung'), fmt(pt.u, 1) + ' kN/m² / ' + fmt(pt.asS, 2) + ' cm²/m'), row(T_('Sohldruck aus Pufferkräften'), fmt(pt.sig, 0) + ' / ' + fmt(pt.sigRd, 0) + ' kN/m²')]));
    }
    return h;
  }
  function poursSection(q) {
    const po = q.verify && q.verify.pours;
    if (!po) return '';
    const j = po.joints;
    return '<h3>' + T_('Betonierabschnitte und Fugen') + '</h3>' + table(po.sect.map((x) => row(esc(x.el), T_(x.n === 1 ? '{n} Abschnitt' : '{n} Abschnitte', { n: x.n }) + ', ' + fmt(x.V, 1) + ' m³')).concat([
      row(T_('Arbeitsfugen waagerecht'), fmt(j.hor, 1) + ' m'), row(T_('Arbeitsfugen senkrecht (Wände)'), fmt(j.vert, 1) + ' m'), row(T_('Arbeitsfugen in Platten'), fmt(j.slab, 1) + ' m'), row(T_('Anschlüsse Zugänge'), fmt(j.access, 1) + ' m'), row(T_('Summe (Fugenblech bei WU)'), fmt(j.total, 1) + ' m')])) +
      '<p class="note">' + T_('Abschnitte nach WU-Richtlinie: {rule}, höchstens {v} m³ je Betoniertag. Fugen im Schutzbau ohne Bewegungsfugen ausführen.', { rule: A.p.build.restraint === 'massnahmen' ? T_('Zwang über Fugen – Wände bis {w} m, Platten bis {s} m bzw. {a} m²', { w: po.LmaxWall, s: po.LmaxSlab, a: po.AmaxSlab }) : T_('Zwang mit Bewehrung begrenzt – Wände bis {w} m, Platten bis {s} m', { w: po.LmaxWall, s: po.LmaxSlab }), v: po.Vday }) + '</p>';
  }

  STEP.statik = function () {
    const q = A.q, st = q.struct, s = q.steel, mat = st.mat;
    let h = '<h2>' + T_('Tragwerk') + '</h2><p class="lead">' + T_('Die Kernfrage: Halten die gewählten Dicken, und wie viel Stahl steckt drin? Jede Zeile ist ein Bauteil mit einem Balken – je voller, desto stärker ausgelastet.') + '</p>';
    // Klartext-Urteil oben
    const probs = q.checks.filter((c) => c.step === 'statik' && c.level === 'err');
    const eMax = q.summary.etaMax, tragt = probs.length === 0 && eMax <= 1;
    h += '<div class="rowbtns"><button class="btn small" data-act="statik">' + T_('Statische Berechnung drucken / PDF') + '</button><button class="btn small ghost" data-act="vergleich">' + T_('Vergleichspaket (CSV)') + '</button><button class="btn small ghost" data-act="dxf">' + T_('Systemlinien (DXF)') + '</button></div>' +
      '<p class="note">' + T_('Das Vergleichspaket enthält Eingaben, Systeme, Lastfälle, Kombinationen und Ergebnisse je Position – zum Nachrechnen mit einem eigenen Statikprogramm. Die DXF-Datei liefert die Systemlinien dazu.') + '</p>';
    h += '<div class="verdict ' + (tragt ? 'ok' : 'err') + '"><b>' + (tragt ? T_('Der Rohbau trägt.') : T_(probs.length === 1 ? '{n} Nachweis ist nicht erfüllt.' : '{n} Nachweise sind nicht erfüllt.', { n: probs.length })) + '</b>' +
      '<span>' + T_('Höchste Auslastung η = {eta} von 1,0', { eta: fmt(eMax) }) + (tragt ? '.' : ' – ' + T_('das überlastete Bauteil unten dicker machen oder die Spannweite mit einer tragenden Innenwand verkürzen.')) + '</span></div>';
    h += '<p class="note">' + T_('<b>η (Ausnutzung)</b> = Last geteilt durch Tragfähigkeit. Unter 1,0 hält das Bauteil, 0,9–1,0 ist knapp, über 1,0 ist es überlastet.') + '</p>';

    const pct = (e) => Math.round(e * 100) + ' %';
    const verdict = (e) => e > 1 ? T_('Überlastet ({p}).', { p: pct(e) }) : e > 0.9 ? T_('Hält knapp ({p}).', { p: pct(e) }) : T_('Hält mit {p} Auslastung.', { p: pct(e) });
    const plain = (t) => '<p class="plain">' + t + '</p>';

    h += '<h3>' + T_('Bauteile – hält jedes?') + '</h3><div class="util">';
    if (st.fe && st.fe.pending) h += '<p class="note fe-wait">' + T_('Finite-Elemente-Berechnung der Platten läuft … bis dahin vorläufige Werte aus dem Tafelverfahren.') + '</p>';
    if (st.roof) {
      const r = st.roof, f = r.field;
      if (r.method === 'FE') h += utilRow(T_('Decke'), T_('FE-Plattenberechnung'), r.etaS, plain(T_('Die ganze Decke ist mit {n} Knoten als Platte gerechnet: tragende Innenwände und Stützen als Lager, Außenwände als Rahmen mit Erddruck. Last {p} kN/m² aus Erde, Verkehr und Eigengewicht, Verkehr auch feldweise.', { n: r.fe.mesh.nNodes.toLocaleString(I18.locale()), p: fmt(r.pEd, 1) }) + ' ' + verdict(r.etaS)) +
        table([row(T_('Bemessungslast'), fmt(r.pEd, 1) + ' kN/m²')].concat(feRows(r), [deflRow(r)])) + feButton('roof') + layerTable(r.layers) + zulTable(r) + tableCompare(r), true);
      else h += utilRow(T_('Decke'), T_('spannt {x} × {y} m', { x: fmt(f.lxC), y: fmt(f.lyC) }), r.etaS,
        plain(T_('Die Decke spannt {x} × {y} m zwischen den tragenden Wänden und trägt {p} kN/m² aus Erde, Verkehr und Eigengewicht.', { x: fmt(f.lxC), y: fmt(f.lyC), p: fmt(r.pEd, 1) }) + ' ' + verdict(r.etaS)) + table([
        row(T_('Bemessungslast'), fmt(r.pEd, 1) + ' kN/m²'), row(T_('Stützweiten größtes Feld'), fmt(f.lx) + ' × ' + fmt(f.ly) + ' m'),
        ].concat(plateRows(r), [row(T_('Schlankheit l/d'), fmt(r.defl.ld, 1) + ' ≤ ' + fmt(r.defl.lim, 1))])) + layerTable(r.layers), true);
    }
    for (const r of st.mids) {
      const fe = r.method === 'FE', Lg = q.geo.L[r.level];
      h += utilRow(esc(r.name), fe ? 'FE, ' + fmt(r.h * 100, 0) + ' cm' : T_('Tafelverfahren, {h} cm', { h: fmt(r.h * 100, 0) }), r.etaS,
        plain(T_('Die Zwischendecke liegt auf den tragenden Wänden und Stützen von Ebene {n} und trägt Nutzlast {q} kN/m², Ausbau sowie die Wände und Stützen der Ebene darüber{fe}.', { n: r.level + 1, q: fmt(A.p.use.interiorQ, 1), fe: fe ? ' ' + T_('mit ihren Auflagerkräften aus der Platte darüber') : '' }) + ' ' + verdict(r.etaS)) +
        (fe ? table(feRows(r).concat([deflRow(r)])) + feButton('mid' + r.level) + layerTable(r.layers) + zulTable(r) + tableCompare(r)
          : table([row(T_('Bemessungslast Fläche'), fmt(r.pEd, 1) + ' kN/m²')].concat(plateRows(r))) + layerTable(r.layers)) +
        (Lg && Lg.holesBelow && Lg.holesBelow.length ? '<p class="note">' + T_('Treppenaugen sind im Modell ausgespart.') + '</p>' : ''));
    }
    if (st.floor) {
      const r = st.floor, f = r.field;
      if (r.method === 'FE') h += utilRow(T_('Bodenplatte'), T_('FE, elastisch gebettet'), r.etaS, plain(T_('Die Bodenplatte liegt elastisch auf dem Baugrund (Bettungsmodul {ks} MN/m³, untere Grenze der Schätzung aus dem Steifemodul). Wände und Stützen bilden mit Decke und Platte einen steifen Kasten. Bodenpressung höchstens {max} kN/m², im Mittel {mean} kN/m².', { ks: fmt(st.fe.jobs.floor.ksList[0] / 1000, 1), max: fmt(r.soil.pMax, 0), mean: fmt(r.soil.pMean, 0) }) + ' ' + verdict(r.etaS)) +
        table(feRows(r).concat(r.soil.liftArea > 0.01 ? [row(T_('Abhebende Fläche'), fmt(r.soil.liftArea, 1) + ' m²')] : [])) + feButton('floor') + layerTable(r.layers) + zulTable(r) + tableCompare(r));
      else h += utilRow(T_('Bodenplatte'), T_('Druck von unten'), r.etaS,
        plain(T_('Der Baugrund drückt mit {p} kN/m² von unten gegen die Platte.', { p: fmt(r.pEd, 1) }) + ' ' + verdict(r.etaS)) + table([
        row(T_('Bemessungslast'), fmt(r.pEd, 1) + ' kN/m²'), row(T_('Stützweiten größtes Feld'), fmt(f.lx) + ' × ' + fmt(f.ly) + ' m'),
        ].concat(plateRows(r))) + layerTable(r.layers));
    }
    const w = st.wall;
    h += utilRow(T_('Außenwand'), T_('Erd- und Wasserdruck'), w.etaS,
      plain(T_('Die Wand hält den Erd- und Wasserdruck – oben {p1}, unten {p2} kN/m² – über {l} m Höhe.', { p1: fmt(w.p1, 1), p2: fmt(w.p2, 1), l: fmt(w.L) }) + ' ' + (w.method === 'FE' ? T_('Gerechnet als FE-Platte je Wandseite, gestützt von Decke, Bodenplatte, Zwischendecken und tragenden Innenwänden; Ecken eingespannt und gelenkig untersucht.') + ' ' : '') + verdict(w.etaS)) + table([
      row(T_('Druck oben / unten'), fmt(w.p1, 1) + ' / ' + fmt(w.p2, 1) + ' kN/m²'), row(T_('Feldmoment'), fmt(w.moments.mF, 1) + ' kNm/m'),
      row(T_('Rahmenecke oben / unten'), fmt(w.moments.mJTop, 1) + ' / ' + fmt(w.moments.mJBot, 1) + ' kNm/m'), row(T_('Horizontal an Wandecken'), fmt(w.moments.mH, 1) + ' kNm/m'),
      row(T_('Querkraft vEd / vRd,c'), fmt(w.shear.vEd, 0) + ' / ' + fmt(w.shear.vRd, 0) + ' kN/m')]) + layerTable(w.layers));
    for (const iw of st.intWalls) h += utilRow(esc(iw.auto ? T_('Schachtwand {name}', { name: nameOf('v:' + iw.auto, T_('Aufzug')) }) + (q.geo.L.length > 1 ? ' ' + T_('(E{n})', { n: iw.level + 1 }) : '') : nameOf('w:' + iw.id, T_('Innenwand'))), iw.level ? T_('trägt die Zwischendecke mit') : T_('trägt die Decke mit'), iw.etaS,
      plain(T_('Diese Stahlbetonwand ({t} cm) stützt die Platte darüber und verkürzt ihre Spannweite. Normalkraft {n} kN/m.', { t: fmt(iw.t * 100, 0), n: fmt(iw.nEd, 0) }) + ' ' + verdict(iw.etaS)) +
      table([row(T_('Normalkraft nEd / nRd'), fmt(iw.nEd, 0) + ' / ' + fmt(iw.nRd, 0) + ' kN/m'), row(T_('Bewehrung je Seite'), 'Ø' + iw.layer.phi + '/' + fmt(iw.layer.s * 100, 1))]));
    for (const bd of st.beams) {
      h += utilRow(esc(nameOf('b:' + bd.id, T_('Unterzug'))) + (q.geo.L.length > 1 ? ' ' + T_('(E{n})', { n: bd.level + 1 }) : ''), fmt(bd.bw * 100, 0) + '/' + fmt(bd.h * 100, 0) + ' cm, ' + fmt(bd.L, 2) + ' m', bd.etaS,
        plain(T_('Der Unterzug liegt unter der {slab} und trägt sie wie eine Wand. Im Plattenmodell ist er ein starres Auflager; seine Auflagerkräfte gehen an Wände und Stützen. Bemessen als Durchlaufträger mit Rechteckquerschnitt (Plattenanteil mitgerechnet), Feldweise Verkehrslast.', { slab: bd.level === 0 ? T_('Decke') : T_('Zwischendecke') }) + ' ' + (isFinite(bd.etaS) ? verdict(bd.etaS) : T_('Ohne Auflager nicht tragfähig.'))) +
        table(beamRows(bd)));
    }
    for (const c of st.columns) {
      const d = c.design;
      h += utilRow(esc(nameOf('c:' + c.id, T_('Stütze'))) + (q.geo.L.length > 1 ? ' ' + T_('(E{n})', { n: c.level + 1 }) : ''), fmt(c.bx * 100, 0) + ' × ' + fmt(c.by * 100, 0) + ' cm, NEd ' + fmt(c.nEd, 0) + ' kN', c.etaS,
        plain((d.aci ? T_('Die Stütze trägt die {slab} darüber{all}. Nachweis mit Mindestmoment{second}; Durchstanzen der Platte nach {ref}.', { slab: c.level === 0 ? T_('Decke') : T_('Zwischendecke'), all: c.level > 0 || q.geo.L.length > 1 ? ' ' + T_('samt allem, was darauf steht') : '', second: d.second ? ' ' + T_('und Momentenvergrößerung') : '', ref: np().ref.punch })
          : T_('Die Stütze trägt die {slab} darüber{all}. Nachweis mit Mindestausmitte, Imperfektion l₀/400{second}; Durchstanzen der Platte nach {ref}.', { slab: c.level === 0 ? T_('Decke') : T_('Zwischendecke'), all: c.level > 0 || q.geo.L.length > 1 ? ' ' + T_('samt allem, was darauf steht') : '', second: d.second ? ' ' + T_('und Theorie II. Ordnung (Nennkrümmung)') : '', ref: np().ref.punch })) + ' ' + verdict(c.etaS)) +
        table(columnRows(c)));
    }
    const slabWeak = [st.roof].concat(st.mids).some((pl) => pl && (pl.fail || pl.crackFail || pl.shearFail || (pl.defl && pl.defl.eta > 1)));
    if (slabWeak) h += '<div class="rowbtns"><button class="btn small" data-act="autoColumns">' + T_('Stützen automatisch setzen') + '</button></div><p class="note">' + T_('Stützen verkürzen die Spannweite überlasteter oder zu weich gespannter Platten.') + '</p>';
    const bg = st.bearing;
    h += utilRow(T_('Sohldruck'), T_('Baugrund unter der Platte'), bg.eta,
      plain(T_('Der Boden unter der Platte bekommt {e} kN/m² und darf {r} kN/m² aufnehmen.', { e: fmt(bg.sigEd, 1), r: fmt(bg.sigRd, 0) }) + ' ' + verdict(bg.eta)) +
      table(bg.asd ? [row(T_('σ (Gebrauchslasten)'), fmt(bg.sigEd, 1) + ' kN/m²'), row('qa (' + esc(bg.ref) + ')', fmt(bg.sigRd, 0) + ' kN/m²')] : [row('σE,d', fmt(bg.sigEd, 1) + ' kN/m²'), row('σR,d', fmt(bg.sigRd, 0) + ' kN/m²')]));
    const bu = st.buoyancy;
    if (bu.relevant) {
      h += utilRow(T_('Auftrieb, fertig'), T_('schwimmt der Bunker auf?'), bu.final.eta,
        plain(T_('Grundwasser drückt den Bunker mit {u} kN nach oben, Eigengewicht und Erde halten mit {g} kN dagegen.', { u: fmt(bu.final.U, 0), g: fmt(bu.final.G, 0) }) + ' ' + verdict(bu.final.eta)) +
        table([row(T_('Auftrieb U'), fmt(bu.final.U, 0) + ' kN'), row(T_('Haltende Last G'), fmt(bu.final.G, 0) + ' kN'), row(T_('Nachweis'), T_('{d} U ≤ {s} G', { d: dT(np().upl.dst), s: dT(np().upl.stb) }))]) + (isFinite(bu.coverMin) && bu.coverMin ? '<p class="note">' + T_('Sicher ab {c} m Erdüberdeckung.', { c: fmt(bu.coverMin) }) + '</p>' : ''));
      h += utilRow(T_('Auftrieb, Rohbau'), T_('vor dem Verfüllen'), bu.bau.eta,
        plain(T_('Solange noch keine Erde aufliegt, hält nur das Betongewicht ({g} kN) gegen den Auftrieb ({u} kN).', { g: fmt(bu.bau.G, 0), u: fmt(bu.bau.U, 0) }) + ' ' + verdict(bu.bau.eta) + ' ' + T_('Über 1,0 heißt: Wasserhaltung erst nach dem Aufbringen der Erde abschalten.')) +
        table([row(T_('Auftrieb U'), fmt(bu.bau.U, 0) + ' kN'), row(T_('Betongewicht G'), fmt(bu.bau.G, 0) + ' kN')]));
    } else h += '<p class="note" style="margin-top:10px">' + T_('Kein Wasser über der Sohle angesetzt, daher kein Auftriebsnachweis.') + '</p>';
    h += moreSection(q);
    h += '</div>';
    h += poursSection(q);
    h += '<details class="glossary"><summary>' + T_('Fachbegriffe kurz erklärt') + '</summary><table class="res cols">' + [
      [T_('Bemessungslast'), T_('Last mit Sicherheitszuschlägen (ständig ×1,35, veränderlich ×1,5).')],
      [T_('Moment, Feld-/Randmoment'), T_('Maß für die Durchbiegung an Mitte und Auflager. Daraus folgt die Bewehrung.')],
      [T_('Rahmenecke'), T_('Steife Verbindung Wand–Platte; dort zieht es auf der Außenseite.')],
      [T_('Querkraft vEd / vRd,c'), T_('Auftretende Querkraft gegen das, was der Beton ohne Bügel schafft.')],
      [T_('Schlankheit l/d'), T_('Spannweite zu Nutzhöhe; hält die Durchbiegung in Grenzen.')],
      [T_('Ø / Abstand'), T_('Stabdurchmesser und Abstand der Bewehrung, z. B. Ø12/15 = 12-mm-Stäbe alle 15 cm.')],
    ].map(([k, v]) => row(k, v)).join('') + '</table></details>';
    if (st.blast) h += blastSection();
    else h += dynSection();
    h += '<h3>' + T_('Betonstahl') + '</h3>' + kpis([kpi(fmt(s.total / 1000, 2) + ' t', T_('Betonstahl gesamt')), kpi(fmt(s.perM3, 0) + ' kg/m³', T_('Bewehrungsgrad'))].concat(s.schedule ? [kpi(String(s.schedule.positions.length), T_('Positionen in der Biegeliste'))] : []));
    if (s.schedule) h += '<div class="rowbtns"><button class="btn small" data-act="plans">' + T_('Bewehrungspläne drucken') + '</button><button class="btn small ghost" data-act="biegeliste">' + T_('Biegeliste CSV') + '</button><button class="btn small ghost" data-act="bvbs">' + T_('BVBS-Datei') + '</button></div>' +
      '<p class="note">' + T_('Je Bauteil Pläne der unteren und oberen Lage, Abwicklung der Außenwände, Stützen und Unterzüge, dazu die Biegeliste mit Biegeformen. Die BVBS-Datei (BF2D) lesen Biegemaschinen und Biegelisten-Programme ein.') + '</p>';
    h += table(Object.keys(s.byDia).sort((a, b) => a - b).map((d) => row('Ø ' + d + ' mm', fmt(s.byDia[d] * (1 + s.waste), 0) + ' kg')));
    h += '<p class="note">' + T_('Auszug aus Stablängen je Lage, mit Übergreifungsstößen bei mehr als 12 m, Randeinfassung, Anschlussbewehrung, Zulagen an Öffnungen und 3 % Verschnitt.') + '</p>';
    const NP = np(), DEn = isDE(), RF = NP.ref, LS = NP.lf.sets;
    const sl = NP.geo.sl, gb0 = NP.geo;
    h += '<h3>' + T_('Annahmen') + '</h3><ul class="msgs">' + [
      T_('Norm: {label}', { label: esc(NP.label) }),
      NP.code === 'ACI' ? T_('Beton {name}: f′c = {fc} MPa, φ · 0,85 f′c = {fcd} MPa; Betonstahl {steel}: φ fy = {fyd} MPa', { name: esc(mat.name), fc: fmt(mat.fck, 0), fcd: fmt(mat.fcd, 1), steel: esc(NP.steelName), fyd: fmt(mat.fyd, 0) })
        : T_('Beton {name}: fcd = {fcd} MPa, fctm = {fctm} MPa; Betonstahl B500B: fyd = {fyd} MPa', { name: esc(mat.name), fcd: fmt(mat.fcd, 1), fctm: fmt(mat.fctm, 1), fyd: fmt(mat.fyd, 0) }),
      DEn ? T_('Teilsicherheiten γG = 1,35 und γQ = 1,5; Auftrieb γG,dst = 1,05, γG,stb = 0,95')
        : T_('Kombinationen {list}; Auftrieb {d} U ≤ {s} G', { list: LS.map((S) => dT(S.G) + ' G + ' + dT(S.Q) + ' Q' + (LS.length > 1 ? ' (' + I18.maybe(S.tag) + ')' : '')).join('; '), d: dT(NP.upl.dst), s: dT(NP.upl.stb) }),
      T_('Platten zweiachsig: Feldmomente gelenkig gelagert (Timoshenko-Tafeln), Stützmomente an Innenwänden nach Pieper/Martens, an Außenwänden eingespannt bzw. Rahmenecke; Auflagerkräfte aus einer FE-Vergleichsrechnung'),
      T_('Bodenplatte mit gleichmäßigem Sohldruck (sichere Seite, ohne Bettung)'),
      T_('Querkraft im Abstand d vom Auflagerrand; reicht der Beton allein nicht, wird die Längsbewehrung am Rand erhöht (ρl ≤ 2 %)'),
      NP.code === 'ACI' ? T_('Rissbeschränkung über Stababstände ({ref}); bei WU zusätzlich Rissbreite nach EN 1992-1-1 7.3.4, Grenze {w} mm', { ref: RF.crack, w: fmt(A.p.build.waterproofing === 'wu' || A.p.build.waterproofing === 'wu_fbv' ? A.p.build.wk : 0.3, 2) })
        : DEn ? T_('Rissbreite unter quasi-ständiger Last direkt berechnet (EC2 7.3.4), Grenze {w} mm', { w: fmt(A.p.build.waterproofing === 'wu' || A.p.build.waterproofing === 'wu_fbv' ? A.p.build.wk : 0.3, 2) })
        : T_('Rissbeschränkung nach {ref}, Grenze {w} mm', { ref: RF.crackMin, w: fmt(A.p.build.waterproofing === 'wu' || A.p.build.waterproofing === 'wu_fbv' ? A.p.build.wk : 0.3, 2) }),
      T_('Außenwände als FE-Platten je Wandseite (Drehfedern an Decke und Bodenplatte, Linienlager an Zwischendecken und tragenden Innenwänden, Öffnungen ausgespart), Ecken eingespannt und gelenkig als Grenzfälle; Erdruhedruck plus Wasserdruck'),
      T_('Rahmenecken Platte–Wand über Momentenausgleich nach Steifigkeit'),
      DEn ? T_('WU-Bewehrung aus Rissbreitenbegrenzung (EC2 7.3.2, NA DE): Biegung mit kc = 0,4 und zentrischer Zwang für dicke Bauteile (hef = 2,5·d₁)')
        : T_('WU-Bewehrung aus Rissbreitenbegrenzung ({ref}): Biegung mit kc = 0,4 und zentrischer Zwang für dicke Bauteile', { ref: NP.code === 'EC' ? RF.crackMin : NP.code === 'SIA' ? RF.crack : 'EN 1992-1-1 7.3.2' }),
      DEn ? T_('Grundbruch DIN 4017 mit Ersatzrechteck gleicher Fläche, γR,v = 1,4; Setzung DIN 4019 nach Steinbrenner im kennzeichnenden Punkt, Grenztiefe bei 20 % der Überlagerung, Wiederbelastung mit 3 Es')
        : T_('Grundbruch ({ref}, {da}) mit Ersatzrechteck gleicher Fläche, γR,v = {rv}; Setzung nach Steinbrenner im kennzeichnenden Punkt, Grenztiefe bei 20 % der Überlagerung, Wiederbelastung mit 3 Es', { ref: RF.gb, da: esc(gb0.da), rv: dT(gb0.gRv) }),
      DEn ? T_('Böschungen DIN 4084: Gleitkreise nach Bishop, tan φ′d = tan φ′k / 1,25, c′d = c′k / 1,25, veränderliche Lasten ×1,3; Baugruben bis 5 m und Regelneigung nach DIN 4124 ohne Nachweis')
        : T_('Böschungen ({ref}): Gleitkreise nach Bishop, tan φ′d = tan φ′k / {a}, c′d = c′k / {b}, veränderliche Lasten ×{c}; Baugruben bis {dmax} m und Regelneigung nach {rule} ohne Nachweis', { ref: RF.geo, a: dT(sl[0]), b: dT(sl[1]), c: dT(sl[2]), dmax: dT((NP.exc || {}).dMax || 5), rule: esc((NP.exc || {}).ref || 'DIN 4124') }),
      NP.fire === 'ACI216' ? T_('Feuerwiderstand nach ACI/TMS 216.1-14 (Tabellen: Mindestdicken, Betondeckung, Stützenmaße; R 90 ≙ 1,5 h)')
        : DEn ? T_('Feuerwiderstand nach DIN EN 1992-1-2, Tabellenverfahren (Stützen Methode A mit μfi aus der Normalkraft, Platten einachsig auf der sicheren Seite, Wände mit μfi = 0,7)')
        : T_('Feuerwiderstand nach EN 1992-1-2, Tabellenverfahren (Stützen Methode A mit μfi aus der Normalkraft, Platten einachsig auf der sicheren Seite, Wände mit μfi = 0,7)'),
      T_('Durchstanzen mit Öffnungen im Abstand bis 6 d: unwirksamer Teil des Rundschnitts zwischen den Tangenten ({ref})', { ref: RF.punchOpen }),
    ].concat(st.evh > 0 ? [T_('Verdichtungserddruck {p} kN/m² als Mindestwert des Erddrucks ({ref})', { p: fmt(st.evh, 0), ref: NP.ref.earth })] : [])
      .concat(st.blast ? [T_('Luftstoß nach TWK 2017: Φ = 1,2 Biegung, 2,0 Querkraft und gedrungene Bauteile, ψ₂ = 0,3, im Grundwasser ×1,1; Bruchlinien mit Feld- gleich Randmoment; Querkraft nach SIA 262 mit Größtkorn {d} mm', { d: st.blast.dyn.dmax })] : [])
      .map((t) => '<li>' + t + '</li>').join('') + '</ul>';
    h += msgs('statik') + stepNav('statik');
    return h;
  };

  STEP.technik = function () {
    const q = A.q, t = q.tech, p = A.p;
    let h = '<h2>' + T_('Technik & Vorräte') + '</h2><p class="lead">' + T_('Luft, Strom, Wasser und Essen für {n} Personen über {d} Tage.', { n: esc(p.use.people), d: esc(p.use.days) }) + '</p>';
    h += '<h3>' + T_('Lüftung') + '</h3>' + fields(
      num('tech.co2Target', T_('CO₂-Zielwert innen'), 'ppm', { min: 800, max: 10000 }) + num('tech.co2PerPerson', T_('CO₂-Abgabe je Person'), 'L/h', { min: 5, max: 60, hint: T_('ruhend ca. 18 L/h') }) +
      num('tech.co2Out', T_('CO₂ außen'), 'ppm', { min: 300, max: 1000 }) + num('tech.co2Limit', T_('Grenze ohne Lüftung'), 'ppm', { min: 1000, max: 30000 }) +
      num('tech.heatPerPerson', T_('Wärme je Person'), 'W', { min: 50, max: 200 }) + num('tech.deltaT', T_('Erlaubte Erwärmung der Zuluft'), 'K', { min: 1, max: 20 }));
    h += kpis([kpi(fmt(t.qCo2, 0) + ' m³/h', T_('Außenluft nötig')), kpi((t.ventN > 1 ? t.ventN + ' × ' : '') + t.ventSize + ' m³/h', t.ventN > 1 ? T_('Lüftungsgeräte') : T_('Lüftungsgerät')), kpi(fmt(t.tLimit, 1) + ' h', T_('bis zur Grenze ohne Lüftung')), kpi(fmt(t.ach, 2) + ' /h', T_('Luftwechsel'))]);
    h += '<p class="note">' + T_('Zur Abfuhr von {w} W Wärme allein über Luft wären {q} m³/h nötig. Das Erdreich nimmt einen Teil auf – Bilanz unter „Wärme und Kühlung“.', { w: fmt(t.heat, 0), q: fmt(t.qHeat, 0) }) + '</p>';
    h += svcVentSection(t);
    h += routesSection();
    h += '<h3>' + T_('Strom') + '</h3><table class="cons"><thead><tr><td class="note">' + T_('Verbraucher') + '</td><td class="note" style="width:64px">' + T_('Watt') + '</td><td class="note" style="width:56px">' + T_('h/Tag') + '</td><td></td></tr></thead>' +
      t.consumers.map((c) => { const id = esc(c.id); return '<tr><td><input type="text" data-path="tech.consumers#' + id + '.name" value="' + esc(I18.maybe(c.name)) + '"></td><td><input type="number" step="any" min="0" data-min="0" data-path="tech.consumers#' + id + '.w" data-scale="1" value="' + esc(c.w) + '"' + (c.auto ? ' disabled title="' + T_('wird berechnet') + '"' : '') + '></td><td><input type="number" step="any" min="0" max="24" data-min="0" data-max="24" data-path="tech.consumers#' + id + '.h" data-scale="1" value="' + esc(c.h) + '"></td><td><button class="x" data-act="delConsumer" data-id="' + id + '" aria-label="' + T_('Entfernen') + '">×</button></td></tr>'; }).join('') +
      (t.extraConsumers || []).map((c) => '<tr><td><input type="text" value="' + esc(c.name) + '" disabled title="' + T_('aus der Haustechnik berechnet') + '"></td><td><input type="number" value="' + esc(Math.round(c.w)) + '" disabled></td><td><input type="number" value="' + esc(c.h) + '" disabled></td><td></td></tr>').join('') +
      '</table><div class="rowbtns"><button class="btn small ghost" data-act="addConsumer">' + T_('Verbraucher hinzufügen') + '</button></div>' +
      (t.lifts.length ? '<p class="note">' + T_('Aufzüge: {list}. Sie laufen am Netz bzw. am Aggregat, nicht an der Batterie; das Aggregat ist auf den Anlauf ausgelegt.', { list: t.lifts.map((l) => esc(nameOf('v:' + l.id, T_('Aufzug'))) + ' ' + T_('{p} kW (Anlauf {s} kVA)', { p: fmt(l.P, 1), s: fmt(l.kVAstart, 0) })).join(', ') }) + '</p>' : '');
    h += fields(num('tech.lightWm2', T_('Beleuchtung'), 'W/m²', { min: 0, max: 30 }) + num('tech.batteryDays', T_('Tage nur mit Batterie'), T_('Tage'), { min: 0, max: 60 }) +
      num('tech.dod', T_('Nutzbare Batteriekapazität'), '%', { scale: 100, min: 50, max: 100 }) + num('tech.fuelPerKWh', T_('Kraftstoff je kWh'), 'L', { min: 0.2, max: 1 }));
    h += kpis([kpi(fmt(t.whDay / 1000, 1) + ' kWh', T_('Bedarf je Tag')), kpi(fmt(t.peak / 1000, 1) + ' kW', T_('Spitzenlast')), kpi(fmt(t.battery, 1) + ' kWh', T_('Batteriespeicher')), kpi(t.generator ? t.generator + ' kVA, ' + fmt(t.fuel, 0) + ' L' : T_('nicht nötig'), T_('Aggregat und Kraftstoff'))]);
    h += svcPowerSection(t);
    h += svcHeatSection(t);
    h += '<h3>' + T_('Wasser & Vorräte') + '</h3>' + fields(
      num('tech.waterDrink', T_('Trinkwasser je Person'), T_('L/Tag'), { min: 1, max: 10, hint: T_('BBK: 2 L inkl. Kochen') }) + num('tech.waterHygiene', T_('Brauchwasser je Person'), T_('L/Tag'), { min: 0, max: 50 }) +
      num('tech.foodKg', T_('Lebensmittel je Person'), T_('kg/Tag'), { min: 0.3, max: 3, hint: T_('BBK-Liste: rund 1,5 kg') }) + num('tech.penetrations', T_('Weitere Durchführungen'), T_('Stk'), { min: 0, max: 50, step: 1, hint: T_('Wasser, Abwasser, Erdung') }));
    h += kpis([kpi(fmt(t.water, 0) + ' L', T_('Wassertank')), kpi(fmt(t.waste, 0) + ' L', T_('Abwassertank')), kpi(fmt(t.food, 0) + ' kg', T_('Lebensmittel')), kpi(fmt(t.personDays, 0), T_('Personentage'))]);
    h += svcSewageSection(t);
    h += equipSection(t);
    h += productSection(t);
    h += msgs('technik') + stepNav('technik');
    return h;
  };


  /* Produktbeispiele mit belegten Kenndaten und Quellen */
  function productSection(t) {
    const pr = t.products || [];
    if (!pr.length) return '';
    let h = '<h3>' + T_('Produktbeispiele') + '</h3><table class="res cols"><tr><th>' + T_('Bauteil') + '</th><th>' + T_('Beispiel') + '</th><th></th></tr>';
    h += pr.map((x) => '<tr><td class="l">' + esc(x.item) + '<br><small class="note">' + esc(x.need) + '</small></td><td class="l">' + esc(x.product) + '<br><small class="note">' + esc(x.data) + (x.note ? ' – ' + esc(x.note) : '') + '</small><br><small class="note">' + T_('Quelle: {link}, abgerufen {date}', { link: '<a href="' + esc(x.src.url) + '" target="_blank" rel="noopener">' + esc(x.src.title) + '</a>', date: esc(I18.date(x.src.date)) }) + '</small></td><td>' + (x.ok === true ? '✔' : x.ok === false ? '<span class="warnc">⚠</span>' : '') + '</td></tr>').join('') + '</table>';
    h += '<p class="note">' + T_('Beispiele marktüblicher Baureihen mit belegten Kenndaten, keine Kaufempfehlung. Auswahl, Kennlinien, Zulassung und Preise bestätigen Fachplaner und Hersteller; konkrete Angebote im Schritt Einkauf erfassen.') + '</p>';
    return h;
  }

  /* Einbauten und Vorräte: Aufstellort und Lasten auf den Platten */
  function equipSection(t) {
    const eq = t.equip || [];
    if (!eq.length) return '';
    const q = A.q, nL = q.geo.L.length;
    const named = q.geo.L.flatMap((Lg) => Lg.rooms.filter((r) => r.id && !r.shaft).map((r) => [r.id, (nL > 1 ? T_('Ebene {n}', { n: Lg.idx + 1 }) + ': ' : '') + BP.calc.roomName(r.name)]));
    let h = '<h3>' + T_('Aufstellung und Lasten') + '</h3><table class="res cols"><tr><th>' + T_('Einbau') + '</th><th>' + T_('Raum') + '</th><th>' + T_('Last') + '</th></tr>';
    h += eq.map((e) => {
      const cur = (A.p.tech.place || {})[e.id] || 'auto';
      const opts = [['auto', T_('automatisch') + (cur === 'auto' ? ': ' + (nL > 1 ? T_('Ebene {n}', { n: e.level + 1 }) + ', ' : '') + BP.calc.roomName(e.room) : '')]].concat(named);
      const s2 = '<select data-path="tech.place.' + esc(e.id) + '" aria-label="' + T_('Raum für {name}', { name: esc(e.name) }) + '">' + opts.map(([v, tx]) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(tx) + '</option>').join('') + '</select>';
      return '<tr><td class="l">' + esc(e.name) + (e.fits ? '' : ' <span class="warnc" title="' + T_('passt nicht in den Raum') + '">⚠</span>') + '<br><small class="note">' + fmt(e.area, 2) + ' m², G ' + fmt(e.G, 1) + ' kN' + (e.E > 0 ? ', E ' + fmt(e.E, 1) + ' kN' : '') + '</small></td><td class="l">' + s2 + '</td><td>' + fmt(e.gk + e.ek, 1) + ' kN/m²</td></tr>';
    }).join('') + '</table>';
    h += '<p class="note">' + T_('Die Einbauten stehen als Flächenlasten im Plattenmodell ({slabs}): Eigengewicht als ständige Last G, Füllung von Tanks und Regalen als Lagerlast E (ψ₀ = 1,0, ψ₂ = 0,8).', { slabs: esc([...new Set(eq.map((e) => e.slab))].join(', ')) }) + ' ' +
      T_('Ohne Vorgabe kommen sie in den Raum, dessen Name passt (z. B. „Technik“, „Lager“), sonst in den größten Raum der untersten Ebene, möglichst in die Raummitte. Massen sind Richtwerte – Herstellerangaben in der Ausführungsplanung einsetzen.') + '</p>';
    return h;
  }

  /* Schutzlüftung: Filterbetrieb, Überdruck, Explosionsschutzventile */
  function svcVentSection(t) {
    const sv = t.svc;
    if (!sv) return '';
    let h = '';
    if (sv.prot) {
      const pr = sv.prot;
      h += '<h3>' + T_('Schutzlüftung (ABC)') + '</h3>' + fields(num('tech.overpressure', T_('Überdruck im Schutzbetrieb'), 'Pa', { min: 20, max: 300, hint: T_('Richtwert 50–100 Pa') }));
      h += table([row(T_('Luftmenge im Filterbetrieb'), fmt(pr.qF, 0) + ' m³/h'), row(T_('Druckverlust Gasfilter / Leitungen'), fmt(pr.dpFilter, 0) + ' / 250 Pa'), row(T_('Ventilatorleistung im Filterbetrieb'), fmt(pr.fan, 0) + ' W'),
        row(T_('Zulässige Leckage der Hülle bei {p} Pa', { p: fmt(pr.dp, 0) }), '≤ ' + fmt(pr.leakMax, 0) + ' m³/h'), pr.Vs > 0 ? row(T_('Schleuse spülen (5-facher Luftwechsel)'), T_('{m} min je Durchgang', { m: fmt(pr.purge, 0) })) : '']);
      h += '<p class="note">' + T_('Die Hülle wird bei der Abnahme mit einer Dichtheitsprüfung (Überdruck {p} Pa) geprüft. Türen, Durchführungen und Klappen müssen gasdicht sein.', { p: fmt(pr.dp, 0) }) + ' ' + (pr.hand ? T_('Handbetrieb bei Stromausfall mit verminderter Luftmenge möglich.') : T_('Bei dieser Luftmenge ist Handbetrieb nur für einen Teil der Geräte sinnvoll – Notstrom einplanen.')) + '</p>';
    }
    const vv = sv.valves;
    if (vv && vv.blast && vv.list.length) h += '<h3>' + T_('Explosionsschutzventile') + '</h3><table class="res cols"><tr><th>' + T_('Durchführung') + '</th><th>' + T_('Luftmenge') + '</th><th>' + T_('Ventil') + '</th></tr>' + vv.list.map((x) => '<tr><td class="l">' + esc(x.name) + '</td><td>' + fmt(x.flow, 0) + ' m³/h</td><td>' + (x.n > 1 ? x.n + ' × ' : '') + x.size + ' m³/h</td></tr>').join('') + '</table>' +
      '<p class="note">' + T_('Bemessungsdruck {q} kN/m². Jede Luftöffnung der Hülle braucht ein Explosionsschutzventil; Abgasventile hitzebeständig.', { q: fmt(vv.qk, 0) }) + '</p>';
    return h;
  }
  function svcPowerSection(t) {
    const g = t.svc && t.svc.gen;
    if (!g) return '';
    let h = '<h3>' + T_('Notstrom: Kraftstoff, Abgas, Maschinenraum') + '</h3>' + fields(sel('tech.genLocation', T_('Aufstellung Aggregat'), [['innen', T_('im Bunker (Maschinenraum)')], ['aussen', T_('außen (Container / Einhausung)')]]));
    h += table([row(T_('Leistung / mittlere Last'), g.kVA + ' kVA (' + fmt(g.kW, 1) + ' kW) / ' + fmt(g.avgkW, 1) + ' kW'), row(T_('Verbrauch'), T_('{l} L/h, {h} Betriebsstunden', { l: fmt(g.lph, 2), h: fmt(g.hours, 0) })),
      row(T_('Kraftstofftank'), (g.nTanks > 1 ? g.nTanks + ' × ' : '') + T_('{s} L für {f} L (mit 10 % Reserve)', { s: fmt(g.tankSize, 0), f: fmt(g.fuel, 0) })), row(T_('AwSV-Gefährdungsstufe (Diesel, WGK 2)'), g.stufe),
      row(T_('Verbrennungsluft'), fmt(g.air, 0) + ' m³/h'), row(T_('Abgas (500 °C)'), T_('{q} m³/h, Leitung DN {dn}', { q: fmt(g.exh, 0), dn: g.dnExh }))].concat(g.loc === 'innen' ? [row(T_('Wärme im Maschinenraum'), fmt(g.roomHeat, 1) + ' kW'), row(T_('Zuluft Maschinenraum'), fmt(g.intake, 0) + ' m³/h')] : []));
    h += '<p class="note">' + (g.loc === 'innen' ? T_('Maschinenraum mit eigener Zu- und Abluft, getrennt von der Schutzlüftung, feuerbeständig abgetrennt, mit CO-Melder. Ein wassergekühltes Aggregat mit Außenkühler verringert die Kühlluft stark.') + ' ' : T_('Aggregat außen: Kabeldurchführung druck- und gasdicht, Aggregat gegen Luftstoß und Splitter geschützt aufstellen.') + ' ') +
      T_('Abgasmündung mindestens 3 m über Gelände und deutlich entfernt von der Zuluft. Diesel altert – Vorrat umwälzen oder alterungsbeständigen Kraftstoff (z. B. HVO) verwenden.') + '</p>';
    return h;
  }
  function svcHeatSection(t) {
    const hb = t.svc && t.svc.heat;
    if (!hb) return '';
    let h = '<h3>' + T_('Wärme und Kühlung') + '</h3>' + fields(num('tech.tInMax', T_('Innentemperatur höchstens'), '°C', { min: 20, max: 35 }) + num('tech.tOutSummer', T_('Außenluft im Sommer'), '°C', { min: 20, max: 45 }) +
      num('tech.tSoil', T_('Erdreich'), '°C', { min: 0, max: 25, hint: T_('ungestört rund 10 °C') }) + sel('tech.cooling', T_('Kühlgerät'), [['auto', T_('bei Bedarf einplanen')], ['keine', T_('keines')]]));
    h += table([row(T_('Wärme Personen / Geräte'), fmt(hb.persons / 1000, 2) + ' / ' + fmt(hb.equip / 1000, 2) + ' kW'), row(T_('Abgabe ans Erdreich (Langzeit)'), fmt(hb.ground / 1000, 2) + ' kW'),
      row(T_('Lüftung normal / Filterbetrieb'), fmt(hb.ventN / 1000, 2) + ' / ' + fmt(hb.ventF / 1000, 2) + ' kW'), row(T_('Kühllast'), fmt(hb.cool / 1000, 2) + ' kW' + (hb.kW > 0 ? ' → ' + T_('Kühlgerät {p} kW', { p: fmt(hb.kW, 1) }) + (hb.mode === 'auto' ? ', ' + T_('{p} kW elektrisch', { p: fmt(hb.elec / 1000, 2) }) : ' ' + T_('(nicht eingeplant)')) : '')),
      row(T_('Feuchte (latent, Personen)'), T_('{p} kW – Entfeuchtung vorsehen', { p: fmt(hb.latent / 1000, 2) }))]);
    h += '<p class="note">' + T_('Stationäre Bilanz: Wände, Decke und Sohle geben Wärme ans Erdreich ab (halber Wert, weil sich das Erdreich bei langer Belegung erwärmt); Außenluft wärmer als innen bringt zusätzliche Wärme. Rückkühler außen braucht gasdichte, druckstoßfeste Durchführungen.') + '</p>';
    return h;
  }
  function svcSewageSection(t) {
    const sw = t.svc && t.svc.sew;
    if (!sw) return '';
    let h = '<h3>' + T_('Abwasser') + '</h3>' + fields(sel('tech.sewer', T_('Entwässerung'), [['hebeanlage', T_('Kanal über Hebeanlage, Tank im Schutzbetrieb')], ['tank', T_('nur Sammeltank (Abfuhr)')], ['trocken', T_('Trockentoiletten, kein Abwasser')]]));
    const rows = [row(T_('Sanitärgegenstände'), T_('{wc} WC, {b} Waschtisch', { wc: sw.nWC, b: sw.nBasin }) + (sw.nShower ? ', ' + T_('{n} Dusche', { n: sw.nShower }) : '') + ', ' + T_('{n} Spüle', { n: sw.nSink })), row(T_('Schmutzwasserabfluss'), 'Qww = ' + I18.num(0.7, 1) + ' · √' + fmt(sw.sumDU, 1) + ' = ' + fmt(sw.Qww, 2) + ' l/s'), row(T_('Abwasser je Tag'), fmt(sw.perDay, 0) + ' L')];
    if (sw.mode === 'hebeanlage') rows.push(row(T_('Hebeanlage'), (sw.double ? T_('Doppelanlage') + ', ' : '') + T_('DN {dn}, {q} l/s (v = {v} m/s), H = {h} m, Motor {m} kW', { dn: sw.dn, q: fmt(sw.Qp, 1), v: fmt(sw.v, 2), h: fmt(sw.H, 1), m: fmt(sw.motor, 2) })));
    h += table(rows);
    if (sw.mode === 'hebeanlage') h += '<p class="note">' + T_('Fäkalienhebeanlage nach DIN EN 12056-4 mit Rückstauschleife über die Rückstauebene; Entlüftung über Dach mit Schutz gegen Luftstoß und Gas; Absperrschieber in der Leitung durch die Hülle. Im Schutzbetrieb läuft das Abwasser in den Sammeltank.') + '</p>';
    return h;
  }

  function routesSection() {
    const q = A.q, R = q.routes;
    let h = '<h3>' + T_('Leitungen') + '</h3>';
    h += '<div class="rowbtns" style="margin-top:0"><button class="btn small" data-act="newRoute" data-type="luft">' + T_('Lüftungsweg zeichnen') + '</button><button class="btn small" data-act="newRoute" data-type="kabel">' + T_('Kabelweg zeichnen') + '</button></div>';
    if (A.tool === 'route') h += '<p class="note">' + T_('Im Grundriss Punkte klicken. Die Höhe neuer Punkte steht oben in der Werkzeugleiste. Gleicher Punkt mit anderer Höhe ergibt eine Steigleitung. Enter oder „Fertig“ beendet den Weg.') + '</p>';
    h += routeCard();
    if (R.list.length) {
      h += '<ul class="list">' + R.list.map((r) => {
        const w = r.issues.filter((i) => i.level === 'warn').length;
        return '<li data-selitem="route:' + esc(r.id) + '"' + (A.sel && A.sel.id === r.id ? ' class="sel"' : '') + '><span><i class="swatch" style="background:' + r.kind.color + '"></i>' + esc(r.src.name) + (w ? ' <b style="color:var(--warn)">· ' + w + '</b>' : '') + '</span><span>' + r.dims.label + ', ' + fmt(r.L, 1) + ' m</span></li>';
      }).join('') + '</ul>';
      const byType = { wand: 0, decke: 0, boden: 0, innenwand: 0 };
      R.pens.forEach((x) => { byType[x.type]++; });
      h += '<p class="note">' + T_('Durchführungen: {w} Außenwand, {d} Decke{b}, {i} Innenwand. Sie zählen als Futterrohre und Aussparungen in der Stückliste.', { w: byType.wand, d: byType.decke, b: byType.boden ? ', ' + T_('{n} Bodenplatte', { n: byType.boden }) : '', i: byType.innenwand }) + '</p>';
    } else h += '<p class="note">' + T_('Noch keine Leitungen. Ohne gezeichnete Wege wird die Lüftungsleitung pauschal geschätzt.') + '</p>';
    return h;
  }

  function routeCard() {
    const s = A.sel;
    if (!s || s.type !== 'route') return '';
    const r = A.p.routes.find((x) => x.id === s.id), rr = A.q.routes.byId[s.id];
    if (!r || !rr) return '';
    const pth = 'routes#' + r.id;
    const kinds = Object.entries(M.ROUTE_KINDS).filter(([, v]) => v.type === r.type).map(([k, v]) => [k, T_(v.name)]);
    let h = '<div class="sel-card"><h4>' + (r.type === 'luft' ? T_('Lüftungsweg') : T_('Kabelweg')) + ' <button class="btn small danger" data-act="delSel">' + T_('Löschen') + '</button></h4>';
    h += fields(txt(pth + '.name', T_('Bezeichnung')) + sel(pth + '.kind', T_('Art'), kinds) +
      (r.type === 'luft' ? seg(pth + '.shape', [['rund', T_('Rundrohr')], ['rechteck', T_('Rechteckkanal')]]) : '') +
      (r.shape === 'rund' && r.type === 'luft' ? num(pth + '.d', T_('Durchmesser'), 'mm', { scale: 1000, min: 50, max: 1000 }) :
        num(pth + '.w', T_('Breite'), 'cm', { scale: 100, min: 2, max: 200 }) + num(pth + '.hgt', T_('Höhe'), 'cm', { scale: 100, min: 1, max: 200 })) +
      num(pth + '.ins', T_('Außenzugabe je Seite'), 'cm', { scale: 100, min: 0, max: 30, hint: T_('z. B. Dämmung') }) +
      num(pth + '.clr', T_('Platzabstand je Seite'), 'cm', { scale: 100, min: 0, max: 100, hint: T_('Reserve für Halter, Montage') }) +
      (r.type === 'luft' ? num(pth + '.airflow', T_('Luftmenge'), 'm³/h', { min: 0, max: 20000, nullable: true, placeholder: rr.airSrc === 'aus Lüftungsbedarf' ? T_('auto {a}', { a: fmt(rr.airflow, 0) }) : T_('offen') }) :
        num(pth + '.reserve', T_('Längenreserve'), '%', { min: 0, max: 100 }) + txt(pth + '.cable', T_('Kabeltyp'), { placeholder: T_('z. B. NYM-J 3×2,5') })));
    h += table([
      row(T_('Länge räumlich'), fmt(rr.L) + ' m' + (r.type === 'kabel' ? ', ' + T_('mit Reserve {l} m', { l: fmt(rr.Lres) }) : '')),
      row(T_('Außenmaß'), T_('{w} × {h} cm, mit Abstand {cw} × {ch} cm', { w: fmt(rr.dims.w * 100, 1), h: fmt(rr.dims.h * 100, 1), cw: fmt((rr.dims.w + 2 * r.clr) * 100, 1), ch: fmt((rr.dims.h + 2 * r.clr) * 100, 1) })),
      row(T_('Achshöhe über Boden'), T_('{a} bis {b} m', { a: fmt(rr.hMin), b: fmt(rr.hMax) })),
    ].concat(r.type === 'luft' && rr.v != null ? [row(T_('Luftgeschwindigkeit'), T_('{v} m/s bei {q} m³/h', { v: fmt(rr.v, 2), q: fmt(rr.airflow, 0) }))] : [])
      .concat(rr.pens.length ? [row(T_('Durchführungen'), esc(rr.pens.map((x) => x.where).join(', ')))] : []));
    h += '<h4>' + T_('Wegpunkte') + ' <span class="note">' + T_('x, y in m, Höhe über OK Rohboden') + '</span></h4><table class="cons"><thead><tr><td></td><td class="note">x</td><td class="note">y</td><td class="note">' + T_('Höhe') + '</td><td></td><td></td></tr></thead>' +
      r.pts.map((pt, i) => '<tr><td class="note">' + (i + 1) + '</td>' + ['x', 'y', 'h'].map((k) => '<td><input type="number" step="0.05" data-path="' + esc(pth) + '.pts.' + i + '.' + k + '" data-scale="1" value="' + esc(pt[k]) + '"></td>').join('') +
        '<td><button class="x" data-act="routeInsPt" data-id="' + esc(r.id) + '" data-i="' + i + '" title="' + T_('Punkt danach einfügen') + '" aria-label="' + T_('Punkt danach einfügen') + '">+</button></td><td><button class="x" data-act="routeDelPt" data-id="' + esc(r.id) + '" data-i="' + i + '" aria-label="' + T_('Punkt löschen') + '">×</button></td></tr>').join('') + '</table>';
    h += '<div class="rowbtns"><button class="btn small ghost" data-act="routeAppend" data-id="' + esc(r.id) + '">' + T_('Punkt anhängen') + '</button><button class="btn small ghost" data-act="continueRoute" data-id="' + esc(r.id) + '">' + T_('Im Plan weiterzeichnen') + '</button></div>';
    if (rr.issues.length) h += '<ul class="msgs">' + rr.issues.map((i) => '<li class="' + i.level + '">' + esc(i.text) + '</li>').join('') + '</ul>';
    else if (r.pts.length >= 2) h += '<ul class="msgs"><li class="ok">' + T_('Keine Überschneidung mit Wänden, Decke, Boden oder anderen Leitungen.') + '</li></ul>';
    return h + '</div>';
  }

  const STATE_TXT = { fehlt: N_('Bauteil fehlt'), offen: N_('Unterlage offen'), veraltet: N_('Unterlage veraltet'), zugeordnet: N_('Unterlage zugeordnet') };
  const STATE_CLS = { fehlt: '', offen: 'warn', veraltet: 'err', zugeordnet: 'ok' };

  function hazardSection() {
    const q = A.q, p = A.p, hz = p.hazard, st = q.struct, bl = st.blast;
    const hs = hazardState(q);
    const flags = ['radiation', 'cb', 'fire', 'shock', 'emp'];
    const presetOn = (k) => { const pr = M.HAZARD_PRESETS[k]; return pr.blast === hz.blast && flags.every((f) => !!hz[f] === !!pr[f]); };
    let h = '<h3>' + T_('Schutzgrad') + '</h3><div class="targets">' + Object.entries(M.HAZARD_PRESETS).map(([k, v]) => '<button class="tgt' + (presetOn(k) ? ' on' : '') + '" data-act="hazardPreset" data-k="' + k + '"><span>' + esc(T_(v.name)) + '</span></button>').join('') + '</div>';
    h += fields(sel('hazard.blast', T_('Luftstoß'), [['keins', T_('kein Lastfall')], ['twk', '100 kN/m² = 1 bar (TWK 2017)'], ['eigen', T_('eigener Wert')]]) +
      (hz.blast === 'eigen' ? num('hazard.qk', T_('Luftstoß qₖ'), 'kN/m²', { min: 10, max: 2000, hint: T_('Überdruck an der Geländeoberfläche') }) : '') +
      chk('hazard.radiation', T_('Strahlung, Fallout')) + chk('hazard.cb', T_('ABC-Schutz: Gasfilter, Überdruck, gasdichte Türen')) + chk('hazard.fire', T_('Brand: Rauch und Kohlenmonoxid')) +
      chk('hazard.shock', T_('Erschütterung: Einbauten schocksicher')) + chk('hazard.emp', T_('EMP: Schirmung und Filter an jeder Durchführung')));
    h += kpis([
      kpi(bl ? fmt(bl.qk, 0) + ' kN/m²' : T_('keiner'), T_('Luftstoß-Lastfall')),
      kpi(fmt(st.shield.heq * 100, 0) + ' cm', T_('Betonäquivalent über Raum') + (hz.radiation ? ' (≥ 65)' : '')),
      kpi(bl ? (hs.minFail ? T_('unterschritten') : T_('eingehalten')) : '–', T_('TWK-Mindestdicken')),
      kpi(eur(q.bom.cats['Schutztechnik'] || 0), T_('Schutztechnik netto')),
    ]);
    const li = [];
    if (bl) li.push(T_('<b>Luftstoß:</b> Decke, Außenwände und Bodenplatte bekommen den außergewöhnlichen Lastfall, Ergebnis unter Tragwerk. Schutztüren, Luken und Explosionsschutzventile müssen für {p} bar geprüft sein.', { p: fmt(bl.qk / 100, 1) }));
    if (bl) li.push(T_('<b>Mindestwerte TWK:</b> Decke und Außenwände ab 30 cm, Bodenplatte ab {t} cm, tragende Innenwände ab 20 cm, Bewehrung mindestens 0,18 % je Zugseite, nur B500B.', { t: fmt(bl.minT.floor * 100, 0) }));
    if (hz.radiation) li.push(T_('<b>Strahlung:</b> Über dem Raum mindestens 65 cm Betonäquivalent, Erde zählt mit 1.600 kg/m³. Zugang mit Richtungswechsel, damit keine Direktstrahlung in den Raum fällt.'));
    if (hz.cb) li.push(T_('<b>ABC:</b> Außenluft nur über Gasfilter, Raum unter leichtem Überdruck, gasdichte Türen, Schleuse zum Ein- und Ausgehen.'));
    if (hz.fire) li.push(T_('<b>Brand:</b> Außenluft, Rauch und Betrieb bei geschlossener Ansaugung benötigen ein abgestimmtes Lüftungs- und Brandschutzkonzept. Umluft ersetzt keine Frischluft; CO, CO₂ und Sauerstoffversorgung berücksichtigen.'));
    if (hz.shock) li.push(T_('<b>Erschütterung:</b> Lüftungsgerät, Batterien, Tanks und Regale schocksicher befestigen (±2 g horizontal, ±4 g vertikal). Nichts an die Decke hängen, was herunterfallen kann.'));
    if (hz.emp) li.push(T_('<b>EMP:</b> Geschlossener Metallschirm um den Innenraum, Lüftung über Wabenkamine, jede Stromleitung über Filter, Daten nur per Glasfaser, Türen HF-dicht. Schirmdämpfung nach dem Einbau messen lassen.'));
    if (li.length) h += '<ul class="msgs">' + li.map((x) => '<li><span>' + x + '</span></li>').join('') + '</ul>';
    return h;
  }

  function specialScenariosSection() {
    const q = A.q, hz = A.p.hazard;
    const ss = specialState(q);
    let h = '<h3>' + T_('Treffer und Nahtreffer') + '</h3><p class="note">' + T_('Ein Schutzraum nach TWK geht davon aus, dass er kein direktes Ziel ist. Treffer, Nahtreffer und Raketen rechnet das Tool bewusst nicht: Dafür braucht es Waffenwirkungsdaten und eine Fachbemessung für militärische Schutzbauten. Forderst du so ein Szenario, steht es als offene Anforderung in Freigaben und Bericht.') + '</p>';
    h += fields(Object.entries(M.SPECIAL_SCENARIOS).map(([k, v]) => chk('hazard.scenarios.' + k + '.on', T_(v.name)) +
      (v.dist && hz.scenarios[k] && hz.scenarios[k].on ? num('hazard.scenarios.' + k + '.dist', T_('Abstand zur Außenwand'), 'm', { min: 0, max: 1000 }) : '')).join(''));
    if (ss.on.length) {
      h += fields(area('hazard.assumption', T_('Bedrohungsannahme: Waffe, Quelle, Begründung'), { rows: 3 }) + txt('hazard.expert.reference', T_('Fachbemessung / Gutachten')) + txt('hazard.expert.authority', T_('Fachplaner')) + dateField('hazard.expert.date', T_('Datum')));
      h += '<ul class="msgs"><li class="warn">' + (ss.doc ? T_('Unterlagentitel eingetragen. Ein Name allein belegt keine Schutzwirkung. Unten unter „Beschuss & Explosionsszenarien“ ein Szenario anlegen, bei „Deckt geforderte Sonderanforderung ab“ diese Anforderung wählen und den Nachweis dem aktuellen Plan zuordnen.') : T_('Szenario nicht nachgewiesen. Unten unter „Beschuss & Explosionsszenarien“ ein Szenario mit Variante, Trefferbedingungen und Fachbemessung anlegen und bei „Deckt geforderte Sonderanforderung ab“ zuordnen.')) + '</li></ul>';
    }
    return h;
  }

  STEP.schutzgrad = function () {
    let h = '<h2>' + T_('Schutzgrad') + '</h2><p class="lead">' + T_('Wogegen der Bunker schützen soll. Das legt direkt die Lasten, die Mindestdicken und die Schutztechnik fest – deshalb steht es gleich nach den Lasten und vor dem Grundriss.') + '</p>';
    h += hazardSection();
    h += '<p class="note" style="margin-top:14px">' + T_('Treffer- und Beschussszenarien sowie Prüfunterlagen je Bauteil kommen später unter <a data-goto="schutz">Schutznachweise</a>, wenn Grundriss und Dicken stehen.') + '</p>';
    h += msgs('schutzgrad') + stepNav('schutzgrad');
    return h;
  };

  function blastSection() {
    const st = A.q.struct, bl = st.blast;
    const sugg = (v, key) => (v ? '<p class="note">' + T_('Ohne Schubbewehrung ab {t} cm Dicke.', { t: fmt(v * 100, 0) }) + ' <button class="btn small ghost" data-act="setThickness" data-k="' + key + '" data-v="' + v + '">' + T_('{t} cm übernehmen', { t: fmt(v * 100, 0) }) + '</button></p>' : '');
    const shearRows = (a) => [row(T_('Querkraftlast (Φ = 2,0, höchstens 1,6·qRd)'), fmt(a.pV, 1) + ' kN/m²'), row(T_('vEd / vRd ohne Bügel'), fmt(a.shear.vEd, 0) + ' / ' + fmt(a.shear.vRd, 0) + ' kN/m')]
      .concat(a.shear.reinf ? [row(T_('Schubbewehrung'), T_('Ø{phi}/{s}, Randstreifen {b} m', { phi: a.shear.reinf.phi, s: fmt(a.shear.reinf.s * 100, 0), b: fmt(a.shear.strip) }))] : [])
      .concat(a.shear.needs && !a.shear.reinf ? [row(T_('Schubbewehrung'), '<b style="color:var(--err)">' + T_('reicht nicht') + '</b>')] : []);
    let h = '<h3>' + T_('Lastfall Luftstoß {q} kN/m²', { q: fmt(bl.qk, 0) }) + '</h3><p class="note">' + T_('Außergewöhnliche Bemessungssituation nach TWK 2017, plastisch über Bruchlinien mit fcd = {fcd} MPa und fsd = {fsd} MPa. Die Bewehrung oben ist bereits das Maximum aus beiden Lastfällen.', { fcd: fmt(bl.dyn.fcd, 0), fsd: fmt(bl.dyn.fsd, 0) }) + '</p><div class="util">';
    if (st.roof && st.roof.acc) {
      const a = st.roof.acc;
      h += utilRow(T_('Decke'), 'gₖ + ' + fmt(a.phiM, 1) + '·qₖ + ψ₂·q', a.eta, table([row(T_('Biegelast'), fmt(a.pM, 1) + ' kN/m²'), row(T_('Traglast Bruchlinien qRd'), fmt(a.qRd, 1) + ' kN/m²'), row(T_('Moment je Richtung, Feld = Rand'), fmt(a.mPl, 1) + ' kNm/m')].concat(shearRows(a))) + sugg(bl.noStir.roof, 'tRoof'), true);
    }
    if (st.wall.acc) {
      const a = st.wall.acc;
      h += utilRow(T_('Außenwand'), 'e₀ + w + ' + fmt(a.phiM, 1) + '·qₖ', a.eta, table([row(T_('Biegelast'), fmt(a.pM, 1) + ' kN/m²'), row(T_('Traglast qRd'), fmt(a.qRd, 1) + ' kN/m²'), row(T_('Moment Feld / Rahmenecke'), fmt(a.mPl, 1) + ' / ' + fmt(a.mCorner, 1) + ' kNm/m')].concat(shearRows(a))) + sugg(bl.noStir.wall, 'tWall'));
    }
    if (st.floor && st.floor.acc) {
      const a = st.floor.acc;
      h += utilRow(T_('Bodenplatte'), T_('δ = {d} nach Baugrund', { d: fmt(bl.delta, 1) }), a.eta, table([row(T_('Biegelast'), fmt(a.pM, 1) + ' kN/m²'), row(T_('Traglast Bruchlinien qRd'), fmt(a.qRd, 1) + ' kN/m²'), row(T_('Moment je Richtung'), fmt(a.mPl, 1) + ' kNm/m')].concat(shearRows(a))) + sugg(bl.noStir.floor, 'tFloor'));
    }
    for (const iw of st.intWalls) if (iw.acc) h += utilRow(esc(nameOf('w:' + iw.id, T_('Innenwand'))), T_('Auflager der Decke'), iw.acc.eta, table([row('nEd / nRd', fmt(iw.acc.nEd, 0) + ' / ' + fmt(iw.acc.nRd, 0) + ' kN/m')]));
    h += '</div>';
    if (bl.delta === 0) h += '<p class="note">' + T_('Bodenplatte auf Fels: nach TWK ohne Luftstoß-Last.') + '</p>';
    h += dynSection();
    return h;
  }
  /* Einmassenschwinger: dynamische Antwort von Decke und Außenwand auf TWK-Luftstoß und Szenarien mit Druck und Impuls */
  function dynSection() {
    const bd = A.q.blastDyn;
    if (!bd || !bd.rows.length) return '';
    const dg = (v, d) => (isFinite(v) ? fmt(v, d) : '∞');
    let h = '<h3>' + T_('Dynamische Antwort (Einmassenschwinger)') + '</h3><table class="res cols"><tr><th>' + T_('Bauteil, Last') + '</th><th>T / td</th><th>μ</th><th>θ</th><th>V / V<sub>Rd</sub></th></tr>';
    h += bd.rows.map((r) => '<tr' + (r.ok ? '' : ' class="bad"') + '><td class="l">' + esc(r.el) + '<br><small class="note">' + esc(r.load) + '</small></td><td>' + fmt(r.T * 1000, 0) + ' / ' + (isFinite(r.td) ? fmt(r.td * 1000, 1) : '∞') + ' ms</td><td>' + dg(r.mu, 2) + '</td><td>' + dg(r.theta, 2) + '°</td><td>' + dg(r.vEd, 0) + ' / ' + fmt(r.vCap, 0) + '</td></tr>').join('') + '</table>';
    h += '<p class="note">' + T_('Ersatzbalken in Richtung der kurzen Stützweite, beidseitig eingespannt, Widerstand aus der Bruchlinientraglast, Steifigkeit mit halb gerissenem Querschnitt. Grenzwerte μ ≤ 3 (entspricht Φ = 1,2 der TWK beim Rechteckstoß) und Auflagerdrehwinkel θ ≤ 2° (UFC 3-340-02). Abplatzen, Durchschlag und Splitter sind nicht enthalten – bei Szenarien bleibt die Fachbemessung nötig.') + '</p>';
    return h;
  }

  STEP.schutz = function () {
    const q = A.q, pr = A.p.protection, th = pr.threat, P = q.prot;
    if (!M.PROT_TARGETS[A.ui.protTarget]) A.ui.protTarget = 'aussenwand';
    const key = A.ui.protTarget, cp = P.comps[key], c = pr.components[key];
    let h = '<h2>' + T_('Schutznachweise') + '</h2><p class="lead">' + T_('Den Schutzgrad hast du schon gewählt (Schritt <a data-goto="schutzgrad">Schutzgrad</a>). Hier kommen die Nachweise dazu: geforderte Treffer, Schichten je Bauteil und die Prüfunterlagen. Das macht erst Sinn, wenn Grundriss und Dicken stehen.') + '</p>';
    h += specialScenariosSection();
    h += BP.planning.threatHTML(A.p, q);
    h += '<h3>' + T_('Sonderschutz: Schichten und Prüfunterlagen') + '</h3><p class="note">' + T_('Für Beschuss, Splitter oder eigene Druckannahmen: Schichten je Bauteil planen und Prüfunterlagen zuordnen. Das Tool rechnet Dicken, Flächenmassen und Mengen, die Schutzwirkung muss eine Unterlage belegen.') + '</p>';
    h += fields(sel('protection.threat.family', T_('Beanspruchung'), Object.entries(M.PROT_FAMILIES).map(([k, v]) => [k, T_(v)])));
    const fam = th.family;
    if (M.PROT_PROJECTILE.includes(fam)) {
      h += fields(txt('protection.threat.projectile', T_('Kaliber / genaue Geschossbezeichnung'), { placeholder: T_('aus Anforderung oder Prüfunterlage') }) + txt('protection.threat.core', T_('Geschossaufbau / Kernmaterial')) +
        num('protection.threat.velocity', T_('Auftreffgeschwindigkeit'), 'm/s', { min: 0, max: 10000, nullable: true }) + num('protection.threat.shots', T_('Geforderte Trefferzahl'), '', { min: 1, max: 1000000, step: 1, nullable: true }) +
        num('protection.threat.spacing', T_('Trefferabstand'), 'cm', { min: 0, max: 100000, nullable: true }) + num('protection.threat.distance', T_('Schussentfernung'), 'm', { min: 0, max: 100000, nullable: true }) +
        num('protection.threat.angle', T_('Winkel zur Flächennormalen'), '°', { min: 0, max: 90, nullable: true, hint: T_('0° = senkrecht') }) +
        area('protection.threat.pattern', T_('Trefferbild / betroffene Flächen'), { placeholder: T_('Treffer je Prüfbereich, Verteilung, Randabstände, Angriffsseiten') }));
    } else if (fam === 'fragments') {
      h += fields(txt('protection.threat.projectile', T_('Splitterform und -masse')) + num('protection.threat.velocity', T_('Auftreffgeschwindigkeit'), 'm/s', { min: 0, max: 10000, nullable: true }) +
        area('protection.threat.pattern', T_('Trefferbild / betroffene Flächen')));
    } else if (fam === 'fallout') {
      h += '<p class="note">' + T_('Abschirmung über Decke und Erde: {n} Halbwertsschichten (siehe Nutzung & Lasten). Zusatzschichten auf der Decke werden über ihre Flächenmasse mitgezählt.', { n: fmt(q.struct.shield.halvings, 1) }) + '</p>';
    }
    if (fam === 'blast' || fam === 'combined') h += fields(area('protection.threat.notes', T_('Druck-Zeit-Verlauf, Impuls, Belastungsrichtung')));
    if (fam !== 'undefined') {
      h += fields(area('protection.threat.criterion', T_('Geforderte Schutzwirkung / Akzeptanzkriterien'), { placeholder: T_('z. B. kein Durchschuss, rückseitige Abplatzungen, Funktion der Verschlüsse') }) +
        '<label for="stdf" class="stack">' + T_('Prüf- / Bemessungsgrundlage mit Ausgabe') + '</label><input id="stdf" class="wide-inp" style="grid-column:1/-1" list="protStd" data-path="protection.threat.standard" value="' + esc(th.standard) + '">' +
        '<datalist id="protStd"><option value="' + T_('VPAM-APR Fassung 3 (15.03.2021) + produktspezifische Richtlinie') + '"><option value="' + T_('DIN EN 1522 / DIN EN 1523 – Fenster, Türen, Abschlüsse') + '"><option value="' + T_('Projektspezifisches Prüf- und Bemessungskonzept') + '"></datalist>' +
        txt('protection.threat.classification', T_('Geforderte Klasse / Projekt-Schutzziel')));
    }

    h += '<h3>' + T_('Schichten je Bauteil') + '</h3><div class="targets">' + Object.entries(M.PROT_TARGETS).map(([k, def]) => {
      const st = P.comps[k].state;
      return '<button class="tgt' + (k === key ? ' on' : '') + '" data-act="protTarget" data-k="' + k + '"><span>' + T_(def.name) + '</span><i class="dot ' + (STATE_CLS[st] || 'none') + '" title="' + T_(STATE_TXT[st]) + '"></i></button>';
    }).join('') + '</div>';
    h += '<p class="note">' + T_('Reihenfolge von der Angriffsseite nach innen. Schichten vor dem Beton liegen außen, danach innen. Abdichtung und Dämmung stehen unter Konstruktion.') + '</p>';
    if (!cp.exists) h += '<p class="note"><b>' + T_('Dieses Bauteil gibt es im Grundriss noch nicht.') + '</b></p>';
    h += c.layers.map((l, i) => {
      const base = 'protection.components.' + key + '.layers.' + i;
      const mat = M.PROT_MATERIALS[l.material] || M.PROT_MATERIALS.other;
      return '<div class="layer"><div class="layer-head"><b>' + (i + 1) + '</b>' +
        '<select data-path="' + base + '.material">' + Object.entries(M.PROT_MATERIALS).map(([k2, v]) => '<option value="' + k2 + '"' + (k2 === l.material ? ' selected' : '') + '>' + esc(T_(v.name)) + '</option>').join('') + '</select>' +
        '<button class="x" data-act="protMove" data-i="' + i + '" data-dir="-1" aria-label="' + T_('nach außen') + '"' + (i === 0 ? ' disabled' : '') + '>↑</button><button class="x" data-act="protMove" data-i="' + i + '" data-dir="1" aria-label="' + T_('nach innen') + '"' + (i === c.layers.length - 1 ? ' disabled' : '') + '>↓</button><button class="x" data-act="protDel" data-i="' + i + '" aria-label="' + T_('Schicht löschen') + '">×</button></div>' +
        '<div class="layer-grid"><input type="text" data-path="' + base + '.grade" value="' + esc(l.grade) + '" placeholder="' + T_('Güte / Produkt') + '">' +
        '<div class="inp"><input type="number" step="any" min="0.1" max="5000" data-min="0.1" data-max="5000" data-null="1" data-scale="1" data-path="' + base + '.thickness" value="' + esc(l.thickness) + '" placeholder="' + T_('Dicke') + '"><span class="u">mm</span></div>' +
        '<input type="text" data-path="' + base + '.strength" value="' + esc(l.strength) + '" placeholder="' + T_('Kennwerte / Festigkeit / Härte') + '">' +
        '<div class="inp"><input type="number" step="any" min="0" max="25000" data-min="0" data-max="25000" data-null="1" data-scale="1" data-path="' + base + '.density" value="' + esc(l.density) + '" placeholder="' + (mat.rho != null ? mat.rho : T_('Dichte')) + '"><span class="u">kg/m³</span></div></div></div>';
    }).join('');
    const hasConcrete = c.layers.some((l) => l.material === 'concrete');
    h += '<div class="rowbtns"><button class="btn small ghost" data-act="protAdd">' + T_('Schicht hinzufügen') + '</button>' +
      (cp.def.build && !hasConcrete ? '<button class="btn small ghost" data-act="protSeed">' + T_('Beton aus Konstruktion übernehmen') + '</button>' : '') +
      (cp.deviates ? '<button class="btn small" data-act="protApply">' + T_('Betondicke in Konstruktion übernehmen') + '</button>' : '') + '</div>';
    if (c.layers.length) {
      h += table([
        row(T_('Gesamtdicke'), cp.total != null ? fmt(cp.total * 1000, 0) + ' mm' : T_('Dicken offen')),
        row(T_('Flächenmasse'), cp.mass != null ? fmt(cp.mass, 0) + ' kg/m²' : T_('Dicken / Dichten offen')),
      ].concat(cp.def.build ? [row(T_('Beton im Schichtaufbau / in Konstruktion'), fmt(cp.concrete * 100, 1) + ' / ' + fmt(cp.buildT * 100, 1) + ' cm')] : []));
      const its = P.items.filter((x) => x.target === key);
      if (its.length) h += '<p class="note">' + T_('In der Stückliste: {list}.', { list: its.map((x) => fmt(x.area, 1) + ' m² ' + esc(x.name.split(': ')[1] || x.name) + (x.mass != null ? ' (' + fmt(x.mass, 2) + ' t)' : '')).join('; ') }) + '</p>';
    }
    if (key !== 'durchfuehrungen' && key !== 'zugang') h += fields(area('protection.components.' + key + '.reinforcement', T_('Bewehrung, Betondeckung, Verankerung')));
    h += fields(area('protection.components.' + key + '.connections', key === 'durchfuehrungen' ? T_('Durchführungen: Futterrohre, Dichtungen, Schutzbauteile') : T_('Anschlüsse, Fugen, Rahmen, Durchführungen')));
    if (key === 'durchfuehrungen') h += '<p class="note">' + T_('{n} Durchführungen aus gezeichneten Leitungen, {m} weitere. Jede Durchführung ist eine Schwachstelle der Hülle.', { n: q.routes.hull, m: esc(A.p.tech.penetrations) }) + '</p>';

    const ev = 'protection.components.' + key + '.evidence';
    h += '<h3>' + T_('Prüf- / Bemessungsunterlage') + '</h3>' + fields(txt(ev + '.reference', T_('Dokument / Bericht / Revision')) + txt(ev + '.authority', T_('Prüfstelle / Fachplanung')) + dateField(ev + '.date', T_('Datum der Unterlage')) +
      area(ev + '.scope', T_('Geprüfter Aufbau, Bedingungen, Geltungsbereich')));
    h += '<div class="rowbtns"><button class="btn small" data-act="protRecord">' + T_('Unterlage diesem Planstand zuordnen') + '</button></div>';
    h += '<ul class="msgs"><li class="' + (STATE_CLS[cp.state] || '') + '">' + ({
      fehlt: T_('Bauteil fehlt im Grundriss.'), offen: T_('Noch keine Unterlage zugeordnet. Schutzwirkung nicht nachgewiesen.'),
      veraltet: T_('Plan seit der Zuordnung geändert. Unterlage erneut prüfen und zuordnen.'), zugeordnet: T_('Unterlage diesem Planstand zugeordnet. Inhalt prüft das Tool nicht.'),
    }[cp.state]) + '</li></ul>';
    h += '<h3>' + T_('Offene Punkte') + '</h3>' + (P.gaps.length ? '<ul class="msgs">' + P.gaps.map((g) => '<li class="warn">' + esc(g) + '</li>').join('') + '</ul>' : '<p class="note">' + (P.used ? T_('Keine offenen Zuordnungen. Inhalte fachlich prüfen lassen.') : T_('Noch kein Schutzprofil festgelegt.')) + '</p>');
    h += '<p class="note">' + T_('Beschussfeste Dicken rechnet das Tool nicht aus. Tür- und Fensterklassen gelten nur für ihren geprüften Einbau. Grundlagen: <a href="https://www.vpam.eu/pruefrichtlinien/aktuell/vpam-apr/" target="_blank" rel="noopener">VPAM-APR</a>, <a href="https://www.din.de/de/meta/suche/62730!search?query=durchschusshemmend" target="_blank" rel="noopener">DIN EN 1522/1523</a>.') + '</p>';
    h += msgs('schutz') + stepNav('schutz');
    return h;
  };

  STEP.material = function () {
    const bm = A.q.bom, c = A.p.costs;
    let h = '<h2>' + T_('Material & Kosten') + '</h2><p class="lead">' + T_('Planmengen und Richtkosten stehen links. Konkrete Produkte und standortbezogene Lieferangebote stehen unter Einkauf.') + '</p>';
    h += BP.planning.procurementPanel(A.q);
    h += kpis([kpi(fmt(A.q.summary.concrete, 1) + ' m³', T_('Stahlbeton')), kpi(fmt(A.q.steel.total / 1000, 2) + ' t', T_('Betonstahl')), kpi(fmt(A.q.earth.Vexc, 0) + ' m³', T_('Aushub')), kpi(eur(bm.gross), T_('Richtkosten brutto'))]);
    h += selfPanel();
    h += '<h3>' + T_('Kosten nach Kategorie') + '</h3>' + table(Object.entries(bm.cats).map(([k, v]) => row(BP.calc.catText(k), eur(v))).concat([row(T_('Summe Bau netto'), eur(bm.net), 'sum')]));
    h += servicesPanel();
    h += '<h3>' + T_('Zuschläge') + '</h3>' + fields(num('costs.reserve', T_('Reserve'), '%', { min: 0, max: 50 }) + num('costs.vat', T_('Mehrwertsteuer'), '%', { min: 0, max: 30, hint: T_('nur auf Zugekauftes') }));
    h += currencySection();
    h += table([row(T_('Bau netto'), eur(bm.net)),
      row(T_('davon Firma, Material, Geräte'), eur(bm.net - bm.ownCost)),
      row(T_('davon Eigenleistung'), bm.ownH > 0 ? fmt(bm.ownH, 0) + ' h' + (bm.ownCost > 0 ? ' = ' + eur(bm.ownCost) : ' ' + T_('(unbewertet)')) : '–'),
      row(c.planningMode === 'prozent' ? T_('Planung {p} %', { p: fmt(c.planning, 0) }) : T_('Planung & Prüfung'), eur(bm.planning)), row(T_('Reserve {p} %', { p: fmt(c.reserve, 0) }), eur(bm.reserve)),
      row(T_('Netto gesamt'), eur(bm.sumNet), 'sum'), row(T_('MwSt. auf Zugekauftes'), eur(bm.vat)), row(T_('Brutto gesamt'), eur(bm.gross), 'sum')]);
    h += msgs('material');
    h += '<div class="rowbtns"><button class="btn" data-act="exportCsv">' + T_('Stückliste als CSV') + '</button><button class="btn ghost" data-act="resetPrices">' + T_('Richtpreise zurücksetzen') + '</button><button class="btn ghost" data-act="resetSelf">' + T_('Eigenleistung zurücksetzen') + '</button></div>';
    h += '<p class="note">' + T_('Richtpreise netto, Stand 2025/26, regional stark unterschiedlich. Für belastbare Zahlen Angebote einholen und hier eintragen.') + '</p>';
    h += stepNav('material');
    return h;
  };

  /* ---------- Eigenleistung, Geräte, Material ---------- */
  function selfPanel() {
    const S = A.p.self, q = A.q, bm = q.bom, own = (t) => S.trades[t] === 'eigen';
    const FE = [['firma', T_('Firma')], ['eigen', T_('Eigenleistung')]];
    let h = '<h3>' + T_('Ausführung: Firma oder Eigenleistung') + '</h3><p class="note">' + T_('Firma = Richtpreis inkl. Einbau. Eigenleistung = nur Material, Mietgeräte und Betriebskosten, dazu deine Stunden.') + '</p>';
    h += '<div class="rowbtns"><button class="btn ghost" data-act="selfAllFirm">' + T_('Alles Firma') + '</button><button class="btn ghost" data-act="selfAllOwn">' + T_('Rohbau und Ausbau in Eigenleistung') + '</button></div>';
    h += fields(Object.entries(M.TRADES).map(([k, n]) => '<label>' + T_(n) + '</label>' + seg('self.trades.' + k, FE)).join('') +
      num('self.wage', T_('Eigene Stunde bewerten mit'), '€/h', { min: 0, max: 200, hint: T_('0 = unbezahlt; Helfer z. B. 15–25') }));
    h += '<h3>' + T_('Geräte') + '</h3>';
    let g = '';
    if (own('erde')) {
      g += '<label>' + T_('Bagger') + '</label>' + seg('self.equip.bagger', [['miete', T_('Miete ohne Fahrer')], ['eigen', T_('Eigener Bagger')]]);
      g += S.equip.bagger === 'eigen' ? num('self.equip.baggerOwn', T_('Betriebskosten Bagger'), T_('€/Tag'), { min: 0, max: 2000, hint: T_('Diesel, Verschleiß, Transport') }) : num('self.equip.baggerRent', T_('Miete Bagger'), T_('€/Tag'), { min: 0, max: 2000 });
      g += '<label>' + T_('Rüttelplatte') + '</label>' + seg('self.equip.ruettler', [['miete', T_('Miete')], ['eigen', T_('Eigene')]]);
      g += S.equip.ruettler === 'eigen' ? num('self.equip.ruettlerOwn', T_('Betrieb Rüttelplatte'), T_('€/Tag'), { min: 0, max: 500 }) : num('self.equip.ruettlerRent', T_('Miete Rüttelplatte'), T_('€/Tag'), { min: 0, max: 500 });
    } else g += '<p class="note" style="grid-column:1/-1">' + T_('Erdarbeiten durch Firma: Bagger mit Fahrer zum Richtpreis. Für eigenen oder gemieteten Bagger Erdarbeiten auf Eigenleistung stellen.') + '</p>';
    g += '<label>' + T_('Beton fördern') + '</label>' + seg('self.equip.pump', [['pumpe', T_('Pumpe')], ['rutsche', T_('Rutsche')], ['kuebel', T_('Kübel am Bagger')]]);
    if (S.equip.pump === 'rutsche') g += num('self.equip.chuteReach', T_('Reichweite Rutsche'), 'm', { min: 1, max: 15 });
    if (own('beton')) g += num('self.equip.vibratorRent', T_('Innenrüttler Miete'), T_('€/Tag'), { min: 0, max: 300 });
    h += fields(g);
    const cc = S.concrete;
    h += '<h3>' + T_('Beton') + '</h3>' + fields('<label>' + T_('Bezug') + '</label>' + seg('self.concrete.mode', [['transport', T_('Transportbeton')], ['werk', T_('Eigenes Werk')], ['baustelle', T_('Selbst mischen')]]) +
      (cc.mode === 'transport' ? num('self.concrete.c30', T_('Konstruktionsbeton {c}', { c: esc(A.p.build.concrete) }), '€/m³', { min: 0, max: 600, hint: T_('frei Baustelle, WU') }) + num('self.concrete.c12', T_('Sauberkeitsbeton C12/15'), '€/m³', { min: 0, max: 400 }) : '') +
      (cc.mode === 'werk' ? num('self.concrete.werk', T_('Selbstkosten Beton'), '€/m³', { min: 0, max: 600, hint: T_('eigene Grube / Mischanlage inkl. Transport') }) : '') +
      (cc.mode === 'baustelle' ? num('self.concrete.cementT', T_('Zement'), '€/t', { min: 0, max: 1000, hint: T_('Sackware: Preis je 25-kg-Sack × 40 = Preis je t') }) + num('self.concrete.cementKg', T_('Zementgehalt'), 'kg/m³', { min: 200, max: 500 }) +
        num('self.concrete.aggT', T_('Gesteinskörnung'), '€/t', { min: 0, max: 200, hint: T_('0 = eigene Grube') }) + num('self.concrete.aggPerM3', T_('Gesteinskörnung je m³'), 't', { min: 1, max: 2.5 }) +
        num('self.concrete.mixers', T_('Mischer gesamt'), '', { min: 0, max: 40, step: 1 }) + num('self.concrete.ownMixers', T_('davon eigene'), '', { min: 0, max: 40, step: 1 }) +
        num('self.concrete.batchL', T_('Nutzinhalt je Mischung'), 'L', { min: 20, max: 3000 }) + num('self.concrete.batchesH', T_('Mischungen je Stunde'), '', { min: 1, max: 20 }) +
        num('self.concrete.hoursDay', T_('Mischstunden je Tag'), 'h', { min: 1, max: 24 }) + num('self.concrete.mixerRent', T_('Miete je Mischer'), T_('€/Tag'), { min: 0, max: 500 }) : ''));
    if (cc.mode === 'baustelle' && bm.cm.mix) {
      const mx = bm.cm.mix, big = mx.pours.reduce((a, x) => (x.V > a.V ? x : a), mx.pours[0]);
      h += kpis([kpi(eur(mx.mat), T_('Material je m³')), kpi(fmt(mx.capDay, 1) + ' m³', T_('Mischleistung je Tag')), kpi(fmt(big.V, 1) + ' m³', T_('größter Abschnitt ({name})', { name: big.name })), kpi(fmt(mx.cementBags, 0), T_('Sack Zement'))]);
    }
    if (own('schalung')) {
      const fw = S.formwork;
      h += '<h3>' + T_('Schalung') + '</h3>' + fields('<label>' + T_('Schalung') + '</label>' + seg('self.formwork.mode', [['miete', T_('System mieten')], ['holz', T_('Eigene Holzschalung')], ['vorhanden', T_('Vorhanden')]]) +
        (fw.mode === 'miete' ? num('self.formwork.rent', T_('Miete Systemschalung'), '€/m²', { min: 0, max: 100, hint: T_('je Einsatz') }) : '') +
        (fw.mode === 'holz' ? num('self.formwork.board', T_('Schalungsplatten'), '€/m²', { min: 0, max: 100 }) + num('self.formwork.uses', T_('Einsätze je Platte'), '', { min: 1, max: 50, step: 1 }) : '') +
        (fw.mode !== 'miete' ? num('self.formwork.extra', T_('Kantholz, Spanner, Schalöl'), '€/m²', { min: 0, max: 50 }) : '') +
        num('self.formwork.propsRent', T_('Deckenstützen Miete'), '€/m²', { min: 0, max: 50 }));
    }
    const P = M.PRICES, SP = M.SPLIT;
    h += '<h3>' + T_('Material zu Selbstkosten') + '</h3><p class="note">' + T_('Leer = Marktpreis. 0 = vorhanden. Gilt auch, wenn eine Firma einbaut.') + '</p>' + fields(
      [['kies', T_('Kies / Schotter'), '€/m³'], ['boden', T_('Boden für Hügel'), '€/m³'], ['abfuhr', T_('Bodenabfuhr / Entsorgung'), T_('€/m³ lose')], ['stahl', T_('Betonstahl geschnitten & gebogen'), '€/t'], ['daemmung', T_('Dämmung'), '€/m³'], ['mauerwerk', T_('Mauerwerk Material'), '€/m²']]
        .map(([k, n, u]) => num('self.mat.' + k, n, u, { min: 0, max: 100000, nullable: true, placeholder: String(SP[k] ? SP[k].m : P[k].p) })).join(''));
    return h;
  }
  /* Währung, Wechselkurs und Baupreisniveau: Beträge werden intern in Euro gerechnet und in der Projektwährung gezeigt */
  function currencySection() {
    const L = BP.laender, p = A.p, cur = L.currency(p), fx = L.fxInfo(cur, p), pl = L.pli(p), inf = L.info(L.country(p));
    const curs = [...new Set(Object.values(BP.laenderDaten.countries).map((x) => x.cur).concat(['EUR', 'USD']))].sort();
    let h = '<h3>' + T_('Währung und Preisniveau') + '</h3>';
    h += fields(sel('costs.currency', T_('Währung'), [['', T_('wie Land ({c})', { c: inf.cur })]].concat(curs.map((c) => [c, c]))) +
      (cur !== 'EUR' ? num('costs.fx', T_('Wechselkurs'), cur + '/EUR', { min: 1e-6, max: 1e9, nullable: true, dec: 6, placeholder: fx.rate ? I18.num(fx.rate, 4) : T_('fehlt'), hint: fx.src === 'manual' ? T_('eigener Wert') : fx.rate ? T_('{src}, Stand {d}', { src: fx.src === 'CA' ? 'currency-api' : fx.src === 'ECB' ? T_('EZB') : fx.src, d: fx.date ? I18.date(fx.date) : '–' }) : T_('kein Kurs vorhanden') }) : '') +
      num('costs.pli', T_('Baupreisniveau'), T_('× Deutschland'), { min: 0.05, max: 10, nullable: true, dec: 3, placeholder: I18.num(inf.pli || 1, 3), hint: pl.src === 'manual' ? T_('eigener Wert') : inf.pli ? T_('Baupreise relativ zu Deutschland (Eurostat 2024 bzw. Weltbank ICP 2021)') : T_('kein Tabellenwert') }));
    if (cur !== 'EUR') h += '<div class="rowbtns"><button class="btn ghost" data-act="fx">' + T_('Aktuelle Kurse abrufen') + '</button></div>';
    h += '<p class="note">' + T_('Richtpreise des Programms gelten für Deutschland und werden mit dem Baupreisniveau und dem Wechselkurs umgerechnet. Eigene Preise und Angebote gelten wie eingegeben.') + '</p>';
    return h;
  }
  function servicesPanel() {
    const c = A.p.costs, bm = A.q.bom;
    let h = '<h3>' + T_('Planung & Prüfung') + '</h3><p class="note">' + T_('Das Tool ersetzt keine unterschriebene Statik mit Bewehrungsplänen. Leere Beträge = Richtwert nach Bauwerksgröße.') + '</p>';
    h += fields('<label>' + T_('Ansatz@@Kosten') + '</label>' + seg('costs.planningMode', [['posten', T_('Einzelposten')], ['prozent', T_('Prozent')]]) +
      (c.planningMode === 'prozent' ? num('costs.planning', T_('Planung, Statik, Gutachten'), '%', { min: 0, max: 40 }) : bm.services.map((s, i) =>
        '<label class="chkrow" style="grid-column:1/-1;margin-top:6px"><input type="checkbox" data-path="costs.services.' + i + '.on" data-bool="1"' + (s.on ? ' checked' : '') + '>' + esc(I18.maybe(s.name)) + '</label>' +
        (s.on ? num('costs.services.' + i + '.amount', T_('Betrag'), '€', { min: 0, max: 1e7, nullable: true, placeholder: T_('ca. {a}', { a: fmt(s.auto * BP.laender.fx(), 0) }) }) : '')).join('')));
    return h;
  }

  STEP.ablauf = function () {
    const s = A.q.schedule, p = A.p;
    const start = p.schedule.start ? new Date(p.schedule.start) : null;
    let h = '<h2>' + T_('Bauablauf') + '</h2><p class="lead">' + T_('Dauern aus Mengen und Leistungswerten, Abhängigkeiten inklusive Aushärtezeiten. Der Regler unter dem Modell spielt den Bau Tag für Tag durch.') + '</p>';
    const LC = BP.laender.country(p), regs = BP.laender.regions(LC);
    h += fields('<label for="sdate">' + T_('Baubeginn') + '</label><div class="inp"><input id="sdate" type="date" data-path="schedule.start" value="' + esc(p.schedule.start || '') + '"></div>' +
      (regs.length ? sel('site.region', T_('Feiertage'), [['', LC === 'DE' ? T_('nur bundesweite Feiertage') : T_('{land}, nur landesweite Feiertage', { land: BP.laender.name(LC) })]].concat(regs.map(([k, v]) => [k, LC === 'DE' ? T_(v) : v]))) : '') +
      '<label class="chkrow" style="grid-column:1/-1"><input type="checkbox" data-path="schedule.winter.on" data-bool="1"' + (p.schedule.winter.on ? ' checked' : '') + '>' + T_('Winterpause vom {from} bis {to}', { from: esc(I18.date('2000-' + p.schedule.winter.from, { year: undefined })), to: esc(I18.date('2000-' + p.schedule.winter.to, { year: undefined })) }) + '</label>' +
      num('schedule.tempOffset', T_('Temperatur gegenüber dem Klima-Startwert'), 'K', { min: -10, max: 10, hint: T_('Höhenlage, Küste') }));
    if (s.noHolidays && s.noHolidays.length) h += '<p class="note">' + T_('Für {y} liegen keine Feiertagsdaten vor; dort sind nur Wochenenden arbeitsfrei.', { y: s.noHolidays.join(', ') }) + '</p>';
    const dIso = (iso) => (iso ? I18.date(iso) : '–');
    h += kpis([kpi(T_('{n} AT', { n: s.total }), T_('Arbeitstage')), kpi(T_('{n} Wochen', { n: fmt(s.weeks, 1) }), T_('Bauzeit')), kpi(dIso(s.end), T_('Fertigstellung')), kpi(s.wh ? T_('{n} AT', { n: s.wh.d }) + (s.wh.cal != null ? ' / ' + T_('{n} KT', { n: s.wh.cal }) : '') : T_('keine'), T_('Wasserhaltung'))]);
    if (s.wh) h += '<p class="note">' + T_('Wasserhaltung {reason}.', { reason: esc(s.wh.reason) }) + '</p>';
    h += '<p class="note">' + T_('Wartezeiten nach dem Betonieren aus dem Reifegrad bei Monatsmitteltemperatur: Decke ausschalen nach {strip} Kalendertagen, Erdauflast nach {load} Tagen (entspricht {bs} bzw. {bl} Tagen bei 20 °C).', { strip: s.cure.strip, load: s.cure.load, bs: s.cure.base.strip, bl: s.cure.base.load }) +
      (s.breaks.length ? ' ' + T_('Unterbrechungen: {list}.', { list: s.breaks.map((b2) => dIso(b2.from) + ' (' + T_('{n} Tage', { n: b2.days }) + (b2.winter ? ', ' + T_('Winterpause') : '') + ')').join(', ') }) : '') + '</p>';
    if (s.cold.length) h += '<p class="note" style="color:var(--warn)">' + T_('Bei unter +5 °C (Monatsmittel): {list} – Winterbaumaßnahmen einplanen oder Baubeginn verschieben.', { list: s.cold.map((t) => esc(t.name.split(' (')[0]) + ' (' + dIso(t.dateStart) + ')').join(', ') }) + '</p>';
    h += '<h3>' + T_('Kolonnen') + '</h3>' + fields(num('schedule.crews.rohbau', T_('Rohbau (Schalung, Bewehrung, Beton)'), '', { min: 1, max: 5, step: 1 }) + num('schedule.crews.erdbau', T_('Erdbau'), '', { min: 1, max: 5, step: 1 }) +
      num('schedule.crews.abdichtung', T_('Abdichtung'), '', { min: 1, max: 5, step: 1 }) + num('schedule.crews.technik', T_('Haustechnik'), '', { min: 1, max: 5, step: 1 }) + num('schedule.crews.ausbau', T_('Ausbau'), '', { min: 1, max: 5, step: 1 }));
    h += '<p class="note">' + T_('Je Gewerk laufen höchstens so viele Vorgänge gleichzeitig, wie Kolonnen da sind. Mit einer Rohbaukolonne entstehen die Zugänge in den Wartezeiten des Rohbaus.') + '</p>';
    h += '<h3>' + T_('Leistungswerte') + '</h3><div class="fields">' + Object.entries(M.RATES).map(([k, r]) => {
      const cur = p.rates[k];
      return '<label>' + esc(T_(r.name)) + '</label><div class="inp"><input type="number" step="any" data-rate="' + k + '" value="' + esc(cur) + '" placeholder="' + r.v + '"><span class="u">' + T_(r.unit) + '</span></div>';
    }).join('') + '</div>';
    h += '<div class="rowbtns"><button class="btn ghost small" data-act="resetRates">' + T_('Leistungswerte und Dauern zurücksetzen') + '</button></div>';
    h += '<h3>' + T_('Maschinen') + '</h3>' + table([row(T_('Bagger'), T_('{n} Tage', { n: s.machine.bagger })), row(T_('Rüttelplatte'), T_('{n} Tage', { n: s.machine.ruettler })), row(((p.self || {}).equip || {}).pump === 'rutsche' || ((p.self || {}).equip || {}).pump === 'kuebel' ? T_('Betoniertage') : T_('Betonpumpe'), T_(((p.self || {}).equip || {}).pump === 'rutsche' || ((p.self || {}).equip || {}).pump === 'kuebel' ? '{n} Tage' : '{n} Einsätze', { n: s.machine.pours }))]);
    h += msgs('ablauf') + stepNav('ablauf');
    return h;
  };


  function autoText(k, d, q) {
    if (k === 'exits') return d ? T_('Im Grundriss vorhanden.') : T_('Im Grundriss fehlt ein zweiter Zugang.');
    if (k === 'protection') return !q.prot.used ? T_('Noch kein Schutzprofil festgelegt (Schritt Schutznachweise).') : d ? T_('Alle Unterlagen dem Planstand zugeordnet.') : T_('{n} offene Punkte unter Schutznachweise.', { n: q.prot.gaps.length });
    if (k === 'routes') return !q.routes.list.length ? T_('Noch keine Leitungen gezeichnet.') : d ? T_('Keine Kollisionen erkannt, {n} Durchführungen erfasst.', { n: q.routes.hull }) : T_('Leitungen haben Kollisionen oder Konflikte.');
    if (k === 'hazard') {
      const hs = hazardState(q);
      if (!hs.chosen) return T_('Kein Schutzgrad gewählt (Schritt Schutzgrad).');
      if (d) return q.struct.blast ? T_('Luftstoß {q} kN/m² nachgewiesen, Mindestwerte eingehalten.', { q: fmt(q.struct.blast.qk, 0) }) : T_('Schutzgrad ohne Luftstoß, Mindestwerte eingehalten.');
      return [hs.minFail ? T_('Mindestdicken unterschritten') : '', hs.accFail ? T_('Lastfall Luftstoß nicht erfüllt') : '', hs.heqFail ? T_('Betonäquivalent über der Decke zu klein') : ''].filter(Boolean).join(', ') + '.';
    }
    if (k === 'special') {
      const ss = specialState(q);
      if (!ss.on.length) return T_('Keine Treffer-Szenarien gefordert.');
      const open = ss.on.filter((k2) => !q.planning.threats.some((t) => t.documented && t.s.covers === k2));
      if (!open.length) return T_('Alle geforderten Sonderanforderungen durch nachgewiesene Szenarien abgedeckt.');
      return T_(open.length === 1 ? '{n} Sonderanforderung ohne zugeordnetes, nachgewiesenes Szenario' : '{n} Sonderanforderungen ohne zugeordnetes, nachgewiesenes Szenario', { n: open.length }) + (ss.doc ? ' ' + T_('(Fachbemessung „{ref}“ eingetragen)', { ref: esc(q.p.hazard.expert.reference) }) : '') + '.';
    }
    return '';
  }

  /* ---------- Bauantrag ---------- */
  function tin(path, label, o = {}) {
    const id = 'f' + (fid++), cur = PN.get(A.p, path);
    return '<label for="' + id + '">' + label + (o.hint ? '<small>' + o.hint + '</small>' : '') + '</label><div class="inp"><input id="' + id + '" type="' + (o.type || 'text') + '" data-path="' + esc(path) + '" value="' + esc(cur || '') + '"' +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + ' autocomplete="off"></div>';
  }
  /* Varianten: Planungsstände speichern, vergleichen, übernehmen */
  STEP.varianten = function () {
    const p = A.p, q = A.q, VA = BP.varianten, list = p.variants || [], full = list.length >= M.VARIANTS_MAX;
    let h = '<h2>' + T_('Varianten') + '</h2><p class="lead">' + T_('Planungsstände speichern und nebeneinander vergleichen: Mengen, Kosten, Bauzeit, Ausnutzung. Jede Variante lässt sich wieder übernehmen.') + '</p>';
    h += '<div style="display:flex;gap:6px"><input id="varName" class="wide-inp" maxlength="80" placeholder="' + esc(T_('Name, z. B. „Decke 50 cm, C35/45“')) + '"><button class="btn" data-act="varSave"' + (full ? ' disabled' : '') + '>' + T_('Speichern') + '</button></div>';
    if (full) h += '<p class="note">' + T_('Höchstens {n} Varianten. Zum Speichern eine löschen oder überschreiben.', { n: M.VARIANTS_MAX }) + '</p>';
    if (!list.length) {
      h += '<p class="note">' + T_('Noch keine Variante gespeichert. Den aktuellen Stand speichern, dann ändern und wieder speichern. Typische Vergleiche: WU-Beton oder Bahnen, Erdüberdeckung, Bauteildicken, Eigenleistung oder Firma, eine oder zwei Ebenen.') + '</p>';
      return h + stepNav('varianten');
    }
    const cur = VA.snapshot(p), mc = VA.metrics(p, q), dc = VA.describe(p);
    const sup = (n) => String(n).split('').map((ch) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+ch] || ch).join('');
    const val = (r, v) => (v == null ? '–' : r.money ? eur(v) : r.k === 'pf' && v >= 1e4 ? fmt(v / Math.pow(10, Math.floor(Math.log10(v))), 1) + '·10' + sup(Math.floor(Math.log10(v))) : fmt(v * (r.scale || 1), r.d) + (r.unit ? ' ' + T_(r.unit) : ''));
    const delta = (r, v, c) => {
      if (v == null || c == null || Math.abs(v - c) < 1e-9 * Math.max(1, Math.abs(c))) return '';
      const dv = v - c, good = r.better ? (r.better === 'min' ? dv < 0 : dv > 0) : null;
      const txt = r.k === 'pf' ? '×' + fmt(v / c, v / c < 10 ? 2 : 0) : (dv > 0 ? '+' : '−') + (r.money ? eur(Math.abs(dv)) : fmt(Math.abs(dv) * (r.scale || 1), r.d) + (r.unit ? ' ' + T_(r.unit) : '')) + (c ? ' (' + (dv > 0 ? '+' : '−') + fmt(Math.abs(dv / c) * 100, 0) + ' %)' : '');
      return '<span class="' + (good == null ? '' : good ? 'okc' : 'errc') + '">' + txt + '</span>';
    };
    const descRows = [[T_('Land'), 'country'], [T_('Bauteile'), 'dims'], [T_('Beton'), 'concrete'], [T_('Abdichtung'), 'wp'], [T_('Erdüberdeckung'), 'cover'], [T_('Ebenen'), 'levels']];
    const dtxt = (d, k) => (k === 'cover' ? fmt(d.cover, 2) + ' m' + (d.mound ? ', ' + T_('Erdhügel') : '') : String(d[k]));
    const card = (title, sub, m, d, btn) => {
      const diffs = d ? descRows.filter(([, k]) => dtxt(d, k) !== dtxt(dc, k)).map(([lab, k]) => esc(lab) + ': <b>' + esc(dtxt(d, k)) + '</b>') : [];
      const rows = VA.ROWS.filter((r) => VA.value(r, m) != null || (d && VA.value(r, mc) != null))
        .map((r) => '<tr' + (r.warn && VA.value(r, m) != null && r.warn(VA.value(r, m)) ? ' class="bad"' : '') + '><th>' + T_(r.label) + '</th><td>' + val(r, VA.value(r, m)) + '</td>' + (d ? '<td>' + delta(r, VA.value(r, m), VA.value(r, mc)) + '</td>' : '') + '</tr>');
      return '<div class="card vcard"><div class="vh"><div><b>' + esc(title) + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>' + (btn || '') + '</div>' +
        (d ? '<p class="vd">' + (diffs.length ? diffs.join(' · ') : T_('gleiche Eckdaten wie der aktuelle Stand')) + '</p>' : '') +
        (d ? '<p class="vd">' + VA.ROWS.filter((r) => ['cost', 'concrete', 'weeks', 'etaMax'].includes(r.k)).map((r) => { const dl = delta(r, VA.value(r, m), VA.value(r, mc)); return dl ? esc(T_(r.label)) + ' ' + dl : ''; }).filter(Boolean).join(' · ') + '</p>' : '') +
        '<details' + (d ? '' : ' open') + '><summary>' + T_('Kennwerte') + '</summary><table class="res vm">' + rows.join('') + '</table></details></div>';
    };
    h += '<h3>' + T_('Vergleich mit dem aktuellen Stand') + '</h3>';
    h += card(T_('Aktueller Stand'), esc(dc.dims), mc, null);
    list.forEach((v, i) => {
      const same = VA.same(cur, v.snap);
      h += card(v.name, (v.created ? esc(I18.date(v.created.slice(0, 10))) : '') + (same ? ' · ' + T_('= aktuell') : ''), v.m, VA.describe(v.snap),
        '<button class="btn small" data-act="varLoad" data-i="' + i + '"' + (same ? ' disabled' : '') + '>' + T_('Übernehmen') + '</button>');
    });
    h += '<p class="note">' + T_('Abweichungen gegenüber dem aktuellen Stand: grün besser, rot schlechter. Die Kennwerte stammen aus der Rechnung beim Speichern der Variante. Übernehmen ersetzt den aktuellen Stand; „Rückgängig“ holt ihn zurück.') + '</p>';
    h += '<h3>' + T_('Varianten verwalten') + '</h3><ul class="varlist">' + list.map((v, i) => '<li><input type="text" class="wide-inp" maxlength="80" data-path="variants#' + esc(v.id) + '.name" value="' + esc(v.name) + '">' +
      '<div class="rowbtns"><button class="btn small ghost" data-act="varUpdate" data-i="' + i + '">' + T_('Mit aktuellem Stand überschreiben') + '</button><button class="btn small ghost" data-act="varDel" data-i="' + i + '">' + T_('Löschen') + '</button></div></li>').join('') + '</ul>';
    h += '<div class="rowbtns"><button class="btn ghost" data-act="varPrint">' + T_('Vergleich drucken / PDF') + '</button><button class="btn ghost" data-act="varCsv">' + T_('Vergleich als CSV') + '</button></div>';
    return h + stepNav('varianten');
  };

  /* Betrieb und Wartung */
  STEP.betrieb = function () {
    const p = A.p, q = A.q, W = BP.wartung, pl = W.plan(p, q), ST = BP.bauantrag.STATUS;
    let h = '<h2>' + T_('Betrieb & Wartung') + '</h2><p class="lead">' + T_('Was nach der Fertigstellung regelmäßig zu tun ist – abgeleitet aus der geplanten Ausstattung, mit Zuständigkeit und Grundlage. Als Kalenderdatei erinnert dein Kalender an die Termine.') + '</p>';
    h += fields(dateField('ops.start', T_('Inbetriebnahme')));
    if (pl.startAuto) h += '<p class="note">' + T_('Ohne Angabe gilt das Ende des Bauablaufs: {d}.', { d: esc(I18.date(pl.start)) }) + '</p>';
    const rec = pl.tasks.filter((x) => x.months);
    h += kpis([kpi(pl.tasks.length, T_('Aufgaben')), kpi(rec.length, T_('mit festem Intervall')), kpi(pl.nextDue ? esc(I18.date(pl.nextDue)) : '–', T_('nächster Termin')),
      kpi(pl.tasks.filter((x) => x.t.who === 'owner').length, T_('selbst erledigen'))]);
    h += '<div class="rowbtns"><button class="btn" data-act="wartungIcs">' + T_('Kalender (ICS)') + '</button><button class="btn ghost" data-act="wartungPrint">' + T_('Wartungsplan drucken / PDF') + '</button><button class="btn ghost" data-act="wartungCsv">' + T_('CSV') + '</button></div>';
    let comp = null;
    for (const x of pl.tasks) {
      if (x.comp !== comp) { h += (comp ? '</ul>' : '') + '<h3>' + T_(W.COMP[x.comp] || x.comp) + '</h3><ul class="maint">'; comp = x.comp; }
      const src = x.t.source ? ' · <a href="' + esc(x.t.source) + '" target="_blank" rel="noopener">' + T_('Quelle') + '</a>' : '';
      h += '<li><div>' + esc(W.tx(x.t.task)) + (x.guide ? ' <small class="tag">' + T_('Anhalt') + '</small>' : '') + (x.t.mandatory === true ? ' <small class="tag must">' + T_('Pflicht') + '</small>' : '') + '</div>' +
        '<div class="meta"><b>' + esc(W.intervalText(x)) + '</b> · ' + T_(W.WHO[x.t.who] || x.t.who) + (x.next ? ' · ' + T_('nächster Termin {d}', { d: esc(I18.date(x.next)) }) : '') + '</div>' +
        '<div class="meta small">' + esc(x.t.basis || '') + (x.t.note ? ' – ' + esc(W.tx(x.t.note)) : '') + ' · ' + T_(ST[x.t.status] || x.t.status) + src + '</div></li>';
    }
    if (comp) h += '</ul>';
    if (pl.notes.length) h += '<h3>' + T_('Hinweise') + '</h3><ul class="notes">' + pl.notes.map((n) => '<li>' + esc(W.tx(n)) + '</li>').join('') + '</ul>';
    h += '<p class="note">' + T_('Herstellerangaben und Auflagen der Behörde haben Vorrang. „Anhalt“: Für das Land liegt keine eigene Regel vor, es gelten die deutschen bzw. europäischen Regeln als Orientierung. Stand der Angaben: {d}.', { d: esc(I18.date(pl.checked)) }) + '</p>';
    return h + stepNav('betrieb');
  };

  STEP.bauantrag = function () {
    const p = A.p, q = A.q, B = BP.bauantrag, P = p.permit, tx = B.tx;
    const J = B.jurisdiction(p), e = J && J.e, ctx = B.ctxOf(p, q), f = ctx.facts;
    const badge = (st) => '<span class="st ' + ({ verified: 'ok', secondary: 'warn', unverified: 'off' }[st] || 'off') + '">' + T_(B.STATUS[st] || B.STATUS.unverified) + '</span>';
    const table = (rows) => '<table class="res txt">' + rows.join('') + '</table>';
    const link = (u, t) => (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(t || u.replace(/^https?:\/\//, '').split('/')[0]) + '</a>' : '');
    let h = '<h2>' + T_('Bauantrag') + '</h2><p class="lead">' + T_('Welches Verfahren gilt, welche Formulare und Unterlagen nötig sind und was der Bunkerplaner davon vorbereitet. Einreichen und unterschreiben muss die Bauherrschaft mit der bauvorlageberechtigten Person.') + '</p>';
    // Zuständigkeit und Lage
    const opts = B.options(p);
    h += '<h3>' + T_('Zuständigkeit und Lage') + '</h3>';
    h += fields((opts.length ? sel('permit.jur', T_('Zuständigkeit'), [['', T_('automatisch ({name})', { name: e ? tx(e.name) : '–' })]].concat(opts), { full: true }) : '') +
      sel('permit.zone', T_('Lage des Grundstücks'), [['', T_('noch offen')], ['bplan', T_('im Bebauungsplan, Festsetzungen eingehalten')], ['innen', T_('Innenbereich ohne Bebauungsplan')], ['aussen', T_('Außenbereich')]], { full: true }) +
      chk('permit.annex', T_('Nebenanlage zu einem bestehenden Wohnhaus auf dem Grundstück')));
    if (!e) {
      h += '<p class="note">' + T_('Für dieses Land liegen im Register noch keine Angaben vor. Bei der örtlichen Bauaufsicht nachfragen, welches Verfahren gilt; die Bauvorlagen unten (Baubeschreibung, Flächen, Kosten, Zeichnungen) helfen trotzdem.') + '</p>';
    } else {
      const pr = B.procedure(e, ctx);
      h += table([row(T_('Behörde'), esc(tx(e.authority))), row(T_('Rechtsgrundlage'), e.law.map((l) => (l.url ? link(l.url, l.name) : esc(l.name)) + (l.version ? '<br><small>' + esc(l.version) + '</small>' : '')).join('<br>')),
        e.classification ? row(T_('Einstufung'), esc(tx(e.classification))) : '', row(T_('Stand der Angaben'), I18.date(e.checked) + ' ' + badge(e.status))].filter(Boolean));
      h += '<h3>' + T_('Verfahren') + '</h3>';
      if (pr.zoneMissing && !pr.main) h += '<p class="note">' + T_('Lage des Grundstücks angeben, dann lässt sich das Verfahren bestimmen.') + '</p>';
      for (const [x, lab] of [[pr.main, T_('Genehmigung')], [pr.tech, T_('Bautechnik')]]) if (x) h += '<div class="card"><b>' + esc(lab) + ': ' + esc(x.name) + '</b> ' + badge(x.status) + '<p class="plain">' + esc(tx(x.when)) + '</p></div>';
      if (pr.zoneMissing && pr.main) h += '<p class="note">' + T_('Mit der Lage des Grundstücks kann ein einfacheres Verfahren in Frage kommen.') + '</p>';
      if (pr.others.length) h += '<details><summary>' + T_('Weitere Verfahren ({n})', { n: pr.others.length }) + '</summary><ul class="msgs">' + pr.others.map((x) => '<li><b>' + esc(x.name) + '</b>: ' + esc(tx(x.when)) + '</li>').join('') + '</ul></details>';
      if ((e.notes || []).length) h += '<ul class="msgs">' + e.notes.map((n) => '<li class="warn">' + esc(tx(n)) + '</li>').join('') + '</ul>';
      h += table([row(T_('Unterschrift der Bauvorlagen'), esc(tx(e.signer.rule)) + (e.signer.paragraph ? ' <small>(' + esc(e.signer.paragraph) + ')</small>' : '')),
        row(T_('Prüfung der Statik'), esc(tx(e.structural.rule)) + (e.structural.paragraph ? ' <small>(' + esc(e.structural.paragraph) + ')</small>' : '')),
        e.portal ? row(T_('Einreichung'), link(e.portal.url, e.portal.name) + (e.portal.mandatory ? ' – <b>' + T_('elektronisch vorgeschrieben') + '</b>' : '') + (e.portal.note ? '<br><small>' + esc(tx(e.portal.note)) + '</small>' : '')) : '',
        e.fees ? row(T_('Gebühren'), esc(tx(e.fees))) : ''].filter(Boolean));
      if ((e.other || []).length) h += '<h3>' + T_('Weitere Genehmigungen und Auskünfte') + '</h3>' + table(e.other.map((o) => row(T_(B.OTHER[o.topic] || o.topic), (o.authority ? esc(o.authority) + '<br>' : '') + '<small>' + esc(tx(o.note)) + '</small>' + (o.url ? ' ' + link(o.url) : ''))));
      // Amtliche Formulare
      h += '<h3>' + T_('Amtliche Formulare') + '</h3>';
      if (!(e.forms || []).length) h += '<p class="note">' + T_('Keine landesweiten Formulare im Register – Vordrucke gibt die zuständige Behörde bzw. das Portal aus.') + '</p>';
      else {
        h += '<ul class="forms">' + e.forms.map((fo) => {
          const u = fo.url || fo.landing, chk0 = u && P.formChecks[u];
          const st = !chk0 ? '' : chk0.changed ? '<span class="st warn">' + T_('geändert seit {d}', { d: I18.date(chk0.checked) }) + '</span>' : '<span class="st ok">' + T_('geprüft {d}', { d: I18.date(chk0.checked) }) + '</span>';
          return '<li><div>' + link(u, fo.title) + (fo.number ? ' <small>' + esc(fo.number) + '</small>' : '') + (fo.stand ? ' <small>' + T_('Stand {s}', { s: esc(fo.stand) }) + '</small>' : '') + ' ' + st +
            (fo.note ? '<br><small>' + esc(tx(fo.note)) + '</small>' : '') + '</div><div class="rowbtns">' +
            (u ? '<button class="btn small ghost" data-act="formCheck" data-url="' + esc(u) + '">' + T_('Aktualität prüfen') + '</button>' : '') +
            (fo.url && fo.fillable !== 'online' && (fo.fillable === true || /\.pdf([?#]|$)/i.test(fo.url)) ? '<button class="btn small ghost" data-act="formFill" data-url="' + esc(fo.url) + '" data-title="' + esc(fo.title) + '">' + T_('Ausfüllen') + '</button>' : '') + '</div></li>';
        }).join('') + '</ul><p class="note">' + T_('Die Links führen zu den Seiten der Behörden und damit zur jeweils gültigen Fassung. „Aktualität prüfen“ ruft das Formular über den lokalen Server ab und merkt sich einen Fingerabdruck – ändert die Behörde das Formular, zeigt die nächste Prüfung das an.') + '</p>';
      }
      if (A.ui.ff && A.ui.ff.fields) h += formFillPanel();
      // Unterlagen
      h += '<h3>' + T_('Unterlagen') + '</h3><table class="res"><tr><th>' + T_('Unterlage') + '</th><th>' + T_('Erstellt von') + '</th></tr>' +
        (e.documents || []).map((d) => '<tr><td>' + esc(d.name) + (d.note ? '<br><small>' + esc(tx(d.note)) + '</small>' : '') + '</td><td>' + (d.by === 'tool' ? '<b>' + T_(B.BY.tool) + '</b>' : (B.BY[d.by] ? T_(B.BY[d.by]) : '')) + '</td></tr>').join('') + '</table>';
    }
    // Beteiligte und Grundstück
    h += '<h3>' + T_('Angaben für Antrag und Bauvorlagen') + '</h3><p class="note">' + T_('Diese Angaben bleiben in der Projektdatei auf deinem Rechner und landen nur in den Unterlagen, die du selbst erzeugst.') + '</p>';
    h += '<details' + (P.bauherr.name ? '' : ' open') + '><summary>' + T_('Bauherrschaft') + '</summary>' + fields(tin('permit.bauherr.name', T_('Name')) + tin('permit.bauherr.street', T_('Straße, Hausnummer')) + tin('permit.bauherr.zip', T_('PLZ')) + tin('permit.bauherr.city', T_('Ort')) +
      tin('permit.bauherr.phone', T_('Telefon'), { type: 'tel' }) + tin('permit.bauherr.email', T_('E-Mail'), { type: 'email' })) + '</details>';
    h += '<details><summary>' + T_('Grundstück') + '</summary>' + fields(tin('permit.plot.street', T_('Straße, Hausnummer'), { placeholder: p.site.label || '' }) + tin('permit.plot.zip', T_('PLZ')) + tin('permit.plot.city', T_('Ort')) +
      tin('permit.plot.gemarkung', T_('Gemarkung')) + tin('permit.plot.flur', T_('Flur')) + tin('permit.plot.flurstueck', T_('Flurstück(e)')) + num('permit.plot.area', T_('Grundstücksfläche'), 'm²', { min: 0, max: 1e7, nullable: true })) + '</details>';
    h += '<details><summary>' + T_('Entwurfsverfasser') + '</summary>' + fields(tin('permit.author.name', T_('Name')) + tin('permit.author.office', T_('Büro')) + tin('permit.author.street', T_('Straße, Hausnummer')) + tin('permit.author.zip', T_('PLZ')) +
      tin('permit.author.city', T_('Ort')) + tin('permit.author.phone', T_('Telefon'), { type: 'tel' }) + tin('permit.author.email', T_('E-Mail'), { type: 'email' }) + tin('permit.author.chamber', T_('Kammer')) + tin('permit.author.regNo', T_('Mitglieds- bzw. Listennummer'))) + '</details>';
    h += '<details><summary>' + T_('Tragwerksplanung') + '</summary>' + fields(tin('permit.engineer.name', T_('Name')) + tin('permit.engineer.office', T_('Büro')) + tin('permit.engineer.regNo', T_('Mitglieds- bzw. Listennummer'))) + '</details>';
    h += fields(txt('permit.title', T_('Bezeichnung des Vorhabens'), { placeholder: T_('Neubau eines privaten Schutzraums aus Stahlbeton') }));
    // Kennwerte und Druck
    h += '<h3>' + T_('Bauvorlagen aus dem Projekt') + '</h3>' + kpis([kpi(fmt(f.bgf, 1) + ' m²', T_('Brutto-Grundfläche')), kpi(fmt(f.bri, 0) + ' m³', T_('Brutto-Rauminhalt')), kpi(fmt(f.nrf, 1) + ' m²', T_('Netto-Raumfläche')),
      kpi(Math.round(B.kosten(q).bauwerkGross * BP.laender.fx() / 1000).toLocaleString(I18.locale()) + ' T' + BP.laender.sym(), T_('Bauwerk brutto (KG 300 + 400)'))]);
    h += '<div class="rowbtns"><button class="btn" data-act="bauantragPrint">' + T_('Bauvorlagen drucken / PDF') + '</button><button class="btn ghost" data-act="bauantragCsv">' + T_('Ausfüllhilfe als CSV') + '</button></div>';
    h += '<p class="note">' + T_('Enthält Verfahren und Unterlagenliste, Baubeschreibung, Flächen und Rauminhalt, Kosten, Angaben für die Baustatistik, die Ausfüllhilfe und Bauzeichnungen als Entwurf. Der Bunkerplaner ersetzt weder den amtlichen Lageplan noch den geprüften Standsicherheitsnachweis.') + '</p>';
    h += stepNav('bauantrag');
    return h;
  };
  /* Zuordnung der Felder eines amtlichen PDF-Formulars zu den Projektwerten */
  function formFillPanel() {
    const ff = A.ui.ff, vals = BP.bauantrag.values(A.p, A.q), opts = [['', T_('leer lassen')]].concat(vals.map((v) => [v.id, v.label + (v.value ? ': ' + v.value : '')]));
    const n = ff.fields.filter((x) => ff.map[x.i]).length;
    let h = '<div class="card ff"><b>' + T_('Formular ausfüllen: {t}', { t: esc(ff.title) }) + '</b><p class="plain">' + T_('{n} von {m} Textfeldern zugeordnet. Zuordnung prüfen, dann herunterladen; Unterschrift und Kreuze setzt du im PDF selbst.', { n, m: ff.fields.length }) + '</p>';
    h += '<table class="res cols ff-map"><tr><th>' + T_('Feld im Formular') + '</th><th>' + T_('Wert') + '</th></tr>' + ff.fields.map((x) => '<tr><td class="l">' + esc(x.tip || x.name) + (x.tip ? '<br><small>' + esc(x.name) + '</small>' : '') + '</td><td>' +
      sel('ff.map.' + x.i, '', opts, { ui: true, value: ff.map[x.i] || '' }) + '</td></tr>').join('') + '</table>';
    h += '<div class="rowbtns"><button class="btn small" data-act="formFillSave">' + T_('Ausgefülltes PDF herunterladen') + '</button><button class="btn small ghost" data-act="formFillClose">' + T_('Schließen') + '</button></div></div>';
    return h;
  }

  STEP.freigabe = function () {
    const p = A.p, q = A.q;
    const autoDone = PN.autoDone(q);
    const done = M.CHECKLIST.filter((c) => (c.auto ? autoDone[c.auto] : (p.checklist[c.id] || {}).done)).length;
    let h = '<h2>' + T_('Freigaben') + '</h2><p class="lead">' + T_('Was vor und während des Baus geklärt sein muss. {done} von {all} erledigt.', { done, all: M.CHECKLIST.length }) + '</p>';
    const errs = q.checks.filter((c) => c.level !== 'info');
    h += '<h3>' + T_('Offene Punkte aus der Planung') + '</h3>' + (errs.length ? msgs(null, true) : '<p class="note">' + T_('Keine Fehler oder Warnungen.') + '</p>');
    let grp = null;
    h += M.CHECKLIST.map((c) => {
      const st = p.checklist[c.id] || {};
      const isAuto = !!c.auto, d = isAuto ? autoDone[c.auto] : !!st.done;
      let s = '';
      if (c.group !== grp) { s += (grp ? '</ul>' : '') + '<h3>' + T_(c.group) + '</h3><ul class="checklist">'; grp = c.group; }
      s += '<li><label><input type="checkbox" data-check="' + c.id + '" data-field="done"' + (d ? ' checked' : '') + (isAuto ? ' disabled' : '') + '><span>' + esc(M.checkText(c, p)) + '</span></label>' +
        (isAuto ? '<div class="auto">' + autoText(c.auto, d, q) + '</div>' : '<input type="text" data-check="' + c.id + '" data-field="note" placeholder="' + T_('Notiz, Datum, Zuständig') + '" value="' + esc(st.note || '') + '">') + '</li>';
      return s;
    }).join('') + '</ul>';
    h += '<h3>' + T_('Unterlagen') + '</h3><p class="note">' + T_('Für Behörde, Tragwerksplaner, Prüfer und Baustelle. Die statische Berechnung ist prüffähig gegliedert; gültig wird sie erst mit Prüfung und Unterschrift des Tragwerksplaners.') + '</p>' +
      '<div class="rowbtns"><button class="btn" data-act="report">' + T_('Planungsbericht drucken / PDF') + '</button><button class="btn ghost" data-act="statik">' + T_('Statische Berechnung') + '</button>' +
      (q.steel.schedule ? '<button class="btn ghost" data-act="plans">' + T_('Bewehrungspläne') + '</button><button class="btn ghost" data-act="biegeliste">' + T_('Biegeliste CSV') + '</button>' : '') +
      '<button class="btn ghost" data-act="vergleich">' + T_('Vergleichspaket (CSV)') + '</button><button class="btn ghost" data-act="dxf">' + T_('Systemlinien (DXF)') + '</button>' +
      '<button class="btn ghost" data-act="ifc">' + T_('Modell (IFC)') + '</button><button class="btn ghost" data-act="exportCsv">' + T_('Stückliste als CSV') + '</button></div>';
    h += stepNav('freigabe');
    return h;
  };

  /* ---------- Stückliste (Hauptansicht) ---------- */
  PN.renderBom = function () {
    const el = document.getElementById('view-liste');
    const q = A.q, bm = q.bom, p = A.p;
    const st = el.scrollTop;
    let h = '<div class="bom"><h2>' + T_('Stückliste') + '</h2><p class="note">' + T_('{name}, {a} m² Brutto-Grundfläche, Baugrube {d} m tief. Mengen ohne Zuschläge, außer wo vermerkt.', { name: esc(p.name), a: fmt(q.geo.A), d: fmt(q.earth.depth) }) + '</p>';
    h += '<table><thead><tr><th>' + T_('Position') + '</th><th>' + T_('Menge') + '</th><th></th><th>' + T_('Einzelpreis {cur} (änderbar)', { cur: BP.laender.sym() }) + '</th><th>' + T_('Eigen h') + '</th><th>' + T_('Gesamt') + '</th><th>' + T_('Hinweis') + '</th></tr></thead><tbody>';
    let cat = null;
    for (const it of bm.items) {
      if (it.cat !== cat) { cat = it.cat; h += '<tr class="cat"><th colspan="7">' + esc(BP.calc.catText(cat)) + '<span>' + eur(bm.cats[cat]) + '</span></th></tr>'; }
      const eig = it.mode === 'eigen';
      const changed = eig ? p.self.mat[it.key] != null : p.prices[it.key] != null;
      const dec = it.unit === 't' ? 3 : it.unit === 'Stk' || it.unit === 'psch' || it.unit === 'Tag' || it.unit === 'Einsatz' || it.unit === 'L' ? 0 : 2;
      h += '<tr><td>' + esc(it.label || it.name) + '</td><td class="num">' + fmt(it.qty, dec) + '</td><td class="u">' + esc(I18.maybe(it.unit)) + '</td><td>' + (it.fixed ? '<span class="num">' + fmt(it.price * BP.laender.fx(), 2) + '</span>' : '<input class="price' + (changed ? ' changed' : '') + '" type="number" step="any" ' + (eig ? 'data-mat="' + it.key + '" title="' + T_('Materialpreis (Eigenleistung)') + '" value="' + +(it.buy / it.qty * BP.laender.fx()).toFixed(2) : 'data-price="' + it.key + '" data-delta="' + (it.price - (p.prices[it.key] != null ? p.prices[it.key] : it.key === 'lueftung' ? q.tech.ventPrice * BP.laender.pli(p).value : M.PRICES[it.key] ? M.PRICES[it.key].p * BP.laender.pli(p).value : it.price)) + '" value="' + +(it.price * BP.laender.fx()).toFixed(2)) + '">') + '</td><td class="num">' + (it.hours > 0 ? fmt(it.hours, 0) : '') + '</td><td class="num">' + eur(it.cost) + '</td><td class="n">' + esc(it.note) + '</td></tr>';
    }
    h += '</tbody></table>';
    h += '<table class="totals"><tr><th>' + T_('Summe Bau netto') + '</th><td>' + eur(bm.net) + '</td></tr>' + (bm.ownH > 0 ? '<tr><th>' + T_('davon Eigenleistung {h} h', { h: fmt(bm.ownH, 0) }) + '</th><td>' + eur(bm.ownCost) + '</td></tr>' : '') + '<tr><th>' + (p.costs.planningMode === 'prozent' ? T_('Planung, Statik, Gutachten {p} %', { p: fmt(p.costs.planning, 0) }) : T_('Planung & Prüfung')) + '</th><td>' + eur(bm.planning) + '</td></tr><tr><th>' + T_('Reserve {p} %', { p: fmt(p.costs.reserve, 0) }) + '</th><td>' + eur(bm.reserve) + '</td></tr><tr><th>' + T_('MwSt. {p} % auf Zugekauftes', { p: fmt(p.costs.vat, 0) }) + '</th><td>' + eur(bm.vat) + '</td></tr><tr class="g"><th>' + T_('Gesamt brutto') + '</th><td>' + eur(bm.gross) + '</td></tr></table>';
    // Betonstahl-Auszug & Beton je Bauteil
    h += '<div class="grid2"><div><h3>' + T_('Beton je Bauteil') + '</h3><table><tbody>' +
      [[T_('Bodenplatte'), q.vol.slab], [T_('Außenwände'), q.vol.outerWalls], [T_('Innenwände'), q.vol.intStb], [T_('Decke'), q.vol.roof], [T_('Zugänge'), q.vol.access], [T_('Sauberkeitsschicht'), q.vol.blinding]].filter((x) => x[1] > 0)
        .map(([n, v]) => '<tr><td>' + n + '</td><td>' + fmt(v, 2) + ' m³</td></tr>').join('') +
      '<tr><td><b>' + T_('Summe') + '</b></td><td><b>' + fmt(q.vol.rc + q.vol.blinding, 2) + ' m³</b></td></tr></tbody></table>' +
      '<h3 style="margin-top:20px">' + T_('Schalung') + '</h3><table><tbody><tr><td>' + T_('Wände') + '</td><td>' + fmt(q.fw.wallsTotal, 1) + ' m²</td></tr><tr><td>' + T_('Decke') + '</td><td>' + fmt(q.fw.roof, 1) + ' m²</td></tr><tr><td>' + T_('Ränder') + '</td><td>' + fmt(q.fw.edges, 1) + ' m²</td></tr><tr><td>' + T_('Zugänge') + '</td><td>' + fmt(q.fw.access, 1) + ' m²</td></tr></tbody></table></div>';
    h += '<div><h3>' + T_('Bewehrungsauszug') + '</h3><table><thead><tr><th>' + T_('Bauteil, Lage') + '</th><th>Ø</th><th>' + T_('Länge') + '</th><th>kg</th></tr></thead><tbody>' +
      q.steel.items.map((i) => '<tr><td>' + esc(BP.calc.elName(i.element)) + ': ' + esc(BP.calc.labelText(i.label)) + (i.s ? ' <span class="note">s = ' + fmt(i.s * 100, 1) + '</span>' : '') + '</td><td>' + i.phi + '</td><td>' + fmt(i.length, 0) + ' m</td><td>' + fmt(i.kg, 0) + '</td></tr>').join('') +
      '<tr><td><b>' + T_('Summe inkl. 3 % Verschnitt') + '</b></td><td></td><td></td><td><b>' + fmt(q.steel.total, 0) + '</b></td></tr></tbody></table></div></div>';
    h += '</div>';
    el.innerHTML = h;
    el.scrollTop = st;
  };

  /* ---------- Gantt ---------- */
  PN.renderGantt = function () {
    const el = document.getElementById('gantt');
    const s = A.q.schedule, p = A.p;
    const total = Math.max(1, s.total);
    const pct = (d) => (d / total * 100).toFixed(3) + '%';
    const day = A.ui.day;
    const start = p.schedule.start ? new Date(p.schedule.start) : null;
    let ticks = '';
    const step = total > 120 ? 20 : total > 60 ? 10 : 5;
    const dm = (k) => { const iso = s.dates && s.dates[Math.min(k, s.dates.length - 1)]; return iso ? I18.date(iso, { year: undefined }) : String(k); };
    for (let d = 0; d <= total; d += step) ticks += '<span class="gtick" style="left:' + pct(d) + (d === 0 ? ';transform:none' : '') + '">' + dm(d) + '</span>';
    // Unterbrechungen (Winterpause, Feiertage über ein Wochenende) als senkrechte Linie
    const brk = (s.breaks || []).map((b2) => '<div class="gbreak' + (b2.winter ? ' winter' : '') + '" style="left:' + pct(b2.at) + '" title="' + T_(b2.winter ? 'Winterpause, {n} Tage' : 'Feiertage, {n} Tage', { n: b2.days }) + '"></div>').join('');
    const now = (day != null ? '<div class="gnow" style="left:' + pct(day) + '"></div>' : '') + brk;
    let h = '<table class="gtable"><thead><tr><td class="name">' + T_('Vorgang') + '</td><td class="dd">' + T_('Dauer AT') + '</td><td class="track"><div class="gtrack">' + ticks + '</div></td></tr></thead><tbody>';
    const rows = s.tasks.filter((t) => t.d > 0 || p.schedule.overrides[t.id] != null).map((t, i) => [t, i]).sort((a, b) => a[0].start - b[0].start || a[1] - b[1]).map(([t]) => t);
    if (s.wh) h += '<tr><td class="name" style="color:#2f78a8">' + T_('Wasserhaltung') + '</td><td class="dd">' + s.wh.d + '</td><td class="track"><div class="gbar wh" style="left:' + pct(s.wh.start) + ';width:' + pct(s.wh.d) + '"></div>' + now + '</td></tr>';
    for (const t of rows) {
      const act = day != null && day >= t.start && day < t.end;
      const ov = p.schedule.overrides[t.id];
      h += '<tr' + (act ? ' class="active"' : '') + '><td class="name" title="' + esc(t.name) + '">' + esc(t.name) + '</td><td class="dd"><input type="number" min="0" step="1" data-override="' + t.id + '" value="' + t.d + '"' + (ov != null ? ' class="changed"' : '') + ' title="' + T_('automatisch: {n} AT', { n: t.auto }) + '"></td>' +
        '<td class="track"><div class="gtrack"><div class="gbar' + (t.critical ? ' crit' : '') + (t.pour ? ' pour' : '') + '" style="left:' + pct(t.start) + ';width:' + pct(Math.max(t.d, 0.3)) + '" title="' + T_('AT {a} bis {b}', { a: t.start, b: t.end }) + '"></div>' + now + '</div></td></tr>';
    }
    h += '</tbody></table><p class="note" style="padding:8px 12px">' + T_('Schwarz: kritischer Pfad. Dauern in Arbeitstagen, Wartezeiten (Ausschalen nach 14, Erdauflast nach 28 Kalendertagen) als Abstand. Dauer anklicken und überschreiben.') + '</p>';
    el.innerHTML = h;
  };
})(typeof window !== 'undefined' ? window : globalThis);
