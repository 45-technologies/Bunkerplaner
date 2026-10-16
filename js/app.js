/* App-Zustand, Rückgängig, Speichern, Ansichten, Schrittleiste, Bautafel. */
(function (root) {
  const BP = root.BP, M = BP.model, C = BP.calc, G = BP.geo;
  const T_ = BP.i18n.T, I18 = BP.i18n;
  const KEY = 'bunkerplaner.v2';
  const fmt = (v, d = 2) => C.fmt(v, d);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const A = BP.app = {
    p: null, q: null, step: 'standort', view: 'schnitt', sel: null, tool: 'select',
    undoStack: [], redoStack: [], lastKey: null, lastTime: 0, lastGood: null,
    ui: { level: 0, snap: true, wallKind: 'mw', wallT: 0.175, openingKind: 'innen', openingW: 0.9, shape: { kind: 'rect', L: 10, B: 6.5, a: 3, b: 2 }, routeH: 2.15, routeType: 'luft', drawingRoute: null, protTarget: 'aussenwand', layout: { per: 3, maxL: null, maxB: null, open: true }, day: null, playing: null, mapOn: false, mapLayer: 'sat', mapView: null, geoResults: null, siteQuery: '' },
  };

  function store(k, v) { try { localStorage.setItem(KEY + '.' + k, v); } catch (e) { /* Speicher nicht verfügbar */ } }
  function load(k) { try { return localStorage.getItem(KEY + '.' + k); } catch (e) { return null; } }

  /* ---------- FE-Berechnung im Hintergrund ----------
   * C.run fragt Ergebnisse über einen Anbieter ab. Fehlt eines, rechnet die Oberfläche mit dem Tafelverfahren weiter,
   * der Worker liefert nach und es wird neu gerechnet. Während Ziehvorgängen wird nichts angestoßen. */
  const FEQ = { cache: new Map(), want: new Map(), busy: null, worker: null, failed: false, seq: 0, errors: new Map(), used: new Set() };
  // Ergebnisse, die die laufende Rechnung braucht, werden nie verdrängt (sonst rechnet der Worker bei vielen Wandseiten endlos)
  const feProvider = {
    get: (k) => { FEQ.used.add(k); return FEQ.cache.get(k) || null; },
    want: (k, job) => { FEQ.used.add(k); if (!FEQ.cache.has(k) && !FEQ.errors.has(k)) FEQ.want.set(k, job); },
  };
  A.feErrors = FEQ.errors;
  function feWorker() {
    if (FEQ.worker || FEQ.failed || typeof Worker === 'undefined') return FEQ.worker;
    try {
      FEQ.worker = new Worker('js/fe-worker.js');
      FEQ.worker.onmessage = (e) => feDone(e.data);
      FEQ.worker.onerror = () => { FEQ.failed = true; FEQ.worker = null; const b = FEQ.busy; FEQ.busy = null; if (b) FEQ.want.set(b.k, b.job); feSchedule(); };
    } catch (err) { FEQ.failed = true; FEQ.worker = null; }
    return FEQ.worker;
  }
  function feDone(msg) {
    const b = FEQ.busy;
    if (!b || !msg || msg.id !== b.id) return;
    FEQ.busy = null;
    if (msg.error) FEQ.errors.set(b.k, msg.error); else FEQ.cache.set(b.k, msg.res);
    const cap = Math.max(24, FEQ.used.size + 8);
    for (const k0 of [...FEQ.cache.keys()]) { if (FEQ.cache.size <= cap) break; if (!FEQ.used.has(k0)) FEQ.cache.delete(k0); }
    if (FEQ.want.size) { feNext(); return; }
    if (A.liveActive) return; // nach dem Ziehen wird ohnehin neu gerechnet
    // Eingabe im Panel nicht unterbrechen: Panel erst nach dem Verlassen des Feldes neu zeichnen
    const ae = document.activeElement, pn = document.getElementById('panel');
    const typing = !!(ae && pn && pn.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName));
    A.recompute(); A.render({ skipPanel: typing });
    if (typing) A.panelStale = true;
  }
  function feNext() {
    if (FEQ.busy || !FEQ.want.size) return;
    const [k, job] = FEQ.want.entries().next().value;
    FEQ.want.delete(k);
    const id = ++FEQ.seq;
    FEQ.busy = { id, k, job };
    const w = feWorker();
    if (w) { w.postMessage({ id, job }); return; }
    // ohne Worker: im Hauptprogramm, aber erst nach dem Zeichnen
    setTimeout(() => { let res = null, error = null; try { res = BP.slabs.run(job); } catch (err) { error = String(err.message || err); } feDone({ id, res, error }); }, 30);
  }
  let feTimer = null;
  function feSchedule() {
    clearTimeout(feTimer);
    feTimer = setTimeout(() => { if (!A.liveActive) feNext(); }, 120);
  }
  A.fePending = () => FEQ.want.size > 0 || !!FEQ.busy;

  /* ---------- Rechnen & Speichern ---------- */
  A.recompute = function () {
    try {
      FEQ.want.clear(); FEQ.used = new Set();
      A.q = C.run(A.p, { fe: feProvider });
      if (FEQ.want.size) feSchedule();
      A.lastGood = JSON.stringify(A.p);
      return true;
    } catch (err) {
      console.error(err);
      A.p = A.lastGood ? JSON.parse(A.lastGood) : M.defaultProject();
      A.q = C.run(A.p, { fe: feProvider });
      A.toast(T_('Änderung verworfen: {msg}', { msg: err.message || T_('ungültige Planungsdaten') }), true);
      return false;
    }
  };

  let saveTimer = null;
  root.addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); store('project', JSON.stringify(A.p)); store('step', A.step); } });
  A.save = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { store('project', JSON.stringify(A.p)); store('step', A.step); }, 300);
  };

  A.commit = function (mutate, opts = {}) {
    const snap = JSON.stringify(A.p);
    mutate(A.p);
    if (JSON.stringify(A.p) === snap) return true;   // keine Änderung: kein Undo-Eintrag
    const now = Date.now();
    if (!(opts.coalesce && opts.coalesce === A.lastKey && now - A.lastTime < 1200)) {
      A.undoStack.push(snap);
      if (A.undoStack.length > 150) A.undoStack.shift();
    }
    A.redoStack = [];
    A.lastKey = opts.coalesce || null; A.lastTime = now;
    const ok = A.recompute();
    A.save();
    validateSel();
    if (opts.later) A.renderLater(opts); else A.render(opts);
    return ok;
  };

  /* Nach Feldänderungen erst rendern, wenn Fokuswechsel bzw. Klick abgeschlossen sind. */
  let ptrDown = false, laterT = null;
  root.addEventListener('pointerdown', () => { ptrDown = true; }, true);
  root.addEventListener('pointerup', () => { ptrDown = false; }, true);
  root.addEventListener('pointercancel', () => { ptrDown = false; }, true);
  A.renderLater = function (opts) {
    clearTimeout(laterT);
    const run = () => { if (ptrDown) { laterT = setTimeout(run, 30); return; } laterT = null; A.render(opts); };
    laterT = setTimeout(run, 0);
  };

  A.beginLive = function () {
    A.liveActive = true;
    A.undoStack.push(JSON.stringify(A.p));
    if (A.undoStack.length > 150) A.undoStack.shift();
    A.redoStack = []; A.lastKey = null;
  };
  A.live = function (mutate) {
    mutate(A.p);
    if (!A.recompute()) return;
    BP.plan2d.render();
    renderTafel();
  };
  A.endLive = function () { A.liveActive = false; A.recompute(); A.save(); A.render(); };

  A.undo = function () {
    if (!A.undoStack.length) return;
    A.redoStack.push(JSON.stringify(A.p));
    const uid = A.p.uid;
    A.p = JSON.parse(A.undoStack.pop());
    if (uid && !A.p.uid) A.p.uid = uid;
    A.lastKey = null;
    A.recompute(); A.save(); validateSel(); A.render();
  };
  A.redo = function () {
    if (!A.redoStack.length) return;
    A.undoStack.push(JSON.stringify(A.p));
    const uid = A.p.uid;
    A.p = JSON.parse(A.redoStack.pop());
    if (uid && !A.p.uid) A.p.uid = uid;
    A.recompute(); A.save(); validateSel(); A.render();
  };

  /* ---------- Ebenen ----------
   * Ebene 0 ist die oberste (Zugangsebene, p.geom), darunter p.levels. Jede Ebene hat eigene Wände, Öffnungen, Räume, Stützen und Bereiche. */
  const LISTS = { wall: 'walls', opening: 'openings', room: 'rooms', column: 'columns', zone: 'zones', beam: 'beams' };
  A.LISTS = LISTS;
  A.nLevels = () => 1 + ((A.p && A.p.levels) || []).length;
  A.lvl = () => Math.max(0, Math.min(A.nLevels() - 1, A.ui.level | 0));
  A.levelSrc = (p, i) => (i > 0 ? p.levels[i - 1] : p.geom);
  A.levelPath = (i) => (i > 0 ? 'levels#' + A.p.levels[i - 1].id : 'geom');
  /* Ebene eines Elements (Wand, Öffnung, Raum, Stütze, Bereich) oder −1 */
  A.levelOf = function (type, id, p) {
    p = p || A.p;
    const k = LISTS[type];
    if (!k) return -1;
    for (let i = 0; i < 1 + (p.levels || []).length; i++) if ((A.levelSrc(p, i)[k] || []).some((x) => x.id === id)) return i;
    return -1;
  };
  A.setLevel = function (i) {
    i = Math.max(0, Math.min(A.nLevels() - 1, i | 0));
    if (i === A.lvl()) return;
    finishRoute();
    A.ui.level = i;
    if (A.sel && LISTS[A.sel.type] && A.levelOf(A.sel.type, A.sel.id) !== i) A.sel = null;
    if (A.sel && (A.sel.type === 'access' || A.sel.type === 'edge') && i > 0) A.sel = null;
    if (i > 0 && (A.tool === 'treppe' || A.tool === 'schacht')) A.tool = 'select';
    BP.plan2d.cancel && BP.plan2d.cancel();
    A.render();
  };

  function validateSel() {
    if (A.ui.drawingRoute && !A.p.routes.some((r) => r.id === A.ui.drawingRoute)) A.ui.drawingRoute = null;
    if (A.ui.level >= A.nLevels()) A.ui.level = A.nLevels() - 1;
    const s = A.sel;
    if (!s) return;
    const g = A.p.geom;
    const ok = LISTS[s.type] ? A.levelOf(s.type, s.id) >= 0 :
      s.type === 'access' ? g.access.some((x) => x.id === s.id) : s.type === 'edge' ? s.index < g.outline.length :
      s.type === 'vert' ? (g.verts || []).some((x) => x.id === s.id) : s.type === 'level' ? A.p.levels.some((x) => x.id === s.id) :
      s.type === 'route' ? A.p.routes.some((x) => x.id === s.id) : false;
    if (!ok) A.sel = null;
  }

  /* Auswahl im Plan oder aus einer Meldung: wechselt bei Bedarf in den passenden Schritt samt Grundrissansicht. */
  A.select = function (sel) {
    A.sel = sel;
    // Element einer anderen Ebene (z. B. aus einer Meldung): Ebene wechseln
    if (sel && LISTS[sel.type]) { const li = A.levelOf(sel.type, sel.id); if (li >= 0) A.ui.level = li; }
    if (sel && (sel.type === 'access' || sel.type === 'edge')) A.ui.level = 0;
    if (sel && sel.type === 'vert') {
      const v = (A.p.geom.verts || []).find((x) => x.id === sel.id), cur = A.lvl();
      if (v && v.kind === 'treppe' && cur !== v.upper && cur !== v.upper + 1) A.ui.level = v.upper;
      if (v && v.kind === 'aufzug' && (cur < Math.max(0, v.top) || cur > v.bottom)) A.ui.level = Math.max(0, v.top);
    }
    const target = !sel ? null : sel.type === 'route' ? 'technik' : 'grundriss';
    if (target && A.step !== target) A.setStep(target);
    else { if (sel && A.view !== 'plan') A.view = 'plan'; A.render(); }
  };

  A.deleteSelection = function () {
    const s = A.sel;
    if (!s || s.type === 'edge' || s.type === 'level') return;
    A.commit((p) => {
      const g = p.geom;
      if (LISTS[s.type]) {
        const li = A.levelOf(s.type, s.id, p);
        if (li < 0) return;
        const L = A.levelSrc(p, li), k = LISTS[s.type];
        L[k] = L[k].filter((x) => x.id !== s.id);
        if (s.type === 'wall') L.openings = L.openings.filter((o) => o.host !== 'w:' + s.id);
      }
      if (s.type === 'access') g.access = g.access.filter((x) => x.id !== s.id);
      if (s.type === 'vert') g.verts = (g.verts || []).filter((x) => x.id !== s.id);
      if (s.type === 'route') p.routes = p.routes.filter((x) => x.id !== s.id);
    });
    A.sel = null;
    A.render();
  };

  A.newProject = function () {
    A.commit((p) => { const d = M.defaultProject(); Object.keys(p).forEach((k) => delete p[k]); Object.assign(p, d); });
    Object.assign(A.ui, { mapView: null, geoResults: null, siteQuery: '' });
    A.sel = null; syncShape(); BP.plan2d.fit(); A.setStep('standort');
    A.toast(T_('Neues Projekt angelegt. „Rückgängig“ holt das vorige zurück.'));
  };

  A.openProject = function (raw) {
    let np;
    try { np = M.normalize(raw); } catch (err) { A.toast(err.message, true); return; }
    const migrated = !!np._migrated; delete np._migrated;
    if (!A.commit((p) => { Object.keys(p).forEach((k) => delete p[k]); Object.assign(p, np); })) return;
    Object.assign(A.ui, { mapView: null, geoResults: null, siteQuery: '' });
    A.sel = null; syncShape(); BP.plan2d.fit(); A.render();
    A.toast(migrated ? T_('Projekt aus der Vorversion übernommen: Kontur, Wände, Höhen, Zugänge, Leitungen und Schutzprofil. Bitte kurz prüfen.') : T_('Projekt geöffnet.'));
  };

  A.syncShape = () => syncShape();
  function syncShape() {
    const bb = G.bbox(A.p.geom.outline);
    A.ui.shape.L = G.round(bb.w, 2); A.ui.shape.B = G.round(bb.h, 2);
  }

  /* ---------- Schritte, Ansichten, Werkzeuge ---------- */
  A.setStep = function (id) {
    const s = M.STEPS.find((x) => x.id === id) || M.STEPS[0];
    A.step = s.id;
    if (s.id !== 'grundriss' && !(s.id === 'technik' && A.tool === 'route')) { finishRoute(); A.tool = 'select'; BP.plan2d.cancel && BP.plan2d.cancel(); }
    if (s.id === 'ablauf') { A.ui.day = A.q.schedule.total; A.view = 'gantt'; }
    else { A.view = s.id === 'material' ? 'liste' : s.view; A.ui.day = null; stopPlay(); }
    store('step', A.step);
    A.render();
    const pn = document.getElementById('panel');
    pn.scrollTop = 0;
    if (pn.getBoundingClientRect().top < 0) pn.scrollIntoView({ block: 'start' }); // schmales Layout: Panel scrollt mit der Seite
  };

  A.setView = function (v) {
    if (v === 'einkauf' && A.step !== 'material') {
      A.setStep('material');
    }
    A.view = v;
    if (v !== 'gantt' && v !== '3d') stopPlay();
    A.render({ skipPanel: true });
  };

  function finishRoute() {
    const id = A.ui.drawingRoute;
    A.ui.drawingRoute = null;
    if (!id) return;
    const r = A.p.routes.find((x) => x.id === id);
    if (r && r.pts.length < 2) { A.p.routes = A.p.routes.filter((x) => x.id !== id); A.recompute(); A.save(); if (A.sel && A.sel.id === id) A.sel = null; }
  }
  A.finishRoute = function () {
    const id = A.ui.drawingRoute;
    finishRoute();
    A.tool = 'select';
    if (id && A.p.routes.some((x) => x.id === id)) A.sel = { type: 'route', id };
    A.render();
  };

  A.startRoute = function (type) {
    finishRoute();
    A.ui.routeType = type === 'kabel' ? 'kabel' : 'luft';
    A.ui.routeH = type === 'kabel' ? 2.2 : 2.15;
    A.tool = 'route'; A.view = 'plan';
    if (A.step !== 'technik') A.step = 'technik';
    A.sel = null;
    A.render();
  };
  A.continueRoute = function (id) {
    finishRoute();
    const r = A.p.routes.find((x) => x.id === id);
    if (!r) return;
    A.ui.drawingRoute = id; A.ui.routeType = r.type;
    if (r.pts.length) A.ui.routeH = r.pts[r.pts.length - 1].h;
    A.tool = 'route'; A.view = 'plan';
    A.render();
  };

  A.setTool = function (t) {
    if (t !== 'route') finishRoute();
    A.tool = t;
    if (t === 'route') { if (A.step !== 'technik') A.step = 'technik'; }
    else if (t !== 'select' && A.step !== 'grundriss') A.step = 'grundriss';
    if (t !== 'select' && A.view !== 'plan') A.view = 'plan';
    BP.plan2d.cancel && BP.plan2d.cancel();
    A.render();
  };

  A.toast = function (msg, err) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast' + (err ? ' err' : '');
    el.hidden = false;
    clearTimeout(A._tt);
    A._tt = setTimeout(() => { el.hidden = true; }, err ? 5200 : 3200);
  };

  /* ---------- Sprache ----------
   * Feste Texte der Seite (index.html) tragen beim ersten Aufruf ihr deutsches Original in data-de*, danach wird je
   * Sprache aus dem Original übersetzt. Rechenergebnisse enthalten übersetzte Meldungen, daher wird neu gerechnet. */
  const STATIC = 'header.top button, header.top select, header.top input, header.top .brand, #views button, #steps, #planSvg, #sectionSvg, #tafel, #panel';
  function applyStatic() {
    document.documentElement.lang = I18.lang();
    document.title = T_('Bunkerplaner');
    for (const el of document.querySelectorAll(STATIC)) {
      for (const [attr, key] of [['title', 'deTitle'], ['aria-label', 'deAria'], ['placeholder', 'dePh']]) {
        if (!el.hasAttribute(attr)) continue;
        if (el.dataset[key] == null) el.dataset[key] = el.getAttribute(attr);
        el.setAttribute(attr, T_(el.dataset[key]));
      }
      if (el.tagName === 'BUTTON' && el.children.length === 0 && el.closest('header.top, #views')) {
        if (el.dataset.de == null) el.dataset.de = el.textContent;
        el.textContent = T_(el.dataset.de);
      }
    }
    const brand = document.querySelector('header.top .brand span');
    if (brand) { if (brand.dataset.de == null) brand.dataset.de = brand.textContent; brand.textContent = T_(brand.dataset.de); }
    const sel = document.getElementById('langSel');
    if (sel) sel.value = I18.lang();
  }
  A.setLang = function (l) {
    if (!I18.LANGS[l]) return;
    I18.setLang(l);
    store('lang', l);
    applyStatic();
    if (A.p) { A.recompute(); A.render(); }
  };
  function initialLang() {
    const s = load('lang');
    if (s && I18.LANGS[s]) return s;
    const nav = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
    for (const x of nav) { const k = String(x || '').slice(0, 2).toLowerCase(); if (I18.LANGS[k]) return k; }
    return 'en';
  }

  /* ---------- Rendern ---------- */
  A.render = function (opts = {}) {
    if (!A.q) return;
    renderSteps();
    renderTafel();
    if (!opts.skipPanel) { A.panelStale = false; BP.panels.render(); }
    A.renderView();
    document.getElementById('undo').disabled = !A.undoStack.length;
    document.getElementById('redo').disabled = !A.redoStack.length;
    const nm = document.getElementById('projectName');
    if (document.activeElement !== nm) nm.value = A.p.name;
    BP.view3d.invalidate();
  };

  /* Ebene, deren Grundriss zur Platte gehört: Decke über Ebene 1, Zwischendecke über Ebene i, Bodenplatte unter der untersten */
  A.slabLevel = (slab) => (slab === 'roof' ? 0 : slab === 'floor' ? A.nLevels() - 1 : Math.max(0, Math.min(A.nLevels() - 1, +String(slab).slice(3) || 0)));
  A.showFe = function (slab, qty) {
    A.ui.feView = { slab, qty: qty || 'mx' };
    A.ui.level = A.slabLevel(slab);
    if (A.view !== 'plan') A.view = 'plan';
    A.render({ skipPanel: true });
  };

  A.renderView = function () {
    const v = A.view;
    document.querySelectorAll('#views button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    ['plan', 'schnitt', '3d', 'liste', 'einkauf', 'gantt'].forEach((k) => document.getElementById('view-' + k).classList.toggle('on', k === v));
    renderTools();
    if (v === 'plan') BP.plan2d.render();
    if (v === 'schnitt') BP.section.render();
    if (v === 'liste') BP.panels.renderBom();
    if (v === 'einkauf') BP.planning.renderProcurement();
    if (v === '3d' || v === 'gantt') {
      const host = document.getElementById(v === '3d' ? 'three' : 'ganttTop');
      BP.view3d.mount(host);
      renderThreeUi(v === '3d' ? document.getElementById('threeUi') : null);
      renderPhasebar(v === '3d' ? document.getElementById('view-3d') : host);
      BP.view3d.setDay(effDay());
    }
    if (v === 'gantt') BP.panels.renderGantt();
  };

  function effDay() {
    const d = A.ui.day, tot = A.q.schedule.total;
    return d == null || d >= tot ? null : d;
  }

  function renderTools() {
    const el = document.getElementById('tools');
    const v = A.view;
    let h = '';
    const levelSw = () => {
      const n = A.nLevels();
      if (n < 2) return '';
      const cur = A.lvl();
      return '<span class="lvl-sw" role="group" aria-label="' + T_('Ebene') + '"><span>' + T_('Ebene') + '</span>' + Array.from({ length: n }, (_, i) => {
        const nm = i ? A.p.levels[i - 1].name : T_('Ebene 1 (oben)');
        return '<button class="tool" data-level="' + i + '" aria-pressed="' + (i === cur) + '" title="' + esc(nm) + '">' + (i + 1) + '</button>';
      }).join('') + '</span><span class="gap"></span>';
    };
    if (v === 'plan' && A.step === 'statik') {
      const st = A.q.struct, fv = A.ui.feView;
      const slabs = [['roof', T_('Decke')]].concat(st.mids.map((m) => ['mid' + m.level, BP.rebar.elText(m.name)]), [['floor', T_('Bodenplatte')]]).filter(([k]) => { const pl = BP.plan2d.slabOf(k); return pl && pl.method === 'FE'; });
      if (slabs.length) {
        const cur = fv || { slab: slabs[0][0], qty: 'mx' };
        const opt = (list, val) => list.map(([k, t]) => '<option value="' + k + '"' + (k === val ? ' selected' : '') + '>' + t + '</option>').join('');
        const qs = Object.entries(BP.plan2d.FEQTY).filter(([k, d]) => !d.floor || cur.slab === 'floor').map(([k, d]) => [k, T_(d.name)]);
        h = '<button class="tool" data-cmd="feToggle" aria-pressed="' + !!fv + '">' + T_('Schnittgrößen zeigen') + '</button>' +
          (fv ? '<span class="slider"><select data-fesel="slab">' + opt(slabs, cur.slab) + '</select></span><span class="slider"><select data-fesel="qty">' + opt(qs, cur.qty) + '</select></span>' : '') +
          '<span class="gap"></span><button class="tool" data-cmd="fit">' + T_('Einpassen') + '</button>';
      } else h = '<span class="note">' + (A.fePending() ? T_('FE-Berechnung läuft …') : T_('Keine FE-Ergebnisse')) + '</span><span class="gap"></span><button class="tool" data-cmd="fit">' + T_('Einpassen') + '</button>';
    } else if (v === 'plan') {
      const tb = (id, label, key) => '<button class="tool" data-tool="' + id + '" aria-pressed="' + (A.tool === id) + '">' + label + (key ? ' <kbd>' + key + '</kbd>' : '') + '</button>';
      const top = A.lvl() === 0, multi = A.nLevels() > 1;
      h = levelSw() + tb('select', T_('Auswählen'), 'V') + tb('wall', T_('Innenwand'), 'W') + tb('opening', T_('Tür'), 'T') + (top ? tb('treppe', T_('Treppenabgang')) + tb('schacht', T_('Notausstieg')) : '') + tb('room', T_('Raum benennen'), 'R') +
        tb('stuetze', T_('Stütze'), 'S') + tb('unterzug', T_('Unterzug'), 'U') + tb('zone', T_('Stützenfrei')) + (multi && A.lvl() < A.nLevels() - 1 ? tb('itreppe', T_('Innentreppe')) : '') + tb('aufzug', T_('Aufzug')) + tb('route', T_('Leitung'), 'L') +
        (A.tool === 'route' ? '<span class="gap"></span><label class="chk">' + T_('Höhe neuer Punkte {input} m über Boden', { input: '<input class="hin" id="routeH" type="number" step="0.05" value="' + A.ui.routeH + '">' }) + '</label>' +
          '<button class="tool" data-cmd="routeType">' + (A.ui.routeType === 'kabel' ? T_('Kabelweg') : T_('Lüftungsweg')) + '</button>' + (A.ui.drawingRoute ? '<button class="tool" data-cmd="routeDone">' + T_('Fertig') + ' <kbd>Enter</kbd></button>' : '') : '') +
        '<span class="gap"></span><label class="chk"><input type="checkbox" id="snapChk"' + (A.ui.snap ? ' checked' : '') + '> ' + T_('5-cm-Raster') + '</label>' +
        '<button class="tool" data-cmd="fit">' + T_('Einpassen') + '</button>' + (A.sel && A.sel.type !== 'edge' ? '<button class="tool" data-cmd="del">' + T_('Löschen') + ' <kbd>' + T_('Entf') + '</kbd></button>' : '');
    } else if (v === 'liste') {
      h = '<button class="tool" data-cmd="csv">' + T_('Als CSV speichern') + '</button>';
    } else if (v === 'schnitt') {
      const modes = BP.section.modes(A.q.geo);
      const cur = modes.some((m) => m[0] === A.ui.sectionMode) ? A.ui.sectionMode : modes[0][0];
      h = modes.map(([k, t]) => '<button class="tool" data-secmode="' + k + '" aria-pressed="' + (k === cur) + '">' + t + '</button>').join('');
    }
    el.innerHTML = h;
  }

  function renderThreeUi(el) {
    if (!el) return;
    const o = BP.view3d.opts;
    const b = (cmd, label, on) => '<button class="tool" data-3d="' + cmd + '"' + (on != null ? ' aria-pressed="' + on + '"' : '') + '>' + label + '</button>';
    el.innerHTML = b('iso', T_('Ansicht schräg')) + b('top', T_('Von oben')) + b('front', T_('Von vorn')) +
      '<span class="slider">' + T_('Erdreich') + ' <select data-3dsel="earth"><option value="aus"' + (o.earth === 'aus' ? ' selected' : '') + '>' + T_('ausblenden') + '</option><option value="transparent"' + (o.earth === 'transparent' ? ' selected' : '') + '>' + T_('durchsichtig') + '</option><option value="voll"' + (o.earth === 'voll' ? ' selected' : '') + '>' + T_('voll') + '</option></select></span>' +
      b('roof', T_('Decke'), o.roof) + b('rebar', T_('Bewehrung'), o.rebar) + b('cut', T_('Schnitt'), o.cut) +
      (o.cut ? '<span class="slider">' + T_('Lage@@Schnitt') + ' <input type="range" min="0" max="1" step="0.01" value="' + o.cutPos + '" data-3drange="cutPos"></span>' : '');
  }

  function renderPhasebar(host) {
    let bar = document.getElementById('phasebar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'phasebar'; bar.className = 'phasebar';
      bar.addEventListener('input', (e) => { if (e.target.type === 'range') { stopPlay(); A.ui.day = +e.target.value; updatePhase(); } });
      bar.addEventListener('click', (e) => { if (e.target.closest('[data-play]')) togglePlay(); });
    }
    if (bar.parentElement !== host) host.appendChild(bar);
    const tot = A.q.schedule.total;
    bar.innerHTML = '<button class="btn small" data-play="1">' + (A.ui.playing ? T_('Anhalten') : T_('Bau abspielen')) + '</button>' +
      '<input type="range" min="0" max="' + tot + '" step="1" value="' + (A.ui.day == null ? tot : A.ui.day) + '" aria-label="' + T_('Bautag') + '">' +
      '<span class="day"></span><span class="what"></span>';
    updatePhase();
  }

  function updatePhase() {
    const bar = document.getElementById('phasebar');
    if (!bar) return;
    const s = A.q.schedule, tot = s.total;
    const d = A.ui.day == null ? tot : A.ui.day;
    const r = bar.querySelector('input'); if (r && +r.value !== d) r.value = d;
    const start = A.p.schedule.start ? new Date(A.p.schedule.start) : null;
    bar.querySelector('.day').textContent = d >= tot ? T_('Fertig') : T_('Tag {d} / {tot}', { d, tot });
    const now = s.tasks.filter((t) => t.d > 0 && d >= t.start && d < t.end).map((t) => t.name);
    const dIso = (k) => { const iso = s.dates && s.dates[Math.max(0, Math.min(k, s.dates.length - 1))]; return iso ? I18.date(iso) : ''; };
    bar.querySelector('.what').textContent = d >= tot ? T_('Fertiger Bunker') + (s.end ? ', ' + I18.date(s.end) : '') :
      (dIso(d) ? dIso(d) + ': ' : '') + (now.join(', ') || T_('Wartezeit (Aushärten)'));
    BP.view3d.setDay(effDay());
    if (A.view === 'gantt') BP.panels.renderGantt();
  }

  function togglePlay() {
    if (A.ui.playing) { stopPlay(); renderPhasebar(document.getElementById('phasebar').parentElement); return; }
    const tot = A.q.schedule.total;
    if (A.ui.day == null || A.ui.day >= tot) A.ui.day = 0;
    A.ui.playing = setInterval(() => {
      A.ui.day = (A.ui.day || 0) + 1;
      if (A.ui.day >= tot) { A.ui.day = tot; stopPlay(); renderPhasebar(document.getElementById('phasebar').parentElement); }
      updatePhase();
    }, 260);
    renderPhasebar(document.getElementById('phasebar').parentElement);
  }
  function stopPlay() { if (A.ui.playing) { clearInterval(A.ui.playing); A.ui.playing = null; } }

  function stepState(id) {
    const list = A.q.checks.filter((c) => c.step === id);
    if (list.some((c) => c.level === 'err')) return 'err';
    if (list.some((c) => c.level === 'warn')) return 'warn';
    return 'ok';
  }

  function stepValue(id) {
    const q = A.q, p = A.p;
    switch (id) {
      case 'standort': return T_(q.soil.name).split(',')[0] + ', ' + ({ unbekannt: T_('Wasser offen'), keins: T_('kein Grundwasser'), tiefe: T_('Wasser {d} m', { d: fmt(p.site.waterDepth, 1) }), gok: T_('Stauwasser') }[p.site.waterMode] || '');
      case 'nutzung': return T_('{n} Personen, {d} Tage', { n: p.use.people, d: p.use.days });
      case 'grundriss': return T_('{a} m² brutto', { a: fmt(q.geo.A, 1) }) + ', ' + (q.geo.L.length > 1 ? T_('{n} Ebenen', { n: q.geo.L.length }) + ', ' : '') + T_('{n} Räume', { n: q.geo.tot.rooms });
      case 'schutzgrad': {
        const hz = p.hazard, bl = q.struct.blast;
        const parts = [bl ? T_('Luftstoß {p} bar', { p: fmt(bl.qk / 100, 1) }) : '', hz.radiation ? T_('Strahlung') : '', hz.cb ? T_('ABC') : '', hz.emp ? T_('EMP') : ''].filter(Boolean);
        return parts.length ? parts.join(', ') : T_('Kein Schutzgrad');
      }
      case 'konstruktion': return T_('Wand {w}, Decke {d} cm', { w: fmt(p.build.tWall * 100, 0), d: fmt(p.build.tRoof * 100, 0) });
      case 'statik': {
        const e = q.summary.etaMax;
        return (e > 1 ? T_('überlastet') : e > 0.9 ? T_('knapp') : T_('hält')) + ', ' + T_('η max. {e}', { e: fmt(e) });
      }
      case 'schutz': {
        const t = (q.planning.threats.length ? T_(q.planning.threats.length === 1 ? '{n} Szenario' : '{n} Szenarien', { n: q.planning.threats.length }) : '');
        const g = (q.prot.used && q.prot.gaps.length ? T_('{n} offen', { n: q.prot.gaps.length }) : '');
        return [t, g].filter(Boolean).join(', ') || (q.prot.used ? T_('Nachweise zugeordnet') : T_('keine Nachweise'));
      }
      case 'technik': return (q.tech.ventN > 1 ? q.tech.ventN + ' × ' : '') + q.tech.ventSize + ' m³/h, ' + T_('{n} Leitungen', { n: q.routes.list.length });
      case 'material': return T_('{v} T{cur} Richtkosten', { v: Math.round(q.bom.gross * BP.laender.fx() / 1000).toLocaleString(I18.locale()), cur: BP.laender.sym() });
      case 'ablauf': return T_('{w} Wochen Bauzeit', { w: fmt(q.schedule.weeks, 1) });
      case 'bauantrag': {
        const B = BP.bauantrag, J = B && B.jurisdiction(p);
        if (!J) return T_('Land ohne Registerdaten');
        const pr = B.procedure(J.e, B.ctxOf(p, q));
        return pr.main ? T_(B.PROC[pr.main.id] || B.PROC.other) : T_('Lage angeben');
      }
      case 'varianten': {
        const n = (p.variants || []).length;
        return n ? T_(n === 1 ? '{n} Variante' : '{n} Varianten', { n }) : T_('noch keine Variante');
      }
      case 'betrieb': {
        const pl = BP.wartung.plan(p, q);
        return T_('{n} Aufgaben', { n: pl.tasks.length }) + (pl.nextDue ? ', ' + T_('ab {d}', { d: I18.date(pl.nextDue) }) : '');
      }
      case 'freigabe': {
        const ad = BP.panels.autoDone(q);
        const done = M.CHECKLIST.filter((c) => (c.auto ? ad[c.auto] : (p.checklist[c.id] || {}).done)).length;
        return T_('{n} von {total} erledigt', { n: done, total: M.CHECKLIST.length });
      }
    }
    return '';
  }

  function renderSteps() {
    const el = document.getElementById('steps');
    const cur = M.STEPS.findIndex((s) => s.id === A.step);
    el.innerHTML = '<ol>' + M.STEPS.map((s, i) => {
      const stt = stepState(s.id);
      return '<li><button class="step' + (i === cur ? ' active' : '') + (i < cur ? ' done' : '') + '" data-step="' + s.id + '" aria-current="' + (i === cur ? 'step' : 'false') + '">' +
        '<span class="no">' + (i + 1) + '</span><span class="t">' + T_(s.title) + '</span><span class="dot ' + stt + '" title="' + ({ ok: T_('in Ordnung'), warn: T_('Warnung'), err: T_('Fehler') }[stt]) + '"></span><span class="v">' + esc(stepValue(s.id)) + '</span></button></li>';
    }).join('') + '</ol><p class="foot">' + T_('Vorbemessung und Mengen für die Planung. Bauantrag und Ausführung brauchen eine geprüfte Statik.') + '</p>';
    const act = el.querySelector('.step.active');
    if (act && el.scrollWidth > el.clientWidth) el.scrollLeft += act.getBoundingClientRect().left - el.getBoundingClientRect().left - 8;
  }

  function renderTafel() {
    const q = A.q, s = q.summary, st = q.struct;
    const cls = (e) => (e > 1 ? 'err' : e > 0.9 ? 'warn' : 'ok');
    const cell = (step, val, unit, label, c) => '<div class="cell ' + (c || '') + '" data-step="' + step + '"><b>' + val + (unit ? '<small>' + unit + '</small>' : '') + '</b><span>' + label + '</span></div>';
    const issues = s.errors + s.warnings;
    document.getElementById('tafel').innerHTML =
      cell('material', fmt(s.concrete, 1), 'm³', T_('Stahlbeton')) +
      cell('statik', fmt(s.steel / 1000, 2), 't', T_('Betonstahl')) +
      cell('konstruktion', fmt(s.excavation, 0), 'm³', T_('Aushub')) +
      cell('material', Math.round(s.cost * BP.laender.fx()).toLocaleString(I18.locale()), BP.laender.sym(), T_('Richtkosten brutto')) +
      cell('ablauf', fmt(s.weeks, 1), T_('Wo.'), T_('Bauzeit')) +
      cell('statik', fmt(s.etaMax), '', T_('Ausnutzung Tragwerk'), cls(s.etaMax)) +
      cell('statik', st.buoyancy.relevant ? fmt(st.buoyancy.final.eta) : T_('kein'), '', T_('Auftrieb'), st.buoyancy.relevant ? cls(st.buoyancy.final.eta) : '') +
      cell('freigabe', String(issues), '', s.errors ? T_(s.warnings === 1 ? '{e} Fehler, {w} Warnung' : '{e} Fehler, {w} Warnungen', { e: s.errors, w: s.warnings }) : s.warnings === 1 ? T_('Warnung') : s.warnings ? T_('Warnungen') : T_('offene Punkte'), s.errors ? 'err' : s.warnings ? 'warn' : 'ok') +
      '<div class="grow"></div><div class="stamp">' + T_('Gespeichert im Browser') + '</div>';
  }

  /* ---------- Verdrahtung ---------- */
  function wire() {
    const ls = document.getElementById('langSel');
    if (ls) ls.addEventListener('change', () => A.setLang(ls.value));
    document.getElementById('steps').addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b) A.setStep(b.dataset.step); });
    document.getElementById('panel').addEventListener('focusout', () => { if (A.panelStale) setTimeout(() => { if (A.panelStale) { A.panelStale = false; BP.panels.render(); } }, 60); });
    document.getElementById('tafel').addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b) A.setStep(b.dataset.step); });
    document.getElementById('views').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) A.setView(b.dataset.view); });
    document.getElementById('tools').addEventListener('click', (e) => {
      const t = e.target.closest('[data-tool]'); if (t) { A.setTool(t.dataset.tool); return; }
      const lb = e.target.closest('[data-level]'); if (lb) { A.setLevel(+lb.dataset.level); return; }
      const sm = e.target.closest('[data-secmode]'); if (sm) { A.ui.sectionMode = sm.dataset.secmode; renderTools(); BP.section.render(); return; }
      const c = e.target.closest('[data-cmd]'); if (!c) return;
      if (c.dataset.cmd === 'fit') { BP.plan2d.fit(); BP.plan2d.render(); }
      if (c.dataset.cmd === 'feToggle') {
        const lv = A.lvl(), st = A.q.struct;
        const pick = lv > 0 && st.mids.some((m) => m.level === lv && m.method === 'FE') ? 'mid' + lv : st.roof && st.roof.method === 'FE' ? 'roof' : 'floor';
        A.ui.feView = A.ui.feView ? null : { slab: pick, qty: 'mx' };
        if (A.ui.feView) A.ui.level = A.slabLevel(pick);
        renderTools(); BP.plan2d.render();
      }
      if (c.dataset.cmd === 'del') A.deleteSelection();
      if (c.dataset.cmd === 'csv') BP.exporter.csv();
      if (c.dataset.cmd === 'routeDone') { A.finishRoute(); }
      if (c.dataset.cmd === 'routeType') { if (!A.ui.drawingRoute) { A.ui.routeType = A.ui.routeType === 'kabel' ? 'luft' : 'kabel'; renderTools(); } else A.toast(T_('Typ gilt für den nächsten Weg. Erst diesen Weg beenden.')); }
    });
    document.getElementById('tools').addEventListener('change', (e) => {
      const fs = e.target.dataset && e.target.dataset.fesel;
      if (fs && A.ui.feView) {
        A.ui.feView[fs] = e.target.value;
        if (fs === 'slab') A.ui.level = A.slabLevel(A.ui.feView.slab);
        if (fs === 'slab' && A.ui.feView.slab !== 'floor' && A.ui.feView.qty === 'p') A.ui.feView.qty = 'mx';
        renderTools(); BP.plan2d.render(); return;
      }
      if (e.target.id === 'snapChk') A.ui.snap = e.target.checked;
      if (e.target.id === 'routeH') { const v = parseFloat(String(e.target.value).replace(',', '.')); if (isFinite(v) && v > -10 && v < 30) A.ui.routeH = v; else e.target.value = A.ui.routeH; }
    });
    const tu = document.getElementById('threeUi');
    tu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-3d]'); if (!b) return;
      const c = b.dataset['3d'], o = BP.view3d.opts;
      if (c === 'iso') BP.view3d.resetCamera(); else if (c === 'top') BP.view3d.resetCamera('top'); else if (c === 'front') BP.view3d.resetCamera('front');
      else { BP.view3d.setOption(c, !o[c]); renderThreeUi(tu); }
    });
    tu.addEventListener('change', (e) => { if (e.target.dataset['3dsel']) BP.view3d.setOption(e.target.dataset['3dsel'], e.target.value); });
    tu.addEventListener('input', (e) => { if (e.target.dataset['3drange']) BP.view3d.setOption(e.target.dataset['3drange'], +e.target.value); });

    document.getElementById('undo').onclick = A.undo;
    document.getElementById('redo').onclick = A.redo;
    document.getElementById('newProject').onclick = A.newProject;
    document.getElementById('saveProject').onclick = () => BP.exporter.json();
    document.getElementById('openProject').onclick = () => document.getElementById('fileInput').click();
    document.getElementById('fileInput').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { A.openProject(JSON.parse(r.result)); } catch (err) { A.toast(T_('Datei ist kein gültiges JSON.'), true); } };
      r.readAsText(f);
      e.target.value = '';
    };
    const nm = document.getElementById('projectName');
    nm.addEventListener('change', () => { const v = nm.value.trim() || T_('Unbenannt'); A.commit((p) => { p.name = v; }, { skipPanel: true }); });
    nm.addEventListener('keydown', (e) => { if (e.key === 'Enter') nm.blur(); });
    const eb = document.getElementById('exportBtn'), em = document.getElementById('exportMenu');
    eb.onclick = (e) => { e.stopPropagation(); em.hidden = !em.hidden; eb.setAttribute('aria-expanded', String(!em.hidden)); };
    document.addEventListener('click', () => { em.hidden = true; eb.setAttribute('aria-expanded', 'false'); });
    em.addEventListener('click', (e) => {
      const b = e.target.closest('[data-export]'); if (!b) return;
      ({ csv: BP.exporter.csv, report: BP.exporter.report, json: BP.exporter.json, plans: BP.exporter.plans, biegeliste: BP.exporter.biegeliste, bvbs: BP.exporter.bvbs, statik: BP.exporter.statik, vergleich: BP.exporter.vergleich, dxf: BP.exporter.dxf, ifc: BP.exporter.ifc })[b.dataset.export]();
    });

    window.addEventListener('keydown', (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? A.redo() : A.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); A.redo(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (t && t.blur) t.blur(); BP.exporter.json(); return; }
      if (typing || mod) return;
      if (e.key === 'Enter' && A.tool === 'route') { A.finishRoute(); return; }
      if (e.key === 'Escape') { if (A.tool !== 'select') A.setTool('select'); else { A.sel = null; A.render(); } BP.plan2d.cancel(); return; }
      if (A.view !== 'plan') return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); A.deleteSelection(); return; }
      if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); A.setLevel(A.lvl() + (e.key === 'PageUp' ? -1 : 1)); return; }
      if (e.key.toLowerCase() === 'd' && (A.tool === 'itreppe' || A.tool === 'aufzug')) { A.ui.vertDir = ((A.ui.vertDir || 0) + 90) % 360; BP.plan2d.render(); return; }
      if (e.key.toLowerCase() === 'd' && A.sel && A.sel.type === 'vert') { A.commit((p) => { const v = p.geom.verts.find((x) => x.id === A.sel.id); if (v) v.dir = (v.dir + 90) % 360; }); return; }
      const map = { v: 'select', w: 'wall', t: 'opening', r: 'room', l: 'route', s: 'stuetze', u: 'unterzug' };
      if (map[e.key.toLowerCase()]) { A.setTool(map[e.key.toLowerCase()]); return; }
      if (e.key.toLowerCase() === 'f') { BP.plan2d.fit(); BP.plan2d.render(); }
      if (e.key === '+') BP.plan2d.zoom(1.2);
      if (e.key === '-') BP.plan2d.zoom(1 / 1.2);
    });
  }

  /* Gespeichertes Projekt, das sich nicht laden ließ: nicht überschreiben, sondern getrennt aufheben. */
  A.keepRejected = function (raw, msg) {
    store('rejected', raw);
    A.ui.rejected = { msg: msg || T_('Datei passt nicht zum aktuellen Format') };
  };
  A.saveRejected = function () {
    const raw = load('rejected');
    if (raw) BP.exporter.download('bunkerplaner-sicherung.json', raw, 'application/json');
  };
  A.dropRejected = function () {
    try { localStorage.removeItem(KEY + '.rejected'); } catch (e) { /* Speicher nicht verfügbar */ }
    A.ui.rejected = null; A.render();
  };

  A.init = function () {
    I18.setLang(initialLang());
    applyStatic();
    let p = null;
    const saved = load('project');
    if (saved) {
      try { p = M.normalize(JSON.parse(saved)); delete p._migrated; C.run(p, { fe: 'none' }); } catch (e) { p = null; A.keepRejected(saved, e.message); }
    }
    if (!A.ui.rejected && load('rejected')) A.ui.rejected = { msg: T_('aus einer früheren Sitzung') };
    A.p = p || M.defaultProject();
    A.recompute();
    syncShape();
    wire();
    BP.panels.init(A);
    BP.plan2d.init(A);
    BP.section.init(A);
    BP.view3d.init(A);
    const st = load('step');
    A.setStep(st && M.STEPS.some((s) => s.id === st) ? st : 'standort');
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', A.init); else A.init();
})(typeof window !== 'undefined' ? window : globalThis);
