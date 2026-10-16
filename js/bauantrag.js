/* Bauantrag: Zuständigkeit, Verfahren und Unterlagen je Land, Bundesland, Kanton oder Gemeinde (Register in bauantrag-daten.js)
 * und die Bauvorlagen, die sich aus dem Projekt ergeben: Baubeschreibung, Berechnungen (Flächen und Rauminhalt nach DIN 277),
 * Kosten nach DIN 276, Angaben für die Baustatistik und eine Ausfüllhilfe für die amtlichen Formulare.
 * Den Bauantrag stellt die Bauherrschaft; Bauvorlagen unterschreibt die bauvorlageberechtigte Person – das Programm bereitet vor. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const I18 = BP.i18n, T_ = I18.T, N_ = I18.N;
  const max = Math.max, min = Math.min;
  const R = () => BP.bauantragDaten || { j: {}, order: [], meta: {} };
  const tx = (o) => (o == null ? '' : typeof o === 'string' ? o : o[I18.lang()] || o.de || o.en || '');
  const fmt = (v, d = 2) => BP.calc.fmt(v, d);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- Zuständigkeit ---------- */
  const PROC = { verfahrensfrei: N_('verfahrensfrei'), kenntnisgabe: N_('Kenntnisgabeverfahren'), freistellung: N_('Genehmigungsfreistellung'), vereinfacht: N_('vereinfachtes Genehmigungsverfahren'),
    genehmigung: N_('Baugenehmigungsverfahren'), anzeige: N_('Anzeige- bzw. Meldeverfahren'), dp: N_('Vorabanzeige (déclaration préalable)'), permit: N_('Baugenehmigung (Building Permit)'),
    planning: N_('Planungsgenehmigung'), buildingcontrol: N_('bautechnische Prüfung bzw. Bauaufsicht'), zoning: N_('Planungs- bzw. Zonenbescheid'), other: N_('sonstiges Verfahren') };
  const DOC = { antrag: N_('Antragsformular'), lageplan: N_('Lageplan'), bauzeichnungen: N_('Bauzeichnungen'), baubeschreibung: N_('Baubeschreibung'), berechnungen: N_('Flächen und Rauminhalt'),
    kosten: N_('Baukosten'), standsicherheit: N_('Standsicherheit'), brandschutz: N_('Brandschutz'), waermeschutz: N_('Wärmeschutz'), entwaesserung: N_('Entwässerung'), statistik: N_('Baustatistik'),
    kataster: N_('Kataster- und Eigentumsnachweis'), vollmacht: N_('Vollmacht'), nachbarn: N_('Nachbarbeteiligung'), fotos: N_('Fotos'), sonstiges: N_('Sonstiges') };
  const BY = { tool: N_('aus dem Bunkerplaner (Entwurf)'), entwurfsverfasser: N_('Entwurfsverfasser'), vermesser: N_('Vermessung'), tragwerksplaner: N_('Tragwerksplaner'), bauherr: N_('Bauherrschaft'),
    behoerde: N_('Behörde'), fachplaner: N_('Fachplaner') };
  const OTHER = { wasserrecht: N_('Wasserrecht'), kampfmittel: N_('Kampfmittel'), denkmal: N_('Denkmalschutz'), naturschutz: N_('Naturschutz'), baumschutz: N_('Baumschutz'), abfall: N_('Aushub und Abfall'),
    leitungen: N_('Leitungsauskunft'), zivilschutz: N_('Zivilschutz'), sonstiges: N_('Sonstiges') };
  const STATUS = { verified: N_('amtlich belegt'), secondary: N_('Sekundärquelle'), unverified: N_('ungeprüft') };

  const entries = (c) => R().order.filter((k) => R().j[k].country === c);
  /* Auswahlliste der Zuständigkeiten eines Landes: landesweit, Regionen, Beispielgemeinden */
  function options(p) {
    const c = BP.laender.country(p), rank = (e) => (e.city ? 2 : e.region ? 1 : 0);
    return entries(c).map((k) => R().j[k]).sort((a, b) => rank(a) - rank(b) || tx(a.name).localeCompare(tx(b.name), I18.locale()))
      .map((e) => [e.key, tx(e.name) + (e.city ? ' – ' + T_('Beispielgemeinde') : '')]);
  }
  /* Zuständigkeit: Auswahl im Projekt, sonst Region des Standorts, sonst landesweit, sonst eine Gemeinde des Landes */
  function jurisdiction(p) {
    const c = BP.laender.country(p), reg = p.site.region || '', sel = p.permit && p.permit.jur, J = R().j;
    if (sel && J[sel] && J[sel].country === c) return { key: sel, e: J[sel], auto: false };
    const ks = entries(c), pick = (f) => ks.find((k) => f(J[k]));
    const key = pick((e) => reg && e.region === reg && !e.city) || pick((e) => !e.region && !e.city) || pick((e) => reg && e.region === reg) || ks[0] || null;
    return key ? { key, e: J[key], auto: true } : null;
  }

  /* ---------- Kennwerte des Gebäudes (DIN 277) ---------- */
  const TF_RE = /techn|hlk|lüft|lueft|elektr|strom|tank|aggregat|batter|hebe|heiz|anlage|plant|mechanical|técnic|tecnic/i;
  const VF_RE = /schleuse|flur|gang|treppe|vorraum|eingang|diele|airlock|corridor|stair|lobby|esclusa|pasillo|escalera/i;
  function facts(q) {
    const g = q.geo, lv = q.lv, nL = g.L.length, H = lv.zRoofTop - lv.zSlabBot;
    const acc = (g.access || []).filter((a) => a && a.W > 0 && a.L > 0);
    const bgfAcc = acc.reduce((s, a) => s + a.W * a.L, 0), bgfMain = g.A * nL;
    const rooms = g.L.flatMap((L) => L.rooms).filter((r) => r.area > 0.01);
    let tf = 0, vf = 0, nuf = 0;
    for (const r of rooms) { const n = BP.calc.roomName(r.name) + ' ' + r.name; if (TF_RE.test(n)) tf += r.area; else if (VF_RE.test(n)) vf += r.area; else nuf += r.area; }
    const nrf = tf + vf + nuf, above = max(0, lv.zRoofTop);
    return {
      levels: nL, footprint: g.A, inner: g.Ain * nL, bgfMain, bgfAcc, bgf: bgfMain + bgfAcc, briMain: g.A * H, briAcc: bgfAcc * H / 2, bri: g.A * H + bgfAcc * H / 2,
      nrf, nuf, tf, vf, kgf: max(0, bgfMain - nrf), height: H, above, depth: -lv.zSlabBot, belowGround: lv.zRoofTop <= 1e-9 && !lv.mound.on, mound: !!lv.mound.on, people: null,
    };
  }

  /* ---------- Verfahren ---------- */
  function ctxOf(p, q) {
    const f = facts(q), P = p.permit || {};
    return { zone: P.zone || '', area: f.bgf, volume: f.bri, annex: !!P.annex, belowGround: f.belowGround, facts: f };
  }
  function matches(cond, ctx) {
    const c = cond || {};
    if (c.zone && !c.zone.includes(ctx.zone)) return false;
    if (c.areaMin != null && !(ctx.area >= c.areaMin - 1e-9)) return false;
    if (c.areaMax != null && !(ctx.area <= c.areaMax + 1e-9)) return false;
    if (c.volumeMax != null && !(ctx.volume <= c.volumeMax + 1e-9)) return false;
    if (c.annex === true && !ctx.annex) return false;
    if (c.belowGround === true && !ctx.belowGround) return false;
    if (c.belowGround === false && ctx.belowGround) return false;
    return true;
  }
  /* erstes passendes Verfahren je Strang (Genehmigung, bautechnische Prüfung); die übrigen als Alternativen */
  function procedure(e, ctx) {
    const pick = (track) => e.procedures.find((pr) => (pr.track || 'main') === track && matches(pr.cond, ctx)) || null;
    const main = pick('main'), tech = pick('tech');
    return { main, tech, others: e.procedures.filter((pr) => pr !== main && pr !== tech), zoneMissing: !ctx.zone && e.procedures.some((pr) => pr.cond && pr.cond.zone) };
  }

  /* ---------- Kosten (DIN 276, Kostengruppen der ersten Ebene) ---------- */
  const KG_OF = { Erdarbeiten: 300, 'Beton & Schalung': 300, Bewehrung: 300, 'Abdichtung & Dämmung': 300, 'Ausbau & Zugänge': 300, Baustelle: 300, Technik: 400, Schutztechnik: 400 };
  function kosten(q) {
    const bm = q.bom, rate = bm.sumNet > 0 ? bm.gross / bm.sumNet : 1, rows = [];
    for (const [cat, v] of Object.entries(bm.cats)) rows.push({ kg: KG_OF[cat] || 300, cat, net: v });
    const services = (bm.services || []).filter((s) => s.on).reduce((s, x) => s + (x.amount || 0), 0);
    const kg700 = bm.planning || services;
    const sum = (kg) => rows.filter((r) => r.kg === kg).reduce((s, r) => s + r.net, 0);
    const k300 = sum(300), k400 = sum(400);
    return { rows, k300, k400, k700: kg700, reserve: bm.reserve || 0, bauwerk: k300 + k400, bauwerkGross: (k300 + k400) * rate, total: bm.sumNet, totalGross: bm.gross, rate };
  }

  /* ---------- Werte für Formulare und Ausfüllhilfe ---------- */
  /* je Wert: id, Bezeichnung, Wert (Text) und Suchwörter für Formularfelder (de/en/fr/es/it), damit sich Felder amtlicher PDFs zuordnen lassen */
  function values(p, q) {
    const P = p.permit || {}, b = P.bauherr || {}, plot = P.plot || {}, au = P.author || {}, en = P.engineer || {}, f = facts(q), k = kosten(q), cur = BP.laender.sym(), fx = BP.laender.fx();
    const J = jurisdiction(p), e = J && J.e, pr = e ? procedure(e, ctxOf(p, q)) : null;
    const money = (v) => Math.round(v * fx).toLocaleString(I18.locale()) + ' ' + cur;
    const addr = (o) => [o.street, [o.zip, o.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const zoneT = { bplan: T_('im Geltungsbereich eines Bebauungsplans'), innen: T_('im Innenbereich ohne Bebauungsplan'), aussen: T_('im Außenbereich') }[P.zone] || '';
    const V = (id, label, value, keys) => ({ id, label, value: value == null ? '' : String(value), keys });
    return [
      V('bauherr.name', T_('Bauherrschaft: Name'), b.name, ['bauherr', 'antragsteller', 'bauherrin', 'applicant', 'owner', 'demandeur', 'nom', 'solicitante', 'promotor', 'richiedente', 'committente']),
      V('bauherr.street', T_('Bauherrschaft: Straße, Hausnummer'), b.street, ['bauherr.*stra', 'antragsteller.*stra', 'applicant.*address', 'adresse', 'voie', 'domicilio']),
      V('bauherr.zipcity', T_('Bauherrschaft: PLZ, Ort'), [b.zip, b.city].filter(Boolean).join(' '), ['bauherr.*(plz|ort)', 'postleitzahl', 'code postal', 'localité', 'código postal', 'municipio']),
      V('bauherr.phone', T_('Bauherrschaft: Telefon'), b.phone, ['telefon', 'phone', 'téléphone', 'teléfono', 'telefono']),
      V('bauherr.email', T_('Bauherrschaft: E-Mail'), b.email, ['e-?mail', 'courriel', 'correo']),
      V('plot.address', T_('Grundstück: Anschrift'), addr(plot) || p.site.label || '', ['grundst.*(stra|lage|anschrift)', 'baugrundst', 'site address', 'terrain.*adresse', 'emplazamiento', 'ubicaci']),
      V('plot.gemarkung', T_('Grundstück: Gemarkung'), plot.gemarkung, ['gemarkung', 'katastralgemeinde', 'section cadastrale', 'commune cadastrale']),
      V('plot.flur', T_('Grundstück: Flur'), plot.flur, ['^flur$', 'flur[^s]', 'parcelle', 'polígono']),
      V('plot.flurstueck', T_('Grundstück: Flurstück(e)'), plot.flurstueck, ['flurst', 'grundstücksnummer', 'parzelle', 'numéro de parcelle', 'parcela', 'referencia catastral', 'lot']),
      V('plot.area', T_('Grundstück: Fläche'), plot.area ? fmt(plot.area, 0) + ' m²' : '', ['grundstücksfläche', 'grundstuecksflaeche', 'lot area', 'superficie du terrain', 'superficie de la parcela']),
      V('plot.zone', T_('Planungsrechtliche Lage'), zoneT, ['bebauungsplan', 'planungsrecht', '§ ?3[45]', 'zoning', 'plu']),
      V('vorhaben', T_('Bezeichnung des Vorhabens'), P.title || T_('Neubau eines privaten Schutzraums aus Stahlbeton'), ['vorhaben', 'bezeichnung', 'bauvorhaben', 'project', 'description', 'projet', 'nature des travaux', 'descripción', 'obra', 'intervento']),
      V('verfahren', T_('Verfahren'), pr && pr.main ? pr.main.name : '', ['verfahren', 'verfahrensart', 'procedure', 'procédure', 'procedimiento']),
      V('nutzung', T_('Art der Nutzung'), T_('Schutzraum (Nichtwohngebäude), Lagerung von Vorräten'), ['nutzung', 'gebäudeart', 'use', 'destination', 'uso']),
      V('klasse', T_('Gebäudeklasse / Einstufung'), e ? tx(e.classification) : '', ['gebäudeklasse', 'gebaeudeklasse']),
      V('bgf', T_('Brutto-Grundfläche (BGF)'), fmt(f.bgf, 2) + ' m²', ['brutto-?grund', 'bgf', 'gross floor', 'surface de plancher', 'superficie construida', 'superficie lorda']),
      V('bri', T_('Brutto-Rauminhalt (BRI)'), fmt(f.bri, 1) + ' m³', ['rauminhalt', 'bri', 'umbauter raum', 'volume', 'volumen']),
      V('nrf', T_('Netto-Raumfläche (NRF)'), fmt(f.nrf, 2) + ' m²', ['netto-?raum', 'nrf', 'nutzfläche', 'net floor', 'superficie útil']),
      V('grundflaeche', T_('Grundfläche (Außenmaße)'), fmt(f.footprint, 2) + ' m²', ['grundfläche', 'bebaute fläche', 'überbaute', 'emprise au sol', 'footprint', 'superficie ocupada']),
      V('geschosse', T_('Geschosse'), T_('{n} unterirdisch, 0 oberirdisch', { n: f.levels }), ['geschoss', 'vollgeschoss', 'storeys', 'niveaux', 'plantas']),
      V('hoehe', T_('Höhe über Gelände / Tiefe der Sohle'), fmt(f.above, 2) + ' m / ' + fmt(f.depth, 2) + ' m', ['höhe', 'hoehe', 'height', 'hauteur', 'altura']),
      V('kosten', T_('Baukosten Bauwerk (KG 300 + 400, brutto)'), money(k.bauwerkGross), ['baukosten', 'herstellungskosten', 'rohbaukosten', 'kosten', 'cost', 'coût', 'presupuesto', 'importo']),
      V('baustoff', T_('Überwiegend verwendeter Baustoff'), T_('Stahlbeton'), ['baustoff', 'material', 'matériau']),
      V('author.name', T_('Entwurfsverfasser: Name'), au.name, ['entwurfsverfasser', 'planverfasser', 'architekt', 'architect', 'architecte', 'arquitecto', 'progettista']),
      V('author.office', T_('Entwurfsverfasser: Büro'), au.office, ['büro', 'buero', 'firma', 'office', 'cabinet', 'estudio']),
      V('author.address', T_('Entwurfsverfasser: Anschrift'), addr(au), ['entwurfsverfasser.*(anschrift|stra)', 'architect.*address']),
      V('author.reg', T_('Entwurfsverfasser: Kammer und Mitgliedsnummer'), [au.chamber, au.regNo].filter(Boolean).join(', '), ['kammer', 'mitglieds', 'listen', 'registration', 'ordre', 'colegiado', 'albo']),
      V('engineer.name', T_('Tragwerksplaner: Name'), [en.name, en.office].filter(Boolean).join(', '), ['tragwerksplan', 'statiker', 'standsicherheit', 'structural', 'ingénieur', 'ingeniero']),
      V('feuer', T_('Feuerwiderstand tragender Bauteile'), p.build.fireClass === 'keine' ? T_('ohne Anforderung') : p.build.fireClass, ['feuerwiderstand', 'brandschutz', 'fire']),
      V('personen', T_('Belegung (Personen)'), String(p.use.people), ['personen', 'persons', 'occupants', 'personnes', 'personas']),
      V('datum', T_('Datum'), new Date().toLocaleDateString(I18.locale()), ['datum', 'date', 'fecha', 'data']),
      V('ort', T_('Ort'), b.city || plot.city || '', ['^ort$', 'ort,? datum', 'lieu', 'lugar', 'luogo']),
    ];
  }
  /* Zuordnung eines Formularfelds (Name und Tooltip) zu einem Wert über Suchwörter */
  function guessField(name, tip, vals) {
    const s = (String(name || '') + ' ' + String(tip || '')).toLowerCase().replace(/[_.\[\]]+/g, ' ');
    let best = null, score = 0;
    for (const v of vals) {
      if (!v.value) continue;
      for (const kw of v.keys || []) {
        let re;
        try { re = new RegExp(kw, 'i'); } catch (e) { continue; }
        if (re.test(s)) { const sc = kw.length + (/^\^/.test(kw) ? 4 : 0); if (sc > score) { score = sc; best = v.id; } }
      }
    }
    return best;
  }

  /* ---------- Angaben für die Baustatistik ---------- */
  function statistik(p, q) {
    const f = facts(q), k = kosten(q), fx = BP.laender.fx(), cur = BP.laender.sym();
    return [
      [T_('Art der Bautätigkeit'), T_('Errichtung eines neuen Gebäudes')],
      [T_('Gebäudeart'), T_('Nichtwohngebäude, sonstiges (Schutzraum)')],
      [T_('Bauherr'), T_('private Haushalte')],
      [T_('Vollgeschosse'), f.belowGround ? '0' : T_('prüfen (teilweise über Gelände)')],
      [T_('Rauminhalt (BRI)'), fmt(f.bri, 0) + ' m³'],
      [T_('Nutzfläche'), fmt(f.nuf, 0) + ' m²'],
      [T_('Wohnfläche / Wohnungen'), '0 / 0'],
      [T_('Überwiegend verwendeter Baustoff'), T_('Stahlbeton')],
      [T_('Heizung'), T_('keine')],
      [T_('Lüftung'), T_('mechanische Lüftung mit Filter')],
      [T_('Veranschlagte Kosten des Bauwerks (KG 300 + 400) einschließlich Umsatzsteuer'), Math.round(k.bauwerkGross * fx / 1000).toLocaleString(I18.locale()) + ' T' + cur],
    ];
  }

  /* ---------- Baubeschreibung ---------- */
  function baubeschreibung(p, q) {
    const f = facts(q), b = p.build, lv = q.lv, P = p.permit || {}, plot = P.plot || {}, NP = BP.normen.profile(p), DEn = NP.code === 'EC' && NP.na === 'DE';
    const wp = BP.model.WATERPROOFING[b.waterproofing] || {}, tech = q.tech;
    const sewer = { hebeanlage: T_('Abwasser über eine Hebeanlage mit Rückstauschleife in die Grundstücksentwässerung'), tank: T_('Abwasser in einen geschlossenen Sammelbehälter, Entleerung durch Entsorger'), trocken: T_('Trockentoilette, kein Abwasseranschluss') }[p.tech.sewer] || '';
    const zoneT = { bplan: T_('im Geltungsbereich eines Bebauungsplans'), innen: T_('im Innenbereich ohne Bebauungsplan'), aussen: T_('im Außenbereich') }[P.zone] || T_('noch nicht angegeben');
    return [
      [T_('Vorhaben'), T_('Neubau eines privaten Schutzraums aus Stahlbeton für {n} Personen, {pos}. Bruttogrundfläche {bgf} m², Brutto-Rauminhalt {bri} m³, {lv}. Nutzung als Schutzraum im Ereignisfall und zur Lagerung von Vorräten; kein dauernder Aufenthalt.',
        { n: p.use.people, pos: f.belowGround ? T_('vollständig unter Gelände') : f.mound ? T_('teilweise über Gelände unter einem Erdhügel') : T_('teilweise über Gelände'), bgf: fmt(f.bgf, 1), bri: fmt(f.bri, 0), lv: f.levels > 1 ? T_('{n} Ebenen', { n: f.levels }) : T_('eine Ebene') })],
      [T_('Grundstück'), T_('Lage: {zone}. {addr}', { zone: zoneT, addr: [plot.street, [plot.zip, plot.city].filter(Boolean).join(' '), plot.gemarkung ? T_('Gemarkung {g}', { g: plot.gemarkung }) : '', plot.flur ? T_('Flur {f}', { f: plot.flur }) : '', plot.flurstueck ? T_('Flurstück {f}', { f: plot.flurstueck }) : ''].filter(Boolean).join(', ') || p.site.label || '' })],
      [T_('Tragwerk'), T_('Geschlossener Stahlbetonkasten aus {c}: Bodenplatte {f} cm, Außenwände {w} cm, Decke {r} cm, Erdüberdeckung {e} m. Gründung als elastisch gebettete Bodenplatte in {s}. Bemessung nach {norm}; der Standsicherheitsnachweis wird von der Tragwerksplanung aufgestellt.',
        { c: b.concrete, f: fmt(b.tFloor * 100, 0), w: fmt(b.tWall * 100, 0), r: fmt(b.tRoof * 100, 0), e: fmt(b.cover, 2), s: T_(q.soil.name), norm: NP.label })],
      [T_('Abdichtung und Grundwasser'), T_('{wp}. {water}', { wp: (wp.name ? T_(wp.name) : ''), water: q.lv.water.label })],
      [T_('Baugrube'), b.excavation.mode === 'verbau' ? T_('Baugrube mit Verbau, Tiefe {d} m.', { d: fmt(q.earth.depth, 2) }) : T_('Geböschte Baugrube, Tiefe {d} m, Böschungswinkel {a}°.', { d: fmt(q.earth.depth, 2), a: fmt(q.earth.angle, 0) })],
      [T_('Technische Ausrüstung'), T_('Mechanische Lüftung {v} m³/h mit Filter; Stromversorgung {el}; {sew}. Keine Feuerstätten.', { v: tech.ventSize, el: tech.generator ? T_('mit Notstromaggregat') : T_('über Batteriespeicher bzw. Netzanschluss'), sew: sewer })],
      [T_('Brandschutz'), T_('Tragende Bauteile aus nichtbrennbarem Stahlbeton, Feuerwiderstand {cls}; Rettungsweg über {acc}.', { cls: b.fireClass === 'keine' ? T_('ohne Anforderung') : b.fireClass, acc: q.geo.access.length > 1 ? T_('{n} Zugänge', { n: q.geo.access.length }) : T_('den Zugang und den Notausstieg') })],
      [T_('Wärme- und Schallschutz'), DEn && f.belowGround ? T_('Unterirdische Bauten sind vom Gebäudeenergierecht ausgenommen (§ 2 Abs. 2 GEG bzw. Nachfolgeregelung); mit der Bauaufsicht abklären.') : T_('Unbeheiztes Gebäude ohne dauernden Aufenthalt; Anforderungen an den Wärmeschutz mit der Bauaufsicht abklären.')],
    ];
  }

  /* ---------- Bauvorlagen als druckbares Dokument ---------- */
  function bundle(p, q, opts = {}) {
    const J = jurisdiction(p), e = J && J.e, ctx = ctxOf(p, q), pr = e ? procedure(e, ctx) : null, f = ctx.facts, k = kosten(q), fx = BP.laender.fx(), cur = BP.laender.sym();
    const money = (v) => Math.round(v * fx).toLocaleString(I18.locale()) + ' ' + cur;
    const tr = (a, b2) => '<tr><th>' + a + '</th><td>' + b2 + '</td></tr>';
    const NP = BP.normen.profile(p), DEn = NP.code === 'EC' && NP.na === 'DE', c = BP.laender.country(p);
    const s277 = DEn ? 'DIN 277' : c === 'AT' ? T_('in Anlehnung an ÖNORM B 1800') : c === 'CH' || c === 'LI' ? T_('in Anlehnung an SIA 416') : T_('in Anlehnung an DIN 277');
    const s276 = DEn ? 'DIN 276' : T_('in Anlehnung an DIN 276');
    let h = '<style>#report{font:10.5pt/1.45 Archivo,system-ui,sans-serif;color:#1d2220}#report h1{font-size:19pt;margin:0 0 2mm}#report h2{font-size:13pt;margin:7mm 0 2mm;border-bottom:1px solid #1d2220;padding-bottom:1mm;break-after:avoid}' +
      '#report table{width:100%;border-collapse:collapse;margin:1mm 0 3mm}#report th,#report td{text-align:left;vertical-align:top;padding:1mm 1.5mm;border-bottom:0.2mm solid #ccc}#report th{width:38%;font-weight:600}#report td.r,#report th.r{text-align:right}' +
      '#report .note{color:#555;font-size:9pt}#report .pg{break-before:page}#report .warn{border:0.4mm solid #b06000;padding:2mm 3mm;margin:3mm 0}#report svg{max-width:100%;height:auto}</style>';
    h += '<h1>' + T_('Bauvorlagen (Entwurf): {name}', { name: esc(p.name) }) + '</h1>';
    h += '<p class="note">' + T_('Erstellt mit dem Bunkerplaner am {date}. Entwurf zur Vorbereitung des Bauantrags; die Bauvorlagen sind von der bauvorlageberechtigten Person zu prüfen, zu ergänzen und zu unterschreiben.', { date: new Date().toLocaleDateString(I18.locale()) }) + '</p>';
    if (e) {
      h += '<h2>' + T_('Zuständigkeit und Verfahren') + '</h2><table>' + tr(T_('Zuständigkeit'), esc(tx(e.name)) + (e.city ? ' (' + T_('Beispielgemeinde') + ')' : '')) + tr(T_('Behörde'), esc(tx(e.authority))) +
        e.law.map((l) => tr(T_('Rechtsgrundlage'), esc(l.name) + (l.version ? ', ' + esc(l.version) : ''))).join('') +
        (e.classification ? tr(T_('Einstufung'), esc(tx(e.classification))) : '') +
        tr(T_('Verfahren'), pr && pr.main ? '<b>' + esc(pr.main.name) + '</b><br>' + esc(tx(pr.main.when)) : T_('nicht bestimmbar – Lage des Grundstücks angeben')) +
        (pr && pr.tech ? tr(T_('Bautechnisches Verfahren'), esc(pr.tech.name) + '<br>' + esc(tx(pr.tech.when))) : '') +
        tr(T_('Unterschrift Bauvorlagen'), esc(tx(e.signer.rule)) + ' (' + esc(e.signer.paragraph || '') + ')') + tr(T_('Standsicherheit'), esc(tx(e.structural.rule)) + (e.structural.paragraph ? ' (' + esc(e.structural.paragraph) + ')' : '')) +
        (e.portal ? tr(T_('Einreichung'), esc(e.portal.name) + (e.portal.url ? ' – ' + esc(e.portal.url) : '') + (e.portal.note ? '<br>' + esc(tx(e.portal.note)) : '')) : '') + '</table>';
      if ((e.notes || []).length) h += e.notes.map((n) => '<p class="warn">' + esc(tx(n)) + '</p>').join('');
      h += '<p class="note">' + T_('Stand der Angaben: {d}; Bewertung: {s}. Rechtsstand vor der Einreichung bei der Behörde bestätigen.', { d: I18.date(e.checked), s: T_(STATUS[e.status]) }) + '</p>';
      h += '<h2>' + T_('Unterlagen') + '</h2><table><tr><th>' + T_('Unterlage') + '</th><th>' + T_('Erstellt von') + '</th></tr>' +
        (e.documents || []).map((d) => '<tr><td>' + esc(d.name) + (d.note ? '<br><span class="note">' + esc(tx(d.note)) + '</span>' : '') + '</td><td>' + (BY[d.by] ? T_(BY[d.by]) : '') + '</td></tr>').join('') + '</table>';
      if ((e.other || []).length) h += '<h2>' + T_('Weitere Genehmigungen und Auskünfte') + '</h2><table>' + e.other.map((o) => tr(T_(OTHER[o.topic] || o.topic), esc(o.authority || '') + (o.authority ? '<br>' : '') + esc(tx(o.note)))).join('') + '</table>';
    }
    h += '<h2 class="pg">' + T_('Baubeschreibung') + '</h2><table>' + baubeschreibung(p, q).map(([a, b2]) => tr(esc(a), esc(b2))).join('') + '</table>';
    h += '<h2>' + T_('Flächen und Rauminhalt ({std})', { std: s277 }) + '</h2><table>' +
      tr(T_('Brutto-Grundfläche (BGF)'), fmt(f.bgf, 2) + ' m²' + (f.bgfAcc > 0 ? ' (' + T_('Bauwerk {a} m², Zugänge {b} m²', { a: fmt(f.bgfMain, 2), b: fmt(f.bgfAcc, 2) }) + ')' : '')) +
      tr(T_('Brutto-Rauminhalt (BRI)'), fmt(f.bri, 1) + ' m³' + (f.briAcc > 0 ? ' (' + T_('Bauwerk {a} m³, Zugänge näherungsweise {b} m³', { a: fmt(f.briMain, 1), b: fmt(f.briAcc, 1) }) + ')' : '')) +
      tr(T_('Netto-Raumfläche (NRF)'), fmt(f.nrf, 2) + ' m²') + tr(T_('davon Nutzungsfläche (NUF)'), fmt(f.nuf, 2) + ' m²') + tr(T_('davon Technikfläche (TF)'), fmt(f.tf, 2) + ' m²') + tr(T_('davon Verkehrsfläche (VF)'), fmt(f.vf, 2) + ' m²') +
      tr(T_('Konstruktions-Grundfläche (KGF)'), fmt(f.kgf, 2) + ' m²') + tr(T_('Grundfläche (Außenmaße)'), fmt(f.footprint, 2) + ' m²') +
      (c === 'FR' ? tr(T_('Fläche innerhalb der Außenwände (Anhalt für die surface de plancher)'), fmt(f.inner, 2) + ' m²') : '') +
      tr(T_('Höhe über Gelände / Tiefe der Bodenplatte'), fmt(f.above, 2) + ' m / ' + fmt(f.depth, 2) + ' m') + '</table>' +
      '<p class="note">' + T_('BRI von Unterkante Bodenplatte bis Oberkante Decke; Zuordnung der Räume zu NUF, TF und VF nach dem Raumnamen. Zugänge näherungsweise.') + '</p>';
    h += '<h2>' + T_('Kosten ({std})', { std: s276 }) + '</h2><table><tr><th>' + T_('Kostengruppe') + '</th><th class="r">' + T_('netto') + '</th></tr>' +
      k.rows.filter((r) => r.kg === 300).map((r) => '<tr><td>300 – ' + esc(BP.calc.catText(r.cat)) + '</td><td class="r">' + money(r.net) + '</td></tr>').join('') +
      '<tr><th>' + T_('300 Bauwerk – Baukonstruktionen') + '</th><th class="r">' + money(k.k300) + '</th></tr>' +
      k.rows.filter((r) => r.kg === 400).map((r) => '<tr><td>400 – ' + esc(BP.calc.catText(r.cat)) + '</td><td class="r">' + money(r.net) + '</td></tr>').join('') +
      '<tr><th>' + T_('400 Bauwerk – Technische Anlagen') + '</th><th class="r">' + money(k.k400) + '</th></tr>' +
      '<tr><th>' + T_('Bauwerkskosten (300 + 400) netto / brutto') + '</th><th class="r">' + money(k.bauwerk) + ' / ' + money(k.bauwerkGross) + '</th></tr>' +
      '<tr><td>' + T_('700 Baunebenkosten (Planung, Gutachten)') + '</td><td class="r">' + money(k.k700) + '</td></tr>' + (k.reserve > 0 ? '<tr><td>' + T_('Risikozuschlag') + '</td><td class="r">' + money(k.reserve) + '</td></tr>' : '') +
      '<tr><th>' + T_('Gesamtkosten netto / brutto') + '</th><th class="r">' + money(k.total) + ' / ' + money(k.totalGross) + '</th></tr></table>' +
      '<p class="note">' + T_('Richtkosten aus der Mengenermittlung des Bunkerplaners; Grundstück, Erschließung und Außenanlagen nicht enthalten.') + '</p>';
    if (c === 'DE') h += '<h2>' + T_('Angaben für die Baustatistik') + '</h2><table>' + statistik(p, q).map(([a, b2]) => tr(esc(a), esc(b2))).join('') + '</table>' +
      '<p class="note">' + T_('Für den Erhebungsbogen der Bautätigkeitsstatistik (Hochbaustatistikgesetz); den Bogen online ausfüllen und dem Antrag beilegen.') + '</p>';
    h += '<h2 class="pg">' + T_('Ausfüllhilfe für die amtlichen Formulare') + '</h2><table>' + values(p, q).map((v) => tr(esc(v.label), v.value ? esc(v.value) : '<span class="note">' + T_('fehlt') + '</span>')).join('') + '</table>';
    if (opts.drawings) h += '<h2 class="pg">' + T_('Bauzeichnungen (Entwurf, nicht maßstäblich)') + '</h2>' + opts.drawings +
      '<p class="note">' + T_('Die einzureichenden Bauzeichnungen im Maßstab 1 : 100 mit Bemaßung, Höhenkoten und Geländeverlauf erstellt die bauvorlageberechtigte Person; der amtliche Lageplan kommt von der Vermessung.') + '</p>';
    return h;
  }

  BP.bauantrag = { options, jurisdiction, facts, ctxOf, matches, procedure, kosten, values, guessField, statistik, baubeschreibung, bundle, tx, PROC, DOC, BY, OTHER, STATUS };
})(typeof window !== 'undefined' ? window : globalThis);
