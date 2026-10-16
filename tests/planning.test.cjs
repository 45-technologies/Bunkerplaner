const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
for (const file of ['i18n','i18n-en','i18n-es','laender-daten','feiertage-daten','laender','normen-daten','normen','geo','model','calc-extra','planning','fe','slabs','lifts','verify','haustechnik','radon-daten','radon','wartung-daten','wartung','kalender','calc','benchmarks','rebarplans','statikreport','vergleich','bauantrag-daten','bauantrag','ifc','varianten','layouts']) vm.runInThisContext(fs.readFileSync(path.join(__dirname,'../js',file+'.js'),'utf8'), { filename:file });
const X = BP.planning, TODAY = X.today(); // Angebotsdaten relativ zu heute, damit die Tests nicht altern
let count = 0;
function test(name, fn) { fn(); count++; console.log('OK ' + name); }
const fresh = () => BP.model.defaultProject();
const NOFE = { fe: 'none' }; // nur Tafelverfahren
test('Bestandsprojekt erhält Erweiterungen ohne Änderung der Planmengen', () => {
  const p = fresh(), before = BP.calc.run(p); delete p.planning;
  const after = BP.calc.run(BP.model.normalize(p));
  assert.equal(after.geo.A,65); assert.equal(after.steel.total,before.steel.total); assert.equal(after.vol.rc,before.vol.rc);
  assert.equal(after.planning.threats.length,0);
});
test('TNT-Modell: Referenzwerte und kubische Skalierung', () => {
  const a = X.airblast(1,1), b = X.airblast(8,2);
  assert.ok(Math.abs(a.pressure-5005.5791661)<1e-6); assert.ok(Math.abs(a.impulse-559.0338153)<1e-6);
  assert.equal(a.pressure,b.pressure); assert.equal(b.impulse,2*a.impulse);
  for (const [w,r] of [[0,1],[1,0],[1,.049],[1,40.001],[NaN,1],[1,Infinity]]) assert.equal(X.airblast(w,r),null);
});
test('Waffenmasse wird niemals als TNT übernommen; Quelle ist Pflicht', () => {
  const p = fresh(), s = X.scenario(); p.planning.scenarios.push(s); s.weapon='geran5'; s.mode='air'; s.distance=10;
  assert.equal(X.threats(p)[0].energy,null); assert.equal(X.threats(p)[0].load,null);
  s.tnt=10; assert.equal(X.threats(p)[0].load,null);
  s.loadSource='Definierter Modellfall, keine Waffenäquivalenz'; assert.ok(X.threats(p)[0].load);
  s.mode='contact'; assert.equal(X.threats(p)[0].load,null);
});
test('Mehrfachtreffer verändern keine Einzelereignis-Druckspitze', () => {
  const p=fresh(), s=X.scenario(); Object.assign(s,{mode:'air',tnt:10,distance:10,loadSource:'Modell'});p.planning.scenarios=[s];
  const a=X.threats(p)[0].load.pressure; s.hits=12;assert.equal(X.threats(p)[0].load.pressure,a);
});
test('Unterlagentitel allein genügt nicht; Änderung entwertet Zuordnung', () => {
  const p=fresh(),s=X.scenario(); p.planning.scenarios=[s]; s.report.reference='Bericht';assert.equal(X.threats(p)[0].complete,false);
  Object.assign(s,{variant:'genaue Testvariante',pattern:'Decke und Öffnungen',criterion:'Innenraumsicherheit',hits:2,spacing:2,interval:60});
  Object.assign(s.report,{author:'Prüfstelle',date:TODAY,scope:'Exakt dieser Plan und alle Randbedingungen',material:'C30/37, Bewehrungsplan',details:'Öffnungen und zwei Treffer geprüft',maxHits:2,wall:.35,roof:.4,floor:.4,accepted:true});
  s.report.baseline=X.scenarioKey(p,s);assert.equal(X.threats(p)[0].documented,true);
  p.build.concrete='C35/45';assert.equal(X.threats(p)[0].documented,false);
  p.build.concrete='C30/37'; s.hits=3;assert.equal(X.threats(p)[0].adequate,false);
});
test('Import verweigert nicht endliche, negative und gebrochene Trefferzahlen', () => {
  for(const hits of ['2',0,1.5,Infinity]) {const p=fresh();p.planning.scenarios=[{...X.scenario(),hits}];assert.throws(()=>X.validate(p));}
  assert.equal(X.date('2026-99-99'),false);assert.equal(X.date('2026-02-30'),false);assert.equal(X.date('2026-10-10'),true);
});
test('Wasser unbekannt bleibt unbekannt; hoher Druckwasserstand blockiert PMBC', () => {
  const p=fresh();assert.equal(BP.calc.run(p).planning.moisture.head,null);
  p.site.waterMode='keins';assert.equal(BP.calc.run(p).planning.moisture.head,0);
  p.site.waterMode='gok';p.build.waterproofing='pmbc';const m=BP.calc.run(p).planning.moisture;
  assert.ok(m.head>3);assert.ok(m.checks.some(c=>c.level==='err'));
});
test('Gebinde runden auf; Brutto wird in Cent summiert; offene Fracht kein Nullpreis', () => {
  const p=fresh();p.site.query='45127 Essen';p.planning.procurement.extras=[{id:'test',name:'Beschichtung nach Detailplan',unit:'m²',qty:20}];
  const q=BP.calc.run(p),l=X.lines(q).find(l=>l.id==='extra:test');
  const o={...X.offer(),product:'Produkt',sku:'123',supplier:'Händler',url:'https://example.org/123',date:TODAY,productUnit:'l',pack:30,factor:4.7,gross:85.3};
  p.planning.procurement.offers[l.id]=o;
  let row=X.procurement(p,q).rows.find(l=>l.id==='extra:test');assert.equal(row.packages,4);assert.equal(row.cents,34120);assert.equal(row.checked,false);
  o.checked=true;o.baseline=X.offerKey(p,l,o);row=X.procurement(p,q).rows.find(l=>l.id==='extra:test');assert.equal(row.checked,true);
  assert.equal(X.procurement(p,q).vendors[0].shipping,null);assert.equal(X.procurement(p,q).total,null);
  p.site.query='50667 Köln';assert.equal(X.procurement(p,q).rows.find(l=>l.id==='extra:test').checked,false);
});
test('Adresse und Warenkorb entwerten die Lieferbestätigung', () => {
  const p=fresh();p.site.query='45127 Essen';const q=BP.calc.run(p),l=X.lines(q)[0],o={...X.offer(),product:'Beton C30/37',sku:'Angebot-1',supplier:'Werk',url:'https://example.org/angebot',date:TODAY,productUnit:l.unit,gross:180};p.planning.procurement.offers[l.id]=o;
  const d={...X.delivery(),shipping:100,date:TODAY,reference:'Angebot Essen',days:'2026-11-02',confirmed:true};p.planning.procurement.deliveries.werk=d;
  let v=X.procurement(p,q).vendors[0];d.baseline=X.deliveryKey(p,'werk',d,v.lines);assert.equal(X.procurement(p,q).vendors[0].current,true);
  p.site.query='50667 Köln';assert.equal(X.procurement(p,q).vendors[0].current,false);
  p.site.query='45127 Essen';o.gross=190;assert.equal(X.procurement(p,q).vendors[0].current,false);
});
test('Abgelaufene und verwaiste Angebote fehlen im bestätigten Budget', () => {
  const p=fresh(),q=BP.calc.run(p),l=X.lines(q)[0];p.planning.procurement.offers[l.id]={...X.offer(),product:'P',sku:'A',supplier:'H',url:'https://example.org/p',date:'2020-01-01',validUntil:'2020-01-02',productUnit:'m³',gross:100};
  p.planning.procurement.offers.orphan={...X.offer()};const v=X.procurement(p,q);assert.equal(v.rows[0].cents,null);assert.equal(v.partial,0);assert.deepEqual(v.orphan,['orphan']);
});
test('Vollständiger Einkaufsumfang summiert Fracht einmal pro Lieferant', () => {
  const p=fresh();p.site.query='45127 Essen';let q=BP.calc.run(p);
  for(const l of X.lines(q)) { const o={...X.offer(),product:l.name,sku:'SKU-'+l.id,supplier:'Werk',url:'https://example.org/angebot',date:TODAY,productUnit:l.unit,gross:1,checked:true};o.baseline=X.offerKey(p,l,o);p.planning.procurement.offers[l.id]=o; }
  const d={...X.delivery(),shipping:79.5,date:TODAY,reference:'Adressbezogenes Angebot',days:'5 AT',confirmed:true};p.planning.procurement.deliveries.werk=d;
  let v=X.procurement(p,q);d.baseline=X.deliveryKey(p,'werk',d,v.vendors[0].lines);v=X.procurement(p,q);
  assert.equal(v.complete,true);assert.equal(v.total,v.partial+7950);
  p.planning.scenarios.push(X.scenario());assert.equal(X.procurement(p,q).complete,true);
  p.build.tFloor=0.5;q=BP.calc.run(p);assert.equal(X.procurement(p,q).complete,false);
});
test('Kleine Restmengen bestellen mindestens ein Gebinde; Überlauf bleibt offen', () => {
  const p=fresh();p.planning.procurement.extras=[{id:'tiny',name:'Kleine Menge',qty:1e-10,unit:'kg'}];let q=BP.calc.run(p);
  const o={...X.offer(),product:'P',sku:'S',supplier:'H',url:'https://example.org/p',date:TODAY,productUnit:'kg',pack:1e9,factor:1e-6,gross:1};p.planning.procurement.offers['extra:tiny']=o;
  assert.equal(X.procurement(p,q).rows.find(l=>l.id==='extra:tiny').packages,1);
  p.planning.procurement.extras[0].qty=1e9;o.pack=1e-6;o.factor=1e9;q=BP.calc.run(p);
  assert.equal(q.planning.procurement.rows.find(l=>l.id==='extra:tiny').cents,null);
});
test('Import akzeptiert keine injizierten IDs oder geerbten Katalogeinträge', () => {
  const p=fresh();p.planning.procurement.extras=[{id:'\"><img src=x>',name:'Test',unit:'kg',qty:1}];assert.throws(()=>BP.model.normalize(p));
  const q=fresh();q.planning.scenarios=[{...X.scenario(),weapon:'constructor'}];assert.throws(()=>BP.model.normalize(q));
});
test('Erdhügel: Höhen, Lasten und Massenbilanz', () => {
  const p0 = fresh(), q0 = BP.calc.run(p0);
  assert.equal(q0.lv.hM, 0); assert.equal(q0.earth.Vmound, 0); assert.equal(q0.lv.zRoofTop, -1);
  const p = fresh(); Object.assign(p.build.mound, { on: true, floorDepth: 0, crest: 1, slope: 2, fill: 'aushub' });
  const q = BP.calc.run(p), lv = q.lv, e = q.earth;
  assert.ok(Math.abs(lv.hM - 3.8) < 1e-9); assert.ok(Math.abs(lv.zFloorTop) < 1e-9); assert.ok(Math.abs(lv.zRoofTop - 2.8) < 1e-9);
  // Erddruck und Deckenlast unverändert: Tiefen werden ab OK Hügel gemessen
  assert.ok(Math.abs(q.struct.wall.p2 - q0.struct.wall.p2) < 1e-9); assert.equal(q.struct.roof.gk, q0.struct.roof.gk);
  // Baugrube nur noch bis Gründung, Hügel aus Aushub plus Lieferung
  assert.ok(Math.abs(e.depth + lv.zPit) < 1e-9 && e.depth < 1);
  assert.ok(Math.abs(e.moundFromSite + e.Vimport - e.Vmound) < 1e-6); assert.ok(e.Vremove >= -1e-9);
  // Hügelvolumen gegen Prismatoid-Näherung (Rechteck 10 × 6,5, Gehrungsecken)
  const rA = (r) => (10 + 2 * r) * (6.5 + 2 * r), V = 3.8 / 6 * (rA(8.6) + 4 * rA(4.8) + rA(1)) - 65 * 2.8;
  assert.ok(e.Vmound < V && e.Vmound > V - 60, 'Hügelvolumen ' + e.Vmound + ' / ' + V);
  // Zugänge: ebenerdige Treppe ohne Stufen, Einschnitt bis Hügelfuß; Notausstieg bis über Hügel
  const st = q.geo.access.find((a) => a.kind === 'treppe'), sh = q.geo.access.find((a) => a.kind === 'schacht');
  assert.equal(st.nr, 0); assert.ok(Math.abs(st.Lcut - 8.6) < 1e-9); assert.ok(Math.abs(sh.zTop - 3.95) < 1e-9);
  assert.ok(q.bom.items.some((i) => /Erdhügel aufschütten/.test(i.name)));
  assert.ok(q.checks.some((c) => /frostfreie Gründung/.test(c.text)));
  // Grundwasser unter Gelände: Wasser über Sohle wie ohne Hügel aus Urgelände gerechnet
  const pw = fresh(); Object.assign(pw.build.mound, { on: true, floorDepth: 1.2 }); pw.site.waterMode = 'tiefe'; pw.site.waterDepth = 1.5;
  const qw = BP.calc.run(pw);
  assert.ok(Math.abs(qw.struct.wall.pressures.waterAtBot - 10 * Math.max(0, (qw.lv.hM - qw.lv.zFloorTop + pw.build.tFloor / 2) - (qw.lv.hM + 1.5))) < 1e-9);
  // Komplett unterirdisch eingestellt: identisch zum Standard
  const pu = fresh(); Object.assign(pu.build.mound, { on: true, floorDepth: 3.8 });
  const qu = BP.calc.run(pu); assert.equal(qu.lv.hM, 0); assert.equal(qu.earth.Vexc, q0.earth.Vexc);
});
test('Großschutzraum: Abschnitte, Schleusen, Zugänge und Statik', () => {
  for (const n of [30, 120, 200]) {
    const p = fresh(); p.use.people = n;
    const lay = BP.layouts.generate(p, { per: 3 }).find((l) => l.key === 'gross');
    assert.ok(lay, 'Typ fehlt bei ' + n);
    p.geom = JSON.parse(JSON.stringify(lay.geom)); p.routes = JSON.parse(JSON.stringify(lay.routes));
    const q = BP.calc.run(p), g = q.geo;
    assert.ok(g.valid); assert.equal(g.openings.filter((o) => o.invalid).length, 0);
    assert.equal(g.rooms.filter((r) => /^Raum \d+$/.test(r.name)).length, 0, 'unbenannte Räume bei ' + n);
    const beds = g.rooms.filter((r) => /^Kabine/.test(r.name)).length * (n > 60 ? 6 : 4);
    assert.ok(beds >= n, 'Betten ' + beds + ' < ' + n);
    assert.ok(g.access.length >= (n > 100 ? 3 : 2));
    assert.ok(q.struct.roof.field.lxC <= 4.01);
    assert.equal(q.checks.filter((c) => c.level === 'err').length, 0, q.checks.filter((c) => c.level === 'err').map((c) => c.text).join('; '));
    assert.ok(q.tech.qCo2 <= q.tech.ventN * q.tech.ventSize);
  }
  assert.ok(!BP.layouts.generate(fresh(), { per: 3 }).some((l) => l.key === 'gross'));
});
test('Eigenleistung: Firma-Standard unverändert, Eigenleistung ohne MwSt. auf Stunden', () => {
  const p = fresh(); p.costs.planningMode = 'prozent';
  const q = BP.calc.run(p);
  assert.ok(q.bom.items.every((i) => i.mode === 'firma')); assert.equal(q.bom.ownH, 0);
  const pe = fresh(); for (const k of ['erde','beton','schalung','bewehrung']) pe.self.trades[k] = 'eigen'; pe.self.wage = 20; pe.self.equip.bagger = 'eigen';
  const qe = BP.calc.run(pe), b = qe.bom;
  assert.ok(b.ownH > 100); assert.ok(Math.abs(b.ownCost - 20 * b.ownH) < 1e-6);
  assert.ok(Math.abs(b.vat - (b.sumNet - b.ownCost * (1 + pe.costs.reserve / 100)) * pe.costs.vat / 100) < 1e-6);
  assert.ok(b.items.some((i) => i.key === 'bagger_eigen')); assert.ok(!b.items.some((i) => i.key === 'bagger'));
  // Betonstahl in Eigenleistung: Material + Stunden statt Firmenpreis
  const st = b.items.find((i) => i.key === 'stahl'); assert.equal(st.mode, 'eigen'); assert.ok(Math.abs(st.price - (1150 + 22 * 20)) < 1e-9);
  // Baustellenbeton: Warnung und Kapazitätsprüfung
  const pm = fresh(); pm.self.concrete.mode = 'baustelle'; pm.self.concrete.mixers = 2;
  const qm = BP.calc.run(pm);
  assert.ok(qm.checks.some((c) => c.level === 'err' && /Überwachungsklasse 2/.test(c.text)));
  assert.ok(qm.checks.some((c) => /ungeplante Arbeitsfugen/.test(c.text)));
  // Planungsposten: leerer Betrag = Richtwert
  const sv = BP.calc.servicesOf(fresh(), q); assert.ok(sv.find((s) => s.id === 'statik').amount >= 4000);
});
test('Erdhügel über der konvexen Hülle: L-Form, Zugang in der Einbuchtung, Schnittprofil', () => {
  const p = fresh(); p.geom.outline = BP.model.shapeL(12, 10, 5, 4); p.geom.walls = []; p.geom.openings = []; p.geom.rooms = []; p.routes = [];
  p.geom.access = [{ id: 'a1', kind: 'treppe', edge: 3, pos: 2, width: 1, tw: 0.25, cover: 'offen', landing: 1.2 }, { id: 'a2', kind: 'schacht', edge: 0, pos: 3, width: 0.8, depth: 0.8, tw: 0.25, lw: 0.6, lh: 0.8 }];
  Object.assign(p.build.mound, { on: true, floorDepth: 1, crest: 1, slope: 2 });
  const q = BP.calc.run(p), mo = q.lv.mound, e = q.earth, G = BP.geo;
  assert.equal(mo.hull.length, 5); // Einbuchtung durch Diagonale geschlossen
  assert.ok(Math.abs(mo.at({ x: 8, y: 7 }) - mo.h) < 1e-9, 'Einbuchtung bis zur Krone aufgefüllt');
  assert.ok(Math.abs(G.area(e.toePoly) - G.area(G.offsetPolygon(mo.hull, mo.toe))) < 1e-9);
  // Simpson ist für Gehrungs-Offsets konvexer Flächen exakt: Vergleich mit feiner Scheibensumme
  let fine = 0; const N = 400; for (let i = 0; i < N; i++) fine += G.area(G.offsetPolygon(mo.hull, mo.crest + mo.n * (mo.h - (i + 0.5) / N * mo.h))) * mo.h / N;
  const Vcut = fine - q.geo.A * Math.max(0, mo.h - p.build.cover) - e.Vmound;
  assert.ok(Vcut > 0 && Vcut < 60, 'Einschnitte ' + Vcut);
  // Treppe in der Einbuchtung: Einschnitt bis zum Hügelfuß der Hülle (hier über die Kante x = 12 + Fuß)
  const st = q.geo.access.find((a) => a.kind === 'treppe');
  assert.ok(Math.abs(st.Lcut - (12 + mo.toe - 7)) < 1e-9, 'Lcut ' + st.Lcut);
  for (const prof of [st.profL, st.profR]) { assert.equal(prof[0][0], 0); assert.ok(Math.abs(prof[prof.length - 1][1]) < 1e-9); for (let i = 1; i < prof.length; i++) assert.ok(prof[i][0] > prof[i - 1][0]); }
  // Schnittprofil entlang einer Linie: exakt stückweise linear, Fußpunkte bei z = 0
  const pr = mo.profile({ x: -20, y: 2 }, { x: 1, y: 0 }, 0, 40), zs = pr.map((x) => x[1]);
  assert.ok(Math.abs(Math.max(...zs) - mo.h) < 1e-9); assert.ok(pr.some((x) => Math.abs(x[0] - (20 - mo.toe)) < 1e-9 && x[1] === 0));
  assert.equal(q.checks.filter((c) => c.level === 'err' && c.step === 'grundriss').length, 0);
});
test('Zugänge: Kollisionen mit Bauwerk, untereinander und überlappende Öffnungen werden gemeldet', () => {
  const p = fresh();
  p.geom.outline = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 9, y: 8 }, { x: 9, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 8 }, { x: 0, y: 8 }];
  p.geom.walls = []; p.geom.openings = []; p.geom.rooms = []; p.routes = [];
  p.geom.access = [{ id: 'a1', kind: 'treppe', edge: 5, pos: 2.5, width: 1, tw: 0.25, cover: 'klappe', landing: 1.2 }];
  let q = BP.calc.run(p);
  assert.ok(q.checks.some((c) => c.level === 'err' && /ragt in das Bauwerk/.test(c.text) && c.ref.id === 'a1'), 'Treppe quer durch den Innenhof');
  const p2 = fresh(); p2.geom.access.push({ id: 'a9', kind: 'treppe', edge: 0, pos: 7.5, width: 1, tw: 0.25, cover: 'klappe', landing: 1.2 });
  q = BP.calc.run(p2);
  assert.ok(q.checks.some((c) => c.level === 'err' && /Treppe 1 und Treppe 2 überschneiden sich/.test(c.text)));
  const p3 = fresh(); p3.geom.openings.push({ id: 'oX', host: 'w:w1', pos: 1.1, w: 0.9, h: 2, sill: 0, kind: 'innen' });
  q = BP.calc.run(p3);
  assert.ok(q.checks.some((c) => c.level === 'err' && /Öffnung 1 und Öffnung 4 überschneiden sich/.test(c.text) && c.ref.type === 'opening'));
  // Zugang nahe der Ecke: Lage wird so begrenzt, dass die Tür ganz in der Wand liegt
  const p4 = fresh(); p4.geom.access[0].pos = 0; p4.build.tWall = 0.5;
  const a4 = BP.calc.run(p4).geo.access.find((a) => a.id === 'a1');
  assert.equal(a4.opening.shifted, false); assert.ok(Math.abs(a4.pos - (0.5 + 0.5)) < 1e-9);
});
test('Meldungen nennen lesbare Bauteilnamen und verweisen auf das Bauteil', () => {
  const p = fresh(); p.geom.walls.push({ id: 'wDraussen', a: { x: 20, y: 20 }, b: { x: 22, y: 20 }, t: 0.2, kind: 'mw' });
  const q = BP.calc.run(p), c = q.checks.find((x) => /außerhalb des Innenraums/.test(x.text));
  assert.equal(c.text, 'Innenwand 4 liegt außerhalb des Innenraums.'); assert.deepEqual(c.ref, { type: 'wall', id: 'wDraussen' });
  assert.ok(!q.checks.some((x) => /wDraussen|\bw\d\b|a1:tuer/.test(x.text)));
  assert.equal(q.geo.labels['a:a1'], 'Treppe'); assert.equal(q.geo.labels['a:a2'], 'Notausstieg');
});
test('Rettungsweg: weit entfernte Bereiche ohne Zugang werden gemeldet; Großschutzraum bis 500 Personen ohne Meldung', () => {
  const p = fresh(); p.geom.outline = BP.model.shapeRect(90, 4); p.geom.walls = []; p.geom.openings = []; p.geom.rooms = []; p.routes = [];
  p.geom.access = [{ id: 'a1', kind: 'treppe', edge: 3, pos: 2, width: 1, tw: 0.25, cover: 'klappe', landing: 1.2 }];
  let q = BP.calc.run(p); assert.ok(q.geo.exitFar > 85); assert.ok(q.checks.some((c) => /Luftlinie vom nächsten Zugang/.test(c.text)));
  for (const n of [120, 300, 500]) {
    const pg = fresh(); pg.use.people = n; const lay = BP.layouts.generate(pg, { per: 3 }).find((l) => l.key === 'gross');
    pg.geom = JSON.parse(JSON.stringify(lay.geom)); pg.routes = JSON.parse(JSON.stringify(lay.routes));
    q = BP.calc.run(pg); assert.ok(q.geo.exitFar <= 35, n + ' Personen: ' + q.geo.exitFar);
    assert.equal(q.checks.filter((c) => c.level === 'err').length, 0, q.checks.filter((c) => c.level === 'err').map((c) => c.text).join('; '));
  }
  // kleine Grundformen nur in sinnvollen Bereichen
  const big = fresh(); big.use.people = 200; assert.deepEqual(BP.layouts.generate(big, { per: 3 }).map((l) => l.key), ['gross']);
});
test('Kosten: Firmenmodus ohne doppelte Gerätekosten, Altprojekte behalten Prozent-Planung', () => {
  const q = BP.calc.run(fresh());
  assert.ok(!q.bom.items.some((i) => /^(bagger|ruettler)/.test(i.key)), 'Bagger/Rüttelplatte stecken in den Erdarbeitspreisen');
  const old = fresh(); delete old.self; old.costs = { planning: 12, reserve: 10, vat: 19 };
  const n = BP.model.normalize(old); assert.equal(n.costs.planningMode, 'prozent'); assert.equal(n.costs.planning, 12);
  const qn = BP.calc.run(n); assert.ok(Math.abs(qn.bom.planning - qn.bom.net * 0.12) < 1e-6);
});
test('Reflektierter Impuls liegt über dem einfallenden (Vorzeichen der IATG-Konstanten)', () => {
  for (const z of [0.5, 1, 3, 10]) { const r = X.airblast(1, z); assert.ok(r && r.impulse > 0); }
  const near = X.airblast(1, 1), far = X.airblast(1, 5); assert.ok(near.impulse > far.impulse && near.pressure > far.pressure);
});
test('Schnittlinien: je Treppe und Notausstieg eine Ansicht, nummeriert bei mehreren', () => {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/section.js'), 'utf8'), { filename: 'section' });
  assert.deepEqual(BP.section.modes(BP.calc.run(fresh()).geo).map((m) => m[1]), ['Durch Treppe', 'Durch Notausstieg', 'Längs', 'Quer']);
  const p = fresh(); p.geom.access.push({ id: 'a3', kind: 'schacht', edge: 1, pos: 3, width: 0.8, depth: 0.8, tw: 0.25, lw: 0.6, lh: 0.8 });
  assert.deepEqual(BP.section.modes(BP.calc.run(p).geo).map((m) => m[0]), ['treppe:a1', 'schacht:a2', 'schacht:a3', 'x', 'y']);
});
test('CSV-Zellen: Formelanfänge werden entschärft', () => {
  global.window = global; global.document = { getElementById: () => null };
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../js/export.js'), 'utf8'), { filename: 'export' });
  assert.equal(BP.exporter.cell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"'); assert.equal(BP.exporter.cell('-5'), '"\'-5"'); assert.equal(BP.exporter.cell('Beton C30/37'), '"Beton C30/37"');
});
test('Layout-Vorschläge ergänzen Notausstiege bei großer Fläche je Person und bleiben unter 100 m Länge', () => {
  for (const [n, per] of [[25, 10], [100, 5], [150, 5], [500, 5], [60, 20]]) {
    const p = fresh(); p.use.people = n;
    for (const lay of BP.layouts.generate(p, { per })) {
      const pp = fresh(); pp.use.people = n; pp.geom = JSON.parse(JSON.stringify(lay.geom)); pp.routes = JSON.parse(JSON.stringify(lay.routes));
      const q = BP.calc.run(pp), bb = BP.geo.bbox(q.geo.out);
      assert.ok(q.geo.exitFar <= 35, lay.key + ' ' + n + '/' + per + ': ' + q.geo.exitFar);
      assert.ok(lay.key === 'gross' || Math.max(bb.w, bb.h) <= 100, lay.key + ' zu lang');
      assert.ok(!q.checks.some((c) => c.level === 'err' && c.step === 'grundriss'), lay.key + ' ' + n + '/' + per + ': ' + q.checks.filter((c) => c.level === 'err' && c.step === 'grundriss').map((c) => c.text).join('; '));
    }
  }
});
test('Hügelprofil an schrägen Wänden: Wandkrone behält die Krone; doppelte Eckpunkte bleiben endlich', () => {
  const p = fresh(), r = (pt) => ({ x: pt.x * Math.cos(0.3) - pt.y * Math.sin(0.3), y: pt.x * Math.sin(0.3) + pt.y * Math.cos(0.3) });
  p.geom.outline = BP.model.shapeRect(10, 6.5).map(r); p.geom.walls = []; p.geom.openings = []; p.geom.rooms = []; p.routes = [];
  p.geom.access = [{ id: 'a1', kind: 'treppe', edge: 0, pos: 3, width: 1, tw: 0.25, cover: 'klappe', landing: 1.2 }];
  Object.assign(p.build.mound, { on: true, floorDepth: 1, crest: 1, slope: 2 });
  const st = BP.calc.run(p).geo.access[0], top = st.side.filter((pt) => pt.y > 0.1);
  assert.ok(top.some((pt) => Math.abs(pt.x - 1) < 1e-6 && Math.abs(pt.y - 2.95) < 1e-6), JSON.stringify(top));
  const d = fresh(); d.geom.outline = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6.5 }, { x: 10, y: 6.5 }, { x: 0, y: 6.5 }]; d.geom.access[1].edge = 2; d.build.mound.on = true;
  const qd = BP.calc.run(d);
  assert.ok(Number.isFinite(qd.bom.gross) && Number.isFinite(qd.earth.Vmound));
  assert.ok(qd.checks.some((c) => /Außenkante 3 hat keine Länge/.test(c.text))); assert.ok(qd.checks.some((c) => /Notausstieg liegt auf keiner gültigen Außenkante/.test(c.text)));
});
test('Statik (Tafelverfahren): Durchlaufplatte gegen FE-Vergleichsrechnung, Querkraft, Rissbreite', () => {
  // Standardprojekt, Decke: FE (Mindlin-Platte, Wandachsen als Linienlager, Außenrand gelenkig) liefert über der Innenwand
  // ein Stützmoment von −107 kNm/m, eine Wandlast von 273 kN/m und im Abstand a + d von der Wandachse vEd ≈ 120 kN/m.
  const q = BP.calc.run(fresh(), NOFE), r = q.struct.roof;
  assert.ok(Math.abs(r.pEd - 45.975) < 1e-6, 'Lastannahme geändert: ' + r.pEd);
  assert.ok(r.moments.mSin >= 107 && r.moments.mSin <= 125, 'Stützmoment Innenwand ' + r.moments.mSin);
  assert.ok(r.moments.mF >= 73.7, 'Feldmoment ' + r.moments.mF);
  assert.ok(r.shear.vEd >= 120 && r.shear.vEd <= 150, 'Querkraft ' + r.shear.vEd);
  assert.ok(q.struct.intWalls[0].nEd >= 273, 'Innenwandlast ' + q.struct.intWalls[0].nEd);
  // Kein Bauteil des Standardprojekts überlastet, Rissbreiten unter Dauerlast eingehalten
  assert.equal(q.checks.filter((c) => c.level === 'err' && c.step === 'statik').length, 0);
  for (const pl of [r, q.struct.floor]) for (const l of pl.layers) assert.ok(l.wkLoad <= 0.2 + 1e-9, pl.name + ' ' + l.label + ' w = ' + l.wkLoad);
  // Rissbreite: Handrechnung m = 50 kNm/m, h = 40 cm, d = 35 cm, Ø12/10, C30/37 → σs ≈ M/(As·0,9d), wk ≈ 0,066 mm
  const mat = { fck: 30, fctm: 2.9 }, cw = BP.calc.crackWidth(50, 0.4, 0.35, 12, 0.1, mat), As = BP.calc.asBar(12) / 0.1 * 1e-4;
  assert.ok(Math.abs(cw.sigma / (50 / (As * 0.9 * 0.35) / 1000) - 1) < 0.03, 'σs ' + cw.sigma);
  assert.ok(Math.abs(cw.wk - 0.0663) < 0.002, 'wk ' + cw.wk);
  // Querkraft: Längsbewehrung aus asForShear erfüllt vRd,c ≥ vEd genau
  const m30 = { fck: 30 }, asV = BP.calc.asForShear(180, 0.34, m30);
  assert.ok(asV > 0 && Math.abs(BP.calc.shearCheck(180, 0.34, asV, m30).eta - 1) < 0.001);
  assert.equal(BP.calc.asForShear(50, 0.34, m30), 0); // vRd,c,min reicht
  assert.equal(BP.calc.asForShear(900, 0.34, m30), 0); // über 2 % – Nachweis meldet
  // Überlastete Bodenplatte: Meldung nennt eine Dicke, mit der die Rechnung aufgeht
  const p = fresh(); p.use.surface = 'lkw'; const ql = BP.calc.run(p, NOFE), fl = ql.struct.floor;
  assert.ok(fl.shear.eta > 1 && fl.hReq > p.build.tFloor && isFinite(fl.hReq));
  assert.ok(ql.checks.some((c) => c.level === 'err' && new RegExp('Bodenplatte ≥ ' + Math.round(fl.hReq * 100) + ' cm').test(c.text)));
  p.build.tFloor = fl.hReq; const qf = BP.calc.run(p, NOFE);
  assert.ok(qf.struct.floor.shear.eta <= 1 && !qf.struct.floor.fail && !qf.struct.floor.crackFail, 'mit ' + fl.hReq + ' m: η ' + qf.struct.floor.shear.eta);
});
test('Statik (Tafelverfahren): Flur neben Raum, schmale Streifen, schräge Wand, Luftstoß-Dickenhinweis', () => {
  const box = (W, D, walls) => { const p = fresh(); p.geom.outline = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }]; p.geom.walls = walls; p.geom.openings = []; p.geom.access = []; p.geom.rooms = []; p.routes = []; return p; };
  // Raum 6 m + Flur 1,5 m (lichte Weiten): FE mit Achsmaßen 6,0/1,5 m liefert Wandlast 5,46·p, Stützmoment 2,05·p
  const tw = 0.35, W = tw + 6 + 0.25 + 1.5 + tw, D = 6 + 2 * tw;
  const qc = BP.calc.run(box(W, D, [{ id: 'w1', a: { x: tw + 6.125, y: tw }, b: { x: tw + 6.125, y: D - tw }, t: 0.25, kind: 'stb' }]), NOFE);
  const fc = qc.struct.roof.field;
  assert.ok(fc.vWall >= 5.46 && fc.vWall <= 6.6, 'Wandlast ' + fc.vWall);
  assert.ok(fc.ax.x.msIn >= 2.05 && fc.ax.x.msIn <= 2.8, 'Stützmoment ' + fc.ax.x.msIn);
  // Wand 1 cm vor der Außenwand: Streifen gilt als massiv, keine Scheinüberlastung
  const pn = fresh(); pn.geom.walls.push({ id: 'w9', a: { x: 0.485, y: 0.35 }, b: { x: 0.485, y: 6.15 }, t: 0.25, kind: 'stb' });
  const qn = BP.calc.run(pn, NOFE);
  assert.ok(qn.struct.roof.shear.eta < 0.9 && qn.struct.floor.shear.eta < 1.05, 'Streifen: ' + qn.struct.roof.shear.eta + ' / ' + qn.struct.floor.shear.eta);
  // Schräge Wand (Treppenraster): endliche, plausible Werte in vertretbarer Zeit
  const pd = box(14, 9, [{ id: 'w1', a: { x: 7, y: 0.35 }, b: { x: 7, y: 8.65 }, t: 0.25, kind: 'stb' }, { id: 'w2', a: { x: 7.2, y: 1 }, b: { x: 13, y: 8 }, t: 0.25, kind: 'stb' }]);
  const t0 = Date.now(), qd = BP.calc.run(pd, NOFE);
  assert.ok(Date.now() - t0 < 4000, 'Rechenzeit ' + (Date.now() - t0));
  assert.ok(Number.isFinite(qd.struct.roof.shear.vEd) && qd.struct.roof.shear.eta < 1.1, 'schräge Wand η ' + qd.struct.roof.shear.eta);
  // Luftstoß zu groß für die Decke: genannte Dicke reicht dann auch wirklich
  const pb = fresh(); pb.hazard.blast = 'eigen'; pb.hazard.qk = 1500;
  const qb = BP.calc.run(pb, NOFE), hb = qb.struct.roof.hReq;
  assert.ok(hb > pb.build.tRoof && isFinite(hb));
  assert.ok(qb.checks.some((c) => c.level === 'err' && new RegExp('Decke ≥ ' + Math.round(hb * 100) + ' cm').test(c.text)));
  pb.build.tRoof = hb; const qb2 = BP.calc.run(pb, NOFE);
  assert.equal(qb2.checks.filter((c) => c.level === 'err' && /^Decke/.test(c.text)).length, 0, qb2.checks.filter((c) => c.level === 'err').map((c) => c.text).join('; '));
  // Außenwand waagerecht: Randmoment an Wandecken 0,125·p·l²
  const w = qc.struct.wall; assert.ok(Math.abs(w.moments.mH - 0.125 * Math.max(w.p1, w.p2) * w.L * w.L) < 1e-9);
});
test('FE-Platte: Timoshenko-Platten, Standarddecke gegen unabhängige FE-Rechnung, Gleichgewicht der Bodenplatte', () => {
  const FE = BP.fe;
  const plate = (a, b, clamped) => {
    const dom = [{ x: 0, y: 0 }, { x: a, y: 0 }, { x: a, y: b }, { x: 0, y: b }];
    const nIn = [{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }];
    const lines = [0, 1, 2, 3].map((i) => ({ a: dom[i], b: dom[(i + 1) % 4], kind: 'fix', kRot: clamped ? 1e12 : 0, nIn: nIn[i] }));
    const sol = FE.solve({ domain: dom, meshSize: 0.05, E: 30e6, nu: 0.3, h: 0.05, lines, cases: [{ q: 1 }] });
    const f = FE.elemForces(sol, sol.results[0].U), m = sol.mesh, mx = FE.recover(m, f.mx);
    const near = (x, y) => { let best = 0, bd = Infinity; for (let k = 0; k < m.nNodes; k++) { const d = Math.hypot(m.nodeX[k] - x, m.nodeY[k] - y); if (d < bd) { bd = d; best = k; } } return best; };
    let R = 0; for (const k of sol.supNodes) R += sol.results[0].R[k];
    return { center: mx[near(a / 2, b / 2)], edge: mx[near(0, b / 2)], R };
  };
  const ss = plate(1, 1, false), cl = plate(1, 1, true), cl2 = plate(1, 2, true);
  assert.ok(Math.abs(ss.center / 0.0479 - 1) < 0.03, 'gelenkig ' + ss.center);
  assert.ok(Math.abs(cl.center / 0.0231 - 1) < 0.03 && Math.abs(cl.edge / -0.0513 - 1) < 0.05, 'eingespannt ' + cl.center + ' / ' + cl.edge);
  assert.ok(Math.abs(cl2.edge / -0.0829 - 1) < 0.03, 'eingespannt 1×2 ' + cl2.edge);
  assert.ok(Math.abs(ss.R - 1) < 1e-6);
  // Standarddecke wie die unabhängige Mindlin-FE (Achsen, außen gelenkig, Innenwand x = 6,5): Feld 73,7, Wandlast 273 kN/m
  const x0 = 0.175, x1 = 9.825, y0 = 0.175, y1 = 6.325, dom = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const lines = [0, 1, 2, 3].map((i) => ({ a: dom[i], b: dom[(i + 1) % 4], kind: 'fix' })).concat([{ a: { x: 6.5, y: y0 }, b: { x: 6.5, y: y1 }, kind: 'fix' }]);
  const sol = FE.solve({ domain: dom, keyX: [6.5], meshSize: 0.2, E: 30e6, nu: 0.2, h: 0.4, lines, cases: [{ q: 45.975 }] });
  const f = FE.elemForces(sol, sol.results[0].U), m = sol.mesh, mx = FE.recover(m, f.mx);
  let field = 0, wall = 0;
  for (let k = 0; k < m.nNodes; k++) if (m.nodeX[k] < 6.5) field = Math.max(field, mx[k]);
  for (const k of sol.supNodes) if (Math.abs(m.nodeX[k] - 6.5) < 1e-6) { const J = m.nodeIJ[2 * k + 1]; wall = Math.max(wall, sol.results[0].R[k] / ((m.ys[Math.min(J + 1, m.ys.length - 1)] - m.ys[Math.max(J - 1, 0)]) / 2)); }
  assert.ok(Math.abs(field / 73.7 - 1) < 0.03 && Math.abs(wall / 273.2 - 1) < 0.02, 'Feld ' + field + ', Wandlast ' + wall);
  // Standardprojekt mit FE: trägt, Bodenpressung im Mittel = Lasten / Fläche, Stahl nicht mehr als im Tafelverfahren
  const q = BP.calc.run(fresh()), qt = BP.calc.run(fresh(), NOFE), st = q.struct;
  assert.equal(st.roof.method, 'FE'); assert.equal(st.floor.method, 'FE');
  assert.equal(q.checks.filter((c) => c.level === 'err' && c.step === 'statik').length, 0, q.checks.filter((c) => c.level === 'err').map((c) => c.text).join('; '));
  const jf = st.fe.jobs.floor, direct = 1.35 * 25 * fresh().build.tFloor * q.geo.Aslab + 1.5 * fresh().use.interiorQ * q.geo.Ain;
  assert.ok(Math.abs(st.floor.soil.pMean * q.geo.Aslab / (jf.combos.uls[0].sup + direct) - 1) < 0.03, 'Bodenpressung ' + st.floor.soil.pMean);
  assert.ok(q.steel.total <= qt.steel.total + 1e-6, 'Stahl FE ' + q.steel.total + ' / Tafel ' + qt.steel.total);
  // Rahmenecke aus FE in der Wandbemessung, Innenwandlast aus FE-Auflagerkräften
  assert.ok(Math.abs(st.wall.moments.mJTop - st.fe.roof.mJ) < 1e-9 && st.fe.roof.mJ > 30);
  assert.ok(st.intWalls[0].nEd > 200 && st.intWalls[0].nEd < 400, 'Innenwand ' + st.intWalls[0].nEd);
});
/* Projekt mit zwei Ebenen: 14 × 8 m, tragende Wand x = 7 auf beiden Ebenen, Innentreppe im Westteil */
function twoLevels(shiftLower) {
  const p = fresh();
  p.geom.outline = BP.model.shapeRect(14, 8);
  p.geom.walls = [
    { id: 'w1', a: { x: 7, y: 0.35 }, b: { x: 7, y: 7.65 }, t: 0.25, kind: 'stb' },
    { id: 'w2', a: { x: 7.125, y: 2.2 }, b: { x: 13.65, y: 2.2 }, t: 0.175, kind: 'mw' },
  ];
  p.geom.openings = [{ id: 'o1', host: 'w:w1', pos: 1.5, w: 0.9, h: 2.0, sill: 0, kind: 'innen' }];
  p.geom.rooms = [{ id: 'r1', name: 'Aufenthalt', x: 3, y: 5 }, { id: 'r2', name: 'Schleuse', x: 10, y: 1.2 }];
  p.levels = [{ id: 'lv2', name: 'Lager', clearHeight: 2.6, tSlab: 0.3, walls: [{ id: 'w2a', a: { x: shiftLower ? 5 : 7, y: 0.35 }, b: { x: shiftLower ? 5 : 7, y: 7.65 }, t: 0.25, kind: 'stb' }],
    openings: [{ id: 'o2a', host: 'w:w2a', pos: 5, w: 1.0, h: 2.0, sill: 0, kind: 'innen' }], rooms: [{ id: 'r2a', name: 'Lager West', x: 3, y: 5 }], columns: [], zones: [] }];
  p.geom.verts = [{ id: 'v1', kind: 'treppe', x: 1.3, y: 1.5, dir: 0, w: 1.0, upper: 0, landing: 0.8 }];
  return BP.model.normalize(JSON.parse(JSON.stringify(p)));
}
test('Mehrere Ebenen: Höhen, Außenwand über alle Ebenen, Zwischendecke mit Lasten von oben, Mengen, Ablauf, Prüfungen', () => {
  const p = twoLevels(false), q = BP.calc.run(p), st = q.struct, lv = q.lv, L = q.geo.L;
  // Höhen: Decke, Ebene 1, Zwischendecke 30 cm, Ebene 2
  assert.equal(lv.levels.length, 2); assert.ok(Math.abs(lv.Hint - 5.3) < 1e-9);
  assert.ok(Math.abs(lv.zEntry - (lv.zCeil - 2.4)) < 1e-9 && Math.abs(lv.zFloorTop - (lv.zCeil - 5.3)) < 1e-9);
  assert.ok(Math.abs(q.geo.access[0].nr * q.geo.access[0].rise + lv.zEntry) < 1e-9, 'Treppenabgang endet auf Ebene 1');
  // Außenwand als Durchlaufträger über die Zwischendecke: Stützweiten Achse–Achse
  assert.deepEqual(st.wall.spans.map((x) => +x.toFixed(4)), [2.75, 2.95]);
  assert.ok(st.wall.moments.mMid > 0);
  // Zwischendecke: FE, Lasten der Ebene darüber (Wand w1 mit Auflagerkraft aus der Decke), Gleichgewicht
  assert.equal(st.mids.length, 1); const m = st.mids[0];
  assert.equal(m.method, 'FE'); assert.equal(m.name, 'Zwischendecke über Ebene 2'); assert.equal(m.layers.length, 4);
  const job = st.fe.jobs.mids[0], rRoof = st.fe.roof.reactCase.lines.filter((l) => l.id === 'w1');
  const gW = rRoof.reduce((s, l) => s + l.g, 0), lenW = rRoof.reduce((s, l) => s + l.len, 0);
  const lw = job.cases[0].lineLoads.filter((x) => Math.abs(x.a.x - 7) < 1e-6);
  assert.ok(lw.length && Math.abs(lw[0].q - (25 * 0.25 * 2.4 + gW / lenW)) < 1e-6, 'Wandlast auf Zwischendecke ' + (lw[0] && lw[0].q));
  const area = BP.geo.area(job.domain) - job.holes.reduce((s, h) => s + BP.geo.area(h), 0);
  const applied = job.cases[0].q * area + job.cases[0].lineLoads.reduce((s, x) => s + x.q * BP.geo.dist(x.a, x.b), 0) + job.cases[0].points.reduce((s, x) => s + x.P, 0);
  const reacted = m.fe.reactCase.lines.reduce((s, l) => s + l.g, 0) + m.fe.reactCase.areas.reduce((s, a) => s + a.g, 0);
  assert.ok(Math.abs(reacted / applied - 1) < 0.02, 'Gleichgewicht Zwischendecke ' + reacted + ' / ' + applied);
  assert.ok(st.intWalls.some((w) => w.id === 'w2a' && w.level === 1 && w.nEd > st.intWalls.find((x) => x.id === 'w1').nEd), 'untere Wand trägt mehr');
  // Treppe: Treppenauge in der Zwischendecke, Steigungsverhältnis, Mengen
  const sv = q.geo.vert.stairs[0];
  assert.equal(sv.nr, 17); assert.ok(sv.rise <= 0.18 + 1e-9 && Math.abs(2 * sv.rise + sv.tread - 0.63) < 0.03);
  assert.ok(q.geo.mids[0].holes > 1 && Math.abs(q.vol.mids - (q.geo.Ain - q.geo.mids[0].holes) * 0.3) < 1e-9);
  assert.ok(q.vol.stairs > 1 && q.bom.items.some((i) => /Zwischendecke über Ebene 2/.test(i.name)) && q.bom.items.some((i) => /Innentreppen/.test(i.name)));
  assert.ok(Math.abs(q.geo.tot.Anet - L[0].Anet - L[1].Anet) < 1e-9);
  // Ablauf: Wände unten, Zwischendecke, Wände oben, Decke
  const B = q.schedule.byId;
  assert.ok(B.w_b.end <= B.zd1.start && B.zd1_b.end <= B.w0.start && B.w0_b.end <= B.d.start);
  // Prüfungen: Treppe und Erreichbarkeit in Ordnung, keine Abfangung
  const txt = q.checks.map((c) => c.text).join(' | ');
  assert.ok(!/Innentreppe 1|nicht erreichbar|keine Innentreppe|steht nicht über/.test(txt), txt);
});
test('Mehrere Ebenen: Abfangung, fehlende Treppe, Wand im Treppenlauf, Leitungen in die untere Ebene', () => {
  // 7,3 m tiefe Baugrube in Sand: DIN 4124 verlangt den Nachweis, 45° hält rechnerisch nicht – mit 26° geböscht
  const pa = twoLevels(false); pa.build.excavation.angle = 26;
  const a = BP.calc.run(pa), b = twoLevels(true), qb = BP.calc.run(b);
  const a45 = BP.calc.run(twoLevels(false), NOFE).checks.find((c) => /Baugrubenböschung 45° bei 7,30 m Tiefe nicht standsicher.*Höchstens 26°/.test(c.text));
  assert.ok(a45 && a45.level === 'err');
  assert.ok(qb.checks.some((c) => /Innenwand 1 \(E1\) steht nicht über einer tragenden Wand/.test(c.text)));
  assert.ok(qb.struct.mids[0].moments.mFx > a.struct.mids[0].moments.mFx);
  b.geom.verts = []; let q = BP.calc.run(b, NOFE);
  assert.ok(q.checks.some((c) => c.level === 'err' && /Ebene 2 „Lager“ ist über keine Innentreppe erreichbar/.test(c.text)));
  const c = twoLevels(false); c.levels[0].walls.push({ id: 'wx', a: { x: 4, y: 0.35 }, b: { x: 4, y: 3 }, t: 0.175, kind: 'mw' });
  q = BP.calc.run(c, NOFE);
  assert.ok(q.checks.some((x) => x.level === 'err' && /Innenwand 2 \(E2\) steht im Treppenlauf/.test(x.text)));
  // Leitung mit negativer Höhe führt durch die Zwischendecke in Ebene 2 (keine Hüllendurchführung)
  const d = twoLevels(false); d.routes = [{ id: 'l1', type: 'kabel', kind: 'strom', name: 'Kabel', shape: 'rechteck', d: 0.1, w: 0.1, hgt: 0.06, ins: 0, clr: 0, airflow: null, reserve: 10, cable: '', pts: [{ x: 10, y: 6, h: 2.2 }, { x: 10, y: 6, h: -1.0 }] }];
  q = BP.calc.run(BP.model.normalize(d), NOFE);
  const r = q.routes.list[0];
  assert.ok(r.pens.some((x) => x.type === 'zwischendecke') && q.routes.hull === 0 && q.routes.inner === 1, JSON.stringify(r.pens) + r.issues.map((i) => i.text));
  assert.ok(!r.issues.some((i) => i.level === 'warn'), r.issues.map((i) => i.text).join());
  assert.ok(a.summary.etaMax < 1.0 && a.summary.errors === 0, 'Zweiebenen-Projekt hält ' + a.summary.etaMax);
});
function hall(extra) {
  const p = fresh();
  p.geom.outline = BP.model.shapeRect(16, 12);
  p.geom.walls = []; p.geom.openings = []; p.geom.rooms = [{ id: 'r1', name: 'Halle', x: 8, y: 3 }]; p.routes = [];
  p.geom.access = [{ id: 'a1', kind: 'treppe', edge: 0, pos: 8, width: 1.0, tw: 0.25, cover: 'klappe', landing: 1.2 }, { id: 'a2', kind: 'schacht', edge: 2, pos: 8, width: 0.8, depth: 0.8, tw: 0.25, lw: 0.6, lh: 0.8 }];
  Object.assign(p.geom, extra || {});
  return BP.model.normalize(JSON.parse(JSON.stringify(p)));
}
test('Stützen: Querschnittstragfähigkeit, Theorie II. Ordnung, Durchstanzen nach EC2/NA DE, Durchlaufträger', () => {
  const C = BP.calc, mat = { fck: 30, fcd: 0.85 * 30 / 1.5, fyd: 500 / 1.15, fctm: 2.9, Ecm: 33000 };
  // Rechteckquerschnitt 40/40, 2 × 3 Ø20, d1 = 6 cm: zentrischer Druck und reine Biegung gegen unabhängige Gleichgewichtsrechnung
  const As = 6 * Math.PI * 4, sec = C.colSection(0.4, 0.4, As, 0.06, mat);
  assert.ok(Math.abs(sec.N0 - (0.16 * mat.fcd * 1000 + As * 1e-4 * 400e3)) < 1e-6);
  let lo = 1e-4, hi = 0.5; const a2 = As / 2 * 1e-4, sig = (e) => Math.max(-mat.fyd * 1000, Math.min(mat.fyd * 1000, 200e6 * e));
  // Parabel-Rechteck-Diagramm: Völligkeit αR = 17/21, Schwerpunktabstand ka = 99/238 (εc2 = 2 ‰, εcu2 = 3,5 ‰)
  const Nx = (x) => 17 / 21 * x * 0.4 * mat.fcd * 1000 + a2 * sig(0.0035 * (x - 0.06) / x) + a2 * sig(0.0035 * (x - 0.34) / x);
  for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (Nx(m) < 0) lo = m; else hi = m; }
  const x = lo, M0 = 17 / 21 * x * 0.4 * mat.fcd * 1000 * (0.2 - 99 / 238 * x) + a2 * sig(0.0035 * (x - 0.06) / x) * 0.14 - a2 * sig(0.0035 * (x - 0.34) / x) * 0.14;
  assert.ok(Math.abs(sec.mRd(0) / M0 - 1) < 1e-3, 'MRd(0) ' + sec.mRd(0) + ' / ' + M0);
  assert.ok(sec.mRd(1500) > sec.mRd(0) && sec.mRd(sec.N0 * 0.999) < 0.02 * sec.mRd(1500));
  // schlanke Stütze 30/30, l0 = 4,5 m: λ = 52 > λlim → Nennkrümmung; gedrungen 40/40, l0 = 2,8 m: ohne
  const d1 = C.columnDesign({ bx: 0.3, by: 0.3 }, 800, 4.5, mat), d2 = C.columnDesign({ bx: 0.4, by: 0.4 }, 800, 2.8, mat);
  assert.ok(d1.second && d1.dirs[0].e2 > 0.01 && !d2.second && d2.dirs[0].e2 === 0, JSON.stringify([d1.lam, d1.lamLim, d2.lam]));
  assert.ok(d1.As > d2.As && d1.eta <= 1 && d2.As >= Math.max(0.15 * 800 / (mat.fyd * 1000) * 1e4, 0.002 * 0.16 * 1e4) - 1e-9);
  // Durchstanzen Innenstütze 45/45, d = 25 cm, ρ = 0,8 %: vRd,c = 0,12·k·(100ρ fck)^⅓, u1 = 4·0,45 + 4π·0,25, β = 1,10
  const pl = { layers: [{ face: 'oben', dir: 'x', d: 0.25, prov: 20 }, { face: 'oben', dir: 'y', d: 0.25, prov: 20 }] };
  const k = 1 + Math.sqrt(200 / 250), vrd = 0.12 * k * Math.pow(100 * 0.008 * 30, 1 / 3), u1 = 1.8 + Math.PI;
  const V = vrd * u1 * 0.25 * 1000 / 1.1, pu = C.punching(pl, { x: 0, y: 0, bx: 0.45, by: 0.45 }, V, mat);
  assert.ok(Math.abs(pu.vRdc - vrd) < 1e-9 && Math.abs(pu.u1 - u1) < 1e-9 && Math.abs(pu.etaC - 1) < 1e-9 && !pu.needs);
  const pu2 = C.punching(pl, { x: 0, y: 0, bx: 0.45, by: 0.45 }, 1.3 * V, mat), pu3 = C.punching(pl, { x: 0, y: 0, bx: 0.45, by: 0.45 }, 1.5 * V, mat);
  assert.ok(pu2.needs && !pu2.fail && pu2.links.rows >= 2 && pu2.links.row1 > pu2.links.row2 && pu3.fail);
});
test('Stützen automatisch: Halle 16 × 12 m, Bereich ohne Stützen, Nachweise danach erfüllt, Gleichgewicht mit Unterzug', () => {
  const p0 = hall({ zones: [{ id: 'z1', x0: 2, y0: 2, x1: 6, y1: 5, name: 'Lager' }] }), q0 = BP.calc.run(p0);
  assert.ok(q0.struct.roof.defl.eta > 1, 'ohne Stützen zu weich gespannt');
  const ac = BP.calc.autoColumns(p0, q0);
  assert.ok(ac.levels[0].length >= 4 && ac.levels[0].every((c) => c.auto && !(c.x > 2 && c.x < 6 && c.y > 2 && c.y < 5)), JSON.stringify(ac.levels[0]));
  p0.geom.columns = ac.levels[0];
  const q1 = BP.calc.run(p0), st = q1.struct;
  assert.equal(st.columns.length, ac.levels[0].length);
  assert.ok(st.roof.eta <= 1 && st.columns.every((c) => c.eta <= 1 && c.fromFE && c.punch && !c.punch.fail), st.columns.map((c) => c.eta).join());
  assert.equal(q1.checks.filter((c) => c.level === 'err').length, 0, q1.checks.filter((c) => c.level === 'err').map((c) => c.text).join('; '));
  // Unterzug mit zwei Stützen: Plattengleichgewicht, Auflagerkräfte an die Stützen, Durchlaufträger
  const p2 = hall({ beams: [{ id: 'b1', a: { x: 0.35, y: 6 }, b: { x: 15.65, y: 6 }, bw: 0.4, hb: 0.6 }], columns: [{ id: 'c1', x: 5.45, y: 6, bx: 0.45, by: 0.45 }, { id: 'c2', x: 10.55, y: 6, bx: 0.45, by: 0.45 }] });
  const q2 = BP.calc.run(p2), s2 = q2.struct, rc = s2.roof.fe.reactCase;
  const gSum = rc.lines.reduce((a, l) => a + l.g, 0) + rc.areas.reduce((a, l) => a + l.g, 0);
  assert.ok(Math.abs(gSum / (s2.roof.gk * q2.geo.A) - 1) < 1e-6, 'Gleichgewicht ' + gSum);
  const bd = s2.beams[0];
  assert.deepEqual(bd.sups.map((x) => x.kind), ['aussen', 'stuetze', 'stuetze', 'aussen']);
  assert.ok(Math.abs(bd.sups.reduce((a, x) => a + x.Rg, 0) - bd.gk * bd.L) < 1e-3 * bd.gk * bd.L, 'Balkengleichgewicht');
  assert.ok(s2.columns.every((c) => Math.abs(c.fromBeams - bd.sups.find((x) => x.id === c.id).Rd) < 1e-9 && c.nEd > c.fromBeams));
  assert.ok(q2.steel.items.some((i) => /Unterzug 1: unten/.test(i.label)) && q2.vol.beams > 3);
});
test('Aufzüge: Kabine nach EN 81-20, Schacht über zwei Ebenen, Grube, Schachtkopf, Leistung, Kosten, Schutzhülle', () => {
  const Lf = BP.lifts;
  assert.equal(Lf.maxArea(630), 1.66); assert.equal(Lf.maxArea(1000), 2.40); assert.ok(Math.abs(Lf.maxArea(700) - 1.80) < 1e-9);
  assert.equal(Lf.minLoad(2.40), 1000); assert.equal(Lf.minLoad(3.36), 1500);
  const p = twoLevels(false); p.build.cover = 1.5;
  p.geom.verts.push({ id: 'L1', kind: 'aufzug', x: 10.5, y: 5.4, dir: 270, type: 'lasten', payload: 1000, w: 1.1, d: 2.1, door: 1.0, drive: 'seil', speed: 0.5, top: 0, bottom: 1, tw: 0.25 });
  const q = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p)))), v = q.geo.vert.lifts[0], d = v.design;
  assert.ok(d.areaOk && Math.abs(v.wIn - 1.6) < 1e-9 && Math.abs(v.dIn - 2.4) < 1e-9);
  assert.ok(q.geo.L.every((L) => L.walls.filter((w) => w.auto === 'L1').length === 4 && L.openings.some((o) => o.lift === 'L1')), 'Schachtwände und Türen je Ebene');
  assert.ok(Math.abs(q.geo.mids[0].holes - (q.geo.vert.stairs[0] ? BP.geo.area(q.geo.vert.stairs[0].hole) : 0) - v.wIn * v.dIn) < 1e-6, 'Zwischendecke ausgespart');
  assert.ok(v.roofBox && Math.abs(v.headOver - (d.head - 2.4)) < 1e-9 && q.struct.fe.jobs.roof.holes.length === 1, 'Schachtkopf über der Decke');
  assert.ok(Math.abs(d.travel - 2.9) < 1e-9 && d.pit >= 1.0 && q.earth.Vlift > 0 && q.vol.lifts > 0);
  assert.ok(Math.abs(d.P - 0.5 * 1000 * 9.81 * 0.5 / 0.75 / 1000) < 1e-9 && q.tech.generator >= Math.ceil(q.tech.liftStart));
  assert.ok(q.bom.items.some((i) => i.key === 'aufzug' && i.cost > 50000) && q.bom.items.some((i) => i.key === 'aufzug_pruef'));
  const tx = q.checks.filter((c) => c.ref && c.ref.id === 'L1');
  assert.ok(!tx.some((c) => c.level === 'err'), tx.map((c) => c.text).join(' | '));
  // zu große Kabine, Schachtkopf durch die Erdüberdeckung, Aufzug zum Gelände mit Schutztüren
  p.build.cover = 1.0; p.geom.verts[1].d = 2.6;
  let q2 = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p))), NOFE);
  assert.ok(q2.checks.some((c) => c.level === 'err' && /für 1000 kg zu groß.*1250 kg/.test(c.text)) && q2.checks.some((c) => c.level === 'err' && /durchstößt die Erdüberdeckung/.test(c.text)));
  p.geom.verts[1].top = -1; p.geom.verts[1].d = 2.1;
  q2 = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p))), NOFE);
  assert.ok(q2.geo.vert.lifts[0].toSurface && q2.checks.some((c) => c.level === 'warn' && /durchstößt die Schutzhülle/.test(c.text)));
  assert.ok(q2.bom.items.some((i) => i.key === 'schutztuer' && i.qty === 2 && /Schachttür/.test(i.name)));
});
test('Biegeliste: Positionen, Stablängen ≤ 12 m mit Stoß, Summen, BVBS-Prüfsummen, CSV und Bewehrungspläne', () => {
  const p = twoLevels(false);
  p.geom.columns = [{ id: 'c1', x: 10.4, y: 5.4, bx: 0.3, by: 0.3 }];
  p.levels[0].columns = [{ id: 'c2', x: 10.4, y: 5.4, bx: 0.35, by: 0.35 }];
  p.geom.beams = [{ id: 'b1', a: { x: 7.125, y: 5.4 }, b: { x: 13.65, y: 5.4 }, bw: 0.3, hb: 0.4 }];
  const q = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p)))), sch = q.steel.schedule, R = BP.rebar;
  assert.ok(sch && sch.positions.length > 40);
  // eindeutige Positionen, Einzellänge = Summe der Schenkel, keine Lagerlänge über 12 m, Masse = n · l · 0,00617 Ø²
  assert.equal(new Set(sch.positions.map((r) => r.pos)).size, sch.positions.length);
  for (const r of sch.positions) {
    assert.ok(r.n > 0 && r.L > 0.05 && r.L <= 12 + 1e-9, r.pos + ' ' + r.L);
    assert.ok(Math.abs(r.L - r.shape.legs.reduce((s, x) => s + x, 0)) < 1e-9 && Math.abs(r.kg - r.n * r.L * 0.00617 * r.phi * r.phi) < 1e-9);
  }
  const sum = sch.positions.reduce((s, r) => s + r.kg, 0);
  assert.ok(Math.abs(sum - sch.total) < 1e-6 && Math.abs(sch.byEl.reduce((s, e) => s + e.kg, 0) - sum) < 1e-6 && Math.abs(Object.values(sch.byDia).reduce((s, x) => s + x, 0) - sum) < 1e-6);
  // Mengen der Kalkulation = Biegeliste + Ansätze (Zugänge, Aufzugsgruben)
  assert.ok(Math.abs(q.steel.net - sum - sch.approx.reduce((s, a) => s + a.kg, 0)) < 1e-6);
  assert.ok(sch.total > 0.8 * q.steel.takeoffNet && sch.total < 1.6 * q.steel.takeoffNet, 'Biegeliste ' + sch.total.toFixed(0) + ' kg gegen Auszug ' + q.steel.takeoffNet.toFixed(0) + ' kg');
  // jedes Bauteil ist vertreten, Stäbe über 12 m werden gestoßen (Decke 14 m: zwei Stäbe mit Übergreifung)
  for (const el of ['Decke', 'Zwischendecke über Ebene 2', 'Bodenplatte', 'Außenwände', 'Stützen', 'Unterzüge']) assert.ok(sch.byEl.some((e) => e.el === el), el);
  const dx = sch.positions.find((r) => r.el === 'Decke' && /Grundbewehrung unten, Richtung x/.test(r.label));
  assert.ok(dx && Math.abs(2 * dx.L - dx.lap - (14 - 2 * p.build.cnom)) < 0.05, 'Stoß ' + (dx && dx.L));
  assert.ok(R.pieces(13.92, 0.6).length === 2 && R.pieces(11.9, 0.6).length === 1 && R.pieces(30, 0.8).length === 3);
  // BVBS: Prüfsumme nach Richtlinie, jede Zeile gültig
  assert.equal(R.checksum('abcde@C'), 78);
  const abs = R.bvbs(sch, { project: 'Prüfbunker Süd', index: 'a' }).trim().split('\r\n');
  assert.equal(abs.length, sch.positions.length);
  for (const l of abs) {
    const m = /^(BF2D@.*@C)(\d+)@$/.exec(l);
    assert.ok(m && R.checksum(m[1]) === +m[2] && /^[\x20-\x7e]+$/.test(l), l);
  }
  assert.ok(abs[0].startsWith('BF2D@HjPruefbunker Sued@rD@ia@pD01@'), abs[0]);
  // CSV: Kopf, Positionen, Summen
  const csv = R.csv(sch, (v) => '"' + String(v).replace(/"/g, '""') + '"').split('\r\n');
  assert.equal(csv.length, 1 + sch.positions.length + 1 + sch.byEl.length + 1 + sch.approx.length);
  // Pläne: je Platte untere und obere Lage, Außenwände, Stützen und Unterzüge; Positionen beschriftet
  const sh = R.sheets(q, sch, { project: 'Prüfbunker', concrete: 'C30/37', cnom: p.build.cnom, date: '15.10.2026' });
  assert.equal(sh.length, 2 * 3 + 3 + 2);
  // Detailblätter: Rahmenecke, Wand–Sohle, Durchführung, Öffnung, Unterstützungen mit Werten der Bemessung
  const d1 = sh[9].svg, d2 = sh[10].svg, vo = q.struct.wall.layers.find((l) => l.key === 'vo');
  assert.ok(/D1 Rahmenecke/.test(d1) && /D2 Außenwand – Bodenplatte/.test(d1) && /D3 Durchführung/.test(d1) && /Verlegereihenfolge/.test(d1));
  assert.ok(d1.includes('Wand außen Ø' + vo.phi + '/') && d1.includes(BP.calc.fmt(BP.calc.lapLength(vo.phi, q.mat, true), 2).replace('.', ',')));
  assert.ok(/D4 Öffnung/.test(d2) && /D5 Unterstützungen/.test(d2) && /Zwischendecke über Ebene 2/.test(d2));
  sh.forEach((s, i) => assert.ok(s.svg.startsWith('<svg') && s.svg.includes('BWP-' + String(i + 1).padStart(2, '0')) && !/NaN|undefined/.test(s.svg), s.title));
  assert.ok(sch.positions.filter((r) => r.el === 'Decke' && /Grundbewehrung/.test(r.label)).every((r) => sh[0].svg.includes(r.pos) || sh[1].svg.includes(r.pos)));
  assert.ok(sh[6].svg.includes('Kante 1') && sh[7].svg.includes(q.geo.labels['c:c1']) && sh[8].svg.includes('Innenwand 1') && sh[8].svg.includes('Innentreppe'));
  // Außenwand: lotrechte Stäbe ohne doppelte Übergreifung (Länge = lichte Höhe + Decke − c), Rahmenecke mit langem Schenkel und Biegerolle 15 Ø
  const wv = sch.positions.find((r) => r.el === 'Außenwände' && r.label === 'Vertikal außen');
  assert.ok(wv && Math.abs(wv.shape.legs[0] - Math.round((q.lv.Hint + p.build.tRoof - p.build.cnom) * 20) / 20) < 1e-9 && wv.shape.legs[1] >= 0.5 && wv.mandrel === 15 * wv.phi);
  // Stütze: Anschlussstäbe aus der Platte darunter
  assert.ok(sch.positions.some((r) => r.el === 'Stützen' && /Anschlussstäbe/.test(r.label)));
});
test('Weitere Nachweise: Grundbruch, Setzung, Böschungen, Feuerwiderstand, Treppe, Durchstanzen an Öffnungen, Fugen', () => {
  const V = BP.verify;
  // DIN 4017: Tragfähigkeitsbeiwerte φ = 30°; Streifen b = 2 m, d = 1 m, γ = 19: Rn,k ≈ 1463 kN/m
  const F30 = V.bearingFactors(30);
  assert.ok(Math.abs(F30.Nd - 18.40) < 0.01 && Math.abs(F30.Nb - 10.05) < 0.01 && Math.abs(F30.Nc - 30.14) < 0.01);
  const gb = V.grundbruch({ a: 1000, b: 2, d: 1, gamma1: 19, gamma2: 19, phi: 30, c: 0, Vd: 1 });
  assert.ok(Math.abs(gb.Rnk / 1000 - (19 * 2 * F30.Nb * (1 - 0.3 * 2 / 1000) + 19 * 1 * F30.Nd * (1 + 2 / 1000 * 0.5)) * 2) < 1e-6);
  // Steinbrenner: Ecke eines Quadrats bei z = b: i = 0,1752; Setzung grob gegen Handrechnung
  assert.ok(Math.abs(V.cornerI(2, 2, 2) - 0.1752) < 1e-4 && Math.abs(V.cornerI(1, 3, 0) - 0.25) < 1e-12);
  const se = V.settlement({ A: 10, B: 10, D: 0, sigma: 100, gamma: 18, gammaB: 10, dw: Infinity, Es: 50 });
  assert.ok(se.s > 0.005 && se.s < 0.03 && se.sCenter > se.s && se.s > se.sCorner && se.ts > 5);
  // Böschung c = 0: kritisch ist die flache Gleitfläche (unendliche Böschung tan φd / tan β)
  const sl = V.slope({ ground: [[-20, 0], [0, 0], [10, 5], [30, 5]], upper: { gamma: 19, phi: 30, c: 0 }, lower: { gamma: 19, phi: 30, c: 0 }, toe: { x: 0, y: 0 }, crest: { x: 10, y: 5 } });
  const inf = Math.tan(30 * Math.PI / 180) / 1.25 / 0.5;
  assert.ok(sl.F >= inf - 0.01 && sl.F < inf + 0.05, 'Bishop ' + sl.F + ' gegen ' + inf);
  // Kohäsion erhöht die Sicherheit; Bauwerk als Sperre lässt keine Kreise durch
  const sl2 = V.slope({ ground: [[-20, 0], [0, 0], [10, 5], [30, 5]], upper: { gamma: 19, phi: 30, c: 5 }, lower: { gamma: 19, phi: 30, c: 5 }, toe: { x: 0, y: 0 }, crest: { x: 10, y: 5 } });
  assert.ok(sl2.F > sl.F + 0.3);
  // Feuerwiderstand Tab. 5.2a: R90, μfi = 0,7, b = 350 → a = 53 mm; b = 300 bei μfi = 0,6 zu klein; Zwischenwerte linear
  assert.deepEqual(V.colReq('R90', 0.7, 350), { a: 53, bMin: 350 });
  assert.equal(V.colReq('R90', 0.6, 300).a, null);
  assert.ok(Math.abs(V.colReq('R90', 0.35, 300).a - (25 + (45 - 25) * 0.5)) < 1e-9 && Math.abs(V.aFor(V.FIRE.beam.R90, 250) - 42.5) < 1e-9);
  // Treppenlaufplatte 4,3 m: Biegeschlankheit, Querkraft und Biegung eingehalten
  const tr = V.stair({ span: 4.3, rise: 0.181, tread: 0.268, q: 3, fck: 30, fctm: 2.9, cnom: 0.025 });
  assert.ok(tr.ok && tr.t >= 0.16 && tr.t <= 0.22 && tr.ld <= tr.ldLim + 1e-9 && tr.vEd <= tr.vRd && tr.asProv >= tr.asReq);
  // Projekt mit zwei Ebenen: Treppe bemessen und mit ihren Auflagerkräften in der Zwischendecke, Prüfung der Baugrube, Fugen
  const p = twoLevels(false); p.geom.columns = [{ id: 'c1', x: 8.2, y: 2.4, bx: 0.3, by: 0.3 }];
  const q = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p))), NOFE), s = q.geo.vert.stairs[0];
  assert.ok(s.design.ok && s.tWaist === s.design.t && Math.abs(s.reaction.g - s.design.gk * s.span / 2) < 1e-9);
  assert.ok(q.verify.gb.eta < 1 && q.verify.set.s < 0.03 && q.verify.exc && !q.verify.exc.din4124 && !q.verify.exc.ok && q.verify.exc.angleMax === 26);
  assert.ok(q.verify.fire.cls === 'R90' && q.verify.fire.items.some((i) => /Stütze/.test(i.el)) && q.verify.fire.items.some((i) => i.el === 'Zwischendecke über Ebene 2'));
  const po = q.verify.pours;
  assert.ok(po.sect.length === 2 + 1 + 2 && Math.abs(po.joints.total - po.joints.slab - po.joints.vert - po.joints.hor - po.joints.access) < 1e-9);
  assert.ok(q.bom.items.find((i) => i.key === 'fugenblech').qty === po.joints.total);
  // Durchstanzen: Öffnung 0,5 m neben der Stütze (≤ 6 d) – Rundschnitt zwischen den Tangenten unwirksam (EC2 Bild 6.14)
  const pl = { layers: [{ face: 'oben', dir: 'x', d: 0.25, prov: 10 }, { face: 'oben', dir: 'y', d: 0.24, prov: 10 }] }, col = { x: 0, y: 0, bx: 0.3, by: 0.3 };
  const pu0 = BP.calc.punching(pl, col, 400, q.mat), hole = BP.geo.polygonFromRect(0.65, -0.4, 1.45, 0.4);
  const pu1 = BP.calc.punching(pl, col, 400, q.mat, { holes: [hole] });
  const span = 2 * Math.atan(0.4 / 0.65) / (2 * Math.PI);
  assert.ok(pu1.openings === 1 && Math.abs(pu1.uLoss - span) < 0.01 && Math.abs(pu1.u1 / pu0.u1 - (1 - pu1.uLoss)) < 1e-9 && pu1.vEd > pu0.vEd, pu1.uLoss + ' ' + span);
  assert.equal(BP.calc.punching(pl, col, 400, q.mat, { holes: [BP.geo.polygonFromRect(3, -0.4, 3.8, 0.4)] }).openings, 0);
  // Erdhügel aus umgelagertem Schluff (ohne Kohäsion) 1 : 2 rutscht, 1 : 2,75 hält
  const m = fresh(); m.build.mound = { on: true, floorDepth: 1.0, crest: 1.0, slope: 2.0, fill: 'aushub' }; m.site.soil = 'schluff';
  const qm = BP.calc.run(BP.model.normalize(m), NOFE);
  assert.ok(!qm.verify.mound.ok && qm.verify.mound.nMin === 2.75 && qm.checks.some((c) => c.level === 'err' && /Erdhügels 1 : 2,0 nicht standsicher.*1 : 2,75/.test(c.text)));
  m.build.mound.slope = 2.75;
  assert.ok(BP.calc.run(BP.model.normalize(m), NOFE).verify.mound.ok);
  // Brandschutz: dünne Stütze mit kleiner Deckung fällt bei R120 durch
  const pf = JSON.parse(JSON.stringify(p)); pf.build.fireClass = 'R120';
  const qf = BP.calc.run(BP.model.normalize(pf), NOFE);
  assert.ok(qf.checks.some((c) => c.level === 'err' && /Feuerwiderstand R120.*Stütze/.test(c.text)));
});
test('Statische Berechnung: Positionen, Ergebnisse aus der Rechnung, Zusammenstellung, keine leeren Werte', () => {
  const p = twoLevels(false); p.build.excavation.angle = 26;
  p.geom.columns = [{ id: 'c1', x: 10.4, y: 5.4, bx: 0.35, by: 0.35 }];
  p.geom.beams = [{ id: 'b1', a: { x: 7.125, y: 5.4 }, b: { x: 13.65, y: 5.4 }, bw: 0.3, hb: 0.4 }];
  const q = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p)))), R = BP.statikReport;
  const rep = R.build(q, { project: 'Prüfbunker', date: '15.10.2026', index: 'a', version: 'v2' }), html = R.toHTML(rep);
  assert.ok(!/NaN|undefined|\[object/.test(html), (html.match(/.{80}(NaN|undefined).{40}/) || [''])[0]);
  const heads = rep.blocks.filter((b) => b.t === 'h').map((b) => b.text);
  for (const t of ['Pos. 1 – Decke', 'Pos. 2.1 – Zwischendecke über Ebene 2', 'Pos. 3 – Außenwände', 'Pos. 4 – Tragende Innenwände', 'Pos. 5 – Stützen', 'Pos. 6.1 – Unterzug 1', 'Pos. 7 – Bodenplatte', 'Pos. 8.1 – Innentreppe 1', 'Pos. 10 – Gründung', 'Pos. 11 – Böschungen', 'Pos. 12 – Feuerwiderstand', 'Zusammenstellung der Nachweise'])
    assert.ok(heads.some((h) => h.startsWith(t)), t);
  // Zusammenstellung übernimmt die Ausnutzungen der Rechnung
  const sm = (pos) => rep.summary.find((s) => s.pos === pos);
  assert.ok(Math.abs(sm('1').eta - q.struct.roof.etaS) < 1e-12 && Math.abs(sm('3').eta - q.struct.wall.etaS) < 1e-12 && Math.abs(sm('7').eta - q.struct.floor.etaS) < 1e-12);
  assert.ok(Math.abs(rep.summary.find((s) => s.el === 'Grundbruch').eta - q.verify.gb.eta) < 1e-12 && rep.summary.some((s) => s.pos === '5' && Math.abs(s.eta - Math.max(...q.struct.columns.map((c) => c.etaS))) < 1e-12));
  // Lasten der Decke: Summe gk und pEd
  assert.ok(html.includes(BP.calc.fmt(q.struct.loads.gkRoof, 2)) && html.includes(BP.calc.fmt(q.struct.loads.pRoof, 2)));
  // Positionsplan je Ebene, Momentenbilder der FE-Platten, Gleitkreis nur bei Nachweispflicht
  assert.equal(rep.blocks.filter((b) => b.t === 'fig' && /Platte darüber Pos/.test(b.cap)).length, 2);
  assert.ok(rep.blocks.filter((b) => b.t === 'fig2' && /Hüllkurven/.test(b.cap)).length === 3);
  assert.ok(rep.blocks.some((b) => b.t === 'fig' && /Baugrubenböschung/.test(b.cap || '')));
  assert.equal(rep.positions.cols.c1, '5.1');
});
test('Haustechnik: Abwasser und Hebeanlage, Wärmebilanz und Kühlung, Schutzlüftung, Notstrom mit Tank und Abgas, Explosionsschutzventile', () => {
  const H = BP.haustechnik;
  // Abwasser DIN EN 12056-2: 6 Personen → 1 WC, Waschtisch, Spüle; Qww = max(0,7 √3,3; 2,0) = 2,0 l/s; DN 80 mit v ≥ 0,7 m/s
  const q0 = BP.calc.run(BP.model.normalize(fresh()), NOFE), sw = q0.tech.svc.sew;
  assert.ok(sw.nWC === 1 && Math.abs(sw.sumDU - 3.3) < 1e-9 && sw.Qww === 2.0 && Math.abs(sw.Qp - 0.7 * Math.PI * 0.0016 * 1000) < 1e-9 && sw.dn === 80);
  assert.ok(Math.abs(sw.Hgeo - (-q0.lv.zFloorTop + 1.2)) < 1e-9 && sw.H > sw.Hgeo && H.MOTORS.includes(sw.motor));
  assert.ok(q0.bom.items.some((i) => i.key === 'hebeanlage') && q0.tech.extraConsumers.some((c) => c.auto === 'hebeanlage'));
  // kleiner Bunker: Erdreich nimmt die Wärme auf, keine Kühlung
  const hb0 = q0.tech.svc.heat;
  assert.ok(hb0.ground > hb0.load && hb0.cool === 0 && hb0.kW === 0 && !q0.bom.items.some((i) => i.key === 'klima'));
  // 50 Personen, TWK: Kühlung nötig, Kühlgerät am Aggregat, nicht an der Batterie; Explosionsschutzventile je Luftdurchführung
  const p = fresh(); p.hazard.blast = 'twk'; p.hazard.cb = true; p.use.people = 50; p.use.days = 14;
  const q = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p))), NOFE), t = q.tech, hb = t.svc.heat;
  assert.ok(hb.cool > 0 && hb.kW >= hb.cool / 1000 && hb.elec === hb.kW * 1000 / hb.cop && Math.abs(hb.load - (50 * 100 + hb.equip)) < 1e-9);
  const pk = JSON.parse(JSON.stringify(p)); pk.tech.cooling = 'keine';
  const qk = BP.calc.run(BP.model.normalize(pk), NOFE);
  assert.ok(Math.abs(qk.tech.battery - t.battery) < 1e-9 && t.generator >= qk.tech.generator && t.whDay > qk.tech.whDay);
  assert.ok(qk.checks.some((c) => c.level === 'warn' && /Kühlgerät einplanen/.test(c.text)));
  const vv = t.svc.valves.list;
  assert.ok(t.svc.valves.blast && vv.some((x) => /Zuluft/.test(x.name)) && vv.some((x) => /Fortluft/.test(x.name)) && vv.some((x) => x.kind === 'abgas') && vv.every((x) => x.size * x.n >= x.flow - 1e-9));
  const esv = q.bom.items.filter((i) => i.key === 'esv' || i.key === 'esv_abgas');
  assert.ok(esv.length === vv.length && !q.bom.items.some((i) => i.key === 'ventil') && q.bom.items.some((i) => i.key === 'uev'));
  assert.ok(esv.every((i) => { const x = vv.find((y) => i.name.includes(y.name)); return x && Math.abs(i.price - H.priceEsv(x.size, x.kind)) < 1e-9; }));
  // Schutzlüftung: Leckage höchstens die Hälfte der Filterluft
  assert.ok(Math.abs(t.svc.prot.leakMax - 0.5 * t.svc.prot.qF) < 1e-9 && t.svc.prot.qF === t.qCo2);
  // Notstrom: Tank aus Vorrat + 10 %, Abgasleitung mit v ≤ 25 m/s, AwSV-Stufe
  const g = t.svc.gen;
  assert.ok(g.tankSize >= g.fuel - 1e-9 && H.TANKS.includes(g.tankSize) && g.dnExh >= g.dExh - 1e-9 && g.exh / 3600 / (Math.PI * Math.pow(g.dnExh / 1000, 2) / 4) <= 25 + 1e-9 && g.stufe === 'A');
  assert.equal(H.genset({ tech: { fuelPerKWh: 0.35, genLocation: 'aussen' } }, { generator: 20, whDay: 120000, fuel: 4000, genDays: 20 }).stufe, 'B');
  // ohne Schutzanforderung: nur Absperrklappen
  const pn = fresh(); pn.hazard.blast = 'keins'; pn.hazard.cb = false;
  const qn = BP.calc.run(BP.model.normalize(pn), NOFE);
  assert.ok(qn.bom.items.some((i) => i.key === 'ventil') && !qn.bom.items.some((i) => i.key === 'esv' || i.key === 'uev'));
});
test('Einbauten: Aufstellung nach Raumname, Lasten auf der Zwischendecke, Lagerlast E, Vorgabe des Raums, Bericht', () => {
  const p = twoLevels(false);
  p.geom.rooms.push({ id: 'rT', name: 'Technik', x: 10, y: 5 });
  const q = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p)))), eq = q.tech.equip, st = q.struct;
  const gen = eq.find((e) => e.id === 'gen'), water = eq.find((e) => e.id === 'water');
  assert.ok(gen && gen.level === 0 && gen.room === 'Technik' && gen.slab === 'Zwischendecke über Ebene 2' && gen.fits, JSON.stringify(gen));
  assert.ok(water.level === 1 && water.room === 'Lager West' && water.slab === 'Bodenplatte');
  // Block liegt im Raum (rechts der Wand w1, über der Wand w2) und überlappt kein anderes Gerät im selben Raum
  const inT = eq.filter((e) => e.roomId === 'rT');
  for (const e of inT) assert.ok(e.rect.x0 >= 7.125 - 1e-6 && e.rect.x1 <= 13.65 + 1e-6 && e.rect.y0 >= 2.2875 - 1e-6 && e.rect.y1 <= 7.65 + 1e-6, e.id);
  for (const a of inT) for (const b of inT) if (a !== b) assert.ok(a.rect.x1 <= b.rect.x0 + 1e-6 || b.rect.x1 <= a.rect.x0 + 1e-6 || a.rect.y1 <= b.rect.y0 + 1e-6 || b.rect.y1 <= a.rect.y0 + 1e-6, a.id + '/' + b.id);
  // Gleichgewicht der Zwischendecke mit den Einbauten (G als Flächenlast, E als eigener Fall)
  const job = st.fe.jobs.mids[0], m = st.mids[0], cG = job.cases[0], cE = job.cases.find((c) => c.name === 'E');
  const area = BP.geo.area(job.domain) - job.holes.reduce((s2, h) => s2 + BP.geo.area(h), 0);
  const sumG0 = eq.filter((e) => e.level === 0).reduce((s2, e) => s2 + e.G, 0), sumE0 = eq.filter((e) => e.level === 0).reduce((s2, e) => s2 + e.E, 0);
  const rectSum = (c) => (c.rects || []).reduce((s2, r) => s2 + r.q * (r.x1 - r.x0) * (r.y1 - r.y0), 0);
  assert.ok(Math.abs(rectSum(cG) - sumG0) < 1e-6 && Math.abs(rectSum(cE) - sumE0) < 1e-6 && sumG0 > 5);
  const applied = cG.q * area + cG.lineLoads.reduce((s2, x) => s2 + x.q * BP.geo.dist(x.a, x.b), 0) + cG.points.reduce((s2, x) => s2 + x.P, 0) + rectSum(cG);
  const reacted = m.fe.reactCase.lines.reduce((s2, l) => s2 + l.g, 0) + m.fe.reactCase.areas.reduce((s2, a) => s2 + a.g, 0);
  assert.ok(Math.abs(reacted / applied - 1) < 0.02, 'Gleichgewicht ' + reacted + ' / ' + applied);
  const reE = m.fe.reactCase.lines.reduce((s2, l) => s2 + l.e, 0);
  assert.ok(sumE0 === 0 || Math.abs(reE / sumE0 - 1) < 0.03, 'E ' + reE + ' / ' + sumE0);
  assert.ok(job.combos.uls.every((c) => c.c.length === 4) && job.combos.sls[0].c[3] === 0.8);
  // Sohldruck enthält alle Einbauten, Auftrieb nicht
  assert.ok(Math.abs(st.bearing.Geq - eq.reduce((s2, e) => s2 + e.G, 0)) < 1e-9 && Math.abs(st.bearing.Eeq - eq.reduce((s2, e) => s2 + e.E, 0)) < 1e-9);
  // ohne Technikraum stehen die Geräte auf der Bodenplatte: Stützmomente der Zwischendecke kleiner
  const q0 = BP.calc.run(twoLevels(false));
  const sumM = (mm) => mm.layers.reduce((s2, l) => s2 + l.m, 0);
  assert.ok(q0.tech.equip.every((e) => e.level === 1) && sumM(st.mids[0]) > sumM(q0.struct.mids[0]) + 1);
  // Vorgabe: Aggregat in „Lager West“ (Ebene 2)
  p.tech.place = { gen: 'r2a', foo: 'x', fuel: '../bad' };
  const pn = BP.model.normalize(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(pn.tech.place, { gen: 'r2a' });
  const q2 = BP.calc.run(pn);
  assert.ok(q2.tech.equip.find((e) => e.id === 'gen').level === 1 && q2.tech.equip.find((e) => e.id === 'gen').manual);
  // Bericht: Lasttabelle und Hinweis auf Zwischendecke
  const html = BP.statikReport.toHTML(BP.statikReport.build(q, { project: 'T', date: '16.10.2026', index: 'a', version: 'v2' }));
  assert.ok(/Einbauten und Vorräte/.test(html) && html.includes('Notstromaggregat') && /1,5 E/.test(html));
  assert.ok(q.checks.some((c) => /Auf Zwischendecken stehen/.test(c.text)));
});
test('FE-Platten: Bemessungsmomente und Stützenlasten sind netzunabhängig (Mittelung über 2d, Lastverlauf der Unterzüge)', () => {
  const p = twoLevels(false);
  p.geom.columns = [{ id: 'c1', x: 10.4, y: 5.4, bx: 0.35, by: 0.35 }];
  p.geom.beams = [{ id: 'b1', a: { x: 7.125, y: 5.4 }, b: { x: 13.65, y: 5.4 }, bw: 0.3, hb: 0.4 }];
  const pn = BP.model.normalize(JSON.parse(JSON.stringify(p)));
  const run0 = BP.slabs.run, key0 = BP.slabs.key, out = [];
  try {
    for (const ms of [0.3, 0.15]) {
      BP.slabs.run = (job) => run0(Object.assign({}, job, { meshSize: ms }));
      BP.slabs.key = (job) => key0(job) + ':' + ms;
      const q = BP.calc.run(pn);
      out.push({ roof: q.struct.roof.layers.map((l) => l.m), mid: q.struct.mids[0].layers.map((l) => l.m), floor: q.struct.floor.layers.map((l) => l.m), col: q.struct.columns.map((c) => c.VEd), beam: q.struct.beams.map((b) => b.mF) });
    }
  } finally { BP.slabs.run = run0; BP.slabs.key = key0; }
  const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1);
  for (const k of ['roof', 'mid', 'floor']) out[0][k].forEach((v, i) => assert.ok(rel(v, out[1][k][i]) < 0.15, k + i + ': ' + v.toFixed(1) + ' / ' + out[1][k][i].toFixed(1)));
  out[0].col.forEach((v, i) => assert.ok(rel(v, out[1].col[i]) < 0.04, 'Stütze ' + v.toFixed(0) + ' / ' + out[1].col[i].toFixed(0)));
  out[0].beam.forEach((v, i) => assert.ok(rel(v, out[1].beam[i]) < 0.06, 'Unterzug ' + v.toFixed(1) + ' / ' + out[1].beam[i].toFixed(1)));
});
test('Referenzbeispiele: FE-Platten gegen Navier und Timoshenko, Durchlaufträger, EC2-Querschnitte, DIN 4017, Steinbrenner', () => {
  const r = BP.benchmarks.run();
  assert.ok(r.length >= 20);
  for (const x of r) assert.ok(x.ok, x.name + ': ' + x.val + ' / ' + x.ref);
  const p = twoLevels(false), q = BP.calc.run(p);
  const rep = BP.statikReport.build(q, { project: 'T', date: '16.10.2026', index: 'a', version: 'v2' }), html = BP.statikReport.toHTML(rep);
  assert.ok(/Verifikation des Rechenprogramms/.test(html) && /Netzstudie Decke/.test(html) && /Timoshenko/.test(html) && !/NaN|undefined/.test(html));
});
test('Außenwände als FE-Platten: lange Wand trägt einachsig wie der Balken mit Drehfedern, Zwischendecke stützt, Öffnungen ausgespart', () => {
  const p = fresh(); p.geom.outline = BP.model.shapeRect(30, 6); p.geom.walls = []; p.geom.openings = []; p.geom.rooms = []; p.geom.access = []; p.geom.verts = [];
  const q = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p)))), st = q.struct, w = st.wall;
  assert.equal(w.method, 'FE'); assert.equal(st.fe.jobs.walls.length, 8);
  const job = st.fe.jobs.walls.find((j) => j.Le > 20 && j.variant === 'gelenkig'), res = BP.slabs.run(job);
  // unabhängiger Balken (Euler-Bernoulli, 200 Elemente) mit Drehfedern oben/unten und gleichem Lastverlauf
  const Lw = job.Lw, nE = 200, EI = job.E * Math.pow(job.h, 3) / 12 / (1 - 0.04), le = Lw / nE, nd = 2 * (nE + 1);
  const K = Array.from({ length: nd }, () => new Float64Array(nd)), F = new Float64Array(nd);
  const prof = (y, pr) => { for (let i = 1; i < pr.length; i++) if (y <= pr[i][0]) return pr[i - 1][1] + (pr[i][1] - pr[i - 1][1]) * (y - pr[i - 1][0]) / (pr[i][0] - pr[i - 1][0]); return pr[pr.length - 1][1]; };
  const load = (y) => 1.35 * prof(y, job.cases[0].profileY) + 1.35 * prof(y, job.cases[1].profileY) + 1.5 * job.cases[2].q;
  for (let e = 0; e < nE; e++) {
    const k = [[12, 6 * le, -12, 6 * le], [6 * le, 4 * le * le, -6 * le, 2 * le * le], [-12, -6 * le, 12, -6 * le], [6 * le, 2 * le * le, -6 * le, 4 * le * le]], qe = load((e + 0.5) * le);
    const fe = [qe * le / 2, qe * le * le / 12, qe * le / 2, -qe * le * le / 12], id = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let r = 0; r < 4; r++) { F[id[r]] += fe[r]; for (let c = 0; c < 4; c++) K[id[r]][id[c]] += EI * k[r][c] / (le * le * le); }
  }
  const kB = job.lines.find((l) => l.id === 'bodenplatte').kRot, kT = job.lines.find((l) => l.id === 'decke').kRot;
  K[0][0] += 1e14; K[nd - 2][nd - 2] += 1e14; K[1][1] += kB; K[nd - 1][nd - 1] += kT;
  // Gauß
  const A2 = K.map((r, i) => Array.from(r).concat([F[i]]));
  for (let c = 0; c < nd; c++) { let pv = c; for (let r = c + 1; r < nd; r++) if (Math.abs(A2[r][c]) > Math.abs(A2[pv][c])) pv = r; [A2[c], A2[pv]] = [A2[pv], A2[c]]; for (let r = c + 1; r < nd; r++) { const fct = A2[r][c] / A2[c][c]; if (fct) for (let k = c; k <= nd; k++) A2[r][k] -= fct * A2[c][k]; } }
  const u = new Float64Array(nd); for (let r = nd - 1; r >= 0; r--) { let sm = A2[r][nd]; for (let k = r + 1; k < nd; k++) sm -= A2[r][k] * u[k]; u[r] = sm / A2[r][r]; }
  let mFieldBeam = 0, mBot = 0;
  for (let e = 0; e < nE; e++) { const curv = (u[2 * e + 3] - u[2 * e + 1]) / le; mFieldBeam = Math.max(mFieldBeam, -EI * curv); if (e === 0) mBot = -EI * curv; } // M = −EI w″ (w in Lastrichtung)
  // Wandmitte (u = Le/2): größtes Feldmoment lotrecht innen
  let mFE = 0;
  for (let k = 0; k < res.mesh.nNodes; k++) if (Math.abs(res.mesh.nodeX[k] - job.Le / 2) < 0.2) mFE = Math.max(mFE, res.raw.myMax[k]);
  assert.ok(Math.abs(mFE / mFieldBeam - 1) < 0.06, 'Feldmoment FE ' + mFE.toFixed(2) + ' / Balken ' + mFieldBeam.toFixed(2));
  let mBotFE = 0;
  for (let k = 0; k < res.mesh.nNodes; k++) if (Math.abs(res.mesh.nodeX[k] - job.Le / 2) < 0.2 && res.mesh.nodeY[k] < 1e-6) mBotFE = res.raw.myMin[k];
  assert.ok(mBot < 0 && Math.abs(mBotFE / mBot - 1) < 0.08, 'Einspannmoment unten FE ' + mBotFE.toFixed(2) + ' / Balken ' + mBot.toFixed(2));
  if (process.env.BP_VERBOSE) console.log('   Wand: Feld FE ' + mFE.toFixed(2) + ' / Balken ' + mFieldBeam.toFixed(2) + ', Fuß ' + mBotFE.toFixed(2) + ' / ' + mBot.toFixed(2));
  // Zwischendecke: zweiachsige Wand mit Stütze in halber Höhe hat kleineres Feldmoment
  const p2 = twoLevels(false), q2 = BP.calc.run(p2);
  assert.ok(q2.struct.wall.method === 'FE' && q2.struct.fe.jobs.walls.every((j) => j.lines.some((l) => /^zd/.test(l.id))));
  assert.ok(q2.struct.wall.fe.vi < q2.struct.wall.moments.beam.mF * 1.05, q2.struct.wall.fe.vi + ' / ' + q2.struct.wall.moments.beam.mF);
  // Zugangstür in der Außenwand: Loch im Modell der betroffenen Kante
  const q0 = BP.calc.run(BP.model.normalize(fresh()));
  const acc = q0.geo.access[0], jA = q0.struct.fe.jobs.walls.filter((j) => j.edge === acc.edge);
  assert.ok(jA.length === 2 && jA.every((j) => j.holes.length >= 1), JSON.stringify(jA.map((j) => j.holes.length)));
});
test('Luftstoß dynamisch: Einmassenschwinger für TWK und Szenario, Bericht, Prüfungen', () => {
  const p = fresh(); p.hazard.blast = 'twk';
  const q = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p)))), bd = q.blastDyn;
  assert.ok(bd && bd.rows.length === 2 && bd.rows.every((r) => r.twk && isFinite(r.mu) && r.T > 0));
  // TWK mit Φ = 1,2 bemessen: Rechteckstoß bleibt bei μ ≤ 3, Widerstand aus der statischen Bemessung
  const rf = bd.rows.find((r) => r.el === 'Decke');
  assert.ok(Math.abs(rf.Ru - q.struct.roof.acc.qRd) < 1e-9 && rf.ok && rf.mu <= 3 && rf.kappa > 1);
  // Gleichgewicht: elastischer Bereich → xm = (ps + 2 P0) / KE
  if (rf.mu < 1) assert.ok(Math.abs(rf.xm - (rf.ps + 2 * rf.P0) / rf.KE) / rf.xm < 0.01);
  // Szenario mit Modelllast: Dreieckstoß, Impuls ergibt td = 2 I / P
  const s = BP.planning.scenario(); Object.assign(s, { weapon: 'own', mode: 'air', tnt: 100, distance: 5, loadSource: 'Modell' }); p.planning.scenarios = [s];
  const q2 = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p)))), t = q2.planning.threats[0], rs = q2.blastDyn.rows.filter((r) => !r.twk);
  assert.ok(rs.length === 2 && rs.every((r) => Math.abs(r.td - 2 * t.load.impulse * 1e-3 / t.load.pressure) < 1e-12));
  assert.ok(rs.some((r) => !r.ok) && q2.checks.some((c) => /Einmassenschwinger/.test(c.text)));
  const html = BP.statikReport.toHTML(BP.statikReport.build(q2, { project: 'T', date: '16.10.2026', index: 'a', version: 'v2' }));
  assert.ok(/Dynamische Antwort \(Einmassenschwinger\)/.test(html) && /Szenario:/.test(html) && !/NaN|undefined/.test(html));
  // ohne Luftstoß und ohne Szenario: kein dynamischer Nachweis
  assert.equal(BP.calc.run(BP.model.normalize(fresh())).blastDyn, null);
});
test('Bauablauf im Kalender: Feiertage, Winterpause, Reifegrad, Kolonnen, kritischer Pfad', () => {
  const K = BP.kalender;
  // Ostern und bewegliche Feiertage
  assert.equal(K.easter(2027).toISOString().slice(0, 10), '2027-03-28'); assert.equal(K.easter(2026).toISOString().slice(0, 10), '2026-04-05');
  const h27 = K.holidays(2027, 'SN');
  assert.ok(h27.get('2027-03-26') === 'Karfreitag' && h27.get('2027-05-06') === 'Christi Himmelfahrt' && h27.get('2027-11-17') === 'Buß- und Bettag' && h27.get('2027-10-31') === 'Reformationstag' && !h27.has('2027-11-01'));
  assert.ok(K.holidays(2027, 'BY').has('2027-05-27') && K.holidays(2027, 'BY').has('2027-11-01') && !K.holidays(2027, 'DE').has('2027-05-27'));
  // Kalender: Arbeitstage ohne Wochenende, Feiertage und Winterpause; Reifegrad bei 10 °C ≈ 1,5 Kalendertage je Tag bei 20 °C
  const cal = K.make({ start: '2027-12-13', state: 'DE', winter: { on: true, from: '12-20', to: '01-06' } });
  assert.equal(cal.dateOfWork(5), '2028-01-07'); // 13.–17.12. = 5 AT, dann Pause bis 6.1.
  const c10 = K.make({ start: '2027-10-04', state: 'DE', winter: { on: false } }); // Oktober 9,6 °C
  assert.ok(Math.abs(c10.cureDays(0, 10) - 10 * 30 / 19.6) <= 1);
  // Projekt: Winterbeginn gegen Frühjahrsbeginn
  const p = twoLevels(false);
  p.schedule.start = '2027-11-01'; const qW = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p))));
  p.schedule.start = '2027-05-03'; const qS = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p))));
  const sW = qW.schedule, sS = qS.schedule;
  assert.ok(sW.cure.strip > sS.cure.strip && sW.cure.load >= sS.cure.load, sW.cure.strip + ' / ' + sS.cure.strip);
  assert.ok(sW.breaks.some((b) => b.winter && b.days >= 14) && sW.cold.length > 0 && sS.cold.length === 0);
  // keine Arbeit an Wochenenden, Feiertagen oder in der Winterpause
  const isWork = (iso) => { const d = new Date(iso + 'T00:00:00Z'), md = iso.slice(5); return d.getUTCDay() % 6 !== 0 && !K.holidays(d.getUTCFullYear(), 'DE').has(iso) && !(md >= '12-20' || md <= '01-06'); };
  assert.ok(sW.dates.every(isWork) && sW.dates.every((x, i) => i === 0 || x > sW.dates[i - 1]));
  // Abhängigkeiten mit Aushärten: Decke ausschalen frühestens nach der Reifezeit
  const B = sW.byId, dEnd = new Date(B.d_b.dateEnd + 'T00:00:00Z'), aus = new Date(B.aus.dateStart + 'T00:00:00Z');
  assert.ok((aus - dEnd) / 86400000 >= sW.cure.strip);
  // eine Rohbaukolonne: Rohbauvorgänge überlappen sich nicht; zwei Kolonnen: nicht länger
  const rb = sW.tasks.filter((t) => t.res === 'rohbau' && t.d > 0);
  for (const a of rb) for (const b of rb) if (a !== b) assert.ok(a.end <= b.start || b.end <= a.start, a.id + '/' + b.id);
  p.schedule.start = '2027-11-01'; p.schedule.crews = { rohbau: 2 };
  const q2 = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p))));
  assert.ok(q2.schedule.total <= sW.total);
  // kritischer Pfad endet bei der Abnahme und beginnt mit der Baustelleneinrichtung
  assert.ok(B.abn.critical && B.be.critical && B.d_b.critical);
});
test('Erdbeben: NA-Parameter, Erddruckzuwachs DIN EN 1998-5 E.9, Erdbebenkombination, Gleiten, Bericht', () => {
  const V = BP.verify;
  assert.equal(V.seismic({ zone: 0 }), null);
  const e = V.seismic({ zone: 3, ground: 'R', soilClass: 'C', importance: 'IV', gamma: 19, H: 4 });
  assert.ok(Math.abs(e.ag - 1.4 * 0.8) < 1e-12 && e.P.S === 1.5 && e.P.TC === 0.30 && Math.abs(e.dp - 1.12 / 9.81 * 1.5 * 19 * 4) < 1e-9 && Math.abs(e.Sd - 1.12 * 1.5 * 2.5 / 1.5) < 1e-12);
  assert.ok(V.seismic({ zone: 1, ground: 'S', soilClass: 'A', importance: 'II', gamma: 19, H: 3 }).mapped);
  const p = fresh(); p.site.seismic = { zone: 3, ground: 'R', soilClass: 'C', importance: 'IV' };
  const q = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p)))), eq = q.verify.eq;
  assert.ok(eq && eq.ratio > 0 && eq.wallRows.length === 3 && eq.F > 0 && eq.Rf > 0 && isFinite(eq.eta));
  // Verhältnis: an der Wandkrone größter Anteil des Zuwachses
  const w = q.struct.wall, L = q.struct.loads, top = (w.pressures.top.k + eq.dp + 0.3 * L.K0 * L.q) / (1.35 * w.pressures.top.k + 1.5 * L.K0 * L.q);
  assert.ok(Math.abs(eq.ratio - top) < 0.02 || eq.ratio >= top);
  const html = BP.statikReport.toHTML(BP.statikReport.build(q, { project: 'T', date: '16.10.2026', index: 'a', version: 'v2' }));
  assert.ok(/Pos. 15 – Erdbeben/.test(html) && /E\.9/.test(html) && !/NaN|undefined/.test(html));
  assert.equal(BP.calc.run(BP.model.normalize(fresh())).verify.eq, null);
});
test('Produktbeispiele: Belüftung nach BABS TPH-11, Hebeanlage nach Förderhöhe, Tank nach Vorrat, Quellen', () => {
  const p = fresh(); p.hazard.cb = true;
  const q = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p))), NOFE), pr = q.tech.products, H = BP.haustechnik;
  const va = pr.find((x) => x.item === 'Schutzbelüftung'), sw = q.tech.svc.sew;
  assert.ok(va && va.product.startsWith('VA ' + q.tech.ventSize) && va.src.url.startsWith('https://www.babs.admin.ch/'));
  const ch = pr.find((x) => /Schweiz/.test(x.item));
  assert.ok(ch && ch.need.includes(String(3 * p.use.people)));
  const hb = pr.find((x) => x.item === 'Fäkalienhebeanlage'), pick = H.CATALOG.hebe.find((x) => sw.H <= 0.7 * x.hMax && sw.Qp * 3.6 <= x.qMax);
  assert.ok(hb && hb.product.includes(pick.name));
  const tk = pr.find((x) => x.item === 'Kraftstofftank'), g = q.tech.svc.gen;
  const n = +tk.product.split(' ')[0], V = +tk.product.match(/(\d+) L$/)[1];
  assert.ok(n * V >= g.fuel - 1e-9 && H.CATALOG.tank.some((t) => t[0] === V));
  assert.ok(pr.every((x) => x.src && /^https:\/\//.test(x.src.url) && /^\d{4}-\d{2}-\d{2}$/.test(x.src.date)));
});
test('Vergleichspaket: Eingaben, Systeme, Lastfälle, Kombinationen und Ergebnisse je Position; DXF der Systemlinien', () => {
  const p = twoLevels(false);
  p.geom.columns = [{ id: 'c1', x: 10.4, y: 5.4, bx: 0.35, by: 0.35 }];
  p.geom.beams = [{ id: 'b1', a: { x: 7.125, y: 5.4 }, b: { x: 13.65, y: 5.4 }, bw: 0.3, hb: 0.4 }];
  const q = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p)))), rows = BP.vergleich.rows(q);
  assert.ok(rows.length > 100 && rows.every((r) => r.length === 6));
  const txt = rows.map((r) => r.join('|')).join('\n');
  assert.ok(!/NaN|undefined|\[object/.test(txt), (txt.match(/.{60}(NaN|undefined).{20}/) || [''])[0]);
  for (const s of ['1 Baustoffe', '2 Geometrie', '3 Systeme Decke', '3 Systeme Zwischendecke über Ebene 2', '3 Systeme Bodenplatte', '4 Ergebnisse Pos. 1', '4 Ergebnisse Pos. 5.1', '4 Ergebnisse Pos. 6.1', '4 Ergebnisse Gründung'])
    assert.ok(rows.some((r) => r[0] === s), s);
  // Lastfälle und Kombinationen der Decke wie im Rechenmodell
  const jr = q.struct.fe.jobs.roof;
  assert.equal(rows.filter((r) => r[0] === '3 Systeme Decke' && r[1] === 'Kombination GZT').length, jr.combos.uls.length);
  assert.ok(rows.some((r) => r[0] === '3 Systeme Decke' && r[1] === 'Lastfall G' && r[3] === jr.cases[0].q));
  // DXF: Kopf, Layer, Linien der tragenden Wand w1 und der Stütze, Ende
  const d = BP.vergleich.dxf(q);
  assert.ok(d.startsWith('0\r\nSECTION') && d.trim().endsWith('EOF') && /E1_WAND_TRAGEND/.test(d) && /E1_STUETZE/.test(d) && /E1_UNTERZUG/.test(d) && /AUSSENWAND_ACHSE/.test(d));
  assert.ok(!/[^\x00-\x7e]/.test(d), 'nur ASCII');
  const nLines = (d.match(/\r\nLINE\r\n/g) || []).length;
  assert.ok(nLines >= 4 * 3 + 4 + 2);
});
test('Prüfung 2.2: Mittelung nur an Auflagern, Einbauten ohne Überdeckung, Wasserhaltung in Kalendertagen, Winterpause begrenzt, KLM der Platte, Erdbebenmasse', () => {
  // Feldmomente bleiben ungemittelt, Stützmomente an der Einspannung werden gemittelt (dicke, kurze Decke)
  const p = fresh(); p.geom.outline = BP.model.shapeRect(3.2, 3.2); p.geom.walls = []; p.geom.openings = []; p.geom.rooms = [{ id: 'r1', name: 'Aufenthalt', x: 1.6, y: 1.6 }]; p.geom.verts = []; p.geom.access = [];
  p.build.tRoof = 0.6;
  const q = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p)))), res = q.struct.roof.fe, m = res.mesh;
  let c = 0; for (let k = 0; k < m.nNodes; k++) if (Math.hypot(m.nodeX[k] - 1.6, m.nodeY[k] - 1.6) < Math.hypot(m.nodeX[c] - 1.6, m.nodeY[c] - 1.6)) c = k;
  assert.equal(res.smoothed[c], 0);
  assert.ok(res.uls.bx[c] >= res.raw.mxMax[c] - 1e-9 && res.uls.bx[c] <= res.raw.mxMax[c] + res.raw.mxyAbs[c] + 1e-9, 'Feldmoment ungemittelt (Wood-Armer der Knotenwerte)');
  let edge = -1; for (let k = 0; k < m.nNodes; k++) if (!res.inSup[k] && res.smoothed[k] && (edge < 0 || -res.raw.mxMin[k] > -res.raw.mxMin[edge])) edge = k;
  assert.ok(edge >= 0 && res.uls.tx[edge] < -res.raw.mxMin[edge], 'Stützmoment gemittelt');
  // Einbauten: großer Raum ohne Überdeckung, überfüllter Raum wird gemeldet
  const ov = (eq) => { let n = 0; for (let i = 0; i < eq.length; i++) for (let j = i + 1; j < eq.length; j++) { const a = eq[i].rect, b = eq[j].rect; if (eq[i].level === eq[j].level && a.x0 < b.x1 - 1e-6 && a.x1 > b.x0 + 1e-6 && a.y0 < b.y1 - 1e-6 && a.y1 > b.y0 + 1e-6) n++; } return n; };
  for (const [W, D, n] of [[30, 20, 400], [5, 3.5, 200]]) {
    const p2 = fresh(); p2.geom.outline = BP.model.shapeRect(W, D); p2.geom.walls = []; p2.geom.openings = []; p2.geom.rooms = [{ id: 'r1', name: 'Aufenthalt', x: W / 2, y: D / 2 }]; p2.geom.verts = [];
    p2.use.people = n; p2.use.days = 30;
    const q2 = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p2)))), eq = q2.tech.equip;
    if (W > 10) assert.ok(eq.every((e) => e.fits) && ov(eq) === 0);
    else assert.ok(eq.some((e) => !e.fits) && eq.filter((e) => !e.overlap).length >= 1 && q2.checks.some((x) => /passt nicht in/.test(x.text)) && (ov(eq) === 0 || eq.some((e) => e.overlap)));
  }
  // Wasserhaltung: Pumpentage über Winterpause und Feiertage
  const p3 = fresh(); p3.site.waterMode = 'tiefe'; p3.site.waterDepth = 1.5; p3.schedule.start = '2027-11-01';
  const q3 = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p3)))), wh = q3.schedule.wh;
  assert.ok(wh && wh.cal > wh.d * 7 / 5, 'Winterpause und Feiertage zählen mit: ' + (wh && wh.d) + ' AT / ' + (wh && wh.cal) + ' KT');
  const it = q3.bom.items.find((x) => x.key === 'wasserhaltung');
  assert.equal(it.qty, wh.cal);
  // Winterpause höchstens 120 Kalendertage, Kalender ohne Arbeitstage bricht ab statt endlos zu laufen
  const p4 = fresh(); p4.schedule.winter = { on: true, from: '01-01', to: '12-31' };
  const w4 = BP.model.normalize(JSON.parse(JSON.stringify(p4))).schedule.winter;
  assert.equal(w4.from, '01-01'); assert.equal(w4.to, '04-29');
  assert.throws(() => BP.kalender.make({ start: '2027-01-04', winter: { on: true, from: '01-01', to: '12-31' } }).calOfWork(3), /Arbeitstage/);
  // Luftstoß: Decke mit KLM der eingespannten Platte, Wand mit Balkenwerten; Auflagerkraft statisch 0,5 · ps
  const p5 = fresh(); p5.hazard.blast = 'twk';
  const bd = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p5)))).blastDyn;
  const rr = bd.rows.find((r) => r.el === 'Decke'), rw = bd.rows.find((r) => r.el === 'Außenwand');
  assert.ok(rr.KLMe < 0.72 && rr.KLMe >= 0.593 && rr.KLMp < 0.66 && rw.KLMe === 0.77 && rw.KLMp === 0.66);
  const s0 = BP.verify.sdof({ m: 1, KE: 1e5, Ru: 1e3, P0: 1e-9, td: 0.01, ps: 100 });
  assert.ok(Math.abs(s0.vFactor - 50) < 0.5, 'statisch V = 0,5 · q · l: ' + s0.vFactor);
  // Erdbeben: Masse mit 0,8 E, Reibung mit tan φ′ / 1,25, ψ₂ der Geländelast
  const p6 = fresh(); p6.site.seismic = { zone: 3, ground: 'R', soilClass: 'C', importance: 'III' };
  const q6 = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p6)))), e6 = q6.verify.eq, bg = q6.struct.bearing, L6 = q6.struct.loads;
  assert.equal(e6.psi, L6.PSI2);
  assert.ok(Math.abs(e6.W - (bg.Gtot + L6.PSI2 * L6.Qroof + 0.6 * Math.max(0, bg.Qtot - L6.Qroof - bg.Eeq) + 0.8 * bg.Eeq)) < 1e-6);
  const U6 = q6.struct.buoyancy && q6.struct.buoyancy.final ? q6.struct.buoyancy.final.U || 0 : 0;
  assert.ok(Math.abs(e6.Rf - Math.max(0, bg.Gtot - U6) * Math.tan(q6.soil.phi * Math.PI / 180) / 1.25) < 1e-6);
  // Tafelverfahren: Einbauten im selben Feld werden addiert, Bericht ohne leere Werte
  const q7 = BP.calc.run(twoLevels(false), NOFE);
  assert.ok(q7.struct.mids[0].pEd > 1.35 * (25 * 0.3) + 1.5 * q7.p.use.interiorQ || q7.tech.equip.every((e) => e.level !== 0));
});
test('Sprachen: gleiche Rechenergebnisse in Deutsch, Englisch und Spanisch, vollständige Wörterbücher, deutsche Schlüssel für den Einkauf', () => {
  const I = BP.i18n;
  // Wörterbücher: Platzhalter und HTML wie im deutschen Schlüssel
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(), tags = (s) => (s.match(/<\/?[a-zA-Z][^>]*>/g) || []).sort().join();
  for (const l of ['en', 'es']) for (const [k, v] of Object.entries(I.dict[l])) { assert.equal(ph(v), ph(k), l + ': ' + k); assert.equal(tags(v), tags(k), l + ': ' + k); }
  assert.equal(Object.keys(I.dict.en).length, Object.keys(I.dict.es).length);
  // Zahlen und Wahrheitswerte überall gleich; Zeichenketten dürfen sich unterscheiden
  const nums = (o, pfx, out) => {
    if (o == null || typeof o === 'function') return out;
    if (typeof o === 'number') { out.push(pfx + '=' + (isFinite(o) ? +o.toPrecision(12) : String(o))); return out; }
    if (typeof o === 'boolean') { out.push(pfx + '=' + o); return out; }
    if (ArrayBuffer.isView(o)) { out.push(pfx + '#' + o.length); return out; }
    if (Array.isArray(o)) { out.push(pfx + '[' + o.length + ']'); o.forEach((x, i) => nums(x, pfx + '.' + i, out)); return out; }
    if (typeof o === 'object') for (const k of Object.keys(o).sort()) if (k !== 'p') nums(o[k], pfx + '.' + k, out);
    return out;
  };
  const projects = [fresh(), twoLevels(false)];
  const p3 = fresh(); p3.hazard.blast = 'twk'; p3.site.seismic = { zone: 2, ground: 'R', soilClass: 'C', importance: 'III' }; p3.site.waterMode = 'tiefe'; p3.site.waterDepth = 1.5; projects.push(BP.model.normalize(JSON.parse(JSON.stringify(p3))));
  try {
    for (const p of projects) {
      const runIn = (l) => I.withLang(l, () => BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p)))));
      const de = runIn('de'), en = runIn('en'), es = runIn('es');
      const a = nums(de, 'q', []).join('\n');
      assert.equal(nums(en, 'q', []).join('\n'), a, 'Englisch rechnet anders');
      assert.equal(nums(es, 'q', []).join('\n'), a, 'Spanisch rechnet anders');
      // Stückliste: Namen bleiben deutsche Schlüssel (Einkauf), Anzeige übersetzt
      assert.deepEqual(en.bom.items.map((i) => i.name), de.bom.items.map((i) => i.name));
      assert.deepEqual(BP.planning.lines(en).map((l) => l.id), BP.planning.lines(de).map((l) => l.id));
      assert.ok(en.bom.items.some((i) => i.label !== i.name));
    }
    // vollständiger Durchlauf aller Unterlagen: keine fehlenden Übersetzungen
    for (const l of ['en', 'es']) {
      I.missing.clear();
      I.withLang(l, () => {
        for (const p of projects) {
          const q = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(p))));
          BP.statikReport.toHTML(BP.statikReport.build(q, { project: 'T', date: '16.10.2026', index: 'a', version: 'v2' }));
          BP.vergleich.rows(q); BP.vergleich.dxf(q);
          BP.rebar.sheets(q, q.steel.schedule, { project: 'T', concrete: 'C30/37', cnom: 0.045, date: '16.10.2026' }); BP.rebar.csv(q.steel.schedule, String);
          BP.layouts.generate(BP.model.normalize(JSON.parse(JSON.stringify(p))));
        }
        BP.benchmarks.run();
      });
      assert.deepEqual([...I.missing], [], l + ': fehlende Übersetzungen');
    }
    // Zahlen und Daten in der Schreibweise der Sprache, Deutsch unverändert
    assert.equal(I.withLang('en', () => BP.calc.fmt(1234.5, 1)), '1,234.5');
    assert.equal(I.withLang('es', () => BP.calc.fmt(1234.5, 1)), '1234,5');
    assert.equal(BP.calc.fmt(1234.5, 1), '1.234,5');
    assert.equal(I.withLang('en', () => I.T('Breite@@Geo')), 'Latitude');
    assert.equal(I.T('Breite@@Geo'), 'Breite');
    // Raumnamen der Vorschläge werden übersetzt angezeigt, freie Namen bleiben
    assert.equal(I.withLang('en', () => BP.calc.roomName('Schleuse')), 'Airlock');
    assert.equal(I.withLang('es', () => BP.calc.roomName('Sanitär A1')), I.withLang('es', () => I.T('Sanitär')) + ' A1');
    assert.equal(I.withLang('en', () => BP.calc.roomName('Mein Hobbyraum')), 'Mein Hobbyraum');
  } finally { I.setLang('de'); I.missing.clear(); }
});
test('Länder: Feiertage je Land und Region, Klima, Währung, Preisniveau, Umrechnung der Eigenleistung; Deutschland unverändert', () => {
  const L = BP.laender, K = BP.kalender;
  // Deutschland: Faktor 1, Euro, Bundesland aus älteren Projekten übernommen
  const pd = fresh(), qd = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(pd))));
  assert.equal(qd.country.code, 'DE'); assert.equal(qd.country.cur, 'EUR'); assert.equal(qd.country.factor, 1);
  const old = JSON.parse(JSON.stringify(pd)); old.schedule.state = 'BY'; delete old.site.country; delete old.site.region;
  const on = BP.model.normalize(old); assert.equal(on.site.region, 'BY'); assert.equal(on.schedule.state, 'BY');
  assert.equal(BP.model.normalize(Object.assign(JSON.parse(JSON.stringify(pd)), { site: Object.assign({}, pd.site, { country: 'XX' }) })).site.country, 'DE');
  // USA: Währung, keine landesweite MwSt., Baupreisniveau, Richtpreise skaliert, Eigenleistung umgerechnet
  const pu = JSON.parse(JSON.stringify(pd)); pu.self.equip.baggerRent = 280;
  assert.ok(BP.model.setCountry(pu, 'US'));
  const fu = L.info('US').pli;
  assert.equal(pu.costs.vat, 0); assert.ok(Math.abs(pu.self.equip.baggerRent - 280 * fu) < 0.01);
  const qu = BP.calc.run(BP.model.normalize(pu));
  assert.equal(qu.country.cur, 'USD'); assert.ok(qu.country.fx.rate > 0.5 && qu.country.fx.rate < 2);
  const it = (q, k) => q.bom.items.find((i) => i.key === k && i.mode === 'firma');
  assert.ok(Math.abs(it(qu, 'aushub').price / it(qd, 'aushub').price - fu) < 1e-9, 'Richtpreis × Preisniveau');
  // Positionen gleich (Bewehrung je nach Norm des Landes mit anderen Durchmessern)
  const noSteel = (q) => q.bom.items.filter((i) => !/^Betonstahl /.test(i.name)).map((i) => i.name);
  assert.deepEqual(noSteel(qu), noSteel(qd));
  // Anzeige in Projektwährung mit Wechselkurs (intern Euro)
  BP.calc.run(BP.model.normalize(pu));
  assert.ok(/\$/.test(L.show(1000)) && L.fx() === qu.country.fx.rate);
  BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(pd))));
  assert.equal(L.show(1234).replace(/\s/g, ' '), '1.234 €');
  // Feiertage: USA (Unabhängigkeitstag 2027 am Montag nachgeholt), Zürich (Berchtoldstag), Spanien Madrid
  const us = K.make({ start: '2027-06-28', country: 'US', region: 'TX' });
  assert.ok(us.days.find((d) => d.iso === '2027-07-05').holiday && !us.days.find((d) => d.iso === '2027-07-05').work);
  const zh = K.make({ start: '2027-03-22', country: 'CH', region: 'ZH', winter: { on: false } }), vs = K.make({ start: '2027-03-22', country: 'CH', region: 'VS', winter: { on: false } });
  assert.ok(zh.days[4].holiday && !vs.days[4].holiday, 'Karfreitag in Zürich, nicht im Wallis');
  const md = K.make({ start: '2027-01-01', country: 'ES', region: 'MD', winter: { on: false } });
  assert.ok(md.days.find((d) => d.iso === '2027-01-06').holiday, 'Reyes in Spanien');
  const far = K.make({ start: '2041-01-07', country: 'FR', winter: { on: false } }); far.calOfWork(5);
  assert.ok(far.noHolidays()[0] === 2041 && far.noHolidays().every((y) => y > 2040));
  // Klima: warmes Klima verkürzt die Wartezeiten der Betonreife
  const pw = JSON.parse(JSON.stringify(pd)); pw.site.climate = { temps: [25, 25, 26, 27, 28, 28, 28, 28, 27, 26, 25, 25], source: 'Test', period: '', fetched: '' };
  const qw = BP.calc.run(BP.model.normalize(pw));
  assert.ok(qw.schedule.total < qd.schedule.total, 'Bauzeit im Warmen kürzer: ' + qw.schedule.total + ' / ' + qd.schedule.total);
  const tc = L.techFromClimate(L.info('DE').climate); assert.equal(tc.tSoil, 10); assert.equal(tc.tOutSummer, 32);
  // Länderliste: alle Länder mit Währung; Namen in der Sprache der Oberfläche
  assert.ok(L.list().length > 240 && L.list().every(([c]) => /^[A-Z]{3}$/.test(L.info(c).cur)));
  assert.equal(I18n_name('es', 'DE'), 'Alemania');
  function I18n_name(l, c) { return BP.i18n.withLang(l, () => L.name(c)); }
  // jedes Land rechnet ohne Fehler (Stichprobe über alle Kontinente)
  for (const c of ['AT', 'GB', 'NO', 'PL', 'MX', 'CO', 'AR', 'BR', 'JP', 'IN', 'AU', 'ZA', 'AE', 'IS']) {
    const p = JSON.parse(JSON.stringify(pd)); BP.model.setCountry(p, c);
    const q = BP.calc.run(BP.model.normalize(p));
    assert.ok(isFinite(q.bom.gross) && q.bom.gross > 0 && q.schedule.total > 0, c);
  }
});
test('Normen: Eurocode mit nationalen Parametern (AT, NL, DK, GB, ES, EN-Empfehlung), Deutschland unverändert, Bericht', () => {
  const N = BP.normen, base = fresh();
  const run = (c, f) => { const p = JSON.parse(JSON.stringify(base)); BP.model.setCountry(p, c); if (f) f(p); return BP.calc.run(BP.model.normalize(p)); };
  // Deutschland: bisherige Werte
  const qd = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(base))));
  assert.equal(qd.norm.na, 'DE'); assert.ok(Math.abs(qd.mat.fcd - 17) < 1e-9 && Math.abs(qd.mat.fyd - 500 / 1.15) < 1e-9);
  const pD = N.profile(base);
  assert.equal(pD.lf.sets.length, 1); assert.equal(pD.punch.beta, 1.10); assert.equal(pD.geo.da, 'DA2*'); assert.deepEqual([pD.upl.dst, pD.upl.stb], [1.05, 0.95]);
  // NA DE: vmin für d > 600 mm abgemindert (0,0375/γc ab 800 mm), sonst 0,035 · k^1,5 · √fck
  assert.ok(Math.abs(pD.vmin(0.5, 30) - 0.035 * Math.pow(1 + Math.sqrt(0.4), 1.5) * Math.sqrt(30)) < 1e-9);
  assert.ok(Math.abs(pD.vmin(0.9, 30) / pD.vmin(0.9, 30, true) - 1) < 1e-12 && pD.vmin(0.9, 30) < 0.035 * Math.pow(1 + Math.sqrt(200 / 900), 1.5) * Math.sqrt(30) * 0.75);
  // Österreich: αcc = 1,0, CRd,c = 0,18/γc, β = 1,15, UPL nach EN
  const qa = run('AT');
  assert.equal(qa.norm.na, 'AT'); assert.ok(Math.abs(qa.mat.fcd - 20) < 1e-9);
  const pA = N.active();
  assert.ok(Math.abs(pA.crdc(true) - 0.12) < 1e-12 && pA.punch.beta === 1.15 && pA.upl.dst === 1.0 && pA.upl.stb === 0.9);
  // Platten: gleiche Schnittgrößen (gleiche Faktoren); Zwang nach EN 7.3.2 (kc = 1,0, Tab. 7.2N) statt NA DE (NA.5)
  assert.ok(Math.abs(qa.struct.roof.layers[0].m - qd.struct.roof.layers[0].m) < 1e-6 && qa.struct.roof.layers[0].asRestr > 0);
  const rep = BP.statikReport.build(qa, { project: "T" }), html = BP.statikReport.toHTML(rep);
  assert.ok(html.includes('ÖNORM B 1992-1-1:2018') && html.includes('Nationale Parameter (AT)') && html.includes('Durchstanzen nach EC2 6.4 mit nationalem Anhang AT'));
  assert.ok(!/Referenzbeispiele[\s\S]*✘/.test(html.replace(/<[^>]+>/g, ' ')), 'Referenzbeispiele rechnen unabhängig vom Land mit NA DE');
  // Niederlande: Gleichungen 6.10a/b (ξ = 0,89, ψ₀ = 0,4 Kat. A) als eigene Kombinationen
  const qn = run('NL'), pN = N.active();
  assert.equal(pN.lf.sets.length, 2); assert.ok(Math.abs(pN.lf.sets[1].G - 0.89 * 1.35) < 1e-12);
  const jr = qn.struct.fe.jobs.roof;
  assert.ok(jr.combos.uls.length === 8 && jr.combos.uls.some((c) => / \(6\.10a\)$/.test(c.name)) && jr.combos.uls.some((c) => / \(6\.10b\)$/.test(c.name)));
  const L = qn.struct.loads; assert.ok(Math.abs(L.pRoof - Math.max(1.35 * L.gkRoof + 1.5 * 0.4 * L.q, 0.89 * 1.35 * L.gkRoof + 1.5 * L.q)) < 1e-9);
  // Dänemark: γc = 1,45, γs = 1,2; 6.10a nur ständige Lasten
  const qk = run('DK'); assert.ok(Math.abs(qk.mat.fyd - 500 / 1.2) < 1e-9 && Math.abs(qk.mat.fcd - 30 / 1.45) < 1e-9);
  assert.equal(N.active().lf.sets[0].Q, 0);
  // Großbritannien: DA1 (ungünstigere Kombination), Spanien: CTE mit γR,v = 3,0 und Böschungen 1,8
  const qg = run('GB'); assert.ok(['DA1-1', 'DA1-2'].includes(qg.verify.gb.approach));
  const qe = run('ES'); assert.equal(qe.verify.gb.approach, 'CTE'); assert.ok(Math.abs(qe.verify.gb.Rnk / qe.verify.gb.Rnd - 3) < 1e-9); assert.equal(N.active().geo.sl[0], 1.8);
  // Land ohne nationale Werte in der Recherche: EN-Empfehlungen, Kennzeichnung
  const qi = run('IS'); assert.equal(qi.norm.na, 'EN'); assert.ok(/EN/.test(qi.norm.label));
  // Tabelle 7.2N: Stützstellen und Zwischenwerte
  assert.equal(N.sigmaT72(0.3, 16), 240); assert.equal(N.sigmaT72(0.2, 8), 280); assert.ok(N.sigmaT72(0.3, 20) > 200 && N.sigmaT72(0.3, 20) < 240);
  assert.ok(Math.abs(N.sigmaT72(0.15, 12) - Math.sqrt(0.15 * 3.48e6 / 12)) < 1e-9);
  // Anzeige der Kombinationen in der Sprache der Oberfläche
  const c0 = qd.struct.fe.jobs.roof.combos.uls[0];
  assert.equal(c0.name, '1,35 G + 1,5 Q + Rahmenecke');
  assert.equal(BP.i18n.withLang('en', () => N.comboLabel(c0)), '1.35 G + 1.5 Q + frame corner');
  // wieder Deutschland
  BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(base)))); assert.equal(N.active().na, 'DE');
});
test('Normen: Schweiz nach SIA 260–267 (Baustoffe, Querkraft mit md/mRd, Rissbeschränkung, Durchstanzen Stufe 2, SIA 267, Bericht)', () => {
  const N = BP.normen, base = fresh();
  const p = JSON.parse(JSON.stringify(base)); BP.model.setCountry(p, 'CH');
  const q = BP.calc.run(BP.model.normalize(p)), S = N.active();
  assert.equal(q.norm.code, 'SIA'); assert.equal(S.code, 'SIA');
  // Baustoffe: fcd = ηfc · fck / 1,5 (C30/37 → 20,0; C40/50 → ηfc = 0,909), τcd = 0,3 √fck / 1,5
  assert.ok(Math.abs(q.mat.fcd - 20) < 1e-9 && Math.abs(q.mat.tauCd - 0.3 * Math.sqrt(30) / 1.5) < 1e-12);
  const m40 = S.material({ fck: 40, fctm: 3.5 }, {}); assert.ok(Math.abs(m40.fcd - Math.pow(30 / 40, 1 / 3) * 40 / 1.5) < 1e-9);
  // Querkraft: vRd = kd τcd d, kd = 1/(1 + εv d kg), εv = fsd/Es · md/mRd (Beispiel: d = 300 mm, ρ = 0,5 %, md = 60 kNm/m)
  const mat = q.mat, rho = 0.005, d = 0.3, mRd = rho * d * d * mat.fyd * 1000 * (1 - rho * mat.fyd / (2 * mat.fcd));
  const kd = 1 / (1 + mat.fyd / 205000 * (60 / mRd) * 300 * 1.0);
  assert.ok(Math.abs(S.vRdc(rho, d, mat, true, 60) - kd * mat.tauCd * 300) < 1e-9);
  // ohne Moment: md/mRd = 1; Längsbewehrung für Querkraft aus md/mRd
  assert.ok(S.vRdc(rho, d, mat, true) < S.vRdc(rho, d, mat, true, 60));
  const need = S.rhoForShear(S.vRdc(0.008, d, mat, true, 60) * 0.999, d, mat, 60); assert.ok(need > 0.005 && need <= 0.008 + 1e-6);
  // Rissbeschränkung: WU-Bauteile hohe Anforderungen (Kurve C), σs,adm bei s = 100 mm 290 MPa
  const lay = q.struct.roof.layers[0]; assert.ok(Math.abs(lay.sigAdm - S.sigmaAdm('hoch', lay.s, mat.fyd)) < 1e-9 && lay.sigAdm <= 435);
  assert.equal(S.sigmaAdm('hoch', 0.1, 435), 290); assert.equal(S.sigmaAdm('erhoeht', 0.2, 435), 340); assert.equal(S.sigmaAdm('normal', 0.2, 435), 435);
  // Kombinationen: Q bzw. E leitend, Begleitwerte ohne γ
  assert.deepEqual(S.lf.sets.map((x) => [x.G, x.Q, x.E]), [[1.35, 1.5, 1.0], [1.35, 0.7, 1.5]]);
  assert.ok(q.struct.fe.jobs.roof.combos.uls.some((c) => /\(Q leitend\)$/.test(c.name)));
  // Durchstanzen Stufe 2 an einer Innenstütze, nachgerechnet
  const fake = { layers: [{ face: 'oben', dir: 'x', d: 0.25, prov: 12 }, { face: 'oben', dir: 'y', d: 0.25, prov: 12 }] };
  const pu = BP.calc.punching(fake, { x: 0, y: 0, bx: 0.4, by: 0.4 }, 600, mat, { L: 6 });
  const As = 12e-4, mR = As * mat.fyd * 1000 * (0.25 - As * mat.fyd / (2 * mat.fcd)), psi = 1.5 * 0.22 * 6 / 0.25 * mat.fyd / 205000 * Math.pow(Math.min(1, 600 / 8 / mR), 1.5);
  const kr = Math.min(2, 1 / (0.45 + 0.18 * psi * 250 * 1)), u = (1.6 + Math.PI * 0.25) * 0.9;
  assert.equal(pu.method, 'SIA'); assert.ok(Math.abs(pu.vRdc - kr * mat.tauCd) < 1e-9 && Math.abs(pu.vEd - 600 / (u * 0.25) / 1000) < 1e-9);
  // Geotechnik SIA 267: tan φ / 1,2, c / 1,5, γR = 1,0
  const gb = q.verify.gb; assert.equal(gb.approach, 'SIA 267'); assert.ok(Math.abs(Math.tan(gb.phi * Math.PI / 180) * 1.2 - Math.tan(q.soil.phi * Math.PI / 180)) < 1e-9);
  // Bericht
  const html = BP.statikReport.toHTML(BP.statikReport.build(q, { project: 'T' }));
  assert.ok(html.includes('SIA 262:2013') && html.includes('Normwerte (SIA 260–267 (Schweiz))') && html.includes('SIA 262 4.3.6'));
  BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(base))));
});
test('Normen: USA nach ACI 318-19 / ASCE 7-22 (φ-Faktoren, Querkraft, Durchstanzen, Stützen, Stäbe, Brandschutz, Gründung, Bericht)', () => {
  const N = BP.normen, base = fresh();
  const p = JSON.parse(JSON.stringify(base)); BP.model.setCountry(p, 'US');
  assert.equal(p.build.cnom, 0.05); // Startwert der Betondeckung ACI (erdberührt 50 mm)
  const q = BP.calc.run(BP.model.normalize(p)), S = N.active();
  assert.equal(q.norm.code, 'ACI'); assert.equal(S.code, 'ACI');
  // Kombinationen ASCE 7-22 2.3: 1,4 D bzw. 1,2 D + 1,6 L, H mit 1,6
  assert.deepEqual(S.lf.sets.map((x) => [x.G, x.Q, x.H]), [[1.4, 0, 1.6], [1.2, 1.6, 1.6]]);
  // Baustoffe: φ · 0,85 f′c und φ fy (φ = 0,9), β1 nach 22.2.2.4.3
  const mat = q.mat; assert.ok(Math.abs(mat.fcd - 0.9 * 0.85 * 30) < 1e-9 && Math.abs(mat.fyd - 378) < 1e-9 && Math.abs(mat.beta1 - (0.85 - 0.05 * 2 / 7)) < 1e-12);
  // Querkraft 22.5.5.1(c): φ · 0,66 λs ρ^1/3 √f′c d, λs = √(2/(1 + 0,004 d))
  const ls = Math.sqrt(2 / (1 + 0.004 * 300));
  assert.ok(Math.abs(S.vRdc(0.005, 0.3, mat) - 0.75 * 0.66 * ls * Math.cbrt(0.005) * Math.sqrt(30) * 300) < 1e-9);
  assert.ok(Math.abs(S.rhoForShear(S.vRdc(0.007, 0.3, mat), 0.3, mat) - 0.007) < 1e-9);
  // Durchstanzen 22.6: Innenstütze 40 × 40 cm, d = 25 cm, b₀ = 4 (0,4 + 0,25) = 2,6 m, vc = 0,33 √f′c (λs = 1 bei d = 250 mm)
  const fake = { layers: [{ face: 'oben', dir: 'x', d: 0.25, prov: 12 }, { face: 'oben', dir: 'y', d: 0.25, prov: 12 }] };
  const pu = BP.calc.punching(fake, { x: 0, y: 0, bx: 0.4, by: 0.4 }, 600, mat, {});
  assert.equal(pu.method, 'ACI'); assert.ok(Math.abs(pu.u1 - 2.6) < 1e-9 && Math.abs(pu.vRdc - 0.75 * 0.33 * Math.sqrt(30)) < 1e-9 && Math.abs(pu.vEd - 600 / (2.6 * 0.25) / 1000) < 1e-12);
  const pu2 = BP.calc.punching(fake, { x: 0, y: 0, bx: 0.4, by: 0.4 }, 1000, mat, {});
  assert.ok(pu2.needs && !pu2.fail && pu2.links && pu2.links.method === 'ACI' && pu2.links.rows >= 2 && Math.abs(pu2.links.sr - 0.125) < 1e-12);
  // US-Stäbe (ASTM A615M): Querschnitt und Masse exakt, Bezeichnung
  assert.equal(S.barArea(13), 1.29); assert.equal(S.barMass(16), 1.552); assert.equal(S.barName(19), 'No. 19 (#6)');
  assert.ok([...S.dias].every((d) => [10, 13, 16, 19, 22, 25].includes(d)));
  // Stütze 40 × 40 cm, l₀ = 3 m (k lu/r = 25 > 22): Mindestmoment Pu (15 + 0,03 h) mit Momentenvergrößerung
  const cd = BP.calc.columnDesign({ bx: 0.4, by: 0.4 }, 2000, 3.0, mat);
  const EI = 0.4 * mat.Ecm * 1000 * Math.pow(0.4, 4) / 12 / 1.6, Pc = Math.PI * Math.PI * EI / 9, dl = 1 / (1 - 2000 / (0.75 * Pc));
  assert.ok(cd.aci && cd.eta <= 1 && cd.As >= 16 - 1e-9 && S.colPhi.includes(cd.phi) && Math.abs(cd.dirs[0].mEd - 2000 * 0.027 * dl) < 1e-9);
  // Bemessung im Projekt: Bewehrungsstäbe nur aus der US-Reihe, Stahlsorte in Stückliste, Biegeliste und BVBS
  assert.ok(q.struct.roof.layers.every((l) => S.dias.includes(l.phi)));
  assert.ok(q.bom.items.some((i) => /ASTM A615 Grade 60 No\. \d+/.test(typeof i.name === 'function' ? i.name() : i.name)));
  assert.equal(q.steel.schedule.grade, 'A615 Gr. 60'); assert.ok(BP.rebar.bvbs(q.steel.schedule, { project: 'T' }).includes('@gA615Gr.60@'));
  // Brandschutz ACI/TMS 216.1: R 90 → 1,5 h, Platten 109 mm, Deckung 19 mm
  assert.ok(q.verify.fire.cover && q.verify.fire.hours === 1.5 && q.verify.fire.items[0].dimMin === 109 && q.verify.fire.items[0].aMin === 19);
  // Gründung: zulässige Sohlpressung IBC Tab. 1806.2 (Sand 2000 psf) gegen Gebrauchslasten, Grundbruch ASD, Baugrube nach OSHA
  const bg = q.struct.bearing; assert.ok(bg.asd && bg.sigRd === 96 && Math.abs(bg.sigEd - (bg.Gtot + bg.Qtot) / q.geo.Aslab) < 1e-9);
  assert.equal(q.verify.gb.approach, 'ASD'); assert.equal(q.earth.rule.ref, 'OSHA 29 CFR 1926 Subpart P'); assert.equal(q.earth.rule.angle, 34);
  // Bericht
  const html = BP.statikReport.toHTML(BP.statikReport.build(q, { project: 'T' }));
  assert.ok(html.includes('ASCE/SEI 7-22') && html.includes('ACI 318-19 22.6') && html.includes('ACI/TMS 216.1-14') && html.includes('OSHA 29 CFR 1926 Subpart P') && html.includes('IBC 2024 Tab. 1806.2'));
  // zurück nach Deutschland: Startwert der Betondeckung wieder 45 mm
  BP.model.setCountry(p, 'DE'); assert.equal(p.build.cnom, 0.045);
  BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(base))));
});
test('Erdbeben je Norm: EN 1998-1 mit NA (agR, Bodenparameter je Land), SIA 261 (Zonen, γf), ASCE 7-22 (SDS, SDC), Länderwechsel', () => {
  const N = BP.normen, base = fresh(), run = (c, sz) => { const p = JSON.parse(JSON.stringify(base)); BP.model.setCountry(p, c); Object.assign(p.site.seismic, sz); return BP.calc.run(BP.model.normalize(p)); };
  // Österreich: agR 0,8 m/s², Baugrund B (Typ 1: S = 1,2), Kategorie III (γI = 1,2): ag = 0,96, Sd = 2,5 ag S / 1,5, Δp = ag/g · S · γ · H
  let q = run('AT', { agR: 0.8, soilClass: 'B', importance: 'III' }), e = q.verify.eq;
  assert.equal(e.kind, 'EC'); assert.ok(Math.abs(e.ag - 0.96) < 1e-12 && Math.abs(e.P.S - 1.2) < 1e-12 && Math.abs(e.Sd - 0.96 * 1.2 * 2.5 / 1.5) < 1e-12);
  assert.ok(Math.abs(e.dp - 0.96 / 9.81 * 1.2 * q.soil.gamma * e.H) < 1e-9 && e.required);
  // Bodenparameter nach Landesregel: Frankreich Zonen 1–4 (B: S = 1,35) und Zone 5 (wie Typ 1), Portugal Smax-Regel, Spanien NCSE-02, Italien NTC
  assert.equal(N.soilEC('FR', 'B', 1.1, 1.1).S, 1.35); assert.equal(N.soilEC('FR', 'B', 3.6, 3.0).S, 1.2);
  assert.ok(Math.abs(N.soilEC('PT', 'D', 2.5).S - (2 - 1 * 1.5 / 3)) < 1e-12); assert.equal(N.soilEC('PT', 'C', 0.8).S, 1.6);
  assert.ok(Math.abs(N.soilEC('ES', 'C', 0.5).S - 1.6 / 1.25) < 1e-12 && N.soilEC('ES', 'C', 5).S === 1.0);
  assert.ok(Math.abs(N.soilEC('IT', 'C', 2.0).S - Math.min(1.5, 1.7 - 0.6 * 2.5 * 2.0 / 9.81)) < 1e-12);
  // nicht gefordert: Frankreich Zone 2 und Kategorie II, sehr geringe Seismizität
  assert.equal(run('FR', { agR: 0.7, soilClass: 'B', importance: 'II' }).verify.eq.required, false);
  assert.equal(N.seisEC(N.ndp('GR'), { agR: 0.3, soilClass: 'A', importance: 'II' }).required, false);
  // Schweiz: Zone Z2 (agd 1,0), BWK II (γf 1,2), Baugrund C (S = 1,45); ohne Zone Z1a mit Hinweis
  q = run('CH', { zone: 3, soilClass: 'C', importance: 'II' }); e = q.verify.eq;
  assert.ok(e.kind === 'SIA' && e.zone === 'Z2' && Math.abs(e.ag - 1.2) < 1e-12 && e.P.S === 1.45);
  q = run('CH', {}); assert.ok(q.verify.eq.assumed && q.verify.eq.zone === 'Z1a' && q.checks.some((c) => /SIA 261 nicht gewählt/.test(c.text)));
  // USA: SDS 1,0 / SD1 0,6, Risikokategorie III: SDC D, Cs = SDS Ie / 1,5, kh = 0,4 SDS, Kombination H × 1,6 und 0,5 L
  q = run('US', { sds: 1.0, sd1: 0.6, importance: 'III' }); e = q.verify.eq;
  assert.ok(e.kind === 'ASCE7' && e.sdc === 'D' && e.required && Math.abs(e.Sd - 1.0 * 1.25 / 1.5 * 9.81) < 1e-12 && Math.abs(e.alphaS - 0.4) < 1e-12 && e.cH === 1.6 && e.cQ === 0.5);
  assert.equal(N.sdcOf(0.25, null, 'II'), 'B'); assert.equal(N.sdcOf(0.25, null, 'IV'), 'C'); assert.equal(N.sdcOf(0.4, 0.15, 'II'), 'C');
  assert.equal(run('US', { sds: 0.25, importance: 'II' }).verify.eq.required, false);
  const html = BP.statikReport.toHTML(BP.statikReport.build(q, { project: 'T' }));
  assert.ok(html.includes('Erdbeben (ASCE/SEI 7-22, IBC 2024 1803.5.12)') && html.includes('Seismic Design Category'));
  // Länderwechsel setzt die Erdbebenangaben zurück; Deutschland unverändert (Zonen nach DIN EN 1998-1/NA)
  const p = JSON.parse(JSON.stringify(base)); p.site.seismic.zone = 2; BP.model.setCountry(p, 'AT'); assert.equal(p.site.seismic.zone, 0);
  q = run('DE', {}); assert.equal(q.verify.eq, null);
  const pd = JSON.parse(JSON.stringify(base)); pd.site.seismic = Object.assign(pd.site.seismic, { zone: 2, ground: 'R', soilClass: 'B', importance: 'III' });
  e = BP.calc.run(BP.model.normalize(pd)).verify.eq; assert.ok(e.kind === 'DE' && Math.abs(e.ag - 0.72) < 1e-12 && e.P.S === 1.25 && e.label === 'Zone 2');
});
test('Bauantrag: Register, Zuständigkeit, Verfahren je Lage, DIN 277/276, Ausfüllhilfe, Bauvorlagen', () => {
  const B = BP.bauantrag, D = BP.bauantragDaten, base = fresh();
  // Register: alle Bundesländer, Einträge vollständig, jede Formularadresse https
  assert.ok(D.order.length >= 60 && ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'].every((r) => D.j['DE-' + r]));
  for (const e of Object.values(D.j)) { assert.ok(e.procedures.length && e.signer && e.structural && ['verified', 'secondary', 'unverified'].includes(e.status), e.key); for (const f of e.forms) if (f.url) assert.ok(/^https:\/\//.test(f.url), e.key); }
  const mk = (c, reg, P) => { const p = JSON.parse(JSON.stringify(base)); BP.model.setCountry(p, c); p.site.region = reg; Object.assign(p.permit, P || {}); p.permit = BP.model.normalize(p).permit; return p; };
  // Bayern: im Bebauungsplan Genehmigungsfreistellung, im Außenbereich vereinfachtes Verfahren; Lage offen → Hinweis
  let p = mk('DE', 'BY', { zone: 'bplan' }), q = BP.calc.run(BP.model.normalize(p)), J = B.jurisdiction(p);
  assert.equal(J.key, 'DE-BY'); assert.equal(B.procedure(J.e, B.ctxOf(p, q)).main.id, 'freistellung');
  p.permit.zone = 'aussen'; assert.equal(B.procedure(J.e, B.ctxOf(p, q)).main.id, 'vereinfacht');
  p.permit.zone = ''; assert.ok(B.procedure(J.e, B.ctxOf(p, q)).zoneMissing);
  // Sachsen-Anhalt: Freistellung nicht für vollständig unterirdische Gebäude (GK 5)
  p = mk('DE', 'ST', { zone: 'bplan' }); assert.equal(B.procedure(B.jurisdiction(p).e, B.ctxOf(p, q)).main.id, 'vereinfacht');
  // England: Planning und Building Regulations nebeneinander; Auswahl einer Gemeinde
  p = mk('GB', 'ENG'); const pg = B.procedure(B.jurisdiction(p).e, B.ctxOf(p, q)); assert.ok(pg.main.id === 'planning' && pg.tech.id === 'buildingcontrol');
  p = mk('US', 'TX', { jur: 'US-TX-Austin' }); assert.equal(B.jurisdiction(p).key, 'US-TX-Austin'); assert.equal(B.jurisdiction(mk('US', 'TX')).key, 'US');
  assert.equal(B.jurisdiction(mk('DE', 'BY', { jur: 'FR' })).key, 'DE-BY'); // Auswahl aus anderem Land gilt nicht
  // Bedingungen: Fläche, Nebenanlage, unterirdisch
  const ctx = { zone: 'bplan', area: 30, volume: 100, annex: false, belowGround: true };
  assert.ok(B.matches({ zone: ['bplan'], areaMax: 40 }, ctx) && !B.matches({ areaMin: 40 }, ctx) && !B.matches({ annex: true }, ctx) && !B.matches({ belowGround: false }, ctx));
  // Kennwerte nach DIN 277: BGF = Außenfläche je Ebene + Zugänge, BRI = BGF × Höhe Unterkante Sohle bis Oberkante Decke (+ Zugänge näherungsweise)
  q = BP.calc.run(BP.model.normalize(JSON.parse(JSON.stringify(base)))); const f = B.facts(q);
  assert.ok(Math.abs(f.bgfMain - q.geo.A) < 1e-9 && Math.abs(f.briMain - q.geo.A * (q.lv.zRoofTop - q.lv.zSlabBot)) < 1e-9 && Math.abs(f.nrf - q.geo.tot.Anet) < 1e-9 && f.belowGround);
  assert.ok(Math.abs(f.nuf + f.tf + f.vf - f.nrf) < 1e-9 && f.tf > 0 && f.vf > 0);
  // Kosten DIN 276: KG 300 + 400 = Summe der Bauleistungen
  const k = B.kosten(q); assert.ok(Math.abs(k.k300 + k.k400 - q.bom.net) < 1e-6 && k.k400 > 0);
  // Ausfüllhilfe und Feldzuordnung
  p = mk('DE', 'BY', { zone: 'bplan', bauherr: { name: 'Erika Muster', street: 'Weg 1', zip: '80331', city: 'München', phone: '', email: '' }, plot: { street: '', zip: '', city: '', gemarkung: 'Au', flur: '', flurstueck: '12/3', area: 600 } });
  const vals = B.values(p, q), V = Object.fromEntries(vals.map((v) => [v.id, v.value]));
  assert.ok(V['bauherr.name'] === 'Erika Muster' && V['plot.flurstueck'] === '12/3' && /Genehmigungsfreistellung/.test(V.verfahren) && /m³/.test(V.bri));
  assert.equal(B.guessField('Bauherr_Name', '', vals), 'bauherr.name'); assert.equal(B.guessField('txtFlurstueck', 'Flurstück-Nr.', vals), 'plot.flurstueck'); assert.equal(B.guessField('Gemarkung', '', vals), 'plot.gemarkung');
  // Bauvorlagen: Verfahren, Baubeschreibung, DIN 277/276, Statistik, Ausfüllhilfe, ohne Lücken
  const html = B.bundle(p, q, {});
  assert.ok(['Genehmigungsfreistellung (Art. 58 BayBO)', 'Baubeschreibung', 'DIN 277', 'DIN 276', 'Baustatistik', 'Erika Muster', 'Ausfüllhilfe'].every((s) => html.includes(s)) && !/NaN|undefined/.test(html));
  // Länderwechsel setzt die gewählte Zuständigkeit zurück
  p.permit.jur = 'DE-BY'; BP.model.setCountry(p, 'AT'); assert.equal(p.permit.jur, '');
});
test('IFC-Export: IFC4-Struktur, eindeutige und stabile Kennungen, Bauteile, Öffnungen, Räume, Mengen', () => {
  const p = twoLevels(false); p.uid = 'testprojekt1';
  p.geom.verts.push({ id: 'L1', kind: 'aufzug', x: 10.5, y: 5.4, dir: 270, type: 'lasten', payload: 1000, w: 1.1, d: 2.1, door: 1.0, drive: 'seil', speed: 0.5, top: 0, bottom: 1, tw: 0.25 });
  p.geom.columns = [{ id: 'c1', x: 3.4, y: 5.4, bx: 0.3, by: 0.3 }];
  p.geom.beams = [{ id: 'b1', a: { x: 0.35, y: 5.4 }, b: { x: 6.875, y: 5.4 }, bw: 0.3, hb: 0.4 }];
  const pn = BP.model.normalize(JSON.parse(JSON.stringify(p))), q = BP.calc.run(pn), now = new Date('2026-10-16T12:00:00Z');
  assert.equal(pn.uid, 'testprojekt1', 'Projektkennung bleibt beim Import erhalten');
  const r = BP.ifc.build(pn, q, { now, fileName: 'test.ifc' }), t = r.text;
  assert.ok(t.startsWith('ISO-10303-21;') && t.includes("FILE_SCHEMA(('IFC4'));") && t.trim().endsWith('END-ISO-10303-21;'));
  // jede Referenz ist definiert, Zeilen fortlaufend
  const lines = t.split('\n').filter((l) => /^#\d+=/.test(l)), ids = new Set(lines.map((l) => +l.slice(1, l.indexOf('='))));
  assert.equal(ids.size, lines.length); assert.ok([...t.matchAll(/#(\d+)(?!\d|=)/g)].every((m) => ids.has(+m[1])), 'unbekannte Referenz');
  // GlobalIds: 22 Zeichen im IFC-Zeichensatz, eindeutig, bei gleichem Projekt gleich, bei anderem Projekt verschieden
  const gids = [...t.matchAll(/^#\d+=IFC\w+\('([0-9A-Za-z_$]{22})'/gm)].map((m) => m[1]);
  assert.ok(gids.length > 60 && new Set(gids).size === gids.length && gids.every((g) => /^[0-3][0-9A-Za-z_$]{21}$/.test(g)));
  assert.equal(BP.ifc.build(pn, q, { now, fileName: 'test.ifc' }).text, t, 'gleiche Eingabe, gleiche Datei');
  const p2 = JSON.parse(JSON.stringify(pn)); p2.uid = 'anderesprojekt';
  assert.ok(!BP.ifc.build(p2, q, { now }).text.includes(gids[0]));
  // Bauteile: Bodenplatte, Decke, Zwischendecke, Außenwände je Ebene, Innenwände, Stützen, Unterzug, Treppen, Aufzug, Zugänge, Räume
  const n = (re) => (t.match(re) || []).length, s = r.stats.byClass;
  assert.equal(n(/IFCSLAB\([^;]*\.BASESLAB\.\);/g), 3, 'Bodenplatte, Aufzugsgrube, Schachtsohle des Notausstiegs');
  assert.equal(n(/IFCSLAB\([^;]*\.ROOF\.\);/g), 2, 'Decke und Schachtkopf'); assert.equal(n(/IFCSLAB\([^;]*\.FLOOR\.\);/g), 1);
  assert.equal(n(/IFCBUILDINGSTOREY\(/g), 2); assert.equal(s.IFCCOLUMN, 1); assert.equal(s.IFCBEAM, 1); assert.equal(s.IFCTRANSPORTELEMENT, 1);
  assert.equal(n(/IFCWALL\([^;]*'Au\\X2\\00DF\\X0\\enwand 1 [^;]*\.SOLIDWALL\.\);/g), 2, 'Außenwand je Ebene');
  assert.equal(s.IFCSPACE, q.geo.L.reduce((k, L) => k + L.rooms.filter((x) => !x.shaft).length, 0));
  assert.ok(s.IFCSTAIR >= 2 && s.IFCOPENINGELEMENT >= 5 && n(/IFCRELVOIDSELEMENT\(/g) === s.IFCOPENINGELEMENT && n(/IFCRELFILLSELEMENT\(/g) >= 4);
  // Baustoff, Eigenschaften und Mengen
  assert.ok(t.includes("IFCMATERIAL('C30/37',$,'Concrete')") && t.includes("'Pset_WallCommon'") && t.includes("'Pset_ConcreteElementGeneral'") && t.includes("IFCLABEL('B500B')"));
  assert.ok(t.includes("'Qto_SlabBaseQuantities'") && t.includes("'Qto_SpaceBaseQuantities'") && t.includes("IFCLABEL('R90')"));
  // Umlaute nach ISO 10303-21 kodiert, kein Text außerhalb ASCII
  assert.ok(t.includes('Au\\X2\\00DF\\X0\\enwand') && !/[^\x09\x0a\x20-\x7e]/.test(t));
  // Raumumriss aus dem Zellraster: Außenring gegen den Uhrzeigersinn, Fläche = Raumfläche
  const L0 = q.geo.L[0], room = L0.rooms.find((x) => !x.shaft), loops = BP.ifc.compLoops(L0.gridAll, L0.gridAll.comps[room.comp]);
  assert.ok(Math.abs(BP.geo.area(loops.outer) - loops.holes.reduce((a, h) => a + BP.geo.area(h), 0) - room.area) < 1e-6);
  // USA: Betonstahl nach ASTM
  const pu = fresh(); BP.model.setCountry(pu, 'US');
  assert.ok(BP.ifc.build(pu, BP.calc.run(pu), { now }).text.includes("IFCLABEL('A615 Gr. 60')"));
});
test('Radon: Referenzwerte je Land, Diffusion nach DB HS 6, Raumbilanz, Maßnahmen nach § 154 StrlSchV', () => {
  const Rn = BP.radon;
  // Referenzwerte: national, Neubauwert, Ersatzwerte (EU-Mitglied ohne Wert, sonst WHO)
  assert.equal(Rn.refOf('DE').value, 300); assert.equal(Rn.refOf('NL').value, 100); assert.equal(Rn.refOf('US').value, 148);
  assert.equal(Rn.refOf('IT').valueNew, 200); assert.equal(Rn.refOf('RO').x.kind, 'EU'); assert.equal(Rn.refOf('BR').x.kind, 'WHO'); assert.equal(Rn.refOf('BR').value, 300);
  // Diffusion: E = c·λ·l/sinh(d/l), l = √(D·3600/λ); dickere Bauteile lassen weniger durch
  const l = Math.sqrt(1e-8 * 3600 / Rn.LAMBDA);
  assert.ok(Math.abs(Rn.flux(3e5, 0.3) - 3e5 * Rn.LAMBDA * l / Math.sinh(0.3 / l)) < 1e-9 && Rn.flux(1e5, 0.5) < Rn.flux(1e5, 0.3));
  // Raumbilanz: zulässiger Eintrag und Bodenluftzustrom je Zustand
  const p = fresh(), q = BP.calc.run(p), r = q.radon, cl = r.states.find((x) => x.id === 'closed'), ve = r.states.find((x) => x.id === 'vent');
  assert.equal(r.soil, Rn.SOIL_DEFAULT); assert.ok(r.soilAssumed);
  assert.ok(Math.abs(cl.Smax - 300 * r.V * Rn.LAMBDA) < 1e-6 && Math.abs(cl.Qmax - (cl.Smax - r.Sdiff) / 1e5 * 1000) < 1e-9);
  assert.ok(ve && ve.n > 0 && ve.Qmax > 100 * cl.Qmax && Math.abs(ve.t95 - 3 / (ve.n + Rn.LAMBDA)) < 1e-12);
  assert.ok(Math.abs(r.Sdiff - r.parts.reduce((s, x) => s + x.E * x.A, 0)) < 1e-9);
  assert.ok(q.checks.some((c) => c.level === 'info' && /^Radon: Referenzwert 300 Bq\/m³/.test(c.text)));
  // WU-Konstruktion mit wk ≤ 0,2 mm erfüllt § 154 Nr. 3; PMBC ohne weitere Maßnahme im Vorsorgegebiet: Warnung
  assert.ok(r.measures.find((m) => m.id === 'crack').on);
  p.site.radon.area = 'ja'; p.build.waterproofing = 'pmbc';
  assert.ok(BP.calc.run(p).checks.some((c) => c.level === 'warn' && /§ 154 StrlSchV/.test(c.text)));
  p.build.radon.sump = true; assert.ok(!BP.calc.run(p).checks.some((c) => /§ 154 StrlSchV/.test(c.text)));
  // hohe Bodenluft: mehr Diffusion; Import begrenzt Werte; Länderwechsel setzt das Gebiet zurück
  p.site.radon.soil = 400; assert.ok(Math.abs(BP.calc.run(p).radon.Sdiff - 4 * r.Sdiff) < 1e-6);
  const n = BP.model.normalize(JSON.parse(JSON.stringify(Object.assign(p, { site: Object.assign(p.site, { radon: { soil: -5, area: 'vielleicht' } }) }))));
  assert.equal(n.site.radon.soil, 0); assert.equal(n.site.radon.area, 'unbekannt'); assert.equal(n.build.radon.sump, true);
  n.site.radon.area = 'ja'; BP.model.setCountry(n, 'AT'); assert.equal(n.site.radon.area, 'unbekannt');
});
test('Betrieb & Wartung: Aufgaben je Ausstattung und Land, Länderfassungen, Termine, Kalenderdatei', () => {
  const W = BP.wartung, today = new Date('2026-10-16T00:00:00Z');
  const ids = (pl) => pl.tasks.map((x) => x.t.id);
  const p = fresh(); p.ops.start = '2027-01-31';
  let pl = W.plan(p, BP.calc.run(p), { today }), t = ids(pl);
  // Deutschland: Hebeanlage im Einfamilienhaus jährlich, Feuerlöscher nach DIN 14406-4 statt allgemein, Aggregat innen → CO-Melder, kleiner Tank ohne AwSV-Sachverständigen
  assert.ok(['vent_run', 'filter_visual', 'hebe_wartung_efh', 'gen_test', 'fuel_analysis', 'co_test', 'ext_service_de', 'elec_inspect_de', 'smoke_inspect_de', 'water_replace', 'food_rotate'].every((x) => t.includes(x)), t.join(' '));
  assert.ok(!['hebe_wartung_mfh', 'ext_service', 'fuel_awsv_sv_de', 'psk_ch', 'gen_test_ch', 'drytoilet', 'drain_shafts'].some((x) => t.includes(x)));
  assert.ok(pl.tasks.every((x) => !x.guide) && pl.notes.every((n) => !/^CH/.test(n.de)));
  // Termine ab Inbetriebnahme, Monatsende bleibt Monatsende
  const g = pl.tasks.find((x) => x.t.id === 'gen_test'), h = pl.tasks.find((x) => x.t.id === 'hebe_wartung_efh');
  assert.equal(g.months, 1); assert.equal(g.first, '2027-02-28'); assert.equal(h.first, '2028-01-31'); assert.equal(pl.nextDue, '2027-02-28');
  assert.equal(W.plan(p, BP.calc.run(p), { today: new Date('2027-06-10T00:00:00Z') }).tasks.find((x) => x.t.id === 'gen_test').next, '2027-06-30');
  // Kalenderdatei: CRLF, Zeilen ≤ 75 Oktette, je Aufgabe mit Intervall ein Termin mit Wiederholung
  const ics = W.ics(pl, Object.assign({ uid: 'x1' }, p), { now: today }), lines = ics.split('\r\n');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n') && !/[^\r]\n/.test(ics));
  assert.ok(lines.every((l) => Buffer.byteLength(l, 'utf8') <= 75));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, pl.tasks.filter((x) => x.months).length);
  assert.ok(ics.includes('UID:x1-gen_test@bunkerplaner') && ics.includes('RRULE:FREQ=MONTHLY;INTERVAL=1') && ics.includes('RRULE:FREQ=YEARLY;INTERVAL=1') && ics.includes('DTSTART;VALUE=DATE:20270228'));
  // größere Anlage: Hebeanlage halbjährlich; Dränage; Trockentoilette statt Hebeanlage
  p.use.people = 30; p.build.drainage = true; t = ids(W.plan(p, BP.calc.run(p), { today }));
  assert.ok(t.includes('hebe_wartung_mfh') && !t.includes('hebe_wartung_efh') && t.includes('drain_shafts'));
  p.tech.sewer = 'trocken'; t = ids(W.plan(p, BP.calc.run(p), { today }));
  assert.ok(t.includes('drytoilet') && !t.some((x) => /^hebe_|^backflow/.test(x)));
  // Schweiz: periodische Schutzraumkontrolle, Probelauf 6× im Jahr ersetzt den allgemeinen Probelauf
  const ch = fresh(); BP.model.setCountry(ch, 'CH'); t = ids(W.plan(ch, BP.calc.run(ch), { today }));
  assert.ok(t.includes('psk_ch') && t.includes('gen_test_ch') && !t.includes('gen_test') && !t.includes('ext_service_de') && t.includes('ext_service'));
  // USA: eigene Fassungen; Hebeanlage ohne US-Regel → deutsche Regel als Anhalt
  const us = fresh(); BP.model.setCountry(us, 'US'); pl = W.plan(us, BP.calc.run(us), { today }); t = ids(pl);
  assert.ok(t.includes('gen_test_us') && t.includes('elec_rcd_us') && !t.includes('elec_rcd') && t.includes('ext_service_us') && t.includes('radon_retest_us'));
  assert.ok(pl.tasks.filter((x) => x.comp === 'hebe').length > 0 && pl.tasks.filter((x) => x.comp === 'hebe').every((x) => x.guide));
  // Inbetriebnahme ohne Angabe: Ende des Bauablaufs; ungültiges Datum fällt beim Import weg
  const q0 = BP.calc.run(fresh());
  assert.equal(W.plan(fresh(), q0, { today }).start, q0.schedule.dates[q0.schedule.dates.length - 1]);
  assert.equal(BP.model.normalize(Object.assign(fresh(), { ops: { start: '31.01.2027' } })).ops.start, '');
});
test('Varianten: Kennwerte, Stand ohne Varianten, Import prüft jeden Stand und begrenzt die Anzahl', () => {
  const VA = BP.varianten, p = fresh(), q = BP.calc.run(p), m = VA.metrics(p, q);
  assert.deepEqual(Object.keys(m).sort(), BP.model.VARIANT_KEYS.slice().sort());
  assert.ok(m.cost === q.summary.cost && m.concrete === q.summary.concrete && m.people === 6 && m.radonQ > 0);
  assert.equal(VA.value(VA.ROWS.find((r) => r.k === 'costPP'), m), m.cost / 6);
  p.uid = 'abc123'; p.variants = [{ id: 'v1', name: 'A', created: '2026-10-16T10:00:00.000Z', snap: VA.snapshot(p), m }];
  const s2 = VA.snapshot(p); assert.ok(!('variants' in s2) && !('uid' in s2));
  // Import: gültige Stände bleiben, kaputte fallen weg, Werte werden begrenzt, höchstens 8
  const raw = JSON.parse(JSON.stringify(p));
  raw.variants.push({ name: 'kaputt', snap: 'x' }, { name: '<b>B</b>', snap: Object.assign(VA.snapshot(p), { build: Object.assign({}, p.build, { tWall: 9 }) }), m: { cost: 'viel', concrete: 5 } });
  for (let i = 0; i < 10; i++) raw.variants.push({ name: 'V' + i, snap: VA.snapshot(p) });
  const n = BP.model.normalize(raw);
  assert.equal(n.variants.length, BP.model.VARIANTS_MAX); assert.equal(n.variants[0].m.cost, m.cost);
  const b = n.variants.find((v) => v.name === '<b>B</b>');
  assert.ok(b && b.snap.build.tWall <= 1.5 && b.m.cost === null && b.m.concrete === 5 && b.snap.variants === undefined);
  assert.ok(VA.same(n.variants[0].snap, VA.snapshot(BP.model.normalize(JSON.parse(JSON.stringify(Object.assign({}, p, { variants: [] })))))));
  assert.equal(VA.describe(p).dims, 'Wand 35 · Decke 40 · Platte 40 cm');
});
console.log(count+' fachliche Regressionstests bestanden.');
