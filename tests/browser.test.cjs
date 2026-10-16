// Portabel: Playwright aus node_modules (npm install) oder PLAYWRIGHT_MODULE; Browser über BP_BROWSER_CHANNEL / BP_BROWSER.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function loadPlaywright(){
 for(const id of [process.env.PLAYWRIGHT_MODULE,'playwright','playwright-core'].filter(Boolean)){
  try{return require(id);}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
 }
 console.error('Playwright fehlt: "npm install" ausführen oder PLAYWRIGHT_MODULE=<Pfad> setzen.');process.exit(2);
}
const { chromium } = loadPlaywright();
const BASE=process.env.BP_BASE_URL||'http://127.0.0.1:8874/';
const LIVE=process.env.BP_LIVE_PRICE==='1'; // 1 = echter bausep-Abruf (Netz, aktueller Preis); sonst Testantwort
const launchOptions={headless:process.env.BP_HEADED!=='1'};
if(process.env.BP_BROWSER) launchOptions.executablePath=process.env.BP_BROWSER;      // z. B. Pfad zu msedge.exe
else if(process.env.BP_BROWSER_CHANNEL) launchOptions.channel=process.env.BP_BROWSER_CHANNEL; // z. B. msedge, chrome
const artifacts=path.resolve(process.env.BP_ARTIFACTS||path.join(__dirname,'../.runtime/planning-qa'));fs.mkdirSync(artifacts,{recursive:true});
const PRICE={product:'Sopro Kellerdicht 2-K KD 754, 30 l',sku:'005030002001001010',ean:'4005734754300',gross:85.3,currency:'EUR',vat:19,
 url:'https://www.bausep.de/sopro-kellerdicht-2-k-kd-754-30-l.html',supplier:'bausep',availability:'',leadTime:null,validUntil:'',
 scope:'Testantwort (kein Live-Abruf)',fetchedAt:new Date().toISOString()};
(async()=>{
 const browser=await chromium.launch(launchOptions);
 try {
 const context=await browser.newContext({viewport:{width:1550,height:1000},acceptDownloads:true,locale:'de-DE'}),errors=[];
 if(!LIVE) await context.route(/\/api\/product-price\?/,route=>route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:JSON.stringify(PRICE)}));
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(BASE);await page.waitForFunction(()=>window.BP?.app?.q?.planning);
 assert.equal(await page.evaluate(()=>BP.app.q.geo.A),65);
 await page.evaluate(()=>BP.app.setStep('schutz'));
 await page.locator('[data-plan-action="add-scenario"]').click();
 await page.locator('[data-planning="scenarios.0.weapon"]').selectOption('geran4_90');
 assert.equal(await page.evaluate(()=>BP.app.p.planning.scenarios[0].tnt),null);
 await page.locator('[data-planning="scenarios.0.mode"]').selectOption('air');
 const fill=async(path,value)=>{const field=page.locator('[data-planning="'+path+'"]');await field.fill(value);await field.dispatchEvent('change');};
 await fill('scenarios.0.distance','10');await fill('scenarios.0.tnt','10');await fill('scenarios.0.loadSource','Testmodell: ideale TNT-Ladung, kein Waffenwirkungsnachweis');await fill('scenarios.0.hits','2');
 assert.ok(await page.evaluate(()=>BP.app.q.planning.threats[0].model.pressure>0));
 await fill('scenarios.0.report.reference','Nur ein Titel');
 assert.equal(await page.evaluate(()=>BP.panels.autoDone(BP.app.q).special),false);
 await page.screenshot({path:path.join(artifacts,'schutz-desktop.png')});
 await page.evaluate(()=>BP.app.commit(p=>{p.site.query='45127 Essen';p.site.label='45127 Essen, Nordrhein-Westfalen';p.site.waterMode='tiefe';p.site.waterDepth=2;p.build.waterproofing='pmbc';}));
 await page.evaluate(()=>BP.app.setView('einkauf'));
 assert.ok((await page.locator('#view-einkauf').innerText()).includes('45127 Essen'));
 const line=await page.evaluate(()=>BP.app.q.planning.procurement.rows.find(l=>l.key==='abd_pmbc').id);
 await page.locator('[data-proc-line]').selectOption(line);
 await page.locator('[data-plan-action="example-sopro"]').click();
 await page.locator('[data-plan-action="refresh-offer"]').click();
 await page.waitForFunction(id=>BP.app.p.planning.procurement.offers[id].note.includes('Abruf:'),line,{timeout:25000});
 assert.equal(await page.evaluate(id=>BP.app.p.planning.procurement.offers[id].gross,line),85.3);
 await page.locator('[data-plan-action="record-offer"]').click();
 assert.equal(await page.evaluate(id=>BP.app.q.planning.procurement.rows.find(l=>l.id===id).checked,line),true);
 await fill('delivery.0.shipping','79.50');await fill('delivery.0.date','2026-10-10');await fill('delivery.0.reference','Testangebot: Lieferung Essen für aktuellen Warenkorb');await fill('delivery.0.days','5 Arbeitstage');
 await page.locator('[data-plan-action="record-delivery"]').click();
 assert.equal(await page.evaluate(()=>BP.app.q.planning.procurement.vendors[0].current),true);
 await page.screenshot({path:path.join(artifacts,'einkauf-desktop.png')});
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-plan-action="procurement-csv"]').click()]);
 await download.saveAs(path.join(artifacts,'einkauf.csv'));assert.ok(fs.readFileSync(path.join(artifacts,'einkauf.csv'),'utf8').includes('bausep'));
 await page.evaluate(()=>BP.app.commit(p=>{p.site.query='50667 Köln';p.site.label='50667 Köln, Nordrhein-Westfalen';}));
 assert.equal(await page.evaluate(()=>BP.app.q.planning.procurement.vendors[0].current),false);
 assert.equal(await page.evaluate(id=>BP.app.q.planning.procurement.rows.find(l=>l.id===id).checked,line),false);
 await page.evaluate(()=>BP.app.undo());assert.equal(await page.evaluate(()=>BP.app.q.planning.procurement.vendors[0].current),true);
 await page.evaluate(()=>{window.print=()=>{};BP.exporter.report();});
 assert.ok((await page.locator('#report').textContent()).includes('Konkrete Produktangebote'));
 assert.ok((await page.locator('#report').textContent()).includes('Nur ein Titel'));
 // Statische Berechnung: A4-Seiten mit Inhaltsverzeichnis, ohne abgeschnittenen Inhalt; Bewehrungspläne
 const sr=await page.evaluate(()=>{window.print=()=>{};BP.exporter.statik();const r=document.getElementById('report');return {pages:r.querySelectorAll('.srp').length,toc:[...r.querySelectorAll('td.pg')].every(t=>/^\d+$/.test(t.textContent)),over:[...r.querySelectorAll('.srp .bd')].filter(b=>b.scrollHeight>b.clientHeight+2).length,text:r.textContent};});
 assert.ok(sr.pages>=8&&sr.toc&&sr.over===0&&/Zusammenstellung der Nachweise/.test(sr.text)&&/Grundbruch nach DIN 4017/.test(sr.text)&&!/NaN|undefined/.test(sr.text),JSON.stringify({pages:sr.pages,toc:sr.toc,over:sr.over}));
 assert.ok(await page.evaluate(()=>{window.print=()=>{};BP.exporter.plans();return document.querySelectorAll('#report .sheet svg').length>=4;}));
 assert.equal(await page.evaluate(()=>BP.app.view),'einkauf');
 await page.waitForTimeout(450);await page.reload();await page.waitForFunction(()=>window.BP?.app?.q?.planning);
 assert.equal(await page.evaluate(()=>BP.app.p.planning.scenarios.length),1);
 await page.evaluate(()=>BP.app.setView('einkauf'));
 assert.equal(await page.evaluate(()=>BP.app.q.planning.procurement.vendors[0].current),true);
 for (const width of [390,320]) {
   await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(artifacts,'einkauf-'+width+'.png'),fullPage:true});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
   if(overflow>1) console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&!e.closest('.planning-table-wrap,#steps,#views');}).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,65)})).slice(0,14)));
   assert.ok(overflow<=1,'Seitenüberlauf bei '+width+': '+overflow);
 }
 await page.setViewportSize({width:1550,height:1000});
 for(const step of ['standort','nutzung','grundriss','konstruktion','schutz','statik','technik','material','ablauf','varianten','bauantrag','freigabe','betrieb']) await page.evaluate(s=>BP.app.setStep(s),step);
 await page.evaluate(()=>BP.app.setView('3d'));await page.waitForTimeout(300);
 await page.evaluate(()=>BP.app.setStep('schutz'));
 const active=page.locator('[data-planning="scenarios.0.variant"]');await active.fill('Noch nicht bestätigte Eingabe');
 await page.evaluate(()=>BP.app.newProject());await page.waitForTimeout(50);
 assert.equal(await page.evaluate(()=>BP.app.p.planning.scenarios.length),0);
 // Bauantrag: Verfahren je Land, Formularprüfung und Ausfüllen (amtliches PDF als feste Testantwort mit Formularfeldern), Bauvorlagen
 const {PDFDocument}=require(path.join(__dirname,'../vendor/pdf-lib.min.js'));
 const tdoc=await PDFDocument.create(),tpg=tdoc.addPage([595,842]),tform=tdoc.getForm();
 for(const [n,y] of [['Bauherr_Name',700],['Gemarkung',660],['Flurstueck',620],['Bezeichnung des Vorhabens',580]]) tform.createTextField(n).addToPage(tpg,{x:50,y,width:300,height:20});
 const tpdf=Buffer.from(await tdoc.save());
 await context.route(/\/api\/form\?/,route=>route.fulfill({status:200,contentType:'application/pdf',body:tpdf}));
 await context.route(/\/api\/form-check\?/,route=>route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:JSON.stringify({url:'x',pdf:true,size:tpdf.length,sha256:'a'.repeat(64),lastModified:'',type:'application/pdf',checked:'2026-10-16'})}));
 await page.evaluate(()=>{BP.app.commit(p=>{p.site.region='BY';p.permit.zone='bplan';p.permit.bauherr.name='Testbauherr';p.permit.plot.gemarkung='Musterdorf';});BP.app.setStep('bauantrag');});
 assert.ok((await page.textContent('#panel')).includes('Genehmigungsfreistellung (Art. 58 BayBO)'),'Verfahren Bayern fehlt');
 await page.locator('[data-act="formCheck"]').first().click();await page.waitForFunction(()=>Object.keys(BP.app.p.permit.formChecks).length===1);
 await page.locator('[data-act="formFill"]').first().click();await page.waitForFunction(()=>BP.app.ui.ff&&BP.app.ui.ff.fields.length===4,null,{timeout:30000});
 assert.equal(await page.evaluate(()=>[BP.app.ui.ff.map[0],BP.app.ui.ff.map[1]].join()),'bauherr.name,plot.gemarkung');
 const [ffdl]=await Promise.all([page.waitForEvent('download'),page.click('[data-act="formFillSave"]')]);
 assert.equal((await PDFDocument.load(fs.readFileSync(await ffdl.path()))).getForm().getTextField('Bauherr_Name').getText(),'Testbauherr');
 assert.ok(await page.evaluate(()=>{window.print=()=>{};BP.exporter.bauantrag();const t=document.getElementById('report').textContent;return t.includes('Baubeschreibung')&&t.includes('DIN 277')&&t.includes('Testbauherr')&&!/NaN|undefined/.test(t);}),'Bauvorlagen unvollständig');
 await page.screenshot({path:path.join(artifacts,'bauantrag.png')});
 await page.evaluate(()=>{BP.app.ui.ff=null;BP.app.newProject();});await page.waitForTimeout(50);
 // IFC-Modell: Download mit Bauteilen, Räumen und stabilen Kennungen
 await page.waitForFunction(()=>!BP.app.fePending(),null,{timeout:120000});
 await page.click('#exportBtn');
 const [ifcdl]=await Promise.all([page.waitForEvent('download'),page.click('[data-export="ifc"]')]);
 const ifc=fs.readFileSync(await ifcdl.path(),'utf8');
 assert.ok(ifcdl.suggestedFilename().endsWith('.ifc')&&ifc.includes("FILE_SCHEMA(('IFC4'));")&&ifc.includes('IFCSLAB(')&&ifc.includes('IFCWALL(')&&ifc.includes('IFCSPACE(')&&ifc.includes('IFCDOOR('),'IFC unvollständig');
 const uid1=await page.evaluate(()=>BP.app.p.uid);assert.ok(/^p[0-9a-z]+$/.test(uid1),'Projektkennung fehlt');
 // Radon: Eingabe am Standort, Bewertung und Maßnahmen in der Konstruktion
 await page.evaluate(()=>BP.app.setStep('standort'));
 await page.fill('input[data-path="site.radon.soil"]','150');await page.press('input[data-path="site.radon.soil"]','Tab');
 await page.locator('select[data-path="site.radon.area"]').selectOption('ja');
 assert.deepEqual(await page.evaluate(()=>[BP.app.p.site.radon.soil,BP.app.p.site.radon.area,BP.app.q.radon.soil]),[150,'ja',150]);
 await page.evaluate(()=>BP.app.setStep('konstruktion'));
 assert.ok((await page.textContent('#panel')).includes('Radonschutz')&&(await page.textContent('#panel')).includes('§ 154 StrlSchV'),'Radonschutz fehlt');
 await page.check('input[data-path="build.radon.sump"]');assert.equal(await page.evaluate(()=>BP.app.p.build.radon.sump),true);
 // Varianten: speichern, vergleichen, übernehmen, Rückgängig
 await page.evaluate(()=>BP.app.setStep('varianten'));
 await page.fill('#varName','Ausgang');await page.click('[data-act="varSave"]');
 await page.waitForFunction(()=>!BP.app.fePending(),null,{timeout:120000});
 await page.evaluate(()=>BP.app.commit(p=>{p.build.tRoof=0.5;}));await page.waitForFunction(()=>!BP.app.fePending(),null,{timeout:120000});
 await page.fill('#varName','Decke 50');await page.click('[data-act="varSave"]');
 assert.equal(await page.evaluate(()=>BP.app.p.variants.map(v=>v.name).join()),'Ausgang,Decke 50');
 assert.ok(await page.evaluate(()=>BP.app.p.variants[1].m.concrete>BP.app.p.variants[0].m.concrete),'Kennwerte der Varianten');
 assert.ok((await page.textContent('#panel')).includes('Decke 50')&&!/NaN|undefined/.test(await page.textContent('#panel')));
 await page.click('[data-act="varLoad"][data-i="0"]');
 assert.deepEqual(await page.evaluate(()=>[BP.app.p.build.tRoof,BP.app.p.variants.length,BP.app.p.uid]),[0.4,2,uid1]);
 await page.evaluate(()=>BP.app.undo());assert.equal(await page.evaluate(()=>BP.app.p.build.tRoof),0.5);
 const [vcsv]=await Promise.all([page.waitForEvent('download'),page.click('[data-act="varCsv"]')]);
 assert.ok(fs.readFileSync(await vcsv.path(),'utf8').includes('Decke 50'),'Vergleich als CSV');
 await page.screenshot({path:path.join(artifacts,'varianten.png')});
 // Betrieb & Wartung: Aufgaben, Kalenderdatei
 await page.evaluate(()=>BP.app.setStep('betrieb'));
 assert.ok((await page.textContent('#panel')).includes('Hebeanlage durch Fachkundigen warten lassen'),'Wartungsplan unvollständig');
 const [ics]=await Promise.all([page.waitForEvent('download'),page.click('[data-act="wartungIcs"]')]);
 const icsT=fs.readFileSync(await ics.path(),'utf8');
 assert.ok(icsT.startsWith('BEGIN:VCALENDAR')&&icsT.includes('RRULE:FREQ=')&&icsT.includes('UID:'+uid1+'-'),'Kalenderdatei');
 assert.ok(await page.evaluate(()=>{window.print=()=>{};BP.exporter.wartungPrint();const t=document.getElementById('report').textContent;return t.includes('Wartungsplan')&&!/NaN|undefined/.test(t);}),'Wartungsplan drucken');
 await page.screenshot({path:path.join(artifacts,'betrieb.png')});
 await page.evaluate(()=>BP.app.newProject());await page.waitForTimeout(50);
 // Länder: USA und Schweiz über die Auswahl, Währung und Regionen in der Oberfläche, zurück nach Deutschland
 await page.waitForFunction(()=>!BP.app.fePending(),null,{timeout:120000});
 const totalDE=await page.evaluate(()=>BP.app.q.summary.cost);
 await page.evaluate(()=>BP.app.setStep('standort'));
 await page.locator('select[data-path="site.country"]').selectOption('US');
 assert.equal(await page.evaluate(()=>[BP.app.p.site.country,BP.app.p.costs.vat,BP.app.q.country.cur].join()),'US,0,USD');
 assert.equal(await page.evaluate(()=>[BP.app.q.norm.code,BP.app.p.build.cnom].join()),'ACI,0.05');
 assert.ok((await page.textContent('#panel')).includes('ACI 318-19'),'ACI-Hinweis fehlt');
 assert.ok(await page.locator('select[data-path="site.region"] option[value="CA"]').count()===1,'US-Bundesstaaten fehlen');
 await page.locator('select[data-path="site.region"]').selectOption('TX');
 // Erdbeben USA: SDS von Hand bzw. Abruf bei USGS (im Test über eine feste Antwort)
 await context.route(/\/api\/seismic-us\?/,route=>route.fulfill({status:200,contentType:'application/json; charset=utf-8',body:JSON.stringify({sds:1.04,sd1:0.62,pgam:0.71,sms:1.56,sm1:0.93,tl:8,sdc:'D',siteClass:'Default',riskCategory:'III',source:'USGS Seismic Design Web Services, ASCE/SEI 7-22',fetched:'2026-10-16',lat:30.27,lon:-97.74})}));
 const sdsIn=page.locator('input[data-path="site.seismic.sds"]');await sdsIn.fill('1');await sdsIn.dispatchEvent('change');
 assert.equal(await page.evaluate(()=>{const e=BP.app.q.verify.eq;return e?[e.kind,e.sdc].join():'';}),'ASCE7,D');
 if(await page.evaluate(()=>BP.app.p.site.lat!=null)){await page.click('[data-act="usgs"]');await page.waitForFunction(()=>BP.app.p.site.seismic.usgs!=null);assert.equal(await page.evaluate(()=>BP.app.p.site.seismic.sd1),0.62);}
 await page.evaluate(()=>BP.app.setStep('material'));
 assert.ok((await page.textContent('#panel')).includes('$'),'Dollarbeträge fehlen');
 await page.evaluate(()=>BP.app.setStep('ablauf'));
 assert.equal(await page.evaluate(()=>BP.app.q.schedule.country+'/'+BP.app.q.schedule.region),'US/TX');
 await page.evaluate(()=>BP.app.setStep('statik'));
 await page.waitForFunction(()=>!BP.app.fePending(),null,{timeout:120000});
 assert.ok((await page.textContent('#panel')).includes('IBC 2024 Tab. 1806.2'),'Sohlpressung nach IBC fehlt');
 await page.evaluate(()=>BP.app.setStep('standort'));
 await page.locator('select[data-path="site.country"]').selectOption('CH');
 assert.equal(await page.evaluate(()=>BP.app.q.country.cur),'CHF');
 assert.equal(await page.evaluate(()=>BP.app.q.norm.code),'SIA');
 assert.ok((await page.textContent('#panel')).includes('SIA 260–267'),'SIA-Hinweis fehlt');
 await page.locator('select[data-path="site.country"]').selectOption('AT');
 assert.equal(await page.evaluate(()=>[BP.app.q.norm.na,BP.app.q.mat.fcd].join()),'AT,20');
 assert.ok((await page.textContent('#panel')).includes('nationalem Anhang AT'),'Normhinweis fehlt');
 await page.locator('select[data-path="site.country"]').selectOption('DE');
 await page.waitForFunction(()=>!BP.app.fePending(),null,{timeout:120000});
 assert.equal(await page.evaluate(()=>[BP.app.p.site.country,BP.app.p.costs.vat,BP.app.q.country.cur,BP.app.p.tech.tSoil,BP.app.p.tech.tOutSummer].join()),'DE,19,EUR,10,32');
 assert.ok(Math.abs(await page.evaluate(()=>BP.app.q.summary.cost)-totalDE)<=Math.max(5,totalDE*1e-4),'Deutschland nach Länderwechsel nicht unverändert');
 await page.screenshot({path:path.join(artifacts,'land-de.png')});
 // Sprachen: Englisch und Spanisch ohne fehlende Übersetzungen, schmale Ansicht ohne Überlauf, zurück auf Deutsch
 for (const lang of ['en','es']) {
   await page.evaluate((l)=>{BP.i18n.missing.clear();BP.app.setLang(l);},lang);
   for(const step of ['standort','nutzung','schutzgrad','grundriss','konstruktion','statik','schutz','technik','material','ablauf','varianten','bauantrag','freigabe','betrieb']) { await page.evaluate(s=>BP.app.setStep(s),step); await page.waitForFunction(()=>!BP.app.fePending(),null,{timeout:120000}); }
   for(const v of ['plan','schnitt','liste','einkauf','gantt']) await page.evaluate(x=>BP.app.setView(x),v);
   assert.equal(await page.evaluate(()=>document.documentElement.lang),lang);
   assert.equal(await page.textContent('#saveProject'),lang==='en'?'Save':'Guardar');
   assert.deepEqual(await page.evaluate(()=>[...BP.i18n.missing]),[],lang+': fehlende Übersetzungen');
   await page.setViewportSize({width:390,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)<=1,lang+': Seitenüberlauf');
   await page.setViewportSize({width:1550,height:1000});
 }
 await page.evaluate(()=>BP.app.setLang('de'));
 assert.equal(await page.textContent('#saveProject'),'Speichern');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'Browserablauf bestanden',checks:['Szenarien/Modell','keine Titelfreigabe','Livepreis','Adresse/Planänderung','Gebinde/Lieferung','CSV/Bericht','Undo/Persistenz','320/390 px','alle Schritte/3D','Bauantrag (Verfahren, Formular ausfüllen, Bauvorlagen)','IFC/Radon/Varianten/Wartung','Länder US (ACI, Erdbeben)/CH/AT/DE','Sprachen EN/ES'],artifacts}));
 await context.close();
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
