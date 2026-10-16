/* Länder und Regionen: Auswahlliste, Währung und Preisniveau (Umrechnung der deutschen Richtpreise), Wechselkurse,
 * Höhenbezug für Zeichnungen, Klima-Startwerte und Feiertage. Länderwerte stehen in laender-daten.js, Feiertage in
 * feiertage-daten.js. Richtpreise des Programms gelten für Deutschland in Euro; für ein anderes Land werden sie mit
 * dem Baupreisniveau (relativ zu Deutschland) und dem Wechselkurs umgerechnet. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const I18 = BP.i18n, T_ = I18.T, N_ = I18.N;
  const D = () => BP.laenderDaten || { countries: {}, fx: { rates: {} } };
  const has = Object.prototype.hasOwnProperty;

  /* Namen der Regionen (Feiertage und Bauordnung) für die wichtigsten Länder; sonst wird der Code gezeigt */
  const REGION_NAMES = {
    AT: { 1: 'Burgenland', 2: 'Kärnten', 3: 'Niederösterreich', 4: 'Oberösterreich', 5: 'Salzburg', 6: 'Steiermark', 7: 'Tirol', 8: 'Vorarlberg', 9: 'Wien' },
    CH: { AG: 'Aargau', AI: 'Appenzell Innerrhoden', AR: 'Appenzell Ausserrhoden', BE: 'Bern', BL: 'Basel-Landschaft', BS: 'Basel-Stadt', FR: 'Fribourg', GE: 'Genève', GL: 'Glarus', GR: 'Graubünden', JU: 'Jura', LU: 'Luzern', NE: 'Neuchâtel', NW: 'Nidwalden', OW: 'Obwalden', SG: 'St. Gallen', SH: 'Schaffhausen', SO: 'Solothurn', SZ: 'Schwyz', TG: 'Thurgau', TI: 'Ticino', UR: 'Uri', VD: 'Vaud', VS: 'Valais', ZG: 'Zug', ZH: 'Zürich' },
    ES: { AN: 'Andalucía', AR: 'Aragón', AS: 'Asturias', CB: 'Cantabria', CE: 'Ceuta', CL: 'Castilla y León', CM: 'Castilla-La Mancha', CN: 'Canarias', CT: 'Cataluña', EX: 'Extremadura', GA: 'Galicia', IB: 'Illes Balears', MC: 'Región de Murcia', MD: 'Comunidad de Madrid', ML: 'Melilla', NC: 'Navarra', PV: 'País Vasco', RI: 'La Rioja', VC: 'Comunitat Valenciana' },
    GB: { ENG: 'England', NIR: 'Northern Ireland', SCT: 'Scotland', WLS: 'Wales' },
    CA: { AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Québec', SK: 'Saskatchewan', YT: 'Yukon' },
    AU: { ACT: 'Australian Capital Territory', NSW: 'New South Wales', NT: 'Northern Territory', QLD: 'Queensland', SA: 'South Australia', TAS: 'Tasmania', VIC: 'Victoria', WA: 'Western Australia' },
    US: { AK: 'Alaska', AL: 'Alabama', AR: 'Arkansas', AS: 'American Samoa', AZ: 'Arizona', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DC: 'District of Columbia', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', GU: 'Guam', HI: 'Hawaii', IA: 'Iowa', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', MA: 'Massachusetts', MD: 'Maryland', ME: 'Maine', MI: 'Michigan', MN: 'Minnesota', MO: 'Missouri', MP: 'Northern Mariana Islands', MS: 'Mississippi', MT: 'Montana', NC: 'North Carolina', ND: 'North Dakota', NE: 'Nebraska', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NV: 'Nevada', NY: 'New York', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UM: 'U.S. Minor Outlying Islands', UT: 'Utah', VA: 'Virginia', VI: 'U.S. Virgin Islands', VT: 'Vermont', WA: 'Washington', WI: 'Wisconsin', WV: 'West Virginia', WY: 'Wyoming' },
  };

  const valid = (c) => typeof c === 'string' && has.call(D().countries, c);
  const info = (c) => (valid(c) ? D().countries[c] : D().countries.DE || { cur: 'EUR', fam: 'EC' });
  let dn = null, dnLoc = '';
  function name(c) {
    const loc = I18.locale();
    if (dnLoc !== loc) { dnLoc = loc; try { dn = typeof Intl !== 'undefined' && Intl.DisplayNames ? new Intl.DisplayNames([loc], { type: 'region' }) : null; } catch (e) { dn = null; } }
    try { return (dn && dn.of(c)) || c; } catch (e) { return c; }
  }
  /* Länder alphabetisch nach dem Namen in der Anzeigesprache */
  function list() {
    const loc = I18.locale();
    return Object.keys(D().countries).map((c) => [c, name(c)]).sort((a, b) => a[1].localeCompare(b[1], loc));
  }
  /* Regionen eines Landes: Deutschland aus dem Baukalender (Feiertage je Bundesland), sonst aus den Feiertagsdaten */
  function regions(c) {
    if (c === 'DE') return Object.entries(BP.kalender.STATES).filter(([k]) => k !== 'DE').map(([k, v]) => [k, v]);
    const fd = BP.feiertageDaten && BP.feiertageDaten[c];
    const names = REGION_NAMES[c] || {};
    return (fd ? fd.r : Object.keys(names)).map((k) => [k, names[k] || k]).sort((a, b) => a[1].localeCompare(b[1], I18.locale()));
  }
  const country = (p) => (p && p.site && valid(p.site.country) ? p.site.country : 'DE');
  const currency = (p) => (p && p.costs && /^[A-Z]{3}$/.test(p.costs.currency || '') ? p.costs.currency : info(country(p)).cur || 'EUR');
  /* Wechselkurs: Einheiten der Währung je Euro (Eingabe im Projekt, sonst abgerufener Kurs, sonst Stand der Länderdaten) */
  let live = null;
  function setLive(r) { live = r && r.rates ? r : null; }
  function fxInfo(cur, p) {
    if (cur === 'EUR') return { rate: 1, src: 'EUR', date: null };
    if (p && p.costs && p.costs.fx > 0) return { rate: p.costs.fx, src: 'manual', date: null };
    if (live && live.rates[cur] > 0) return { rate: live.rates[cur], src: live.src || 'live', date: live.date };
    const r = D().fx.rates[cur];
    if (r) return { rate: Array.isArray(r) ? r[0] : r, src: Array.isArray(r) ? r[1] : 'ECB', date: Array.isArray(r) && r[1] !== 'ECB' ? D().fx.altDate : D().fx.date };
    return { rate: null, src: 'none', date: null };
  }
  /* Baupreisniveau relativ zu Deutschland (gleiche Währungsbasis) */
  function pli(p) {
    if (p && p.costs && p.costs.pli > 0) return { value: p.costs.pli, src: 'manual' };
    const v = info(country(p)).pli;
    return v ? { value: v, src: 'table' } : { value: 1, src: 'none' };
  }
  /* Umrechnung der deutschen Richtpreise (EUR) in Projektwährung und Preisniveau des Landes */
  function factor(p) {
    const c = country(p), cur = currency(p);
    if (c === 'DE' && cur === 'EUR' && !(p && p.costs && p.costs.pli > 0)) return 1;
    const fx = fxInfo(cur, p);
    return pli(p).value * (fx.rate || 1);
  }
  /* Anzeige von Geldbeträgen in der Währung des zuletzt gerechneten Projekts. Beträge der Rechnung sind intern Euro und
   * werden mit dem Wechselkurs umgerechnet (show); Angebote im Einkauf sind schon in Projektwährung (money). */
  let active = 'EUR', fxA = 1;
  const setActive = (cur, fx) => { active = /^[A-Z]{3}$/.test(cur || '') ? cur : 'EUR'; fxA = fx > 0 ? fx : 1; };
  const show = (v, dec) => money(typeof v === 'number' ? v * fxA : v, active, dec);
  function money(v, cur, dec) {
    const c = cur || active, d = dec == null ? 0 : dec;
    if (typeof v !== 'number' || !isFinite(v)) return '–';
    try { return v.toLocaleString(I18.locale(), { style: 'currency', currency: c, minimumFractionDigits: d, maximumFractionDigits: d }); } catch (e) { return I18.num(v, d) + ' ' + c; }
  }
  function sym(cur) {
    const c = cur || active;
    try {
      const parts = new Intl.NumberFormat(I18.locale(), { style: 'currency', currency: c, currencyDisplay: 'symbol' }).formatToParts(1);
      const x = parts.find((q) => q.type === 'currency');
      return x ? x.value : c;
    } catch (e) { return c; }
  }
  const datum = (p) => info(country(p)).datum || T_('m ü. Meer');
  /* Klima-Startwerte: abgerufene Werte am Standort, sonst Hauptstadt des Landes, sonst (und für Deutschland) die deutschen
   * Mittelwerte des Baukalenders, damit deutsche Projekte unverändert rechnen */
  function climate(p) {
    const cl = p && p.site && p.site.climate;
    if (cl && Array.isArray(cl.temps) && cl.temps.length === 12) return { temps: cl.temps, src: 'site', station: cl.source || '' };
    const c = country(p), i = info(c);
    if (c !== 'DE' && i.climate) return { temps: i.climate, src: 'country', station: i.station || '' };
    return { temps: BP.kalender.TEMPS, src: 'default', station: '' };
  }
  /* Startwerte der Haustechnik aus dem Klima: Erdreich ≈ Jahresmittel, Außenluft im Sommer ≈ wärmster Monat + 12,5 K
   * (für Berlin 19,6 + 12,5 ≈ 32 °C wie die bisherige Vorgabe) */
  function techFromClimate(temps) {
    const mean = temps.reduce((s, x) => s + x, 0) / 12, warm = Math.max(...temps);
    return { tSoil: Math.max(0, Math.min(25, Math.round(mean))), tOutSummer: Math.max(20, Math.min(45, Math.round(warm + 12.5))) };
  }
  /* Startwerte der Haustechnik für ein Projekt: ohne Klimadaten die bisherigen Vorgaben (Erdreich 10 °C, Sommer 32 °C) */
  function techStart(p) {
    const cl = climate(p);
    return cl.src === 'default' ? { tSoil: 10, tOutSummer: 32 } : techFromClimate(cl.temps);
  }
  /* Feiertage eines Jahres für Land und Region aus den Feiertagsdaten (2026–2040) */
  function holidays(c, region, y) {
    const fd = BP.feiertageDaten && BP.feiertageDaten[c], out = new Map();
    if (!fd || !fd.y[y]) return null;
    const put = (s) => { for (let i = 0; i + 6 <= s.length; i += 6) out.set(y + '-' + s.slice(i, i + 2) + '-' + s.slice(i + 2, i + 4), fd.n[parseInt(s.slice(i + 4, i + 6), 16)]); };
    put(fd.y[y]);
    if (region && fd.s[region] && fd.s[region][y]) put(fd.s[region][y]);
    return out;
  }
  const family = (p) => (p && p.code && p.code.family) || info(country(p)).fam || 'EC';

  BP.laender = { REGION_NAMES, valid, info, name, list, regions, country, currency, fxInfo, setLive, pli, factor, money, show, sym, setActive, active: () => active, fx: () => fxA, datum, climate, techFromClimate, techStart, holidays, family };
  void N_;
})(typeof window !== 'undefined' ? window : globalThis);
