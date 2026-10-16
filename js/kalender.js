/* Baukalender: Arbeitstage ohne Wochenenden, gesetzliche Feiertage (bundesweit und je Bundesland) und Winterpause;
 * Monatsmittel der Lufttemperatur (Richtwerte Deutschland) für die Reifegradrechnung des Betons (Nurse-Saul:
 * wirksames Alter bei 20 °C = Σ (T + 10) / 30 je Kalendertag, T ≥ −10 °C). */
(function (root) {
  const BP = root.BP = root.BP || {};
  const T_ = BP.i18n.T, N_ = BP.i18n.N;

  const STATES = {
    DE: N_('nur bundesweite Feiertage'), BW: N_('Baden-Württemberg'), BY: N_('Bayern'), BE: N_('Berlin'), BB: N_('Brandenburg'), HB: N_('Bremen'), HH: N_('Hamburg'), HE: N_('Hessen'),
    MV: N_('Mecklenburg-Vorpommern'), NI: N_('Niedersachsen'), NW: N_('Nordrhein-Westfalen'), RP: N_('Rheinland-Pfalz'), SL: N_('Saarland'), SN: N_('Sachsen'), ST: N_('Sachsen-Anhalt'),
    SH: N_('Schleswig-Holstein'), TH: N_('Thüringen'),
  };
  // Monatsmittel der Lufttemperatur in Deutschland, Richtwerte (DWD, Mittel 1991–2020, gerundet)
  const TEMPS = [0.9, 1.6, 4.6, 8.8, 12.9, 16.3, 18.3, 18.0, 14.1, 9.6, 5.0, 1.9];

  /* Ostersonntag (gregorianisch, Anonymer Algorithmus nach Meeus) */
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(y, month - 1, day));
  }
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

  /* Feiertage eines Jahres als Map ISO-Datum → Name */
  function holidays(y, st) {
    const E = easter(y), out = new Map();
    const fix = (m, d, n) => out.set(iso(new Date(Date.UTC(y, m - 1, d))), n), rel = (k, n) => out.set(iso(addDays(E, k)), n);
    const in_ = (...list) => list.includes(st);
    fix(1, 1, N_('Neujahr')); rel(-2, N_('Karfreitag')); rel(1, N_('Ostermontag')); fix(5, 1, N_('Tag der Arbeit')); rel(39, N_('Christi Himmelfahrt')); rel(50, N_('Pfingstmontag'));
    fix(10, 3, N_('Tag der Deutschen Einheit')); fix(12, 25, N_('1. Weihnachtstag')); fix(12, 26, N_('2. Weihnachtstag'));
    if (in_('BW', 'BY', 'ST')) fix(1, 6, N_('Heilige Drei Könige'));
    if ((in_('BE') && y >= 2019) || (in_('MV') && y >= 2023)) fix(3, 8, N_('Internationaler Frauentag'));
    if (in_('BW', 'BY', 'HE', 'NW', 'RP', 'SL')) rel(60, N_('Fronleichnam'));
    if (in_('SL')) fix(8, 15, N_('Mariä Himmelfahrt'));
    if (in_('TH') && y >= 2019) fix(9, 20, N_('Weltkindertag'));
    if (in_('BB', 'MV', 'SN', 'ST', 'TH') || (in_('HB', 'HH', 'NI', 'SH') && y >= 2018)) fix(10, 31, N_('Reformationstag'));
    if (in_('BW', 'BY', 'NW', 'RP', 'SL')) fix(11, 1, N_('Allerheiligen'));
    if (in_('SN')) { const d23 = new Date(Date.UTC(y, 10, 23)), back = ((d23.getUTCDay() - 3 + 7) % 7) || 7; out.set(iso(addDays(d23, -back)), N_('Buß- und Bettag')); }
    return out;
  }

  /* Kalender ab Baubeginn. o: { start: 'YYYY-MM-DD', country, region, state, winter: { on, from: 'MM-DD', to: 'MM-DD' }, temps, tempOffset }
   * Deutschland: Feiertage nach Bundesland (state bzw. region); andere Länder aus den Feiertagsdaten (2026–2040), außerhalb
   * davon nur Wochenenden (Hinweis über noHolidays). temps: Monatsmittel am Standort (sonst deutsche Richtwerte). */
  function make(o) {
    const country = o.country && o.country !== 'DE' ? o.country : 'DE';
    const st = country === 'DE' ? (STATES[o.region] ? o.region : STATES[o.state] ? o.state : 'DE') : 'DE';
    const temps = Array.isArray(o.temps) && o.temps.length === 12 && o.temps.every((x) => typeof x === 'number' && isFinite(x)) ? o.temps : TEMPS;
    const noHol = new Set();
    const holOf = (y) => {
      if (country === 'DE') return holidays(y, st);
      const m = BP.laender && BP.laender.holidays ? BP.laender.holidays(country, o.region, y) : null;
      if (!m) noHol.add(y);
      return m || new Map();
    };
    const s0 = /^\d{4}-\d{2}-\d{2}$/.test(o.start || '') ? new Date(o.start + 'T00:00:00Z') : new Date(Date.UTC(2027, 0, 4));
    const hol = new Map(), days = [], work = [];
    const w = o.winter || {}, wFrom = w.from || '12-20', wTo = w.to || '01-06';
    const inWinter = (md) => (w.on ? (wFrom <= wTo ? md >= wFrom && md <= wTo : md >= wFrom || md <= wTo) : false);
    const extend = (n) => {
      while (days.length < n) {
        const d = addDays(s0, days.length), y = d.getUTCFullYear();
        if (!hol.has(y)) hol.set(y, holOf(y));
        const key = iso(d), md = key.slice(5), dow = d.getUTCDay(), h = hol.get(y).get(key);
        const winter = inWinter(md), isWork = dow !== 0 && dow !== 6 && !h && !winter;
        const T = temps[d.getUTCMonth()] + (o.tempOffset || 0);
        days.push({ iso: key, dow, holiday: h || null, winter, work: isWork, T, wk: work.length });
        if (isWork) work.push(days.length - 1);
      }
    };
    extend(400);
    // Schutz gegen Kalender ohne Arbeitstage (z. B. Winterpause über das ganze Jahr): höchstens rund 30 Jahre vorausrechnen
    const LIMIT = 11000;
    const calOfWork = (k) => {
      while (work.length <= k && days.length < LIMIT) extend(days.length + 366);
      if (work.length <= k) throw new Error(T_('Baukalender: keine ausreichenden Arbeitstage (Winterpause prüfen)'));
      return work[k];
    };
    // erster Arbeitstag am oder nach Kalendertag c
    const workAtOrAfter = (c) => { extend(c + 1); while (!days[c].work) { if (c > LIMIT) throw new Error(T_('Baukalender: kein Arbeitstag gefunden (Winterpause prüfen)')); c++; extend(c + 1); } return days[c].wk; };
    // Kalendertag nach Ende einer Tätigkeit, die bis Arbeitstag k (ausschließlich) dauert
    const calAfter = (k) => calOfWork(k - 1) + 1;
    /* Kalendertage ab c, bis das wirksame Alter bei 20 °C (Nurse-Saul) erreicht ist */
    const cureDays = (c, eq20) => { let s = 0, n = 0; while (s < eq20 - 1e-9 && n < 400) { extend(c + n + 1); s += Math.max(0, days[c + n].T + 10) / 30; n++; } return n; };
    const dateOfWork = (k) => days[calOfWork(k)].iso;
    return { state: st, country, region: country === 'DE' ? st : o.region || '', noHolidays: () => [...noHol].sort(), start: iso(s0), days, calOfWork, workAtOrAfter, calAfter, cureDays, dateOfWork, tempAt: (c) => { extend(c + 1); return days[c].T; }, extend };
  }

  BP.kalender = { STATES, TEMPS, easter, holidays, make };
})(typeof window !== 'undefined' ? window : globalThis);
