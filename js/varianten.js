/* Variantenvergleich: Planungsstände mit ihren Kennwerten speichern, nebeneinander vergleichen und wieder übernehmen.
 * Die Kennwerte werden beim Speichern aus der vollständigen Rechnung übernommen (mit FE), damit der Vergleich ohne
 * erneute Rechnung aller Varianten auskommt. */
(function (root) {
  const BP = root.BP, M = BP.model, T_ = BP.i18n.T, N_ = BP.i18n.N;
  const VA = BP.varianten = {};

  /* Kennwerte aus Projekt und Rechnung (Beträge intern in Euro) */
  VA.metrics = function (p, q) {
    const s = q.summary || {}, rn = q.radon && q.radon.states && q.radon.states.find((x) => x.id === 'closed');
    const hours = q.bom && q.bom.items ? q.bom.items.reduce((a, i) => a + (i.hours || 0), 0) : null;
    const m = { people: p.use.people, days: p.use.days, Anet: s.Anet, A: s.A, concrete: s.concrete, steel: s.steel, excavation: s.excavation, cost: s.cost, costNet: s.costNet,
      weeks: s.weeks, etaMax: isFinite(s.etaMax) ? s.etaMax : null, buoyancy: q.struct && q.struct.buoyancy && q.struct.buoyancy.relevant ? s.buoyancy : null,
      errors: s.errors, warnings: s.warnings, selfHours: hours, radonQ: rn ? rn.Qmax : null, pf: q.struct && q.struct.shield ? q.struct.shield.pf : null };
    for (const k of M.VARIANT_KEYS) if (!(typeof m[k] === 'number' && isFinite(m[k]))) m[k] = null;
    return m;
  };

  /* Stand ohne Varianten und Projektkennung */
  VA.snapshot = function (p) {
    const s = JSON.parse(JSON.stringify(p));
    delete s.variants; delete s.uid; delete s._migrated;
    return s;
  };
  VA.same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /* Beschreibende Angaben eines Stands */
  VA.describe = function (s) {
    const b = s.build, wp = M.WATERPROOFING[b.waterproofing];
    return {
      dims: T_('Wand {w} · Decke {r} · Platte {f} cm', { w: Math.round(b.tWall * 100), r: Math.round(b.tRoof * 100), f: Math.round(b.tFloor * 100) }),
      concrete: b.concrete, wp: wp ? T_(wp.name) : b.waterproofing, cover: b.cover, levels: 1 + (s.levels || []).length, mound: !!(b.mound && b.mound.on),
      country: s.site.country + (s.site.region ? '-' + s.site.region : ''),
    };
  };

  /* Zeilen des Vergleichs: Schlüssel, Bezeichnung, Formatierung, besser (min/max) */
  VA.ROWS = [
    { k: 'people', label: N_('Personen'), d: 0 },
    { k: 'days', label: N_('Schutzdauer'), d: 0, unit: N_('Tage') },
    { k: 'Anet', label: N_('Nutzfläche netto'), d: 1, unit: 'm²', better: 'max' },
    { k: 'concrete', label: N_('Stahlbeton'), d: 1, unit: 'm³', better: 'min' },
    { k: 'steel', label: N_('Betonstahl'), d: 2, unit: 't', scale: 0.001, better: 'min' },
    { k: 'excavation', label: N_('Aushub'), d: 0, unit: 'm³', better: 'min' },
    { k: 'cost', label: N_('Richtkosten brutto'), money: true, better: 'min' },
    { k: 'costPP', label: N_('Kosten je Person'), money: true, better: 'min', calc: (m) => (m.cost != null && m.people > 0 ? m.cost / m.people : null) },
    { k: 'selfHours', label: N_('Eigenleistung'), d: 0, unit: 'h' },
    { k: 'weeks', label: N_('Bauzeit'), d: 1, unit: N_('Wochen'), better: 'min' },
    { k: 'etaMax', label: N_('Ausnutzung Tragwerk'), d: 2, better: 'min', warn: (v) => v > 1 },
    { k: 'buoyancy', label: N_('Auftrieb η'), d: 2, better: 'min', warn: (v) => v > 1 },
    { k: 'pf', label: N_('Schutzfaktor Strahlung'), d: 0, better: 'max' },
    { k: 'radonQ', label: N_('Radon: zulässige Bodenluft ohne Lüftung'), d: 1, unit: 'l/h', better: 'max' },
    { k: 'errors', label: N_('Fehler'), d: 0, better: 'min', warn: (v) => v > 0 },
    { k: 'warnings', label: N_('Warnungen'), d: 0, better: 'min' },
  ];
  VA.value = (row, m) => (row.calc ? row.calc(m) : m[row.k]);

  /* ---------- Bedienung (Änderungen über app.commit, damit „Rückgängig“ greift) ---------- */
  const app = () => BP.app;
  const finalQ = () => { const A = app(); return A.q.struct.fe && A.q.struct.fe.pending ? BP.calc.run(A.p) : A.q; };
  VA.save = function (name) {
    const A = app(), list = A.p.variants || [];
    if (list.length >= M.VARIANTS_MAX) { A.toast(T_('Höchstens {n} Varianten. Zum Speichern eine löschen oder überschreiben.', { n: M.VARIANTS_MAX }), true); return; }
    const nm = String(name || '').trim().slice(0, 80) || T_('Variante {n}', { n: list.length + 1 });
    const m = VA.metrics(A.p, finalQ());
    A.commit((p) => { p.variants = p.variants || []; p.variants.push({ id: M.uid('v'), name: nm, created: new Date().toISOString(), snap: VA.snapshot(p), m }); });
    A.toast(T_('Variante „{name}“ gespeichert.', { name: nm }));
  };
  VA.update = function (i) {
    const A = app(), v = (A.p.variants || [])[i];
    if (!v) return;
    const m = VA.metrics(A.p, finalQ());
    A.commit((p) => { Object.assign(p.variants[i], { snap: VA.snapshot(p), m, created: new Date().toISOString() }); });
    A.toast(T_('Variante „{name}“ mit dem aktuellen Stand überschrieben.', { name: v.name }));
  };
  VA.remove = function (i) {
    const A = app(), v = (A.p.variants || [])[i];
    if (!v) return;
    A.commit((p) => { p.variants.splice(i, 1); });
    A.toast(T_('Variante „{name}“ gelöscht. „Rückgängig“ holt sie zurück.', { name: v.name }));
  };
  VA.load = function (i) {
    const A = app(), v = (A.p.variants || [])[i];
    if (!v) return;
    let np;
    try { np = M.normalize(Object.assign(JSON.parse(JSON.stringify(v.snap)), { format: 'bunkerplaner', variants: [] })); } catch (err) { A.toast(err.message, true); return; }
    delete np._migrated;
    A.commit((p) => { const keep = { variants: p.variants, uid: p.uid }; Object.keys(p).forEach((k) => delete p[k]); Object.assign(p, np, { variants: keep.variants }); if (keep.uid) p.uid = keep.uid; });
    A.sel = null; A.syncShape(); if (BP.plan2d.fit) BP.plan2d.fit(); A.render();
    A.toast(T_('Variante „{name}“ übernommen. „Rückgängig“ holt den vorigen Stand zurück.', { name: v.name }));
  };
})(typeof window !== 'undefined' ? window : globalThis);
