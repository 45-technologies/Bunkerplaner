(function (root) {
  'use strict';
  const BP = root.BP, X = BP.planning, esc = X.esc;
  const T_ = BP.i18n.T, I18 = BP.i18n;
  let selectedLine = '';
  const contexts = new WeakMap(); let nextContext = 0;
  const contextToken = () => { const p = BP.app.p.planning; if (!contexts.has(p)) contexts.set(p, 'context' + (++nextContext)); return contexts.get(p); };
  const link = (url, label) => X.url(url) ? '<a href="' + esc(X.url(url)) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>' : '';
  const button = (action, label, i = '') => '<button type="button" class="btn small" data-plan-action="' + action + '" data-index="' + i + '">' + label + '</button>';
  const input = (path, label, value, type = 'text', extra = '') => '<label class="planning-field"><span>' + label + '</span><input data-planning-context="' + contextToken() + '" data-planning="' + path + '" id="px-' + path.replace(/\./g, '-') + '" type="' + type + '" value="' + esc(value == null ? '' : value) + '" ' + extra + '></label>';
  const numeric = (path, label, value, min = 0, max = 1e9, step = 'any') => input(path, label, value, 'number', 'min="' + min + '" max="' + max + '" step="' + step + '"');
  const area = (path, label, value) => '<label class="planning-field"><span>' + label + '</span><textarea rows="2" data-planning-context="' + contextToken() + '" data-planning="' + path + '" id="px-' + path.replace(/\./g, '-') + '">' + esc(value) + '</textarea></label>';
  const select = (path, label, value, choices) => '<label class="planning-field"><span>' + label + '</span><select data-planning-context="' + contextToken() + '" data-planning="' + path + '" id="px-' + path.replace(/\./g, '-') + '">' + Object.entries(choices).map(([k,v]) => '<option value="' + esc(k) + '"' + (k === value ? ' selected' : '') + '>' + esc(v) + '</option>').join('') + '</select></label>';
  X.threatHTML = (p, q) => {
    let h = '<section class="planning-block"><h3>' + T_('Beschuss & Explosionsszenarien') + '</h3><p class="note">' + T_('Waffe, genaue Ausführung und Trefferbedingungen gemeinsam festlegen. Wanddicke, Beton und Schichten stehen unter Konstruktion und Sonderschutz.') + '</p>' + button('add-scenario', T_('Szenario hinzufügen'));
    if (!q.planning.threats.length) h += '<p class="note">' + T_('Geran-2, -3, -4, -5 und Kurzstrecken-Ballistik stehen als Auswahl bereit.') + '</p>';
    q.planning.threats.forEach((v, i) => {
      const s = v.s, r = s.report, path = 'scenarios.' + i + '.', rp = path + 'report.';
      h += '<details class="planning-card" open><summary>' + esc(T_(v.catalog.name)) + ' · ' + T_('{n} Treffer', { n: s.hits }) + '</summary><div class="planning-grid">' +
        select(path + 'weapon', T_('Waffe / untersuchte Variante'), s.weapon, Object.fromEntries(Object.entries(X.catalog).map(([k,c]) => [k,T_(c.name)]))) +
        select(path + 'covers', T_('Deckt geforderte Sonderanforderung ab'), s.covers || '', Object.assign({ '': '—' }, Object.fromEntries(Object.entries(BP.model.SPECIAL_SCENARIOS).map(([k, c]) => [k, T_(c.name)])))) + input(path + 'variant', T_('Genaue Ausführung / Gefechtskopf'), s.variant) + select(path + 'mode', T_('Detonationsbedingung'), s.mode, Object.fromEntries(Object.entries(X.modes).map(([k, m]) => [k, T_(m)]))) +
        numeric(path + 'distance', T_('Abstand Detonationspunkt → betrachtete Fläche (m)'), s.distance) + numeric(path + 'hits', T_('Geforderte Trefferzahl'), s.hits, 1, 1e6, 1) +
        numeric(path + 'spacing', T_('Mindestabstand zwischen Treffern (m)'), s.spacing) + numeric(path + 'interval', T_('Zeit zwischen Treffern (s)'), s.interval) +
        area(path + 'pattern', T_('Trefferbild, Angriffsseite und betroffene Bauteile'), s.pattern) + area(path + 'criterion', T_('Schutzziel: z. B. Tragfähigkeit / Innenraumsicherheit / Betrieb'), s.criterion) + '</div>';
      h += '<p class="note">' + esc(T_(v.catalog.note)) + (v.catalog.mass != null ? ' ' + T_('Dokumentierte Gefechtskopf-Gesamtmasse: <b>{m} kg</b>.', { m: v.catalog.mass }) : '') + ' ' + (v.catalog.source ? link(X.sources[v.catalog.source], T_('Quelle zur Variante')) : '') + '</p>';
      h += '<p class="note">' + T_('GUR-Angaben stammen von einer Konfliktpartei und gelten für die jeweils untersuchte Ausführung. Gefechtskopfmasse wird nicht in TNT umgerechnet.') + '</p>';
      h += '<h4>' + T_('Belastung je Ereignis') + '</h4><div class="planning-grid">' + numeric(path + 'tnt', T_('Fachlich festgelegte TNT-Modellladung (kg)'), s.tnt, 0.001, 1e6) + area(path + 'loadSource', T_('Quelle / Begründung der Modellladung und Äquivalenz'), s.loadSource) +
        numeric(path + 'pressure', T_('Externer Spitzendruck an der Fläche (kPa)'), s.pressure) + numeric(path + 'impulse', T_('Externer positiver Impuls (kPa·ms)'), s.impulse) + area(path + 'externalSource', T_('Quelle: Last-Zeit-Verlauf, Reflexion, Fläche, Verfahren'), s.externalSource) + '</div>';
      h += '<div class="planning-result"><b>' + (v.load ? (v.load.source === 'model' ? T_('Freiluft-Modell · normale Reflexion') : T_('Extern vorgegebene Belastung')) : T_('Druck-/Impulsbelastung noch offen')) + '</b><dl><dt>' + T_('Modellenergie je Ereignis') + '</dt><dd>' + X.fmt(v.energy) + ' MJ</dd><dt>' + T_('Spitzendruck') + '</dt><dd>' + X.fmt(v.load && v.load.pressure) + ' kPa</dd><dt>' + T_('Positiver Impuls') + '</dt><dd>' + X.fmt(v.load && v.load.impulse) + ' kPa·ms</dd><dt>' + T_('Skalierter Abstand Z') + '</dt><dd>' + X.fmt(v.z, 3) + ' m/kg⅓</dd></dl></div>';
      h += '<p class="note">' + T_('Automatik nur für ideale sphärische Luftdetonation mit 0,05 ≤ Z ≤ 40. Erdüberdeckung, Abschirmung, Bodenreflexion, Kontakt, Penetration, Splitter und thermobarische Nachwirkung sind darin nicht enthalten. Der Druck wird nicht mit der Trefferzahl multipliziert und nicht automatisch als TWK-Flächenlast angesetzt.') + ' ' + link(X.sources.iatg, T_('Modell: UN IATG 01.80, Tab. 12/13 (2015/2016)')) + '</p>';
      h += '<details open><summary>' + T_('Fachbemessung und dokumentierte Trefferzahl') + '</summary><div class="planning-grid">' + input(rp + 'reference', T_('Gutachten / Versuch / Bericht-ID'), r.reference) + input(rp + 'author', T_('Verantwortlicher Fachplaner / Prüfstelle'), r.author) + input(rp + 'date', T_('Nachweisdatum'), r.date, 'date') + numeric(rp + 'maxHits', T_('Im Bericht belegte Trefferzahl'), r.maxHits, 1, 1e6, 1) + numeric(rp + 'wall', T_('Außenwand laut Bemessung (m)'), r.wall, 0.01, 20) + numeric(rp + 'roof', T_('Decke laut Bemessung (m)'), r.roof, 0.01, 20) + numeric(rp + 'floor', T_('Bodenplatte laut Bemessung (m)'), r.floor, 0.01, 20) + area(rp + 'material', T_('Betongüte, Stahlgüte, Bewehrung und weitere Schichten'), r.material) + area(rp + 'scope', T_('Geltungsbereich, Randbedingungen, geprüfte Schadenskriterien'), r.scope) + area(rp + 'details', T_('Nachweise für Fugen, Öffnungen, Klappe, Tür, Durchführungen, Lüftung und Mehrfachtreffer'), r.details) + '</div><div class="rowbtns">' + button('apply-dimensions', T_('Bemessungsdicken übernehmen'), i) + button('record-scenario', T_('Zuordnung nach Fachprüfung bestätigen'), i) + '</div><p class="note">' + T_('Die Bestätigung dokumentiert deine Prüfung der Fachunterlage. Das Tool kontrolliert Werte und Planstand, prüft aber weder das Gutachten noch die Schutzwirkung. Jede relevante Änderung macht die Zuordnung ungültig.') + '</p></details>';
      h += '<p class="planning-status">' + esc(v.state) + '</p><p class="note">' + T_('Gefordert: {a} · im Bericht: {b} · berechnete überlebbare Trefferzahl: <b>nicht ermittelt</b>', { a: s.hits, b: X.fmt(r.maxHits, 0) }) + '</p>' + button('remove-scenario', T_('Szenario entfernen'), i) + '</details>';
    });
    return h + '</section>';
  };
  X.moistureHTML = (p, q) => {
    const m = p.planning.moisture, choices = { unknown:T_('Noch festzulegen'), 'W1.1-E':T_('W1.1-E · Bodenfeuchte / nichtdrückendes Wasser'), 'W1.2-E':T_('W1.2-E · nichtdrückend mit geeigneter Dränage'), 'W2.1-E':T_('W2.1-E · mäßiges Druckwasser'), 'W2.2-E':T_('W2.2-E · hohes Druckwasser'), 'W3-E':T_('W3-E · nichtdrückendes Wasser auf erdüberschütteter Decke') };
    let h = '<section class="planning-block"><h3>' + T_('Abdichtungs- und Anschlussplan') + '</h3><p class="note">' + T_('Rechnerischer Wasserstand über UK Bodenplatte: <b>{h} m</b>. Die Zuordnung benötigt Bemessungswasserstand, Bodenverhältnisse und Detailplanung.', { h: X.fmt(q.planning.moisture.head) }) + ' ' + link(X.sources.sealing, T_('Herstellerübersicht zu DIN 18533')) + '</p>' + (p.site.country !== 'DE' ? '<p class="note">' + T_('Die Wassereinwirkungsklassen W1.1-E bis W3-E stammen aus der deutschen DIN 18533 und dienen hier als Anhalt. Im Land gelten eigene Regeln, z. B. ÖNORM B 3692 in Österreich, SIA 272 in der Schweiz oder BS 8102 im Vereinigten Königreich.') + '</p>' : '') + '<div class="planning-grid">';
    for (const [k,label] of Object.entries({ walls:T_('Wände außen'), roof:T_('Erdüberdeckte Decke'), floor:T_('Bodenplatte') })) h += select('moisture.' + k, label, m[k], choices);
    for (const [k,label] of Object.entries({ crack:T_('Riss-/Bewegungsklasse und Bemessungsgrundlage'), use:T_('Raumnutzung / zulässige Feuchte: Technik und Personen'), jointPlan:T_('Fugenplan, Sohlenanschluss, Ecken und Wasserstopps'), penetrations:T_('Durchführungen: Lage, Futterrohr, Dichtung und Druckstufe'), roofDetail:T_('Decke: Abdichtung, Gefälle, Schutzlage und Anschluss an Klappe'), drainageOutlet:T_('Dränage: Vorflut, Rückstau und Ableitgenehmigung'), radon:T_('Radon: Boden-/Fugendichtigkeit und Messkonzept'), thermal:T_('Dämmung, Tauwasser und Wärmebrücken'), quality:T_('Untergrund, Schichtdicke, Aushärtung, Prüfung vor Verfüllung') })) h += area('moisture.' + k, label, m[k]);
    return h + '</div><p class="note">' + T_('WU-Beton ist ein Gesamtkonzept einschließlich Rissen, Fugen und Durchdringungen. Eine Beschichtung oder Folie muss als geeignetes System für das Bauteil nachgewiesen sein. Zusatzmaterialien aus den Details unter Einkauf ergänzen.') + '</p></section>';
  };
  X.procurementPanel = (q) => '<section class="planning-block"><h3>' + T_('Konkrete Produkte & Lieferung') + '</h3><p>' + T_('{a} von {b} Positionen mit vollständigem Preisbeleg.', { a: q.planning.procurement.quoted, b: q.planning.procurement.rows.length }) + '</p><p>' + T_('Erfasste Warenpreise brutto: <b>{m}</b>', { m: X.money(q.planning.procurement.partial) }) + '</p><p class="note">' + T_('Lieferstandort automatisch: {s}', { s: esc(X.siteText(q.p)) }) + '</p>' + button('show-procurement', T_('Produktangebote & Lieferkosten öffnen')) + '<p class="note">' + T_('Die bisherigen Tabellenpreise bleiben Richtkosten. Ein vollständiger Einkaufspreis entsteht erst, wenn Produkte, Mengen und Lieferung für alle Positionen bestätigt sind.') + '</p></section>';
  X.renderProcurement = () => {
    const A = BP.app, p = A.p, q = A.q, v = q.planning.procurement;
    if (!v.rows.some(l => l.id === selectedLine)) selectedLine = v.rows[0] && v.rows[0].id;
    const l = v.rows.find(l => l.id === selectedLine), o = l && (l.o || X.offer());
    let h = '<div class="planning-workspace"><h2>' + T_('Einkauf & regionale Versorgung') + '</h2><p class="lead">' + T_('Lieferadresse aus Standort: <b>{s}</b>', { s: esc(X.siteText(p)) }) + '</p><div class="planning-result"><b>' + (v.complete ? T_('Bestätigter Einkaufsumfang: {m}', { m: X.money(v.total) }) : T_('Einkauf noch unvollständig')) + '</b><p>' + T_('{a} / {b} Positionen bepreist · erfasste Waren brutto {m}. Fehlende Preise und Frachtkosten bleiben offen.', { a: v.quoted, b: v.rows.length, m: X.money(v.partial) }) + '</p></div>';
    h += '<div class="rowbtns">' + button('procurement-csv', T_('Einkaufsliste als CSV')) + '</div>';
    if (v.orphan.length) h += '<p class="planning-status">' + T_('{n} Angebote gehören zu früheren Positionen und sind aus den Summen ausgeschlossen. Geometrie oder Spezifikation hat sich geändert.', { n: v.orphan.length }) + '</p>';
    h += '<label class="planning-field"><span>' + T_('Position für Produktzuordnung') + '</span><select data-proc-line>' + v.rows.map(l => '<option value="' + l.id + '"' + (l.id === selectedLine ? ' selected' : '') + '>' + esc(l.label || l.name) + ' · ' + X.fmt(l.qty, 3) + ' ' + esc(I18.maybe(l.unit)) + '</option>').join('') + '</select></label>';
    if (l) {
      const path = 'procurement.offers.' + l.id + '.';
      h += '<section class="planning-card"><h3>' + esc(l.label || l.name) + '</h3><p>' + T_('Planmenge: <b>{q} {u}</b> · {note}', { q: X.fmt(l.qty, 3), u: esc(I18.maybe(l.unit)), note: esc(l.note) }) + '</p><div class="planning-grid">' +
        input(path + 'product', T_('Exaktes Produkt / technische Spezifikation'), o.product) + input(path + 'sku', T_('Artikelnummer / EAN / Angebotsposition'), o.sku) + input(path + 'supplier', T_('Händler / Betonwerk / Lieferant'), o.supplier) + input(path + 'url', T_('Produktseite oder Preisbeleg-URL'), o.url, 'url') + input(path + 'date', T_('Preisstand / Angebotsdatum'), o.date, 'date') + input(path + 'validUntil', T_('Gültig bis (falls zugesichert)'), o.validUntil, 'date') + input(path + 'productUnit', T_('Produkteinheit (z. B. l, kg, m², Stk)'), o.productUnit) + numeric(path + 'pack', T_('Inhalt je Gebinde / Verkaufseinheit'), o.pack, 0.000001) + numeric(path + 'factor', T_('Produkteinheiten je {u} Planmenge', { u: esc(I18.maybe(l.unit)) }), o.factor, 0.000001) + numeric(path + 'waste', T_('Zusätzlicher Bestellzuschlag (%)'), o.waste, 0, 100) + numeric(path + 'gross', T_('Preis je Verkaufseinheit BRUTTO ({cur})', { cur: BP.laender.sym() }), o.gross) + numeric(path + 'vat', T_('Im Bruttopreis enthaltene MwSt. (%)'), o.vat, 0, 100) + area(path + 'note', T_('Verbrauchsquelle, Klasse/Güte, Zubehör, Mengenstaffel und Eignung'), o.note) + '</div>';
      h += '<p>' + T_('Bestellung: <b>{n} Verkaufseinheiten</b> · Waren brutto <b>{m}</b> · {state}', { n: X.fmt(l.packages, 0), m: X.money(l.cents), state: esc(l.state) }) + '</p><div class="rowbtns">' + button('refresh-offer', T_('Händlerpreis live abrufen (bausep)')) + button('record-offer', T_('Produkt, Verbrauch und Menge fachlich bestätigen')) + button('clear-offer', T_('Angebot entfernen')) + '</div>';
      if (l.key === 'abd_pmbc') h += '<p>' + button('example-sopro', T_('Sopro KD 754 · recherchiertes Angebot eintragen')) + ' ' + link(X.sources.product, T_('bausep: 30-l-Gebinde')) + ' · ' + link(X.sources.sopro, T_('Hersteller / Datenblatt')) + '</p><p class="note">' + T_('85,30 € brutto laut abgerufener Händlerseite; Lieferung extra, Standortangebot offen. Verbrauch muss anhand Klasse, Untergrund und Datenblatt bestätigt werden.') + '</p>';
      const search = 'https://www.google.com/search?q=' + encodeURIComponent(T_('{name} Baustoff Händler Angebot {site}', { name: l.label || l.name, site: X.siteLabel(p) }).trim());
      h += '<p>' + link(search, T_('Händler / Angebote für diesen Standort suchen')) + '</p><p class="note">' + T_('Die Suche öffnet erst bei Klick eine externe Seite mit dem Standort. Transportbeton, zugeschnittene Bewehrung und Schutzabschlüsse benötigen in der Regel ein projektspezifisches Angebot.') + '</p></section>';
    }
    h += '<h3>' + T_('Lieferungen je Händler') + '</h3><p class="note">' + T_('Fracht einmal je Lieferant und bestätigtem Warenkorb erfassen. Adresse, Mengen oder Angebot geändert → Lieferbestätigung veraltet.') + '</p>';
    for (let i = 0; i < v.vendors.length; i++) {
      const vendor = v.vendors[i], d = vendor.d || X.delivery(), path = 'delivery.' + i + '.';
      h += '<section class="planning-card"><h4>' + esc(vendor.name) + '</h4><div class="planning-grid">' + numeric(path + 'shipping', T_('Gesamte Fracht / Zuschläge BRUTTO ({cur})', { cur: BP.laender.sym() }), d.shipping) + input(path + 'date', T_('Lieferangebot vom'), d.date, 'date') + input(path + 'reference', T_('Angebotsbeleg / Bezug auf Lieferadresse'), d.reference) + input(path + 'days', T_('Liefertermin / Lieferfrist / Verfügbarkeit'), d.days) + '</div><p>' + (vendor.current ? T_('Lieferung für aktuellen Standort und Warenkorb bestätigt.') : T_('Standortbezogene Lieferung nicht bestätigt.')) + '</p>' + button('record-delivery', T_('Lieferangebot für diese Adresse bestätigen'), i) + '</section>';
    }
    h += '<h3>' + T_('Mengen, Zuordnungen und offene Positionen') + '</h3><div class="planning-table-wrap"><table class="res planning-table"><thead><tr><th>' + T_('Position') + '</th><th>' + T_('Planmenge') + '</th><th>' + T_('Produkt') + '</th><th>' + T_('Gebinde') + '</th><th>' + T_('Waren brutto') + '</th><th>' + T_('Status') + '</th></tr></thead><tbody>' + v.rows.map(l => '<tr><td><button class="planning-link" data-plan-action="select-line" data-line="' + l.id + '">' + esc(l.label || l.name) + '</button></td><td>' + X.fmt(l.qty, 3) + ' ' + esc(I18.maybe(l.unit)) + '</td><td>' + esc(l.o ? l.o.product : T_('offen')) + '</td><td>' + X.fmt(l.packages, 0) + '</td><td>' + X.money(l.cents) + '</td><td>' + esc(l.state) + '</td></tr>').join('') + '</tbody></table></div>';
    h += '<details open><summary>' + T_('Detailmaterial ergänzen') + '</summary><p class="note">' + T_('Zum Beispiel Grundierung, Hohlkehlenmörtel, Armierungsgewebe, Dichtband, Abstandhalter, Befestigungen oder Schutzlagen. Mengenbezug im Namen dokumentieren.') + '</p><div class="rowbtns">' + button('add-extra', T_('Zusatzposition hinzufügen')) + '</div>';
    p.planning.procurement.extras.forEach((e,i) => { const path = 'procurement.extras.' + i + '.'; h += '<div class="planning-card planning-grid">' + input(path + 'name', T_('Detailposition / Mengenbezug'), e.name) + numeric(path + 'qty', T_('Menge'), e.qty) + input(path + 'unit', T_('Einheit'), e.unit) + button('remove-extra', T_('Entfernen'), i) + '</div>'; });
    h += '</details><p class="note">' + T_('Mengen aus Vorbemessung, ergänzt um Detailpositionen. Eine genaue Bestellung setzt freigegebene Ausführungszeichnungen, Biegeliste und technische Produktprüfung voraus. Richtkosten, Händlerpreise und Lieferangebote werden getrennt gespeichert und exportiert.') + '</p></div>';
    document.getElementById('view-einkauf').innerHTML = h;
  };
  function assign(p, path, value) {
    const parts = path.split('.');
    if (parts.some(k => ['__proto__','prototype','constructor'].includes(k))) throw new Error(T_('Ungültiges Feld.'));
    if (parts[0] === 'delivery') {
      const vendor = BP.app.q.planning.procurement.vendors[Number(parts[1])];
      if (!vendor) return;
      const id = vendor.id, pr = p.planning.procurement;
      if (!Object.hasOwn(pr.deliveries, id)) Object.defineProperty(pr.deliveries, id, { value:X.delivery(), writable:true, enumerable:true, configurable:true });
      pr.deliveries[id][parts[2]] = value; return;
    }
    if (parts[0] === 'procurement' && parts[1] === 'offers') {
      if (!Object.hasOwn(p.planning.procurement.offers, parts[2])) p.planning.procurement.offers[parts[2]] = X.offer();
    }
    let dest = p.planning; for (const k of parts.slice(0, -1)) dest = dest[k]; dest[parts.at(-1)] = value;
  }
  document.addEventListener('change', e => {
    const el = e.target, A = BP.app;
    if (!A) return;
    if (el.hasAttribute('data-proc-line')) { selectedLine = el.value; X.renderProcurement(); return; }
    const path = el.dataset.planning; if (!path) return;
    if (el.dataset.planningContext !== contextToken()) return;
    const context = A.p.planning;
    let value = el.value;
    if (el.type === 'number') {
      value = value.trim() === '' ? null : Number(value);
      if (value !== null && (!X.finite(value) || value < Number(el.min) || value > Number(el.max) || (el.step === '1' && !Number.isInteger(value)))) { A.toast(T_('Bitte einen gültigen Zahlenwert eingeben.')); A.render(); return; }
    }
    // Blur/change kann während eines View-Wechsels ausgelöst werden. Erst nach
    // dessen DOM-Austausch rendern, damit kein rekursives innerHTML entsteht.
    queueMicrotask(() => {
      if (A.p.planning !== context) return;
      const focusId = document.activeElement?.id;
      A.commit(p => {
        assign(p, path, value);
        const match = /^scenarios\.(\d+)\.weapon$/.exec(path);
        if (match) { const s = p.planning.scenarios[Number(match[1])]; s.tnt = null; s.loadSource = ''; s.pressure = null; s.impulse = null; s.externalSource = ''; s.variant = ''; s.report.accepted = false; }
      }, { coalesce:'planning:' + path });
      if (focusId) document.getElementById(focusId)?.focus({ preventScroll:true });
    });
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-plan-action]'), A = BP.app;
    if (!b || !A) return;
    const action = b.dataset.planAction, i = Number(b.dataset.index), v = A.q.planning.procurement;
    const l = v.rows.find(l => l.id === selectedLine);
    if (action === 'show-procurement') { A.setView('einkauf'); return; }
    if (action === 'select-line') { selectedLine = b.dataset.line; X.renderProcurement(); document.getElementById('view-einkauf').scrollTop = 0; return; }
    if (action === 'procurement-csv') { X.exportProcurement(A.q); return; }
    if (action === 'refresh-offer') {
      if (!l?.o || !X.url(l.o.url)) { A.toast(T_('Zuerst eine bausep-Produktseite als Quelle eintragen.')); return; }
      const id = l.id, original = X.hash(l.o), url = l.o.url;
      b.disabled = true; A.toast(T_('Öffentlichen Händlerpreis abrufen …'));
      try {
        if (location.protocol === 'file:') throw new Error(T_('Preisabruf braucht den lokalen Server: python server.py starten.'));
        const response = await fetch('api/product-price?url=' + encodeURIComponent(url), { signal:AbortSignal.timeout(20000) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !X.finite(data.gross)) throw new Error(data.error ? T_(data.error) : T_('Preisabruf fehlgeschlagen. Gespeichertes Angebot bleibt erhalten.'));
        if (!Object.hasOwn(A.p.planning.procurement.offers, id)) throw new Error(T_('Angebot wurde während des Abrufs entfernt.'));
        if (X.hash(A.p.planning.procurement.offers[id]) !== original) throw new Error(T_('Position während des Abrufs geändert. Preis bitte erneut abrufen.'));
        const fetchedAt = typeof data.fetchedAt === 'string' && X.date(data.fetchedAt.slice(0, 10)) ? data.fetchedAt : new Date().toISOString();
        A.commit(p => {
          const o = p.planning.procurement.offers[id];
          Object.assign(o, { product:String(data.product || ''), sku:String(data.sku || ''), supplier:String(data.supplier || ''), gross:data.gross, vat:X.finite(data.vat) ? data.vat : o.vat, date:new Date(fetchedAt).toLocaleDateString('sv-SE'), validUntil:typeof data.validUntil === 'string' ? data.validUntil : '', checked:false, baseline:'' });
          o.note = (o.note ? o.note + '\n' : '') + T_('Abruf: {t}.', { t: fetchedAt }) + ' ' + String(data.scope || '');
        });
        A.toast(T_('Händlerpreis aktualisiert. Gebinde, Verbrauch und standortbezogene Lieferung prüfen.'));
      } catch (err) { A.toast(err && err.name === 'TimeoutError' ? T_('Händlerseite antwortet nicht. Gespeichertes Angebot bleibt erhalten.') : err && err.name === 'TypeError' ? T_('Lokaler Server nicht erreichbar. Gespeichertes Angebot bleibt erhalten.') : (err && err.message) || T_('Preisabruf fehlgeschlagen. Gespeichertes Angebot bleibt erhalten.'), true); }
      finally { if (b.isConnected) b.disabled = false; }
      return;
    }
    if (action === 'record-scenario') {
      const result = A.q.planning.threats[i];
      if (!result.complete || !result.adequate) { A.toast(T_('Szenario, Fachunterlage und Bauteilwerte vollständig und passend eintragen.')); return; }
    }
    if (action === 'apply-dimensions') {
      const r = A.p.planning.scenarios[i].report;
      if (!['wall','roof','floor'].every(k => X.finite(r[k]) && r[k] >= 0.15) || r.wall > 1.5 || r.roof > 2 || r.floor > 2) { A.toast(T_('Die Dicken müssen vollständig im darstellbaren Bereich liegen (Wand 0,15–1,50 m; Decke/Boden 0,15–2,00 m).')); return; }
    }
    if (action === 'record-offer' && (!l || !l.priced || l.expired || l.cents === null)) { A.toast(T_('Produkt, Artikelnummer, Händler, Gebinde, Quelle und gültigen Preisstand vollständig eintragen; Mengenbereich prüfen.')); return; }
    if (action === 'record-delivery') {
      const d = v.vendors[i]?.d;
      if (!d || !X.finite(d.shipping) || !X.date(d.date) || !X.text(d.reference) || !X.text(d.days) || !(A.p.site.query || A.p.site.label)) { A.toast(T_('Standort, Fracht, Datum, Lieferbeleg und Lieferfrist fehlen.')); return; }
    }
    A.commit(p => {
      const x = p.planning;
      if (action === 'add-scenario') x.scenarios.push(X.scenario());
      if (action === 'remove-scenario') x.scenarios.splice(i,1);
      if (action === 'apply-dimensions') { const r = x.scenarios[i].report; p.build.tWall = r.wall; p.build.tRoof = r.roof; p.build.tFloor = r.floor; }
      if (action === 'record-scenario') { const s = x.scenarios[i]; s.report.accepted = true; s.report.baseline = X.scenarioKey(p,s); }
      if (action === 'record-offer') { const o = x.procurement.offers[l.id]; o.checked = true; o.baseline = X.offerKey(p,l,o); }
      if (action === 'clear-offer' && l) delete x.procurement.offers[l.id];
      if (action === 'record-delivery') { const vendor = v.vendors[i], d = x.procurement.deliveries[vendor.id]; d.confirmed = true; d.baseline = X.deliveryKey(p,vendor.id,d,vendor.lines); }
      if (action === 'example-sopro' && l?.key === 'abd_pmbc') x.procurement.offers[l.id] = { ...X.offer(), product:'Sopro KellerDicht 2-K KD 754 · 30 l', sku:'005030002001001010 / EAN 4005734754300', supplier:'bausep', url:X.sources.product, date:'2026-10-10', productUnit:'l', pack:30, factor:4.7, gross:85.30, note:T_('Rechercheangebot; 4,7 l/m² vorläufig nach Sopro-Broschüre 2025. Verbrauch, Wassereinwirkung, Untergrund und Zusatzmaterial separat prüfen. Keine Lieferzusage für die Projektadresse.') };
      if (action === 'add-extra') { const id = BP.model.uid('e'); x.procurement.extras.push({ id, name:T_('Neue Detailposition'), qty:1, unit:'Stk' }); selectedLine = 'extra:' + id; }
      if (action === 'remove-extra') x.procurement.extras.splice(i,1);
    });
  });
  X.exportProcurement = (q) => {
    // Textzellen gegen Tabellenkalkulations-Formeln absichern.
    const cell = v => '"' + String(v == null ? '' : v).replace(/^[\s]*[=+\-@]/, m => "'" + m).replace(/"/g, '""') + '"';
    const head = [T_('Position'),T_('Planmenge'),T_('Planeinheit'),T_('Produkt'),T_('Artikel'),T_('Händler'),T_('Quelle'),T_('Preisstand'),T_('Gebinde'),T_('Produkteinheit'),T_('Verbrauch je Planeinheit'),T_('Zuschlag %'),T_('Gebindepreis brutto EUR'),T_('MwSt. %'),T_('Waren brutto EUR'),T_('Status'),T_('Lieferstandort')];
    const num = (v,d=3) => X.finite(v) ? I18.dec(v.toFixed(d)) : '';
    const pr = q.planning.procurement, site = X.siteLabel(q.p);
    const rows = pr.rows.map(l => [l.label || l.name,num(l.qty),I18.maybe(l.unit),l.o?.product,l.o?.sku,l.o?.supplier,l.o?.url,l.o?.date,num(l.packages,0),l.o?.productUnit,num(l.o?.factor,6),num(l.o?.waste,2),num(l.o?.gross,2),num(l.o?.vat,2),l.cents === null ? '' : num(l.cents / 100,2),l.state,site]);
    for (const v of pr.vendors) rows.push([T_('Lieferung'),'','','', '',v.name,v.d?.reference,v.d?.date,'','','','','','',v.shipping === null ? '' : num(v.shipping / 100,2),v.current ? T_('Lieferung bestätigt') : T_('Lieferkosten / Bestätigung offen'),site]);
    const blank = (label, value, state) => [label,'','','','','','','','','','','','','',value,state,''];
    rows.push(blank('','',''), blank(T_('Summe erfasste Waren brutto'), X.finite(pr.partial) ? num(pr.partial / 100,2) : '', T_('{a} von {b} Positionen bepreist', { a: pr.quoted, b: pr.rows.length })),
      blank(T_('Einkauf gesamt brutto inkl. Fracht'), pr.complete ? num(pr.total / 100,2) : '', pr.complete ? T_('vollständig bestätigt') : T_('unvollständig – Preise, Bestätigungen oder Fracht offen')));
    BP.exporter.download('einkauf.csv', '\uFEFF' + [head,...rows].map(r => r.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  };
  X.reportHTML = q => {
    let h = '<h2>' + T_('Beschussszenarien') + '</h2><p>' + T_('Belastungsmodelle sind keine Schutzbescheinigung. Fachunterlagen bleiben extern zu prüfen.') + '</p>';
    for (const v of q.planning.threats) h += '<h3>' + esc(T_(v.catalog.name)) + '</h3><p>' + esc(v.s.variant) + ' · ' + esc(T_(X.modes[v.s.mode])) + ' · ' + T_('Abstand {d} m · {n} Treffer · Trefferabstand {sp} m · Zeitabstand {iv} s', { d: X.fmt(v.s.distance), n: v.s.hits, sp: X.fmt(v.s.spacing), iv: X.fmt(v.s.interval) }) + '</p><p>' + T_('Schutzziel: {c}; Trefferbild: {pt}', { c: esc(v.s.criterion), pt: esc(v.s.pattern) }) + '</p><p>' + T_('TNT-Modellladung {tnt} kg; Quelle: {src}; Druck {pr} kPa; Impuls {im} kPa·ms.', { tnt: X.fmt(v.s.tnt), src: esc(v.s.loadSource), pr: X.fmt(v.load?.pressure), im: X.fmt(v.load?.impulse) }) + ' ' + esc(v.load?.source === 'external' ? v.s.externalSource : T_('Ideale freie Luftdetonation, UN IATG Tab. 12/13, 2015/2016')) + '</p><p>' + esc(v.state) + ' · ' + T_('Bericht: {ref} · Fachplaner: {au} · Datum: {dt} · Trefferzahl laut Bericht: {n}', { ref: esc(v.s.report.reference), au: esc(v.s.report.author), dt: esc(v.s.report.date), n: X.fmt(v.s.report.maxHits,0) }) + '</p><p>' + T_('Geltungsbereich: {sc}; Material: {mat}; Details: {det}', { sc: esc(v.s.report.scope), mat: esc(v.s.report.material), det: esc(v.s.report.details) }) + '</p>';
    const moistureLabels={walls:T_('Wände'),roof:T_('Decke'),floor:T_('Bodenplatte'),crack:T_('Riss-/Bewegungsklasse'),use:T_('Raumnutzung'),jointPlan:T_('Fugenplan'),penetrations:T_('Durchführungen'),roofDetail:T_('Deckenanschlüsse'),drainageOutlet:T_('Dränage / Vorflut'),radon:T_('Radon'),thermal:T_('Tauwasser / Wärmebrücken'),quality:T_('Ausführungskontrolle')};
    h += '<h2>' + T_('Abdichtungsdetails') + '</h2><p>' + T_('Wasserstand über UK Bodenplatte: {h} m', { h: X.fmt(q.planning.moisture.head) }) + '</p><table>' + Object.entries(q.p.planning.moisture).map(([k,v]) => '<tr><th>' + esc(moistureLabels[k]||k) + '</th><td>' + esc(v || T_('offen')) + '</td></tr>').join('') + '</table>';
    h += '<h2>' + T_('Konkrete Produktangebote') + '</h2><p>' + T_('Lieferstandort: {s}. Erfasste Waren brutto: {a}. Vollständiger Einkauf: {b}.', { s: esc(X.siteText(q.p)), a: X.money(q.planning.procurement.partial), b: X.money(q.planning.procurement.total) }) + '</p><table><tr><th>' + T_('Position / Planmenge') + '</th><th>' + T_('Produkt / Quelle / Datum') + '</th><th>' + T_('Gebinde / Waren brutto') + '</th><th>' + T_('Status') + '</th></tr>' + q.planning.procurement.rows.map(l => '<tr><td>' + esc(l.label || l.name) + '<br>' + X.fmt(l.qty,3) + ' ' + esc(I18.maybe(l.unit)) + '</td><td>' + esc(l.o?.product || T_('offen')) + '<br>' + esc(l.o?.supplier || '') + ' ' + esc(l.o?.sku || '') + '<br>' + link(l.o?.url, l.o?.url || '') + '<br>' + esc(l.o?.date || '') + '</td><td>' + X.fmt(l.packages,0) + ' · ' + X.money(l.cents) + '</td><td>' + esc(l.state) + '</td></tr>').join('') + '</table>';
    h += '<p>' + q.planning.procurement.vendors.map(v => T_('{name}: Fracht {m}', { name: esc(v.name), m: X.money(v.shipping) }) + ', ' + esc(v.d?.reference || T_('Beleg offen')) + ', ' + esc(v.d?.days || T_('Lieferfrist offen')) + ', ' + (v.current ? T_('standortbezogen bestätigt') : T_('nicht bestätigt'))).join('<br>') + '</p><p>' + T_('Quellen:') + ' ' + link(X.sources.iatg,T_('UN IATG 01.80 (2015/2016)')) + ' · ' + link(X.sources.nist,T_('NIST Energieeinheiten')) + ' · ' + link(X.sources.sealing,T_('Sopro Abdichtungsübersicht (2025)')) + '</p>';
    return h;
  };
})(typeof window !== 'undefined' ? window : globalThis);
