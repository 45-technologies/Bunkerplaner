import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from supplier_prices import parse_product, product_url

URL = 'https://www.bausep.de/produkt.html'


def page(price='85.30', url=URL, currency='EUR'):
    product = {'@type': 'Product', 'name': 'Testprodukt', 'sku': '123', 'url': url,
               'offers': {'@type': 'Offer', 'price': price, 'priceCurrency': currency, 'url': url}}
    return '<script type="application/ld+json">' + json.dumps(product) + '</script>*inkl. 19 % MwSt'


class PriceTests(unittest.TestCase):
    def test_identity_and_price(self):
        p = parse_product(page(), URL)
        self.assertEqual(p['gross'], 85.3)
        self.assertEqual(p['sku'], '123')
        self.assertNotIn('shipping', p)

    def test_no_internal_or_redirect_urls(self):
        for u in ['http://www.bausep.de/produkt.html', 'https://localhost/produkt.html',
                  'https://www.bausep.de@127.0.0.1/produkt.html', 'https://www.bausep.de:443/produkt.html',
                  URL+'?variant=1', 'https://www.bausep.de/../produkt.html']:
            with self.assertRaises(ValueError):
                product_url(u)

    def test_ambiguity_currency_identity_tax(self):
        for html in [page()+page('90.00'), page(url='https://www.bausep.de/anderes.html'),
                     page(currency='USD'), page().replace('*inkl. 19 % MwSt', ''),
                     page('NaN'), page('-1'), page('10.123')]:
            with self.assertRaises(ValueError):
                parse_product(html, URL)


if __name__ == '__main__':
    unittest.main()
