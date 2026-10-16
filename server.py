"""Bunkerplaner v2: lokaler Server mit Ortssuche (Nominatim) und BGR-Grundwasserreferenzen.

Start:  python server.py [PORT] [--no-browser]   ->  http://127.0.0.1:8874/
Nur Python-Standardbibliothek. Projektdaten bleiben im Browser bzw. in den gespeicherten JSON-Dateien.
Externe Abrufe nur auf Nutzeraktion: Ortssuche (Nominatim), Grundwasser-Referenzwerte (BGR), Händlerpreis (bausep),
Klimamittel am Standort (NASA POWER), Wechselkurse (EZB, ergänzend currency-api, CC0),
Erdbebenkennwerte USA nach ASCE/SEI 7-22 (USGS Seismic Design Web Services), amtliche Bauantragsformulare (nur die im
Register js/bauantrag-daten.js genannten Adressen; Abruf zum Ausfüllen und zur Prüfung auf Änderungen).
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, HTTPRedirectHandler, build_opener
from urllib.parse import urlparse, parse_qs, urlencode, unquote
from datetime import datetime, timezone
import csv
import hashlib
import io
import json
import math
import os
import posixpath
import re
import sys
import threading
import time
import webbrowser
import zipfile
from supplier_prices import fetch_product

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / '.runtime'
FALLBACKS = [RUNTIME / 'bgr-last.json']
PORT = 8874
# Nominatim verlangt eine eindeutige Kennung; nach Veröffentlichung gern mit Projekt-URL über BUNKERPLANER_UA setzen.
USER_AGENT = os.environ.get('BUNKERPLANER_UA', 'Bunkerplaner/2.0 (local planning tool; user-initiated lookups only)')
BGR_ZIP = 'https://gruvo.bgr.de/data/download/GRUVO-Daten-pred_short.zip'
BGR_MAP = 'https://services.bgr.de/arcgis/rest/services/grundwasser/gruvo_v109_short/MapServer/2/query'
lock = threading.Lock()
geo_lock = threading.Lock()
last_geocode = 0.0
memory = {}


class SameHostRedirect(HTTPRedirectHandler):
    """Weiterleitungen nur innerhalb desselben Hosts und nur über HTTPS folgen."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        old, new = urlparse(req.full_url), urlparse(newurl)
        if new.scheme != 'https' or new.netloc != old.netloc:
            raise ValueError('Unerwartete Weiterleitung des Datendienstes.')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


OPENER = build_opener(SameHostRedirect)


def remote(url, max_bytes=5_000_000):
    with OPENER.open(Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json, */*'}), timeout=20) as response:
        content = response.read(max_bytes + 1)
        if len(content) > max_bytes:
            raise ValueError('Die Quelldatei überschreitet das Größenlimit.')
        return content


def cache_get(key, seconds):
    item = memory.get(key)
    if item and time.time() - item[0] < seconds:
        return item[1]
    return None


def geocode(query, country=''):
    global last_geocode
    if not 2 <= len(query) <= 180:
        raise ValueError('Bitte PLZ, Ort oder Adresse mit 2 bis 180 Zeichen eingeben.')
    with geo_lock:
        key = 'geo:' + country + ':' + query
        cached = cache_get(key, 86400)
        if cached is not None:
            return cached
        time.sleep(max(0.0, 1.1 - (time.monotonic() - last_geocode)))  # Nominatim: max. 1 Anfrage/s
        last_geocode = time.monotonic()
        params = {'format': 'jsonv2', 'limit': 5, 'addressdetails': 1, 'q': query}
        if re.fullmatch(r'[A-Za-z]{2}', country or ''):
            params['countrycodes'] = country.lower()
        raw = json.loads(remote('https://nominatim.openstreetmap.org/search?' + urlencode(params)))
        results = [{'label': item['display_name'], 'lat': float(item['lat']), 'lon': float(item['lon']),
                    'type': item.get('addresstype', item.get('type', ''))} for item in raw]
        result = {'results': results, 'attribution': '© OpenStreetMap contributors'}
        memory[key] = (time.time(), result)
        return result


MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']


def climate(lat, lon):
    """Monatsmittel der Lufttemperatur in 2 m Höhe am Standort (NASA POWER, Klimatologie 2001–2020, 0,5°-Raster)."""
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError('Breite und Länge als Zahl angeben.')
    key = 'clim:%.1f:%.1f' % (lat, lon)
    cached = cache_get(key, 30 * 86400)
    if cached is not None:
        return cached
    params = {'parameters': 'T2M', 'community': 'RE', 'longitude': '%.4f' % lon, 'latitude': '%.4f' % lat, 'format': 'JSON'}
    raw = json.loads(remote('https://power.larc.nasa.gov/api/temporal/climatology/point?' + urlencode(params), 2_000_000))
    t2m = raw.get('properties', {}).get('parameter', {}).get('T2M', {})
    temps = [t2m.get(m) for m in MONTHS]
    if not all(isinstance(t, (int, float)) and -60 < t < 60 for t in temps):
        raise ValueError('Klimadaten unvollständig; Werte von Hand eintragen.')
    result = {'temps': [round(t, 1) for t in temps], 'source': 'NASA POWER (CC BY 4.0), T2M-Klimatologie',
              'period': '2001–2020', 'fetched': datetime.now(timezone.utc).strftime('%Y-%m-%d'), 'lat': lat, 'lon': lon}
    memory[key] = (time.time(), result)
    return result


def exchange_rates():
    """Wechselkurse je Euro: EZB-Referenzkurse, für weitere Währungen ergänzend currency-api (CC0)."""
    cached = cache_get('fx', 6 * 3600)
    if cached is not None:
        return cached
    rates, date, sources = {}, '', []
    try:
        xml = remote('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json', 1_000_000)
        alt = json.loads(xml)
        for code, value in (alt.get('eur') or {}).items():
            if re.fullmatch(r'[a-z]{3}', code) and isinstance(value, (int, float)) and value > 0:
                rates[code.upper()] = float(value)
        date = str(alt.get('date', ''))[:10]
        sources.append('currency-api (CC0)')
    except Exception:
        pass
    try:
        xml = remote('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', 200_000).decode('utf-8', 'replace')
        ecb = dict(re.findall(r"currency=['\"]([A-Z]{3})['\"]\s+rate=['\"]([0-9.]+)['\"]", xml))
        stamp = re.search(r"time=['\"](\d{4}-\d{2}-\d{2})['\"]", xml)
        for code, value in ecb.items():
            rates[code] = float(value)
        if ecb:
            date = stamp.group(1) if stamp else date
            sources.insert(0, 'EZB-Referenzkurse')
    except Exception:
        pass
    if not rates:
        raise ValueError('Wechselkurse nicht abrufbar; Kurs von Hand eintragen.')
    rates['EUR'] = 1.0
    result = {'rates': rates, 'date': date, 'src': ', '.join(sources)}
    memory['fx'] = (time.time(), result)
    return result


USGS_DM = 'https://earthquake.usgs.gov/ws/designmaps/asce7-22.json'
SITE_CLASSES = ('Default', 'A', 'B', 'BC', 'C', 'CD', 'D', 'DE', 'E')


def seismic_us(lat, lon, risk, site_class):
    """Bemessungswerte SDS, SD1 (und SMS, SM1, PGAM, TL, SDC) am Standort nach ASCE/SEI 7-22 von den USGS Seismic Design Web Services."""
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError('Breite und Länge als Zahl angeben.')
    if risk not in ('I', 'II', 'III', 'IV'):
        raise ValueError('Risikokategorie I bis IV angeben.')
    if site_class not in SITE_CLASSES:
        raise ValueError('Site Class ungültig.')
    key = 'usgs:%.4f:%.4f:%s:%s' % (lat, lon, risk, site_class)
    cached = cache_get(key, 30 * 86400)
    if cached is not None:
        return cached
    params = {'latitude': '%.4f' % lat, 'longitude': '%.4f' % lon, 'riskCategory': risk, 'siteClass': site_class, 'title': 'Bunkerplaner'}
    raw = json.loads(remote(USGS_DM + '?' + urlencode(params), 3_000_000))
    data = (raw.get('response') or {}).get('data') or {}

    def val(k, hi):
        v = data.get(k)
        return round(float(v), 4) if isinstance(v, (int, float)) and not isinstance(v, bool) and 0 <= v <= hi else None
    sds, sd1 = val('sds', 4), val('sd1', 3)
    if sds is None:
        raise ValueError('USGS liefert für diesen Ort keine Werte (nur USA und Außengebiete).')
    sdc = data.get('sdc')
    result = {'sds': sds, 'sd1': sd1, 'pgam': val('pgam', 4), 'sms': val('sms', 6), 'sm1': val('sm1', 4), 'tl': val('tl', 30),
              'sdc': sdc if isinstance(sdc, str) and re.fullmatch('[A-F]', sdc) else None, 'siteClass': site_class, 'riskCategory': risk,
              'source': 'USGS Seismic Design Web Services, ASCE/SEI 7-22', 'fetched': datetime.now(timezone.utc).strftime('%Y-%m-%d'), 'lat': lat, 'lon': lon}
    memory[key] = (time.time(), result)
    return result


FORM_MAX = 15_000_000


def form_urls():
    """Erlaubte Formularadressen: alle forms[].url und forms[].landing aus dem Bauantrag-Register (genau diese Adressen)."""
    cached = cache_get('form_urls', 3600)
    if cached is not None:
        return cached
    text = (ROOT / 'js' / 'bauantrag-daten.js').read_text(encoding='utf-8')
    start = text.index('BP.bauantragDaten = ') + len('BP.bauantragDaten = ')
    data = json.loads(text[start:text.rindex(';\n})')])
    urls = set()
    for entry in data['j'].values():
        for form in entry.get('forms') or []:
            for key in ('url', 'landing'):
                u = form.get(key)
                if isinstance(u, str) and u.startswith('https://'):
                    urls.add(u)
    memory['form_urls'] = (time.time(), urls)
    return urls


def remote_meta(url, max_bytes):
    with OPENER.open(Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/pdf, */*'}), timeout=30) as response:
        content = response.read(max_bytes + 1)
        if len(content) > max_bytes:
            raise ValueError('Die Quelldatei überschreitet das Größenlimit.')
        return content, {k.lower(): v for k, v in response.headers.items()}


def form_get(url):
    """Amtliches Formular (PDF) für das Ausfüllen im Browser holen – nur Adressen aus dem Register."""
    if url not in form_urls():
        raise ValueError('Diese Adresse steht nicht im Formularregister.')
    content, _ = remote_meta(url, FORM_MAX)
    if not content.startswith(b'%PDF'):
        raise ValueError('Unter dieser Adresse liegt kein PDF, sondern eine Webseite – Formular dort öffnen.')
    return content


def form_check(url):
    """Erreichbarkeit und Fingerabdruck eines amtlichen Formulars (SHA-256, Größe, Last-Modified), damit Änderungen auffallen."""
    if url not in form_urls():
        raise ValueError('Diese Adresse steht nicht im Formularregister.')
    content, headers = remote_meta(url, FORM_MAX)
    return {'url': url, 'pdf': content.startswith(b'%PDF'), 'size': len(content), 'sha256': hashlib.sha256(content).hexdigest(),
            'lastModified': headers.get('last-modified', ''), 'type': headers.get('content-type', '')[:80],
            'checked': datetime.now(timezone.utc).strftime('%Y-%m-%d')}


def csv_rows(text):
    lines = text.splitlines()
    index = next((i for i, line in enumerate(lines) if line.startswith('GRUVO-ID;')), None)
    if index is None:
        raise ValueError('BGR-Dateiformat hat sich geändert; keine Werte übernommen.')
    return list(csv.DictReader(lines[index:], delimiter=';'))


def number(text):
    try:
        value = float(text.replace(',', '.'))
        return value if math.isfinite(value) else None
    except (ValueError, AttributeError):
        return None


def load_bgr():
    with lock:
        cached = cache_get('bgr', 3600)
        if cached:
            return cached
        archive = zipfile.ZipFile(io.BytesIO(remote(BGR_ZIP)))
        if sum(info.file_size for info in archive.infolist()) > 10_000_000:
            raise ValueError('BGR-Archiv ist unerwartet groß.')
        data_text = archive.read('GRUVO-Daten-pred_short.csv').decode('utf-8-sig')
        meta_text = archive.read('GRUVO-Daten-pred_short-Metadaten.csv').decode('utf-8-sig')
        if 'm ü. NHN' not in meta_text:
            raise ValueError('Höhenbezug in BGR-Metadaten nicht bestätigt.')
        data, meta = csv_rows(data_text), csv_rows(meta_text)
        params = {'where': '1=1', 'outFields': '*', 'outSR': 4326, 'f': 'json', 'resultRecordCount': 1000}
        geometry_data = json.loads(remote(BGR_MAP + '?' + urlencode(params)))
        if geometry_data.get('error') or geometry_data.get('exceededTransferLimit'):
            raise ValueError('BGR-Messstellengeometrie nicht vollständig abrufbar.')
        locations = {}
        for feature in geometry_data.get('features', []):
            attrs = {key.split('.')[-1]: value for key, value in feature['attributes'].items()}
            geometry = feature.get('geometry') or {}
            if attrs.get('well_id') and all(isinstance(geometry.get(k), (float, int)) for k in ['x', 'y']):
                locations[attrs['well_id']] = {'lat': geometry['y'], 'lon': geometry['x']}
        series = {}
        for row in data:
            date = datetime.strptime(row['Datum'], '%d.%m.%Y').date().isoformat()
            values = [number(row.get(k)) for k in ['Mittelwert', 'unteres Extrem', 'oberes Extrem']]
            if any(v is None for v in values):
                continue
            series.setdefault(row['GRUVO-ID'], []).append({'date': date, 'value': values[0], 'low': values[1], 'high': values[2]})
        stations = []
        for row in meta:
            key = row['GRUVO-ID']
            if key not in locations or key not in series:
                continue
            stations.append({'id': key, 'name': row['Messstellenname'], **locations[key],
                             'groundNHN': number(row['Geländeoberkante [m ü. NHN]']), 'cluster': row['Zugehörige Cluster-ID'],
                             'series': sorted(series[key], key=lambda point: point['date'])})
        if not stations:
            raise ValueError('Keine verknüpfbaren BGR-Referenzmessstellen gefunden.')
        issued = next((line.partition(': ')[2] for line in data_text.splitlines() if line.startswith('Erstellt am:')), '')
        found = re.search(r'\b(?:19|20)\d{2}\b', issued)
        year = found.group(0) if found else str(datetime.now().year)
        result = {'stations': stations, 'issued': issued, 'fetched': datetime.now(timezone.utc).isoformat(),
                  'source': f'Bundesanstalt für Geowissenschaften und Rohstoffe (BGR) {year}: GRUVO – Kurzfristvorhersage', 'sourceUrl': BGR_ZIP,
                  'license': 'Datenlizenz Deutschland – Namensnennung – Version 2.0', 'licenseUrl': 'https://www.govdata.de/dl-de/by-2-0',
                  'kind': 'forecast', 'datum': 'm ü. NHN'}
        memory['bgr'] = (time.time(), result)
        try:  # letzter Stand als Rückfall, falls der Dienst später nicht erreichbar ist
            RUNTIME.mkdir(exist_ok=True)
            (RUNTIME / 'bgr-last.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
        except OSError:
            pass
        return result


def distance(lat, lon, station):
    a, b = math.radians(lat), math.radians(station['lat'])
    h = math.sin((b - a) / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(math.radians(station['lon'] - lon) / 2) ** 2
    return 6371 * 2 * math.asin(min(1, math.sqrt(h)))


def groundwater(lat, lon):
    if not (47 <= lat <= 56 and 5 <= lon <= 16):
        raise ValueError('Die BGR-Abfrage ist nur für Deutschland möglich.')
    stale = False
    try:
        catalog = load_bgr()
    except Exception:
        saved = next((f for f in FALLBACKS if f.exists()), None)
        if saved is None:
            raise
        catalog = json.loads(saved.read_text(encoding='utf-8'))
        stale = True
    nearest = sorted(catalog['stations'], key=lambda station: distance(lat, lon, station))[:5]
    today = datetime.now(timezone.utc).date().isoformat()
    results = []
    for station in nearest:
        before = [p for p in station['series'] if p['date'] <= today]
        point = before[-1] if before else station['series'][0]
        results.append({k: v for k, v in station.items() if k != 'series'} | point | {
            'distanceKm': round(distance(lat, lon, station), 3),
            'link': 'https://gruvo.bgr.de/info/index.php?' + urlencode({'cluster_id': station['cluster'], 'thema': 'pred_short', 'tab': 'rm', 'lang': 'de'})})
    return {key: value for key, value in catalog.items() if key != 'stations'} | {
        'results': results, 'query': {'lat': lat, 'lon': lon}, 'stale': stale,
        'notice': 'Modellwerte an Referenzmessstellen; kein gemessener Wasserstand am Grundstück.'}


STATIC_DIRS = {'css', 'js', 'vendor'}
STATIC_EXT = {'.html', '.css', '.js', '.svg', '.png', '.woff2'}
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; "
       "img-src 'self' data: blob: https://tile.openstreetmap.org https://server.arcgisonline.com; "
       "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


def static_allowed(raw):
    path = unquote(urlparse(raw).path)
    if path in ('/', '/index.html'):
        return True
    parts = path.split('/')[1:]
    return (len(parts) >= 2 and parts[0] in STATIC_DIRS and '\\' not in path and '\x00' not in path
            and all(part and not part.startswith('.') for part in parts)
            and posixpath.splitext(parts[-1])[1] in STATIC_EXT)


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
                      '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
                      '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):
        pass  # keine Adressen oder Ortssuchen protokollieren

    def list_directory(self, path):
        self.send_error(403)

    def end_headers(self):
        if not getattr(self, 'path', '').startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')  # OSM-Kacheln verlangen Referer
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        super().end_headers()

    def send_head(self):  # gilt fuer GET und HEAD
        if not static_allowed(self.path):
            self.send_error(404)
            return None
        return super().send_head()

    def host_ok(self):  # Schutz gegen DNS-Rebinding
        port = self.server.server_port
        if self.headers.get('Host', '') in (f'127.0.0.1:{port}', f'localhost:{port}'):
            return True
        self.send_error(421)
        return False

    def do_GET(self):
        if not self.host_ok():
            return
        parsed = urlparse(self.path)
        if parsed.path.startswith('/api/'):
            if self.headers.get('Sec-Fetch-Site', 'same-origin') not in ('same-origin', 'none'):
                self.send_error(403)  # keine Abrufe durch fremde Webseiten
                return
            try:
                query = parse_qs(parsed.query)
                if parsed.path == '/api/geocode':
                    data = geocode(query.get('q', [''])[0].strip(), query.get('cc', [''])[0].strip())
                elif parsed.path == '/api/climate':
                    lat, lon = (number(query.get(k, [''])[0]) for k in ('lat', 'lon'))
                    if lat is None or lon is None:
                        raise ValueError('Breite und Länge als Zahl angeben.')
                    data = climate(lat, lon)
                elif parsed.path == '/api/fx':
                    data = exchange_rates()
                elif parsed.path == '/api/groundwater':
                    lat, lon = (number(query.get(k, [''])[0]) for k in ('lat', 'lon'))
                    if lat is None or lon is None:
                        raise ValueError('Breite und Länge als Zahl angeben.')
                    data = groundwater(lat, lon)
                elif parsed.path == '/api/seismic-us':
                    lat, lon = (number(query.get(k, [''])[0]) for k in ('lat', 'lon'))
                    if lat is None or lon is None:
                        raise ValueError('Breite und Länge als Zahl angeben.')
                    data = seismic_us(lat, lon, query.get('rc', ['II'])[0], query.get('sc', ['Default'])[0])
                elif parsed.path == '/api/form-check':
                    data = form_check(query.get('url', [''])[0])
                elif parsed.path == '/api/form':
                    raw = form_get(query.get('url', [''])[0])
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/pdf')
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('Content-Length', str(len(raw)))
                    self.end_headers()
                    self.wfile.write(raw)
                    return
                elif parsed.path == '/api/health':
                    data = {'service': 'bunkerplaner', 'version': 2}
                elif parsed.path == '/api/product-price':
                    data = fetch_product(query.get('url', [''])[0])
                else:
                    self.send_error(404)
                    return
                status = 200
            except ValueError as error:
                data, status = {'error': str(error)}, 400
            except Exception:
                data, status = {'error': 'Öffentlicher Datendienst gerade nicht erreichbar. Werte lassen sich von Hand eintragen.'}, 502
            raw = json.dumps(data, ensure_ascii=False, allow_nan=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        else:
            super().do_GET()

    def do_HEAD(self):
        if self.host_ok():
            super().do_HEAD()


if __name__ == '__main__':
    if sys.version_info < (3, 9):
        sys.exit('Bunkerplaner braucht Python 3.9 oder neuer.')
    port = next((int(a) for a in sys.argv[1:] if a.isdigit()), PORT)
    url = f'http://127.0.0.1:{port}/'
    try:
        server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    except OSError:
        sys.exit(f'Port {port} ist belegt. Läuft der Bunkerplaner schon ({url})? Sonst anderen Port angeben: python server.py {port + 1}')
    print(f'Bunkerplaner läuft auf {url}  (Beenden mit Strg+C)')
    if '--no-browser' not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
