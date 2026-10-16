/* Betrieb und Wartung: Wartungsplan aus dem Register (js/wartung-daten.js) für die geplante Ausstattung und das Land,
 * Termine ab Inbetriebnahme, Kalenderdatei (iCalendar, RFC 5545), CSV und Druckfassung.
 * Länderfassungen: eine Aufgabe mit Länderkürzel (z. B. gen_test_ch) ersetzt im Land die allgemeine Aufgabe (gen_test).
 * Gibt es für eine vorhandene Komponente im Land keine Aufgabe, gelten die deutschen bzw. europäischen Regeln als Anhalt. */
(function (root) {
  const BP = root.BP, T_ = BP.i18n.T, N_ = BP.i18n.N, I18 = BP.i18n;
  const W = BP.wartung = {};
  const data = () => BP.wartungDaten || { tasks: [], notes: [] };
  const tx = (o) => (o == null ? '' : typeof o === 'string' ? o : o[I18.lang()] || o.de || o.en || '');
  W.tx = tx;

  const COMP = {
    other: N_('Kontrolle durch die Behörde'), vent: N_('Schutzlüftung'), filter: N_('Filter'), valves: N_('Luftfassung und Ventile'), doors: N_('Türen, Luken, Notausstieg'),
    tightness: N_('Dichtheit'), seal: N_('Hülle und Durchführungen'), drain: N_('Dränage'), hebe: N_('Hebeanlage und Rückstau'), tank_sew: N_('Abwasser'),
    gen: N_('Notstromaggregat'), fuel: N_('Kraftstoff'), bat: N_('Batterien'), elec: N_('Elektroanlage'), smoke: N_('Rauchwarnmelder'), co: N_('CO- und CO₂-Melder'),
    ext: N_('Feuerlöscher'), water: N_('Wasser'), food: N_('Vorräte'), firstaid: N_('Erste Hilfe'), comms: N_('Kommunikation'), radon: N_('Radon'), trial: N_('Probebetrieb'),
  };
  const WHO = { owner: N_('Eigentümer'), expert: N_('Fachkundige'), company: N_('Fachbetrieb'), authority: N_('Behörde') };
  W.COMP = COMP; W.WHO = WHO;
  W.months = (iv) => (iv && iv.months) || (iv && iv.years ? iv.years * 12 : null);
  const baseId = (id) => id.replace(/_(de|at|ch|us)$/, '');

  /* Komponenten der Planung */
  W.components = function (p, q) {
    const t = q.tech || {}, sv = t.svc || {}, g = q.geo || {};
    const has = new Set(['doors', 'seal', 'water', 'food', 'elec', 'smoke', 'co', 'ext', 'firstaid', 'comms', 'radon', 'trial', 'other']);
    if (t.ventN > 0) { has.add('vent'); has.add('valves'); }
    if (sv.prot) { has.add('filter'); has.add('tightness'); }
    if (sv.sew && sv.sew.mode === 'hebeanlage') has.add('hebe');
    if (sv.sew && (sv.sew.mode === 'tank' || sv.sew.mode === 'trocken')) has.add('tank_sew');
    if (sv.gen) { has.add('gen'); has.add('fuel'); }
    if (t.battery > 0) has.add('bat');
    if (p.build.drainage) has.add('drain');
    return { has, sew: sv.sew ? sv.sew.mode : null, genInside: !!(sv.gen && sv.gen.loc === 'innen'), tankL: sv.gen ? (sv.gen.tankSize || 0) * (sv.gen.nTanks || 1) : 0,
      exitShaft: (g.access || []).some((a) => a.kind !== 'treppe') };
  };

  /* Einzelbedingungen je Aufgabe */
  function fits(t, c, p) {
    const id = t.id;
    if (/^co_(test|replace)$/.test(id)) return c.genInside;
    if (id === 'drytoilet') return c.sew === 'trocken';
    if (/^tank_sew_/.test(id)) return c.sew === 'tank';
    if (id === 'exit_24') return c.exitShaft;
    if (/^hebe_wartung_/.test(id)) return id === 'hebe_wartung_' + (p.use.people > 12 ? 'mfh' : 'efh');
    if (id === 'fuel_awsv_sv_de') return c.tankL > 1000; // bis 1 m³ keine Sachverständigenprüfung
    return true;
  }

  function addMonths(d, m) {
    const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1));
    const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
    r.setUTCDate(Math.min(d.getUTCDate(), last));
    return r;
  }
  const iso = (d) => d.toISOString().slice(0, 10);
  const parse = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? new Date(s + 'T00:00:00Z') : null);

  /* Plan: Aufgaben mit Komponente, Intervall (Monate), nächstem Termin; opt.today für Tests */
  W.plan = function (p, q, opt) {
    opt = opt || {};
    const cc = (BP.laender && BP.laender.country(p)) || p.site.country || 'DE';
    const c = W.components(p, q), all = data().tasks;
    const endBuild = q.schedule && q.schedule.dates && q.schedule.dates.length ? q.schedule.dates[q.schedule.dates.length - 1] : null;
    const start = parse(p.ops && p.ops.start) || parse(endBuild) || parse(iso(opt.today || new Date()));
    const today = parse(iso(opt.today || new Date()));
    const inCountry = (t) => t.countries.includes('*') || t.countries.includes(cc);
    let list = all.filter((t) => c.has.has(t.component) && inCountry(t) && fits(t, c, p));
    // Länderfassung ersetzt die allgemeine Aufgabe
    const local = new Set(list.filter((t) => !t.countries.includes('*') && baseId(t.id) !== t.id).map((t) => baseId(t.id)));
    list = list.filter((t) => !(t.countries.includes('*') && local.has(t.id)));
    // Komponente ohne Aufgabe im Land: Regeln aus DE/AT/CH als Anhalt
    const guide = new Set();
    for (const comp of c.has) {
      if (list.some((t) => t.component === comp)) continue;
      const alt = all.filter((t) => t.component === comp && t.countries.includes('DE') && fits(t, c, p));
      alt.forEach((t) => guide.add(t.id));
      list = list.concat(alt);
    }
    const order = Object.keys(COMP);
    const tasks = list.map((t) => {
      const m = W.months(t.interval);
      let next = null;
      if (m) { let k = 1; next = addMonths(start, m); while (next < today && k < 1000) next = addMonths(start, m * ++k); }
      return { t, comp: t.component, months: m, guide: guide.has(t.id), first: m ? iso(addMonths(start, m)) : null, next: next ? iso(next) : null };
    }).sort((a, b) => order.indexOf(a.comp) - order.indexOf(b.comp) || (a.months || 1e9) - (b.months || 1e9));
    const notes = data().notes.filter((n) => { const m = /^(DE|AT|CH|US)[ :]/.exec(n.de || ''); return !m || m[1] === cc; });
    const due = tasks.filter((x) => x.next).sort((a, b) => a.next.localeCompare(b.next));
    return { cc, start: iso(start), startAuto: !parse(p.ops && p.ops.start), tasks, notes, nextDue: due.length ? due[0].next : null, checked: data().checked, comps: c };
  };

  /* Intervall als Text */
  W.intervalText = function (x) {
    const m = x.months;
    if (!m) return tx(x.t.interval.text) || T_('bei Bedarf');
    if (m % 12 === 0) return m === 12 ? T_('jährlich') : T_('alle {n} Jahre', { n: m / 12 });
    return m === 1 ? T_('monatlich') : T_('alle {n} Monate', { n: m });
  };

  /* Kalenderdatei (RFC 5545): je Aufgabe mit festem Intervall ein Termin mit Wiederholung */
  W.ics = function (plan, p, opt) {
    opt = opt || {};
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const fold = (line) => {
      // Zeilen höchstens 75 Oktette, Fortsetzung mit Leerzeichen; UTF-8-Zeichen nicht zerteilen
      const out = []; let cur = '', n = 0;
      for (const ch of line) {
        const b = enc.encode(ch).length;
        if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; }
        cur += ch; n += b;
      }
      out.push(cur);
      return out.join('\r\n ');
    };
    const enc = new TextEncoder();
    const stamp = (opt.now || new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const uidBase = (p.uid || 'bunker') + '-';
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bunkerplaner//Wartungsplan//' + I18.lang().toUpperCase(), 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + esc(T_('Wartung {name}', { name: p.name || T_('Schutzraum') }))];
    for (const x of plan.tasks) {
      if (!x.months) continue;
      const rr = x.months % 12 === 0 ? 'FREQ=YEARLY;INTERVAL=' + (x.months / 12) : 'FREQ=MONTHLY;INTERVAL=' + x.months;
      const desc = [T_('Wer: {w}', { w: T_(WHO[x.t.who] || x.t.who) }), x.t.basis ? T_('Grundlage: {b}', { b: x.t.basis }) : '', tx(x.t.note), x.guide ? T_('Regel aus Deutschland bzw. Europa als Anhalt.') : '', x.t.source || ''].filter(Boolean).join('\n');
      L.push('BEGIN:VEVENT', 'UID:' + uidBase + x.t.id + '@bunkerplaner', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + x.first.replace(/-/g, ''),
        'RRULE:' + rr, 'SUMMARY:' + esc(T_(COMP[x.comp]) + ': ' + tx(x.t.task)), 'DESCRIPTION:' + esc(desc), 'TRANSP:TRANSPARENT', 'END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  };

  /* Tabelle für CSV und Druck */
  W.rows = function (plan) {
    return plan.tasks.map((x) => ({ comp: T_(COMP[x.comp]), task: tx(x.t.task), interval: W.intervalText(x), who: T_(WHO[x.t.who] || x.t.who),
      basis: x.t.basis || '', mandatory: x.t.mandatory === true ? T_('Pflicht') : x.t.mandatory === false ? T_('Empfehlung') : T_('je nach Land und Nutzung'),
      next: x.next || '', note: [tx(x.t.note), x.guide ? T_('Regel aus Deutschland bzw. Europa als Anhalt.') : ''].filter(Boolean).join(' '), status: x.t.status, source: x.t.source || '' }));
  };
})(typeof window !== 'undefined' ? window : globalThis);
