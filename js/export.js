/* Export: CSV-Stückliste, Projektdatei, druckbarer Planungsbericht. */
(function (root) {
  const BP = root.BP, M = BP.model;
  const T_ = BP.i18n.T, I18 = BP.i18n;
  const EX = BP.exporter = {};
  const fmt = (v, d = 2) => BP.calc.fmt(v, d);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const eur = (v) => BP.laender.show(v, 0);
  const slug = (s) => String(s || 'bunker').toLowerCase().replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c])).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bunker';

  /* Für Ausgaben immer vollständige FE-Ergebnisse: läuft die Berechnung noch, wird sie hier synchron abgeschlossen. */
  function finalQ() {
    const A = BP.app;
    return A.q.struct.fe && A.q.struct.fe.pending ? BP.calc.run(A.p) : A.q;
  }

  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  EX.download = download;

  EX.json = function () {
    const A = BP.app, p = Object.assign({}, A.p);
    delete p._migrated;
    download(slug(A.p.name) + '.bunker.json', JSON.stringify(p, null, 2), 'application/json');
    A.toast(T_('Projektdatei gespeichert.'));
  };

  /* CSV-Zelle für Tabellenprogramme: Text in Anführungszeichen, Formelanfänge (= + - @) entschärft. */
  const cell = (s) => { let t = String(s == null ? '' : s); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
  EX.cell = cell;

  EX.csv = function () {
    const A = BP.app, q = finalQ(), bm = q.bom, c = A.p.costs;
    const n = (v, d = 3) => (isFinite(v) ? I18.dec(v.toFixed(d)) : '');
    const fx = BP.laender.fx(), m = (v) => n(v * fx, 2); // Beträge in Projektwährung
    const row = (arr) => arr.concat(Array(Math.max(0, 9 - arr.length)).fill('')).join(';'); // alle Zeilen mit 9 Spalten
    const sum = (label, v) => row([cell(T_('Summe')), cell(label), '', '', '', '', m(v), '', '']);
    const lines = [row([T_('Gewerk'), T_('Position'), T_('Ausführung'), T_('Menge'), T_('Einheit'), T_('Einzelpreis netto {cur}', { cur: BP.laender.sym() }), T_('Gesamt netto {cur}', { cur: BP.laender.sym() }), T_('davon Eigenleistung h'), T_('Hinweis')].map(cell))];
    for (const it of bm.items) lines.push(row([cell(BP.calc.catText(it.cat)), cell(it.label || it.name), cell(it.mode === 'eigen' ? T_('Eigenleistung') : T_('Firma')), n(it.qty), cell(I18.maybe(it.unit)), m(it.price), m(it.cost), it.hours ? n(it.hours, 1) : '', cell(it.note)]));
    if (c.planningMode !== 'prozent') {
      for (const s of bm.services.filter((x) => x.on)) lines.push(row([cell(T_('Planung & Prüfung')), cell(I18.maybe(s.name)), cell(T_('Fachbüro')), n(1), cell(I18.maybe('psch')), m(s.amount), m(s.amount), '', cell(s.manual ? T_('eigener Betrag') : T_('Richtwert aus Größe und Betonmenge'))]));
    }
    lines.push('');
    lines.push(sum(T_('Bau netto'), bm.net));
    lines.push(sum(c.planningMode === 'prozent' ? T_('Planung {p} % pauschal', { p: fmt(c.planning, 1) }) : T_('Planung & Prüfung (Einzelposten)'), bm.planning));
    lines.push(sum(T_('Reserve {p} %', { p: fmt(c.reserve, 1) }), bm.reserve));
    lines.push(sum(T_('Zwischensumme netto'), bm.sumNet));
    if (bm.ownH > 0) lines.push(sum(T_('davon Eigenleistung {h} h × {wage} {cur}/h (ohne MwSt.)', { h: fmt(bm.ownH, 0), wage: fmt(A.p.self.wage * BP.laender.fx(), 2), cur: BP.laender.sym() }), bm.ownCost));
    lines.push(sum(T_('MwSt. {p} % auf Zugekauftes', { p: fmt(c.vat, 1) }), bm.vat));
    lines.push(sum(T_('Gesamt brutto'), bm.gross));
    lines.push('');
    lines.push(row([T_('Bewehrungsauszug'), T_('Bauteil / Lage'), 'Ø mm', T_('Abstand cm'), T_('Länge m'), T_('Masse kg')].map(cell)));
    for (const i of q.steel.items) lines.push(row([cell(BP.rebar.elText(i.element)), cell(i.pos && i.label.startsWith(i.pos + ' ') ? i.pos + ' ' + BP.rebar.labelText(i.label.slice(i.pos.length + 1)) : i.label), i.phi, i.s ? n(i.s * 100, 1) : '', n(i.length, 1), n(i.kg, 1)]));
    lines.push(row([cell(T_('Summe')), cell(T_('inkl. 3 % Verschnitt')), '', '', '', n(q.steel.total, 1)]));
    download(slug(A.p.name) + '-' + T_('stueckliste@@Datei') + '.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    A.toast(T_('Stückliste als CSV gespeichert.'));
  };

  /* Biegeliste und Bewehrungspläne */
  const planMeta = (A) => ({ project: A.p.name || 'Bunker', concrete: A.p.build.concrete, cnom: A.p.build.cnom, date: new Date().toLocaleDateString(I18.locale()), index: 'a' });
  /* Vergleichspaket: Eingaben, Systeme, Lastfälle, Kombinationen und Ergebnisse je Position (CSV, Semikolon, Dezimalkomma) */
  EX.vergleich = function () {
    const A = BP.app, q = finalQ();
    // Zahlen und reine Zahlenfolgen („0.25 / 0.30“) mit Dezimalkomma, Text unverändert
    const val = (v) => (typeof v === 'number' ? (isFinite(v) ? I18.dec(String(Math.round(v * 1e4) / 1e4)) : '') : cell(/^[-\d\s.\/;:→×|+]+$/.test(String(v)) ? I18.decAll(String(v)) : v));
    const lines = [[T_('Abschnitt'), T_('Bauteil'), T_('Größe'), T_('Wert'), T_('Einheit'), T_('Hinweis')].map(cell).join(';')]
      .concat(BP.vergleich.rows(q).map((r) => [cell(r[0]), cell(r[1]), cell(r[2]), val(r[3]), cell(r[4]), cell(r[5])].join(';')));
    download(slug(A.p.name) + '-' + T_('vergleichspaket@@Datei') + '.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    A.toast(T_('Vergleichspaket als CSV gespeichert.'));
  };
  EX.dxf = function () {
    const A = BP.app, q = finalQ();
    download(slug(A.p.name) + '-' + T_('systemlinien@@Datei') + '.dxf', BP.vergleich.dxf(q), 'application/dxf');
    A.toast(T_('Systemlinien als DXF gespeichert.'));
  };

  /* feste Projektkennung, damit wiederholte Exporte dieselben IFC- und Kalenderkennungen behalten */
  function ensureUid(A) {
    if (A.p.uid) return;
    const r = new Uint32Array(3);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(r); else for (let i = 0; i < 3; i++) r[i] = Math.floor(Math.random() * 4294967296);
    A.p.uid = 'p' + Array.from(r, (x) => x.toString(36)).join('');
    A.save();
  }
  /* Modell als IFC4 (BIM) für Architektur-, Tragwerks- und Koordinationssoftware */
  EX.ifc = function () {
    const A = BP.app, q = finalQ();
    if (!q.geo.valid) { A.toast(T_('Die Außenkontur ist ungültig – erst den Grundriss korrigieren, dann exportieren.'), true); return; }
    ensureUid(A);
    const name = slug(A.p.name) + '.ifc';
    const r = BP.ifc.build(A.p, q, { fileName: name });
    download(name, r.text, 'application/x-step');
    A.toast(T_('IFC-Modell gespeichert ({n} Bauteile und Räume).', { n: Object.entries(r.stats.byClass).filter(([k]) => k !== 'IFCOPENINGELEMENT').reduce((s, [, v]) => s + v, 0) }));
  };

  EX.biegeliste = function () {
    const A = BP.app, q = finalQ();
    download(slug(A.p.name) + '-' + T_('biegeliste@@Datei') + '.csv', '﻿' + BP.rebar.csv(q.steel.schedule, cell), 'text/csv;charset=utf-8');
    A.toast(T_('Biegeliste als CSV gespeichert.'));
  };
  EX.bvbs = function () {
    const A = BP.app, q = finalQ();
    download(slug(A.p.name) + '-' + T_('biegeliste@@Datei') + '.abs', BP.rebar.bvbs(q.steel.schedule, planMeta(A)), 'text/plain;charset=us-ascii');
    A.toast(T_('BVBS-Datei (BF2D) für Biegemaschinen gespeichert.'));
  };
  EX.plans = function () {
    const A = BP.app, q = finalQ(), sch = q.steel.schedule, meta = planMeta(A);
    let el = document.getElementById('report');
    if (!el) { el = document.createElement('div'); el.id = 'report'; document.body.appendChild(el); }
    const sheets = BP.rebar.sheets(q, sch, meta);
    let h = '<style>@page{size:A3 landscape;margin:0}#report .sheet{width:420mm;height:297mm;break-after:page;overflow:hidden}#report .sheet svg{display:block}' +
      '#report .bl{width:420mm;min-height:297mm;box-sizing:border-box;padding:12mm 14mm;break-after:page;font:9pt/1.35 Archivo,Arial,sans-serif;color:#111}#report .bl h2{font-size:14pt;margin:0 0 3mm}' +
      '#report .bl table{width:100%;border-collapse:collapse}#report .bl th,#report .bl td{border-bottom:0.2mm solid #bbb;padding:0.6mm 1.5mm;text-align:left;vertical-align:middle}#report .bl td.r,#report .bl th.r{text-align:right}#report .bl tr.sum td{font-weight:700;border-top:0.4mm solid #111}#report .bl .note{color:#555}</style>';
    for (const sh of sheets) h += '<div class="sheet">' + sh.svg + '</div>';
    // Biegeliste je Bauteil
    const rows = sch.positions.map((r) => '<tr><td><b>' + esc(r.pos) + '</b></td><td>' + esc(BP.rebar.elText(r.el)) + '</td><td>' + esc(BP.rebar.labelText(r.label.replace(/ \((oben|unten)\)$/, ''))) + '</td><td class="r">' + r.n + '</td><td class="r">' + r.phi + '</td><td>' + BP.rebar.shapeSketch(r.shape) + '</td><td class="r">' + fmt(r.L) + '</td><td class="r">' + fmt(r.n * r.L, 1) + '</td><td class="r">' + fmt(r.kg, 1) + '</td></tr>');
    // Seiten A3 quer: Zeilenhöhe ≈ 9 mm (Skizze 7 mm), Summenzeilen ≈ 5,5 mm; die letzte Seite behält Platz für die Summen
    const per = 25, sumRows = Math.ceil((sch.byEl.length + 1 + sch.approx.length) * 5.5 / 9);
    const chunks = [];
    for (let i = 0; i < rows.length;) {
      const rest = rows.length - i, take = rest <= per - sumRows ? rest : rest <= per ? Math.max(1, rest - 3) : per;
      chunks.push([i, i + take]); i += take;
    }
    if (!chunks.length || chunks[chunks.length - 1][1] - chunks[chunks.length - 1][0] > per - sumRows) chunks.push([rows.length, rows.length]);
    for (let ci = 0; ci < chunks.length; ci++) {
      const [i0, i1] = chunks[ci];
      h += '<div class="bl"><h2>' + T_('Biegeliste {project}', { project: esc(meta.project) }) + (chunks.length > 1 ? ' (' + (ci + 1) + '/' + chunks.length + ')' : '') + '</h2><table><tr><th>' + T_('Pos.') + '</th><th>' + T_('Bauteil') + '</th><th>' + T_('Bezeichnung') + '</th><th class="r">' + T_('Anz.') + '</th><th class="r">Ø</th><th>' + T_('Biegeform (cm)') + '</th><th class="r">' + T_('Einzel m') + '</th><th class="r">' + T_('Gesamt m') + '</th><th class="r">kg</th></tr>' + rows.slice(i0, i1).join('');
      if (ci === chunks.length - 1) {
        h += sch.byEl.map((e) => '<tr class="sum"><td></td><td colspan="7">' + T_('Summe {el}', { el: esc(BP.rebar.elText(e.el)) }) + '</td><td class="r">' + fmt(e.kg, 0) + '</td></tr>').join('') +
          '<tr class="sum"><td></td><td colspan="7">' + T_('Biegeliste gesamt (ohne Verschnitt)') + '</td><td class="r">' + fmt(sch.total, 0) + '</td></tr>' +
          sch.approx.map((a) => '<tr><td></td><td colspan="7" class="note">' + T_('nach Ansatz, nicht in der Liste: {el} ({label})', { el: esc(BP.rebar.elText(a.el)), label: esc(a.label) }) + '</td><td class="r">' + fmt(a.kg, 0) + '</td></tr>').join('');
      }
      const NP = BP.normen.profile(A.p);
      h += '</table><p class="note">' + (NP.code === 'ACI' ? T_('Betonstahl {steel}. Biegerollendurchmesser 6 db bis No. 25, 8 db darüber, Bügel 4 db. Stablängen ≤ 12 m, längere Stäbe mit Übergreifungsstoß nach {ref}. Vorplanung – vom Tragwerksplaner zu prüfen.', { steel: esc(NP.steelName), ref: NP.ref.lap })
        : NP.code === 'EC' && NP.na === 'DE' ? T_('Betonstahl B500B. Biegerollendurchmesser 4 Ø bis Ø16, 7 Ø darüber. Stablängen ≤ 12 m, längere Stäbe mit Übergreifungsstoß nach EC2/NA DE. Vorplanung – vom Tragwerksplaner zu prüfen.')
        : T_('Betonstahl {steel}. Biegerollendurchmesser 4 Ø bis Ø16, 7 Ø darüber. Stablängen ≤ 12 m, längere Stäbe mit Übergreifungsstoß nach {ref}. Vorplanung – vom Tragwerksplaner zu prüfen.', { steel: NP.steel || 'B500B', ref: NP.ref.lap })) + '</p></div>';
    }
    el.innerHTML = h;
    setTimeout(() => window.print(), 80);
  };

  /* Statische Berechnung (Vorbemessung) auf A4-Seiten mit Inhaltsverzeichnis, Kopf- und Fußzeile */
  EX.statik = function () {
    const A = BP.app, q = finalQ(), p = A.p;
    let el = document.getElementById('report');
    if (!el) { el = document.createElement('div'); el.id = 'report'; document.body.appendChild(el); }
    el.style.display = 'block';
    const meta = { project: p.name || 'Bunker', site: p.site.label || '', date: new Date().toLocaleDateString(I18.locale()), index: 'a', version: 'v2', client: '', author: '' };
    const rep = BP.statikReport.build(q, meta);
    const r = BP.statikReport.render(el, rep, meta);
    el.style.display = '';
    A.toast(T_('Statische Berechnung mit {n} Seiten erstellt.', { n: r.pages }));
    setTimeout(() => window.print(), 120);
  };

  EX.report = function () {
    const A = BP.app, q = finalQ(), p = A.p, st = q.struct, s = q.schedule, bm = q.bom, c = p.costs;
    let el = document.getElementById('report');
    if (!el) { el = document.createElement('div'); el.id = 'report'; document.body.appendChild(el); }
    const svgCopy = (svg, pre) => {
      if (!svg || !svg.innerHTML) return '';
      const w = svg.clientWidth || 800, h = svg.clientHeight || 600;
      const inner = svg.innerHTML.replace(/id="([\w-]+)"/g, 'id="' + pre + '$1"').replace(/url\(#([\w-]+)\)/g, 'url(#' + pre + '$1)');
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto;max-height:110mm">' + inner + '</svg>';
    };
    // Ansichten kurz sichtbar machen, damit Plan, Schnitt und 3D aktuell und ohne Auswahl gezeichnet sind; danach alles zurück
    const views = ['view-plan', 'view-schnitt', 'view-3d'].map((id) => document.getElementById(id));
    const was = views.map((v) => v.classList.contains('on'));
    const pv = Object.assign({}, BP.plan2d.view), keep = { sel: A.sel, tool: A.tool, level: A.ui.level, fe: A.ui.feView };
    let planSvg = '', secSvg = '', img = null;
    const levelSvgs = [];
    try {
      A.sel = null; A.tool = 'select'; A.ui.feView = null; BP.plan2d.clearTransient();
      views.forEach((v) => v.classList.add('on'));
      A.ui.level = 0;
      BP.plan2d.fit(); BP.plan2d.render(); BP.section.render();
      if (BP.view3d.available()) { BP.view3d.mount(document.getElementById('three')); BP.view3d.invalidate(); img = BP.view3d.snapshot(); }
      planSvg = svgCopy(document.getElementById('planSvg'), 'rp-');
      secSvg = svgCopy(document.getElementById('sectionSvg'), 'rs-');
      for (let i = 1; i < q.geo.L.length; i++) { A.ui.level = i; BP.plan2d.render(); levelSvgs.push(svgCopy(document.getElementById('planSvg'), 'rp' + i + '-')); }
    } finally {
      views.forEach((v, i) => v.classList.toggle('on', was[i]));
      Object.assign(BP.plan2d.view, pv);
      A.sel = keep.sel; A.tool = keep.tool; A.ui.level = keep.level; A.ui.feView = keep.fe;
      BP.view3d.invalidate();
      A.renderView();
    }
    const start = p.schedule.start ? new Date(p.schedule.start) : null;
    const dt = (d) => { const iso = q.schedule.dates && q.schedule.dates[Math.min(d, q.schedule.dates.length - 1)]; return iso ? I18.date(iso) : T_('AT {d}', { d }); };
    const tr = (k, v) => '<tr><th>' + k + '</th><td>' + v + '</td></tr>';
    const autoDone = BP.panels.autoDone(q);
    let h = '<style>#report{font:10.5pt/1.45 Archivo,system-ui,sans-serif;color:#1d2220;padding:0}#report h1{font-size:20pt;font-stretch:85%;margin:0 0 2mm}#report h2{font-size:13pt;margin:8mm 0 2mm;border-bottom:1px solid #1d2220;padding-bottom:1mm;break-after:avoid}#report table{width:100%;border-collapse:collapse;font-size:9.5pt}#report th,#report td{border-bottom:1px solid #dfe3e0;padding:1.2mm 1.5mm;text-align:left;vertical-align:top}#report td.r{text-align:right}#report .two{display:grid;grid-template-columns:1fr 1fr;gap:8mm}#report .pg{break-before:page}#report img{width:100%;border:1px solid #dfe3e0}#report .note{color:#57605b;font-size:9pt}@page{size:A4;margin:14mm}</style>';
    h += '<h1>' + esc(p.name) + '</h1><p class="note">' + T_('Planungsbericht vom {date}. Vorbemessung und Mengenermittlung; ersetzt keine geprüfte Tragwerksplanung.', { date: new Date().toLocaleDateString(I18.locale()) }) + '</p>';
    h += '<div class="two"><div><h2>' + T_('Eckdaten') + '</h2><table>' +
      tr(T_('Standort'), esc(p.site.label || (p.site.lat ? p.site.lat + ', ' + p.site.lon : T_('nicht gesetzt')))) +
      (typeof p.site.groundNHN === 'number' && isFinite(p.site.groundNHN) ? tr(T_('Geländehöhe'), T_('±0,00 = {h} m NHN', { h: fmt(p.site.groundNHN) })) : '') +
      tr(T_('Baugrund'), esc(T_(q.soil.name))) + tr(T_('Wasser'), esc(q.lv.water.label)) +
      tr(T_('Belegung'), T_('{n} Personen, {d} Tage', { n: esc(p.use.people), d: esc(p.use.days) })) +
      tr(T_('Brutto / Netto'), fmt(q.geo.A) + ' / ' + fmt(q.geo.tot.Anet) + ' m²' + (q.geo.L.length > 1 ? ' (' + T_('{n} Ebenen', { n: q.geo.L.length }) + ')' : '')) +
      tr(T_('Außenwand / Decke / Platte'), fmt(p.build.tWall * 100, 0) + ' / ' + fmt(p.build.tRoof * 100, 0) + ' / ' + fmt(p.build.tFloor * 100, 0) + ' cm') +
      tr(T_('Erdüberdeckung'), fmt(p.build.cover) + ' m') + (q.lv.mound.on ? tr(T_('Erdhügel'), T_('{h} m über Gelände, Krone {c} m, Böschung 1 : {n}, {v} m³', { h: fmt(q.lv.mound.h), c: fmt(q.lv.mound.crest), n: fmt(q.lv.mound.n, 1), v: fmt(q.earth.Vmound, 0) })) : '') + tr(T_('Beton'), esc(p.build.concrete) + ', ' + esc(M.WATERPROOFING[p.build.waterproofing] ? T_(M.WATERPROOFING[p.build.waterproofing].name) : p.build.waterproofing)) +
      '</table></div><div><h2>' + T_('Kennwerte') + '</h2><table>' +
      tr(T_('Stahlbeton'), fmt(q.summary.concrete, 1) + ' m³') + tr(T_('Betonstahl'), fmt(q.steel.total / 1000, 2) + ' t (' + fmt(q.steel.perM3, 0) + ' kg/m³)') +
      tr(T_('Aushub / Abfuhr'), fmt(q.earth.Vexc, 0) + ' / ' + fmt(q.earth.Vloose, 0) + ' m³') + tr(T_('Bauzeit'), T_('{d} AT ({w} Wochen)', { d: s.total, w: fmt(s.weeks, 1) })) +
      tr(T_('Kosten netto'), eur(bm.sumNet)) + tr(T_('Kosten brutto'), '<b>' + eur(bm.gross) + '</b>') + (bm.ownH > 0 ? tr(T_('Eigenleistung'), fmt(bm.ownH, 0) + ' h') : '') +
      tr(T_('Max. Ausnutzung Tragwerk'), fmt(q.summary.etaMax)) + tr(T_('Auftrieb'), st.buoyancy.relevant ? 'η = ' + fmt(st.buoyancy.final.eta) : T_('nicht maßgebend')) +
      '</table></div></div>';
    const multi = q.geo.L.length > 1;
    h += '<h2>' + (multi ? T_('Grundriss Ebene 1 und Schnitt') : T_('Grundriss und Schnitt')) + '</h2><div class="two"><div>' + planSvg + '</div><div>' + secSvg + '</div></div>';
    if (levelSvgs.length) h += '<div class="two">' + levelSvgs.map((sv, i) => '<div><h2>' + T_('Grundriss Ebene {n} „{name}“', { n: i + 2, name: esc(q.geo.L[i + 1].name) }) + '</h2>' + sv + '</div>').join('') + '</div>';
    const rooms = q.geo.L.flatMap((L) => L.rooms).filter((r) => r.area > 0.01);
    if (rooms.length) {
      h += '<h2>' + T_('Räume') + '</h2><table><tr>' + (multi ? '<th>' + T_('Ebene') + '</th>' : '') + '<th>' + T_('Raum') + '</th><th class="r">' + T_('Fläche') + '</th><th class="r">' + T_('Volumen') + '</th></tr>' +
        rooms.map((r) => '<tr>' + (multi ? '<td>' + (r.level + 1) + '</td>' : '') + '<td>' + esc(BP.calc.roomName(r.name)) + '</td><td class="r">' + fmt(r.area) + ' m²</td><td class="r">' + fmt(r.volume, 1) + ' m³</td></tr>').join('') +
        '<tr>' + (multi ? '<th></th>' : '') + '<th>' + T_('Netto gesamt') + '</th><th class="r">' + fmt(q.geo.tot.Anet) + ' m²</th><th class="r">' + fmt(q.tech.V, 1) + ' m³</th></tr></table>';
    }
    if (img) h += '<h2>' + T_('3D-Modell') + '</h2><img src="' + img + '" alt="' + T_('3D-Modell') + '">';
    h += '<h2 class="pg">' + T_('Tragwerk (Vorbemessung)') + '</h2><table><tr><th>' + T_('Bauteil') + '</th><th>' + T_('Bewehrung') + '</th><th class="r">' + T_('Ausnutzung') + '</th></tr>';
    const lay = (ls) => ls.map((l) => esc(l.label) + ': Ø' + l.phi + '/' + fmt(l.s * 100, 1)).join('<br>');
    if (st.roof) h += '<tr><td>' + T_('Decke {t} cm, pEd {p} kN/m²', { t: fmt(p.build.tRoof * 100, 0), p: fmt(st.roof.pEd, 1) }) + '</td><td>' + lay(st.roof.layers) + '</td><td class="r">' + fmt(st.roof.eta) + '</td></tr>';
    for (const m of st.mids) h += '<tr><td>' + esc(BP.rebar.elText(m.name)) + ' ' + fmt(m.h * 100, 0) + ' cm' + (m.method === 'FE' ? ', FE' : '') + '</td><td>' + lay(m.layers) + (m.zulagen && m.zulagen.length ? '<br>' + T_('+ {n} Zulagen', { n: m.zulagen.length }) : '') + '</td><td class="r">' + fmt(m.eta) + '</td></tr>';
    if (st.floor) h += '<tr><td>' + T_('Bodenplatte {t} cm, pEd {p} kN/m²', { t: fmt(p.build.tFloor * 100, 0), p: fmt(st.floor.pEd, 1) }) + '</td><td>' + lay(st.floor.layers) + '</td><td class="r">' + fmt(st.floor.eta) + '</td></tr>';
    h += '<tr><td>' + T_('Außenwand {t} cm, e {p1}–{p2} kN/m²', { t: fmt(p.build.tWall * 100, 0), p1: fmt(st.wall.p1, 1), p2: fmt(st.wall.p2, 1) }) + '</td><td>' + lay(st.wall.layers) + '</td><td class="r">' + fmt(st.wall.eta) + '</td></tr>';
    h += '<tr><td>' + T_('Sohldruck') + '</td><td>' + T_('{a} von {b} kN/m²', { a: fmt(st.bearing.sigEd, 1), b: fmt(st.bearing.sigRd, 0) }) + '</td><td class="r">' + fmt(st.bearing.eta) + '</td></tr>';
    if (st.buoyancy.relevant) h += '<tr><td>' + T_('Auftrieb Endzustand / Rohbau') + '</td><td>U = ' + fmt(st.buoyancy.final.U, 0) + ' kN</td><td class="r">' + fmt(st.buoyancy.final.eta) + ' / ' + fmt(st.buoyancy.bau.eta) + '</td></tr>';
    h += '</table>';
    // Schutzgrad und außergewöhnlicher Lastfall
    const hz = p.hazard, bl = st.blast;
    const flags = [['radiation', T_('Strahlung')], ['cb', T_('ABC')], ['fire', T_('Brand')], ['shock', T_('Erschütterung')], ['emp', T_('EMP')]].filter(([k]) => hz[k]).map(([, n]) => n);
    h += '<h2>' + T_('Schutzgrad und Einwirkungen') + '</h2><table>' +
      tr(T_('Luftstoß'), bl ? T_('{q} kN/m² (außergewöhnlich, TWK 2017)', { q: fmt(bl.qk, 0) }) : T_('kein Lastfall')) +
      tr(T_('Weitere Schutzziele'), flags.join(', ') || T_('keine')) +
      tr(T_('Verdichtungserddruck'), p.use.compaction ? fmt(st.evh, 0) + ' kN/m² (DIN 4085)' : T_('nicht angesetzt')) +
      tr(T_('Betonäquivalent über dem Raum'), fmt(st.shield.heq * 100, 0) + ' cm' + (hz.radiation ? ' (TWK: ≥ 65 cm)' : '')) + '</table>';
    if (bl) {
      const accRow = (name, a) => (a ? '<tr><td>' + name + '</td><td>' + fmt(a.pM, 1) + ' kN/m²</td><td>' + fmt(a.qRd, 1) + ' kN/m²</td><td>' + (a.shear.reinf ? 'Ø' + a.shear.reinf.phi + '/' + fmt(a.shear.reinf.s * 100, 0) + ', ' + T_('Streifen {b} m', { b: fmt(a.shear.strip) }) : a.shear.needs ? T_('reicht nicht') : T_('nicht nötig')) + '</td><td class="r">' + fmt(a.eta) + '</td></tr>' : '');
      h += '<table style="margin-top:3mm"><tr><th>' + T_('Lastfall Luftstoß') + '</th><th>' + T_('Biegelast') + '</th><th>' + T_('Traglast qRd') + '</th><th>' + T_('Schubbewehrung') + '</th><th class="r">' + T_('Ausnutzung') + '</th></tr>' +
        accRow(T_('Decke'), st.roof && st.roof.acc) + accRow(T_('Außenwand'), st.wall.acc) + accRow(T_('Bodenplatte'), st.floor && st.floor.acc) + '</table>';
    }
    const spec = Object.entries(hz.scenarios || {}).filter(([, v]) => v && v.on);
    if (spec.length) {
      h += '<table style="margin-top:3mm"><tr><th>' + T_('Gefordertes Sonderszenario') + '</th><th>' + T_('Status') + '</th></tr>' + spec.map(([k, v]) => '<tr><td>' + esc(M.SPECIAL_SCENARIOS[k] ? T_(M.SPECIAL_SCENARIOS[k].name) : k) + (k === 'near' && v.dist != null ? ', ' + T_('{d} m Abstand', { d: fmt(v.dist, 1) }) : '') + '</td><td>' + (hz.expert.reference ? T_('Fachbemessung: {ref}', { ref: esc(hz.expert.reference) }) + (hz.expert.authority ? ', ' + esc(hz.expert.authority) : '') : T_('nicht bemessen, Fachplanung Schutzbau erforderlich')) + '</td></tr>').join('') + '</table>';
      if (hz.assumption) h += '<p class="note">' + T_('Bedrohungsannahme: {text}', { text: esc(hz.assumption) }) + '</p>';
    }
    const sv = q.tech.svc;
    if (sv) {
      const rows = [];
      rows.push(tr(T_('Lüftung'), (q.tech.ventN > 1 ? q.tech.ventN + ' × ' : '') + T_('{v} m³/h, Bedarf {q} m³/h', { v: q.tech.ventSize, q: fmt(q.tech.qCo2, 0) }) + (sv.prot ? '; ' + T_('Filterbetrieb mit {dp} Pa Überdruck, Leckage der Hülle ≤ {leak} m³/h', { dp: fmt(sv.prot.dp, 0), leak: fmt(sv.prot.leakMax, 0) }) : '')));
      if (sv.valves && sv.valves.blast) rows.push(tr(T_('Explosionsschutzventile'), sv.valves.list.map((x) => esc(x.name) + ': ' + (x.n > 1 ? x.n + ' × ' : '') + x.size + ' m³/h').join('<br>')));
      if (sv.heat) rows.push(tr(T_('Wärme und Kühlung'), T_('Last {load} kW, Erdreich {ground} kW', { load: fmt(sv.heat.load / 1000, 1), ground: fmt(sv.heat.ground / 1000, 1) }) + (sv.heat.kW > 0 ? ', ' + T_('Kühlgerät {kw} kW', { kw: fmt(sv.heat.kW, 1) }) + (sv.heat.mode === 'auto' ? '' : ' (' + T_('nicht eingeplant') + ')') : ', ' + T_('keine Kühlung nötig'))));
      if (sv.gen) rows.push(tr(T_('Notstrom'), sv.gen.kVA + ' kVA (' + (sv.gen.loc === 'innen' ? T_('Maschinenraum') : T_('außen')) + '), ' + T_('Tank {tank} L (AwSV {stufe}), Abgas DN {dn}', { tank: (sv.gen.nTanks > 1 ? sv.gen.nTanks + ' × ' : '') + fmt(sv.gen.tankSize, 0), stufe: sv.gen.stufe, dn: sv.gen.dnExh }) + (sv.gen.loc === 'innen' ? ', ' + T_('Zuluft Maschinenraum {q} m³/h', { q: fmt(sv.gen.intake, 0) }) : '')));
      if (sv.sew) rows.push(tr(T_('Abwasser'), sv.sew.mode === 'hebeanlage' ? (sv.sew.double ? T_('Doppel-Hebeanlage DN {dn}', { dn: sv.sew.dn }) : T_('Hebeanlage DN {dn}', { dn: sv.sew.dn })) + ', ' + fmt(sv.sew.Qp, 1) + ' l/s, H = ' + fmt(sv.sew.H, 1) + ' m; ' + T_('Sammeltank {v} L', { v: fmt(q.tech.waste, 0) }) : sv.sew.mode === 'tank' ? T_('Sammeltank {v} L', { v: fmt(q.tech.waste, 0) }) : T_('Trockentoiletten')));
      h += '<h2>' + T_('Schutz- und Haustechnik') + '</h2><table>' + rows.join('') + '</table>';
      const pr = q.tech.products || [];
      if (pr.length) h += '<h3>' + T_('Produktbeispiele (belegte Kenndaten)') + '</h3><table><tr><th>' + T_('Bauteil') + '</th><th>' + T_('Beispiel') + '</th><th>' + T_('Kenndaten') + '</th><th>' + T_('Quelle') + '</th></tr>' + pr.map((x) => '<tr><td>' + esc(x.item) + '<br><span class="note">' + esc(x.need) + '</span></td><td>' + esc(x.product) + '</td><td>' + esc(x.data) + (x.note ? '<br><span class="note">' + esc(x.note) + '</span>' : '') + '</td><td class="note">' + esc(x.src.title) + ', ' + esc(x.src.url) + ' (' + esc(I18.date(x.src.date)) + ')</td></tr>').join('') + '</table><p class="note">' + T_('Keine Kaufempfehlung; Auswahl, Kennlinien, Zulassung und Preise durch Fachplaner und Hersteller.') + '</p>';
    }
    if (q.radon) {
      const r = q.radon, cl = r.states.find((x) => x.id === 'closed'), ve = r.states.find((x) => x.id === 'vent');
      const st = (x, d) => T_('nur Diffusion ≈ {c} Bq/m³; Referenzwert erreicht ab ≈ {q} l/h Bodenluft', { c: fmt(x.Cdiff, d), q: fmt(x.Qmax, x.Qmax < 10 ? 1 : 0) });
      h += '<h2>' + T_('Radonschutz') + '</h2><table>' + tr(T_('Referenzwert für die Raumluft'), Math.round(r.ref0) + ' Bq/m³') +
        tr(T_('Radon in der Bodenluft'), fmt(r.soil, 0) + ' kBq/m³' + (r.soilAssumed ? ' (' + T_('Annahme') + ')' : '')) +
        tr(T_('Geschlossen, Lüftung aus'), st(cl, 0)) + (ve ? tr(T_('Lüftung in Betrieb ({n}/h)', { n: fmt(ve.n, 2) }), st(ve, 1)) : '') +
        tr(T_('Maßnahmen'), r.measures.filter((m) => m.on).map((m) => esc(T_(m.text))).join('<br>') || T_('keine')) +
        tr(T_('Messung nach Fertigstellung'), p.build.radon && p.build.radon.measure ? T_('eingeplant') : T_('noch nicht eingeplant')) + '</table>' +
        '<p class="note">' + T_('Abschätzung für die Vorplanung; der tatsächliche Wert zeigt sich erst in der Messung.') + '</p>';
    }
    if (q.routes.list.length) {
      h += '<h2>' + T_('Leitungen') + '</h2><table><tr><th>' + T_('Leitung') + '</th><th>' + T_('Querschnitt') + '</th><th class="r">' + T_('Länge') + '</th><th>' + T_('Durchführungen') + '</th><th>' + T_('Hinweise') + '</th></tr>' +
        q.routes.list.map((r) => '<tr><td>' + esc(r.src.name) + '<br><span class="note">' + esc(T_(r.kind.name)) + '</span></td><td>' + esc(r.dims.label) + (r.v != null ? '<br><span class="note">' + fmt(r.v, 1) + ' m/s</span>' : '') + '</td><td class="r">' + fmt(r.L) + ' m</td><td>' + esc(r.pens.map((x) => x.where).join(', ') || '–') + '</td><td>' + esc(r.issues.filter((i) => i.level !== 'info').map((i) => i.text).join(' ') || T_('keine')) + '</td></tr>').join('') + '</table>';
    }
    if (q.prot.used) {
      const th = p.protection.threat;
      h += '<h2>' + T_('Schutzaufbau') + '</h2><p class="note">' + T_('Dokumentierte Anforderungen und Schichten. Das Tool weist keine Schutzwirkung nach.') + '</p><table>' +
        tr(T_('Beanspruchung'), esc(M.PROT_FAMILIES[th.family] ? T_(M.PROT_FAMILIES[th.family]) : th.family)) + (th.criterion ? tr(T_('Akzeptanzkriterien'), esc(th.criterion)) : '') + (th.standard ? tr(T_('Prüf-/Bemessungsgrundlage'), esc(th.standard)) : '') + (th.classification ? tr(T_('Klasse / Schutzziel'), esc(th.classification)) : '') + '</table>';
      h += '<table style="margin-top:3mm"><tr><th>' + T_('Bauteil') + '</th><th>' + T_('Schichten (außen nach innen)') + '</th><th class="r">' + T_('Dicke') + '</th><th class="r">kg/m²</th><th>' + T_('Unterlage') + '</th></tr>' +
        Object.values(q.prot.comps).filter((cp) => cp.layers.length || cp.c.evidence.reference).map((cp) => '<tr><td>' + esc(T_(cp.def.name)) + '</td><td>' + cp.layers.map((l) => esc(T_(l.mat.name) + (l.grade ? ' ' + l.grade : '') + ', ' + (l.thickness != null ? l.thickness + ' mm' : T_('offen')))).join('<br>') + '</td><td class="r">' + (cp.total != null ? fmt(cp.total * 1000, 0) + ' mm' : '–') + '</td><td class="r">' + (cp.mass != null ? fmt(cp.mass, 0) : '–') + '</td><td>' + esc(cp.c.evidence.reference || '–') + '<br><span class="note">' + ({ fehlt: T_('Bauteil fehlt'), offen: T_('nicht zugeordnet'), veraltet: T_('veraltet'), zugeordnet: T_('zugeordnet') }[cp.state]) + '</span></td></tr>').join('') + '</table>';
    }
    h += BP.planning.reportHTML(q);
    const sub = (i) => [i.mode === 'eigen' ? T_('Eigenleistung') + (i.hours ? ', ' + fmt(i.hours, 0) + ' h' : '') : '', i.note].filter(Boolean).join(' · ');
    h += '<h2>' + T_('Planmengen und Richtkosten') + '</h2><p>' + T_('Vorbemessung mit Tabellenpreisen; konkrete Händlerangebote separat oben.') + '</p><table><tr><th>' + T_('Position') + '</th><th class="r">' + T_('Menge') + '</th><th>' + T_('Einheit') + '</th><th class="r">' + T_('Richtpreis {cur}', { cur: BP.laender.sym() }) + '</th><th class="r">' + T_('Gesamt') + '</th></tr>' +
      bm.items.map((i) => '<tr><td>' + esc(i.label || i.name) + (sub(i) ? '<br><span class="note">' + esc(sub(i)) + '</span>' : '') + '</td><td class="r">' + fmt(i.qty, i.unit === 't' ? 3 : 2) + '</td><td>' + esc(I18.maybe(i.unit)) + '</td><td class="r">' + fmt(i.price * BP.laender.fx(), 2) + '</td><td class="r">' + eur(i.cost) + '</td></tr>').join('') + '</table>';
    const svc = bm.services.filter((x) => x.on);
    const money = (k, v) => '<tr><th>' + k + '</th><td class="r">' + v + '</td></tr>';
    h += '<table style="margin-top:3mm">' + money(T_('Bau netto'), eur(bm.net)) +
      (c.planningMode === 'prozent' ? money(T_('Planung {p} % pauschal', { p: fmt(c.planning, 1) }), eur(bm.planning))
        : svc.length ? svc.map((x) => money(T_('Planung: {name}', { name: esc(I18.maybe(x.name)) }), eur(x.amount))).join('') : money(T_('Planung & Prüfung'), T_('keine Posten gewählt'))) +
      money(T_('Reserve {p} %', { p: fmt(c.reserve, 1) }), eur(bm.reserve)) + money(T_('Summe netto'), eur(bm.sumNet)) +
      (bm.ownH > 0 ? money(T_('davon Eigenleistung {h} h × {wage} {cur}/h (ohne MwSt.)', { h: fmt(bm.ownH, 0), wage: fmt(p.self.wage * BP.laender.fx(), 2), cur: BP.laender.sym() }), eur(bm.ownCost)) : '') +
      money(T_('MwSt. {p} % auf Zugekauftes', { p: fmt(c.vat, 1) }), eur(bm.vat)) + money('<b>' + T_('Gesamt brutto') + '</b>', '<b>' + eur(bm.gross) + '</b>') + '</table>';
    h += '<h2>' + T_('Bauablauf') + '</h2><table><tr><th>' + T_('Vorgang') + '</th><th class="r">' + T_('AT') + '</th><th>' + T_('Beginn') + '</th><th>' + T_('Ende') + '</th></tr>' +
      s.tasks.filter((t) => t.d > 0).map((t, i) => [t, i]).sort((a, b) => a[0].start - b[0].start || a[1] - b[1]).map(([t]) => t).map((t) => '<tr><td>' + (t.critical ? '<b>' + esc(t.name) + '</b>' : esc(t.name)) + '</td><td class="r">' + t.d + '</td><td>' + dt(t.start) + '</td><td>' + dt(t.end) + '</td></tr>').join('') + '</table>';
    if (s.wh) h += '<p class="note">' + T_('Wasserhaltung {d} AT', { d: s.wh.d }) + (s.wh.cal != null ? ' (' + T_('{n} Kalendertage', { n: s.wh.cal }) + ')' : '') + ', ' + esc(s.wh.reason) + '.</p>';
    h += '<h2>' + T_('Offene Punkte und Freigaben') + '</h2><table>' + q.checks.map((c) => '<tr><td>' + ({ err: T_('Fehler'), warn: T_('Warnung'), info: T_('Hinweis') }[c.level]) + '</td><td>' + esc(c.text) + '</td></tr>').join('') + '</table><table style="margin-top:4mm">' +
      M.CHECKLIST.map((c, i) => { const x = p.checklist[c.id] || {}; const d = c.auto ? autoDone[c.auto] : x.done; return (i === 0 || M.CHECKLIST[i - 1].group !== c.group ? '<tr><th colspan="2">' + esc(T_(c.group)) + '</th></tr>' : '') + '<tr><td style="width:8mm">' + (d ? '✔' : '☐') + '</td><td>' + esc(M.checkText(c, p)) + (x.note ? '<br><span class="note">' + esc(x.note) + '</span>' : '') + '</td></tr>'; }).join('') + '</table>';
    el.innerHTML = h;
    setTimeout(() => window.print(), 80);
  };

  /* ---------- Bauantrag ---------- */
  /* Grundrisse je Ebene und Schnitt als SVG (wie im Planungsbericht), ohne Auswahl und Hilfslinien */
  function drawings(q) {
    const A = BP.app;
    const copy = (svg, pre) => {
      if (!svg || !svg.innerHTML) return '';
      const w = svg.clientWidth || 800, h = svg.clientHeight || 600;
      const inner = svg.innerHTML.replace(/id="([\w-]+)"/g, 'id="' + pre + '$1"').replace(/url\(#([\w-]+)\)/g, 'url(#' + pre + '$1)');
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto;max-height:120mm">' + inner + '</svg>';
    };
    const views = ['view-plan', 'view-schnitt'].map((id) => document.getElementById(id)), was = views.map((v) => v && v.classList.contains('on'));
    const pv = Object.assign({}, BP.plan2d.view), keep = { sel: A.sel, tool: A.tool, level: A.ui.level, fe: A.ui.feView };
    let out = '';
    try {
      A.sel = null; A.tool = 'select'; A.ui.feView = null; BP.plan2d.clearTransient();
      views.forEach((v) => v && v.classList.add('on'));
      for (let i = 0; i < q.geo.L.length; i++) {
        A.ui.level = i; BP.plan2d.fit(); BP.plan2d.render();
        out += '<h3>' + (q.geo.L.length > 1 ? T_('Grundriss Ebene {n} „{name}“', { n: i + 1, name: esc(q.geo.L[i].name) }) : T_('Grundriss')) + '</h3>' + copy(document.getElementById('planSvg'), 'ba' + i + '-');
      }
      A.ui.level = 0; BP.section.render();
      out += '<h3>' + T_('Schnitt') + '</h3>' + copy(document.getElementById('sectionSvg'), 'bs-');
    } finally {
      views.forEach((v, i) => v && v.classList.toggle('on', was[i]));
      Object.assign(BP.plan2d.view, pv);
      A.sel = keep.sel; A.tool = keep.tool; A.ui.level = keep.level; A.ui.feView = keep.fe;
      A.renderView();
    }
    return out;
  }
  EX.bauantrag = function () {
    const A = BP.app, q = finalQ();
    let el = document.getElementById('report');
    if (!el) { el = document.createElement('div'); el.id = 'report'; document.body.appendChild(el); }
    el.innerHTML = BP.bauantrag.bundle(A.p, q, { drawings: drawings(q) });
    A.toast(T_('Bauvorlagen erstellt – im Druckdialog als PDF speichern.'));
    setTimeout(() => window.print(), 120);
  };
  /* Druckfassung für kurze Unterlagen (Wartungsplan, Variantenvergleich) */
  const PRINT_CSS = '<style>#report{font:10.5pt/1.45 Archivo,system-ui,sans-serif;color:#1d2220}#report h1{font-size:19pt;margin:0 0 2mm}#report h2{font-size:13pt;margin:7mm 0 2mm;border-bottom:1px solid #1d2220;padding-bottom:1mm;break-after:avoid}' +
    '#report table{width:100%;border-collapse:collapse;margin:1mm 0 3mm}#report th,#report td{text-align:left;vertical-align:top;padding:1mm 1.5mm;border-bottom:0.2mm solid #ccc;font-size:9.5pt}#report th{font-weight:600}#report td.r{text-align:right;white-space:nowrap}' +
    '#report .note{color:#555;font-size:9pt}#report tr{break-inside:avoid}#report .best{font-weight:700}</style>';
  function printHTML(html, msg) {
    let el = document.getElementById('report');
    if (!el) { el = document.createElement('div'); el.id = 'report'; document.body.appendChild(el); }
    el.innerHTML = PRINT_CSS + html;
    BP.app.toast(msg || T_('Im Druckdialog als PDF speichern.'));
    setTimeout(() => window.print(), 120);
  }

  /* Betrieb und Wartung: Kalender, CSV, Druck */
  EX.wartungIcs = function () {
    const A = BP.app, pl = BP.wartung.plan(A.p, finalQ());
    ensureUid(A);
    download(slug(A.p.name) + '-' + T_('wartung@@Datei') + '.ics', BP.wartung.ics(pl, A.p), 'text/calendar;charset=utf-8');
    A.toast(T_('Kalenderdatei gespeichert: {n} wiederkehrende Termine. In Outlook, Google oder Apple-Kalender importieren.', { n: pl.tasks.filter((x) => x.months).length }));
  };
  EX.wartungCsv = function () {
    const A = BP.app, pl = BP.wartung.plan(A.p, finalQ());
    const lines = [[T_('Bereich'), T_('Aufgabe'), T_('Intervall'), T_('Wer'), T_('Nächster Termin'), T_('Grundlage'), T_('Verbindlichkeit'), T_('Hinweis'), T_('Bewertung'), T_('Quelle')].map(cell).join(';')]
      .concat(BP.wartung.rows(pl).map((r) => [r.comp, r.task, r.interval, r.who, r.next, r.basis, r.mandatory, r.note, T_(BP.bauantrag.STATUS[r.status] || r.status), r.source].map(cell).join(';')));
    download(slug(A.p.name) + '-' + T_('wartung@@Datei') + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    A.toast(T_('Wartungsplan als CSV gespeichert.'));
  };
  EX.wartungPrint = function () {
    const A = BP.app, pl = BP.wartung.plan(A.p, finalQ()), rows = BP.wartung.rows(pl);
    let h = '<h1>' + T_('Wartungsplan: {name}', { name: esc(A.p.name) }) + '</h1><p class="note">' + T_('Inbetriebnahme {d}. Erstellt mit dem Bunkerplaner am {today}. Herstellerangaben und Auflagen der Behörde haben Vorrang.', { d: I18.date(pl.start), today: new Date().toLocaleDateString(I18.locale()) }) + '</p>';
    let comp = null;
    for (const r of rows) {
      if (r.comp !== comp) { h += (comp ? '</table>' : '') + '<h2>' + esc(r.comp) + '</h2><table><tr><th>' + T_('Aufgabe') + '</th><th>' + T_('Intervall') + '</th><th>' + T_('Wer') + '</th><th>' + T_('Nächster Termin') + '</th><th>' + T_('Erledigt') + '</th></tr>'; comp = r.comp; }
      h += '<tr><td>' + esc(r.task) + '<br><span class="note">' + esc([r.basis, r.note].filter(Boolean).join(' – ')) + '</span></td><td>' + esc(r.interval) + '</td><td>' + esc(r.who) + '</td><td>' + (r.next ? esc(I18.date(r.next)) : '') + '</td><td style="width:22mm"></td></tr>';
    }
    if (comp) h += '</table>';
    if (pl.notes.length) h += '<h2>' + T_('Hinweise') + '</h2>' + pl.notes.map((n) => '<p class="note">' + esc(BP.wartung.tx(n)) + '</p>').join('');
    printHTML(h, T_('Wartungsplan erstellt – im Druckdialog als PDF speichern.'));
  };

  /* Variantenvergleich: Druck und CSV */
  function variantTable() {
    const A = BP.app, VA = BP.varianten, p = A.p;
    const cols = [{ name: T_('Aktuell'), m: VA.metrics(p, A.q), d: VA.describe(p) }].concat((p.variants || []).map((v) => ({ name: v.name, m: v.m, d: VA.describe(v.snap) })));
    const rows = [[T_('Land'), cols.map((c) => c.d.country)], [T_('Bauteile'), cols.map((c) => c.d.dims)], [T_('Beton'), cols.map((c) => c.d.concrete)], [T_('Abdichtung'), cols.map((c) => c.d.wp)],
      [T_('Erdüberdeckung'), cols.map((c) => fmt(c.d.cover, 2) + ' m')], [T_('Ebenen'), cols.map((c) => String(c.d.levels))]];
    for (const r of VA.ROWS) {
      const vals = cols.map((c) => VA.value(r, c.m));
      if (vals.every((v) => v == null)) continue;
      rows.push([T_(r.label), vals.map((v) => (v == null ? '' : r.money ? BP.laender.show(v, 0) : fmt(v * (r.scale || 1), r.d) + (r.unit ? ' ' + T_(r.unit) : '')))]);
    }
    return { cols, rows };
  }
  EX.variantPrint = function () {
    const A = BP.app, t = variantTable();
    const h = '<h1>' + T_('Variantenvergleich: {name}', { name: esc(A.p.name) }) + '</h1><p class="note">' + T_('Kennwerte der Vorbemessung zum Zeitpunkt des Speicherns der Variante; „Aktuell“ = offener Stand.') + '</p>' +
      '<table><tr><th></th>' + t.cols.map((c) => '<th>' + esc(c.name) + '</th>').join('') + '</tr>' + t.rows.map(([k, vs]) => '<tr><th>' + esc(k) + '</th>' + vs.map((v) => '<td class="r">' + esc(v) + '</td>').join('') + '</tr>').join('') + '</table>';
    printHTML(h);
  };
  EX.variantCsv = function () {
    const A = BP.app, t = variantTable();
    const lines = [[T_('Kennwert')].concat(t.cols.map((c) => c.name)).map(cell).join(';')].concat(t.rows.map(([k, vs]) => [k].concat(vs).map(cell).join(';')));
    download(slug(A.p.name) + '-' + T_('varianten@@Datei') + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    A.toast(T_('Variantenvergleich als CSV gespeichert.'));
  };

  EX.bauantragCsv = function () {
    const A = BP.app, q = finalQ();
    const lines = [[T_('Angabe'), T_('Wert')].map(cell).join(';')].concat(BP.bauantrag.values(A.p, q).map((v) => [cell(v.label), cell(v.value)].join(';')));
    download(slug(A.p.name) + '-' + T_('bauantrag-ausfuellhilfe@@Datei') + '.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  };
  const needServer = (msg) => (location.protocol === 'file:' ? T_('Diese Funktion braucht den lokalen Server: python server.py starten.') : msg);
  /* Aktualität: Formular über den lokalen Server abrufen, Fingerabdruck mit dem letzten Abruf vergleichen */
  EX.formCheck = async function (url) {
    const A = BP.app;
    try {
      const r = await fetch('api/form-check?url=' + encodeURIComponent(url));
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ? T_(d.error) : T_('Abruf fehlgeschlagen'));
      const prev = A.p.permit.formChecks[url], changed = !!(prev && prev.sha256 && prev.sha256 !== d.sha256);
      A.commit((p) => { p.permit.formChecks[url] = { sha256: d.sha256, size: d.size, lastModified: d.lastModified, checked: d.checked, pdf: d.pdf, changed }; });
      A.toast(changed ? T_('Das Formular hat sich seit der letzten Prüfung geändert – neue Fassung verwenden.') : prev ? T_('Formular unverändert seit {d}.', { d: I18.date(prev.checked) }) : T_('Formular erreichbar{lm}; Fingerabdruck gespeichert.', { lm: d.lastModified ? ' (' + T_('zuletzt geändert {d}', { d: d.lastModified }) + ')' : '' }));
    } catch (err) { A.toast(needServer(String(err.message || err)), true); }
  };
  /* Ausfüllen: PDF über den lokalen Server holen, Felder mit pdf-lib lesen und den Projektwerten zuordnen */
  let pdfLib = null, ffBytes = null;
  const loadPdfLib = () => pdfLib || (pdfLib = new Promise((res, rej) => {
    if (root.PDFLib) { res(root.PDFLib); return; }
    const sc = document.createElement('script'); sc.src = 'vendor/pdf-lib.min.js'; sc.onload = () => res(root.PDFLib); sc.onerror = () => { pdfLib = null; rej(new Error(T_('pdf-lib konnte nicht geladen werden.'))); };
    document.head.appendChild(sc);
  }));
  const tipOf = (L, fld) => { try { const t = fld.acroField.dict.get(L.PDFName.of('TU')); return t && t.decodeText ? t.decodeText() : ''; } catch (e) { return ''; } };
  EX.formFill = async function (url, title) {
    const A = BP.app;
    A.toast(T_('Formular wird geladen …'));
    try {
      const r = await fetch('api/form?url=' + encodeURIComponent(url));
      if (!r.ok) { let m = T_('Abruf fehlgeschlagen'); try { const d = await r.json(); if (d.error) m = T_(d.error); } catch (e) { /* kein JSON */ } throw new Error(m); }
      const bytes = new Uint8Array(await r.arrayBuffer()), L = await loadPdfLib();
      const doc = await L.PDFDocument.load(bytes, { ignoreEncryption: true });
      const vals = BP.bauantrag.values(A.p, A.q), list = [], map = {};
      doc.getForm().getFields().forEach((fld, i) => {
        if (!(fld instanceof L.PDFTextField)) return;
        const name = fld.getName(), tip = tipOf(L, fld), g = BP.bauantrag.guessField(name, tip, vals);
        list.push({ i, name, tip }); if (g) map[i] = g;
      });
      if (!list.length) { A.toast(T_('Dieses PDF hat keine ausfüllbaren Textfelder – bitte die Ausfüllhilfe nutzen.'), true); return; }
      ffBytes = bytes;
      A.ui.ff = { url, title, fields: list, map };
      A.render();
    } catch (err) { A.toast(needServer(String(err.message || err)), true); }
  };
  EX.formFillSave = async function () {
    const A = BP.app, ff = A.ui.ff;
    if (!ff || !ffBytes) return;
    try {
      const L = await loadPdfLib(), doc = await L.PDFDocument.load(ffBytes, { ignoreEncryption: true }), fieldsAll = doc.getForm().getFields();
      const vals = Object.fromEntries(BP.bauantrag.values(A.p, A.q).map((v) => [v.id, v.value]));
      let n = 0;
      for (const x of ff.fields) {
        const id = ff.map[x.i], fld = fieldsAll[x.i];
        if (!id || !fld || !(fld instanceof L.PDFTextField) || !vals[id]) continue;
        const ml = fld.getMaxLength();
        try { fld.setText(ml ? String(vals[id]).slice(0, ml) : String(vals[id])); n++; } catch (e) { /* Feld gesperrt */ }
      }
      const out = await doc.save({ updateFieldAppearances: true });
      download(slug(ff.title) + '-' + T_('ausgefuellt@@Datei') + '.pdf', new Blob([out], { type: 'application/pdf' }));
      A.toast(T_('{n} Felder ausgefüllt. Bitte im PDF prüfen, ergänzen und unterschreiben.', { n }));
    } catch (err) { A.toast(String(err.message || err), true); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
