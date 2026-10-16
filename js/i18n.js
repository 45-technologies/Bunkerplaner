/* Mehrsprachigkeit: Quelltexte sind deutsch und dienen als Schlüssel. T('Decke {d} cm', { d }) liefert in der aktiven
 * Sprache die Übersetzung aus den Wörterbüchern (js/i18n-en.js, js/i18n-es.js) mit eingesetzten Werten; fehlt eine
 * Übersetzung, bleibt der deutsche Text stehen und wird in BP.i18n.missing vermerkt. N('…') markiert Texte, die erst bei
 * der Anzeige übersetzt werden (Kataloge), und gibt sie unverändert zurück. Zahlen und Daten folgen der Sprache. */
(function (root) {
  const BP = root.BP = root.BP || {};
  const LANGS = {
    de: { name: 'Deutsch', locale: 'de-DE', dec: ',' },
    en: { name: 'English', locale: 'en-GB', dec: '.' },
    es: { name: 'Español', locale: 'es-ES', dec: ',' },
  };
  const dict = (BP.i18n && BP.i18n.dict) || { en: {}, es: {} };
  const missing = new Set();
  let lang = 'de';
  const has = Object.prototype.hasOwnProperty;

  function fill(s, v) {
    if (!v) return s;
    return s.replace(/\{(\w+)\}/g, (m, k) => (has.call(v, k) && v[k] != null ? String(v[k]) : m));
  }
  /* Gleiche deutsche Wörter mit verschiedener Bedeutung bekommen einen Kontext: T('Breite@@Geo') zeigt deutsch „Breite“
   * und hat eigene Übersetzungen (Breitengrad statt Breite eines Bauteils). */
  const base = (s) => { const i = s.indexOf('@@'); return i < 0 ? s : s.slice(0, i); };
  function T(s, v) {
    if (typeof s !== 'string') return s;
    if (lang !== 'de') {
      const d = dict[lang];
      if (d && has.call(d, s)) s = d[s];
      else { missing.add(s); s = base(s); }
    } else s = base(s);
    return fill(s, v);
  }
  const N = (s) => s;
  /* Übersetzen, falls ein Eintrag existiert, sonst unverändert und ohne Vermerk (freie Eingaben wie Einheiten im Einkauf) */
  function maybe(s, v) {
    if (typeof s !== 'string') return s;
    const d = dict[lang];
    return fill(lang !== 'de' && d && has.call(d, s) ? d[s] : base(s), v);
  }
  const loc = () => LANGS[lang].locale;
  /* Zahl mit d Nachkommastellen in der Schreibweise der Sprache (Tausendertrennung wie toLocaleString) */
  function num(v, d = 2, opt) {
    if (typeof v !== 'number' || !isFinite(v)) return (opt && opt.empty != null) ? opt.empty : '–';
    return v.toLocaleString(loc(), Object.assign({ minimumFractionDigits: d, maximumFractionDigits: d }, opt && opt.intl));
  }
  /* Dezimalzeichen eines bereits formatierten Werts (z. B. aus toFixed) anpassen */
  const dec = (str) => (LANGS[lang].dec === ',' ? String(str).replace('.', ',') : String(str));
  const decAll = (str) => (LANGS[lang].dec === ',' ? String(str).replace(/\./g, ',') : String(str));
  /* Datum aus ISO-Text 'YYYY-MM-DD' in der Schreibweise der Sprache */
  function date(iso, opt) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return iso || '';
    const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
    return d.toLocaleDateString(loc(), Object.assign({ timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }, opt));
  }
  /* gibt es eine Übersetzung (Deutsch: immer) */
  const known = (s) => lang === 'de' || (typeof s === 'string' && !!dict[lang] && has.call(dict[lang], s));
  function setLang(l) { if (LANGS[l]) lang = l; return lang; }
  /* fn in Sprache l ausführen und die vorige Sprache wiederherstellen (für Unterlagen in der Amtssprache) */
  function withLang(l, fn) { const old = lang; setLang(l); try { return fn(); } finally { lang = old; } }

  BP.i18n = { LANGS, dict, missing, T, N, maybe, known, fill, num, dec, decAll, date, setLang, withLang, lang: () => lang, locale: loc };
  BP.T = T;
})(typeof window !== 'undefined' ? window : globalThis);
