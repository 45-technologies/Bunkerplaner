"""Expliziter Abruf von bausep-Produktpreisen, ohne Weitergabe der Projektadresse.

Keine Suche nach beliebigen Zahlen: nur eindeutige Product/Offer-Daten mit SKU,
EUR und passender Produkt-URL. Fracht, Staffelpreis und regionale Zusagen werden
nicht aus einem öffentlichen Listenpreis abgeleitet.
"""
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler
import json
import re
import time

HOST = 'www.bausep.de'
CACHE = {}


def product_url(value):
    if not isinstance(value, str) or len(value) > 500:
        raise ValueError('Bitte eine bausep-Produktseite angeben.')
    p = urlparse(value)
    if (p.scheme != 'https' or p.netloc != HOST or p.query or p.fragment
            or not re.fullmatch(r'/[a-z0-9-]+\.html', p.path)):
        raise ValueError('Live-Abruf unterstützt bausep-Produktseiten ohne Variantenparameter. Andere Angebote manuell eintragen.')
    return 'https://' + HOST + p.path


class SameHostRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, code, msg, headers, product_url(newurl))


class StructuredData(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.active = False
        self.parts = []
        self.blocks = []

    def handle_starttag(self, tag, attrs):
        if tag == 'script' and dict(attrs).get('type', '').lower() == 'application/ld+json':
            self.active, self.parts = True, []

    def handle_data(self, data):
        if self.active:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.active:
            self.blocks.append(''.join(self.parts))
            self.active = False


def products(node):
    if isinstance(node, list):
        for item in node:
            yield from products(item)
    elif isinstance(node, dict):
        kinds = node.get('@type', [])
        if kinds == 'Product' or isinstance(kinds, list) and 'Product' in kinds:
            yield node
        yield from products(node.get('@graph', []))


def parse_product(html, url):
    url = product_url(url)
    if not re.search(r'inkl\.\s*19\s*%\s*MwSt', html, re.I):
        raise ValueError('Bruttopreis / Steuersatz nicht eindeutig belegt. Preis manuell prüfen.')
    parser = StructuredData()
    parser.feed(html)
    found = []
    for block in parser.blocks:
        try:
            doc = json.loads(block)
        except ValueError:
            continue
        for item in products(doc):
            if item.get('url') != url or not item.get('sku') or not item.get('name'):
                continue
            offers = item.get('offers', [])
            if isinstance(offers, dict):
                offers = [offers]
            for offer in offers:
                if not isinstance(offer, dict) or offer.get('@type') != 'Offer' or offer.get('priceCurrency') != 'EUR' or offer.get('url', url) != url:
                    continue
                try:
                    price = Decimal(str(offer['price']))
                    if not price.is_finite() or price < 0 or price > 1_000_000_000 or price != price.quantize(Decimal('0.01')):
                        continue
                except (KeyError, InvalidOperation):
                    continue
                found.append({'product': str(item['name']), 'sku': str(item['sku']),
                              'ean': str(item.get('gtin13', '')), 'gross': float(price),
                              'currency': 'EUR', 'vat': 19, 'url': url, 'supplier': 'bausep',
                              'availability': str(offer.get('availability', '')),
                              'leadTime': offer.get('deliveryLeadTime'),
                              'validUntil': offer.get('priceValidUntil', ''),
                              'scope': 'Öffentlicher Warenpreis inkl. MwSt.; Fracht, Mengenstaffel und Lieferung an Projektadresse nicht bestätigt.'})
    unique = {json.dumps(i, sort_keys=True) for i in found}
    if len(unique) != 1:
        raise ValueError('Kein eindeutiger Produktpreis gefunden. Angebot manuell prüfen; gespeicherter Preis bleibt unverändert.')
    result = found[0]
    result['fetchedAt'] = datetime.now(timezone.utc).isoformat()
    return result


def fetch_product(value):
    url = product_url(value)
    cached = CACHE.get(url)
    if cached and time.monotonic() - cached[0] < 300:
        return cached[1]
    req = Request(url, headers={'User-Agent': 'Bunkerplaner/2.1 (user initiated product lookup)', 'Accept': 'text/html'})
    with build_opener(SameHostRedirect()).open(req, timeout=15) as response:
        product_url(response.geturl())
        data = response.read(4_000_001)
        if len(data) > 4_000_000:
            raise ValueError('Produktseite überschreitet das Größenlimit.')
        result = parse_product(data.decode('utf-8'), url)
    CACHE[url] = (time.monotonic(), result)
    return result
