/* Quellengebundene Szenarien, Abdichtungsdetails und konkrete Angebote. */
(function (root) {
  'use strict';
  const BP = root.BP = root.BP || {}, X = BP.planning = {};
  const T_ = BP.i18n.T, N_ = BP.i18n.N, I18 = BP.i18n;
  X.sources = {
    gur2: 'https://war-sanctions.gur.gov.ua/ru/components/part/4798',
    gur3: 'https://war-sanctions.gur.gov.ua/en/page-geran-3',
    gur4: 'https://gur.gov.ua/en/content/warsanctions-hur-rozkryvaie-budovu-novoho-rosiiskoho-reaktyvnoho-udarnoho-bpla-yeran4',
    gur5: 'https://war-sanctions.gur.gov.ua/en/page-geran-5',
    tochka: 'https://en.wikipedia.org/wiki/OTR-21_Tochka',
    iatg: 'https://s3.amazonaws.com/unoda-web/wp-content/uploads/2019/05/IATG-01.80-Formulae-for-Ammunition-Management-V.2.01.pdf',
    nist: 'https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8',
    sopro: 'https://www.sopro.com/de-de/produktdetails/bauwerksabdichtungen-1/754-kellerdicht-2-k',
    sealing: 'https://www.sopro.com/fileadmin/customer/productdata/de_DE/BAU_2025/epaper_kellerdicht_abdichtung/epaper/ausgabe.pdf',
    product: 'https://www.bausep.de/sopro-kellerdicht-2-k-kd-754-30-l.html',
  };
  X.catalog = {
    geran2: { name: N_('Geran-2 · Gefechtskopf offen'), mass: null, source: 'gur2', note: N_('Geran-2 bezeichnet mehrere Ausführungen. Die verlinkte Untersuchung identifiziert ein Bauteil, keine allgemeingültige Sprengstoffmenge.') },
    geran3: { name: N_('Geran-3 · Gefechtskopf offen'), mass: null, source: 'gur3', note: N_('GUR-Komponentenuntersuchung. Aus der Bezeichnung allein folgt kein belastbarer TNT-Wert.') },
    geran4_50: { name: N_('Geran-4 · OFZBCH-50 / TBBCH-50M'), mass: 50, source: 'gur4', note: N_('GUR berichtet 50 kg Gesamtmasse. Splitter-/thermobarische Varianten müssen getrennt bewertet werden.') },
    geran4_90: { name: N_('Geran-4 · TBBCH-90'), mass: 90, source: 'gur4', note: N_('GUR berichtet 90 kg Gesamtmasse des thermobarischen Gefechtskopfs. Kein TNT-Äquivalent angegeben.') },
    geran5: { name: N_('Geran-5 · dokumentierte 90-kg-Ausführung'), mass: 90, source: 'gur5', note: N_('GUR berichtet 90 kg Gefechtskopfmasse; Füllung und Druck-/Impulsäquivalenz bleiben offen.') },
    tochka: { name: N_('9M79 / Tochka · Kurzstrecken-Ballistik'), mass: null, source: 'tochka', note: N_('System 9K79 Tochka (NATO: SS-21 Scarab), allgemeine Beschreibung. Gefechtskopf, Auftreffdaten und Zünder für dieses Szenario gesondert belegen.') },
    ballistic: { name: N_('Andere ballistische Rakete · eigene Variante'), mass: null, source: null, note: N_('Genaue Ausführung und Wirkungsdaten eintragen. „Klein“ ist keine Schutzklasse.') },
    own: { name: N_('Eigenes / fachlich definiertes Szenario'), mass: null, source: null, note: N_('Wirkungsdaten mit Quelle oder Bemessungslastfall hinterlegen.') },
  };
  X.modes = { contact: N_('Direkttreffer / Kontakt'), surface: N_('Explosion am Boden'), air: N_('Idealisierte freie Luftdetonation'), buried: N_('Detonation im Erdreich'), inside: N_('Detonation im Innenraum') };
  X.scenario = () => ({ id: BP.model.uid('s'), weapon: 'geran2', covers: '', variant: '', mode: 'contact', distance: null,
    tnt: null, loadSource: '', hits: 1, spacing: null, interval: null, pattern: '', criterion: '',
    pressure: null, impulse: null, externalSource: '',
    report: { reference: '', author: '', date: '', scope: '', maxHits: null, wall: null, roof: null, floor: null,
      material: '', details: '', accepted: false, baseline: '' } });
  X.defaults = () => ({ scenarios: [], moisture: { walls: 'unknown', roof: 'unknown', floor: 'unknown',
    crack: '', use: '', jointPlan: '', penetrations: '', roofDetail: '', drainageOutlet: '', radon: '', thermal: '', quality: '' },
    procurement: { offers: {}, deliveries: {}, extras: [] } });
  X.finite = (v) => typeof v === 'number' && Number.isFinite(v);
  X.text = (v) => typeof v === 'string' && v.trim().length > 0;
  X.date = (v) => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; const d = new Date(v + 'T00:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === v; };
  X.url = (v) => { try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch (_) { return ''; } };
  X.esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  X.fmt = (v, d = 2) => X.finite(v) ? v.toLocaleString(I18.locale(), { maximumFractionDigits: d }) : T_('offen');
  X.money = (cents) => X.finite(cents) ? (cents / 100).toLocaleString(I18.locale(), { style: 'currency', currency: BP.laender ? BP.laender.active() : 'EUR' }) : T_('offen'); // Angebote in Projektwährung
  X.hash = (v) => BP.calcExtra.hash(JSON.stringify(v));
  X.siteKey = (p) => X.hash({ query: p.site.query, label: p.site.label, lat: p.site.lat, lon: p.site.lon });
  X.siteLabel = (p) => p.site.label || p.site.query || '';
  X.siteText = (p) => X.siteLabel(p) || T_('Standort im ersten Planungsschritt festlegen');
  X.today = () => new Date().toLocaleDateString('sv-SE');
  X.daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('sv-SE'); };
  X.designKey = (p) => X.hash({ geom: p.geom, build: p.build, protection: p.protection, routes: p.routes, site: p.site, use: p.use, tech: p.tech, hazard: p.hazard, moisture: p.planning.moisture,
    scenarios:p.planning.scenarios.map(s => { const { baseline, accepted, ...report } = s.report; return { ...s, report }; }) });
  X.scenarioKey = (p, s) => { const { report, ...conditions } = s; const { baseline, accepted, ...contents } = report; return X.hash({ model: 'KB-free-air-2015-v2', design: X.designKey(p), conditions, contents }); };
  function number(v, min, max, label, nullable = true, integer = false) {
    if (nullable && v === null) return;
    if (!X.finite(v) || v < min || v > max || (integer && !Number.isInteger(v))) throw new Error(T_('{label}: ungültiger Zahlenwert.', { label: T_(label) }));
  }
  X.validate = (p) => {
    const x = p.planning;
    if (!x || !Array.isArray(x.scenarios) || x.scenarios.length > 100 || !x.moisture || !x.procurement) throw new Error(T_('Ungültige Planungsdaten.'));
    const waterClasses = ['unknown','W1.1-E','W1.2-E','W2.1-E','W2.2-E','W3-E'];
    for (const k of ['walls','roof','floor']) if (!waterClasses.includes(x.moisture[k])) throw new Error(T_('Ungültige Wassereinwirkungsklasse.'));
    const texts = ['crack','use','jointPlan','penetrations','roofDetail','drainageOutlet','radon','thermal','quality'];
    for (const [k, v] of Object.entries(x.moisture)) if (!(['walls','roof','floor'].includes(k) || (texts.includes(k) && typeof v === 'string'))) throw new Error(T_('Ungültige Abdichtungsdetails.'));
    for (const k of texts) if (typeof x.moisture[k] !== 'string') throw new Error(T_('Ungültige Abdichtungsdetails.'));
    const ids = new Set();
    for (const s of x.scenarios) {
      if (!s || !Object.hasOwn(X.catalog,s.weapon) || !Object.hasOwn(X.modes,s.mode) || !s.report || typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(s.id) || ids.has(s.id)) throw new Error(T_('Ungültiges Szenario.'));
      if (s.covers !== undefined && s.covers !== '' && !Object.hasOwn(BP.model.SPECIAL_SCENARIOS, s.covers)) throw new Error(T_('Ungültiges Szenario.'));
      ids.add(s.id); number(s.distance, 0, 1e6, N_('Abstand')); number(s.tnt, 0.001, 1e6, N_('TNT-Modellladung'));
      number(s.hits, 1, 1e6, N_('Trefferzahl'), false, true); number(s.spacing, 0, 1e6, N_('Trefferabstand')); number(s.interval, 0, 1e9, N_('Zeitabstand'));
      number(s.pressure, 0, 1e9, N_('Druck')); number(s.impulse, 0, 1e12, N_('Impuls'));
      number(s.report.maxHits, 1, 1e6, N_('Nachgewiesene Trefferzahl'), true, true);
      for (const k of ['wall', 'roof', 'floor']) number(s.report[k], 0.01, 20, N_('Nachweisdicke'));
      for (const [k, v] of Object.entries(s)) if (!['report'].includes(k) && !['number', 'string'].includes(typeof v) && v !== null) throw new Error(T_('Ungültiges Szenariofeld.'));
      for (const k of ['reference','author','date','scope','material','details','baseline']) if (typeof s.report[k] !== 'string') throw new Error(T_('Ungültige Nachweisangaben.'));
      if (typeof s.report.accepted !== 'boolean') throw new Error(T_('Ungültige Nachweisbestätigung.'));
    }
    const pr = x.procurement;
    const plain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
    if (!plain(pr.offers) || !plain(pr.deliveries) || !Array.isArray(pr.extras) || pr.extras.length > 500) throw new Error(T_('Ungültige Angebotsdaten.'));
    for (const o of Object.values(pr.offers)) {
      if (!o || typeof o !== 'object') throw new Error(T_('Ungültiges Angebot.'));
      for (const k of ['product','sku','supplier','url','date','validUntil','productUnit','note','baseline']) if (typeof o[k] !== 'string') throw new Error(T_('Ungültiges Angebotsfeld.'));
      number(o.pack, 0.000001, 1e9, N_('Gebindeinhalt'), false); number(o.factor, 0.000001, 1e9, N_('Verbrauch'), false);
      number(o.waste, 0, 100, N_('Zuschlag'), false); number(o.gross, 0, 1e9, N_('Gebindepreis')); number(o.vat, 0, 100, N_('MwSt.'), false);
      if (typeof o.checked !== 'boolean') throw new Error(T_('Ungültige Produktbestätigung.'));
    }
    const extraIds = new Set();
    for (const e of pr.extras) { if (!e || typeof e.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(e.id) || extraIds.has(e.id) || !X.text(e.name) || !X.text(e.unit)) throw new Error(T_('Ungültige Zusatzposition.')); extraIds.add(e.id); number(e.qty, 0, 1e9, N_('Zusatzmenge'), false); }
    for (const d of Object.values(pr.deliveries)) { if (!d || typeof d !== 'object' || typeof d.confirmed !== 'boolean') throw new Error(T_('Ungültige Lieferung.')); number(d.shipping, 0, 1e9, N_('Lieferkosten')); for (const k of ['date','reference','days','baseline']) if (typeof d[k] !== 'string') throw new Error(T_('Ungültiger Lieferbeleg.')); }
  };
  /* Kingery–Bulmash, IATG 01.80 (2015/Amendment 2016), Tabellen 12 und 13.
     Sphärische freie Luftdetonation, normale Reflexion. Keine Boden-/Kontaktwirkung.
     Z in m/kg^(1/3); Druck kPa; Impuls kPa·ms, mit W^(1/3) skalieren. */
  X.airblast = (w, r) => {
    if (!X.finite(w) || w <= 0 || !X.finite(r) || r <= 0) return null;
    const scale = Math.cbrt(w), z = r / scale;
    if (z < 0.05 || z > 40) return null;
    const horner = (coeff, u) => coeff.reduceRight((y, c) => y * u + c, 0);
    const t = Math.log10(z), u = -0.214362789151 + 1.35034249993 * t;
    const pressure = 10 ** horner([3.22958031387, -2.21400538997, 0.035119031446, 0.657599992109, 0.0141818951887, -0.243076636231, -0.0158699803158, 0.0492741184234, 0.00227639644004, -0.00397126276058], u);
    const impulse = scale * 10 ** horner([2.55875660396, -0.903118886091, 0.101771877942, -0.0242139751146], -0.204004553231 + 1.37882996018 * t);
    return { z, pressure, impulse };
  };
  X.threats = (p) => p.planning.scenarios.map(s => {
    const r = s.report, complete = [r.reference, r.author, r.scope, r.material, r.details, s.variant, s.pattern, s.criterion].every(X.text) && X.date(r.date) && X.finite(r.maxHits) && ['wall','roof','floor'].every(k => X.finite(r[k])) && (s.hits === 1 || [s.spacing, s.interval].every(X.finite));
    const adequate = r.maxHits >= s.hits && p.build.tWall >= r.wall && p.build.tRoof >= r.roof && p.build.tFloor >= r.floor;
    const current = r.accepted === true && r.baseline === X.scenarioKey(p, s);
    const documented = complete && adequate && current;
    const state = !complete ? T_('Nachweis offen') : !adequate ? T_('Anforderung außerhalb der eingetragenen Bemessung') : !current ? T_('Zuordnung fehlt / nach Änderung veraltet') : T_('Fachunterlage zugeordnet · Inhalt extern zu prüfen');
    const model = s.mode === 'air' && X.text(s.loadSource) ? X.airblast(s.tnt, s.distance) : null;
    const external = [s.pressure, s.impulse].every(X.finite) && X.text(s.externalSource);
    const load = external ? { pressure: s.pressure, impulse: s.impulse, source: 'external' } : model ? { ...model, source: 'model' } : null;
    return { s, catalog: X.catalog[s.weapon], complete, adequate, documented, state, model, load,
      energy: X.finite(s.tnt) && X.text(s.loadSource) ? 4.184 * s.tnt : null,
      z: X.finite(s.tnt) && X.finite(s.distance) ? s.distance / Math.cbrt(s.tnt) : null };
  });
  X.moisture = (p, q) => {
    const m = p.planning.moisture, checks = [], head = X.finite(q.lv.zW) ? Math.max(0, q.lv.zW - q.lv.zSlabBot) : q.lv.water.known ? 0 : null;
    const add = (text, level = 'warn') => checks.push({ step: 'konstruktion', level, text });
    const zones = ['walls','roof','floor'];
    if (head === null || p.site.waterMode === 'unbekannt') add(T_('Bemessungswasserstand fehlt: Grundwassermessstellen ersetzen kein standortbezogenes Baugrundgutachten.'));
    if (zones.some(k => m[k] === 'unknown')) add(T_('Wassereinwirkung für Wände, erdüberdeckte Decke und Bodenplatte getrennt festlegen.'));
    if (p.build.waterproofing === 'pmbc' && (head > 3 || zones.some(k => m[k] === 'W2.2-E'))) add(T_('PMBC für hohe Druckwasserbeanspruchung W2.2-E nicht als Standardlösung ansetzen; anderes nachgewiesenes System planen.'), 'err');
    if (head > 0 && zones.some(k => ['W1.1-E','W1.2-E'].includes(m[k]))) add(T_('Druckwasser liegt rechnerisch an der Sohle an. W1-E allein ist damit nicht für das gesamte Bauwerk begründet.'), 'err');
    if (head > 3 && zones.some(k => m[k] === 'W2.1-E')) add(T_('W2.1-E gilt bis 3 m Eintauchtiefe; rechnerisch {h} m → W2.2-E.', { h: X.fmt(head) }), 'err');
    if (!p.build.drainage && (m.walls === 'W1.2-E' || m.floor === 'W1.2-E')) add(T_('W1.2-E setzt eine Dränung voraus; Dränage ist nicht geplant.'), 'err');
    if (m.walls === 'W3-E' || m.floor === 'W3-E') add(T_('W3-E gilt nur für erdüberschüttete Decken.'), 'err');
    if (p.build.drainage && (head > 0 || !X.text(m.drainageOutlet))) add(T_('Dränage: Vorflut, Rückstau und zulässige Ableitung nachweisen. Grundwasserabdichtung wird dadurch nicht ersetzt.'));
    for (const [k, name] of Object.entries({ crack:T_('Riss-/Bewegungsklasse'), use:T_('Raumnutzung / Feuchteanforderung'), jointPlan:T_('Fugen und Wand-Sohlen-Anschlüsse'), penetrations:T_('druckwasserdichte Durchführungen'), roofDetail:T_('Deckenabdichtung, Schutzlage und Anschlüsse'), radon:T_('Radonkonzept'), thermal:T_('Tauwasser / Wärmebrücken'), quality:T_('Abdichtungsprüfung vor Verfüllung') })) if (!X.text(m[k])) add(T_('{name}: Detailplanung noch offen.', { name }));
    return { head, checks, complete: checks.length === 0 };
  };
  X.offer = () => ({ product:'', sku:'', supplier:'', url:'', date:'', validUntil:'', productUnit:'', pack:1, factor:1, waste:0, gross:null, vat:19, note:'', checked:false, baseline:'' });
  X.delivery = () => ({ shipping:null, date:'', reference:'', days:'', confirmed:false, baseline:'' });
  X.lines = (q) => {
    const out = new Map();
    for (const i of q.bom.items) {
      if (i.buy === 0) continue; // reine Eigenleistung bzw. Material „vorhanden“: nichts einzukaufen
      const id = X.hash({ key:i.key, name:i.name, unit:i.unit });
      if (out.has(id)) out.get(id).qty += i.qty;
      else out.set(id, { id, name:i.name, label:i.label || i.name, unit:i.unit, qty:i.qty, key:i.key, note:i.note || '' });
    }
    for (const e of q.p.planning.procurement.extras) out.set('extra:' + e.id, { ...e, id:'extra:' + e.id, key:'extra', note:T_('Manuelle Detailmenge; Plan-/Herstellerbezug erforderlich.') });
    return [...out.values()];
  };
  X.offerKey = (p, line, o) => { const { baseline, checked, ...data } = o; return X.hash({ site:X.siteKey(p), position:{ id:line.id, qty:line.qty }, offer:data }); };
  X.vendor = (o) => String(o.supplier || '').trim().toLocaleLowerCase('de-DE');
  // Warenkorb ohne Bestätigungsfelder der Angebote: eine spätere Produktbestätigung macht die Lieferung nicht ungültig
  const offerData = (o) => { if (!o) return null; const { baseline, checked, ...data } = o; return data; };
  X.deliveryKey = (p, supplier, d, lines) => { const { baseline, confirmed, ...data } = d; return X.hash({ site:X.siteKey(p), supplier, data, basket:lines.map(l => ({ id:l.id, packages:l.packages, offer:offerData(l.o) })) }); };
  X.procurement = (p, q) => {
    const rows = X.lines(q).map(line => {
      const o = Object.hasOwn(p.planning.procurement.offers,line.id) ? p.planning.procurement.offers[line.id] : null;
      const ratio = o ? line.qty * o.factor * (1 + o.waste / 100) / o.pack : null;
      const ordered = o ? (ratio > 0 ? Math.max(1, Math.ceil(ratio - 4 * Number.EPSILON * Math.max(1,ratio))) : 0) : null;
      const packages = Number.isSafeInteger(ordered) && ordered >= 0 ? ordered : null;
      const future = !!o && X.date(o.date) && o.date > X.today();
      const priced = !!o && [o.product, o.sku, o.supplier, o.productUnit].every(X.text) && !!X.url(o.url) && X.date(o.date) && !future && X.finite(o.gross);
      const old = !!o && X.date(o.date) && o.date < X.daysAgo(365);
      const expired = !!o && ((!!o.validUntil && (!X.date(o.validUntil) || o.validUntil < X.today())) || old);
      const checked = !!o && o.checked === true && o.baseline === X.offerKey(p, line, o);
      const amount = priced && !expired && packages !== null ? packages * Math.round(o.gross * 100) : null;
      const cents = Number.isSafeInteger(amount) ? amount : null;
      return { ...line, o, packages, priced, expired, checked, cents, state:!o ? T_('Produkt / Angebot fehlt') : packages === null || (amount !== null && cents === null) ? T_('Menge / Preis außerhalb des Rechenbereichs') : old ? T_('Preisstand älter als 12 Monate – neu abrufen') : expired ? T_('Angebot abgelaufen') : future ? T_('Preisstand liegt in der Zukunft') : !priced ? T_('Preisbeleg unvollständig') : !checked ? T_('Eignung / Menge zu prüfen') : T_('Produkt und Menge bestätigt') };
    });
    const vendors = [...new Set(rows.filter(l => l.o && X.vendor(l.o)).map(l => X.vendor(l.o)))].map(id => {
      const lines = rows.filter(l => l.o && X.vendor(l.o) === id), d = Object.hasOwn(p.planning.procurement.deliveries,id) ? p.planning.procurement.deliveries[id] : null;
      const current = !!d && d.confirmed === true && d.baseline === X.deliveryKey(p, id, d, lines) && X.finite(d.shipping) && X.date(d.date) && X.text(d.reference) && X.text(d.days) && !!(p.site.query || p.site.label);
      return { id, name:lines[0].o.supplier, lines, d, current, shipping:current ? Math.round(d.shipping * 100) : null };
    });
    const sum = rows.reduce((sum, l) => sum + (l.cents || 0), 0), partial = Number.isSafeInteger(sum) ? sum : null, quoted = rows.filter(l => l.cents !== null).length;
    const total = sum + vendors.reduce((sum, v) => sum + (v.shipping || 0), 0);
    const complete = rows.length > 0 && rows.every(l => l.cents !== null && l.checked) && vendors.every(v => v.current) && Number.isSafeInteger(total);
    const orphan = Object.keys(p.planning.procurement.offers).filter(id => !rows.some(l => l.id === id));
    return { rows, vendors, partial, quoted, complete, orphan, total:complete ? total : null };
  };
  X.evaluate = (p, q) => {
    X.validate(p);
    return { threats:X.threats(p), moisture:X.moisture(p, q), procurement:X.procurement(p, q) };
  };
})(typeof window !== 'undefined' ? window : globalThis);
